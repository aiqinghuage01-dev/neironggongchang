"""柿榴 (shiliu) 数字人视频 watcher provider 接入 (D-079).

柿榴是数字人 (hedra wrapper) 提供方:
  - POST video/createByText → 拿 video_id (类似 submit_id)
  - POST video/status        → 查状态/进度/url
  - 模型抽风 / 排队慢时, 老路径靠前端 setInterval polling, 关页面就丢

D-079 改: video/submit 同步拿 video_id 后, register remote_job, watcher 接管:
  - 60s 一次 poll, 拿 ready/done → 自动下载 mp4 + 更新 work 入库
  - 失败 → 标 task failed
  - 进程重启不丢

旧路径 /api/video/query 保留 — 前端可继续 polling 兜底.
"""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

log = logging.getLogger("shiliu_service")


def _poll_for_watcher(submit_id: str) -> dict[str, Any]:
    """remote_jobs watcher poll_fn.

    submit_id = str(video_id) (柿榴 video_id 是 int, 我们字符串化).
    """
    try:
        from shortvideo.shiliu import ShiliuClient
        with ShiliuClient() as c:
            st = c.get_video_status(int(submit_id))
    except Exception as e:
        return {"status": "poll_error", "error": str(e)[:200]}

    sl = (st.status or "").lower()
    DONE_SET = {"ready", "succeed", "success", "complete", "completed", "finished", "done"}
    FAIL_SET = {"failed", "error"}

    if st.video_url or sl in DONE_SET:
        # 下载到本地
        from shortvideo.config import VIDEO_DIR
        dest = VIDEO_DIR / f"shiliu_{submit_id}.mp4"
        if not dest.exists() and st.video_url:
            try:
                from shortvideo.shiliu import ShiliuClient
                with ShiliuClient() as c2:
                    c2.download_video(st.video_url, dest)
            except Exception as e:
                # 下载失败, 但视频在云端就绪 → 算 done 但本地路径空, 后续手动 recover
                log.warning(f"download shiliu {submit_id} failed: {e}")
        return {
            "status": "done",
            "result": {
                "video_id": int(submit_id),
                "video_url": st.video_url,
                "local_path": str(dest) if dest.exists() else "",
                "title": st.title,
                "progress": st.progress,
            },
        }

    if sl in FAIL_SET:
        return {"status": "failed", "error": f"柿榴返回 {sl}"}

    return {
        "status": sl or "processing",
        "progress": st.progress,
    }


def _on_done_for_watcher(rj: dict[str, Any], result: Any) -> None:
    """done 时入作品库 — 更新原 work (api.video_submit 已建好), 没有就新建."""
    payload = rj.get("submit_payload") or {}
    video_id = rj.get("submit_id", "")
    local_path = (result or {}).get("local_path", "")
    work_id = payload.get("work_id")
    title = payload.get("title", "") or (result or {}).get("title", "") or f"shiliu_{video_id}"

    try:
        from shortvideo.works import update_work, insert_work, list_works
        if work_id:
            update_work(work_id, status="ready", local_path=local_path or None)
            return
        # 没 work_id (老路径或者 fallback): 找 shiliu_video_id 匹配
        ws = [w for w in list_works(limit=200) if getattr(w, "shiliu_video_id", None) == int(video_id)]
        if ws:
            update_work(ws[0].id, status="ready", local_path=local_path or None)
            return
        # 完全没有 — 新建一个
        insert_work(
            type="video", source_skill="shiliu",
            title=title[:48],
            local_path=local_path or None,
            thumb_path=None,
            status="ready",
            shiliu_video_id=int(video_id),
        )
    except Exception as e:
        log.error(f"shiliu on_done insert/update work failed: {e}")


def register_with_watcher() -> None:
    """startup hook 调一次, 注册 shiliu provider 到 remote_jobs."""
    from backend.services import remote_jobs
    remote_jobs.register_provider(
        "shiliu",
        _poll_for_watcher,
        on_done=_on_done_for_watcher,
    )
