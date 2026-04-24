"""所有已接入 skill 的结构完整性烟雾测试 (D-010 范式验证)。

检查 skill 目录结构 + 本项目已注册 endpoint 的一一对应。
接入新 skill 后,在 REGISTERED_SKILLS 里加一行即可。
"""
from __future__ import annotations

from pathlib import Path
import pytest
from backend.services import skill_loader


# 已接入的所有 skill (slug, api_prefix, has_scripts)
REGISTERED_SKILLS = [
    ("公众号文章",       "wechat",        True),
    ("热点文案改写V2",   "hotrewrite",    False),
    ("录音文案改写",     "voicerewrite",  False),
    ("touliu-agent",     "touliu",        True),
]


@pytest.mark.parametrize("slug,api_prefix,has_scripts", REGISTERED_SKILLS)
def test_skill_directory_exists(slug, api_prefix, has_scripts):
    """每个接入的 skill 都能被 skill_loader 找到。"""
    skill = skill_loader.load_skill(slug)
    assert skill["skill_md"], f"{slug} SKILL.md 缺失"


@pytest.mark.parametrize("slug,api_prefix,has_scripts", REGISTERED_SKILLS)
def test_skill_pipeline_module_importable(slug, api_prefix, has_scripts):
    """每个接入的 skill 对应的 pipeline 模块能导入。"""
    import importlib
    mod_name = {
        "wechat": "backend.services.wechat_pipeline",
        "hotrewrite": "backend.services.hotrewrite_pipeline",
        "voicerewrite": "backend.services.voicerewrite_pipeline",
        "touliu": "backend.services.touliu_pipeline",
    }[api_prefix]
    importlib.import_module(mod_name)


@pytest.mark.parametrize("slug,api_prefix,has_scripts", REGISTERED_SKILLS)
def test_skill_api_endpoints_registered(slug, api_prefix, has_scripts):
    """每个 skill 的 /skill-info endpoint 都注册了。"""
    from backend import api as api_mod
    routes = [r.path for r in api_mod.app.routes]
    assert f"/api/{api_prefix}/skill-info" in routes, f"{slug} 缺少 /skill-info"


@pytest.mark.parametrize("slug,api_prefix,has_scripts", REGISTERED_SKILLS)
def test_skill_frontend_jsx_exists(slug, api_prefix, has_scripts):
    """每个 skill 有对应的前端 jsx 文件。"""
    root = Path(__file__).parent.parent / "web"
    # 公众号比较特殊,jsx 叫 factory-wechat-v2.jsx
    jsx_path = root / f"factory-{api_prefix}-v2.jsx"
    assert jsx_path.exists(), f"{slug} 缺少前端 {jsx_path.name}"


def test_skills_in_sidebar():
    """新接入 skill 的 sidebar 入口已加(或沿用原有 id 如 touliu→ad)。"""
    shell_jsx = (Path(__file__).parent.parent / "web" / "factory-shell.jsx").read_text(encoding="utf-8")
    # 旧 sidebar id → 被 skill 覆盖
    sidebar_aliases = {"touliu": "ad"}
    for slug, api_prefix, has_scripts in REGISTERED_SKILLS:
        # wechat 是默认 sidebar 项
        if api_prefix == "wechat":
            assert 'id: "wechat"' in shell_jsx
            continue
        expected_id = sidebar_aliases.get(api_prefix, api_prefix)
        assert f'id: "{expected_id}"' in shell_jsx, f"sidebar 缺少 {expected_id}(skill {slug})"


def test_skill_routes_registered_in_ai_py():
    """每个 skill 都应该在 DEFAULT_ENGINE_ROUTES 里有至少一条路由。"""
    from shortvideo.ai import DEFAULT_ENGINE_ROUTES
    keys = " ".join(DEFAULT_ENGINE_ROUTES.keys())
    for slug, api_prefix, _ in REGISTERED_SKILLS:
        # touliu 用 touliu.generate 不是 touliu.analyze/write
        # wechat 用 wechat.titles/outline/write 等多个
        # 都能在 keys 里找到 api_prefix.
        assert api_prefix + "." in keys, f"{api_prefix}.* 路由未注册"
