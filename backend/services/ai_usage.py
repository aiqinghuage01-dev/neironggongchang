"""AI 调用打点 + 用量/成本统计 (D-015)。

每次 chat/rewrite_script 调用在这里打点:
  engine, route_key, prompt_tokens, completion_tokens, duration_ms, ok

聚合查询:
  today/yesterday/week/all_time 的 calls/tokens/cost 分解
  按 engine 和 route_key 两个维度

价格表(~2026-04 粗略估算,可改常量):
  Opus:     input $15/M  · output $75/M
  DeepSeek: input $0.14/M · output $0.28/M

数据落在主项目 SQLite(works.db),共享连接。
"""
from __future__ import annotations

import sqlite3
import threading
import time
from contextlib import closing
from dataclasses import dataclass
from typing import Any

from backend.services.migrations import apply_migrations
from shortvideo.db import get_connection


# 价格 (USD per 1M tokens) — 可通过 settings.engine_pricing 覆盖
DEFAULT_PRICING = {
    "opus":     {"input": 15.0, "output": 75.0},
    "deepseek": {"input": 0.14, "output": 0.28},
}

# 美元→人民币汇率(粗估,可通过 settings.usd_to_cny 覆盖)
DEFAULT_USD_TO_CNY = 7.2


def _ensure_schema():
    """D-084: schema 集中化, 走 migrations.apply_migrations (幂等)."""
    apply_migrations()


def record_call(
    engine: str,
    route_key: str | None,
    prompt_tokens: int,
    completion_tokens: int,
    duration_ms: int,
    ok: bool = True,
    error: str | None = None,
) -> None:
    """打点一次 AI 调用。任何异常吃掉,不影响主流程。

    过滤 no-op 调用(如 pytest 里的 FakeInner): engine=unknown 且无 tokens。
    """
    if (engine or "unknown") == "unknown" and prompt_tokens == 0 and completion_tokens == 0 and ok:
        return
    try:
        _ensure_schema()
        with closing(get_connection()) as con:
            con.execute(
                "INSERT INTO ai_calls (ts, engine, route_key, prompt_tokens, completion_tokens, total_tokens, duration_ms, ok, error) "
                "VALUES (?,?,?,?,?,?,?,?,?)",
                (
                    int(time.time()),
                    (engine or "unknown")[:20],
                    (route_key or "")[:64],
                    int(prompt_tokens or 0),
                    int(completion_tokens or 0),
                    int((prompt_tokens or 0) + (completion_tokens or 0)),
                    int(duration_ms or 0),
                    1 if ok else 0,
                    (error or "")[:300] if error else None,
                ),
            )
            con.commit()
    except Exception:
        pass


def _cost_usd(engine: str, prompt_tokens: int, completion_tokens: int, pricing: dict) -> float:
    p = pricing.get(engine, {"input": 0, "output": 0})
    return (prompt_tokens / 1_000_000.0) * p["input"] + (completion_tokens / 1_000_000.0) * p["output"]


def _load_pricing_and_fx() -> tuple[dict, float]:
    """从 settings.engine_pricing / settings.usd_to_cny 覆盖默认。"""
    try:
        from backend.services import settings as ss
        s = ss.get_all()
        pricing = {**DEFAULT_PRICING, **(s.get("engine_pricing") or {})}
        fx = float(s.get("usd_to_cny") or DEFAULT_USD_TO_CNY)
        return pricing, fx
    except Exception:
        return DEFAULT_PRICING, DEFAULT_USD_TO_CNY


def _range_to_since(range_: str) -> int:
    now = int(time.time())
    ranges = {
        "today":     now - 86400,
        "yesterday": now - 86400 * 2,
        "week":      now - 86400 * 7,
        "month":     now - 86400 * 30,
        "all":       0,
    }
    return ranges.get(range_, now - 86400)


def get_usage(range_: str = "today") -> dict[str, Any]:
    """按时间范围聚合 AI 调用情况。"""
    _ensure_schema()
    pricing, fx = _load_pricing_and_fx()
    since = _range_to_since(range_)

    with closing(get_connection()) as con:
        con.row_factory = sqlite3.Row
        overall = con.execute(
            "SELECT COUNT(*) AS calls, "
            "SUM(prompt_tokens) AS in_tok, "
            "SUM(completion_tokens) AS out_tok, "
            "SUM(total_tokens) AS total_tok, "
            "SUM(duration_ms) AS total_ms, "
            "SUM(CASE WHEN ok=0 THEN 1 ELSE 0 END) AS fails "
            "FROM ai_calls WHERE ts >= ?",
            (since,),
        ).fetchone()

        by_engine_rows = con.execute(
            "SELECT engine, COUNT(*) AS calls, "
            "SUM(prompt_tokens) AS in_tok, SUM(completion_tokens) AS out_tok, "
            "SUM(total_tokens) AS total_tok, SUM(duration_ms) AS ms, "
            "SUM(CASE WHEN ok=0 THEN 1 ELSE 0 END) AS fails "
            "FROM ai_calls WHERE ts >= ? GROUP BY engine ORDER BY total_tok DESC",
            (since,),
        ).fetchall()

        by_route_rows = con.execute(
            "SELECT route_key, engine, COUNT(*) AS calls, "
            "SUM(prompt_tokens) AS in_tok, SUM(completion_tokens) AS out_tok, "
            "SUM(total_tokens) AS total_tok "
            "FROM ai_calls WHERE ts >= ? GROUP BY route_key, engine "
            "ORDER BY total_tok DESC LIMIT 30",
            (since,),
        ).fetchall()

    def engine_summary(r):
        e = r["engine"] or "unknown"
        in_tok = r["in_tok"] or 0
        out_tok = r["out_tok"] or 0
        cost_usd = _cost_usd(e, in_tok, out_tok, pricing)
        return {
            "engine": e,
            "calls": r["calls"],
            "prompt_tokens": in_tok,
            "completion_tokens": out_tok,
            "total_tokens": r["total_tok"] or 0,
            "duration_ms": r["ms"] or 0,
            "fails": r["fails"] or 0,
            "cost_usd": round(cost_usd, 6),
            "cost_cny": round(cost_usd * fx, 4),
        }

    by_engine = [engine_summary(r) for r in by_engine_rows]
    total_cost_usd = sum(e["cost_usd"] for e in by_engine)

    by_route = [
        {
            "route_key": r["route_key"] or "(none)",
            "engine": r["engine"] or "unknown",
            "calls": r["calls"],
            "prompt_tokens": r["in_tok"] or 0,
            "completion_tokens": r["out_tok"] or 0,
            "total_tokens": r["total_tok"] or 0,
            "cost_usd": round(_cost_usd(r["engine"] or "unknown", r["in_tok"] or 0, r["out_tok"] or 0, pricing), 6),
        }
        for r in by_route_rows
    ]

    return {
        "range": range_,
        "since": since,
        "overall": {
            "calls": overall["calls"] or 0,
            "prompt_tokens": overall["in_tok"] or 0,
            "completion_tokens": overall["out_tok"] or 0,
            "total_tokens": overall["total_tok"] or 0,
            "duration_ms": overall["total_ms"] or 0,
            "fails": overall["fails"] or 0,
            "cost_usd": round(total_cost_usd, 4),
            "cost_cny": round(total_cost_usd * fx, 2),
        },
        "by_engine": by_engine,
        "by_route": by_route,
        "pricing": pricing,
        "usd_to_cny": fx,
    }


def recent_calls(limit: int = 50) -> list[dict[str, Any]]:
    """最近 N 次调用明细(供调试页)。"""
    _ensure_schema()
    with closing(get_connection()) as con:
        con.row_factory = sqlite3.Row
        rows = con.execute(
            "SELECT id, ts, engine, route_key, prompt_tokens, completion_tokens, total_tokens, duration_ms, ok, error "
            "FROM ai_calls ORDER BY ts DESC LIMIT ?",
            (int(limit),),
        ).fetchall()
    return [dict(r) for r in rows]
