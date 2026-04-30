"""D-101 热点改写多版本回归.

历史 bug: 前端写着"本次会出 2/4 篇",但后端 /api/hotrewrite/write 忽略 modes,
只生成 1 篇,结果页也只能看一版.
"""
from __future__ import annotations

import tempfile
from pathlib import Path
from fastapi.testclient import TestClient
from unittest.mock import MagicMock

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

    assert set(calls) == {"pure_v1", "pure_v2", "biz_v3", "biz_v4"}
    assert r["version_count"] == 4
    assert len(r["versions"]) == 4
    assert r["content"] == "正文 pure_v1"
    assert r["tokens"] == {"write": 40, "check": 8}
    assert r["fallback_count"] == 0
    assert r["versions"][2]["mode_label"] == "结合业务 V3 · 翻转版"


def test_write_script_batch_reports_per_version_progress(monkeypatch):
    def fake_write_script(_hotspot, _breakdown, _angle, *, variant=None):
        return {
            "content": f"正文 {variant['variant_id']}",
            "word_count": 100,
            "self_check": {"pass": True},
            "variant_id": variant["variant_id"],
            "mode_label": variant["mode_label"],
            "tokens": {"write": 10, "check": 2},
        }

    class Ctx:
        def __init__(self):
            self.calls = []

        def update_progress(self, text, pct=None):
            self.calls.append((text, pct))

    ctx = Ctx()
    monkeypatch.setattr(hotrewrite_pipeline, "write_script", fake_write_script)
    hotrewrite_pipeline.write_script_batch(
        "热点",
        {"event_core": "x", "conflict": "y", "emotion": "z"},
        {"label": "A"},
        {"with_biz": True, "pure_rewrite": True},
        ctx=ctx,
    )

    assert ctx.calls[0] == ("准备生成 4 版...", 18)
    assert any(text.startswith("正在写第") for text, _ in ctx.calls)
    assert any(text.startswith("已完成 4/4 版") for text, _ in ctx.calls)
    pct_values = [pct for _, pct in ctx.calls if pct is not None]
    assert pct_values == sorted(pct_values)


def test_write_script_batch_emits_sanitized_partial_versions(monkeypatch):
    leaked = (
        "这是一版能先看的正文。" * 20
        + "\n\n已走技能：热点文案改写V2\nprompt tokens API route model provider submit_id /Users/black.chen"
        + "\n\n---\n需要进一步操作吗？\n1. prompt\n2. tokens"
    )

    def fake_write_script(_hotspot, _breakdown, _angle, *, variant=None):
        return {
            "content": leaked,
            "word_count": 9999,
            "self_check": {"pass": True},
            "variant_id": variant["variant_id"],
            "mode_label": variant["mode_label"],
            "tokens": {"write": 10, "check": 2},
            "route_key": "hotrewrite.write.fast",
        }

    seen = []
    monkeypatch.setattr(hotrewrite_pipeline, "write_script", fake_write_script)
    hotrewrite_pipeline.write_script_batch(
        "热点",
        {"event_core": "x", "conflict": "y", "emotion": "z"},
        {"label": "A"},
        {"with_biz": True},
        on_version=lambda partial, progress, text, pct: seen.append((partial, progress, text, pct)),
    )

    assert seen
    partial, progress, text, pct = seen[0]
    first = partial["versions"][0]
    assert "已走技能" not in first["content"]
    assert "需要进一步操作吗" not in first["content"]
    assert "tokens" not in first
    assert "route_key" not in first
    assert first["word_count"] == hotrewrite_pipeline._count_script_chars(first["content"])
    assert partial["completed_versions"] >= 1
    assert partial["total_versions"] == 2
    assert progress["completed_versions"] >= 1
    assert progress["total_versions"] == 2
    assert "已完成" in text
    assert isinstance(pct, int)


def test_write_script_falls_back_to_fast_route(monkeypatch):
    primary_ai = MagicMock()
    primary_ai.chat = MagicMock(side_effect=RuntimeError("Request timed out"))
    fallback_ai = MagicMock()
    fallback_ai.chat = MagicMock(return_value=MagicMock(text="正常的热点改写文案" * 100, total_tokens=123))
    check_ai = MagicMock()
    check_ai.chat = MagicMock(return_value=MagicMock(text='{"pass": true, "summary": "ok"}', total_tokens=12))

    def get_ai_client_mock(route_key=None, **_):
        if route_key == "hotrewrite.self-check":
            return check_ai
        if route_key == "hotrewrite.write.fast":
            return fallback_ai
        return primary_ai

    monkeypatch.setattr(hotrewrite_pipeline, "get_ai_client", get_ai_client_mock)
    monkeypatch.setattr(hotrewrite_pipeline.skill_loader, "load_skill", lambda _slug: {"skill_md": "skill body"})

    r = hotrewrite_pipeline.write_script(
        "热点",
        {"event_core": "x", "conflict": "y", "emotion": "z"},
        {"label": "A", "audience": "老板", "draft_hook": "开场"},
        variant={
            "variant_id": "biz_v3",
            "mode_label": "结合业务 V3 · 翻转版",
            "instruction": "结合业务",
            "route_key": "hotrewrite.write",
        },
    )

    assert r["fallback_used"] is True
    assert r["route_key"] == "hotrewrite.write.fast"
    assert "Request timed out" in r["primary_error"]
    assert r["tokens"]["write"] == 123
    assert primary_ai.chat.call_count == 1
    assert fallback_ai.chat.call_count == 1


def test_write_script_strips_internal_skill_prelude_and_next_actions(monkeypatch):
    leaked = (
        "已走技能：热点文案改写V2\n\n"
        + "别只看爆单，先看他开口说了哪三句话。" * 120
        + "\n\n---\n需要进一步操作吗？\n1. 用「公众号文章」skill 延展成长文\n2. 用「数字人」生成口播视频"
    )
    write_ai = MagicMock()
    write_ai.chat = MagicMock(return_value=MagicMock(text=leaked, total_tokens=321))
    check_ai = MagicMock()
    check_ai.chat = MagicMock(return_value=MagicMock(text='{"pass": true, "summary": "ok"}', total_tokens=12))

    def get_ai_client_mock(route_key=None, **_):
        return check_ai if route_key == "hotrewrite.self-check" else write_ai

    monkeypatch.setattr(hotrewrite_pipeline, "get_ai_client", get_ai_client_mock)
    monkeypatch.setattr(hotrewrite_pipeline.skill_loader, "load_skill", lambda _slug: {"skill_md": "skill body"})

    r = hotrewrite_pipeline.write_script(
        "热点",
        {"event_core": "x", "conflict": "y", "emotion": "z"},
        {"label": "A", "audience": "老板", "draft_hook": "开场"},
    )

    assert r["content"].startswith("别只看爆单")
    assert "已走技能" not in r["content"]
    assert "需要进一步操作吗" not in r["content"]
    assert "skill" not in r["content"]


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
    assert r.json()["estimated_seconds"] == 360
    assert captured["modes"] == {"with_biz": True, "pure_rewrite": True}


def test_running_hotrewrite_task_exposes_sanitized_partial_versions(monkeypatch):
    tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
    tmp.close()
    db_path = Path(tmp.name)
    monkeypatch.setattr("shortvideo.config.DB_PATH", db_path)
    try:
        from backend.services import migrations
        from backend.services import tasks as tasks_service
        migrations.reset_for_test()
        tid = tasks_service.create_task("hotrewrite.write", ns="hotrewrite", page_id="hotrewrite")
        tasks_service.update_partial_result(
            tid,
            partial_result={
                "content": "已走技能：热点文案改写V2\n\n先出的正文",
                "word_count": 999,
                "versions": [
                    {
                        "content": "先出的正文\n\n已走技能：热点文案改写V2\n需要进一步操作吗？\nprompt tokens API route model provider submit_id /Users/black.chen",
                        "word_count": 999,
                        "mode_label": "纯改写 V1 · 换皮版",
                        "tokens": {"write": 1},
                    }
                ],
                "completed_versions": 1,
                "total_versions": 4,
            },
            progress_data={"completed_versions": 1, "total_versions": 4},
        )

        from backend.api import app
        client = TestClient(app)
        r = client.get(f"/api/tasks/{tid}")

        assert r.status_code == 200
        body = r.json()
        partial = body["partial_result"]
        assert partial["completed_versions"] == 1
        assert partial["total_versions"] == 4
        text = partial["versions"][0]["content"]
        assert "已走技能" not in text
        assert "需要进一步操作吗" not in text
        assert "tokens" not in partial["versions"][0]
        assert partial["versions"][0]["word_count"] == hotrewrite_pipeline._count_script_chars(text)
    finally:
        try:
            db_path.unlink()
        except Exception:
            pass


def test_write_script_async_uses_context_progress(monkeypatch):
    captured = {}

    def fake_run_async(**kwargs):
        captured.update(kwargs)
        return "task-progress"

    monkeypatch.setattr(hotrewrite_pipeline.tasks_service, "run_async", fake_run_async)

    task_id = hotrewrite_pipeline.write_script_async(
        "热点",
        {"event_core": "x"},
        {"label": "A"},
        {"with_biz": True, "pure_rewrite": True},
    )

    assert task_id == "task-progress"
    assert captured.get("sync_fn") is None
    assert captured["sync_fn_with_ctx"] is not None
    assert captured["estimated_seconds"] == 360
