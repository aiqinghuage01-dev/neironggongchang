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


# T9: retry 命中率统计 (in-process, 不持久化, 进程重启清零)
# 老板首页 dashboard "今天 LLM 重试 N 次救活 M 次" 用.
import threading as _th_t9
_T9_LOCK = _th_t9.Lock()
_T9_STATS = {"retried": 0, "saved_after_retry": 0, "failed_after_retry": 0, "since_ts": 0}


def _t9_init():
    if _T9_STATS["since_ts"] == 0:
        import time as _tm
        _T9_STATS["since_ts"] = int(_tm.time())


def _t9_bump(key: str):
    with _T9_LOCK:
        _t9_init()
        _T9_STATS[key] = _T9_STATS.get(key, 0) + 1


def get_retry_stats() -> dict:
    """T9: dashboard 拉数. 返回 retried (触发次数), saved_after_retry (重试成功救活),
    failed_after_retry (重试也失败), since_ts (开始计数 unix 时间)."""
    with _T9_LOCK:
        _t9_init()
        return dict(_T9_STATS)


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
    triggered = False  # T9: 是否真触发了至少一次重试
    for attempt in range(max_retries + 1):
        try:
            r = fn()
            if triggered:
                _t9_bump("saved_after_retry")
            return r
        except BaseException as e:
            last_err = e
            if attempt < max_retries and is_transient_error(e):
                if not triggered:
                    _t9_bump("retried")
                    triggered = True
                if on_retry:
                    try:
                        on_retry(attempt + 1, e)
                    except Exception:
                        pass
                time.sleep(backoff_sec * (1.5 ** attempt))
                continue
            if triggered:
                _t9_bump("failed_after_retry")
            raise
    # 永远到不了: 上面要么 return 要么 raise
    raise last_err  # type: ignore[misc]
