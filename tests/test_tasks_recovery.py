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


# ─── B'-1 watchdog 双阈值 (idle + total) ─────────────


def test_sweep_stuck_kills_idle_no_heartbeat(tmp_db):
    """started_ts=now-100 (才起跑), updated_ts=now-700 (心跳停 700s) → idle 超时 kill.
    旧逻辑只看 started_ts, 这种"刚起跑但卡住没心跳" 会逃过, 现在双阈值能抓.
    """
    from backend.services import tasks as t
    tid = t.create_task("k1", estimated_seconds=10000)  # estimated 很大, 总时长不会被触发
    now = int(time.time())
    with sqlite3.connect(str(tmp_db)) as con:
        con.execute(
            "UPDATE tasks SET started_ts=?, updated_ts=? WHERE id=?",
            (now - 100, now - 700, tid),
        )
        con.commit()
    n = t.sweep_stuck()
    assert n == 1
    task = t.get_task(tid)
    assert task["status"] == "failed"
    assert "idle" in (task["error"] or "")


def test_sweep_stuck_total_timeout_even_with_recent_heartbeat(tmp_db):
    """心跳一直在但跑太久也要杀 (防心跳续命无限活).
    started_ts=now-50001 (跑了 ~14h), updated_ts=now-5 (心跳新鲜),
    estimated=10000 → total = max(10000*5, 600) = 50000s.
    now-started > 50000 → total 超时 kill.
    """
    from backend.services import tasks as t
    tid = t.create_task("k1", estimated_seconds=10000)
    now = int(time.time())
    with sqlite3.connect(str(tmp_db)) as con:
        con.execute(
            "UPDATE tasks SET started_ts=?, updated_ts=? WHERE id=?",
            (now - 50001, now - 5, tid),
        )
        con.commit()
    n = t.sweep_stuck()
    assert n == 1
    task = t.get_task(tid)
    assert task["status"] == "failed"
    assert "total" in (task["error"] or "")


def test_sweep_stuck_keeps_running_with_fresh_heartbeat_within_total(tmp_db):
    """心跳活的 + 总时长还没到 → 不杀.
    started_ts=now-3000 (跑了 50min), updated_ts=now-30 (心跳新鲜 30s 前),
    estimated=10000 → total = 50000s, idle = 600s. 都没超 → 不动.
    """
    from backend.services import tasks as t
    tid = t.create_task("k1", estimated_seconds=10000)
    now = int(time.time())
    with sqlite3.connect(str(tmp_db)) as con:
        con.execute(
            "UPDATE tasks SET started_ts=?, updated_ts=? WHERE id=?",
            (now - 3000, now - 30, tid),
        )
        con.commit()
    n = t.sweep_stuck()
    assert n == 0
    assert t.get_task(tid)["status"] == "running"


def test_sweep_stuck_idle_and_total_both_count_separately(tmp_db):
    """两条任务: 一条 idle 超时, 一条 total 超时. 都被杀, swept=2."""
    from backend.services import tasks as t
    tid_idle = t.create_task("k1", estimated_seconds=10000)
    tid_total = t.create_task("k2", estimated_seconds=10)  # total = max(50, 600) = 600
    now = int(time.time())
    with sqlite3.connect(str(tmp_db)) as con:
        # idle: 心跳 700s 前停了
        con.execute(
            "UPDATE tasks SET started_ts=?, updated_ts=? WHERE id=?",
            (now - 200, now - 700, tid_idle),
        )
        # total: 心跳新鲜但总跑了 700s, > 600 total
        con.execute(
            "UPDATE tasks SET started_ts=?, updated_ts=? WHERE id=?",
            (now - 700, now - 5, tid_total),
        )
        con.commit()
    n = t.sweep_stuck()
    assert n == 2
    assert t.get_task(tid_idle)["status"] == "failed"
    assert "idle" in (t.get_task(tid_idle)["error"] or "")
    assert t.get_task(tid_total)["status"] == "failed"
    assert "total" in (t.get_task(tid_total)["error"] or "")


# ─── B'-5 run_async sync_fn_with_ctx 兼容入口 ─────────


def test_run_async_old_sync_fn_still_works(tmp_db):
    """旧 sync_fn 入口不变, 老调用方零改动."""
    import time
    from backend.services import tasks as t

    def _job():
        return {"answer": 42}

    tid = t.run_async(kind="test.legacy", sync_fn=_job, estimated_seconds=10)
    # 等 daemon 跑完 (单纯函数, 几十 ms)
    for _ in range(50):
        task = t.get_task(tid)
        if task["status"] in ("ok", "failed"):
            break
        time.sleep(0.05)
    assert task["status"] == "ok"
    assert task["result"] == {"answer": 42}


def test_run_async_with_ctx_receives_task_id(tmp_db):
    """sync_fn_with_ctx 收到 ctx.task_id 跟外面拿到的 task_id 一致."""
    import time
    from backend.services import tasks as t

    captured_ids = []

    def _job(ctx):
        captured_ids.append(ctx.task_id)
        ctx.update_progress("跑了一半", pct=50)
        return {"ok": True}

    tid = t.run_async(kind="test.ctx", sync_fn_with_ctx=_job, estimated_seconds=10)
    for _ in range(50):
        task = t.get_task(tid)
        if task["status"] in ("ok", "failed"):
            break
        time.sleep(0.05)
    assert task["status"] == "ok"
    # ctx.task_id 跟 run_async 返的 task_id 一致, 闭包没拿错
    assert captured_ids == [tid]


def test_run_async_with_ctx_progress_updates_correct_task(tmp_db):
    """两个 ctx-aware task 并发, 各自更新自己的 progress, 不串扰.
    旧"反查最近 running" 在这里会让先起的任务把进度更新到后起的 task 上.
    """
    import time
    import threading
    from backend.services import tasks as t

    # 单线程串行起两个 task, 验证各自的 progress_text 不串
    barrier = threading.Event()

    def _slow_job(ctx):
        # 等另一个 task 也起来再写 progress, 模拟"两个并发 running"
        barrier.wait(timeout=2)
        ctx.update_progress(f"job for {ctx.task_id}", pct=50)
        return {"id": ctx.task_id}

    tid1 = t.run_async(kind="test.parallel", sync_fn_with_ctx=_slow_job, estimated_seconds=10)
    tid2 = t.run_async(kind="test.parallel", sync_fn_with_ctx=_slow_job, estimated_seconds=10)
    barrier.set()
    for _ in range(60):
        a = t.get_task(tid1)
        b = t.get_task(tid2)
        if a["status"] in ("ok", "failed") and b["status"] in ("ok", "failed"):
            break
        time.sleep(0.05)
    assert a["status"] == "ok"
    assert b["status"] == "ok"
    assert a["result"]["id"] == tid1
    assert b["result"]["id"] == tid2


def test_run_async_rejects_both_or_neither(tmp_db):
    """sync_fn 和 sync_fn_with_ctx 必须二选一."""
    import pytest
    from backend.services import tasks as t

    def _f1():
        return None

    def _f2(ctx):
        return None

    with pytest.raises(ValueError, match="二选一"):
        t.run_async(kind="x", sync_fn=_f1, sync_fn_with_ctx=_f2)
    with pytest.raises(ValueError, match="二选一"):
        t.run_async(kind="x")


# ─── start_watchdog idempotent ───────────────────────

def test_start_watchdog_only_starts_once(tmp_db):
    from backend.services import tasks as t
    first = t.start_watchdog()
    second = t.start_watchdog()
    third = t.start_watchdog()
    assert first is True
    assert second is False
    assert third is False
