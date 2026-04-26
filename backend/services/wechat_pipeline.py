"""公众号文章 skill 的 5 Phase 流程编排 — Phase 1-2(纯 AI 生成部分)。

Phase 2.5 (段间配图) / 3 (HTML) / 4 (封面) / 5 (推送) 调 skill 的 scripts,
见 `wechat_scripts.py`(下一个 commit)。

Skill 源:  ~/Desktop/skills/公众号文章/
  references/
    who-is-qinghuage.md      清华哥完整人设(写作的灵魂)
    style-bible.md            V1 tone + 六原则 + 六维评分 + 一票否决
    writing-methodology.md    7 步骨架 + 公众号适配规则
    visual-design-v2.md       V2 视觉(本 pipeline 用 V3 Clean,仅参考)

本模块只管 "AI 生成什么",不管 "怎么排版/推送"。
"""
from __future__ import annotations

import json
import re
from typing import Any

from backend.services import skill_loader
from shortvideo.ai import get_ai_client

SKILL_SLUG = "公众号文章"


def _extract_json(text: str, wrap: str = "array") -> Any:
    """从 LLM 返回文本里抠出 JSON 数组或对象。"""
    if wrap == "array":
        m = re.search(r"\[[\s\S]*\]", text)
    else:
        m = re.search(r"\{[\s\S]*\}", text)
    if not m:
        return None
    try:
        return json.loads(m.group(0))
    except Exception:
        return None


# ─── Phase 1.5 · 标题 2-3 个候选 ──────────────────────────────

def gen_titles(topic: str, n: int = 3) -> list[dict[str, str]]:
    """给一个选题,出 n 个候选标题 + 每个标题的 angle/模板类型。"""
    skill = skill_loader.load_skill(SKILL_SLUG)
    persona = skill["references"].get("who-is-qinghuage", "")
    style = skill["references"].get("style-bible", "")

    system = f"""你在执行公众号文章 skill 的 Phase 1 · 标题工程。

===== 清华哥完整人设 =====
{persona}

===== 风格圣经(重点看 Section 2 标题工程) =====
{style}
"""

    prompt = f"""选题: {topic.strip()}

基于风格圣经 Section 2 的标题规则,出 {n} 个候选标题。要求:
- 字数 15-25 字
- 必须含 "情绪触发词 + 身份锚点"(见词库)
- 可选加悬念缺口
- 不触碰标题禁忌(震惊体/空泛大词/产品名价格/英文缩写)
- {n} 个标题用不同模板(结论前置/反常识/数字清单/故事悬念/热点借势/对比冲突)

严格 JSON 数组,不加任何前言解释:
[
  {{"title": "标题正文", "template": "结论前置型", "why": "为什么这标题能抓中年老板"}},
  ...
]"""
    ai = get_ai_client(route_key="wechat.titles")
    # skill 自带完整人设,关闭关卡层的 Obsidian persona 以免双注入
    r = ai.chat(prompt, system=system, deep=False, temperature=0.9, max_tokens=1500)
    arr = _extract_json(r.text, "array") or []
    return [
        {
            "title": (x.get("title") or "").strip(),
            "template": (x.get("template") or "").strip(),
            "why": (x.get("why") or "").strip(),
        }
        for x in arr
        if isinstance(x, dict) and x.get("title")
    ][:n]


# ─── Phase 2 · 简明大纲(5-7 行,供清华哥确认) ──────────────────

def gen_outline(topic: str, title: str) -> dict[str, Any]:
    """基于选题+定下的标题,出 5-7 行简明大纲让清华哥确认再动笔。"""
    skill = skill_loader.load_skill(SKILL_SLUG)
    persona = skill["references"].get("who-is-qinghuage", "")
    methodology = skill["references"].get("writing-methodology", "")

    system = f"""你在执行公众号文章 skill 的 Phase 2 · 大纲确认。

===== 清华哥完整人设 =====
{persona}

===== 写作方法论(重点看 7 步骨架) =====
{methodology}
"""

    prompt = f"""选题: {topic.strip()}
定稿标题: {title.strip()}

基于方法论的 7 步骨架,出一份 5-7 行的简明大纲,让清华哥快速确认方向。格式:

严格 JSON 对象,不加前言:
{{
  "opening": "开场切入角度(用什么场景/判断开头)",
  "core_points": ["中段核心论点 1", "中段核心论点 2", "中段核心论点 3"],
  "business_bridge": "在哪一段自然桥接业务,用什么方式",
  "closing": "结尾落点(金句方向)",
  "estimated_words": 2500
}}"""
    ai = get_ai_client(route_key="wechat.outline")
    r = ai.chat(prompt, system=system, deep=False, temperature=0.7, max_tokens=1200)
    obj = _extract_json(r.text, "object") or {}
    return {
        "opening": obj.get("opening", "").strip(),
        "core_points": [p for p in (obj.get("core_points") or []) if isinstance(p, str)],
        "business_bridge": obj.get("business_bridge", "").strip(),
        "closing": obj.get("closing", "").strip(),
        "estimated_words": int(obj.get("estimated_words") or 2500),
        "raw_tokens": r.total_tokens,
    }


# ─── Phase 2 · 长文 2000-3000 字 + 三层自检 ────────────────────

def write_article(topic: str, title: str, outline: dict[str, Any]) -> dict[str, Any]:
    """基于选题+标题+确认的大纲,写 2000-3000 字长文 + 输出三层自检报告。"""
    skill = skill_loader.load_skill(SKILL_SLUG)
    persona = skill["references"].get("who-is-qinghuage", "")
    methodology = skill["references"].get("writing-methodology", "")
    style = skill["references"].get("style-bible", "")

    system = f"""你在执行公众号文章 skill 的 Phase 2 · 写作主体。
身份由下面人设定义,**每一句话都要像清华哥本人说的**。

===== 清华哥完整人设(写作的灵魂) =====
{persona}

===== 写作方法论(7 步骨架 + 公众号适配规则) =====
{methodology}

===== 风格圣经(V1 tone + 六原则 + 质量标准) =====
{style}

===== 写作硬规矩 =====
- 字数 2000-3000
- 7 步骨架必须完整
- 人设预埋链在前 40% 完成
- 业务植入 6 步序列,占比 < 20%
- 每段 ≤ 4 行,每 3-5 段一个视觉断点(划线 / 金句 / callout 占位)
- 禁用 markdown 符号和 emoji 作段首(留给后续排版)
- 输出纯 Markdown 正文(从 `# 标题` 开始)
"""

    outline_md = f"""
**开场**: {outline.get('opening', '')}
**中段**:
{chr(10).join(f'- {p}' for p in outline.get('core_points', []))}
**业务桥接**: {outline.get('business_bridge', '')}
**结尾**: {outline.get('closing', '')}
"""

    write_prompt = f"""选题: {topic.strip()}
标题: {title.strip()}
大纲(清华哥已确认):
{outline_md}

直接输出 Markdown 长文(以 `# {title}` 开头,2000-3000 字)。不要任何前言、解释、说明。"""

    ai = get_ai_client(route_key="wechat.write")
    write_r = ai.chat(write_prompt, system=system, deep=False, temperature=0.85, max_tokens=6000)
    content = (write_r.text or "").strip()

    # 三层自检 — 让 AI 对自己写的文章逐层打分
    check_system = f"""你在执行公众号文章 skill 的 Phase 2 末尾 · 三层自检。
基于下面的风格圣经,对给定文章进行检查。

===== 风格圣经 =====
{style}
"""
    check_prompt = f"""下面是刚写好的文章(Markdown)。按风格圣经做三层自检,严格 JSON 输出:

{{
  "six_principles": [
    {{"name": "先定性再解释", "pass": true, "issue": ""}},
    {{"name": "不此地无银", "pass": true, "issue": ""}},
    {{"name": "给理由建信任", "pass": true, "issue": ""}},
    {{"name": "口语化但精准", "pass": true, "issue": ""}},
    {{"name": "真实细节建画面", "pass": true, "issue": ""}},
    {{"name": "主动性叙事", "pass": true, "issue": ""}}
  ],
  "six_dimensions": {{
    "开场抓取力": 18,
    "结构推进力": 18,
    "人设可信度": 18,
    "业务植入丝滑度": 17,
    "听感与可读性": 18,
    "风险与边界控制": 18
  }},
  "one_veto": {{"triggered": false, "items": []}},
  "pass": true,
  "summary": "一句话总评"
}}

判断规则:
- six_principles 每条 issue 写清哪段不过关(如"第3段:否定过多"),过关则留空
- six_dimensions 每维满分 20,要求总 ≥ 105 且单项 ≥ 16
- one_veto 任一触发(恐吓/虚构/夸大/强推销)= triggered: true
- 只要有一票否决触发 或 总分<105 或 单项<16 → pass: false

文章正文:
---
{content}
---"""
    check_ai = get_ai_client(route_key="wechat.self-check")
    check_r = check_ai.chat(check_prompt, system=check_system, deep=False, temperature=0.2, max_tokens=2000)
    self_check = _extract_json(check_r.text, "object") or {
        "pass": False,
        "summary": "自检解析失败,请人工审阅",
        "raw": check_r.text[:500],
    }

    word_count = len(re.sub(r"[#*_`>\-\[\]()\s]", "", content))
    return {
        "title": title,
        "content": content,
        "word_count": word_count,
        "self_check": self_check,
        "tokens": {
            "write": write_r.total_tokens,
            "check": check_r.total_tokens,
        },
    }


# ─── 局部重写 (D-036) — 只改选中段,其他不动 ──────────────

def rewrite_section(full_article: str, selected: str, instruction: str = "") -> dict[str, Any]:
    """选中一段 → 调 AI 用 instruction 重写,只换那段,其余原样保留。

    full_article: 完整 markdown 正文(给 AI 上下文)
    selected: 选中的文字(必须是 full_article 的子串)
    instruction: 用户的改写指令(如"更犀利"/"加学员故事"/"压短到 200 字")
    """
    skill = skill_loader.load_skill(SKILL_SLUG)
    style = skill["references"].get("style-bible", "")
    persona = skill["references"].get("who-is-qinghuage", "")[:5000]

    system = f"""你在执行公众号文章 skill 的局部重写。
**只改用户选中的那段,其他段一概不动**。

===== 风格圣经(Section 6 六原则必守) =====
{style}

===== 清华哥人设(节选) =====
{persona}

硬规则:
- 输出**只是选中段的新版**,不是完整文章
- 字数控制: 默认接近原选段字数 ± 20%(除非用户明确要求"压短"/"拉长")
- 保持上下文衔接(第一句衔接前文最后一句,末句衔接后文第一句)
- 不要 markdown 符号 / emoji 段首
- 直接输出新段落,不要前言不要解释
"""

    prompt = f"""完整文章(给上下文,不要全部重写):
---
{full_article.strip()}
---

【需要重写的段落】(原长 {len(selected)} 字):
---
{selected.strip()}
---

【用户改写指令】
{instruction.strip() or "更犀利,保留核心观点,口吻不变"}

直接输出重写后的新段落:"""
    ai = get_ai_client(route_key="wechat.rewrite-section")
    r = ai.chat(prompt, system=system, deep=False, temperature=0.85, max_tokens=2500)
    new_text = (r.text or "").strip()

    # 拼接: 把新段替换到 full_article 里
    new_full = full_article.replace(selected, new_text, 1) if selected in full_article else None

    return {
        "new_section": new_text,
        "new_full": new_full,  # null = 没找到原文中的 selected,需要前端用 fallback
        "old_length": len(selected),
        "new_length": len(new_text),
        "tokens": r.total_tokens,
    }


# ─── 异步 (D-037b6) ─────────────────────────────────────

def write_article_async(topic: str, title: str, outline: dict) -> str:
    """异步触发 write_article, 立即返 task_id. 真跑 30-60s (Opus 长文 + DeepSeek 自检)."""
    return tasks_service.run_async(
        kind="wechat.write",
        label=f"公众号长文 · {(title or topic)[:40]}",
        ns="wechat",
        page_id="wechat",
        step="write",
        payload={"topic_preview": topic[:100], "title": title, "outline_keys": list((outline or {}).keys())},
        estimated_seconds=50,
        progress_text="AI 写长文 (2000-3000 字) + 三层自检...",
        sync_fn=lambda: write_article(topic, title, outline),
    )
