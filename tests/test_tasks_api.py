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


def test_hotrewrite_task_detail_sanitizes_legacy_internal_output(client):
    from backend.services import tasks as tasks_service

    leaked = (
        "已走技能：热点文案改写V2\n\n"
        "别只看爆单，先看他说了哪三句话。"
        "\n\n---\n需要进一步操作吗？\n1. 用「公众号文章」skill 延展成长文"
    )
    tid = tasks_service.create_task("hotrewrite.write", ns="hotrewrite")
    tasks_service.finish_task(tid, result={
        "content": leaked,
        "word_count": 999,
        "versions": [
            {"content": leaked, "word_count": 999, "variant_id": "biz_v4"},
        ],
    })

    raw = tasks_service.get_task(tid)
    assert "已走技能" in raw["result"]["content"]

    detail = client.get(f"/api/tasks/{tid}")
    assert detail.status_code == 200
    result = detail.json()["result"]
    assert result["content"] == "别只看爆单，先看他说了哪三句话。"
    assert result["versions"][0]["content"] == "别只看爆单，先看他说了哪三句话。"
    assert result["word_count"] < 999
    assert "已走技能" not in result["content"]
    assert "需要进一步操作吗" not in result["versions"][0]["content"]


def test_hotrewrite_task_list_sanitizes_legacy_internal_output(client):
    from backend.services import tasks as tasks_service

    leaked = (
        "以下是正文：\n\n"
        "直播间爆单不是设备变了，而是信任顺序变了。"
        "\n需要进一步操作吗？\n1. 换个角度重写"
    )
    tid = tasks_service.create_task("hotrewrite.write", ns="hotrewrite")
    tasks_service.finish_task(tid, result={
        "content": leaked,
        "versions": [{"content": leaked, "word_count": 999}],
    })

    listed = client.get("/api/tasks", params={"ns": "hotrewrite", "limit": 5})
    assert listed.status_code == 200
    task = next(t for t in listed.json()["tasks"] if t["id"] == tid)
    assert task["result"]["content"] == "直播间爆单不是设备变了，而是信任顺序变了。"
    assert "以下是正文" not in task["result"]["content"]
    assert "需要进一步操作吗" not in task["result"]["versions"][0]["content"]
