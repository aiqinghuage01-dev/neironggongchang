"""Phase 1 · /media 路径白名单测试.

之前 app.mount("/media", StaticFiles(DATA_DIR)) 把整个 data/ 暴露:
- /media/works.db → 直接拖走 SQLite
- /media/settings.json → 拖走配置 + token
- /media/_audit/... → 审计日志

现在收口成 /media/{path:path} route + 白名单子目录 + 拒绝扩展名.
"""
from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient


@pytest.fixture()
def media_client(tmp_path, monkeypatch):
    """临时 DATA_DIR + 预置一些合法/非法文件, 然后启 app."""
    data_dir = tmp_path / "data"
    data_dir.mkdir()

    # 合法白名单子目录 + 文件
    (data_dir / "videos").mkdir()
    (data_dir / "videos" / "ok.mp4").write_bytes(b"FAKEMP4")
    (data_dir / "audio").mkdir()
    (data_dir / "audio" / "ok.mp3").write_bytes(b"FAKEMP3")
    (data_dir / "covers").mkdir()
    (data_dir / "covers" / "c.jpg").write_bytes(b"FAKEJPG")
    (data_dir / "image-gen").mkdir()
    (data_dir / "image-gen" / "g.png").write_bytes(b"FAKEPNG")

    # 非法: 数据库 / 设置 / 审计 / 各种"配置文件后缀"
    (data_dir / "works.db").write_bytes(b"SQLITE_FAKE")
    (data_dir / "main.db").write_bytes(b"SQLITE_FAKE2")
    (data_dir / "settings.json").write_text('{"token": "secret"}')
    (data_dir / "_audit").mkdir()
    (data_dir / "_audit" / "trace.log").write_text("audit data")

    # 非法: 白名单子目录里塞个 .db / .json (即使父目录合法, 后缀也要拒)
    (data_dir / "videos" / "leak.db").write_bytes(b"SQLITE_LEAK")
    (data_dir / "videos" / "leak.json").write_text('{"x":1}')

    # 非法白名单父目录: works/ downloads/
    (data_dir / "works").mkdir()
    (data_dir / "works" / "x.txt").write_text("internal")
    (data_dir / "downloads").mkdir()
    (data_dir / "downloads" / "y.bin").write_bytes(b"\x00\x01")

    # symlink 跳出 — 如果系统支持就建一个
    outside = tmp_path / "outside.json"
    outside.write_text('{"escaped": true}')
    try:
        (data_dir / "videos" / "escape.json").symlink_to(outside)
    except (OSError, NotImplementedError):
        pass

    # patch DATA_DIR 到临时目录
    import shortvideo.config as cfg
    monkeypatch.setattr(cfg, "DATA_DIR", data_dir)

    # api.py 在 import 时已经把 _DATA_DIR_RESOLVED 算出, 需 reload 才能让 patch 生效
    import importlib

    import backend.api as api_mod
    importlib.reload(api_mod)

    return TestClient(api_mod.app)


# ============== 拒绝项 ==============

def test_works_db_returns_404(media_client):
    r = media_client.get("/media/works.db")
    assert r.status_code == 404


def test_main_db_returns_404(media_client):
    r = media_client.get("/media/main.db")
    assert r.status_code == 404


def test_settings_json_returns_404(media_client):
    r = media_client.get("/media/settings.json")
    assert r.status_code == 404
    # 关键: body 里不能含 settings.json 内容
    assert b"secret" not in r.content


def test_audit_dir_returns_404(media_client):
    r = media_client.get("/media/_audit/trace.log")
    assert r.status_code == 404


def test_works_dir_returns_404(media_client):
    r = media_client.get("/media/works/x.txt")
    assert r.status_code == 404


def test_downloads_dir_returns_404(media_client):
    r = media_client.get("/media/downloads/y.bin")
    assert r.status_code == 404


def test_db_in_videos_returns_404(media_client):
    """videos 目录是白名单, 但 .db 后缀拒绝."""
    r = media_client.get("/media/videos/leak.db")
    assert r.status_code == 404


def test_json_in_videos_returns_404(media_client):
    """videos 目录里 .json 也拒."""
    r = media_client.get("/media/videos/leak.json")
    assert r.status_code == 404


def test_path_traversal_rejected(media_client):
    """尝试 ../../etc/passwd 这类."""
    r = media_client.get("/media/videos/../../works.db")
    assert r.status_code == 404


def test_double_dot_segment_rejected(media_client):
    r = media_client.get("/media/../works.db")
    # FastAPI 可能直接 404, 也可能走到 route 我们再 404 — 都接受
    assert r.status_code == 404


def test_absolute_path_rejected(media_client):
    """直接给绝对路径不能逃出."""
    r = media_client.get("/media//etc/passwd")
    assert r.status_code == 404


def test_unknown_subdir_rejected(media_client):
    """没在白名单的目录."""
    r = media_client.get("/media/secret/x.txt")
    assert r.status_code == 404


def test_symlink_escape_rejected(media_client, tmp_path):
    """symlink 指向 DATA_DIR 外要拒."""
    # symlink 不一定建得起来 — fixture 已 try/except, 这里只测如果建了就要 404
    link = tmp_path / "data" / "videos" / "escape.json"
    if link.is_symlink():
        r = media_client.get("/media/videos/escape.json")
        assert r.status_code == 404, "symlink 应被拒(.json 后缀已禁,且解析后超出 DATA_DIR)"


# ============== 通过项 ==============

def test_legit_video_returns_200(media_client):
    r = media_client.get("/media/videos/ok.mp4")
    assert r.status_code == 200
    assert r.content == b"FAKEMP4"


def test_legit_audio_returns_200(media_client):
    r = media_client.get("/media/audio/ok.mp3")
    assert r.status_code == 200
    assert r.content == b"FAKEMP3"


def test_legit_cover_returns_200(media_client):
    r = media_client.get("/media/covers/c.jpg")
    assert r.status_code == 200
    assert r.content == b"FAKEJPG"


def test_legit_image_gen_returns_200(media_client):
    r = media_client.get("/media/image-gen/g.png")
    assert r.status_code == 200
    assert r.content == b"FAKEPNG"


def test_missing_file_in_legit_dir_returns_404(media_client):
    """白名单目录但文件不存在."""
    r = media_client.get("/media/videos/nonexistent.mp4")
    assert r.status_code == 404


# ============== service 层单元测试 ==============

def test_resolve_media_path_unit(tmp_path):
    """直接测 service 函数, 不走 HTTP."""
    from backend.services.media_security import (
        ALLOWED_MEDIA_SUBDIRS,
        DENIED_EXTENSIONS,
        resolve_media_path,
    )

    root = tmp_path / "data"
    root.mkdir()
    (root / "videos").mkdir()
    (root / "videos" / "x.mp4").write_bytes(b"x")
    (root / "settings.json").write_text("{}")
    root_resolved = root.resolve()

    # 合法
    assert resolve_media_path("videos/x.mp4", root_resolved) is not None
    # 直接根: 拒
    assert resolve_media_path("settings.json", root_resolved) is None
    assert resolve_media_path("works.db", root_resolved) is None
    # ".." 段: 拒
    assert resolve_media_path("videos/../works.db", root_resolved) is None
    assert resolve_media_path("../etc/passwd", root_resolved) is None
    # 空 / None / 绝对: 拒
    assert resolve_media_path("", root_resolved) is None
    assert resolve_media_path("/etc/passwd", root_resolved) is None
    assert resolve_media_path("~/secrets", root_resolved) is None
    # 未知子目录: 拒
    assert resolve_media_path("internal/x.txt", root_resolved) is None
    # 白名单完整覆盖业务上需要的目录
    assert "videos" in ALLOWED_MEDIA_SUBDIRS
    assert "audio" in ALLOWED_MEDIA_SUBDIRS
    assert "covers" in ALLOWED_MEDIA_SUBDIRS
    # DB 后缀必拒
    assert ".db" in DENIED_EXTENSIONS
    assert ".json" in DENIED_EXTENSIONS
    assert ".log" in DENIED_EXTENSIONS
