"""爆款改写 skill 的 pipeline — 2 步:爆款基因分析 → 按模式改写出 N 版。

Skill 源: ~/Desktop/skills/爆款改写-学员版/SKILL.md
核心约束 (SKILL.md 严禁项):
- 前 5 秒 (前 2-3 句) 一字不改 — 原爆款验证过的钩子
- 不改变核心观点和立场, 换说法不换意思
- 纯改写不植入任何业务内容
- 业务钩子转折必须自然, 不能硬接广告
- 改写不超出原文 30% 长度
- 严禁 AI 味表达 ("在当今社会" 等)

模式映射:
  pure     → V1 换皮版 + V2 狠劲版
  business → V3 翻转版 + V4 圈人版 (需 industry + target_action)
  all      → V1 + V2 + V3 + V4 (业务版需 profile)
"""
from __future__ import annotations

import json
import re
import time
from typing import Any

from backend.services import skill_loader
from backend.services import tasks as tasks_service
from shortvideo.ai import get_ai_client

SKILL_SLUG = "爆款改写-学员版"


def _extract_json(text: str, wrap: str = "object") -> Any:
    pat = r"\[[\s\S]*\]" if wrap == "array" else r"\{[\s\S]*\}"
    m = re.search(pat, text)
    if not m:
        return None
    try:
        return json.loads(m.group(0))
    except Exception:
        return None


# ─── Step 1 · 爆款基因分析 ──────────────────────────────

def analyze_baokuan(text: str) -> dict[str, Any]:
    """读原文, 输出爆款基因 3 句话: why_hot / emotion_hook / structure。"""
    skill = skill_loader.load_skill(SKILL_SLUG)
    system = f"""你在执行《爆款改写》skill 的 Step 1 · 爆款基因分析。
只做分析, 不改写, 不输出文案正文。

===== skill 完整方法论 =====
{skill['skill_md']}
"""
    prompt = f"""原爆款文案:
---
{text.strip()}
---

按 SKILL.md Step 1 要求, 做 3 句话以内的爆款基因分析。
严格 JSON 对象, 不加前言:

{{
  "why_hot": "为什么火 (一句话, 例: 击中了老板被甲方压价的共鸣)",
  "emotion_hook": "情绪钩子 (一句话, 例: 开头用反常识数字制造悬念)",
  "structure": "结构节奏 (一句话, 例: 先铺痛点 → 翻转 → 给解法 → 收口)"
}}"""
    ai = get_ai_client(route_key="baokuan.analyze")
    r = ai.chat(prompt, system=system, deep=False, temperature=0.6, max_tokens=800)
    obj = _extract_json(r.text, "object") or {}
    return {
        "dna": {
            "why_hot": (obj.get("why_hot") or "").strip(),
            "emotion_hook": (obj.get("emotion_hook") or "").strip(),
            "structure": (obj.get("structure") or "").strip(),
        },
        "raw_tokens": r.total_tokens,
    }


# ─── Step 2 · 按模式改写出 N 版 ─────────────────────────

VERSION_DEFS: dict[str, dict[str, str]] = {
    "V1": {
        "label": "换皮版",
        "rule": (
            "前 5 秒 (前 2-3 句) 一字不改, 从第 4 句起做彻底同义词替换. "
            "保持原文长度 (浮动 ≤ 10%) 和段落结构, 意思完全一样, 查重率归零."
        ),
    },
    "V2": {
        "label": "狠劲版",
        "rule": (
            "前 5 秒不改. 加强情绪颗粒度: 删啰嗦连接词 (然后/接下来/所以说), "
            "换短促有力表达, 加口语情绪词 (离谱/搞毛/有毛病/太扯了). "
            "比原文稍短 OK, 但核心信息一个不少."
        ),
    },
    "V3": {
        "label": "翻转版",
        "rule": (
            "主体用全新语言重写原文故事/观点, 严格保留原文起承转合和情绪节奏. "
            "结尾在情绪最高点自然转折到用户业务 ('你看, 其实这个道理放到 XX 也一样...'), "
            "结尾用用户画像里的转化动作做行动引导."
        ),
        "needs_profile": "y",
    },
    "V4": {
        "label": "圈人版",
        "rule": (
            "开头加一句极短的圈人语 ('做 XX 老板听好了' / 'XX 行业的注意了'). "
            "主体用倒叙或换说法重述原文核心观点, 保留原文节奏感和劲头. "
            "结尾加极短行动指令, 用用户画像里的转化动作."
        ),
        "needs_profile": "y",
    },
}


def _mode_versions(mode: str) -> list[str]:
    if mode == "pure":
        return ["V1", "V2"]
    if mode == "business":
        return ["V3", "V4"]
    if mode == "all":
        return ["V1", "V2", "V3", "V4"]
    return ["V1", "V2"]


def rewrite(
    text: str,
    mode: str = "pure",
    industry: str = "",
    target_action: str = "",
    dna: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """按模式生成对应版本数组。

    mode: "pure" / "business" / "all"
    business 和 all 需要 industry + target_action (画像)
    返回 {versions: [{key, label, content}, ...], tokens}
    """
    versions_to_gen = _mode_versions(mode)
    needs_profile = any(VERSION_DEFS[v].get("needs_profile") for v in versions_to_gen)
    if needs_profile and (not industry.strip() or not target_action.strip()):
        return {
            "versions": [],
            "error": "业务钩子模式需要填行业和转化动作 (例: 餐饮老板 + 加微信)",
            "tokens": {"total": 0},
        }

    skill = skill_loader.load_skill(SKILL_SLUG)
    dna = dna or {}
    profile_block = ""
    if needs_profile:
        profile_block = f"""
【用户画像 (业务钩子版必用)】
- 行业: {industry.strip()}
- 转化动作: {target_action.strip()}
"""

    rules_block = "\n".join(
        f"### {v} · {VERSION_DEFS[v]['label']}\n{VERSION_DEFS[v]['rule']}"
        for v in versions_to_gen
    )

    system = f"""你在执行《爆款改写》skill 的 Step 3 · 改写。
严格按下面 skill 方法论执行, 严禁项一条不能违反。

===== skill 完整方法论 =====
{skill['skill_md']}

===== 本轮要出的版本 =====
{rules_block}

===== 硬规矩 =====
- 改写不超原文 30% 长度
- 严禁 AI 味表达 (在当今社会/值得注意的是/随着时代发展)
- 严禁编造原文没有的数据/案例/故事
- 严禁前 5 秒 (前 2-3 句) 改动
- 输出纯文案正文 (可念稿那种), 不要标题/前言/markdown 符号"""

    dna_block = ""
    if dna.get("why_hot") or dna.get("emotion_hook") or dna.get("structure"):
        dna_block = f"""
【已分析的爆款基因 (必须保住)】
- 为什么火: {dna.get('why_hot', '')}
- 情绪钩子: {dna.get('emotion_hook', '')}
- 结构节奏: {dna.get('structure', '')}
"""

    example_items = ",\n    ".join(
        '{"key": "%s", "label": "%s", "content": "完整文案 (纯文本可念稿)"}' % (v, VERSION_DEFS[v]["label"])
        for v in versions_to_gen
    )
    keys_arr = ", ".join(f'"{v}"' for v in versions_to_gen)
    prompt = f"""【原爆款文案】
---
{text.strip()}
---
{dna_block}{profile_block}
按【本轮要出的版本】里每个版本的规则改写。
严格 JSON, 不加前言。每个版本的 content 是完整可念稿的纯文案 (不要 markdown 符号):

{{
  "versions": [
    {example_items}
  ]
}}

注意: versions 数组必须正好包含这些 key, 顺序: {keys_arr}"""

    ai = get_ai_client(route_key="baokuan.rewrite")
    r = ai.chat(prompt, system=system, deep=False, temperature=0.85, max_tokens=6000)
    obj = _extract_json(r.text, "object") or {}
    raw_versions = obj.get("versions") or []

    # 兜底: 按预期 key 顺序对齐, 缺的填空
    by_key = {(v.get("key") or "").upper(): v for v in raw_versions if isinstance(v, dict)}
    out_versions = []
    for k in versions_to_gen:
        v = by_key.get(k, {})
        content = (v.get("content") or "").strip()
        out_versions.append({
            "key": k,
            "label": VERSION_DEFS[k]["label"],
            "content": content,
            "word_count": len(re.sub(r"\s+", "", content)),
            "gen_id": f"{k}-{int(time.time())}",
        })

    return {
        "versions": out_versions,
        "mode": mode,
        "tokens": {"total": r.total_tokens},
    }


# ─── 异步 (D-037b5) ─────────────────────────────────────

def rewrite_async(
    text: str,
    mode: str = "pure",
    industry: str = "",
    target_action: str = "",
    dna: dict[str, Any] | None = None,
) -> str:
    """异步触发 rewrite, 立即返 task_id. 真跑 30-60s."""
    return tasks_service.run_async(
        kind="baokuan.rewrite",
        label=f"爆款改写 · {mode} · {len(text)}字",
        ns="baokuan",
        page_id="baokuan",
        step="rewrite",
        payload={"text_preview": text[:200], "mode": mode, "text_len": len(text)},
        estimated_seconds=45,
        progress_text="AI 写改写文案 (V1/V2/V3/V4)...",
        sync_fn=lambda: rewrite(text, mode, industry, target_action, dna),
    )
