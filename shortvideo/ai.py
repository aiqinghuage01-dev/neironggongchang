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

    def __init__(self, inner, route_key: str | None = None):
        self._inner = inner
        self._route_key = route_key
        # 探测 engine 名字,用于 usage 打点
        cls = type(inner).__name__.lower()
        self._engine_name = "opus" if "opus" in cls else ("deepseek" if "deepseek" in cls else "unknown")

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
        import time as _t

        persona = persona_service.load_persona(deep=deep)
        # D-031: deep=True 时附加行为记忆(默认 disabled,settings 开关)
        if deep:
            try:
                from backend.services import memory_inject
                mem = memory_inject.load_recent_memory()
                if mem:
                    persona = (persona or "") + "\n\n---\n\n" + mem
            except Exception:
                pass
        if persona and system:
            merged = f"{persona}\n\n---\n\n# 本次任务\n\n{system}"
        elif persona:
            merged = persona
        else:
            merged = system

        t0 = _t.time()
        ok = True
        err_msg = None
        try:
            r = self._inner.chat(
                prompt,
                system=merged,
                temperature=temperature,
                max_tokens=max_tokens,
            )
            return r
        except Exception as e:
            ok = False
            err_msg = f"{type(e).__name__}: {e}"
            raise
        finally:
            try:
                from backend.services import ai_usage
                ai_usage.record_call(
                    engine=self._engine_name,
                    route_key=self._route_key,
                    prompt_tokens=getattr(r, "prompt_tokens", 0) if ok else 0,
                    completion_tokens=getattr(r, "completion_tokens", 0) if ok else 0,
                    duration_ms=int((_t.time() - t0) * 1000),
                    ok=ok,
                    error=err_msg,
                )
            except Exception:
                pass
            # D-023: 行为记忆写入小华工作日志.md(默认 disabled,settings 开关)
            try:
                from backend.services import work_log
                work_log.maybe_log(
                    route_key=self._route_key,
                    engine=self._engine_name,
                    prompt_brief=prompt[:200] if isinstance(prompt, str) else "",
                    response_brief=getattr(r, "text", "")[:300] if ok else "",
                    tokens=getattr(r, "total_tokens", 0) if ok else 0,
                    ok=ok,
                )
            except Exception:
                pass

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



# ─── 引擎智能路由(2026-04-25) ───────────────────────────
# 默认路由表:轻任务走 DeepSeek(快 10-20 倍),重任务走 Opus(质量)
# 用户可在 settings.json 的 engine_routes 覆盖,或显式传 route_key
# route_key = None 时回退到 settings.ai_engine(全局引擎)
DEFAULT_ENGINE_ROUTES = {
    # 公众号 skill (D-010)
    "wechat.titles":      "deepseek",   # 3 个标题候选,3.6s vs Opus 68s
    "wechat.outline":     "deepseek",   # 5 字段大纲,4.9s vs Opus 25s
    "wechat.write":       "opus",       # 2000-3000 字长文,质量差异明显
    "wechat.self-check":  "deepseek",   # JSON 结构化检查,deepseek 够用
    "wechat.plan-images": "deepseek",   # 配图 prompt 规划,短文本
    # 热点文案改写V2 skill (D-012)
    "hotrewrite.analyze":    "deepseek",  # 拆解 + 3 角度,JSON 输出
    "hotrewrite.write":      "opus",      # 1800-2600 字口播正文,质量优先
    "hotrewrite.self-check": "deepseek",  # 六维自检
    # 录音文案改写 skill (D-013)
    "voicerewrite.analyze":  "deepseek",  # 提骨架 + 2 角度
    "voicerewrite.write":    "opus",      # 改写 + 自检一次性出,opus 质量稳
    # touliu-agent skill (D-014) 替换旧 ad.generate
    "touliu.generate":       "opus",      # 10 条 × 400-650 字,一次性大批量,opus 稳
    # 短视频 / 改写
    "rewrite":            "opus",       # 短视频口播文案,风格决定
    # 批量生成类
    "ad.generate":        "opus",       # 投流文案,长文风险
    "moments.derive":     "deepseek",   # 朋友圈短文,快就行
    "article.outline":    "deepseek",
    "article.expand":     "opus",       # 长文
    "topics.generate":    "deepseek",   # 选题列表,短 JSON
    # content-planner skill (D-017 骨架)
    "planner.analyze":    "deepseek",
    "planner.write":      "opus",
    # 违禁违规审查-学员版 skill (D-026) · 单 step 审查+改写
    "compliance.check":      "opus",      # 一次出 report + 2 版改写,质量重要
    # 小华自由对话 (D-027)
    "chat.dock":             "deepseek",   # 对话短而频,DeepSeek 够 + 便宜
    # 偏好学习 (D-030)
    "preference.learn":      "deepseek",   # 二筛精炼,JSON 短输出
    "compliance.analyze":    "deepseek",  # 兼容 add_skill 骨架路径
    "compliance.write":      "opus",      # 同上
}


def _resolve_engine(route_key: str | None) -> str:
    """根据 route_key 决定用哪个引擎。优先级:
    1. settings.engine_routes[route_key] — 用户自定义覆盖
    2. DEFAULT_ENGINE_ROUTES[route_key] — 代码里内置的默认
    3. settings.ai_engine — 全局引擎
    4. "opus" — 最终默认
    """
    try:
        from backend.services import settings as settings_service
        s = settings_service.get_all()
    except Exception:
        s = {}
    user_routes = s.get("engine_routes") or {}
    if route_key:
        if route_key in user_routes and user_routes[route_key]:
            return str(user_routes[route_key]).lower()
        if route_key in DEFAULT_ENGINE_ROUTES:
            return DEFAULT_ENGINE_ROUTES[route_key]
    return (s.get("ai_engine") or "opus").lower()


def _build_raw_client(engine: str):
    try:
        from backend.services import settings as settings_service
        s = settings_service.get_all()
    except Exception:
        s = {}
    if engine == "deepseek":
        return DeepSeekClient()
    return ClaudeOpusClient(
        base_url=s.get("opus_base_url") or None,
        api_key=s.get("opus_api_key") or None,
        model=s.get("opus_model") or None,
    )


def get_ai_client(route_key: str | None = None) -> PersonaInjectedAI:
    """获取带人设注入关卡层的 AI 客户端。

    route_key: 用于智能路由 + usage 打点,如 "wechat.titles" / "rewrite"。
      不传则用 settings.ai_engine 全局引擎。
    """
    engine = _resolve_engine(route_key)
    return PersonaInjectedAI(_build_raw_client(engine), route_key=route_key)


def routes_info() -> dict:
    """供前端设置页显示当前的路由表。"""
    try:
        from backend.services import settings as settings_service
        s = settings_service.get_all()
    except Exception:
        s = {}
    user_routes = s.get("engine_routes") or {}
    resolved = {}
    for k in DEFAULT_ENGINE_ROUTES:
        resolved[k] = {
            "default": DEFAULT_ENGINE_ROUTES[k],
            "override": user_routes.get(k),
            "effective": _resolve_engine(k),
        }
    return {
        "global_engine": (s.get("ai_engine") or "opus").lower(),
        "routes": resolved,
    }


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
