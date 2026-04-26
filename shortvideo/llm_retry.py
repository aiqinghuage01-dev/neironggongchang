"""LLM 调用统一重试 helper (D-082c).

DeepSeek / OpenClaw / Anthropic 偶发抽风 (5xx / connection reset / timeout / rate limit)
对老板很烦 — 一个文案点提交后 30s 报错 = 又得重新点. 文案功能好用度直接被这种偶发掉链子拖死.

with_retry 在 transient 错误时自动重试 1 次, 拦住 80% 偶发故障. 持续故障还是抛, 让上层正常处理.

scope: shortvideo.deepseek.DeepSeekClient.chat / shortvideo.claude_opus.ClaudeOpusClient.chat
"""
from __future__ import annotations

import time
from typing import Callable, TypeVar

T = TypeVar("T")

# 关键字判定: 出现这些字串视为 transient (会重试)
TRANSIENT_KEYWORDS = (
    "timeout", "timed out", "deadline",
    "connection", "network", "reset by peer", "broken pipe", "remote disconnected",
    "502", "503", "504", "500",  # gateway / unavailable
    "internal server error", "service unavailable", "bad gateway", "gateway timeout",
    "rate limit", "too many requests",
)


def is_transient_error(e: BaseException) -> bool:
    msg = str(e).lower()
    return any(kw in msg for kw in TRANSIENT_KEYWORDS)


def with_retry(
    fn: Callable[[], T],
    *,
    max_retries: int = 1,
    backoff_sec: float = 1.5,
    on_retry: Callable[[int, BaseException], None] | None = None,
) -> T:
    """跑 fn(). 失败若是 transient error, 最多重试 max_retries 次. 都失败抛最后一次的 error.

    on_retry: callback 每次重试前调一次, 用于 log.
    backoff: attempt × 1.5^attempt 指数退避. attempt=0 → 1.5s, attempt=1 → 2.25s
    """
    last_err: BaseException | None = None
    for attempt in range(max_retries + 1):
        try:
            return fn()
        except BaseException as e:
            last_err = e
            if attempt < max_retries and is_transient_error(e):
                if on_retry:
                    try:
                        on_retry(attempt + 1, e)
                    except Exception:
                        pass
                time.sleep(backoff_sec * (1.5 ** attempt))
                continue
            raise
    # 永远到不了: 上面要么 return 要么 raise
    raise last_err  # type: ignore[misc]
