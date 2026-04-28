"""作品库 - SQLite 持久化每一条生成记录。"""
from __future__ import annotations

import sqlite3
import time
from contextlib import closing
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from shortvideo.db import get_connection
# D-084: SCHEMA / _migrate_works 已迁出到 backend/services/migrations.py.
# 不在顶层 import backend (shortvideo 包内代码顶层不跨包到 backend, 见 SYSTEM-CONSTRAINTS).
# init_db() 函数内 lazy import apply_migrations.


@dataclass
class Material:
    id: int | None
    created_at: int
    url: str | None
    title: str | None
    author: str | None
    duration_sec: float | None
    original_text: str
    source: str | None


def insert_material(
    *,
    original_text: str,
    url: str | None = None,
    title: str | None = None,
    author: str | None = None,
    duration_sec: float | None = None,
    source: str | None = "qingdou",
) -> int:
    init_db()
    with closing(_conn()) as c:
        # 去重:同 url+title 已存在就不重复插
        if url:
            exist = c.execute(
                "SELECT id FROM materials WHERE url=? AND IFNULL(title,'')=IFNULL(?,'') LIMIT 1",
                (url, title),
            ).fetchone()
            if exist:
                return exist["id"]
        cur = c.execute(
            """INSERT INTO materials
               (created_at, url, title, author, duration_sec, original_text, source)
               VALUES (?,?,?,?,?,?,?)""",
            (int(time.time()), url, title, author, duration_sec, original_text, source),
        )
        c.commit()
        return cur.lastrowid


def list_materials(limit: int = 100) -> list[Material]:
    init_db()
    with closing(_conn()) as c:
        rows = c.execute(
            "SELECT * FROM materials ORDER BY created_at DESC LIMIT ?", (limit,)
        ).fetchall()
        return [
            Material(
                id=r["id"], created_at=r["created_at"],
                url=r["url"], title=r["title"], author=r["author"],
                duration_sec=r["duration_sec"],
                original_text=r["original_text"], source=r["source"],
            ) for r in rows
        ]


def delete_material(material_id: int) -> None:
    with closing(_conn()) as c:
        c.execute("DELETE FROM materials WHERE id=?", (material_id,))
        c.commit()


@dataclass
class Work:
    id: int | None
    created_at: int
    title: str | None
    source_url: str | None
    original_text: str | None
    final_text: str
    avatar_id: int | None
    speaker_id: int | None
    shiliu_video_id: int | None
    local_path: str | None
    duration_sec: float | None
    status: str  # pending / generating / ready / failed / published
    error: str | None
    tokens_used: int = 0
    # D-065: 统一资产库扩展
    type: str = "video"  # text / image / video / audio
    source_skill: str | None = None  # image-gen / wechat-cover / baokuan / ...
    thumb_path: str | None = None  # 缩略图路径(图片直接用原文件)
    metadata: str | None = None  # JSON 字符串, type-specific 字段


def _conn() -> sqlite3.Connection:
    """works CRUD 专用. **必须 row_factory=Row** — _row_to_work 用 row["id"] 字典访问.
    D-084: 内部走 shortvideo.db.get_connection (单一连接抽象点)."""
    conn = get_connection()
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    """D-084: schema 集中化. **lazy import** 避免 shortvideo 包顶层依赖 backend."""
    from backend.services.migrations import apply_migrations
    apply_migrations()


def _row_to_work(row: sqlite3.Row) -> Work:
    keys = row.keys()
    return Work(
        id=row["id"],
        created_at=row["created_at"],
        title=row["title"],
        source_url=row["source_url"],
        original_text=row["original_text"],
        final_text=row["final_text"],
        avatar_id=row["avatar_id"],
        speaker_id=row["speaker_id"],
        shiliu_video_id=row["shiliu_video_id"],
        local_path=row["local_path"],
        duration_sec=row["duration_sec"],
        status=row["status"],
        error=row["error"],
        tokens_used=row["tokens_used"] or 0,
        type=(row["type"] if "type" in keys else None) or "video",
        source_skill=row["source_skill"] if "source_skill" in keys else None,
        thumb_path=row["thumb_path"] if "thumb_path" in keys else None,
        metadata=row["metadata"] if "metadata" in keys else None,
    )


def insert_work(
    *,
    final_text: str = "",
    title: str | None = None,
    source_url: str | None = None,
    original_text: str | None = None,
    avatar_id: int | None = None,
    speaker_id: int | None = None,
    status: str = "pending",
    type: str = "video",
    source_skill: str | None = None,
    thumb_path: str | None = None,
    metadata: str | None = None,
    local_path: str | None = None,
    created_at: int | None = None,
    tokens_used: int = 0,
) -> int:
    """插入一条产物记录.

    D-065: 支持三类(text/image/video). 默认 type='video' 保持旧行为.
    final_text 默认空串(图/视频可不传, schema NOT NULL 兜底).
    D-093: tokens_used 参数加了 — schema 一直有这列 + dataclass 也读这列, 但函数签名漏
    暴露, 调用方传 tokens_used=N 会抛 TypeError 被上游 except 静默吞 → 13 条文字 task
    完成 0 条入库. 现在合法.
    """
    init_db()
    with closing(_conn()) as c:
        cur = c.execute(
            """INSERT INTO works
               (created_at, title, source_url, original_text, final_text,
                avatar_id, speaker_id, status, type, source_skill,
                thumb_path, metadata, local_path, tokens_used)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (
                created_at if created_at is not None else int(time.time()),
                title, source_url, original_text, final_text,
                avatar_id, speaker_id, status, type, source_skill,
                thumb_path, metadata, local_path, tokens_used,
            ),
        )
        c.commit()
        return cur.lastrowid


def update_work(work_id: int, **fields: Any) -> None:
    if not fields:
        return
    cols = ", ".join(f"{k}=?" for k in fields)
    values = list(fields.values()) + [work_id]
    with closing(_conn()) as c:
        c.execute(f"UPDATE works SET {cols} WHERE id=?", values)
        c.commit()


def get_work(work_id: int) -> Work | None:
    with closing(_conn()) as c:
        r = c.execute("SELECT * FROM works WHERE id=?", (work_id,)).fetchone()
        return _row_to_work(r) if r else None


def list_works(
    limit: int = 100,
    *,
    type: str | None = None,
    source_skill: str | None = None,
    since_ts: int | None = None,
) -> list[Work]:
    """D-065: 加 type / source_skill / since_ts 过滤."""
    init_db()
    where: list[str] = []
    params: list[Any] = []
    if type:
        where.append("type = ?")
        params.append(type)
    if source_skill:
        where.append("source_skill = ?")
        params.append(source_skill)
    if since_ts is not None:
        where.append("created_at >= ?")
        params.append(since_ts)
    sql = "SELECT * FROM works"
    if where:
        sql += " WHERE " + " AND ".join(where)
    sql += " ORDER BY created_at DESC LIMIT ?"
    params.append(limit)
    with closing(_conn()) as c:
        rows = c.execute(sql, tuple(params)).fetchall()
        return [_row_to_work(r) for r in rows]


def delete_work(work_id: int, *, remove_file: bool = False) -> None:
    w = get_work(work_id)
    if w and remove_file and w.local_path:
        try:
            Path(w.local_path).unlink(missing_ok=True)
        except OSError:
            pass
    with closing(_conn()) as c:
        c.execute("DELETE FROM works WHERE id=?", (work_id,))
        c.commit()


# ─── 热点 ─────────────────────────────────
@dataclass
class HotTopic:
    id: int | None
    created_at: int
    platform: str | None
    title: str
    heat_score: int
    match_persona: int
    match_reason: str | None
    source_url: str | None
    fetched_from: str | None
    status: str


def insert_hot_topic(
    *, title: str, platform: str | None = None, heat_score: int = 0,
    match_persona: bool = False, match_reason: str | None = None,
    source_url: str | None = None, fetched_from: str = "manual",
) -> int:
    init_db()
    with closing(_conn()) as c:
        cur = c.execute(
            """INSERT INTO hot_topics
               (created_at, platform, title, heat_score, match_persona, match_reason, source_url, fetched_from)
               VALUES (?,?,?,?,?,?,?,?)""",
            (int(time.time()), platform, title, heat_score, 1 if match_persona else 0, match_reason, source_url, fetched_from),
        )
        c.commit()
        return cur.lastrowid


def list_hot_topics(limit: int = 50) -> list[HotTopic]:
    init_db()
    with closing(_conn()) as c:
        rows = c.execute("SELECT * FROM hot_topics ORDER BY heat_score DESC, created_at DESC LIMIT ?", (limit,)).fetchall()
        return [HotTopic(
            id=r["id"], created_at=r["created_at"],
            platform=r["platform"], title=r["title"],
            heat_score=r["heat_score"] or 0,
            match_persona=r["match_persona"] or 0,
            match_reason=r["match_reason"],
            source_url=r["source_url"],
            fetched_from=r["fetched_from"],
            status=r["status"] or "unused",
        ) for r in rows]


def delete_hot_topic(topic_id: int) -> None:
    with closing(_conn()) as c:
        c.execute("DELETE FROM hot_topics WHERE id=?", (topic_id,))
        c.commit()


# ─── 选题 ─────────────────────────────────
@dataclass
class Topic:
    id: int | None
    created_at: int
    title: str
    description: str | None
    tags: str | None
    heat_score: int
    source: str
    status: str


def insert_topic(
    *, title: str, description: str | None = None, tags: str | None = None,
    heat_score: int = 0, source: str = "manual",
) -> int:
    init_db()
    with closing(_conn()) as c:
        cur = c.execute(
            """INSERT INTO topics (created_at, title, description, tags, heat_score, source)
               VALUES (?,?,?,?,?,?)""",
            (int(time.time()), title, description, tags, heat_score, source),
        )
        c.commit()
        return cur.lastrowid


def list_topics(limit: int = 100) -> list[Topic]:
    init_db()
    with closing(_conn()) as c:
        rows = c.execute("SELECT * FROM topics ORDER BY created_at DESC LIMIT ?", (limit,)).fetchall()
        return [Topic(
            id=r["id"], created_at=r["created_at"],
            title=r["title"], description=r["description"],
            tags=r["tags"], heat_score=r["heat_score"] or 0,
            source=r["source"], status=r["status"] or "unused",
        ) for r in rows]


def delete_topic(topic_id: int) -> None:
    with closing(_conn()) as c:
        c.execute("DELETE FROM topics WHERE id=?", (topic_id,))
        c.commit()


# ─── 数据指标(各平台数据回收) ────────────────
@dataclass
class Metric:
    id: int | None
    work_id: int
    platform: str           # douyin/shipinhao/xiaohongshu/kuaishou/wechat_article/moments
    views: int
    likes: int
    comments: int
    shares: int
    saves: int
    followers_gained: int
    conversions: int
    completion_rate: float | None
    notes: str | None
    recorded_at: int
    source: str


def upsert_metric(
    *,
    work_id: int,
    platform: str,
    views: int = 0,
    likes: int = 0,
    comments: int = 0,
    shares: int = 0,
    saves: int = 0,
    followers_gained: int = 0,
    conversions: int = 0,
    completion_rate: float | None = None,
    notes: str | None = None,
    source: str = "manual",
) -> int:
    init_db()
    with closing(_conn()) as c:
        c.execute(
            """INSERT INTO metrics
               (work_id, platform, views, likes, comments, shares, saves,
                followers_gained, conversions, completion_rate, notes, recorded_at, source)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
               ON CONFLICT(work_id, platform) DO UPDATE SET
                 views=excluded.views, likes=excluded.likes,
                 comments=excluded.comments, shares=excluded.shares, saves=excluded.saves,
                 followers_gained=excluded.followers_gained, conversions=excluded.conversions,
                 completion_rate=excluded.completion_rate, notes=excluded.notes,
                 recorded_at=excluded.recorded_at, source=excluded.source""",
            (work_id, platform, views, likes, comments, shares, saves,
             followers_gained, conversions, completion_rate, notes, int(time.time()), source),
        )
        c.commit()
        r = c.execute(
            "SELECT id FROM metrics WHERE work_id=? AND platform=?",
            (work_id, platform),
        ).fetchone()
        return r["id"] if r else 0


def list_metrics(work_id: int) -> list[Metric]:
    init_db()
    with closing(_conn()) as c:
        rows = c.execute(
            "SELECT * FROM metrics WHERE work_id=? ORDER BY platform", (work_id,)
        ).fetchall()
        return [_row_to_metric(r) for r in rows]


def list_all_metrics(limit: int = 500) -> list[Metric]:
    init_db()
    with closing(_conn()) as c:
        rows = c.execute(
            "SELECT * FROM metrics ORDER BY recorded_at DESC LIMIT ?", (limit,)
        ).fetchall()
        return [_row_to_metric(r) for r in rows]


def _row_to_metric(r) -> Metric:
    return Metric(
        id=r["id"], work_id=r["work_id"], platform=r["platform"],
        views=r["views"] or 0, likes=r["likes"] or 0,
        comments=r["comments"] or 0, shares=r["shares"] or 0,
        saves=r["saves"] or 0,
        followers_gained=r["followers_gained"] or 0,
        conversions=r["conversions"] or 0,
        completion_rate=r["completion_rate"],
        notes=r["notes"],
        recorded_at=r["recorded_at"], source=r["source"] or "manual",
    )


def delete_metric(metric_id: int) -> None:
    with closing(_conn()) as c:
        c.execute("DELETE FROM metrics WHERE id=?", (metric_id,))
        c.commit()
