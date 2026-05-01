"""Phase 7 · 文件路径入口校验.

外部入参里塞文件路径的接口 (voice clone, dreamina ref, 等):
- 攻击者塞 /etc/passwd /Users/.../.env /var/log/* 等 → 服务读了上传到第三方
- 塞 ../ → 跳出 DATA_DIR
- 塞 symlink → 解析后跳出 DATA_DIR

收口策略:
1. 路径必须是 DATA_DIR 子树下指定的"白名单根" 之一
2. resolve() 解 symlink + 规范化, 解析后还得在白名单内
3. 必须存在且是文件 (不是目录, 不是 fifo)
4. 上传类: 大小上限 + 扩展名白名单
"""

from __future__ import annotations

from pathlib import Path

# ─── 上传大小 / 扩展名白名单 ─────────────────────────────────

VOICE_UPLOAD_MAX_BYTES = 50 * 1024 * 1024   # 50 MB
VOICE_UPLOAD_ALLOWED_EXTS: frozenset[str] = frozenset({
    ".wav", ".mp3", ".m4a", ".ogg", ".flac", ".opus", ".webm",
})

DREAMINA_REF_MAX_BYTES = 4 * 1024 * 1024    # 4 MB (现状 endpoint 已用)
DREAMINA_REF_ALLOWED_EXTS: frozenset[str] = frozenset({
    ".jpg", ".jpeg", ".png", ".webp",
})


# ─── 路径白名单 root (DATA_DIR 相对子目录) ───────────────────
#
# 这里只列子目录名, 真校验时跟 DATA_DIR 拼 + resolve. 任何路径必须在这些
# 目录内才能用作 ref 输入.

VOICE_CLONE_REF_ROOTS_REL: tuple[str, ...] = (
    "audio/uploads",   # /api/voice/upload 落盘的目录
    "audio/samples",   # 旧的样本目录, 保留兼容
)

# 即梦参考图允许复用所有 AI 生图产物 + 自传 ref + 微信类
DREAMINA_REF_ROOTS_REL: tuple[str, ...] = (
    "dreamina",         # /api/dreamina/upload-ref 落盘 (含 dreamina/refs)
    "image-gen",        # apimart / 即梦生图产物
    "covers",           # 封面 (用作 ref 复用)
    "wechat-images",    # 公众号配图
    "wechat-cover",     # 公众号封面
    "wechat-cover-batch",
    "material_thumbs",  # 素材缩略
)


class PathBoundaryError(ValueError):
    """路径越界 / 拒绝读非白名单路径. 调用方应抛 HTTP 400."""


def _resolve_data_root(data_dir: Path) -> Path:
    return Path(data_dir).expanduser().resolve()


def safe_local_path(
    raw: str | None,
    allowed_roots_rel: tuple[str, ...],
    data_dir: Path,
) -> Path:
    """把外部入参的 raw path 校验+解析成安全的本地路径.

    校验顺序:
      1. raw 非空, 不能含 NUL, 不能以 ~ 起头 (我们不展开 ~)
      2. 转成 Path, resolve() 解 symlink 和 ".."
      3. 必须落在 data_dir / allowed_roots_rel[i] 任一子树内
      4. 必须存在且是文件 (不是 dir / fifo / socket / symlink loop)

    返回 resolved Path. 任何不通过 raise PathBoundaryError.
    """
    if raw is None:
        raise PathBoundaryError("path 为空")
    raw_str = str(raw).strip()
    if not raw_str:
        raise PathBoundaryError("path 为空字符串")
    if "\x00" in raw_str:
        raise PathBoundaryError("path 含 NUL 字节")
    if raw_str.startswith("~"):
        raise PathBoundaryError(f"不允许 ~ 起头的路径: {raw_str}")

    data_root = _resolve_data_root(data_dir)
    allowed_roots = [(data_root / rel).resolve() for rel in allowed_roots_rel]

    try:
        resolved = Path(raw_str).expanduser().resolve()
    except (OSError, RuntimeError) as e:
        raise PathBoundaryError(f"path 无法解析: {e}")

    # 必须落在某个允许 root 子树内
    in_root = False
    for root in allowed_roots:
        try:
            resolved.relative_to(root)
            in_root = True
            break
        except ValueError:
            continue
    if not in_root:
        raise PathBoundaryError(
            f"path 不在白名单目录内: {resolved} (允许: {allowed_roots_rel})"
        )

    if not resolved.exists():
        raise PathBoundaryError(f"path 不存在: {resolved}")
    if not resolved.is_file():
        raise PathBoundaryError(f"path 不是文件: {resolved}")

    return resolved


def check_upload_size_and_ext(
    data: bytes,
    filename: str | None,
    max_bytes: int,
    allowed_exts: frozenset[str],
) -> str:
    """上传 multipart 校验. 返回规范小写扩展名 (含点). 不通过 raise PathBoundaryError."""
    if not data:
        raise PathBoundaryError("空文件")
    if len(data) > max_bytes:
        raise PathBoundaryError(
            f"文件太大 {len(data)//1024} KB · 上限 {max_bytes//1024} KB"
        )
    ext = Path(filename or "").suffix.lower()
    if ext not in allowed_exts:
        raise PathBoundaryError(
            f"扩展名 {ext or '(空)'} 不在白名单, 允许: {sorted(allowed_exts)}"
        )
    return ext
