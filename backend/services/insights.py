"""效果分析 + 反哺选题 (D-032 · Phase 3 旧 TODO 闭环)。

链路:
  works (作品库) + metrics (数据指标手动录入)
    → top_performers(limit=10) 按 views 聚合
    → winning_patterns() AI 抽共性(开头模式/标题模式/角度类型)
    → topics_generate 注入 winning_patterns 到 prompt

如果 metrics 表为空(用户没录数据) → patterns 空 → topics_generate 行为
跟没有这功能一样,完全向后兼容。
"""
from __future__ import annotations

import json
import re
import sqlite3
import threading
import time
from contextlib import closing
from typing import Any

from shortvideo.config import DB_PATH

_CACHE_TTL = 3600  # 1 小时缓存,避免每次 topics_generate 都重调 AI
_lock = threading.Lock()
_cache: dict[str, Any] = {"ts": 0.0, "patterns": "", "top": []}


def _ensure_metrics_schema():
    """works/metrics 表已经在 shortvideo/works.py::init_db() 创建,这里只确认存在。"""
    try:
        with closing(sqlite3.connect(DB_PATH)) as con:
            con.execute("SELECT 1 FROM metrics LIMIT 1")
    except sqlite3.OperationalError:
        # 表还没建过,触发一次
        from shortvideo.works import init_db
        init_db()


def top_performers(limit: int = 10) -> list[dict[str, Any]]:
    """按 views 聚合 top N works(跨平台合并)。"""
    _ensure_metrics_schema()
    with closing(sqlite3.connect(DB_PATH)) as con:
        con.row_factory = sqlite3.Row
        rows = con.execute(
            """SELECT m.work_id,
                      w.title,
                      w.final_text,
                      SUM(m.views)             AS total_views,
                      SUM(m.likes)             AS total_likes,
                      SUM(m.comments)          AS total_comments,
                      SUM(m.conversions)       AS total_conversions,
                      SUM(m.followers_gained)  AS total_followers,
                      COUNT(*)                 AS metric_records,
                      GROUP_CONCAT(m.platform) AS platforms
               FROM metrics m
               JOIN works w ON w.id = m.work_id
               GROUP BY m.work_id
               HAVING total_views > 0
               ORDER BY total_views DESC
               LIMIT ?""",
            (max(1, min(limit, 50)),),
        ).fetchall()
    return [
        {
            "work_id": r["work_id"],
            "title": r["title"] or "",
            "preview": (r["final_text"] or "")[:200],
            "views": r["total_views"] or 0,
            "likes": r["total_likes"] or 0,
            "comments": r["total_comments"] or 0,
            "conversions": r["total_conversions"] or 0,
            "followers": r["total_followers"] or 0,
            "platforms": (r["platforms"] or "").split(","),
        }
        for r in rows
    ]


def winning_patterns(refresh: bool = False) -> dict[str, Any]:
    """AI 抽 top performers 的共性 · 1 小时缓存。

    返回:
      {patterns: 多行字符串(直接拼到 prompt) · top_count: int · empty: bool}
    """
    now = time.time()
    with _lock:
        if not refresh and (now - _cache["ts"]) < _CACHE_TTL and _cache["patterns"] is not None:
            return {
                "patterns": _cache["patterns"],
                "top_count": len(_cache["top"]),
                "cached": True,
                "empty": not _cache["patterns"],
                "age_sec": int(now - _cache["ts"]),
            }

    top = top_performers(limit=10)
    if not top:
        with _lock:
            _cache.update({"ts": now, "patterns": "", "top": []})
        return {"patterns": "", "top_count": 0, "cached": False, "empty": True}

    titles_block = "\n".join(
        f"- 「{t['title']}」 · views={t['views']} · likes={t['likes']} · conv={t['conversions']}"
        + (f" · 内容前 80 字: {t['preview'][:80]}" if t['preview'] else "")
        for t in top
    )
    prompt = f"""下面是清华哥近期表现好的 {len(top)} 条作品 metrics 聚合。
分析它们的共性,提炼可复制的模式给下次选题用。

作品列表:
{titles_block}

严格 JSON,不加前言:
{{
  "openings": ["跑量好的开头模式 1(具体不空泛,如 '学员故事+反转')", "模式 2"],
  "angles":   ["跑量好的角度类型 1(如 '反常识')", "类型 2"],
  "title_patterns": ["标题模式 1(如 '别再 X,Y 才是真的')", "模式 2"],
  "verbs": ["可复用的动词/标志性词 1", "词 2"],
  "summary": "一句话总结这批作品的爆款 DNA"
}}"""
    try:
        from shortvideo.ai import get_ai_client
        ai = get_ai_client(route_key="insights.winning")
        r = ai.chat(prompt, deep=False, temperature=0.4, max_tokens=1500)
        m = re.search(r"\{[\s\S]*\}", r.text or "")
        patterns_obj = {}
        if m:
            try:
                patterns_obj = json.loads(m.group(0))
            except Exception:
                patterns_obj = {}

        # 转人类可读片段(也方便注入 prompt)
        lines = []
        if patterns_obj.get("summary"):
            lines.append(f"💡 你过往跑量爆款 DNA: {patterns_obj['summary']}")
        if patterns_obj.get("openings"):
            lines.append("跑量好的开头模式: " + " · ".join(patterns_obj["openings"][:3]))
        if patterns_obj.get("angles"):
            lines.append("跑量好的角度: " + " · ".join(patterns_obj["angles"][:5]))
        if patterns_obj.get("title_patterns"):
            lines.append("跑量好的标题模式: " + " · ".join(patterns_obj["title_patterns"][:3]))
        if patterns_obj.get("verbs"):
            lines.append("常用标志性词: " + "、".join(patterns_obj["verbs"][:8]))
        patterns_text = "\n".join(lines)

        with _lock:
            _cache.update({"ts": now, "patterns": patterns_text, "top": top})

        return {
            "patterns": patterns_text,
            "patterns_obj": patterns_obj,
            "top_count": len(top),
            "cached": False,
            "empty": False,
        }
    except Exception as e:
        return {"patterns": "", "top_count": len(top), "cached": False, "empty": True, "error": str(e)}


def clear_cache():
    with _lock:
        _cache.update({"ts": 0.0, "patterns": "", "top": []})
