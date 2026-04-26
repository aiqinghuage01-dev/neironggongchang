"""访客模式 (D-070) — 给朋友/外人产出内容时, 不污染清华哥本人的"越用越懂".

实现思路: HTTP request header `X-Guest-Mode: 1` → middleware 写 contextvar
→ 各写入口 (work_log / preference / 作品库 / 人设注入) 在 hook 里读 contextvar
决定要不要短路.

跨 daemon thread 传递:
  tasks.run_async 起异步 worker 时 daemon thread 不自动继承 contextvar,
  需要手动 capture + set (本模块提供 helper).

guest 模式下:
  1. 不写 work_log (D-005)
  2. 不学 preference (D-067)
  3. 文字 skill 不自动入作品库 (D-065 _autoinsert_text_work)
  4. 公众号产出不入作品库
  5. AI 调用不注入"清华哥"人设, 走中性写作助手 system prompt
"""
from __future__ import annotations

import contextvars

# 访客模式 contextvar (异步 task 跨 thread 传递时用 capture/set)
_guest_mode: contextvars.ContextVar[bool] = contextvars.ContextVar(
    "ql_guest_mode", default=False
)


def is_guest() -> bool:
    """当前 request/task 是否在访客模式."""
    try:
        return _guest_mode.get()
    except LookupError:
        return False


def set_guest(flag: bool) -> contextvars.Token:
    """设访客标志, 返回 token (供 reset)."""
    return _guest_mode.set(bool(flag))


def reset(token: contextvars.Token) -> None:
    """恢复 contextvar (中间件请求结束后用)."""
    try:
        _guest_mode.reset(token)
    except (ValueError, LookupError):
        pass


def capture() -> bool:
    """异步任务 spawn 前调, 拿到当前值. 在 daemon thread 里调 set_guest(captured)."""
    return is_guest()
