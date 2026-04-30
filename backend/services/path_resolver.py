"""DATA_DIR 路径解析层(v1.0 §2.4 + v0.6.3)。

这个模块是 Phase 2 防腐层的核心:
  - 读路径(`resolve_data_path`)兜底 7 种历史/未来格式,出错返回 None
  - 写路径(`normalize_for_db`)入库前自动转相对,锁住未来 DB 不再脏

所有读 `works.local_path` / `works.thumb_path` 的代码必须走 `resolve_data_path`,
所有写 `local_path` / `thumb_path` 的代码必须走 `normalize_for_db`。

设计原则:
  - 永远在 DATA_DIR 内,跳出一律 None(防 path traversal,见 v1.0 §0.6.3 R2)
  - 不抛异常,返回 None 让调用方用 if 判断
  - 兼容历史脏值,不强制 Phase 3 必须先迁移完才能上 Phase 2
"""
from __future__ import annotations

from pathlib import Path
from typing import Optional

from shortvideo.config import DATA_DIR


def resolve_data_path(value: Optional[str]) -> Optional[Path]:
    """把 DB 里存的 path 字符串解析成可用的 Path 对象。

    支持的输入(7 种,v1.0 §2.4):
      1. None / "" / 空白           → return None
      2. "videos/a.mp4"             → DATA_DIR / "videos/a.mp4"
      3. "/media/videos/a.mp4"      → DATA_DIR / "videos/a.mp4"(去前缀)
      4. "videos/a.mp4?t=12"        → 拆 query,DATA_DIR / "videos/a.mp4"
      5. 绝对路径 in DATA_DIR       → 转成 DATA_DIR / 相对部分
      6. 绝对路径 outside DATA_DIR  → return None(认为已失效)
      7. http(s)://...              → return None(URL 不是文件)

    永远不抛异常。返回 None 表示"DB 里这条记录不可用"。

    安全性(v1.0 §0.6.3 R2 + v0.7 修订):
      - 绝对路径 + 相对路径都 .resolve() 后校验 relative_to(DATA_DIR)
      - 防止 ../../etc/passwd 这种 traversal 跳出 DATA_DIR
    """
    if not value or not str(value).strip():
        return None

    s = str(value).strip()

    # 7. URL 不是文件
    if s.startswith(("http://", "https://")):
        return None

    # 4. 拆 query
    if "?" in s:
        s = s.split("?", 1)[0]

    # 3. 去 /media/ 前缀
    if s.startswith("/media/"):
        s = s[len("/media/"):]

    p = Path(s)
    data_dir_resolved = DATA_DIR.resolve()

    # 5/6. 绝对路径
    if p.is_absolute():
        try:
            rel = p.resolve().relative_to(data_dir_resolved)
            return DATA_DIR / rel
        except ValueError:
            return None  # 6. 在 DATA_DIR 外

    # 2. 相对路径(也要防 ../ 跳出 DATA_DIR · v0.4 修订)
    candidate = (DATA_DIR / p).resolve()
    try:
        candidate.relative_to(data_dir_resolved)
        return candidate
    except ValueError:
        return None  # 相对路径解析后跳出 DATA_DIR


def normalize_for_db(value: Optional[str]) -> Optional[str]:
    """写库前 normalize:把绝对路径转相对(POSIX),保证 DB 永远干净。

    输入和 `resolve_data_path` 一样宽容(7 种),输出是要写进 DB 的字符串:
      - 在 DATA_DIR 内 → 相对 POSIX 路径(`videos/a.mp4`)
      - 在 DATA_DIR 外 / URL / 跳出 → None(让调用方决定:存 None 还是报错)
      - None / 空 → None

    示例:
      "/Users/.../neironggongchang/data/videos/a.mp4"  → "videos/a.mp4"
      "videos/a.mp4"                                    → "videos/a.mp4"
      "/media/videos/a.mp4"                             → "videos/a.mp4"
      "/Users/black.chen/Desktop/shortvideo-studio/..." → None
      None / ""                                         → None
    """
    if not value or not str(value).strip():
        return None

    resolved = resolve_data_path(value)
    if resolved is None:
        return None

    try:
        rel = resolved.relative_to(DATA_DIR.resolve())
    except ValueError:
        return None

    # POSIX 风格,跨平台一致(Windows 不支持但项目本来就 macOS)
    return rel.as_posix()
