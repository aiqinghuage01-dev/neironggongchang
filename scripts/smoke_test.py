"""Smoke test: verify all three services (Shiliu, DeepSeek) are reachable.

Run: python scripts/smoke_test.py
"""
import os
import sys
import json
from pathlib import Path

import httpx
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")

SHILIU_KEY = os.getenv("SHILIU_API_KEY")
SHILIU_URL = os.getenv("SHILIU_BASE_URL")
DS_KEY = os.getenv("DEEPSEEK_API_KEY")
DS_URL = os.getenv("DEEPSEEK_BASE_URL")
DS_MODEL = os.getenv("DEEPSEEK_MODEL", "deepseek-chat")


def fmt(title: str, ok: bool, detail: str = "") -> str:
    tag = "[PASS]" if ok else "[FAIL]"
    return f"{tag} {title}  {detail}"


def shiliu_post(endpoint: str, data: dict | None = None) -> dict:
    headers = {
        "Accept": "application/json",
        "Authorization": f"Bearer {SHILIU_KEY}",
        "Content-Type": "application/json",
    }
    r = httpx.post(f"{SHILIU_URL}/{endpoint}", headers=headers, json=data or {}, timeout=20.0)
    r.raise_for_status()
    return r.json()


def test_shiliu_credits() -> tuple[bool, str]:
    try:
        data = shiliu_post("asset/get")
        if data.get("code") == 0:
            d = data.get("data") or {}
            return True, f"points={d.get('validPoint')} validTo={d.get('validToTime')} avatars={d.get('availableAvatar')} speakers={d.get('availableSpeaker')}"
        return False, f"code={data.get('code')} msg={data.get('msg')}"
    except Exception as e:
        return False, f"{type(e).__name__}: {e}"


def test_shiliu_avatars() -> tuple[bool, str]:
    try:
        data = shiliu_post("avatar/list")
        if data.get("code") == 0:
            avs = data.get("data") or []
            return True, f"count={len(avs)}  sample={avs[:3]}"
        return False, f"code={data.get('code')} msg={data.get('msg')}"
    except Exception as e:
        return False, f"{type(e).__name__}: {e}"


def test_shiliu_speakers() -> tuple[bool, str]:
    try:
        data = shiliu_post("speaker/list")
        if data.get("code") == 0:
            sps = data.get("data") or []
            return True, f"count={len(sps)}  sample={sps[:3]}"
        return False, f"code={data.get('code')} msg={data.get('msg')}"
    except Exception as e:
        return False, f"{type(e).__name__}: {e}"


def test_deepseek_chat() -> tuple[bool, str]:
    try:
        headers = {"Authorization": f"Bearer {DS_KEY}", "Content-Type": "application/json"}
        payload = {
            "model": DS_MODEL,
            "messages": [{"role": "user", "content": "一句话回答:今天天气如何?不超过10字"}],
            "max_tokens": 30,
            "temperature": 0.3,
        }
        r = httpx.post(f"{DS_URL}/chat/completions", headers=headers, json=payload, timeout=30.0)
        r.raise_for_status()
        data = r.json()
        content = data["choices"][0]["message"]["content"]
        usage = data.get("usage", {})
        return True, f"reply='{content.strip()}'  tokens={usage.get('total_tokens')}"
    except Exception as e:
        return False, f"{type(e).__name__}: {e}"


def main():
    results = []
    print("=" * 70)
    print("ShortVideo Studio · Smoke Test")
    print("=" * 70)

    ok, d = test_shiliu_credits()
    print(fmt("石榴 · 余额查询", ok, d))
    results.append(ok)

    ok, d = test_shiliu_avatars()
    print(fmt("石榴 · Avatar 列表", ok, d))
    results.append(ok)

    ok, d = test_shiliu_speakers()
    print(fmt("石榴 · Speaker 列表", ok, d))
    results.append(ok)

    ok, d = test_deepseek_chat()
    print(fmt("DeepSeek · Chat 完成", ok, d))
    results.append(ok)

    print("=" * 70)
    passed = sum(results)
    total = len(results)
    print(f"Result: {passed}/{total} passed")
    sys.exit(0 if passed == total else 1)


if __name__ == "__main__":
    main()
