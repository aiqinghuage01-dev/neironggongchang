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


def load_persona(deep: bool = True) -> str:
    """返回要拼到 system prompt 的人设文本。"""
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

    if not _announced:
        short_len = len(short)
        full_len = sum(len(_read(fn)) for fn in FULL_FILES)
        missing = [fn for fn in [SHORT_FILE, *FULL_FILES] if not _read(fn)]
        warn = f" · 缺失:{','.join(missing)}" if missing else ""
        print(
            f"[persona] 人设注入就绪 · 精简版 {short_len} 字 · 详细版 {full_len} 字{warn}",
            flush=True,
        )
        _announced = True

    return payload


def persona_stats() -> dict:
    """供 /api/ai/health 或调试页查看当前人设体积(不触发加载打印)。"""
    short = _read(SHORT_FILE)
    full = {fn: len(_read(fn)) for fn in FULL_FILES}
    return {
        "root": str(PERSONA_ROOT),
        "short_file": SHORT_FILE,
        "short_chars": len(short),
        "full_files": full,
        "full_chars_total": sum(full.values()),
        "deep_chars_total": len(short) + sum(full.values()),
        "cache_ttl_sec": _CACHE_TTL,
    }


def clear_cache() -> None:
    """测试或手动刷新用。"""
    global _announced
    _cache.clear()
    _announced = False
