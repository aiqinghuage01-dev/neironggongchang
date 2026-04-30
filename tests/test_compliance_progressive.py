from __future__ import annotations

import json
import tempfile
import threading
import time
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


def _wait_for(predicate, timeout: float = 2.0):
    deadline = time.time() + timeout
    last = None
    while time.time() < deadline:
        last = predicate()
        if last:
            return last
        time.sleep(0.02)
    return last


def _scan():
    return {
        "industry": "美业",
        "scan_scope": "通用+敏感行业(美业)",
        "violations": [
            {"level": "high", "original": "100% 有效", "type": "绝对化", "reason": "承诺过满", "fix": "更稳妥"}
        ],
        "stats": {"high": 1, "medium": 0, "low": 0, "total": 1},
        "summary": "发现 1 处风险",
        "_tokens": 111,
    }


def _version(mode: str):
    body = {
        "content": f"{mode}版可用文案",
        "word_count": 7,
        "compliance": 95 if mode == "保守" else 88,
        "description": f"{mode}说明",
        "_tokens": 222,
        "route_key": "compliance.check",
        "provider": "internal",
    }
    if mode == "营销":
        body["kept_marketing"] = ["痛点", "价格吸引力"]
    return body


def test_compliance_async_exposes_scan_then_conservative_then_ok(tmp_db, monkeypatch):
    from backend.services import compliance_pipeline
    from backend.services import tasks as tasks_service

    allow_conservative = threading.Event()
    allow_marketing = threading.Event()

    monkeypatch.setattr(compliance_pipeline.skill_loader, "load_skill", lambda _slug: {"skill_md": "x", "references": {}})
    monkeypatch.setattr(compliance_pipeline, "_scan_violations", lambda text, industry, skill: _scan())

    def fake_write(text, industry, scan, mode, skill):
        if mode == "保守":
            assert allow_conservative.wait(1)
            return _version("保守")
        assert allow_marketing.wait(1)
        return _version("营销")

    monkeypatch.setattr(compliance_pipeline, "_write_version", fake_write)

    tid = compliance_pipeline.check_compliance_async("100% 有效", "美业")

    scan_task = _wait_for(lambda: (
        t if (t := tasks_service.get_task(tid))["partial_result"] and not t["partial_result"].get("version_a") else None
    ))
    assert scan_task["status"] == "running"
    assert scan_task["partial_result"]["stats"]["total"] == 1
    assert "version_a" not in scan_task["partial_result"]

    allow_conservative.set()
    conservative_task = _wait_for(lambda: (
        t if (t := tasks_service.get_task(tid))["partial_result"] and t["partial_result"].get("version_a") else None
    ))
    assert conservative_task["status"] == "running"
    assert conservative_task["partial_result"]["version_a"]["content"] == "保守版可用文案"
    assert "version_b" not in conservative_task["partial_result"]

    allow_marketing.set()
    ok_task = _wait_for(lambda: (
        t if (t := tasks_service.get_task(tid))["status"] == "ok" else None
    ))
    assert ok_task["result"]["version_a"]["content"] == "保守版可用文案"
    assert ok_task["result"]["version_b"]["content"] == "营销版可用文案"
    assert ok_task["partial_result"] is None


def test_compliance_marketing_failure_preserves_scan_and_conservative_partial(tmp_db, monkeypatch):
    from backend.services import compliance_pipeline
    from backend.services import tasks as tasks_service

    allow_conservative = threading.Event()
    allow_marketing = threading.Event()

    monkeypatch.setattr(compliance_pipeline.skill_loader, "load_skill", lambda _slug: {"skill_md": "x", "references": {}})
    monkeypatch.setattr(compliance_pipeline, "_scan_violations", lambda text, industry, skill: _scan())

    def fake_write(text, industry, scan, mode, skill):
        if mode == "保守":
            assert allow_conservative.wait(1)
            return _version("保守")
        assert allow_marketing.wait(1)
        raise RuntimeError("营销版超时")

    monkeypatch.setattr(compliance_pipeline, "_write_version", fake_write)

    tid = compliance_pipeline.check_compliance_async("100% 有效", "美业")
    assert _wait_for(lambda: tasks_service.get_task(tid)["partial_result"])
    allow_conservative.set()
    assert _wait_for(lambda: tasks_service.get_task(tid)["partial_result"].get("version_a"))
    allow_marketing.set()

    failed_task = _wait_for(lambda: (
        t if (t := tasks_service.get_task(tid))["status"] == "failed" else None
    ))
    partial = failed_task["partial_result"]
    assert partial["stats"]["total"] == 1
    assert partial["version_a"]["content"] == "保守版可用文案"
    assert "version_b" not in partial
    assert "营销版超时" in failed_task["error"]


def test_compliance_task_api_sanitizes_running_failed_partial_and_ok_result(tmp_db):
    from backend.api import app
    from backend.services import tasks as tasks_service

    client = TestClient(app)
    leaked_partial = {
        **_scan(),
        "version_a": {
            **_version("保守"),
            "tokens": {"write": 1},
            "route_key": "compliance.check",
            "model": "hidden",
            "provider": "hidden",
            "prompt": "hidden prompt",
        },
        "tokens": {"total": 333},
        "prompt_preview": "hidden",
    }

    running_id = tasks_service.create_task("compliance.check", ns="compliance", page_id="compliance")
    tasks_service.update_partial_result(running_id, partial_result=leaked_partial, progress_data={"route": "hidden"})

    failed_id = tasks_service.create_task("compliance.check", ns="compliance", page_id="compliance")
    tasks_service.update_partial_result(failed_id, partial_result=leaked_partial, progress_data={"route": "hidden"})
    tasks_service.finish_task(failed_id, error="营销版失败", status="failed")

    ok_id = tasks_service.create_task("compliance.check", ns="compliance", page_id="compliance")
    tasks_service.finish_task(ok_id, result={**leaked_partial, "version_b": _version("营销")})

    for task_id in (running_id, failed_id, ok_id):
        body = client.get(f"/api/tasks/{task_id}").json()
        dumped = json.dumps(body.get("partial_result") or body.get("result"), ensure_ascii=False)
        for forbidden in ("tokens", "route", "model", "provider", "prompt"):
            assert forbidden not in dumped
        assert "保守版可用文案" in dumped

    listed = client.get("/api/tasks", params={"ns": "compliance", "limit": 5}).json()["tasks"]
    dumped_list = json.dumps(listed, ensure_ascii=False)
    for forbidden in ("tokens", "route", "model", "provider", "prompt"):
        assert forbidden not in dumped_list
