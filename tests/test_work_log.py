"""小华工作日志测试 (D-023)。

隔离: monkeypatch 把 LOG_PATH 重定向到临时文件,settings 也 mock。
"""
from __future__ import annotations

import tempfile
from pathlib import Path

import pytest


@pytest.fixture
def tmp_log(monkeypatch):
    """重定向 LOG_PATH 到临时文件 + 默认开启 work_log_enabled。"""
    tmp = tempfile.NamedTemporaryFile(suffix=".md", delete=False)
    tmp.close()
    p = Path(tmp.name)
    p.unlink()  # 让 maybe_log 自己创建,验证完整流程
    p.parent.mkdir(parents=True, exist_ok=True)

    from backend.services import work_log
    monkeypatch.setattr(work_log, "LOG_PATH", p)
    # 重置节流状态
    work_log._throttle_state.clear()
    # 默认 mock settings 开启
    monkeypatch.setattr("backend.services.settings.get_all", lambda: {"work_log_enabled": True})
    yield p
    try:
        p.unlink()
    except Exception:
        pass


def test_disabled_by_default(monkeypatch, tmp_log):
    """settings 没 work_log_enabled 时,maybe_log 不写文件。"""
    from backend.services import work_log
    monkeypatch.setattr("backend.services.settings.get_all", lambda: {})
    work_log.maybe_log(route_key="test.x", engine="opus",
                        prompt_brief="hi", response_brief="hello", tokens=100, ok=True)
    assert not tmp_log.exists()


def test_enabled_writes_md_with_today_section(tmp_log):
    from backend.services import work_log
    work_log.maybe_log(route_key="hotrewrite.write", engine="opus",
                        prompt_brief="某热点事件", response_brief="改写后口播", tokens=2500, ok=True)
    assert tmp_log.exists()
    text = tmp_log.read_text(encoding="utf-8")
    assert "# 小华工作日志" in text
    assert "## 20" in text  # 含日期 section
    assert "🔥" in text  # icon for hotrewrite
    assert "hotrewrite.write" in text
    assert "2500 tok" in text


def test_skip_failed_calls(tmp_log):
    from backend.services import work_log
    work_log.maybe_log(route_key="x.y", engine="opus",
                        prompt_brief="x", response_brief="", tokens=0, ok=False)
    assert not tmp_log.exists()


def test_skip_small_token_pings(tmp_log):
    """ping 类调用 (< 50 tokens) 不记。"""
    from backend.services import work_log
    work_log.maybe_log(route_key="health.ping", engine="opus",
                        prompt_brief="ping", response_brief="ok", tokens=2, ok=True)
    assert not tmp_log.exists()


def test_throttle_same_route(tmp_log):
    """同 route_key 5 分钟内只记 1 条。"""
    from backend.services import work_log
    work_log.maybe_log(route_key="rewrite", engine="opus",
                        prompt_brief="第一次", response_brief="第一次输出", tokens=500, ok=True)
    work_log.maybe_log(route_key="rewrite", engine="opus",
                        prompt_brief="第二次", response_brief="第二次输出", tokens=500, ok=True)
    text = tmp_log.read_text(encoding="utf-8")
    assert "第一次输出" in text
    assert "第二次输出" not in text  # 节流跳过


def test_different_routes_not_throttled(tmp_log):
    from backend.services import work_log
    work_log.maybe_log(route_key="a.x", engine="opus",
                        prompt_brief="a 输入", response_brief="a 输出", tokens=200, ok=True)
    work_log.maybe_log(route_key="b.y", engine="deepseek",
                        prompt_brief="b 输入", response_brief="b 输出", tokens=200, ok=True)
    text = tmp_log.read_text(encoding="utf-8")
    assert "a 输出" in text
    assert "b 输出" in text


def test_summarize_truncates_long_text(tmp_log):
    from backend.services import work_log
    long_response = "a" * 500
    work_log.maybe_log(route_key="x.y", engine="opus",
                        prompt_brief="短", response_brief=long_response, tokens=300, ok=True)
    text = tmp_log.read_text(encoding="utf-8")
    # 摘要应该有 ... 截断标记
    assert "..." in text


def test_status_reports_correctly(tmp_log):
    from backend.services import work_log
    s = work_log.status()
    assert s["enabled"] is True
    assert s["log_exists"] is False
    work_log.maybe_log(route_key="x.y", engine="opus",
                        prompt_brief="x", response_brief="y", tokens=100, ok=True)
    s2 = work_log.status()
    assert s2["log_exists"] is True
    assert s2["entries_count"] == 1


def test_recent_entries_returns_newest_first(tmp_log):
    from backend.services import work_log
    work_log.maybe_log(route_key="a.x", engine="opus", prompt_brief="第一", response_brief="r1", tokens=100, ok=True)
    work_log.maybe_log(route_key="b.y", engine="opus", prompt_brief="第二", response_brief="r2", tokens=100, ok=True)
    work_log.maybe_log(route_key="c.z", engine="opus", prompt_brief="第三", response_brief="r3", tokens=100, ok=True)
    entries = work_log.recent_entries(limit=2)
    assert len(entries) == 2
    # 最新的(c.z)在前
    assert "r3" in entries[0]["raw"]
