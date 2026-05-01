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


# ─── Phase 10 · materials_root 白名单 ─────────────────────────
#
# settings.materials_root 决定素材库扫描根. 没收口前可被设成 / 或 ~,
# 触发 scan 后暴力扫整盘 → OOM / 把 ~/.ssh/id_rsa 入库 abs_path 暴露.

# 允许的 root 前缀, 相对 ~. 任一 allowed_prefix 子树都允许.
MATERIALS_ROOT_ALLOWED_PREFIXES_REL: tuple[str, ...] = (
    "Downloads",                   # 默认源 (DEFAULTS["materials_root"])
    "Desktop/我的内容库",
    "Desktop/我的内容库(勿动)",     # 全角括号兼容
    "Desktop/我的内容库(勿动)",     # 半角括号兼容
    "Desktop/我的内容库（勿动）",    # 全角括号 alt (memory 实际目录名)
    "Desktop/素材库",
    "Desktop/清华哥素材库",
    "Desktop/清华哥知识库",
)

# scan_root 单次硬上限. 即使白名单过了, 防 100 万文件入库 OOM.
MATERIALS_SCAN_HARD_MAX_FILES = 50_000


def validate_materials_root(raw: str | None) -> Path:
    """settings.materials_root 校验.

    返回 resolve 后的 Path, 不通过 raise PathBoundaryError.
    规则:
      - 非空, 不能是 "/" 或 "~"
      - resolve 后必须落在 home/<allowed_prefix> 之一的子树
      - 必须存在且是目录
      - 拒绝 NUL
      - 拒绝 symlink 跳出 (resolve 已解 symlink, relative_to 二次校)
    """
    if not raw:
        raise PathBoundaryError("materials_root 为空")
    s = str(raw).strip()
    if not s or "\x00" in s:
        raise PathBoundaryError("materials_root 非法 (空/NUL)")
    if s in ("/", "~", "/Users", "/Users/", "/etc", "/var", "/home"):
        raise PathBoundaryError(f"不能用粗根作 materials_root: {s}")

    home = Path.home().resolve()
    allowed_roots = []
    for rel in MATERIALS_ROOT_ALLOWED_PREFIXES_REL:
        try:
            allowed_roots.append((home / rel).resolve())
        except (OSError, RuntimeError):
            continue

    p = Path(s).expanduser()
    try:
        resolved = p.resolve()
    except (OSError, RuntimeError) as e:
        raise PathBoundaryError(f"materials_root 解析失败: {e}")

    # 必须等于或落在某 allowed root 子树
    in_allowed = False
    for ar in allowed_roots:
        try:
            resolved.relative_to(ar)
            in_allowed = True
            break
        except ValueError:
            continue
    if not in_allowed:
        raise PathBoundaryError(
            f"materials_root 不在白名单: {resolved}. "
            f"允许的根: {[str(Path('~') / rel) for rel in MATERIALS_ROOT_ALLOWED_PREFIXES_REL]}"
        )

    if not resolved.exists():
        raise PathBoundaryError(f"materials_root 不存在: {resolved}")
    if not resolved.is_dir():
        raise PathBoundaryError(f"materials_root 不是目录: {resolved}")

    return resolved


def is_safe_material_file(raw: str | None, data_dir: Path) -> Path | None:
    """Phase 10 review (P1-1): material_lib/file FileResponse 之前的 runtime 校验.

    DB 里 material_assets.abs_path 可能是历史污染的 row (在 materials_root='/'
    时入库的 /etc/passwd 之类). 必须 runtime check 路径仍合法.

    允许位于以下任一:
      1. DATA_DIR 子树 (thumb 等本地产物)
      2. home/<MATERIALS_ROOT_ALLOWED_PREFIXES_REL> 任一 (素材库白名单根)

    返回 None 表示拒绝, 调用方应 404. resolve 后必须存在 + 是文件.
    """
    if not raw:
        return None
    s = str(raw).strip()
    if not s or "\x00" in s:
        return None

    p = Path(s).expanduser()
    try:
        resolved = p.resolve()
    except (OSError, RuntimeError):
        return None
    if not resolved.exists() or not resolved.is_file():
        return None

    # 检查 1: DATA_DIR 子树 (thumb/material_thumbs 等)
    try:
        data_root = Path(data_dir).expanduser().resolve()
        try:
            resolved.relative_to(data_root)
            return resolved
        except ValueError:
            pass
    except (OSError, RuntimeError):
        pass

    # 检查 2: home 下任何 materials_root 白名单 prefix 子树
    try:
        home = Path.home().resolve()
    except (OSError, RuntimeError):
        return None
    for rel in MATERIALS_ROOT_ALLOWED_PREFIXES_REL:
        try:
            ar = (home / rel).resolve()
        except (OSError, RuntimeError):
            continue
        try:
            resolved.relative_to(ar)
            return resolved
        except ValueError:
            continue

    return None


def check_upload_size_and_ext(
    data: bytes,
    filename: str | None,
    max_bytes: int,
    allowed_exts: frozenset[str],
) -> str:
    """上传 multipart 校验 (data 已读完). 返回规范小写扩展名 (含点).

    不通过 raise PathBoundaryError. 注意: 这个函数假设 data 已经全 read 了,
    无法防 oversized body 进内存. Phase 7 review (P2-4) 后请改用
    bounded_upload_read + 这个函数的组合.
    """
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


async def bounded_upload_read(file, max_bytes: int) -> bytes:
    """Phase 7 review (P2-4): 流式读 UploadFile, 累计超 max_bytes 立即拒.

    防 oversized body 进内存 — 之前 await file.read() 一次性读全, 100MB 上传
    会先 buffer 100MB 到 ram 才能拒.

    现在按 64KB chunk 累加, 累计 > max_bytes+1 立即 raise PathBoundaryError.
    多读 1 byte 是为了能区分 "正好 max_bytes" (通过) 与 "超出" (拒).
    """
    chunk_size = 64 * 1024
    buf = bytearray()
    limit = max_bytes + 1
    while True:
        chunk = await file.read(chunk_size)
        if not chunk:
            break
        buf.extend(chunk)
        if len(buf) >= limit:
            raise PathBoundaryError(
                f"文件太大: 已读 {len(buf)//1024} KB 仍未结束 · 上限 {max_bytes//1024} KB"
            )
    if not buf:
        raise PathBoundaryError("空文件")
    return bytes(buf)
