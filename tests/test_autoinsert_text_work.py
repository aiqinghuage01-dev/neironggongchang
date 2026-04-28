"""D-093 自动入作品库防御 + 修复回归测试.

历史 bug: tasks._autoinsert_text_work 调 insert_work(tokens_used=N) 但 insert_work
函数签名漏 tokens_used 参数 → TypeError → except: pass 静默吞 → 13 条文字 task ok
但 0 条入作品库. 老板用了几个月都没人发现.

D-093 修:
1. shortvideo/works.py:insert_work 加 tokens_used 参数 (schema 一直有这列, 函数签名漏)
2. backend/services/tasks.py:_KIND_TO_SKILL 补 compliance (漏 8 条 compliance.check)
3. backend/services/tasks.py:_extract_text_from_result 加 version_a/b 双版本结构识别
4. backend/services/tasks.py:_autoinsert_text_work except 改 log warning (不再静默吞)
"""
from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest


# ─── 1. insert_work 接受 tokens_used 参数 (修 1) ────────────


@pytest.fixture
def _cleanup_test_d093():
    """测试 fixture: 跑完清掉 source_skill='test-d093' 的残留, 不污染老板真作品库."""
    yield
    import sqlite3
    from shortvideo.config import DB_PATH
    try:
        with sqlite3.connect(str(DB_PATH)) as c:
            c.execute("DELETE FROM works WHERE source_skill='test-d093'")
            c.commit()
    except Exception:
        pass


def test_insert_work_accepts_tokens_used(_cleanup_test_d093):
    """insert_work(tokens_used=N) 不能再抛 TypeError. schema 有这列, 函数应支持."""
    from shortvideo.works import insert_work, get_work, init_db
    init_db()
    wid = insert_work(
        type="text",
        source_skill="test-d093",
        title="d093 test",
        final_text="测试 D-093 insert_work 接受 tokens_used 参数",
        tokens_used=1234,
        status="ready",
    )
    w = get_work(wid)
    assert w is not None
    assert w.tokens_used == 1234
    assert w.type == "text"


# ─── 2. _KIND_TO_SKILL 含 compliance (修 2) ──────────────


def test_kind_to_skill_includes_compliance():
    """_KIND_TO_SKILL 必须含 compliance — 历史漏掉 8 条 compliance.check 不入库."""
    from backend.services.tasks import _KIND_TO_SKILL
    skills = {name for _, name in _KIND_TO_SKILL}
    assert "compliance" in skills, f"_KIND_TO_SKILL 漏 compliance: {skills}"
    # 防回归: 8 个 text skill 都得在
    expected = {"baokuan", "hotrewrite", "voicerewrite", "touliu", "wechat", "planner", "moments", "compliance"}
    assert expected.issubset(skills), f"缺: {expected - skills}"


# ─── 3. _extract_text_from_result 识别 compliance 双版本 (修 3) ──


def test_extract_text_handles_compliance_dual_version():
    """compliance.check result {version_a, version_b} 嵌套 content 应被识别成正文."""
    from backend.services.tasks import _extract_text_from_result
    result = {
        "industry": "通用",
        "violations": [],
        "stats": {"high": 0, "medium": 0, "low": 0, "total": 0},
        "summary": "",
        "version_a": {"content": "干净版改写文案 abc def 12345", "word_count": 25},
        "version_b": {"content": "保留卖点版 xyz 67890", "word_count": 18, "kept_marketing": True},
        "tokens": {"total": 500},
    }
    text = _extract_text_from_result(result)
    assert "干净版改写文案" in text
    assert "保留卖点版" in text
    assert "【A 版" in text  # 加了清晰 label
    assert "【B 版" in text


def test_extract_text_compliance_no_content_returns_empty():
    """compliance result 但 version_a/b 都缺 content → 返空 (避免 hallucinate)."""
    from backend.services.tasks import _extract_text_from_result
    result = {"version_a": {}, "version_b": {"kept_marketing": True}}
    assert _extract_text_from_result(result) == ""


def test_extract_text_normal_content_unchanged():
    """正常 result.content 路径不受影响 (回归)."""
    from backend.services.tasks import _extract_text_from_result
    assert _extract_text_from_result({"content": "正常文案"}) == "正常文案"
    assert _extract_text_from_result({"article": "公众号长文 abc"}) == "公众号长文 abc"
    assert _extract_text_from_result("纯字符串 result") == "纯字符串 result"
    assert _extract_text_from_result(None) == ""


# ─── 4. _autoinsert_text_work 不再静默吞错 (修 4) ─────────


def test_autoinsert_logs_warning_on_failure(caplog):
    """insert_work 抛错时, 应该 log.warning, 不再 except: pass 静默吞."""
    import logging
    from backend.services import tasks

    # mock insert_work 抛 TypeError 模拟历史 bug
    with patch("shortvideo.works.insert_work", side_effect=TypeError("simulated schema error")):
        with caplog.at_level(logging.WARNING, logger="tasks._autoinsert_text_work"):
            tasks._autoinsert_text_work(
                kind="wechat.write",
                label="测试 task",
                task_id="fake-task-id",
                result={"content": "够 10 字的文案 abcdef ghijk lmnop"},
            )
    # 至少 log 了一条 warning, 不再静默
    assert any("simulated schema error" in (r.message + str(r.args)) or "simulated" in r.getMessage()
               for r in caplog.records), f"warning 没记录: {[r.getMessage() for r in caplog.records]}"


# ─── 5. 端到端: 完整链路真入库 (D-088 同款 mock 验证) ─────


def test_autoinsert_end_to_end_text_inserted(tmp_path, monkeypatch):
    """跑完整 _autoinsert_text_work 链路 (mock guest_mode), 验证真插入了 work 记录."""
    from backend.services import tasks
    from shortvideo.works import init_db
    init_db()
    from shortvideo import works as works_mod

    inserted_args = {}
    def fake_insert(**kwargs):
        inserted_args.update(kwargs)
        return 99999

    monkeypatch.setattr(works_mod, "insert_work", fake_insert)
    # 也得 patch tasks.py 局部 import 处
    import shortvideo.works
    shortvideo.works.insert_work = fake_insert

    tasks._autoinsert_text_work(
        kind="compliance.check",
        label="违规审查 · 通用 · 49字",
        task_id="task-d093-test",
        result={
            "version_a": {"content": "A 版干净文案 abc 123"},
            "version_b": {"content": "B 版保留卖点 xyz 456"},
            "tokens": {"total": 200},
        },
    )
    assert inserted_args.get("type") == "text"
    assert inserted_args.get("source_skill") == "compliance"
    assert "A 版" in (inserted_args.get("final_text") or "")
    assert "B 版" in (inserted_args.get("final_text") or "")
    # tokens_used 是 dict 时退化 0 (不抛错就行)
    assert "tokens_used" in inserted_args
