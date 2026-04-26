"""访客模式测试 (D-070).

验证:
1. guest_mode contextvar 默认 False
2. set_guest / reset / capture 行为
3. work_log.maybe_log 在访客时短路
4. preference.maybe_learn 在访客时短路
5. tasks._autoinsert_text_work 在访客时短路
6. PersonaInjectedAI.chat 在访客时切中性 system
"""
from __future__ import annotations

from unittest.mock import patch, MagicMock

import pytest


def test_default_not_guest():
    from backend.services import guest_mode
    assert guest_mode.is_guest() is False


def test_set_and_reset():
    from backend.services import guest_mode
    assert guest_mode.is_guest() is False
    token = guest_mode.set_guest(True)
    assert guest_mode.is_guest() is True
    guest_mode.reset(token)
    assert guest_mode.is_guest() is False


def test_capture_returns_current():
    from backend.services import guest_mode
    assert guest_mode.capture() is False
    token = guest_mode.set_guest(True)
    assert guest_mode.capture() is True
    guest_mode.reset(token)


def test_work_log_skips_in_guest_mode():
    from backend.services import work_log, guest_mode
    token = guest_mode.set_guest(True)
    try:
        # 即便 _is_enabled / _passes_throttle 都开, guest 直接跳过
        with patch.object(work_log, "_is_enabled", return_value=True), \
             patch.object(work_log, "_passes_throttle", return_value=True), \
             patch.object(work_log, "LOG_PATH") as mock_path:
            mock_path.parent.exists.return_value = True
            mock_path.exists.return_value = False
            work_log.maybe_log(
                route_key="test", engine="opus",
                prompt_brief="x", response_brief="y", tokens=500, ok=True,
            )
            # 没写
            mock_path.write_text.assert_not_called()
    finally:
        guest_mode.reset(token)


def test_preference_skips_in_guest_mode():
    from backend.services import preference, guest_mode
    token = guest_mode.set_guest(True)
    try:
        r = preference.maybe_learn(
            messages=[{"role": "user", "text": "我希望文案带钩子"}],
        )
        assert r.get("skipped") == "guest_mode"
    finally:
        guest_mode.reset(token)


def test_autoinsert_text_work_skips_in_guest():
    from backend.services import tasks, guest_mode
    token = guest_mode.set_guest(True)
    try:
        with patch("shortvideo.works.insert_work") as mock_insert:
            tasks._autoinsert_text_work(
                kind="hotrewrite.write",
                label="测试",
                task_id="t1",
                result={"content": "x" * 100},
            )
            mock_insert.assert_not_called()
    finally:
        guest_mode.reset(token)


def test_persona_injected_uses_neutral_in_guest():
    """访客模式下 PersonaInjectedAI.chat 走中性人设, 不注入 '清华哥'"""
    from shortvideo.ai import PersonaInjectedAI
    from backend.services import guest_mode

    fake_inner = MagicMock()
    fake_inner.chat = MagicMock(return_value=MagicMock(
        text="ok", prompt_tokens=10, completion_tokens=5, total_tokens=15,
    ))
    type(fake_inner).__name__ = "DeepSeekClient"

    ai = PersonaInjectedAI(fake_inner)

    token = guest_mode.set_guest(True)
    try:
        ai.chat("写一段产品介绍", system="任务: 写美容仪文案")
    finally:
        guest_mode.reset(token)

    call_kwargs = fake_inner.chat.call_args.kwargs
    merged_system_guest = call_kwargs.get("system") or ""
    # 访客模式 system 应该轻量 (中性写作助手 ~100 字 + 调用方 system, 远小于真清华哥人设几千字)
    assert "中文写作助手" in merged_system_guest, "访客模式应有中性写作助手 system"
    assert "美容仪" in merged_system_guest, "调用方 system 还要被合并"
    assert len(merged_system_guest) < 600, f"访客模式 system 应该轻量, 实际 {len(merged_system_guest)} 字"

    # 对照: 非访客模式 system 应显著大 (注入了真清华哥人设)
    fake_inner.reset_mock()
    ai.chat("写一段产品介绍", system="任务: 写美容仪文案", deep=False)
    call_kwargs2 = fake_inner.chat.call_args.kwargs
    merged_system_normal = call_kwargs2.get("system") or ""
    assert len(merged_system_normal) > len(merged_system_guest) * 1.5, \
        f"非访客模式应注入真人设, 应远大于访客模式 ({len(merged_system_normal)} vs {len(merged_system_guest)})"
