"""自动学清华哥偏好 · 从 LiDock 对话提取 (D-030)。

流程:
  1. 用户每条 message 用关键词预筛(我喜欢/不要/记住 等),不命中跳过(零成本)
  2. 命中关键词 → 调 AI(DeepSeek)二筛精炼成"X 偏好 Y"一句话
  3. AI 判断不是偏好 → 跳过 · 是偏好 → 追加到 Obsidian 偏好文件

文件: ~/Desktop/清华哥知识库/00 🤖 AI清华哥/小华学到的偏好.md
默认 disabled · settings.preference_learning_enabled 开关
节流: 1 分钟最多一次 AI 二筛
"""
from __future__ import annotations

import os
import re
import threading
import time
from datetime import datetime
from pathlib import Path
from typing import Any

PREF_PATH = Path(os.path.expanduser(
    "~/Desktop/清华哥知识库/00 🤖 AI清华哥/小华学到的偏好.md"
))

# 关键词预筛: 命中其中之一才走 AI 二筛
PREFERENCE_KEYWORDS = [
    "我喜欢", "我不喜欢", "我希望", "我想",
    "记住", "记一下", "请记住",
    "以后", "下次", "之后", "今后",
    "千万别", "不要", "别再", "禁止", "永远不",
    "我习惯", "我偏好", "我倾向",
    "默认", "默认就", "通常",
    "你帮我记", "你记一下",
]

THROTTLE_SEC = 60
_throttle_lock = threading.Lock()
_last_extract_ts = 0.0


def _is_enabled() -> bool:
    try:
        from backend.services import settings as ss
        return bool(ss.get_all().get("preference_learning_enabled"))
    except Exception:
        return False


def _passes_throttle() -> bool:
    global _last_extract_ts
    now = time.time()
    with _throttle_lock:
        if now - _last_extract_ts < THROTTLE_SEC:
            return False
        _last_extract_ts = now
    return True


def _matches_keyword(text: str) -> str | None:
    if not text:
        return None
    for kw in PREFERENCE_KEYWORDS:
        if kw in text:
            return kw
    return None


def _ensure_header() -> str:
    return ("# 小华学到的偏好\n\n"
            "> 自动从对话提取 · 由 D-030 写入 · 也可手动编辑\n"
            "> 默认开关在 settings.preference_learning_enabled\n\n")


def _append(line: str) -> None:
    PREF_PATH.parent.mkdir(parents=True, exist_ok=True)
    existing = PREF_PATH.read_text(encoding="utf-8") if PREF_PATH.exists() else ""
    if not existing.startswith("# 小华学到的偏好"):
        existing = _ensure_header() + existing
    PREF_PATH.write_text(existing + line + "\n", encoding="utf-8")


def maybe_learn(messages: list[dict[str, Any]], context: str = "") -> dict[str, Any]:
    """异步钩子 · 由 /api/chat 在返回后调用。失败吃掉。"""
    try:
        if not _is_enabled():
            return {"skipped": "disabled"}
        if not messages:
            return {"skipped": "empty"}

        # 取最新一条 user 消息
        last_user = None
        for m in reversed(messages):
            if (m.get("role") if isinstance(m, dict) else getattr(m, "role", None)) == "user":
                last_user = m
                break
        if not last_user:
            return {"skipped": "no_user_msg"}
        text = (last_user.get("text") if isinstance(last_user, dict) else getattr(last_user, "text", "")) or ""
        kw = _matches_keyword(text)
        if not kw:
            return {"skipped": "no_keyword"}

        if not _passes_throttle():
            return {"skipped": "throttled"}

        # AI 二筛精炼
        from shortvideo.ai import get_ai_client
        ai = get_ai_client(route_key="preference.learn")
        prompt = f"""老板刚才在对话里说了:
"{text.strip()}"

判断这是不是表达了一个**长期偏好/规则/习惯**(以后要让 AI 记住的)?

判断标准:
- 是: "我希望文案带钩子" / "投流别用躺赚" / "记住,我喜欢用学员故事开场"
- 不是: "这次帮我看看" / "再来一版" / 一次性请求

严格 JSON 输出:
{{"is_preference": true|false, "summary": "若是,精炼成 一句话偏好(20 字内,如 '投流文案禁用躺赚');若不是,留空"}}"""
        r = ai.chat(prompt, deep=False, temperature=0.2, max_tokens=300)
        import json as _json
        m = re.search(r"\{[\s\S]*\}", r.text or "")
        if not m:
            return {"skipped": "parse_fail", "raw": (r.text or "")[:200]}
        try:
            obj = _json.loads(m.group(0))
        except Exception:
            return {"skipped": "json_fail", "raw": (r.text or "")[:200]}

        if not obj.get("is_preference"):
            return {"skipped": "not_preference", "keyword": kw}
        summary = (obj.get("summary") or "").strip()
        if not summary:
            return {"skipped": "empty_summary"}

        ts = datetime.now().strftime("%Y-%m-%d %H:%M")
        line = f"- {ts} · 在「{context or '某页'}」 · {summary}  _原话: {text[:60]}_"
        _append(line)
        return {"saved": True, "summary": summary, "keyword": kw}
    except Exception as e:
        return {"error": f"{type(e).__name__}: {e}"}


def recent_preferences(limit: int = 30) -> list[str]:
    if not PREF_PATH.exists():
        return []
    try:
        text = PREF_PATH.read_text(encoding="utf-8")
    except OSError:
        return []
    lines = [ln for ln in text.splitlines() if ln.startswith("- ")]
    return lines[-limit:][::-1]


def status() -> dict[str, Any]:
    enabled = _is_enabled()
    exists = PREF_PATH.exists()
    size = PREF_PATH.stat().st_size if exists else 0
    count = 0
    if exists:
        try:
            count = sum(1 for ln in PREF_PATH.read_text(encoding="utf-8").splitlines() if ln.startswith("- "))
        except Exception:
            pass
    return {
        "enabled": enabled,
        "path": str(PREF_PATH),
        "exists": exists,
        "size_bytes": size,
        "preferences_count": count,
        "throttle_seconds": THROTTLE_SEC,
        "trigger_keywords": PREFERENCE_KEYWORDS,
    }
