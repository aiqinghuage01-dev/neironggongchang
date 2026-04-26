"""人设注入关卡层单元测试 — 不打真 API,用 FakeInner 拦截底层 chat 参数。

验证:
- persona.load_persona 精简/详细版体积在预期范围
- PersonaInjectedAI 正确拼接 persona + 调用方 system
- rewrite_script 走同一条关卡,携带任务规则和 deep 参数
"""
from __future__ import annotations

import pytest

from backend.services import persona
from shortvideo.ai import PersonaInjectedAI


class FakeInner:
    def __init__(self):
        self.last: dict | None = None

    def chat(self, prompt, *, system=None, temperature=0.7, max_tokens=2048):
        self.last = {
            "prompt": prompt,
            "system": system or "",
            "temperature": temperature,
            "max_tokens": max_tokens,
        }

        class R:
            text = "ok"
            prompt_tokens = 0
            completion_tokens = 0
            total_tokens = 0

        return R()


@pytest.fixture(autouse=True)
def _clear_cache():
    persona.clear_cache()
    yield
    persona.clear_cache()


def test_persona_short_exists_and_reasonable():
    # D-069: 关 include_memory, 单测精简版本身大小 (D-067 后默认会注入 work_log/preference 行为记忆)
    s = persona.load_persona(deep=False, include_memory=False)
    # 精简版不应为空,且体积落在预期区间
    assert s, "persona-prompt.md 空或不存在"
    assert 400 < len(s) < 2000, f"精简版长度异常: {len(s)}"
    assert "小华" in s, "精简版没带'小华'身份"


def test_persona_deep_much_larger_than_short():
    short = persona.load_persona(deep=False, include_memory=False)
    persona.clear_cache()
    full = persona.load_persona(deep=True, include_memory=False)
    # 详细版体积应显著大于精简版
    assert len(full) >= len(short) * 5, f"deep 版没注入详细人设: {len(full)} vs {len(short)}"


def test_wrapper_injects_persona_with_caller_system():
    fake = FakeInner()
    ai = PersonaInjectedAI(fake)
    ai.chat("你好", system="你是产品经理", deep=False)
    s = fake.last["system"]
    assert "小华" in s, "没注入人设"
    assert "产品经理" in s, "丢了调用方 system"
    assert "本次任务" in s, "没加任务分隔标题"


def test_wrapper_no_task_label_when_no_caller_system():
    fake = FakeInner()
    ai = PersonaInjectedAI(fake)
    ai.chat("回一个字", deep=True)
    s = fake.last["system"]
    assert "小华" in s
    assert "本次任务" not in s, "无调用方 system 时不该出现分隔标题"


def test_rewrite_script_carries_task_rules_and_deep_flag():
    fake = FakeInner()
    ai = PersonaInjectedAI(fake)
    ai.rewrite_script("原文内容", style_hint="口语", deep=False)
    s = fake.last["system"]
    p = fake.last["prompt"]
    assert "改写" in s and "规则" in s, "任务规则没注入"
    assert "原文内容" in p, "prompt 没带原文"
    assert "口语" in p, "prompt 没带 style_hint"


def test_rewrite_deep_vs_shallow_size_diff():
    fake_s = FakeInner()
    PersonaInjectedAI(fake_s).rewrite_script("原文", deep=False)
    fake_d = FakeInner()
    PersonaInjectedAI(fake_d).rewrite_script("原文", deep=True)
    assert len(fake_d.last["system"]) > len(fake_s.last["system"]) * 3, \
        "deep=True 应该显著增大 system prompt"
