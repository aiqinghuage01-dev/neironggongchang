#!/usr/bin/env python3
"""Timed watcher for the all-site optimization campaign.

For the next bounded window it checks whether the workbench still has active
queue work. If everything is idle, it adds the next conservative batch of
all-site optimization tasks.
"""

from __future__ import annotations

import argparse
import json
import time
from pathlib import Path
from typing import Any

import agent_queue


STATE_PATH = agent_queue.queue_dir() / "site_optimization_watch_state.json"
LOG_PATH = agent_queue.queue_dir() / "site_optimization_watch.jsonl"

DISCOVERY_IDS = ["T-041", "T-042", "T-043", "T-044", "T-045"]
DEV_IDS = ["T-046", "T-047"]
VERIFY_IDS = ["T-048", "T-049"]
REPAIR_IDS = ["T-050", "T-051"]
FINAL_VERIFY_IDS = ["T-052", "T-053"]
CAMPAIGN_IDS = DISCOVERY_IDS + DEV_IDS + VERIFY_IDS + REPAIR_IDS + FINAL_VERIFY_IDS
TERMINAL_STATUSES = {"done", "blocked", "cancelled"}


def now_ts() -> int:
    return int(time.time())


def load_state(hours: float) -> dict[str, Any]:
    if STATE_PATH.exists():
        try:
            state = json.loads(STATE_PATH.read_text(encoding="utf-8") or "{}")
            if state:
                return state
        except json.JSONDecodeError:
            pass
    started = now_ts()
    return {
        "started_at": agent_queue.now(),
        "started_ts": started,
        "end_ts": started + int(hours * 3600),
        "interval_seconds": 7200,
        "completed": False,
        "events": [],
    }


def save_state(state: dict[str, Any]) -> None:
    STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    tmp = STATE_PATH.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(state, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    tmp.replace(STATE_PATH)


def log_event(state: dict[str, Any], text: str, **extra: Any) -> None:
    item = {"time": agent_queue.now(), "text": text, **extra}
    events = state.setdefault("events", [])
    events.append(item)
    del events[:-80]
    LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    with LOG_PATH.open("a", encoding="utf-8") as file:
        file.write(json.dumps(item, ensure_ascii=False) + "\n")
    print(f"[{item['time']}] {text}", flush=True)


def find_task(tasks: list[dict[str, Any]], task_id: str) -> dict[str, Any] | None:
    return agent_queue.find_task(tasks, task_id)


def has_task(tasks: list[dict[str, Any]], task_id: str) -> bool:
    return find_task(tasks, task_id) is not None


def status(tasks: list[dict[str, Any]], task_id: str) -> str:
    task = find_task(tasks, task_id)
    return str(task.get("status")) if task else "missing"


def all_terminal(tasks: list[dict[str, Any]], ids: list[str]) -> bool:
    return all(status(tasks, task_id) in TERMINAL_STATUSES for task_id in ids)


def all_done(tasks: list[dict[str, Any]], ids: list[str]) -> bool:
    return all(status(tasks, task_id) == "done" for task_id in ids)


def any_blocked_without_owner_decision(tasks: list[dict[str, Any]], ids: list[str]) -> bool:
    for task_id in ids:
        task = find_task(tasks, task_id)
        if task and task.get("status") == "blocked" and not task.get("owner_decision"):
            return True
    return False


def active_work(tasks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        task
        for task in tasks
        if task.get("status") in {"claimed", "queued"}
        and task.get("role") in {"content", "media", "qa", "review", "any"}
    ]


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
    if has_task(tasks, task_id):
        return False
    tasks.append(
        {
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
    )
    agent_queue.append_event({"event": "added", "task_id": task_id, "role": role, "title": title})
    return True


def add_discovery_batch(tasks: list[dict[str, Any]], state: dict[str, Any]) -> int:
    added = 0
    added += add_task(
        tasks,
        task_id="T-041",
        role="qa",
        title="D-125 素材库正式端口独立复测",
        priority=2,
        instructions=(
            "在正式 8000/8001 端口复测素材库 D-125。只做 QA, 不改功能代码。"
            "覆盖首页精选、业务大类、预览弹窗、剪辑检索、移动端; curl /featured /categories /match。"
            "报告写 docs/agent-handoff/QA_T041_MATERIALS_D125_20260430.md 并 commit。"
        ),
        acceptance="截图已读; console/pageerror/requestfailed=0 或解释; curl/pytest 证据齐; 明确通过/不通过。",
    )
    added += add_task(
        tasks,
        task_id="T-042",
        role="qa",
        title="全站基础导航与页面状态 smoke",
        priority=3,
        instructions=(
            "全站低风险 smoke: 打开首页、侧栏主要入口、作品库、素材库、公众号、投流、热点、录音、直接出图、即梦、数字人、设置/科技与狠活。"
            "只记录页面是否能加载、是否有明显空白/遮挡/控制台错误。不真烧 credits, 不改功能代码。"
            "报告写 docs/agent-handoff/QA_T042_SITE_NAV_SMOKE_20260430.md 并 commit。"
        ),
        acceptance="给 P0/P1/P2 清单; 每个问题有截图/console/复现入口; console/pageerror/requestfailed 汇总。",
    )
    added += add_task(
        tasks,
        task_id="T-043",
        role="review",
        title="D-125 素材库改动只读审查",
        priority=3,
        instructions=(
            "只读审查 main 上 D-125/D-124 素材库改动和交接报告。重点看产品心智、性能、路径/设置风险、测试遗漏、是否会误烧 credits。"
            "报告写 docs/agent-handoff/REVIEW_T043_MATERIALS_D125_20260430.md 并 commit。"
        ),
        acceptance="输出 P0/P1/P2 风险清单; 无问题也明确说明残余风险; 只读不改代码。",
    )
    added += add_task(
        tasks,
        task_id="T-044",
        role="qa",
        title="全站内容链路低风险页面巡检",
        priority=4,
        instructions=(
            "巡检内容生产相关页面: 公众号、投流、热点改写、录音改写、朋友圈、策划、合规。"
            "只做页面加载、表单基础交互、错误/空态、历史任务展示; 不做批量真烧, 真烧最多一条必须符合最小闭环规则。"
            "报告写 docs/agent-handoff/QA_T044_CONTENT_PAGES_20260430.md 并 commit。"
        ),
        acceptance="按页面列通过/不通过; P1/P2 给截图和复现步骤; 不重复烧 credits。",
    )
    added += add_task(
        tasks,
        task_id="T-045",
        role="qa",
        title="全站媒体链路低风险页面巡检",
        priority=5,
        instructions=(
            "巡检媒体相关页面: 素材库、作品库、直接出图、即梦、数字人、声音/视频相关入口。"
            "只做页面加载、列表/预览/历史任务/错误空态; 默认不真烧 credits, 需要最小真烧时先记录理由。"
            "报告写 docs/agent-handoff/QA_T045_MEDIA_PAGES_20260430.md 并 commit。"
        ),
        acceptance="按页面列通过/不通过; P1/P2 给截图和复现步骤; 不重复烧 credits。",
    )
    if added:
        log_event(state, f"已补全站巡检发现批次: {added} 个任务")
    return added


def add_dev_batch(tasks: list[dict[str, Any]], state: dict[str, Any]) -> int:
    added = 0
    added += add_task(
        tasks,
        task_id="T-046",
        role="content",
        title="全站内容生产区体验优化第一轮",
        priority=2,
        instructions=(
            "读取收件箱中 T-042/T-044/T-043/T-041/T-045 报告, 只处理内容生产相关低/中风险优化。"
            "范围: 公众号、投流、热点改写、录音改写、朋友圈、策划、合规及其后端直接相关服务。"
            "优先修用户可见错误、空态、按钮/表单不可用、明显遮挡、文案技术词。不要改媒体页, 不改 docs/PROGRESS.md。"
            "完成后写 docs/agent-handoff/DEV_CONTENT_T046_SITE_OPT_20260430.md 并 commit。"
        ),
        acceptance="逐条回应 QA/Review 问题; 相关 pytest/必要 e2e 通过; 不重复真烧 credits; 报告列验证证据。",
    )
    added += add_task(
        tasks,
        task_id="T-047",
        role="media",
        title="全站媒体与资产区体验优化第一轮",
        priority=2,
        instructions=(
            "读取收件箱中 T-041/T-042/T-043/T-045/T-044 报告, 只处理媒体/资产相关低/中风险优化。"
            "范围: 素材库、作品库、直接出图、即梦、数字人、声音/视频相关入口及后端直接相关服务。"
            "优先修用户可见错误、空态、预览/列表/历史任务展示、文案技术词。不要改内容生产页, 不改 docs/PROGRESS.md。"
            "完成后写 docs/agent-handoff/DEV_MEDIA_T047_SITE_OPT_20260430.md 并 commit。"
        ),
        acceptance="逐条回应 QA/Review 问题; 相关 pytest/必要 e2e 通过; 不重复真烧 credits; 报告列验证证据。",
    )
    if added:
        log_event(state, f"已补全站优化开发批次: {added} 个任务")
    return added


def add_verify_batch(tasks: list[dict[str, Any]], state: dict[str, Any], final: bool = False) -> int:
    qa_id, review_id = ("T-052", "T-053") if final else ("T-048", "T-049")
    label = "最终" if final else "第一轮"
    added = 0
    added += add_task(
        tasks,
        task_id=qa_id,
        role="qa",
        title=f"全站优化后{label}真实浏览器回归",
        priority=3,
        instructions=(
            "读取 T-046/T-047/T-050/T-051 中已完成的开发报告, 在主线或对应总控指定代码上做真实浏览器回归。"
            "覆盖首页导航、内容生产核心页、媒体资产核心页、素材库/作品库; curl 关键 API; 不做重复真烧。"
            f"报告写 docs/agent-handoff/QA_{qa_id}_SITE_OPT_REGRESSION_20260430.md 并 commit。"
        ),
        acceptance="截图已读; console/pageerror/requestfailed=0 或解释; pytest/curl 证据齐; 明确通过/不通过。",
    )
    added += add_task(
        tasks,
        task_id=review_id,
        role="review",
        title=f"全站优化后{label}只读审查",
        priority=4,
        instructions=(
            "读取全站优化开发报告和 diff, 只读审查是否引入回归、是否违反角色范围、是否遗漏测试。"
            f"报告写 docs/agent-handoff/REVIEW_{review_id}_SITE_OPT_20260430.md 并 commit。"
        ),
        acceptance="输出 P0/P1/P2 风险清单; 无问题也明确残余风险; 只读不改代码。",
    )
    if added:
        log_event(state, f"已补全站优化{label}验证批次: {added} 个任务")
    return added


def add_repair_batch(tasks: list[dict[str, Any]], state: dict[str, Any]) -> int:
    added = 0
    added += add_task(
        tasks,
        task_id="T-050",
        role="content",
        title="全站内容生产区 QA/Review 返修",
        priority=2,
        instructions=(
            "读取 T-048/T-049/T-046/T-047 相关报告, 只返修内容生产区仍未通过的问题。"
            "不要扩大范围, 不改 docs/PROGRESS.md。完成后写 docs/agent-handoff/DEV_CONTENT_T050_SITE_OPT_REWORK_20260430.md 并 commit。"
        ),
        acceptance="逐条回应阻塞项; 相关测试通过; 报告列验证证据和剩余风险。",
    )
    added += add_task(
        tasks,
        task_id="T-051",
        role="media",
        title="全站媒体与资产区 QA/Review 返修",
        priority=2,
        instructions=(
            "读取 T-048/T-049/T-046/T-047 相关报告, 只返修媒体/资产区仍未通过的问题。"
            "不要扩大范围, 不改 docs/PROGRESS.md。完成后写 docs/agent-handoff/DEV_MEDIA_T051_SITE_OPT_REWORK_20260430.md 并 commit。"
        ),
        acceptance="逐条回应阻塞项; 相关测试通过; 报告列验证证据和剩余风险。",
    )
    if added:
        log_event(state, f"已补全站优化返修批次: {added} 个任务")
    return added


def add_next_batch_if_idle(tasks: list[dict[str, Any]], state: dict[str, Any]) -> int:
    active = active_work(tasks)
    if active:
        brief = ", ".join(f"{t.get('id')}:{t.get('status')}" for t in active[:8])
        log_event(state, f"工作台仍有任务在跑/排队, 本轮不补任务: {brief}")
        return 0

    if not all(has_task(tasks, task_id) for task_id in DISCOVERY_IDS):
        return add_discovery_batch(tasks, state)

    if all_terminal(tasks, DISCOVERY_IDS) and not any(has_task(tasks, task_id) for task_id in DEV_IDS):
        return add_dev_batch(tasks, state)

    if all_terminal(tasks, DEV_IDS):
        if any_blocked_without_owner_decision(tasks, DEV_IDS) and not any(has_task(tasks, task_id) for task_id in REPAIR_IDS):
            return add_repair_batch(tasks, state)
        if all_done(tasks, DEV_IDS) and not any(has_task(tasks, task_id) for task_id in VERIFY_IDS):
            return add_verify_batch(tasks, state)

    if all_terminal(tasks, VERIFY_IDS):
        if any_blocked_without_owner_decision(tasks, VERIFY_IDS) and not any(has_task(tasks, task_id) for task_id in REPAIR_IDS):
            return add_repair_batch(tasks, state)
        if all_done(tasks, VERIFY_IDS):
            log_event(state, "全站优化第一轮已通过 QA/Review, 暂无新任务需要自动补充")
            return 0

    if all_terminal(tasks, REPAIR_IDS):
        if all_done(tasks, REPAIR_IDS) and not any(has_task(tasks, task_id) for task_id in FINAL_VERIFY_IDS):
            return add_verify_batch(tasks, state, final=True)
        if any_blocked_without_owner_decision(tasks, REPAIR_IDS):
            log_event(state, "返修任务仍 blocked, 不继续自动扩张任务; 等总控收件箱判断")
            return 0

    if all_terminal(tasks, FINAL_VERIFY_IDS):
        log_event(state, "全站优化最终验证批次已结束, 暂无新任务需要自动补充")
        return 0

    log_event(state, "工作台空闲, 但当前批次尚未达到可自动补任务条件")
    return 0


def tick(hours: float) -> dict[str, Any]:
    state = load_state(hours)
    if state.get("completed"):
        return state
    if now_ts() >= int(state.get("end_ts") or 0):
        state["completed"] = True
        log_event(state, "8 小时全站优化巡检窗口结束")
        save_state(state)
        return state

    with agent_queue.locked_queue() as tasks:
        add_next_batch_if_idle(tasks, state)
    save_state(state)
    return state


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--watch", action="store_true")
    parser.add_argument("--once", action="store_true")
    parser.add_argument("--status", action="store_true")
    parser.add_argument("--interval", type=int, default=7200)
    parser.add_argument("--hours", type=float, default=8)
    args = parser.parse_args()

    if args.status:
        state = load_state(args.hours)
        print(json.dumps(state, ensure_ascii=False, indent=2))
        return 0

    while True:
        state = tick(args.hours)
        if args.once or not args.watch or state.get("completed"):
            return 0
        time.sleep(max(60, args.interval))


if __name__ == "__main__":
    raise SystemExit(main())
