"""SQLite schema 集中迁移 (D-084).

v1 baseline = D-084 改造前 10 张表的精确快照 (含历史 ALTER 进来的列).
未来加列/加表只 append 到 _MIGRATIONS, 不改老条目.

连接抽象在 shortvideo/db.py (本模块只负责 schema, 不持有 connection 工厂).

10 张表清单:
  works / materials / hot_topics / topics / metrics  (来自 shortvideo/works.py)
  tasks                                              (来自 backend/services/tasks.py)
  ai_calls                                           (来自 backend/services/ai_usage.py)
  night_jobs / night_job_runs                        (来自 backend/services/night_shift.py)
  remote_jobs                                        (来自 backend/services/remote_jobs.py)
"""
from __future__ import annotations

import sqlite3
import threading
from contextlib import closing

from shortvideo.db import current_db_key, get_connection


# ============================================================
# v1 baseline — 改造前 10 张表 + 索引精确快照
# ============================================================
# 含历史 ALTER 进来的列直接进 v1, 老库由 _legacy_fixups() 补齐.
# 新库一次 CREATE 全部建好.

V1_BASELINE = """
CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER PRIMARY KEY,
    applied_at INTEGER NOT NULL,
    note TEXT
);

-- ─── shortvideo/works.py 5 张表 ───────────────────────────

-- works (含 D-065 ALTER 的 4 列: type/source_skill/thumb_path/metadata)
CREATE TABLE IF NOT EXISTS works (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at INTEGER NOT NULL,
    title TEXT,
    source_url TEXT,
    original_text TEXT,
    final_text TEXT NOT NULL,
    avatar_id INTEGER,
    speaker_id INTEGER,
    shiliu_video_id INTEGER,
    local_path TEXT,
    duration_sec REAL,
    status TEXT NOT NULL,
    error TEXT,
    tokens_used INTEGER DEFAULT 0,
    type TEXT NOT NULL DEFAULT 'video',
    source_skill TEXT,
    thumb_path TEXT,
    metadata TEXT
);
CREATE INDEX IF NOT EXISTS idx_works_created_at ON works(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_works_status ON works(status);
CREATE INDEX IF NOT EXISTS idx_works_type ON works(type);
CREATE INDEX IF NOT EXISTS idx_works_source_skill ON works(source_skill);

CREATE TABLE IF NOT EXISTS materials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at INTEGER NOT NULL,
    url TEXT,
    title TEXT,
    author TEXT,
    duration_sec REAL,
    original_text TEXT NOT NULL,
    source TEXT
);
CREATE INDEX IF NOT EXISTS idx_materials_created_at ON materials(created_at DESC);

CREATE TABLE IF NOT EXISTS hot_topics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at INTEGER NOT NULL,
    platform TEXT,
    title TEXT NOT NULL,
    heat_score INTEGER DEFAULT 0,
    match_persona INTEGER DEFAULT 0,
    match_reason TEXT,
    source_url TEXT,
    fetched_from TEXT DEFAULT 'manual',
    status TEXT DEFAULT 'unused'
);
CREATE INDEX IF NOT EXISTS idx_hot_topics_created ON hot_topics(created_at DESC);

CREATE TABLE IF NOT EXISTS topics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    tags TEXT,
    heat_score INTEGER DEFAULT 0,
    source TEXT DEFAULT 'manual',
    status TEXT DEFAULT 'unused'
);
CREATE INDEX IF NOT EXISTS idx_topics_created ON topics(created_at DESC);

CREATE TABLE IF NOT EXISTS metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    work_id INTEGER NOT NULL,
    platform TEXT NOT NULL,
    views INTEGER DEFAULT 0,
    likes INTEGER DEFAULT 0,
    comments INTEGER DEFAULT 0,
    shares INTEGER DEFAULT 0,
    saves INTEGER DEFAULT 0,
    followers_gained INTEGER DEFAULT 0,
    conversions INTEGER DEFAULT 0,
    completion_rate REAL,
    notes TEXT,
    recorded_at INTEGER NOT NULL,
    source TEXT DEFAULT 'manual',
    UNIQUE(work_id, platform)
);
CREATE INDEX IF NOT EXISTS idx_metrics_work ON metrics(work_id);

-- ─── backend/services/tasks.py ─────────────────────────────

-- tasks (含 4 列 ALTER 历史: progress_pct/estimated_seconds/retry_count/user_id)
CREATE TABLE IF NOT EXISTS tasks (
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
    progress_pct INTEGER,
    estimated_seconds INTEGER,
    retry_count INTEGER,
    user_id TEXT,
    started_ts INTEGER NOT NULL,
    finished_ts INTEGER,
    updated_ts INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tasks_status_updated ON tasks(status, updated_ts DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_kind ON tasks(kind);
CREATE INDEX IF NOT EXISTS idx_tasks_ns ON tasks(ns);

-- ─── backend/services/ai_usage.py ──────────────────────────

CREATE TABLE IF NOT EXISTS ai_calls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts INTEGER NOT NULL,
    engine TEXT NOT NULL,
    route_key TEXT,
    prompt_tokens INTEGER DEFAULT 0,
    completion_tokens INTEGER DEFAULT 0,
    total_tokens INTEGER DEFAULT 0,
    duration_ms INTEGER DEFAULT 0,
    ok INTEGER DEFAULT 1,
    error TEXT
);
CREATE INDEX IF NOT EXISTS idx_ai_calls_ts ON ai_calls(ts DESC);
CREATE INDEX IF NOT EXISTS idx_ai_calls_engine ON ai_calls(engine);
CREATE INDEX IF NOT EXISTS idx_ai_calls_route ON ai_calls(route_key);

-- ─── backend/services/night_shift.py ───────────────────────

CREATE TABLE IF NOT EXISTS night_jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    icon TEXT,
    skill_slug TEXT,
    trigger_type TEXT NOT NULL,
    trigger_config TEXT,
    output_target TEXT,
    ai_route TEXT,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_night_jobs_enabled ON night_jobs(enabled);

CREATE TABLE IF NOT EXISTS night_job_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id INTEGER NOT NULL,
    started_at INTEGER NOT NULL,
    ended_at INTEGER,
    status TEXT NOT NULL,
    output_summary TEXT,
    output_refs TEXT,
    log TEXT,
    FOREIGN KEY(job_id) REFERENCES night_jobs(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_night_runs_job_started ON night_job_runs(job_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_night_runs_status ON night_job_runs(status);

-- ─── backend/services/remote_jobs.py ───────────────────────

CREATE TABLE IF NOT EXISTS remote_jobs (
    id TEXT PRIMARY KEY,
    task_id TEXT,
    provider TEXT NOT NULL,
    submit_id TEXT NOT NULL,
    submit_payload TEXT,
    last_status TEXT,
    last_poll_at INTEGER,
    poll_count INTEGER NOT NULL DEFAULT 0,
    submitted_at INTEGER NOT NULL,
    finished_at INTEGER,
    result TEXT,
    error TEXT,
    max_wait_sec INTEGER NOT NULL DEFAULT 7200
);
CREATE INDEX IF NOT EXISTS idx_rj_status ON remote_jobs(last_status, submitted_at);
CREATE INDEX IF NOT EXISTS idx_rj_provider ON remote_jobs(provider);
CREATE INDEX IF NOT EXISTS idx_rj_task ON remote_jobs(task_id);
CREATE INDEX IF NOT EXISTS idx_rj_submit ON remote_jobs(submit_id);
"""


# ============================================================
# Legacy fixups — 老库列补齐
# ============================================================
# CREATE TABLE IF NOT EXISTS 遇老表会跳过, 不会补列.
# 老库可能缺历史 ALTER 进来的列, 这里显式 PRAGMA + ALTER.
# 必须在标 schema_version=1 之前跑.

_LEGACY_FIXUPS: dict[str, list[tuple[str, str]]] = {
    # works: D-065 加的 4 列
    "works": [
        ("type", "TEXT NOT NULL DEFAULT 'video'"),
        ("source_skill", "TEXT"),
        ("thumb_path", "TEXT"),
        ("metadata", "TEXT"),
    ],
    # tasks: D-037b1 + T9 + T13 加的 4 列
    "tasks": [
        ("progress_pct", "INTEGER"),
        ("estimated_seconds", "INTEGER"),
        ("retry_count", "INTEGER"),
        ("user_id", "TEXT"),
    ],
}

# D-065: type/source_skill 索引在 _migrate_works 里建 (老库 ALTER 后才能建).
# 新库由 V1_BASELINE 直接建; 老库由这里幂等补建.
_LEGACY_INDEX_FIXUPS: list[str] = [
    "CREATE INDEX IF NOT EXISTS idx_works_type ON works(type)",
    "CREATE INDEX IF NOT EXISTS idx_works_source_skill ON works(source_skill)",
]


def _legacy_fixups(con: sqlite3.Connection) -> None:
    """老库列补齐. 必须在标 schema_version=1 之前跑.

    幂等: 已有列跳过, 不会重复 ALTER.
    """
    for table, cols in _LEGACY_FIXUPS.items():
        rows = con.execute(f"PRAGMA table_info({table})").fetchall()
        if not rows:
            continue  # 表不存在 → 由 V1_BASELINE 的 CREATE 接管, 不需要 fixup
        existing = {r[1] for r in rows}
        for col, typ in cols:
            if col not in existing:
                con.execute(f"ALTER TABLE {table} ADD COLUMN {col} {typ}")
    for stmt in _LEGACY_INDEX_FIXUPS:
        con.execute(stmt)


# ============================================================
# 后续迁移 (v2 起, append-only)
# ============================================================
# 每条 migration: (version, note, sql)
# - sql 必须用 IF NOT EXISTS / 显式检查 → 幂等
# - 不改老条目, 只 append
# - 列表顺序即应用顺序

_MIGRATIONS: list[tuple[int, str, str]] = [
    # 当前没有 v2+. 占位:
    # (2, "ai_calls 加 user_id 列", "ALTER TABLE ai_calls ADD COLUMN user_id TEXT;"),
]


# ============================================================
# 应用机制
# ============================================================

_apply_lock = threading.Lock()
_applied_db_key: str | None = None  # 上次 apply 时的规范化 DB 路径; 路径变 → 自动重跑


def _split_v1_baseline() -> tuple[list[str], list[str]]:
    """拆 V1_BASELINE 为 (CREATE TABLE 等先建语句, CREATE INDEX 后建语句).

    必要性: 老库 CREATE TABLE IF NOT EXISTS 遇已存在表跳过, 但 CREATE INDEX 仍会执行;
    若索引依赖的列尚未被 _legacy_fixups 补齐 (例如 idx_works_type 依赖 works.type 列),
    会撞 'no such column' 错误.

    解法: 拆开 → TABLE 先建 → _legacy_fixups 补列 → INDEX 后建.
    """
    table_stmts: list[str] = []
    index_stmts: list[str] = []
    for raw in V1_BASELINE.split(";"):
        stmt = raw.strip()
        if not stmt:
            continue
        # 取第一个非空非注释行判断
        first_code_line = ""
        for line in stmt.splitlines():
            line = line.strip()
            if line and not line.startswith("--"):
                first_code_line = line.upper()
                break
        if first_code_line.startswith("CREATE INDEX"):
            index_stmts.append(stmt)
        else:
            table_stmts.append(stmt)
    return table_stmts, index_stmts


def _current_version(con: sqlite3.Connection) -> int:
    """读 schema_version 当前最高版本. 没表 → 0."""
    try:
        row = con.execute("SELECT MAX(version) FROM schema_version").fetchone()
        return row[0] if row and row[0] is not None else 0
    except sqlite3.OperationalError:
        return 0  # schema_version 表都还没建


def _peek_current_version() -> int:
    """快速读当前版本, 不重跑迁移."""
    with closing(get_connection()) as con:
        return _current_version(con)


def _cache_still_valid(db_key: str) -> bool:
    """P3 (D-084 follow-up): cache hit 时验证 DB 实际状态.

    防 "同路径 DB 进程存活期被删 → _applied_db_key 仍命中 → 跳过重建":
    - DB 文件不存在 → cache 失效
    - schema_version 表不存在或没有 v1 行 → cache 失效

    返回 True = cache 可信, 短路返回; False = 需要重跑迁移.
    """
    if _applied_db_key != db_key:
        return False
    try:
        if not current_db_path().exists():
            return False
        return _peek_current_version() >= 1
    except Exception:
        return False


def apply_migrations() -> int:
    """启动时调用. 应用所有未应用的 migration. 返回当前版本号.

    幂等:
    - 同一进程内多次调用安全 (_applied_db_key 跟踪 + DB 文件/schema 实际验证)
    - DB 路径变了自动重跑 (兼容 pytest monkeypatch)
    - DB 文件被删自动重跑 (P3 边界, D-084 follow-up)
    - SQL 用 IF NOT EXISTS / INSERT OR IGNORE 兜底
    """
    global _applied_db_key
    db_key = current_db_key()
    if _cache_still_valid(db_key):
        return _peek_current_version()
    with _apply_lock:
        if _cache_still_valid(db_key):
            return _peek_current_version()
        # cache 失效 (DB 被删 / schema 缺) → 强制重跑前清掉标记
        if _applied_db_key == db_key:
            _applied_db_key = None
        with closing(get_connection()) as con:
            table_stmts, index_stmts = _split_v1_baseline()
            # Step 1: CREATE TABLE (老表跳过, 不会撞索引列缺失)
            for stmt in table_stmts:
                con.execute(stmt)
            # Step 2: 老库补列 (必须在 CREATE INDEX 之前: idx_works_type 依赖 works.type 列)
            _legacy_fixups(con)
            # Step 3: CREATE INDEX (此时所有列都齐了)
            for stmt in index_stmts:
                con.execute(stmt)
            # Step 4: 标 v1 baseline (如果还没标)
            current = _current_version(con)
            if current < 1:
                con.execute(
                    "INSERT OR IGNORE INTO schema_version(version, applied_at, note) "
                    "VALUES (1, strftime('%s','now'), 'baseline')"
                )
                current = 1
            # Step 4: 顺序应用 v2+ migration
            for version, note, sql in _MIGRATIONS:
                if version <= current:
                    continue
                con.executescript(sql)
                con.execute(
                    "INSERT INTO schema_version(version, applied_at, note) "
                    "VALUES (?, strftime('%s','now'), ?)",
                    (version, note),
                )
                current = version
            con.commit()
        _applied_db_key = db_key
        return current


def reset_for_test() -> None:
    """escape hatch: 强制重跑 same DB. fixture 一般不需要 (DB 路径变了自动重跑)."""
    global _applied_db_key
    _applied_db_key = None
