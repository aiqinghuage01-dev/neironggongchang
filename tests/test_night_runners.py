"""night_runners 测试 (D-040f).

- seed_defaults 幂等
- daily_recap_runner 真跑 (不依赖外部 skill)
- 3 个 placeholder runner 写明白消息不崩
- 注册自动跑
"""
from __future__ import annotations

import sqlite3
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
    import importlib
    from backend.services import night_shift, night_executor, ai_usage
    importlib.reload(night_shift)
    importlib.reload(night_executor)
    importlib.reload(ai_usage)
    night_executor._RUNNERS.clear()
    # 强制重新注册
    from backend.services import night_runners
    importlib.reload(night_runners)
    yield p
    night_executor._RUNNERS.clear()
    try:
        p.unlink()
    except Exception:
        pass


def test_seed_defaults_creates_5_jobs(tmp_db):
    """D-067 加 '总结昨天的你' 后从 4 → 5 条"""
    from backend.services import night_runners, night_shift
    r = night_runners.seed_defaults()
    assert len(r["created"]) == 5
    assert r["skipped"] == []
    jobs = night_shift.list_jobs()
    names = {j["name"] for j in jobs}
    assert names == {"凌晨抓热点", "一鱼多吃", "知识库整理", "昨日复盘", "总结昨天的你"}
    # 都默认禁用
    assert all(j["enabled"] is False for j in jobs)


def test_seed_defaults_idempotent(tmp_db):
    from backend.services import night_runners
    r1 = night_runners.seed_defaults()
    r2 = night_runners.seed_defaults()
    assert len(r1["created"]) == 5
    assert r2["created"] == []
    assert len(r2["skipped"]) == 5


def test_seed_defaults_partial(tmp_db):
    from backend.services import night_runners, night_shift
    # 手动建一条同名 job, seed 应该跳过它
    night_shift.create_job(name="昨日复盘", trigger_type="cron")
    r = night_runners.seed_defaults()
    assert len(r["created"]) == 4
    assert r["skipped"] == ["昨日复盘"]


def test_register_all_registers_4_runners(tmp_db):
    from backend.services import night_executor, night_runners
    night_runners._REGISTERED = False  # 强制重跑
    night_executor._RUNNERS.clear()
    night_runners.register_all()
    assert "daily-recap" in night_executor._RUNNERS
    assert "content-planner" in night_executor._RUNNERS
    assert "one-fish-many-meals" in night_executor._RUNNERS
    assert "kb-compiler" in night_executor._RUNNERS


def test_daily_recap_with_zero_calls(tmp_db):
    """昨天没调过 AI → 不算失败, summary 简短."""
    from backend.services import night_runners
    job = {"id": 1, "name": "昨日复盘", "skill_slug": "daily-recap"}
    out = night_runners.daily_recap_runner(job)
    assert "没调过 AI" in out["output_summary"] or "没东西" in out["output_summary"]
    assert "0 calls" in (out["log"] or "")


def test_daily_recap_with_real_calls(tmp_db):
    """模拟昨天有 AI 调用 → 摘要应包含调用数 / tokens."""
    from backend.services import ai_usage, night_runners
    # 写两条 24h 内的 ai_calls (但要在 'yesterday' 范围内 = 昨天的某个时刻)
    ai_usage._ensure_schema()  # 触发建表
    yesterday_ts = int(time.time()) - 86400 + 3600  # 25 小时前
    with sqlite3.connect(tmp_db) as con:
        con.execute(
            "INSERT INTO ai_calls (ts, engine, route_key, prompt_tokens, completion_tokens, "
            "total_tokens, duration_ms, ok) VALUES (?,?,?,?,?,?,?,1), (?,?,?,?,?,?,?,1)",
            (yesterday_ts, "opus", "wechat.write", 5000, 2000, 7000, 30000,
             yesterday_ts, "deepseek", "wechat.titles", 300, 200, 500, 3500),
        )
        con.commit()
    job = {"id": 1, "name": "昨日复盘", "skill_slug": "daily-recap"}
    out = night_runners.daily_recap_runner(job)
    # AI 调用 2 次, 总 7500 tokens
    assert "AI 调 2 次" in out["output_summary"]
    assert "7K tokens" in out["output_summary"] or "K tokens" in out["output_summary"]
    # 没失败
    assert "失败" not in out["output_summary"]
    # 引擎分布写进 log
    log = out["log"] or ""
    assert "opus" in log
    assert "deepseek" in log


def test_daily_recap_with_failures(tmp_db):
    from backend.services import ai_usage, night_runners
    ai_usage._ensure_schema()
    yesterday_ts = int(time.time()) - 86400 + 3600
    with sqlite3.connect(tmp_db) as con:
        con.execute(
            "INSERT INTO ai_calls (ts, engine, route_key, prompt_tokens, completion_tokens, "
            "total_tokens, duration_ms, ok) VALUES (?,?,?,?,?,?,?,?)",
            (yesterday_ts, "opus", "wechat.write", 0, 0, 0, 5000, 0),
        )
        con.commit()
    job = {"id": 1, "name": "昨日复盘", "skill_slug": "daily-recap"}
    out = night_runners.daily_recap_runner(job)
    assert "1 次失败" in out["output_summary"] or "失败" in out["output_summary"]


def test_placeholder_runner_writes_helpful_log(tmp_db):
    """剩余 2 个未实装的 runner (one-fish / kb-compiler) 应该返回'未接入'消息不崩."""
    from backend.services import night_executor, night_shift
    from backend.services import night_runners
    night_runners.seed_defaults()
    job = next(j for j in night_shift.list_jobs() if j["name"] == "一鱼多吃")
    runner = night_executor._RUNNERS["one-fish-many-meals"]
    out = runner(job)
    assert "未接入" in out["output_summary"]
    assert out["output_refs"] is None
    assert "watchdog" in (out["log"] or "")


# ─── 凌晨抓热点 (D-047 真 runner) ──────────────────────────────

class _FakeAIResult:
    def __init__(self, text):
        self.text = text
        self.prompt_tokens = 0
        self.completion_tokens = 0
        self.total_tokens = 0


class _FakeAIClient:
    def __init__(self, response_text):
        self._text = response_text
    def chat(self, prompt, system=None, deep=True, temperature=0.7, max_tokens=2000):
        return _FakeAIResult(self._text)


def test_content_planner_runner_real_ai_5_topics(tmp_db, monkeypatch):
    """AI 返回合法 JSON 5 条 → 全写 hot_topics, summary 含最高分标题."""
    from backend.services import night_runners
    from shortvideo import ai as ai_module

    fake_response = """[
        {"title": "一个老板花3万学AI", "heat_score": 92, "match_reason": "实战 + 痛点"},
        {"title": "AI 替团队的真实账", "heat_score": 88, "match_reason": "决策视角"},
        {"title": "凌晨3点跟AI下指令", "heat_score": 75, "match_reason": "场景化故事"},
        {"title": "10年程序员转头", "heat_score": 70, "match_reason": "身份切换"},
        {"title": "AI不替代你的部分", "heat_score": 80, "match_reason": "反转角度"}
    ]"""
    monkeypatch.setattr(ai_module, "get_ai_client",
                        lambda route_key=None: _FakeAIClient(fake_response))

    job = {"id": 1, "name": "凌晨抓热点", "skill_slug": "content-planner"}
    out = night_runners.content_planner_runner(job)

    assert "AI 出 5 条选题" in out["output_summary"]
    assert "🔥92" in out["output_summary"]
    assert "一个老板花3万学AI" in out["output_summary"]
    # 5 条都写到 hot_topics
    assert len(out["output_refs"]) == 5
    assert all(r["kind"] == "hot_topic" for r in out["output_refs"])

    from shortvideo.works import list_hot_topics
    saved = list_hot_topics(limit=10)
    assert len(saved) == 5
    titles = {h.title for h in saved}
    assert "一个老板花3万学AI" in titles
    assert all(h.fetched_from == "night-shift" for h in saved)
    assert all(h.match_persona == 1 for h in saved)


def test_content_planner_runner_filters_national_leader_topics(tmp_db, monkeypatch):
    """夜班抓热点不能把国家领导人相关新闻写入热点库, 日志也不回显原标题."""
    from backend.services import night_runners
    from shortvideo import ai as ai_module

    fake_response = """[
        {"title": "某国总统发表讲话", "heat_score": 99, "match_reason": "新闻热度高"},
        {"title": "AI 帮老板做复盘", "heat_score": 86, "match_reason": "经营场景"}
    ]"""
    monkeypatch.setattr(ai_module, "get_ai_client",
                        lambda route_key=None: _FakeAIClient(fake_response))

    out = night_runners.content_planner_runner({"id": 1, "name": "凌晨抓热点"})

    assert "AI 出 1 条选题" in out["output_summary"]
    assert "总统" not in out["output_summary"]
    assert "总统" not in (out["log"] or "")

    from shortvideo.works import list_hot_topics
    saved = list_hot_topics(limit=10)
    assert [h.title for h in saved] == ["AI 帮老板做复盘"]


def test_content_planner_runner_ai_returns_garbage(tmp_db, monkeypatch):
    """AI 返回非 JSON → 不崩, 写明白错误."""
    from backend.services import night_runners
    from shortvideo import ai as ai_module
    monkeypatch.setattr(ai_module, "get_ai_client",
                        lambda route_key=None: _FakeAIClient("我不会出选题"))
    job = {"id": 1, "name": "凌晨抓热点", "skill_slug": "content-planner"}
    out = night_runners.content_planner_runner(job)
    assert "格式不对" in out["output_summary"] or "解析" in out["output_summary"]
    assert out["output_refs"] is None


def test_content_planner_runner_ai_throws(tmp_db, monkeypatch):
    """AI 抛异常 → 不崩."""
    from backend.services import night_runners
    from shortvideo import ai as ai_module

    class _Boom:
        def chat(self, *a, **kw):
            raise RuntimeError("apimart 余额不足")

    monkeypatch.setattr(ai_module, "get_ai_client",
                        lambda route_key=None: _Boom())
    job = {"id": 1, "name": "凌晨抓热点", "skill_slug": "content-planner"}
    out = night_runners.content_planner_runner(job)
    assert "AI 调用失败" in out["output_summary"]
    assert "apimart 余额不足" in (out["log"] or "")


def test_content_planner_runner_partial_save(tmp_db, monkeypatch):
    """AI 返回 5 条但其中 2 条 title 为空 → 只写 3 条, summary 反映."""
    from backend.services import night_runners
    from shortvideo import ai as ai_module

    fake = """[
        {"title": "好选题 1", "heat_score": 90, "match_reason": "x"},
        {"title": "", "heat_score": 70},
        {"title": "好选题 2", "heat_score": 85, "match_reason": "y"},
        {"title": "  ", "heat_score": 60},
        {"title": "好选题 3", "heat_score": 80}
    ]"""
    monkeypatch.setattr(ai_module, "get_ai_client",
                        lambda route_key=None: _FakeAIClient(fake))
    job = {"id": 1, "name": "凌晨抓热点", "skill_slug": "content-planner"}
    out = night_runners.content_planner_runner(job)
    assert len(out["output_refs"]) == 3
    assert "AI 出 3 条选题" in out["output_summary"]


def test_run_seeded_job_via_executor(tmp_db):
    """端到端: seed → run-now → 等结果 (走 daily_recap 真 runner, 0 calls 时也成功)."""
    from backend.services import night_executor, night_shift, night_runners
    night_runners.seed_defaults()
    job = next(j for j in night_shift.list_jobs() if j["name"] == "昨日复盘")
    rid = night_executor.run_job_async(job["id"])
    deadline = time.time() + 2.0
    while time.time() < deadline:
        r = night_shift.get_run(rid)
        if r and r["status"] != "running":
            break
        time.sleep(0.02)
    r = night_shift.get_run(rid)
    assert r["status"] == "success"
    # 0 calls 场景, summary 提示 "没东西"
    assert "没" in (r["output_summary"] or "") or "次" in (r["output_summary"] or "")
