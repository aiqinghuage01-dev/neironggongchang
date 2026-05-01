"""Phase 2 · CORS 收口.

之前 backend/api.py 写死 allow_origins=["*"], 任何网页 (公网恶意页 / 本地
浏览器另一个 tab) 都能跨域调本服务. 这里把策略收口:

  dev (默认): 允许 http://localhost:8001 + http://127.0.0.1:8001 (前端 dev server),
             外加 ALLOWED_ORIGIN env 里追加的 origin (逗号分隔).
  prod:      必须显式设 ALLOWED_ORIGIN, 且不允许含 "*", 否则 raise → fail-fast.

env:
  APP_ENV          dev (默认) | prod
  ALLOWED_ORIGIN   逗号分隔 origin 列表, e.g. "https://a.com,https://b.com"
"""

from __future__ import annotations

import os

DEV_DEFAULT_ORIGINS: tuple[str, ...] = (
    "http://localhost:8001",
    "http://127.0.0.1:8001",
)


class CorsConfigError(RuntimeError):
    """prod 下 ALLOWED_ORIGIN 缺失或含 '*' 等致命配置错."""


def get_app_env() -> str:
    return (os.environ.get("APP_ENV") or "dev").strip().lower()


def parse_allowed_origin_env(raw: str | None) -> list[str]:
    if not raw:
        return []
    return [s.strip() for s in raw.split(",") if s.strip()]


def compute_allowed_origins() -> list[str]:
    """读 APP_ENV + ALLOWED_ORIGIN, 算出最终 CORS 白名单.

    返回非空 list. prod 下配置不合法时 raise CorsConfigError.
    """
    env = get_app_env()
    extras = parse_allowed_origin_env(os.environ.get("ALLOWED_ORIGIN"))

    if env == "prod":
        if not extras:
            raise CorsConfigError(
                "APP_ENV=prod 但 ALLOWED_ORIGIN 未设置. "
                "请在 .env 设 ALLOWED_ORIGIN=https://your.domain (逗号分隔多个)."
            )
        if "*" in extras:
            raise CorsConfigError(
                "APP_ENV=prod 不允许 ALLOWED_ORIGIN 含 '*'. "
                "请显式列出允许的 origin."
            )
        return extras

    # dev: 默认本机前端 + 用户追加 (忽略 "*" 防 dev 沾染坏习惯)
    out = list(DEV_DEFAULT_ORIGINS)
    for o in extras:
        if o == "*":
            continue
        if o not in out:
            out.append(o)
    return out
