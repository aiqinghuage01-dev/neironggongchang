"""remote_jobs 测试 (D-078a).

验证远程长任务持久化 + watcher 框架:
- register / mark_done / mark_failed / mark_timeout
- tick_once: 注册 fake provider, 模拟 done/failed/timeout 终态路径
- 关联 task_id 时 watcher 完成会 finish_associated_task
- sweep_stuck 跳过 remote_managed=true 的 task (避免 watchdog 假杀正在等远程的 task)
- 进程重启接管 (DB 持久化 → 重 import 后 list_pending 能拿到)
"""
from __future__ import annotations

import importlib
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
    from backend.services import remote_jobs as rj
    from backend.services import tasks as ts
    importlib.reload(rj)
    importlib.reload(ts)
    yield p
    try:
        p.unlink()
    except Exception:
        pass


# ─── register / get ───────────────────────────────────────────────

def test_register_returns_id_and_persists(tmp_db):
    from backend.services import remote_jobs as rj
    rj_id = rj.register(
        provider="dreamina", submit_id="sid_abc", task_id=None,
        submit_payload={"prompt": "test"},
    )
    assert rj_id and len(rj_id) > 8
    row = rj.get(rj_id)
    assert row is not None
    assert row["provider"] == "dreamina"
    assert row["submit_id"] == "sid_abc"
    assert row["last_status"] == "pending"
    assert row["poll_count"] == 0
    assert row["submit_payload"] == {"prompt": "test"}


def test_get_by_submit_id(tmp_db):
    from backend.services import remote_jobs as rj
    rj.register(provider="dreamina", submit_id="sid_x", submit_payload=None)
    found = rj.get_by_submit_id("sid_x")
    assert found is not None
    assert found["submit_id"] == "sid_x"
    assert rj.get_by_submit_id("does_not_exist") is None


# ─── list_pending ─────────────────────────────────────────────────

def test_list_pending_excludes_terminal(tmp_db):
    from backend.services import remote_jobs as rj
    a = rj.register(provider="p1", submit_id="a", submit_payload=None)
    b = rj.register(provider="p1", submit_id="b", submit_payload=None)
    c = rj.register(provider="p2", submit_id="c", submit_payload=None)
    rj.mark_done(b, result={"ok": 1})
    rj.mark_failed(c, error="bad")

    pending = rj.list_pending()
    ids = {r["id"] for r in pending}
    assert a in ids
    assert b not in ids
    assert c not in ids


def test_list_pending_filter_by_provider(tmp_db):
    from backend.services import remote_jobs as rj
    a = rj.register(provider="dreamina", submit_id="a", submit_payload=None)
    b = rj.register(provider="hedra", submit_id="b", submit_payload=None)
    pending_d = rj.list_pending(provider="dreamina")
    pending_h = rj.list_pending(provider="hedra")
    assert {r["id"] for r in pending_d} == {a}
    assert {r["id"] for r in pending_h} == {b}


# ─── update_status / mark_* ───────────────────────────────────────

def test_update_status_bumps_poll_count(tmp_db):
    from backend.services import remote_jobs as rj
    rj_id = rj.register(provider="p", submit_id="s", submit_payload=None)
    rj.update_status(rj_id, "querying")
    rj.update_status(rj_id, "querying")
    row = rj.get(rj_id)
    assert row["last_status"] == "querying"
    assert row["poll_count"] == 2
    assert row["last_poll_at"] is not None


def test_mark_done_writes_result_and_finished(tmp_db):
    from backend.services import remote_jobs as rj
    rj_id = rj.register(provider="p", submit_id="s", submit_payload=None)
    rj.mark_done(rj_id, result={"mp4": ["/tmp/a.mp4"]})
    row = rj.get(rj_id)
    assert row["last_status"] == "done"
    assert row["finished_at"] is not None
    assert row["result"] == {"mp4": ["/tmp/a.mp4"]}


def test_mark_failed_writes_error(tmp_db):
    from backend.services import remote_jobs as rj
    rj_id = rj.register(provider="p", submit_id="s", submit_payload=None)
    rj.mark_failed(rj_id, error="boom")
    row = rj.get(rj_id)
    assert row["last_status"] == "failed"
    assert row["error"] == "boom"


def test_mark_timeout_keeps_recoverable(tmp_db):
    from backend.services import remote_jobs as rj
    rj_id = rj.register(provider="p", submit_id="s", submit_payload=None)
    rj.mark_timeout(rj_id)
    row = rj.get(rj_id)
    assert row["last_status"] == "timeout"
    assert "重查" in (row["error"] or "")
    # 重置后 watcher 重新接管
    rj.reset_for_recover(rj_id)
    row2 = rj.get(rj_id)
    assert row2["last_status"] == "pending"
    assert row2["finished_at"] is None
    assert row2["error"] is None


# ─── provider 注册 ────────────────────────────────────────────────

def test_register_provider_idempotent(tmp_db):
    from backend.services import remote_jobs as rj
    fn = lambda sid: {"status": "querying"}
    rj.register_provider("p1", fn)
    rj.register_provider("p1", fn)  # 覆盖, 不报错
    assert rj.get_provider("p1") is not None
    assert "p1" in rj.list_providers()


# ─── tick_once 端到端 ─────────────────────────────────────────────

def test_tick_polls_done_and_finishes_task(tmp_db):
    from backend.services import remote_jobs as rj
    from backend.services import tasks as ts

    # 创建关联 task (running, remote_managed=true)
    tid = ts.create_task(
        kind="dreamina.text2video", label="test",
        payload={"remote_managed": True, "submit_id": "sid_done"},
    )
    rj_id = rj.register(provider="fake", submit_id="sid_done", task_id=tid,
                        submit_payload={"prompt": "p"})

    # fake provider 一次返回 done
    on_done_called = []
    def fake_poll(sid):
        return {"status": "done", "result": {"mp4": "/tmp/a.mp4"}}
    def fake_on_done(rj_row, result):
        on_done_called.append((rj_row["submit_id"], result))
    rj.register_provider("fake", fake_poll, on_done=fake_on_done)

    counts = rj.tick_once()
    assert counts["polled"] == 1
    assert counts["done"] == 1

    row = rj.get(rj_id)
    assert row["last_status"] == "done"
    # task 也被 finish 成 ok
    task = ts.get_task(tid)
    assert task["status"] == "ok"
    assert task["result"] == {"mp4": "/tmp/a.mp4"}
    # on_done 回调跑了
    assert len(on_done_called) == 1
    assert on_done_called[0][0] == "sid_done"


def test_tick_handles_failed(tmp_db):
    from backend.services import remote_jobs as rj
    from backend.services import tasks as ts
    tid = ts.create_task(kind="dreamina.x", payload={"remote_managed": True})
    rj_id = rj.register(provider="fake_fail", submit_id="s", task_id=tid, submit_payload=None)

    rj.register_provider("fake_fail", lambda s: {"status": "failed", "error": "remote 拒了"})
    counts = rj.tick_once()
    assert counts["failed"] == 1
    assert rj.get(rj_id)["last_status"] == "failed"
    task = ts.get_task(tid)
    assert task["status"] == "failed"
    assert "remote 拒了" in (task["error"] or "")


def test_tick_keeps_pending_on_querying(tmp_db):
    from backend.services import remote_jobs as rj
    rj_id = rj.register(provider="fake_q", submit_id="s", submit_payload=None)
    rj.register_provider("fake_q", lambda s: {"status": "querying"})
    counts = rj.tick_once()
    assert counts["polled"] == 1
    assert counts["done"] == 0
    assert counts["failed"] == 0
    row = rj.get(rj_id)
    assert row["last_status"] == "querying"
    assert row["poll_count"] == 1


def test_tick_marks_timeout_when_max_wait_exceeded(tmp_db):
    from backend.services import remote_jobs as rj
    from backend.services import tasks as ts
    tid = ts.create_task(kind="dreamina.x", payload={"remote_managed": True})
    rj_id = rj.register(
        provider="fake_slow", submit_id="s", task_id=tid,
        submit_payload=None, max_wait_sec=10,
    )
    # 把 submitted_at 改到 1h 前
    long_ago = int(time.time()) - 3600
    with sqlite3.connect(str(tmp_db)) as con:
        con.execute("UPDATE remote_jobs SET submitted_at=? WHERE id=?", (long_ago, rj_id))
        con.commit()
    rj.register_provider("fake_slow", lambda s: {"status": "querying"})
    counts = rj.tick_once()
    assert counts["timeout"] == 1
    assert rj.get(rj_id)["last_status"] == "timeout"
    task = ts.get_task(tid)
    assert task["status"] == "failed"
    assert "重查" in (task["error"] or "")


def test_tick_skips_when_no_provider(tmp_db):
    from backend.services import remote_jobs as rj
    rj_id = rj.register(provider="missing_provider", submit_id="s", submit_payload=None)
    counts = rj.tick_once()
    # 没 provider 不算 polled, 也不会 done/failed
    assert counts["polled"] == 0
    assert counts["done"] == 0
    # row 还在 pending, 等之后注册了 provider 重新被处理
    row = rj.get(rj_id)
    assert row["last_status"] == "pending"


def test_tick_swallows_poll_exception(tmp_db):
    from backend.services import remote_jobs as rj
    rj_id = rj.register(provider="fake_err", submit_id="s", submit_payload=None)
    def bad_poll(sid):
        raise RuntimeError("network down")
    rj.register_provider("fake_err", bad_poll)
    counts = rj.tick_once()
    assert counts["error"] == 1
    # 还在 pending (变 poll_error 中间态), watcher 下轮再试
    row = rj.get(rj_id)
    assert row["last_status"] == "poll_error"


# ─── sweep_stuck 跳过 remote_managed ─────────────────────────────

def test_sweep_stuck_skips_remote_managed(tmp_db):
    """remote_managed=true 的 task 由 remote_jobs watcher 接管, watchdog 别假杀."""
    from backend.services import tasks as ts
    tid_remote = ts.create_task(
        kind="dreamina.text2video", estimated_seconds=30,
        payload={"remote_managed": True, "submit_id": "sid"},
    )
    tid_local = ts.create_task(kind="hotrewrite.write", estimated_seconds=10)

    # 都改成 1 小时前起跑 → 都 expired
    long_ago = int(time.time()) - 3600
    with sqlite3.connect(str(tmp_db)) as con:
        con.execute("UPDATE tasks SET started_ts=? WHERE id IN (?,?)",
                    (long_ago, tid_remote, tid_local))
        con.commit()

    n = ts.sweep_stuck()
    assert n == 1
    assert ts.get_task(tid_remote)["status"] == "running"  # 没被假杀
    assert ts.get_task(tid_local)["status"] == "failed"


# ─── start_watcher idempotent ─────────────────────────────────────

def test_start_watcher_only_once(tmp_db):
    from backend.services import remote_jobs as rj
    first = rj.start_watcher()
    second = rj.start_watcher()
    third = rj.start_watcher()
    assert first is True
    assert second is False
    assert third is False


# ─── 进程重启接管 ───────────────────────────────────────────────────

def test_pending_survives_module_reload(tmp_db):
    """模拟进程重启 — DB 行还在, 重 import 模块后 list_pending 仍能拿到, watcher 接管."""
    from backend.services import remote_jobs as rj
    rj_id = rj.register(provider="dreamina", submit_id="alive_after_restart", submit_payload={"prompt": "x"})
    # 模拟重启 — 重新 reload 模块
    importlib.reload(rj)
    pending = rj.list_pending()
    assert any(r["id"] == rj_id for r in pending)


# ─── stats ────────────────────────────────────────────────────────

def test_stats_groups_by_status(tmp_db):
    from backend.services import remote_jobs as rj
    a = rj.register(provider="p", submit_id="a", submit_payload=None)
    b = rj.register(provider="p", submit_id="b", submit_payload=None)
    c = rj.register(provider="p", submit_id="c", submit_payload=None)
    rj.mark_done(a)
    rj.mark_failed(b, error="x")
    s = rj.stats()
    assert s["done"] == 1
    assert s["failed"] == 1
    assert s["pending"] == 1
    assert s["total"] == 3
