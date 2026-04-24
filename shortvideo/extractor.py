"""视频下载 + ASR - 从短视频 URL 提取文案。

第一版只做下载 + 抽音频;ASR 留接口,P3 阶段会接入。
"""
from __future__ import annotations

import subprocess
from dataclasses import dataclass
from pathlib import Path

import yt_dlp  # type: ignore

from .config import DATA_DIR

DL_DIR = DATA_DIR / "downloads"
DL_DIR.mkdir(parents=True, exist_ok=True)


@dataclass
class DownloadResult:
    video_path: Path
    audio_path: Path
    title: str
    duration: float
    source_url: str


def download_video(url: str) -> DownloadResult:
    """用 yt-dlp 下载视频到本地,并抽出 wav 音频(16kHz mono)。"""
    opts = {
        "outtmpl": str(DL_DIR / "%(id)s.%(ext)s"),
        "format": "best[ext=mp4]/best",
        "quiet": True,
        "no_warnings": True,
        "noplaylist": True,
    }
    with yt_dlp.YoutubeDL(opts) as ydl:
        info = ydl.extract_info(url, download=True)
        video_id = info["id"]
        ext = info.get("ext", "mp4")
        video_path = DL_DIR / f"{video_id}.{ext}"
        title = info.get("title", video_id)
        duration = float(info.get("duration") or 0.0)

    audio_path = DL_DIR / f"{video_id}.wav"
    subprocess.run(
        ["ffmpeg", "-y", "-i", str(video_path), "-vn", "-ar", "16000", "-ac", "1",
         "-c:a", "pcm_s16le", str(audio_path), "-loglevel", "error"],
        check=True,
    )
    return DownloadResult(
        video_path=video_path,
        audio_path=audio_path,
        title=title,
        duration=duration,
        source_url=url,
    )


def transcribe_placeholder(audio_path: Path) -> str:
    """ASR 占位符。P3 阶段会接入 whisper.cpp 或云 ASR。

    当前返回空字符串,UI 会引导用户手动粘贴文案。
    """
    return ""
