"""全局任务状态存储 (D-037a)。

提供 skill 后台任务的 CRUD · **不提供 execution engine**。
- 各 endpoint 自己在 threading.Thread 里跑任务, 在关键节点调 update_progress / finish。
- 前端从 /api/tasks 轮询拿状态, 做顶栏 TaskBar + 任务详情抽屉。

字段说明:
  id           uuid4 hex
  kind         "wechat.write" / "wechat.cover" / "dreamina.text2image" ...
  label        人类可读标题 ("写长文: 《标题》" / "配 5 张图")
  status       pending / running / ok / failed / cancelled
  ns           工作流命名空间 "wechat" / "hotrewrite" ... (用于前端把任务归到对应 skill)
  page_id      前端跳回哪个 page ("wechat" / "hotrewrite")
  step         任务涉及的 step ("write" / "cover")
  payload      JSON 入参(用于恢复状态 / 展示给用户)
  result       JSON 结果(成功后)
  error        错误文本
  progress_text 最近阶段文案("写第 3 段" · 2s 覆盖一次也 OK)
  started_ts / finished_ts / updated_ts  unix 秒

数据落 主项目 SQLite (works.db) 共享连接。
"""
from __future__ import annotations

import json
import sqlite3
import threading
import time
import uuid
from contextlib import closing
from typing import Any

from shortvideo.config import DB_PATH


SCHEMA = """
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
    started_ts INTEGER NOT NULL,
    finished_ts INTEGER,
    updated_ts INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tasks_status_updated ON tasks(status, updated_ts DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_kind ON tasks(kind);
CREATE INDEX IF NOT EXISTS idx_tasks_ns ON tasks(ns);
"""

_schema_init = threading.Lock()
_schema_done = False

VALID_STATUS = {"pending", "running", "ok", "failed", "cancelled"}


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


def _row_to_dict(r: sqlite3.Row) -> dict[str, Any]:
    d = dict(r)
    d["payload"] = _loads(d.get("payload"))
    d["result"] = _loads(d.get("result"))
    started = d.get("started_ts") or 0
    finished = d.get("finished_ts") or 0
    now = int(time.time())
    end = finished if finished else now
    d["elapsed_sec"] = max(0, end - started) if started else 0
    return d


def create_task(
    kind: str,
    *,
    label: str | None = None,
    ns: str | None = None,
    page_id: str | None = None,
    step: str | None = None,
    payload: Any = None,
    status: str = "running",
) -> str:
    """创建一条任务, 返回 task_id。默认 status=running (让调用方在创建线程前就进入运行态)。"""
    if status not in VALID_STATUS:
        raise ValueError(f"invalid status: {status}")
    _ensure_schema()
    tid = uuid.uuid4().hex
    now = int(time.time())
    with closing(sqlite3.connect(DB_PATH)) as con:
        con.execute(
            "INSERT INTO tasks (id, kind, label, status, ns, page_id, step, payload, started_ts, updated_ts) "
            "VALUES (?,?,?,?,?,?,?,?,?,?)",
            (
                tid, kind[:64], (label or "")[:200], status,
                (ns or "")[:32] or None, (page_id or "")[:32] or None, (step or "")[:32] or None,
                _dumps(payload), now, now,
            ),
        )
        con.commit()
    return tid


def update_progress(task_id: str, progress_text: str) -> None:
    """更新阶段文案(前端轮询看到实时进度)。"""
    _ensure_schema()
    now = int(time.time())
    with closing(sqlite3.connect(DB_PATH)) as con:
        con.execute(
            "UPDATE tasks SET progress_text=?, updated_ts=? WHERE id=? AND status='running'",
            ((progress_text or "")[:200], now, task_id),
        )
        con.commit()


def finish_task(
    task_id: str,
    *,
    result: Any = None,
    error: str | None = None,
    status: str | None = None,
) -> None:
    """标记任务结束。status 不传则按 error 是否为 None 自动定: ok / failed。"""
    if status is None:
        status = "failed" if error else "ok"
    if status not in VALID_STATUS:
        raise ValueError(f"invalid status: {status}")
    _ensure_schema()
    now = int(time.time())
    with closing(sqlite3.connect(DB_PATH)) as con:
        con.execute(
            "UPDATE tasks SET status=?, result=?, error=?, finished_ts=?, updated_ts=? WHERE id=?",
            (status, _dumps(result), (error or "")[:500] if error else None, now, now, task_id),
        )
        con.commit()


def cancel_task(task_id: str) -> bool:
    """软取消: 标记 cancelled。真正的中断靠任务循环自己检查 is_cancelled。"""
    _ensure_schema()
    now = int(time.time())
    with closing(sqlite3.connect(DB_PATH)) as con:
        cur = con.execute(
            "UPDATE tasks SET status='cancelled', finished_ts=?, updated_ts=? "
            "WHERE id=? AND status IN ('pending','running')",
            (now, now, task_id),
        )
        con.commit()
        return cur.rowcount > 0


def is_cancelled(task_id: str) -> bool:
    """任务线程定期调, 发现被取消就早退。"""
    _ensure_schema()
    with closing(sqlite3.connect(DB_PATH)) as con:
        r = con.execute("SELECT status FROM tasks WHERE id=?", (task_id,)).fetchone()
    return bool(r and r[0] == "cancelled")


def get_task(task_id: str) -> dict[str, Any] | None:
    _ensure_schema()
    with closing(sqlite3.connect(DB_PATH)) as con:
        con.row_factory = sqlite3.Row
        r = con.execute("SELECT * FROM tasks WHERE id=?", (task_id,)).fetchone()
    return _row_to_dict(r) if r else None


def list_tasks(
    *,
    status: str | None = None,
    kind: str | None = None,
    ns: str | None = None,
    limit: int = 50,
) -> list[dict[str, Any]]:
    """列最近的任务。status='running' 场景下用于顶栏 TaskBar 活跃任务数。"""
    _ensure_schema()
    clauses = []
    args: list[Any] = []
    if status:
        if "," in status:  # 支持 "running,pending"
            parts = [s.strip() for s in status.split(",") if s.strip()]
            clauses.append(f"status IN ({','.join('?' * len(parts))})")
            args.extend(parts)
        else:
            clauses.append("status=?")
            args.append(status)
    if kind:
        clauses.append("kind=?")
        args.append(kind)
    if ns:
        clauses.append("ns=?")
        args.append(ns)
    where = ("WHERE " + " AND ".join(clauses)) if clauses else ""
    sql = f"SELECT * FROM tasks {where} ORDER BY updated_ts DESC LIMIT ?"
    args.append(max(1, min(int(limit or 50), 200)))
    with closing(sqlite3.connect(DB_PATH)) as con:
        con.row_factory = sqlite3.Row
        rows = con.execute(sql, tuple(args)).fetchall()
    return [_row_to_dict(r) for r in rows]


def counts() -> dict[str, int]:
    """各状态数量, 前端顶栏红点用。"""
    _ensure_schema()
    with closing(sqlite3.connect(DB_PATH)) as con:
        rows = con.execute(
            "SELECT status, COUNT(*) AS c FROM tasks GROUP BY status"
        ).fetchall()
    out = {s: 0 for s in VALID_STATUS}
    for status, c in rows:
        out[status] = c
    out["active"] = out["pending"] + out["running"]
    return out


def cleanup_old(days: int = 7) -> int:
    """清掉 N 天前已结束的任务, 返回删除行数。建议在 cron 或启动时调。"""
    _ensure_schema()
    cutoff = int(time.time()) - days * 86400
    with closing(sqlite3.connect(DB_PATH)) as con:
        cur = con.execute(
            "DELETE FROM tasks WHERE status IN ('ok','failed','cancelled') AND finished_ts<?",
            (cutoff,),
        )
        con.commit()
        return cur.rowcount
