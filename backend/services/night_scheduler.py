"""小华夜班 · cron 调度器 (D-040c).

启动时把 enabled + trigger_type=cron 的任务一股脑挂上 APScheduler
BackgroundScheduler. 任务 fire 时调 night_executor.run_job_async(job_id).

任务编辑/新建/启用-禁用之后, 调用方应该调 reload_jobs() 让调度器重读 DB.
api.py 的 night_jobs_create / night_jobs_update / night_jobs_delete 已经接.

trigger_type=file_watch 暂不在这里实装, 留 D-040f 做 (watchdog 包).
trigger_type=manual 不挂调度器 — 用户从 UI 点 "立即跑" 走 night_executor.

为啥 BackgroundScheduler 而不是 AsyncIOScheduler:
  我们的 runner 是同步 subprocess (~/Desktop/skills/<slug>/scripts/),
  没必要拉 asyncio. BackgroundScheduler 自带后台线程, 一样跑得起.
"""
from __future__ import annotations

import logging
import threading
from typing import Any

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

from backend.services import night_shift, night_executor


_log = logging.getLogger("night.scheduler")
_scheduler: BackgroundScheduler | None = None
_lock = threading.Lock()

# APScheduler 内部 job_id 命名: "night-job-<db_id>"
_PREFIX = "night-job-"


def _get_or_create() -> BackgroundScheduler:
    global _scheduler
    if _scheduler is None:
        # daemon=True: 后台线程, 主进程退出自动收尾
        _scheduler = BackgroundScheduler(daemon=True, timezone="Asia/Shanghai")
    return _scheduler


def is_running() -> bool:
    return _scheduler is not None and _scheduler.running


def start() -> None:
    """启动调度器并把所有 enabled+cron 的任务挂上. 幂等."""
    with _lock:
        sched = _get_or_create()
        if not sched.running:
            try:
                sched.start()
            except Exception as e:
                _log.error(f"scheduler start failed: {e}")
                return
        _reload_jobs_locked(sched)


def shutdown() -> None:
    """停调度器. 主要给测试/重启用."""
    global _scheduler
    with _lock:
        if _scheduler and _scheduler.running:
            try:
                _scheduler.shutdown(wait=False)
            except Exception:
                pass
        _scheduler = None


def reload_jobs() -> dict[str, Any]:
    """从 DB 重读 enabled+cron 的任务, 重新挂调度器. 返回挂上 / 跳过的统计."""
    with _lock:
        sched = _get_or_create()
        if not sched.running:
            return {"running": False, "scheduled": 0, "skipped": 0}
        return _reload_jobs_locked(sched)


def list_scheduled() -> list[dict[str, Any]]:
    """列当前调度器里挂的 job, 给 /docs 调试或前端总控页用."""
    if _scheduler is None or not _scheduler.running:
        return []
    out = []
    for j in _scheduler.get_jobs():
        if not j.id.startswith(_PREFIX):
            continue
        try:
            db_id = int(j.id[len(_PREFIX):])
        except ValueError:
            continue
        out.append({
            "scheduler_job_id": j.id,
            "night_job_id": db_id,
            "next_run_time": j.next_run_time.isoformat() if j.next_run_time else None,
            "trigger": str(j.trigger),
        })
    return out


def _reload_jobs_locked(sched: BackgroundScheduler) -> dict[str, Any]:
    # 先清掉所有 night-job-* 的旧条目
    for j in list(sched.get_jobs()):
        if j.id.startswith(_PREFIX):
            try:
                sched.remove_job(j.id)
            except Exception:
                pass

    scheduled = 0
    skipped: list[dict[str, Any]] = []
    for job in night_shift.list_jobs(enabled_only=True):
        if job["trigger_type"] != "cron":
            continue  # file_watch / manual 不在这里挂
        cfg = job.get("trigger_config") or {}
        cron_expr = cfg.get("cron") if isinstance(cfg, dict) else None
        if not cron_expr:
            skipped.append({"job_id": job["id"], "reason": "no cron expression"})
            continue
        tz = cfg.get("timezone") or "Asia/Shanghai"
        try:
            trigger = CronTrigger.from_crontab(cron_expr, timezone=tz)
        except Exception as e:
            skipped.append({"job_id": job["id"], "reason": f"bad cron '{cron_expr}': {e}"})
            continue
        sched.add_job(
            _fire,
            trigger=trigger,
            args=[job["id"]],
            id=f"{_PREFIX}{job['id']}",
            name=job.get("name") or f"job-{job['id']}",
            replace_existing=True,
            misfire_grace_time=300,  # 5 min, 错过就跳, 不补跑
            coalesce=True,           # 多次 misfire 合并成一次
            max_instances=1,         # 同一 job 不并发跑
        )
        scheduled += 1
    return {"running": True, "scheduled": scheduled, "skipped": skipped}


def _fire(job_id: int) -> None:
    """cron 触发回调. 不走异常逃逸, 否则 APScheduler 会 stop 整个 job."""
    try:
        night_executor.run_job_async(job_id)
    except Exception as e:
        _log.error(f"fire job_id={job_id} failed: {e}")
