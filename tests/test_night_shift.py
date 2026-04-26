"""night_shift 数据层测试 (D-040a).

tmp_db fixture 隔离 DB_PATH, 不污染 prod works.db.
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
    from backend.services import night_shift
    importlib.reload(night_shift)
    yield p
    try:
        p.unlink()
    except Exception:
        pass


# ─── jobs CRUD ────────────────────────────────────────────────

def test_create_job_returns_id_and_defaults(tmp_db):
    from backend.services import night_shift as ns
    jid = ns.create_job(name="凌晨抓热点", trigger_type="cron", icon="🔥",
                        skill_slug="content-planner",
                        trigger_config={"cron": "0 23 * * *"},
                        output_target="materials")
    assert isinstance(jid, int) and jid > 0
    j = ns.get_job(jid)
    assert j is not None
    assert j["name"] == "凌晨抓热点"
    assert j["icon"] == "🔥"
    assert j["skill_slug"] == "content-planner"
    assert j["trigger_type"] == "cron"
    assert j["trigger_config"] == {"cron": "0 23 * * *"}
    assert j["output_target"] == "materials"
    assert j["enabled"] is True
    assert j["created_at"] > 0


def test_create_job_invalid_trigger_type_raises(tmp_db):
    from backend.services import night_shift as ns
    with pytest.raises(ValueError):
        ns.create_job(name="x", trigger_type="bogus")


def test_create_job_invalid_output_target_raises(tmp_db):
    from backend.services import night_shift as ns
    with pytest.raises(ValueError):
        ns.create_job(name="x", trigger_type="cron", output_target="bogus")


def test_create_job_with_file_watch_trigger(tmp_db):
    from backend.services import night_shift as ns
    jid = ns.create_job(name="一鱼多吃", trigger_type="file_watch",
                        skill_slug="one-fish-many-meals",
                        trigger_config={"path": "data/inbox/audio/", "patterns": ["*.m4a", "*.mp3"]},
                        output_target="works")
    j = ns.get_job(jid)
    assert j["trigger_type"] == "file_watch"
    assert j["trigger_config"]["path"] == "data/inbox/audio/"
    assert j["output_target"] == "works"


def test_get_job_missing_returns_none(tmp_db):
    from backend.services import night_shift as ns
    assert ns.get_job(9999) is None


def test_list_jobs_ordering_and_enabled_filter(tmp_db):
    from backend.services import night_shift as ns
    a = ns.create_job(name="A", trigger_type="cron", enabled=True)
    b = ns.create_job(name="B", trigger_type="cron", enabled=False)
    c = ns.create_job(name="C", trigger_type="manual", enabled=True)
    all_jobs = ns.list_jobs()
    assert [j["id"] for j in all_jobs] == [a, b, c]  # 按 id ASC
    enabled = ns.list_jobs(enabled_only=True)
    assert {j["id"] for j in enabled} == {a, c}


def test_update_job_partial_fields(tmp_db):
    from backend.services import night_shift as ns
    jid = ns.create_job(name="A", trigger_type="cron", enabled=True)
    assert ns.update_job(jid, name="A 改名", enabled=False, ai_route="opus") is True
    j = ns.get_job(jid)
    assert j["name"] == "A 改名"
    assert j["enabled"] is False
    assert j["ai_route"] == "opus"


def test_update_job_no_fields_returns_false(tmp_db):
    from backend.services import night_shift as ns
    jid = ns.create_job(name="A", trigger_type="cron")
    assert ns.update_job(jid) is False


def test_update_job_invalid_trigger_type_raises(tmp_db):
    from backend.services import night_shift as ns
    jid = ns.create_job(name="A", trigger_type="cron")
    with pytest.raises(ValueError):
        ns.update_job(jid, trigger_type="bogus")


def test_update_job_trigger_config_roundtrip(tmp_db):
    from backend.services import night_shift as ns
    jid = ns.create_job(name="A", trigger_type="cron", trigger_config={"cron": "old"})
    ns.update_job(jid, trigger_config={"cron": "0 6 * * *", "timezone": "Asia/Shanghai"})
    j = ns.get_job(jid)
    assert j["trigger_config"] == {"cron": "0 6 * * *", "timezone": "Asia/Shanghai"}


def test_set_enabled_toggle(tmp_db):
    from backend.services import night_shift as ns
    jid = ns.create_job(name="A", trigger_type="cron", enabled=True)
    ns.set_enabled(jid, False)
    assert ns.get_job(jid)["enabled"] is False
    ns.set_enabled(jid, True)
    assert ns.get_job(jid)["enabled"] is True


def test_delete_job_cascades_runs(tmp_db):
    from backend.services import night_shift as ns
    jid = ns.create_job(name="A", trigger_type="cron")
    rid1 = ns.start_run(jid)
    ns.finish_run(rid1, output_summary="x")
    rid2 = ns.start_run(jid)
    ns.finish_run(rid2, output_summary="y")
    assert len(ns.list_runs(job_id=jid)) == 2
    assert ns.delete_job(jid) is True
    assert ns.get_job(jid) is None
    # runs 也应被清掉
    assert ns.list_runs(job_id=jid) == []


# ─── runs ─────────────────────────────────────────────────────

def test_start_run_creates_running(tmp_db):
    from backend.services import night_shift as ns
    jid = ns.create_job(name="A", trigger_type="cron")
    rid = ns.start_run(jid)
    r = ns.get_run(rid)
    assert r["job_id"] == jid
    assert r["status"] == "running"
    assert r["ended_at"] is None
    assert r["elapsed_sec"] >= 0


def test_finish_run_default_success(tmp_db):
    from backend.services import night_shift as ns
    jid = ns.create_job(name="A", trigger_type="cron")
    rid = ns.start_run(jid)
    ns.finish_run(rid, output_summary="5 条选题",
                  output_refs=[{"kind": "material", "id": 1}, {"kind": "material", "id": 2}])
    r = ns.get_run(rid)
    assert r["status"] == "success"
    assert r["output_summary"] == "5 条选题"
    assert r["output_refs"] == [{"kind": "material", "id": 1}, {"kind": "material", "id": 2}]
    assert r["ended_at"] is not None


def test_finish_run_failed_with_log(tmp_db):
    from backend.services import night_shift as ns
    jid = ns.create_job(name="A", trigger_type="cron")
    rid = ns.start_run(jid)
    ns.finish_run(rid, status="failed", log="boom traceback...")
    r = ns.get_run(rid)
    assert r["status"] == "failed"
    assert r["log"] == "boom traceback..."


def test_finish_run_invalid_status_raises(tmp_db):
    from backend.services import night_shift as ns
    jid = ns.create_job(name="A", trigger_type="cron")
    rid = ns.start_run(jid)
    with pytest.raises(ValueError):
        ns.finish_run(rid, status="bogus")


def test_finish_run_log_truncated(tmp_db):
    from backend.services import night_shift as ns
    jid = ns.create_job(name="A", trigger_type="cron")
    rid = ns.start_run(jid)
    long_log = "A" * 8000
    ns.finish_run(rid, log=long_log)
    r = ns.get_run(rid)
    assert r["log"] is not None
    assert len(r["log"]) == 4000  # 留尾部


# D-068b: 启动孤儿 run 恢复

def test_recover_orphan_runs_kills_running(tmp_db):
    from backend.services import night_shift as ns
    jid = ns.create_job(name="A", trigger_type="cron")
    rid_run = ns.start_run(jid)
    rid_done = ns.start_run(jid)
    ns.finish_run(rid_done, output_summary="ok")

    n = ns.recover_orphan_runs()
    assert n == 1

    rec = ns.get_run(rid_run)
    assert rec["status"] == "failed"
    assert "服务重启" in (rec["log"] or "")
    assert rec["ended_at"] is not None

    done = ns.get_run(rid_done)
    assert done["status"] == "success"  # 已完成的不动


def test_recover_orphan_runs_returns_zero_when_empty(tmp_db):
    from backend.services import night_shift as ns
    n = ns.recover_orphan_runs()
    assert n == 0


def test_list_runs_filters(tmp_db, monkeypatch):
    from backend.services import night_shift as ns
    # 手动控制时间, 保证排序稳定
    now = [1_700_000_000]
    monkeypatch.setattr(ns, "time", type("_T", (), {"time": lambda: now[0]}))

    jid1 = ns.create_job(name="A", trigger_type="cron")
    now[0] += 1
    jid2 = ns.create_job(name="B", trigger_type="cron")
    now[0] += 1

    r1 = ns.start_run(jid1); now[0] += 1; ns.finish_run(r1, output_summary="ok1"); now[0] += 1
    r2 = ns.start_run(jid2); now[0] += 1; ns.finish_run(r2, status="failed");      now[0] += 1
    r3 = ns.start_run(jid1); now[0] += 1  # 留 running

    all_runs = ns.list_runs()
    assert len(all_runs) == 3
    # started_at DESC
    assert all_runs[0]["id"] == r3
    only_jid1 = ns.list_runs(job_id=jid1)
    assert {r["id"] for r in only_jid1} == {r1, r3}
    only_failed = ns.list_runs(status="failed")
    assert [r["id"] for r in only_failed] == [r2]


def test_latest_run_for_job(tmp_db, monkeypatch):
    from backend.services import night_shift as ns
    now = [1_700_000_000]
    monkeypatch.setattr(ns, "time", type("_T", (), {"time": lambda: now[0]}))
    jid = ns.create_job(name="A", trigger_type="cron")
    now[0] += 10
    r1 = ns.start_run(jid); now[0] += 1; ns.finish_run(r1, output_summary="old"); now[0] += 100
    r2 = ns.start_run(jid); now[0] += 1; ns.finish_run(r2, output_summary="new")
    latest = ns.latest_run_for_job(jid)
    assert latest["id"] == r2
    assert latest["output_summary"] == "new"


def test_latest_run_for_job_with_no_runs(tmp_db):
    from backend.services import night_shift as ns
    jid = ns.create_job(name="A", trigger_type="cron")
    assert ns.latest_run_for_job(jid) is None


# ─── digest ────────────────────────────────────────────────────

def test_digest_only_includes_recent_success(tmp_db, monkeypatch):
    from backend.services import night_shift as ns
    now = [1_700_000_000]
    monkeypatch.setattr(ns, "time", type("_T", (), {"time": lambda: now[0]}))

    jid = ns.create_job(name="抓热点", trigger_type="cron",
                        icon="🔥", output_target="materials")
    # 1 条 12h 前的 success
    now[0] -= 12 * 3600
    r1 = ns.start_run(jid)
    now[0] += 5
    ns.finish_run(r1, output_summary="5 条选题",
                  output_refs=[{"kind": "material", "id": 11}])
    # 1 条 30h 前的 success (超 24h, 不应出现)
    now[0] = 1_700_000_000 - 30 * 3600
    r2 = ns.start_run(jid)
    now[0] += 5
    ns.finish_run(r2, output_summary="老的产出")
    # 1 条 1h 前的 failed (不应出现)
    now[0] = 1_700_000_000 - 3600
    r3 = ns.start_run(jid)
    now[0] += 5
    ns.finish_run(r3, status="failed")
    # 1 条 1h 前的 running (不应出现)
    now[0] = 1_700_000_000 - 3600
    ns.start_run(jid)

    now[0] = 1_700_000_000  # 回到当前
    digest = ns.get_digest(since_hours=24)
    assert digest["total_runs"] == 1
    item = digest["items"][0]
    assert item["job_name"] == "抓热点"
    assert item["icon"] == "🔥"
    assert item["output_target"] == "materials"
    assert item["output_summary"] == "5 条选题"
    assert item["output_refs"] == [{"kind": "material", "id": 11}]


def test_digest_empty_when_nothing(tmp_db):
    from backend.services import night_shift as ns
    digest = ns.get_digest()
    assert digest["total_runs"] == 0
    assert digest["items"] == []
    assert digest["since_hours"] == 24
