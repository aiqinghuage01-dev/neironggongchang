"""D-094 W5 compliance pipeline 假通过防御回归测试.

历史风险: _scan_violations / _write_version 用 `_extract_json or {}` + setdefault
fallback. LLM 返空 / 返非 JSON 时 obj={} + setdefault 后变 "0 处违规通过" 伪成功.
"审查通过"是高信任决策, 假通过比假不通过糟.

D-094 修:
- _scan_violations: _extract_json 返 None → raise RuntimeError
- _write_version: 同上 + content 空也 raise
"""
from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest


def _mk_ai(reply_text: str, tokens: int = 1000):
    """构造 ai 客户端 mock 返回指定 text."""
    fake_r = MagicMock()
    fake_r.text = reply_text
    fake_r.total_tokens = tokens
    fake_ai = MagicMock()
    fake_ai.chat = MagicMock(return_value=fake_r)
    return fake_ai


# ─── _scan_violations ──────────────────────────────────────


def test_scan_violations_raises_on_non_json_response():
    """LLM 返非 JSON → raise (不能 fallback 成 0 违规假通过)."""
    from backend.services import compliance_pipeline
    fake_skill = {"skill_md": "x", "references": {"通用违禁词库": "", "敏感行业词库": ""}}
    fake_ai = _mk_ai("LLM 内部错误, 没出 JSON 内容")  # 没 { 或 [
    with patch.object(compliance_pipeline, "get_ai_client", return_value=fake_ai):
        with pytest.raises(RuntimeError) as ei:
            compliance_pipeline._scan_violations("一些待审查文案", "通用", fake_skill)
    assert "JSON 解析失败" in str(ei.value)
    assert "0 违规" in str(ei.value)  # 错误信息明确说不伪装通过


def test_scan_violations_legal_zero_violations_pass():
    """LLM 真返 JSON 且 violations=[] (合法 0 违规) → 应正常返回不抛错."""
    from backend.services import compliance_pipeline
    fake_skill = {"skill_md": "x", "references": {"通用违禁词库": "", "敏感行业词库": ""}}
    legal_zero = '{"industry":"通用","violations":[],"stats":{"high":0,"medium":0,"low":0,"total":0},"summary":"无违规"}'
    fake_ai = _mk_ai(legal_zero)
    with patch.object(compliance_pipeline, "get_ai_client", return_value=fake_ai):
        result = compliance_pipeline._scan_violations("正常文案", "通用", fake_skill)
    assert result["violations"] == []
    assert result["stats"]["total"] == 0
    assert result["summary"] == "无违规"


def test_scan_violations_normal_with_violations():
    """LLM 返 N 处违规 → 正常返回."""
    from backend.services import compliance_pipeline
    fake_skill = {"skill_md": "x", "references": {"通用违禁词库": "", "敏感行业词库": ""}}
    legal_resp = ('{"industry":"通用","violations":[{"level":"high","original":"最","type":"极限词","reason":"x","fix":"很"}],'
                  '"stats":{"high":1,"medium":0,"low":0,"total":1},"summary":"1 处违规"}')
    fake_ai = _mk_ai(legal_resp)
    with patch.object(compliance_pipeline, "get_ai_client", return_value=fake_ai):
        result = compliance_pipeline._scan_violations("最便宜文案", "通用", fake_skill)
    assert len(result["violations"]) == 1
    assert result["stats"]["total"] == 1


# ─── _write_version ────────────────────────────────────────


def test_write_version_raises_on_non_json():
    from backend.services import compliance_pipeline
    fake_skill = {"skill_md": "x", "references": {}}
    fake_ai = _mk_ai("非 JSON 输出")
    fake_scan = {"violations": [], "stats": {"total": 0}}
    with patch.object(compliance_pipeline, "get_ai_client", return_value=fake_ai):
        with pytest.raises(RuntimeError) as ei:
            compliance_pipeline._write_version("文案", "通用", fake_scan, mode="保守", skill=fake_skill)
    assert "JSON 解析失败" in str(ei.value)


def test_write_version_raises_on_empty_content():
    """LLM 返合法 JSON 但 content 空 → raise (UI 看到改写版标签但点开是空, 更糟)."""
    from backend.services import compliance_pipeline
    fake_skill = {"skill_md": "x", "references": {}}
    fake_ai = _mk_ai('{"content":"","word_count":0,"compliance":95,"description":"x"}')
    fake_scan = {"violations": [], "stats": {"total": 0}}
    with patch.object(compliance_pipeline, "get_ai_client", return_value=fake_ai):
        with pytest.raises(RuntimeError) as ei:
            compliance_pipeline._write_version("文案", "通用", fake_scan, mode="保守", skill=fake_skill)
    assert "空 content" in str(ei.value)


def test_write_version_normal():
    """LLM 返正常 JSON + content → 正常返回, mode=营销 自动加 kept_marketing."""
    from backend.services import compliance_pipeline
    fake_skill = {"skill_md": "x", "references": {}}
    fake_ai = _mk_ai('{"content":"改写后的合规文案","word_count":7,"compliance":85,"description":"x","kept_marketing":["a","b"]}')
    fake_scan = {"violations": [], "stats": {"total": 0}}
    with patch.object(compliance_pipeline, "get_ai_client", return_value=fake_ai):
        result = compliance_pipeline._write_version("原文", "通用", fake_scan, mode="营销", skill=fake_skill)
    assert result["content"] == "改写后的合规文案"
    assert result["word_count"] == 7
    assert "kept_marketing" in result
