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
    progress_pct INTEGER,
    estimated_seconds INTEGER,
    started_ts INTEGER NOT NULL,
    finished_ts INTEGER,
    updated_ts INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tasks_status_updated ON tasks(status, updated_ts DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_kind ON tasks(kind);
CREATE INDEX IF NOT EXISTS idx_tasks_ns ON tasks(ns);
"""

# D-037b1: 老库 ALTER TABLE 加 progress_pct / estimated_seconds. 幂等, 已有列跳过.
_MIGRATIONS = [
    ("progress_pct", "INTEGER"),
    ("estimated_seconds", "INTEGER"),
]

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
            existing = {r[1] for r in con.execute("PRAGMA table_info(tasks)").fetchall()}
            for col, typ in _MIGRATIONS:
                if col not in existing:
                    con.execute(f"ALTER TABLE tasks ADD COLUMN {col} {typ}")
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
    estimated_seconds: int | None = None,
) -> str:
    """创建一条任务, 返回 task_id。默认 status=running (让调用方在创建线程前就进入运行态)。

    estimated_seconds: D-037b1 加, 前端顶栏 TaskBar 显示预计耗时, 不参与百分比计算 (清华哥拍板要真进度).
    """
    if status not in VALID_STATUS:
        raise ValueError(f"invalid status: {status}")
    _ensure_schema()
    tid = uuid.uuid4().hex
    now = int(time.time())
    with closing(sqlite3.connect(DB_PATH)) as con:
        con.execute(
            "INSERT INTO tasks (id, kind, label, status, ns, page_id, step, payload, "
            "estimated_seconds, started_ts, updated_ts) "
            "VALUES (?,?,?,?,?,?,?,?,?,?,?)",
            (
                tid, kind[:64], (label or "")[:200], status,
                (ns or "")[:32] or None, (page_id or "")[:32] or None, (step or "")[:32] or None,
                _dumps(payload),
                int(estimated_seconds) if estimated_seconds else None,
                now, now,
            ),
        )
        con.commit()
    return tid


def update_payload(task_id: str, patch: dict[str, Any]) -> None:
    """D-078: 合并 patch 到 task.payload (JSON merge). 用于 worker 拿到 submit_id 后写回.
    patch 为空 / payload 已含相同 key 都 OK (覆盖). 任务已结束也允许写 (debug 用)."""
    if not patch:
        return
    _ensure_schema()
    now = int(time.time())
    with closing(sqlite3.connect(DB_PATH)) as con:
        cur = con.execute("SELECT payload FROM tasks WHERE id=?", (task_id,))
        r = cur.fetchone()
        if not r:
            return
        current = _loads(r[0]) or {}
        if not isinstance(current, dict):
            current = {"_legacy_payload": current}
        current.update(patch)
        con.execute(
            "UPDATE tasks SET payload=?, updated_ts=? WHERE id=?",
            (_dumps(current), now, task_id),
        )
        con.commit()


def update_progress(task_id: str, progress_text: str, *, pct: int | None = None) -> None:
    """更新阶段文案(前端轮询看到实时进度)。

    pct: D-037b1 加. 0-100 的真实百分比, 由 worker 在每个里程碑后推. 不传则只更新 text.
    """
    _ensure_schema()
    now = int(time.time())
    if pct is not None:
        pct = max(0, min(100, int(pct)))
    with closing(sqlite3.connect(DB_PATH)) as con:
        if pct is None:
            con.execute(
                "UPDATE tasks SET progress_text=?, updated_ts=? WHERE id=? AND status='running'",
                ((progress_text or "")[:200], now, task_id),
            )
        else:
            con.execute(
                "UPDATE tasks SET progress_text=?, progress_pct=?, updated_ts=? "
                "WHERE id=? AND status='running'",
                ((progress_text or "")[:200], pct, now, task_id),
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


def recover_orphans() -> int:
    """启动时调一次: 上次进程死掉(uvicorn --reload / 崩溃 / 手动 kill)的孤儿任务全标 failed.
    daemon 工作线程随进程退出, DB 行没人收尾会永远卡 running, 前端轮询无解.

    D-078: 跳过 payload.remote_managed=true 的 task — 它们由 remote_jobs watcher 接管,
    submit_id 持久化在 remote_jobs 表, 重启后 watcher 自然继续轮询. 假杀这些会让用户
    看到"假失败"但即梦/数字人/出图其实还在跑.

    返回回收数量."""
    _ensure_schema()
    now = int(time.time())
    with closing(sqlite3.connect(DB_PATH)) as con:
        cur = con.execute(
            "UPDATE tasks SET status='failed', error=?, finished_ts=?, updated_ts=? "
            "WHERE status IN ('pending','running') "
            "AND (payload IS NULL OR payload NOT LIKE '%\"remote_managed\": true%')",
            ("服务重启,任务中断,请重新触发", now, now),
        )
        con.commit()
        return cur.rowcount


# D-068: 周期 watchdog — 处理"进程没死但任务挂了"的情况
# (上游 AI proxy hang / httpx 没正确 timeout / sync_fn 死循环 / 网络永久阻塞)
# 启动恢复只能处理"进程已重启"的孤儿, watchdog 处理"进程还活着但任务实质卡死"
_WATCHDOG_INTERVAL_SEC = 60
_WATCHDOG_MIN_TIMEOUT_SEC = 600   # 兜底: estimated 没填或 0 时, 视为 10 分钟超时
_WATCHDOG_MULTIPLIER = 5          # 实际超时 = max(estimated*5, MIN_TIMEOUT)

_watchdog_started = False
_watchdog_lock = threading.Lock()


def sweep_stuck() -> int:
    """周期 watchdog 一次扫描: 把跑超时的 running 任务标 failed.
    超时 = max(estimated_seconds*5, 600s). 估时缺失按 600s 兜底.
    不动 pending (没起跑无所谓), 不动 ok/failed/cancelled (已收尾).
    D-078: 不动 payload.remote_managed=true (远程任务由 remote_jobs watcher 接管,
    可能合理排队 30min+, watchdog 别假杀). 那批由 remote_jobs.max_wait_sec 保护.
    返回这次扫到的过期任务数."""
    _ensure_schema()
    now = int(time.time())
    threshold_expr = f"MAX(COALESCE(estimated_seconds,0)*{_WATCHDOG_MULTIPLIER}, {_WATCHDOG_MIN_TIMEOUT_SEC})"
    with closing(sqlite3.connect(DB_PATH)) as con:
        cur = con.execute(
            f"UPDATE tasks SET status='failed', error=?, finished_ts=?, updated_ts=? "
            f"WHERE status='running' AND ? - COALESCE(started_ts, updated_ts) > {threshold_expr} "
            f"AND (payload IS NULL OR payload NOT LIKE '%\"remote_managed\": true%')",
            (
                f"watchdog: 超时未完成(>{_WATCHDOG_MULTIPLIER}x 预估或 >{_WATCHDOG_MIN_TIMEOUT_SEC}s), 任务可能卡在 AI proxy",
                now, now, now,
            ),
        )
        con.commit()
        return cur.rowcount


def _watchdog_tick() -> None:
    """单次 tick: 扫一次 + 重新挂下一轮 Timer."""
    try:
        n = sweep_stuck()
        if n:
            import logging
            logging.getLogger("tasks.watchdog").warning(f"swept {n} stuck running tasks")
    except Exception as e:
        import logging
        logging.getLogger("tasks.watchdog").error(f"sweep failed: {e}")
    finally:
        t = threading.Timer(_WATCHDOG_INTERVAL_SEC, _watchdog_tick)
        t.daemon = True
        t.start()


def start_watchdog() -> bool:
    """启动周期 watchdog (idempotent). 返回 True 表示这次真启动了."""
    global _watchdog_started
    with _watchdog_lock:
        if _watchdog_started:
            return False
        _watchdog_started = True
    t = threading.Timer(_WATCHDOG_INTERVAL_SEC, _watchdog_tick)
    t.daemon = True
    t.start()
    return True


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


def run_async(
    *,
    kind: str,
    label: str | None = None,
    ns: str | None = None,
    page_id: str | None = None,
    step: str | None = None,
    payload: Any = None,
    estimated_seconds: int | None = None,
    progress_text: str = "AI 处理中...",
    sync_fn,
) -> str:
    """D-037b5 helper: 把一个同步函数包成异步任务, 立即返 task_id.

    spawn daemon thread 跑 sync_fn(), 推 5%/15%/95%/100% 真里程碑:
      - 5%  "准备 prompt..."
      - 15% progress_text (AI 真活的开始)
      - sync_fn() 跑 (这段 AI 黑盒, 进度条卡 15% 不动 = 真进度: AI 在想)
      - is_cancelled 检查
      - 95% "整理结果..."
      - finish_task(result, status=ok)

    异常路径: sync_fn 抛 → finish_task(error=..., status=failed)

    适用场景: 单次 AI 调用 + 不拆段的 skill (baokuan / hotrewrite / voicerewrite / planner / ...).
    复杂场景 (如 compliance 拆 3 段) 仍要自己写 worker.
    """
    task_id = create_task(
        kind=kind, label=label, ns=ns, page_id=page_id, step=step,
        payload=payload, estimated_seconds=estimated_seconds,
    )

    # D-070: 访客模式跨 daemon thread 传递. capture 当前 request 的 guest 值,
    # 在 worker 里 set_guest(captured) — 否则 daemon thread 起来时 contextvar
    # 默认是 False, work_log/preference 又开始记录, 失去访客意义.
    from backend.services import guest_mode
    captured_guest = guest_mode.capture()

    def _worker():
        guest_token = guest_mode.set_guest(captured_guest)
        try:
            update_progress(task_id, "准备 prompt...", pct=5)
            update_progress(task_id, progress_text, pct=15)
            result = sync_fn()
            if is_cancelled(task_id):
                return
            update_progress(task_id, "整理结果...", pct=95)
            finish_task(task_id, result=result)
            _autoinsert_text_work(kind=kind, label=label, task_id=task_id, result=result)
        except Exception as e:
            finish_task(
                task_id,
                error=f"{type(e).__name__}: {e}",
                status="failed",
            )
        finally:
            guest_mode.reset(guest_token)

    threading.Thread(target=_worker, daemon=True).start()
    return task_id


# D-065: 文字 skill 自动入作品库 helper (kind 前缀映射 source_skill)
_KIND_TO_SKILL = (
    ("baokuan.", "baokuan"),
    ("hotrewrite.", "hotrewrite"),
    ("voicerewrite.", "voicerewrite"),
    ("touliu.", "touliu"),
    ("wechat.write", "wechat"),
    ("planner.", "planner"),
    ("moments.", "moments"),
)


def _extract_text_from_result(r):
    """best-effort 从异构 result 结构提主要文本. 各 skill result 字段名不一."""
    if isinstance(r, str):
        return r
    if not isinstance(r, dict):
        return ""
    # 直接文本字段
    for k in ("article", "content", "text", "final_text", "result", "script", "html"):
        v = r.get(k)
        if isinstance(v, str) and v.strip():
            return v
    # 列表字段 (versions / copies / scripts / drafts)
    for k in ("versions", "copies", "scripts", "drafts", "items", "outputs"):
        v = r.get(k)
        if isinstance(v, list) and v:
            if all(isinstance(x, str) for x in v):
                return "\n\n---\n\n".join(v)
            if all(isinstance(x, dict) for x in v):
                parts = []
                for x in v:
                    for k2 in ("text", "content", "final_text", "version", "script", "copy", "body"):
                        if isinstance(x.get(k2), str) and x[k2].strip():
                            parts.append(x[k2])
                            break
                if parts:
                    return "\n\n---\n\n".join(parts)
    return ""


def _extract_tokens(r):
    if not isinstance(r, dict):
        return 0
    for k in ("tokens", "tokens_used", "total_tokens"):
        v = r.get(k)
        if isinstance(v, int):
            return v
    return 0


def _autoinsert_text_work(*, kind: str, label: str | None, task_id: str, result: Any) -> None:
    """D-065: 文字 skill 完成时自动 insert_work(type=text). 失败吃掉."""
    # D-070: 访客模式不入作品库 (朋友项目不该混进清华哥的作品)
    from backend.services import guest_mode
    if guest_mode.is_guest():
        return
    skill = None
    for prefix, name in _KIND_TO_SKILL:
        if kind.startswith(prefix):
            skill = name
            break
    if not skill:
        return
    try:
        from shortvideo.works import insert_work  # 局部 import, 避免循环
        text = _extract_text_from_result(result)
        if not text or len(text.strip()) < 10:
            return
        title = (label or "")[:60] or None
        insert_work(
            type="text",
            source_skill=skill,
            title=title,
            final_text=text,
            tokens_used=_extract_tokens(result),
            status="ready",
            metadata=json.dumps({"task_id": task_id, "kind": kind}, ensure_ascii=False),
        )
    except Exception:
        pass  # 回写失败不阻塞主流程


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
