"""night_scheduler 调度器测试 (D-040c).

不真等 cron tick — 只验证 reload_jobs 把 enabled+cron 的任务挂上,
disabled / file_watch / manual 不挂, 坏 cron 表达式被 skipped.

shutdown() 在 fixture 兜底, 防止线程泄漏到下个测试.
"""
from __future__ import annotations

import sqlite3
import tempfile
import time
from pathlib import Path

import pytest


@pytest.fixture
def tmp_db(monkeypatch):
    tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
    tmp.close()
    p = Path(tmp.name)
    monkeypatch.setattr("shortvideo.config.DB_PATH", p)
    import importlib
    from backend.services import night_shift, night_executor, night_scheduler
    importlib.reload(night_shift)
    importlib.reload(night_executor)
    importlib.reload(night_scheduler)
    night_executor._RUNNERS.clear()
    yield p
    night_executor._RUNNERS.clear()
    try:
        night_scheduler.shutdown()
    except Exception:
        pass
    try:
        p.unlink()
    except Exception:
        pass


def test_start_idempotent(tmp_db):
    from backend.services import night_scheduler as ns
    ns.start()
    assert ns.is_running() is True
    ns.start()  # 第二次 start 不应崩
    assert ns.is_running() is True


def test_reload_picks_enabled_cron_only(tmp_db):
    from backend.services import night_shift as nshift, night_scheduler as ns
    j_cron_on = nshift.create_job(
        name="抓热点", trigger_type="cron",
        trigger_config={"cron": "0 23 * * *"}, enabled=True,
    )
    nshift.create_job(  # disabled cron, 不挂
        name="dis", trigger_type="cron",
        trigger_config={"cron": "0 6 * * *"}, enabled=False,
    )
    nshift.create_job(  # file_watch, 不挂 (D-040f 才接)
        name="一鱼多吃", trigger_type="file_watch",
        trigger_config={"path": "data/inbox/audio/"}, enabled=True,
    )
    nshift.create_job(name="手动", trigger_type="manual", enabled=True)

    ns.start()
    listed = ns.list_scheduled()
    assert len(listed) == 1
    assert listed[0]["night_job_id"] == j_cron_on
    assert listed[0]["next_run_time"] is not None


def test_reload_skips_missing_or_bad_cron(tmp_db):
    from backend.services import night_shift as nshift, night_scheduler as ns
    nshift.create_job(name="无 cron", trigger_type="cron",
                      trigger_config={}, enabled=True)
    nshift.create_job(name="坏 cron", trigger_type="cron",
                      trigger_config={"cron": "not a cron"}, enabled=True)
    nshift.create_job(name="好 cron", trigger_type="cron",
                      trigger_config={"cron": "*/5 * * * *"}, enabled=True)
    ns.start()
    listed = ns.list_scheduled()
    assert len(listed) == 1
    info = ns.reload_jobs()
    assert info["scheduled"] == 1
    assert len(info["skipped"]) == 2
    reasons = " ".join(s["reason"] for s in info["skipped"])
    assert "no cron" in reasons
    assert "bad cron" in reasons


def test_reload_after_disable_removes_job(tmp_db):
    from backend.services import night_shift as nshift, night_scheduler as ns
    jid = nshift.create_job(name="A", trigger_type="cron",
                            trigger_config={"cron": "0 23 * * *"}, enabled=True)
    ns.start()
    assert len(ns.list_scheduled()) == 1
    nshift.set_enabled(jid, False)
    ns.reload_jobs()
    assert len(ns.list_scheduled()) == 0


def test_reload_after_create_adds_job(tmp_db):
    from backend.services import night_shift as nshift, night_scheduler as ns
    ns.start()
    assert len(ns.list_scheduled()) == 0
    nshift.create_job(name="A", trigger_type="cron",
                      trigger_config={"cron": "0 23 * * *"}, enabled=True)
    ns.reload_jobs()
    assert len(ns.list_scheduled()) == 1


def test_fire_calls_executor(tmp_db, monkeypatch):
    """模拟 cron 触发: 直接调内部 _fire(), 验证 night_executor.run_job_async 被叫到."""
    from backend.services import night_shift as nshift, night_scheduler as ns
    from backend.services import night_executor as ne

    captured = []

    def fake_runner(job):
        captured.append(job["id"])
        return {"output_summary": "fired", "output_refs": None, "log": None}

    ne.register_runner("test-skill", fake_runner)
    jid = nshift.create_job(name="t", trigger_type="cron", skill_slug="test-skill",
                            trigger_config={"cron": "0 23 * * *"}, enabled=True)
    ns._fire(jid)
    # _fire spawns daemon thread → wait for finish
    deadline = time.time() + 2.0
    while time.time() < deadline:
        runs = nshift.list_runs(job_id=jid)
        if runs and runs[0]["status"] != "running":
            break
        time.sleep(0.02)
    assert captured == [jid]
    runs = nshift.list_runs(job_id=jid)
    assert runs[0]["status"] == "success"
    assert runs[0]["output_summary"] == "fired"


def test_reload_when_not_running_returns_empty(tmp_db):
    from backend.services import night_scheduler as ns
    info = ns.reload_jobs()
    assert info == {"running": False, "scheduled": 0, "skipped": 0}


def test_shutdown_clears_state(tmp_db):
    from backend.services import night_shift as nshift, night_scheduler as ns
    nshift.create_job(name="A", trigger_type="cron",
                      trigger_config={"cron": "0 23 * * *"}, enabled=True)
    ns.start()
    assert ns.is_running()
    ns.shutdown()
    assert not ns.is_running()
    assert ns.list_scheduled() == []
