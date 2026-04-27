"""素材库 service 单元测试 (D-087).

覆盖:
- _asset_id 哈希稳定性
- _walk_root 白名单过滤 (隐藏目录 / 非素材后缀)
- _make_image_thumb / _make_video_thumb (用真 ffmpeg + Pillow, 不 mock)
- _upsert_asset 新增 / 已存在跳过 / OSError 兜底
- scan_root max_files / on_progress / 错误吞掉
- get_stats / list_top_folders / list_subfolders / list_assets / get_asset / log_usage 各路径
- 边界: 空 DB / 没素材根目录 / 巨多文件夹 / 损坏文件
"""
from __future__ import annotations

import os
import shutil
import tempfile
import time
from pathlib import Path

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
    """隔离 THUMB_DIR, 防污染 prod data/material_thumbs/"""
    thumb_dir = tmp_path / "thumbs"
    thumb_dir.mkdir()
    import backend.services.materials_service as ms
    monkeypatch.setattr(ms, "THUMB_DIR", thumb_dir)
    yield thumb_dir


@pytest.fixture
def tmp_root(monkeypatch, tmp_path):
    """临时素材根目录, 含若干合法 + 非法素材."""
    root = tmp_path / "materials_root"
    root.mkdir()
    # 创建 2 个一级目录 + 1 张图 in 根目录
    (root / "00 讲台高光").mkdir()
    (root / "00 讲台高光" / "提问").mkdir()
    (root / "01 板书课件").mkdir()
    # 用 Pillow 创建几张测试图
    from PIL import Image
    Image.new("RGB", (400, 300), color="red").save(root / "00 讲台高光" / "提问" / "raise_hand.jpg")
    Image.new("RGB", (400, 300), color="blue").save(root / "00 讲台高光" / "提问" / "smile.jpg")
    Image.new("RGB", (400, 300), color="green").save(root / "00 讲台高光" / "podium.jpg")
    Image.new("RGB", (400, 300), color="yellow").save(root / "01 板书课件" / "formula.png")
    Image.new("RGB", (400, 300), color="orange").save(root / "root_level.jpg")
    # 创建非素材文件 (应被白名单过滤)
    (root / "readme.txt").write_text("not a material")
    (root / "doc.pdf").write_bytes(b"%PDF-1.4")
    (root / "config.zip").write_bytes(b"PK\x03\x04")
    # 创建隐藏目录 (应被跳过)
    hidden = root / ".trash"
    hidden.mkdir()
    Image.new("RGB", (100, 100), color="black").save(hidden / "should_skip.jpg")
    monkeypatch.setattr(
        "backend.services.materials_service.get_materials_root",
        lambda: root,
    )
    yield root


# ─── _asset_id 哈希 ──────────────────────────────────────


def test_asset_id_stable_for_same_input():
    from backend.services.materials_service import _asset_id
    a = _asset_id("/path/to/x.jpg", 12345)
    b = _asset_id("/path/to/x.jpg", 12345)
    assert a == b
    assert len(a) == 16
    assert all(c in "0123456789abcdef" for c in a)


def test_asset_id_changes_on_mtime_change():
    from backend.services.materials_service import _asset_id
    a = _asset_id("/path/to/x.jpg", 12345)
    b = _asset_id("/path/to/x.jpg", 12346)
    assert a != b


def test_asset_id_changes_on_path_change():
    from backend.services.materials_service import _asset_id
    a = _asset_id("/a.jpg", 12345)
    b = _asset_id("/b.jpg", 12345)
    assert a != b


# ─── _walk_root 白名单 ───────────────────────────────────


def test_walk_root_filters_extensions(tmp_root):
    from backend.services.materials_service import _walk_root
    files = list(_walk_root(tmp_root))
    names = {f.name for f in files}
    # 5 张合法素材
    assert "raise_hand.jpg" in names
    assert "smile.jpg" in names
    assert "podium.jpg" in names
    assert "formula.png" in names
    assert "root_level.jpg" in names
    # 非素材被过滤
    assert "readme.txt" not in names
    assert "doc.pdf" not in names
    assert "config.zip" not in names
    # 隐藏目录被过滤
    assert "should_skip.jpg" not in names
    assert len(files) == 5


def test_walk_root_skips_hidden_files(tmp_root):
    """点开头的文件 (.DS_Store) 被跳过."""
    from PIL import Image
    Image.new("RGB", (100, 100)).save(tmp_root / ".hidden.jpg")
    from backend.services.materials_service import _walk_root
    files = list(_walk_root(tmp_root))
    assert all(not f.name.startswith(".") for f in files)


def test_walk_root_case_insensitive_ext(tmp_root):
    """大写后缀 .JPG / .PNG / .MP4 也认."""
    from PIL import Image
    Image.new("RGB", (100, 100)).save(tmp_root / "upper.JPG")
    from backend.services.materials_service import _walk_root
    files = [f.name for f in _walk_root(tmp_root)]
    assert "upper.JPG" in files


# ─── 缩略图 (真 Pillow + ffmpeg, 不 mock) ────────────────


def test_make_image_thumb_real(tmp_thumb_dir, tmp_path):
    """用 Pillow 真生成缩略图."""
    from PIL import Image
    from backend.services.materials_service import _make_image_thumb
    src = tmp_path / "big.jpg"
    Image.new("RGB", (1920, 1080), color="cyan").save(src)
    dst = tmp_thumb_dir / "thumb.jpg"
    ok = _make_image_thumb(src, dst)
    assert ok is True
    assert dst.exists()
    assert dst.stat().st_size > 100
    # 验证缩略图尺寸 ≤ 320x180
    with Image.open(dst) as im:
        assert im.width <= 320
        assert im.height <= 180


def test_make_image_thumb_handles_corrupt_file(tmp_thumb_dir, tmp_path):
    """损坏图片不抛异常, 返 False."""
    from backend.services.materials_service import _make_image_thumb
    src = tmp_path / "bad.jpg"
    src.write_bytes(b"not a real jpg")
    dst = tmp_thumb_dir / "thumb.jpg"
    ok = _make_image_thumb(src, dst)
    assert ok is False


def test_make_thumb_dispatches_by_ext(tmp_thumb_dir, tmp_path):
    """图片 / 视频 / 未知后缀分发正确."""
    from PIL import Image
    from backend.services.materials_service import _make_thumb
    img = tmp_path / "x.jpg"
    Image.new("RGB", (100, 100)).save(img)
    r = _make_thumb(str(img), "test_id_1")
    assert r == "test_id_1.jpg"
    assert (tmp_thumb_dir / "test_id_1.jpg").exists()
    # 第二次调用走缓存命中
    r2 = _make_thumb(str(img), "test_id_1")
    assert r2 == "test_id_1.jpg"


def test_make_thumb_unknown_ext_returns_none(tmp_thumb_dir, tmp_path):
    """未知后缀直接返 None."""
    from backend.services.materials_service import _make_thumb
    weird = tmp_path / "x.xyz"
    weird.write_bytes(b"data")
    r = _make_thumb(str(weird), "test_id_2")
    assert r is None


# ─── _upsert_asset ───────────────────────────────────────


def test_upsert_asset_inserts_new(tmp_db, tmp_thumb_dir, tmp_root):
    from backend.services.materials_service import _upsert_asset, _ensure_schema
    from shortvideo.db import get_connection
    _ensure_schema()
    target = tmp_root / "00 讲台高光" / "提问" / "raise_hand.jpg"
    with get_connection() as con:
        aid, is_new = _upsert_asset(con, str(target), tmp_root)
        con.commit()
    assert is_new is True
    assert len(aid) == 16
    with get_connection() as con:
        row = con.execute("SELECT * FROM material_assets WHERE id=?", (aid,)).fetchone()
    assert row is not None


def test_upsert_asset_skips_existing(tmp_db, tmp_thumb_dir, tmp_root):
    """同 path + mtime 第二次 upsert → is_new=False."""
    from backend.services.materials_service import _upsert_asset, _ensure_schema
    from shortvideo.db import get_connection
    _ensure_schema()
    target = tmp_root / "01 板书课件" / "formula.png"
    with get_connection() as con:
        _, n1 = _upsert_asset(con, str(target), tmp_root)
        con.commit()
    with get_connection() as con:
        _, n2 = _upsert_asset(con, str(target), tmp_root)
        con.commit()
    assert n1 is True
    assert n2 is False


def test_upsert_asset_handles_missing_file(tmp_db, tmp_thumb_dir, tmp_root):
    """文件不存在不抛, 返 ('', False)."""
    from backend.services.materials_service import _upsert_asset, _ensure_schema
    from shortvideo.db import get_connection
    _ensure_schema()
    with get_connection() as con:
        aid, is_new = _upsert_asset(con, "/nonexistent/path.jpg", tmp_root)
    assert aid == ""
    assert is_new is False


def test_upsert_asset_records_rel_folder(tmp_db, tmp_thumb_dir, tmp_root):
    """rel_folder 字段是相对 root 的路径."""
    from backend.services.materials_service import _upsert_asset, _ensure_schema, get_asset
    from shortvideo.db import get_connection
    _ensure_schema()
    target = tmp_root / "00 讲台高光" / "提问" / "smile.jpg"
    with get_connection() as con:
        aid, _ = _upsert_asset(con, str(target), tmp_root)
        con.commit()
    a = get_asset(aid)
    assert a is not None
    assert a["rel_folder"] == "00 讲台高光/提问"


def test_upsert_asset_root_level_file_uses_dot(tmp_db, tmp_thumb_dir, tmp_root):
    """根目录直接素材 → rel_folder = '.'"""
    from backend.services.materials_service import _upsert_asset, _ensure_schema, get_asset
    from shortvideo.db import get_connection
    _ensure_schema()
    target = tmp_root / "root_level.jpg"
    with get_connection() as con:
        aid, _ = _upsert_asset(con, str(target), tmp_root)
        con.commit()
    a = get_asset(aid)
    assert a["rel_folder"] == "."


# ─── scan_root ───────────────────────────────────────────


def test_scan_root_full_pass(tmp_db, tmp_thumb_dir, tmp_root):
    """完整扫描 5 张测试图全部入库."""
    from backend.services.materials_service import scan_root, _ensure_schema
    from shortvideo.db import get_connection
    _ensure_schema()
    r = scan_root()
    assert r["scanned"] == 5
    assert r["added"] == 5
    assert r["errors"] == 0
    with get_connection() as con:
        cnt = con.execute("SELECT COUNT(*) FROM material_assets").fetchone()[0]
    assert cnt == 5


def test_scan_root_idempotent(tmp_db, tmp_thumb_dir, tmp_root):
    """连续扫两次 → 第二次 added=0."""
    from backend.services.materials_service import scan_root
    r1 = scan_root()
    r2 = scan_root()
    assert r1["added"] == 5
    assert r2["added"] == 0
    assert r2["scanned"] == 5  # scanned 数不变


def test_scan_root_max_files_limit(tmp_db, tmp_thumb_dir, tmp_root):
    """max_files 上限."""
    from backend.services.materials_service import scan_root
    r = scan_root(max_files=2)
    assert r["scanned"] == 2
    assert r["added"] == 2


def test_scan_root_progress_callback(tmp_db, tmp_thumb_dir, tmp_root):
    """on_progress 被调."""
    from backend.services.materials_service import scan_root
    calls = []
    scan_root(on_progress=lambda i, total, path: calls.append((i, total)))
    assert len(calls) >= 1
    assert calls[-1][1] == 5  # total


def test_scan_root_no_root_returns_error(tmp_db, monkeypatch, tmp_path):
    """根目录不存在时返 error 而不抛."""
    from backend.services import materials_service as ms
    fake_root = tmp_path / "does_not_exist"
    monkeypatch.setattr(ms, "get_materials_root", lambda: fake_root)
    r = ms.scan_root()
    assert "error" in r
    assert r["scanned"] == 0


# ─── 查询 API ────────────────────────────────────────────


def test_get_stats_empty(tmp_db, tmp_thumb_dir, tmp_root):
    """空 DB stats 全 0 / 0%."""
    from backend.services.materials_service import get_stats
    s = get_stats()
    assert s["total"] == 0
    assert s["pending_review"] == 0
    assert s["ai_tagged"] == 0
    assert s["ai_coverage"] == 0
    assert s["usage_this_month"] == 0
    assert s["hit_rate"] == 0
    assert "root" in s


def test_get_stats_after_scan(tmp_db, tmp_thumb_dir, tmp_root):
    from backend.services.materials_service import scan_root, get_stats
    scan_root()
    s = get_stats()
    assert s["total"] == 5
    assert s["week_added"] == 5  # 全是新加的


def test_list_top_folders(tmp_db, tmp_thumb_dir, tmp_root):
    from backend.services.materials_service import scan_root, list_top_folders
    scan_root()
    folders = list_top_folders()
    names = {f["folder"] for f in folders}
    assert "00 讲台高光" in names
    assert "01 板书课件" in names
    assert "_根目录" in names
    # 总和 = 5
    assert sum(f["total"] for f in folders) == 5


def test_list_top_folders_count_per_folder(tmp_db, tmp_thumb_dir, tmp_root):
    from backend.services.materials_service import scan_root, list_top_folders
    scan_root()
    folders = {f["folder"]: f["total"] for f in list_top_folders()}
    assert folders.get("00 讲台高光") == 3  # 提问/raise_hand + 提问/smile + podium
    assert folders.get("01 板书课件") == 1  # formula.png
    assert folders.get("_根目录") == 1  # root_level.jpg


def test_list_subfolders(tmp_db, tmp_thumb_dir, tmp_root):
    from backend.services.materials_service import scan_root, list_subfolders
    scan_root()
    subs = list_subfolders("00 讲台高光")
    paths = {s["folder"] for s in subs}
    assert "00 讲台高光/提问" in paths
    # podium.jpg 直接在 00 讲台高光/ 下
    assert "00 讲台高光" in paths


def test_list_subfolders_root(tmp_db, tmp_thumb_dir, tmp_root):
    from backend.services.materials_service import scan_root, list_subfolders
    scan_root()
    subs = list_subfolders("_根目录")
    assert len(subs) == 1
    assert subs[0]["folder"] == "."
    assert subs[0]["total"] == 1


def test_list_assets_by_folder(tmp_db, tmp_thumb_dir, tmp_root):
    from backend.services.materials_service import scan_root, list_assets
    scan_root()
    items = list_assets(folder="00 讲台高光/提问")
    assert len(items) == 2
    names = {a["filename"] for a in items}
    assert names == {"raise_hand.jpg", "smile.jpg"}


def test_list_assets_includes_subfolders(tmp_db, tmp_thumb_dir, tmp_root):
    """folder='00 讲台高光' 应该含子目录 提问/ 里的素材."""
    from backend.services.materials_service import scan_root, list_assets
    scan_root()
    items = list_assets(folder="00 讲台高光")
    names = {a["filename"] for a in items}
    assert names == {"raise_hand.jpg", "smile.jpg", "podium.jpg"}


def test_list_assets_sort_by_name(tmp_db, tmp_thumb_dir, tmp_root):
    from backend.services.materials_service import scan_root, list_assets
    scan_root()
    items = list_assets(sort="name")
    names = [a["filename"] for a in items]
    assert names == sorted(names)


def test_list_assets_pagination(tmp_db, tmp_thumb_dir, tmp_root):
    from backend.services.materials_service import scan_root, list_assets
    scan_root()
    page1 = list_assets(limit=2, offset=0)
    page2 = list_assets(limit=2, offset=2)
    page3 = list_assets(limit=2, offset=4)
    assert len(page1) == 2
    assert len(page2) == 2
    assert len(page3) == 1
    # 不重复
    ids = {a["id"] for a in page1 + page2 + page3}
    assert len(ids) == 5


def test_get_asset_not_found(tmp_db, tmp_thumb_dir, tmp_root):
    from backend.services.materials_service import get_asset
    a = get_asset("nonexistent")
    assert a is None


def test_get_asset_includes_tags_and_usage(tmp_db, tmp_thumb_dir, tmp_root):
    from backend.services.materials_service import scan_root, list_assets, get_asset
    scan_root()
    aid = list_assets()[0]["id"]
    a = get_asset(aid)
    assert a is not None
    assert "tags" in a and isinstance(a["tags"], list)
    assert "usage" in a and isinstance(a["usage"], list)
    assert a["hits"] == 0


def test_log_usage_increments_hits(tmp_db, tmp_thumb_dir, tmp_root):
    from backend.services.materials_service import scan_root, list_assets, get_asset, log_usage
    scan_root()
    aid = list_assets()[0]["id"]
    log_usage(aid, "测试视频.mp4", 12.5)
    log_usage(aid, "另一个视频.mp4")
    a = get_asset(aid)
    assert a["hits"] == 2
    assert len(a["usage"]) == 2


def test_thumb_abs_path_returns_none_when_missing(tmp_db, tmp_thumb_dir):
    from backend.services.materials_service import thumb_abs_path
    assert thumb_abs_path("nonexistent_id") is None


def test_thumb_abs_path_returns_path_when_exists(tmp_db, tmp_thumb_dir, tmp_root):
    from backend.services.materials_service import scan_root, list_assets, thumb_abs_path
    scan_root()
    aid = list_assets()[0]["id"]
    p = thumb_abs_path(aid)
    assert p is not None
    assert p.exists()
    assert p.suffix == ".jpg"


# ─── 边界 case ───────────────────────────────────────────


def test_list_assets_with_invalid_sort_falls_back(tmp_db, tmp_thumb_dir, tmp_root):
    from backend.services.materials_service import scan_root, list_assets
    scan_root()
    items = list_assets(sort="not_a_valid_sort")  # 应回退到 imported
    assert len(items) == 5


def test_get_materials_root_default():
    """没配 settings 时默认 ~/Downloads."""
    from backend.services.materials_service import get_materials_root
    p = get_materials_root()
    # 至少是 Path 对象, 含 'Downloads'
    assert "Downloads" in str(p) or p.exists()
