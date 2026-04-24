"""AI usage 打点 + 聚合测试 (D-015)。

隔离: 用 monkeypatch 把 DB_PATH 重定向到临时文件,避免污染 prod DB。
"""
from __future__ import annotations

import sqlite3
import tempfile
import time
from pathlib import Path

import pytest


@pytest.fixture
def tmp_db(monkeypatch):
    """把 ai_usage 用的 DB_PATH 重定向到临时文件,自动清理。"""
    tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
    tmp.close()
    p = Path(tmp.name)
    # 重载模块前替换 DB_PATH
    monkeypatch.setattr("shortvideo.config.DB_PATH", p)
    # 重新 import 并重置已缓存状态
    import importlib
    from backend.services import ai_usage
    importlib.reload(ai_usage)
    yield p
    try:
        p.unlink()
    except Exception:
        pass


def test_record_and_get_usage_basic(tmp_db):
    from backend.services import ai_usage
    ai_usage.record_call("opus", "wechat.write", 5000, 2000, 30000, ok=True)
    ai_usage.record_call("deepseek", "wechat.titles", 300, 200, 3500, ok=True)
    u = ai_usage.get_usage("today")
    assert u["overall"]["calls"] == 2
    assert u["overall"]["prompt_tokens"] == 5300
    assert u["overall"]["completion_tokens"] == 2200
    assert u["overall"]["total_tokens"] == 7500
    assert u["overall"]["fails"] == 0


def test_cost_calculation(tmp_db):
    from backend.services import ai_usage
    # 1M input + 1M output opus → $15 + $75 = $90
    ai_usage.record_call("opus", "test", 1_000_000, 1_000_000, 1000, ok=True)
    u = ai_usage.get_usage("today")
    assert abs(u["overall"]["cost_usd"] - 90.0) < 0.01


def test_by_engine_grouping(tmp_db):
    from backend.services import ai_usage
    ai_usage.record_call("opus", "a", 1000, 500, 1000, ok=True)
    ai_usage.record_call("opus", "b", 2000, 800, 2000, ok=True)
    ai_usage.record_call("deepseek", "c", 300, 100, 500, ok=True)
    u = ai_usage.get_usage("today")
    assert len(u["by_engine"]) == 2
    engines = {e["engine"]: e for e in u["by_engine"]}
    assert engines["opus"]["calls"] == 2
    assert engines["opus"]["total_tokens"] == 4300
    assert engines["deepseek"]["calls"] == 1


def test_fails_counted(tmp_db):
    from backend.services import ai_usage
    ai_usage.record_call("opus", "x", 0, 0, 5000, ok=False, error="network")
    ai_usage.record_call("opus", "x", 100, 50, 3000, ok=True)
    u = ai_usage.get_usage("today")
    assert u["overall"]["fails"] == 1
    assert u["overall"]["calls"] == 2  # 失败也算一次调用


def test_noop_filter(tmp_db):
    """engine=unknown + 0 tokens 的 no-op 不写入(避免 pytest FakeInner 污染)。"""
    from backend.services import ai_usage
    ai_usage.record_call("unknown", None, 0, 0, 1, ok=True)
    u = ai_usage.get_usage("today")
    assert u["overall"]["calls"] == 0


def test_route_top_list(tmp_db):
    from backend.services import ai_usage
    ai_usage.record_call("opus", "wechat.write", 10000, 3000, 40000, ok=True)
    ai_usage.record_call("deepseek", "wechat.titles", 500, 300, 3000, ok=True)
    u = ai_usage.get_usage("today")
    by_route = {r["route_key"]: r for r in u["by_route"]}
    assert "wechat.write" in by_route
    assert by_route["wechat.write"]["total_tokens"] == 13000
    # wechat.write 应该排在前面
    assert u["by_route"][0]["total_tokens"] >= u["by_route"][-1]["total_tokens"]


def test_range_filter(tmp_db):
    """range='today' 不包含 2 天前的记录。"""
    from backend.services import ai_usage
    # 直接插入老记录
    ai_usage._ensure_schema()
    old_ts = int(time.time()) - 86400 * 3
    with sqlite3.connect(tmp_db) as con:
        con.execute(
            "INSERT INTO ai_calls (ts, engine, route_key, prompt_tokens, completion_tokens, total_tokens, duration_ms, ok) "
            "VALUES (?,'opus','old',1000,500,1500,3000,1)", (old_ts,),
        )
    # 今天的记录
    ai_usage.record_call("opus", "new", 100, 50, 500, ok=True)

    today = ai_usage.get_usage("today")
    week = ai_usage.get_usage("week")
    all_time = ai_usage.get_usage("all")

    assert today["overall"]["calls"] == 1   # 只有 new
    assert week["overall"]["calls"] == 2    # 含 old(3 天前)
    assert all_time["overall"]["calls"] == 2
