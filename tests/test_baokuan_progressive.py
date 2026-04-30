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


def _version(key: str) -> dict:
    labels = {"V1": "换皮版", "V2": "狠劲版", "V3": "翻转版", "V4": "圈人版"}
    return {
        "key": key,
        "label": labels[key],
        "content": f"{key} 可用正文：先保住原文开场，再把表达换成清华哥能直接念的版本。" * 5,
        "word_count": 80,
        "gen_id": f"{key}-test",
        "_tokens": 123,
        "tokens": {"total": 123},
        "route_key": "baokuan.rewrite",
        "provider": "hidden",
    }


def test_baokuan_async_exposes_v1_v2_then_ok(tmp_db, monkeypatch):
    from backend.services import baokuan_pipeline
    from backend.services import tasks as tasks_service

    allow_v1 = threading.Event()
    allow_v2 = threading.Event()

    monkeypatch.setattr(baokuan_pipeline.skill_loader, "load_skill", lambda _slug: {"skill_md": "x"})

    def fake_write_single(text, *, version_key, industry, target_action, dna, skill):
        if version_key == "V1":
            assert allow_v1.wait(1)
        if version_key == "V2":
            assert allow_v2.wait(1)
        return _version(version_key)

    monkeypatch.setattr(baokuan_pipeline, "_write_single_version", fake_write_single)

    tid = baokuan_pipeline.rewrite_async("原爆款文案" * 40, mode="pure", dna={"why_hot": "共鸣"})

    allow_v1.set()
    v1_task = _wait_for(lambda: (
        t if (t := tasks_service.get_task(tid))["partial_result"]
        and t["partial_result"]["completed_versions"] == 1 else None
    ))
    assert v1_task["status"] == "running"
    assert [u["key"] for u in v1_task["partial_result"]["units"]] == ["V1"]
    assert v1_task["partial_result"]["total_versions"] == 2
    assert "tokens" not in json.dumps(v1_task["partial_result"], ensure_ascii=False)

    allow_v2.set()
    ok_task = _wait_for(lambda: (
        t if (t := tasks_service.get_task(tid))["status"] == "ok" else None
    ))
    assert [v["key"] for v in ok_task["result"]["versions"]] == ["V1", "V2"]
    assert ok_task["result"]["version_count"] == 2
    assert ok_task["partial_result"] is None


def test_baokuan_all_mode_shows_slow_v4_current_version(tmp_db, monkeypatch):
    from backend.services import baokuan_pipeline
    from backend.services import tasks as tasks_service

    v4_started = threading.Event()
    release_v4 = threading.Event()

    monkeypatch.setattr(baokuan_pipeline.skill_loader, "load_skill", lambda _slug: {"skill_md": "x"})

    def fake_write_single(text, *, version_key, industry, target_action, dna, skill):
        if version_key == "V4":
            v4_started.set()
            assert release_v4.wait(1)
        return _version(version_key)

    monkeypatch.setattr(baokuan_pipeline, "_write_single_version", fake_write_single)

    tid = baokuan_pipeline.rewrite_async(
        "原爆款文案" * 40,
        mode="all",
        industry="餐饮老板",
        target_action="加微信",
        dna={"why_hot": "共鸣"},
    )

    slow_task = _wait_for(lambda: (
        t if v4_started.is_set()
        and (t := tasks_service.get_task(tid))["partial_result"]
        and t["partial_result"]["completed_versions"] == 3
        and any(item.get("status") == "running" and item.get("unit_id") == "V4" for item in t["progress_data"]["timeline"])
        else None
    ))
    assert slow_task["status"] == "running"
    assert "第 4/4 版" in slow_task["progress_text"]
    assert [u["key"] for u in slow_task["partial_result"]["units"]] == ["V1", "V2", "V3"]
    assert slow_task["partial_result"]["total_versions"] == 4

    release_v4.set()
    ok_task = _wait_for(lambda: (
        t if (t := tasks_service.get_task(tid))["status"] == "ok" else None
    ))
    assert ok_task["result"]["version_count"] == 4


def test_baokuan_failure_preserves_completed_versions(tmp_db, monkeypatch):
    from backend.services import baokuan_pipeline
    from backend.services import tasks as tasks_service

    monkeypatch.setattr(baokuan_pipeline.skill_loader, "load_skill", lambda _slug: {"skill_md": "x"})

    def fake_write_single(text, *, version_key, industry, target_action, dna, skill):
        if version_key == "V3":
            raise RuntimeError("V3 暂时没跑完")
        return _version(version_key)

    monkeypatch.setattr(baokuan_pipeline, "_write_single_version", fake_write_single)

    tid = baokuan_pipeline.rewrite_async(
        "原爆款文案" * 40,
        mode="all",
        industry="餐饮老板",
        target_action="加微信",
        dna={"why_hot": "共鸣"},
    )

    failed_task = _wait_for(lambda: (
        t if (t := tasks_service.get_task(tid))["status"] == "failed" else None
    ))
    assert "V3 暂时没跑完" in failed_task["error"]
    assert failed_task["partial_result"]["completed_versions"] == 2
    assert [u["key"] for u in failed_task["partial_result"]["units"]] == ["V1", "V2"]
    assert any(item.get("status") == "failed" and item.get("unit_id") == "V3" for item in failed_task["progress_data"]["timeline"])


def test_baokuan_task_api_sanitizes_result_and_partial(tmp_db):
    from backend.api import app
    from backend.services import tasks as tasks_service

    client = TestClient(app)
    leaked = (
        "已走技能：爆款改写\n\n"
        "可用正文：这段内容可以直接拿去念。"
        "\n\n---\n需要进一步操作吗？\n1. prompt\n2. tokens API model provider"
    )
    leaked_version = {
        "key": "V1",
        "label": "换皮版",
        "content": leaked,
        "word_count": 999,
        "tokens": {"total": 1},
        "route_key": "baokuan.rewrite",
        "model": "hidden",
        "provider": "hidden",
        "prompt": "hidden",
    }
    leaked_partial = {
        "content": leaked,
        "versions": [leaked_version],
        "units": [leaked_version],
        "completed_versions": 1,
        "total_versions": 2,
        "tokens": {"total": 1},
    }

    running_id = tasks_service.create_task("baokuan.rewrite", ns="baokuan", page_id="baokuan")
    tasks_service.update_partial_result(running_id, partial_result=leaked_partial, progress_data={"route": "hidden"})

    failed_id = tasks_service.create_task("baokuan.rewrite", ns="baokuan", page_id="baokuan")
    tasks_service.update_partial_result(failed_id, partial_result=leaked_partial, progress_data={"model": "hidden"})
    tasks_service.finish_task(failed_id, error="V2 failed", status="failed")

    ok_id = tasks_service.create_task("baokuan.rewrite", ns="baokuan", page_id="baokuan")
    tasks_service.finish_task(ok_id, result={**leaked_partial, "versions": [leaked_version, {**leaked_version, "key": "V2"}]})

    for task_id in (running_id, failed_id, ok_id):
        body = client.get(f"/api/tasks/{task_id}").json()
        dumped = json.dumps(body.get("partial_result") or body.get("result"), ensure_ascii=False)
        assert "可用正文" in dumped
        for forbidden in ("已走技能", "需要进一步操作吗", "prompt", "tokens", "API", "route", "model", "provider"):
            assert forbidden not in dumped

    listed = client.get("/api/tasks", params={"ns": "baokuan", "limit": 5}).json()["tasks"]
    dumped_list = json.dumps(listed, ensure_ascii=False)
    for forbidden in ("已走技能", "需要进一步操作吗", "prompt", "tokens", "API", "route", "model", "provider"):
        assert forbidden not in dumped_list
