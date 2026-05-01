# Phase 1 · /media 边界
#
# 把 "data/ 下哪些路径可以通过 HTTP 暴露" 的判定收到一处.
# api.py 用 /media/{path:path} route 调 resolve_media_path():
#   - 命中 → FileResponse
#   - 不命中 → 404
#
# 之前的 app.mount("/media", StaticFiles(directory=DATA_DIR)) 把整个 data/ 暴露,
# /media/works.db /media/settings.json 直接拖走. 这里收紧成白名单.

from __future__ import annotations

from pathlib import Path

# 白名单: 允许通过 /media/<sub>/... 暴露的子目录.
# 收的口径: 业务上明确"前端要拿来播/显示"的资源目录. 其它一律 404.
ALLOWED_MEDIA_SUBDIRS: frozenset[str] = frozenset({
    "videos",            # 数字人渲染产物
    "audio",             # 生成 / 上传音频 (TTS, 录音转写源)
    "covers",            # 作品封面
    "image-gen",         # AI 生成图
    "wechat-images",     # 公众号配图
    "wechat-avatar",     # 公众号头像
    "wechat-cover",      # 公众号单封面
    "wechat-cover-batch",# 公众号封面批量
    "material_thumbs",   # 素材缩略图
    "dreamina",          # 即梦素材
})

# 拒绝的扩展名 — 即使路径在白名单子目录里, 撞到这些后缀也 404.
# 防御 "videos/x.db" 这类潜在打包.
DENIED_EXTENSIONS: frozenset[str] = frozenset({
    ".db", ".sqlite", ".sqlite3",
    ".json", ".jsonl",
    ".log", ".md", ".txt",
    ".env", ".ini", ".toml", ".yaml", ".yml",
    ".py", ".pyc",
    ".sh", ".bash",
})


def resolve_media_path(rel_path: str, data_root: Path) -> Path | None:
    """把 /media/<rel_path> 解析成本地文件路径, 不通过白名单 / 越界 / 拒绝扩展名一律 None.

    rel_path: 形如 "videos/abc.mp4" — 不允许带 ".." 段, 不允许绝对路径, 不允许 "~".
    data_root: DATA_DIR 的解析后 (.resolve()) 路径.

    返回 None 表示拒绝, 调用方应 404.
    """
    if not rel_path:
        return None

    # 拒绝 absolute / home-prefixed
    if rel_path.startswith("/") or rel_path.startswith("~"):
        return None

    # 拆段, 拒绝空段 / "." / ".."
    parts = rel_path.replace("\\", "/").split("/")
    if any(p in ("", ".", "..") for p in parts):
        return None

    # 第一段必须命中白名单
    first = parts[0]
    if first not in ALLOWED_MEDIA_SUBDIRS:
        return None

    # 拼路径并解析 (.resolve() 会消化 symlink)
    candidate = (data_root / rel_path).resolve()

    # 解析后必须仍在 data_root 子树 — 防 symlink 跳出
    try:
        candidate.relative_to(data_root)
    except ValueError:
        return None

    # 存在且是文件
    if not candidate.is_file():
        return None

    # 扩展名拒绝
    if candidate.suffix.lower() in DENIED_EXTENSIONS:
        return None

    return candidate
