"""tasks 恢复 + watchdog 测试 (D-068)。

验证两层防御:
1. recover_orphans() — 启动时把上次进程没收尾的 pending/running 全标 failed
2. sweep_stuck()    — 周期 watchdog 把跑超时的 running 标 failed
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
    from backend.services import tasks as tasks_service
    importlib.reload(tasks_service)
    yield p
    try:
        p.unlink()
    except Exception:
        pass


# ─── recover_orphans ─────────────────────────────────

def test_recover_orphans_kills_pending_and_running(tmp_db):
    from backend.services import tasks as t
    tid_run = t.create_task("hotrewrite.write", label="跑了一半的")
    tid_pend = t.create_task("baokuan.rewrite", label="还没跑的")
    # create_task 默认 status='running', pending 要手动改
    with sqlite3.connect(str(tmp_db)) as con:
        con.execute("UPDATE tasks SET status='pending' WHERE id=?", (tid_pend,))
        con.commit()

    n = t.recover_orphans()
    assert n == 2

    r1 = t.get_task(tid_run)
    r2 = t.get_task(tid_pend)
    assert r1["status"] == "failed"
    assert r2["status"] == "failed"
    assert "服务重启" in (r1["error"] or "")
    assert "服务重启" in (r2["error"] or "")
    assert r1["finished_ts"] is not None
    assert r2["finished_ts"] is not None


def test_recover_orphans_skips_finished(tmp_db):
    from backend.services import tasks as t
    tid_ok = t.create_task("k1")
    t.finish_task(tid_ok, result={"v": 1})
    tid_fail = t.create_task("k2")
    t.finish_task(tid_fail, error="老错误")
    tid_canc = t.create_task("k3")
    t.cancel_task(tid_canc)

    pre_ok = t.get_task(tid_ok)
    pre_fail = t.get_task(tid_fail)
    pre_canc = t.get_task(tid_canc)

    n = t.recover_orphans()
    assert n == 0  # 全是已收尾态, 不动

    assert t.get_task(tid_ok)["status"] == "ok"
    assert t.get_task(tid_ok)["result"] == pre_ok["result"]
    assert t.get_task(tid_fail)["status"] == "failed"
    assert t.get_task(tid_fail)["error"] == "老错误"  # 原 error 没被改写
    assert t.get_task(tid_canc)["status"] == "cancelled"


def test_recover_orphans_returns_zero_when_empty(tmp_db):
    from backend.services import tasks as t
    n = t.recover_orphans()
    assert n == 0


# ─── sweep_stuck ─────────────────────────────────────

def test_sweep_stuck_kills_overdue_running(tmp_db):
    """estimated=10s, 实际 started 1 小时前 → 1 * 5 = 50s 阈值, 已超 → kill"""
    from backend.services import tasks as t
    tid = t.create_task("hotrewrite.write", estimated_seconds=10)
    # 把 started_ts 改成 1 小时前
    long_ago = int(time.time()) - 3600
    with sqlite3.connect(str(tmp_db)) as con:
        con.execute("UPDATE tasks SET started_ts=? WHERE id=?", (long_ago, tid))
        con.commit()

    n = t.sweep_stuck()
    assert n == 1
    task = t.get_task(tid)
    assert task["status"] == "failed"
    assert "watchdog" in (task["error"] or "")
    assert "AI proxy" in (task["error"] or "")


def test_sweep_stuck_respects_min_timeout_when_no_estimate(tmp_db):
    """estimated 为 NULL/0 时, 至少给 600s 兜底.
    started 5 分钟前 (< 600s) → 不动. started 15 分钟前 → kill."""
    from backend.services import tasks as t
    tid_young = t.create_task("k1")  # estimated_seconds=None
    tid_old = t.create_task("k2")
    now = int(time.time())
    with sqlite3.connect(str(tmp_db)) as con:
        con.execute("UPDATE tasks SET started_ts=? WHERE id=?", (now - 300, tid_young))   # 5 min
        con.execute("UPDATE tasks SET started_ts=? WHERE id=?", (now - 900, tid_old))     # 15 min
        con.commit()

    n = t.sweep_stuck()
    assert n == 1
    assert t.get_task(tid_young)["status"] == "running"
    assert t.get_task(tid_old)["status"] == "failed"


def test_sweep_stuck_does_not_touch_pending_or_finished(tmp_db):
    from backend.services import tasks as t
    tid_pend = t.create_task("k1")
    tid_ok = t.create_task("k2")
    tid_fail = t.create_task("k3")
    long_ago = int(time.time()) - 99999
    with sqlite3.connect(str(tmp_db)) as con:
        con.execute("UPDATE tasks SET status='pending', started_ts=? WHERE id=?", (long_ago, tid_pend))
        con.commit()
    t.finish_task(tid_ok, result={})
    t.finish_task(tid_fail, error="x")
    with sqlite3.connect(str(tmp_db)) as con:
        # 把 finished 任务也调成"老到不行"测试 sweep 不会覆盖它们
        con.execute("UPDATE tasks SET started_ts=? WHERE id IN (?,?)", (long_ago, tid_ok, tid_fail))
        con.commit()

    n = t.sweep_stuck()
    assert n == 0
    assert t.get_task(tid_pend)["status"] == "pending"
    assert t.get_task(tid_ok)["status"] == "ok"
    assert t.get_task(tid_fail)["status"] == "failed"
    assert t.get_task(tid_fail)["error"] == "x"  # 原 error 未变


def test_sweep_stuck_does_not_kill_fresh_running(tmp_db):
    """刚起跑的任务 (estimated=50s, 实际 elapsed=10s) → 不动."""
    from backend.services import tasks as t
    tid = t.create_task("k1", estimated_seconds=50)
    n = t.sweep_stuck()
    assert n == 0
    assert t.get_task(tid)["status"] == "running"


# ─── start_watchdog idempotent ───────────────────────

def test_start_watchdog_only_starts_once(tmp_db):
    from backend.services import tasks as t
    first = t.start_watchdog()
    second = t.start_watchdog()
    third = t.start_watchdog()
    assert first is True
    assert second is False
    assert third is False
