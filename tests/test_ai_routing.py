"""AI 引擎智能路由单元测试 (D-011 / D-015)。

不打真 API,只测 _resolve_engine 的优先级和 routes_info 返回结构。
"""
from __future__ import annotations

import pytest

from shortvideo import ai as ai_mod
from shortvideo.ai import _resolve_engine, DEFAULT_ENGINE_ROUTES, routes_info


def test_default_routes_contains_all_skills():
    """接入的 4 个 skill 每个至少有 1 条路由。"""
    keys = set(DEFAULT_ENGINE_ROUTES.keys())
    expected_prefixes = ["wechat.", "hotrewrite.", "voicerewrite.", "touliu.", "rewrite", "ad.", "moments.", "article.", "topics."]
    for pref in expected_prefixes:
        assert any(k.startswith(pref) for k in keys), f"缺少 {pref} 相关路由"


def test_all_routes_point_to_known_engine():
    for key, engine in DEFAULT_ENGINE_ROUTES.items():
        assert engine in ("opus", "deepseek"), f"{key} 指向未知引擎 {engine!r}"


def test_resolve_engine_uses_default_routes(monkeypatch):
    """无 settings override 时返回 DEFAULT_ENGINE_ROUTES 里的值。"""
    monkeypatch.setattr("backend.services.settings.get_all", lambda: {})
    assert _resolve_engine("wechat.titles") == "deepseek"
    assert _resolve_engine("wechat.write") == "opus"
    assert _resolve_engine("touliu.generate") == "opus"


def test_resolve_engine_user_override_wins(monkeypatch):
    """settings.engine_routes 覆盖 DEFAULT。"""
    def fake_settings():
        return {"engine_routes": {"wechat.write": "deepseek"}}
    monkeypatch.setattr("backend.services.settings.get_all", fake_settings)
    assert _resolve_engine("wechat.write") == "deepseek"
    # 其他未覆盖仍走默认
    assert _resolve_engine("wechat.titles") == "deepseek"
    assert _resolve_engine("ad.generate") == "opus"


def test_resolve_engine_unknown_route_falls_back_to_global(monkeypatch):
    """未知 route_key 回退到 settings.ai_engine,再回退到 opus。"""
    monkeypatch.setattr("backend.services.settings.get_all", lambda: {"ai_engine": "deepseek"})
    assert _resolve_engine("unknown.key") == "deepseek"

    monkeypatch.setattr("backend.services.settings.get_all", lambda: {})
    assert _resolve_engine("unknown.key") == "opus"


def test_resolve_engine_no_route_key_uses_global(monkeypatch):
    monkeypatch.setattr("backend.services.settings.get_all", lambda: {"ai_engine": "deepseek"})
    assert _resolve_engine(None) == "deepseek"


def test_routes_info_shape(monkeypatch):
    """/api/ai/routes 返回结构完整。"""
    monkeypatch.setattr("backend.services.settings.get_all", lambda: {"ai_engine": "opus"})
    info = routes_info()
    assert "global_engine" in info
    assert "routes" in info
    assert isinstance(info["routes"], dict)
    # 每条路由都含 default / override / effective 三字段
    for k, v in info["routes"].items():
        assert "default" in v and "effective" in v
