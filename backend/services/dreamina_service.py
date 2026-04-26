"""即梦(Dreamina) CLI subprocess 包装 — D-028。

CLI: ~/.local/bin/dreamina (字节官方 AIGC CLI)
任务异步,通过 submit_id 轮询。

主流命令:
  text2image  --prompt --ratio --resolution_type --model_version --poll
  image2video --image  --prompt --duration --video_resolution --model_version --poll
  query_result --submit_id --download_dir
  user_credit
  list_task

参考 poju-site/mac-setup/server.py 的 run_dreamina 包装。
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import time
from pathlib import Path
from typing import Any

DREAMINA_BIN = os.path.expanduser("~/.local/bin/dreamina")

# 输出下载到 data/dreamina/ 下让 /media 暴露
from shortvideo.config import DATA_DIR
DREAMINA_DOWNLOAD_DIR = DATA_DIR / "dreamina"
DREAMINA_DOWNLOAD_DIR.mkdir(parents=True, exist_ok=True)


class DreaminaError(RuntimeError):
    pass


def _run(args: list[str], *, timeout: int = 180) -> dict[str, Any]:
    """跑 dreamina 子命令,返回 {ok, stdout, stderr, returncode}。"""
    if not Path(DREAMINA_BIN).exists():
        raise DreaminaError(f"dreamina CLI 不存在: {DREAMINA_BIN}")
    try:
        r = subprocess.run(
            [DREAMINA_BIN] + args,
            capture_output=True, text=True, timeout=timeout,
            env={**os.environ},
        )
    except subprocess.TimeoutExpired:
        raise DreaminaError(f"dreamina 超时 {timeout}s: {' '.join(args[:3])}")
    return {
        "ok": r.returncode == 0,
        "stdout": (r.stdout or "").strip(),
        "stderr": (r.stderr or "").strip(),
        "returncode": r.returncode,
    }


def _try_json(s: str) -> dict | None:
    """从 dreamina stdout 抠 JSON(它经常是混合输出 + JSON 块)。"""
    if not s:
        return None
    # 整段就是 JSON
    try:
        return json.loads(s)
    except Exception:
        pass
    # 找 {...} 块
    m = re.search(r"\{[\s\S]*\}", s)
    if m:
        try:
            return json.loads(m.group(0))
        except Exception:
            return None
    return None


# ─── account ─────────────────────────────────────────────

def user_credit() -> dict[str, Any]:
    r = _run(["user_credit"], timeout=20)
    obj = _try_json(r["stdout"])
    return {
        "ok": r["ok"],
        "credit": obj or {},
        "raw": r["stdout"][-300:] if not obj else "",
        "error": r["stderr"] if not r["ok"] else None,
    }


def list_tasks(limit: int = 20) -> dict[str, Any]:
    r = _run(["list_task"], timeout=30)
    return {
        "ok": r["ok"],
        "raw": r["stdout"][-3000:],
        "error": r["stderr"] if not r["ok"] else None,
    }


# ─── 提交任务 ────────────────────────────────────────────

def text2image(
    prompt: str,
    *,
    ratio: str = "1:1",
    resolution_type: str | None = None,
    model_version: str | None = None,
    poll: int = 0,
) -> dict[str, Any]:
    """提交文本生图。poll>0 时同步等(秒数),否则立刻返回 submit_id。"""
    args = ["text2image", "--prompt", prompt, "--ratio", ratio]
    if resolution_type:
        args += ["--resolution_type", resolution_type]
    if model_version:
        args += ["--model_version", model_version]
    if poll > 0:
        args += ["--poll", str(poll)]
    r = _run(args, timeout=max(60, poll + 30))
    if not r["ok"]:
        raise DreaminaError(f"text2image 失败: {r['stderr'][-300:]}")
    obj = _try_json(r["stdout"])
    return {"ok": True, "result": obj or {}, "raw": r["stdout"][-500:]}


def image2video(
    image: str,
    prompt: str,
    *,
    duration: int | None = None,
    video_resolution: str | None = None,
    model_version: str | None = None,
    poll: int = 0,
) -> dict[str, Any]:
    """图生视频。image 是本地文件路径。"""
    if not Path(image).exists():
        raise DreaminaError(f"image 文件不存在: {image}")
    args = ["image2video", "--image", image, "--prompt", prompt]
    if duration:
        args += ["--duration", str(duration)]
    if video_resolution:
        args += ["--video_resolution", video_resolution]
    if model_version:
        args += ["--model_version", model_version]
    if poll > 0:
        args += ["--poll", str(poll)]
    r = _run(args, timeout=max(180, poll + 30))
    if not r["ok"]:
        raise DreaminaError(f"image2video 失败: {r['stderr'][-300:]}")
    obj = _try_json(r["stdout"])
    return {"ok": True, "result": obj or {}, "raw": r["stdout"][-500:]}


def text2video(
    prompt: str,
    *,
    duration: int | None = None,
    ratio: str | None = None,
    video_resolution: str | None = None,
    model_version: str | None = None,
    poll: int = 0,
) -> dict[str, Any]:
    """纯文字生视频. 默认 model_version=seedance2.0fast (CLI 默认)."""
    args = ["text2video", "--prompt", prompt]
    if duration:
        args += ["--duration", str(duration)]
    if ratio:
        args += ["--ratio", ratio]
    if video_resolution:
        args += ["--video_resolution", video_resolution]
    if model_version:
        args += ["--model_version", model_version]
    if poll > 0:
        args += ["--poll", str(poll)]
    r = _run(args, timeout=max(180, poll + 30))
    if not r["ok"]:
        raise DreaminaError(f"text2video 失败: {r['stderr'][-300:]}")
    obj = _try_json(r["stdout"])
    return {"ok": True, "result": obj or {}, "raw": r["stdout"][-500:]}


def multimodal2video(
    prompt: str,
    images: list[str],
    *,
    videos: list[str] | None = None,
    audios: list[str] | None = None,
    duration: int | None = None,
    ratio: str | None = None,
    video_resolution: str | None = None,
    model_version: str | None = None,
    poll: int = 0,
) -> dict[str, Any]:
    """多模态视频. 全参考: ≤9 图 + ≤3 视频 + ≤3 音频. 至少 1 image 或 1 video."""
    images = list(images or [])
    videos = list(videos or [])
    audios = list(audios or [])
    if len(images) > 9:
        raise DreaminaError(f"参考图最多 9 张, 收到 {len(images)}")
    if len(videos) > 3:
        raise DreaminaError(f"参考视频最多 3 个, 收到 {len(videos)}")
    if len(audios) > 3:
        raise DreaminaError(f"参考音频最多 3 个, 收到 {len(audios)}")
    if not images and not videos:
        raise DreaminaError("multimodal2video 至少需要 1 张图或 1 个视频")
    for p in images + videos + audios:
        if not Path(p).exists():
            raise DreaminaError(f"参考素材不存在: {p}")
    args = ["multimodal2video", "--prompt", prompt]
    for p in images:
        args += ["--image", p]
    for p in videos:
        args += ["--video", p]
    for p in audios:
        args += ["--audio", p]
    if duration:
        args += ["--duration", str(duration)]
    if ratio:
        args += ["--ratio", ratio]
    if video_resolution:
        args += ["--video_resolution", video_resolution]
    if model_version:
        args += ["--model_version", model_version]
    if poll > 0:
        args += ["--poll", str(poll)]
    r = _run(args, timeout=max(240, poll + 30))
    if not r["ok"]:
        raise DreaminaError(f"multimodal2video 失败: {r['stderr'][-300:]}")
    obj = _try_json(r["stdout"])
    return {"ok": True, "result": obj or {}, "raw": r["stdout"][-500:]}


def _extract_submit_id(submit_result: dict[str, Any]) -> str | None:
    r = submit_result.get("result") or {}
    return r.get("submit_id") or r.get("SubmitId")


def _to_media_url(p: str) -> str:
    """绝对路径 → /media/... · 跟 backend.api.media_url 同逻辑, service 层独立避免循环依赖."""
    try:
        return f"/media/{Path(p).resolve().relative_to(DATA_DIR.resolve()).as_posix()}"
    except Exception:
        return p


def _autoinsert_works(downloaded: list[str], submit_id: str, route: str, prompt: str) -> None:
    """完成后把视频/图入作品库 (跟 dreamina_query 同逻辑)."""
    try:
        from shortvideo.works import insert_work
    except Exception:
        return
    for p in downloaded:
        pp = Path(p)
        if not pp.exists():
            continue
        wtype = "video" if pp.suffix.lower() in (".mp4", ".mov", ".webm") else "image"
        try:
            insert_work(
                type=wtype, source_skill="dreamina",
                title=f"即梦 {wtype} · {prompt[:24]}",
                local_path=str(pp),
                thumb_path=str(pp) if wtype == "image" else None,
                status="ready",
                metadata=json.dumps({
                    "submit_id": submit_id, "route": route, "filename": pp.name,
                }, ensure_ascii=False),
            )
        except Exception:
            pass


def submit_and_wait(
    *,
    prompt: str,
    refs: list[str] | None = None,
    duration: int | None = None,
    ratio: str | None = None,
    video_resolution: str | None = None,
    model_version: str | None = None,
    poll_interval: int = 8,
    timeout_sec: int = 600,
    is_cancelled=None,
) -> dict[str, Any]:
    """submit + 内部轮询 + 下载, 给 tasks.run_async 的 sync_fn 用.

    refs 为本地参考图路径列表 (上传 endpoint 落盘后传 path):
      - 0 张 → text2video (纯文字)
      - 1 张 → image2video (首帧图)
      - ≥2 张 → multimodal2video (全参考)

    返回 {submit_id, route, downloaded, media_paths, status}.
    """
    refs = [r for r in (refs or []) if r]
    if len(refs) == 0:
        sub = text2video(
            prompt,
            duration=duration, ratio=ratio,
            video_resolution=video_resolution, model_version=model_version,
        )
        route = "text2video"
    elif len(refs) == 1:
        sub = image2video(
            refs[0], prompt,
            duration=duration,
            video_resolution=video_resolution, model_version=model_version,
        )
        route = "image2video"
    else:
        sub = multimodal2video(
            prompt, refs,
            duration=duration, ratio=ratio,
            video_resolution=video_resolution, model_version=model_version,
        )
        route = "multimodal2video"

    submit_id = _extract_submit_id(sub)
    if not submit_id:
        raise DreaminaError(f"未拿到 submit_id, raw={sub.get('raw', '')[:200]}")

    deadline = time.time() + timeout_sec
    last_status = "pending"
    while time.time() < deadline:
        if is_cancelled and is_cancelled():
            return {"submit_id": submit_id, "route": route, "status": "cancelled",
                    "downloaded": [], "media_paths": []}
        time.sleep(poll_interval)
        try:
            q = query_result(submit_id, download=True)
        except DreaminaError:
            continue
        if not q.get("ok"):
            continue
        result = q.get("result") or {}
        last_status = (result.get("status") or result.get("Status") or "").lower()
        downloaded = q.get("downloaded") or []
        if last_status in ("done", "succeed", "success") and downloaded:
            _autoinsert_works(downloaded, submit_id, route, prompt)
            return {
                "submit_id": submit_id, "route": route, "status": "done",
                "downloaded": downloaded,
                "media_urls": [_to_media_url(p) for p in downloaded],
                "raw_result": result,
            }
        if last_status in ("failed", "fail", "error", "cancelled"):
            raise DreaminaError(f"任务失败 status={last_status}, submit_id={submit_id}")
    raise DreaminaError(f"轮询超时 {timeout_sec}s, last_status={last_status}, submit_id={submit_id}")


def query_result(submit_id: str, download: bool = True) -> dict[str, Any]:
    """查任务结果。download=True 则下载到 DREAMINA_DOWNLOAD_DIR。"""
    args = ["query_result", "--submit_id", submit_id]
    if download:
        args += ["--download_dir", str(DREAMINA_DOWNLOAD_DIR)]
    r = _run(args, timeout=120)
    if not r["ok"]:
        return {"ok": False, "error": r["stderr"][-300:], "raw": r["stdout"][-500:]}
    obj = _try_json(r["stdout"]) or {}
    # 扫描下载目录,找到刚下的文件
    downloaded = []
    if download:
        recent = [p for p in DREAMINA_DOWNLOAD_DIR.iterdir() if p.is_file() and (time.time() - p.stat().st_mtime) < 60]
        downloaded = [str(p) for p in sorted(recent, key=lambda x: -x.stat().st_mtime)[:5]]
    return {
        "ok": True, "result": obj, "downloaded": downloaded,
        "raw": r["stdout"][-500:],
    }


# ─── 元数据 (CLI version) ────────────────────────────────

def cli_info() -> dict[str, Any]:
    """探活 + 版本信息。"""
    if not Path(DREAMINA_BIN).exists():
        return {"ok": False, "error": f"CLI 不存在: {DREAMINA_BIN}"}
    r = _run(["version"], timeout=5)
    return {
        "ok": r["ok"],
        "bin": DREAMINA_BIN,
        "version": r["stdout"][:200] if r["ok"] else None,
        "error": r["stderr"][-200:] if not r["ok"] else None,
    }
