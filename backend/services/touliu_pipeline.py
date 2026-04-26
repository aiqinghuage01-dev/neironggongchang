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


def _extract_json(text: str, wrap: str = "array") -> Any:
    pat = r"\[[\s\S]*\]" if wrap == "array" else r"\{[\s\S]*\}"
    m = re.search(pat, text)
    if not m:
        return None
    try:
        return json.loads(m.group(0))
    except Exception:
        return None


def _load_prompt_context() -> str:
    """拼 skill 的核心指令 + 关键 references。

    注入优先级(按重要性):
      SKILL.md(完整) + style_rules + winning_patterns + industry_templates
      + golden_samples(前 4000 字,太长了截断)

    不注入: ads_library_full(太长), ai_mechanism_patterns(按需)
    """
    skill = skill_loader.load_skill(SKILL_SLUG)
    refs = skill["references"]
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


# ─── 批量生成 ────────────────────────────────────────────

DEFAULT_STRUCTURE_ALLOC = {
    10: {"痛点型": 3, "对比型": 2, "步骤型": 2, "对话型": 2, "创新型": 1},
    5:  {"痛点型": 2, "对比型": 1, "步骤型": 1, "对话型": 1, "创新型": 0},
    3:  {"痛点型": 1, "对比型": 1, "步骤型": 1, "对话型": 0, "创新型": 0},
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
    context = _load_prompt_context()
    alloc = _alloc_for(max(3, min(n, 15)))
    alloc_desc = " + ".join(f"{v}条{k}" for k, v in alloc.items() if v > 0)

    system = f"""你在执行 touliu-agent skill · Step 2-3 批量生成。
严格按下面方法论和 references 写,不能放飞。

{context}

===== 额外硬规矩 =====
- 一次输出 {n} 条,结构分配:{alloc_desc}
- 正文长度: 痛点型/对比型 420-650 字 · 步骤型/对话型 320-520 字 · 创新型 350-560 字
- 目标动作: {target_action} → CTA 必须回扣
- 人群: {industry}
- 适用渠道: {channel}
- 不做飞书同步,不做 refresh_runtime
- 先输出《风格对齐摘要》,然后输出批量文案
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

严格 JSON 对象,不加前言:
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

    ai = get_ai_client(route_key="touliu.generate")
    r = ai.chat(prompt, system=system, deep=False, temperature=0.85, max_tokens=12000)
    obj = _extract_json(r.text, "object") or {}

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
        for i, item in enumerate(obj.get("batch") or [])
    ][:n]

    return {
        "style_summary": obj.get("style_summary") or {},
        "batch": batch,
        "alloc": alloc,
        "inputs": {
            "pitch": pitch, "industry": industry,
            "target_action": target_action, "n": n, "channel": channel,
        },
        "tokens": r.total_tokens,
    }


# ─── Step 3.5 · 本地 lint 质检(subprocess) ────────────────

def lint_batch(batch: list[dict[str, Any]], target_action: str = "live") -> dict[str, Any]:
    """调 skill 的 lint_copy_batch.py 做本地质检。

    target_action: live|reserve|private|comment
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
    """异步触发 generate_batch + 可选 lint, 立即返 task_id. 真跑 2-3 分钟 (Opus 6K system)."""
    n = max(3, min(int(n), 15))
    target_map = {"点头像进直播间": "live", "留资": "reserve", "加私域": "private", "到店": "visit"}
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
        estimated_seconds=150,
        progress_text=f"AI 写 {n} 条投流文案 (按结构分配 + 6 维终检)...",
        sync_fn=_run,
    )
