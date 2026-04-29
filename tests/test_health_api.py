from __future__ import annotations

from fastapi.testclient import TestClient

from backend import api as api_mod


class _Credits:
    points = 123


class _FakeShiliuClient:
    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def get_credits(self):
        return _Credits()


class _FakeCosyVoice:
    def is_ready(self):
        return False


def test_health_uses_short_ai_probe(monkeypatch):
    calls = []

    def fake_get_ai_info(*, timeout=None, llm_max_retries=None):
        calls.append({"timeout": timeout, "llm_max_retries": llm_max_retries})
        return {"engine": "opus", "ok": False, "error": "timeout"}

    monkeypatch.setattr(api_mod, "ShiliuClient", _FakeShiliuClient)
    monkeypatch.setattr(api_mod, "CosyVoiceLocal", _FakeCosyVoice)
    monkeypatch.setattr(api_mod, "get_ai_info", fake_get_ai_info)

    r = TestClient(api_mod.app).get("/api/health")

    assert r.status_code == 200
    data = r.json()
    assert data["ok"] is True
    assert data["shiliu"] == {"ok": True, "points": 123}
    assert data["ai"]["engine"] == "opus"
    assert calls == [{"timeout": 3.0, "llm_max_retries": 0}]
