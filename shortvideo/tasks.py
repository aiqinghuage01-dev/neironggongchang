"""后台任务执行器 - 用线程池跑长任务(如石榴视频生成),不阻塞 Streamlit 主线程。

用法:
    tm = get_task_manager()
    task_id = tm.submit("generate_video", fn, args, kwargs)
    tm.status(task_id)  # {"state": "running", "progress": 45, ...}
"""
from __future__ import annotations

import threading
import time
import traceback
import uuid
from concurrent.futures import ThreadPoolExecutor, Future
from dataclasses import dataclass, field
from typing import Any, Callable


@dataclass
class TaskStatus:
    task_id: str
    kind: str
    state: str  # pending / running / succeed / failed
    progress: int = 0
    message: str = ""
    result: Any = None
    error: str | None = None
    started_at: float = 0.0
    ended_at: float | None = None
    extra: dict = field(default_factory=dict)

    def elapsed(self) -> float:
        end = self.ended_at or time.time()
        return end - self.started_at if self.started_at else 0.0


class TaskManager:
    def __init__(self, max_workers: int = 4):
        self._executor = ThreadPoolExecutor(max_workers=max_workers, thread_name_prefix="sv-task")
        self._lock = threading.Lock()
        self._tasks: dict[str, TaskStatus] = {}
        self._futures: dict[str, Future] = {}

    def submit(
        self,
        kind: str,
        fn: Callable,
        *args,
        **kwargs,
    ) -> str:
        task_id = uuid.uuid4().hex[:12]
        status = TaskStatus(task_id=task_id, kind=kind, state="pending", started_at=time.time())
        with self._lock:
            self._tasks[task_id] = status

        def progress_cb(progress: int, message: str = "", **extra):
            with self._lock:
                st = self._tasks.get(task_id)
                if st:
                    st.progress = max(0, min(100, int(progress)))
                    if message:
                        st.message = message
                    if extra:
                        st.extra.update(extra)

        def runner():
            with self._lock:
                self._tasks[task_id].state = "running"
            try:
                result = fn(*args, progress_cb=progress_cb, **kwargs)
                with self._lock:
                    st = self._tasks[task_id]
                    st.state = "succeed"
                    st.result = result
                    st.progress = 100
                    st.ended_at = time.time()
            except Exception as e:
                with self._lock:
                    st = self._tasks[task_id]
                    st.state = "failed"
                    st.error = f"{type(e).__name__}: {e}"
                    st.ended_at = time.time()
                    st.extra["traceback"] = traceback.format_exc()

        fut = self._executor.submit(runner)
        with self._lock:
            self._futures[task_id] = fut
        return task_id

    def status(self, task_id: str) -> TaskStatus | None:
        with self._lock:
            st = self._tasks.get(task_id)
            return None if st is None else TaskStatus(**st.__dict__)

    def all_tasks(self) -> list[TaskStatus]:
        with self._lock:
            return [TaskStatus(**t.__dict__) for t in self._tasks.values()]


_global_manager: TaskManager | None = None


def get_task_manager() -> TaskManager:
    global _global_manager
    if _global_manager is None:
        _global_manager = TaskManager()
    return _global_manager
