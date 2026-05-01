"""Phase 3 · ADMIN_TOKEN 写操作保护.

只在 backend 启用 ADMIN_TOKEN 时生效:
  - 未设 ADMIN_TOKEN: 保留本地旧行为 (任何人 POST/DELETE 都能写),
    启动时打 warning, 提醒部署到非本机环境必须设.
  - 设了:  所有写方法 (POST/PUT/PATCH/DELETE) 必须带 X-Admin-Token,
           不带或不对 → 401.

只读路径白名单 (永远不要 token):
  - 所有 GET/HEAD/OPTIONS
  - /api/health
  - /docs /openapi.json /redoc
  - /media/*  (Phase 1 已收口成只读白名单)
  - /skills/dhv5/* (现 StaticFiles, 只读)

OPTIONS preflight 不要 token (浏览器 SOP 不让 preflight 带自定义头).
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

# 始终放过的路径前缀, 不论方法. 前缀比较, 注意不要太宽 (避免误放).
UNPROTECTED_PATH_PREFIXES: tuple[str, ...] = (
    "/api/health",       # 健康探针
    "/docs",             # FastAPI Swagger UI
    "/openapi.json",     # FastAPI schema
    "/redoc",            # FastAPI ReDoc
    "/media/",           # Phase 1 收口的白名单只读
    "/skills/",          # 历史 mount, 只读
)


def get_admin_token() -> str | None:
    """读 ADMIN_TOKEN 环境变量. 空字符串 / 全空白 → None (视为未配置)."""
    raw = os.environ.get(ADMIN_TOKEN_ENV)
    if not raw:
        return None
    raw = raw.strip()
    return raw or None


def is_unprotected_path(path: str) -> bool:
    return any(path.startswith(p) for p in UNPROTECTED_PATH_PREFIXES)


def request_needs_admin(method: str, path: str) -> bool:
    """该 (method, path) 是否需要 ADMIN_TOKEN 校验.

    - 只读方法 (GET/HEAD/OPTIONS): 永远 False
    - 路径在白名单 UNPROTECTED_PATH_PREFIXES: False
    - 其余写方法: True
    """
    m = (method or "").upper()
    if m not in WRITE_METHODS:
        return False
    if is_unprotected_path(path or ""):
        return False
    return True


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
