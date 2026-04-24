"""公众号长文生成:选题 → 大纲 → 长文 → 排版.

- outline(topic): 生成 3-5 段大纲 [{h2, points[]}]
- expand(topic, outline, kb): 基于大纲 + 知识库,扩写成 2000+ 字长文(Markdown)
"""
from __future__ import annotations

import json
import re
from typing import Any

from shortvideo.ai import get_ai_client


def gen_outline(
    topic: str,
    kb_chunks: list[dict] | None = None,
    deep: bool = True,
) -> list[dict[str, Any]]:
    kb_block = ""
    if kb_chunks:
        kb_block = "\n\n【可参考的清华哥知识库素材】\n" + "\n\n".join(
            f"[{c.get('title','')}] {c.get('text','')[:250]}" for c in kb_chunks[:3]
        )
    prompt = f"""你是清华哥的公众号操盘手。基于选题,出一个 4-5 段的结构化大纲(适合 2000-3000 字的方法论长文)。

要求:
- 每一段有一个清晰的 H2 标题
- 每段 3-5 个 bullet 要点
- 整体逻辑链通顺(可按:痛点钩子 → 原理/方法 → 步骤/框架 → 案例 → 行动)
- 体现清华哥的标志性观点(如"割韭菜边界"、"碳基生物"、"漫灌时代"、"前后端一致")
{kb_block}

【选题】
{topic.strip()}

严格 JSON 数组:
[
  {{"h2": "小标题", "points": ["要点1", "要点2", "要点3"]}},
  ...
]
"""
    ai = get_ai_client()
    r = ai.chat(prompt, max_tokens=2000, temperature=0.8, deep=deep)
    text = (r.text or "").strip()
    m = re.search(r"\[[\s\S]*\]", text)
    if not m:
        return [{"h2": "raw", "points": [text[:200]]}]
    try:
        arr = json.loads(m.group(0))
        return [{"h2": x.get("h2", ""), "points": x.get("points", [])} for x in arr if isinstance(x, dict)]
    except Exception as e:
        return [{"h2": "raw", "points": [f"解析失败: {e}"]}]


def expand_article(
    topic: str,
    outline: list[dict[str, Any]],
    kb_chunks: list[dict] | None = None,
    deep: bool = True,
) -> dict[str, Any]:
    kb_block = ""
    if kb_chunks:
        kb_block = "\n\n【可引用的清华哥知识库素材(请自然融入,不生硬引用)】\n" + "\n\n".join(
            f"[{c.get('title','')}] {c.get('text','')[:500]}" for c in kb_chunks[:4]
        )
    outline_md = "\n".join(
        f"## {i+1}. {s.get('h2', '')}\n" + "\n".join(f"- {p}" for p in s.get("points", []))
        for i, s in enumerate(outline or [])
    )
    prompt = f"""你是清华哥的公众号长文操盘手。根据选题和大纲,写一篇 2000-3000 字的方法论长文,Markdown 格式。

写作要求:
- 开头一个钩子(不要"大家好""各位朋友")
- 标题 (# H1) 要犀利,不要温吞
- 每段 H2 下展开成完整段落,不要只是 bullet list 的罗列
- 保留清华哥口吻:犀利、反矫情、极度厌恶"割韭菜"、"假大空"
- 可以用标志性用词:"碳基生物"、"漫灌时代"、"割韭菜边界"、"前后端一致"、"降人工增算力"
- 结尾有行动号召(如"下一步怎么做")
{kb_block}

【选题】
{topic.strip()}

【大纲】
{outline_md}

直接输出 Markdown(包括 # H1 标题),不要加任何前言或解释:
"""
    ai = get_ai_client()
    r = ai.chat(prompt, max_tokens=4000, temperature=0.85, deep=deep)
    content = (r.text or "").strip()
    # 抽标题
    title_match = re.search(r"^#\s+(.+?)$", content, flags=re.MULTILINE)
    title = title_match.group(1).strip() if title_match else topic[:30]
    word_count = len(re.sub(r"[#*_`>\-\[\]()\s]", "", content))
    return {
        "title": title,
        "content": content,
        "word_count": word_count,
        "tokens": r.total_tokens,
    }
