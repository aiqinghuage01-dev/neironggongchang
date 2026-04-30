from __future__ import annotations

import json
import tempfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient


@pytest.fixture()
def tmp_db(monkeypatch):
    tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
    tmp.close()
    db_path = Path(tmp.name)
    monkeypatch.setattr("shortvideo.config.DB_PATH", db_path)
    from backend.services import migrations

    migrations.reset_for_test()
    yield db_path
    try:
        db_path.unlink()
    except Exception:
        pass


class FakeResult:
    def __init__(self, text: str, total_tokens: int = 123):
        self.text = text
        self.total_tokens = total_tokens


class FakeAI:
    def __init__(self, responses):
        self.responses = list(responses)

    def chat(self, *_args, **_kwargs):
        item = self.responses.pop(0)
        if isinstance(item, Exception):
            raise item
        return item


class FakeCtx:
    def __init__(self):
        self.snapshots = []

    def update_progress(self, text, pct=None):
        self.snapshots.append({"progress_text": text, "pct": pct})

    def update_partial_result(self, *, partial_result=None, progress_data=None, progress_text=None, pct=None):
        self.snapshots.append({
            "partial_result": partial_result,
            "progress_data": progress_data,
            "progress_text": progress_text,
            "pct": pct,
        })


def _latest_progress(ctx: FakeCtx):
    for item in reversed(ctx.snapshots):
        if item.get("progress_data"):
            return item["progress_data"]
    return {}


def _skill(refs=None):
    return {"skill_md": "方法论", "references": refs or {}}


def test_wechat_write_article_emits_stage_timeline(monkeypatch):
    from backend.services import wechat_pipeline

    ctx = FakeCtx()
    monkeypatch.setattr(wechat_pipeline.skill_loader, "load_skill", lambda _slug: _skill({
        "who-is-qinghuage": "人设",
        "writing-methodology": "方法",
        "style-bible": "风格",
    }))
    ai = FakeAI([
        FakeResult("# 标题\n\n正文内容" * 20, 301),
        FakeResult(json.dumps({
            "six_principles": [{"name": "先定性再解释", "pass": True, "issue": ""}],
            "six_dimensions": {"开场抓取力": 18},
            "one_veto": {"triggered": False, "items": []},
            "pass": True,
            "summary": "通过",
        }, ensure_ascii=False), 88),
    ])
    monkeypatch.setattr(wechat_pipeline, "get_ai_client", lambda route_key=None: ai)

    result = wechat_pipeline.write_article("选题", "标题", {"opening": "开场", "core_points": ["一"]}, progress_ctx=ctx)

    assert result["content"].startswith("# 标题")
    data = _latest_progress(ctx)
    assert data["kind"] == "stage_timeline"
    assert data["completed_stages"] == 4
    assert [x["stage"] for x in data["timeline"] if x["status"] == "done"] == ["prepare", "write", "check", "finish"]


def test_voice_write_failure_marks_failed_stage(monkeypatch):
    from backend.services import voicerewrite_pipeline

    ctx = FakeCtx()
    monkeypatch.setattr(voicerewrite_pipeline.skill_loader, "load_skill", lambda _slug: _skill({"rewrite-checklist": "清单"}))
    monkeypatch.setattr(
        voicerewrite_pipeline,
        "get_ai_client",
        lambda route_key=None: FakeAI([FakeResult("{}", 77)]),
    )

    with pytest.raises(RuntimeError):
        voicerewrite_pipeline.write_script(
            "原文",
            {"core_view": "观点"},
            {"label": "A. 角度", "why": "理由"},
            progress_ctx=ctx,
        )

    data = _latest_progress(ctx)
    assert data["current_stage"] == "check"
    assert any(item["stage"] == "check" and item["status"] == "failed" for item in data["timeline"])


def test_planner_write_emits_stage_timeline(monkeypatch):
    from backend.services import planner_pipeline

    ctx = FakeCtx()
    monkeypatch.setattr(planner_pipeline.skill_loader, "load_skill", lambda _slug: _skill())
    monkeypatch.setattr(
        planner_pipeline,
        "get_ai_client",
        lambda route_key=None: FakeAI([FakeResult(json.dumps({
            "before_event": {"title": "活动前准备"},
            "during_event": {"title": "活动中时间线"},
            "summary": "一天活动拆成多条内容",
        }, ensure_ascii=False), 99)]),
    )

    result = planner_pipeline.write_plan(
        "活动 brief",
        {"人数": 100},
        {"name": "标准", "total": 800},
        progress_ctx=ctx,
    )

    assert result["plan"]["summary"]
    data = _latest_progress(ctx)
    assert data["completed_stages"] == 3
    assert data["timeline"][-1]["stage"] == "finish"


def test_copy_task_api_sanitizes_timeline_result_and_error(tmp_db):
    from backend.api import app
    from backend.services import tasks as tasks_service

    client = TestClient(app)
    leaked = {
        "content": "可展示正文",
        "tokens": {"total": 1},
        "route_key": "hidden",
        "model": "hidden",
        "provider": "hidden",
        "prompt": "hidden",
        "raw": "hidden",
        "api_base": "hidden",
    }
    progress_data = {
        "timeline": [
            {"stage": "write", "label": "改写正文", "status": "failed", "text": "停在改写正文", "tokens": 1},
        ],
        "route": "hidden",
        "model": "hidden",
        "raw": "hidden",
    }

    ids = []
    for kind, ns in [
        ("wechat.write", "wechat"),
        ("voicerewrite.write", "voicerewrite"),
        ("planner.write", "planner"),
    ]:
        tid = tasks_service.create_task(kind, ns=ns, page_id=ns)
        tasks_service.update_partial_result(tid, partial_result=leaked, progress_data=progress_data)
        tasks_service.finish_task(
            tid,
            result=leaked,
            error="RuntimeError: tokens=123 prompt=abc route=hidden model=hidden provider=hidden",
            status="failed",
        )
        ids.append(tid)

    for tid in ids:
        body = client.get(f"/api/tasks/{tid}").json()
        dumped = json.dumps(body, ensure_ascii=False)
        for forbidden in ("tokens", "prompt", "route", "model", "provider", "raw", "api_base"):
            assert forbidden not in dumped
        assert body["error"] == "这一步没跑成，通常重试一次就好。"
