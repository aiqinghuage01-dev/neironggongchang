"""轻抖 (qingdou) API 客户端 - 链接转文案.

流程:
  1. POST commitGetTextTask  body={userInputList:[{url}]}  → result=batchId
  2. GET  getTaskResult?batchId=X  轮询直到 item.videoContent 有内容

协议观察(摘自 poju-site/functions/_shared/qingdou.js):
  - 完成时 item.status 是数字 1000(不是 "SUCCESS")
  - 以"有 videoContent"作为最可靠的成功信号
  - 失败 status 可能是 2000 / "FAIL"
"""
from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Callable, Literal

import httpx

from .config import settings


Status = Literal["running", "succeed", "failed"]


class QingdouError(RuntimeError):
    pass


@dataclass
class QingdouResult:
    status: Status
    text: str = ""
    title: str = ""
    author: str = ""
    duration_sec: float = 0.0
    error: str = ""


class QingdouClient:
    def __init__(self, api_key: str | None = None, base_url: str | None = None, *, timeout: float = 20.0):
        self.api_key = api_key or settings.qingdou_api_key
        self.base_url = (base_url or settings.qingdou_base_url).rstrip("/")
        self._client = httpx.Client(timeout=timeout)

    def _headers(self) -> dict:
        return {"x-api-key": self.api_key, "Content-Type": "application/json"}

    def commit(self, url: str) -> str:
        """提交链接,返回 batch_id。"""
        r = self._client.post(
            f"{self.base_url}/commitGetTextTask",
            headers=self._headers(),
            json={"userInputList": [{"url": url}]},
        )
        if r.status_code >= 400:
            raise QingdouError(f"commit HTTP {r.status_code}: {r.text[:200]}")
        data = r.json()
        batch_id = data.get("result")
        if not batch_id:
            raise QingdouError(f"no batch_id: {data}")
        return str(batch_id)

    def query(self, batch_id: str) -> QingdouResult:
        """查询任务状态。"""
        r = self._client.get(
            f"{self.base_url}/getTaskResult",
            params={"batchId": batch_id},
            headers={"x-api-key": self.api_key},
        )
        if r.status_code >= 400:
            raise QingdouError(f"query HTTP {r.status_code}: {r.text[:200]}")
        data = r.json() or {}
        result = data.get("result") or {}

        # 可能是 list 或 {list:[...]}
        if isinstance(result, list):
            items = result
        else:
            items = result.get("list") or []
        item = items[0] if items else None

        if not item:
            return QingdouResult(status="running")

        text = str(item.get("videoContent") or item.get("content") or "").strip()
        err = str(item.get("message") or item.get("errorMsg") or item.get("failMsg") or "").strip()
        raw_status = str(item.get("status") or "").upper()
        batch_status = result.get("batchStatus") if isinstance(result, dict) else None

        succ = bool(text) or raw_status in {"1000", "SUCCESS", "DONE"} or (
            isinstance(result, dict)
            and int(result.get("batchStatus", 0)) == 2
            and int(result.get("successCount", 0)) >= 1
        )
        if succ:
            return QingdouResult(
                status="succeed",
                text=text,
                title=str(item.get("videoTitle") or item.get("title") or ""),
                author=str(item.get("author") or item.get("nickname") or ""),
                duration_sec=float(item.get("duration") or 0) / 1000 if item.get("duration") else 0.0,
            )

        fail = raw_status in {"2000", "FAIL", "FAILED", "ERROR"} or (
            isinstance(result, dict) and int(result.get("failCount", 0)) >= 1
        )
        if fail:
            return QingdouResult(status="failed", error=err or "提取失败")

        return QingdouResult(status="running")

    def wait_for(
        self,
        batch_id: str,
        *,
        max_wait_sec: int = 60,
        poll_every_sec: float = 3.0,
        on_tick: Callable[[QingdouResult, float], None] | None = None,
    ) -> QingdouResult:
        start = time.time()
        while time.time() - start < max_wait_sec:
            res = self.query(batch_id)
            if on_tick:
                on_tick(res, time.time() - start)
            if res.status in ("succeed", "failed"):
                return res
            time.sleep(poll_every_sec)
        return QingdouResult(status="failed", error=f"超时 {max_wait_sec}s 未出结果,可直接粘贴文案")

    def extract(self, url: str, *, max_wait_sec: int = 60) -> QingdouResult:
        """一条龙:提交→轮询→返回结果。"""
        batch_id = self.commit(url)
        return self.wait_for(batch_id, max_wait_sec=max_wait_sec)

    def close(self):
        self._client.close()

    def __enter__(self):
        return self

    def __exit__(self, *a):
        self.close()
