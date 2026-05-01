"""Phase 3 · ADMIN_TOKEN 写操作保护测试.

后端启用 ADMIN_TOKEN 后:
  - 写方法 (POST/PUT/PATCH/DELETE) 必须带 X-Admin-Token, 否则 401.
  - 读方法 (GET/HEAD/OPTIONS) 不变.
  - 白名单路径 (/api/health /docs /media /skills) 不变.

未启用 ADMIN_TOKEN 时不影响本地旧行为.
"""

from __future__ import annotations

import importlib

import pytest
from fastapi.testclient import TestClient


# ============== 单元层: admin_auth ==============

def test_get_admin_token_unset(monkeypatch):
    monkeypatch.delenv("ADMIN_TOKEN", raising=False)
    from backend.services.admin_auth import get_admin_token
    assert get_admin_token() is None


def test_get_admin_token_empty_string(monkeypatch):
    monkeypatch.setenv("ADMIN_TOKEN", "")
    from backend.services.admin_auth import get_admin_token
    assert get_admin_token() is None


def test_get_admin_token_whitespace(monkeypatch):
    monkeypatch.setenv("ADMIN_TOKEN", "   ")
    from backend.services.admin_auth import get_admin_token
    assert get_admin_token() is None


def test_get_admin_token_set(monkeypatch):
    monkeypatch.setenv("ADMIN_TOKEN", "secret-tok")
    from backend.services.admin_auth import get_admin_token
    assert get_admin_token() == "secret-tok"


def test_request_needs_admin_get_method():
    from backend.services.admin_auth import request_needs_admin
    assert request_needs_admin("GET", "/api/works") is False
    assert request_needs_admin("HEAD", "/api/works") is False
    assert request_needs_admin("OPTIONS", "/api/works") is False


def test_request_needs_admin_post_method():
    from backend.services.admin_auth import request_needs_admin
    assert request_needs_admin("POST", "/api/settings") is True
    assert request_needs_admin("PUT", "/api/x") is True
    assert request_needs_admin("PATCH", "/api/night/jobs/1") is True
    assert request_needs_admin("DELETE", "/api/works/1") is True


def test_request_needs_admin_read_methods_always_unprotected():
    """Phase 3 review (P3-5): GET/HEAD/OPTIONS 无视路径都 False (天然只读)."""
    from backend.services.admin_auth import request_needs_admin
    for path in ("/api/health", "/api/works", "/media/videos/x.mp4",
                 "/docs", "/openapi.json", "/skills/dhv5/outputs/x",
                 "/api/settings", "/anything/else"):
        assert request_needs_admin("GET", path) is False, f"GET {path}"
        assert request_needs_admin("HEAD", path) is False, f"HEAD {path}"
        assert request_needs_admin("OPTIONS", path) is False, f"OPTIONS {path}"


def test_request_needs_admin_write_methods_always_protected():
    """Phase 3 review (P3-5): POST/PUT/PATCH/DELETE 无视路径都 True.

    历史 UNPROTECTED_PATH_PREFIXES 让 /media /skills /docs 下的 POST 也绕过 —
    当前没写路由, 但 future footgun. 现在收死: 写方法默认全要 token.
    """
    from backend.services.admin_auth import request_needs_admin
    for path in ("/media/videos/x.mp4", "/skills/dhv5/outputs/x",
                 "/docs", "/openapi.json", "/api/health",
                 "/api/settings", "/api/works/123"):
        assert request_needs_admin("POST", path) is True, f"POST {path}"
        assert request_needs_admin("PUT", path) is True, f"PUT {path}"
        assert request_needs_admin("PATCH", path) is True, f"PATCH {path}"
        assert request_needs_admin("DELETE", path) is True, f"DELETE {path}"


def test_request_needs_admin_lowercase_method():
    """request.method 通常大写, 防御小写也行."""
    from backend.services.admin_auth import request_needs_admin
    assert request_needs_admin("post", "/api/settings") is True


def test_verify_admin_token_correct():
    from backend.services.admin_auth import verify_admin_token
    assert verify_admin_token("abc", "abc") is True


def test_verify_admin_token_wrong():
    from backend.services.admin_auth import verify_admin_token
    assert verify_admin_token("wrong", "abc") is False


def test_verify_admin_token_empty():
    from backend.services.admin_auth import verify_admin_token
    assert verify_admin_token("", "abc") is False
    assert verify_admin_token(None, "abc") is False
    assert verify_admin_token("abc", None) is False
    assert verify_admin_token(None, None) is False


# ============== 端到端 middleware ==============

def _reload_app(monkeypatch):
    """patch env 后 reload api 模块, 确保 middleware 用新配置."""
    import backend.api as api_mod
    importlib.reload(api_mod)
    return api_mod.app


def test_e2e_token_unset_post_works(monkeypatch):
    """ADMIN_TOKEN 未设, POST 不需要 token 也能跑 (本地旧行为)."""
    monkeypatch.delenv("ADMIN_TOKEN", raising=False)
    monkeypatch.delenv("APP_ENV", raising=False)
    app = _reload_app(monkeypatch)
    client = TestClient(app)
    # 选一个无副作用的 POST: /api/preferences/toggle, 不带 token 应该不被中断 (即使 endpoint 自己 4xx 也不能是 401 admin reason)
    r = client.post("/api/preferences/toggle", json={"enable": False})
    # 关键: 不能是 401 admin token required
    if r.status_code == 401:
        body = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
        assert body.get("detail") != "admin token required"


def test_e2e_token_set_post_no_header_401(monkeypatch):
    """ADMIN_TOKEN 设了, POST 不带 X-Admin-Token → 401."""
    monkeypatch.setenv("ADMIN_TOKEN", "test-secret-token")
    monkeypatch.delenv("APP_ENV", raising=False)
    app = _reload_app(monkeypatch)
    client = TestClient(app)
    r = client.post("/api/settings", json={"foo": "bar"})
    assert r.status_code == 401
    assert r.json().get("detail") == "admin token required"


def test_e2e_token_set_post_wrong_token_401(monkeypatch):
    monkeypatch.setenv("ADMIN_TOKEN", "test-secret-token")
    monkeypatch.delenv("APP_ENV", raising=False)
    app = _reload_app(monkeypatch)
    client = TestClient(app)
    r = client.post(
        "/api/settings",
        json={"foo": "bar"},
        headers={"X-Admin-Token": "wrong-token"},
    )
    assert r.status_code == 401
    assert r.json().get("detail") == "admin token required"


def test_e2e_token_set_post_correct_token_passes(monkeypatch):
    """正确 token 通过 middleware → 落到原 handler (handler 可以再返自己的 4xx, 但不应该是 admin 401)."""
    monkeypatch.setenv("ADMIN_TOKEN", "test-secret-token")
    monkeypatch.delenv("APP_ENV", raising=False)
    app = _reload_app(monkeypatch)
    client = TestClient(app)
    r = client.post(
        "/api/settings",
        json={"foo": "bar"},
        headers={"X-Admin-Token": "test-secret-token"},
    )
    # 核心: 不能是 401 admin reason
    if r.status_code == 401:
        body = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
        assert body.get("detail") != "admin token required"


def test_e2e_token_set_get_no_token_passes(monkeypatch):
    """ADMIN_TOKEN 设了, GET 不带 token 仍能读 (读不保护)."""
    monkeypatch.setenv("ADMIN_TOKEN", "test-secret-token")
    monkeypatch.delenv("APP_ENV", raising=False)
    app = _reload_app(monkeypatch)
    client = TestClient(app)
    r = client.get("/api/health")
    assert r.status_code == 200


def test_e2e_token_set_health_post_now_requires_token(monkeypatch):
    """Phase 3 review (P3-5): POST /api/health 不再豁免, 401.

    历史: UNPROTECTED_PATH_PREFIXES 让 /api/health 任何方法都不要 token.
    现在收: GET /api/health 不要 token (test_e2e_token_set_get_no_token_passes
    覆盖), POST 默认要 (这里覆盖). 防 future footgun.
    """
    monkeypatch.setenv("ADMIN_TOKEN", "test-secret-token")
    monkeypatch.delenv("APP_ENV", raising=False)
    app = _reload_app(monkeypatch)
    client = TestClient(app)
    r = client.post("/api/health")
    assert r.status_code == 401
    assert r.json().get("detail") == "admin token required"


def test_e2e_token_set_delete_works_no_token_401(monkeypatch):
    """删作品也要 token."""
    monkeypatch.setenv("ADMIN_TOKEN", "test-secret-token")
    monkeypatch.delenv("APP_ENV", raising=False)
    app = _reload_app(monkeypatch)
    client = TestClient(app)
    r = client.delete("/api/works/999")
    assert r.status_code == 401
    assert r.json().get("detail") == "admin token required"


def test_e2e_token_set_voice_clone_no_token_401(monkeypatch):
    """/api/voice/clone 在保护范围."""
    monkeypatch.setenv("ADMIN_TOKEN", "test-secret-token")
    monkeypatch.delenv("APP_ENV", raising=False)
    app = _reload_app(monkeypatch)
    client = TestClient(app)
    r = client.post("/api/voice/clone", json={
        "text": "x", "ref_path": "/tmp/x.mp3",
    })
    assert r.status_code == 401


def test_e2e_token_set_dreamina_no_token_401(monkeypatch):
    """/api/dreamina/* 在保护范围."""
    monkeypatch.setenv("ADMIN_TOKEN", "test-secret-token")
    monkeypatch.delenv("APP_ENV", raising=False)
    app = _reload_app(monkeypatch)
    client = TestClient(app)
    r = client.post("/api/dreamina/text2image", json={"prompt": "x"})
    assert r.status_code == 401


def test_e2e_token_set_tasks_cancel_no_token_401(monkeypatch):
    """/api/tasks/{id}/cancel 在保护范围."""
    monkeypatch.setenv("ADMIN_TOKEN", "test-secret-token")
    monkeypatch.delenv("APP_ENV", raising=False)
    app = _reload_app(monkeypatch)
    client = TestClient(app)
    r = client.post("/api/tasks/some-id/cancel")
    assert r.status_code == 401


def test_e2e_token_set_options_passes(monkeypatch):
    """OPTIONS preflight 不需要 token (浏览器 SOP)."""
    monkeypatch.setenv("ADMIN_TOKEN", "test-secret-token")
    monkeypatch.delenv("APP_ENV", raising=False)
    app = _reload_app(monkeypatch)
    client = TestClient(app)
    r = client.options(
        "/api/settings",
        headers={
            "Origin": "http://localhost:8001",
            "Access-Control-Request-Method": "POST",
        },
    )
    # OPTIONS 不应该被 admin guard 401
    assert r.status_code != 401
