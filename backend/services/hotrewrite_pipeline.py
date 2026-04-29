"""热点文案改写V2 skill 的 pipeline — 3 步:拆解 → 选角度 → 写正文+自检。

Skill 源: ~/Desktop/skills/热点文案改写V2/SKILL.md (6043 字,无 references)
SKILL.md 本身就是完整的方法论和约束,pipeline 里整篇塞进 system prompt。

3 步流程:
  analyze_hotspot(hotspot) → {breakdown, angles[3]}
  write_script(hotspot, breakdown, angle) → {content, self_check, tokens}
"""
from __future__ import annotations

import json
import re
from typing import Any

from backend.services import skill_loader
from backend.services import tasks as tasks_service
from shortvideo.ai import get_ai_client

SKILL_SLUG = "热点文案改写V2"


def _extract_json(text: str, wrap: str = "object") -> Any:
    pat = r"\[[\s\S]*\]" if wrap == "array" else r"\{[\s\S]*\}"
    m = re.search(pat, text)
    if not m:
        return None
    try:
        return json.loads(m.group(0))
    except Exception:
        return None


def _clean_script_content(text: str) -> str:
    """去掉模型偶发吐出的执行说明/后续操作建议,只保留口播正文。"""
    content = (text or "").strip()
    content = re.sub(
        r"^\s*(?:已(?:经)?走(?:完)?(?:技能|skill)[:：].*?)(?:\n{1,2}|$)",
        "",
        content,
        flags=re.IGNORECASE,
    ).strip()
    content = re.sub(
        r"^\s*(?:以下是(?:正文|文案|口播正文)|正文如下)[:：]?\s*(?:\n{1,2}|$)",
        "",
        content,
        flags=re.IGNORECASE,
    ).strip()
    content = re.sub(
        r"\n\s*-{3,}\s*\n\s*需要进一步操作吗[？?]?[\s\S]*$",
        "",
        content,
    ).strip()
    content = re.sub(
        r"\n\s*需要进一步操作吗[？?]?[\s\S]*$",
        "",
        content,
    ).strip()
    return content


# ─── Step 1 · 热点拆解 + 3 个切入角度 ──────────────────────

def analyze_hotspot(hotspot: str) -> dict[str, Any]:
    """基于热点事件,输出拆解(事件核心/冲突点/情绪入口)+ 3 个切入角度。"""
    skill = skill_loader.load_skill(SKILL_SLUG)
    system = f"""你在执行《热点文案改写V2》skill 的 Step 1 · 热点拆解 + 方向确认。

===== skill 完整方法论 =====
{skill['skill_md']}
"""

    prompt = f"""热点事件:
{hotspot.strip()}

按 Step 1 要求,做内部拆解 + 给出 3 个切入角度供用户选择。
严格 JSON 对象,不加前言:

{{
  "breakdown": {{
    "event_core": "事件核心,1-2 句话说清",
    "conflict": "最刺痛老板的矛盾点",
    "emotion": "老板会代入的情绪(委屈/焦虑/无力/机会感)"
  }},
  "angles": [
    {{"label": "A. 角度标题", "audience": "适合什么情绪/观点/场景", "draft_hook": "3 秒判词开场的那一句草稿"}},
    {{"label": "B. ...", "audience": "...", "draft_hook": "..."}},
    {{"label": "C. ...", "audience": "...", "draft_hook": "..."}}
  ]
}}"""
    ai = get_ai_client(route_key="hotrewrite.analyze")
    r = ai.chat(prompt, system=system, deep=False, temperature=0.8, max_tokens=2000)
    # D-094: 解析失败 → raise. 不让 breakdown={} + angles=[] 流出去 (前端 Step 1 看 0 个角度卡死).
    obj = _extract_json(r.text, "object")
    if obj is None:
        raise RuntimeError(
            f"热点改写·拆解 LLM 输出非 JSON (tokens={r.total_tokens}). 输出头: {(r.text or '')[:200]!r}"
        )
    breakdown = obj.get("breakdown") or {}
    angles_raw = obj.get("angles") or []
    if not isinstance(breakdown, dict) or not breakdown.get("event_core"):
        raise RuntimeError(
            f"热点改写·拆解 breakdown.event_core 缺失 (tokens={r.total_tokens}). 输出头: {(r.text or '')[:200]!r}"
        )
    angles = [
        {
            "label": (a.get("label") or "").strip(),
            "audience": (a.get("audience") or "").strip(),
            "draft_hook": (a.get("draft_hook") or "").strip(),
        }
        for a in angles_raw
        if isinstance(a, dict) and a.get("label")
    ][:3]
    if not angles:
        raise RuntimeError(
            f"热点改写·拆解 angles 数组 0 条有效 (tokens={r.total_tokens}). 输出头: {(r.text or '')[:200]!r}"
        )
    return {
        "breakdown": breakdown,
        "angles": angles,
        "raw_tokens": r.total_tokens,
    }


# ─── Step 2-5 · 写正文 1800-2600 字 + 六维自检 ────────────

_VARIANT_SPECS = {
    "pure_v1": {
        "mode_label": "纯改写 V1 · 换皮版",
        "route_key": "hotrewrite.write.fast",
        "instruction": (
            "纯改写 V1: 保留热点原始冲突和信息顺序, 换成清华哥口播表达. "
            "不植入业务, 只做观点改写、节奏增强和金句收口."
        ),
    },
    "pure_v2": {
        "mode_label": "纯改写 V2 · 狠劲版",
        "route_key": "hotrewrite.write.fast",
        "instruction": (
            "纯改写 V2: 观点更锋利, 开头更有态度, 反差更强. "
            "不植入业务, 重点让老板看完觉得'这话说透了'."
        ),
    },
    "biz_v3": {
        "mode_label": "结合业务 V3 · 翻转版",
        "route_key": "hotrewrite.write",
        "instruction": (
            "结合业务 V3: 80% 讲热点背后的经营规律, 20% 自然植入 AI+短视频获客方案. "
            "结构上做一次关键翻转: 表面是热点, 本质是实体老板获客/信任/效率问题."
        ),
    },
    "biz_v4": {
        "mode_label": "结合业务 V4 · 圈人版",
        "route_key": "hotrewrite.write",
        "instruction": (
            "结合业务 V4: 更强调'哪些老板和我同频', 语气更像筛选同路人. "
            "业务植入放在第三条建议和低压 CTA, 不能硬卖."
        ),
    },
}


def build_write_variants(modes: dict[str, Any] | None = None) -> list[dict[str, str]]:
    """前端勾选模式 → 实际要生成的版本列表.

    D-101: UI 一直写"每勾一项加 2 篇",后端必须真按这个契约生成.
    """
    m = modes or {}
    with_biz = bool(m.get("with_biz", True))
    pure_rewrite = bool(m.get("pure_rewrite", False))
    if not with_biz and not pure_rewrite:
        with_biz = True

    keys: list[str] = []
    if pure_rewrite:
        keys.extend(["pure_v1", "pure_v2"])
    if with_biz:
        keys.extend(["biz_v3", "biz_v4"])
    return [{"variant_id": k, **_VARIANT_SPECS[k]} for k in keys]


def write_script(
    hotspot: str,
    breakdown: dict[str, Any],
    angle: dict[str, Any],
    *,
    variant: dict[str, str] | None = None,
) -> dict[str, Any]:
    """基于拆解和选定角度,写 1800-2600 字口播正文 + 六维自检。"""
    skill = skill_loader.load_skill(SKILL_SLUG)
    variant = variant or {"variant_id": "single", "mode_label": "", "instruction": ""}
    variant_instruction = (variant.get("instruction") or "").strip()
    system = f"""你在执行《热点文案改写V2》skill 的 Step 2-4 · 撰写正文。
身份/语气/业务植入/人设约束全部按下面 skill 方法论严格执行。

===== skill 完整方法论 =====
{skill['skill_md']}

===== 额外硬规矩 =====
- 字数 1800-2600(必须,超或不足按比例扩写/精简)
- 口播节奏:短句优先,每段一个中心观点
- 大白话优先,复杂概念翻译成人话
- 人设名"清华哥"(不能写成青蛙哥/清哥等变体)
- 禁用 markdown 符号 / emoji 作段首(留给后续排版)
- 输出纯文本正文,不要标题/前言/说明
- 禁止输出"已走技能"、下一步操作建议、菜单选项、"需要进一步操作吗"等系统提示
{f"- 本版写法: {variant_instruction}" if variant_instruction else ""}
"""

    write_prompt = f"""【热点】
{hotspot.strip()}

【已确认的拆解】
- 事件核心: {breakdown.get('event_core', '')}
- 冲突点: {breakdown.get('conflict', '')}
- 情绪入口: {breakdown.get('emotion', '')}

【用户选定角度】
{angle.get('label', '')}
- 适合: {angle.get('audience', '')}
- 开场草稿: {angle.get('draft_hook', '')}

按 Step 2 流量结构骨架(3秒判词 → 30秒画面 → 底层机制 → 连续反转 → 三条建议(第3条接业务) → 金句收口)写 1800-2600 字口播正文。
人设植入 + 80/20 业务植入严格按 Step 3 执行。
{f"本次只写这一版: {variant.get('mode_label')}。{variant_instruction}" if variant_instruction else ""}

直接输出正文,不要任何前言:"""

    route_key = variant.get("route_key") or "hotrewrite.write"
    primary_error = ""
    try:
        ai = get_ai_client(route_key=route_key)
        write_r = ai.chat(write_prompt, system=system, deep=False, temperature=0.85, max_tokens=3800)
        used_route_key = route_key
        fallback_used = False
    except Exception as exc:
        if route_key == "hotrewrite.write.fast":
            raise
        primary_error = f"{type(exc).__name__}: {exc}"
        ai = get_ai_client(route_key="hotrewrite.write.fast")
        write_r = ai.chat(write_prompt, system=system, deep=False, temperature=0.82, max_tokens=3800)
        used_route_key = "hotrewrite.write.fast"
        fallback_used = True
    content = _clean_script_content(write_r.text)

    # D-088 同款 fail-fast: content 空就不能进自检, 防 LLM 在空字符串上 hallucinate 通过.
    # (客户端 D-088 已加空 content + token>0 transient 重试 1 次, 这里兜底持续故障.)
    if not content:
        raise RuntimeError(
            f"热点改写 LLM 返空内容 (write_tokens={write_r.total_tokens}). "
            f"上游可能 max_tokens 全烧 thinking 没出 text block. 请重试一次."
        )

    # 六维自检 + 一票否决
    check_system = f"""你在执行《热点文案改写V2》skill 的 Step 5 · 六维质检。
基于下面 skill 完整方法论(看 Step 5)对文案做质检。

===== skill 完整方法论 =====
{skill['skill_md']}
"""
    check_prompt = f"""对下面热点口播文案做六维质检 + 一票否决项检查,严格 JSON:

{{
  "six_dimensions": {{
    "开场抓取力": 18,
    "结构推进力": 18,
    "人设可信度": 18,
    "业务植入丝滑度": 17,
    "听感与可读性": 18,
    "风险与边界": 18
  }},
  "one_veto": {{
    "triggered": false,
    "items": ["若触发,列出触发项:散播焦虑/虚构事实/夸张表述/缺乏真诚感"]
  }},
  "pass": true,
  "summary": "一句话总评"
}}

判断规则:
- 每维满分 20,总分需 ≥ 105 且单项 ≥ 16
- 一票否决任一触发 → triggered: true
- 总分<105 或 单项<16 或 触发否决 → pass: false

文案正文:
---
{content}
---"""
    check_ai = get_ai_client(route_key="hotrewrite.self-check")
    check_r = check_ai.chat(check_prompt, system=check_system, deep=False, temperature=0.2, max_tokens=1500)
    self_check = _extract_json(check_r.text, "object") or {
        "pass": False, "summary": "自检解析失败,请人工审阅",
    }

    word_count = len(re.sub(r"[#*_`>\-\[\]()\s]", "", content))
    return {
        "content": content,
        "word_count": word_count,
        "self_check": self_check,
        "variant_id": variant.get("variant_id"),
        "mode_label": variant.get("mode_label") or "",
        "tokens": {
            "write": write_r.total_tokens,
            "check": check_r.total_tokens,
        },
        "route_key": used_route_key,
        "fallback_used": fallback_used,
        "primary_error": primary_error,
    }


def write_script_batch(
    hotspot: str,
    breakdown: dict[str, Any],
    angle: dict[str, Any],
    modes: dict[str, Any] | None = None,
    ctx: tasks_service.TaskContext | None = None,
) -> dict[str, Any]:
    """按前端勾选模式一次任务生成 2/4 个版本, 返回 versions[]."""
    variants = build_write_variants(modes)
    versions: list[dict[str, Any]] = []
    total = len(variants)
    for idx, spec in enumerate(variants, start=1):
        if ctx:
            pct = 15 + int((((idx - 1) * 2) / max(1, total * 2)) * 75)
            ctx.update_progress(f"正在写第 {idx}/{total} 版 · {spec.get('mode_label')}", pct=pct)
        versions.append(write_script(hotspot, breakdown, angle, variant=spec))
        if ctx:
            pct = 15 + int((((idx * 2) - 1) / max(1, total * 2)) * 75)
            ctx.update_progress(f"已完成第 {idx}/{total} 版", pct=pct)
    first = versions[0] if versions else write_script(hotspot, breakdown, angle)
    return {
        "content": first.get("content", ""),
        "word_count": first.get("word_count", 0),
        "self_check": first.get("self_check", {}),
        "tokens": {
            "write": sum((v.get("tokens") or {}).get("write", 0) for v in versions),
            "check": sum((v.get("tokens") or {}).get("check", 0) for v in versions),
        },
        "versions": versions,
        "version_count": len(versions),
        "fallback_count": sum(1 for v in versions if v.get("fallback_used")),
    }


# ─── 异步 (D-037b5) ─────────────────────────────────────

def write_script_async(
    hotspot: str,
    breakdown: dict[str, Any],
    angle: dict[str, Any],
    modes: dict[str, Any] | None = None,
    **kwargs,
) -> str:
    """异步触发 write_script_batch, 立即返 task_id. 真跑 2/4 版 (write + self-check 多次 AI)."""
    angle_label = (angle or {}).get("label") or (angle or {}).get("angle_id") or ""
    version_count = len(build_write_variants(modes))
    return tasks_service.run_async(
        kind="hotrewrite.write",
        label=f"热点改写 · {angle_label}" if angle_label else "热点改写",
        ns="hotrewrite",
        page_id="hotrewrite",
        step="write",
        payload={"hotspot_preview": hotspot[:100], "angle_label": angle_label, "version_count": version_count},
        estimated_seconds=max(120, 90 * version_count),
        progress_text=f"小华写 {version_count} 版口播文案 + 自检...",
        sync_fn_with_ctx=lambda ctx: write_script_batch(hotspot, breakdown, angle, modes, ctx=ctx),
    )
