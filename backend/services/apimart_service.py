"""apimart (GPT-Image-2) watcher provider 接入 (D-080/D-081).

apimart 也是 submit + poll 模式:
  - submit(prompt, size, refs) → task_id (注意: 这个 task_id 是 apimart 内部的, 不是我们的 tasks 表)
  - query(task_id) → {status, image_urls}
  - download(url, dest)

老路径在 endpoint 里同步 generate_and_download (内部 wait_for_url ≤150s), 偶尔卡住超 timeout.
新路径: register remote_job (provider="apimart"), watcher 60s 一次接管轮询 + 下载.

scope:
  - /api/image/generate (出图)
  - /api/wechat/cover-batch (公众号封面)
  - /api/wechat/section-image (公众号段间图)
"""
from __future__ import annotations

import logging
import shutil
import time
import uuid
from pathlib import Path
from typing import Any

log = logging.getLogger("apimart_service")


def _to_media_url(local_path: Path | str | None) -> str | None:
    """Convert a generated file under data/ to the frontend /media URL."""
    if not local_path:
        return None
    try:
        from shortvideo.config import DATA_DIR
        rel = Path(local_path).resolve().relative_to(DATA_DIR.resolve())
        return f"/media/{rel.as_posix()}"
    except Exception:
        return None


def _mark_local_delivery_failed(rj: dict[str, Any], result: Any, error: str) -> None:
    """Remote image is done, but local delivery failed; finish the user task as failed.

    remote_jobs marks the provider row done before calling on_done. If we only log here,
    the shared watcher will still finish the associated task as ok with a raw result.
    """
    if isinstance(result, dict):
        result.update({"error": error, "download_failed": True})

    rj_id = rj.get("id")
    if rj_id:
        try:
            from backend.services import remote_jobs
            remote_jobs.mark_failed(rj_id, error=error)
        except Exception as e:
            log.error(f"apimart mark remote_job failed skipped: {e}")

    task_id = rj.get("task_id")
    if not task_id:
        return
    try:
        from backend.services import tasks as tasks_service
        task = tasks_service.get_task(task_id)
        if task and task["status"] in ("running", "pending"):
            tasks_service.finish_task(task_id, result=result, error=error, status="failed")
    except Exception as e:
        log.error(f"apimart mark task failed skipped: {e}")


def _poll_for_watcher(submit_id: str) -> dict[str, Any]:
    """submit_id = apimart task_id.
    T12: APIMART_MOCK=1 跳过真 API 立即返 done + 现成 png 假产物.
    """
    import os
    if os.environ.get("APIMART_MOCK") == "1":
        from shortvideo.config import DATA_DIR
        # 找现有 png 当假产物
        candidates = []
        for sub in ["image-gen", "wechat-images", "apimart"]:
            d = DATA_DIR / sub
            if d.exists():
                candidates.extend(d.glob("*.png"))
                candidates.extend(d.glob("*.jpg"))
        path = str(sorted(candidates, key=lambda x: -x.stat().st_size)[0]) if candidates else ""
        return {"status": "done", "result": {
            "task_id": submit_id, "url": f"file://{path}" if path else "[MOCK]",
            "local_path": path, "_mock": True,
        }}
    try:
        from shortvideo.apimart import ApimartClient
        with ApimartClient() as c:
            data = c.query(submit_id)
    except Exception as e:
        return {"status": "poll_error", "error": str(e)[:200]}

    # apimart 实际返回结构: {code, data: {status, result: {images: [{url: [...]}]}, error?}}
    body = data.get("data") if isinstance(data, dict) else {}
    body = body if isinstance(body, dict) else {}
    sl = (body.get("status") or data.get("status") or "").lower()
    DONE_SET = {"completed", "succeed", "success", "done", "ready", "finished"}
    FAIL_SET = {"failed", "error", "cancelled"}

    if sl in DONE_SET:
        # 拿 url — apimart: data.result.images[0].url 可能是 list 或 string
        url = ""
        result = body.get("result") or {}
        if isinstance(result, dict):
            imgs = result.get("images") or []
            if imgs and isinstance(imgs, list):
                u = imgs[0].get("url") if isinstance(imgs[0], dict) else None
                if isinstance(u, list) and u:
                    url = u[0]
                elif isinstance(u, str):
                    url = u
        if not url:
            # 兜底其他可能位置
            items = data.get("data")
            if isinstance(items, list) and items:
                url = items[0].get("url", "") if isinstance(items[0], dict) else ""
        return {
            "status": "done",
            "result": {
                "task_id": submit_id,
                "url": url,
                "raw": data,
            },
        }

    if sl in FAIL_SET:
        err = body.get("error") or body.get("error_message") or data.get("error") or sl
        return {"status": "failed", "error": str(err)[:200]}

    return {"status": sl or "processing"}


def _on_done_for_watcher(rj: dict[str, Any], result: Any) -> None:
    """done 时下载图片到本地 + 入作品库.

    submit_payload 可能含: dest_path / kind (image/cover/section-image) / wechat_article_id /
    section_idx / title / prompt / etc — 让调用方按场景写.
    """
    payload = rj.get("submit_payload") or {}
    url = (result or {}).get("url", "")
    if not url:
        err = "apimart error: 图片已生成, 但没有拿到下载地址; 本次没有写入作品库, 请重试"
        log.warning(f"apimart {rj['submit_id']} done but no url, raw={result}")
        _mark_local_delivery_failed(rj, result, err)
        return

    # 决定 dest 路径
    dest_path_str = payload.get("dest_path", "")
    if dest_path_str:
        dest = Path(dest_path_str)
    else:
        # 默认落 data/images/apimart_{rj_id}.png
        from shortvideo.config import DATA_DIR
        d = DATA_DIR / "apimart"
        d.mkdir(parents=True, exist_ok=True)
        dest = d / f"apimart_{rj['submit_id'][:12]}_{uuid.uuid4().hex[:6]}.png"

    try:
        src_local = (result or {}).get("local_path") if isinstance(result, dict) else None
        if src_local and Path(src_local).exists():
            dest.parent.mkdir(parents=True, exist_ok=True)
            if Path(src_local).resolve() != dest.resolve():
                shutil.copy2(src_local, dest)
        elif isinstance(url, str) and url.startswith("file://") and Path(url[7:]).exists():
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(Path(url[7:]), dest)
        else:
            from shortvideo.apimart import ApimartClient
            with ApimartClient() as c:
                c.download(url, dest)
    except Exception as e:
        err = f"apimart error: 图片已生成, 但下载到本地失败; 本次没有写入作品库, 请重试 ({type(e).__name__})"
        log.error(f"apimart download {url[:80]} → {dest} failed: {e}")
        _mark_local_delivery_failed(rj, result, err)
        return

    elapsed_sec = max(0, int(time.time()) - int(rj.get("submitted_at") or time.time()))
    media_url = _to_media_url(dest)
    image_result = {
        "url": url,
        "local_path": str(dest),
        "media_url": media_url,
        "task_id": rj["submit_id"],
        "elapsed_sec": elapsed_sec,
    }
    if isinstance(result, dict):
        result.update({
            "images": [image_result],
            "engine": "apimart",
            "n": 1,
            "size": payload.get("size") or "1:1",
            "elapsed_sec": elapsed_sec,
            "local_path": str(dest),
            "media_url": media_url,
        })

    # 入作品库 (按 kind 分流)
    kind = payload.get("kind", "image")
    title = payload.get("title", "") or f"apimart {kind}"
    try:
        from shortvideo.works import insert_work
        import json as _json
        wtype = "image"
        insert_work(
            type=wtype, source_skill=payload.get("source_skill", "apimart"),
            title=title[:48],
            local_path=str(dest),
            thumb_path=str(dest),
            status="ready",
            metadata=_json.dumps({
                "apimart_task_id": rj["submit_id"],
                "kind": kind,
                "prompt_preview": (payload.get("prompt") or "")[:200],
                "filename": dest.name,
            }, ensure_ascii=False),
        )
    except Exception as e:
        log.error(f"apimart on_done insert_work failed: {e}")


def register_with_watcher() -> None:
    from backend.services import remote_jobs
    remote_jobs.register_provider(
        "apimart",
        _poll_for_watcher,
        on_done=_on_done_for_watcher,
    )


# ─── helper: 给 endpoint 用的 register convenience ────────────────────

def submit_and_register(
    *,
    prompt: str,
    size: str = "1:1",
    refs: list[str] | None = None,
    task_id: str | None = None,
    dest_path: str | None = None,
    kind: str = "image",
    title: str = "",
    source_skill: str = "apimart",
    max_wait_sec: int = 1200,
) -> dict[str, Any]:
    """endpoint 用的 helper: submit apimart + register remote_job, 立即返回 {apimart_task_id, rj_id}.

    task_id 是上层 tasks DB 的 id (跟 apimart 内部 task_id 不同, 容易混). watcher 拿到 done 后:
      1. 下载到 dest_path (没指定走默认)
      2. 入作品库 (kind 决定 type/source_skill)
      3. 下载成功则 finish_associated_task(ok); 下载失败则标记关联 task failed
    """
    from shortvideo.apimart import ApimartClient
    from backend.services import remote_jobs

    with ApimartClient() as c:
        apimart_tid = c.submit(prompt, size=size, refs=refs or [])

    rj_id = remote_jobs.register(
        provider="apimart",
        submit_id=apimart_tid,
        task_id=task_id,
        submit_payload={
            "prompt": prompt[:500],
            "size": size,
            "refs_count": len(refs or []),
            "dest_path": dest_path,
            "kind": kind,
            "title": title,
            "source_skill": source_skill,
        },
        max_wait_sec=max_wait_sec,
    )
    return {"apimart_task_id": apimart_tid, "rj_id": rj_id}
