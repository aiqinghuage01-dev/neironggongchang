"""wechat_pipeline.write_article_async 烟雾测试.

回归 bug: 文件顶部漏 `import tasks_service`, line 306 用 `tasks_service.run_async`
触发 NameError → /api/wechat/write 返 500 → 用户撞 (清华哥实测复现).

防再次踩: 验证 write_article_async 至少能跑到 tasks_service.run_async 调用层
(不撞 NameError). 不真发 LLM, 用 monkeypatch mock sync_fn 走通.
"""
from __future__ import annotations

import tempfile
from pathlib import Path

import pytest


@pytest.fixture
def tmp_db(monkeypatch):
    tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
    tmp.close()
    p = Path(tmp.name)
    monkeypatch.setattr("shortvideo.config.DB_PATH", p)
    yield p
    try:
        p.unlink()
    except Exception:
        pass


def test_write_article_async_does_not_raise_nameerror(tmp_db):
    """回归: write_article_async 调用应能拿到 task_id, 不再 NameError."""
    from backend.services import wechat_pipeline

    task_id = wechat_pipeline.write_article_async(
        topic="测试选题",
        title="测试标题",
        outline={"hook": "开场", "core": "主体", "close": "结尾"},
    )
    assert task_id, "write_article_async 必须返 task_id"
    assert isinstance(task_id, str)
    assert len(task_id) >= 8  # uuid hex


def test_write_article_async_creates_task_in_db(tmp_db):
    """task_id 真写到 tasks DB (验证 tasks_service 真被调到, 不只是 lazy import 解析)."""
    from backend.services import wechat_pipeline
    from backend.services import tasks as tasks_service

    task_id = wechat_pipeline.write_article_async(
        topic="选题 X",
        title="标题 Y",
        outline={"a": "1"},
    )
    t = tasks_service.get_task(task_id)
    assert t is not None
    assert t["kind"] == "wechat.write"
    assert t["ns"] == "wechat"
    assert t["page_id"] == "wechat"
