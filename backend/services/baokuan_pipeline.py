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
from copy import deepcopy
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


def _clean_script_content(text: str) -> str:
    """去掉模型偶发吐出的执行说明/后续操作建议,只保留可念稿正文。"""
    content = (text or "").strip()
    content = re.sub(
        r"\n{1,2}\s*已(?:经)?走(?:完)?(?:技能|skill)[:：][\s\S]*$",
        "",
        content,
        flags=re.IGNORECASE,
    ).strip()
    content = re.sub(
        r"^\s*(?:已(?:经)?走(?:完)?(?:技能|skill)[:：].*?)(?:\n{1,2}|$)",
        "",
        content,
        flags=re.IGNORECASE,
    ).strip()
    content = re.sub(
        r"^\s*(?:以下是(?:正文|文案|口播正文|改写版本)|正文如下)[:：]?\s*(?:\n{1,2}|$)",
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
    content = re.sub(
        r"\n{1,2}\s*(?:prompt|tokens?|api|route|model|provider|submit_id|/Users)\b[\s\S]*$",
        "",
        content,
        flags=re.IGNORECASE,
    ).strip()
    return content


def _count_script_chars(content: str) -> int:
    return len(re.sub(r"[#*_`>\-\[\]()\s]", "", content or ""))


_INTERNAL_DISPLAY_KEY_PARTS = ("token", "route", "model", "provider", "prompt", "submit_id", "api")


def _is_internal_display_key(key: Any) -> bool:
    k = str(key or "").lower()
    return str(key or "").startswith("_") or any(part in k for part in _INTERNAL_DISPLAY_KEY_PARTS)


def sanitize_result_for_display(result: Any) -> Any:
    """清洗 baokuan task 的 result/partial_result, 防内部字段和执行菜单进前端。"""
    def _clean(value: Any) -> Any:
        if isinstance(value, dict):
            out: dict[str, Any] = {}
            for k, v in value.items():
                if _is_internal_display_key(k):
                    continue
                cleaned_v = _clean(v)
                if k == "content" and isinstance(cleaned_v, str):
                    cleaned_v = _clean_script_content(cleaned_v)
                out[k] = cleaned_v
            if isinstance(out.get("content"), str):
                out["word_count"] = _count_script_chars(out["content"])
            return out
        if isinstance(value, list):
            return [_clean(v) for v in value]
        if isinstance(value, str):
            return _clean_script_content(value)
        return value

    return _clean(deepcopy(result))


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
    # D-094: 解析失败 → raise, 不让前端拿到全空 dna 当成功 (UI 显示 3 行空白卡片).
    obj = _extract_json(r.text, "object")
    if obj is None:
        raise RuntimeError(
            f"爆款解析·DNA LLM 输出非 JSON (tokens={r.total_tokens}). "
            f"输出头: {(r.text or '')[:200]!r}"
        )
    why_hot = (obj.get("why_hot") or "").strip()
    emotion_hook = (obj.get("emotion_hook") or "").strip()
    structure = (obj.get("structure") or "").strip()
    if not (why_hot and emotion_hook and structure):
        raise RuntimeError(
            f"爆款解析·DNA 三字段缺一 (why_hot/emotion_hook/structure 必须都非空) "
            f"tokens={r.total_tokens}. 输出头: {(r.text or '')[:200]!r}"
        )
    return {
        "dna": {"why_hot": why_hot, "emotion_hook": emotion_hook, "structure": structure},
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


def _estimated_seconds(mode: str) -> int:
    return 55 * len(_mode_versions(mode))


def _validate_profile(versions_to_gen: list[str], industry: str, target_action: str) -> str | None:
    needs_profile = any(VERSION_DEFS[v].get("needs_profile") for v in versions_to_gen)
    if needs_profile and (not industry.strip() or not target_action.strip()):
        return "业务钩子模式需要填行业和转化动作 (例: 餐饮老板 + 加微信)"
    return None


def _build_system(skill: dict[str, Any], version_key: str) -> str:
    rule = VERSION_DEFS[version_key]["rule"]
    label = VERSION_DEFS[version_key]["label"]
    return f"""你在执行《爆款改写》skill 的 Step 3 · 改写。
严格按下面 skill 方法论执行, 严禁项一条不能违反。

===== skill 完整方法论 =====
{skill['skill_md']}

===== 本轮只写 1 个完整版本 =====
### {version_key} · {label}
{rule}

===== 硬规矩 =====
- 改写不超原文 30% 长度
- 严禁 AI 味表达 (在当今社会/值得注意的是/随着时代发展)
- 严禁编造原文没有的数据/案例/故事
- 严禁前 5 秒 (前 2-3 句) 改动
- 输出纯文案正文 (可念稿那种), 不要标题/前言/markdown 符号"""


def _dna_block(dna: dict[str, Any]) -> str:
    if not (dna.get("why_hot") or dna.get("emotion_hook") or dna.get("structure")):
        return ""
    return f"""
【已分析的爆款基因 (必须保住)】
- 为什么火: {dna.get('why_hot', '')}
- 情绪钩子: {dna.get('emotion_hook', '')}
- 结构节奏: {dna.get('structure', '')}
"""


def _profile_block(version_key: str, industry: str, target_action: str) -> str:
    if not VERSION_DEFS[version_key].get("needs_profile"):
        return ""
    return f"""
【用户画像 (业务钩子版必用)】
- 行业: {industry.strip()}
- 转化动作: {target_action.strip()}
"""


def _write_single_version(
    text: str,
    *,
    version_key: str,
    industry: str,
    target_action: str,
    dna: dict[str, Any],
    skill: dict[str, Any],
) -> dict[str, Any]:
    """写一个完整版本。逐版输出需要拆开调用, 但仍走 baokuan.rewrite 关卡层。"""
    label = VERSION_DEFS[version_key]["label"]
    prompt = f"""【原爆款文案】
---
{text.strip()}
---
{_dna_block(dna)}{_profile_block(version_key, industry, target_action)}
按 {version_key} · {label} 的规则改写。
严格 JSON, 不加前言。content 是完整可念稿的纯文案 (不要 markdown 符号):

{{
  "key": "{version_key}",
  "label": "{label}",
  "content": "完整文案 (纯文本可念稿)"
}}"""

    ai = get_ai_client(route_key="baokuan.rewrite")
    r = ai.chat(prompt, system=_build_system(skill, version_key), deep=False, temperature=0.85, max_tokens=2400)
    obj = _extract_json(r.text, "object")
    if obj is None:
        raise RuntimeError(
            f"爆款改写 {version_key} LLM 输出非 JSON (tokens={r.total_tokens}). 输出头: {(r.text or '')[:200]!r}"
        )
    if isinstance(obj.get("versions"), list):
        by_key = {
            (v.get("key") or "").upper(): v
            for v in obj["versions"]
            if isinstance(v, dict)
        }
        obj = by_key.get(version_key) or (obj["versions"][0] if obj["versions"] else {})
    content = _clean_script_content((obj.get("content") or "").strip())
    if not content:
        raise RuntimeError(
            f"爆款改写 {version_key} LLM 返空 content (tokens={r.total_tokens}). 输出头: {(r.text or '')[:200]!r}"
        )
    return {
        "key": version_key,
        "label": label,
        "content": content,
        "word_count": _count_script_chars(content),
        "gen_id": f"{version_key}-{int(time.time())}",
        "_tokens": r.total_tokens,
    }


def _public_version(version: dict[str, Any], version_index: int) -> dict[str, Any]:
    cleaned = sanitize_result_for_display(version)
    if not isinstance(cleaned, dict):
        cleaned = {}
    key = str(cleaned.get("key") or "").upper()
    return {
        "unit_id": key or f"V{version_index}",
        "key": key or f"V{version_index}",
        "label": cleaned.get("label") or VERSION_DEFS.get(key, {}).get("label") or "",
        "content": cleaned.get("content") or "",
        "word_count": cleaned.get("word_count") or _count_script_chars(cleaned.get("content") or ""),
        "gen_id": cleaned.get("gen_id") or f"{key or version_index}-{int(time.time())}",
        "version_index": version_index,
    }


def _progress_snapshot(
    *,
    versions_to_gen: list[str],
    completed_by_key: dict[str, dict[str, Any]],
    timeline: list[dict[str, Any]],
) -> tuple[dict[str, Any] | None, dict[str, Any]]:
    public_versions = [
        _public_version(completed_by_key[key], idx + 1)
        for idx, key in enumerate(versions_to_gen)
        if key in completed_by_key
    ]
    progress_data = sanitize_result_for_display({
        "completed_versions": len(public_versions),
        "total_versions": len(versions_to_gen),
        "timeline": deepcopy(timeline),
    })
    if not public_versions:
        return None, progress_data
    first = public_versions[0]
    partial = {
        "content": first.get("content", ""),
        "word_count": first.get("word_count", 0),
        "versions": public_versions,
        "units": public_versions,
        "completed_versions": len(public_versions),
        "total_versions": len(versions_to_gen),
    }
    return sanitize_result_for_display(partial), progress_data


def _emit_partial(
    ctx: tasks_service.TaskContext | None,
    *,
    versions_to_gen: list[str],
    completed_by_key: dict[str, dict[str, Any]],
    timeline: list[dict[str, Any]],
    progress_text: str,
    pct: int | None,
) -> None:
    partial, progress_data = _progress_snapshot(
        versions_to_gen=versions_to_gen,
        completed_by_key=completed_by_key,
        timeline=timeline,
    )
    if partial and ctx:
        ctx.update_partial_result(
            partial_result=partial,
            progress_data=progress_data,
            progress_text=progress_text,
            pct=pct,
        )
    elif ctx:
        ctx.update_progress(progress_text, pct=pct)


def rewrite(
    text: str,
    mode: str = "pure",
    industry: str = "",
    target_action: str = "",
    dna: dict[str, Any] | None = None,
    ctx: tasks_service.TaskContext | None = None,
) -> dict[str, Any]:
    """按模式生成对应版本数组。

    mode: "pure" / "business" / "all"
    business 和 all 需要 industry + target_action (画像)
    返回 {versions: [{key, label, content}, ...], tokens}
    """
    versions_to_gen = _mode_versions(mode)
    profile_error = _validate_profile(versions_to_gen, industry, target_action)
    if profile_error:
        return {
            "versions": [],
            "error": profile_error,
            "tokens": {"total": 0},
        }

    skill = skill_loader.load_skill(SKILL_SLUG)
    dna = dna or {}
    completed_by_key: dict[str, dict[str, Any]] = {}
    timeline: list[dict[str, Any]] = []
    tokens_total = 0
    total = len(versions_to_gen)

    for idx, key in enumerate(versions_to_gen):
        if ctx and ctx.is_cancelled():
            break
        version_no = idx + 1
        label = VERSION_DEFS[key]["label"]
        running_text = f"正在写第 {version_no}/{total} 版 · {key} · {label}..."
        timeline.append({
            "at_ts": int(time.time()),
            "text": f"开始写第 {version_no}/{total} 版 · {key} · {label}",
            "completed_versions": len(completed_by_key),
            "total_versions": total,
            "version_index": version_no,
            "unit_id": key,
            "status": "running",
        })
        _emit_partial(
            ctx,
            versions_to_gen=versions_to_gen,
            completed_by_key=completed_by_key,
            timeline=timeline,
            progress_text=running_text,
            pct=18 + int(len(completed_by_key) * 70 / max(1, total)),
        )
        try:
            version = _write_single_version(
                text,
                version_key=key,
                industry=industry,
                target_action=target_action,
                dna=dna,
                skill=skill,
            )
        except Exception:
            timeline[:] = [
                item for item in timeline
                if not (item.get("status") == "running" and item.get("unit_id") == key)
            ]
            timeline.append({
                "at_ts": int(time.time()),
                "text": f"第 {version_no} 版暂时没跑完",
                "completed_versions": len(completed_by_key),
                "total_versions": total,
                "version_index": version_no,
                "unit_id": key,
                "status": "failed",
            })
            _emit_partial(
                ctx,
                versions_to_gen=versions_to_gen,
                completed_by_key=completed_by_key,
                timeline=timeline,
                progress_text=f"第 {version_no} 版暂时没跑完",
                pct=18 + int(len(completed_by_key) * 70 / max(1, total)),
            )
            raise

        tokens_total += int(version.pop("_tokens", 0) or 0)
        completed_by_key[key] = version
        timeline[:] = [
            item for item in timeline
            if not (item.get("status") == "running" and item.get("unit_id") == key)
        ]
        timeline.append({
            "at_ts": int(time.time()),
            "text": f"{key} · {label}完成",
            "completed_versions": len(completed_by_key),
            "total_versions": total,
            "version_index": version_no,
            "unit_id": key,
            "status": "done",
        })
        _emit_partial(
            ctx,
            versions_to_gen=versions_to_gen,
            completed_by_key=completed_by_key,
            timeline=timeline,
            progress_text=f"已完成 {len(completed_by_key)}/{total} 版",
            pct=20 + int(len(completed_by_key) * 70 / max(1, total)),
        )

    out_versions = [completed_by_key[k] for k in versions_to_gen if k in completed_by_key]
    if not out_versions:
        raise RuntimeError("爆款改写没有生成可用版本")
    first = out_versions[0]

    return {
        "versions": out_versions,
        "content": first.get("content", ""),
        "word_count": first.get("word_count", 0),
        "version_count": len(out_versions),
        "mode": mode,
        "tokens": {"total": tokens_total},
    }


# ─── 异步 (D-037b5) ─────────────────────────────────────

def rewrite_async(
    text: str,
    mode: str = "pure",
    industry: str = "",
    target_action: str = "",
    dna: dict[str, Any] | None = None,
) -> str:
    """异步触发 rewrite, 立即返 task_id. 每个完整版本完成后写 partial_result."""
    return tasks_service.run_async(
        kind="baokuan.rewrite",
        label=f"爆款改写 · {mode} · {len(text)}字",
        ns="baokuan",
        page_id="baokuan",
        step="rewrite",
        payload={"text_preview": text[:200], "mode": mode, "text_len": len(text)},
        estimated_seconds=_estimated_seconds(mode),
        progress_text="小华写改写文案 (V1/V2/V3/V4)...",
        sync_fn_with_ctx=lambda ctx: rewrite(text, mode, industry, target_action, dna, ctx=ctx),
    )
