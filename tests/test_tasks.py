"""tasks 存储层测试 (D-037a)。

用 tmp_db fixture 把 DB_PATH 指向临时文件,避免污染 prod DB。
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


def test_create_task_returns_id_and_running(tmp_db):
    from backend.services import tasks as t
    tid = t.create_task("wechat.write", label="写长文", ns="wechat", page_id="wechat", step="write")
    assert isinstance(tid, str) and len(tid) == 32
    task = t.get_task(tid)
    assert task is not None
    assert task["kind"] == "wechat.write"
    assert task["status"] == "running"
    assert task["ns"] == "wechat"
    assert task["page_id"] == "wechat"
    assert task["step"] == "write"
    assert task["started_ts"] > 0
    assert task["finished_ts"] is None
    assert task["elapsed_sec"] >= 0


def test_create_task_with_payload_json_roundtrip(tmp_db):
    from backend.services import tasks as t
    payload = {"title": "A", "steps": ["a", "b"], "n": 3}
    tid = t.create_task("wechat.cover", payload=payload)
    task = t.get_task(tid)
    assert task["payload"] == payload


def test_update_progress_only_running(tmp_db):
    from backend.services import tasks as t
    tid = t.create_task("wechat.write")
    t.update_progress(tid, "写第 3 段")
    assert t.get_task(tid)["progress_text"] == "写第 3 段"
    # 结束后再更新不应影响
    t.finish_task(tid, result={"text": "done"})
    t.update_progress(tid, "不应写入")
    task = t.get_task(tid)
    assert task["status"] == "ok"
    assert task["progress_text"] == "写第 3 段"


def test_finish_task_ok_and_failed(tmp_db):
    from backend.services import tasks as t
    tid1 = t.create_task("k1")
    t.finish_task(tid1, result={"v": 1})
    task1 = t.get_task(tid1)
    assert task1["status"] == "ok"
    assert task1["result"] == {"v": 1}
    assert task1["error"] is None
    assert task1["finished_ts"] is not None

    tid2 = t.create_task("k2")
    t.finish_task(tid2, error="AI 超时")
    task2 = t.get_task(tid2)
    assert task2["status"] == "failed"
    assert task2["error"] == "AI 超时"


def test_finish_task_explicit_status_wins(tmp_db):
    from backend.services import tasks as t
    tid = t.create_task("k")
    t.finish_task(tid, error="boom", status="cancelled")
    assert t.get_task(tid)["status"] == "cancelled"


def test_invalid_status_raises(tmp_db):
    from backend.services import tasks as t
    with pytest.raises(ValueError):
        t.create_task("k", status="bogus")
    tid = t.create_task("k")
    with pytest.raises(ValueError):
        t.finish_task(tid, status="bogus")


def test_cancel_task_only_cancels_active(tmp_db):
    from backend.services import tasks as t
    tid = t.create_task("k")
    assert t.cancel_task(tid) is True
    assert t.get_task(tid)["status"] == "cancelled"
    assert t.is_cancelled(tid) is True
    # 已取消的再 cancel 返回 False
    assert t.cancel_task(tid) is False
    # 已完成的不能 cancel
    tid2 = t.create_task("k2")
    t.finish_task(tid2, result={"v": 1})
    assert t.cancel_task(tid2) is False


def test_is_cancelled_missing_returns_false(tmp_db):
    from backend.services import tasks as t
    assert t.is_cancelled("nonexistent") is False


def test_list_tasks_ordering_and_filters(tmp_db, monkeypatch):
    from backend.services import tasks as t
    # 秒级时间戳, 手动推进以保证排序稳定
    now = [1_700_000_000]
    monkeypatch.setattr(t, "time", type("_T", (), {"time": lambda: now[0]}))
    t.create_task("wechat.write", ns="wechat")
    now[0] += 1
    t.create_task("wechat.cover", ns="wechat")
    now[0] += 1
    tid3 = t.create_task("hotrewrite.write", ns="hotrewrite")
    now[0] += 1
    t.finish_task(tid3, result={"v": 1})

    all_tasks = t.list_tasks()
    assert len(all_tasks) == 3
    # updated_ts DESC: tid3 刚 finish,最新
    assert all_tasks[0]["kind"] == "hotrewrite.write"

    only_wechat = t.list_tasks(ns="wechat")
    assert len(only_wechat) == 2
    assert {x["kind"] for x in only_wechat} == {"wechat.write", "wechat.cover"}

    only_running = t.list_tasks(status="running")
    assert len(only_running) == 2
    assert all(x["status"] == "running" for x in only_running)

    multi = t.list_tasks(status="running,ok")
    assert len(multi) == 3


def test_list_tasks_limit(tmp_db):
    from backend.services import tasks as t
    for i in range(5):
        t.create_task(f"k{i}")
    assert len(t.list_tasks(limit=3)) == 3
    assert len(t.list_tasks(limit=100)) == 5


def test_counts(tmp_db):
    from backend.services import tasks as t
    t.create_task("a")
    t.create_task("b")
    tid = t.create_task("c")
    t.finish_task(tid, result={})
    tid2 = t.create_task("d")
    t.finish_task(tid2, error="x")
    c = t.counts()
    assert c["running"] == 2
    assert c["ok"] == 1
    assert c["failed"] == 1
    assert c["cancelled"] == 0
    assert c["active"] == 2


def test_cleanup_old(tmp_db):
    from backend.services import tasks as t
    # 写 3 条已结束的, 人工改 finished_ts 让它们看起来很老
    for i in range(3):
        tid = t.create_task(f"old{i}")
        t.finish_task(tid, result={})
    tid_new = t.create_task("fresh")
    t.finish_task(tid_new, result={})
    tid_running = t.create_task("running_one")  # 未结束不应被删

    old_ts = int(time.time()) - 86400 * 30
    with sqlite3.connect(tmp_db) as con:
        con.execute(
            "UPDATE tasks SET finished_ts=? WHERE kind LIKE 'old%'",
            (old_ts,),
        )
        con.commit()

    deleted = t.cleanup_old(days=7)
    assert deleted == 3
    remain = t.list_tasks()
    kinds = {x["kind"] for x in remain}
    assert kinds == {"fresh", "running_one"}


# ─── D-037b1 新字段: progress_pct + estimated_seconds ───

def test_create_task_with_estimated_seconds(tmp_db):
    from backend.services import tasks as t
    tid = t.create_task("compliance.check", estimated_seconds=90)
    rec = t.get_task(tid)
    assert rec["estimated_seconds"] == 90


def test_create_task_estimated_seconds_default_null(tmp_db):
    from backend.services import tasks as t
    tid = t.create_task("kind_no_est")
    rec = t.get_task(tid)
    assert rec["estimated_seconds"] is None


def test_update_progress_with_pct(tmp_db):
    from backend.services import tasks as t
    tid = t.create_task("compliance.check")
    t.update_progress(tid, "扫违规中", pct=30)
    rec = t.get_task(tid)
    assert rec["progress_text"] == "扫违规中"
    assert rec["progress_pct"] == 30


def test_update_progress_pct_clamps(tmp_db):
    """pct 越界 (负数 / >100) 钳到 0-100。"""
    from backend.services import tasks as t
    tid = t.create_task("k")
    t.update_progress(tid, "p", pct=-5)
    assert t.get_task(tid)["progress_pct"] == 0
    t.update_progress(tid, "p", pct=120)
    assert t.get_task(tid)["progress_pct"] == 100


def test_update_progress_without_pct_keeps_old(tmp_db):
    """update_progress 不传 pct 不动已有 progress_pct (避免覆盖成 None)。"""
    from backend.services import tasks as t
    tid = t.create_task("k")
    t.update_progress(tid, "step1", pct=40)
    t.update_progress(tid, "step2")  # 不传 pct
    rec = t.get_task(tid)
    assert rec["progress_text"] == "step2"
    assert rec["progress_pct"] == 40  # 旧值保留


# ─── D-037b5 run_async helper ────────────────────────────

def test_run_async_happy_path(tmp_db):
    """run_async 同步函数成功 → status=ok + result 正确."""
    import time
    from backend.services import tasks as t
    def fn(): return {"answer": 42}
    tid = t.run_async(kind="test.kind", label="test", sync_fn=fn, estimated_seconds=10)
    # 等 worker 跑完 (sync_fn 立即返, daemon thread 应在 50ms 内完成)
    for _ in range(20):
        rec = t.get_task(tid)
        if rec["status"] != "running": break
        time.sleep(0.05)
    rec = t.get_task(tid)
    assert rec["status"] == "ok"
    assert rec["result"] == {"answer": 42}
    assert rec["estimated_seconds"] == 10


def test_run_async_failure_path(tmp_db):
    """run_async sync_fn 抛 → status=failed + error 字段."""
    import time
    from backend.services import tasks as t
    def fn(): raise ValueError("boom")
    tid = t.run_async(kind="test.kind", sync_fn=fn)
    for _ in range(20):
        rec = t.get_task(tid)
        if rec["status"] != "running": break
        time.sleep(0.05)
    rec = t.get_task(tid)
    assert rec["status"] == "failed"
    assert "ValueError" in rec["error"]
    assert "boom" in rec["error"]


def test_run_async_pushes_milestones(tmp_db, monkeypatch):
    """run_async 推 5%→15%→95%→100% 里程碑 (检查最终状态)."""
    import time
    from backend.services import tasks as t
    def slow_fn():
        time.sleep(0.1)
        return {"x": 1}
    tid = t.run_async(kind="test", progress_text="思考中...", sync_fn=slow_fn)
    # 立刻拉一次 — 应已推 15% (worker 启动后 1ms 内推 2 个 update_progress)
    time.sleep(0.02)
    mid = t.get_task(tid)
    assert mid["status"] == "running"
    assert mid["progress_pct"] in (5, 15)
    # 等完成
    for _ in range(30):
        rec = t.get_task(tid)
        if rec["status"] != "running": break
        time.sleep(0.05)
    rec = t.get_task(tid)
    assert rec["status"] == "ok"
