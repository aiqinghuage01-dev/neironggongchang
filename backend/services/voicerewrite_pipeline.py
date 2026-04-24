"""录音文案改写 skill 的 pipeline — 3 步:提骨架+2角度 → 选角度 → 写稿+自检。

Skill 源: ~/Desktop/skills/录音文案改写/
  SKILL.md (5333 字)
  references/rewrite-checklist.md (6 条自检清单)
  references/sample_*.txt (示例,不注入)

核心约束(SKILL.md 里强调):
- 观点不变、口吻不丢、经历保留、结构更强、精简克制
- 默认只产出一条完整文案(不拆分)
- 黄金三秒 10-35 字 · 反差/结果/态度句
"""
from __future__ import annotations

import json
import re
from typing import Any

from backend.services import skill_loader
from shortvideo.ai import get_ai_client

SKILL_SLUG = "录音文案改写"


def _extract_json(text: str, wrap: str = "object") -> Any:
    pat = r"\[[\s\S]*\]" if wrap == "array" else r"\{[\s\S]*\}"
    m = re.search(pat, text)
    if not m:
        return None
    try:
        return json.loads(m.group(0))
    except Exception:
        return None


# ─── Step 1 · 提骨架 + 最多 2 个切入角度 ────────────────

def analyze_recording(transcript: str) -> dict[str, Any]:
    """基于录音转写文本,提骨架(核心观点/经历/洞察) + 最多 2 个切入角度。"""
    skill = skill_loader.load_skill(SKILL_SLUG)
    checklist = skill["references"].get("rewrite-checklist", "")
    system = f"""你在执行《录音文案改写》skill 的 Step 1 · 提骨架 + 给切入角度。

===== skill 完整方法论 =====
{skill['skill_md']}

===== 自检清单 =====
{checklist}
"""

    prompt = f"""录音转写文本:
---
{transcript.strip()}
---

按 Step 1 要求,完整读完录音,标出 5 类信息,然后提炼出你认为最打动人的 1 个核心观点,
基于你的深度分析给出**最多 2 个**切入角度(不是罗列所有可能,要精选)。

严格 JSON 对象,不加前言:

{{
  "skeleton": {{
    "core_view": "你认为用户真正想表达的核心观点(一句话)",
    "key_experiences": ["关键经历 1", "关键经历 2"],
    "insights": ["行业判断/洞察 1", "洞察 2"],
    "weak_to_delete": ["纯重复段", "销售话术", ...],
    "tone_anchors": ["用户常用句式/标志性表达 1", "..."]
  }},
  "angles": [
    {{"label": "A. 角度标题", "why": "为什么这角度最打动人", "opening_draft": "黄金三秒开场草稿(10-35字)"}},
    {{"label": "B. 角度标题", "why": "...", "opening_draft": "..."}}
  ]
}}

注意: angles 最多 2 个,不要给 3 个以上。"""
    ai = get_ai_client(route_key="voicerewrite.analyze")
    r = ai.chat(prompt, system=system, deep=False, temperature=0.7, max_tokens=2500)
    obj = _extract_json(r.text, "object") or {}
    return {
        "skeleton": obj.get("skeleton", {}),
        "angles": [
            {
                "label": (a.get("label") or "").strip(),
                "why": (a.get("why") or "").strip(),
                "opening_draft": (a.get("opening_draft") or "").strip(),
            }
            for a in (obj.get("angles") or [])
        ][:2],
        "raw_tokens": r.total_tokens,
    }


# ─── Step 2-6 · 写正文 + 改写说明 + 自检 ─────────────────

def write_script(transcript: str, skeleton: dict[str, Any], angle: dict[str, Any]) -> dict[str, Any]:
    """基于骨架和选定角度,按 Step 3-6 写正文 + 改写说明 + 自检清单。"""
    skill = skill_loader.load_skill(SKILL_SLUG)
    checklist = skill["references"].get("rewrite-checklist", "")
    system = f"""你在执行《录音文案改写》skill 的 Step 3-6 · 轻改写 + 自检。
严格按下面 skill 方法论执行:观点不变、口吻不丢、经历保留、只删无效重复。
严禁把录音改成广告语,严禁大段删除用户的经历和故事。

===== skill 完整方法论 =====
{skill['skill_md']}

===== 自检清单 =====
{checklist}
"""

    write_prompt = f"""【用户录音转写】
---
{transcript.strip()}
---

【已提骨架】
- 核心观点: {skeleton.get('core_view', '')}
- 关键经历: {'; '.join(skeleton.get('key_experiences', []))}
- 行业洞察: {'; '.join(skeleton.get('insights', []))}
- 可删弱信息: {'; '.join(skeleton.get('weak_to_delete', []))}
- 语气锚点: {'; '.join(skeleton.get('tone_anchors', []))}

【用户选定切入角度】
{angle.get('label', '')}
- 为什么这角度: {angle.get('why', '')}
- 黄金三秒草稿: {angle.get('opening_draft', '')}

按 Step 3-5 执行轻改写(黄金三秒 + 轻量重排 + 最小删减),
然后按 Step 6 做自检。

严格 JSON,不加前言:
{{
  "script": "可直接读稿的完整文案(保留口吻 · 观点不变 · 经历保留)",
  "word_count": 整数字数,
  "notes": [
    "改写说明 1(保留了什么 / 删了什么 / 为什么)",
    "改写说明 2",
    "..."
  ],
  "self_check": {{
    "core_view_match": true,
    "experiences_kept": true,
    "sounds_genuine": true,
    "tone_preserved": true,
    "golden_3s_strong": true,
    "no_over_trim": true,
    "deep_enough": true,
    "overall_pass": true,
    "summary": "一句话总评"
  }}
}}"""

    ai = get_ai_client(route_key="voicerewrite.write")
    r = ai.chat(write_prompt, system=system, deep=False, temperature=0.7, max_tokens=5000)
    obj = _extract_json(r.text, "object") or {}

    content = (obj.get("script") or "").strip()
    word_count = obj.get("word_count") or len(re.sub(r"\s+", "", content))
    return {
        "content": content,
        "word_count": int(word_count) if isinstance(word_count, (int, str)) and str(word_count).isdigit() else len(content),
        "notes": obj.get("notes") or [],
        "self_check": obj.get("self_check") or {"overall_pass": False, "summary": "自检解析失败"},
        "tokens": {"total": r.total_tokens},
    }
