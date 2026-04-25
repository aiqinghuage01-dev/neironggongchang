"""小华夜班 · 任务执行器 stub (D-040b).

把 night_job 的执行包成 fire-and-poll: 立即返回 run_id, 后台线程跑.

本轮 (D-040b) 只搭骨架, 真正的 skill 执行(subprocess 调
~/Desktop/skills/<slug>/scripts/) 在 D-040c 调度器里接.
现在所有 job 都走 _placeholder_runner, 写一条 "skill_slug=X 未接入" 的
finish_run 让链路通.

注册自定义 runner:
  register_runner("content-planner", lambda job: {...summary/refs/log...})

约定 runner 返回:
  {"output_summary": str, "output_refs": list[dict] | None, "log": str | None}
runner 抛异常 → finish_run(status="failed", log=traceback)
"""
from __future__ import annotations

import threading
import traceback
from typing import Any, Callable

from backend.services import night_shift


RunnerFn = Callable[[dict[str, Any]], dict[str, Any]]

# skill_slug → runner. D-040c 会在导入时注册真正的 runner.
_RUNNERS: dict[str, RunnerFn] = {}


def register_runner(skill_slug: str, fn: RunnerFn) -> None:
    """供 D-040c 把 skill_slug 映射到真 subprocess runner."""
    _RUNNERS[skill_slug] = fn


def list_runners() -> list[str]:
    return sorted(_RUNNERS.keys())


def _placeholder_runner(job: dict[str, Any]) -> dict[str, Any]:
    """没注册 runner 的 job 走这个, 立即 success 但带提示."""
    slug = job.get("skill_slug") or "(无 skill_slug)"
    return {
        "output_summary": f"占位 · {job['name']} 未接入执行器",
        "output_refs": None,
        "log": (
            f"job_id={job['id']} skill_slug={slug}\n"
            f"runner 未注册. D-040c 调度器会接 ~/Desktop/skills/{slug}/ 真正的 subprocess.\n"
            f"现在只写一条假 success 记录, 让历史日志链路通."
        ),
    }


def run_job_async(job_id: int) -> int:
    """开 run + spawn 守护线程跑, 立即返回 run_id (调用方轮询 get_run).

    job 不存在抛 ValueError, 调用方应 raise HTTPException(404) 兜.
    """
    job = night_shift.get_job(job_id)
    if not job:
        raise ValueError(f"job {job_id} not found")
    run_id = night_shift.start_run(job_id)

    def _worker():
        runner = _RUNNERS.get(job.get("skill_slug") or "", _placeholder_runner)
        try:
            r = runner(job)
            night_shift.finish_run(
                run_id,
                status="success",
                output_summary=r.get("output_summary"),
                output_refs=r.get("output_refs"),
                log=r.get("log"),
            )
        except Exception as e:
            night_shift.finish_run(
                run_id,
                status="failed",
                log=f"{type(e).__name__}: {e}\n{traceback.format_exc()[-2000:]}",
            )

    t = threading.Thread(target=_worker, daemon=True, name=f"night-{job_id}-{run_id}")
    t.start()
    return run_id
