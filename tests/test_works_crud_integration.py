"""works CRUD 集成回归测试 (D-084 P1 验收).

GPT 终审 P1 关键: shortvideo/works.py 的 _conn() 必须保留
    conn.row_factory = sqlite3.Row
否则 _row_to_work(row["id"]) 字典式访问会撞 IndexError (sqlite3 默认返 tuple).

本测试创/读/查 5 条 works 记录, 全程走 insert_work / get_work / list_works,
确认 row_factory 行为没丢.
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


def test_works_crud_5_records_all_fields_accessible(tmp_db):
    """P1 验收: 创 5 条 works, 全部可读, 字典式访问 row['id'] 等不报错."""
    from shortvideo.works import insert_work, get_work, list_works

    # 创 5 条不同类型的 work
    work_ids = []
    for i, (work_type, title) in enumerate([
        ("video", "测试视频 1"),
        ("image", "测试图 2"),
        ("text",  "测试文案 3"),
        ("video", "测试视频 4"),
        ("image", "测试图 5"),
    ]):
        wid = insert_work(
            final_text=f"内容 #{i}",
            title=title,
            type=work_type,
            source_skill="d084-test",
            status="ok",
        )
        work_ids.append(wid)

    # 单条读取 — 触发 _row_to_work 的字典访问 (P1 关键)
    for wid in work_ids:
        w = get_work(wid)
        assert w is not None, f"work_id={wid} 读不到"
        # 验证字典式访问的字段都能拿到 (没丢 row_factory 的话这些都不会 KeyError)
        assert w.id == wid
        assert w.title is not None
        assert w.final_text != ""
        assert w.type in ("video", "image", "text")
        assert w.source_skill == "d084-test"
        assert w.status == "ok"

    # 批量列表读取 — _row_to_work 在 list 上下文也 OK
    all_works = list_works(limit=10)
    listed_ids = {w.id for w in all_works}
    assert set(work_ids) <= listed_ids, "list_works 漏 work"

    # 按 type 过滤
    videos = list_works(limit=10, type="video")
    assert all(w.type == "video" for w in videos)
    assert len([w for w in videos if w.id in work_ids]) == 2


def test_works_row_factory_preserved_dict_access_works(tmp_db):
    """直白验收: _conn() 返回的 connection 用 row_factory=Row, row['id'] 不撞错."""
    import sqlite3
    from shortvideo.works import _conn, init_db, insert_work

    init_db()
    insert_work(final_text="row_factory 验收", title="t1", type="video")

    with _conn() as con:
        # 必须能用 row[<列名>] 字典访问
        row = con.execute("SELECT id, title, type FROM works LIMIT 1").fetchone()
        assert row is not None
        assert isinstance(row, sqlite3.Row), f"_conn 返回的 row 类型不是 sqlite3.Row: {type(row)}"
        # 字典访问不报错 (P1 验收)
        _ = row["id"]
        _ = row["title"]
        _ = row["type"]
