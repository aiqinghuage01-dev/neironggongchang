"""night_executor 任务执行器测试 (D-040b).

执行是后台线程, 用 wait + poll 等到状态稳定后再断言.
"""
from __future__ import annotations

import sqlite3
import tempfile
import time
from pathlib import Path

import pytest


def _wait_run(ns, run_id, timeout=2.0):
    """轮询直到 run 离开 running 状态."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        r = ns.get_run(run_id)
        if r and r["status"] != "running":
            return r
        time.sleep(0.02)
    pytest.fail(f"run {run_id} 一直 running, 超时 {timeout}s")


@pytest.fixture
def tmp_db(monkeypatch):
    tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
    tmp.close()
    p = Path(tmp.name)
    monkeypatch.setattr("shortvideo.config.DB_PATH", p)
    import importlib
    from backend.services import night_shift, night_executor
    importlib.reload(night_shift)
    importlib.reload(night_executor)
    # 隔离 runner 注册表
    night_executor._RUNNERS.clear()
    yield p
    night_executor._RUNNERS.clear()
    try:
        p.unlink()
    except Exception:
        pass


def test_placeholder_runner_when_no_registered(tmp_db):
    """没注册 runner 的 job 走 _placeholder_runner, 立即 success 并写明占位."""
    from backend.services import night_shift as ns, night_executor as ne
    jid = ns.create_job(name="抓热点", trigger_type="cron", skill_slug="content-planner")
    rid = ne.run_job_async(jid)
    r = _wait_run(ns, rid)
    assert r["status"] == "success"
    assert "占位" in (r["output_summary"] or "")
    assert "抓热点" in (r["output_summary"] or "")
    assert "content-planner" in (r["log"] or "")


def test_registered_runner_returns_real_result(tmp_db):
    from backend.services import night_shift as ns, night_executor as ne

    captured: dict = {}

    def fake_runner(job):
        captured["job_id"] = job["id"]
        captured["name"] = job["name"]
        return {
            "output_summary": "5 条选题",
            "output_refs": [{"kind": "material", "id": 1}, {"kind": "material", "id": 2}],
            "log": "ok",
        }

    ne.register_runner("content-planner", fake_runner)
    assert "content-planner" in ne.list_runners()

    jid = ns.create_job(name="抓热点", trigger_type="cron", skill_slug="content-planner")
    rid = ne.run_job_async(jid)
    r = _wait_run(ns, rid)
    assert r["status"] == "success"
    assert r["output_summary"] == "5 条选题"
    assert r["output_refs"] == [{"kind": "material", "id": 1}, {"kind": "material", "id": 2}]
    assert r["log"] == "ok"
    assert captured == {"job_id": jid, "name": "抓热点"}


def test_runner_exception_marks_failed_with_traceback(tmp_db):
    from backend.services import night_shift as ns, night_executor as ne

    def boom_runner(job):
        raise RuntimeError("apimart 余额不足")

    ne.register_runner("boom-skill", boom_runner)
    jid = ns.create_job(name="炸", trigger_type="cron", skill_slug="boom-skill")
    rid = ne.run_job_async(jid)
    r = _wait_run(ns, rid)
    assert r["status"] == "failed"
    log = r["log"] or ""
    assert "RuntimeError" in log
    assert "apimart 余额不足" in log


def test_run_job_async_missing_job_raises(tmp_db):
    from backend.services import night_executor as ne
    with pytest.raises(ValueError):
        ne.run_job_async(99999)


def test_no_skill_slug_falls_back_to_placeholder(tmp_db):
    """skill_slug=None 也走 placeholder, 不能崩."""
    from backend.services import night_shift as ns, night_executor as ne
    jid = ns.create_job(name="manual job", trigger_type="manual")
    rid = ne.run_job_async(jid)
    r = _wait_run(ns, rid)
    assert r["status"] == "success"
    assert "占位" in (r["output_summary"] or "")


def test_concurrent_runs_separate_run_ids(tmp_db):
    from backend.services import night_shift as ns, night_executor as ne

    def slow_runner(job):
        time.sleep(0.05)
        return {"output_summary": "done", "output_refs": None, "log": None}

    ne.register_runner("slow", slow_runner)
    jid = ns.create_job(name="A", trigger_type="manual", skill_slug="slow")
    rids = [ne.run_job_async(jid) for _ in range(3)]
    assert len(set(rids)) == 3  # run_id 唯一
    for rid in rids:
        r = _wait_run(ns, rid)
        assert r["status"] == "success"
