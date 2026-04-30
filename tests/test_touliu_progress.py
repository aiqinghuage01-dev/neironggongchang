from __future__ import annotations

import json
import tempfile
from pathlib import Path
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from backend.services import touliu_pipeline


class RecordingCtx:
    def __init__(self):
        self.records = []

    def update_partial_result(self, **kwargs):
        self.records.append(kwargs)

    def update_progress(self, text, pct=None):
        self.records.append({"progress_text": text, "pct": pct})

    def is_cancelled(self):
        return False


@pytest.fixture()
def fake_skill(monkeypatch):
    skill = {
        "skill_md": "方法论" * 1200,
        "references": {
            "style_rules": "风格红线" * 300,
            "winning_patterns": "跑量规律" * 300,
            "industry_templates": "行业模板" * 300,
            "golden_samples": "样本" * 300,
        },
    }
    monkeypatch.setattr(touliu_pipeline.skill_loader, "load_skill", lambda _slug: skill)
    return skill


def _fake_ai(monkeypatch, text: str, total_tokens: int = 1200):
    fake_ai = MagicMock()
    fake_ai.engine_name = "opus"
    fake_ai.chat = MagicMock(return_value=MagicMock(text=text, total_tokens=total_tokens))
    monkeypatch.setattr(touliu_pipeline, "get_ai_client", lambda route_key=None: fake_ai)
    return fake_ai


def test_touliu_n1_progress_tracks_four_readable_stages(monkeypatch, fake_skill):
    _fake_ai(
        monkeypatch,
        text=json.dumps({
            "style_summary": {"opening_mode": "先打经营痛点"},
            "batch": [{
                "no": 1,
                "structure": "痛点型",
                "title": "老板别再硬投",
                "first_line": "你投不动不是素材少。",
                "body": "真正卡住的是成交顺序没讲清楚。",
                "cta": "点头像进直播间",
                "director_check": {"total": 24},
                "tokens": 999,
                "route_key": "touliu.generate.quick",
            }],
        }, ensure_ascii=False),
    )
    ctx = RecordingCtx()

    result = touliu_pipeline.generate_batch(
        pitch="实体店短视频获客",
        industry="餐饮",
        target_action="点头像进直播间",
        n=1,
        channel="直播间",
        progress_ctx=ctx,
    )

    assert len(result["batch"]) == 1
    last = ctx.records[-1]
    partial = last["partial_result"]
    progress = last["progress_data"]
    assert partial["completed_stages"] == 4
    assert [item["label"] for item in progress["timeline"] if item["status"] == "done"] == [
        "准备风格",
        "生成正文",
        "解析结果",
        "自检/整理",
    ]
    public_dump = json.dumps(last, ensure_ascii=False)
    for forbidden in ("tokens", "route", "model", "provider", "prompt", "API", "JSON"):
        assert forbidden not in public_dump


def test_touliu_n1_parse_failure_preserves_friendly_stage(monkeypatch, fake_skill):
    _fake_ai(
        monkeypatch,
        text='```json\n{"style_summary": {"opening_mode": "短"}, "batch": [',
        total_tokens=6051,
    )
    ctx = RecordingCtx()

    with pytest.raises(RuntimeError, match="截断|未闭合"):
        touliu_pipeline.generate_batch(
            pitch="实体店短视频获客",
            industry="餐饮",
            target_action="点头像进直播间",
            n=1,
            channel="直播间",
            progress_ctx=ctx,
        )

    partial = ctx.records[-1]["partial_result"]
    progress = ctx.records[-1]["progress_data"]
    assert partial["friendly_message"] == "内容回传不完整，已经停下。改短一点或重试一次。"
    assert progress["timeline"][-1]["label"] == "解析结果"
    assert progress["timeline"][-1]["status"] == "failed"
    assert "JSON" not in partial["friendly_message"]


@pytest.fixture()
def client(monkeypatch):
    tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
    tmp.close()
    db_path = Path(tmp.name)
    monkeypatch.setattr("shortvideo.config.DB_PATH", db_path)
    from backend.services import migrations

    migrations.reset_for_test()
    from backend.api import app

    yield TestClient(app)
    try:
        db_path.unlink()
    except Exception:
        pass


def test_touliu_task_api_sanitizes_failed_error_and_stage_fields(client):
    from backend.services import tasks as tasks_service

    tid = tasks_service.create_task("touliu.generate", ns="touliu", page_id="ad")
    tasks_service.update_partial_result(
        tid,
        partial_result={
            "mode": "single",
            "friendly_message": "内容回传不完整，已经停下。改短一点或重试一次。",
            "batch": [{"body": "可展示正文", "tokens": 9, "route_key": "touliu.generate.quick"}],
            "tokens": 99,
        },
        progress_data={
            "timeline": [{"stage": "parse", "label": "解析结果", "status": "failed", "route_key": "x"}],
            "provider": "hidden",
        },
        progress_text="结果没整理完整",
        pct=72,
    )
    tasks_service.finish_task(
        tid,
        error="RuntimeError: 投流文案 LLM 输出非 JSON: LLM JSON 疑似被截断 (tokens=6051). 输出头: 'xxx'",
        status="failed",
    )

    data = client.get(f"/api/tasks/{tid}").json()
    assert data["error"] == "内容回传不完整，已经停下。改短一点或重试一次。"
    dumped = json.dumps(data, ensure_ascii=False)
    for forbidden in ("tokens", "route", "model", "provider", "prompt", "API", "JSON"):
        assert forbidden not in dumped
    assert "解析结果" in dumped
    assert "可展示正文" in dumped

    listed = client.get("/api/tasks", params={"ns": "touliu", "limit": 5}).json()
    task = next(t for t in listed["tasks"] if t["id"] == tid)
    list_dump = json.dumps(task, ensure_ascii=False)
    for forbidden in ("tokens", "route", "model", "provider", "prompt", "API", "JSON"):
        assert forbidden not in list_dump
