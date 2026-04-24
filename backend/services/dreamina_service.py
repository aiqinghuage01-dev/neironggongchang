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
