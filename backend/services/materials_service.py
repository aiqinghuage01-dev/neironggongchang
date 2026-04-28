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


# ─── sha1 + thumbnail ────────────────────────────────────

def _asset_id(abs_path: str, mtime: float) -> str:
    """sha1(abs_path + mtime) 截 16 位作 ID. 文件改了 mtime 会变 → 新 row."""
    h = hashlib.sha1(f"{abs_path}|{int(mtime)}".encode("utf-8")).hexdigest()
    return h[:16]


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
    """单文件 upsert. 返回 (asset_id, is_new). 已存在 (sha1 命中) → 跳过 probe + thumb."""
    p = Path(abs_path)
    try:
        st = p.stat()
    except OSError:
        return ("", False)
    aid = _asset_id(abs_path, st.st_mtime)
    cur = con.execute("SELECT id FROM material_assets WHERE id=?", (aid,)).fetchone()
    if cur:
        return (aid, False)
    ext = p.suffix.lower()
    try:
        rel_folder = str(p.parent.relative_to(root)) if p.parent != root else "."
    except ValueError:
        rel_folder = "."
    info = _probe_video(abs_path) if ext in VIDEO_EXTS else _probe_image(abs_path)
    thumb = _make_thumb(abs_path, aid)
    now = int(time.time())
    con.execute(
        "INSERT OR IGNORE INTO material_assets "
        "(id, abs_path, filename, ext, rel_folder, size_bytes, width, height, "
        " duration_sec, file_ctime, imported_at, thumb_path, status, is_pending_review, user_id) "
        "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        (
            aid, abs_path, p.name, ext, rel_folder,
            st.st_size, info.get("width"), info.get("height"),
            info.get("duration_sec"), int(st.st_ctime), now, thumb,
            "sorted", 0, "qinghua",
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
    files = list(_walk_root(root))
    if max_files:
        files = files[:max_files]
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
            "SELECT COUNT(*) FROM material_pending_moves WHERE status='pending'"
        ).fetchone()[0]
        ai_tagged = con.execute(
            "SELECT COUNT(DISTINCT asset_id) FROM material_asset_tags"
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
        "usage_this_month": usage_month,
        "hit_rate": round(usage_month / max(1, total) * 100, 1) if total else 0,
        "week_added": week_added,
        "root": str(get_materials_root()),
    }


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
    limit: int = 100,
    offset: int = 0,
    tag_ids: list[int] | None = None,
    sort: str = "imported",
) -> list[dict[str, Any]]:
    """L3 用: 按文件夹列素材."""
    _ensure_schema()
    where: list[str] = []
    args: list[Any] = []
    if folder:
        where.append("(rel_folder = ? OR rel_folder LIKE ?)")
        args.extend([folder, f"{folder}/%"])
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
            tag_rows = con.execute(
                """SELECT t.id, t.name, t.source FROM material_tags t
                   JOIN material_asset_tags at ON at.tag_id = t.id
                   WHERE at.asset_id = ?""",
                (d["id"],),
            ).fetchall()
            d["tags"] = [{"id": t[0], "name": t[1], "source": t[2]} for t in tag_rows]
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
        tag_rows = con.execute(
            """SELECT t.id, t.name, t.source FROM material_tags t
               JOIN material_asset_tags at ON at.tag_id = t.id
               WHERE at.asset_id = ?""",
            (asset_id,),
        ).fetchall()
        d["tags"] = [{"id": t[0], "name": t[1], "source": t[2]} for t in tag_rows]
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
    """全库搜索: 模糊匹配 filename / rel_folder / tag name (D-087 整改 follow-up).

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
        # rel_folder 命中 (兜底)
        if len(out) < limit:
            folder_rows = con.execute(
                "SELECT * FROM material_assets WHERE rel_folder LIKE ? COLLATE NOCASE "
                "ORDER BY imported_at DESC LIMIT ?",
                (pat, limit),
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
            tag_rows = con.execute(
                """SELECT t.id, t.name, t.source FROM material_tags t
                   JOIN material_asset_tags at ON at.tag_id = t.id
                   WHERE at.asset_id = ?""",
                (d["id"],),
            ).fetchall()
            d["tags"] = [{"id": t[0], "name": t[1], "source": t[2]} for t in tag_rows]
            d["hits"] = con.execute(
                "SELECT COUNT(*) FROM material_usage_log WHERE asset_id = ?",
                (d["id"],),
            ).fetchone()[0]
    return out[:limit]


def list_top_used(limit: int = 5) -> list[dict[str, Any]]:
    """L1 右栏 🏆 最常用 Top 5. SQL JOIN hits DESC."""
    _ensure_schema()
    with closing(get_connection()) as con:
        con.row_factory = sqlite3.Row
        rows = con.execute(
            """SELECT a.id, a.filename, a.thumb_path, a.rel_folder,
                      COUNT(u.id) AS hits
               FROM material_assets a
               JOIN material_usage_log u ON u.asset_id = a.id
               GROUP BY a.id
               ORDER BY hits DESC
               LIMIT ?""",
            (limit,),
        ).fetchall()
    return [
        {
            "id": r["id"],
            "filename": r["filename"],
            "thumb_path": r["thumb_path"],
            "rel_folder": r["rel_folder"],
            "hits": r["hits"],
        }
        for r in rows
    ]


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


def list_pending_review(limit: int = 100) -> list[dict[str, Any]]:
    """列待审核素材 (AI 建议归档不同文件夹). 含 suggested_folder + reason + tags."""
    _ensure_schema()
    out: list[dict[str, Any]] = []
    with closing(get_connection()) as con:
        con.row_factory = sqlite3.Row
        rows = con.execute(
            """SELECT a.*, p.suggested_folder, p.is_new_folder, p.reason
               FROM material_assets a
               JOIN material_pending_moves p ON p.asset_id = a.id
               WHERE p.status = 'pending'
               ORDER BY a.imported_at DESC
               LIMIT ?""",
            (limit,),
        ).fetchall()
        for r in rows:
            d = dict(r)
            tag_rows = con.execute(
                """SELECT t.id, t.name, t.source FROM material_tags t
                   JOIN material_asset_tags at ON at.tag_id = t.id
                   WHERE at.asset_id = ?""",
                (d["id"],),
            ).fetchall()
            d["tags"] = [{"id": t[0], "name": t[1], "source": t[2]} for t in tag_rows]
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
