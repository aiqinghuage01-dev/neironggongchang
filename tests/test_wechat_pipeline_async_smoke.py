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
    """mock wechat_pipeline.write_article: daemon worker 通过 lambda 闭包调它,
    monkeypatch module-level name 能拦住.

    防偷烧 credits: 真 write_article 调 Opus 长文 ~30s + DeepSeek 自检 ~2s.
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


def test_write_article_async_daemon_calls_stub_not_real_llm(tmp_db, mock_write_article):
    """daemon 真跑到 sync_fn → 调 stub (不烧 credits). 等一小段让 daemon 完成."""
    from backend.services import wechat_pipeline
    from backend.services import tasks as tasks_service

    task_id = wechat_pipeline.write_article_async(
        topic="topic-1", title="title-1", outline={"hook": "h"},
    )
    # 等 daemon thread 跑完 sync_fn (stub 立即返, ~50ms 应足够)
    deadline = time.time() + 3.0
    while time.time() < deadline:
        t = tasks_service.get_task(task_id)
        if t and t["status"] in ("ok", "failed"):
            break
        time.sleep(0.05)
    # 验证 stub 真被调 (而不是真 LLM)
    assert len(mock_write_article) >= 1, "daemon 没调到 stub (worker 没跑或 mock 没拦)"
    assert mock_write_article[0]["topic"] == "topic-1"
    # 验证 task 终态 = ok (走完整路径)
    t = tasks_service.get_task(task_id)
    assert t["status"] == "ok", f"task 没正常完成: status={t['status']}, error={t.get('error')}"
