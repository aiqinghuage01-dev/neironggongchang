"""行为记忆注入 (D-031) — 把偏好 + 最近行为日志拼成 prompt 片段。

D-005 设计的 Layer 3 行为记忆,这里实现读取侧。

数据源:
  - 偏好(D-030): ~/.../小华学到的偏好.md (长期偏好,优先级高)
  - 工作日志(D-023): ~/.../小华工作日志.md (最近行为流水)

只在 deep=True 时注入(精简模式不带,省 token)。
默认 disabled · settings.memory_injection_enabled 开关。
"""
from __future__ import annotations

from typing import Any


def _is_enabled() -> bool:
    try:
        from backend.services import settings as ss
        return bool(ss.get_all().get("memory_injection_enabled"))
    except Exception:
        return False


def _format_pref_line(line: str) -> str:
    """从 '- 2026-04-25 14:30 · 在「投流」 · 投流文案禁用躺赚 _原话: ..._'
    抽出核心 '投流文案禁用躺赚'(去时间/页/原话)。"""
    s = line.lstrip("- ").strip()
    # 去掉 _原话: ..._  尾巴
    if "_原话:" in s:
        s = s.split("_原话:", 1)[0].strip()
    # 找最后一个 · 后的内容(精炼版)
    if " · " in s:
        s = s.split(" · ")[-1].strip()
    return s


def _format_log_line(line: str) -> str:
    """从 '- HH:MM · 🔥 `route`(engine) · 输入摘要 → 产出摘要 · N tok'
    抽出 '🔥 route · 输入 → 产出'。"""
    s = line.lstrip("- ").strip()
    parts = s.split(" · ")
    # 跳过 HH:MM(parts[0])和最后的 'N tok'
    return " · ".join(parts[1:-1]) if len(parts) >= 3 else s


def load_recent_memory(limit_pref: int = 20, limit_log: int = 8) -> str:
    """拼接成一段 prompt 注入文本。空字符串=不注入。"""
    if not _is_enabled():
        return ""

    blocks: list[str] = []

    # 偏好(优先级高,放前面)
    try:
        from backend.services import preference
        prefs = preference.recent_preferences(limit=limit_pref)
        if prefs:
            cleaned = []
            for ln in prefs:
                p = _format_pref_line(ln)
                if p and p not in cleaned:
                    cleaned.append(p)
            if cleaned:
                blocks.append("## 老板已表达过的偏好(必须遵守)")
                blocks.extend(f"- {p}" for p in cleaned[:limit_pref])
    except Exception:
        pass

    # 最近行为日志(辅助,放后面)
    try:
        from backend.services import work_log
        entries = work_log.recent_entries(limit=limit_log)
        if entries:
            log_lines = []
            for e in entries:
                ln = _format_log_line(e.get("raw", ""))
                if ln:
                    log_lines.append(ln)
            if log_lines:
                blocks.append("\n## 最近的 AI 调用(参考上下文,不是规则)")
                blocks.extend(f"- {ln}" for ln in log_lines[:limit_log])
    except Exception:
        pass

    return "\n".join(blocks).strip()


def stats() -> dict[str, Any]:
    """前端开关页用 · 显示当前状态 + 注入预览。"""
    enabled = _is_enabled()
    preview = load_recent_memory() if enabled else ""
    pref_count = log_count = 0
    try:
        from backend.services import preference
        pref_count = len(preference.recent_preferences(limit=20))
    except Exception:
        pass
    try:
        from backend.services import work_log
        log_count = len(work_log.recent_entries(limit=8))
    except Exception:
        pass
    return {
        "enabled": enabled,
        "preferences_count": pref_count,
        "recent_log_count": log_count,
        "preview_chars": len(preview),
        "preview": preview[:600] + ("..." if len(preview) > 600 else ""),
    }
