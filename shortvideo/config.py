"""集中读取 .env,提供全局配置对象。"""
from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")

DATA_DIR = ROOT / "data"
AUDIO_DIR = DATA_DIR / "audio"
VIDEO_DIR = DATA_DIR / "videos"
WORKS_DIR = DATA_DIR / "works"
DB_PATH = DATA_DIR / "works.db"
for p in (AUDIO_DIR / "samples", AUDIO_DIR / "generated", VIDEO_DIR, WORKS_DIR):
    p.mkdir(parents=True, exist_ok=True)


def _int_or_none(v: str | None) -> int | None:
    if v is None or v == "":
        return None
    try:
        return int(v)
    except ValueError:
        return None


@dataclass(frozen=True)
class Settings:
    shiliu_api_key: str
    shiliu_base_url: str
    deepseek_api_key: str
    deepseek_base_url: str
    deepseek_model: str
    default_avatar_id: int | None
    default_speaker_id: int | None
    qingdou_api_key: str
    qingdou_base_url: str
    apimart_api_key: str
    apimart_base_url: str


def load_settings() -> Settings:
    return Settings(
        shiliu_api_key=os.getenv("SHILIU_API_KEY", ""),
        shiliu_base_url=os.getenv("SHILIU_BASE_URL", "https://api.16ai.chat/api/v1"),
        deepseek_api_key=os.getenv("DEEPSEEK_API_KEY", ""),
        deepseek_base_url=os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com/v1"),
        deepseek_model=os.getenv("DEEPSEEK_MODEL", "deepseek-chat"),
        default_avatar_id=_int_or_none(os.getenv("DEFAULT_AVATAR_ID")),
        default_speaker_id=_int_or_none(os.getenv("DEFAULT_SPEAKER_ID")),
        qingdou_api_key=os.getenv("QINGDOU_API_KEY", ""),
        qingdou_base_url=os.getenv("QINGDOU_BASE_URL", "https://www.qingdou.vip/web/api"),
        apimart_api_key=os.getenv("APIMART_API_KEY", ""),
        apimart_base_url=os.getenv("APIMART_BASE_URL", "https://api.apimart.ai/v1"),
    )


settings = load_settings()
