"""朋友圈文案衍生:一个话题 → 3-5 条不同角度的朋友圈.

调 DeepSeek,返回 JSON [{type, text, emoji}].
"""
from __future__ import annotations

import json
import re
from typing import Any

from shortvideo.ai import get_ai_client


def derive_moments(
    topic: str,
    n: int = 5,
    kb_chunks: list[dict] | None = None,
    deep: bool = True,
) -> list[dict[str, Any]]:
    kb_block = ""
    if kb_chunks:
        kb_block = "\n\n【可参考的清华哥朋友圈金句/风格素材】\n" + "\n\n".join(
            f"[{c.get('title','')}] {c.get('text','')[:300]}" for c in kb_chunks[:4]
        )
    prompt = f"""你是清华哥朋友圈文案手。基于话题,出 {n} 条不同类型的朋友圈短文案(每条 30-120 字),
覆盖这些类型(按顺序):1.老板心法(干货金句)2.学员动态(案例见证)3.今日一句(犀利观点)
4.干货输出(方法论简版)5.生活感悟(人设真实)。朋友圈文案要:
- 短、有钩子、不唠叨
- 口语,不要"各位朋友""大家好"这种官腔
- 避开"你有没有发现""说个扎心真相"等老套开头
- 保留清华哥的标志性用词(如"碳基生物""割韭菜""漫灌时代")
{kb_block}

【今日话题】
{topic.strip()}

严格 JSON 数组:
[
  {{"type": "老板心法", "text": "朋友圈内容", "emoji": "💡"}},
  ...
]
"""
    ai = get_ai_client()
    r = ai.chat(prompt, max_tokens=1500, temperature=0.95, deep=deep)
    text = (r.text or "").strip()
    m = re.search(r"\[[\s\S]*\]", text)
    if not m:
        return [{"type": "raw", "text": text, "emoji": "📝"}]
    try:
        arr = json.loads(m.group(0))
        return [{"type": x.get("type", ""), "text": x.get("text", ""), "emoji": x.get("emoji", "💡")} for x in arr if isinstance(x, dict)]
    except Exception as e:
        return [{"type": "raw", "text": text, "emoji": "📝"}]
