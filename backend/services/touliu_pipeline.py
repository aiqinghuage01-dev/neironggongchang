"""touliu-agent skill pipeline — 批量生成投流文案 + 本地 lint 质检。

Skill 源: ~/Desktop/skills/touliu-agent/
  SKILL.md 18K 字 · 完整方法论 + 结构分配 + 生成规则 + 坏稿特征
  references/ 7 个文件 · 风格红线 / 样本锚点 / 行业模板 / 跑量规律等
  scripts/ lint_copy_batch.py 质检脚本

本模块:
  generate_batch(inputs) → 一次生成 n 条(按 Step 3 结构分配)
  lint_batch(batch, target_action) → subprocess 调 lint_copy_batch.py

不做 Step 0.5 (refresh_runtime.sh, 是维护脚本)
不做 Step 3.6 (飞书同步, 违反红线)
"""
from __future__ import annotations

import json
import re
import subprocess
import tempfile
from pathlib import Path
from typing import Any

from backend.services import skill_loader
from backend.services import tasks as tasks_service
from shortvideo.ai import get_ai_client

SKILL_SLUG = "touliu-agent"


def _json_search_text(text: str) -> str:
    raw = (text or "").strip()
    fenced = re.search(r"```(?:json)?\s*([\s\S]*?)```", raw, re.IGNORECASE)
    if fenced:
        return fenced.group(1).strip()
    open_fence = re.search(r"```(?:json)?\s*([\s\S]*)$", raw, re.IGNORECASE)
    if open_fence:
        return open_fence.group(1).strip()
    return raw


def _balanced_json_slice(text: str, wrap: str) -> str | None:
    open_ch, close_ch = ("[", "]") if wrap == "array" else ("{", "}")
    start = text.find(open_ch)
    if start < 0:
        return None

    depth = 0
    in_string = False
    escaped = False
    for idx in range(start, len(text)):
        ch = text[idx]
        if in_string:
            if escaped:
                escaped = False
            elif ch == "\\":
                escaped = True
            elif ch == '"':
                in_string = False
            continue

        if ch == '"':
            in_string = True
        elif ch == open_ch:
            depth += 1
        elif ch == close_ch:
            depth -= 1
            if depth == 0:
                return text[start:idx + 1]
    return None


def _extract_json(text: str, wrap: str = "array") -> Any:
    candidate = _balanced_json_slice(_json_search_text(text), wrap)
    if not candidate:
        return None
    try:
        return json.loads(candidate)
    except Exception:
        return None


def _json_failure_hint(text: str, wrap: str = "object") -> str:
    raw = (text or "").strip()
    if not raw:
        return "LLM 返回空文本"

    search_text = _json_search_text(raw)
    open_ch = "[" if wrap == "array" else "{"
    if search_text.find(open_ch) >= 0:
        if _balanced_json_slice(search_text, wrap) is None:
            return "LLM JSON 疑似被截断或未闭合"
        return "LLM JSON 格式错误"
    if "```" in raw:
        return "LLM 返回代码块但里面没有 JSON"
    return "LLM 输出里没有找到 JSON"


def _load_prompt_context(*, compact: bool = False) -> str:
    """拼 skill 的核心指令 + 关键 references。

    注入优先级(按重要性):
      SKILL.md(完整) + style_rules + winning_patterns + industry_templates
      + golden_samples(前 4000 字,太长了截断)

    不注入: ads_library_full(太长), ai_mechanism_patterns(按需)
    """
    skill = skill_loader.load_skill(SKILL_SLUG)
    refs = skill["references"]
    if compact:
        parts = [
            "===== skill 方法论(SKILL.md 摘要) =====",
            skill["skill_md"][:3600],
            "",
            "===== 风格红线(style_rules 摘要) =====",
            refs.get("style_rules", "")[:1400],
            "",
            "===== 跑量规律(winning_patterns 摘要) =====",
            refs.get("winning_patterns", "")[:1200],
            "",
            "===== 行业模板(industry_templates 摘要) =====",
            refs.get("industry_templates", "")[:1200],
            "",
            "===== 高质量样本锚点(golden_samples 摘要) =====",
            refs.get("golden_samples", "")[:800],
        ]
        return "\n".join(p for p in parts if p)
    parts = [
        "===== skill 方法论(SKILL.md) =====",
        skill["skill_md"],
        "",
        "===== 风格红线(style_rules) =====",
        refs.get("style_rules", ""),
        "",
        "===== 跑量规律(winning_patterns) =====",
        refs.get("winning_patterns", ""),
        "",
        "===== 行业模板(industry_templates) =====",
        refs.get("industry_templates", ""),
        "",
        "===== 高质量样本锚点(golden_samples 前段) =====",
        refs.get("golden_samples", "")[:4000],
    ]
    return "\n".join(p for p in parts if p)


def _max_tokens_for_batch(n: int) -> int:
    """按实际条数给输出预算。

    QA 发现 D-014 默认 1 条也用 12000 completion 预算 + 完整长上下文, Opus 真实超时。
    1/2 条是前端快出主路径, 应该用小预算; 5/10 条仍保留大批量预算。
    """
    n = max(1, min(int(n or 1), 15))
    if n == 1:
        return 2200
    if n == 2:
        return 3400
    return min(12000, max(5200, 1500 * n + 1200))


def _route_key_for_batch(n: int) -> str:
    n = max(1, min(int(n or 1), 15))
    return "touliu.generate.quick" if n <= 2 else "touliu.generate"


# ─── 批量生成 ────────────────────────────────────────────

DEFAULT_STRUCTURE_ALLOC = {
    10: {"痛点型": 3, "对比型": 2, "步骤型": 2, "对话型": 2, "创新型": 1},
    5:  {"痛点型": 2, "对比型": 1, "步骤型": 1, "对话型": 1, "创新型": 0},
    3:  {"痛点型": 1, "对比型": 1, "步骤型": 1, "对话型": 0, "创新型": 0},
    # D-068c: 支持 1/2 条快出 (前端默认就是 1, D-062e 求速度)
    2:  {"痛点型": 1, "对比型": 1, "步骤型": 0, "对话型": 0, "创新型": 0},
    1:  {"痛点型": 1, "对比型": 0, "步骤型": 0, "对话型": 0, "创新型": 0},
}


def _alloc_for(n: int) -> dict[str, int]:
    if n in DEFAULT_STRUCTURE_ALLOC:
        return DEFAULT_STRUCTURE_ALLOC[n]
    # 按 10 条基准比例缩放
    base = DEFAULT_STRUCTURE_ALLOC[10]
    alloc: dict[str, int] = {}
    remaining = n
    for k in ["痛点型", "对比型", "步骤型", "对话型", "创新型"]:
        v = max(0, round(base[k] * n / 10))
        alloc[k] = v
        remaining -= v
    # 余数补给痛点型
    if remaining != 0:
        alloc["痛点型"] += remaining
    return alloc


def generate_batch(
    pitch: str,
    industry: str = "通用老板",
    target_action: str = "点头像进直播间",
    n: int = 10,
    channel: str = "直播间",
) -> dict[str, Any]:
    """一次生成 n 条投流文案 + 风格对齐摘要 + lint 结果。"""
    # D-068c: 之前 max(3, ...) 让前端 n=1 实际生成 3 条 → 用户被骗。改 max(1, ...)
    n = max(1, min(int(n or 1), 15))
    quick_mode = n <= 2
    context = _load_prompt_context(compact=quick_mode)
    alloc = _alloc_for(n)
    alloc_desc = " + ".join(f"{v}条{k}" for k, v in alloc.items() if v > 0)
    length_rule = (
        "1/2 条快出: 正文 220-360 字, 说服链完整但不展开长篇; "
        "风格摘要每项一句话, correction_patterns 只给 2 个短句, 不写长分析."
        if quick_mode
        else "正文长度: 痛点型/对比型 420-650 字 · 步骤型/对话型 320-520 字 · 创新型 350-560 字"
    )

    system = f"""你在执行 touliu-agent skill · Step 2-3 批量生成。
严格按下面方法论和 references 写,不能放飞。

{context}

===== 额外硬规矩 =====
- 一次输出 {n} 条,结构分配:{alloc_desc}
- {length_rule}
- 目标动作: {target_action} → CTA 必须回扣
- 人群: {industry}
- 适用渠道: {channel}
- 不做飞书同步,不做 refresh_runtime
- 输出只能是 JSON 对象本身,第一字符必须是 {{,最后字符必须是 }}
- 禁止写“已走技能”、Markdown 代码块、```json、前言、解释、总结
- 如果内容放不下,优先缩短正文,也必须输出完整闭合 JSON
"""

    prompt = f"""本批采集:
- 行业/品类: {industry}
- 核心卖点: {pitch.strip()}
- 目标动作: {target_action}
- 本批数量: {n}
- 适用渠道: {channel}

按 Step 2 先写风格对齐摘要,然后按 Step 3 结构分配生成 {n} 条完整投流文案。
每条都要过 Step 3 编号 7 的质量检查清单、编号 8 的编导视角 6 维终检(1-5 分,总 ≥ 24 且单项 ≥ 4)、
以及编号 9 的坏稿特征(任一命中直接重写)。

严格 JSON 对象,不加前言。直接从 `{{` 开始,不要 ```json,不要“已走技能”:
{{
  "style_summary": {{
    "opening_mode": "本批使用的开场场景/冲突模式",
    "correction_patterns": ["问题纠偏句模式 1", "模式 2", "模式 3"],
    "ai_chain_mode": "AI 功能动作链模式",
    "ai_layers": "本批覆盖的 AI 写法层级",
    "transition_mode": "机制转折模式",
    "cta_mode": "CTA 回扣模式",
    "humanness_bar": "人味标准和达标门槛"
  }},
  "batch": [
    {{
      "no": 1,
      "structure": "痛点型",
      "title": "用于封面/投流卡片,优先抓经营问题",
      "first_line": "用于口播开场,先把人带入场景",
      "body": "正文,按结构类型控长,不能压断说服链",
      "cta": "明确行动指令,必须回扣开头场景或中段核心矛盾",
      "audience": "{industry}",
      "channel": "{channel}",
      "director_check": {{
        "人味": 4, "场景完成度": 4, "业务过渡自然度": 4,
        "AI机制密度": 4, "说服层数": 4, "收口自然度": 4,
        "total": 24
      }}
    }},
    ...共 {n} 条,严格按结构分配 {alloc_desc}
  ]
}}"""

    route_key = _route_key_for_batch(n)
    ai = get_ai_client(route_key=route_key)
    engine = getattr(ai, "engine_name", "unknown")
    r = ai.chat(prompt, system=system, deep=False, temperature=0.85, max_tokens=_max_tokens_for_batch(n))
    # D-094: 不让 JSON 解析失败 fallback 成 batch=[] 假成功 (前端看 0 条投流文案以为正常).
    obj = _extract_json(r.text, "object")
    if obj is None:
        raise RuntimeError(
            f"投流文案 LLM 输出非 JSON: {_json_failure_hint(r.text, 'object')} "
            f"(tokens={r.total_tokens}). 输出头: {(r.text or '')[:200]!r}"
        )
    raw_batch = obj.get("batch")
    if not isinstance(raw_batch, list) or not raw_batch:
        raise RuntimeError(
            f"投流文案 LLM 没出 batch 数组 (tokens={r.total_tokens}). 输出头: {(r.text or '')[:200]!r}"
        )

    batch = [
        {
            "no": item.get("no") or (i + 1),
            "structure": (item.get("structure") or "").strip(),
            "title": (item.get("title") or "").strip(),
            "first_line": (item.get("first_line") or "").strip(),
            "body": (item.get("body") or "").strip(),
            "cta": (item.get("cta") or "").strip(),
            "audience": (item.get("audience") or industry).strip(),
            "channel": (item.get("channel") or channel).strip(),
            "director_check": item.get("director_check") or {},
        }
        for i, item in enumerate(raw_batch)
        if isinstance(item, dict)
    ][:n]
    if not batch:
        raise RuntimeError(
            f"投流文案 LLM batch 解析后 0 条有效, 全部不是 dict. 输出头: {(r.text or '')[:200]!r}"
        )

    return {
        "style_summary": obj.get("style_summary") or {},
        "batch": batch,
        "alloc": alloc,
        "inputs": {
            "pitch": pitch, "industry": industry,
            "target_action": target_action, "n": n, "channel": channel,
        },
        "route_key": route_key,
        "engine": engine,
        "tokens": r.total_tokens,
    }


# ─── Step 3.5 · 本地 lint 质检(subprocess) ────────────────

def lint_batch(batch: list[dict[str, Any]], target_action: str = "live") -> dict[str, Any]:
    """调 skill 的 lint_copy_batch.py 做本地质检。

    target_action: live|lead|dm|comment
    """
    scripts_dir = skill_loader.load_skill(SKILL_SLUG)["scripts_dir"]
    lint_py = scripts_dir / "lint_copy_batch.py"
    if not lint_py.exists():
        return {"ok": False, "skipped": True, "reason": "lint 脚本不存在"}

    # 把 batch 写成 lint 期待的 markdown 格式
    md_parts = []
    for item in batch:
        md_parts.append(f"### 【{item.get('no')}】{item.get('structure','')}")
        md_parts.append(f"**标题**: {item.get('title','')}")
        md_parts.append(f"**第1句话**: {item.get('first_line','')}")
        md_parts.append("**正文**:")
        md_parts.append(item.get("body", ""))
        md_parts.append(f"**CTA**: {item.get('cta','')}")
        md_parts.append("")

    with tempfile.NamedTemporaryFile("w", suffix=".md", delete=False, encoding="utf-8") as f:
        f.write("\n".join(md_parts))
        tmp_path = f.name

    try:
        result = subprocess.run(
            ["python3", str(lint_py), tmp_path, "--expected-items", str(len(batch)), "--target-action", target_action],
            capture_output=True, text=True, timeout=30,
        )
        out = (result.stdout or "") + "\n" + (result.stderr or "")
        passed = "PASS" in out.upper() and "FAIL" not in out.upper()
        return {
            "ok": True,
            "passed": passed,
            "return_code": result.returncode,
            "output": out.strip()[-3000:],
        }
    except subprocess.TimeoutExpired:
        return {"ok": False, "error": "lint 超时"}
    except Exception as e:
        return {"ok": False, "error": f"{type(e).__name__}: {e}"}
    finally:
        try:
            Path(tmp_path).unlink(missing_ok=True)
        except Exception:
            pass


# ─── 异步 (D-037b6) ─────────────────────────────────────

def generate_batch_async(
    pitch: str, industry: str, target_action: str,
    n: int = 5, channel: str = "douyin", run_lint: bool = True,
) -> str:
    """异步触发 generate_batch + 可选 lint, 立即返 task_id.

    1/2 条走紧凑上下文, 目标是 30-60s; 5/10 条仍按大批量慢任务处理。
    """
    n = max(1, min(int(n), 15))  # D-068c: 同 generate_batch, 支持 1/2 条快出
    target_map = {"点头像进直播间": "live", "留资": "lead", "加私域": "dm", "到店": "lead"}
    ta = target_map.get(target_action, "live")

    def _run():
        result = generate_batch(pitch=pitch, industry=industry, target_action=target_action, n=n, channel=channel)
        if run_lint and result.get("batch"):
            try:
                result["lint"] = lint_batch(result["batch"], target_action=ta)
            except Exception as e:
                result["lint"] = {"ok": False, "error": f"lint 失败: {type(e).__name__}: {e}", "skipped": False}
        return result

    return tasks_service.run_async(
        kind="touliu.generate",
        label=f"投流 · {n} 条 · {pitch[:30]}",
        ns="touliu",
        page_id="ad",
        step="generate",
        payload={"pitch_preview": pitch[:200], "industry": industry, "n": n, "channel": channel},
        estimated_seconds=60 if n <= 2 else 150,
        progress_text=f"AI 写 {n} 条投流文案 (按结构分配 + 6 维终检)...",
        sync_fn=_run,
    )
