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
    # D-087 v2: 素材库 5 表
    "material_assets", "material_tags", "material_asset_tags",
    "material_usage_log", "material_pending_moves",
}

# 跟 backend.services.migrations._MIGRATIONS 同步:
# v1 = D-084 baseline, v2 = D-087 素材库 5 表, v3 = B'-3 pending_moves 加 confidence/no_move/version/reviewed,
# v4 = B'-4 material_assets 加 content_hash/last_seen_at/missing_at, v5 = D-124 结构化画像字段
EXPECTED_VERSION = 5


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
    """新 DB 应用一次 → schema_version 含 v1 baseline + 所有 v2+ migrations."""
    from backend.services import migrations
    version = migrations.apply_migrations()
    assert version == EXPECTED_VERSION

    with sqlite3.connect(str(tmp_db)) as con:
        rows = con.execute("SELECT version, note FROM schema_version ORDER BY version").fetchall()
    versions = {r[0] for r in rows}
    assert versions == set(range(1, EXPECTED_VERSION + 1)), f"应有 v1..v{EXPECTED_VERSION}, 实际 {versions}"
    # v1 是 baseline
    v1_row = next(r for r in rows if r[0] == 1)
    assert v1_row[1] == "baseline"


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


def test_apply_migrations_creates_material_profile_columns(tmp_db):
    """D-124: material_assets 应有精品原片库结构化画像字段."""
    from backend.services import migrations
    migrations.apply_migrations()

    with sqlite3.connect(str(tmp_db)) as con:
        cols = {r[1] for r in con.execute("PRAGMA table_info(material_assets)").fetchall()}
        idx = {r[1] for r in con.execute("PRAGMA index_list(material_assets)").fetchall()}
    expected_cols = {
        "category", "visual_summary", "shot_type", "orientation",
        "quality_score", "usage_hint", "relevance_score",
        "recognition_source", "profile_updated_at",
    }
    assert expected_cols <= cols, f"material_assets 缺画像字段: {expected_cols - cols}"
    assert "idx_material_assets_category" in idx


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
    assert v1 == EXPECTED_VERSION
    assert db1.exists()

    # DB2: apply (新路径)
    db2 = tmp_path / "db2.db"
    monkeypatch.setattr("shortvideo.config.DB_PATH", db2)
    v2 = migrations.apply_migrations()
    assert v2 == EXPECTED_VERSION
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
    """连续 2 次 apply: 每个 version 仍只有 1 行 (不重复 INSERT)."""
    from backend.services import migrations
    migrations.apply_migrations()
    migrations.reset_for_test()  # 强制重跑同一 DB
    migrations.apply_migrations()

    with sqlite3.connect(str(tmp_db)) as con:
        rows = con.execute(
            "SELECT version, COUNT(*) FROM schema_version GROUP BY version"
        ).fetchall()
    # v1..vN 各应只有 1 行
    assert len(rows) == EXPECTED_VERSION
    assert all(r[1] == 1 for r in rows), f"每个 version 应只 INSERT 一次, 实际 {rows}"
    assert {r[0] for r in rows} == set(range(1, EXPECTED_VERSION + 1))


def test_apply_migrations_safe_when_called_multiple_times_same_db(tmp_db):
    """同一 DB 不 reset_for_test 也连续调 apply 应零副作用 (_applied_db_key 跟踪)."""
    from backend.services import migrations
    v1 = migrations.apply_migrations()
    v2 = migrations.apply_migrations()  # cache hit, 不重跑
    v3 = migrations.apply_migrations()
    assert v1 == v2 == v3 == EXPECTED_VERSION


# ─── P3 边界 (D-084 follow-up): DB 文件被删 cache 应失效 ──────


def test_apply_migrations_recovers_from_db_file_deletion(tmp_db):
    """P3: 同路径 DB 在进程存活期间被删, cache 应失效, apply 重新建表.

    场景: 测试 fixture cleanup / 用户外部删库 / 调试场景.
    没这个保护: cache 命中 → 跳过 → 业务 CRUD 撞 'no such table'.
    """
    from backend.services import migrations
    from shortvideo.db import current_db_path

    # 第一次 apply, 建库
    migrations.apply_migrations()
    db_path = current_db_path()
    assert db_path.exists()

    # 删 DB 文件 (cache 仍记着上次的 db_key)
    db_path.unlink()
    assert not db_path.exists()

    # 再次 apply: cache 应失效, 重新建库
    v = migrations.apply_migrations()
    assert v == EXPECTED_VERSION
    assert db_path.exists(), "DB 文件应被重新创建"

    # schema 完整性: 10 张表应该全在
    import sqlite3
    with sqlite3.connect(str(db_path)) as con:
        rows = con.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
        ).fetchall()
    actual = {r[0] for r in rows}
    assert EXPECTED_TABLES <= actual, f"DB 重建后缺表: {EXPECTED_TABLES - actual}"


def test_apply_migrations_recovers_from_schema_version_drop(tmp_db):
    """P3 变种: 同路径 DB 在但 schema_version 表被 DROP → cache 应失效."""
    import sqlite3
    from backend.services import migrations
    from shortvideo.db import current_db_path

    migrations.apply_migrations()

    # 模拟有人手动 DROP schema_version 表 (调试 / 误操作)
    with sqlite3.connect(str(current_db_path())) as con:
        con.execute("DROP TABLE schema_version")
        con.commit()

    # 再 apply: 应该重建 schema_version
    v = migrations.apply_migrations()
    assert v == EXPECTED_VERSION

    with sqlite3.connect(str(current_db_path())) as con:
        rows = con.execute("SELECT version FROM schema_version ORDER BY version").fetchall()
    expected_rows = [(i,) for i in range(1, EXPECTED_VERSION + 1)]
    assert rows == expected_rows, f"schema_version 应被重建为 v1..v{EXPECTED_VERSION}, 实际 {rows}"
