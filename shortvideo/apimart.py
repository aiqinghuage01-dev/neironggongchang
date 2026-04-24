"""apimart GPT-Image-2 客户端 - 生成封面图.

流程:
  1. POST /v1/images/generations   body={model,prompt,n,size,image_urls?}  → data[0].task_id
  2. GET  /v1/tasks/{task_id}       直到 status=completed/success/done
  3. 从 data.result.images[0].url 取图 URL,下载到本地
"""
from __future__ import annotations

import time
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

import httpx

from .config import settings


Ratio = Literal["9:16", "1:1", "16:9", "3:4", "4:3"]


class ApimartError(RuntimeError):
    pass


@dataclass
class ImageResult:
    url: str
    local_path: Path | None = None
    task_id: str = ""
    elapsed_sec: float = 0.0


class ApimartClient:
    def __init__(self, api_key: str | None = None, base_url: str | None = None, *, timeout: float = 30.0):
        self.api_key = api_key or settings.apimart_api_key
        self.base_url = (base_url or settings.apimart_base_url).rstrip("/")
        self._client = httpx.Client(timeout=timeout)

    def _headers(self) -> dict:
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "User-Agent": "neironggongchang/1.0 (curl-compatible)",
            "Accept": "application/json",
        }

    def submit(self, prompt: str, *, size: Ratio = "9:16", refs: list[str] | None = None) -> str:
        body: dict = {"model": "gpt-image-2", "prompt": prompt, "n": 1, "size": size}
        if refs:
            body["image_urls"] = refs[:4]
        r = self._client.post(f"{self.base_url}/images/generations", headers=self._headers(), json=body)
        if r.status_code >= 400:
            raise ApimartError(f"submit HTTP {r.status_code}: {r.text[:200]}")
        data = r.json()
        task_id = (data.get("data") or [{}])[0].get("task_id")
        if not task_id:
            raise ApimartError(f"no task_id: {data}")
        return task_id

    def query(self, task_id: str) -> dict:
        r = self._client.get(
            f"{self.base_url}/tasks/{task_id}",
            headers={"Authorization": f"Bearer {self.api_key}", "User-Agent": self._headers()["User-Agent"]},
        )
        if r.status_code >= 400:
            raise ApimartError(f"query HTTP {r.status_code}: {r.text[:200]}")
        return r.json()

    def wait_for_url(self, task_id: str, *, max_wait_sec: int = 150, poll_every_sec: float = 5.0) -> str:
        start = time.time()
        while time.time() - start < max_wait_sec:
            s = self.query(task_id)
            d = s.get("data", {})
            st = (d.get("status") or "").lower()
            if st in {"completed", "success", "done"}:
                imgs = (d.get("result") or {}).get("images", []) or []
                if not imgs:
                    raise ApimartError("completed but no image urls")
                u = imgs[0].get("url")
                url = u[0] if isinstance(u, list) else u
                if not url:
                    raise ApimartError("completed but url empty")
                return url
            if st in {"failed", "error"}:
                raise ApimartError(f"gen failed: {d.get('error') or d.get('message') or st}")
            time.sleep(poll_every_sec)
        raise ApimartError(f"timeout after {max_wait_sec}s")

    def download(self, url: str, dest: Path) -> Path:
        dest.parent.mkdir(parents=True, exist_ok=True)
        # CDN 对 Python 默认 UA 返 403,要装成浏览器
        dl_headers = {
            "User-Agent": (
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            ),
            "Accept": "image/png,image/jpeg,image/*,*/*",
        }
        with httpx.stream("GET", url, headers=dl_headers, timeout=120.0, follow_redirects=True) as r:
            r.raise_for_status()
            with open(dest, "wb") as f:
                for chunk in r.iter_bytes(1 << 16):
                    f.write(chunk)
        return dest

    def generate_and_download(
        self,
        prompt: str,
        dest: Path | str,
        *,
        size: Ratio = "9:16",
        refs: list[str] | None = None,
    ) -> ImageResult:
        t0 = time.time()
        task_id = self.submit(prompt, size=size, refs=refs)
        url = self.wait_for_url(task_id)
        path = self.download(url, Path(dest))
        return ImageResult(url=url, local_path=path, task_id=task_id, elapsed_sec=round(time.time() - t0, 1))

    def close(self):
        self._client.close()

    def __enter__(self):
        return self

    def __exit__(self, *a):
        self.close()


def cover_prompt(slogan: str, category: str = "健身房引流") -> str:
    """统一的封面 prompt 模板(按 design 反馈,固定一种风格)。"""
    return (
        f"短视频竖版封面图,主题:{category}。"
        f"大字标题文字:「{slogan}」。"
        "风格:暖色调、温暖橙黄 + 少量森林绿点缀,极简、克制、有生活气息。"
        "字体醒目但不油腻,居中排版,画面留有呼吸感。"
        "不要任何人像、logo、水印、商标。9:16 竖版。"
    )
