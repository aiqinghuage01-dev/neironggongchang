"""作品库 - SQLite 持久化每一条生成记录。"""
from __future__ import annotations

import sqlite3
import time
import html as html_lib
import re
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
    q: str | None = None,
) -> list[Work]:
    """D-065: 加 type / source_skill / since_ts 过滤.

    q 必须进 SQL WHERE, 不能先 LIMIT 再 Python 过滤; 作品超过首屏数量后,
    先限量会导致老作品明明存在却搜不到.
    """
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
    kw = (q or "").strip().lower()
    if kw:
        like = f"%{kw}%"
        where.append(
            "(LOWER(IFNULL(title,'')) LIKE ? "
            "OR LOWER(IFNULL(final_text,'')) LIKE ? "
            "OR LOWER(IFNULL(metadata,'')) LIKE ?)"
        )
        params.extend([like, like, like])
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
    radar_category: str | None = None


HOT_RADAR_MIN_COUNT = 3
HOT_RADAR_DEFAULT_POOL = 15
HOT_RADAR_CATEGORY_GLOBAL = "大新闻"
HOT_RADAR_CATEGORY_INDUSTRY = "行业相关"
HOT_RADAR_CATEGORY_LOCAL = "本地热点"
HOT_RADAR_CATEGORIES = (
    HOT_RADAR_CATEGORY_GLOBAL,
    HOT_RADAR_CATEGORY_INDUSTRY,
    HOT_RADAR_CATEGORY_LOCAL,
)
HOT_RADAR_SOURCE = "hot-topic-radar"
HOT_RADAR_SKILL_SLUG = "热点雷达-学员版"
HOT_RADAR_DEFAULT_CITY = "上海"
HOT_RADAR_INDUSTRY_KEYWORDS = (
    "AI", "人工智能", "机器人", "大模型", "数字", "科技", "芯片", "算力",
    "老板", "企业", "公司", "经营", "管理", "创业", "团队", "员工",
    "教育", "课程", "直播", "短视频", "抖音", "流量", "电商", "营销",
)
HOT_RADAR_LOCAL_KEYWORDS = (
    "上海", "北京", "深圳", "广州", "杭州", "苏州", "南京", "武汉",
    "成都", "重庆", "本地", "景区", "高铁", "机场", "五一",
)
HOT_RADAR_SKIP_KEYWORDS = (
    "政治局", "国防部", "军机", "导弹", "航母", "伊朗", "军事", "军演",
    "克宫", "普京", "访华",
)


@dataclass
class _RadarRawTopic:
    platform: str
    title: str
    heat_label: str
    rank: int
    source_url: str | None


_HOT_RADAR_CACHE: tuple[float, list[_RadarRawTopic]] | None = None
_TOPHUB_NODE_FALLBACKS = {
    "百度": "/n/Jb0vmloB1G",
    "微博": "/n/KqndgxeLl9",
    "抖音": "/n/DpQvNABoNE",
    "知乎": "/n/mproPpoq6O",
}
_TOPHUB_NODE_HINTS = {
    "百度": ("百度", "实时热点"),
    "微博": ("微博", "热搜榜"),
    "抖音": ("抖音", "总榜"),
    "知乎": ("知乎", "热榜"),
}
HOT_RADAR_FALLBACK_TOPICS: list[dict[str, Any]] = [
    {"radar_category": HOT_RADAR_CATEGORY_GLOBAL, "platform": "百度", "title": "五一假期各大景点客流升温", "heat_score": 96, "match_reason": "全网关注度高, 适合先借公共情绪开场"},
    {"radar_category": HOT_RADAR_CATEGORY_INDUSTRY, "platform": "知乎", "title": "AI 工具进入企业日常办公", "heat_score": 93, "match_reason": "可讲老板如何把 AI 变成真实经营动作"},
    {"radar_category": HOT_RADAR_CATEGORY_LOCAL, "platform": "本地", "title": f"{HOT_RADAR_DEFAULT_CITY}五一消费和出行升温", "heat_score": 90, "match_reason": "适合结合本地老板、线下门店和出差素材"},
    {"radar_category": HOT_RADAR_CATEGORY_GLOBAL, "platform": "微博", "title": "公共事件引发网友热议", "heat_score": 88, "match_reason": "大新闻适合拆情绪、冲突和大众共识"},
    {"radar_category": HOT_RADAR_CATEGORY_INDUSTRY, "platform": "抖音", "title": "短视频平台内容治理升级", "heat_score": 86, "match_reason": "可讲老板做内容时如何避坑和提效"},
    {"radar_category": HOT_RADAR_CATEGORY_LOCAL, "platform": "本地", "title": f"{HOT_RADAR_DEFAULT_CITY}线下活动与商圈人流增加", "heat_score": 84, "match_reason": "适合接本地获客、上课和客户现场画面"},
    {"radar_category": HOT_RADAR_CATEGORY_GLOBAL, "platform": "百度", "title": "社会民生话题登上热搜", "heat_score": 82, "match_reason": "适合从普通人的真实感受切入"},
    {"radar_category": HOT_RADAR_CATEGORY_INDUSTRY, "platform": "微博", "title": "企业开始重算 AI 投入产出", "heat_score": 80, "match_reason": "适合讲老板视角下的效率账和投入账"},
    {"radar_category": HOT_RADAR_CATEGORY_LOCAL, "platform": "本地", "title": f"{HOT_RADAR_DEFAULT_CITY}交通与文旅服务迎来高峰", "heat_score": 78, "match_reason": "适合配城市空镜, 讲服务业机会"},
    {"radar_category": HOT_RADAR_CATEGORY_GLOBAL, "platform": "百度", "title": "高考倒计时家长焦虑指南", "heat_score": 75, "match_reason": "大众情绪强, 适合拆普通人焦虑与选择"},
    {"radar_category": HOT_RADAR_CATEGORY_INDUSTRY, "platform": "抖音", "title": "中小企业用短视频找增量", "heat_score": 73, "match_reason": "适合讲老板如何把内容变成获客动作"},
    {"radar_category": HOT_RADAR_CATEGORY_LOCAL, "platform": "本地", "title": f"{HOT_RADAR_DEFAULT_CITY}展会和培训活动升温", "heat_score": 71, "match_reason": "适合接上课、会场和商务出差素材"},
    {"radar_category": HOT_RADAR_CATEGORY_GLOBAL, "platform": "微博", "title": "假期消费账单引发讨论", "heat_score": 69, "match_reason": "适合从普通人的花钱压力切入"},
    {"radar_category": HOT_RADAR_CATEGORY_INDUSTRY, "platform": "知乎", "title": "老板开始要求团队会用 AI", "heat_score": 67, "match_reason": "适合讲 AI 不只是工具, 而是团队能力标准"},
    {"radar_category": HOT_RADAR_CATEGORY_LOCAL, "platform": "本地", "title": f"{HOT_RADAR_DEFAULT_CITY}企业沙龙和线下课排期增加", "heat_score": 65, "match_reason": "适合配课程、学员和活动现场画面"},
]


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


def _clean_hot_title(raw: str) -> str:
    text = html_lib.unescape(raw or "")
    text = re.sub(r"<[^>]+>", "", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text[:40]


def _heat_score_from_rank(rank: int, heat_label: str = "") -> int:
    base = max(54, 101 - max(1, rank) * 3)
    text = heat_label or ""
    if "亿" in text:
        base += 4
    elif "万" in text or "w" in text.lower():
        base += 2
    return max(0, min(100, base))


def _extract_tophub_nodes(home_html: str) -> dict[str, str]:
    nodes: dict[str, str] = {}
    for m in re.finditer(
        r'<a href="(/n/[^"]+)">[\s\S]{0,900}?<div class="zb-kc-Cb">([^<]+)<span>([^<]*)</span>',
        home_html,
    ):
        label = _clean_hot_title(m.group(2) + m.group(3))
        for platform, hints in _TOPHUB_NODE_HINTS.items():
            if platform in label and all(h in label for h in hints[1:]):
                nodes[platform] = m.group(1)
    return {**_TOPHUB_NODE_FALLBACKS, **nodes}


def _parse_tophub_node(html: str, platform: str) -> list[_RadarRawTopic]:
    rows: list[_RadarRawTopic] = []
    pattern = re.compile(
        r"<tr>\s*<td[^>]*>\s*(\d+)\.\s*</td>\s*"
        r'<td><a href="([^"]+)"[^>]*>([\s\S]*?)</a></td>\s*'
        r'<td class="ws">([\s\S]*?)</td>',
        re.S,
    )
    for m in pattern.finditer(html):
        title = _clean_hot_title(m.group(3))
        if not title:
            continue
        rows.append(_RadarRawTopic(
            platform=platform,
            title=title,
            heat_label=_clean_hot_title(m.group(4)),
            rank=int(m.group(1)),
            source_url=html_lib.unescape(m.group(2)),
        ))
        if len(rows) >= 10:
            break
    return rows


def _fetch_hot_radar_live_topics() -> list[_RadarRawTopic]:
    """按「热点雷达」skill 从 TopHub 抓微博/抖音/知乎/百度热榜.

    网络失败时返回空列表, 上层会使用同三类结构的保底池。
    """
    global _HOT_RADAR_CACHE
    now = time.time()
    if _HOT_RADAR_CACHE and now - _HOT_RADAR_CACHE[0] < 600:
        return _HOT_RADAR_CACHE[1]

    try:
        import httpx
        headers = {"User-Agent": "Mozilla/5.0"}
        topics: list[_RadarRawTopic] = []
        with httpx.Client(timeout=5.0, follow_redirects=True, headers=headers) as client:
            home = client.get("https://tophub.today/").text
            nodes = _extract_tophub_nodes(home)
            for platform in ("百度", "微博", "抖音", "知乎"):
                path = nodes.get(platform)
                if not path:
                    continue
                html = client.get(f"https://tophub.today{path}").text
                topics.extend(_parse_tophub_node(html, platform))
        _HOT_RADAR_CACHE = (now, topics)
        return topics
    except Exception:
        return []


def _topic_key(title: str) -> str:
    return re.sub(r"[^\w\u4e00-\u9fff]+", "", title).lower()


def _dedupe_raw_topics(topics: list[_RadarRawTopic]) -> list[_RadarRawTopic]:
    seen: set[str] = set()
    out: list[_RadarRawTopic] = []
    for t in topics:
        if any(k in t.title for k in HOT_RADAR_SKIP_KEYWORDS):
            continue
        key = _topic_key(t.title)
        if not key or key in seen:
            continue
        seen.add(key)
        out.append(t)
    return out


def _raw_to_hot_topic(t: _RadarRawTopic, category: str, reason: str) -> HotTopic:
    return HotTopic(
        id=None,
        created_at=int(time.time()),
        platform=t.platform,
        title=t.title,
        heat_score=_heat_score_from_rank(t.rank, t.heat_label),
        match_persona=1 if category == HOT_RADAR_CATEGORY_INDUSTRY else 0,
        match_reason=reason,
        source_url=t.source_url,
        fetched_from=HOT_RADAR_SOURCE,
        status="unused",
        radar_category=category,
    )


def _fallback_to_hot_topic(seed: dict[str, Any]) -> HotTopic:
    return HotTopic(
        id=None,
        created_at=int(time.time()),
        platform=str(seed.get("platform") or HOT_RADAR_SOURCE),
        title=str(seed.get("title") or ""),
        heat_score=int(seed.get("heat_score") or 0),
        match_persona=1 if seed.get("radar_category") == HOT_RADAR_CATEGORY_INDUSTRY else 0,
        match_reason=str(seed.get("match_reason") or ""),
        source_url=None,
        fetched_from=HOT_RADAR_SOURCE,
        status="unused",
        radar_category=str(seed.get("radar_category") or HOT_RADAR_CATEGORY_GLOBAL),
    )


def _pick_category_raw_topics(raw_topics: list[_RadarRawTopic], category: str) -> list[_RadarRawTopic]:
    if category == HOT_RADAR_CATEGORY_GLOBAL:
        return raw_topics
    if category == HOT_RADAR_CATEGORY_INDUSTRY:
        hits = [
            t for t in raw_topics
            if any(k.lower() in t.title.lower() for k in HOT_RADAR_INDUSTRY_KEYWORDS)
        ]
        return hits or raw_topics[3:]
    if category == HOT_RADAR_CATEGORY_LOCAL:
        hits = [
            t for t in raw_topics
            if any(k in t.title for k in HOT_RADAR_LOCAL_KEYWORDS)
        ]
        return hits
    return []


def _category_reason(category: str) -> str:
    if category == HOT_RADAR_CATEGORY_GLOBAL:
        return "全网热度高, 先借公共情绪和事件冲突开场"
    if category == HOT_RADAR_CATEGORY_INDUSTRY:
        return "可从 AI、经营、内容获客或团队效率角度借势"
    return "本地事件, 适合结合线下老板、出差或城市空镜"


def _build_hot_radar_pool(raw_topics: list[_RadarRawTopic], min_count: int) -> list[HotTopic]:
    raw_topics = _dedupe_raw_topics(raw_topics)
    by_cat: dict[str, list[HotTopic]] = {}
    for cat in HOT_RADAR_CATEGORIES:
        picked = _pick_category_raw_topics(raw_topics, cat)
        by_cat[cat] = [_raw_to_hot_topic(t, cat, _category_reason(cat)) for t in picked]

    fallback_by_cat: dict[str, list[HotTopic]] = {cat: [] for cat in HOT_RADAR_CATEGORIES}
    for seed in HOT_RADAR_FALLBACK_TOPICS:
        fallback_by_cat.setdefault(str(seed.get("radar_category")), []).append(_fallback_to_hot_topic(seed))

    for cat in HOT_RADAR_CATEGORIES:
        existing_titles = {_topic_key(t.title) for t in by_cat.get(cat, [])}
        for t in fallback_by_cat.get(cat, []):
            key = _topic_key(t.title)
            if key and key not in existing_titles:
                by_cat.setdefault(cat, []).append(t)
                existing_titles.add(key)

    result: list[HotTopic] = []
    used_titles: set[str] = set()
    rounds = max(1, (min_count + HOT_RADAR_MIN_COUNT - 1) // HOT_RADAR_MIN_COUNT)
    for i in range(rounds):
        for cat in HOT_RADAR_CATEGORIES:
            items = by_cat.get(cat, [])
            for item in items[i:]:
                key = _topic_key(item.title)
                if key in used_titles:
                    continue
                result.append(item)
                used_titles.add(key)
                break
    return result


def list_hot_topics_for_radar(limit: int = 50) -> list[HotTopic]:
    """做视频页用的热点雷达列表.

    对齐 `热点雷达-学员版` skill: 大新闻 / 行业相关 / 本地热点 三类交错输出。
    优先抓 TopHub 实时热榜；抓取失败时用同三类结构的保底池。
    """
    try:
        n = int(limit)
    except (TypeError, ValueError):
        n = 50
    n = max(0, n)
    if n == 0:
        return []

    floor = HOT_RADAR_MIN_COUNT if n <= HOT_RADAR_MIN_COUNT else min(n, HOT_RADAR_DEFAULT_POOL)
    live = _build_hot_radar_pool(_fetch_hot_radar_live_topics(), floor)
    if len(live) >= floor:
        return live[:n]

    stored = list_hot_topics(limit=n)
    for h in stored:
        if not h.radar_category:
            h.radar_category = HOT_RADAR_CATEGORY_INDUSTRY if h.match_persona else HOT_RADAR_CATEGORY_GLOBAL
    return (live + stored)[:n]


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
