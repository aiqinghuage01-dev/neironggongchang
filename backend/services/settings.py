"""工厂设置:key-value 键值对存到 data/settings.json.

键值约定(前端配合):
  li_tone        : "friendly" | "sharp" | "pro"   - 小华语气
  li_proactive   : "low" | "medium" | "high"      - 小华主动性
  li_rewrite_default : "casual" | "pro" | "story" - 默认改写风格
  li_banned_words : "a,b,c"                        - 避讳词黑名单
  brand_primary  : "#2a6f4a"                       - 品牌主色
  brand_font     : "system" | "serif"              - 品牌字体
  platform_douyin_handle : "@清华哥聊私域"
  platform_shipinhao_handle / xhs_handle / wechat_handle / ...
  voice_default_speaker_id : 1860372128672998
  avatar_default_avatar_id : 123
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from shortvideo.config import DATA_DIR

SETTINGS_FILE = DATA_DIR / "settings.json"

# 默认值
DEFAULTS: dict[str, Any] = {
    "li_tone": "friendly",
    "li_proactive": "medium",
    "li_rewrite_default": "casual",
    "li_banned_words": "",
    "brand_primary": "#2a6f4a",
    "brand_font": "system",
    "platform_douyin_handle": "@清华哥聊私域",
    "platform_shipinhao_handle": "",
    "platform_xhs_handle": "",
    "platform_wechat_handle": "",
    "platform_kuaishou_handle": "",
    "voice_default_speaker_id": None,
    "avatar_default_avatar_id": None,
    # AI 引擎
    "ai_engine": "opus",          # opus | deepseek
    "opus_base_url": "http://localhost:3456/v1",
    "opus_api_key": "",           # 空值→使用 "not-needed" 哨兵
    "opus_model": "claude-opus-4-6",
    # 图引擎 (D-064 · 2026-04-26)
    "image_engine": "apimart",    # apimart (GPT-Image-2, 默认) | dreamina (即梦)
    "image_n_default": 2,          # 一次出几张候选 (cover / 朋友圈 / 段间图都用)
    # 调试可见性 (外测反馈, 默认隐藏)
    "show_api_status_light": False,  # 顶栏 GET /api/... · 30ms 调试条
    # D-067 行为记忆 + 偏好学习 (默认开 — 这是"越用越懂"的核心闭环)
    "work_log_enabled": True,        # 每次 AI 调用追加摘要到 ~/Desktop/清华哥知识库/.../小华工作日志.md
    "preference_learning_enabled": True,  # LiDock 对话抓"我喜欢/不要/记住"等关键词 → 写小华学到的偏好.md
}


def _load() -> dict[str, Any]:
    if not SETTINGS_FILE.exists():
        return dict(DEFAULTS)
    try:
        data = json.loads(SETTINGS_FILE.read_text(encoding="utf-8"))
    except Exception:
        return dict(DEFAULTS)
    out = dict(DEFAULTS)
    out.update({k: v for k, v in data.items() if k in DEFAULTS})
    return out


def _save(data: dict[str, Any]) -> None:
    SETTINGS_FILE.parent.mkdir(parents=True, exist_ok=True)
    SETTINGS_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def get_all() -> dict[str, Any]:
    return _load()


def update(patch: dict[str, Any]) -> dict[str, Any]:
    current = _load()
    for k, v in patch.items():
        if k in DEFAULTS:
            current[k] = v
    _save(current)
    return current


def reset() -> dict[str, Any]:
    _save(dict(DEFAULTS))
    return dict(DEFAULTS)
