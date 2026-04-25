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
