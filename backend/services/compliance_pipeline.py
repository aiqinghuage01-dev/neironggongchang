"""违禁违规审查 skill pipeline (D-026 · 单 step: 审查 + 必出 2 版改写)。

D-037b3 (2026-04-26): 异步化 + 拆 3 段真进度
  原: 单次 AI 调用 90s 黑盒, 前端裸 fetch 等到 Failed to fetch.
  新: 3 段流水线, 每段后 update_progress 推真百分比.
      ① 扫违规 (60s, 5%→50%)
      ② 写保守版 (25s, 50%→80%)
      ③ 写营销版 (25s, 80%→100%)
  老的 check_compliance() 保留 (同步, 兼容 analyze_input/write_output).
  新加 check_compliance_async() 立即返 task_id, daemon thread 跑.

Skill 源: ~/Desktop/skills/违禁违规审查-学员版/
  SKILL.md · 207 行,工作流程 6 步
  references/通用违禁词库.md · 119 行
  references/敏感行业词库.md · 191 行
"""
from __future__ import annotations

import json
import re
import threading
from copy import deepcopy
from typing import Any

from backend.services import skill_loader
from backend.services import tasks as tasks_service
from shortvideo.ai import get_ai_client

SKILL_SLUG = "违禁违规审查-学员版"

_INTERNAL_DISPLAY_KEY_PARTS = ("token", "route", "model", "provider", "prompt")


def _is_internal_display_key(key: Any) -> bool:
    k = str(key or "").lower()
    return any(part in k for part in _INTERNAL_DISPLAY_KEY_PARTS)


def sanitize_result_for_display(result: Any) -> Any:
    """清洗 compliance task 的 result/partial_result, 防内部路由和耗量字段进前端."""
    def _clean(value: Any) -> Any:
        if isinstance(value, dict):
            return {
                k: _clean(v)
                for k, v in value.items()
                if not _is_internal_display_key(k) and not str(k).startswith("_")
            }
        if isinstance(value, list):
            return [_clean(v) for v in value]
        return value

    return _clean(deepcopy(result))


def _extract_json(text: str, wrap: str = "object") -> Any:
    pat = r"\[[\s\S]*\]" if wrap == "array" else r"\{[\s\S]*\}"
    m = re.search(pat, text)
    if not m:
        return None
    try:
        return json.loads(m.group(0))
    except Exception:
        return None


def _build_system_full(skill: dict) -> str:
    """完整 system: SKILL.md + 词库 (扫违规阶段用)."""
    refs = skill["references"]
    return f"""你在执行《违禁违规审查》skill。

===== skill 方法论(SKILL.md) =====
{skill['skill_md']}

===== 通用违禁词库(所有行业必查) =====
{refs.get('通用违禁词库', '')}

===== 敏感行业词库 =====
{refs.get('敏感行业词库', '')}
"""


def _build_system_rewrite(skill: dict) -> str:
    """改写阶段精简 system: 只 SKILL.md, 不带词库 (省 token)."""
    return f"""你在执行《违禁违规审查》skill 的改写阶段。

===== skill 方法论(SKILL.md) =====
{skill['skill_md']}
"""


# ─── ① 扫违规 (AI 调用 1) ─────────────────────────────────

def _scan_violations(text: str, industry: str, skill: dict) -> dict[str, Any]:
    """阶段 1: 扫违规 + 分级 + 总评. 不出改写."""
    prompt = f"""待审查文案:
---
{text.strip()}
---

用户行业: {industry}

按 skill Step 2-3 执行 (扫违规, **不出改写**, 改写在下个阶段):
1. 通用审查(所有行业必做,对照通用违禁词库 8 大类)
2. 如果是敏感行业,加查对应行业特殊词库
3. 按高/中/低危分级输出 violations (一句话原因 + 一句话合规替换建议)
4. 一句话总评

严格 JSON,不加前言:
{{
  "industry": "{industry}",
  "scan_scope": "通用审查 / 通用+敏感行业(行业名)",
  "violations": [
    {{"level": "high", "original": "原文节选", "type": "极限词/医疗功效/...", "reason": "一句话说为什么违规", "fix": "合规替换建议"}}
  ],
  "stats": {{"high": 2, "medium": 3, "low": 1, "total": 6}},
  "summary": "一句话总评 · N 处违规,建议用哪版"
}}"""
    ai = get_ai_client(route_key="compliance.check")
    r = ai.chat(prompt, system=_build_system_full(skill), deep=False, temperature=0.3, max_tokens=3000)
    # D-094: 不让 JSON 解析失败 fallback 成"0 违规通过". "审查通过"是高信任决策,
    # 假通过比假不通过糟. _extract_json 返 None = LLM 真没出 JSON, 直接 raise.
    parsed = _extract_json(r.text, "object")
    if parsed is None:
        raise RuntimeError(
            f"违规审查·扫违规 LLM JSON 解析失败 (tokens={r.total_tokens}). "
            f"输出头: {r.text[:200]!r}. 不能伪装成 0 违规通过."
        )
    parsed.setdefault("industry", industry)
    parsed.setdefault("violations", [])
    parsed.setdefault("stats", {"high": 0, "medium": 0, "low": 0, "total": 0})
    parsed.setdefault("summary", "")
    return {**parsed, "_tokens": r.total_tokens}


# ─── ②③ 写一版 (AI 调用 2 / 3) ────────────────────────────

def _write_version(text: str, industry: str, scan: dict, mode: str, skill: dict) -> dict[str, Any]:
    """阶段 2/3: 按 violations 写一版改写.

    mode: "保守" → 100% 合规, 全改, 牺牲营销
          "营销" → 高危必改, 中危酌情, 保留营销力
    """
    if mode == "保守":
        rules = "高+中+低危全部替换或删除, 100% 合规, 不留任何擦边表述. 牺牲营销效果换合规."
        target_field = "version_a"
        extra_field = ""  # 保守版不需要 kept_marketing
        extra_schema = ""
        compliance_target = 95
        desc_template = "100% 合规 · 适合: 敏感行业/新号/怕封号 · 所有违规词全部替换,无任何擦边表述"
    else:
        rules = "高危必改 (替换或删除), 中危酌情 (能保营销就保, 不能保就改), 低危基本保留. 保留紧迫感、社交证言、价格吸引力等营销手法."
        target_field = "version_b"
        extra_field = '"kept_marketing": ["保留的营销点 1", "保留的营销点 2"],'
        extra_schema = '\n  注意 kept_marketing 字段必填,列出你保留的 2-3 个营销点.'
        compliance_target = 85
        desc_template = "合规 + 保留吸引力 · 适合: 有权重的号/要效果 · 高危全改,中危酌情保留营销力"

    violations_str = json.dumps(scan.get("violations", []), ensure_ascii=False, indent=2)

    prompt = f"""原文:
---
{text.strip()}
---

行业: {industry}
本阶段任务: 写"{mode}版"改写

上一阶段扫出的违规 (按这个改):
{violations_str}

改写规则: {rules}{extra_schema}

严格 JSON,不加前言:
{{
  "content": "{mode}版完整改写文案 (跟原文等长 ±20%)",
  "word_count": 280,
  "compliance": {compliance_target},
  {extra_field}
  "description": "{desc_template}"
}}"""
    ai = get_ai_client(route_key="compliance.check")
    r = ai.chat(prompt, system=_build_system_rewrite(skill), deep=False, temperature=0.3, max_tokens=2500)
    # D-094: 同 _scan_violations, JSON 解析失败 / content 空都 raise. UI 显示
    # "保守版/营销版" 但点开空文是更糟的伪成功 (老板会以为改写完了).
    parsed = _extract_json(r.text, "object")
    if parsed is None:
        raise RuntimeError(
            f"违规审查·{mode}版改写 LLM JSON 解析失败 (tokens={r.total_tokens}). "
            f"输出头: {r.text[:200]!r}."
        )
    content = (parsed.get("content") or "").strip()
    if not content:
        raise RuntimeError(
            f"违规审查·{mode}版改写 LLM 返空 content (tokens={r.total_tokens}). "
            f"上游可能 max_tokens 全烧 thinking. 请重试."
        )
    parsed["content"] = content
    parsed.setdefault("word_count", len(content))
    parsed.setdefault("compliance", compliance_target)
    parsed.setdefault("description", desc_template)
    if mode == "营销":
        parsed.setdefault("kept_marketing", [])
    parsed["_tokens"] = r.total_tokens
    return parsed


# ─── 同步全流程 (向下兼容 + 单测用) ────────────────────────

def check_compliance(text: str, industry: str = "通用") -> dict[str, Any]:
    """同步 3 段: 扫 → 保守 → 营销. 总耗时 70-100s, 阻塞调用方.

    向下兼容旧路径: analyze_input / write_output 仍可调.
    新路径走 check_compliance_async (异步, 推真进度).
    """
    skill = skill_loader.load_skill(SKILL_SLUG)
    scan = _scan_violations(text, industry, skill)
    version_a = _write_version(text, industry, scan, mode="保守", skill=skill)
    version_b = _write_version(text, industry, scan, mode="营销", skill=skill)
    return _merge_result(scan, version_a, version_b)


def _merge_result(scan: dict, version_a: dict, version_b: dict) -> dict[str, Any]:
    tokens_total = (scan.pop("_tokens", 0) or 0) + (version_a.pop("_tokens", 0) or 0) + (version_b.pop("_tokens", 0) or 0)
    return {
        **{k: v for k, v in scan.items() if not k.startswith("_")},
        "version_a": version_a,
        "version_b": version_b,
        "tokens": {"total": tokens_total},
    }


def _public_scan(scan: dict[str, Any]) -> dict[str, Any]:
    return sanitize_result_for_display({
        "industry": scan.get("industry"),
        "scan_scope": scan.get("scan_scope"),
        "violations": scan.get("violations") or [],
        "stats": scan.get("stats") or {"high": 0, "medium": 0, "low": 0, "total": 0},
        "summary": scan.get("summary") or "",
    })


def _public_version(version: dict[str, Any] | None) -> dict[str, Any] | None:
    if not isinstance(version, dict):
        return None
    allowed = {
        "content": version.get("content") or "",
        "word_count": version.get("word_count") or len(version.get("content") or ""),
        "compliance": version.get("compliance"),
        "description": version.get("description") or "",
    }
    if "kept_marketing" in version:
        allowed["kept_marketing"] = version.get("kept_marketing") or []
    return sanitize_result_for_display(allowed)


def _partial_result(
    scan: dict[str, Any],
    *,
    version_a: dict[str, Any] | None = None,
    version_b: dict[str, Any] | None = None,
) -> dict[str, Any]:
    partial = _public_scan(scan)
    completed = 1
    public_a = _public_version(version_a)
    public_b = _public_version(version_b)
    if public_a:
        partial["version_a"] = public_a
        completed = 2
    if public_b:
        partial["version_b"] = public_b
        completed = 3
    partial["completed_stages"] = completed
    partial["total_stages"] = 3
    return sanitize_result_for_display(partial)


def _progress_data(stage: str, completed: int, total: int = 3) -> dict[str, Any]:
    labels = {
        "scan": "扫描结果完成",
        "conservative": "保守版完成",
        "marketing": "营销版完成",
    }
    return sanitize_result_for_display({
        "stage": stage,
        "completed_stages": completed,
        "total_stages": total,
        "timeline": [
            {"stage": k, "status": "done", "text": v}
            for k, v in labels.items()
            if (k == "scan" and completed >= 1)
            or (k == "conservative" and completed >= 2)
            or (k == "marketing" and completed >= 3)
        ],
    })


# ─── 异步 (D-037b3) ─────────────────────────────────────

def check_compliance_async(text: str, industry: str = "通用") -> str:
    """触发异步审查, 立即返 task_id. 后台 daemon thread 跑 3 段, 推真进度.

    前端调 GET /api/tasks/{task_id} 轮询 progress_pct + progress_text 看真进度.
    """
    task_id = tasks_service.create_task(
        kind="compliance.check",
        label=f"违规审查 · {industry} · {len(text)}字",
        ns="compliance",
        page_id="compliance",
        step="check",
        payload={"text_preview": text[:200], "industry": industry, "text_len": len(text)},
        estimated_seconds=90,
    )

    def _worker():
        try:
            tasks_service.update_progress(task_id, "准备词库 + skill 方法论...", pct=5)
            skill = skill_loader.load_skill(SKILL_SLUG)

            if tasks_service.is_cancelled(task_id):
                return
            tasks_service.update_progress(task_id, "扫通用违禁词 + 行业敏感词...", pct=15)
            scan = _scan_violations(text, industry, skill)
            tasks_service.update_partial_result(
                task_id,
                partial_result=_partial_result(scan),
                progress_data=_progress_data("scan", 1),
                progress_text=f"扫描完成: {scan.get('stats', {}).get('total', 0)} 处风险, 正在写保守版...",
                pct=45,
            )

            if tasks_service.is_cancelled(task_id):
                return
            tasks_service.update_progress(
                task_id,
                f"扫到 {scan.get('stats', {}).get('total', 0)} 处违规, 写保守版 (100% 合规)...",
                pct=50,
            )
            version_a = _write_version(text, industry, scan, mode="保守", skill=skill)
            tasks_service.update_partial_result(
                task_id,
                partial_result=_partial_result(scan, version_a=version_a),
                progress_data=_progress_data("conservative", 2),
                progress_text="保守版已完成, 营销版继续写...",
                pct=72,
            )

            if tasks_service.is_cancelled(task_id):
                return
            tasks_service.update_progress(task_id, "写营销版 (保留吸引力)...", pct=80)
            version_b = _write_version(text, industry, scan, mode="营销", skill=skill)
            tasks_service.update_partial_result(
                task_id,
                partial_result=_partial_result(scan, version_a=version_a, version_b=version_b),
                progress_data=_progress_data("marketing", 3),
                progress_text="营销版已完成, 正在整理结果...",
                pct=92,
            )

            if tasks_service.is_cancelled(task_id):
                return
            tasks_service.update_progress(task_id, "整理结果...", pct=95)
            result = _merge_result(scan, version_a, version_b)
            tasks_service.finish_task(task_id, result=result)
        except Exception as e:
            tasks_service.finish_task(
                task_id,
                error=f"{type(e).__name__}: {e}",
                status="failed",
            )

    threading.Thread(target=_worker, daemon=True).start()
    return task_id


# ─── 兼容 add_skill.py 骨架命名 ───────────────────────────

def analyze_input(input_text: str) -> dict[str, Any]:
    """骨架别名 · 同步全流程, 返回完整结果."""
    return check_compliance(input_text, industry="通用")


def write_output(input_text: str, analysis: dict, angle: dict) -> dict[str, Any]:
    """骨架别名 · 接到 content 就走 check. industry 从 analysis 取或默认."""
    industry = (analysis or {}).get("industry") or (angle or {}).get("industry") or "通用"
    return check_compliance(input_text, industry=industry)
