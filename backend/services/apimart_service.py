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
import time
import uuid
from pathlib import Path
from typing import Any

log = logging.getLogger("apimart_service")


def _poll_for_watcher(submit_id: str) -> dict[str, Any]:
    """submit_id = apimart task_id."""
    try:
        from shortvideo.apimart import ApimartClient
        with ApimartClient() as c:
            data = c.query(submit_id)
    except Exception as e:
        return {"status": "poll_error", "error": str(e)[:200]}

    sl = (data.get("status") or "").lower()
    DONE_SET = {"completed", "succeed", "success", "done", "ready", "finished"}
    FAIL_SET = {"failed", "error", "cancelled"}

    if sl in DONE_SET:
        # 拿 url
        items = data.get("data") or [{}]
        url = items[0].get("url") if items else ""
        if not url:
            # 有些响应 url 在 image_urls
            url = (data.get("image_urls") or [""])[0]
        return {
            "status": "done",
            "result": {
                "task_id": submit_id,
                "url": url,
                "raw": data,
            },
        }

    if sl in FAIL_SET:
        err = data.get("error") or data.get("error_message") or sl
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
        log.warning(f"apimart {rj['submit_id']} done but no url, raw={result}")
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
        from shortvideo.apimart import ApimartClient
        with ApimartClient() as c:
            c.download(url, dest)
    except Exception as e:
        log.error(f"apimart download {url[:80]} → {dest} failed: {e}")
        return

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
      3. finish_associated_task(ok)
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
