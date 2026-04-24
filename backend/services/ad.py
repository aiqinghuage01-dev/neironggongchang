"""投流文案生成:批量出 5 版 · 自动点评.

调 DeepSeek,返回 JSON 数组 [{angle, copy, comment, score}].
"""
from __future__ import annotations

import json
import re
from typing import Any

from shortvideo.ai import get_ai_client


PLATFORM_HINTS = {
    "douyin":     "抖音信息流(竖版 · 3-7 秒完读 · 前 3 秒必须炸)",
    "shipinhao":  "视频号短文案(中年老板多 · 要稳重有料)",
    "moments":    "微信朋友圈广告(熟人感 · 不硬推)",
    "xhs":        "小红书笔记体(种草感 · 避免硬广)",
    "kuaishou":   "快手(同城 · 接地气)",
}


def generate_ad_batch(
    pitch: str,
    platform: str = "douyin",
    n: int = 5,
    kb_chunks: list[dict] | None = None,
    deep: bool = True,
) -> list[dict[str, Any]]:
    """一次出 n 版不同角度的投流文案 + 小华点评.

    deep: 深度理解业务(True=带完整人设,False=只带精简人设)。
    """
    platform_hint = PLATFORM_HINTS.get(platform, PLATFORM_HINTS["douyin"])
    kb_block = ""
    if kb_chunks:
        kb_block = "\n\n【可参考的清华哥业务素材】\n" + "\n\n".join(
            f"[{c.get('title','')}] {c.get('text','')[:400]}" for c in kb_chunks[:3]
        )
    prompt = f"""你是清华哥的投流文案专家。请基于下面的卖点,针对 {platform_hint} 这个渠道,
产出 {n} 版**不同角度**的短文案(50-120 字),并为每一版给出一句点评说明"适合谁/优势/风险"。
每一版角度不同:1.痛点型 2.好奇型 3.反常识型 4.数字型 5.场景型。{kb_block}

【卖点】
{pitch.strip()}

严格按下面 JSON 格式输出(不要加任何额外解释,直接返回 JSON):
[
  {{"angle": "痛点型", "copy": "文案内容", "comment": "为什么这版好/适合谁", "score": 85}},
  ...
]
"""
    ai = get_ai_client(route_key="ad.generate")
    r = ai.chat(prompt, max_tokens=2000, temperature=0.9, deep=deep)
    text = (r.text or "").strip()
    # 抠出 JSON 数组
    m = re.search(r"\[[\s\S]*\]", text)
    if not m:
        return [{"angle": "raw", "copy": text, "comment": "(未能 JSON 解析,请重试)", "score": 0}]
    try:
        arr = json.loads(m.group(0))
        return [{
            "angle": x.get("angle", ""),
            "copy": x.get("copy", ""),
            "comment": x.get("comment", ""),
            "score": int(x.get("score", 0)) if x.get("score") is not None else 0,
        } for x in arr if isinstance(x, dict)]
    except Exception as e:
        return [{"angle": "raw", "copy": text, "comment": f"解析失败: {e}", "score": 0}]
