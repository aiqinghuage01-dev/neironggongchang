"""Phase 9 · update_work 字段白名单测试.

历史 update_work(**fields) 把 fields 直接拼 UPDATE SQL, key 没校验.
现加 ALLOWED_WORK_UPDATE_FIELDS 白名单, 未知字段 raise ValueError.

验:
- 已有所有合法字段更新照旧 (不破坏现有调用)
- 未知字段 raise ValueError
- 注入式字段名 (含 =, ", , ;) raise
- 空 fields 静默 OK (no-op)
"""
from __future__ import annotations

import sqlite3
import time
from pathlib import Path

import pytest


@pytest.fixture
def tmp_db(monkeypatch, tmp_path):
    db = tmp_path / "works.db"
    data_dir = tmp_path / "data"
    data_dir.mkdir()
    monkeypatch.setattr("shortvideo.config.DB_PATH", db)
    monkeypatch.setattr("shortvideo.config.DATA_DIR", data_dir)
    from backend.services import migrations
    migrations.reset_for_test()
    migrations.apply_migrations()
    yield db
    for ext in ("", "-wal", "-shm", "-journal"):
        try:
            Path(str(db) + ext).unlink()
        except FileNotFoundError:
            pass


def _new_work() -> int:
    from shortvideo.works import insert_work
    return insert_work(
        title="orig", final_text="body", type="video", source_skill=None,
        status="pending", created_at=int(time.time()),
    )


# ─── 白名单常量本身 ──────────────────────────────────────────


def test_allowed_fields_set_is_frozen():
    from shortvideo.works import ALLOWED_WORK_UPDATE_FIELDS
    assert isinstance(ALLOWED_WORK_UPDATE_FIELDS, frozenset)


def test_allowed_fields_excludes_id_and_created_at():
    """id / created_at 不应允许 update (创建态)."""
    from shortvideo.works import ALLOWED_WORK_UPDATE_FIELDS
    assert "id" not in ALLOWED_WORK_UPDATE_FIELDS
    assert "created_at" not in ALLOWED_WORK_UPDATE_FIELDS


def test_allowed_fields_covers_existing_callers():
    """工程上现 update_work 调用方传的字段必须都在白名单内."""
    from shortvideo.works import ALLOWED_WORK_UPDATE_FIELDS
    # backend/api.py 实际传过这些 (grep 出)
    actual_callsite_fields = {
        "shiliu_video_id",   # api.py:555
        "status",            # api.py:620, 670
        "local_path",        # api.py:620
        "metadata",          # api.py:1904
    }
    missing = actual_callsite_fields - ALLOWED_WORK_UPDATE_FIELDS
    assert not missing, f"现有调用方传的字段未进白名单: {missing}"


# ─── 拒绝路径 ────────────────────────────────────────────────


def test_update_work_rejects_unknown_field(tmp_db):
    from shortvideo.works import update_work
    wid = _new_work()
    with pytest.raises(ValueError, match="不支持的字段"):
        update_work(wid, hacked_field="x")


def test_update_work_rejects_id_field(tmp_db):
    """禁止改 id (PK)."""
    from shortvideo.works import update_work
    wid = _new_work()
    with pytest.raises(ValueError):
        update_work(wid, id=999)


def test_update_work_rejects_created_at(tmp_db):
    """禁止改 created_at."""
    from shortvideo.works import update_work
    wid = _new_work()
    with pytest.raises(ValueError):
        update_work(wid, created_at=0)


def test_update_work_rejects_sql_injection_keys(tmp_db):
    """注入式 key — 含 =, 空格, 引号, 逗号, 分号."""
    from shortvideo.works import update_work
    wid = _new_work()
    for evil_key in [
        "title=?, status",
        "title; DROP TABLE works",
        "title' OR '1'='1",
        "title /* comment */",
        "x, y, z",
    ]:
        with pytest.raises(ValueError):
            update_work(wid, **{evil_key: "x"})


def test_update_work_partial_unknown_rejects_whole_call(tmp_db):
    """混合: 1 个合法 + 1 个非法 → 整体 raise (不部分应用)."""
    from shortvideo.works import update_work, get_work
    wid = _new_work()
    orig = get_work(wid)
    with pytest.raises(ValueError):
        update_work(wid, status="ready", evil="x")
    # 状态不应被部分应用
    assert get_work(wid).status == orig.status


# ─── 通过路径 ────────────────────────────────────────────────


def test_update_work_status_passes(tmp_db):
    from shortvideo.works import update_work, get_work
    wid = _new_work()
    update_work(wid, status="ready")
    assert get_work(wid).status == "ready"


def test_update_work_local_path_passes_and_normalizes(tmp_db, tmp_path):
    """local_path 进来要 normalize (已有逻辑, 验证白名单不破坏)."""
    from shortvideo.works import update_work, get_work
    wid = _new_work()
    update_work(wid, local_path="videos/x.mp4")
    out = get_work(wid).local_path
    # _normalize_path_for_db 会处理, 验证字段确实写入即可
    assert out is not None and "videos" in out


def test_update_work_metadata_passes(tmp_db):
    from shortvideo.works import update_work, get_work
    wid = _new_work()
    update_work(wid, metadata='{"k": "v"}')
    assert get_work(wid).metadata == '{"k": "v"}'


def test_update_work_multi_field_passes(tmp_db):
    from shortvideo.works import update_work, get_work
    wid = _new_work()
    update_work(wid, status="ready", shiliu_video_id=12345, error="none")
    w = get_work(wid)
    assert w.status == "ready"
    assert w.shiliu_video_id == 12345
    assert w.error == "none"


def test_update_work_empty_fields_noop(tmp_db):
    """空 fields 静默不动."""
    from shortvideo.works import update_work, get_work
    wid = _new_work()
    orig = get_work(wid)
    update_work(wid)  # no kwargs
    assert get_work(wid).status == orig.status


def test_update_work_all_allowed_fields_can_update(tmp_db):
    """全部 ALLOWED_WORK_UPDATE_FIELDS 都能成功更新, 不会撞 'no such column'."""
    from shortvideo.works import update_work, get_work, ALLOWED_WORK_UPDATE_FIELDS
    wid = _new_work()
    # 给每个允许字段一个合理值
    sample_values: dict[str, object] = {
        "title": "new title",
        "source_url": "https://x",
        "original_text": "orig",
        "final_text": "final",
        "avatar_id": 1,
        "speaker_id": 2,
        "shiliu_video_id": 3,
        "local_path": "videos/y.mp4",
        "duration_sec": 12.5,
        "status": "ready",
        "error": None,
        "tokens_used": 100,
        "type": "video",
        "source_skill": "wechat",
        "thumb_path": "covers/c.jpg",
        "metadata": '{"a":1}',
    }
    # 字段可能加了新的 — 至少 sample_values 里的全部能跑
    for field, value in sample_values.items():
        if field in ALLOWED_WORK_UPDATE_FIELDS:
            update_work(wid, **{field: value})  # 不应 raise
    # final state: 至少 status=ready
    assert get_work(wid).status == "ready"
