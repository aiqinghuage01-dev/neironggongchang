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
    assert _resolve_engine("touliu.generate.quick") == "opus"


def test_touliu_quick_route_uses_opus_fail_fast_client(monkeypatch):
    """T-021: DeepSeek 认证不可用时,快出默认走 Opus 且不叠加重试。"""
    monkeypatch.setattr("backend.services.settings.get_all", lambda: {})

    raw = ai_mod._build_raw_client("opus", route_key="touliu.generate.quick")

    assert _resolve_engine("touliu.generate.quick") == "opus"
    assert type(raw).__name__ == "ClaudeOpusClient"
    assert raw.timeout <= 55
    assert raw.llm_max_retries == 0
    assert raw.sdk_max_retries == 0
    assert raw._client.max_retries == 0


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


def test_get_ai_info_can_use_short_probe_options(monkeypatch):
    """总健康检查可以用短 timeout + 不重试, 避免被完整 AI 探活拖慢。"""
    captured = {}

    class FakeClaudeClient:
        def __init__(self, **kwargs):
            captured.update(kwargs)

        def health(self):
            return {"ok": False, "error": "timeout"}

    monkeypatch.setattr("backend.services.settings.get_all", lambda: {"ai_engine": "opus"})
    monkeypatch.setattr(ai_mod, "ClaudeOpusClient", FakeClaudeClient)

    info = ai_mod.get_ai_info(timeout=3.0, llm_max_retries=0)

    assert info["engine"] == "opus"
    assert captured["timeout"] == 3.0
    assert captured["llm_max_retries"] == 0
