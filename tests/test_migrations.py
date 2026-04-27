"""migrations 测试 (D-084).

覆盖:
- apply_migrations 返回 v1, schema_version 表存一行
- 10 张表 + 索引全建
- legacy fixups (works 老表 D-065 前缺 4 列 / tasks 老表 T9/T13 前缺 4 列) 补齐
- DB_PATH 切换自动重跑 (兼容 pytest monkeypatch)
- path 规范化 (~/相对路径/symlink 视为同一 DB key)
- 幂等 (连续 apply 不重复 INSERT schema_version)
"""
from __future__ import annotations

import os
import sqlite3
import tempfile
from pathlib import Path

import pytest


EXPECTED_TABLES = {
    "schema_version",
    "works", "materials", "hot_topics", "topics", "metrics",
    "tasks",
    "ai_calls",
    "night_jobs", "night_job_runs",
    "remote_jobs",
}


@pytest.fixture
def tmp_db(monkeypatch):
    """每个 test 一个干净的 tmp DB. monkeypatch 切 DB_PATH, migrations 自动检测 key 变化重跑."""
    tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
    tmp.close()
    p = Path(tmp.name)
    monkeypatch.setattr("shortvideo.config.DB_PATH", p)
    yield p
    try:
        p.unlink()
    except Exception:
        pass


# ─── apply_migrations 基本路径 ─────────────────────────────────


def test_apply_migrations_creates_schema_version_v1(tmp_db):
    """新 DB 应用一次 → schema_version=1, 一行 'baseline'."""
    from backend.services import migrations
    version = migrations.apply_migrations()
    assert version == 1

    with sqlite3.connect(str(tmp_db)) as con:
        rows = con.execute("SELECT version, note FROM schema_version").fetchall()
    assert len(rows) == 1
    assert rows[0][0] == 1
    assert rows[0][1] == "baseline"


def test_apply_migrations_creates_all_10_tables(tmp_db):
    """新 DB 应用一次 → 10 张表 + schema_version 全建."""
    from backend.services import migrations
    migrations.apply_migrations()

    with sqlite3.connect(str(tmp_db)) as con:
        rows = con.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
        ).fetchall()
    actual = {r[0] for r in rows}
    assert EXPECTED_TABLES <= actual, f"缺表: {EXPECTED_TABLES - actual}"


def test_apply_migrations_creates_works_indexes(tmp_db):
    """works 4 个索引全建 (D-065 ALTER 后才能建的 idx_works_type / idx_works_source_skill 直接进 v1)."""
    from backend.services import migrations
    migrations.apply_migrations()

    with sqlite3.connect(str(tmp_db)) as con:
        rows = con.execute(
            "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='works'"
        ).fetchall()
    indexes = {r[0] for r in rows}
    expected = {"idx_works_created_at", "idx_works_status", "idx_works_type", "idx_works_source_skill"}
    assert expected <= indexes, f"works 缺索引: {expected - indexes}"


# ─── legacy fixups 双覆盖 (P2-2) ──────────────────────────────


def test_legacy_fixup_works_old_db_missing_4_columns(tmp_db):
    """模拟 D-065 之前的 works 表 (缺 type/source_skill/thumb_path/metadata 4 列).
    apply 后应自动 ALTER 补齐, 类型正确."""
    # Step 1: 手动建一个老库 works (缺 4 列)
    with sqlite3.connect(str(tmp_db)) as con:
        con.execute("""
            CREATE TABLE works (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                created_at INTEGER NOT NULL,
                title TEXT,
                final_text TEXT NOT NULL,
                status TEXT NOT NULL
            )
        """)
        con.commit()

    # Step 2: apply_migrations
    from backend.services import migrations
    migrations.apply_migrations()

    # Step 3: 验 4 列补齐 + 类型对
    with sqlite3.connect(str(tmp_db)) as con:
        cols = {r[1]: r[2] for r in con.execute("PRAGMA table_info(works)").fetchall()}
    for col in ("type", "source_skill", "thumb_path", "metadata"):
        assert col in cols, f"works 缺列: {col}"
    assert "TEXT" in cols["type"], f"works.type 类型异常: {cols['type']}"


def test_legacy_fixup_tasks_old_db_missing_4_columns(tmp_db):
    """模拟 D-037b1/T9/T13 之前的 tasks 表 (D-037a 时代 13 列, 缺 4 个 ALTER 列).
    apply 后应自动 ALTER 补齐 progress_pct/estimated_seconds/retry_count/user_id."""
    # Step 1: 手动建 D-037a 完整的老 tasks 表 (含 ns/page_id 等 v1 核心列, 缺 4 ALTER 列)
    with sqlite3.connect(str(tmp_db)) as con:
        con.execute("""
            CREATE TABLE tasks (
                id TEXT PRIMARY KEY,
                kind TEXT NOT NULL,
                label TEXT,
                status TEXT NOT NULL,
                ns TEXT,
                page_id TEXT,
                step TEXT,
                payload TEXT,
                result TEXT,
                error TEXT,
                progress_text TEXT,
                started_ts INTEGER NOT NULL,
                finished_ts INTEGER,
                updated_ts INTEGER NOT NULL
            )
        """)
        con.commit()

    # Step 2: apply
    from backend.services import migrations
    migrations.apply_migrations()

    # Step 3: 验 4 列补齐
    with sqlite3.connect(str(tmp_db)) as con:
        cols = {r[1] for r in con.execute("PRAGMA table_info(tasks)").fetchall()}
    expected = {"progress_pct", "estimated_seconds", "retry_count", "user_id"}
    assert expected <= cols, f"tasks 缺列: {expected - cols}"


# ─── DB_PATH 切换 / 规范化 (P2-1 + P2-3) ──────────────────────


def test_apply_migrations_reruns_on_db_path_change(monkeypatch, tmp_path):
    """DB_PATH 切到新路径 → 自动重跑, 不需手动 reset_for_test."""
    from backend.services import migrations

    # DB1: apply
    db1 = tmp_path / "db1.db"
    monkeypatch.setattr("shortvideo.config.DB_PATH", db1)
    v1 = migrations.apply_migrations()
    assert v1 == 1
    assert db1.exists()

    # DB2: apply (新路径)
    db2 = tmp_path / "db2.db"
    monkeypatch.setattr("shortvideo.config.DB_PATH", db2)
    v2 = migrations.apply_migrations()
    assert v2 == 1
    assert db2.exists(), "DB_PATH 切换后 migrations 应该在新路径建表"


def test_path_normalization_treats_relative_and_absolute_as_same(monkeypatch, tmp_path):
    """current_db_key 规范化路径 — ~/相对路径/symlink 应被视为同一 DB."""
    from shortvideo.db import current_db_key

    db_abs = tmp_path / "mydb.db"
    db_abs.touch()

    # 绝对路径
    monkeypatch.setattr("shortvideo.config.DB_PATH", db_abs)
    key_abs = current_db_key()

    # 同路径 + 多余 ./
    monkeypatch.setattr("shortvideo.config.DB_PATH", str(db_abs).replace(os.sep, os.sep + "." + os.sep, 1))
    key_relative = current_db_key()

    # 都应规范化到同一字符串
    assert key_abs == key_relative, f"规范化失败: {key_abs} != {key_relative}"


def test_current_db_key_uses_resolve(monkeypatch, tmp_path):
    """验证 current_db_key 真的调 expanduser+resolve, 不是裸 str()."""
    from shortvideo.db import current_db_key

    db = tmp_path / "test.db"
    db.touch()
    monkeypatch.setattr("shortvideo.config.DB_PATH", db)

    key = current_db_key()
    # resolve 后应返回绝对路径
    assert os.path.isabs(key), f"key 不是绝对路径: {key}"
    # 应该等同于 Path.resolve() 结果
    assert key == str(db.resolve())


# ─── 幂等 ──────────────────────────────────────────────────────


def test_apply_migrations_idempotent(tmp_db):
    """连续 2 次 apply: schema_version 仍只有 1 行."""
    from backend.services import migrations
    migrations.apply_migrations()
    migrations.reset_for_test()  # 强制重跑同一 DB
    migrations.apply_migrations()

    with sqlite3.connect(str(tmp_db)) as con:
        rows = con.execute(
            "SELECT version, COUNT(*) FROM schema_version GROUP BY version"
        ).fetchall()
    assert len(rows) == 1
    assert rows[0][0] == 1
    assert rows[0][1] == 1, "schema_version v=1 不应重复 INSERT"


def test_apply_migrations_safe_when_called_multiple_times_same_db(tmp_db):
    """同一 DB 不 reset_for_test 也连续调 apply 应零副作用 (_applied_db_key 跟踪)."""
    from backend.services import migrations
    v1 = migrations.apply_migrations()
    v2 = migrations.apply_migrations()  # cache hit, 不重跑
    v3 = migrations.apply_migrations()
    assert v1 == v2 == v3 == 1
