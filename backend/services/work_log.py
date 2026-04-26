"""小华工作日志 — AI 调用 → Obsidian 知识库 行为记忆 (D-023 / Phase 1 旧 TODO)。

每次成功的 AI 调用,如果 settings.work_log_enabled=true,就追加一行到:
  ~/Desktop/清华哥知识库/00 🤖 AI清华哥/小华工作日志.md

按日期分节(## 2026-04-25),每条 1 行 markdown:
  - HH:MM · 🔥 hotrewrite.write · 输入摘要 → 产出摘要 · 1234 tokens

规则:
- 默认 disabled · settings.work_log_enabled=true 才开
- 节流: 同 route_key 5 分钟内只记一次(避免高频刷屏)
- 失败吃掉(任何异常都不影响主 AI 调用)
- 只记成功的调用
- 不记 health check 等 ping(prompt 太短)
"""
from __future__ import annotations

import os
import re
import threading
import time
from datetime import datetime
from pathlib import Path
from typing import Any

LOG_PATH = Path(os.path.expanduser(
    "~/Desktop/清华哥知识库/00 🤖 AI清华哥/小华工作日志.md"
))

# route_key → 上次写入 ts (节流)
_throttle_lock = threading.Lock()
_throttle_state: dict[str, float] = {}
THROTTLE_SEC = 300  # 5 分钟


def _is_enabled() -> bool:
    try:
        from backend.services import settings as ss
        return bool(ss.get_all().get("work_log_enabled"))
    except Exception:
        return False


def _passes_throttle(route_key: str) -> bool:
    if not route_key:
        return False
    now = time.time()
    with _throttle_lock:
        last = _throttle_state.get(route_key, 0)
        if now - last < THROTTLE_SEC:
            return False
        _throttle_state[route_key] = now
    return True


def _summarize(text: str, limit: int = 80) -> str:
    """裁剪 + 单行化,避免破坏 markdown 结构。"""
    if not text:
        return ""
    s = re.sub(r"\s+", " ", text).strip()
    if len(s) <= limit:
        return s
    return s[:limit].rstrip() + "..."


def _today_section() -> str:
    return f"## {datetime.now().strftime('%Y-%m-%d')}"


def _format_entry(*, route_key: str, engine: str, prompt_brief: str, response_brief: str, tokens: int) -> str:
    icon_map = {
        "hotrewrite": "🔥", "voicerewrite": "🎙️", "wechat": "📄",
        "touliu": "💰", "planner": "🗓️", "rewrite": "✍️",
        "ad": "💰", "moments": "📱", "article": "📄",
        "topics": "💡",
    }
    prefix = (route_key or "").split(".", 1)[0]
    icon = icon_map.get(prefix, "🤖")
    t = datetime.now().strftime("%H:%M")
    p = _summarize(prompt_brief, 60)
    r = _summarize(response_brief, 80)
    return f"- {t} · {icon} `{route_key}`({engine}) · {p} → {r} · {tokens} tok"


def _ensure_today_section_appended(content: str) -> str:
    """如果文件末尾不是今天的小节,加一个。"""
    today = _today_section()
    if today in content:
        return content
    sep = "\n\n" if content and not content.endswith("\n") else "\n"
    return content + sep + today + "\n\n"


def maybe_log(
    *,
    route_key: str | None,
    engine: str,
    prompt_brief: str,
    response_brief: str,
    tokens: int,
    ok: bool = True,
) -> None:
    """异步打点(失败吃掉)。仅 settings.work_log_enabled 时生效。"""
    try:
        if not ok:
            return
        if tokens < 50:  # ping 等小调用不记
            return
        # D-070: 访客模式不记录 (帮朋友写不算自己档案)
        from backend.services import guest_mode
        if guest_mode.is_guest():
            return
        if not _is_enabled():
            return
        if not _passes_throttle(route_key or ""):
            return
        if not LOG_PATH.parent.exists():
            return  # Obsidian 知识库不存在 · 静默退出

        entry = _format_entry(
            route_key=route_key or "(none)",
            engine=engine or "?",
            prompt_brief=prompt_brief, response_brief=response_brief,
            tokens=tokens,
        )

        # 读旧 + 追加 + 写回(轻量,小文件 KB 级别)
        existing = LOG_PATH.read_text(encoding="utf-8") if LOG_PATH.exists() else ""
        if not existing.startswith("# 小华工作日志"):
            existing = "# 小华工作日志\n\n> 自动行为记忆 · 来自 neironggongchang AI 调用 · 关闭见 settings.work_log_enabled\n\n" + existing
        existing = _ensure_today_section_appended(existing)
        LOG_PATH.write_text(existing + entry + "\n", encoding="utf-8")
    except Exception:
        pass


def recent_entries(limit: int = 20) -> list[dict[str, Any]]:
    """读最近 N 行行为记忆 · 给前端调试页展示。"""
    if not LOG_PATH.exists():
        return []
    try:
        text = LOG_PATH.read_text(encoding="utf-8")
    except OSError:
        return []
    lines = [ln for ln in text.splitlines() if ln.startswith("- ")]
    return [{"raw": ln} for ln in lines[-limit:][::-1]]


def status() -> dict[str, Any]:
    """前端开关页用。"""
    enabled = _is_enabled()
    exists = LOG_PATH.exists()
    size = LOG_PATH.stat().st_size if exists else 0
    line_count = 0
    if exists:
        try:
            line_count = sum(1 for ln in LOG_PATH.read_text(encoding="utf-8").splitlines() if ln.startswith("- "))
        except Exception:
            pass
    return {
        "enabled": enabled,
        "log_path": str(LOG_PATH),
        "log_exists": exists,
        "log_size_bytes": size,
        "entries_count": line_count,
        "throttle_seconds": THROTTLE_SEC,
        "min_tokens_to_log": 50,
    }
