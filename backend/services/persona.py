"""人设加载器 — 关卡层注入清华哥人设。

两档:
  deep=False: 只 persona-prompt.md (~1900 字, ~300 token)
  deep=True:  persona-prompt.md + 4 个详细人设 (~26000 字, ~7500 token)

人设文件在 Obsidian 知识库里,工厂只读。缓存 10 分钟 mtime,清华哥在
Obsidian 编辑完,工厂自动读到新版。
"""
from __future__ import annotations

import os
import time
from pathlib import Path

PERSONA_ROOT = Path(os.path.expanduser("~/Desktop/清华哥知识库/00 🤖 AI清华哥"))

SHORT_FILE = "persona-prompt.md"
FULL_FILES = [
    "业务画像.md",
    "写作风格规范.md",
    "人设定位与表达边界.md",
    "AI协作偏好.md",
]

# D-067: 行为记忆 + 偏好文件 (从对话/产出累积写入, 反过来读回注入 prompt)
WORK_LOG_FILE = "小华工作日志.md"
PREFERENCE_FILE = "小华学到的偏好.md"
YESTERDAY_SUMMARY_FILE = "昨天的你.md"  # D-067 P4 夜班生成

# 注入限制 (避免 prompt 爆)
MAX_WORK_LOG_LINES = 30   # 最近 30 行行为日志
MAX_PREFERENCE_CHARS = 1500  # 偏好文件最多 1500 字
MAX_SUMMARY_CHARS = 1000   # 昨天的你摘要最多 1000 字

_CACHE_TTL = 600  # 秒
_cache: dict[str, tuple[str, float]] = {}  # filename -> (content, loaded_at)
_announced = False


def _read(filename: str) -> str:
    now = time.time()
    hit = _cache.get(filename)
    if hit and (now - hit[1]) < _CACHE_TTL:
        return hit[0]
    p = PERSONA_ROOT / filename
    if not p.exists():
        _cache[filename] = ("", now)
        return ""
    try:
        text = p.read_text(encoding="utf-8", errors="replace")
    except OSError:
        text = ""
    _cache[filename] = (text, now)
    return text


def _load_memory_block() -> str:
    """D-067: 拼接行为记忆 + 用户偏好块, 注入到 system prompt 末尾.

    读三个 Obsidian 文件 (写入由 work_log.py / preference.py / night_runners 负责):
    - 昨天的你.md (优先用这个, 是夜班精炼后的摘要)
    - 小华学到的偏好.md (用户明确偏好)
    - 小华工作日志.md (最近 N 条行为日志, 兜底)

    返回空串 = 当前还没积累任何记忆 / 文件不存在.
    """
    parts: list[str] = []

    # P4: 优先用夜班精炼摘要 "昨天的你"
    summary = _read(YESTERDAY_SUMMARY_FILE).strip()
    if summary:
        if len(summary) > MAX_SUMMARY_CHARS:
            summary = summary[:MAX_SUMMARY_CHARS] + "..."
        parts.append(f"# 你最近的状态(夜班自动总结)\n\n{summary}")

    # P1: 用户偏好(明确说过的喜好/禁忌)
    pref = _read(PREFERENCE_FILE).strip()
    if pref:
        if len(pref) > MAX_PREFERENCE_CHARS:
            pref = pref[-MAX_PREFERENCE_CHARS:]  # 保留最新的
        parts.append(f"# 老板已明确告诉过你的偏好\n\n{pref}\n\n请严格遵守这些偏好.")

    # P1: 行为日志(最近 N 条) — 如果没有 yesterday_summary 才用
    # 只取 "## YYYY-MM-DD" 节里的 "- " 行 (跳过用户写的模板/说明)
    if not summary:
        log = _read(WORK_LOG_FILE).strip()
        if log:
            entries: list[str] = []
            in_dated_section = False
            for ln in log.splitlines():
                stripped = ln.strip()
                if stripped.startswith("## ") and len(stripped) > 6 and stripped[3].isdigit():
                    in_dated_section = True
                    entries.append(ln)
                elif stripped.startswith("## "):
                    in_dated_section = False
                elif in_dated_section and (stripped.startswith("- ") or stripped.startswith("### ")):
                    entries.append(ln)
            recent = entries[-MAX_WORK_LOG_LINES:]
            if recent:
                log_text = "\n".join(recent)
                parts.append(f"# 老板最近的产出记录(供你参考他的风格倾向)\n\n{log_text}")

    return "\n\n".join(parts)


def load_persona(deep: bool = True, *, include_memory: bool = True) -> str:
    """返回要拼到 system prompt 的人设文本。

    D-067: include_memory=True 默认开启行为记忆 + 偏好回读 (Layer 3).
    """
    global _announced

    short = _read(SHORT_FILE).strip()
    if not deep:
        payload = short
    else:
        parts = [short] if short else []
        for fn in FULL_FILES:
            body = _read(fn).strip()
            if body:
                parts.append(f"---\n\n# 参考资料:{fn[:-3]}\n\n{body}")
        payload = "\n\n".join(parts)

    # D-067: 行为记忆 + 偏好回读
    if include_memory:
        mem = _load_memory_block()
        if mem:
            payload = f"{payload}\n\n---\n\n{mem}" if payload else mem

    if not _announced:
        short_len = len(short)
        full_len = sum(len(_read(fn)) for fn in FULL_FILES)
        missing = [fn for fn in [SHORT_FILE, *FULL_FILES] if not _read(fn)]
        warn = f" · 缺失:{','.join(missing)}" if missing else ""
        mem_chars = len(_load_memory_block()) if include_memory else 0
        mem_info = f" · 行为记忆 {mem_chars} 字" if mem_chars else " · 行为记忆未启用 / 空"
        print(
            f"[persona] 人设注入就绪 · 精简版 {short_len} 字 · 详细版 {full_len} 字{mem_info}{warn}",
            flush=True,
        )
        _announced = True

    return payload


def persona_stats() -> dict:
    """供 /api/ai/health 或调试页查看当前人设体积(不触发加载打印)。"""
    short = _read(SHORT_FILE)
    full = {fn: len(_read(fn)) for fn in FULL_FILES}
    # D-067: 行为记忆三件套
    work_log = _read(WORK_LOG_FILE)
    preference = _read(PREFERENCE_FILE)
    summary = _read(YESTERDAY_SUMMARY_FILE)
    return {
        "root": str(PERSONA_ROOT),
        "short_file": SHORT_FILE,
        "short_chars": len(short),
        "full_files": full,
        "full_chars_total": sum(full.values()),
        "deep_chars_total": len(short) + sum(full.values()),
        "cache_ttl_sec": _CACHE_TTL,
        # D-067:
        "memory_enabled": True,
        "work_log_chars": len(work_log),
        "preference_chars": len(preference),
        "yesterday_summary_chars": len(summary),
        "memory_inject_chars": len(_load_memory_block()),
    }


def clear_cache() -> None:
    """测试或手动刷新用。"""
    global _announced
    _cache.clear()
    _announced = False
