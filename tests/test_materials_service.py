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


# ─── B'-4 (GPT 修订) 新 ID 方案 + content_hash ─────────────
# 旧 _asset_id=sha1(path+mtime) 已删: 跟 abs_path UNIQUE 互相打架, mtime 一变就生
# 新 aid 但 INSERT OR IGNORE 因 path 冲突静默失败, 库里没新 row 但函数仍返新 aid.
# 新方案: 真新文件用 uuid (跟 path/mtime/content 解耦, 永不撞车), 已有 row 走
# path 命中或 content_hash 命中, 不换 id.


def test_new_asset_id_generates_unique_16_hex():
    from backend.services.materials_service import _new_asset_id
    a = _new_asset_id()
    b = _new_asset_id()
    assert a != b  # uuid 几乎不可能撞车
    assert len(a) == 16
    assert all(c in "0123456789abcdef" for c in a)


def test_compute_content_hash_stable_for_same_bytes(tmp_path):
    from backend.services.materials_service import _compute_content_hash
    f = tmp_path / "x.bin"
    f.write_bytes(b"hello world" * 100)
    assert _compute_content_hash(str(f)) == _compute_content_hash(str(f))


def test_compute_content_hash_differs_for_different_content(tmp_path):
    from backend.services.materials_service import _compute_content_hash
    a = tmp_path / "a.bin"; a.write_bytes(b"aaaa")
    b = tmp_path / "b.bin"; b.write_bytes(b"bbbb")
    assert _compute_content_hash(str(a)) != _compute_content_hash(str(b))


def test_compute_content_hash_skips_huge_file(tmp_path):
    from backend.services.materials_service import _compute_content_hash
    f = tmp_path / "big.bin"
    f.write_bytes(b"x" * 1024)  # 1KB
    # 设小阈值模拟"超大文件"
    assert _compute_content_hash(str(f), max_bytes=512) is None


def test_compute_content_hash_returns_none_for_missing(tmp_path):
    from backend.services.materials_service import _compute_content_hash
    assert _compute_content_hash(str(tmp_path / "nope.bin")) is None


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


# ─── B'-4 (GPT 修订) asset identity 稳定性 ──────────────────


def test_upsert_same_path_keeps_id_when_mtime_changes(tmp_db, tmp_thumb_dir, tmp_root):
    """文件原地修改 (mtime 变) → 同 id, metadata 更新, 不生新 row.
    旧逻辑: sha1(path+mtime) 让 id 变, INSERT OR IGNORE 因 path UNIQUE 静默失败,
    库里仍是旧 row 但函数返新 aid + is_new=True (孤儿 aid).
    新逻辑: 按 path 命中 → UPDATE → 返同 aid + is_new=False.
    """
    import os
    from backend.services.materials_service import _upsert_asset, _ensure_schema
    from shortvideo.db import get_connection
    _ensure_schema()
    target = tmp_root / "00 讲台高光" / "提问" / "raise_hand.jpg"
    with get_connection() as con:
        aid1, n1 = _upsert_asset(con, str(target), tmp_root)
        con.commit()
    # 改 mtime (模拟用户编辑文件)
    new_mtime = target.stat().st_mtime + 1000
    os.utime(target, (new_mtime, new_mtime))
    with get_connection() as con:
        aid2, n2 = _upsert_asset(con, str(target), tmp_root)
        con.commit()
    assert aid1 == aid2  # 同 id, 旧 logic 这里会断
    assert n1 is True
    assert n2 is False
    # metadata 实际更新了
    with get_connection() as con:
        mtime_in_db = con.execute(
            "SELECT file_ctime FROM material_assets WHERE id=?", (aid1,),
        ).fetchone()[0]
    assert mtime_in_db == int(new_mtime)


def test_upsert_renamed_file_keeps_id_via_content_hash(tmp_db, tmp_thumb_dir, tmp_root):
    """改名 (path 变, 内容不变) → 按 content_hash 找回同 row, 不重 INSERT."""
    import shutil
    from backend.services.materials_service import _upsert_asset, _ensure_schema
    from shortvideo.db import get_connection
    _ensure_schema()
    target = tmp_root / "00 讲台高光" / "podium.jpg"
    with get_connection() as con:
        aid1, _ = _upsert_asset(con, str(target), tmp_root)
        con.commit()
    # 改名 (复制到新名后删旧文件 — 模拟 mv)
    new_path = tmp_root / "00 讲台高光" / "renamed_podium.jpg"
    shutil.copy2(target, new_path)
    target.unlink()
    with get_connection() as con:
        aid2, n2 = _upsert_asset(con, str(new_path), tmp_root)
        con.commit()
    assert aid1 == aid2  # 同 id (按 content_hash 命中)
    assert n2 is False
    # abs_path 实际更新到新名
    with get_connection() as con:
        new_abs = con.execute(
            "SELECT abs_path, filename FROM material_assets WHERE id=?", (aid1,),
        ).fetchone()
    assert new_abs[0] == str(new_path)
    assert new_abs[1] == "renamed_podium.jpg"


def test_upsert_moved_to_subfolder_keeps_id_via_content_hash(tmp_db, tmp_thumb_dir, tmp_root):
    """换文件夹 (path 变, 内容不变) → 同 id, rel_folder 更新."""
    import shutil
    from backend.services.materials_service import _upsert_asset, _ensure_schema
    from shortvideo.db import get_connection
    _ensure_schema()
    target = tmp_root / "00 讲台高光" / "podium.jpg"
    with get_connection() as con:
        aid1, _ = _upsert_asset(con, str(target), tmp_root)
        con.commit()
    new_folder = tmp_root / "01 板书课件"
    new_path = new_folder / "podium.jpg"
    shutil.copy2(target, new_path)
    target.unlink()
    with get_connection() as con:
        aid2, n2 = _upsert_asset(con, str(new_path), tmp_root)
        con.commit()
    assert aid1 == aid2
    assert n2 is False
    with get_connection() as con:
        rel = con.execute(
            "SELECT rel_folder FROM material_assets WHERE id=?", (aid1,),
        ).fetchone()[0]
    assert rel == "01 板书课件"


def test_upsert_real_new_file_gets_new_uuid(tmp_db, tmp_thumb_dir, tmp_root):
    """真新文件 (path 没见过 + content_hash 没见过) → 新 uuid id."""
    from PIL import Image
    from backend.services.materials_service import _upsert_asset, _ensure_schema
    from shortvideo.db import get_connection
    _ensure_schema()
    # 先存一张
    a = tmp_root / "00 讲台高光" / "podium.jpg"
    with get_connection() as con:
        aid_a, _ = _upsert_asset(con, str(a), tmp_root)
        con.commit()
    # 加一张真新的 (内容也不一样)
    b = tmp_root / "01 板书课件" / "totally_new.png"
    Image.new("RGB", (50, 50), color="purple").save(b)
    with get_connection() as con:
        aid_b, n_b = _upsert_asset(con, str(b), tmp_root)
        con.commit()
    assert n_b is True
    assert aid_a != aid_b  # 不同 id


def test_upsert_renamed_file_preserves_tags_and_usage(tmp_db, tmp_thumb_dir, tmp_root):
    """改名后 tags / usage / pending 全保留 (不孤儿).
    这是 GPT 反复强调的核心: 主键不变 → join 表永远 join 得上.
    """
    import shutil
    from backend.services.materials_service import _upsert_asset, _ensure_schema, log_usage
    from backend.services.materials_pipeline import _write_tags, _write_pending_move
    from shortvideo.db import get_connection
    _ensure_schema()
    target = tmp_root / "00 讲台高光" / "podium.jpg"
    with get_connection() as con:
        aid, _ = _upsert_asset(con, str(target), tmp_root)
        con.commit()
    # 给它打 tags + usage + pending
    _write_tags(aid, ["mark1", "mark2"])
    log_usage(aid, "test_work_1")
    _write_pending_move(aid, "99 测试", "x", confidence=0.85)
    # 改名
    new_path = tmp_root / "00 讲台高光" / "renamed.jpg"
    shutil.copy2(target, new_path)
    target.unlink()
    with get_connection() as con:
        aid2, _ = _upsert_asset(con, str(new_path), tmp_root)
        con.commit()
    assert aid == aid2  # 同 id
    # tags / usage / pending 全在
    with get_connection() as con:
        n_tags = con.execute(
            "SELECT COUNT(*) FROM material_asset_tags WHERE asset_id=?", (aid,)
        ).fetchone()[0]
        n_usage = con.execute(
            "SELECT COUNT(*) FROM material_usage_log WHERE asset_id=?", (aid,)
        ).fetchone()[0]
        n_pending = con.execute(
            "SELECT COUNT(*) FROM material_pending_moves WHERE asset_id=?", (aid,)
        ).fetchone()[0]
    assert n_tags == 2
    assert n_usage == 1
    assert n_pending == 1


def test_upsert_writes_content_hash_for_new_file(tmp_db, tmp_thumb_dir, tmp_root):
    """新 INSERT 一定算 content_hash 写入, 给后续 mv 检测用."""
    from backend.services.materials_service import _upsert_asset, _ensure_schema
    from shortvideo.db import get_connection
    _ensure_schema()
    target = tmp_root / "00 讲台高光" / "podium.jpg"
    with get_connection() as con:
        aid, _ = _upsert_asset(con, str(target), tmp_root)
        con.commit()
        h = con.execute(
            "SELECT content_hash FROM material_assets WHERE id=?", (aid,),
        ).fetchone()[0]
    assert h is not None
    assert len(h) == 32


def test_upsert_backfills_missing_content_hash_for_legacy_row(tmp_db, tmp_thumb_dir, tmp_root):
    """存量 row content_hash NULL (V3→V4 升级时还没填) → 下次 scan 命中 path 时顺手补."""
    from backend.services.materials_service import _upsert_asset, _ensure_schema
    from shortvideo.db import get_connection
    _ensure_schema()
    target = tmp_root / "00 讲台高光" / "podium.jpg"
    with get_connection() as con:
        aid, _ = _upsert_asset(con, str(target), tmp_root)
        # 模拟存量 row 没 hash
        con.execute("UPDATE material_assets SET content_hash=NULL WHERE id=?", (aid,))
        con.commit()
    # 第二次 scan 同 path 同 mtime
    with get_connection() as con:
        aid2, n2 = _upsert_asset(con, str(target), tmp_root)
        con.commit()
        h = con.execute(
            "SELECT content_hash FROM material_assets WHERE id=?", (aid,),
        ).fetchone()[0]
    assert aid == aid2
    assert n2 is False
    assert h is not None  # backfill 成功
    assert len(h) == 32


def test_upsert_updates_last_seen_at(tmp_db, tmp_thumb_dir, tmp_root):
    """每次扫到都刷 last_seen_at, 给未来 missing 检测用."""
    import time
    from backend.services.materials_service import _upsert_asset, _ensure_schema
    from shortvideo.db import get_connection
    _ensure_schema()
    target = tmp_root / "00 讲台高光" / "podium.jpg"
    with get_connection() as con:
        aid, _ = _upsert_asset(con, str(target), tmp_root)
        con.commit()
    time.sleep(1.1)
    with get_connection() as con:
        _upsert_asset(con, str(target), tmp_root)
        con.commit()
        seen = con.execute(
            "SELECT last_seen_at FROM material_assets WHERE id=?", (aid,)
        ).fetchone()[0]
    assert seen >= int(time.time()) - 2


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


# ─── L1 右栏 endpoint (D-087 整改) ────────────────────────


def test_recent_activity_after_scan(tmp_db, tmp_thumb_dir, tmp_root):
    """扫描后应有 import 事件."""
    from backend.services.materials_service import scan_root, list_recent_activity
    scan_root()
    events = list_recent_activity()
    # 应该至少有一条 "今天 同步 N 个素材"
    assert any(e["kind"] == "import" for e in events)
    today_event = next((e for e in events if e["kind"] == "import"), None)
    assert today_event is not None
    assert "同步" in today_event["text"]


def test_recent_activity_includes_usage(tmp_db, tmp_thumb_dir, tmp_root):
    """log_usage 后应有 usage 事件."""
    from backend.services.materials_service import scan_root, list_assets, log_usage, list_recent_activity
    scan_root()
    aid = list_assets()[0]["id"]
    log_usage(aid, "测试视频.mp4")
    events = list_recent_activity()
    assert any(e["kind"] == "usage" for e in events)
    u = next(e for e in events if e["kind"] == "usage")
    assert "测试视频" in u["text"]


def test_recent_activity_empty_db(tmp_db, tmp_thumb_dir):
    from backend.services.materials_service import list_recent_activity
    events = list_recent_activity()
    assert events == []


def test_top_used_empty(tmp_db, tmp_thumb_dir, tmp_root):
    """没 usage 时返空 list."""
    from backend.services.materials_service import scan_root, list_top_used
    scan_root()
    assert list_top_used() == []


def test_top_used_sorted_by_hits(tmp_db, tmp_thumb_dir, tmp_root):
    from backend.services.materials_service import scan_root, list_assets, log_usage, list_top_used
    scan_root()
    items = list_assets()
    log_usage(items[0]["id"], "x")
    log_usage(items[0]["id"], "y")
    log_usage(items[1]["id"], "z")
    top = list_top_used()
    assert len(top) == 2
    assert top[0]["id"] == items[0]["id"]
    assert top[0]["hits"] == 2
    assert top[1]["hits"] == 1


# ─── search_assets 全库搜索 (D-087 整改 follow-up) ────────


def test_search_empty_query_returns_empty(tmp_db, tmp_thumb_dir, tmp_root):
    from backend.services.materials_service import search_assets, scan_root
    scan_root()
    assert search_assets("") == []
    assert search_assets("   ") == []
    assert search_assets(None) == []


def test_search_matches_filename(tmp_db, tmp_thumb_dir, tmp_root):
    from backend.services.materials_service import scan_root, search_assets
    scan_root()
    # tmp_root 含 raise_hand.jpg / podium.jpg / outside.jpg
    r = search_assets("raise")
    assert len(r) == 1
    assert r[0]["filename"] == "raise_hand.jpg"


def test_search_case_insensitive(tmp_db, tmp_thumb_dir, tmp_root):
    from backend.services.materials_service import scan_root, search_assets
    scan_root()
    a = search_assets("RAISE")
    b = search_assets("raise")
    c = search_assets("Raise")
    assert len(a) == len(b) == len(c) == 1


def test_search_matches_folder(tmp_db, tmp_thumb_dir, tmp_root):
    from backend.services.materials_service import scan_root, search_assets
    scan_root()
    r = search_assets("讲台")  # rel_folder = "00 讲台高光" or "00 讲台高光/提问"
    names = {a["filename"] for a in r}
    # 至少应该匹配讲台文件夹下的 raise_hand 和 podium
    assert "raise_hand.jpg" in names
    assert "podium.jpg" in names
    # outside.jpg 在根目录, 不应匹配 "讲台"
    assert "outside.jpg" not in names


def test_search_matches_tag_name(tmp_db, tmp_thumb_dir, tmp_root):
    """打了标签的素材, 搜标签名能找到."""
    from backend.services.materials_service import scan_root, list_assets
    from backend.services.materials_pipeline import _write_tags
    from backend.services.materials_service import search_assets
    scan_root()
    items = list_assets()
    aid = items[0]["id"]
    _write_tags(aid, ["独特标签XY"])
    r = search_assets("独特标签XY")
    assert len(r) == 1
    assert r[0]["id"] == aid


def test_search_includes_tags_and_hits_in_result(tmp_db, tmp_thumb_dir, tmp_root):
    """结果含 tags 列表 + hits 数 (跟 list_assets 同 schema)."""
    from backend.services.materials_service import scan_root, list_assets, log_usage, search_assets
    scan_root()
    aid = list_assets()[0]["id"]
    log_usage(aid, "x")
    log_usage(aid, "y")
    items = list_assets()
    target = next(a for a in items if a["id"] == aid)
    r = search_assets(target["filename"][:5])
    assert len(r) >= 1
    matched = next(a for a in r if a["id"] == aid)
    assert "tags" in matched
    assert isinstance(matched["tags"], list)
    assert matched["hits"] == 2


def test_search_limit(tmp_db, tmp_thumb_dir, tmp_root):
    from backend.services.materials_service import scan_root, search_assets
    scan_root()
    # 搜 jpg 应该匹配多张, limit=2 截断
    r = search_assets("jpg", limit=2)
    assert len(r) == 2


def test_search_no_match_returns_empty(tmp_db, tmp_thumb_dir, tmp_root):
    from backend.services.materials_service import scan_root, search_assets
    scan_root()
    assert search_assets("xyzabcnotexist123") == []


def test_search_dedupes_when_filename_and_tag_both_match(tmp_db, tmp_thumb_dir, tmp_root):
    """同一素材既被 filename 匹配又被 tag 匹配, 只返回一次 (seen 去重)."""
    from backend.services.materials_service import scan_root, list_assets, search_assets
    from backend.services.materials_pipeline import _write_tags
    scan_root()
    items = list_assets()
    target = next(a for a in items if a["filename"] == "raise_hand.jpg")
    _write_tags(target["id"], ["raise"])  # 标签也叫 raise (跟 filename 部分匹配)
    r = search_assets("raise")
    # 不应该出现两次
    ids = [a["id"] for a in r]
    assert ids.count(target["id"]) == 1


# ─── 待整理工作流 (D-087 C, PRD §3.3) ────────────────────


def test_pending_review_empty(tmp_db, tmp_thumb_dir, tmp_root):
    from backend.services.materials_service import list_pending_review, scan_root
    scan_root()
    assert list_pending_review() == []


def test_pending_review_returns_assets_with_suggestion(tmp_db, tmp_thumb_dir, tmp_root):
    """写一条 pending_move 后, list_pending_review 应该返这条 asset 的完整 row + suggested."""
    from backend.services.materials_service import scan_root, list_assets, list_pending_review
    from backend.services.materials_pipeline import _write_pending_move
    scan_root()
    aid = list_assets()[0]["id"]
    _write_pending_move(aid, "02 学生反应", "AI 觉得这是学生场景", confidence=0.85, is_new=False)
    rows = list_pending_review()
    assert len(rows) == 1
    assert rows[0]["id"] == aid
    assert rows[0]["suggested_folder"] == "02 学生反应"
    assert rows[0]["reason"] == "AI 觉得这是学生场景"
    assert rows[0]["is_new_folder"] == 0
    assert "tags" in rows[0]


def test_pending_review_skips_approved_and_rejected(tmp_db, tmp_thumb_dir, tmp_root):
    """approve/reject 后那条不再出现在 pending_review."""
    from backend.services.materials_service import (
        scan_root, list_assets, list_pending_review,
        approve_pending, reject_pending,
    )
    from backend.services.materials_pipeline import _write_pending_move
    scan_root()
    items = list_assets()
    aid_ok = items[0]["id"]
    aid_skip = items[1]["id"]
    aid_keep = items[2]["id"]
    _write_pending_move(aid_ok, "0X 通过", "x", confidence=0.85, is_new=True)
    _write_pending_move(aid_skip, "0X 跳过", "y", confidence=0.85, is_new=True)
    _write_pending_move(aid_keep, "0X 留着", "z", confidence=0.85, is_new=True)
    approve_pending(aid_ok)
    reject_pending(aid_skip)
    rows = list_pending_review()
    ids = {r["id"] for r in rows}
    assert ids == {aid_keep}


def test_approve_pending_updates_rel_folder(tmp_db, tmp_thumb_dir, tmp_root):
    """通过后 material_assets.rel_folder 应改成 suggested_folder, status=approved."""
    import sqlite3
    from contextlib import closing
    from shortvideo.db import get_connection
    from backend.services.materials_service import (
        scan_root, list_assets, approve_pending,
    )
    from backend.services.materials_pipeline import _write_pending_move
    scan_root()
    aid = list_assets()[0]["id"]
    target_folder = "99 新归档目录"
    _write_pending_move(aid, target_folder, "AI 想这么放", confidence=0.85, is_new=True)
    res = approve_pending(aid)
    assert res["ok"] is True
    assert res["new_folder"] == target_folder
    with closing(get_connection()) as con:
        rel = con.execute("SELECT rel_folder FROM material_assets WHERE id=?", (aid,)).fetchone()[0]
        st = con.execute(
            "SELECT status FROM material_pending_moves WHERE asset_id=?", (aid,)
        ).fetchone()[0]
    assert rel == target_folder
    assert st == "approved"


def test_approve_pending_no_record_returns_error(tmp_db, tmp_thumb_dir, tmp_root):
    """没有 pending move 的 asset 不能 approve."""
    from backend.services.materials_service import scan_root, list_assets, approve_pending
    scan_root()
    aid = list_assets()[0]["id"]
    res = approve_pending(aid)
    assert res["ok"] is False
    assert "no pending" in res["error"].lower()


def test_reject_pending_keeps_rel_folder(tmp_db, tmp_thumb_dir, tmp_root):
    """跳过后 rel_folder 保持不动, status=rejected."""
    from contextlib import closing
    from shortvideo.db import get_connection
    from backend.services.materials_service import scan_root, list_assets, reject_pending
    from backend.services.materials_pipeline import _write_pending_move
    scan_root()
    a = list_assets()[0]
    aid, original_folder = a["id"], a["rel_folder"]
    _write_pending_move(aid, "99 新归档", "AI 觉得", confidence=0.85, is_new=True)
    res = reject_pending(aid)
    assert res["ok"] is True
    with closing(get_connection()) as con:
        rel = con.execute("SELECT rel_folder FROM material_assets WHERE id=?", (aid,)).fetchone()[0]
        st = con.execute(
            "SELECT status FROM material_pending_moves WHERE asset_id=?", (aid,)
        ).fetchone()[0]
    assert rel == original_folder  # 没动
    assert st == "rejected"


def test_reject_pending_no_record_returns_error(tmp_db, tmp_thumb_dir, tmp_root):
    from backend.services.materials_service import scan_root, list_assets, reject_pending
    scan_root()
    aid = list_assets()[0]["id"]
    res = reject_pending(aid)
    assert res["ok"] is False


def test_get_stats_counts_only_pending_status(tmp_db, tmp_thumb_dir, tmp_root):
    """get_stats.pending_review 只数 status='pending', 不数 approved/rejected."""
    from backend.services.materials_service import (
        scan_root, list_assets, get_stats, approve_pending, reject_pending,
    )
    from backend.services.materials_pipeline import _write_pending_move
    scan_root()
    items = list_assets()
    a, b, c = items[0]["id"], items[1]["id"], items[2]["id"]
    _write_pending_move(a, "x", "x", confidence=0.85, is_new=True)
    _write_pending_move(b, "y", "y", confidence=0.85, is_new=True)
    _write_pending_move(c, "z", "z", confidence=0.85, is_new=True)
    approve_pending(a)
    reject_pending(b)
    s = get_stats()
    # 只剩 c 是 pending
    assert s["pending_review"] == 1


def test_pending_review_orders_by_imported_desc(tmp_db, tmp_thumb_dir, tmp_root):
    """list_pending_review 按 imported_at DESC, 最新进来的素材排前面."""
    import time
    from contextlib import closing
    from shortvideo.db import get_connection
    from backend.services.materials_service import scan_root, list_assets, list_pending_review
    from backend.services.materials_pipeline import _write_pending_move
    scan_root()
    items = list_assets()
    older, newer = items[0]["id"], items[1]["id"]
    # 强行改 imported_at
    with closing(get_connection()) as con:
        con.execute("UPDATE material_assets SET imported_at=1000 WHERE id=?", (older,))
        con.execute("UPDATE material_assets SET imported_at=2000 WHERE id=?", (newer,))
        con.commit()
    _write_pending_move(older, "x", "x", confidence=0.85, is_new=True)
    _write_pending_move(newer, "y", "y", confidence=0.85, is_new=True)
    rows = list_pending_review()
    assert rows[0]["id"] == newer
    assert rows[1]["id"] == older
