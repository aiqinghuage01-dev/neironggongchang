"""行为记忆注入测试 (D-031)。

monkeypatch preference / work_log 模块,验证拼接逻辑和 disable 路径。
"""
from __future__ import annotations

import pytest


@pytest.fixture
def fake_modules(monkeypatch):
    """伪造 preference + work_log 数据 + 开关。"""
    fake_prefs = [
        "- 2026-04-25 14:30 · 在「投流」 · 投流文案禁用躺赚  _原话: 我希望..._",
        "- 2026-04-25 15:00 · 在「公众号」 · 公众号开场必须用学员故事  _原话: 记住..._",
    ]
    fake_logs = [
        {"raw": "- 14:30 · 🔥 `hotrewrite.write`(opus) · 某热点 → 改写好 · 2500 tok"},
        {"raw": "- 14:00 · 📄 `wechat.write`(opus) · 选题 X → 长文 → 2300 字 · 6000 tok"},
    ]
    monkeypatch.setattr("backend.services.preference.recent_preferences",
                        lambda limit=20: fake_prefs[:limit])
    monkeypatch.setattr("backend.services.work_log.recent_entries",
                        lambda limit=8: fake_logs[:limit])
    monkeypatch.setattr("backend.services.settings.get_all",
                        lambda: {"memory_injection_enabled": True})


def test_disabled_returns_empty(monkeypatch):
    monkeypatch.setattr("backend.services.settings.get_all", lambda: {})
    from backend.services import memory_inject
    assert memory_inject.load_recent_memory() == ""


def test_format_pref_line_strips_metadata():
    from backend.services.memory_inject import _format_pref_line
    raw = "- 2026-04-25 14:30 · 在「投流」 · 投流文案禁用躺赚  _原话: 我希望投流..._"
    assert _format_pref_line(raw) == "投流文案禁用躺赚"


def test_format_log_line_strips_time_and_tokens():
    from backend.services.memory_inject import _format_log_line
    raw = "- 14:30 · 🔥 `hotrewrite.write`(opus) · 某热点 → 改写好 · 2500 tok"
    out = _format_log_line(raw)
    assert "14:30" not in out
    assert "tok" not in out
    assert "🔥" in out and "改写好" in out


def test_load_recent_memory_combined(fake_modules):
    from backend.services import memory_inject
    s = memory_inject.load_recent_memory()
    assert "老板已表达过的偏好" in s
    assert "投流文案禁用躺赚" in s
    assert "公众号开场必须用学员故事" in s
    assert "最近的 AI 调用" in s
    assert "改写好" in s


def test_load_recent_memory_dedup_prefs(monkeypatch):
    """重复偏好(关键词不同时间触发)只保留一份。"""
    monkeypatch.setattr("backend.services.preference.recent_preferences",
                        lambda limit=20: [
                            "- a · 在「x」 · 偏好 P1",
                            "- b · 在「y」 · 偏好 P1",  # 重复
                            "- c · 在「z」 · 偏好 P2",
                        ])
    monkeypatch.setattr("backend.services.work_log.recent_entries", lambda limit=8: [])
    monkeypatch.setattr("backend.services.settings.get_all",
                        lambda: {"memory_injection_enabled": True})
    from backend.services import memory_inject
    s = memory_inject.load_recent_memory()
    assert s.count("偏好 P1") == 1
    assert "偏好 P2" in s


def test_stats_reports_correctly(fake_modules):
    from backend.services import memory_inject
    s = memory_inject.stats()
    assert s["enabled"] is True
    assert s["preferences_count"] == 2
    assert s["recent_log_count"] == 2
    assert s["preview_chars"] > 0


def test_persona_chat_appends_memory_when_deep(fake_modules, monkeypatch):
    """PersonaInjectedAI.chat 在 deep=True 时附加 memory。"""
    from shortvideo.ai import PersonaInjectedAI
    captured = {}

    class FakeInner:
        def chat(self, prompt, **kw):
            captured["system"] = kw.get("system", "")
            class R:
                text = "ok"
                prompt_tokens = 0
                completion_tokens = 0
                total_tokens = 0
            return R()

    ai = PersonaInjectedAI(FakeInner())
    ai.chat("test", system="任务", deep=True)
    sys_text = captured["system"]
    # 含 persona 内容(精简版本)
    assert "小华" in sys_text
    # 含偏好(deep=True 时应注入)
    assert "投流文案禁用躺赚" in sys_text


def test_persona_chat_skips_memory_when_shallow(fake_modules, monkeypatch):
    """deep=False 时不注入 memory。"""
    from shortvideo.ai import PersonaInjectedAI
    captured = {}

    class FakeInner:
        def chat(self, prompt, **kw):
            captured["system"] = kw.get("system", "")
            class R:
                text = "ok"; prompt_tokens = 0; completion_tokens = 0; total_tokens = 0
            return R()

    ai = PersonaInjectedAI(FakeInner())
    ai.chat("test", deep=False)
    sys_text = captured["system"]
    # 含精简 persona
    assert "小华" in sys_text
    # 不含偏好(deep=False 路径不注入)
    assert "投流文案禁用躺赚" not in sys_text
