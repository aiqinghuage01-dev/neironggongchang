"""LLM 自动重试 helper 测试 (D-082c).

只测 with_retry 行为, 不真打 LLM (那个走 D-082d 真测).
"""
from __future__ import annotations

import pytest


def test_succeeds_first_try():
    from shortvideo.llm_retry import with_retry
    calls = []
    def fn():
        calls.append(1)
        return "ok"
    assert with_retry(fn) == "ok"
    assert len(calls) == 1


def test_retries_transient_then_succeeds():
    from shortvideo.llm_retry import with_retry
    calls = []
    def fn():
        calls.append(1)
        if len(calls) == 1:
            raise RuntimeError("HTTP 503 service unavailable")
        return "ok"
    assert with_retry(fn, backoff_sec=0) == "ok"  # 0 backoff 加快测试
    assert len(calls) == 2


def test_does_not_retry_non_transient():
    from shortvideo.llm_retry import with_retry
    calls = []
    def fn():
        calls.append(1)
        raise ValueError("bad input format")
    with pytest.raises(ValueError):
        with_retry(fn, backoff_sec=0)
    assert len(calls) == 1


def test_gives_up_after_max_retries():
    from shortvideo.llm_retry import with_retry
    calls = []
    def fn():
        calls.append(1)
        raise RuntimeError("connection reset")
    with pytest.raises(RuntimeError):
        with_retry(fn, max_retries=1, backoff_sec=0)
    assert len(calls) == 2  # 1 初次 + 1 重试


def test_on_retry_callback_called():
    from shortvideo.llm_retry import with_retry
    seen = []
    def fn():
        if len(seen) == 0:
            raise RuntimeError("502 bad gateway")
        return "ok"
    with_retry(fn, backoff_sec=0, on_retry=lambda n, e: seen.append((n, str(e)[:30])))
    assert seen == [(1, "502 bad gateway")]


@pytest.mark.parametrize("err_msg,should_retry", [
    ("HTTP 503", True),
    ("connection reset by peer", True),
    ("Timed out after 60s", True),
    ("rate limit exceeded", True),
    ("502 bad gateway", True),
    ("Internal Server Error", True),
    ("400 bad request", False),
    ("invalid api key", False),
    ("schema validation failed", False),
])
def test_is_transient_keywords(err_msg, should_retry):
    from shortvideo.llm_retry import is_transient_error
    assert is_transient_error(RuntimeError(err_msg)) == should_retry
