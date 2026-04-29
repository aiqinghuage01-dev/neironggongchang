from __future__ import annotations

import tempfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient


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


def test_tasks_counts_endpoint_is_not_treated_as_task_id(client):
    from backend.services import tasks as tasks_service

    tasks_service.create_task("touliu.generate", ns="touliu")
    tid = tasks_service.create_task("wechat.write", ns="wechat")
    tasks_service.finish_task(tid, result={"ok": True})

    r = client.get("/api/tasks/counts")
    assert r.status_code == 200
    body = r.json()
    assert body["running"] == 1
    assert body["ok"] == 1
    assert body["active"] == 1
