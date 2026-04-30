#!/usr/bin/env python3
"""Generic repair supervisor for the local multi-agent queue.

This watcher is intentionally conservative. It does not edit product code or
merge branches. It only watches newly blocked QA/Review tasks and creates the
next repair + retest + rereview tasks when the blocker does not require an
owner decision.
"""

from __future__ import annotations

import argparse
import json
import re
import time
from pathlib import Path
from typing import Any

import agent_queue


STATE_NAME = "repair_supervisor_state.json"
TECHNICAL_EXIT_PREFIX = "自动派工 worker 已退出但任务没有 done/block"
REPAIRABLE_ROLES = {"content", "media"}
BLOCKER_ROLES = {"qa", "review"}
MAX_TECHNICAL_RETRIES = 3


def state_path() -> Path:
    return agent_queue.queue_dir() / STATE_NAME


def load_state() -> dict[str, Any]:
    path = state_path()
    if not path.exists():
        return {"initialized": False, "handled_blockers": [], "events": []}
    try:
        return json.loads(path.read_text(encoding="utf-8") or "{}")
    except json.JSONDecodeError:
        return {"initialized": False, "handled_blockers": [], "events": ["state file was broken; reset"]}


def save_state(state: dict[str, Any]) -> None:
    path = state_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(state, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    tmp.replace(path)


def remember_event(state: dict[str, Any], text: str) -> None:
    events = state.setdefault("events", [])
    events.append({"time": agent_queue.now(), "text": text})
    del events[:-100]
    print(f"[{agent_queue.now()}] {text}", flush=True)


def handled_set(state: dict[str, Any]) -> set[str]:
    return set(str(item) for item in state.get("handled_blockers", []))


def mark_handled(state: dict[str, Any], task_ids: list[str]) -> None:
    existing = handled_set(state)
    existing.update(task_ids)
    state["handled_blockers"] = sorted(existing)


def get_task(tasks: list[dict[str, Any]], task_id: str) -> dict[str, Any] | None:
    return agent_queue.find_task(tasks, task_id)


def add_task(
    tasks: list[dict[str, Any]],
    *,
    task_id: str,
    role: str,
    title: str,
    instructions: str,
    acceptance: str,
    priority: int,
    depends_on: list[str] | None = None,
) -> bool:
    if get_task(tasks, task_id):
        return False
    task = {
        "id": task_id,
        "role": role,
        "title": title,
        "instructions": instructions,
        "acceptance": acceptance,
        "priority": priority,
        "status": "queued",
        "depends_on": depends_on or [],
        "created_at": agent_queue.now(),
        "updated_at": agent_queue.now(),
        "claimed_by": "",
        "claimed_at": "",
        "report": "",
        "commit": "",
        "summary": "",
        "owner_decision": "",
        "takeover_reason": "",
        "takeover_at": "",
    }
    tasks.append(task)
    agent_queue.append_event({"event": "added", "task_id": task_id, "role": role, "title": title})
    return True


def next_numeric_id(tasks: list[dict[str, Any]], reserved: set[str]) -> str:
    max_seen = 0
    for task in tasks:
        match = re.fullmatch(r"T-(\d+)", str(task.get("id") or ""))
        if match:
            max_seen = max(max_seen, int(match.group(1)))
    next_no = max_seen + 1
    while True:
        candidate = f"T-{next_no:03d}"
        if not get_task(tasks, candidate) and candidate not in reserved:
            reserved.add(candidate)
            return candidate
        next_no += 1


def brief_task(task: dict[str, Any] | None) -> str:
    if not task:
        return "任务不存在"
    parts = [
        f"{task.get('id')} [{task.get('status')}]",
        str(task.get("title") or ""),
    ]
    if task.get("claimed_by"):
        parts.append(f"领取: {task.get('claimed_by')}")
    if task.get("summary"):
        parts.append(f"原因: {task.get('summary')}")
    if task.get("report"):
        parts.append(f"报告: {task.get('report')}")
    if task.get("commit"):
        parts.append(f"commit: {task.get('commit')}")
    return " · ".join(part for part in parts if part)


def find_repair_root(tasks: list[dict[str, Any]], blocker: dict[str, Any]) -> dict[str, Any] | None:
    for dep_id in blocker.get("depends_on", []):
        dep = get_task(tasks, str(dep_id))
        if dep and dep.get("status") == "done" and dep.get("role") in REPAIRABLE_ROLES:
            return dep
    return None


def reset_technical_exit_if_needed(
    tasks: list[dict[str, Any]], blocker: dict[str, Any], state: dict[str, Any]
) -> bool:
    summary = str(blocker.get("summary") or "")
    if blocker.get("owner_decision") or not summary.startswith(TECHNICAL_EXIT_PREFIX):
        return False

    task_id = str(blocker.get("id"))
    retry_key = f"technical_retries.{task_id}"
    retries = int(state.get(retry_key) or 0)
    if retries >= MAX_TECHNICAL_RETRIES:
        remember_event(state, f"{task_id} 技术退出已自动重试 {retries} 次, 保持阻塞等总控处理。")
        mark_handled(state, [task_id])
        return False

    blocker["status"] = "queued"
    blocker["claimed_by"] = ""
    blocker["claimed_at"] = ""
    blocker["updated_at"] = agent_queue.now()
    blocker["owner_decision"] = ""
    state[retry_key] = retries + 1
    agent_queue.append_event(
        {
            "event": "reset",
            "task_id": task_id,
            "reason": "repair_supervisor_technical_retry",
            "retry": retries + 1,
        }
    )
    remember_event(state, f"{task_id} 是 worker 技术退出, 已自动重置第 {retries + 1} 次。")
    return True


def group_new_blockers(
    tasks: list[dict[str, Any]],
    state: dict[str, Any],
    *,
    process_existing: bool,
) -> tuple[dict[str, list[dict[str, Any]]], list[str]]:
    handled = handled_set(state)
    groups: dict[str, list[dict[str, Any]]] = {}
    skipped: list[str] = []

    for task in tasks:
        task_id = str(task.get("id") or "")
        if task.get("status") != "blocked" or task_id in handled:
            continue
        if not process_existing and not state.get("initialized"):
            skipped.append(task_id)
            continue
        if task.get("role") not in BLOCKER_ROLES:
            skipped.append(task_id)
            continue
        if task.get("owner_decision"):
            skipped.append(task_id)
            continue
        if reset_technical_exit_if_needed(tasks, task, state):
            skipped.append(task_id)
            continue
        root = find_repair_root(tasks, task)
        if not root:
            skipped.append(task_id)
            continue
        groups.setdefault(str(root.get("id")), []).append(task)

    return groups, skipped


def create_repair_chain(
    tasks: list[dict[str, Any]],
    root: dict[str, Any],
    blockers: list[dict[str, Any]],
    state: dict[str, Any],
    reserved: set[str],
) -> None:
    root_id = str(root.get("id"))
    root_role = str(root.get("role"))
    repair_id = next_numeric_id(tasks, reserved)
    qa_id = next_numeric_id(tasks, reserved)
    review_id = next_numeric_id(tasks, reserved)
    priority = max(1, min([int(root.get("priority") or 50), *[int(b.get("priority") or 50) for b in blockers]]))
    reasons = "\n".join(f"- {brief_task(task)}" for task in blockers)
    root_line = brief_task(root)

    added_repair = add_task(
        tasks,
        task_id=repair_id,
        role=root_role,
        title=f"返修 {root_id}: 处理 QA/审查阻塞",
        instructions=(
            f"这是自动返修任务。上一轮实现: {root_line}\n\n"
            f"阻塞证据:\n{reasons}\n\n"
            "请先读取相关 handoff 报告、被测提交和当前 main, 基于最新 main 返修, "
            "不要用旧 worktree 结果覆盖主线已有修复。逐条回应阻塞原因, 保持改动范围收敛。"
            "如果涉及用户可见页面/文案/状态, 必须自己做基础自验并为 QA 留清晰复现路径。"
            "副 Agent 不改 docs/PROGRESS.md。完成后写 docs/agent-handoff/ 对应报告并 commit。"
        ),
        acceptance=(
            "逐条回应阻塞项; targeted pytest 通过; 必要 curl/浏览器自验有证据; "
            "无内部路径、prompt、tokens、API key、provider、submit_id 等用户可见泄露; "
            "报告列验证命令、截图/接口证据和剩余风险。"
        ),
        priority=priority,
    )
    if not added_repair:
        return

    add_task(
        tasks,
        task_id=qa_id,
        role="qa",
        title=f"{repair_id} 返修后真实 QA",
        instructions=(
            f"复测 {repair_id}。不要测旧实现, 不改功能代码。重点复现上一轮阻塞项:\n"
            f"{reasons}\n\n"
            "如果涉及页面变化, 必须做真实浏览器闭环: 截图、console/pageerror/requestfailed/http>=400 "
            "统计、真点真填; 涉及布局时覆盖桌面和 390px 窄屏。默认不扩大 credits, "
            "只做最小必要真链路。副 Agent 不改 docs/PROGRESS.md。"
        ),
        acceptance=(
            "明确通过/不通过; 截图已读; console/pageerror/requestfailed/http>=400 统计齐; "
            "targeted pytest/curl/e2e 结果齐; 不通过时 block 并给可复现步骤。"
        ),
        priority=priority + 1,
        depends_on=[repair_id],
    )
    add_task(
        tasks,
        task_id=review_id,
        role="review",
        title=f"{repair_id} 返修后代码复审",
        instructions=(
            f"只读复审 {repair_id}。重点复核上一轮阻塞项是否真正关闭:\n{reasons}\n\n"
            "检查是否基于最新 main、是否保留既有防线、是否有回归测试、是否有新泄露/新异步卡死风险。"
            "副 Agent 不改 docs/PROGRESS.md。"
        ),
        acceptance=(
            "报告 P0/P1/P2 和证据; 无 P0/P1 才算通过; 只读不改功能代码; "
            "报告写 docs/agent-handoff/ 并 commit。"
        ),
        priority=priority + 1,
        depends_on=[repair_id],
    )
    mark_handled(state, [str(task.get("id")) for task in blockers])
    remember_event(state, f"已为 {root_id} 创建 {repair_id}/{qa_id}/{review_id} 返修链。")
    agent_queue.notify("内容工厂自动返修", f"{root_id} -> {repair_id} / {qa_id} / {review_id}")


def tick(*, process_existing: bool = False) -> dict[str, Any]:
    state = load_state()
    with agent_queue.locked_queue() as tasks:
        groups, skipped = group_new_blockers(tasks, state, process_existing=process_existing)
        if not state.get("initialized") and not process_existing:
            mark_handled(state, skipped)
            state["initialized"] = True
            state["initialized_at"] = agent_queue.now()
            remember_event(state, f"初始化完成, 已忽略历史阻塞 {len(skipped)} 条。")
        else:
            if skipped:
                mark_handled(state, skipped)
            reserved: set[str] = set()
            for root_id, blockers in sorted(groups.items()):
                root = get_task(tasks, root_id)
                if root:
                    create_repair_chain(tasks, root, blockers, state, reserved)
            state["initialized"] = True
    save_state(state)
    return state


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--watch", action="store_true")
    parser.add_argument("--interval", type=int, default=60)
    parser.add_argument(
        "--process-existing",
        action="store_true",
        help="Also process blockers that existed before this supervisor started.",
    )
    parser.add_argument("--status", action="store_true")
    args = parser.parse_args()

    if args.status:
        print(json.dumps(load_state(), ensure_ascii=False, indent=2))
        return 0

    while True:
        tick(process_existing=args.process_existing)
        if not args.watch:
            return 0
        time.sleep(max(10, args.interval))


if __name__ == "__main__":
    raise SystemExit(main())
