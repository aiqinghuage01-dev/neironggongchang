"""小华夜班 · 4 条预设任务 + 真 runner (D-040f → D-047 增量).

注册到 night_executor._RUNNERS 里, 让 night_executor.run_job_async 调.

实装情况 (诚实):
  ✓ daily_recap          真 runner: 抓昨日 ai_usage 统计, 写小华工作日志.md
  ✓ content-planner      真 runner (D-047): AI 基于人设出 5 条选题候选写 hot_topics
                         (非真"抓对标账号爆款" — 那需要爬虫, 没现成 skill)
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
    # D-067 P4: 把行为日志 + 偏好精炼成 200 token "昨天的你" 摘要, 注入下次 prompt
    {
        "name": "总结昨天的你",
        "icon": "🧠",
        "skill_slug": "yesterday-summary",
        "trigger_type": "cron",
        "trigger_config": {"cron": "30 6 * * *", "timezone": "Asia/Shanghai"},  # 凌晨 6:30 (daily-recap 之后)
        "output_target": "home",
        "enabled": False,  # 默认关 — 等老板攒够 5 条产出再开
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


# ─── 真 runner: 凌晨抓热点 (AI 出选题候选, D-047) ──────────────
# spec 想要"抓对标账号 24h 爆款" — 那需要爬虫, 没现成 skill.
# 当下能做: AI 基于人设产 5 条选题候选, 写 hot_topics 表. 不是真"抓"
# 但能给清华哥早上有东西看 + 点 "做成视频" 跳生产部.

_TOPIC_SYSTEM = (
    "你在执行小华夜班的「凌晨抓热点」任务. 当前没有真爬虫接入, 你需要 "
    "**基于清华哥的人设和定位**, 产出 5 条今天可写的选题候选.\n\n"
    "选题要求:\n"
    "1. 标题字数控制在 8-22 字\n"
    "2. 必须扣清华哥定位 (10 年科技 + AI 实战 + 给老板看)\n"
    "3. 5 条之间话题/角度有差异化\n"
    "4. 每条配 1 句话说明为什么这条匹配清华哥定位\n"
    "5. 每条评估热度 (1-100), 越高越值得做\n\n"
    "禁忌:\n"
    "- 震惊体 / 标题党 / 空泛大词 (颠覆/革命/最强)\n"
    "- 蹭明星私事 / 政治敏感\n\n"
    "输出 JSON 格式 (顶层 array):\n"
    '[{"title":"...","heat_score":85,"match_reason":"..."}, ...]'
)


def content_planner_runner(job: dict[str, Any]) -> dict[str, Any]:
    """AI 基于人设产 5 条选题候选, 写 hot_topics 表.

    返回:
      output_summary  → "AI 出 5 条选题候选 · 最高 ¥85 分: 《xxx》"
      output_refs     → [{kind:"hot_topic", id:N}, ...]
      log             → 5 条 title + heat_score + match_reason
    """
    from shortvideo.ai import get_ai_client
    from shortvideo.works import insert_hot_topic
    import json
    import re as _re

    try:
        ai = get_ai_client(route_key="topics.generate")
        r = ai.chat(
            prompt="请基于人设, 产出 5 条选题候选. 直接返回 JSON, 不要任何前言.",
            system=_TOPIC_SYSTEM,
            deep=True,
            temperature=0.85,
            max_tokens=1500,
        )
    except Exception as e:
        return {
            "output_summary": "AI 调用失败",
            "output_refs": None,
            "log": f"{type(e).__name__}: {e}",
        }

    text = r.text or ""
    # 解析顶层 array
    m = _re.search(r"\[[\s\S]*\]", text)
    if not m:
        return {
            "output_summary": "AI 返回格式不对, 解析不出选题",
            "output_refs": None,
            "log": f"AI raw response (尾部 500 字):\n{text[-500:]}",
        }
    try:
        topics = json.loads(m.group(0))
        if not isinstance(topics, list):
            raise ValueError("not a list")
    except Exception as e:
        return {
            "output_summary": "AI 返回 JSON 解析失败",
            "output_refs": None,
            "log": f"parse error: {e}\nraw:\n{text[-500:]}",
        }

    inserted_ids: list[dict[str, Any]] = []
    log_lines = ["[凌晨抓热点 · AI 出 5 条选题候选]", ""]
    for t in topics[:8]:  # 最多保 8 条
        title = (t.get("title") or "").strip()
        if not title:
            continue
        heat_score = int(t.get("heat_score") or 0)
        match_reason = (t.get("match_reason") or "").strip() or None
        try:
            tid = insert_hot_topic(
                title=title,
                platform="ai-generated",
                heat_score=heat_score,
                match_persona=True,
                match_reason=match_reason,
                fetched_from="night-shift",
            )
            inserted_ids.append({"kind": "hot_topic", "id": tid})
            log_lines.append(f"- 🔥{heat_score:>3} 《{title}》 — {match_reason or '(无理由)'}")
        except Exception as e:
            log_lines.append(f"- ⚠️ 写入失败 《{title}》: {e}")

    if not inserted_ids:
        return {
            "output_summary": "AI 出选题但 0 条写入成功",
            "output_refs": None,
            "log": "\n".join(log_lines),
        }

    # 找最高分一条做 summary 引子
    sorted_topics = sorted(
        [t for t in topics if t.get("title")],
        key=lambda t: int(t.get("heat_score") or 0),
        reverse=True,
    )
    top_title = sorted_topics[0].get("title") if sorted_topics else ""
    top_heat = int(sorted_topics[0].get("heat_score") or 0) if sorted_topics else 0
    summary = f"AI 出 {len(inserted_ids)} 条选题 · 最高 🔥{top_heat}: 《{top_title[:18]}》"

    return {
        "output_summary": summary,
        "output_refs": inserted_ids,
        "log": "\n".join(log_lines),
    }


# ─── 占位 runner: 2 个未实装 ──────────────────────────────────

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


# ─── D-067 P4: 昨天的你 — 把 work_log + preference 精炼成 200 token 摘要 ──────

def yesterday_summary_runner(job: dict[str, Any]) -> dict[str, Any]:
    """读 work_log 最近 30 行 + preference 全部 → 调 AI 二筛精炼成 ~200 token 摘要.

    写到 ~/Desktop/清华哥知识库/00 🤖 AI清华哥/昨天的你.md
    persona.py 优先读这个摘要 (而不是完整 work_log) 注入 system prompt.

    数据不足(< 5 条 entries)直接跳过, 不写空摘要.
    """
    from pathlib import Path
    import os, re

    log_path = Path(os.path.expanduser("~/Desktop/清华哥知识库/00 🤖 AI清华哥/小华工作日志.md"))
    pref_path = Path(os.path.expanduser("~/Desktop/清华哥知识库/00 🤖 AI清华哥/小华学到的偏好.md"))
    summary_path = Path(os.path.expanduser("~/Desktop/清华哥知识库/00 🤖 AI清华哥/昨天的你.md"))

    log_text = log_path.read_text(encoding="utf-8") if log_path.exists() else ""
    pref_text = pref_path.read_text(encoding="utf-8") if pref_path.exists() else ""

    # 只取 "## YYYY-MM-DD" 节里的实际 entries
    entries: list[str] = []
    in_dated = False
    for ln in log_text.splitlines():
        s = ln.strip()
        if s.startswith("## ") and len(s) > 6 and s[3].isdigit():
            in_dated = True
            entries.append(ln)
        elif s.startswith("## "):
            in_dated = False
        elif in_dated and (s.startswith("- ") or s.startswith("### ")):
            entries.append(ln)

    if len(entries) < 5:
        return {
            "output_summary": f"work_log 数据不足 ({len(entries)} 条 < 5), 跳过总结",
            "output_refs": [],
            "log": "等老板用一段时间积累更多产出再总结",
        }

    log_brief = "\n".join(entries[-50:])  # 最近 50 条
    pref_brief = pref_text[-2000:] if pref_text else "(暂无明确偏好)"

    prompt = (
        "下面是清华哥(老板)最近的内容产出记录 + 已表达过的偏好.\n"
        "请你精炼成一段 ~200 token 的'昨天的你'摘要, 用第二人称'你'写, "
        "用大白话总结他的风格倾向 / 高频选择 / 已知禁忌. "
        "不要重复列表, 概括风格特征. 严禁编造记录里没有的内容.\n\n"
        f"## 工作日志(最近 50 条):\n{log_brief}\n\n"
        f"## 偏好(自动抓的):\n{pref_brief}\n\n"
        "现在请输出'昨天的你'摘要(纯正文, 无标题):"
    )

    from shortvideo.ai import get_ai_client
    ai = get_ai_client(route_key="memory.summarize")
    r = ai.chat(prompt, system="你是清华哥的内容副驾, 精炼总结他的风格倾向", deep=False, temperature=0.3, max_tokens=500)
    summary = (r.text or "").strip()

    if not summary or len(summary) < 50:
        return {
            "output_summary": "AI 返回空 / 太短, 跳过写文件",
            "output_refs": [],
            "log": f"raw output (len={len(summary)}):\n{summary}",
        }

    summary_path.parent.mkdir(parents=True, exist_ok=True)
    from datetime import datetime
    header = f"# 昨天的你\n\n> 由小华夜班 D-067 自动总结 · 注入到每次 AI 调用的 system prompt\n> 上次更新: {datetime.now().strftime('%Y-%m-%d %H:%M')}\n\n"
    summary_path.write_text(header + summary + "\n", encoding="utf-8")

    return {
        "output_summary": f"精炼了 {len(entries)} 条产出 + 偏好 → {len(summary)} 字摘要",
        "output_refs": [{"kind": "yesterday_summary", "path": str(summary_path)}],
        "log": f"写入 {summary_path}\n字数: {len(summary)}\ntoken: {r.total_tokens}\n\n摘要预览:\n{summary[:300]}",
    }


def register_all() -> None:
    """把 4 条 runner 注册到 night_executor. 幂等."""
    global _REGISTERED
    if _REGISTERED:
        return
    night_executor.register_runner("daily-recap", daily_recap_runner)
    night_executor.register_runner("yesterday-summary", yesterday_summary_runner)
    night_executor.register_runner("content-planner", content_planner_runner)
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
