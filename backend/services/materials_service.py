"""素材库服务 (D-087).

扫描素材根目录 → 白名单过滤 → 缩略图 → SQLite 入库.
默认根目录 ~/Downloads (settings.materials_root 可改).
未来切 ~/Desktop/清华哥素材库/ 改 settings 一行即可.

跟 D-084 schema 集中迁移一致, 走 backend.services.migrations v2 (5 表).
连接走 shortvideo.db.get_connection (D-086 单一抽象点).
长扫描走 D-068 tasks.run_async (daemon thread + 防卡死).
"""
from __future__ import annotations

import hashlib
import json
import logging
import os
import re
import sqlite3
import subprocess
import time
from contextlib import closing
from pathlib import Path
from typing import Any, Callable

from backend.services.migrations import apply_migrations
from shortvideo.db import get_connection
import shortvideo.config

log = logging.getLogger("materials")


# ─── 常量 (白名单 + 缩略图配置) ───────────────────────────

IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".gif", ".webp"}
VIDEO_EXTS = {".mp4", ".mov", ".m4v", ".avi", ".mpg", ".mpeg"}
ASSET_EXTS = IMAGE_EXTS | VIDEO_EXTS

THUMB_DIR = shortvideo.config.DATA_DIR / "material_thumbs"
THUMB_DIR.mkdir(parents=True, exist_ok=True)
THUMB_SIZE = (320, 180)


# ─── D-124 精品原片库业务大类 ─────────────────────────────

MATERIAL_CATEGORIES: list[dict[str, Any]] = [
    {
        "key": "00 待整理",
        "label": "待整理",
        "icon": "□",
        "description": "新素材、暂时识别不准的素材, 等清华哥确认",
        "usage": "先审核再进剪辑",
        "keywords": ["待整理", "未分类", "unknown", "img_", "dsc", "wechat", "download"],
    },
    {
        "key": "01 演讲舞台",
        "label": "演讲舞台",
        "icon": "■",
        "description": "上台、观众、掌声、会场、合影、舞台空镜",
        "usage": "适合做权威背书、现场证明、开场和结尾",
        "keywords": ["演讲", "舞台", "讲台", "会场", "观众", "掌声", "上台", "主持", "合影", "speech", "stage", "podium", "talk"],
    },
    {
        "key": "02 上课教学",
        "label": "上课教学",
        "icon": "▣",
        "description": "课堂、板书、课件、学员互动、讲课片段",
        "usage": "适合讲知识点、证明教学现场、穿插课堂片段",
        "keywords": ["上课", "教学", "课堂", "讲课", "学员", "学生", "板书", "课件", "提问", "互动", "lecture", "class", "courseware"],
    },
    {
        "key": "03 研发产品",
        "label": "研发产品",
        "icon": "▤",
        "description": "研发现场、电脑、工具、产品演示、团队讨论",
        "usage": "适合展示产品、团队、方法论和操作过程",
        "keywords": ["研发", "产品", "电脑", "工具", "代码", "演示", "团队", "讨论", "后台", "软件", "demo", "screen", "录屏"],
    },
    {
        "key": "04 出差商务",
        "label": "出差商务",
        "icon": "▥",
        "description": "机场、高铁、酒店、城市、客户现场、商务会面",
        "usage": "适合转场、行程记录、商务信任和现场感",
        "keywords": ["出差", "机场", "高铁", "酒店", "城市", "客户", "商务", "会议", "会面", "差旅", "travel", "trip", "hotel", "airport"],
    },
    {
        "key": "05 做课素材",
        "label": "做课素材",
        "icon": "▦",
        "description": "录课、课程封面、PPT、讲义截图、课程花絮",
        "usage": "适合课程预告、知识产品说明、封面和课件补画面",
        "keywords": ["做课", "录课", "课程", "ppt", "讲义", "课纲", "大纲", "封面", "花絮", "训练营", "lesson", "slides"],
    },
    {
        "key": "06 空镜补画面",
        "label": "空镜补画面",
        "icon": "▧",
        "description": "办公室、手部、键盘、书、咖啡、街景、转场镜头",
        "usage": "适合转场、铺底、情绪缓冲和口播补画面",
        "keywords": ["空镜", "补画面", "办公室", "手部", "键盘", "书", "咖啡", "街景", "转场", "走位", "broll", "b-roll", "cutaway"],
    },
    {
        "key": "07 品牌资产",
        "label": "品牌资产",
        "icon": "▨",
        "description": "logo、海报、封面、固定视觉物料",
        "usage": "适合封面、片尾、品牌露出和固定视觉资产",
        "keywords": ["品牌", "logo", "海报", "封面", "poster", "cover", "banner", "头像", "二维码", "视觉", "物料"],
    },
]

VALID_CATEGORIES = {c["key"] for c in MATERIAL_CATEGORIES}
DEFAULT_CATEGORY = "00 待整理"


def _category_meta(category: str | None) -> dict[str, Any]:
    key = category if category in VALID_CATEGORIES else DEFAULT_CATEGORY
    return next(c for c in MATERIAL_CATEGORIES if c["key"] == key)


def _asset_text(asset: dict[str, Any]) -> str:
    tag_text = " ".join(
        str(t.get("name") or "")
        for t in (asset.get("tags") or [])
        if isinstance(t, dict)
    )
    return " ".join(
        str(asset.get(k) or "") for k in ("filename", "rel_folder", "ext")
    ).lower() + " " + tag_text.lower()


def _media_kind(asset: dict[str, Any]) -> str:
    return "视频" if (asset.get("ext") or "").lower() in VIDEO_EXTS else "图片"


def infer_orientation(width: Any, height: Any) -> str:
    try:
        w = float(width or 0)
        h = float(height or 0)
    except (TypeError, ValueError):
        return "未知"
    if w <= 0 or h <= 0:
        return "未知"
    ratio = w / h
    if ratio >= 1.15:
        return "横屏"
    if ratio <= 0.85:
        return "竖屏"
    return "方图"


def build_metadata_profile(asset: dict[str, Any]) -> dict[str, Any]:
    """基于文件名/路径/尺寸/时长推断第一版结构化画像.

    这是 D-124 的快速层, 不烧 credits. 后续图片视觉识别/视频关键帧识别可复用
    update_asset_profile() 覆盖同一批字段, recognition_source 改为 image_vision/video_frames.
    """
    text = _asset_text(asset)
    category_scores: dict[str, int] = {c["key"]: 0 for c in MATERIAL_CATEGORIES}
    matched_terms: list[str] = []
    for c in MATERIAL_CATEGORIES:
        for kw in c["keywords"]:
            if kw.lower() in text:
                category_scores[c["key"]] += 2 if c["key"] != DEFAULT_CATEGORY else 1
                if kw not in matched_terms and c["key"] != DEFAULT_CATEGORY:
                    matched_terms.append(kw)

    # 老 D-087 文件夹名兼容: 只影响虚拟分类, 不移动真实文件.
    old_folder = str(asset.get("rel_folder") or "")
    legacy_map = {
        "00 讲台高光": "01 演讲舞台",
        "01 板书课件": "02 上课教学",
        "02 学员互动": "02 上课教学",
        "03 走位空镜": "06 空镜补画面",
        "04 海报封面": "07 品牌资产",
        "05 BGM 音效": "06 空镜补画面",
        "06 金句库": "05 做课素材",
        "07 爆款档案": "05 做课素材",
    }
    for prefix, mapped in legacy_map.items():
        if old_folder.startswith(prefix):
            category_scores[mapped] += 4

    best_category, best_score = max(category_scores.items(), key=lambda kv: kv[1])
    if best_score <= 0:
        best_category = DEFAULT_CATEGORY

    orientation = infer_orientation(asset.get("width"), asset.get("height"))
    kind = _media_kind(asset)
    duration = float(asset.get("duration_sec") or 0)
    width = int(asset.get("width") or 0)
    height = int(asset.get("height") or 0)
    has_thumb = bool(asset.get("thumb_path"))

    shot_type = "现场照片" if kind == "图片" else "视频片段"
    if any(k in text for k in ("录屏", "screen", "screenshot", "截图")):
        shot_type = "屏幕录制"
    elif any(k in text for k in ("合影", "group")):
        shot_type = "合影"
    elif any(k in text for k in ("手", "键盘", "咖啡", "书")):
        shot_type = "手部特写"
    elif best_category == "01 演讲舞台":
        shot_type = "演讲现场"
    elif best_category == "02 上课教学":
        shot_type = "教学现场"
    elif best_category == "04 出差商务":
        shot_type = "出差记录"
    elif best_category == "06 空镜补画面":
        shot_type = "环境空镜"
    elif best_category == "07 品牌资产":
        shot_type = "品牌物料"
    elif kind == "视频" and duration >= 600:
        shot_type = "长课片段"

    category_info = _category_meta(best_category)
    visual_summary = f"按文件信息判断: 可能是{category_info['label']}素材"
    if matched_terms:
        visual_summary += f" ({'、'.join(matched_terms[:3])})"
    elif orientation != "未知":
        visual_summary += f" ({orientation}{kind})"

    quality = 48
    if has_thumb:
        quality += 18
    if width and height:
        longest = max(width, height)
        shortest = min(width, height)
        if longest >= 1920 or shortest >= 1080:
            quality += 14
        elif longest >= 1280 or shortest >= 720:
            quality += 9
        elif longest < 640 or shortest < 360:
            quality -= 12
    else:
        quality -= 8
    if kind == "视频":
        if 5 <= duration <= 180:
            quality += 10
        elif duration > 1200:
            quality -= 6
    quality = max(0, min(100, int(quality)))

    relevance = 25 if best_category == DEFAULT_CATEGORY else 55 + min(35, best_score * 6)
    if best_category in {"01 演讲舞台", "02 上课教学", "05 做课素材"}:
        relevance += 8
    relevance = max(0, min(100, int(relevance)))

    tags = [category_info["label"], orientation, shot_type]
    tags.extend(matched_terms[:8])
    tags = [t for i, t in enumerate(tags) if t and t != "未知" and t not in tags[:i]][:12]

    return {
        "category": best_category,
        "visual_summary": visual_summary,
        "shot_type": shot_type,
        "orientation": orientation,
        "quality_score": quality,
        "usage_hint": category_info["usage"],
        "relevance_score": relevance,
        "recognition_source": "metadata",
        "profile_updated_at": int(time.time()),
        "tags": tags,
    }


def _with_profile_defaults(asset: dict[str, Any]) -> dict[str, Any]:
    """给旧 row 补响应层默认画像, 不写库. 真落库由 classify_asset 完成."""
    if asset.get("profile_updated_at") and asset.get("category"):
        if asset.get("category") not in VALID_CATEGORIES:
            asset["category"] = DEFAULT_CATEGORY
        return asset
    inferred = build_metadata_profile(asset)
    for k in (
        "category", "visual_summary", "shot_type", "orientation", "quality_score",
        "usage_hint", "relevance_score", "recognition_source",
    ):
        if asset.get(k) in (None, ""):
            asset[k] = inferred[k]
    return asset


def _ensure_schema() -> None:
    apply_migrations()


def get_materials_root() -> Path:
    """从 settings 读 materials_root, 默认 ~/Downloads/.

    未来用户切到 ~/Desktop/清华哥素材库/ 只需改 settings 一行, 代码不动.
    """
    try:
        from backend.services import settings as s
        v = (s.get_all() or {}).get("materials_root")
        if v:
            return Path(v).expanduser()
    except Exception:
        pass
    return Path.home() / "Downloads"


# ─── ID + content_hash + thumbnail ────────────────────
# B'-4 (GPT 修订): 旧 _asset_id=sha1(path+mtime) 跟 abs_path UNIQUE 互相打架
# (mtime 变 → 新 hash → SELECT id 找不到 → INSERT OR IGNORE 因 path UNIQUE 静默忽略,
# 函数仍返新 aid + is_new=True, 但库里没新 row, tags/usage/pending 还挂在旧 id 上).
# 新方案: 真新文件用 uuid 当 id (随机不撞车), 已有 row 走 path 或 content_hash 命中
# 不换 id, 让 tags/usage/pending 永不孤儿.
import uuid as _uuid


def _new_asset_id() -> str:
    """新 row 用的随机 ID (16 位 hex). 跟 path/mtime/content 完全解耦, 永不撞车."""
    return _uuid.uuid4().hex[:16]


# 大文件不算 hash (慢). 给小/中文件算 sha256 标识"被改名/移动的同一内容".
_CONTENT_HASH_MAX_BYTES = 100 * 1024 * 1024  # 100MB


def _compute_content_hash(abs_path: str, max_bytes: int = _CONTENT_HASH_MAX_BYTES) -> str | None:
    """sha256(file_bytes) 取前 32 字符. 文件 > max_bytes 返 None (不算).
    用于"path 找不到时按内容找" — 改名 / 移动同一文件能识别.
    """
    try:
        size = Path(abs_path).stat().st_size
    except OSError:
        return None
    if size > max_bytes:
        return None
    h = hashlib.sha256()
    try:
        with open(abs_path, "rb") as f:
            while chunk := f.read(64 * 1024):
                h.update(chunk)
    except OSError:
        return None
    return h.hexdigest()[:32]


def _make_image_thumb(src: Path, dst: Path) -> bool:
    try:
        from PIL import Image  # type: ignore
        with Image.open(src) as im:
            im.thumbnail(THUMB_SIZE, Image.Resampling.LANCZOS)
            if im.mode in ("RGBA", "P", "LA"):
                im = im.convert("RGB")
            im.save(dst, "JPEG", quality=82)
        return dst.exists() and dst.stat().st_size > 0
    except Exception as e:
        log.debug(f"image thumb failed: {src.name} → {type(e).__name__}: {e}")
        return False


def _make_video_thumb(src: Path, dst: Path) -> bool:
    """ffmpeg 抽视频 1s 处的帧作缩略图. 8s timeout 兜底."""
    try:
        subprocess.run(
            [
                "ffmpeg", "-y", "-loglevel", "error",
                "-ss", "1.0", "-i", str(src),
                "-frames:v", "1",
                "-vf", f"scale={THUMB_SIZE[0]}:-1",
                "-q:v", "5",
                str(dst),
            ],
            check=True, capture_output=True, timeout=10,
        )
        return dst.exists() and dst.stat().st_size > 0
    except Exception as e:
        log.debug(f"video thumb failed: {src.name} → {type(e).__name__}: {e}")
        return False


def _make_thumb(abs_path: str, asset_id: str) -> str | None:
    """生成缩略图. 返回相对 THUMB_DIR 的文件名 (或 None 失败)."""
    dst = THUMB_DIR / f"{asset_id}.jpg"
    if dst.exists() and dst.stat().st_size > 0:
        return f"{asset_id}.jpg"
    src = Path(abs_path)
    ext = src.suffix.lower()
    ok = (
        _make_image_thumb(src, dst) if ext in IMAGE_EXTS
        else _make_video_thumb(src, dst) if ext in VIDEO_EXTS
        else False
    )
    return f"{asset_id}.jpg" if ok else None


def _probe_video(abs_path: str) -> dict[str, Any]:
    """ffprobe 视频 → {duration_sec, width, height}. 失败返 {}."""
    try:
        r = subprocess.run(
            [
                "ffprobe", "-loglevel", "error",
                "-show_entries", "stream=width,height:format=duration",
                "-of", "json", abs_path,
            ],
            check=True, capture_output=True, timeout=8,
        )
        data = json.loads(r.stdout or "{}")
        out: dict[str, Any] = {}
        for s in data.get("streams") or []:
            if s.get("width"):
                out["width"] = int(s["width"])
                out["height"] = int(s.get("height") or 0) or None
                break
        if data.get("format", {}).get("duration"):
            out["duration_sec"] = float(data["format"]["duration"])
        return out
    except Exception:
        return {}


def _probe_image(abs_path: str) -> dict[str, Any]:
    try:
        from PIL import Image  # type: ignore
        with Image.open(abs_path) as im:
            return {"width": im.width, "height": im.height}
    except Exception:
        return {}


# ─── 扫描 + upsert ───────────────────────────────────────

def _walk_root(root: Path):
    """yield 所有合法素材文件 (Path), 跳过隐藏目录 + 非素材后缀."""
    for dirpath, dirnames, filenames in os.walk(str(root)):
        dirnames[:] = [d for d in dirnames if not d.startswith(".")]
        for fn in filenames:
            if fn.startswith("."):
                continue
            ext = Path(fn).suffix.lower()
            if ext not in ASSET_EXTS:
                continue
            yield Path(dirpath) / fn


def _upsert_asset(con: sqlite3.Connection, abs_path: str, root: Path) -> tuple[str, bool]:
    """单文件 upsert. 返回 (asset_id, is_new).

    B'-4 (GPT 修订) 三段查找, 不换主键:
    1. 按 abs_path 找 → 命中 → UPDATE metadata + last_seen_at, 保留 id
    2. 按 content_hash 找 (路径变了/改名) → 命中 → UPDATE abs_path/rel_folder, 保留 id
    3. 都没命中 → 真新文件 → 新 uuid id, INSERT
    永不重新 hash 已有 row 的 id, tags/usage/pending 不孤儿.
    """
    p = Path(abs_path)
    try:
        st = p.stat()
    except OSError:
        return ("", False)
    ext = p.suffix.lower()
    try:
        rel_folder = str(p.parent.relative_to(root)) if p.parent != root else "."
    except ValueError:
        rel_folder = "."
    now = int(time.time())

    # 段 1: 按 abs_path 找已有 row
    existing_by_path = con.execute(
        "SELECT id, file_ctime, content_hash FROM material_assets WHERE abs_path=?",
        (abs_path,),
    ).fetchone()
    if existing_by_path:
        aid_old, old_mtime, old_hash = existing_by_path
        # 文件还在原位, 只更新 last_seen_at + missing_at=NULL.
        # mtime 变了说明文件真改了 → 重 probe + 重缩略图 + 重算 hash.
        if int(st.st_mtime) != (old_mtime or 0):
            info = _probe_video(abs_path) if ext in VIDEO_EXTS else _probe_image(abs_path)
            thumb = _make_thumb(abs_path, aid_old)
            new_hash = _compute_content_hash(abs_path)
            con.execute(
                "UPDATE material_assets SET file_ctime=?, size_bytes=?, width=?, height=?, "
                "duration_sec=?, thumb_path=?, content_hash=?, last_seen_at=?, missing_at=NULL "
                "WHERE id=?",
                (int(st.st_mtime), st.st_size, info.get("width"), info.get("height"),
                 info.get("duration_sec"), thumb, new_hash, now, aid_old),
            )
        elif old_hash is None:
            # 存量 row 没 content_hash (V3 → V4 升级时刷不到), 顺手补一次
            new_hash = _compute_content_hash(abs_path)
            con.execute(
                "UPDATE material_assets SET content_hash=?, last_seen_at=?, missing_at=NULL "
                "WHERE id=?",
                (new_hash, now, aid_old),
            )
        else:
            con.execute(
                "UPDATE material_assets SET last_seen_at=?, missing_at=NULL WHERE id=?",
                (now, aid_old),
            )
        return (aid_old, False)

    # 段 2: 按 content_hash 找 (改名/移动同一文件)
    file_hash = _compute_content_hash(abs_path)
    if file_hash:
        existing_by_hash = con.execute(
            "SELECT id FROM material_assets WHERE content_hash=? LIMIT 1",
            (file_hash,),
        ).fetchone()
        if existing_by_hash:
            aid_moved = existing_by_hash[0]
            # 旧 row 的 abs_path 不再有效 (文件被改名/挪走), 接管这条新 path.
            con.execute(
                "UPDATE material_assets SET abs_path=?, filename=?, rel_folder=?, "
                "last_seen_at=?, missing_at=NULL WHERE id=?",
                (abs_path, p.name, rel_folder, now, aid_moved),
            )
            return (aid_moved, False)

    # 段 3: 真新文件 → 新 uuid id
    aid = _new_asset_id()
    info = _probe_video(abs_path) if ext in VIDEO_EXTS else _probe_image(abs_path)
    thumb = _make_thumb(abs_path, aid)
    con.execute(
        "INSERT INTO material_assets "
        "(id, abs_path, filename, ext, rel_folder, size_bytes, width, height, "
        " duration_sec, file_ctime, imported_at, thumb_path, status, is_pending_review, user_id, "
        " content_hash, last_seen_at) "
        "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        (
            aid, abs_path, p.name, ext, rel_folder,
            st.st_size, info.get("width"), info.get("height"),
            info.get("duration_sec"), int(st.st_mtime), now, thumb,
            "sorted", 0, "qinghua",
            file_hash, now,
        ),
    )
    return (aid, True)


def scan_root(
    *,
    max_files: int | None = None,
    on_progress: Callable[[int, int, str], None] | None = None,
) -> dict[str, Any]:
    """扫描素材根目录, 入库新增. 返回 {scanned, added, skipped, errors, root}.

    max_files: 上限 (None=全扫, 测试用小值).
    on_progress(idx, total, current_path): 进度回调 (10 文件一次, 给 tasks.run_async 推进度).
    """
    _ensure_schema()
    root = get_materials_root()
    if not root.exists():
        return {"error": f"素材根目录不存在: {root}", "scanned": 0, "added": 0, "errors": 0, "root": str(root)}
    if max_files:
        files = []
        for p in _walk_root(root):
            files.append(p)
            if len(files) >= max_files:
                break
    else:
        files = list(_walk_root(root))
    total = len(files)
    added = 0
    errors = 0
    log.info(f"scan_root: {root} 共 {total} 个素材文件")
    with closing(get_connection()) as con:
        for i, p in enumerate(files):
            try:
                _, is_new = _upsert_asset(con, str(p), root)
                if is_new:
                    added += 1
            except Exception as e:
                errors += 1
                log.warning(f"upsert failed {p.name}: {type(e).__name__}: {e}")
            if i % 50 == 49:
                con.commit()
            if on_progress and i % 10 == 0:
                try:
                    on_progress(i + 1, total, str(p))
                except Exception:
                    pass
        con.commit()
    return {
        "scanned": total, "added": added,
        "skipped": total - added - errors, "errors": errors,
        "root": str(root),
    }


# ─── 查询 (给 endpoint 用) ───────────────────────────────

def get_stats() -> dict[str, Any]:
    """L1 大屏 4 个 KPI 用. 待整理 = AI 建议归档不同文件夹的素材数 (status='pending')."""
    _ensure_schema()
    now = int(time.time())
    week_start = now - 7 * 86400
    month_start = now - 30 * 86400
    with closing(get_connection()) as con:
        total = con.execute("SELECT COUNT(*) FROM material_assets").fetchone()[0]
        # 待整理: AI 打标后建议归档不同文件夹的素材 (D-087 C 工作流)
        pending = con.execute(
            "SELECT COUNT(*) FROM material_pending_moves "
            "WHERE status='pending' AND COALESCE(suggestion_version, 1) >= 2"
        ).fetchone()[0]
        ai_tagged = con.execute(
            "SELECT COUNT(DISTINCT asset_id) FROM material_asset_tags"
        ).fetchone()[0]
        profiled = con.execute(
            "SELECT COUNT(*) FROM material_assets WHERE profile_updated_at IS NOT NULL"
        ).fetchone()[0]
        usage_month = con.execute(
            "SELECT COUNT(*) FROM material_usage_log WHERE used_at >= ?",
            (month_start,),
        ).fetchone()[0]
        week_added = con.execute(
            "SELECT COUNT(*) FROM material_assets WHERE imported_at >= ?",
            (week_start,),
        ).fetchone()[0]
    return {
        "total": total,
        "pending_review": pending,
        "ai_tagged": ai_tagged,
        "ai_coverage": round(ai_tagged / max(1, total) * 100, 1),
        "profiled": profiled,
        "profile_coverage": round(profiled / max(1, total) * 100, 1),
        "usage_this_month": usage_month,
        "hit_rate": round(usage_month / max(1, total) * 100, 1) if total else 0,
        "week_added": week_added,
        "root": str(get_materials_root()),
    }


def update_asset_profile(asset_id: str, profile: dict[str, Any]) -> dict[str, Any] | None:
    """写结构化画像到 material_assets."""
    _ensure_schema()
    category = profile.get("category") if profile.get("category") in VALID_CATEGORIES else DEFAULT_CATEGORY
    with closing(get_connection()) as con:
        cur = con.execute(
            """
            UPDATE material_assets
            SET category=?, visual_summary=?, shot_type=?, orientation=?,
                quality_score=?, usage_hint=?, relevance_score=?,
                recognition_source=?, profile_updated_at=?
            WHERE id=?
            """,
            (
                category,
                (profile.get("visual_summary") or "")[:500],
                (profile.get("shot_type") or "")[:80],
                (profile.get("orientation") or "")[:20],
                int(profile.get("quality_score") or 0),
                (profile.get("usage_hint") or "")[:300],
                int(profile.get("relevance_score") or 0),
                (profile.get("recognition_source") or "metadata")[:40],
                int(profile.get("profile_updated_at") or time.time()),
                asset_id,
            ),
        )
        con.commit()
        if cur.rowcount == 0:
            return None
    return get_asset(asset_id)


def list_categories() -> list[dict[str, Any]]:
    """按 D-124 8 个业务大类聚合素材.

    首页必须展示固定 8 类, 即使当前演示源还没素材也返回 0.
    """
    _ensure_schema()
    week_start = int(time.time()) - 7 * 86400
    out = {c["key"]: {**c, "total": 0, "usable": 0, "week_new": 0, "profiled": 0,
                      "latest_imported_at": None, "avg_quality": 0, "avg_relevance": 0}
           for c in MATERIAL_CATEGORIES}
    with closing(get_connection()) as con:
        rows = con.execute(
            """
            SELECT COALESCE(category, ?) AS cat,
                   COUNT(*) AS total,
                   SUM(CASE WHEN COALESCE(quality_score, 0) >= 60 THEN 1 ELSE 0 END) AS usable,
                   SUM(CASE WHEN imported_at >= ? THEN 1 ELSE 0 END) AS week_new,
                   SUM(CASE WHEN profile_updated_at IS NOT NULL THEN 1 ELSE 0 END) AS profiled,
                   MAX(imported_at) AS latest_imported_at,
                   AVG(COALESCE(quality_score, 0)) AS avg_quality,
                   AVG(COALESCE(relevance_score, 0)) AS avg_relevance
            FROM material_assets
            GROUP BY cat
            """,
            (DEFAULT_CATEGORY, week_start),
        ).fetchall()
    for r in rows:
        cat = r[0] if r[0] in VALID_CATEGORIES else DEFAULT_CATEGORY
        item = out[cat]
        item["total"] += int(r[1] or 0)
        item["usable"] += int(r[2] or 0)
        item["week_new"] += int(r[3] or 0)
        item["profiled"] += int(r[4] or 0)
        item["latest_imported_at"] = max(
            item["latest_imported_at"] or 0,
            int(r[5] or 0),
        ) or None
        item["avg_quality"] = round(float(r[6] or 0), 1)
        item["avg_relevance"] = round(float(r[7] or 0), 1)
    return [out[c["key"]] for c in MATERIAL_CATEGORIES]


def _tokenize_match_text(text: str) -> list[str]:
    raw = (text or "").lower()
    tokens = [t for t in re.split(r"[\s,，。/|;；:：、()（）【】\\-]+", raw) if t]
    for c in MATERIAL_CATEGORIES:
        for kw in c["keywords"]:
            if kw.lower() in raw and kw not in tokens:
                tokens.append(kw.lower())
    return tokens[:40]


def match_assets(
    text: str,
    *,
    category: str | None = None,
    orientation: str | None = None,
    asset_type: str | None = None,
    limit: int = 12,
) -> list[dict[str, Any]]:
    """按文案/镜头描述检索本地素材候选, 给剪辑链路优先找真实画面."""
    _ensure_schema()
    q = (text or "").strip()
    if not q:
        return []
    tokens = _tokenize_match_text(q)
    items = list_assets(category=category, limit=500, sort="quality")
    kind_filter = (asset_type or "").strip()
    orientation_filter = (orientation or "").strip()

    scored: list[dict[str, Any]] = []
    for a in items:
        if kind_filter:
            want_video = kind_filter in ("视频", "video", "空镜")
            want_image = kind_filter in ("图片", "image", "photo")
            if want_video and a.get("ext") not in VIDEO_EXTS:
                continue
            if want_image and a.get("ext") not in IMAGE_EXTS:
                continue
        if orientation_filter and orientation_filter not in ("不限", "任意"):
            if (a.get("orientation") or "") != orientation_filter:
                continue

        fields = " ".join([
            str(a.get("filename") or ""),
            str(a.get("rel_folder") or ""),
            str(a.get("category") or ""),
            str(a.get("visual_summary") or ""),
            str(a.get("shot_type") or ""),
            str(a.get("usage_hint") or ""),
            " ".join(t.get("name", "") for t in (a.get("tags") or [])),
        ]).lower()
        hits: list[str] = []
        score = 0.0
        for tok in tokens:
            if tok and tok in fields:
                hits.append(tok)
                score += 12
        cat = str(a.get("category") or "")
        if cat and any(tok in cat.lower() for tok in tokens):
            score += 18
        if a.get("thumb_path"):
            score += 6
        score += float(a.get("quality_score") or 0) * 0.23
        score += float(a.get("relevance_score") or 0) * 0.20
        if not a.get("profile_updated_at"):
            score -= 10
        if not a.get("thumb_path"):
            score -= 8
        score = max(0, min(100, round(score, 1)))
        if score <= 0 and not hits:
            continue
        reason_bits = []
        if hits:
            reason_bits.append(f"命中 {'、'.join(hits[:4])}")
        if a.get("usage_hint"):
            reason_bits.append(a["usage_hint"])
        reason_bits.append(f"质量 {a.get('quality_score', 0)}")
        candidate = dict(a)
        candidate["match_score"] = score
        candidate["match_reason"] = "；".join(reason_bits)
        candidate["auto_usable"] = bool(a.get("thumb_path")) and int(a.get("quality_score") or 0) >= 50 and bool(a.get("profile_updated_at"))
        scored.append(candidate)

    scored.sort(key=lambda x: (x["match_score"], x.get("quality_score") or 0, x.get("imported_at") or 0), reverse=True)
    return scored[:max(1, min(limit, 50))]


def list_top_folders(limit: int = 12) -> list[dict[str, Any]]:
    """L1 大屏 8 张文件夹大卡片. 按一级目录聚合 count + week_new."""
    _ensure_schema()
    week_start = int(time.time()) - 7 * 86400
    with closing(get_connection()) as con:
        rows = con.execute(
            """
            SELECT
                CASE
                    WHEN rel_folder = '.' OR rel_folder IS NULL OR rel_folder = '' THEN '_根目录'
                    WHEN instr(rel_folder, '/') > 0 THEN substr(rel_folder, 1, instr(rel_folder, '/') - 1)
                    ELSE rel_folder
                END AS top_folder,
                COUNT(*) AS total,
                SUM(CASE WHEN imported_at >= ? THEN 1 ELSE 0 END) AS week_new
            FROM material_assets
            GROUP BY top_folder
            ORDER BY total DESC
            LIMIT ?
            """,
            (week_start, limit),
        ).fetchall()
    return [{"folder": r[0], "total": r[1], "week_new": r[2] or 0} for r in rows]


def list_subfolders(top_folder: str, limit: int = 32) -> list[dict[str, Any]]:
    """L2 用: 取一级目录下的二级子目录列表 + count.

    top_folder 是一级目录名 (不含尾 /), 比如 "00 讲台高光" 或 "_根目录".
    返回的 folder 是相对路径 (e.g. "00 讲台高光/提问"), 直接给 list_assets(folder=...) 用.
    """
    _ensure_schema()
    if top_folder == "_根目录":
        # 根目录直接文件
        with closing(get_connection()) as con:
            cnt = con.execute(
                "SELECT COUNT(*) FROM material_assets WHERE rel_folder='.' OR rel_folder=''"
            ).fetchone()[0]
        return [{"folder": ".", "total": cnt}] if cnt else []
    pat_under = f"{top_folder}/%"
    with closing(get_connection()) as con:
        rows = con.execute(
            """
            SELECT
                CASE
                    WHEN instr(substr(rel_folder, ?), '/') > 0
                    THEN substr(rel_folder, 1, ? - 1 + instr(substr(rel_folder, ?), '/') - 1)
                    ELSE rel_folder
                END AS sub_path,
                COUNT(*) AS total
            FROM material_assets
            WHERE rel_folder = ? OR rel_folder LIKE ?
            GROUP BY sub_path
            ORDER BY total DESC
            LIMIT ?
            """,
            (
                len(top_folder) + 2, len(top_folder) + 2, len(top_folder) + 2,
                top_folder, pat_under, limit,
            ),
        ).fetchall()
    return [{"folder": r[0], "total": r[1]} for r in rows]


def list_assets(
    folder: str | None = None,
    category: str | None = None,
    limit: int = 100,
    offset: int = 0,
    tag_ids: list[int] | None = None,
    sort: str = "imported",
) -> list[dict[str, Any]]:
    """L3 用: 按文件夹或业务大类列素材."""
    _ensure_schema()
    where: list[str] = []
    args: list[Any] = []
    if folder:
        where.append("(rel_folder = ? OR rel_folder LIKE ?)")
        args.extend([folder, f"{folder}/%"])
    if category:
        cat = category if category in VALID_CATEGORIES else DEFAULT_CATEGORY
        where.append("COALESCE(category, ?) = ?")
        args.extend([DEFAULT_CATEGORY, cat])
    if tag_ids:
        ph = ",".join(["?"] * len(tag_ids))
        where.append(
            f"id IN (SELECT asset_id FROM material_asset_tags WHERE tag_id IN ({ph}))"
        )
        args.extend(tag_ids)
    where_sql = ("WHERE " + " AND ".join(where)) if where else ""
    order_sql = {
        "imported": "imported_at DESC",
        "name": "filename ASC",
        "hits": (
            "(SELECT COUNT(*) FROM material_usage_log "
            "WHERE asset_id = material_assets.id) DESC, imported_at DESC"
        ),
        "quality": "COALESCE(quality_score, 0) DESC, imported_at DESC",
    }.get(sort, "imported_at DESC")
    args.extend([limit, offset])
    out: list[dict[str, Any]] = []
    with closing(get_connection()) as con:
        con.row_factory = sqlite3.Row
        rows = con.execute(
            f"SELECT * FROM material_assets {where_sql} ORDER BY {order_sql} LIMIT ? OFFSET ?",
            tuple(args),
        ).fetchall()
        for r in rows:
            d = dict(r)
            d = _with_profile_defaults(d)
            tag_rows = con.execute(
                """SELECT t.id, t.name, t.source, at.confidence FROM material_tags t
                   JOIN material_asset_tags at ON at.tag_id = t.id
                   WHERE at.asset_id = ?""",
                (d["id"],),
            ).fetchall()
            d["tags"] = [{"id": t[0], "name": t[1], "source": t[2], "confidence": t[3]} for t in tag_rows]
            d["hits"] = con.execute(
                "SELECT COUNT(*) FROM material_usage_log WHERE asset_id = ?",
                (d["id"],),
            ).fetchone()[0]
            out.append(d)
    return out


def get_asset(asset_id: str) -> dict[str, Any] | None:
    """L4 大预览用. 含 tags + usage 列表."""
    _ensure_schema()
    with closing(get_connection()) as con:
        con.row_factory = sqlite3.Row
        r = con.execute(
            "SELECT * FROM material_assets WHERE id=?", (asset_id,)
        ).fetchone()
        if not r:
            return None
        d = dict(r)
        d = _with_profile_defaults(d)
        tag_rows = con.execute(
            """SELECT t.id, t.name, t.source, at.confidence FROM material_tags t
               JOIN material_asset_tags at ON at.tag_id = t.id
               WHERE at.asset_id = ?""",
            (asset_id,),
        ).fetchall()
        d["tags"] = [{"id": t[0], "name": t[1], "source": t[2], "confidence": t[3]} for t in tag_rows]
        usage = con.execute(
            "SELECT used_in, used_at, position_sec FROM material_usage_log "
            "WHERE asset_id = ? ORDER BY used_at DESC LIMIT 10",
            (asset_id,),
        ).fetchall()
        d["usage"] = [
            {"used_in": u[0], "used_at": u[1], "position_sec": u[2]} for u in usage
        ]
        d["hits"] = len(d["usage"])
    return d


def thumb_abs_path(asset_id: str) -> Path | None:
    p = THUMB_DIR / f"{asset_id}.jpg"
    return p if p.exists() else None


# ─── L1 右栏: 最近活动 + Top 5 ─────────────────────────────


def list_recent_activity(limit: int = 10) -> list[dict[str, Any]]:
    """L1 右栏 📈 最近活动 timeline. 混合事件流:
    - 按天聚合 imported_at: "今天 同步 N 个素材"
    - usage_log: "X 时刻 用了 Y 做 Z"
    - pending_moves status='approved': "审核 N 条"

    返回 [{when, kind, text, ts}, ...] 按 ts desc.
    """
    _ensure_schema()
    now = int(time.time())
    today_start = int(time.mktime(time.strptime(time.strftime("%Y-%m-%d"), "%Y-%m-%d")))
    yesterday_start = today_start - 86400
    events: list[dict[str, Any]] = []
    with closing(get_connection()) as con:
        # 入库事件 (按天聚合最近 7 天)
        rows = con.execute(
            """SELECT
                CASE
                    WHEN imported_at >= ? THEN 'today'
                    WHEN imported_at >= ? THEN 'yesterday'
                    ELSE strftime('%m-%d', imported_at, 'unixepoch')
                END AS day_label,
                MAX(imported_at) AS max_ts,
                COUNT(*) AS n
            FROM material_assets
            WHERE imported_at >= ?
            GROUP BY day_label
            ORDER BY max_ts DESC""",
            (today_start, yesterday_start, now - 7 * 86400),
        ).fetchall()
        for r in rows:
            label = "今天" if r[0] == "today" else "昨天" if r[0] == "yesterday" else r[0]
            events.append({
                "when": label,
                "kind": "import",
                "text": f"同步 {r[2]} 个素材",
                "ts": r[1],
            })
        # 使用事件 (最近)
        urows = con.execute(
            """SELECT used_at, used_in, COUNT(*) AS n
               FROM material_usage_log
               WHERE used_at >= ?
               GROUP BY used_in, strftime('%Y-%m-%d %H', used_at, 'unixepoch')
               ORDER BY used_at DESC LIMIT ?""",
            (now - 7 * 86400, limit),
        ).fetchall()
        for r in urows:
            ts = r[0]
            label = (
                f"今天 {time.strftime('%H:%M', time.localtime(ts))}" if ts >= today_start
                else f"昨天 {time.strftime('%H:%M', time.localtime(ts))}" if ts >= yesterday_start
                else time.strftime("%m-%d", time.localtime(ts))
            )
            target = (r[1] or "").strip() or "未命名"
            events.append({
                "when": label,
                "kind": "usage",
                "text": f"用了 {r[2]} 个做《{target[:20]}》",
                "ts": ts,
            })
        # 审核事件
        prows = con.execute(
            """SELECT created_at, COUNT(*) AS n FROM material_pending_moves
               WHERE status='approved' AND created_at >= ?
               GROUP BY date(created_at, 'unixepoch')
               ORDER BY created_at DESC LIMIT 3""",
            (now - 7 * 86400,),
        ).fetchall()
        for r in prows:
            ts = r[0]
            label = (
                "今天" if ts >= today_start
                else "昨天" if ts >= yesterday_start
                else time.strftime("%m-%d", time.localtime(ts))
            )
            events.append({
                "when": label,
                "kind": "approve",
                "text": f"审核了 {r[1]} 条",
                "ts": ts,
            })
    events.sort(key=lambda e: e["ts"], reverse=True)
    return events[:limit]


def search_assets(query: str, limit: int = 30) -> list[dict[str, Any]]:
    """全库搜索: 模糊匹配 filename / rel_folder / tag / 结构化画像字段.

    返回与 list_assets 相同结构 (含 tags + hits).
    query 空 / 全空白 → 返 [].
    LIKE 用 %query% 双侧通配, 大小写不敏感 (SQLite COLLATE NOCASE).

    匹配优先级 (SQL ORDER):
    1. filename 命中 (高分)
    2. tag name 命中 (中分, 不重复)
    3. rel_folder 命中 (低分)
    """
    _ensure_schema()
    q = (query or "").strip()
    if not q:
        return []
    pat = f"%{q}%"
    seen: set[str] = set()
    out: list[dict[str, Any]] = []
    with closing(get_connection()) as con:
        con.row_factory = sqlite3.Row
        # filename 命中 (优先)
        rows = con.execute(
            "SELECT * FROM material_assets WHERE filename LIKE ? COLLATE NOCASE "
            "ORDER BY imported_at DESC LIMIT ?",
            (pat, limit),
        ).fetchall()
        for r in rows:
            d = dict(r)
            seen.add(d["id"])
            out.append(d)
        # tag name 命中 (补)
        if len(out) < limit:
            tag_rows = con.execute(
                """SELECT a.* FROM material_assets a
                   JOIN material_asset_tags at ON at.asset_id = a.id
                   JOIN material_tags t ON t.id = at.tag_id
                   WHERE t.name LIKE ? COLLATE NOCASE
                   ORDER BY a.imported_at DESC LIMIT ?""",
                (pat, limit),
            ).fetchall()
            for r in tag_rows:
                if r["id"] in seen:
                    continue
                seen.add(r["id"])
                out.append(dict(r))
                if len(out) >= limit:
                    break
        # 结构化画像 + rel_folder 命中 (兜底)
        if len(out) < limit:
            folder_rows = con.execute(
                """
                SELECT * FROM material_assets
                WHERE rel_folder LIKE ? COLLATE NOCASE
                   OR category LIKE ? COLLATE NOCASE
                   OR visual_summary LIKE ? COLLATE NOCASE
                   OR shot_type LIKE ? COLLATE NOCASE
                   OR usage_hint LIKE ? COLLATE NOCASE
                """
                "ORDER BY imported_at DESC LIMIT ?",
                (pat, pat, pat, pat, pat, limit),
            ).fetchall()
            for r in folder_rows:
                if r["id"] in seen:
                    continue
                seen.add(r["id"])
                out.append(dict(r))
                if len(out) >= limit:
                    break
        # 给每条加 tags + hits
        for d in out[:limit]:
            d = _with_profile_defaults(d)
            tag_rows = con.execute(
                """SELECT t.id, t.name, t.source, at.confidence FROM material_tags t
                   JOIN material_asset_tags at ON at.tag_id = t.id
                   WHERE at.asset_id = ?""",
                (d["id"],),
            ).fetchall()
            d["tags"] = [{"id": t[0], "name": t[1], "source": t[2], "confidence": t[3]} for t in tag_rows]
            d["hits"] = con.execute(
                "SELECT COUNT(*) FROM material_usage_log WHERE asset_id = ?",
                (d["id"],),
            ).fetchone()[0]
    return out[:limit]


def list_top_used(limit: int = 5) -> list[dict[str, Any]]:
    """L1 右栏最常用素材. 返回可直接复用的素材卡字段."""
    _ensure_schema()
    out: list[dict[str, Any]] = []
    with closing(get_connection()) as con:
        con.row_factory = sqlite3.Row
        rows = con.execute(
            """SELECT a.*, COUNT(u.id) AS hits
               FROM material_assets a
               JOIN material_usage_log u ON u.asset_id = a.id
               GROUP BY a.id
               ORDER BY hits DESC
               LIMIT ?""",
            (limit,),
        ).fetchall()
        for r in rows:
            d = _with_profile_defaults(dict(r))
            tag_rows = con.execute(
                """SELECT t.id, t.name, t.source, at.confidence FROM material_tags t
                   JOIN material_asset_tags at ON at.tag_id = t.id
                   WHERE at.asset_id = ?""",
                (d["id"],),
            ).fetchall()
            d["tags"] = [{"id": t[0], "name": t[1], "source": t[2], "confidence": t[3]} for t in tag_rows]
            out.append(d)
    return out


def log_usage(asset_id: str, used_in: str, position_sec: float | None = None) -> None:
    """记录素材被用. PRD §3.5 "做视频" 对接接口."""
    _ensure_schema()
    with closing(get_connection()) as con:
        con.execute(
            "INSERT INTO material_usage_log (asset_id, used_in, used_at, position_sec) "
            "VALUES (?, ?, ?, ?)",
            (asset_id, (used_in or "")[:200], int(time.time()), position_sec),
        )
        con.commit()


# ─── 待整理工作流 (C, PRD §3.3) ──────────────────────────


def list_pending_review(limit: int = 100, *, include_legacy: bool = False) -> list[dict[str, Any]]:
    """列待审核素材 (AI 建议归档不同文件夹). 含 suggested_folder + reason + tags + confidence.

    B'-3: 默认只返新一代建议 (suggestion_version >= 2 且 status='pending').
    旧 1616 条 status='stale' 不打扰. include_legacy=True 才包括旧的.
    """
    _ensure_schema()
    out: list[dict[str, Any]] = []
    if include_legacy:
        where = "p.status IN ('pending', 'stale')"
    else:
        where = "p.status = 'pending' AND COALESCE(p.suggestion_version, 1) >= 2"
    with closing(get_connection()) as con:
        con.row_factory = sqlite3.Row
        rows = con.execute(
            f"""SELECT a.*, p.suggested_folder, p.is_new_folder, p.reason,
                       p.confidence, p.suggestion_version, p.status AS pending_status
               FROM material_assets a
               JOIN material_pending_moves p ON p.asset_id = a.id
               WHERE {where}
               ORDER BY a.imported_at DESC
               LIMIT ?""",
            (limit,),
        ).fetchall()
        for r in rows:
            d = dict(r)
            d = _with_profile_defaults(d)
            tag_rows = con.execute(
                """SELECT t.id, t.name, t.source, at.confidence FROM material_tags t
                   JOIN material_asset_tags at ON at.tag_id = t.id
                   WHERE at.asset_id = ?""",
                (d["id"],),
            ).fetchall()
            d["tags"] = [{"id": t[0], "name": t[1], "source": t[2], "confidence": t[3]} for t in tag_rows]
            out.append(d)
    return out


def approve_pending(asset_id: str) -> dict[str, Any]:
    """通过 AI 建议: 更新 material_assets.rel_folder + 标 status='approved'.

    虚拟归档 (不真 mv 文件), 真 mv 等老板切到 ~/Desktop/清华哥素材库/ 再做.
    """
    _ensure_schema()
    with closing(get_connection()) as con:
        row = con.execute(
            "SELECT suggested_folder FROM material_pending_moves "
            "WHERE asset_id=? AND status='pending'",
            (asset_id,),
        ).fetchone()
        if not row:
            return {"ok": False, "error": "no pending move"}
        target = row[0]
        con.execute(
            "UPDATE material_assets SET rel_folder=? WHERE id=?",
            (target, asset_id),
        )
        con.execute(
            "UPDATE material_pending_moves SET status='approved' WHERE asset_id=?",
            (asset_id,),
        )
        con.commit()
    return {"ok": True, "asset_id": asset_id, "new_folder": target}


def reject_pending(asset_id: str) -> dict[str, Any]:
    """跳过 AI 建议: 标 status='rejected'. 素材保持原位置."""
    _ensure_schema()
    with closing(get_connection()) as con:
        cur = con.execute(
            "UPDATE material_pending_moves SET status='rejected' "
            "WHERE asset_id=? AND status='pending'",
            (asset_id,),
        )
        con.commit()
        if cur.rowcount == 0:
            return {"ok": False, "error": "no pending move"}
    return {"ok": True, "asset_id": asset_id}
