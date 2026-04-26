"""Claude Opus 客户端 — 通过 OpenClaw proxy 走 Max 订阅.

OpenClaw proxy 提供 OpenAI 兼容接口:
  base_url:  http://localhost:3456/v1
  api_key:   "not-needed"(哨兵值,OpenClaw 不校验,但 OpenAI SDK 要求非空)
  endpoint:  /chat/completions
  models:    claude-opus-4-6 / claude-sonnet-4 / claude-haiku-4

与 DeepSeekClient 同构,共享 LLMResult 结构和 .chat / .rewrite_script 接口。
"""
from __future__ import annotations

import logging

import httpx
from openai import OpenAI

from .deepseek import LLMResult
from .llm_retry import with_retry

# 默认配置(设置页可覆盖)
DEFAULT_BASE_URL = "http://localhost:3456/v1"
DEFAULT_MODEL = "claude-opus-4-6"
DEFAULT_API_KEY = "not-needed"


class ClaudeOpusError(RuntimeError):
    pass


class ClaudeOpusClient:
    def __init__(self, base_url: str | None = None, api_key: str | None = None, model: str | None = None):
        self.base_url = base_url or DEFAULT_BASE_URL
        # 空字符串 / None 都用默认哨兵值(OpenAI SDK 要求非空)
        self.api_key = api_key if api_key else DEFAULT_API_KEY
        self.model = model or DEFAULT_MODEL
        # trust_env=False: 不读 macOS 系统代理(Clash/Surge/VPN 等)。
        # OpenClaw proxy 是 localhost,绝对不该走 system proxy,
        # 否则 httpx 把请求发给系统代理,代理看是 localhost 就返回 503。
        self._http_client = httpx.Client(trust_env=False, timeout=120)
        self._client = OpenAI(
            api_key=self.api_key,
            base_url=self.base_url,
            http_client=self._http_client,
        )

    def chat(
        self,
        prompt: str,
        *,
        system: str | None = None,
        temperature: float = 0.7,
        max_tokens: int = 4096,
    ) -> LLMResult:
        messages = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})
        # D-082c: transient 错误 (5xx / timeout / connection / rate limit) 自动重试 1 次
        try:
            resp = with_retry(
                lambda: self._client.chat.completions.create(
                    model=self.model,
                    messages=messages,
                    temperature=temperature,
                    max_tokens=max_tokens,
                ),
                max_retries=1,
                on_retry=lambda n, e: logging.getLogger("claude_opus").warning(
                    f"transient err, retrying #{n}: {str(e)[:150]}"
                ),
            )
        except Exception as e:
            raise ClaudeOpusError(f"Claude Opus 调用失败({self.base_url} · {self.model}): {e}") from e
        usage = resp.usage
        return LLMResult(
            text=resp.choices[0].message.content.strip() if resp.choices[0].message.content else "",
            prompt_tokens=getattr(usage, "prompt_tokens", 0) or 0,
            completion_tokens=getattr(usage, "completion_tokens", 0) or 0,
            total_tokens=getattr(usage, "total_tokens", 0) or 0,
        )

    def rewrite_script(self, original: str, style_hint: str = "") -> LLMResult:
        system = (
            "你是一位资深短视频口播文案编辑。"
            "任务:把用户给的原文改写成适合数字人口播的文案。"
            "规则:1) 保留核心观点和数据;2) 口语化、有节奏、有钩子;"
            "3) 删掉废话和官腔;4) 直接输出改写结果,不要任何前言。"
        )
        prompt = f"原文:\n{original}\n\n风格要求:{style_hint or '轻松口语'}"
        return self.chat(prompt, system=system, max_tokens=1500, temperature=0.8)

    def health(self) -> dict:
        try:
            r = self.chat("回复一个字:好", max_tokens=5, temperature=0)
            return {"ok": True, "reply": r.text[:40], "base_url": self.base_url, "model": self.model, "tokens": r.total_tokens}
        except ClaudeOpusError as e:
            return {"ok": False, "error": str(e), "base_url": self.base_url, "model": self.model}

    def list_models(self) -> list[str]:
        """拉可用模型列表(供设置页下拉)."""
        try:
            models = self._client.models.list()
            return [m.id for m in models.data]
        except Exception:
            return []
