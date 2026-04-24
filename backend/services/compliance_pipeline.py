"""违禁违规审查 skill pipeline (D-026 · 单 step: 审查 + 必出 2 版改写)。

Skill 源: ~/Desktop/skills/违禁违规审查-学员版/
  SKILL.md · 207 行,工作流程 6 步
  references/通用违禁词库.md · 119 行
  references/敏感行业词库.md · 191 行

跟其他 skill 不同 — 不是"分析 → 选角度 → 写作"3 步,
而是单 step: 输入文案 + 行业 → 一次性出审核报告 + 保守版 + 营销版
"""
from __future__ import annotations

import json
import re
from typing import Any

from backend.services import skill_loader
from shortvideo.ai import get_ai_client

SKILL_SLUG = "违禁违规审查-学员版"


def _extract_json(text: str, wrap: str = "object") -> Any:
    pat = r"\[[\s\S]*\]" if wrap == "array" else r"\{[\s\S]*\}"
    m = re.search(pat, text)
    if not m:
        return None
    try:
        return json.loads(m.group(0))
    except Exception:
        return None


# ─── 单 step · 审查 + 必出 2 版改写 ────────────────────────

def check_compliance(text: str, industry: str = "通用") -> dict[str, Any]:
    """审查 + 改写 · skill 硬规则: 必须输出 2 版(保守 + 营销)不是可选。

    industry: 用户行业 · 自动匹配敏感行业词库
      大健康/养生/医疗 → §1 医疗词
      美容/美业 → §2 化妆品
      教育/培训 → §3 教育
      金融/投资/知识付费 → §4 金融
      医美/整形 → §1+§2+§5 医美超高危
      其他 → 只走通用词库
    """
    skill = skill_loader.load_skill(SKILL_SLUG)
    refs = skill["references"]
    system = f"""你在执行《违禁违规审查》skill。硬规则: **必须**输出 2 版改写,不只是审核报告。

===== skill 方法论(SKILL.md) =====
{skill['skill_md']}

===== 通用违禁词库(所有行业必查) =====
{refs.get('通用违禁词库', '')}

===== 敏感行业词库 =====
{refs.get('敏感行业词库', '')}
"""

    prompt = f"""待审查文案:
---
{text.strip()}
---

用户行业: {industry}

按 skill Step 2-5 执行:
1. 通用审查(所有行业必做,对照通用违禁词库 8 大类)
2. 如果是敏感行业,加查对应行业特殊词库
3. 按高/中/低危分级输出 violations
4. **必须**输出 2 版改写:
   - 版本 A 保守版: 高+中+低危全改,100% 合规,牺牲营销效果
   - 版本 B 营销版: 高危必改,中危酌情,保留营销力

严格 JSON,不加前言:
{{
  "industry": "{industry}",
  "scan_scope": "通用审查 / 通用+敏感行业(行业名)",
  "violations": [
    {{"level": "high", "original": "原文节选", "type": "极限词/医疗功效/...", "reason": "一句话说为什么违规", "fix": "合规替换建议"}},
    {{"level": "medium", "original": "...", "type": "...", "reason": "...", "fix": "..."}},
    {{"level": "low", "original": "...", "type": "...", "reason": "...", "fix": "..."}}
  ],
  "stats": {{"high": 2, "medium": 3, "low": 1, "total": 6}},
  "version_a": {{
    "content": "保守版完整文案",
    "word_count": 280,
    "compliance": 95,
    "description": "100% 合规 · 适合: 敏感行业/新号/怕封号"
  }},
  "version_b": {{
    "content": "营销版完整文案",
    "word_count": 310,
    "compliance": 85,
    "kept_marketing": ["保留的营销点 1", "保留的营销点 2"],
    "description": "合规 + 保留吸引力 · 适合: 有权重的号/要效果"
  }},
  "summary": "一句话总评 · N 处违规,建议用哪版"
}}"""
    ai = get_ai_client(route_key="compliance.check")
    r = ai.chat(prompt, system=system, deep=False, temperature=0.3, max_tokens=6000)
    obj = _extract_json(r.text, "object") or {}

    # 兜底: 如果 AI 没返回 violations,构造空
    obj.setdefault("violations", [])
    obj.setdefault("stats", {"high": 0, "medium": 0, "low": 0, "total": 0})
    obj.setdefault("version_a", {"content": "", "compliance": 0})
    obj.setdefault("version_b", {"content": "", "compliance": 0})

    return {
        **obj,
        "tokens": {"total": r.total_tokens},
    }


# ─── 兼容 add_skill.py 骨架命名 ───────────────────────────

def analyze_input(input_text: str) -> dict[str, Any]:
    """骨架别名 · 前端如果按模板调 analyze/write 两步,这里直接一次出全部。"""
    return check_compliance(input_text, industry="通用")


def write_output(input_text: str, analysis: dict, angle: dict) -> dict[str, Any]:
    """骨架别名 · 接到 content 就走 check。industry 从 analysis 取或默认。"""
    industry = (analysis or {}).get("industry") or (angle or {}).get("industry") or "通用"
    return check_compliance(input_text, industry=industry)
