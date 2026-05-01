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
# P1-1: material-lib/file runtime abs_path validation
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

    # 一个合法 thumb 文件 (在 DATA_DIR 内)
    thumb = data_dir / "material_thumbs" / "ok.jpg"
    thumb.write_bytes(b"JPG_OK")

    # 一个合法素材 (在 ~/Downloads 内)
    legit_in_root = fake_home / "Downloads" / "movie.mp4"
    legit_in_root.write_bytes(b"MP4_OK")

    # 一个攻击文件 (在 home 外)
    evil_outside = tmp_path / "secret.dat"
    evil_outside.write_bytes(b"SECRET")

    monkeypatch.setattr("shortvideo.config.DATA_DIR", data_dir)
    return {
        "data_dir": data_dir,
        "thumb": thumb,
        "legit_in_root": legit_in_root,
        "evil_outside": evil_outside,
        "etc_passwd": Path("/etc/passwd"),
    }


def test_p1_1_is_safe_material_file_accepts_legit_in_data_dir(p1_setup):
    from backend.services.path_security import is_safe_material_file
    out = is_safe_material_file(str(p1_setup["thumb"]), p1_setup["data_dir"])
    assert out == p1_setup["thumb"].resolve()


def test_p1_1_is_safe_material_file_accepts_legit_in_materials_root(p1_setup):
    from backend.services.path_security import is_safe_material_file
    out = is_safe_material_file(str(p1_setup["legit_in_root"]), p1_setup["data_dir"])
    assert out == p1_setup["legit_in_root"].resolve()


def test_p1_1_is_safe_material_file_rejects_etc_passwd(p1_setup):
    from backend.services.path_security import is_safe_material_file
    # /etc/passwd 即使 .exists() 也不在 DATA_DIR 不在 fake home/Downloads
    out = is_safe_material_file("/etc/passwd", p1_setup["data_dir"])
    assert out is None


def test_p1_1_is_safe_material_file_rejects_outside_path(p1_setup):
    from backend.services.path_security import is_safe_material_file
    out = is_safe_material_file(str(p1_setup["evil_outside"]), p1_setup["data_dir"])
    assert out is None


def test_p1_1_is_safe_material_file_rejects_dir(p1_setup):
    from backend.services.path_security import is_safe_material_file
    out = is_safe_material_file(str(p1_setup["data_dir"]), p1_setup["data_dir"])
    assert out is None


def test_p1_1_is_safe_material_file_rejects_nonexistent(p1_setup):
    from backend.services.path_security import is_safe_material_file
    out = is_safe_material_file(
        str(p1_setup["data_dir"] / "missing.jpg"), p1_setup["data_dir"]
    )
    assert out is None


def test_p1_1_is_safe_material_file_rejects_empty_and_nul(p1_setup):
    from backend.services.path_security import is_safe_material_file
    for raw in ["", None, "  ", "/etc/passwd\x00.jpg"]:
        assert is_safe_material_file(raw, p1_setup["data_dir"]) is None


def test_p1_1_endpoint_returns_404_for_polluted_abs_path(monkeypatch, tmp_path):
    """端到端: 直接插一个 row abs_path=/etc/passwd → /api/material-lib/file/{id} 404."""
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

    # 直接 SQL 插一行污染数据
    with sqlite3.connect(str(db)) as con:
        con.execute(
            "INSERT INTO material_assets (id, abs_path, filename, ext, imported_at) "
            "VALUES (?, ?, ?, ?, ?)",
            ("polluted-id", "/etc/passwd", "passwd", "", int(time.time())),
        )
        con.commit()

    monkeypatch.delenv("ADMIN_TOKEN", raising=False)
    monkeypatch.delenv("APP_ENV", raising=False)
    import backend.api as api_mod
    importlib.reload(api_mod)
    from fastapi.testclient import TestClient
    client = TestClient(api_mod.app)

    r = client.get("/api/material-lib/file/polluted-id")
    assert r.status_code == 404, f"应 404 (越界), 实际 {r.status_code} {r.text}"


def test_p1_1_endpoint_returns_404_for_outside_tmp_file(monkeypatch, tmp_path):
    """端到端: row abs_path 指向 tmp_path 外面的一个真文件 → 404."""
    fake_home = tmp_path / "fake_home"
    (fake_home / "Downloads").mkdir(parents=True)
    monkeypatch.setattr(Path, "home", classmethod(lambda cls: fake_home))

    data_dir = tmp_path / "data"
    data_dir.mkdir()

    outside = tmp_path / "outside_secret.bin"
    outside.write_bytes(b"X")

    db = tmp_path / "works.db"
    monkeypatch.setattr("shortvideo.config.DB_PATH", db)
    monkeypatch.setattr("shortvideo.config.DATA_DIR", data_dir)
    monkeypatch.setattr("backend.services.settings.SETTINGS_FILE", data_dir / "settings.json")

    from backend.services import migrations
    migrations.reset_for_test()
    migrations.apply_migrations()

    with sqlite3.connect(str(db)) as con:
        con.execute(
            "INSERT INTO material_assets (id, abs_path, filename, ext, imported_at) "
            "VALUES (?, ?, ?, ?, ?)",
            ("outside-id", str(outside), "outside_secret.bin", ".bin", int(time.time())),
        )
        con.commit()

    monkeypatch.delenv("ADMIN_TOKEN", raising=False)
    monkeypatch.delenv("APP_ENV", raising=False)
    import backend.api as api_mod
    importlib.reload(api_mod)
    from fastapi.testclient import TestClient
    client = TestClient(api_mod.app)

    r = client.get("/api/material-lib/file/outside-id")
    assert r.status_code == 404, f"应 404 (越界), 实际 {r.status_code}"


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
