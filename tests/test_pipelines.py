"""Skill pipeline 的结构化单元测试 (D-012/013/014)。

不打真 AI,只测 _extract_json / _alloc_for 等 helper,以及 skill 资源加载。
"""
from __future__ import annotations

import pytest
from unittest.mock import MagicMock

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


def test_touliu_extract_json_accepts_prefixed_fenced_object():
    text = """已走技能：投流文案

```json
{
  "style_summary": {"opening_mode": "短"},
  "batch": [{"no": 1, "body": "正文"}]
}
```"""
    obj = touliu_pipeline._extract_json(text, "object")
    assert obj["style_summary"]["opening_mode"] == "短"
    assert obj["batch"][0]["no"] == 1


def test_touliu_json_failure_hint_marks_truncated_fence():
    text = '已走技能：投流文案\n```json\n{"style_summary": {"opening_mode": "短"}, "batch": ['
    assert "截断" in touliu_pipeline._json_failure_hint(text, "object")


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


# D-068c: 支持 1/2 条快出 (前端默认 1)
def test_touliu_alloc_1_exact():
    a = touliu_pipeline._alloc_for(1)
    assert sum(a.values()) == 1
    assert a["痛点型"] == 1


def test_touliu_alloc_2_exact():
    a = touliu_pipeline._alloc_for(2)
    assert sum(a.values()) == 2


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


def test_touliu_load_prompt_context_compact_is_smaller():
    full = touliu_pipeline._load_prompt_context()
    compact = touliu_pipeline._load_prompt_context(compact=True)
    assert 3000 < len(compact) < len(full)
    assert "方法论" in compact
    assert "风格红线" in compact


def test_touliu_max_tokens_scales_with_batch_size():
    assert touliu_pipeline._max_tokens_for_batch(1) == 2200
    assert touliu_pipeline._max_tokens_for_batch(2) == 3400
    assert touliu_pipeline._max_tokens_for_batch(10) == 12000


def test_touliu_quick_batches_use_quick_route_key():
    assert touliu_pipeline._route_key_for_batch(1) == "touliu.generate.quick"
    assert touliu_pipeline._route_key_for_batch(2) == "touliu.generate.quick"
    assert touliu_pipeline._route_key_for_batch(3) == "touliu.generate"
    assert touliu_pipeline._route_key_for_batch(10) == "touliu.generate"


def test_touliu_generate_one_uses_compact_budget(monkeypatch):
    captured = {}
    fake_ai = MagicMock()

    def fake_chat(prompt, *, system=None, deep=True, temperature=0.7, max_tokens=2048):
        captured.update({
            "prompt": prompt,
            "system": system,
            "system_len": len(system or ""),
            "deep": deep,
            "max_tokens": max_tokens,
        })
        return MagicMock(
            text='{"style_summary": {"opening_mode": "短"}, "batch": [{"no": 1, "structure": "痛点型", "title": "标题", "first_line": "开场", "body": "正文", "cta": "进直播间", "director_check": {"total": 24}}]}',
            total_tokens=1200,
        )

    fake_ai.chat = fake_chat
    fake_ai.engine_name = "opus"
    fake_skill = {
        "skill_md": "方法论" * 4000,
        "references": {
            "style_rules": "风格红线" * 800,
            "winning_patterns": "跑量规律" * 800,
            "industry_templates": "行业模板" * 800,
            "golden_samples": "样本" * 1200,
        },
    }
    def fake_get_ai_client(route_key=None):
        captured["route_key"] = route_key
        return fake_ai

    monkeypatch.setattr(touliu_pipeline, "get_ai_client", fake_get_ai_client)
    monkeypatch.setattr(touliu_pipeline.skill_loader, "load_skill", lambda _slug: fake_skill)

    r = touliu_pipeline.generate_batch(
        pitch="AI 短视频获客",
        industry="餐饮",
        target_action="点头像进直播间",
        n=1,
        channel="直播间",
    )

    assert len(r["batch"]) == 1
    assert r["route_key"] == "touliu.generate.quick"
    assert r["engine"] == "opus"
    assert captured["route_key"] == "touliu.generate.quick"
    assert captured["deep"] is False
    assert captured["max_tokens"] == 2200
    assert captured["system_len"] < 11000
    assert "禁止写“已走技能”" in captured["system"]
    assert "```json" in captured["system"]
    assert "直接从 `{` 开始" in captured["prompt"]


def test_touliu_generate_one_truncated_json_error_is_clear(monkeypatch):
    fake_ai = MagicMock()

    def fake_chat(prompt, *, system=None, deep=True, temperature=0.7, max_tokens=2048):
        return MagicMock(
            text='已走技能：投流文案\n```json\n{"style_summary": {"opening_mode": "短"}, "batch": [',
            total_tokens=6051,
        )

    fake_ai.chat = fake_chat
    fake_skill = {
        "skill_md": "方法论" * 1000,
        "references": {
            "style_rules": "风格红线" * 300,
            "winning_patterns": "跑量规律" * 300,
            "industry_templates": "行业模板" * 300,
            "golden_samples": "样本" * 300,
        },
    }
    monkeypatch.setattr(touliu_pipeline, "get_ai_client", lambda route_key=None: fake_ai)
    monkeypatch.setattr(touliu_pipeline.skill_loader, "load_skill", lambda _slug: fake_skill)

    with pytest.raises(RuntimeError, match="截断|未闭合"):
        touliu_pipeline.generate_batch(
            pitch="AI 短视频获客",
            industry="餐饮",
            target_action="点头像进直播间",
            n=1,
            channel="直播间",
        )


def test_touliu_generate_api_estimate_matches_async_task(monkeypatch):
    from fastapi.testclient import TestClient
    import backend.api as api_mod

    captured = []

    def fake_generate_batch_async(**kwargs):
        captured.append(kwargs)
        return f"task-{kwargs['n']}"

    monkeypatch.setattr(api_mod.touliu_pipeline, "generate_batch_async", fake_generate_batch_async)
    client = TestClient(api_mod.app)

    payload = {
        "pitch": "QA最小真测：老板每天花20分钟用AI把门店成交问题整理成投流文案",
        "industry": "通用老板",
        "target_action": "加私域",
        "n": 1,
        "channel": "抖音短视频",
        "run_lint": True,
    }
    r1 = client.post("/api/touliu/generate", json=payload)
    assert r1.status_code == 200
    assert r1.json()["estimated_seconds"] == 60
    assert r1.json()["task_id"] == "task-1"
    assert captured[-1]["n"] == 1

    r2 = client.post("/api/touliu/generate", json={**payload, "n": 5})
    assert r2.status_code == 200
    assert r2.json()["estimated_seconds"] == 150
    assert captured[-1]["n"] == 5


def test_touliu_generate_async_maps_target_action_to_lint_choice(monkeypatch):
    captured = {}

    def fake_generate_batch(**kwargs):
        return {
            "batch": [{"no": 1, "structure": "痛点型", "body": "正文", "cta": "加私域"}],
            "inputs": kwargs,
        }

    def fake_lint_batch(batch, target_action="live"):
        captured["lint_target_action"] = target_action
        return {"ok": True, "passed": True}

    def fake_run_async(**kwargs):
        captured["estimated_seconds"] = kwargs["estimated_seconds"]
        if kwargs.get("sync_fn_with_ctx"):
            captured["result"] = kwargs["sync_fn_with_ctx"](MagicMock())
        else:
            captured["result"] = kwargs["sync_fn"]()
        return "task-id"

    monkeypatch.setattr(touliu_pipeline, "generate_batch", fake_generate_batch)
    monkeypatch.setattr(touliu_pipeline, "lint_batch", fake_lint_batch)
    monkeypatch.setattr(touliu_pipeline.tasks_service, "run_async", fake_run_async)

    tid = touliu_pipeline.generate_batch_async(
        pitch="AI 短视频获客",
        industry="通用老板",
        target_action="加私域",
        n=1,
        channel="抖音短视频",
        run_lint=True,
    )

    assert tid == "task-id"
    assert captured["estimated_seconds"] == 60
    assert captured["lint_target_action"] == "dm"
    assert captured["result"]["lint"]["passed"] is True


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
