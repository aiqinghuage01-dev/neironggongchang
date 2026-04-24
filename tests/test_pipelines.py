"""Skill pipeline 的结构化单元测试 (D-012/013/014)。

不打真 AI,只测 _extract_json / _alloc_for 等 helper,以及 skill 资源加载。
"""
from __future__ import annotations

import pytest

from backend.services import hotrewrite_pipeline, voicerewrite_pipeline, touliu_pipeline


# ─── 3 个 skill 都能加载到 skill_loader ─────────────────

def test_hotrewrite_skill_loads():
    from backend.services import skill_loader
    skill = skill_loader.load_skill(hotrewrite_pipeline.SKILL_SLUG)
    assert skill["skill_md"], "hotrewrite SKILL.md 空"
    assert "热点" in skill["skill_md"] or "改写" in skill["skill_md"]


def test_voicerewrite_skill_loads():
    from backend.services import skill_loader
    skill = skill_loader.load_skill(voicerewrite_pipeline.SKILL_SLUG)
    assert skill["skill_md"]
    assert "录音" in skill["skill_md"] or "改写" in skill["skill_md"]


def test_touliu_skill_loads():
    from backend.services import skill_loader
    skill = skill_loader.load_skill(touliu_pipeline.SKILL_SLUG)
    assert skill["skill_md"]
    refs = skill["references"]
    # touliu 依赖多个 references
    assert "style_rules" in refs
    assert "golden_samples" in refs
    assert "industry_templates" in refs


# ─── _extract_json 行为一致 ──────────────────────────────

@pytest.mark.parametrize("mod", [hotrewrite_pipeline, voicerewrite_pipeline, touliu_pipeline])
def test_extract_json_array(mod):
    assert mod._extract_json('前缀 ["a","b"] 后缀', "array") == ["a", "b"]


@pytest.mark.parametrize("mod", [hotrewrite_pipeline, voicerewrite_pipeline, touliu_pipeline])
def test_extract_json_object(mod):
    assert mod._extract_json('回复: {"x":1,"y":"z"} ok', "object") == {"x": 1, "y": "z"}


@pytest.mark.parametrize("mod", [hotrewrite_pipeline, voicerewrite_pipeline, touliu_pipeline])
def test_extract_json_invalid_returns_none(mod):
    assert mod._extract_json("没有 JSON 的纯文本", "object") is None
    assert mod._extract_json("{不合法的 JSON", "object") is None


# ─── touliu 专属: _alloc_for 分配 ──────────────────────

def test_touliu_alloc_10_exact():
    a = touliu_pipeline._alloc_for(10)
    assert sum(a.values()) == 10
    assert a["痛点型"] == 3
    assert a["创新型"] == 1


def test_touliu_alloc_5_exact():
    a = touliu_pipeline._alloc_for(5)
    assert sum(a.values()) == 5


def test_touliu_alloc_3_exact():
    a = touliu_pipeline._alloc_for(3)
    assert sum(a.values()) == 3


@pytest.mark.parametrize("n", [6, 7, 8, 11, 12, 15])
def test_touliu_alloc_nonstandard_totals_match(n):
    """非标准 n 的缩放分配总数等于 n。"""
    a = touliu_pipeline._alloc_for(n)
    assert sum(a.values()) == n, f"n={n} 分配总和 {sum(a.values())} != n"
    # 且都是非负整数
    assert all(isinstance(v, int) and v >= 0 for v in a.values())


def test_touliu_load_prompt_context_nonempty():
    ctx = touliu_pipeline._load_prompt_context()
    assert len(ctx) > 5000, "touliu prompt context 太小,应该 > 5000 字"
    assert "SKILL.md" in ctx or "方法论" in ctx
    assert "style_rules" in ctx or "风格红线" in ctx


# ─── hotrewrite / voicerewrite 签名 ───────────────────

def test_hotrewrite_module_exports():
    assert callable(hotrewrite_pipeline.analyze_hotspot)
    assert callable(hotrewrite_pipeline.write_script)


def test_voicerewrite_module_exports():
    assert callable(voicerewrite_pipeline.analyze_recording)
    assert callable(voicerewrite_pipeline.write_script)


def test_touliu_module_exports():
    assert callable(touliu_pipeline.generate_batch)
    assert callable(touliu_pipeline.lint_batch)
