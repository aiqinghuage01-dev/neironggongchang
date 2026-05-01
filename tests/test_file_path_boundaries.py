"""Phase 7 · 文件路径入口收紧测试.

收口 3 个 endpoint:
  POST /api/voice/upload        ≤50MB + 音频扩展名白名单
  POST /api/voice/clone         ref_path 必须在 data/audio/uploads or data/audio/samples
  POST /api/dreamina/batch-video ref_paths 必须在 DATA_DIR 白名单子目录

验:
- 拒绝 /etc/passwd, /Users/.../.env, .., ~ 起头, 不存在路径, 目录, NUL 字节
- 拒绝 symlink 跳出 DATA_DIR
- 合法路径通过
"""
from __future__ import annotations

import os
from pathlib import Path

import pytest


# ============================================================
# 单元层 path_security
# ============================================================

@pytest.fixture
def tmp_data_dir(tmp_path):
    """临时 DATA_DIR + 预置常用子目录和合法/越界文件."""
    d = tmp_path / "data"
    (d / "audio" / "uploads").mkdir(parents=True)
    (d / "audio" / "samples").mkdir(parents=True)
    (d / "dreamina" / "refs").mkdir(parents=True)
    (d / "image-gen").mkdir(parents=True)
    (d / "wechat-images").mkdir(parents=True)

    # 合法
    (d / "audio" / "uploads" / "ok.wav").write_bytes(b"WAVE_FAKE")
    (d / "audio" / "samples" / "old.mp3").write_bytes(b"MP3_FAKE")
    (d / "dreamina" / "refs" / "img.jpg").write_bytes(b"JPEG_FAKE")
    (d / "image-gen" / "g.png").write_bytes(b"PNG_FAKE")

    # 越界目标 (在 DATA_DIR 之外)
    outside = tmp_path / "outside_secret.wav"
    outside.write_bytes(b"SECRET")

    # symlink: data 内 → 外面 outside_secret.wav
    try:
        (d / "audio" / "uploads" / "evil_link.wav").symlink_to(outside)
    except (OSError, NotImplementedError):
        pass

    return {"data_dir": d, "outside": outside}


# ─── safe_local_path ─────────────────────────────────────────


def test_safe_local_path_rejects_etc_passwd(tmp_data_dir):
    from backend.services.path_security import (
        VOICE_CLONE_REF_ROOTS_REL, PathBoundaryError, safe_local_path,
    )
    with pytest.raises(PathBoundaryError):
        safe_local_path("/etc/passwd", VOICE_CLONE_REF_ROOTS_REL, tmp_data_dir["data_dir"])


def test_safe_local_path_rejects_user_dotfile(tmp_data_dir):
    from backend.services.path_security import (
        VOICE_CLONE_REF_ROOTS_REL, PathBoundaryError, safe_local_path,
    )
    with pytest.raises(PathBoundaryError):
        safe_local_path("/Users/black.chen/.env", VOICE_CLONE_REF_ROOTS_REL, tmp_data_dir["data_dir"])


def test_safe_local_path_rejects_tilde(tmp_data_dir):
    from backend.services.path_security import (
        VOICE_CLONE_REF_ROOTS_REL, PathBoundaryError, safe_local_path,
    )
    with pytest.raises(PathBoundaryError):
        safe_local_path("~/.ssh/id_rsa", VOICE_CLONE_REF_ROOTS_REL, tmp_data_dir["data_dir"])


def test_safe_local_path_rejects_dotdot(tmp_data_dir):
    from backend.services.path_security import (
        VOICE_CLONE_REF_ROOTS_REL, PathBoundaryError, safe_local_path,
    )
    # ../../etc/passwd from inside DATA_DIR — resolve 后跳出 → 拒
    raw = str(tmp_data_dir["data_dir"] / "audio" / "uploads" / ".." / ".." / ".." / "outside_secret.wav")
    with pytest.raises(PathBoundaryError):
        safe_local_path(raw, VOICE_CLONE_REF_ROOTS_REL, tmp_data_dir["data_dir"])


def test_safe_local_path_rejects_empty(tmp_data_dir):
    from backend.services.path_security import (
        VOICE_CLONE_REF_ROOTS_REL, PathBoundaryError, safe_local_path,
    )
    for raw in ["", "   ", None]:
        with pytest.raises(PathBoundaryError):
            safe_local_path(raw, VOICE_CLONE_REF_ROOTS_REL, tmp_data_dir["data_dir"])


def test_safe_local_path_rejects_nul_byte(tmp_data_dir):
    from backend.services.path_security import (
        VOICE_CLONE_REF_ROOTS_REL, PathBoundaryError, safe_local_path,
    )
    with pytest.raises(PathBoundaryError):
        safe_local_path("/etc/passwd\x00.wav", VOICE_CLONE_REF_ROOTS_REL, tmp_data_dir["data_dir"])


def test_safe_local_path_rejects_nonexistent(tmp_data_dir):
    from backend.services.path_security import (
        VOICE_CLONE_REF_ROOTS_REL, PathBoundaryError, safe_local_path,
    )
    raw = str(tmp_data_dir["data_dir"] / "audio" / "uploads" / "missing.wav")
    with pytest.raises(PathBoundaryError):
        safe_local_path(raw, VOICE_CLONE_REF_ROOTS_REL, tmp_data_dir["data_dir"])


def test_safe_local_path_rejects_directory(tmp_data_dir):
    from backend.services.path_security import (
        VOICE_CLONE_REF_ROOTS_REL, PathBoundaryError, safe_local_path,
    )
    raw = str(tmp_data_dir["data_dir"] / "audio" / "uploads")  # is dir
    with pytest.raises(PathBoundaryError):
        safe_local_path(raw, VOICE_CLONE_REF_ROOTS_REL, tmp_data_dir["data_dir"])


def test_safe_local_path_rejects_wrong_root(tmp_data_dir):
    """文件存在 + 在 DATA_DIR 内, 但不在白名单根 → 拒."""
    from backend.services.path_security import (
        VOICE_CLONE_REF_ROOTS_REL, PathBoundaryError, safe_local_path,
    )
    # voice clone 只允许 audio/uploads + audio/samples
    # image-gen 不在白名单
    raw = str(tmp_data_dir["data_dir"] / "image-gen" / "g.png")
    with pytest.raises(PathBoundaryError):
        safe_local_path(raw, VOICE_CLONE_REF_ROOTS_REL, tmp_data_dir["data_dir"])


def test_safe_local_path_rejects_symlink_escape(tmp_data_dir):
    """symlink 在白名单目录内, 但解析后指向外部 → 拒 (resolve 已解 symlink)."""
    from backend.services.path_security import (
        VOICE_CLONE_REF_ROOTS_REL, PathBoundaryError, safe_local_path,
    )
    link = tmp_data_dir["data_dir"] / "audio" / "uploads" / "evil_link.wav"
    if not link.is_symlink():
        pytest.skip("symlink 不可建")
    with pytest.raises(PathBoundaryError):
        safe_local_path(str(link), VOICE_CLONE_REF_ROOTS_REL, tmp_data_dir["data_dir"])


def test_safe_local_path_accepts_legit_uploads(tmp_data_dir):
    from backend.services.path_security import (
        VOICE_CLONE_REF_ROOTS_REL, safe_local_path,
    )
    raw = str(tmp_data_dir["data_dir"] / "audio" / "uploads" / "ok.wav")
    out = safe_local_path(raw, VOICE_CLONE_REF_ROOTS_REL, tmp_data_dir["data_dir"])
    assert out.exists() and out.is_file()
    assert out.name == "ok.wav"


def test_safe_local_path_accepts_legit_samples(tmp_data_dir):
    from backend.services.path_security import (
        VOICE_CLONE_REF_ROOTS_REL, safe_local_path,
    )
    raw = str(tmp_data_dir["data_dir"] / "audio" / "samples" / "old.mp3")
    out = safe_local_path(raw, VOICE_CLONE_REF_ROOTS_REL, tmp_data_dir["data_dir"])
    assert out.name == "old.mp3"


def test_safe_local_path_dreamina_accepts_image_gen(tmp_data_dir):
    """dreamina ref_paths 允许 image-gen/ (不是 voice clone 范围)."""
    from backend.services.path_security import (
        DREAMINA_REF_ROOTS_REL, safe_local_path,
    )
    raw = str(tmp_data_dir["data_dir"] / "image-gen" / "g.png")
    out = safe_local_path(raw, DREAMINA_REF_ROOTS_REL, tmp_data_dir["data_dir"])
    assert out.name == "g.png"


def test_safe_local_path_dreamina_rejects_audio(tmp_data_dir):
    """dreamina ref_paths 不允许 audio/ 下的."""
    from backend.services.path_security import (
        DREAMINA_REF_ROOTS_REL, PathBoundaryError, safe_local_path,
    )
    raw = str(tmp_data_dir["data_dir"] / "audio" / "uploads" / "ok.wav")
    with pytest.raises(PathBoundaryError):
        safe_local_path(raw, DREAMINA_REF_ROOTS_REL, tmp_data_dir["data_dir"])


# ─── check_upload_size_and_ext ───────────────────────────────


def test_check_upload_rejects_oversize():
    from backend.services.path_security import (
        VOICE_UPLOAD_ALLOWED_EXTS, PathBoundaryError, check_upload_size_and_ext,
    )
    data = b"x" * (51 * 1024 * 1024)  # 51 MB
    with pytest.raises(PathBoundaryError):
        check_upload_size_and_ext(data, "big.wav", 50 * 1024 * 1024, VOICE_UPLOAD_ALLOWED_EXTS)


def test_check_upload_rejects_empty():
    from backend.services.path_security import (
        VOICE_UPLOAD_ALLOWED_EXTS, PathBoundaryError, check_upload_size_and_ext,
    )
    with pytest.raises(PathBoundaryError):
        check_upload_size_and_ext(b"", "x.wav", 50 * 1024 * 1024, VOICE_UPLOAD_ALLOWED_EXTS)


def test_check_upload_rejects_bad_extension():
    from backend.services.path_security import (
        VOICE_UPLOAD_ALLOWED_EXTS, PathBoundaryError, check_upload_size_and_ext,
    )
    for filename in ["bad.exe", "bad.sh", "bad.py", "bad.txt", "no_ext", "evil.wav.exe"]:
        with pytest.raises(PathBoundaryError):
            check_upload_size_and_ext(b"X", filename, 50 * 1024 * 1024, VOICE_UPLOAD_ALLOWED_EXTS)


def test_check_upload_accepts_audio_ext():
    from backend.services.path_security import (
        VOICE_UPLOAD_ALLOWED_EXTS, check_upload_size_and_ext,
    )
    for filename in ["x.wav", "x.MP3", "x.M4A", "x.ogg", "x.flac", "x.opus", "x.webm"]:
        ext = check_upload_size_and_ext(b"X", filename, 50 * 1024 * 1024, VOICE_UPLOAD_ALLOWED_EXTS)
        assert ext.startswith(".") and ext == ext.lower()


# ============================================================
# 端到端 endpoint
# ============================================================

@pytest.fixture
def api_client_with_data(tmp_path, monkeypatch):
    """API TestClient + 临时 DATA_DIR + 预置文件."""
    d = tmp_path / "data"
    (d / "audio" / "uploads").mkdir(parents=True)
    (d / "audio" / "samples").mkdir(parents=True)
    (d / "dreamina" / "refs").mkdir(parents=True)
    (d / "image-gen").mkdir(parents=True)
    (d / "audio" / "uploads" / "real.wav").write_bytes(b"WAVE_OK")

    monkeypatch.setattr("shortvideo.config.DATA_DIR", d)
    monkeypatch.setattr("shortvideo.config.AUDIO_DIR", d / "audio")

    # patch admin guard 以免误 401
    monkeypatch.delenv("ADMIN_TOKEN", raising=False)
    monkeypatch.delenv("APP_ENV", raising=False)

    import importlib
    import backend.api as api_mod
    importlib.reload(api_mod)
    from fastapi.testclient import TestClient
    return TestClient(api_mod.app), d


def test_voice_upload_rejects_oversize(api_client_with_data):
    client, _ = api_client_with_data
    big = b"x" * (51 * 1024 * 1024)
    r = client.post("/api/voice/upload", files={"file": ("big.wav", big, "audio/wav")})
    assert r.status_code == 400
    assert "上限" in r.json().get("detail", "") or "太大" in r.json().get("detail", "")


def test_voice_upload_rejects_bad_ext(api_client_with_data):
    client, _ = api_client_with_data
    r = client.post("/api/voice/upload", files={"file": ("malware.exe", b"MZx", "application/x-msdownload")})
    assert r.status_code == 400


def test_voice_upload_accepts_legit_wav(api_client_with_data):
    client, _ = api_client_with_data
    r = client.post("/api/voice/upload", files={"file": ("ok.wav", b"WAVE_FAKE_DATA", "audio/wav")})
    assert r.status_code == 200, r.text


def test_voice_clone_rejects_etc_passwd(api_client_with_data):
    client, _ = api_client_with_data
    r = client.post(
        "/api/voice/clone",
        json={"text": "hello", "ref_path": "/etc/passwd"},
    )
    # 应 400 (ref_path 拒绝), 而不是 503 (CosyVoice 未就绪) - 路径校验在 sidecar 之前
    assert r.status_code == 400, f"应在 path 校验阶段 400, 实际 {r.status_code} {r.text}"
    assert "ref_path" in r.json().get("detail", "")


def test_voice_clone_rejects_outside_data(api_client_with_data, tmp_path):
    client, _ = api_client_with_data
    outside = tmp_path / "outside.wav"
    outside.write_bytes(b"X")
    r = client.post(
        "/api/voice/clone",
        json={"text": "hi", "ref_path": str(outside)},
    )
    assert r.status_code == 400


def test_voice_clone_rejects_image_gen_path(api_client_with_data):
    """voice clone 不允许 image-gen/ (audio/* 才行)."""
    client, data_dir = api_client_with_data
    (data_dir / "image-gen" / "x.png").write_bytes(b"PNG")
    r = client.post(
        "/api/voice/clone",
        json={"text": "hi", "ref_path": str(data_dir / "image-gen" / "x.png")},
    )
    assert r.status_code == 400


def test_dreamina_batch_rejects_outside_path(api_client_with_data, tmp_path):
    client, _ = api_client_with_data
    outside = tmp_path / "secret.png"
    outside.write_bytes(b"PNG")
    r = client.post(
        "/api/dreamina/batch-video",
        json={"prompts": ["test"], "ref_paths": [str(outside)]},
    )
    assert r.status_code == 400
    assert "ref_paths" in r.json().get("detail", "")


def test_dreamina_batch_rejects_etc_passwd(api_client_with_data):
    client, _ = api_client_with_data
    r = client.post(
        "/api/dreamina/batch-video",
        json={"prompts": ["test"], "ref_paths": ["/etc/passwd"]},
    )
    assert r.status_code == 400


def test_dreamina_batch_rejects_user_ssh_key(api_client_with_data):
    client, _ = api_client_with_data
    r = client.post(
        "/api/dreamina/batch-video",
        json={"prompts": ["test"], "ref_paths": ["/Users/black.chen/.ssh/id_rsa"]},
    )
    assert r.status_code == 400
