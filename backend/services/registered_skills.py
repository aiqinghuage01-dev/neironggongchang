"""已接入 skill 注册表 — single source of truth (D-019)。

消费方:
  - /api/skills/catalog endpoint(给前端技能中心用)
  - tests/test_skills_smoke.py(完整性检查)

新接入 skill 时(或 scripts/add_skill.py 做完后)在这里加一行,
前端首页技能中心和烟雾测试都会自动覆盖。

sidebar_id 字段: 绝大多数等于 page_id。例外:
  touliu-agent 的 sidebar_id="ad"(沿用旧投流文案入口,未改 sidebar)
"""
from __future__ import annotations

import os
from pathlib import Path
from typing import Any

REGISTERED_SKILLS: list[dict[str, Any]] = [
    {
        "slug": "公众号文章",
        "api_prefix": "wechat",   # /api/wechat/* · pipeline = wechat_pipeline · jsx = factory-wechat-v2
        "page_id": "wechat",      # sidebar + factory-app case
        "icon": "📄",
        "label": "公众号",
        "subtitle": "2000+ 字方法论长文 · 一路到微信草稿箱",
        "steps": 8,
        "has_scripts": True,
    },
    {
        "slug": "热点文案改写V2",
        "api_prefix": "hotrewrite",
        "page_id": "hotrewrite",
        "icon": "🔥",
        "label": "热点改写",
        "subtitle": "任意热点 → 实体老板向口播 · 1800-2600 字",
        "steps": 3,
        "has_scripts": False,
    },
    {
        "slug": "录音文案改写",
        "api_prefix": "voicerewrite",
        "page_id": "voicerewrite",
        "icon": "🎙️",
        "label": "录音改写",
        "subtitle": "口述录音 → 可读稿 · 保留口吻不丢经历",
        "steps": 3,
        "has_scripts": False,
    },
    {
        "slug": "touliu-agent",
        "api_prefix": "touliu",   # /api/touliu/* · pipeline = touliu_pipeline · jsx = factory-touliu-v2
        "page_id": "ad",          # sidebar 沿用旧"投流文案"入口
        "icon": "💰",
        "label": "投流文案",
        "subtitle": "批量生成 N 条 · 结构分配 + 编导 6 维终检",
        "steps": 2,
        "has_scripts": True,
    },
    {
        "slug": "content-planner",
        "api_prefix": "planner",
        "page_id": "planner",
        "icon": "🗓️",
        "label": "内容策划",
        "subtitle": "活动前内容产出策划 · 三档目标 + 6 模块完整方案",
        "steps": 3,
        "has_scripts": False,
    },
]


SKILLS_ROOT = Path(os.path.expanduser("~/Desktop/skills"))


def list_catalog() -> list[dict[str, Any]]:
    """返回完整目录:已注册的 + 扫 ~/Desktop/skills/ 找到但未注册的。

    未注册 skill 标 installed=False,让前端知道"还可以接进来"。
    过滤学员版(目录名以 -学员版 结尾)。
    """
    registered_slugs = {s["slug"] for s in REGISTERED_SKILLS}
    catalog: list[dict[str, Any]] = []

    # 1. 已注册的(按配置顺序)
    for s in REGISTERED_SKILLS:
        skill_dir = SKILLS_ROOT / s["slug"]
        skill_md = skill_dir / "SKILL.md"
        mtime = int(skill_md.stat().st_mtime) if skill_md.exists() else 0
        catalog.append({
            **s,
            "installed": True,
            "skill_md_mtime": mtime,
            "skill_md_exists": skill_md.exists(),
        })

    # 2. 未注册的 skill 目录(过滤学员版)
    if SKILLS_ROOT.exists():
        for entry in sorted(SKILLS_ROOT.iterdir()):
            if not entry.is_dir():
                continue
            name = entry.name
            if name.startswith("_") or name.endswith("-学员版") or name in registered_slugs:
                continue
            skill_md = entry / "SKILL.md"
            if not skill_md.exists():
                continue
            catalog.append({
                "slug": name,
                "page_id": None,
                "sidebar_id": None,
                "icon": "📝",
                "label": name,
                "subtitle": "(未接入 · 用 scripts/add_skill.py 生成骨架)",
                "steps": 0,
                "has_scripts": (entry / "scripts").exists(),
                "installed": False,
                "skill_md_mtime": int(skill_md.stat().st_mtime),
                "skill_md_exists": True,
            })

    return catalog
