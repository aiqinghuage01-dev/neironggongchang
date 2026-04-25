"""小华夜班 · 4 条预设任务 + 真 runner (D-040f).

注册到 night_executor._RUNNERS 里, 让 night_executor.run_job_async 调.

实装情况 (诚实):
  ✓ daily_recap          真 runner: 抓昨日 ai_usage 统计, 写小华工作日志.md
  ⏸ content-planner      placeholder: 等 D-040f-2 接 planner_pipeline 真跑
  ⏸ one-fish-many-meals  placeholder: ~/Desktop/skills/ 下没这个 skill
  ⏸ kb-compiler          placeholder: ~/Desktop/skills/ 下没这个 skill

placeholder runner 不会崩, 写 "未接入" 消息让用户在 UI 看到清楚状态.
"""
from __future__ import annotations

import logging
from typing import Any

from backend.services import night_executor


_log = logging.getLogger("night.runners")


# ─── 4 条预设任务的种子数据 ────────────────────────────────────
DEFAULT_NIGHT_JOBS = [
    {
        "name": "凌晨抓热点",
        "icon": "🔥",
        "skill_slug": "content-planner",
        "trigger_type": "cron",
        "trigger_config": {"cron": "0 23 * * *", "timezone": "Asia/Shanghai"},
        "output_target": "materials",
        "enabled": False,  # 默认不自动启用 — 让用户审一遍再开
    },
    {
        "name": "一鱼多吃",
        "icon": "🐟",
        "skill_slug": "one-fish-many-meals",
        "trigger_type": "file_watch",
        "trigger_config": {"path": "data/inbox/audio/", "patterns": ["*.m4a", "*.mp3", "*.wav"]},
        "output_target": "works",
        "enabled": False,
    },
    {
        "name": "知识库整理",
        "icon": "📚",
        "skill_slug": "kb-compiler",
        "trigger_type": "cron",
        "trigger_config": {"cron": "0 2 * * *", "timezone": "Asia/Shanghai"},
        "output_target": "knowledge",
        "enabled": False,
    },
    {
        "name": "昨日复盘",
        "icon": "📊",
        "skill_slug": "daily-recap",  # 自实现, 不指向外部 skill
        "trigger_type": "cron",
        "trigger_config": {"cron": "0 6 * * *", "timezone": "Asia/Shanghai"},
        "output_target": "home",
        "enabled": False,
    },
]


def seed_defaults() -> dict[str, Any]:
    """幂等创建 4 条预设. 已有 (按 name 匹配) 跳过. 返回创建/跳过统计."""
    from backend.services import night_shift
    existing_names = {j["name"] for j in night_shift.list_jobs()}
    created: list[dict[str, Any]] = []
    skipped: list[str] = []
    for seed in DEFAULT_NIGHT_JOBS:
        if seed["name"] in existing_names:
            skipped.append(seed["name"])
            continue
        jid = night_shift.create_job(**seed)
        created.append({"id": jid, "name": seed["name"]})
    return {"created": created, "skipped": skipped}


# ─── 真 runner: 昨日复盘 ────────────────────────────────────
# 不依赖外部 skill, 走项目内 services. 用户最早能看到的"夜班真产出".

def daily_recap_runner(job: dict[str, Any]) -> dict[str, Any]:
    """昨日复盘: 抓昨天的 AI 用量 + 总结写小华工作日志.md.

    返回:
      output_summary  → "AI 调 N 次 / Y tokens / ¥Z · 顺手把日报写进了工作日志"
      output_refs     → [{kind: "work_log", path: "..."}]  (D-040 散落标签 D-040f 真接时用)
      log             → 详细统计文本
    """
    from backend.services import ai_usage, work_log

    try:
        usage = ai_usage.get_usage("yesterday")
    except Exception as e:
        return {
            "output_summary": "复盘失败: 取昨日 AI 用量出错",
            "output_refs": None,
            "log": f"ai_usage.get_usage('yesterday') 抛异常: {e}",
        }

    overall = usage.get("overall") or {}
    by_engine = usage.get("by_engine") or []
    calls = overall.get("calls", 0)
    in_tok = overall.get("prompt_tokens", 0)
    out_tok = overall.get("completion_tokens", 0)
    total_tok = overall.get("total_tokens", 0)
    fails = overall.get("fails", 0)
    cost_cny = overall.get("cost_cny", 0)

    if calls == 0:
        # 昨天没动静 — 不算失败, 但 summary 简短
        summary = "昨天没调过 AI · 没东西可复盘"
        log = (
            "ai_usage.get_usage('yesterday') 返回 0 calls.\n"
            "可能原因: 昨天确实没用项目里的功能 / DB_PATH 在测试时被 monkey-patch."
        )
        return {"output_summary": summary, "output_refs": None, "log": log}

    # 算占比
    engine_breakdown = []
    for e in by_engine:
        n = e.get("calls", 0)
        if n and calls:
            engine_breakdown.append(f"{e.get('engine','?')} {n} 次({n*100//calls}%)")
    engine_str = " / ".join(engine_breakdown) if engine_breakdown else ""

    # 简洁摘要
    summary_parts = [f"AI 调 {calls} 次", f"{total_tok//1000}K tokens"]
    if cost_cny:
        summary_parts.append(f"¥{cost_cny:.2f}")
    if fails:
        summary_parts.append(f"⚠️ {fails} 次失败")
    output_summary = " · ".join(summary_parts)

    # 详细 log (走 work_log 写进小华工作日志 · 复用 D-023/D-031 的接口)
    log_lines = [
        f"# 昨日复盘 ({usage.get('range') or 'yesterday'})",
        "",
        f"- 调用: {calls} 次  失败: {fails} 次",
        f"- Tokens: input {in_tok:,} / output {out_tok:,} / total {total_tok:,}",
        f"- 成本: ¥{cost_cny:.4f}",
    ]
    if engine_str:
        log_lines.append(f"- 引擎分布: {engine_str}")

    by_route = usage.get("by_route") or []
    if by_route:
        log_lines.append("")
        log_lines.append("## Top routes")
        for r in by_route[:5]:
            log_lines.append(
                f"- {r.get('route_key', '(none)'):<24}  {r.get('calls', 0)} 次  "
                f"{r.get('total_tokens', 0):,} tok"
            )
    log_text = "\n".join(log_lines)

    # 顺手追加到工作日志 (复用 work_log.maybe_log 的写盘机制有点重 — 它是按调用打点用的;
    # 这里直接 append. 失败不致命)
    appended_to: str | None = None
    try:
        from pathlib import Path
        # 跟 work_log 一样的位置: ~/Desktop/清华哥知识库/05 …/小华工作日志.md
        # 但 work_log 内部路径常量我不直接拿, 用 status() 探一下
        status = work_log.status()
        log_path = status.get("path")
        if log_path:
            p = Path(log_path)
            if p.parent.exists():
                with p.open("a", encoding="utf-8") as f:
                    f.write(f"\n\n---\n\n[小华夜班 · 昨日复盘]\n\n{log_text}\n")
                appended_to = str(p)
    except Exception as e:
        _log.warning(f"daily_recap 追加 work_log 失败: {e}")

    refs = [{"kind": "work_log", "path": appended_to}] if appended_to else None
    if appended_to:
        output_summary += " · 已写工作日志"

    return {
        "output_summary": output_summary,
        "output_refs": refs,
        "log": log_text,
    }


# ─── 占位 runner: 3 个未实装 ──────────────────────────────────

def _placeholder_with_msg(name: str, why: str):
    def _runner(job: dict[str, Any]) -> dict[str, Any]:
        return {
            "output_summary": f"{name} · 未接入",
            "output_refs": None,
            "log": (
                f"job_id={job.get('id')} skill_slug={job.get('skill_slug')}\n"
                f"原因: {why}\n"
                f"等 D-040f 后续轮次正式接入. 现在跑只是让链路通."
            ),
        }
    return _runner


# ─── 注册到 night_executor ──────────────────────────────────
# 模块导入时一次性注册. 调度器 fire 或用户点立即跑时, night_executor 会查表.

_REGISTERED = False


def register_all() -> None:
    """把 4 条 runner 注册到 night_executor. 幂等."""
    global _REGISTERED
    if _REGISTERED:
        return
    night_executor.register_runner("daily-recap", daily_recap_runner)
    night_executor.register_runner(
        "content-planner",
        _placeholder_with_msg(
            "凌晨抓热点",
            "等 planner_pipeline.analyze + write 接入 + 写 materials 表"
        ),
    )
    night_executor.register_runner(
        "one-fish-many-meals",
        _placeholder_with_msg(
            "一鱼多吃",
            "~/Desktop/skills/ 下还没 one-fish-many-meals · 也需要 watchdog 监听 data/inbox/audio/"
        ),
    )
    night_executor.register_runner(
        "kb-compiler",
        _placeholder_with_msg(
            "知识库整理",
            "~/Desktop/skills/ 下还没 kb-compiler / kb-lint"
        ),
    )
    _REGISTERED = True


# 模块导入时自动注册
register_all()
