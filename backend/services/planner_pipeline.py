"""content-planner skill pipeline (D-022 · 适配三档目标 + 6 模块策划)。

Skill 源: ~/Desktop/skills/content-planner/SKILL.md (891 行)

跟其他 skill 不同 — 不是 "输入 → 文章正文",而是 "活动场景 → 完整策划方案":
  analyze_event: 收集活动信息 + 给三档目标(保底/标准/最大化)
  write_plan:    选定档次后输出 6 模块完整方案

红线(SKILL.md 顶部):
- 绝对不提产品价格
- 绝对不让参会者现场动手搭建/落地
"""
from __future__ import annotations

import json
import re
from typing import Any

from backend.services import skill_loader
from backend.services import tasks as tasks_service
from shortvideo.ai import get_ai_client

SKILL_SLUG = "content-planner"


def _extract_json(text: str, wrap: str = "object") -> Any:
    pat = r"\[[\s\S]*\]" if wrap == "array" else r"\{[\s\S]*\}"
    m = re.search(pat, text)
    if not m:
        return None
    try:
        return json.loads(m.group(0))
    except Exception:
        return None


# ─── Step 1 · 收集活动信息 + 给三档目标 ──────────────────

def analyze_event(brief: str) -> dict[str, Any]:
    """输入活动 brief,推断细节 + 给三档预估目标(保底/标准/最大化)。"""
    skill = skill_loader.load_skill(SKILL_SLUG)
    system = f"""你在执行《content-planner》skill · 信息收集 + 三档目标预估阶段。
按 SKILL.md 方法论(四层漏斗放大模型),给最大化产出的预估数字。

⛔ 红线(最高优先级):
- 绝对不提任何产品价格 / 金额
- 绝对不建议让参会者现场动手搭建或落地

===== skill 完整方法论(SKILL.md 前 25K 字) =====
{skill['skill_md'][:25000]}
"""
    prompt = f"""活动 brief:
{brief.strip()}

按 SKILL.md「模块1:产出目标与预估」给出三档目标。缺的字段(人数/助理/天数)
按 SKILL.md「提问原则」自己推断,推断结果列在 detected 里。

严格 JSON 对象:
{{
  "detected": {{
    "活动类型": "推断的活动类型,如 讲课/分享/出差/直播",
    "天数": 1.0,
    "半天数": 2,
    "人数": 100,
    "有助理": true,
    "推断说明": "缺哪些字段是怎么推断的"
  }},
  "levels": [
    {{
      "name": "保底",
      "total": 200,
      "desc": "只录音 + 朋友圈 · 一个人也能执行",
      "breakdown": ["短视频切片 N 条", "朋友圈 N 条", "..."]
    }},
    {{
      "name": "标准",
      "total": 800,
      "desc": "有助理拍摄 + 一鱼多吃 + 多平台改写",
      "breakdown": [...]
    }},
    {{
      "name": "最大化",
      "total": 1500,
      "desc": "全四层漏斗 + 数字人翻拍 + 矩阵号分发",
      "breakdown": [...]
    }}
  ],
  "key_questions": ["如果你的实际情况不符合推断,告诉我哪 1-2 个数字要改"]
}}"""
    ai = get_ai_client(route_key="planner.analyze")
    r = ai.chat(prompt, system=system, deep=False, temperature=0.6, max_tokens=3000)
    # D-094: 解析失败 → raise, 不让前端拿到 levels=[] 假成功 (Step 2 候选档次空 UI 卡死).
    obj = _extract_json(r.text, "object")
    if obj is None:
        raise RuntimeError(
            f"内容策划·识别档次 LLM 输出非 JSON (tokens={r.total_tokens}). "
            f"输出头: {(r.text or '')[:200]!r}"
        )
    levels = obj.get("levels") or []
    if not levels:
        raise RuntimeError(
            f"内容策划·识别档次 LLM 没出 levels 数组 (tokens={r.total_tokens}). "
            f"输出头: {(r.text or '')[:200]!r}"
        )
    return {
        "detected": obj.get("detected", {}),
        "levels": levels,
        "key_questions": obj.get("key_questions", []),
        "raw_tokens": r.total_tokens,
    }


# ─── Step 2 · 基于选定档次出 6 模块完整方案 ──────────────

def write_plan(brief: str, detected: dict[str, Any], level: dict[str, Any]) -> dict[str, Any]:
    """选定一档目标后,输出活动前/中/后 + 团队/清单/知识沉淀的完整 6 模块。"""
    skill = skill_loader.load_skill(SKILL_SLUG)
    system = f"""你在执行《content-planner》skill · 完整策划方案阶段。

⛔ 红线: 不提价格 · 不建议参会者现场动手

===== skill 完整方法论(SKILL.md 前 30K 字) =====
{skill['skill_md'][:30000]}
"""
    prompt = f"""活动 brief: {brief.strip()}

已确认的活动信息:
{json.dumps(detected, ensure_ascii=False, indent=2)}

用户选定档次:
- 名称: {level.get('name', '')}
- 总产出: {level.get('total', 0)} 条
- 描述: {level.get('desc', '')}

按 SKILL.md「核心输出:6大模块」输出完整策划方案。
严格 JSON 对象,每个模块都要务实可执行,不空泛:

{{
  "before_event": {{
    "title": "活动前准备 · 设备/人员清单",
    "items": [
      {{"category": "设备", "list": ["专业录音笔(必须)", "广角手机三脚架"]}},
      {{"category": "人员", "list": ["1 个编导(拍片+花絮)"]}},
      {{"category": "前置素材", "list": ["提前拍 3 条预热口播"]}}
    ],
    "timeline": "T-3天 / T-1天 / 当天提前 1 小时"
  }},
  "during_event": {{
    "title": "活动中时间线 + 稀缺素材抓拍",
    "segments": [
      {{"time": "开场前 30 分钟", "actions": ["拍空场全景", "拍签到台"]}},
      {{"time": "讲课中", "actions": ["每 30 分钟编导拍 15-30 秒"]}},
      {{"time": "课间", "actions": ["3-5 个学员采访(竖屏 60 秒)"]}},
      {{"time": "收尾", "actions": ["合影", "学员 1 句反馈"]}}
    ],
    "scarce_materials": ["大规模人群口号共创(过了就没)", "现场举手互动"]
  }},
  "after_event": {{
    "title": "活动后内容生产计划",
    "tasks": [
      {{"day": "+0", "action": "录音上传 + 一鱼多吃出 50 条切片", "skill": "voicerewrite"}},
      {{"day": "+1", "action": "...", "skill": "wechat 公众号长文"}},
      {{"day": "+2 ~ +7", "action": "数字人翻拍 + 矩阵号分发", "skill": "shiliu-digital-human"}}
    ],
    "publish_rhythm": "当天发 1 条预告 · +1 主推 + 2 朋友圈"
  }},
  "team": {{
    "title": "团队 / 设备",
    "roles": [
      {{"role": "主讲(老板)", "duty": "..."}},
      {{"role": "编导(1 人)", "duty": "..."}}
    ],
    "equipment_min": "最低配置(手机+三脚架+蓝牙麦)",
    "equipment_pro": "进阶配置(广角相机+无线麦+稳定器)"
  }},
  "checklist": {{
    "title": "执行清单(打印贴墙)",
    "before": ["提前 3 天测试设备"],
    "during": ["开场抓全场镜头"],
    "after": ["48 小时内一鱼多吃"]
  }},
  "knowledge_sink": {{
    "title": "知识库回流(让 AI 越来越懂你)",
    "items": [
      {{"type": "原话金句", "from": "逐字稿", "to": "07 知识 Wiki/金句库.md"}},
      {{"type": "学员痛点案例", "from": "采访视频", "to": "01 底层资产/案例库.md"}}
    ]
  }},
  "summary": "一句话总结: 这次活动 N 天 → 总产出 X 条 · 关键稀缺素材是 Y · 节奏是 Z"
}}"""
    ai = get_ai_client(route_key="planner.write")
    r = ai.chat(prompt, system=system, deep=False, temperature=0.7, max_tokens=8000)
    # D-094: 解析失败 → raise, 不让 plan={} 空对象当成功 (UI 显示空白方案 + 假绿勾).
    obj = _extract_json(r.text, "object")
    if obj is None or not obj:
        raise RuntimeError(
            f"内容策划·完整方案 LLM 输出非 JSON 或空对象 (tokens={r.total_tokens}). "
            f"输出头: {(r.text or '')[:200]!r}"
        )
    return {
        "plan": obj,
        "tokens": {"total": r.total_tokens},
    }


# ─── 异步 (D-037b5) ─────────────────────────────────────

def write_plan_async(brief: str, detected: dict[str, Any], level: dict[str, Any]) -> str:
    """异步触发 write_plan, 立即返 task_id. 真跑 30-60s."""
    level_label = (level or {}).get("label") or (level or {}).get("name") or ""
    return tasks_service.run_async(
        kind="planner.write",
        label=f"内容策划 · {level_label}" if level_label else "内容策划",
        ns="planner",
        page_id="planner",
        step="write",
        payload={"brief_preview": brief[:100], "level_label": level_label},
        estimated_seconds=50,
        progress_text="AI 写 6 模块完整方案...",
        sync_fn=lambda: write_plan(brief, detected, level),
    )


# 兼容 add_skill.py 骨架命名 + 旧 API 调用
analyze_input = analyze_event
write_output = write_plan
