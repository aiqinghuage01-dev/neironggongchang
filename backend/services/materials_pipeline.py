"""素材库 AI 打标 pipeline (D-087 Day 2).

策略 (清华哥要求 "基于老板业务打推荐标签进行分类"):
1. 主路径: 文本 LLM 打标 (filename + rel_folder + 文件类型 + 尺寸/时长)
   - 走 shortvideo.ai.get_ai_client 关卡层 (D-086 SYSTEM-CONSTRAINTS §2 严守)
   - 注入清华哥业务上下文 (deep=True 全量人设)
   - 自动 retry / usage 打点 / 错误友好化
2. 兜底路径: 文件名启发式 (LLM 失败时降级)
   - 不烧 credits, 关键词匹配
3. **未来**: vision 接 OpenClaw image_url, follow-up commit 加

核心约束:
- DB 写入走 D-086 单一连接抽象 (shortvideo.db.get_connection)
- 错误绝不裸抛 (走 D-082c llm_retry 自动 1 次, 仍失败兜底启发式)
- mock 测试覆盖 (清华哥 "细致" 要求, 真烧 credits 仅探活 1-2 次)
"""
from __future__ import annotations

import json
import logging
import re
import sqlite3
import time
from contextlib import closing
from typing import Any

from backend.services import materials_service as ms
from backend.services.migrations import apply_migrations
from shortvideo.db import get_connection

log = logging.getLogger("materials_pipeline")


# ─── 业务分类候选 (PRD §2.1) ─────────────────────────────

KNOWN_FOLDERS = [
    "00 讲台高光",
    "01 板书课件",
    "02 学员互动",
    "03 走位空镜",
    "04 海报封面",
    "05 BGM 音效",
    "06 金句库",
    "07 爆款档案",
]


# ─── 启发式 (兜底, 不烧 credits) ────────────────────────

# 关键词 → 标签映射 (按清华哥业务上下文)
_HEURISTIC_KEYWORDS: dict[str, list[str]] = {
    "讲台": ["讲台", "讲课"],
    "提问": ["提问", "互动"],
    "板书": ["板书", "课件"],
    "学员": ["学员", "互动"],
    "笑": ["大笑", "讲台高光"],
    "致谢": ["致谢", "讲台高光"],
    "金句": ["金句"],
    "走位": ["走位", "空镜"],
    "海报": ["海报", "封面"],
    "封面": ["封面"],
    "直播": ["直播"],
    "互动": ["互动"],
    "logo": ["logo", "品牌"],
    "ppt": ["课件"],
    "拍照": ["合影"],
    "合影": ["合影"],
    "签名": ["签名"],
    "签到": ["签到"],
    "现场": ["现场"],
    "短视频": ["短视频"],
    "录屏": ["录屏"],
    "screen": ["录屏"],
    "rec": ["录屏"],
    "screenshot": ["截图"],
    "iphone": ["手机拍"],
    "ios": ["手机拍"],
    "android": ["手机拍"],
}

# 关键词 → 文件夹建议
_HEURISTIC_FOLDER: dict[str, str] = {
    "讲台": "00 讲台高光",
    "提问": "00 讲台高光",
    "笑": "00 讲台高光",
    "致谢": "00 讲台高光",
    "板书": "01 板书课件",
    "ppt": "01 板书课件",
    "课件": "01 板书课件",
    "学员": "02 学员互动",
    "互动": "02 学员互动",
    "走位": "03 走位空镜",
    "海报": "04 海报封面",
    "封面": "04 海报封面",
    "金句": "06 金句库",
    "logo": "04 海报封面",
}


def _filename_heuristic(asset: dict[str, Any]) -> dict[str, Any]:
    """文件名启发式打标 (LLM 失败兜底).

    返回 {tags, folder, is_new, reason} 与 LLM 路径同 schema.
    """
    text = ((asset.get("filename") or "") + " " + (asset.get("rel_folder") or "")).lower()
    tags: list[str] = []
    folder_vote: dict[str, int] = {}
    for kw, kw_tags in _HEURISTIC_KEYWORDS.items():
        if kw in text:
            for t in kw_tags:
                if t not in tags:
                    tags.append(t)
            f = _HEURISTIC_FOLDER.get(kw)
            if f:
                folder_vote[f] = folder_vote.get(f, 0) + 1
    # 视频 / 图片标签
    ext = asset.get("ext") or ""
    if ext in ms.VIDEO_EXTS:
        if "短视频" not in tags and asset.get("duration_sec") and asset["duration_sec"] < 90:
            tags.append("短视频")
        elif "录屏" not in tags and asset.get("duration_sec") and asset["duration_sec"] >= 600:
            tags.append("长视频")
    # 选投票最多的 folder
    folder = None
    if folder_vote:
        folder = max(folder_vote.items(), key=lambda x: x[1])[0]
    return {
        "tags": tags or ["未分类"],
        "folder": folder,
        "is_new": False,
        "reason": "文件名启发式 (无 AI)",
    }


# ─── LLM prompt ──────────────────────────────────────────


def _build_prompt(asset: dict[str, Any]) -> str:
    """根据素材元数据 + 上下文构建 LLM prompt."""
    ext = asset.get("ext") or ""
    is_video = ext in ms.VIDEO_EXTS
    asset_type = "视频" if is_video else "图片"
    dim_str = ""
    if asset.get("width") and asset.get("height"):
        dim_str = f"{asset['width']}×{asset['height']}"
    dur_str = ""
    if asset.get("duration_sec"):
        s = float(asset["duration_sec"])
        dur_str = f"{int(s // 60)}分{int(s % 60)}秒" if s >= 60 else f"{int(s)}秒"
    folder_choices = " / ".join(KNOWN_FOLDERS)
    return f"""你在帮清华哥整理素材库. 给一条素材打标签 + 判断要不要换归档位置.

素材信息:
- 文件名: {asset.get('filename', '')}
- 当前位置: {asset.get('rel_folder') or '(根目录)'}
- 类型: {asset_type}
- 后缀: {ext}
{f'- 尺寸: {dim_str}' if dim_str else ''}
{f'- 时长: {dur_str}' if dur_str else ''}

清华哥的业务分区候选 (优先从中选, 不强制):
{folder_choices}

任务:
1. 从文件名 / 路径 / 元数据推测内容, 输出 5-10 个具体的中文标签
2. 判断"当前位置"是不是合理:
   - 如果当前位置已经合理 (业务上下文匹配, 哪怕不在 8 个分区里), 设 no_move=true, folder 留空, confidence 给你判断的把握
   - 只有"明显错位置"且高置信时, no_move=false, folder=建议位置, is_new=true/false
3. confidence ∈ [0, 1] 表示你对"是否换位置"这个建议的把握. 不确定的时候必须 < 0.75 (老板只看高置信建议)
4. 一句话理由

宁可保守 — confidence 低就 no_move=true 让素材原地待着. 老板没空审 1000+ 条无意义的归档建议.

**严格 JSON 输出 (不加前言, 不加 markdown 代码块包裹)**:
{{
  "tags": ["标签1", "标签2", ...],
  "no_move": true,
  "folder": null,
  "is_new": false,
  "confidence": 0.4,
  "reason": "..."
}}
或者 (明显要搬, 高置信):
{{
  "tags": [...],
  "no_move": false,
  "folder": "04 海报封面",
  "is_new": false,
  "confidence": 0.85,
  "reason": "..."
}}"""


def _parse_llm_json(text: str) -> dict[str, Any] | None:
    """从 LLM 文本提取 JSON. 失败返 None.

    AI 偶尔输出会带 markdown ``` 包裹 / 前言 / 注释, 用宽松正则.
    """
    if not text:
        return None
    # 去掉 markdown code fence
    cleaned = re.sub(r"```(?:json)?\n?", "", text).strip()
    cleaned = cleaned.rstrip("`").strip()
    # 找第一个 { ... } 块
    m = re.search(r"\{[\s\S]*\}", cleaned)
    if not m:
        return None
    try:
        obj = json.loads(m.group(0))
        if not isinstance(obj, dict):
            return None
        return obj
    except Exception:
        return None


def _normalize_llm_result(obj: dict[str, Any]) -> dict[str, Any]:
    """LLM 返回值规范化 + 字段清理.

    B'-3: 加 confidence + no_move 解析. confidence 缺省/非数 → 0.5 (中等).
    no_move 默认 False (向后兼容旧 prompt 输出).
    """
    tags = obj.get("tags") or []
    if not isinstance(tags, list):
        tags = []
    tags = [str(t).strip() for t in tags if str(t).strip()][:10]
    folder = obj.get("folder")
    if folder and not isinstance(folder, str):
        folder = None
    # confidence: 0..1, 防御非数
    raw_conf = obj.get("confidence")
    try:
        confidence = float(raw_conf) if raw_conf is not None else 0.5
        confidence = max(0.0, min(1.0, confidence))
    except (TypeError, ValueError):
        confidence = 0.5
    return {
        "tags": tags,
        "folder": folder,
        "is_new": bool(obj.get("is_new", False)),
        "no_move": bool(obj.get("no_move", False)),
        "confidence": confidence,
        "reason": str(obj.get("reason") or "")[:200],
    }


# ─── DB 写入 ──────────────────────────────────────────────


def _upsert_tag(con: sqlite3.Connection, name: str, source: str = "ai") -> int:
    """获取或新建 tag, 返 tag_id."""
    name = name.strip()[:50]
    row = con.execute("SELECT id FROM material_tags WHERE name=?", (name,)).fetchone()
    if row:
        return row[0]
    cur = con.execute(
        "INSERT INTO material_tags (name, source, created_at) VALUES (?, ?, ?)",
        (name, source, int(time.time())),
    )
    return cur.lastrowid


def _write_tags(asset_id: str, tags: list[str], source: str = "ai", confidence: float = 0.7) -> int:
    """把 tag 列表写到 material_asset_tags. 返写入条数 (去重后)."""
    if not tags:
        return 0
    written = 0
    with closing(get_connection()) as con:
        for t in tags:
            try:
                tid = _upsert_tag(con, t, source=source)
                # ON CONFLICT 防重 (SQLite < 3.24 用 INSERT OR IGNORE)
                con.execute(
                    "INSERT OR IGNORE INTO material_asset_tags (asset_id, tag_id, confidence) "
                    "VALUES (?, ?, ?)",
                    (asset_id, tid, confidence),
                )
                written += 1
            except Exception as e:
                log.warning(f"_write_tags 单条失败 {t}: {e}")
        con.commit()
    return written


# B'-3 (GPT 修订): 高置信门槛, 老板只看 confidence>=0.75 的建议
PENDING_MIN_CONFIDENCE = 0.75
# 当前 prompt/审核标准代号. 旧条目 = 1, 新一代 = 2. list_pending_review 默认只返新一代.
PENDING_SUGGESTION_VERSION = 2


def _write_pending_move(
    asset_id: str,
    suggested_folder: str | None,
    reason: str | None,
    is_new: bool = False,
    *,
    confidence: float | None = None,
    no_move: bool = False,
    reset_review: bool = False,
) -> str:
    """写归档建议到 material_pending_moves (待审核).

    B'-2: 已 approved / rejected 默认不覆盖, 历史审核结论保留; 显式 reset_review=True 才重置.
    B'-3: confidence 守卫 — 只有 confidence>=0.75 且 no_move=false 才进 pending.
          AI 判断"当前位置已合理" (no_move=true) → 直接不写; 低置信 → 不打扰.

    返回:
      "written"             — 实写 / 替换 pending
      "skipped_approved"    — 已通过, 不覆盖
      "skipped_rejected"    — 已跳过, 不覆盖
      "skipped_no_move"     — AI 觉得当前位置就行
      "skipped_low_conf"    — confidence < 阈值
      "noop_no_folder"      — 没建议 folder, 不写
    """
    if no_move:
        return "skipped_no_move"
    if not suggested_folder:
        return "noop_no_folder"
    if confidence is None or confidence < PENDING_MIN_CONFIDENCE:
        return "skipped_low_conf"
    with closing(get_connection()) as con:
        existing = con.execute(
            "SELECT status FROM material_pending_moves WHERE asset_id=?",
            (asset_id,),
        ).fetchone()
        if existing and not reset_review and existing[0] in ("approved", "rejected"):
            return f"skipped_{existing[0]}"
        con.execute(
            "INSERT OR REPLACE INTO material_pending_moves "
            "(asset_id, suggested_folder, is_new_folder, reason, status, created_at, "
            "confidence, no_move, suggestion_version) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (asset_id, suggested_folder[:200], 1 if is_new else 0,
             (reason or "")[:200], "pending", int(time.time()),
             float(confidence), 0, PENDING_SUGGESTION_VERSION),
        )
        con.commit()
        return "written"


# ─── 核心: tag_asset 单条 ────────────────────────────────


def tag_asset(asset_id: str, *, force: bool = False) -> dict[str, Any]:
    """单条素材打标. 先 LLM, 失败兜底启发式. 返 {tags, folder, is_new, reason, source}.

    force=True 即使已打过也重打.
    """
    apply_migrations()
    asset = ms.get_asset(asset_id)
    if not asset:
        raise ValueError(f"素材 {asset_id} 不存在")
    # 已打过且不强制 → 跳
    if not force and asset.get("tags"):
        return {
            "tags": [t["name"] for t in asset["tags"]],
            "folder": None, "is_new": False,
            "reason": "已打过, 跳过 (force=true 强重打)",
            "source": "cached",
        }
    prompt = _build_prompt(asset)
    # 调 LLM (走关卡层, 自动注入清华哥人设)
    result: dict[str, Any] | None = None
    source = "llm"
    try:
        from shortvideo.ai import get_ai_client
        ai = get_ai_client(route_key="materials.tag")
        r = ai.chat(prompt, deep=False, temperature=0.3, max_tokens=400)
        parsed = _parse_llm_json(r.text or "")
        if parsed:
            result = _normalize_llm_result(parsed)
        else:
            log.warning(f"LLM 输出非 JSON, fallback 启发式: {(r.text or '')[:120]}")
    except Exception as e:
        log.warning(f"LLM 调用失败, fallback 启发式: {type(e).__name__}: {e}")
    if not result or not result.get("tags"):
        result = _filename_heuristic(asset)
        source = "heuristic"
    # 写 DB. B'-2 (GPT 修订): source 直传 (llm/heuristic), 不再强转 "ai".
    # 这样 material_tags.source 能区分纯启发式 vs LLM, 后续筛"低可信 fallback 标签"才准.
    n_tags = _write_tags(asset_id, result["tags"], source=source,
                         confidence=0.7 if source == "llm" else 0.4)
    # B'-3: 把 confidence + no_move 透传给 _write_pending_move 做门槛判断
    if result.get("folder") and result["folder"] != asset.get("rel_folder"):
        _write_pending_move(
            asset_id, result["folder"], result.get("reason"),
            is_new=result.get("is_new", False),
            confidence=result.get("confidence"),
            no_move=bool(result.get("no_move", False)),
        )
    return {**result, "source": source, "tags_written": n_tags}


# ─── 批量 (异步, 限并发) ─────────────────────────────────


def tag_batch(
    *,
    limit: int = 10,
    force: bool = False,
    on_progress: Any = None,
) -> dict[str, Any]:
    """批量打标. 选未打标的素材 (asset_tags 为空), 限 limit 条.

    串行执行 (LLM 已 throttle); 大批量走 tasks.run_async daemon.
    """
    apply_migrations()
    with closing(get_connection()) as con:
        if force:
            rows = con.execute(
                "SELECT id FROM material_assets ORDER BY imported_at DESC LIMIT ?",
                (limit,),
            ).fetchall()
        else:
            rows = con.execute(
                """SELECT id FROM material_assets
                   WHERE id NOT IN (SELECT DISTINCT asset_id FROM material_asset_tags)
                   ORDER BY imported_at DESC LIMIT ?""",
                (limit,),
            ).fetchall()
    asset_ids = [r[0] for r in rows]
    total = len(asset_ids)
    ok = 0
    failed = 0
    sources: dict[str, int] = {"llm": 0, "heuristic": 0, "cached": 0}
    for i, aid in enumerate(asset_ids):
        try:
            res = tag_asset(aid, force=force)
            sources[res.get("source", "unknown")] = sources.get(res.get("source", "unknown"), 0) + 1
            ok += 1
        except Exception as e:
            log.warning(f"tag_batch 单条失败 {aid}: {e}")
            failed += 1
        # 每条都推 (防 D-068 watchdog 误杀长任务 + 让前端进度条流畅)
        if on_progress:
            try:
                on_progress(i + 1, total, aid)
            except Exception:
                pass
    return {
        "scanned": total,
        "ok": ok,
        "failed": failed,
        "sources": sources,
    }
