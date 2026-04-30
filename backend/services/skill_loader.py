"""Skill 加载器 — 读 ~/Desktop/skills/<slug>/ 下的 SKILL.md + references/ + assets/。

约定:
  skill 目录是事实源,本项目只读。清华哥在 skill 里改 references 或 assets,
  本项目下次调用自动读到最新(带 10 分钟 mtime 缓存)。
  SKILL.md 本身是给工程师(我)看的编排指南,不作为 AI prompt 材料。
  references/*.md 是给 AI 看的内容材料,按文件名取用。
  scripts/ 下的可执行脚本由本项目 subprocess 代调。

用法:
  skill = load_skill("公众号文章")
  skill["references"]["who-is-qinghuage"]   # -> str
  skill["scripts_dir"]                       # -> Path
"""
from __future__ import annotations

import os
import time
from pathlib import Path
from typing import Any

# v1.1: SKILL_ROOT 走 env,默认 ~/Desktop/skills(开发机行为不变)
# Mac mini 上设 SKILL_ROOT=~/Desktop/skills/团队版 走 symlink 视图(团队版指向 ~/skills-source)
SKILL_ROOT = Path(os.path.expanduser(os.getenv("SKILL_ROOT", "~/Desktop/skills")))

_CACHE_TTL = 600
_cache: dict[str, tuple[dict[str, Any], float]] = {}


class SkillNotFound(FileNotFoundError):
    pass


def load_skill(slug: str) -> dict[str, Any]:
    """读 skill 的 SKILL.md + references/*.md,带 10 分钟缓存。"""
    now = time.time()
    hit = _cache.get(slug)
    if hit and (now - hit[1]) < _CACHE_TTL:
        return hit[0]

    root = SKILL_ROOT / slug
    if not root.exists():
        raise SkillNotFound(f"skill 目录不存在: {root}")

    skill_md = ""
    skill_md_path = root / "SKILL.md"
    if skill_md_path.exists():
        skill_md = skill_md_path.read_text(encoding="utf-8", errors="replace")

    references: dict[str, str] = {}
    refs_dir = root / "references"
    if refs_dir.exists():
        for p in sorted(refs_dir.iterdir()):
            if p.is_file() and p.suffix == ".md":
                try:
                    references[p.stem] = p.read_text(encoding="utf-8", errors="replace")
                except OSError:
                    pass

    data = {
        "slug": slug,
        "root": root,
        "skill_md": skill_md,
        "references": references,
        "scripts_dir": root / "scripts",
        "assets_dir": root / "assets",
    }
    _cache[slug] = (data, now)
    return data


def reference(slug: str, ref_name: str) -> str:
    """取指定 reference 的全文(按文件名不带扩展名)。"""
    skill = load_skill(slug)
    return skill["references"].get(ref_name, "")


def asset_path(slug: str, filename: str) -> Path:
    """返回 skill assets 目录下某文件的路径(不检查存在)。"""
    return load_skill(slug)["assets_dir"] / filename


def script_path(slug: str, filename: str) -> Path:
    """返回 skill scripts 目录下某脚本的路径(不检查存在)。"""
    return load_skill(slug)["scripts_dir"] / filename


def skill_info(slug: str) -> dict:
    """供调试/前端显示用的体积信息。"""
    skill = load_skill(slug)
    refs = skill["references"]
    return {
        "slug": slug,
        "root": str(skill["root"]),
        "skill_md_chars": len(skill["skill_md"]),
        "references": {name: len(text) for name, text in refs.items()},
        "references_total_chars": sum(len(t) for t in refs.values()),
    }


def clear_cache() -> None:
    _cache.clear()
