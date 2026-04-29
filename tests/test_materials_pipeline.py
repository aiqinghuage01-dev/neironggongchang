"""素材库 AI 打标 pipeline 测试 (D-087 Day 2).

覆盖:
- _filename_heuristic: 关键词匹配 / 短视频识别 / 文件夹投票
- _build_prompt: 含清华哥业务分区候选 + 素材元数据
- _parse_llm_json: 5 种格式 (原始 JSON / markdown 代码块 / 含前言 / 损坏 / 非 dict)
- _normalize_llm_result: tags 限 10 / folder 类型校验
- _upsert_tag / _write_tags: 去重 + ON CONFLICT 兜底
- tag_asset: LLM 路径 / fallback 路径 / 已打跳过 / 不存在 404
- tag_batch: 选未打标的 / force 重打 / 错误吞掉
- 错误路径: LLM 抛异常 → fallback 启发式; LLM 返非 JSON → fallback
- mock LLM 不真烧 credits (清华哥要求)
"""
from __future__ import annotations

import tempfile
import time
from pathlib import Path
from unittest.mock import MagicMock

import pytest


# ─── fixtures ─────────────────────────────────────────────


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
def tmp_thumb_dir(monkeypatch, tmp_path):
    thumb_dir = tmp_path / "thumbs"
    thumb_dir.mkdir()
    import backend.services.materials_service as ms
    monkeypatch.setattr(ms, "THUMB_DIR", thumb_dir)
    yield thumb_dir


@pytest.fixture
def tmp_root(monkeypatch, tmp_path):
    root = tmp_path / "materials_root"
    root.mkdir()
    (root / "00 讲台高光").mkdir()
    (root / "00 讲台高光" / "提问").mkdir()
    from PIL import Image
    Image.new("RGB", (400, 300), color="red").save(root / "00 讲台高光" / "提问" / "raise_hand.jpg")
    Image.new("RGB", (400, 300), color="blue").save(root / "00 讲台高光" / "podium.jpg")
    Image.new("RGB", (400, 300), color="green").save(root / "outside.jpg")
    monkeypatch.setattr(
        "backend.services.materials_service.get_materials_root",
        lambda: root,
    )
    yield root


@pytest.fixture
def populated(tmp_db, tmp_thumb_dir, tmp_root):
    from backend.services.materials_service import scan_root
    return scan_root()


@pytest.fixture
def mock_ai(monkeypatch):
    """mock get_ai_client 让 chat 返指定 text. 不真烧 LLM."""
    from shortvideo.deepseek import LLMResult

    def make_mock(text):
        fake = MagicMock()
        fake.chat = MagicMock(return_value=LLMResult(
            text=text, prompt_tokens=10, completion_tokens=20, total_tokens=30,
        ))
        return fake

    return make_mock


# ─── _filename_heuristic ──────────────────────────────────


def test_heuristic_matches_keywords():
    from backend.services.materials_pipeline import _filename_heuristic
    asset = {
        "filename": "讲台-提问A.mp4",
        "rel_folder": "00 讲台高光/提问",
        "ext": ".mp4",
        "duration_sec": 23,
    }
    r = _filename_heuristic(asset)
    assert "提问" in r["tags"]
    assert "讲台" in r["tags"]
    assert r["folder"] in ("01 演讲舞台", "02 上课教学")
    assert r["is_new"] is False


def test_heuristic_no_match_returns_unsorted():
    from backend.services.materials_pipeline import _filename_heuristic
    asset = {
        "filename": "IMG_1234.jpg",
        "rel_folder": ".",
        "ext": ".jpg",
    }
    r = _filename_heuristic(asset)
    assert r["tags"] == ["未分类"]
    assert r["folder"] is None


def test_heuristic_short_video_tag():
    from backend.services.materials_pipeline import _filename_heuristic
    asset = {
        "filename": "test.mp4",
        "rel_folder": ".",
        "ext": ".mp4",
        "duration_sec": 30,  # < 90s
    }
    r = _filename_heuristic(asset)
    assert "短视频" in r["tags"]


def test_heuristic_long_video_tag():
    from backend.services.materials_pipeline import _filename_heuristic
    asset = {
        "filename": "lecture.mp4",
        "rel_folder": ".",
        "ext": ".mp4",
        "duration_sec": 1800,
    }
    r = _filename_heuristic(asset)
    assert "长视频" in r["tags"]


def test_heuristic_folder_voting():
    """多关键词命中时, folder 选票数最多的."""
    from backend.services.materials_pipeline import _filename_heuristic
    asset = {
        "filename": "板书+课件_提问环节.png",
        "rel_folder": ".",
        "ext": ".png",
    }
    r = _filename_heuristic(asset)
    # 板书/课件/ppt 命中上课/做课, 提问命中上课
    assert r["folder"] in ("02 上课教学", "05 做课素材")


# ─── _build_prompt ────────────────────────────────────────


def test_build_prompt_has_business_categories():
    from backend.services.materials_pipeline import _build_prompt, KNOWN_FOLDERS
    asset = {
        "filename": "x.mp4", "rel_folder": ".",
        "ext": ".mp4", "duration_sec": 12.5,
    }
    p = _build_prompt(asset)
    # 必须含所有业务分区候选
    for folder in KNOWN_FOLDERS:
        assert folder in p
    assert "清华哥" in p
    assert "x.mp4" in p


def test_build_prompt_image_no_duration():
    from backend.services.materials_pipeline import _build_prompt
    asset = {
        "filename": "x.jpg", "rel_folder": "04 海报封面",
        "ext": ".jpg", "width": 1920, "height": 1080,
    }
    p = _build_prompt(asset)
    assert "图片" in p
    assert "1920×1080" in p
    # 没时长字段
    assert "时长:" not in p


def test_build_prompt_strict_json_instruction():
    """prompt 必须明确要求严格 JSON (不加前言)."""
    from backend.services.materials_pipeline import _build_prompt
    asset = {"filename": "x.mp4", "rel_folder": ".", "ext": ".mp4"}
    p = _build_prompt(asset)
    assert "JSON" in p


# ─── _parse_llm_json ──────────────────────────────────────


def test_parse_clean_json():
    from backend.services.materials_pipeline import _parse_llm_json
    text = '{"tags": ["a", "b"], "folder": "01 演讲舞台", "is_new": false}'
    r = _parse_llm_json(text)
    assert r["tags"] == ["a", "b"]
    assert r["folder"] == "01 演讲舞台"


def test_parse_json_with_markdown_fence():
    """LLM 习惯 ```json ... ``` 包裹, 必须能解析."""
    from backend.services.materials_pipeline import _parse_llm_json
    text = '```json\n{"tags": ["a"], "folder": "x"}\n```'
    r = _parse_llm_json(text)
    assert r["tags"] == ["a"]


def test_parse_json_with_preamble():
    """LLM 偶尔在 JSON 前加前言, 用 regex 抓 { ... }."""
    from backend.services.materials_pipeline import _parse_llm_json
    text = '好的, 我帮你打标:\n{"tags": ["a"], "folder": "x"}'
    r = _parse_llm_json(text)
    assert r["tags"] == ["a"]


def test_parse_corrupt_returns_none():
    from backend.services.materials_pipeline import _parse_llm_json
    assert _parse_llm_json("not_json") is None
    assert _parse_llm_json("") is None
    assert _parse_llm_json(None) is None


def test_parse_non_dict_json_returns_none():
    from backend.services.materials_pipeline import _parse_llm_json
    # JSON 是 array 不是 dict
    r = _parse_llm_json('["a", "b"]')
    assert r is None


# ─── _normalize_llm_result ────────────────────────────────


def test_normalize_strips_and_caps_tags():
    from backend.services.materials_pipeline import _normalize_llm_result
    r = _normalize_llm_result({
        "tags": ["a", " b ", "", *(f"t{i}" for i in range(20))],
        "folder": "x",
        "is_new": True,
        "reason": "abc",
    })
    assert "" not in r["tags"]
    assert len(r["tags"]) <= 10
    assert r["is_new"] is True


def test_normalize_invalid_folder_becomes_none():
    from backend.services.materials_pipeline import _normalize_llm_result
    r = _normalize_llm_result({"tags": [], "folder": 123, "is_new": False, "reason": ""})
    assert r["folder"] is None


# ─── _upsert_tag / _write_tags ────────────────────────────


def test_upsert_tag_creates_new(tmp_db, tmp_thumb_dir, tmp_root):
    from backend.services.materials_pipeline import _upsert_tag
    from backend.services.materials_service import scan_root
    from shortvideo.db import get_connection
    scan_root()
    with get_connection() as con:
        tid = _upsert_tag(con, "测试标签")
        con.commit()
    assert tid > 0


def test_upsert_tag_returns_existing_id(tmp_db, tmp_thumb_dir, tmp_root):
    from backend.services.materials_pipeline import _upsert_tag
    from backend.services.materials_service import scan_root
    from shortvideo.db import get_connection
    scan_root()
    with get_connection() as con:
        a = _upsert_tag(con, "x")
        b = _upsert_tag(con, "x")
        con.commit()
    assert a == b


def test_write_tags_idempotent(tmp_db, tmp_thumb_dir, tmp_root):
    """同一 asset 同一 tag 写两次不报错 (ON CONFLICT 兜底)."""
    from backend.services.materials_pipeline import _write_tags
    from backend.services.materials_service import scan_root, list_assets, get_asset
    scan_root()
    aid = list_assets()[0]["id"]
    n1 = _write_tags(aid, ["x", "y"])
    n2 = _write_tags(aid, ["x", "y"])
    assert n1 == 2
    assert n2 == 2  # write_tags 调用没崩 (实际 INSERT OR IGNORE 跳过)
    a = get_asset(aid)
    tag_names = {t["name"] for t in a["tags"]}
    assert {"x", "y"} <= tag_names


# ─── tag_asset (主路径) ───────────────────────────────────


def test_tag_asset_404(tmp_db, tmp_thumb_dir, tmp_root):
    from backend.services.materials_pipeline import tag_asset
    with pytest.raises(ValueError):
        tag_asset("nonexistent_id")


def test_tag_asset_uses_llm_when_returns_valid_json(tmp_db, tmp_thumb_dir, tmp_root, monkeypatch, mock_ai):
    from backend.services.materials_service import scan_root, list_assets, get_asset
    from backend.services.materials_pipeline import tag_asset
    scan_root()
    aid = list_assets()[0]["id"]
    fake = mock_ai('{"tags": ["讲台", "提问"], "folder": "01 演讲舞台", "is_new": false, "reason": "看起来像讲课"}')
    monkeypatch.setattr("shortvideo.ai.get_ai_client", lambda **kw: fake)
    r = tag_asset(aid)
    assert r["source"] == "llm"
    assert "讲台" in r["tags"]
    assert "提问" in r["tags"]
    # DB 写入
    a = get_asset(aid)
    tag_names = {t["name"] for t in a["tags"]}
    assert "讲台" in tag_names


def test_tag_asset_falls_back_when_llm_returns_garbage(tmp_db, tmp_thumb_dir, tmp_root, monkeypatch, mock_ai):
    """LLM 返非 JSON → 走启发式."""
    from backend.services.materials_service import scan_root, list_assets
    from backend.services.materials_pipeline import tag_asset
    scan_root()
    aid = next(a["id"] for a in list_assets() if "讲台" in a["filename"] or "讲台" in a.get("rel_folder", ""))
    fake = mock_ai("我没法做这个 :)")  # 非 JSON
    monkeypatch.setattr("shortvideo.ai.get_ai_client", lambda **kw: fake)
    r = tag_asset(aid)
    assert r["source"] == "heuristic"
    assert len(r["tags"]) > 0


def test_tag_asset_falls_back_when_llm_throws(tmp_db, tmp_thumb_dir, tmp_root, monkeypatch):
    """LLM 抛异常 → 走启发式, 不冒泡."""
    from backend.services.materials_service import scan_root, list_assets
    from backend.services.materials_pipeline import tag_asset

    def boom(**kw):
        fake = MagicMock()
        fake.chat = MagicMock(side_effect=RuntimeError("OpenClaw 503"))
        return fake

    scan_root()
    aid = list_assets()[0]["id"]
    monkeypatch.setattr("shortvideo.ai.get_ai_client", boom)
    r = tag_asset(aid)
    assert r["source"] == "heuristic"


def test_tag_asset_skips_already_tagged(tmp_db, tmp_thumb_dir, tmp_root, monkeypatch, mock_ai):
    """已打过的素材再调 tag_asset 不重打 (force=False 时)."""
    from backend.services.materials_service import scan_root, list_assets
    from backend.services.materials_pipeline import tag_asset
    scan_root()
    aid = list_assets()[0]["id"]
    # 第一次打
    fake = mock_ai('{"tags": ["x"], "folder": null, "is_new": false, "reason": ""}')
    monkeypatch.setattr("shortvideo.ai.get_ai_client", lambda **kw: fake)
    tag_asset(aid)
    # 第二次 (不 force)
    fake2 = mock_ai('{"tags": ["y"], "folder": null, "is_new": false}')
    monkeypatch.setattr("shortvideo.ai.get_ai_client", lambda **kw: fake2)
    r = tag_asset(aid)
    assert r["source"] == "cached"


def test_tag_asset_force_repegs(tmp_db, tmp_thumb_dir, tmp_root, monkeypatch, mock_ai):
    """force=True 重新打."""
    from backend.services.materials_service import scan_root, list_assets, get_asset
    from backend.services.materials_pipeline import tag_asset
    scan_root()
    aid = list_assets()[0]["id"]
    fake = mock_ai('{"tags": ["首次"], "folder": null, "is_new": false}')
    monkeypatch.setattr("shortvideo.ai.get_ai_client", lambda **kw: fake)
    tag_asset(aid)
    # 强重打
    fake2 = mock_ai('{"tags": ["重打"], "folder": null, "is_new": false}')
    monkeypatch.setattr("shortvideo.ai.get_ai_client", lambda **kw: fake2)
    r = tag_asset(aid, force=True)
    assert r["source"] == "llm"
    a = get_asset(aid)
    tag_names = {t["name"] for t in a["tags"]}
    assert "首次" in tag_names  # 老的不删
    assert "重打" in tag_names


def test_tag_asset_records_pending_move(tmp_db, tmp_thumb_dir, tmp_root, monkeypatch, mock_ai):
    """LLM 建议归档到不同文件夹 → 写 material_pending_moves."""
    from backend.services.materials_service import scan_root, list_assets
    from backend.services.materials_pipeline import tag_asset
    from shortvideo.db import get_connection
    scan_root()
    # 取根目录的 outside.jpg (rel_folder = ".")
    aid = next(a["id"] for a in list_assets() if a["filename"] == "outside.jpg")
    fake = mock_ai('{"tags": ["其他"], "folder": "07 品牌资产", "is_new": false, '
                   '"no_move": false, "confidence": 0.85, "reason": "看起来是海报"}')
    monkeypatch.setattr("shortvideo.ai.get_ai_client", lambda **kw: fake)
    tag_asset(aid)
    with get_connection() as con:
        row = con.execute(
            "SELECT suggested_folder, status FROM material_pending_moves WHERE asset_id=?",
            (aid,),
        ).fetchone()
    assert row is not None
    assert row[0] == "07 品牌资产"
    assert row[1] == "pending"


# ─── tag_batch ────────────────────────────────────────────


def test_tag_batch_picks_unprocessed(tmp_db, tmp_thumb_dir, tmp_root, monkeypatch, mock_ai):
    """batch 默认只选未打过标的."""
    from backend.services.materials_service import scan_root, list_assets
    from backend.services.materials_pipeline import tag_asset, tag_batch
    scan_root()
    items = list_assets()
    # 给第一条手动打个标
    fake = mock_ai('{"tags": ["已打"], "folder": null, "is_new": false}')
    monkeypatch.setattr("shortvideo.ai.get_ai_client", lambda **kw: fake)
    tag_asset(items[0]["id"])
    # 批量打剩下
    r = tag_batch(limit=5)
    assert r["scanned"] == 2  # 3 - 1 已打 = 2 未打
    assert r["ok"] == 2


def test_tag_batch_force_repegs_all(tmp_db, tmp_thumb_dir, tmp_root, monkeypatch, mock_ai):
    from backend.services.materials_service import scan_root
    from backend.services.materials_pipeline import tag_batch
    scan_root()
    fake = mock_ai('{"tags": ["batch"], "folder": null, "is_new": false}')
    monkeypatch.setattr("shortvideo.ai.get_ai_client", lambda **kw: fake)
    r = tag_batch(limit=5, force=True)
    assert r["scanned"] == 3
    assert r["ok"] == 3


def test_tag_batch_handles_individual_failures(tmp_db, tmp_thumb_dir, tmp_root, monkeypatch):
    """单条失败不影响其他, ok / failed 都计数."""
    from backend.services.materials_service import scan_root, list_assets
    from backend.services.materials_pipeline import tag_batch

    fake = MagicMock()
    call_count = [0]

    def chat(*a, **kw):
        from shortvideo.deepseek import LLMResult
        call_count[0] += 1
        if call_count[0] == 1:
            raise RuntimeError("first fail")
        return LLMResult(
            text='{"tags": ["x"], "folder": null, "is_new": false}',
            prompt_tokens=1, completion_tokens=1, total_tokens=2,
        )

    fake.chat = chat
    monkeypatch.setattr("shortvideo.ai.get_ai_client", lambda **kw: fake)
    scan_root()
    r = tag_batch(limit=3, force=True)
    # 即使 LLM 失败也走 fallback heuristic, 不算 failed
    assert r["scanned"] == 3
    assert r["failed"] == 0  # 启发式兜底, 全部成功


def test_tag_batch_progress_callback(tmp_db, tmp_thumb_dir, tmp_root, monkeypatch, mock_ai):
    from backend.services.materials_service import scan_root
    from backend.services.materials_pipeline import tag_batch
    scan_root()
    fake = mock_ai('{"tags": ["x"], "folder": null, "is_new": false}')
    monkeypatch.setattr("shortvideo.ai.get_ai_client", lambda **kw: fake)
    calls = []
    tag_batch(limit=5, on_progress=lambda i, t, p: calls.append((i, t)))
    # on_progress 间隔 i % 2 == 0 → 至少调到 1 次
    assert len(calls) >= 1


# ─── API 集成 ────────────────────────────────────────────


def test_api_tag_endpoint(tmp_db, tmp_thumb_dir, tmp_root, monkeypatch, mock_ai):
    from fastapi.testclient import TestClient
    from backend.services.materials_service import scan_root, list_assets
    scan_root()
    fake = mock_ai('{"tags": ["api 测试"], "folder": null, "is_new": false}')
    import backend.api as api_mod
    monkeypatch.setattr("shortvideo.ai.get_ai_client", lambda **kw: fake)
    client = TestClient(api_mod.app)
    aid = list_assets()[0]["id"]
    r = client.post(f"/api/material-lib/tag/{aid}")
    assert r.status_code == 200
    d = r.json()
    assert "api 测试" in d["tags"]


def test_api_tag_404(tmp_db, tmp_thumb_dir, tmp_root):
    from fastapi.testclient import TestClient
    import backend.api as api_mod
    client = TestClient(api_mod.app)
    r = client.post("/api/material-lib/tag/nonexistent_id")
    assert r.status_code == 404


def test_api_tag_batch_returns_task_id(tmp_db, tmp_thumb_dir, tmp_root, monkeypatch, mock_ai):
    """tag-batch endpoint 走 D-068 daemon, 返 task_id."""
    from fastapi.testclient import TestClient
    from backend.services.materials_service import scan_root
    from backend.services import tasks as tasks_service
    import backend.api as api_mod
    scan_root()
    fake = mock_ai('{"tags": ["x"], "folder": null, "is_new": false}')
    monkeypatch.setattr("shortvideo.ai.get_ai_client", lambda **kw: fake)
    # mock run_async 同步 (沿用 D-085 follow-up 模式防 daemon 串扰)
    real_create = tasks_service.create_task
    real_finish = tasks_service.finish_task

    def sync_run(*, kind, label=None, ns=None, page_id=None, step=None,
                 payload=None, estimated_seconds=None, progress_text=None,
                 sync_fn=None, sync_fn_with_ctx=None):
        tid = real_create(kind=kind, label=label, ns=ns, page_id=page_id, step=step,
                          payload=payload, estimated_seconds=estimated_seconds)
        try:
            if sync_fn_with_ctx is not None:
                res = sync_fn_with_ctx(tasks_service.TaskContext(tid))
            else:
                res = sync_fn()
            real_finish(tid, result=res, status="ok")
        except Exception as e:
            real_finish(tid, error=str(e), status="failed")
        return tid

    monkeypatch.setattr("backend.services.tasks.run_async", sync_run)
    client = TestClient(api_mod.app)
    r = client.post("/api/material-lib/tag-batch?limit=3")
    assert r.status_code == 200
    d = r.json()
    assert "task_id" in d
    t = tasks_service.get_task(d["task_id"])
    assert t["status"] == "ok"
    assert t["result"]["scanned"] == 3


# ─── B'-2 pending 不覆盖审核 + heuristic source ─────────────


def test_pending_move_skips_approved(tmp_db, tmp_thumb_dir, tmp_root):
    """已 approved 的素材, 再调 _write_pending_move 默认不覆盖, 保留历史结论."""
    from backend.services.materials_service import (
        scan_root, list_assets, approve_pending,
    )
    from backend.services.materials_pipeline import _write_pending_move
    from shortvideo.db import get_connection
    scan_root()
    aid = list_assets()[0]["id"]
    _write_pending_move(aid, "01 通过组", "first round", confidence=0.85, is_new=True)
    approve_pending(aid)
    # 第二轮 AI 又建议这条改归档 → 应被守
    rv = _write_pending_move(aid, "02 不一样", "second round", confidence=0.85, is_new=True)
    assert rv == "skipped_approved"
    with get_connection() as con:
        row = con.execute(
            "SELECT suggested_folder, status FROM material_pending_moves WHERE asset_id=?",
            (aid,),
        ).fetchone()
    # 历史结论保留: 还是第一轮的 folder + status=approved
    assert row[0] == "01 通过组"
    assert row[1] == "approved"


def test_pending_move_skips_rejected(tmp_db, tmp_thumb_dir, tmp_root):
    """已 rejected 的素材, 再写 pending 默认不覆盖."""
    from backend.services.materials_service import scan_root, list_assets, reject_pending
    from backend.services.materials_pipeline import _write_pending_move
    from shortvideo.db import get_connection
    scan_root()
    aid = list_assets()[0]["id"]
    _write_pending_move(aid, "01 想搬", "first", confidence=0.85, is_new=True)
    reject_pending(aid)
    rv = _write_pending_move(aid, "02 又想搬", "second", confidence=0.85, is_new=True)
    assert rv == "skipped_rejected"
    with get_connection() as con:
        st = con.execute(
            "SELECT status FROM material_pending_moves WHERE asset_id=?", (aid,)
        ).fetchone()[0]
    assert st == "rejected"


def test_pending_move_reset_review_overrides_history(tmp_db, tmp_thumb_dir, tmp_root):
    """显式 reset_review=True 才能覆盖审核过的结论 (重打/重审用)."""
    from backend.services.materials_service import scan_root, list_assets, reject_pending
    from backend.services.materials_pipeline import _write_pending_move
    from shortvideo.db import get_connection
    scan_root()
    aid = list_assets()[0]["id"]
    _write_pending_move(aid, "01 旧建议", "old", confidence=0.85, is_new=True)
    reject_pending(aid)
    rv = _write_pending_move(aid, "99 新建议", "new", confidence=0.85, is_new=True, reset_review=True)
    assert rv == "written"
    with get_connection() as con:
        row = con.execute(
            "SELECT suggested_folder, status FROM material_pending_moves WHERE asset_id=?", (aid,)
        ).fetchone()
    assert row[0] == "99 新建议"
    assert row[1] == "pending"


def test_pending_move_overwrites_existing_pending(tmp_db, tmp_thumb_dir, tmp_root):
    """status='pending' (还没审) 的可以被覆盖, 不需要 reset_review.
    场景: 改 prompt 重出建议, 老板还没审, 直接换最新."""
    from backend.services.materials_service import scan_root, list_assets
    from backend.services.materials_pipeline import _write_pending_move
    from shortvideo.db import get_connection
    scan_root()
    aid = list_assets()[0]["id"]
    _write_pending_move(aid, "01 第一稿", "v1", confidence=0.85, is_new=True)
    rv = _write_pending_move(aid, "02 第二稿", "v2", confidence=0.85, is_new=True)
    assert rv == "written"
    with get_connection() as con:
        row = con.execute(
            "SELECT suggested_folder FROM material_pending_moves WHERE asset_id=?", (aid,)
        ).fetchone()
    assert row[0] == "02 第二稿"


def test_pending_move_no_folder_is_noop(tmp_db, tmp_thumb_dir, tmp_root):
    from backend.services.materials_service import scan_root, list_assets
    from backend.services.materials_pipeline import _write_pending_move
    scan_root()
    aid = list_assets()[0]["id"]
    assert _write_pending_move(aid, "", "x", confidence=0.85, is_new=True) == "noop_no_folder"
    assert _write_pending_move(aid, None, "x", confidence=0.85, is_new=True) == "noop_no_folder"


def test_tag_asset_falls_back_writes_heuristic_source(tmp_db, tmp_thumb_dir, tmp_root, monkeypatch):
    """LLM 失败走 heuristic 时, material_tags.source 应是 'heuristic' 不是 'ai'.
    这样后续筛低可信 fallback 标签才有依据 (GPT P3 修订)."""
    from backend.services.materials_service import scan_root, list_assets
    from backend.services.materials_pipeline import tag_asset
    from shortvideo.db import get_connection

    class _FailAi:
        def chat(self, *a, **kw):
            raise RuntimeError("LLM 假装挂")
    monkeypatch.setattr("shortvideo.ai.get_ai_client", lambda **kw: _FailAi())

    scan_root()
    aid = next(a["id"] for a in list_assets() if a["filename"] == "raise_hand.jpg")
    r = tag_asset(aid)
    assert r["source"] == "heuristic"
    # tags 里至少 1 个, source='heuristic' 而非 'ai'
    with get_connection() as con:
        sources = [s[0] for s in con.execute(
            "SELECT t.source FROM material_tags t "
            "JOIN material_asset_tags at ON at.tag_id=t.id "
            "WHERE at.asset_id=?", (aid,)
        ).fetchall()]
    assert len(sources) > 0
    assert all(s == "heuristic" for s in sources), f"想要全 heuristic, 实拿 {sources}"


def test_tag_asset_llm_writes_llm_source(tmp_db, tmp_thumb_dir, tmp_root, monkeypatch, mock_ai):
    """LLM 成功时, material_tags.source 应是 'llm'."""
    from backend.services.materials_service import scan_root, list_assets
    from backend.services.materials_pipeline import tag_asset
    from shortvideo.db import get_connection
    scan_root()
    aid = list_assets()[0]["id"]
    fake = mock_ai('{"tags": ["独特LLM标签XYZ"], "folder": null, "is_new": false, "reason": "ok"}')
    monkeypatch.setattr("shortvideo.ai.get_ai_client", lambda **kw: fake)
    tag_asset(aid)
    with get_connection() as con:
        srcs = [s[0] for s in con.execute(
            "SELECT t.source FROM material_tags t WHERE t.name=?",
            ("独特LLM标签XYZ",),
        ).fetchall()]
    assert "llm" in srcs


# ─── B'-3 confidence + no_move 守卫 ─────────────────────


def test_pending_skipped_when_no_move_true(tmp_db, tmp_thumb_dir, tmp_root):
    """no_move=True → 不写 pending (AI 觉得当前位置就行)."""
    from backend.services.materials_pipeline import _write_pending_move
    rv = _write_pending_move("aid_x", "01 任意", "x", confidence=0.9, no_move=True)
    assert rv == "skipped_no_move"


def test_pending_skipped_when_low_confidence(tmp_db, tmp_thumb_dir, tmp_root):
    """confidence < 0.75 → 不写 (老板只看高置信)."""
    from backend.services.materials_pipeline import _write_pending_move
    assert _write_pending_move("aid_x", "01 太弱", "x", confidence=0.5, no_move=False) == "skipped_low_conf"
    assert _write_pending_move("aid_x", "01 没填", "x", confidence=None, no_move=False) == "skipped_low_conf"
    assert _write_pending_move("aid_x", "01 卡线下", "x", confidence=0.74, no_move=False) == "skipped_low_conf"


def test_pending_written_when_high_confidence_and_move(tmp_db, tmp_thumb_dir, tmp_root):
    """confidence>=0.75 且 no_move=False → 写, 带新一代标记."""
    from backend.services.materials_service import scan_root, list_assets
    from backend.services.materials_pipeline import _write_pending_move
    from shortvideo.db import get_connection
    scan_root()
    aid = list_assets()[0]["id"]
    rv = _write_pending_move(aid, "99 新建议", "高置信", confidence=0.85)
    assert rv == "written"
    with get_connection() as con:
        row = con.execute(
            "SELECT confidence, suggestion_version, status FROM material_pending_moves WHERE asset_id=?",
            (aid,),
        ).fetchone()
    assert abs(row[0] - 0.85) < 0.01
    assert row[1] == 2  # PENDING_SUGGESTION_VERSION
    assert row[2] == "pending"


def test_normalize_extracts_confidence_and_no_move(tmp_db):
    from backend.services.materials_pipeline import _normalize_llm_result
    r = _normalize_llm_result({
        "tags": ["a", "b"],
        "folder": "01 X",
        "is_new": False,
        "no_move": True,
        "confidence": 0.4,
        "reason": "hint",
    })
    assert r["no_move"] is True
    assert r["confidence"] == 0.4
    # confidence 缺省 = 0.5 (中等)
    r2 = _normalize_llm_result({"tags": [], "reason": "x"})
    assert r2["confidence"] == 0.5
    assert r2["no_move"] is False
    # confidence 边界裁剪
    r3 = _normalize_llm_result({"confidence": 1.5})
    assert r3["confidence"] == 1.0
    r4 = _normalize_llm_result({"confidence": -0.3})
    assert r4["confidence"] == 0.0
    # confidence 非数字 → 默认 0.5
    r5 = _normalize_llm_result({"confidence": "high"})
    assert r5["confidence"] == 0.5


def test_tag_asset_llm_low_conf_no_pending(tmp_db, tmp_thumb_dir, tmp_root, monkeypatch, mock_ai):
    """LLM 给低 confidence 建议 → 标签写, pending 不写 (即使 folder 跟当前不一样)."""
    from backend.services.materials_service import scan_root, list_assets
    from backend.services.materials_pipeline import tag_asset
    from shortvideo.db import get_connection
    scan_root()
    aid = next(a["id"] for a in list_assets() if a["filename"] == "outside.jpg")
    fake = mock_ai('{"tags": ["t1"], "folder": "04 海报", "is_new": false, '
                   '"no_move": false, "confidence": 0.4, "reason": "拿不准"}')
    monkeypatch.setattr("shortvideo.ai.get_ai_client", lambda **kw: fake)
    r = tag_asset(aid)
    assert r["confidence"] == 0.4
    with get_connection() as con:
        # 标签写了
        n_tags = con.execute(
            "SELECT COUNT(*) FROM material_asset_tags WHERE asset_id=?", (aid,)
        ).fetchone()[0]
        assert n_tags >= 1
        # pending 没写
        row = con.execute(
            "SELECT * FROM material_pending_moves WHERE asset_id=?", (aid,)
        ).fetchone()
    assert row is None


def test_tag_asset_llm_no_move_skips_pending(tmp_db, tmp_thumb_dir, tmp_root, monkeypatch, mock_ai):
    """LLM 说 no_move=true → 即便高 confidence 也不写 pending."""
    from backend.services.materials_service import scan_root, list_assets
    from backend.services.materials_pipeline import tag_asset
    from shortvideo.db import get_connection
    scan_root()
    aid = next(a["id"] for a in list_assets() if a["filename"] == "outside.jpg")
    fake = mock_ai('{"tags": ["x"], "folder": null, "is_new": false, '
                   '"no_move": true, "confidence": 0.95, "reason": "已合理"}')
    monkeypatch.setattr("shortvideo.ai.get_ai_client", lambda **kw: fake)
    tag_asset(aid)
    with get_connection() as con:
        row = con.execute(
            "SELECT * FROM material_pending_moves WHERE asset_id=?", (aid,)
        ).fetchone()
    assert row is None


def test_classify_asset_writes_structured_profile_without_llm(tmp_db, tmp_thumb_dir, tmp_root, monkeypatch):
    """D-124 metadata 分类不调用 LLM, 写 category/summary/quality/source."""
    from backend.services.materials_service import scan_root, list_assets, get_asset
    from backend.services.materials_pipeline import classify_asset
    scan_root()
    aid = next(a["id"] for a in list_assets() if a["filename"] == "raise_hand.jpg")

    def should_not_call(**kw):
        raise AssertionError("metadata 分类不应调用 LLM")
    monkeypatch.setattr("shortvideo.ai.get_ai_client", should_not_call)

    r = classify_asset(aid)
    assert r["source"] == "metadata"
    assert r["recognition_source"] == "metadata"
    assert r["category"] in ("01 演讲舞台", "02 上课教学")
    a = get_asset(aid)
    assert a["profile_updated_at"] is not None
    assert a["visual_summary"]


def test_classify_batch_defaults_to_unprofiled(tmp_db, tmp_thumb_dir, tmp_root):
    from backend.services.materials_service import scan_root, list_assets
    from backend.services.materials_pipeline import classify_asset, classify_batch
    scan_root()
    first = list_assets()[0]["id"]
    classify_asset(first)
    r = classify_batch(limit=10)
    assert r["scanned"] == 2  # fixture 3 张, 已识别 1 张
    assert r["ok"] == 2
    assert r["source"] == "metadata"


def test_list_pending_review_default_excludes_legacy(tmp_db, tmp_thumb_dir, tmp_root):
    """默认 include_legacy=False, 只返 suggestion_version>=2. 旧 row (v=1, status='stale') 不返."""
    from backend.services.materials_service import scan_root, list_assets, list_pending_review
    from shortvideo.db import get_connection
    scan_root()
    items = list_assets()
    aid_legacy = items[0]["id"]
    aid_new = items[1]["id"]
    # 模拟旧条目: status='stale', version=1
    with get_connection() as con:
        con.execute(
            "INSERT INTO material_pending_moves "
            "(asset_id, suggested_folder, is_new_folder, reason, status, created_at, suggestion_version) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            (aid_legacy, "01 旧", 0, "old", "stale", 1, 1),
        )
        # 新一代: version=2, status='pending', confidence=0.9
        con.execute(
            "INSERT INTO material_pending_moves "
            "(asset_id, suggested_folder, is_new_folder, reason, status, created_at, "
            "confidence, suggestion_version) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (aid_new, "99 新", 1, "new", "pending", 2, 0.9, 2),
        )
        con.commit()
    rows = list_pending_review()
    ids = {r["id"] for r in rows}
    assert aid_new in ids
    assert aid_legacy not in ids
    # 加 include_legacy 才有
    rows2 = list_pending_review(include_legacy=True)
    ids2 = {r["id"] for r in rows2}
    assert aid_new in ids2
    assert aid_legacy in ids2


def test_get_stats_pending_count_excludes_legacy(tmp_db, tmp_thumb_dir, tmp_root):
    """get_stats.pending_review 只数新一代, 不数 legacy stale."""
    from backend.services.materials_service import scan_root, list_assets, get_stats
    from shortvideo.db import get_connection
    scan_root()
    items = list_assets()
    a, b = items[0]["id"], items[1]["id"]
    with get_connection() as con:
        con.execute(
            "INSERT INTO material_pending_moves "
            "(asset_id, suggested_folder, status, created_at, suggestion_version) "
            "VALUES (?, ?, ?, ?, ?)",
            (a, "x", "stale", 1, 1),
        )
        con.execute(
            "INSERT INTO material_pending_moves "
            "(asset_id, suggested_folder, status, created_at, confidence, suggestion_version) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (b, "y", "pending", 2, 0.85, 2),
        )
        con.commit()
    s = get_stats()
    assert s["pending_review"] == 1  # 只数 b
