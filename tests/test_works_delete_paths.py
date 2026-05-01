"""Phase 8 · delete_work 安全删除测试.

验:
- 相对路径 "videos/a.mp4" → 删 DATA_DIR/videos/a.mp4
- DATA_DIR 内绝对路径 → 删
- DATA_DIR 外绝对路径 → 不删 (但 DB row 仍删)
- 含 ".." 跳出 → 不删
- symlink 跳出 → 不删
- 路径不存在 → 静默 OK
- DB row 永远删 (即使文件没删)
"""
from __future__ import annotations

import sqlite3
import tempfile
import time
from pathlib import Path

import pytest


@pytest.fixture
def tmp_db_and_data(tmp_path, monkeypatch):
    """每 test 一个干净 DB + DATA_DIR. 重要: monkeypatch 同时覆盖 DB_PATH 和 DATA_DIR."""
    db = tmp_path / "works.db"
    data_dir = tmp_path / "data"
    (data_dir / "videos").mkdir(parents=True)
    (data_dir / "covers").mkdir(parents=True)

    monkeypatch.setattr("shortvideo.config.DB_PATH", db)
    monkeypatch.setattr("shortvideo.config.DATA_DIR", data_dir)
    monkeypatch.setattr("shortvideo.config.AUDIO_DIR", data_dir / "audio")
    monkeypatch.setattr("shortvideo.config.VIDEO_DIR", data_dir / "videos")

    from backend.services import migrations
    migrations.reset_for_test()
    migrations.apply_migrations()

    yield {"db": db, "data_dir": data_dir, "tmp": tmp_path}

    for ext in ("", "-wal", "-shm", "-journal"):
        try:
            Path(str(db) + ext).unlink()
        except FileNotFoundError:
            pass


# ─── _resolve_data_path 单元 ──────────────────────────────────


def test_resolve_data_path_relative_becomes_absolute(tmp_db_and_data):
    from shortvideo.works import _resolve_data_path
    out = _resolve_data_path("videos/a.mp4")
    expected = (tmp_db_and_data["data_dir"] / "videos" / "a.mp4").resolve()
    assert out == expected


def test_resolve_data_path_absolute_inside_data_passes(tmp_db_and_data):
    from shortvideo.works import _resolve_data_path
    p = tmp_db_and_data["data_dir"] / "videos" / "x.mp4"
    out = _resolve_data_path(str(p))
    assert out == p.resolve()


def test_resolve_data_path_absolute_outside_data_returns_none(tmp_db_and_data):
    from shortvideo.works import _resolve_data_path
    assert _resolve_data_path("/etc/passwd") is None
    assert _resolve_data_path("/Users/black.chen/.env") is None
    assert _resolve_data_path(str(tmp_db_and_data["tmp"] / "outside.txt")) is None


def test_resolve_data_path_dotdot_escape_returns_none(tmp_db_and_data):
    from shortvideo.works import _resolve_data_path
    raw = str(tmp_db_and_data["data_dir"] / "videos" / ".." / ".." / "outside.txt")
    assert _resolve_data_path(raw) is None


def test_resolve_data_path_symlink_escape_returns_none(tmp_db_and_data):
    from shortvideo.works import _resolve_data_path
    outside = tmp_db_and_data["tmp"] / "secret.bin"
    outside.write_bytes(b"X")
    link = tmp_db_and_data["data_dir"] / "videos" / "evil.mp4"
    try:
        link.symlink_to(outside)
    except (OSError, NotImplementedError):
        pytest.skip("symlink 不可建")
    out = _resolve_data_path(str(link))
    assert out is None, f"symlink 跳出 DATA_DIR 应返 None, 实际 {out}"


def test_resolve_data_path_empty_returns_none(tmp_db_and_data):
    from shortvideo.works import _resolve_data_path
    assert _resolve_data_path("") is None
    assert _resolve_data_path(None) is None
    assert _resolve_data_path("   ") is None


def test_resolve_data_path_nul_byte_returns_none(tmp_db_and_data):
    from shortvideo.works import _resolve_data_path
    assert _resolve_data_path("videos/x.mp4\x00") is None


# ─── delete_work 端到端 ──────────────────────────────────────


def _insert_work_with_path(local_path: str | None) -> int:
    from shortvideo.works import insert_work
    return insert_work(
        title="test work",
        final_text="body",
        type="video",
        source_skill=None,
        status="ready",
        local_path=local_path,
        created_at=int(time.time()),
    )


def _row_count(db_path: Path, work_id: int) -> int:
    with sqlite3.connect(str(db_path)) as con:
        return con.execute("SELECT COUNT(*) FROM works WHERE id=?", (work_id,)).fetchone()[0]


def test_delete_work_removes_relative_path_inside_data(tmp_db_and_data):
    from shortvideo.works import delete_work
    target = tmp_db_and_data["data_dir"] / "videos" / "a.mp4"
    target.write_bytes(b"FAKE_MP4")
    wid = _insert_work_with_path("videos/a.mp4")

    delete_work(wid, remove_file=True)

    assert not target.exists(), "相对路径 videos/a.mp4 应解析到 data/videos/a.mp4 并删除"
    assert _row_count(tmp_db_and_data["db"], wid) == 0


def test_delete_work_removes_absolute_path_inside_data(tmp_db_and_data):
    from shortvideo.works import delete_work
    target = tmp_db_and_data["data_dir"] / "videos" / "b.mp4"
    target.write_bytes(b"FAKE_MP4")
    wid = _insert_work_with_path(str(target))

    delete_work(wid, remove_file=True)

    assert not target.exists()
    assert _row_count(tmp_db_and_data["db"], wid) == 0


def test_delete_work_does_not_remove_path_outside_data(tmp_db_and_data):
    """攻击场景: work.local_path = /etc/passwd. 不能删. DB row 还是要删."""
    from shortvideo.works import delete_work
    outside = tmp_db_and_data["tmp"] / "outside.bin"
    outside.write_bytes(b"OUTSIDE")
    wid = _insert_work_with_path(str(outside))

    delete_work(wid, remove_file=True)

    assert outside.exists(), "DATA_DIR 外的路径绝不能被 delete_work 删"
    assert _row_count(tmp_db_and_data["db"], wid) == 0


def test_delete_work_does_not_remove_etc_passwd(tmp_db_and_data):
    """极端: work.local_path = /etc/passwd. 即使权限允许 (root) 也绝不删."""
    from shortvideo.works import delete_work
    wid = _insert_work_with_path("/etc/passwd")

    # 永远不该真删, 测试 _resolve_data_path 拦截
    delete_work(wid, remove_file=True)

    # /etc/passwd 必然还在 (没被删)
    assert Path("/etc/passwd").exists()
    assert _row_count(tmp_db_and_data["db"], wid) == 0


def test_delete_work_dotdot_escape_does_not_remove(tmp_db_and_data):
    from shortvideo.works import delete_work
    outside = tmp_db_and_data["tmp"] / "outside_dotdot.bin"
    outside.write_bytes(b"X")
    raw = "videos/../../outside_dotdot.bin"  # 解 后跳出 DATA_DIR
    wid = _insert_work_with_path(raw)

    delete_work(wid, remove_file=True)

    assert outside.exists(), ".. 跳出 DATA_DIR 不能删外部文件"
    assert _row_count(tmp_db_and_data["db"], wid) == 0


def test_delete_work_symlink_escape_does_not_remove(tmp_db_and_data):
    from shortvideo.works import delete_work
    outside = tmp_db_and_data["tmp"] / "secret_target.bin"
    outside.write_bytes(b"SECRET")
    link = tmp_db_and_data["data_dir"] / "videos" / "evil.mp4"
    try:
        link.symlink_to(outside)
    except (OSError, NotImplementedError):
        pytest.skip("symlink 不可建")
    wid = _insert_work_with_path("videos/evil.mp4")

    delete_work(wid, remove_file=True)

    assert outside.exists(), "symlink 解析后跳出 DATA_DIR, 外部文件不能被删"
    assert _row_count(tmp_db_and_data["db"], wid) == 0


def test_delete_work_missing_file_silently_ok(tmp_db_and_data):
    from shortvideo.works import delete_work
    wid = _insert_work_with_path("videos/never_existed.mp4")

    # 不应 raise
    delete_work(wid, remove_file=True)

    assert _row_count(tmp_db_and_data["db"], wid) == 0


def test_delete_work_no_remove_file_keeps_file(tmp_db_and_data):
    """remove_file=False 不删本地文件."""
    from shortvideo.works import delete_work
    target = tmp_db_and_data["data_dir"] / "videos" / "keepme.mp4"
    target.write_bytes(b"KEEP")
    wid = _insert_work_with_path("videos/keepme.mp4")

    delete_work(wid, remove_file=False)

    assert target.exists()
    assert _row_count(tmp_db_and_data["db"], wid) == 0


def test_delete_work_db_row_always_deleted_even_if_file_blocked(tmp_db_and_data):
    """关键: 即使文件无法删 (越界), DB row 仍删."""
    from shortvideo.works import delete_work
    wid = _insert_work_with_path("/etc/passwd")
    delete_work(wid, remove_file=True)
    assert _row_count(tmp_db_and_data["db"], wid) == 0
