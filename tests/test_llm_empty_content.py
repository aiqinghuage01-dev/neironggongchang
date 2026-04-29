"""LLM 空 content 保护测试 (D-088).

历史 case (b72844d1f97...): Opus 通过 OpenClaw proxy 偶发返回 200 + completion_tokens=6558
但 content="". 自检在空文章上还硬给了 107/120 通过 + 编出"文章整体调性到位"总评.
老板看到 "0 字 · write 6558 tok · 自检通过" 的空白页面 — 完全误导.

fix:
  - shortvideo/claude_opus.py + shortvideo/deepseek.py: 空 content + completion_tokens>0
    抛 TransientLLMError → with_retry 重试 1 次. 持续空才向上抛.
  - backend/services/wechat_pipeline.py:write_article: 兜底 raise RuntimeError, 不进自检.
"""
from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest


def _fake_resp(content: str | None, completion_tokens: int = 0, prompt_tokens: int = 100):
    """构造 OpenAI ChatCompletion 风格响应."""
    msg = MagicMock()
    msg.content = content
    choice = MagicMock()
    choice.message = msg
    usage = MagicMock()
    usage.prompt_tokens = prompt_tokens
    usage.completion_tokens = completion_tokens
    usage.total_tokens = prompt_tokens + completion_tokens
    resp = MagicMock()
    resp.choices = [choice]
    resp.usage = usage
    return resp


@pytest.fixture(autouse=True)
def _fast_backoff(monkeypatch):
    """跳过 with_retry 内部 time.sleep 的指数退避, 让测试秒级跑完."""
    import shortvideo.llm_retry as _lr
    monkeypatch.setattr(_lr.time, "sleep", lambda _s: None)


# ─── shortvideo/claude_opus.py ─────────────────────────────


def test_claude_opus_empty_content_with_tokens_retries_then_succeeds():
    """空 content + completion_tokens>0 → 第 1 次抛 TransientLLMError, with_retry 重试 → 第 2 次正常."""
    from shortvideo.claude_opus import ClaudeOpusClient
    c = ClaudeOpusClient()
    calls = []
    def create_side_effect(**_kwargs):
        calls.append(1)
        if len(calls) == 1:
            return _fake_resp(content="", completion_tokens=6558)  # 复刻线上 case
        return _fake_resp(content="正常长文 hello world", completion_tokens=20)
    c._client = MagicMock()
    c._client.chat.completions.create = MagicMock(side_effect=create_side_effect)

    r = c.chat("hello")
    assert r.text == "正常长文 hello world"
    assert len(calls) == 2  # 重试了一次


def test_claude_opus_empty_content_persists_raises():
    """两次都返回空 → 抛 ClaudeOpusError, 错误信息含具体 token 数."""
    from shortvideo.claude_opus import ClaudeOpusClient, ClaudeOpusError
    c = ClaudeOpusClient()
    c._client = MagicMock()
    c._client.chat.completions.create = MagicMock(
        return_value=_fake_resp(content="", completion_tokens=6558)
    )

    with pytest.raises(ClaudeOpusError) as ei:
        c.chat("hello")
    assert "6558" in str(ei.value)


def test_claude_opus_failfast_client_does_not_outer_retry_empty_content():
    """快出类 fail-fast 客户端禁用项目外层重试,避免一个故障等两轮。"""
    from shortvideo.claude_opus import ClaudeOpusClient, ClaudeOpusError
    c = ClaudeOpusClient(llm_max_retries=0)
    c._client = MagicMock()
    create = MagicMock(return_value=_fake_resp(content="", completion_tokens=6558))
    c._client.chat.completions.create = create

    with pytest.raises(ClaudeOpusError):
        c.chat("hello")
    assert create.call_count == 1


def test_claude_opus_empty_content_with_zero_tokens_returns_empty_no_retry():
    """空 content + completion_tokens=0 (合法的 0-output 路径) → 不重试, 返回空 text."""
    from shortvideo.claude_opus import ClaudeOpusClient
    c = ClaudeOpusClient()
    c._client = MagicMock()
    create = MagicMock(return_value=_fake_resp(content="", completion_tokens=0))
    c._client.chat.completions.create = create

    r = c.chat("hello")
    assert r.text == ""
    assert create.call_count == 1  # 没重试


def test_claude_opus_none_content_handled():
    """content=None (上游漏字段) + completion_tokens=0 → 不抛 AttributeError, 返回空 text."""
    from shortvideo.claude_opus import ClaudeOpusClient
    c = ClaudeOpusClient()
    c._client = MagicMock()
    c._client.chat.completions.create = MagicMock(
        return_value=_fake_resp(content=None, completion_tokens=0)
    )
    r = c.chat("hello")
    assert r.text == ""


def test_claude_opus_normal_path_no_retry():
    """正常返回非空 content → 一次过, 不重试."""
    from shortvideo.claude_opus import ClaudeOpusClient
    c = ClaudeOpusClient()
    c._client = MagicMock()
    create = MagicMock(return_value=_fake_resp(content="hello", completion_tokens=2))
    c._client.chat.completions.create = create

    r = c.chat("hi")
    assert r.text == "hello"
    assert create.call_count == 1


# ─── shortvideo/deepseek.py ─────────────────────────────────


def test_deepseek_empty_content_with_tokens_retries_then_succeeds():
    from shortvideo.deepseek import DeepSeekClient
    ds = DeepSeekClient()
    calls = []
    def create_side_effect(**_kwargs):
        calls.append(1)
        if len(calls) == 1:
            return _fake_resp(content="", completion_tokens=4096)
        return _fake_resp(content="rewritten text", completion_tokens=5)
    ds._client = MagicMock()
    ds._client.chat.completions.create = MagicMock(side_effect=create_side_effect)

    r = ds.chat("hi")
    assert r.text == "rewritten text"
    assert len(calls) == 2


def test_openai_sdk_retries_are_disabled_in_llm_clients():
    """T-021: OpenAI SDK 自带重试必须关掉,只保留项目自己可控的 LLM retry。"""
    from shortvideo.claude_opus import ClaudeOpusClient
    from shortvideo.deepseek import DeepSeekClient

    c = ClaudeOpusClient()
    ds = DeepSeekClient(api_key="test")

    assert c.sdk_max_retries == 0
    assert c._client.max_retries == 0
    assert ds.sdk_max_retries == 0
    assert ds._client.max_retries == 0


def test_deepseek_none_content_no_attribute_error():
    """旧 code (D-088 前) 在 content=None 时 .strip() 直接 AttributeError. 新 code 用 'or "" '."""
    from shortvideo.deepseek import DeepSeekClient
    ds = DeepSeekClient()
    ds._client = MagicMock()
    ds._client.chat.completions.create = MagicMock(
        return_value=_fake_resp(content=None, completion_tokens=0)
    )
    r = ds.chat("hi")
    assert r.text == ""


# ─── backend/services/wechat_pipeline.write_article ────────


def test_write_article_raises_on_empty_content_skipping_self_check():
    """write_article 拿到空 content → 不跑自检直接 raise.

    防止历史 bug: 自检在空文章上 hallucinate 107/120 通过 + 编"总评".
    """
    from backend.services import wechat_pipeline

    fake_write_r = MagicMock(text="", total_tokens=6600)
    fake_write_ai = MagicMock()
    fake_write_ai.chat = MagicMock(return_value=fake_write_r)

    check_called = []
    fake_check_ai = MagicMock()
    def check_chat(*a, **kw):
        check_called.append(1)
        return MagicMock(text="{}", total_tokens=200)
    fake_check_ai.chat = MagicMock(side_effect=check_chat)

    def get_ai_client_mock(route_key=None, **_):
        if route_key == "wechat.self-check":
            return fake_check_ai
        return fake_write_ai

    with patch.object(wechat_pipeline, "get_ai_client", side_effect=get_ai_client_mock), \
         patch.object(wechat_pipeline.skill_loader, "load_skill", return_value={
             "references": {
                 "who-is-qinghuage": "persona",
                 "writing-methodology": "method",
                 "style-bible": "style",
             }
         }):
        with pytest.raises(RuntimeError) as ei:
            wechat_pipeline.write_article(
                topic="t", title="标题",
                outline={
                    "opening": "x",
                    "core_points": ["a"],
                    "business_bridge": "b",
                    "closing": "c",
                },
            )

    assert "空内容" in str(ei.value)
    assert "6600" in str(ei.value)
    assert not check_called, "空文章不应进自检, 否则 DeepSeek 会脑补 107/120"


# ─── D-092 hotrewrite + voicerewrite 同款 fail-fast (D-088 举一反三) ─────────


def test_hotrewrite_write_script_raises_on_empty_content():
    """hotrewrite_pipeline.write_script 空 content → raise, 不进自检 (D-088 同款防护)."""
    from backend.services import hotrewrite_pipeline

    fake_write_r = MagicMock(text="", total_tokens=5500)
    fake_write_ai = MagicMock()
    fake_write_ai.chat = MagicMock(return_value=fake_write_r)

    check_called = []
    fake_check_ai = MagicMock()
    fake_check_ai.chat = MagicMock(side_effect=lambda *a, **kw: check_called.append(1) or MagicMock(text="{}", total_tokens=200))

    def get_ai_client_mock(route_key=None, **_):
        if route_key == "hotrewrite.self-check":
            return fake_check_ai
        return fake_write_ai

    fake_skill = {
        "skill_md": "skill body",
        "references": {"who-is-qinghuage": "p", "writing-methodology": "m"},
    }
    with patch.object(hotrewrite_pipeline, "get_ai_client", side_effect=get_ai_client_mock), \
         patch.object(hotrewrite_pipeline.skill_loader, "load_skill", return_value=fake_skill):
        with pytest.raises(RuntimeError) as ei:
            hotrewrite_pipeline.write_script(
                hotspot="某热点",
                breakdown={"event_core": "x", "conflict": "y", "emotion": "z"},
                angle={"label": "L", "audience": "A", "draft_hook": "H"},
            )
    assert "空内容" in str(ei.value)
    assert "5500" in str(ei.value)
    assert not check_called, "hotrewrite 空 content 不应进自检"


def test_voicerewrite_write_script_raises_on_empty_content():
    """voicerewrite_pipeline.write_script 空 script → raise, 不返伪结果让 task ok 含空文."""
    from backend.services import voicerewrite_pipeline

    # voicerewrite 单次 LLM 输出 JSON, 模拟 LLM 返空字符串
    fake_r = MagicMock(text='{"script": "", "word_count": 0, "self_check": {"overall_pass": true}}', total_tokens=4000)
    fake_ai = MagicMock()
    fake_ai.chat = MagicMock(return_value=fake_r)

    fake_skill = {
        "skill_md": "skill body",
        "references": {"who-is-qinghuage": "p", "transcript-checklist": "c"},
    }
    with patch.object(voicerewrite_pipeline, "get_ai_client", return_value=fake_ai), \
         patch.object(voicerewrite_pipeline.skill_loader, "load_skill", return_value=fake_skill):
        with pytest.raises(RuntimeError) as ei:
            voicerewrite_pipeline.write_script(
                transcript="录音转写文本",
                skeleton={"core_view": "x", "key_experiences": ["a"], "insights": ["b"], "weak_to_delete": [], "tone_anchors": []},
                angle={"label": "L", "why": "w", "opening_draft": "O"},
            )
    assert "空" in str(ei.value)
    assert "4000" in str(ei.value)


def test_hotrewrite_normal_content_no_raise():
    """hotrewrite 正常内容路径不抛 (回归保护, 防 fail-fast 误伤)."""
    from backend.services import hotrewrite_pipeline

    fake_write_r = MagicMock(text="正常的热点改写文案" * 100, total_tokens=5500)
    fake_check_r = MagicMock(text='{"pass": true, "summary": "ok"}', total_tokens=300)
    fake_write_ai = MagicMock()
    fake_write_ai.chat = MagicMock(return_value=fake_write_r)
    fake_check_ai = MagicMock()
    fake_check_ai.chat = MagicMock(return_value=fake_check_r)

    def get_ai_client_mock(route_key=None, **_):
        return fake_check_ai if route_key == "hotrewrite.self-check" else fake_write_ai

    fake_skill = {
        "skill_md": "skill body",
        "references": {"who-is-qinghuage": "p", "writing-methodology": "m"},
    }
    with patch.object(hotrewrite_pipeline, "get_ai_client", side_effect=get_ai_client_mock), \
         patch.object(hotrewrite_pipeline.skill_loader, "load_skill", return_value=fake_skill):
        r = hotrewrite_pipeline.write_script(
            hotspot="某热点",
            breakdown={"event_core": "x", "conflict": "y", "emotion": "z"},
            angle={"label": "L", "audience": "A", "draft_hook": "H"},
        )
    assert r["content"]
    assert r["word_count"] > 0
    assert r["self_check"]["pass"] is True
