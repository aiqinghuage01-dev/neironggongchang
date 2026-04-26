"""小华夜班 · 数据层 (D-040a)。

用户睡觉的 23:00-6:00, 让 Mac 跑预设流水线
(抓选题/拆素材/维护知识库/复盘数据), 早上有一批可消费的产出.

**对外用「小华夜班」**, 代码内部 night_shift / night_job / night_job_run.

本模块只做存储 (job 元数据 + 运行历史). 不做调度 (D-040c)、不做 API (D-040b).

数据表:
  night_jobs      任务定义 (4 条预设 + 用户自加)
  night_job_runs  每次运行的快照 + 产出摘要 + 日志

数据落 主项目 SQLite (works.db), 共享连接, 跟 ai_calls / tasks 同库.
"""
from __future__ import annotations

import json
import sqlite3
import threading
import time
from contextlib import closing
from typing import Any

from shortvideo.config import DB_PATH


SCHEMA = """
CREATE TABLE IF NOT EXISTS night_jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    icon TEXT,
    skill_slug TEXT,
    trigger_type TEXT NOT NULL,        -- cron | file_watch | manual
    trigger_config TEXT,               -- JSON: {cron: "...", path: "...", ...}
    output_target TEXT,                -- materials | works | knowledge | home
    ai_route TEXT,                     -- 可选: 覆盖默认引擎路由 ("opus" / "deepseek")
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
    status TEXT NOT NULL,              -- running | success | failed
    output_summary TEXT,               -- "5 条选题" / "整理 12 条新笔记"
    output_refs TEXT,                  -- JSON: [{kind:"work", id:42}, ...]
    log TEXT,
    FOREIGN KEY(job_id) REFERENCES night_jobs(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_night_runs_job_started ON night_job_runs(job_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_night_runs_status ON night_job_runs(status);
"""

_schema_init = threading.Lock()
_schema_done = False

VALID_TRIGGER_TYPES = {"cron", "file_watch", "manual"}
VALID_OUTPUT_TARGETS = {"materials", "works", "knowledge", "home"}
VALID_RUN_STATUS = {"running", "success", "failed"}


def _ensure_schema():
    global _schema_done
    if _schema_done:
        return
    with _schema_init:
        if _schema_done:
            return
        with closing(sqlite3.connect(DB_PATH)) as con:
            con.executescript(SCHEMA)
            con.commit()
        _schema_done = True


def _dumps(v: Any) -> str | None:
    if v is None:
        return None
    try:
        return json.dumps(v, ensure_ascii=False, default=str)
    except Exception:
        return json.dumps({"_unserializable": str(type(v))})


def _loads(v: str | None) -> Any:
    if not v:
        return None
    try:
        return json.loads(v)
    except Exception:
        return v


def _job_row(r: sqlite3.Row) -> dict[str, Any]:
    d = dict(r)
    d["trigger_config"] = _loads(d.get("trigger_config"))
    d["enabled"] = bool(d.get("enabled"))
    return d


def _run_row(r: sqlite3.Row) -> dict[str, Any]:
    d = dict(r)
    d["output_refs"] = _loads(d.get("output_refs"))
    started = d.get("started_at") or 0
    ended = d.get("ended_at") or 0
    end = ended if ended else int(time.time())
    d["elapsed_sec"] = max(0, end - started) if started else 0
    return d


# ─── jobs CRUD ────────────────────────────────────────────────

def create_job(
    *,
    name: str,
    trigger_type: str,
    icon: str | None = None,
    skill_slug: str | None = None,
    trigger_config: Any = None,
    output_target: str | None = None,
    ai_route: str | None = None,
    enabled: bool = True,
) -> int:
    """新建一条夜班任务. 返回 job_id."""
    if trigger_type not in VALID_TRIGGER_TYPES:
        raise ValueError(f"invalid trigger_type: {trigger_type}")
    if output_target is not None and output_target not in VALID_OUTPUT_TARGETS:
        raise ValueError(f"invalid output_target: {output_target}")
    _ensure_schema()
    now = int(time.time())
    with closing(sqlite3.connect(DB_PATH)) as con:
        cur = con.execute(
            "INSERT INTO night_jobs (name, icon, skill_slug, trigger_type, trigger_config, "
            "output_target, ai_route, enabled, created_at, updated_at) "
            "VALUES (?,?,?,?,?,?,?,?,?,?)",
            (
                name[:100],
                (icon or "")[:8] or None,
                (skill_slug or "")[:64] or None,
                trigger_type,
                _dumps(trigger_config),
                output_target,
                (ai_route or "")[:32] or None,
                1 if enabled else 0,
                now, now,
            ),
        )
        con.commit()
        return int(cur.lastrowid)


def get_job(job_id: int) -> dict[str, Any] | None:
    _ensure_schema()
    with closing(sqlite3.connect(DB_PATH)) as con:
        con.row_factory = sqlite3.Row
        r = con.execute("SELECT * FROM night_jobs WHERE id=?", (job_id,)).fetchone()
    return _job_row(r) if r else None


def list_jobs(*, enabled_only: bool = False) -> list[dict[str, Any]]:
    _ensure_schema()
    sql = "SELECT * FROM night_jobs"
    args: tuple = ()
    if enabled_only:
        sql += " WHERE enabled=1"
    sql += " ORDER BY id ASC"
    with closing(sqlite3.connect(DB_PATH)) as con:
        con.row_factory = sqlite3.Row
        rows = con.execute(sql, args).fetchall()
    return [_job_row(r) for r in rows]


def update_job(job_id: int, **fields: Any) -> bool:
    """部分更新. 返回是否更新到行."""
    if "trigger_type" in fields and fields["trigger_type"] not in VALID_TRIGGER_TYPES:
        raise ValueError(f"invalid trigger_type: {fields['trigger_type']}")
    if "output_target" in fields and fields["output_target"] is not None and fields["output_target"] not in VALID_OUTPUT_TARGETS:
        raise ValueError(f"invalid output_target: {fields['output_target']}")

    _ensure_schema()
    cols = []
    args: list[Any] = []
    for k in ("name", "icon", "skill_slug", "trigger_type", "output_target", "ai_route"):
        if k in fields:
            v = fields[k]
            cols.append(f"{k}=?")
            args.append(v if v is None else str(v)[:200])
    if "trigger_config" in fields:
        cols.append("trigger_config=?")
        args.append(_dumps(fields["trigger_config"]))
    if "enabled" in fields:
        cols.append("enabled=?")
        args.append(1 if fields["enabled"] else 0)
    if not cols:
        return False
    cols.append("updated_at=?")
    args.append(int(time.time()))
    args.append(job_id)
    with closing(sqlite3.connect(DB_PATH)) as con:
        cur = con.execute(f"UPDATE night_jobs SET {', '.join(cols)} WHERE id=?", tuple(args))
        con.commit()
    return cur.rowcount > 0


def delete_job(job_id: int) -> bool:
    _ensure_schema()
    with closing(sqlite3.connect(DB_PATH)) as con:
        # runs 通过 ON DELETE CASCADE 自动清, 但 sqlite 默认外键不开, 显式删
        con.execute("DELETE FROM night_job_runs WHERE job_id=?", (job_id,))
        cur = con.execute("DELETE FROM night_jobs WHERE id=?", (job_id,))
        con.commit()
    return cur.rowcount > 0


def set_enabled(job_id: int, enabled: bool) -> bool:
    return update_job(job_id, enabled=enabled)


# ─── runs ─────────────────────────────────────────────────────

def start_run(job_id: int) -> int:
    """开一条 running 运行, 返回 run_id. 任务执行器调用."""
    _ensure_schema()
    now = int(time.time())
    with closing(sqlite3.connect(DB_PATH)) as con:
        cur = con.execute(
            "INSERT INTO night_job_runs (job_id, started_at, status) VALUES (?,?,?)",
            (job_id, now, "running"),
        )
        con.commit()
        return int(cur.lastrowid)


def finish_run(
    run_id: int,
    *,
    status: str = "success",
    output_summary: str | None = None,
    output_refs: Any = None,
    log: str | None = None,
) -> None:
    if status not in VALID_RUN_STATUS:
        raise ValueError(f"invalid status: {status}")
    _ensure_schema()
    now = int(time.time())
    with closing(sqlite3.connect(DB_PATH)) as con:
        con.execute(
            "UPDATE night_job_runs SET ended_at=?, status=?, output_summary=?, output_refs=?, log=? WHERE id=?",
            (
                now, status,
                (output_summary or "")[:200] or None,
                _dumps(output_refs),
                (log or "")[-4000:] if log else None,
                run_id,
            ),
        )
        con.commit()


def recover_orphan_runs() -> int:
    """D-068b: 启动时调一次. 上次进程死掉的 running runs 全标 failed.
    night executor 也是 daemon thread, --reload / 崩溃后留孤儿 row 永远 running.
    返回回收的 run 数."""
    _ensure_schema()
    now = int(time.time())
    with closing(sqlite3.connect(DB_PATH)) as con:
        cur = con.execute(
            "UPDATE night_job_runs SET ended_at=?, status='failed', "
            "log='[recover] 服务重启, 夜班 run 中断' WHERE status='running'",
            (now,),
        )
        con.commit()
        return cur.rowcount


def get_run(run_id: int) -> dict[str, Any] | None:
    _ensure_schema()
    with closing(sqlite3.connect(DB_PATH)) as con:
        con.row_factory = sqlite3.Row
        r = con.execute("SELECT * FROM night_job_runs WHERE id=?", (run_id,)).fetchone()
    return _run_row(r) if r else None


def list_runs(
    *,
    job_id: int | None = None,
    status: str | None = None,
    since_ts: int | None = None,
    limit: int = 50,
) -> list[dict[str, Any]]:
    _ensure_schema()
    clauses = []
    args: list[Any] = []
    if job_id is not None:
        clauses.append("job_id=?")
        args.append(job_id)
    if status:
        clauses.append("status=?")
        args.append(status)
    if since_ts:
        clauses.append("started_at>=?")
        args.append(int(since_ts))
    where = ("WHERE " + " AND ".join(clauses)) if clauses else ""
    sql = f"SELECT * FROM night_job_runs {where} ORDER BY started_at DESC LIMIT ?"
    args.append(max(1, min(int(limit or 50), 500)))
    with closing(sqlite3.connect(DB_PATH)) as con:
        con.row_factory = sqlite3.Row
        rows = con.execute(sql, tuple(args)).fetchall()
    return [_run_row(r) for r in rows]


def latest_run_for_job(job_id: int) -> dict[str, Any] | None:
    rs = list_runs(job_id=job_id, limit=1)
    return rs[0] if rs else None


# ─── digest (总部播报区数据源, D-040e 用) ─────────────────────

def get_digest(*, since_hours: int = 24) -> dict[str, Any]:
    """汇总最近 N 小时 (默认 24h) 的成功运行, 给 NightDigestCard 用.

    返回:
      {
        "since_ts": 1700000000,
        "items": [
          {"job_id":1, "job_name":"凌晨抓热点", "icon":"🔥", "output_target":"materials",
           "output_summary":"5 条选题", "output_refs":[...], "ended_at":...},
          ...
        ],
        "total_runs": 3,
      }
    用户可见文案不在这里拼, 让前端按 output_target 决定 "→ 看选题" 之类引导.
    """
    _ensure_schema()
    since_ts = int(time.time()) - since_hours * 3600
    with closing(sqlite3.connect(DB_PATH)) as con:
        con.row_factory = sqlite3.Row
        rows = con.execute(
            "SELECT r.id AS run_id, r.job_id, r.started_at, r.ended_at, r.status, "
            "r.output_summary, r.output_refs, j.name AS job_name, j.icon, j.output_target "
            "FROM night_job_runs r JOIN night_jobs j ON j.id=r.job_id "
            "WHERE r.status='success' AND r.started_at>=? "
            "ORDER BY r.ended_at DESC",
            (since_ts,),
        ).fetchall()
    items = []
    for r in rows:
        d = dict(r)
        d["output_refs"] = _loads(d.get("output_refs"))
        items.append(d)
    return {
        "since_ts": since_ts,
        "since_hours": since_hours,
        "items": items,
        "total_runs": len(items),
    }
