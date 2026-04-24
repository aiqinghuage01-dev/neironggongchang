"""石榴 (16AI) API 客户端 - 同步版,适合 Streamlit 调用。

关键端点:
  POST /asset/get                      查余额
  POST /avatar/list                    列出 avatar
  POST /speaker/list                   列出 speaker
  POST /video/createByText             文本生成视频 -> video_id
  POST /video/status  {videoId}        查询状态
"""
from __future__ import annotations

import time
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Iterable

import httpx

from .config import settings, VIDEO_DIR


class ShiliuError(RuntimeError):
    """石榴 API 调用失败。msg 字段来自接口响应。"""


@dataclass
class Credits:
    points: int
    valid_to: str
    avatars: int
    speakers: int


@dataclass
class Avatar:
    avatar_id: int
    title: str | None


@dataclass
class Speaker:
    speaker_id: int
    title: str | None


@dataclass
class VideoStatus:
    progress: int
    status: str
    title: str
    video_url: str


class ShiliuClient:
    def __init__(
        self,
        api_key: str | None = None,
        base_url: str | None = None,
        *,
        timeout: float = 30.0,
    ):
        self.api_key = api_key or settings.shiliu_api_key
        self.base_url = (base_url or settings.shiliu_base_url).rstrip("/")
        self._client = httpx.Client(timeout=timeout)

    def _post(self, endpoint: str, data: dict | None = None, timeout: float | None = None) -> dict:
        headers = {
            "Accept": "application/json",
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        try:
            r = self._client.post(
                f"{self.base_url}/{endpoint}",
                headers=headers,
                json=data or {},
                timeout=timeout or self._client.timeout,
            )
        except httpx.HTTPError as e:
            raise ShiliuError(f"network error on {endpoint}: {e!r}") from e
        if r.status_code >= 400:
            raise ShiliuError(f"{endpoint} HTTP {r.status_code}: {r.text[:400]}")
        body = r.json()
        if body.get("code") != 0:
            raise ShiliuError(f"{endpoint} code={body.get('code')} msg={body.get('msg')}")
        return body.get("data") or {}

    def get_credits(self) -> Credits:
        d = self._post("asset/get")
        return Credits(
            points=d.get("validPoint", 0),
            valid_to=d.get("validToTime", ""),
            avatars=d.get("availableAvatar", 0),
            speakers=d.get("availableSpeaker", 0),
        )

    def list_avatars(self) -> list[Avatar]:
        data = self._post("avatar/list")
        if isinstance(data, list):
            items = data
        else:
            items = data.get("list") or []
        return [Avatar(avatar_id=x["avatarId"], title=x.get("title")) for x in items]

    def list_speakers(self) -> list[Speaker]:
        data = self._post("speaker/list")
        if isinstance(data, list):
            items = data
        else:
            items = data.get("list") or []
        return [Speaker(speaker_id=x["speakerId"], title=x.get("title")) for x in items]

    def create_video_by_text(
        self,
        text: str,
        avatar_id: int | None = None,
        speaker_id: int | None = None,
        title: str | None = None,
    ) -> tuple[int, int]:
        avatar_id = avatar_id or settings.default_avatar_id
        speaker_id = speaker_id or settings.default_speaker_id
        if not avatar_id or not speaker_id:
            raise ShiliuError("missing avatar_id or speaker_id")
        payload = {"avatarId": avatar_id, "speakerId": speaker_id, "text": text}
        if title:
            payload["title"] = title
        d = self._post("video/createByText", payload, timeout=120.0)
        return int(d["videoId"]), int(d.get("length", 0))

    def get_video_status(self, video_id: int) -> VideoStatus:
        d = self._post("video/status", {"videoId": video_id}, timeout=20.0)
        return VideoStatus(
            progress=int(d.get("progress", 0)),
            status=str(d.get("status", "")),
            title=str(d.get("title", "")),
            video_url=str(d.get("videoUrl", "")),
        )

    def wait_for_video(
        self,
        video_id: int,
        *,
        max_wait_sec: int = 600,
        poll_every_sec: float = 6.0,
        on_progress: Callable[[VideoStatus], None] | None = None,
    ) -> VideoStatus:
        start = time.time()
        while time.time() - start < max_wait_sec:
            st = self.get_video_status(video_id)
            if on_progress:
                on_progress(st)
            sl = st.status.lower()
            if st.video_url or sl in {"ready", "succeed", "success", "complete", "completed", "finished", "done"}:
                return st
            if sl in {"failed", "error"}:
                raise ShiliuError(f"video {video_id} failed: {st}")
            time.sleep(poll_every_sec)
        raise ShiliuError(f"video {video_id} not ready within {max_wait_sec}s")

    def download_video(self, video_url: str, dest: Path | str) -> Path:
        dest = Path(dest)
        dest.parent.mkdir(parents=True, exist_ok=True)
        with self._client.stream("GET", video_url, timeout=120.0, follow_redirects=True) as r:
            r.raise_for_status()
            with open(dest, "wb") as f:
                for chunk in r.iter_bytes(1 << 16):
                    f.write(chunk)
        return dest

    def generate_and_download(
        self,
        text: str,
        *,
        avatar_id: int | None = None,
        speaker_id: int | None = None,
        title: str | None = None,
        on_progress: Callable[[VideoStatus], None] | None = None,
    ) -> tuple[int, Path]:
        """一条龙:提交 → 轮询 → 下载。返回 (video_id, local_path)。"""
        video_id, _ = self.create_video_by_text(text, avatar_id, speaker_id, title=title)
        status = self.wait_for_video(video_id, on_progress=on_progress)
        path = VIDEO_DIR / f"shiliu_{video_id}.mp4"
        self.download_video(status.video_url, path)
        return video_id, path

    def close(self) -> None:
        self._client.close()

    def __enter__(self) -> "ShiliuClient":
        return self

    def __exit__(self, *a) -> None:
        self.close()
