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

# ─── v2 (D-087): 素材库 5 张表 ────────────────────────────
# 用 material_* 前缀避免跟老 V1 的 materials 表 (爆款参考业务) 冲突.
# 5 表: material_assets / material_tags / material_asset_tags / material_usage_log / material_pending_moves

_V2_MATERIALS_LIB = """
CREATE TABLE IF NOT EXISTS material_assets (
    id TEXT PRIMARY KEY,
    abs_path TEXT NOT NULL UNIQUE,
    filename TEXT NOT NULL,
    ext TEXT NOT NULL,
    rel_folder TEXT,
    size_bytes INTEGER,
    width INTEGER,
    height INTEGER,
    duration_sec REAL,
    file_ctime INTEGER,
    imported_at INTEGER NOT NULL,
    thumb_path TEXT,
    ocr_text TEXT,
    status TEXT NOT NULL DEFAULT 'sorted',
    is_pending_review INTEGER NOT NULL DEFAULT 0,
    user_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_material_assets_folder ON material_assets(rel_folder);
CREATE INDEX IF NOT EXISTS idx_material_assets_status ON material_assets(status);
CREATE INDEX IF NOT EXISTS idx_material_assets_imported ON material_assets(imported_at DESC);
CREATE INDEX IF NOT EXISTS idx_material_assets_pending ON material_assets(is_pending_review);

CREATE TABLE IF NOT EXISTS material_tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    source TEXT NOT NULL,
    color TEXT,
    created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_material_tags_source ON material_tags(source);

CREATE TABLE IF NOT EXISTS material_asset_tags (
    asset_id TEXT NOT NULL,
    tag_id INTEGER NOT NULL,
    confidence REAL DEFAULT 1.0,
    PRIMARY KEY (asset_id, tag_id)
);
CREATE INDEX IF NOT EXISTS idx_material_asset_tags_tag ON material_asset_tags(tag_id);

CREATE TABLE IF NOT EXISTS material_usage_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    asset_id TEXT NOT NULL,
    used_in TEXT,
    used_at INTEGER NOT NULL,
    position_sec REAL
);
CREATE INDEX IF NOT EXISTS idx_material_usage_asset ON material_usage_log(asset_id);
CREATE INDEX IF NOT EXISTS idx_material_usage_at ON material_usage_log(used_at DESC);

CREATE TABLE IF NOT EXISTS material_pending_moves (
    asset_id TEXT PRIMARY KEY,
    suggested_folder TEXT,
    is_new_folder INTEGER NOT NULL DEFAULT 0,
    reason TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at INTEGER NOT NULL
);
"""


# ──────────────────────────────────────────
# V3: B'-3 (GPT 修订) — pending_moves 加 confidence/no_move/suggestion_version/reviewed_at
# 旧 1616 条 confidence=NULL, suggestion_version=1 被新策略默认过滤; status 改 'stale' 标记不打扰.
# 新一代建议 suggestion_version=2, 必须 confidence>=0.75 且 no_move=false 才进 pending.
# 用 callable 实现幂等 (ALTER TABLE ADD COLUMN 在 SQLite 没有 IF NOT EXISTS, 自己 PRAGMA 判).
# ──────────────────────────────────────────


def _v3_pending_moves_review(con: sqlite3.Connection) -> None:
    rows = con.execute("PRAGMA table_info(material_pending_moves)").fetchall()
    existing = {r[1] for r in rows}
    new_cols = [
        ("confidence", "REAL"),
        ("no_move", "INTEGER DEFAULT 0"),
        ("suggestion_version", "INTEGER DEFAULT 1"),
        ("reviewed_at", "INTEGER"),
    ]
    for col, typ in new_cols:
        if col not in existing:
            con.execute(f"ALTER TABLE material_pending_moves ADD COLUMN {col} {typ}")
    # 旧 pending 条目降级 'stale': 凭文件夹差激进塞的, 没 confidence
    con.execute(
        "UPDATE material_pending_moves SET status='stale' "
        "WHERE status='pending' AND confidence IS NULL"
    )


# 每条 migration: (version, note, sql_or_callable)
# 类型为 str 时走 executescript; 为 callable 时调用 fn(conn) 执行 (适合幂等 ALTER 等情况).
_MIGRATIONS: list[tuple[int, str, str | "callable"]] = [
    (2, "D-087 素材库 5 表 (material_assets/tags/asset_tags/usage_log/pending_moves)", _V2_MATERIALS_LIB),
    (3, "B'-3 pending_moves 加 confidence/no_move/suggestion_version/reviewed_at, 旧条目标 stale", _v3_pending_moves_review),
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
            # Step 4: 顺序应用 v2+ migration. 支持 SQL str (executescript) 或 callable(con) (幂等).
            for version, note, sql_or_fn in _MIGRATIONS:
                if version <= current:
                    continue
                if callable(sql_or_fn):
                    sql_or_fn(con)
                else:
                    con.executescript(sql_or_fn)
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
