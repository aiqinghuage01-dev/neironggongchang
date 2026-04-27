"""wechat_pipeline.write_article_async 烟雾测试.

回归 bug: 文件顶部漏 `import tasks_service`, line 306 用 `tasks_service.run_async`
触发 NameError → /api/wechat/write 返 500 → 用户撞 (清华哥实测复现, commit 3b12a33 修).

**关键 (D-085 follow-up GPT P2)**: tasks.run_async 立刻起 daemon thread 跑 sync_fn
(write_article → 真调 Opus + DeepSeek). 必须 mock 掉 wechat_pipeline.write_article,
否则 pytest 偷烧 AI credits + 污染临时 DB + 异步失败噪声.

防再次踩: 验证 write_article_async 至少能跑到 tasks_service.run_async 调用层
(不撞 NameError) + daemon 跑 stub 不真烧 LLM.
"""
from __future__ import annotations

import tempfile
import time
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


@pytest.fixture
def mock_write_article(monkeypatch):
    """**双重 mock** (D-086 follow-up GPT P1):
    1. mock wechat_pipeline.write_article → stub (防偷烧 LLM)
    2. **mock tasks.run_async → 同步执行 sync_fn (不起 daemon)**

    Why 双重: 单 mock write_article 不够, daemon thread 跨测试存活, 在前测试结束
    后才被调到, 此时 monkeypatch 已 revert → 真 write_article 被调 → 偷烧 + 串扰.
    具体串扰: 前测试 daemon 在后测试 fixture 期间触发, push 进**当前 fixture 的
    calls 列表**, 让 calls[0]['topic'] 不是当前测试的 topic, 断言挂.

    修法: patch tasks.run_async 成同步路径 (创建 task + 同步跑 sync_fn + 收尾),
    完全不起 daemon, 跨测试干净.
    """
    calls = []

    def fake_write(topic, title, outline):
        calls.append({"topic": topic, "title": title, "outline": outline})
        return {
            "article_html": "<p>fake</p>",
            "checks": {"a": "ok"},
            "tokens": 0,
        }

    monkeypatch.setattr(
        "backend.services.wechat_pipeline.write_article",
        fake_write,
    )

    # 同步版 run_async: 创建 task + 立即跑 sync_fn + 收尾, 不起 daemon thread
    from backend.services import tasks as tasks_service

    def fake_run_async(*, kind, label=None, ns=None, page_id=None, step=None,
                       payload=None, estimated_seconds=None,
                       progress_text=None, sync_fn):
        task_id = tasks_service.create_task(
            kind=kind, label=label, ns=ns, page_id=page_id, step=step,
            payload=payload, estimated_seconds=estimated_seconds,
        )
        try:
            result = sync_fn()
            tasks_service.finish_task(task_id, result=result, status="ok")
        except Exception as e:
            tasks_service.finish_task(task_id, error=str(e), status="failed")
        return task_id

    monkeypatch.setattr("backend.services.tasks.run_async", fake_run_async)
    return calls


def test_write_article_async_does_not_raise_nameerror(tmp_db, mock_write_article):
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


def test_write_article_async_creates_task_in_db(tmp_db, mock_write_article):
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


def test_write_article_async_calls_stub_and_finishes_ok(tmp_db, mock_write_article):
    """sync_fn 真被调到 stub (不烧 LLM) + task 终态 = ok.

    mock_write_article 双重 mock 后, run_async 是同步路径, 测试结束 task 已 ok.
    """
    from backend.services import wechat_pipeline
    from backend.services import tasks as tasks_service

    task_id = wechat_pipeline.write_article_async(
        topic="topic-1", title="title-1", outline={"hook": "h"},
    )
    # 同步路径: return 时 stub 已被调, task 已 ok
    assert len(mock_write_article) == 1, f"stub 应被调 1 次, 实际 {len(mock_write_article)}"
    assert mock_write_article[0]["topic"] == "topic-1"
    t = tasks_service.get_task(task_id)
    assert t["status"] == "ok", f"task 没正常完成: status={t['status']}, error={t.get('error')}"
