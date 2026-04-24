"""偏好学习测试 (D-030)。

不打真 AI · monkeypatch get_ai_client 拦截。
"""
from __future__ import annotations

import tempfile
from pathlib import Path

import pytest


@pytest.fixture
def tmp_pref(monkeypatch):
    tmp = tempfile.NamedTemporaryFile(suffix=".md", delete=False)
    tmp.close()
    p = Path(tmp.name)
    p.unlink()  # 让 maybe_learn 自己创建

    from backend.services import preference
    monkeypatch.setattr(preference, "PREF_PATH", p)
    monkeypatch.setattr(preference, "_last_extract_ts", 0.0)
    # 默认开启
    monkeypatch.setattr("backend.services.settings.get_all", lambda: {"preference_learning_enabled": True})
    yield p
    try:
        p.unlink()
    except Exception:
        pass


class FakeAi:
    """伪 AI 客户端 · 响应预设。"""
    def __init__(self, response_text):
        self.response_text = response_text
    def chat(self, prompt, **kw):
        class R:
            text = self.response_text
            prompt_tokens = 100
            completion_tokens = 50
            total_tokens = 150
        return R()


def _patch_ai(monkeypatch, response_text):
    fake = FakeAi(response_text)
    monkeypatch.setattr("shortvideo.ai.get_ai_client", lambda route_key=None: fake)


def test_disabled_skips(monkeypatch, tmp_pref):
    from backend.services import preference
    monkeypatch.setattr("backend.services.settings.get_all", lambda: {})
    r = preference.maybe_learn([{"role": "user", "text": "我希望文案更短"}], context="首页")
    assert r["skipped"] == "disabled"
    assert not tmp_pref.exists()


def test_no_keyword_skips(tmp_pref):
    from backend.services import preference
    r = preference.maybe_learn([{"role": "user", "text": "今天天气不错"}], context="首页")
    assert r["skipped"] == "no_keyword"


def test_keyword_match_extracts_preference(monkeypatch, tmp_pref):
    from backend.services import preference
    _patch_ai(monkeypatch, '{"is_preference": true, "summary": "投流文案禁用躺赚"}')
    r = preference.maybe_learn(
        [{"role": "user", "text": "我希望投流文案不要写躺赚之类的词"}],
        context="投流",
    )
    assert r.get("saved") is True
    assert r["summary"] == "投流文案禁用躺赚"
    assert tmp_pref.exists()
    text = tmp_pref.read_text(encoding="utf-8")
    assert "# 小华学到的偏好" in text
    assert "投流文案禁用躺赚" in text
    assert "「投流」" in text


def test_ai_says_not_preference(monkeypatch, tmp_pref):
    """命中关键词但 AI 判断不是偏好(只是一次性请求) → 不写文件。"""
    from backend.services import preference
    _patch_ai(monkeypatch, '{"is_preference": false, "summary": ""}')
    r = preference.maybe_learn(
        [{"role": "user", "text": "记住我刚才那条要改的"}],
        context="改写",
    )
    assert r["skipped"] == "not_preference"
    assert not tmp_pref.exists()


def test_throttle_blocks_second_call(monkeypatch, tmp_pref):
    from backend.services import preference
    _patch_ai(monkeypatch, '{"is_preference": true, "summary": "test pref"}')
    # 第一次成功
    r1 = preference.maybe_learn([{"role": "user", "text": "我希望 X"}], context="A")
    assert r1.get("saved") is True
    # 第二次立即调,被节流
    r2 = preference.maybe_learn([{"role": "user", "text": "我希望 Y"}], context="B")
    assert r2["skipped"] == "throttled"


def test_no_user_msg(tmp_pref):
    from backend.services import preference
    r = preference.maybe_learn([{"role": "assistant", "text": "你好"}], context="首页")
    assert r["skipped"] == "no_user_msg"


def test_recent_preferences_newest_first(monkeypatch, tmp_pref):
    from backend.services import preference
    _patch_ai(monkeypatch, '{"is_preference": true, "summary": "p1"}')
    preference.maybe_learn([{"role": "user", "text": "我希望 1"}], context="A")
    # 重置 throttle 才能再写
    monkeypatch.setattr(preference, "_last_extract_ts", 0.0)
    _patch_ai(monkeypatch, '{"is_preference": true, "summary": "p2"}')
    preference.maybe_learn([{"role": "user", "text": "我希望 2"}], context="B")

    r = preference.recent_preferences(limit=10)
    assert len(r) == 2
    assert "p2" in r[0]
    assert "p1" in r[1]


def test_status_reports_correctly(monkeypatch, tmp_pref):
    from backend.services import preference
    s = preference.status()
    assert s["enabled"] is True
    assert s["exists"] is False
    _patch_ai(monkeypatch, '{"is_preference": true, "summary": "x"}')
    preference.maybe_learn([{"role": "user", "text": "我希望 X"}], context="C")
    s2 = preference.status()
    assert s2["exists"] is True
    assert s2["preferences_count"] == 1
