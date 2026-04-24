"""效果分析测试 (D-032)。

用 tmp_db fixture 隔离 prod works.db。
"""
from __future__ import annotations

import sqlite3
import tempfile
import time
from pathlib import Path

import pytest


@pytest.fixture
def tmp_db(monkeypatch):
    tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
    tmp.close()
    p = Path(tmp.name)
    monkeypatch.setattr("shortvideo.config.DB_PATH", p)
    # 重新 import 让模块拿 monkeypatch 后的 DB_PATH
    import importlib
    from shortvideo import works as works_mod
    importlib.reload(works_mod)
    works_mod.init_db()
    from backend.services import insights
    importlib.reload(insights)
    insights.clear_cache()
    yield p
    try:
        p.unlink()
    except Exception:
        pass


def _seed(db_path: Path, fake_works: list[dict], fake_metrics: list[dict]):
    with sqlite3.connect(db_path) as con:
        for w in fake_works:
            con.execute(
                "INSERT INTO works (id, created_at, title, final_text, status) VALUES (?,?,?,?,?)",
                (w["id"], int(time.time()), w["title"], w.get("final_text", ""), "ready"),
            )
        for m in fake_metrics:
            con.execute(
                "INSERT INTO metrics (work_id, platform, views, likes, comments, conversions, recorded_at, source) "
                "VALUES (?,?,?,?,?,?,?,?)",
                (m["work_id"], m["platform"], m["views"], m["likes"],
                 m.get("comments", 0), m.get("conversions", 0), int(time.time()), "manual"),
            )
        con.commit()


def test_top_performers_empty(tmp_db):
    from backend.services import insights
    assert insights.top_performers() == []


def test_top_performers_sorted_by_views(tmp_db):
    _seed(tmp_db, [
        {"id": 1, "title": "选题 A"},
        {"id": 2, "title": "选题 B"},
        {"id": 3, "title": "选题 C"},
    ], [
        {"work_id": 1, "platform": "douyin", "views": 1000, "likes": 100},
        {"work_id": 2, "platform": "douyin", "views": 5000, "likes": 500},
        {"work_id": 3, "platform": "douyin", "views": 2000, "likes": 200},
    ])
    from backend.services import insights
    top = insights.top_performers(limit=10)
    assert len(top) == 3
    assert top[0]["title"] == "选题 B" and top[0]["views"] == 5000
    assert top[1]["title"] == "选题 C" and top[1]["views"] == 2000
    assert top[2]["title"] == "选题 A"


def test_top_performers_aggregates_cross_platform(tmp_db):
    """同一 work 多个 platform 时 views 累加。"""
    _seed(tmp_db, [{"id": 1, "title": "跨平台爆款"}], [
        {"work_id": 1, "platform": "douyin",   "views": 3000, "likes": 100},
        {"work_id": 1, "platform": "shipinhao","views": 2000, "likes": 80},
    ])
    from backend.services import insights
    top = insights.top_performers()
    assert len(top) == 1
    assert top[0]["views"] == 5000
    assert sorted(top[0]["platforms"]) == ["douyin", "shipinhao"]


def test_top_performers_excludes_zero_views(tmp_db):
    """没 views 的不算 top performer。"""
    _seed(tmp_db, [
        {"id": 1, "title": "0 view 视频"},
        {"id": 2, "title": "有量视频"},
    ], [
        {"work_id": 1, "platform": "douyin", "views": 0, "likes": 0},
        {"work_id": 2, "platform": "douyin", "views": 1000, "likes": 50},
    ])
    from backend.services import insights
    top = insights.top_performers()
    assert len(top) == 1
    assert top[0]["title"] == "有量视频"


def test_winning_patterns_empty_when_no_data(tmp_db):
    from backend.services import insights
    r = insights.winning_patterns()
    assert r["empty"] is True
    assert r["top_count"] == 0
    assert r["patterns"] == ""


def test_winning_patterns_calls_ai_with_data(tmp_db, monkeypatch):
    _seed(tmp_db, [{"id": 1, "title": "AI 让老板少花 3 万"}], [
        {"work_id": 1, "platform": "douyin", "views": 50000, "likes": 2000, "conversions": 30},
    ])

    captured = {}
    class FakeAi:
        def chat(self, prompt, **kw):
            captured["prompt"] = prompt
            class R:
                text = '{"openings":["学员故事+反转"],"angles":["反常识"],"title_patterns":["别再 X,Y 才是真"],"verbs":["少花","真的"],"summary":"爆款 DNA: 数字+反转"}'
                prompt_tokens = 100; completion_tokens = 50; total_tokens = 150
            return R()
    monkeypatch.setattr("shortvideo.ai.get_ai_client", lambda route_key=None: FakeAi())

    from backend.services import insights
    insights.clear_cache()
    r = insights.winning_patterns()
    assert r["empty"] is False
    assert r["top_count"] == 1
    assert "学员故事+反转" in r["patterns"]
    assert "爆款 DNA" in r["patterns"]
    # AI 被调用,prompt 含 work title
    assert "AI 让老板少花 3 万" in captured["prompt"]


def test_winning_patterns_caches_result(tmp_db, monkeypatch):
    _seed(tmp_db, [{"id": 1, "title": "x"}], [
        {"work_id": 1, "platform": "douyin", "views": 1000, "likes": 50},
    ])
    call_count = [0]
    class FakeAi:
        def chat(self, prompt, **kw):
            call_count[0] += 1
            class R:
                text = '{"summary": "缓存测试"}'
                prompt_tokens = 0; completion_tokens = 0; total_tokens = 0
            return R()
    monkeypatch.setattr("shortvideo.ai.get_ai_client", lambda route_key=None: FakeAi())

    from backend.services import insights
    insights.clear_cache()
    r1 = insights.winning_patterns()
    assert r1["cached"] is False
    r2 = insights.winning_patterns()  # 第二次走缓存
    assert r2["cached"] is True
    assert call_count[0] == 1  # AI 只被调一次

    # refresh=True 强制刷新
    r3 = insights.winning_patterns(refresh=True)
    assert r3["cached"] is False
    assert call_count[0] == 2
