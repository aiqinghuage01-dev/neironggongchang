"""Round 2 review (review 后的回归测试).

Codex 复审 Phase 0-10 后给出 5 条新发现:
  P1-1 material-lib/file 仍信任 DB 里的 abs_path
  P1-2 get_materials_root 不校验存储值, 旧 settings.json 能绕过 Phase 10
  P2-3 admin 401 缺 CORS headers
  P2-4 upload 是 read-then-check, oversized 已进内存
  P3-5 UNPROTECTED_PATH_PREFIXES 让写方法在 /media /docs 等绕过

本文件每个修复对应至少 1 条回归测试.
"""
from __future__ import annotations

import importlib
import json
import os
import sqlite3
import tempfile
import time
from pathlib import Path

import pytest


# ============================================================
# P1-1 (round 3): 拆 source vs thumb validator.
# 老 is_safe_material_file 把整个 DATA_DIR 列入白名单, 攻击者 abs_path=
# <DATA_DIR>/works.db ext='.jpg' 仍能 200 拖走 SQLite. 已删, 拆成两个:
#   is_safe_material_source  → /api/material-lib/file/{id}
#     只允许 home/<MATERIALS_ROOT_ALLOWED_PREFIXES>, **不**含 DATA_DIR.
#     真实后缀必须在 MATERIAL_ASSET_ALLOWED_EXTS.
#   is_safe_material_thumb   → /api/material-lib/thumb/{id}
#     只允许 DATA_DIR/material_thumbs/.
# ============================================================


@pytest.fixture
def p1_setup(monkeypatch, tmp_path):
    """临时 DATA_DIR + 临时 home + 一个 fake materials_root."""
    fake_home = tmp_path / "fake_home"
    (fake_home / "Downloads").mkdir(parents=True)
    monkeypatch.setattr(Path, "home", classmethod(lambda cls: fake_home))

    data_dir = tmp_path / "data"
    data_dir.mkdir()
    (data_dir / "material_thumbs").mkdir()

    # thumb 文件 (在 DATA_DIR/material_thumbs 内)
    thumb = data_dir / "material_thumbs" / "ok.jpg"
    thumb.write_bytes(b"JPG_OK")

    # 合法素材 (在 ~/Downloads 内, 媒体后缀)
    legit_in_root = fake_home / "Downloads" / "movie.mp4"
    legit_in_root.write_bytes(b"MP4_OK")

    # 攻击 1: DATA_DIR 内的 SQLite (清华哥 round-3 复现 case)
    fake_db = data_dir / "works.db"
    fake_db.write_bytes(b"SQLite format 3\x00FAKE")

    # 攻击 2: DATA_DIR 内但伪装成 .jpg
    fake_db_jpg = data_dir / "evil.jpg"
    fake_db_jpg.write_bytes(b"NOT_REALLY_JPG")

    # 攻击 3: home 外
    evil_outside = tmp_path / "secret.dat"
    evil_outside.write_bytes(b"SECRET")

    monkeypatch.setattr("shortvideo.config.DATA_DIR", data_dir)
    return {
        "data_dir": data_dir, "thumb": thumb, "legit_in_root": legit_in_root,
        "fake_db": fake_db, "fake_db_jpg": fake_db_jpg, "evil_outside": evil_outside,
    }


# ─── is_safe_material_source ──────────────────────────────────


def test_p1_source_accepts_legit_in_materials_root(p1_setup):
    from backend.services.path_security import is_safe_material_source
    out = is_safe_material_source(str(p1_setup["legit_in_root"]))
    assert out == p1_setup["legit_in_root"].resolve()


def test_p1_source_rejects_data_dir_works_db(p1_setup):
    """核心 P1 case: abs_path=<DATA_DIR>/works.db → None (即使 ext '.jpg')."""
    from backend.services.path_security import is_safe_material_source
    assert is_safe_material_source(str(p1_setup["fake_db"])) is None


def test_p1_source_rejects_data_dir_even_with_jpg_ext(p1_setup):
    """DATA_DIR 内的真实 .jpg 也拒 — DATA_DIR 不应作素材源."""
    from backend.services.path_security import is_safe_material_source
    assert is_safe_material_source(str(p1_setup["fake_db_jpg"])) is None


def test_p1_source_rejects_etc_passwd():
    from backend.services.path_security import is_safe_material_source
    assert is_safe_material_source("/etc/passwd") is None


def test_p1_source_rejects_outside_path(p1_setup):
    from backend.services.path_security import is_safe_material_source
    assert is_safe_material_source(str(p1_setup["evil_outside"])) is None


def test_p1_source_rejects_dir(p1_setup):
    from backend.services.path_security import is_safe_material_source
    assert is_safe_material_source(str(p1_setup["data_dir"])) is None


def test_p1_source_rejects_nonexistent(p1_setup):
    from backend.services.path_security import is_safe_material_source
    assert is_safe_material_source(str(p1_setup["legit_in_root"].parent / "missing.mp4")) is None


def test_p1_source_rejects_empty_and_nul(p1_setup):
    from backend.services.path_security import is_safe_material_source
    for raw in ["", None, "  ", "/etc/passwd\x00.jpg"]:
        assert is_safe_material_source(raw) is None


def test_p1_source_rejects_bad_extension(p1_setup):
    """合法路径但后缀不在媒体白名单 (.db/.json/.txt) → 拒."""
    from backend.services.path_security import is_safe_material_source
    bad = p1_setup["legit_in_root"].parent / "ref.txt"
    bad.write_text("hi")
    assert is_safe_material_source(str(bad)) is None


def test_p1_source_uses_real_suffix_not_db_ext(p1_setup):
    """关键: 真实后缀来自 resolved.suffix, 不信 DB ext.
    这里建一个真实 .db 文件在合法 root, 验证它仍被拒 (后缀 .db 不在媒体白名单)."""
    from backend.services.path_security import is_safe_material_source
    fake = p1_setup["legit_in_root"].parent / "evil.db"
    fake.write_bytes(b"SQLite")
    # 即使有人在 DB ext 写 '.jpg', 函数取 resolved.suffix='.db' → 拒
    assert is_safe_material_source(str(fake)) is None


# ─── is_safe_material_thumb ───────────────────────────────────


def test_p1_thumb_accepts_legit_in_material_thumbs(p1_setup):
    from backend.services.path_security import is_safe_material_thumb
    out = is_safe_material_thumb(str(p1_setup["thumb"]), p1_setup["data_dir"])
    assert out == p1_setup["thumb"].resolve()


def test_p1_thumb_rejects_data_dir_works_db(p1_setup):
    """thumb 端只允许 material_thumbs/ 子树, DATA_DIR/works.db 拒."""
    from backend.services.path_security import is_safe_material_thumb
    assert is_safe_material_thumb(str(p1_setup["fake_db"]), p1_setup["data_dir"]) is None


def test_p1_thumb_rejects_data_dir_other_subdirs(p1_setup):
    """DATA_DIR/videos/ 等其他子目录的文件也不能当 thumb."""
    from backend.services.path_security import is_safe_material_thumb
    (p1_setup["data_dir"] / "videos").mkdir()
    other = p1_setup["data_dir"] / "videos" / "x.jpg"
    other.write_bytes(b"X")
    assert is_safe_material_thumb(str(other), p1_setup["data_dir"]) is None


def test_p1_thumb_rejects_outside_data_dir(p1_setup):
    from backend.services.path_security import is_safe_material_thumb
    assert is_safe_material_thumb(str(p1_setup["legit_in_root"]), p1_setup["data_dir"]) is None
    assert is_safe_material_thumb("/etc/passwd", p1_setup["data_dir"]) is None


def test_p1_thumb_rejects_empty_and_nul(p1_setup):
    from backend.services.path_security import is_safe_material_thumb
    for raw in ["", None, "  ", "/etc/passwd\x00"]:
        assert is_safe_material_thumb(raw, p1_setup["data_dir"]) is None


def test_p1_no_legacy_is_safe_material_file_export():
    """老 is_safe_material_file 已删, 不能复活 (它把整个 DATA_DIR 当素材源, 不安全)."""
    from backend.services import path_security
    assert not hasattr(path_security, "is_safe_material_file"), (
        "老 is_safe_material_file 应已删, 拆成 is_safe_material_source + "
        "is_safe_material_thumb. 不要复活老 helper."
    )


# ─── 端到端: /api/material-lib/file/{id} ────────────────────


def _setup_e2e(monkeypatch, tmp_path):
    """通用 e2e fixture 体: fake home + 临时 DATA_DIR + 临时 DB."""
    fake_home = tmp_path / "fake_home"
    (fake_home / "Downloads").mkdir(parents=True)
    monkeypatch.setattr(Path, "home", classmethod(lambda cls: fake_home))

    data_dir = tmp_path / "data"
    data_dir.mkdir()
    db = tmp_path / "works.db"
    monkeypatch.setattr("shortvideo.config.DB_PATH", db)
    monkeypatch.setattr("shortvideo.config.DATA_DIR", data_dir)
    monkeypatch.setattr("backend.services.settings.SETTINGS_FILE", data_dir / "settings.json")

    from backend.services import migrations
    migrations.reset_for_test()
    migrations.apply_migrations()

    monkeypatch.delenv("ADMIN_TOKEN", raising=False)
    monkeypatch.delenv("APP_ENV", raising=False)
    import backend.api as api_mod
    importlib.reload(api_mod)
    from fastapi.testclient import TestClient
    return TestClient(api_mod.app), db, data_dir, fake_home


def _insert_asset(db: Path, asset_id: str, abs_path: str, ext: str = ".mp4"):
    with sqlite3.connect(str(db)) as con:
        con.execute(
            "INSERT INTO material_assets (id, abs_path, filename, ext, imported_at) "
            "VALUES (?, ?, ?, ?, ?)",
            (asset_id, abs_path, Path(abs_path).name, ext, int(time.time())),
        )
        con.commit()


def test_p1_endpoint_returns_404_for_polluted_etc_passwd(monkeypatch, tmp_path):
    """端到端: abs_path=/etc/passwd → 404."""
    client, db, _, _ = _setup_e2e(monkeypatch, tmp_path)
    _insert_asset(db, "polluted-etc", "/etc/passwd", "")
    r = client.get("/api/material-lib/file/polluted-etc")
    assert r.status_code == 404


def test_p1_endpoint_returns_404_for_outside_tmp_file(monkeypatch, tmp_path):
    """端到端: abs_path 指向 home 外的 .bin → 404."""
    client, db, _, _ = _setup_e2e(monkeypatch, tmp_path)
    outside = tmp_path / "outside_secret.bin"
    outside.write_bytes(b"X")
    _insert_asset(db, "outside-id", str(outside), ".bin")
    r = client.get("/api/material-lib/file/outside-id")
    assert r.status_code == 404


def test_p1_endpoint_returns_404_for_data_dir_works_db(monkeypatch, tmp_path):
    """**清华哥 round-3 复现 case**: 污染 row abs_path=<DATA_DIR>/works.db,
    ext='.jpg', 必须 404. 老 is_safe_material_file 因 DATA_DIR 在白名单 → 200,
    现拆分后必拒."""
    client, db, data_dir, _ = _setup_e2e(monkeypatch, tmp_path)
    fake_db = data_dir / "works.db"
    fake_db.write_bytes(b"SQLite format 3\x00FAKE")
    # 故意写 ext='.jpg' 模拟攻击者改 DB
    _insert_asset(db, "data-db", str(fake_db), ".jpg")

    r = client.get("/api/material-lib/file/data-db")
    assert r.status_code == 404, f"DATA_DIR/works.db 必须 404, 实际 {r.status_code} {r.text[:80]}"
    # 进一步: 响应里不能含 SQLite header
    assert b"SQLite format" not in r.content


def test_p1_endpoint_returns_404_for_data_dir_settings_json(monkeypatch, tmp_path):
    """同上, abs_path=<DATA_DIR>/settings.json ext='.jpg' 也必须 404."""
    client, db, data_dir, _ = _setup_e2e(monkeypatch, tmp_path)
    fake = data_dir / "settings.json"
    fake.write_text('{"token":"secret"}')
    _insert_asset(db, "data-settings", str(fake), ".jpg")

    r = client.get("/api/material-lib/file/data-settings")
    assert r.status_code == 404
    assert b"secret" not in r.content


def test_p1_endpoint_returns_200_for_legit_in_materials_root(monkeypatch, tmp_path):
    """合法素材 (在 ~/Downloads 内 + 媒体后缀) 仍能 200."""
    client, db, _, fake_home = _setup_e2e(monkeypatch, tmp_path)
    # 第 3 / 4 个返回值对应 data_dir / fake_home; 这里只用 fake_home.
    legit = fake_home / "Downloads" / "movie.mp4"
    legit.write_bytes(b"FAKE_MP4_BYTES")
    _insert_asset(db, "legit", str(legit), ".mp4")

    r = client.get("/api/material-lib/file/legit")
    assert r.status_code == 200, f"合法素材应 200, 实际 {r.status_code}"
    assert r.content == b"FAKE_MP4_BYTES"


# ============================================================
# P1-2: get_materials_root fail-closed when stored value invalid
# ============================================================


def test_p1_2_get_materials_root_falls_back_when_stored_is_root(monkeypatch, tmp_path):
    """settings.json 已含非法 materials_root='/', get_materials_root 应回退默认."""
    fake_home = tmp_path / "fake_home"
    (fake_home / "Downloads").mkdir(parents=True)
    monkeypatch.setattr(Path, "home", classmethod(lambda cls: fake_home))

    data_dir = tmp_path / "data"
    data_dir.mkdir()
    settings_file = data_dir / "settings.json"
    # 直接写入污染配置 (不经 settings.update, 模拟旧版本残留)
    settings_file.write_text(json.dumps({"materials_root": "/"}))

    monkeypatch.setattr("shortvideo.config.DATA_DIR", data_dir)
    monkeypatch.setattr("backend.services.settings.SETTINGS_FILE", settings_file)

    from backend.services import materials_service
    out = materials_service.get_materials_root()
    # 应回退到 ~/Downloads, 不是 /
    assert out != Path("/"), f"get_materials_root 不能直接返 /, 实际返了 {out}"
    assert out == (fake_home / "Downloads").resolve()


def test_p1_2_get_materials_root_falls_back_when_stored_is_etc(monkeypatch, tmp_path):
    fake_home = tmp_path / "fake_home"
    (fake_home / "Downloads").mkdir(parents=True)
    monkeypatch.setattr(Path, "home", classmethod(lambda cls: fake_home))

    data_dir = tmp_path / "data"
    data_dir.mkdir()
    (data_dir / "settings.json").write_text(json.dumps({"materials_root": "/etc"}))

    monkeypatch.setattr("shortvideo.config.DATA_DIR", data_dir)
    monkeypatch.setattr("backend.services.settings.SETTINGS_FILE", data_dir / "settings.json")

    from backend.services import materials_service
    out = materials_service.get_materials_root()
    assert out == (fake_home / "Downloads").resolve()


def test_p1_2_scan_root_fails_closed_when_root_unsafe(monkeypatch, tmp_path):
    """settings.json 含 / → get_materials_root 回退默认 → 默认存在 → scan 走默认.

    防御 1: get_materials_root 已回退
    防御 2: scan_root 内 validate_materials_root 二次校
    最终 scan 走的是 ~/Downloads (合法), 而不是 /.
    """
    fake_home = tmp_path / "fake_home"
    (fake_home / "Downloads").mkdir(parents=True)
    monkeypatch.setattr(Path, "home", classmethod(lambda cls: fake_home))

    data_dir = tmp_path / "data"
    data_dir.mkdir()
    (data_dir / "settings.json").write_text(json.dumps({"materials_root": "/"}))
    monkeypatch.setattr("shortvideo.config.DATA_DIR", data_dir)
    monkeypatch.setattr("backend.services.settings.SETTINGS_FILE", data_dir / "settings.json")

    db = tmp_path / "works.db"
    monkeypatch.setattr("shortvideo.config.DB_PATH", db)
    from backend.services import migrations
    migrations.reset_for_test()
    migrations.apply_migrations()

    from backend.services import materials_service
    # 用 mock _walk_root 探测它是否走 / (扫到 root 文件)
    walked_roots: list[Path] = []

    def fake_walk(root):
        walked_roots.append(root)
        return iter([])

    monkeypatch.setattr(materials_service, "_walk_root", fake_walk)
    materials_service.scan_root(max_files=10)
    assert walked_roots, "scan_root 应至少调一次 _walk_root (走默认 root)"
    for r in walked_roots:
        assert r == (fake_home / "Downloads").resolve(), (
            f"scan_root 不应扫 /, 实际扫了 {r}"
        )


# ============================================================
# P2-3: admin 401 必须带 CORS headers
# ============================================================


def test_p2_3_admin_401_carries_cors_headers(monkeypatch):
    """admin guard 返回 401 时, CORSMiddleware 仍应包上 ACAO header."""
    monkeypatch.setenv("ADMIN_TOKEN", "test-secret-token")
    monkeypatch.delenv("APP_ENV", raising=False)
    import backend.api as api_mod
    importlib.reload(api_mod)
    from fastapi.testclient import TestClient
    client = TestClient(api_mod.app)

    r = client.post(
        "/api/settings",
        json={},
        headers={"Origin": "http://localhost:8001"},
    )
    assert r.status_code == 401
    assert r.json().get("detail") == "admin token required"
    # 关键: 401 也要带 ACAO, 否则浏览器 SOP 黑屏看不到 detail
    acao = r.headers.get("access-control-allow-origin")
    assert acao == "http://localhost:8001", (
        f"admin 401 必须带 ACAO=http://localhost:8001, 实际={acao!r}. "
        f"(P2-3 review: middleware add 顺序错了 → admin guard 在 CORS 外层 → "
        f"CORS 包不到 401)"
    )


def test_p2_3_admin_401_evil_origin_no_acao(monkeypatch):
    """非法 origin 即使是 401 也不应回 ACAO (CORS 仍按白名单工作)."""
    monkeypatch.setenv("ADMIN_TOKEN", "test-secret-token")
    monkeypatch.delenv("APP_ENV", raising=False)
    import backend.api as api_mod
    importlib.reload(api_mod)
    from fastapi.testclient import TestClient
    client = TestClient(api_mod.app)

    r = client.post(
        "/api/settings",
        json={},
        headers={"Origin": "https://evil.example.com"},
    )
    assert r.status_code == 401
    acao = r.headers.get("access-control-allow-origin")
    assert acao not in ("*", "https://evil.example.com")


# ============================================================
# P2-4: bounded upload read 防 OOM
# ============================================================


def test_p2_4_bounded_upload_read_rejects_oversize_early(monkeypatch):
    """流式 read 累计超 max_bytes+1 立即 raise, 不读完整 body."""
    import asyncio
    from backend.services.path_security import (
        PathBoundaryError, bounded_upload_read,
    )

    class FakeOversizedFile:
        """模拟 UploadFile, 假装有 100MB body, 用 generator 流式提供."""
        def __init__(self, total_bytes: int):
            self.total = total_bytes
            self.consumed = 0
            self.chunks_read = 0

        async def read(self, n: int = -1) -> bytes:
            self.chunks_read += 1
            if self.consumed >= self.total:
                return b""
            chunk_size = n if n > 0 else 64 * 1024
            actual = min(chunk_size, self.total - self.consumed)
            self.consumed += actual
            return b"x" * actual

    fake = FakeOversizedFile(total_bytes=100 * 1024 * 1024)  # 100MB
    max_allowed = 50 * 1024 * 1024  # 50MB

    async def go():
        with pytest.raises(PathBoundaryError):
            await bounded_upload_read(fake, max_allowed)

    asyncio.run(go())

    # 关键: 不应该把整个 100MB 读完, 应在累计超 max 后早拒
    assert fake.consumed <= max_allowed + 64 * 1024 + 1024, (
        f"bounded_upload_read 应在累计超 max ({max_allowed}) 后立即拒, "
        f"实际读了 {fake.consumed} bytes (差 {fake.consumed - max_allowed} 超量)"
    )


def test_p2_4_bounded_upload_read_accepts_exact_max(monkeypatch):
    import asyncio
    from backend.services.path_security import bounded_upload_read

    class FakeExactFile:
        def __init__(self, n):
            self.total = n
            self.done = False

        async def read(self, n: int = -1) -> bytes:
            if self.done:
                return b""
            self.done = True
            return b"x" * self.total

    fake = FakeExactFile(50 * 1024 * 1024)

    async def go():
        out = await bounded_upload_read(fake, 50 * 1024 * 1024)
        return out

    out = asyncio.run(go())
    assert len(out) == 50 * 1024 * 1024


def test_p2_4_bounded_upload_read_rejects_empty():
    import asyncio
    from backend.services.path_security import (
        PathBoundaryError, bounded_upload_read,
    )

    class EmptyFile:
        async def read(self, n=-1):
            return b""

    async def go():
        with pytest.raises(PathBoundaryError):
            await bounded_upload_read(EmptyFile(), 1024)

    asyncio.run(go())


# ============================================================
# P3-5: write methods 全部要 token, 无路径白名单
# ============================================================


def test_p3_5_post_to_media_now_requires_token(monkeypatch):
    """POST /media/anything 历史豁免, 现在收: 401."""
    monkeypatch.setenv("ADMIN_TOKEN", "test-secret-token")
    monkeypatch.delenv("APP_ENV", raising=False)
    import backend.api as api_mod
    importlib.reload(api_mod)
    from fastapi.testclient import TestClient
    client = TestClient(api_mod.app)

    r = client.post("/media/works.db")
    assert r.status_code == 401
    assert r.json().get("detail") == "admin token required"


def test_p3_5_get_to_media_still_unprotected(monkeypatch):
    """GET /media/* 仍然不要 token (Phase 1 收口的只读)."""
    monkeypatch.setenv("ADMIN_TOKEN", "test-secret-token")
    monkeypatch.delenv("APP_ENV", raising=False)
    import backend.api as api_mod
    importlib.reload(api_mod)
    from fastapi.testclient import TestClient
    client = TestClient(api_mod.app)

    r = client.get("/media/works.db")
    # Phase 1 拒, 但不应是 401, 应是 404
    assert r.status_code == 404
    assert r.json().get("detail") != "admin token required"


def test_p3_5_post_to_docs_now_requires_token(monkeypatch):
    monkeypatch.setenv("ADMIN_TOKEN", "test-secret-token")
    monkeypatch.delenv("APP_ENV", raising=False)
    import backend.api as api_mod
    importlib.reload(api_mod)
    from fastapi.testclient import TestClient
    client = TestClient(api_mod.app)

    r = client.post("/docs")
    assert r.status_code == 401


def test_p3_5_no_path_whitelist_constants_remain():
    """admin_auth 模块不应再 export UNPROTECTED_PATH_PREFIXES / is_unprotected_path,
    也不依赖它们."""
    from backend.services import admin_auth
    assert not hasattr(admin_auth, "UNPROTECTED_PATH_PREFIXES"), (
        "Phase 3 review (P3-5) 已删 UNPROTECTED_PATH_PREFIXES, 不应复活"
    )
    assert not hasattr(admin_auth, "is_unprotected_path"), (
        "is_unprotected_path 已删, 不应复活"
    )
