"""远程长任务持久化 + watcher (D-078).

解决: 即梦/数字人/出图 等远程 API 排队 → daemon thread 死等 timeout → task 假 failed,
但远程其实还在跑 (用户充了 credits / 数据没入库 / 用户傻眼).

设计:
- 提交后调 register(submit_id, provider, task_id, payload) → DB 行 + task.payload 加
  remote_managed=true 让 watchdog skip (不会被 sweep_stuck 假杀)
- daemon thread 立即 return, 不再 while 死等
- watcher 60s 扫所有 last_status not in ('done','failed','timeout') 的 remote_job, 调
  provider 注册的 poll_fn(submit_id) 拿真终态:
  - done   → on_done(rj, result) (provider 自己负责入作品库等); finish_task(ok)
  - failed → finish_task(failed)
  - 其他 → 更新 last_status / last_poll_at 继续等
- 超 max_wait_sec (默认 2h) 仍未终态 → 标 timeout, finish_task(failed). 用户可
  /api/<provider>/recover/{submit_id} 手动重查 (D-078c).
- 进程重启不丢 (DB 持久化), watcher startup hook 自然接管 last_status 不是终态的行.
"""
from __future__ import annotations

import json
import logging
import sqlite3
import threading
import time
import uuid
from contextlib import closing
from dataclasses import dataclass
from typing import Any, Callable

from shortvideo.config import DB_PATH

log = logging.getLogger("remote_jobs")


SCHEMA = """
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

TERMINAL_STATUS = {"done", "failed", "timeout", "cancelled"}

# provider 注册表: name → handler
_PROVIDERS: dict[str, "ProviderHandler"] = {}
_providers_lock = threading.Lock()

_schema_lock = threading.Lock()
_schema_done = False

_watcher_started = False
_watcher_lock = threading.Lock()
_WATCHER_INTERVAL_SEC = 60


@dataclass
class ProviderHandler:
    """每个 provider (dreamina/hedra/apimart) 注册一个 handler.

    poll_fn(submit_id) -> dict:
      返回值约定: {"status": "querying"|"done"|"failed"|..., "result": <任意>, "error": str|None}
      status 为 done 视为成功终态
      status 为 failed/error/cancel 视为失败终态
      其他视为继续等
    on_done(rj_dict, result_from_poll):
      done 时回调 — provider 自行决定入作品库 / 触发后续动作
    on_failed(rj_dict, error_msg):
      failed 时回调 — 让 provider 知道, 可选记录
    """
    name: str
    poll_fn: Callable[[str], dict[str, Any]]
    on_done: Callable[[dict, Any], None] | None = None
    on_failed: Callable[[dict, str], None] | None = None


def _ensure_schema():
    global _schema_done
    if _schema_done:
        return
    with _schema_lock:
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


def _row_to_dict(r: sqlite3.Row | None) -> dict[str, Any] | None:
    if r is None:
        return None
    d = dict(r)
    d["submit_payload"] = _loads(d.get("submit_payload"))
    d["result"] = _loads(d.get("result"))
    return d


def register_provider(
    name: str,
    poll_fn: Callable[[str], dict[str, Any]],
    *,
    on_done: Callable[[dict, Any], None] | None = None,
    on_failed: Callable[[dict, str], None] | None = None,
) -> None:
    """idempotent — 重复注册同名 provider 会覆盖 (热重载场景)."""
    with _providers_lock:
        _PROVIDERS[name] = ProviderHandler(
            name=name, poll_fn=poll_fn, on_done=on_done, on_failed=on_failed,
        )


def get_provider(name: str) -> ProviderHandler | None:
    with _providers_lock:
        return _PROVIDERS.get(name)


def list_providers() -> list[str]:
    with _providers_lock:
        return sorted(_PROVIDERS.keys())


def register(
    *,
    provider: str,
    submit_id: str,
    task_id: str | None = None,
    submit_payload: Any = None,
    max_wait_sec: int = 7200,
) -> str:
    """注册一个 remote job. 返回 rj_id.

    同步在调用方 (api endpoint daemon thread) 提交远程 API 拿到 submit_id 之后调一次,
    然后立即 return; watcher 后续接管轮询.
    """
    _ensure_schema()
    rj_id = uuid.uuid4().hex
    now = int(time.time())
    with closing(sqlite3.connect(DB_PATH)) as con:
        con.execute(
            "INSERT INTO remote_jobs "
            "(id, task_id, provider, submit_id, submit_payload, last_status, "
            " last_poll_at, poll_count, submitted_at, max_wait_sec) "
            "VALUES (?,?,?,?,?,?,?,?,?,?)",
            (
                rj_id, task_id, provider[:32], submit_id[:200],
                _dumps(submit_payload),
                "pending", None, 0, now, int(max_wait_sec),
            ),
        )
        con.commit()
    return rj_id


def get(rj_id: str) -> dict[str, Any] | None:
    _ensure_schema()
    with closing(sqlite3.connect(DB_PATH)) as con:
        con.row_factory = sqlite3.Row
        r = con.execute("SELECT * FROM remote_jobs WHERE id=?", (rj_id,)).fetchone()
    return _row_to_dict(r)


def get_by_submit_id(submit_id: str) -> dict[str, Any] | None:
    _ensure_schema()
    with closing(sqlite3.connect(DB_PATH)) as con:
        con.row_factory = sqlite3.Row
        r = con.execute(
            "SELECT * FROM remote_jobs WHERE submit_id=? ORDER BY submitted_at DESC LIMIT 1",
            (submit_id,),
        ).fetchone()
    return _row_to_dict(r)


def list_pending(provider: str | None = None, limit: int = 200) -> list[dict[str, Any]]:
    """非终态的 remote_jobs — 给 watcher 用."""
    _ensure_schema()
    args: list[Any] = []
    where = "WHERE last_status IS NULL OR last_status NOT IN ('done','failed','timeout','cancelled')"
    if provider:
        where += " AND provider=?"
        args.append(provider)
    args.append(limit)
    with closing(sqlite3.connect(DB_PATH)) as con:
        con.row_factory = sqlite3.Row
        rows = con.execute(
            f"SELECT * FROM remote_jobs {where} ORDER BY submitted_at ASC LIMIT ?",
            tuple(args),
        ).fetchall()
    return [_row_to_dict(r) for r in rows]


def list_recent(*, provider: str | None = None, limit: int = 50) -> list[dict[str, Any]]:
    _ensure_schema()
    args: list[Any] = []
    where = ""
    if provider:
        where = "WHERE provider=?"
        args.append(provider)
    args.append(limit)
    with closing(sqlite3.connect(DB_PATH)) as con:
        con.row_factory = sqlite3.Row
        rows = con.execute(
            f"SELECT * FROM remote_jobs {where} ORDER BY submitted_at DESC LIMIT ?",
            tuple(args),
        ).fetchall()
    return [_row_to_dict(r) for r in rows]


def update_status(rj_id: str, last_status: str) -> None:
    """中间态更新 (querying / processing 等) — 不算终态."""
    _ensure_schema()
    now = int(time.time())
    with closing(sqlite3.connect(DB_PATH)) as con:
        con.execute(
            "UPDATE remote_jobs SET last_status=?, last_poll_at=?, poll_count=poll_count+1 WHERE id=?",
            (last_status[:32], now, rj_id),
        )
        con.commit()


def mark_done(rj_id: str, *, result: Any = None) -> None:
    _ensure_schema()
    now = int(time.time())
    with closing(sqlite3.connect(DB_PATH)) as con:
        con.execute(
            "UPDATE remote_jobs SET last_status='done', last_poll_at=?, finished_at=?, "
            "poll_count=poll_count+1, result=? WHERE id=?",
            (now, now, _dumps(result), rj_id),
        )
        con.commit()


def mark_failed(rj_id: str, *, error: str) -> None:
    _ensure_schema()
    now = int(time.time())
    with closing(sqlite3.connect(DB_PATH)) as con:
        con.execute(
            "UPDATE remote_jobs SET last_status='failed', last_poll_at=?, finished_at=?, "
            "poll_count=poll_count+1, error=? WHERE id=?",
            (now, now, (error or "")[:500], rj_id),
        )
        con.commit()


def mark_timeout(rj_id: str, *, error: str = "等远程结果超时, 可手动重查") -> None:
    _ensure_schema()
    now = int(time.time())
    with closing(sqlite3.connect(DB_PATH)) as con:
        con.execute(
            "UPDATE remote_jobs SET last_status='timeout', last_poll_at=?, finished_at=?, "
            "poll_count=poll_count+1, error=? WHERE id=?",
            (now, now, error[:500], rj_id),
        )
        con.commit()


def reset_for_recover(rj_id: str) -> None:
    """手动重查 (D-078c) 或 worker 恢复时把 timeout/failed 重置为 pending, watcher 重新接管."""
    _ensure_schema()
    with closing(sqlite3.connect(DB_PATH)) as con:
        con.execute(
            "UPDATE remote_jobs SET last_status='pending', finished_at=NULL, error=NULL "
            "WHERE id=?",
            (rj_id,),
        )
        con.commit()


# ─── watcher ──────────────────────────────────────────────────────────

def _watcher_tick() -> dict[str, int]:
    """单次 tick: 扫所有 pending, 调 provider poll_fn 拿真终态.

    返回 {polled, done, failed, timeout, error}.
    """
    counts = {"polled": 0, "done": 0, "failed": 0, "timeout": 0, "error": 0}
    try:
        pending = list_pending()
    except Exception as e:
        log.error(f"list_pending failed: {e}")
        return counts

    now = int(time.time())
    for rj in pending:
        rj_id = rj["id"]
        provider_name = rj["provider"]
        submit_id = rj["submit_id"]
        submitted_at = rj.get("submitted_at") or now
        max_wait = rj.get("max_wait_sec") or 7200

        # 超 max_wait → 标 timeout (不删 DB 行, 给用户 recover 路径)
        if now - submitted_at > max_wait:
            try:
                mark_timeout(rj_id)
                counts["timeout"] += 1
                _finish_associated_task(
                    rj, status="failed",
                    error=f"等远程 {provider_name} 结果超 {max_wait // 60}min, 可手动重查 submit_id={submit_id}",
                )
                # 调 provider on_failed
                ph = get_provider(provider_name)
                if ph and ph.on_failed:
                    try:
                        ph.on_failed(rj, "timeout")
                    except Exception as cb_err:
                        log.error(f"on_failed cb error: {cb_err}")
            except Exception as e:
                log.error(f"mark_timeout {rj_id} failed: {e}")
            continue

        ph = get_provider(provider_name)
        if not ph:
            log.warning(f"no provider registered for {provider_name}, skip {rj_id}")
            continue

        counts["polled"] += 1
        try:
            poll = ph.poll_fn(submit_id)
        except Exception as e:
            log.error(f"poll {provider_name} {submit_id} failed: {e}")
            counts["error"] += 1
            update_status(rj_id, f"poll_error")
            continue

        status = (poll or {}).get("status", "").lower()
        result = (poll or {}).get("result")
        err = (poll or {}).get("error") or ""

        if status == "done":
            try:
                mark_done(rj_id, result=result)
                counts["done"] += 1
                if ph.on_done:
                    try:
                        ph.on_done(rj, result)
                    except Exception as cb_err:
                        log.error(f"on_done cb error for {rj_id}: {cb_err}")
                _finish_associated_task(rj, status="ok", result=result)
            except Exception as e:
                log.error(f"mark_done {rj_id} failed: {e}")
        elif status in ("failed", "fail", "error", "cancelled"):
            try:
                mark_failed(rj_id, error=err or status)
                counts["failed"] += 1
                if ph.on_failed:
                    try:
                        ph.on_failed(rj, err or status)
                    except Exception as cb_err:
                        log.error(f"on_failed cb error for {rj_id}: {cb_err}")
                _finish_associated_task(rj, status="failed", error=err or f"远程 {provider_name} 失败: {status}")
            except Exception as e:
                log.error(f"mark_failed {rj_id} failed: {e}")
        else:
            update_status(rj_id, status or "querying")

    return counts


def _finish_associated_task(rj: dict, *, status: str, result: Any = None, error: str | None = None) -> None:
    """rj 关联了 task_id 时, 用 watcher 拿到的真终态 finish 那个 task.
    避免循环 import — 局部 import tasks_service.
    """
    task_id = rj.get("task_id")
    if not task_id:
        return
    try:
        from backend.services import tasks as tasks_service
        # 已收尾的 task 不动 (例如用户主动取消)
        t = tasks_service.get_task(task_id)
        if not t:
            return
        if t["status"] not in ("running", "pending"):
            return
        tasks_service.finish_task(
            task_id, result=result, error=error, status=status,
        )
    except Exception as e:
        log.error(f"finish_associated_task {task_id} failed: {e}")


def _watcher_loop():
    """daemon 循环 — 60s 一 tick. 异常吃掉继续跑 (不让 watcher 自己挂掉)."""
    while True:
        try:
            counts = _watcher_tick()
            if counts["done"] or counts["failed"] or counts["timeout"]:
                log.info(f"watcher tick: {counts}")
        except Exception as e:
            log.error(f"watcher tick failed: {e}")
        time.sleep(_WATCHER_INTERVAL_SEC)


def start_watcher() -> bool:
    """启动 in-process watcher daemon (idempotent). 返回 True 表示这次真启."""
    global _watcher_started
    with _watcher_lock:
        if _watcher_started:
            return False
        _watcher_started = True
    t = threading.Thread(target=_watcher_loop, daemon=True, name="remote_jobs_watcher")
    t.start()
    return True


def watcher_running() -> bool:
    return _watcher_started


def tick_once() -> dict[str, int]:
    """测试 / 手动触发用 (不依赖 60s 循环). 返回本次 counts."""
    return _watcher_tick()


# ─── 调试用 ─────────────────────────────────────────────

def stats() -> dict[str, int]:
    """各状态统计, /api/health 或 dashboard 展示."""
    _ensure_schema()
    out = {"pending": 0, "querying": 0, "done": 0, "failed": 0, "timeout": 0, "cancelled": 0, "total": 0}
    with closing(sqlite3.connect(DB_PATH)) as con:
        rows = con.execute(
            "SELECT COALESCE(last_status,'pending') AS s, COUNT(*) AS c FROM remote_jobs GROUP BY s"
        ).fetchall()
    for s, c in rows:
        out[s] = c
        out["total"] += c
    return out
