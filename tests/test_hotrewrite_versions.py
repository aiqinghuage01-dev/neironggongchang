"""D-101 热点改写多版本回归.

历史 bug: 前端写着"本次会出 2/4 篇",但后端 /api/hotrewrite/write 忽略 modes,
只生成 1 篇,结果页也只能看一版.
"""
from __future__ import annotations

from fastapi.testclient import TestClient

from backend.services import hotrewrite_pipeline


def test_build_write_variants_matches_frontend_copy():
    assert [v["variant_id"] for v in hotrewrite_pipeline.build_write_variants({"with_biz": True})] == [
        "biz_v3", "biz_v4",
    ]
    assert [v["variant_id"] for v in hotrewrite_pipeline.build_write_variants({"with_biz": False, "pure_rewrite": True})] == [
        "pure_v1", "pure_v2",
    ]
    assert [v["variant_id"] for v in hotrewrite_pipeline.build_write_variants({"with_biz": True, "pure_rewrite": True})] == [
        "pure_v1", "pure_v2", "biz_v3", "biz_v4",
    ]
    # 前端至少保留一个; 后端也兜底.
    assert [v["variant_id"] for v in hotrewrite_pipeline.build_write_variants({"with_biz": False, "pure_rewrite": False})] == [
        "biz_v3", "biz_v4",
    ]


def test_write_script_batch_returns_switchable_versions(monkeypatch):
    calls = []

    def fake_write_script(_hotspot, _breakdown, _angle, *, variant=None):
        calls.append(variant["variant_id"])
        return {
            "content": f"正文 {variant['variant_id']}",
            "word_count": 100 + len(calls),
            "self_check": {"pass": True},
            "variant_id": variant["variant_id"],
            "mode_label": variant["mode_label"],
            "tokens": {"write": 10, "check": 2},
        }

    monkeypatch.setattr(hotrewrite_pipeline, "write_script", fake_write_script)
    r = hotrewrite_pipeline.write_script_batch(
        "热点",
        {"event_core": "x", "conflict": "y", "emotion": "z"},
        {"label": "A"},
        {"with_biz": True, "pure_rewrite": True},
    )

    assert calls == ["pure_v1", "pure_v2", "biz_v3", "biz_v4"]
    assert r["version_count"] == 4
    assert len(r["versions"]) == 4
    assert r["content"] == "正文 pure_v1"
    assert r["tokens"] == {"write": 40, "check": 8}
    assert r["versions"][2]["mode_label"] == "结合业务 V3 · 翻转版"


def test_hotrewrite_write_api_passes_modes_to_async(monkeypatch):
    captured = {}

    def fake_async(hotspot, breakdown, angle, modes):
        captured.update({"hotspot": hotspot, "breakdown": breakdown, "angle": angle, "modes": modes})
        return "task-d101"

    monkeypatch.setattr(hotrewrite_pipeline, "write_script_async", fake_async)
    monkeypatch.setattr(hotrewrite_pipeline, "build_write_variants", lambda modes: [{"variant_id": "a"}] * 4)

    from backend.api import app
    client = TestClient(app)
    r = client.post("/api/hotrewrite/write", json={
        "hotspot": "某热点",
        "breakdown": {"event_core": "x"},
        "angle": {"label": "A"},
        "modes": {"with_biz": True, "pure_rewrite": True},
    })

    assert r.status_code == 200
    assert r.json()["task_id"] == "task-d101"
    assert r.json()["version_count"] == 4
    assert captured["modes"] == {"with_biz": True, "pure_rewrite": True}
