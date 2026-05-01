"""Phase 3 · ADMIN_TOKEN 写操作保护.

只在 backend 启用 ADMIN_TOKEN 时生效:
  - 未设 ADMIN_TOKEN: 保留本地旧行为 (任何人 POST/DELETE 都能写),
    启动时打 warning, 提醒部署到非本机环境必须设.
  - 设了:  所有写方法 (POST/PUT/PATCH/DELETE) 必须带 X-Admin-Token,
           不带或不对 → 401.

读方法 (GET/HEAD/OPTIONS): 永远不要 token.
  - GET 是天然只读
  - HEAD 是 GET 的 headers-only 子集
  - OPTIONS 是浏览器 CORS preflight, SOP 不让带自定义 header

写方法 (POST/PUT/PATCH/DELETE): 默认都要 token. 没有路径白名单豁免.
  Phase 3 review (P3-5): 历史 UNPROTECTED_PATH_PREFIXES 对所有方法豁免,
  当前没写路由所以不是现时漏洞, 但 future footgun: 谁未来在 /media 或
  /skills 下加 POST 就天然绕过保护. 现在收成 "读方法天然不需要, 写方法
  默认都要", 不留路径口子.
"""
from __future__ import annotations

import hmac
import logging
import os

log = logging.getLogger(__name__)

ADMIN_TOKEN_HEADER = "X-Admin-Token"
ADMIN_TOKEN_ENV = "ADMIN_TOKEN"

# 写方法集合 — 这些方法默认都需要 token (启用时)
WRITE_METHODS: frozenset[str] = frozenset({"POST", "PUT", "PATCH", "DELETE"})

# 读方法集合 — 永远不要 token
READ_METHODS: frozenset[str] = frozenset({"GET", "HEAD", "OPTIONS"})


def get_admin_token() -> str | None:
    """读 ADMIN_TOKEN 环境变量. 空字符串 / 全空白 → None (视为未配置)."""
    raw = os.environ.get(ADMIN_TOKEN_ENV)
    if not raw:
        return None
    raw = raw.strip()
    return raw or None


def request_needs_admin(method: str, path: str) -> bool:
    """该 (method, path) 是否需要 ADMIN_TOKEN 校验.

    Phase 3 review (P3-5):
      - 读方法 (GET/HEAD/OPTIONS): 永远 False (天然只读, 不论路径)
      - 写方法 (POST/PUT/PATCH/DELETE): 永远 True (不论路径)
      - 其它方法 (TRACE/CONNECT 等理论上不会到这): False (兜底)

    path 参数保留是为了 logging / 未来加 explicit (method, path) 白名单
    (如真要把某个 GET-like POST endpoint 公开, 在这里加显式判断).
    """
    m = (method or "").upper()
    if m in WRITE_METHODS:
        return True
    return False


def verify_admin_token(provided: str | None, configured: str | None) -> bool:
    """常量时间对比 provided 和 configured. 任一为空 → False."""
    if not provided or not configured:
        return False
    # hmac.compare_digest 防 timing attack
    return hmac.compare_digest(provided.encode("utf-8"), configured.encode("utf-8"))


def log_startup_state(configured: str | None) -> None:
    """启动时日志一次, 让运维一眼看到 token 模式. 不要 log token 内容."""
    if configured:
        log.info(
            "[admin_auth] ADMIN_TOKEN configured — write ops require %s",
            ADMIN_TOKEN_HEADER,
        )
    else:
        log.warning(
            "[admin_auth] ADMIN_TOKEN NOT SET — write ops are UNPROTECTED. "
            "Set ADMIN_TOKEN=<random> in .env before exposing this server beyond localhost.",
        )
