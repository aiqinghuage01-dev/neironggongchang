"""Obsidian vault 只读访问 + 知识库匹配(供文案生成注入用).

vault 根:  ~/Desktop/清华哥知识库/
内容:     1200+ 条 Markdown(7 主分区 + 多个子分类)

能力:
  - build_tree(): 目录树
  - read_doc(rel): 单篇原文
  - search(q, k): 简单全文匹配(返回整篇)
  - match(q, k): 高级匹配 —— jieba 分词 + 按段落 chunk 评分 + 返回 Top K chunks
                 供「做视频文案页 / 投流 / 公众号 / 朋友圈」的 AI prompt 注入使用

索引策略:
  - 首次扫描 vault,为每个 .md 切分成 chunks(按 H2 / 空行分段,< 800 字)
  - 建内存倒排:token → [(doc_idx, chunk_idx, tf)]
  - 查询时:jieba 分词 query,累加每个 token 在每个 chunk 的 tf*idf,Top K
  - 监听 vault mtime,超过 60s 重建
"""
from __future__ import annotations

import math
import os
import re
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable

import jieba

KB_ROOT = Path(os.path.expanduser("~/Desktop/清华哥知识库"))

EXCLUDE_DIRS = {".obsidian", ".trash", ".git", "05 🔧 系统文件"}
EXCLUDE_FILES = {".DS_Store"}

# 常用停用词(防止"的了吗"占分)
STOP = set("的了吗呢啊吧也是就都在有个这那我你他她它们都和与或及从对把被为以到上下中能要会可会说".split())
# 太短的 token 丢弃
MIN_TOKEN = 2

# Section 权重 — 提炼度越高权重越高
# 07 Wiki 是核心已提炼,02 业务场景是实战,04 飞书档案馆是原料(大量原始转录)
SECTION_WEIGHT = {
    "07 📚 知识Wiki": 3.0,
    "02 📋 业务场景": 2.0,
    "01 🧠 底层资产": 1.6,
    "00 🤖 AI清华哥": 1.5,
    "06 📎 参考库": 1.2,
    "03 💡 灵感系统": 1.0,
    "04 📦 飞书档案馆": 0.35,   # 原料大量原始转录,降权
}
# 默认(extras 非标准分区)
DEFAULT_SECTION_WEIGHT = 0.4


def _relpath(p: Path) -> str:
    return str(p.relative_to(KB_ROOT))


def _safe(p: Path) -> bool:
    try:
        p.resolve().relative_to(KB_ROOT.resolve())
        return True
    except Exception:
        return False


# ─── 目录树(前端浏览用) ─────────────────────────────────
_tree_cache: dict[str, Any] = {}
_tree_cache_at = 0.0


def build_tree(refresh: bool = False) -> dict[str, Any]:
    global _tree_cache, _tree_cache_at
    if not refresh and _tree_cache and (time.time() - _tree_cache_at) < 60:
        return _tree_cache
    if not KB_ROOT.exists():
        return {"root": str(KB_ROOT), "sections": [], "extras": [], "total_docs": 0, "error": "vault 不存在"}

    sections, extras = [], []
    total = 0
    is_std = lambda name: re.match(r"^\d{2}\s", name) is not None
    for entry in sorted(KB_ROOT.iterdir()):
        if not entry.is_dir() or entry.name in EXCLUDE_DIRS:
            continue
        subs: dict[str, list] = {"(root)": []}
        for root, dirs, files in os.walk(entry):
            dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS]
            root_p = Path(root)
            rel_sub = str(root_p.relative_to(entry)) if root_p != entry else "(root)"
            docs_here = subs.setdefault(rel_sub, [])
            for fn in files:
                if fn in EXCLUDE_FILES or not fn.endswith(".md"):
                    continue
                p = root_p / fn
                try:
                    stat = p.stat()
                except OSError:
                    continue
                docs_here.append({
                    "path": _relpath(p),
                    "title": fn[:-3],
                    "mtime": int(stat.st_mtime),
                    "size": stat.st_size,
                })
                total += 1
        sub_list, count = [], 0
        for sub_name in sorted(subs.keys()):
            docs = subs[sub_name]
            if not docs and sub_name != "(root)":
                continue
            docs.sort(key=lambda d: -d["mtime"])
            sub_list.append({"name": sub_name, "docs": docs, "count": len(docs)})
            count += len(docs)
        if count == 0:
            continue
        item = {"name": entry.name, "doc_count": count, "subsections": sub_list, "standard": is_std(entry.name)}
        if is_std(entry.name):
            sections.append(item)
        else:
            extras.append(item)

    result = {"root": str(KB_ROOT), "sections": sections, "extras": extras, "total_docs": total}
    _tree_cache = result
    _tree_cache_at = time.time()
    return result


def read_doc(rel_path: str) -> dict[str, Any]:
    p = KB_ROOT / rel_path
    if not _safe(p) or not p.exists() or not p.is_file():
        raise FileNotFoundError(f"找不到:{rel_path}")
    text = p.read_text(encoding="utf-8", errors="replace")
    stat = p.stat()
    body = re.sub(r"^---\n[\s\S]*?\n---\n", "", text, count=1, flags=re.MULTILINE)
    summary = re.sub(r"[#*_`>\-\[\]()]", "", body).strip()[:200]
    return {
        "path": rel_path, "title": p.stem,
        "content": text, "summary": summary,
        "word_count": len(body), "mtime": int(stat.st_mtime),
    }


# ─── Chunk 索引(/api/kb/match 用) ───────────────────────
@dataclass
class Chunk:
    doc_path: str
    doc_title: str
    section: str
    chunk_idx: int
    heading: str    # 这个 chunk 所属 H2 小节(如"黄金五环","私域七段"),可空
    text: str


@dataclass
class Index:
    chunks: list[Chunk]
    token_df: dict[str, int]                  # token → doc 数量(IDF 用)
    token_chunks: dict[str, list[tuple[int, int]]]  # token → [(chunk_idx, tf)]
    built_at: float


_index: Index | None = None


def _split_chunks(text: str, max_len: int = 800) -> list[tuple[str, str]]:
    """把一篇 md 切成 [(heading, chunk_text)] —— 按 H2/H3 + 空行切."""
    text = re.sub(r"^---\n[\s\S]*?\n---\n", "", text, count=1, flags=re.MULTILINE)
    # 按 H2/H3 划节
    parts = re.split(r"(\n#{2,3}\s[^\n]+)", text)
    chunks: list[tuple[str, str]] = []
    current_heading = ""
    buf = ""
    for p in parts:
        if re.match(r"\n#{2,3}\s", p):
            if buf.strip():
                chunks.append((current_heading, buf.strip()))
            current_heading = p.strip().lstrip("#").strip()
            buf = ""
        else:
            buf += p
    if buf.strip():
        chunks.append((current_heading, buf.strip()))

    # 超长的再按空行切
    out: list[tuple[str, str]] = []
    for head, body in chunks:
        if len(body) <= max_len:
            out.append((head, body))
        else:
            paras = re.split(r"\n\s*\n", body)
            cur = ""
            for p in paras:
                if len(cur) + len(p) > max_len and cur:
                    out.append((head, cur.strip()))
                    cur = p
                else:
                    cur = (cur + "\n\n" + p) if cur else p
            if cur.strip():
                out.append((head, cur.strip()))
    return [x for x in out if len(x[1]) >= 40]  # 太短的扔掉


def _tokenize(text: str) -> list[str]:
    tokens = [t for t in jieba.lcut(text.lower()) if t.strip() and t not in STOP and len(t) >= MIN_TOKEN]
    # 去重保序
    seen = set()
    out = []
    for t in tokens:
        if t not in seen:
            seen.add(t); out.append(t)
    return out


def build_index(force: bool = False) -> Index:
    global _index
    if _index and not force and (time.time() - _index.built_at) < 600:
        return _index

    tree = build_tree(refresh=True)
    chunks: list[Chunk] = []
    token_df: dict[str, int] = {}
    token_chunks: dict[str, list[tuple[int, int]]] = {}

    all_sections = tree["sections"] + tree.get("extras", [])
    for section in all_sections:
        for sub in section["subsections"]:
            for d in sub["docs"]:
                p = KB_ROOT / d["path"]
                try:
                    txt = p.read_text(encoding="utf-8", errors="replace")
                except OSError:
                    continue
                for head, ctext in _split_chunks(txt):
                    idx = len(chunks)
                    chunks.append(Chunk(
                        doc_path=d["path"], doc_title=d["title"],
                        section=section["name"], chunk_idx=idx,
                        heading=head, text=ctext,
                    ))
                    # 索引 token(每个 token 只算一次 doc 出现)
                    toks = _tokenize(ctext + "\n" + d["title"] + "\n" + head)
                    for t in toks:
                        token_df[t] = token_df.get(t, 0) + 1
                        tf = ctext.lower().count(t) + 1
                        token_chunks.setdefault(t, []).append((idx, tf))

    _index = Index(chunks=chunks, token_df=token_df, token_chunks=token_chunks, built_at=time.time())
    return _index


def match(query: str, k: int = 5, min_score: float = 0.5) -> list[dict[str, Any]]:
    """返回 Top K chunks(供 AI prompt 注入)."""
    idx = build_index()
    if not query.strip():
        return []
    q_tokens = _tokenize(query)
    if not q_tokens:
        return []
    total = max(1, len(idx.chunks))
    scores: dict[int, float] = {}
    for t in q_tokens:
        df = idx.token_df.get(t, 0)
        if df == 0:
            continue
        idf = math.log(total / (1 + df))
        for ci, tf in idx.token_chunks.get(t, []):
            section = idx.chunks[ci].section
            weight = SECTION_WEIGHT.get(section, DEFAULT_SECTION_WEIGHT)
            scores[ci] = scores.get(ci, 0) + idf * math.log(1 + tf) * weight

    if not scores:
        return []
    top = sorted(scores.items(), key=lambda x: -x[1])[:k * 2]
    results = []
    seen_docs = set()
    for ci, score in top:
        if score < min_score:
            continue
        c = idx.chunks[ci]
        # 同一 doc 只取最高分的一个 chunk
        if c.doc_path in seen_docs:
            continue
        seen_docs.add(c.doc_path)
        results.append({
            "path": c.doc_path, "title": c.doc_title,
            "section": c.section, "heading": c.heading,
            "score": round(score, 2),
            "text": c.text,
            "preview": c.text[:180].replace("\n", " "),
        })
        if len(results) >= k:
            break
    return results


# ─── search 保留(整篇匹配,供搜索框用) ──────────────────
def search(query: str, k: int = 8) -> list[dict[str, Any]]:
    q_tokens = _tokenize(query)
    if not q_tokens:
        return []
    tree = build_tree()
    scored = []
    for section in tree["sections"] + tree.get("extras", []):
        for sub in section["subsections"]:
            for d in sub["docs"]:
                p = KB_ROOT / d["path"]
                try:
                    text = p.read_text(encoding="utf-8", errors="replace")
                except OSError:
                    continue
                title = d["title"].lower()
                body = text.lower()
                score = 0
                for t in q_tokens:
                    if t in title:
                        score += 10
                    score += body.count(t)
                if score > 0:
                    scored.append({
                        "path": d["path"], "title": d["title"],
                        "section": section["name"], "subsection": sub["name"],
                        "score": score,
                        "preview": text[:160].replace("\n", " ").strip(),
                    })
    scored.sort(key=lambda x: -x["score"])
    return scored[:k]
