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
    obj = _extract_json(r.text, "object") or {}
    return {
        "breakdown": obj.get("breakdown", {}),
        "angles": [
            {
                "label": (a.get("label") or "").strip(),
                "audience": (a.get("audience") or "").strip(),
                "draft_hook": (a.get("draft_hook") or "").strip(),
            }
            for a in (obj.get("angles") or [])
        ][:3],
        "raw_tokens": r.total_tokens,
    }


# ─── Step 2-5 · 写正文 1800-2600 字 + 六维自检 ────────────

def write_script(hotspot: str, breakdown: dict[str, Any], angle: dict[str, Any]) -> dict[str, Any]:
    """基于拆解和选定角度,写 1800-2600 字口播正文 + 六维自检。"""
    skill = skill_loader.load_skill(SKILL_SLUG)
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

直接输出正文,不要任何前言:"""

    ai = get_ai_client(route_key="hotrewrite.write")
    write_r = ai.chat(write_prompt, system=system, deep=False, temperature=0.85, max_tokens=5000)
    content = (write_r.text or "").strip()

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
        "tokens": {
            "write": write_r.total_tokens,
            "check": check_r.total_tokens,
        },
    }
