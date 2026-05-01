"""Phase 6 · SQLite 连接层硬化测试.

每个 get_connection() 必须:
  - timeout=15 秒 (sqlite3.connect)
  - PRAGMA busy_timeout=5000 (毫秒)
  - PRAGMA foreign_keys=ON

apply_migrations() 必须把 DB 切到 WAL journal mode.
"""
from __future__ import annotations

import sqlite3
import tempfile
from pathlib import Path

import pytest


@pytest.fixture
def tmp_db(monkeypatch):
    """每个 test 一个干净 DB. monkeypatch DB_PATH, 配 reset_for_test 让 migrations 重跑."""
    tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
    tmp.close()
    p = Path(tmp.name)
    monkeypatch.setattr("shortvideo.config.DB_PATH", p)
    # reset migrations cache
    from backend.services import migrations
    migrations.reset_for_test()
    yield p
    # cleanup: WAL 模式会留 .wal / .shm
    for ext in ("", "-wal", "-shm", "-journal"):
        try:
            Path(str(p) + ext).unlink()
        except FileNotFoundError:
            pass
        except Exception:
            pass


# ─── get_connection() 连接级 pragma ──────────────────────────


def test_get_connection_busy_timeout_5000(tmp_db):
    from shortvideo.db import get_connection
    con = get_connection()
    try:
        row = con.execute("PRAGMA busy_timeout").fetchone()
        assert row[0] == 5000, f"busy_timeout 应 5000ms, 实际 {row[0]}"
    finally:
        con.close()


def test_get_connection_foreign_keys_on(tmp_db):
    from shortvideo.db import get_connection
    con = get_connection()
    try:
        row = con.execute("PRAGMA foreign_keys").fetchone()
        assert row[0] == 1, f"foreign_keys 应启用 (1), 实际 {row[0]}"
    finally:
        con.close()


def test_get_connection_uses_timeout_15(monkeypatch, tmp_db):
    """timeout=15 是 sqlite3.connect 参数, 通过 monkeypatch sqlite3.connect 抓."""
    captured = {}
    real_connect = sqlite3.connect

    def fake_connect(*args, **kwargs):
        captured["args"] = args
        captured["kwargs"] = kwargs
        return real_connect(*args, **kwargs)

    # patch sqlite3.connect 在 shortvideo.db 模块里看到的引用
    import shortvideo.db as db_mod
    monkeypatch.setattr(db_mod.sqlite3, "connect", fake_connect)

    from shortvideo.db import get_connection
    con = get_connection()
    con.close()

    timeout = captured["kwargs"].get("timeout")
    if timeout is None and len(captured["args"]) > 1:
        timeout = captured["args"][1]
    assert timeout == 15, f"sqlite3.connect timeout 应 15s, 实际 {timeout}"


def test_get_connection_returns_independent_connections(tmp_db):
    """每个连接独立 (每个连接都设 PRAGMA, 不互相污染)."""
    from shortvideo.db import get_connection
    c1 = get_connection()
    c2 = get_connection()
    try:
        # 两个连接都应有同样的 pragma
        b1 = c1.execute("PRAGMA busy_timeout").fetchone()[0]
        b2 = c2.execute("PRAGMA busy_timeout").fetchone()[0]
        assert b1 == b2 == 5000

        f1 = c1.execute("PRAGMA foreign_keys").fetchone()[0]
        f2 = c2.execute("PRAGMA foreign_keys").fetchone()[0]
        assert f1 == f2 == 1
    finally:
        c1.close()
        c2.close()


# ─── apply_migrations() 切 WAL ────────────────────────────────


def test_apply_migrations_sets_wal_journal_mode(tmp_db):
    from backend.services.migrations import apply_migrations
    from shortvideo.db import get_connection

    apply_migrations()

    con = get_connection()
    try:
        row = con.execute("PRAGMA journal_mode").fetchone()
        # 返回值是当前模式. WAL 设了之后查会返回 'wal' (lowercase).
        assert row[0].lower() == "wal", f"apply_migrations 后 journal_mode 应 wal, 实际 {row[0]}"
    finally:
        con.close()


def test_wal_persists_across_new_connection(tmp_db):
    """WAL 是 DB 级设置, 第二个新连接也能看到."""
    from backend.services.migrations import apply_migrations
    from shortvideo.db import get_connection

    apply_migrations()

    # 完全独立打开一次新连接
    c2 = get_connection()
    try:
        row = c2.execute("PRAGMA journal_mode").fetchone()
        assert row[0].lower() == "wal", "WAL 应在 DB 文件级别保持, 新连接也应看到 wal"
    finally:
        c2.close()


# ─── 不污染:  pragma 不在每次 get_connection 都执行 journal_mode ─────


def test_get_connection_does_not_force_journal_mode(tmp_db):
    """get_connection() 不应强制设 journal_mode (DB 级设置, 由 apply_migrations 一次性做).

    实证: apply_migrations 后 DB = WAL → 手动切回 DELETE → 再 get_connection
    若 get_connection 没强行切, 应仍是 DELETE.
    """
    import sqlite3 as _sqlite3
    from backend.services.migrations import apply_migrations
    from shortvideo.db import get_connection

    apply_migrations()  # → WAL

    # 手动切回 DELETE 模式
    raw = _sqlite3.connect(str(tmp_db))
    raw.execute("PRAGMA journal_mode = DELETE")
    raw.close()

    # 验 DB 现在是 DELETE
    raw2 = _sqlite3.connect(str(tmp_db))
    pre_mode = raw2.execute("PRAGMA journal_mode").fetchone()[0].lower()
    raw2.close()
    assert pre_mode == "delete", f"前置: 应已切到 delete, 实际 {pre_mode}"

    # 关键: 通过 get_connection 拿新连接, 看是否被强制切回 wal
    con = get_connection()
    try:
        mode = con.execute("PRAGMA journal_mode").fetchone()[0].lower()
    finally:
        con.close()
    assert mode == "delete", (
        f"get_connection 不应强制 journal_mode=WAL (DB 级一次性, 由 apply_migrations 设). "
        f"切回 DELETE 后再 get_connection 应仍是 DELETE, 实际 {mode}"
    )


# ─── FK 真正生效 (不只是 pragma 显示 ON) ──────────────────────


def test_foreign_keys_actually_enforced(tmp_db):
    """PRAGMA foreign_keys=ON 真生效 = INSERT 违 FK 必须报错."""
    from backend.services.migrations import apply_migrations
    from shortvideo.db import get_connection

    apply_migrations()  # 建 night_jobs / night_job_runs (有 FK)

    con = get_connection()
    try:
        # night_job_runs.job_id REFERENCES night_jobs(id) — 插不存在的 job_id 应报错
        with pytest.raises(sqlite3.IntegrityError):
            con.execute(
                "INSERT INTO night_job_runs (job_id, started_at, status) "
                "VALUES (?, ?, ?)",
                (999999, 1000, "ok"),
            )
            con.commit()
    finally:
        con.close()
