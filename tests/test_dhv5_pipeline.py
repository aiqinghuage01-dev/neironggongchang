"""dhv5_pipeline 测试 (D-059a).

skill 在 ~/Desktop/skills/digital-human-video-v5/ — 假设清华哥的开发机有这个目录.
没这个目录的环境跳过 (CI 没有).
真渲染不测 (3-10 分钟 + 需要 ffmpeg + 数字人 mp4).
"""
from __future__ import annotations

from pathlib import Path

import pytest

from backend.services import dhv5_pipeline


SKILL_AVAILABLE = dhv5_pipeline.SKILL_ROOT.exists() and (dhv5_pipeline.TEMPLATES_DIR / "01-peixun-gaoxiao.yaml").exists()
skip_no_skill = pytest.mark.skipif(not SKILL_AVAILABLE, reason="dhv5 skill 不存在 (开发机才有)")


# ─── 纯函数单元 ───────────────────────────────────────────────

def test_estimate_duration_sec_max_end():
    scenes = [
        {"type": "A", "start": 0, "end": 3.6},
        {"type": "B", "start": 3.6, "end": 8.0},
        {"type": "A", "start": 8.0, "end": 14.0},
    ]
    assert dhv5_pipeline._estimate_duration_sec(scenes) == 14.0


def test_estimate_duration_sec_empty():
    assert dhv5_pipeline._estimate_duration_sec([]) == 0.0


def test_estimate_duration_sec_missing_end():
    assert dhv5_pipeline._estimate_duration_sec([{"type": "A"}]) == 0.0


def test_estimate_word_budget_chinese_speech():
    # ~3.5 字/秒 中文口播
    assert dhv5_pipeline._estimate_word_budget(10) == 35
    assert dhv5_pipeline._estimate_word_budget(22.0) == 77  # 22s ≈ 培训模板
    assert dhv5_pipeline._estimate_word_budget(60) == 210


def test_scene_breakdown_counts():
    scenes = [
        {"type": "A"}, {"type": "B"}, {"type": "A"},
        {"type": "C"}, {"type": "B"}, {"type": "A"},
    ]
    assert dhv5_pipeline._scene_breakdown(scenes) == {"A": 3, "B": 2, "C": 1}


def test_scene_breakdown_lowercase_normalize():
    assert dhv5_pipeline._scene_breakdown([{"type": "a"}, {"type": "b"}]) == {"A": 1, "B": 1, "C": 0}


def test_scene_breakdown_unknown_type_skipped():
    assert dhv5_pipeline._scene_breakdown([{"type": "X"}, {"type": "A"}]) == {"A": 1, "B": 0, "C": 0}


# ─── 真 skill 集成 (有目录才跑) ────────────────────────────────

@skip_no_skill
def test_list_templates_returns_at_least_one():
    out = dhv5_pipeline.list_templates()
    assert len(out) >= 1
    # 第一个模板应该有完整字段
    t = out[0]
    assert "id" in t
    assert "name" in t
    assert "duration_sec" in t
    assert "word_budget" in t
    assert "scene_count" in t
    assert "scenes_breakdown" in t
    assert "category" in t


@skip_no_skill
def test_list_templates_first_is_peixun_gaoxiao():
    out = dhv5_pipeline.list_templates()
    ids = [t["id"] for t in out]
    assert "01-peixun-gaoxiao" in ids
    p = next(t for t in out if t["id"] == "01-peixun-gaoxiao")
    # 这模板 ~50s · 全长口播篇幅
    assert 30 < p["duration_sec"] < 80
    assert p["scene_count"] >= 6
    assert 100 < p["word_budget"] < 300
    # A/B/C 三态都有
    sb = p["scenes_breakdown"]
    assert sb["A"] >= 1
    assert sb["B"] >= 1


@skip_no_skill
def test_load_template_full_returns_yaml_data():
    full = dhv5_pipeline.load_template_full("01-peixun-gaoxiao")
    assert full["id"] == "01-peixun-gaoxiao"
    assert "scenes" in full
    assert isinstance(full["scenes"], list)
    assert len(full["scenes"]) > 0
    # YAML 字段保留
    assert "music" in full
    assert "subtitle_color" in full


@skip_no_skill
def test_load_template_full_missing_raises():
    with pytest.raises(dhv5_pipeline.Dhv5Error):
        dhv5_pipeline.load_template_full("not-exist-template")


@skip_no_skill
def test_render_async_missing_template_raises():
    with pytest.raises(dhv5_pipeline.Dhv5Error):
        dhv5_pipeline.render_async("not-exist", "/tmp/fake.mp4")


@skip_no_skill
def test_render_async_missing_video_raises(tmp_path):
    fake_mp4 = tmp_path / "nope.mp4"  # 不创建
    with pytest.raises(dhv5_pipeline.Dhv5Error):
        dhv5_pipeline.render_async("01-peixun-gaoxiao", str(fake_mp4))


# ─── D-059c-1 align 单元 ─────────────────────────────────────

class _FakeAIResult:
    def __init__(self, text):
        self.text = text
        self.prompt_tokens = 0
        self.completion_tokens = 0
        self.total_tokens = 0


class _FakeAIClient:
    def __init__(self, response_text):
        self._text = response_text
    def chat(self, prompt, system=None, deep=False, temperature=0.4, max_tokens=2000):
        return _FakeAIResult(self._text)


@skip_no_skill
def test_align_script_placeholder_mode_returns_raw_scenes():
    out = dhv5_pipeline.align_script("01-peixun-gaoxiao", "", mode="placeholder")
    assert out["mode"] == "placeholder"
    assert len(out["scenes"]) >= 6
    # 模板原字段应保留 (start/end/type)
    s0 = out["scenes"][0]
    assert "type" in s0 and "start" in s0 and "end" in s0


@skip_no_skill
def test_align_script_manual_mode_returns_empty_fields():
    out = dhv5_pipeline.align_script("01-peixun-gaoxiao", "", mode="manual")
    assert out["mode"] == "manual"
    for s in out["scenes"]:
        assert s.get("subtitle") == ""
        assert s.get("big_text") == ""


@skip_no_skill
def test_align_script_auto_mode_calls_ai_and_merges(monkeypatch):
    """AI 返合法 JSON, align 把字段拼回模板 scenes."""
    from shortvideo import ai as ai_module

    # 准备一个合法 ai 输出 — 看模板的 scene 数动态拼
    full = dhv5_pipeline.load_template_full("01-peixun-gaoxiao")
    n = len(full["scenes"])
    fake_ai_out = []
    for i, s in enumerate(full["scenes"]):
        t = s.get("type")
        if t == "B":
            fake_ai_out.append({"type": "B", "big_text": f"金句{i}"})
        else:
            fake_ai_out.append({"type": t, "subtitle": f"字幕{i}"})
    import json as _j
    fake_response = _j.dumps(fake_ai_out, ensure_ascii=False)
    monkeypatch.setattr(ai_module, "get_ai_client",
                        lambda route_key=None: _FakeAIClient(fake_response))

    out = dhv5_pipeline.align_script("01-peixun-gaoxiao",
                                      "这是一段测试 transcript 文本足够长", mode="auto")
    assert out["mode"] == "auto"
    assert len(out["scenes"]) == n
    # 字段对应 type 拼对了
    for i, s in enumerate(out["scenes"]):
        if s.get("type") == "B":
            assert s.get("big_text") == f"金句{i}"
        else:
            assert s.get("subtitle") == f"字幕{i}"
    # 模板原字段保留 (start/end 等)
    assert "start" in out["scenes"][0]


@skip_no_skill
def test_align_script_auto_empty_transcript_raises():
    with pytest.raises(dhv5_pipeline.Dhv5Error):
        dhv5_pipeline.align_script("01-peixun-gaoxiao", "", mode="auto")
    with pytest.raises(dhv5_pipeline.Dhv5Error):
        dhv5_pipeline.align_script("01-peixun-gaoxiao", "   ", mode="auto")


@skip_no_skill
def test_align_script_ai_returns_garbage_raises(monkeypatch):
    from shortvideo import ai as ai_module
    monkeypatch.setattr(ai_module, "get_ai_client",
                        lambda route_key=None: _FakeAIClient("我不会切"))
    with pytest.raises(dhv5_pipeline.Dhv5Error):
        dhv5_pipeline.align_script("01-peixun-gaoxiao", "transcript", mode="auto")


@skip_no_skill
def test_align_script_ai_throws_raises(monkeypatch):
    from shortvideo import ai as ai_module

    class _Boom:
        def chat(self, *a, **kw):
            raise RuntimeError("apimart 余额不足")
    monkeypatch.setattr(ai_module, "get_ai_client", lambda route_key=None: _Boom())
    with pytest.raises(dhv5_pipeline.Dhv5Error) as exc:
        dhv5_pipeline.align_script("01-peixun-gaoxiao", "transcript", mode="auto")
    assert "余额不足" in str(exc.value)


@skip_no_skill
def test_align_script_unknown_template_raises():
    with pytest.raises(dhv5_pipeline.Dhv5Error):
        dhv5_pipeline.align_script("not-exist", "x", mode="auto")
