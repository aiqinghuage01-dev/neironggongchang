"""统一 AI 抽象层 + 工厂 + 人设注入关卡层。

所有调 LLM 的代码都通过 get_ai_client()。返回的是 PersonaInjectedAI 包装器,
自动把清华哥人设拼到每次调用的 system prompt。

两档(由调用方传 deep 参数):
  deep=True  (默认): 精简人设 + 4 个详细人设 (~7500 token)
  deep=False:        只精简人设 (~300 token)

未来新技能只要通过 get_ai_client().chat(..., deep=...) 调用,自动继承人设注入。
人设加载细节见 backend.services.persona。
"""
from __future__ import annotations

from typing import Protocol

from .deepseek import DeepSeekClient, LLMResult
from .claude_opus import ClaudeOpusClient


class RawAIClient(Protocol):
    def chat(self, prompt: str, *, system: str | None = None, temperature: float = 0.7, max_tokens: int = 2048) -> LLMResult: ...
    def rewrite_script(self, original: str, style_hint: str = "") -> LLMResult: ...


class PersonaInjectedAI:
    """关卡层:拦截 chat / rewrite_script,在 system prompt 前注入人设。"""

    def __init__(self, inner):
        self._inner = inner

    @property
    def raw(self):
        """漏出底层客户端(极少用,仅用于绕过人设注入做探活等)。"""
        return self._inner

    def chat(
        self,
        prompt: str,
        *,
        system: str | None = None,
        deep: bool = True,
        temperature: float = 0.7,
        max_tokens: int = 2048,
    ) -> LLMResult:
        from backend.services import persona as persona_service

        persona = persona_service.load_persona(deep=deep)
        if persona and system:
            merged = f"{persona}\n\n---\n\n# 本次任务\n\n{system}"
        elif persona:
            merged = persona
        else:
            merged = system

        return self._inner.chat(
            prompt,
            system=merged,
            temperature=temperature,
            max_tokens=max_tokens,
        )

    def rewrite_script(
        self,
        original: str,
        style_hint: str = "",
        *,
        deep: bool = True,
    ) -> LLMResult:
        """改写短视频口播文案。身份由人设定义,这里只给任务规则。"""
        task_system = (
            "现在你要做的事:把原文改写成适合数字人口播的文案。\n"
            "规则:\n"
            "1) 保留核心观点和数据\n"
            "2) 口语化、有节奏、有钩子\n"
            "3) 禁止使用 markdown 符号和 emoji\n"
            "4) 分句要短,适合跟读\n"
            "5) 篇幅和原文相近\n"
            "6) 直接输出改写结果,不要任何前言"
        )
        prompt = (
            f"原文:\n{original}\n\n"
            + (f"风格提示:{style_hint}\n\n" if style_hint else "")
            + "改写后文案:"
        )
        return self.chat(
            prompt,
            system=task_system,
            deep=deep,
            temperature=0.8,
            max_tokens=2000,
        )


def _build_raw_client():
    try:
        from backend.services import settings as settings_service
        s = settings_service.get_all()
    except Exception:
        s = {}
    engine = (s.get("ai_engine") or "opus").lower()
    if engine == "deepseek":
        return DeepSeekClient()
    return ClaudeOpusClient(
        base_url=s.get("opus_base_url") or None,
        api_key=s.get("opus_api_key") or None,
        model=s.get("opus_model") or None,
    )


def get_ai_client() -> PersonaInjectedAI:
    """获取带人设注入关卡层的 AI 客户端。所有内容生产应该走这里。"""
    return PersonaInjectedAI(_build_raw_client())


def get_ai_info() -> dict:
    """当前 AI 引擎的元信息(给 /api/ai/health 用)。探活不需要人设。"""
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
