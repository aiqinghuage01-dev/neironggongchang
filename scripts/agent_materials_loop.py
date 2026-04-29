#!/usr/bin/env python3
"""Autopilot loop for the D-124 materials-library campaign.

This is intentionally small and conservative. It does not edit product code.
It only watches the shared queue and creates the next rework/review/QA tasks
when the current materials-library round reaches a terminal state.
"""

from __future__ import annotations

import argparse
import json
import time
from pathlib import Path
from typing import Any

import agent_queue


STATE_PATH = agent_queue.queue_dir() / "materials_loop_state.json"

ROUNDS = [
    {"round": 1, "impl": "T-026", "review": "T-027", "qa": "T-028"},
    {"round": 2, "impl": "T-032", "review": "T-033", "qa": "T-034"},
    {"round": 3, "impl": "T-035", "review": "T-036", "qa": "T-037"},
    {"round": 4, "impl": "T-038", "review": "T-039", "qa": "T-040"},
]


def load_state() -> dict[str, Any]:
    if not STATE_PATH.exists():
        return {"active_round": 1, "events": []}
    try:
        return json.loads(STATE_PATH.read_text(encoding="utf-8") or "{}")
    except json.JSONDecodeError:
        return {"active_round": 1, "events": ["state file was broken; reset"]}


def save_state(state: dict[str, Any]) -> None:
    STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    tmp = STATE_PATH.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(state, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    tmp.replace(STATE_PATH)


def event(state: dict[str, Any], text: str) -> None:
    items = state.setdefault("events", [])
    items.append({"time": agent_queue.now(), "text": text})
    del items[:-50]
    print(f"[{agent_queue.now()}] {text}", flush=True)


def get_task(tasks: list[dict[str, Any]], task_id: str) -> dict[str, Any] | None:
    return agent_queue.find_task(tasks, task_id)


def status(tasks: list[dict[str, Any]], task_id: str) -> str:
    task = get_task(tasks, task_id)
    return str(task.get("status")) if task else "missing"


def brief_task(task: dict[str, Any] | None) -> str:
    if not task:
        return "任务不存在"
    parts = [
        f"{task.get('id')} [{task.get('status')}]",
        str(task.get("title") or ""),
    ]
    if task.get("summary"):
        parts.append(f"原因: {task.get('summary')}")
    if task.get("report"):
        parts.append(f"报告: {task.get('report')}")
    if task.get("commit"):
        parts.append(f"commit: {task.get('commit')}")
    return " · ".join(p for p in parts if p)


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
    existing = get_task(tasks, task_id)
    if existing:
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
    }
    tasks.append(task)
    agent_queue.append_event({"event": "added", "task_id": task_id, "role": role, "title": title})
    return True


def ensure_review_and_qa(tasks: list[dict[str, Any]], current: dict[str, str], state: dict[str, Any]) -> None:
    impl_id = current["impl"]
    impl = get_task(tasks, impl_id)
    if status(tasks, impl_id) != "done":
        return

    review_id = current["review"]
    qa_id = current["qa"]
    rno = current["round"]
    impl_report = (impl or {}).get("report") or ""
    impl_commit = (impl or {}).get("commit") or ""

    added_review = add_task(
        tasks,
        task_id=review_id,
        role="review",
        title=f"审查 {impl_id} 素材库第 {rno} 轮结果",
        instructions=(
            f"只读审查 {impl_id} 的 diff、交接报告和提交。"
            f"报告: {impl_report or '见收件箱'}; commit: {impl_commit or '见队列'}。"
            "重点看: 是否符合 D-124 精品原片库方向; 是否仍只是文件浏览器; "
            "结构化画像/业务大类/剪辑检索是否可用; 是否误烧 credits; "
            "是否破坏 D-087 material_* 数据隔离。"
            f"报告写 docs/agent-handoff/REVIEW_{review_id}_MATERIALS_20260429.md 并 commit。"
        ),
        acceptance=(
            "输出 P0/P1/P2 风险清单和是否可进 QA 的结论; "
            "有文件/行号或明确证据; 只读无功能改动。"
        ),
        priority=3,
        depends_on=[impl_id],
    )
    if added_review:
        event(state, f"已创建 {review_id} 审查任务, 等 {impl_id}")

    added_qa = add_task(
        tasks,
        task_id=qa_id,
        role="qa",
        title=f"{impl_id} 素材库第 {rno} 轮真实浏览器 QA",
        instructions=(
            f"等 {impl_id} 和 {review_id} done 后执行。不要改功能代码。"
            "打开素材库页面, 用 Downloads 演示源做真实浏览器闭环: "
            "首页业务大类、搜索、进入大类、预览、待整理入口、剪辑检索或空态。"
            "curl 核验关键 /api/material-lib/* 接口。"
            f"报告写 docs/agent-handoff/QA_{qa_id}_MATERIALS_20260429.md 并 commit。"
        ),
        acceptance=(
            "截图已读; console/pageerror/requestfailed=0 或逐条解释; "
            "pytest/curl 证据齐; 明确通过/不通过; 不通过要给 P0/P1/P2 和复现步骤。"
        ),
        priority=4,
        depends_on=[impl_id, review_id],
    )
    if added_qa:
        event(state, f"已创建 {qa_id} QA 任务, 等 {impl_id}/{review_id}")


def create_rework_if_needed(tasks: list[dict[str, Any]], idx: int, state: dict[str, Any]) -> None:
    current = ROUNDS[idx]
    if idx + 1 >= len(ROUNDS):
        return
    next_round = ROUNDS[idx + 1]

    impl = get_task(tasks, current["impl"])
    review = get_task(tasks, current["review"])
    qa = get_task(tasks, current["qa"])
    blockers = [
        task for task in (impl, review, qa)
        if task and task.get("status") == "blocked"
    ]
    if not blockers:
        return
    if any(task.get("owner_decision") for task in blockers):
        event(state, "检测到需要老板决策的阻塞, 不自动返工: " + " | ".join(brief_task(t) for t in blockers))
        return

    next_impl_id = next_round["impl"]
    if get_task(tasks, next_impl_id):
        return

    reasons = "\n".join(f"- {brief_task(t)}" for t in blockers)
    prev_done = brief_task(impl)
    added = add_task(
        tasks,
        task_id=next_impl_id,
        role="media",
        title=f"素材库返修第 {next_round['round']} 轮: 处理审查/QA 阻塞",
        instructions=(
            "这是 D-124 素材库精品原片库自动返工任务。"
            f"上一轮实现: {prev_done}\n\n"
            "阻塞证据:\n"
            f"{reasons}\n\n"
            "请读取相关报告和当前 diff, 只修素材库相关范围: "
            "backend/services/materials_service.py, backend/services/materials_pipeline.py, "
            "backend/api.py 的 /api/material-lib/*, backend/services/settings.py, "
            "web/factory-materials-v2.jsx, tests/test_materials_*。"
            "不要改 docs/PROGRESS.md。完成后写 "
            f"docs/agent-handoff/MEDIA_DEV_{next_impl_id}_MATERIALS_REWORK_20260429.md 并 commit。"
        ),
        acceptance=(
            "明确逐条回应上一轮 Review/QA 阻塞; materials 相关 pytest 通过; "
            "必要时做浏览器或 curl 自验; 报告列验证命令、截图和剩余风险。"
        ),
        priority=2,
    )
    if added:
        state["active_round"] = next_round["round"]
        event(state, f"已创建 {next_impl_id} 返修任务, 进入第 {next_round['round']} 轮")


def campaign_done(tasks: list[dict[str, Any]], idx: int) -> bool:
    current = ROUNDS[idx]
    return (
        status(tasks, current["impl"]) == "done"
        and status(tasks, current["review"]) == "done"
        and status(tasks, current["qa"]) == "done"
    )


def tick() -> dict[str, Any]:
    state = load_state()
    active_round_no = int(state.get("active_round") or 1)
    active_idx = max(0, min(active_round_no - 1, len(ROUNDS) - 1))

    with agent_queue.locked_queue() as tasks:
        current = ROUNDS[active_idx]
        ensure_review_and_qa(tasks, current, state)
        create_rework_if_needed(tasks, active_idx, state)
        if campaign_done(tasks, active_idx):
            event(state, f"素材库第 {current['round']} 轮 Review/QA 均通过, 自动循环完成。")
            state["completed"] = True

    save_state(state)
    return state


def main() -> int:
    parser = argparse.ArgumentParser(description="Watch D-124 materials tasks and create rework loops.")
    parser.add_argument("--watch", action="store_true")
    parser.add_argument("--interval", type=int, default=60)
    parser.add_argument("--status", action="store_true")
    args = parser.parse_args()

    if args.status:
        state = load_state()
        print(json.dumps(state, ensure_ascii=False, indent=2))
        return 0

    while True:
        state = tick()
        if not args.watch or state.get("completed"):
            return 0
        time.sleep(max(10, args.interval))


if __name__ == "__main__":
    raise SystemExit(main())
