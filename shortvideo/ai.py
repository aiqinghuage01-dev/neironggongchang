"""统一 AI 抽象层 + 工厂.

根据设置(settings.json)的 ai_engine 字段返回 DeepSeek / Claude Opus 客户端.
所有调 LLM 的代码(ad / moments / article / /api/rewrite)都通过 get_ai_client().
"""
from __future__ import annotations

from typing import Protocol

from .deepseek import DeepSeekClient, LLMResult
from .claude_opus import ClaudeOpusClient


class AIClient(Protocol):
    def chat(self, prompt: str, *, system: str | None = None, temperature: float = 0.7, max_tokens: int = 2048) -> LLMResult: ...
    def rewrite_script(self, original: str, style_hint: str = "") -> LLMResult: ...


def get_ai_client() -> AIClient:
    """根据设置返回 AI 客户端. 默认 Claude Opus via OpenClaw proxy."""
    try:
        from backend.services import settings as settings_service
        s = settings_service.get_all()
    except Exception:
        s = {}
    engine = (s.get("ai_engine") or "opus").lower()
    if engine == "deepseek":
        return DeepSeekClient()
    # 默认 opus
    return ClaudeOpusClient(
        base_url=s.get("opus_base_url") or None,
        api_key=s.get("opus_api_key") or None,
        model=s.get("opus_model") or None,
    )


def get_ai_info() -> dict:
    """当前 AI 引擎的元信息(给 /api/ai/health 用)."""
    try:
        from backend.services import settings as settings_service
        s = settings_service.get_all()
    except Exception:
        s = {}
    engine = (s.get("ai_engine") or "opus").lower()
    if engine == "deepseek":
        try:
            r = DeepSeekClient().chat("ping", max_tokens=5, temperature=0)
            return {"engine": "deepseek", "ok": True, "reply": r.text[:40]}
        except Exception as e:
            return {"engine": "deepseek", "ok": False, "error": str(e)}
    c = ClaudeOpusClient(
        base_url=s.get("opus_base_url") or None,
        api_key=s.get("opus_api_key") or None,
        model=s.get("opus_model") or None,
    )
    return {"engine": "opus", **c.health()}


def list_opus_models() -> list[str]:
    try:
        from backend.services import settings as settings_service
        s = settings_service.get_all()
    except Exception:
        s = {}
    c = ClaudeOpusClient(
        base_url=s.get("opus_base_url") or None,
        api_key=s.get("opus_api_key") or None,
    )
    return c.list_models()
