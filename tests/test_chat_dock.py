"""/api/chat 端到端集成测试 (D-085 LiDock tool calling).

mock AI 输出, 验证:
- 无 tool block: 普通 reply (兼容 D-027 老路径)
- nav tool: actions=[{type:nav, page:...}], rounds=1, reply 不含 USE_TOOL 块
- kb_search tool: round2 LLM 被调用, reply 来自 round2, rounds=2
- tasks_summary tool: 同上, 双轮
- 非法 nav.page (白名单外): reply 覆盖告知用户 "我没有这个工具能力"
- 未注册 tool: 静默 ignore (parse 阶段过滤), reply 是 round1 strip 后纯文本
- 防注入: 二次 LLM 即使 mock 输出又含 USE_TOOL 也被 strip
"""
from __future__ import annotations

import tempfile
from pathlib import Path
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient


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
def client(tmp_db):
    from backend.api import app
    return TestClient(app)


def _mock_ai(monkeypatch, *responses: str):
    """让 get_ai_client 返回的 client 顺序输出 responses (每次 chat 调用拿下一条)."""
    from shortvideo.deepseek import LLMResult

    call_idx = [0]

    def fake_chat(prompt, *, system=None, **kw):
        idx = call_idx[0]
        call_idx[0] += 1
        text = responses[idx] if idx < len(responses) else "(no more mock)"
        return LLMResult(text=text, prompt_tokens=10, completion_tokens=20, total_tokens=30)

    fake_client = MagicMock()
    fake_client.chat = fake_chat

    # backend/api.py 顶部 `from shortvideo.ai import get_ai_client` 已值拷贝,
    # 要 patch backend.api 命名空间里的引用才有效.
    import backend.api as api_mod
    monkeypatch.setattr(api_mod, "get_ai_client", lambda **kw: fake_client)


# ─── 兼容老路径: 无 tool ───────────────────────────────────


def test_chat_no_tool_plain_reply(client, monkeypatch):
    _mock_ai(monkeypatch, "你好啊老板。")
    r = client.post("/api/chat", json={
        "messages": [{"role": "user", "text": "嗨"}],
        "context": "首页",
    })
    assert r.status_code == 200
    data = r.json()
    assert data["reply"] == "你好啊老板。"
    assert data["actions"] == []
    assert data["rounds"] == 1


# ─── nav (single 模式): 透传 actions ───────────────────────


def test_chat_nav_single_mode_passes_action_to_frontend(client, monkeypatch):
    """AI 输出 nav tool block → 响应 actions=[{type:nav, page:wechat}], reply 干净."""
    _mock_ai(monkeypatch, '好的, 打开公众号。\n<<USE_TOOL>>{"name":"nav","args":{"page":"wechat"}}<<END>>')
    r = client.post("/api/chat", json={
        "messages": [{"role": "user", "text": "打开公众号"}],
        "context": "首页",
    })
    assert r.status_code == 200
    data = r.json()
    assert data["reply"] == "好的, 打开公众号。"  # USE_TOOL 块被 strip
    assert data["actions"] == [{"type": "nav", "page": "wechat"}]
    assert data["rounds"] == 1  # single 不进 round 2


def test_chat_nav_invalid_page_overrides_reply(client, monkeypatch):
    """非法 page (白名单外) → reply 被覆盖成 '我没有这个工具能力', 防假承诺."""
    _mock_ai(monkeypatch, '正在打开 magic_page。\n<<USE_TOOL>>{"name":"nav","args":{"page":"magic_page"}}<<END>>')
    r = client.post("/api/chat", json={
        "messages": [{"role": "user", "text": "打开 magic_page"}],
        "context": "首页",
    })
    data = r.json()
    # 不能让用户看到 "正在打开 magic_page" 假承诺
    assert "magic_page" in data["reply"] or "工具能力" in data["reply"]
    assert "没有这个" in data["reply"]
    assert data["actions"] == []  # 没透传出去
    assert data["rounds"] == 1


def test_chat_unknown_tool_silently_filtered(client, monkeypatch):
    """未注册 tool (parse 阶段就过滤) → reply 是 round1 strip 后, 不进 invalid 分支."""
    _mock_ai(monkeypatch, '收到。\n<<USE_TOOL>>{"name":"trigger_skill","args":{"skill":"x"}}<<END>>')
    r = client.post("/api/chat", json={
        "messages": [{"role": "user", "text": "随便"}],
        "context": "首页",
    })
    data = r.json()
    # parse_tool_calls 已 ignore 未注册 tool, 不会触发 validate_call invalid 分支
    # reply 是 strip 后的纯文本
    assert data["reply"] == "收到。"
    assert data["actions"] == []


# ─── kb_search (read+followup): 双轮 LLM ──────────────────


def test_chat_kb_search_triggers_round2(client, monkeypatch):
    """kb_search → 后端执行 → round2 LLM 被调 → reply 来自 round2."""
    # mock kb.match 返回结果
    import backend.services.kb as kb_module
    monkeypatch.setattr(kb_module, "match", lambda query, k=5: [
        {"path": "07/方法论.md", "title": "方法论", "section": "07",
         "heading": "话术", "score": 1.5, "text": "完整正文",
         "preview": "开场抛痛点..."},
    ])

    # mock 两次 AI 调用 (round1 + round2)
    _mock_ai(
        monkeypatch,
        '查一下。<<USE_TOOL>>{"name":"kb_search","args":{"query":"直播话术"}}<<END>>',
        "你之前写过开场抛痛点的方法。",
    )

    r = client.post("/api/chat", json={
        "messages": [{"role": "user", "text": "我之前怎么写直播话术的"}],
        "context": "首页",
    })
    assert r.status_code == 200
    data = r.json()
    assert data["rounds"] == 2  # 双轮
    assert data["reply"] == "你之前写过开场抛痛点的方法。"  # round 2 的输出
    assert data["actions"] == []  # read+followup 不透传 action


def test_chat_kb_search_round2_strips_recursive_tool(client, monkeypatch):
    """防递归: round2 即使又输出 USE_TOOL 块也被 strip, 不会再触发 round3."""
    import backend.services.kb as kb_module
    monkeypatch.setattr(kb_module, "match", lambda query, k=5: [])

    _mock_ai(
        monkeypatch,
        '<<USE_TOOL>>{"name":"kb_search","args":{"query":"x"}}<<END>>',
        # round 2 又输出 USE_TOOL 应被 strip
        '清华哥, 我搜过没找到。<<USE_TOOL>>{"name":"nav","args":{"page":"wechat"}}<<END>>',
    )

    r = client.post("/api/chat", json={
        "messages": [{"role": "user", "text": "查 x"}],
        "context": "首页",
    })
    data = r.json()
    assert data["rounds"] == 2
    # round2 的 USE_TOOL 块被 strip, 不递归触发 round 3
    assert "<<USE_TOOL>>" not in data["reply"]
    assert "清华哥, 我搜过没找到。" == data["reply"]
    # round 2 的 nav 不会被透传成 action (第二轮的 calls 被忽略)
    assert data["actions"] == []


# ─── tasks_summary (read+followup) ──────────────────────


def test_chat_tasks_summary_triggers_round2(client, monkeypatch):
    """tasks_summary → 后端 query tasks DB → round 2 LLM."""
    _mock_ai(
        monkeypatch,
        '<<USE_TOOL>>{"name":"tasks_summary","args":{}}<<END>>',
        "你现在没有任务在跑, 今天也没失败。",
    )

    r = client.post("/api/chat", json={
        "messages": [{"role": "user", "text": "我现在有几个任务在跑"}],
        "context": "首页",
    })
    assert r.status_code == 200
    data = r.json()
    assert data["rounds"] == 2
    assert "没有任务" in data["reply"] or "0" in data["reply"]


# ─── 历史错的 page id 被拦 ──────────────────────────────


@pytest.mark.parametrize("bad_page", ["night", "image-gen", "touliu"])
def test_chat_rejects_historically_wrong_page_ids(client, monkeypatch, bad_page):
    """设计文档 v1 错的 page id (night/image-gen/touliu) 必须被拦 — invalid 分支."""
    _mock_ai(
        monkeypatch,
        f'打开。<<USE_TOOL>>{{"name":"nav","args":{{"page":"{bad_page}"}}}}<<END>>',
    )
    r = client.post("/api/chat", json={
        "messages": [{"role": "user", "text": "打开"}],
        "context": "首页",
    })
    data = r.json()
    assert data["actions"] == []  # 没透传
    assert "没有这个" in data["reply"]
