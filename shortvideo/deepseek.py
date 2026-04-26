"""DeepSeek LLM 客户端 - 用 OpenAI SDK 兼容调用。

文案改写 / 标题生成 / 爆款解析,都走这里。
"""
from __future__ import annotations

import logging
from dataclasses import dataclass

from openai import OpenAI

from .config import settings
from .llm_retry import with_retry


@dataclass
class LLMResult:
    text: str
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int


class DeepSeekClient:
    # D-068: 显式 timeout=120s. 之前用 SDK 默认 (10 min), 上游卡住要等 10 分钟
    # 才能让 watchdog 介入. 120s 后客户端层先抛, worker 直接 finish_task(failed)
    # 路径正常, UI 立刻看到失败原因.
    DEFAULT_TIMEOUT = 120.0

    def __init__(self, api_key: str | None = None, base_url: str | None = None, model: str | None = None,
                 timeout: float | None = None):
        self.model = model or settings.deepseek_model
        self._client = OpenAI(
            api_key=api_key or settings.deepseek_api_key,
            base_url=base_url or settings.deepseek_base_url,
            timeout=timeout or self.DEFAULT_TIMEOUT,
        )

    def chat(
        self,
        prompt: str,
        *,
        system: str | None = None,
        temperature: float = 0.7,
        max_tokens: int = 2048,
    ) -> LLMResult:
        messages = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})
        # D-082c: transient (5xx / timeout / rate limit / network) 自动重试 1 次
        resp = with_retry(
            lambda: self._client.chat.completions.create(
                model=self.model,
                messages=messages,
                temperature=temperature,
                max_tokens=max_tokens,
            ),
            max_retries=1,
            on_retry=lambda n, e: logging.getLogger("deepseek").warning(
                f"transient err, retrying #{n}: {str(e)[:150]}"
            ),
        )
        usage = resp.usage
        return LLMResult(
            text=resp.choices[0].message.content.strip(),
            prompt_tokens=usage.prompt_tokens,
            completion_tokens=usage.completion_tokens,
            total_tokens=usage.total_tokens,
        )

    def rewrite_script(self, original: str, style_hint: str = "") -> LLMResult:
        system = (
            "你是一位资深短视频口播文案编辑。"
            "任务:把用户给的原文改写成适合数字人口播的文案。"
            "规则:1) 保留核心观点和数据;2) 口语化、有节奏、有钩子;"
            "3) 禁止使用markdown符号和emoji;4) 分句要短,适合跟读;"
            "5) 篇幅和原文相近。"
        )
        prompt = f"原文:\n{original}\n\n" + (f"风格提示:{style_hint}\n\n" if style_hint else "") + "改写后文案:"
        return self.chat(prompt, system=system, temperature=0.75, max_tokens=2000)

    def generate_titles(self, script: str, count: int = 5) -> LLMResult:
        system = (
            "你是小红书/抖音爆款标题专家。根据给定文案,生成吸引点击的标题。"
            "规则:1) 每条标题不超过20字;"
            "2) 使用强钩子(疑问/反常识/悬念/利益);"
            "3) 禁用 emoji 和 markdown;"
            "4) 输出格式: 每行一个标题,不要编号。"
        )
        prompt = f"文案:\n{script}\n\n生成 {count} 个候选标题:"
        return self.chat(prompt, system=system, temperature=0.9, max_tokens=600)

    def extract_key_points(self, transcript: str) -> LLMResult:
        system = "你是一个精炼的文案提取助手,从长文本中提取可直接用于口播的核心观点。"
        prompt = (
            "从下面文本中提取适合做成 60-90 秒短视频口播的核心内容。"
            "输出一段连贯的口播文案,不要分点,不要markdown:\n\n" + transcript
        )
        return self.chat(prompt, system=system, temperature=0.5, max_tokens=1500)
