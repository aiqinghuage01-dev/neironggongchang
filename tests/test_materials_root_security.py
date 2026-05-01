"""Phase 10 · materials_root 白名单测试.

收口前 settings.materials_root 接受任意路径, 用户/攻击者改成 / 或 ~,
触发 scan 后扫整盘. 现加白名单 + 硬上限.

验:
- validate_materials_root 拒: / / ~ / /Users/black.chen / /etc / 不存在 / 不是 dir / symlink 跳出
- 白名单内 (~/Downloads / ~/Desktop/我的内容库 / ~/Desktop/素材库) 通
- POST /api/settings 设非法 materials_root → HTTP 400
- POST /api/settings 设合法 materials_root → 200
- scan_root max_files 不传也强制 hard cap (50k)
"""
from __future__ import annotations

from pathlib import Path

import pytest


# ─── 单元层 validate_materials_root ────────────────────────────


@pytest.fixture
def isolate_home(monkeypatch, tmp_path):
    """伪造 home 到 tmp_path, 在里面建白名单结构."""
    fake_home = tmp_path / "fake_home"
    (fake_home / "Downloads").mkdir(parents=True)
    (fake_home / "Desktop" / "我的内容库").mkdir(parents=True)
    (fake_home / "Desktop" / "素材库").mkdir(parents=True)
    (fake_home / "Desktop" / "清华哥素材库").mkdir(parents=True)

    # 伪造一个外部目录 (不在白名单)
    outside = tmp_path / "evil_outside"
    outside.mkdir()

    monkeypatch.setattr(Path, "home", classmethod(lambda cls: fake_home))
    return {"home": fake_home, "outside": outside}


def test_validate_materials_root_accepts_downloads(isolate_home):
    from backend.services.path_security import validate_materials_root
    out = validate_materials_root(str(isolate_home["home"] / "Downloads"))
    assert out == (isolate_home["home"] / "Downloads").resolve()


def test_validate_materials_root_accepts_desktop_my_lib(isolate_home):
    from backend.services.path_security import validate_materials_root
    out = validate_materials_root(str(isolate_home["home"] / "Desktop" / "我的内容库"))
    assert out.name == "我的内容库"


def test_validate_materials_root_accepts_subdir_under_allowed(isolate_home):
    """白名单根的子目录也允许."""
    from backend.services.path_security import validate_materials_root
    sub = isolate_home["home"] / "Downloads" / "movies"
    sub.mkdir()
    out = validate_materials_root(str(sub))
    assert out == sub.resolve()


def test_validate_materials_root_rejects_root(isolate_home):
    from backend.services.path_security import (
        PathBoundaryError, validate_materials_root,
    )
    with pytest.raises(PathBoundaryError):
        validate_materials_root("/")


def test_validate_materials_root_rejects_tilde_alone(isolate_home):
    from backend.services.path_security import (
        PathBoundaryError, validate_materials_root,
    )
    with pytest.raises(PathBoundaryError):
        validate_materials_root("~")


def test_validate_materials_root_rejects_users_root(isolate_home):
    from backend.services.path_security import (
        PathBoundaryError, validate_materials_root,
    )
    # /Users 整个目录 — 太宽
    with pytest.raises(PathBoundaryError):
        validate_materials_root("/Users")


def test_validate_materials_root_rejects_etc(isolate_home):
    from backend.services.path_security import (
        PathBoundaryError, validate_materials_root,
    )
    with pytest.raises(PathBoundaryError):
        validate_materials_root("/etc")


def test_validate_materials_root_rejects_home_root(isolate_home):
    """整个 ~/Users/<user> 不在白名单 (太宽), 必须是 ~/Downloads / Desktop/我的内容库 等."""
    from backend.services.path_security import (
        PathBoundaryError, validate_materials_root,
    )
    with pytest.raises(PathBoundaryError):
        validate_materials_root(str(isolate_home["home"]))


def test_validate_materials_root_rejects_outside(isolate_home):
    from backend.services.path_security import (
        PathBoundaryError, validate_materials_root,
    )
    with pytest.raises(PathBoundaryError):
        validate_materials_root(str(isolate_home["outside"]))


def test_validate_materials_root_rejects_nonexistent(isolate_home):
    from backend.services.path_security import (
        PathBoundaryError, validate_materials_root,
    )
    with pytest.raises(PathBoundaryError):
        validate_materials_root(str(isolate_home["home"] / "Downloads" / "missing"))


def test_validate_materials_root_rejects_file_not_dir(isolate_home):
    """指向文件而非目录 → 拒."""
    from backend.services.path_security import (
        PathBoundaryError, validate_materials_root,
    )
    f = isolate_home["home"] / "Downloads" / "file.txt"
    f.write_text("x")
    with pytest.raises(PathBoundaryError):
        validate_materials_root(str(f))


def test_validate_materials_root_rejects_empty(isolate_home):
    from backend.services.path_security import (
        PathBoundaryError, validate_materials_root,
    )
    for raw in ["", "   ", None]:
        with pytest.raises(PathBoundaryError):
            validate_materials_root(raw)


def test_validate_materials_root_rejects_nul_byte(isolate_home):
    from backend.services.path_security import (
        PathBoundaryError, validate_materials_root,
    )
    with pytest.raises(PathBoundaryError):
        validate_materials_root("/Users/x\x00")


def test_validate_materials_root_rejects_symlink_escape(isolate_home):
    """白名单根内放 symlink → 外部 → 解 symlink 后落白名单外 → 拒."""
    from backend.services.path_security import (
        PathBoundaryError, validate_materials_root,
    )
    link = isolate_home["home"] / "Downloads" / "evil_link"
    try:
        link.symlink_to(isolate_home["outside"])
    except (OSError, NotImplementedError):
        pytest.skip("symlink 不可建")
    with pytest.raises(PathBoundaryError):
        validate_materials_root(str(link))


# ─── settings.update 集成 ────────────────────────────────────


@pytest.fixture
def settings_isolate(monkeypatch, tmp_path):
    """伪造 settings.json 到 tmp_path, 配 isolate home."""
    fake_data = tmp_path / "data"
    fake_data.mkdir()
    fake_settings = fake_data / "settings.json"

    fake_home = tmp_path / "fake_home"
    (fake_home / "Downloads").mkdir(parents=True)
    (fake_home / "Desktop" / "我的内容库").mkdir(parents=True)

    monkeypatch.setattr("backend.services.settings.SETTINGS_FILE", fake_settings)
    monkeypatch.setattr(Path, "home", classmethod(lambda cls: fake_home))
    return {"settings_file": fake_settings, "home": fake_home}


def test_settings_update_accepts_legit_materials_root(settings_isolate):
    from backend.services import settings as s
    legit = str(settings_isolate["home"] / "Downloads")
    result = s.update({"materials_root": legit})
    assert Path(result["materials_root"]).resolve() == Path(legit).resolve()


def test_settings_update_rejects_root_materials_root(settings_isolate):
    from backend.services import settings as s
    with pytest.raises(ValueError, match="materials_root"):
        s.update({"materials_root": "/"})


def test_settings_update_rejects_etc(settings_isolate):
    from backend.services import settings as s
    with pytest.raises(ValueError):
        s.update({"materials_root": "/etc"})


def test_settings_update_rejects_users_root(settings_isolate):
    from backend.services import settings as s
    with pytest.raises(ValueError):
        s.update({"materials_root": "/Users"})


def test_settings_update_other_fields_unaffected(settings_isolate):
    """非 materials_root 字段照常更新."""
    from backend.services import settings as s
    result = s.update({"li_tone": "sharp"})
    assert result["li_tone"] == "sharp"


# ─── /api/settings 端到端 ────────────────────────────────────


@pytest.fixture
def api_client(monkeypatch, tmp_path):
    fake_data = tmp_path / "data"
    fake_data.mkdir()
    fake_home = tmp_path / "fake_home"
    (fake_home / "Downloads").mkdir(parents=True)

    monkeypatch.setattr("backend.services.settings.SETTINGS_FILE", fake_data / "settings.json")
    monkeypatch.setattr(Path, "home", classmethod(lambda cls: fake_home))
    monkeypatch.delenv("ADMIN_TOKEN", raising=False)
    monkeypatch.delenv("APP_ENV", raising=False)

    import importlib
    import backend.api as api_mod
    importlib.reload(api_mod)
    from fastapi.testclient import TestClient
    return TestClient(api_mod.app), fake_home


def test_api_settings_post_rejects_root(api_client):
    client, _ = api_client
    r = client.post("/api/settings", json={"materials_root": "/"})
    assert r.status_code == 400
    assert "materials_root" in r.json()["detail"]


def test_api_settings_post_rejects_etc(api_client):
    client, _ = api_client
    r = client.post("/api/settings", json={"materials_root": "/etc"})
    assert r.status_code == 400


def test_api_settings_post_accepts_legit(api_client):
    client, home = api_client
    r = client.post("/api/settings", json={"materials_root": str(home / "Downloads")})
    assert r.status_code == 200, r.text


# ─── scan_root max_files 硬上限 ──────────────────────────────


def test_scan_hard_cap_constant_is_50000():
    from backend.services.path_security import MATERIALS_SCAN_HARD_MAX_FILES
    assert MATERIALS_SCAN_HARD_MAX_FILES == 50_000


def test_scan_root_caps_max_files(monkeypatch, tmp_path):
    """即使 max_files 传 100w 也只扫 hard cap (50k)."""
    from backend.services.path_security import MATERIALS_SCAN_HARD_MAX_FILES
    from backend.services import materials_service as ms

    # mock _walk_root 返一个能产 200k 文件的 generator (不真建)
    fake_files = [tmp_path / f"file_{i}.jpg" for i in range(200_000)]

    def fake_walk(root):
        yield from fake_files

    monkeypatch.setattr(ms, "_walk_root", fake_walk)
    monkeypatch.setattr(ms, "_ensure_schema", lambda: None)
    monkeypatch.setattr(ms, "get_materials_root", lambda: tmp_path)
    # mock _upsert_asset 不真做 (避 DB)
    monkeypatch.setattr(ms, "_upsert_asset", lambda con, p, root: ("fake-id", False))
    # mock get_connection 返个能 close 的 fake
    class FakeCon:
        def commit(self): pass
        def close(self): pass
    monkeypatch.setattr(ms, "get_connection", lambda: FakeCon())

    # 关键: 传 1_000_000 也只能扫 50_000
    result = ms.scan_root(max_files=1_000_000)
    assert result["scanned"] == MATERIALS_SCAN_HARD_MAX_FILES, (
        f"max_files=1M 应被 cap 到 {MATERIALS_SCAN_HARD_MAX_FILES}, 实际 {result['scanned']}"
    )


def test_scan_root_caps_when_no_max_files(monkeypatch, tmp_path):
    """max_files=None 不应"无上限"扫到死, 也用 hard cap."""
    from backend.services.path_security import MATERIALS_SCAN_HARD_MAX_FILES
    from backend.services import materials_service as ms

    fake_files = [tmp_path / f"file_{i}.jpg" for i in range(200_000)]

    def fake_walk(root):
        yield from fake_files

    monkeypatch.setattr(ms, "_walk_root", fake_walk)
    monkeypatch.setattr(ms, "_ensure_schema", lambda: None)
    monkeypatch.setattr(ms, "get_materials_root", lambda: tmp_path)
    monkeypatch.setattr(ms, "_upsert_asset", lambda con, p, root: ("fake-id", False))
    class FakeCon:
        def commit(self): pass
        def close(self): pass
    monkeypatch.setattr(ms, "get_connection", lambda: FakeCon())

    result = ms.scan_root(max_files=None)
    assert result["scanned"] == MATERIALS_SCAN_HARD_MAX_FILES, (
        f"max_files=None 也必须被 cap 到 {MATERIALS_SCAN_HARD_MAX_FILES}, "
        f"实际扫了 {result['scanned']}"
    )
