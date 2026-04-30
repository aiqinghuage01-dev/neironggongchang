"""Shared stage timeline helpers for long copy-writing tasks.

These helpers only expose user-facing progress metadata. They do not alter
LLM prompts, routing, or generated copy semantics.
"""
from __future__ import annotations

import re
import time
from copy import deepcopy
from typing import Any


INTERNAL_DISPLAY_KEY_PARTS = ("token", "route", "model", "provider", "prompt", "submit_id", "raw", "engine", "api")


def _is_internal_display_key(key: Any) -> bool:
    k = str(key or "").lower()
    return any(part in k for part in INTERNAL_DISPLAY_KEY_PARTS) or k.startswith("_")


def sanitize_result_for_display(result: Any) -> Any:
    """Remove internal routing/usage fields from task result-like structures."""

    def _clean(value: Any) -> Any:
        if isinstance(value, dict):
            return {
                k: _clean(v)
                for k, v in value.items()
                if not _is_internal_display_key(k)
            }
        if isinstance(value, list):
            return [_clean(v) for v in value]
        return value

    return _clean(deepcopy(result))


def friendly_error_for_display(raw: Any) -> str:
    """Return a short user-facing error for copy task cards."""
    s = str(raw or "").strip()
    if not s:
        return "这一步没跑成，通常重试一次就好。"
    lower = s.lower()
    if "cancel" in lower or "已取消" in s:
        return "这次已经取消。"
    if "timeout" in lower or "timed out" in lower or "超时" in s:
        return "等太久还没回来，这一步先停下了。"
    if "空" in s or "empty" in lower or "json" in lower or "解析" in s:
        return "内容回传不完整，这一步没整理出来。"
    return "这一步没跑成，通常重试一次就好。"


def sanitize_error_text(raw: Any) -> str:
    """Fallback sanitizer if a caller still wants to preserve part of raw text."""
    s = str(raw or "")
    if not s:
        return s
    s = re.sub(r"(?i)\b(prompt|tokens?|route|model|provider|submit_id)\b\s*[:=]\s*[^,，;；)\s]+", "", s)
    s = re.sub(r"(?i)\b(prompt|tokens?|route|model|provider|submit_id)\b", "", s)
    s = re.sub(r"/Users/[^\s,，;；)]+", "本地文件", s)
    return re.sub(r"\s{2,}", " ", s).strip()


class StageTimeline:
    """Small stateful emitter for task.progress_data timeline snapshots."""

    def __init__(
        self,
        ctx: Any,
        stages: list[dict[str, Any]],
        *,
        slow_hint_after_sec: int | None = None,
    ) -> None:
        self.ctx = ctx
        self.stages = stages
        self.stage_by_id = {s["id"]: s for s in stages}
        self.timeline: list[dict[str, Any]] = []
        self.current_stage: str | None = None
        self.slow_hint_after_sec = slow_hint_after_sec

    def _label(self, stage_id: str) -> str:
        return str(self.stage_by_id.get(stage_id, {}).get("label") or stage_id)

    def _completed_count(self) -> int:
        done = {
            item.get("stage")
            for item in self.timeline
            if item.get("status") == "done" and item.get("stage")
        }
        return len(done)

    def _snapshot(self) -> dict[str, Any]:
        current = self.current_stage
        data = {
            "kind": "stage_timeline",
            "total_stages": len(self.stages),
            "completed_stages": self._completed_count(),
            "current_stage": current,
            "current_label": self._label(current) if current else "",
            "timeline": list(self.timeline),
        }
        if self.slow_hint_after_sec:
            data["slow_hint_after_sec"] = int(self.slow_hint_after_sec)
        return sanitize_result_for_display(data)

    def _partial(self) -> dict[str, Any]:
        return sanitize_result_for_display({
            "kind": "stage_timeline",
            "current_stage": self.current_stage,
            "current_label": self._label(self.current_stage) if self.current_stage else "",
            "completed_stages": self._completed_count(),
            "total_stages": len(self.stages),
        })

    def _replace_running(self, stage_id: str) -> None:
        self.timeline = [
            item for item in self.timeline
            if not (item.get("status") == "running" and item.get("stage") == stage_id)
        ]

    def start(self, stage_id: str, text: str | None = None, *, pct: int | None = None) -> None:
        if not self.ctx:
            return
        self.current_stage = stage_id
        self._replace_running(stage_id)
        label = self._label(stage_id)
        self.timeline.append({
            "stage": stage_id,
            "label": label,
            "text": text or f"正在{label}",
            "status": "running",
            "started_ts": int(time.time()),
        })
        self.ctx.update_partial_result(
            partial_result=self._partial(),
            progress_data=self._snapshot(),
            progress_text=text or f"正在{label}...",
            pct=pct,
        )

    def done(self, stage_id: str, text: str | None = None, *, pct: int | None = None) -> None:
        if not self.ctx:
            return
        self._replace_running(stage_id)
        label = self._label(stage_id)
        self.timeline.append({
            "stage": stage_id,
            "label": label,
            "text": text or f"{label}已完成",
            "status": "done",
            "at_ts": int(time.time()),
        })
        if self.current_stage == stage_id:
            self.current_stage = None
        self.ctx.update_partial_result(
            partial_result=self._partial(),
            progress_data=self._snapshot(),
            progress_text=text or f"{label}已完成",
            pct=pct,
        )

    def fail(self, stage_id: str | None = None, text: str | None = None, *, pct: int | None = None) -> None:
        if not self.ctx:
            return
        stage_id = stage_id or self.current_stage or (self.stages[0]["id"] if self.stages else "work")
        self._replace_running(stage_id)
        label = self._label(stage_id)
        self.current_stage = stage_id
        self.timeline.append({
            "stage": stage_id,
            "label": label,
            "text": text or f"停在{label}",
            "status": "failed",
            "at_ts": int(time.time()),
        })
        self.ctx.update_partial_result(
            partial_result=self._partial(),
            progress_data=self._snapshot(),
            progress_text=text or f"停在{label}",
            pct=pct,
        )
