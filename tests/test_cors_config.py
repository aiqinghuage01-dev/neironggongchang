"""Phase 2 · CORS 收口测试.

之前 backend/api.py 用 allow_origins=["*"], 公网恶意 origin 也能调本服务.
现在:
  dev 默认: localhost:8001 + 127.0.0.1:8001
  prod:    必须设 ALLOWED_ORIGIN, 不允许 "*"
"""

from __future__ import annotations

import importlib

import pytest
from fastapi.testclient import TestClient


# ============== 单元层: compute_allowed_origins ==============

def test_dev_default_returns_localhost(monkeypatch):
    monkeypatch.delenv("APP_ENV", raising=False)
    monkeypatch.delenv("ALLOWED_ORIGIN", raising=False)
    from backend.services.cors_config import compute_allowed_origins
    out = compute_allowed_origins()
    assert "http://localhost:8001" in out
    assert "http://127.0.0.1:8001" in out


def test_dev_explicit_returns_localhost(monkeypatch):
    monkeypatch.setenv("APP_ENV", "dev")
    monkeypatch.delenv("ALLOWED_ORIGIN", raising=False)
    from backend.services.cors_config import compute_allowed_origins
    out = compute_allowed_origins()
    assert "http://localhost:8001" in out
    assert "http://127.0.0.1:8001" in out


def test_dev_with_extra_appends(monkeypatch):
    monkeypatch.setenv("APP_ENV", "dev")
    monkeypatch.setenv("ALLOWED_ORIGIN", "https://staging.poju.ai")
    from backend.services.cors_config import compute_allowed_origins
    out = compute_allowed_origins()
    assert "http://localhost:8001" in out
    assert "https://staging.poju.ai" in out


def test_dev_strips_star(monkeypatch):
    monkeypatch.setenv("APP_ENV", "dev")
    monkeypatch.setenv("ALLOWED_ORIGIN", "https://a.com,*,https://b.com")
    from backend.services.cors_config import compute_allowed_origins
    out = compute_allowed_origins()
    assert "*" not in out
    assert "https://a.com" in out
    assert "https://b.com" in out


def test_prod_no_origin_raises(monkeypatch):
    monkeypatch.setenv("APP_ENV", "prod")
    monkeypatch.delenv("ALLOWED_ORIGIN", raising=False)
    from backend.services.cors_config import CorsConfigError, compute_allowed_origins
    with pytest.raises(CorsConfigError):
        compute_allowed_origins()


def test_prod_star_raises(monkeypatch):
    monkeypatch.setenv("APP_ENV", "prod")
    monkeypatch.setenv("ALLOWED_ORIGIN", "*")
    from backend.services.cors_config import CorsConfigError, compute_allowed_origins
    with pytest.raises(CorsConfigError):
        compute_allowed_origins()


def test_prod_star_in_list_raises(monkeypatch):
    monkeypatch.setenv("APP_ENV", "prod")
    monkeypatch.setenv("ALLOWED_ORIGIN", "https://a.com,*,https://b.com")
    from backend.services.cors_config import CorsConfigError, compute_allowed_origins
    with pytest.raises(CorsConfigError):
        compute_allowed_origins()


def test_prod_explicit_returns_only_listed(monkeypatch):
    monkeypatch.setenv("APP_ENV", "prod")
    monkeypatch.setenv("ALLOWED_ORIGIN", "https://gongchang.poju.ai")
    from backend.services.cors_config import compute_allowed_origins
    out = compute_allowed_origins()
    assert out == ["https://gongchang.poju.ai"]
    # prod 不再附带 dev 的 localhost
    assert "http://localhost:8001" not in out


def test_prod_multi_origin(monkeypatch):
    monkeypatch.setenv("APP_ENV", "prod")
    monkeypatch.setenv("ALLOWED_ORIGIN", "https://a.com, https://b.com ,https://c.com")
    from backend.services.cors_config import compute_allowed_origins
    out = compute_allowed_origins()
    assert out == ["https://a.com", "https://b.com", "https://c.com"]


# ============== 端到端: 真实 fastapi CORS 中间件 ==============

def _reload_app(monkeypatch):
    """patch env 后 reload api 模块, 确保 CORSMiddleware 用新配置."""
    import backend.api as api_mod
    importlib.reload(api_mod)
    return api_mod.app


def test_e2e_dev_localhost_allowed(monkeypatch):
    monkeypatch.delenv("APP_ENV", raising=False)
    monkeypatch.delenv("ALLOWED_ORIGIN", raising=False)
    app = _reload_app(monkeypatch)
    client = TestClient(app)
    # GET 带 Origin: http://localhost:8001 — 应回 ACAO header
    r = client.get("/api/health", headers={"Origin": "http://localhost:8001"})
    assert r.status_code == 200
    assert r.headers.get("access-control-allow-origin") == "http://localhost:8001"


def test_e2e_dev_evil_origin_no_acao(monkeypatch):
    monkeypatch.delenv("APP_ENV", raising=False)
    monkeypatch.delenv("ALLOWED_ORIGIN", raising=False)
    app = _reload_app(monkeypatch)
    client = TestClient(app)
    r = client.get("/api/health", headers={"Origin": "https://evil.example.com"})
    assert r.status_code == 200
    # 关键: 不允许 origin 时, ACAO header 应该不存在 (或不等于 evil)
    acao = r.headers.get("access-control-allow-origin")
    assert acao != "https://evil.example.com"
    assert acao != "*"


def test_e2e_no_star_anywhere(monkeypatch):
    """无论 dev 还是默认, 响应里都不能出现 ACAO: * (会让任何站点跨域)."""
    monkeypatch.delenv("APP_ENV", raising=False)
    monkeypatch.delenv("ALLOWED_ORIGIN", raising=False)
    app = _reload_app(monkeypatch)
    client = TestClient(app)
    for origin in ["https://evil.example.com", "http://random.test"]:
        r = client.get("/api/health", headers={"Origin": origin})
        acao = r.headers.get("access-control-allow-origin")
        assert acao != "*", f"ACAO=* 仍存在 for origin={origin}"


def test_e2e_prod_strict(monkeypatch):
    """prod 下 ALLOWED_ORIGIN=https://gongchang.poju.ai, evil origin 不放行."""
    monkeypatch.setenv("APP_ENV", "prod")
    monkeypatch.setenv("ALLOWED_ORIGIN", "https://gongchang.poju.ai")
    app = _reload_app(monkeypatch)
    client = TestClient(app)
    # 合法 origin 通过
    r = client.get("/api/health", headers={"Origin": "https://gongchang.poju.ai"})
    assert r.headers.get("access-control-allow-origin") == "https://gongchang.poju.ai"
    # evil 不通过
    r2 = client.get("/api/health", headers={"Origin": "https://evil.com"})
    assert r2.headers.get("access-control-allow-origin") not in ("*", "https://evil.com")


def test_e2e_prod_localhost_not_implicit(monkeypatch):
    """prod 不再隐式放本机 localhost."""
    monkeypatch.setenv("APP_ENV", "prod")
    monkeypatch.setenv("ALLOWED_ORIGIN", "https://gongchang.poju.ai")
    app = _reload_app(monkeypatch)
    client = TestClient(app)
    r = client.get("/api/health", headers={"Origin": "http://localhost:8001"})
    acao = r.headers.get("access-control-allow-origin")
    assert acao != "http://localhost:8001"
    assert acao != "*"


def test_e2e_preflight_options(monkeypatch):
    """OPTIONS preflight 也得用同套白名单."""
    monkeypatch.delenv("APP_ENV", raising=False)
    monkeypatch.delenv("ALLOWED_ORIGIN", raising=False)
    app = _reload_app(monkeypatch)
    client = TestClient(app)
    r = client.options(
        "/api/health",
        headers={
            "Origin": "http://localhost:8001",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "X-Admin-Token",
        },
    )
    # preflight 应回 200 且带 ACAO
    assert r.headers.get("access-control-allow-origin") == "http://localhost:8001"
    # 同样: evil preflight 不放行
    r2 = client.options(
        "/api/health",
        headers={
            "Origin": "https://evil.com",
            "Access-Control-Request-Method": "POST",
        },
    )
    assert r2.headers.get("access-control-allow-origin") not in ("*", "https://evil.com")
