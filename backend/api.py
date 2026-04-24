"""FastAPI backend - 内容工厂(设计稿 C2)的后端.

Endpoints(对应设计稿 6 页):
  P1/P1b 提取文案:
    POST /api/transcribe/submit  {url}              → {batch_id}
    GET  /api/transcribe/query/{batch_id}           → {status, text, title, ...}

  P2 改文案:
    POST /api/rewrite  {text, style}                → {text, tokens}

  P3 声音:
    GET  /api/speakers                              → [{id, title}]
    POST /api/voice/upload (multipart)              → {path}       (保存到 data/audio/uploads)
    POST /api/voice/clone  {text, ref_path}         → {audio_url}  (CosyVoice sidecar)

  P4 形象:
    GET  /api/avatars                               → [{id, title}]

  P5 剪辑模板:
    GET  /api/templates                             → [{id,label,sub,...}]

  P6 合成+发布+封面:
    POST /api/video/submit  {text,avatar_id,speaker_id,title?}  → {video_id}
    GET  /api/video/query/{video_id}                → {status, progress, url}
    POST /api/cover  {slogan, n?}                   → {tasks:[{task_id}]}  # n 张并发
    GET  /api/cover/query/{task_id}                 → {status, url, local_path?}
    POST /api/publish  {work_id, platforms:[...], schedule_at?}  → {ok, note}  # 模拟态

  作品库:
    GET  /api/works                                 → [works]
    GET  /api/works/{id}                            → work
    DELETE /api/works/{id}                          → {ok}

  状态 / 静态:
    GET  /api/health                                → {ok, credits, llm, cosyvoice, ...}
    GET  /media/*                                   → 访问 data/ 下生成的资源
"""
from __future__ import annotations

import asyncio
import time
import json
import uuid
from pathlib import Path
from typing import Any, Optional

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from shortvideo.config import settings, ROOT, DATA_DIR, AUDIO_DIR, VIDEO_DIR
from shortvideo.shiliu import ShiliuClient, ShiliuError
from shortvideo.deepseek import DeepSeekClient
from shortvideo.ai import get_ai_client, get_ai_info, list_opus_models
from shortvideo.qingdou import QingdouClient, QingdouError
from shortvideo.apimart import ApimartClient, ApimartError, cover_prompt
from shortvideo.cosyvoice import CosyVoiceLocal, CosyVoiceNotReady
from shortvideo.works import (
    init_db, insert_work, update_work, get_work, list_works, delete_work,
    insert_material, list_materials, delete_material,
    insert_hot_topic, list_hot_topics, delete_hot_topic,
    insert_topic, list_topics, delete_topic,
    upsert_metric, list_metrics, list_all_metrics, delete_metric,
)
from backend.services import kb as kb_service
from backend.services import ad as ad_service
from backend.services import moments as moments_service
from backend.services import article as article_service
from backend.services import settings as settings_service

UPLOAD_DIR = AUDIO_DIR / "uploads"
COVER_DIR = DATA_DIR / "covers"
for d in (UPLOAD_DIR, COVER_DIR):
    d.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="内容工厂", version="0.3.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# 静态资源 — 让前端拿到本地生成的图/音频/视频
app.mount("/media", StaticFiles(directory=str(DATA_DIR)), name="media")

init_db()

# --------- 模型 ----------
class RewriteReq(BaseModel):
    text: str
    style: str = "casual"  # casual / pro / story
    deep: bool = True      # 深度理解业务(False=轻快模式,只带精简人设)


class TranscribeReq(BaseModel):
    url: str


class VideoSubmitReq(BaseModel):
    text: str
    avatar_id: int
    speaker_id: int
    title: Optional[str] = None
    source_url: Optional[str] = None
    original_text: Optional[str] = None


class CoverReq(BaseModel):
    slogan: str
    category: str = "实体店引流"
    n: int = 4
    size: str = "9:16"


class PublishReq(BaseModel):
    work_id: int
    platforms: list[str] = Field(default_factory=list)
    schedule_at: Optional[str] = None


class MaterialReq(BaseModel):
    original_text: str
    url: Optional[str] = None
    title: Optional[str] = None
    author: Optional[str] = None
    duration_sec: Optional[float] = None
    source: Optional[str] = "qingdou"


class VoiceCloneReq(BaseModel):
    text: str
    ref_path: str
    reference_text: str = ""


# --------- 工具 ----------
def media_url(p: Path) -> str:
    try:
        rel = p.relative_to(DATA_DIR)
    except ValueError:
        return str(p)
    return f"/media/{rel.as_posix()}"


# --------- 后台异步任务 (apimart cover / shiliu video) ----------
COVER_TASKS: dict[str, dict] = {}


def _run_cover_task(task_id: str, prompt: str, size: str):
    COVER_TASKS[task_id] = {"status": "running", "url": None, "local_path": None, "error": None, "started": time.time()}
    try:
        out = COVER_DIR / f"cover_{task_id}.png"
        with ApimartClient() as c:
            res = c.generate_and_download(prompt, out, size=size)
        COVER_TASKS[task_id].update(
            status="succeed",
            url=res.url,
            local_path=str(res.local_path),
            media_url=media_url(res.local_path) if res.local_path else None,
            elapsed_sec=res.elapsed_sec,
        )
    except Exception as e:
        COVER_TASKS[task_id].update(status="failed", error=f"{type(e).__name__}: {e}")


# --------- Endpoints ----------
@app.get("/api/health")
def health():
    out: dict[str, Any] = {"ok": True, "time": int(time.time())}
    try:
        with ShiliuClient() as c:
            out["shiliu"] = {"ok": True, "points": c.get_credits().points}
    except Exception as e:
        out["shiliu"] = {"ok": False, "error": str(e)}
    # 当前 AI 引擎探活
    out["ai"] = get_ai_info()
    try:
        tts = CosyVoiceLocal()
        out["cosyvoice"] = {"ok": tts.is_ready()}
    except Exception:
        out["cosyvoice"] = {"ok": False}
    out["qingdou"] = {"ok": bool(settings.qingdou_api_key)}
    out["apimart"] = {"ok": bool(settings.apimart_api_key)}
    return out


# ---- P1/P1b: 轻抖 ----
@app.post("/api/transcribe/submit")
def transcribe_submit(req: TranscribeReq):
    try:
        with QingdouClient() as c:
            batch_id = c.commit(req.url)
        return {"batch_id": batch_id}
    except QingdouError as e:
        raise HTTPException(400, str(e))


@app.get("/api/transcribe/query/{batch_id}")
def transcribe_query(batch_id: str):
    try:
        with QingdouClient() as c:
            res = c.query(batch_id)
        return {
            "status": res.status,
            "text": res.text,
            "title": res.title,
            "author": res.author,
            "duration_sec": res.duration_sec,
            "error": res.error,
        }
    except QingdouError as e:
        raise HTTPException(400, str(e))


# ---- P2: DeepSeek 改写 ----
@app.post("/api/rewrite")
def rewrite(req: RewriteReq):
    style_map = {
        "casual": "轻松口语,像跟熟客聊天,句子短,有钩子",
        "pro": "专业讲解,清晰讲产品细节或服务流程,不堆砌形容词",
        "story": "故事叙事,从一个小场景切入,带情绪",
    }
    hint = style_map.get(req.style, style_map["casual"])
    ai = get_ai_client()
    r = ai.rewrite_script(req.text, style_hint=hint, deep=req.deep)
    return {"text": r.text, "tokens": r.total_tokens, "deep": req.deep}


# ---- P3: 声音 ----
@app.get("/api/speakers")
def speakers():
    with ShiliuClient() as c:
        items = c.list_speakers()
    return [{"id": s.speaker_id, "title": s.title} for s in items]


@app.post("/api/voice/upload")
async def voice_upload(file: UploadFile = File(...)):
    """上传一个音频文件作为参考样本,供 CosyVoice 克隆使用。"""
    ext = Path(file.filename or "sample.wav").suffix or ".wav"
    out = UPLOAD_DIR / f"upload_{int(time.time())}_{uuid.uuid4().hex[:6]}{ext}"
    data = await file.read()
    out.write_bytes(data)
    return {"path": str(out), "media_url": media_url(out), "size": len(data), "name": file.filename}


@app.post("/api/voice/clone")
def voice_clone(req: VoiceCloneReq):
    tts = CosyVoiceLocal()
    if not tts.is_ready():
        raise HTTPException(503, "CosyVoice sidecar 未就绪,先 bash scripts/start_cosyvoice.sh")
    try:
        res = tts.clone(req.text, reference_wav=req.ref_path, reference_text=req.reference_text)
        return {
            "audio_path": str(res.audio_path),
            "media_url": media_url(res.audio_path),
            "duration_sec": res.duration_sec,
            "sample_rate": res.sample_rate,
            "elapsed_sec": res.elapsed_sec,
        }
    except CosyVoiceNotReady as e:
        raise HTTPException(503, str(e))


# ---- P4: 数字人形象 ----
@app.get("/api/avatars")
def avatars():
    with ShiliuClient() as c:
        items = c.list_avatars()
    return [{"id": a.avatar_id, "title": a.title} for a in items]


# ---- P5: 剪辑模板 ----
@app.get("/api/templates")
def templates():
    # 5 个模板 - MVP 阶段都可用,样式在前端 CSS 里做差异
    return [
        {"id": "t1", "label": "高能量快剪", "sub": "快节奏 · 频繁切换", "color": "#d97757", "hot": True},
        {"id": "t2", "label": "主播亲和型", "sub": "字幕居中 · 稳稳讲", "color": "#5a8fbe"},
        {"id": "t3", "label": "店铺实拍交替", "sub": "数字人 + 店内镜头", "color": "#7a9b6a"},
        {"id": "t4", "label": "促销万词碰撞", "sub": "大字标题 + 价格冲击", "color": "#c78a3b"},
        {"id": "t5", "label": "对比种草型", "sub": "之前 vs 之后", "color": "#8a6a9b"},
    ]


# ---- P6: 石榴视频 ----
@app.post("/api/video/submit")
def video_submit(req: VideoSubmitReq):
    try:
        with ShiliuClient() as c:
            vid, length_ms = c.create_video_by_text(
                req.text, avatar_id=req.avatar_id, speaker_id=req.speaker_id, title=req.title
            )
    except ShiliuError as e:
        raise HTTPException(400, str(e))
    wid = insert_work(
        final_text=req.text,
        title=req.title or req.text[:20],
        source_url=req.source_url,
        original_text=req.original_text,
        avatar_id=req.avatar_id,
        speaker_id=req.speaker_id,
        status="generating",
    )
    update_work(wid, shiliu_video_id=vid)
    return {"video_id": vid, "work_id": wid, "estimated_length_ms": length_ms}


@app.get("/api/video/query/{video_id}")
def video_query(video_id: int):
    try:
        with ShiliuClient() as c:
            st = c.get_video_status(video_id)
    except ShiliuError as e:
        raise HTTPException(400, str(e))
    # 如果 ready,自动下载到本地 + 更新作品库
    local_url = None
    if st.video_url:
        dest = VIDEO_DIR / f"shiliu_{video_id}.mp4"
        if not dest.exists():
            try:
                with ShiliuClient() as c:
                    c.download_video(st.video_url, dest)
            except Exception:
                pass
        if dest.exists():
            local_url = media_url(dest)
            # update works
            ws = [w for w in list_works(limit=200) if w.shiliu_video_id == video_id]
            if ws:
                update_work(ws[0].id, status="ready", local_path=str(dest))
    return {
        "status": st.status,
        "progress": st.progress,
        "title": st.title,
        "video_url": st.video_url,
        "local_url": local_url,
    }


# ---- P6 封面 GPT-Image-2 ----
@app.post("/api/cover")
def cover_create(req: CoverReq):
    tasks = []
    for _ in range(max(1, min(req.n, 8))):
        tid = uuid.uuid4().hex[:12]
        prompt = cover_prompt(req.slogan, req.category)
        COVER_TASKS[tid] = {"status": "pending"}
        # run in background thread(FastAPI 同步 endpoint 中用线程池)
        import threading
        threading.Thread(target=_run_cover_task, args=(tid, prompt, req.size), daemon=True).start()
        tasks.append({"task_id": tid})
    return {"tasks": tasks}


@app.get("/api/cover/query/{task_id}")
def cover_query(task_id: str):
    t = COVER_TASKS.get(task_id)
    if not t:
        raise HTTPException(404, "task not found")
    return t


# ---- 发布(模拟态) ----
@app.post("/api/publish")
def publish(req: PublishReq):
    w = get_work(req.work_id)
    if not w:
        raise HTTPException(404, "work not found")
    platforms = req.platforms or ["douyin", "shipinhao"]
    note = f"已标记发布到 {', '.join(platforms)}"
    if req.schedule_at:
        note += f" · 定时 {req.schedule_at}"
    note += "(模拟态:实际推送到第三方平台需要各家 OpenAPI 授权,MVP 只落库)"
    update_work(req.work_id, status="published")
    return {"ok": True, "note": note, "platforms": platforms, "schedule_at": req.schedule_at}


# ---- 首页统计 ----
# ---- AI 引擎 ----
@app.get("/api/ai/health")
def ai_health():
    return get_ai_info()


@app.get("/api/ai/models")
def ai_models():
    return {"models": list_opus_models()}


# ---- 设置 ----
@app.get("/api/settings")
def settings_get():
    return settings_service.get_all()


class SettingsUpdateReq(BaseModel):
    class Config:
        extra = "allow"


@app.post("/api/settings")
def settings_update(payload: dict[str, Any]):
    return settings_service.update(payload or {})


@app.post("/api/settings/reset")
def settings_reset_ep():
    return settings_service.reset()


@app.get("/api/stats/home")
def stats_home():
    """4 方块 + 1 热点条的统计数据."""
    import time as _t
    now = int(_t.time())
    day = 86400
    week_start = now - day * 7
    yday_start = now - day * 1
    today_start = now - day

    all_works = list_works(limit=500)
    hots = list_hot_topics(limit=1)
    top_hot = None
    if hots:
        h = hots[0]
        top_hot = {
            "heat_score": h.heat_score, "title": h.title, "platform": h.platform,
            "match_persona": bool(h.match_persona), "match_reason": h.match_reason,
        }

    # 做视频:进行中(generating/ready/pending,排除 published/failed)
    in_progress = sum(1 for w in all_works if w.status in ("generating", "ready", "pending"))
    today_works = sum(1 for w in all_works if w.created_at >= today_start)

    # 已发(published)本周
    published_week = sum(1 for w in all_works if w.status == "published" and w.created_at >= week_start)

    return {
        "make":    {"in_progress": in_progress, "today": today_works,  "hint": f"最近 {in_progress} 条进行中" if in_progress else "还没有进行中的视频,点开始做"},
        "ad":      {"yesterday": 0,  "hint": "Phase 2 已通 · 记一条投流出了 5 版(数据库后续接)"},
        "wechat":  {"week": 0,       "hint": "本周还没发过" if True else ""},
        "moments": {"yesterday": 0,  "hint": "昨天发的朋友圈(后续 Phase 3 自动统计)"},
        "hot":     top_hot,
    }


# ---- 作品库 ----
@app.get("/api/works")
def works_list(limit: int = 50):
    items = list_works(limit=limit)
    out = []
    for w in items:
        local_url = None
        if w.local_path:
            p = Path(w.local_path)
            if p.exists():
                try:
                    local_url = media_url(p)
                except Exception:
                    pass
        out.append({
            "id": w.id,
            "title": w.title,
            "created_at": w.created_at,
            "status": w.status,
            "final_text": w.final_text[:120] if w.final_text else "",
            "avatar_id": w.avatar_id,
            "speaker_id": w.speaker_id,
            "shiliu_video_id": w.shiliu_video_id,
            "local_url": local_url,
        })
    return out


@app.delete("/api/works/{work_id}")
def works_delete(work_id: int, remove_file: bool = False):
    delete_work(work_id, remove_file=remove_file)
    return {"ok": True}


# ---- 数据指标:手动录入 + 查询 + 排行 ----
class MetricUpsertReq(BaseModel):
    platform: str
    views: int = 0
    likes: int = 0
    comments: int = 0
    shares: int = 0
    saves: int = 0
    followers_gained: int = 0
    conversions: int = 0
    completion_rate: Optional[float] = None
    notes: Optional[str] = None


@app.get("/api/works/{work_id}/metrics")
def work_metrics_get(work_id: int):
    items = list_metrics(work_id)
    return [{
        "id": m.id, "work_id": m.work_id, "platform": m.platform,
        "views": m.views, "likes": m.likes, "comments": m.comments,
        "shares": m.shares, "saves": m.saves,
        "followers_gained": m.followers_gained, "conversions": m.conversions,
        "completion_rate": m.completion_rate, "notes": m.notes,
        "recorded_at": m.recorded_at, "source": m.source,
    } for m in items]


@app.post("/api/works/{work_id}/metrics")
def work_metrics_upsert(work_id: int, req: MetricUpsertReq):
    mid = upsert_metric(
        work_id=work_id, platform=req.platform,
        views=req.views, likes=req.likes, comments=req.comments,
        shares=req.shares, saves=req.saves,
        followers_gained=req.followers_gained, conversions=req.conversions,
        completion_rate=req.completion_rate, notes=req.notes,
    )
    return {"id": mid, "ok": True}


@app.delete("/api/metrics/{metric_id}")
def metric_delete(metric_id: int):
    delete_metric(metric_id)
    return {"ok": True}


@app.get("/api/works/analytics")
def works_analytics(limit: int = 50):
    """作品库效果分析:TOP 10 + 各平台总量 + 历史汇总."""
    all_metrics = list_all_metrics(limit=500)
    all_works = {w.id: w for w in list_works(limit=500)}

    # 按 work 聚合(各平台指标加和)
    agg: dict[int, dict] = {}
    for m in all_metrics:
        a = agg.setdefault(m.work_id, {
            "work_id": m.work_id,
            "views": 0, "likes": 0, "comments": 0, "shares": 0, "saves": 0,
            "followers_gained": 0, "conversions": 0,
            "platforms": [],
        })
        a["views"] += m.views
        a["likes"] += m.likes
        a["comments"] += m.comments
        a["shares"] += m.shares
        a["saves"] += m.saves
        a["followers_gained"] += m.followers_gained
        a["conversions"] += m.conversions
        a["platforms"].append(m.platform)

    # 附标题/日期
    for wid, a in agg.items():
        w = all_works.get(wid)
        if w:
            a["title"] = w.title
            a["created_at"] = w.created_at
            a["local_url"] = w.local_path
            a["status"] = w.status
        else:
            a["title"] = f"(已删 work_id={wid})"
            a["created_at"] = 0
            a["status"] = "unknown"

    top_views = sorted(agg.values(), key=lambda x: -x["views"])[:limit]
    top_conv = sorted(agg.values(), key=lambda x: -x["conversions"])[:limit]

    # 各平台总量
    platform_totals = {}
    for m in all_metrics:
        p = platform_totals.setdefault(m.platform, {
            "views": 0, "likes": 0, "comments": 0, "conversions": 0, "count": 0,
        })
        p["views"] += m.views
        p["likes"] += m.likes
        p["comments"] += m.comments
        p["conversions"] += m.conversions
        p["count"] += 1

    return {
        "total_works_with_data": len(agg),
        "total_metrics_records": len(all_metrics),
        "top_by_views": top_views,
        "top_by_conversions": top_conv,
        "platform_totals": platform_totals,
    }


# ---- 素材库(扒过的链接 + 原文案)----
@app.get("/api/materials")
def materials_list(limit: int = 100):
    items = list_materials(limit=limit)
    return [
        {
            "id": m.id,
            "created_at": m.created_at,
            "url": m.url,
            "title": m.title,
            "author": m.author,
            "duration_sec": m.duration_sec,
            "original_text": m.original_text,
            "source": m.source,
        } for m in items
    ]


@app.post("/api/materials")
def materials_add(req: MaterialReq):
    mid = insert_material(
        original_text=req.original_text,
        url=req.url, title=req.title, author=req.author,
        duration_sec=req.duration_sec, source=req.source,
    )
    return {"id": mid, "ok": True}


@app.delete("/api/materials/{material_id}")
def materials_delete(material_id: int):
    delete_material(material_id)
    return {"ok": True}


# ---- 热点库 ----
class HotTopicReq(BaseModel):
    title: str
    platform: Optional[str] = None
    heat_score: int = 0
    match_persona: bool = False
    match_reason: Optional[str] = None
    source_url: Optional[str] = None
    fetched_from: str = "manual"


@app.get("/api/hot-topics")
def hot_topics_list(limit: int = 50):
    items = list_hot_topics(limit=limit)
    return [{
        "id": h.id, "created_at": h.created_at, "platform": h.platform,
        "title": h.title, "heat_score": h.heat_score,
        "match_persona": bool(h.match_persona), "match_reason": h.match_reason,
        "source_url": h.source_url, "fetched_from": h.fetched_from, "status": h.status,
    } for h in items]


@app.post("/api/hot-topics")
def hot_topics_add(req: HotTopicReq):
    tid = insert_hot_topic(
        title=req.title, platform=req.platform, heat_score=req.heat_score,
        match_persona=req.match_persona, match_reason=req.match_reason,
        source_url=req.source_url, fetched_from=req.fetched_from,
    )
    return {"id": tid, "ok": True}


@app.delete("/api/hot-topics/{topic_id}")
def hot_topics_delete(topic_id: int):
    delete_hot_topic(topic_id)
    return {"ok": True}


# ---- 选题库 ----
class TopicReq(BaseModel):
    title: str
    description: Optional[str] = None
    tags: Optional[str] = None
    heat_score: int = 0
    source: str = "manual"


@app.get("/api/topics")
def topics_list(limit: int = 100):
    items = list_topics(limit=limit)
    return [{
        "id": t.id, "created_at": t.created_at,
        "title": t.title, "description": t.description,
        "tags": t.tags, "heat_score": t.heat_score,
        "source": t.source, "status": t.status,
    } for t in items]


@app.post("/api/topics")
def topics_add(req: TopicReq):
    tid = insert_topic(
        title=req.title, description=req.description,
        tags=req.tags, heat_score=req.heat_score, source=req.source,
    )
    return {"id": tid, "ok": True}


@app.delete("/api/topics/{topic_id}")
def topics_delete(topic_id: int):
    delete_topic(topic_id)
    return {"ok": True}


# ---- 选题批量生成(简化版,用 DeepSeek) ----
class TopicGenReq(BaseModel):
    seed: str
    n: int = 10
    deep: bool = True


@app.post("/api/topics/generate")
def topics_generate(req: TopicGenReq):
    kb_chunks = kb_service.match(req.seed, k=3) if req.seed else []
    kb_block = ""
    if kb_chunks:
        kb_block = "\n\n【参考素材】\n" + "\n".join(f"- [{c['title']}] {c['preview']}" for c in kb_chunks)
    prompt = f"""基于主题/人设,出 {req.n} 个适合清华哥做短视频/公众号的选题。每个选题 15 字以内,要犀利、不空泛。{kb_block}

【主题】{req.seed}

严格 JSON 数组: ["选题1", "选题2", ...]
"""
    ai = get_ai_client()
    r = ai.chat(prompt, max_tokens=800, temperature=0.9, deep=req.deep)
    import json as _json, re as _re
    m = _re.search(r"\[[\s\S]*\]", r.text or "")
    titles = []
    if m:
        try:
            titles = [t for t in _json.loads(m.group(0)) if isinstance(t, str)]
        except Exception:
            titles = []
    created_ids = []
    for t in titles[:req.n]:
        tid = insert_topic(title=t[:100], source="ai-batch")
        created_ids.append(tid)
    return {"titles": titles, "ids": created_ids, "kb_used": [c["path"] for c in kb_chunks]}


# ---- 知识库(Obsidian vault 只读) ----
@app.get("/api/kb/tree")
def kb_tree(refresh: bool = False):
    return kb_service.build_tree(refresh=refresh)


@app.get("/api/kb/doc")
def kb_doc(path: str):
    try:
        return kb_service.read_doc(path)
    except FileNotFoundError as e:
        raise HTTPException(404, str(e))


class KbSearchReq(BaseModel):
    query: str
    k: int = 8


@app.post("/api/kb/search")
def kb_search(req: KbSearchReq):
    return kb_service.search(req.query, k=req.k)


class KbMatchReq(BaseModel):
    query: str
    k: int = 5


@app.post("/api/kb/match")
def kb_match(req: KbMatchReq):
    """chunk 级别匹配,供文案生成 prompt 注入."""
    return kb_service.match(req.query, k=req.k)


# ---- 投流文案:批量 5 版 + 点评 ----
class AdGenerateReq(BaseModel):
    pitch: str
    platform: str = "douyin"
    n: int = 5
    use_kb: bool = True
    deep: bool = True


@app.post("/api/ad/generate")
def ad_generate(req: AdGenerateReq):
    kb_chunks = None
    if req.use_kb and req.pitch:
        kb_chunks = kb_service.match(req.pitch, k=3)
    items = ad_service.generate_ad_batch(
        req.pitch, platform=req.platform, n=req.n, kb_chunks=kb_chunks, deep=req.deep,
    )
    return {"items": items, "kb_used": [c["path"] for c in (kb_chunks or [])], "deep": req.deep}


# ---- 朋友圈:衍生 3-5 条 ----
class MomentsDeriveReq(BaseModel):
    topic: str
    n: int = 5
    use_kb: bool = True
    deep: bool = True


@app.post("/api/moments/derive")
def moments_derive(req: MomentsDeriveReq):
    kb_chunks = None
    if req.use_kb and req.topic:
        kb_chunks = kb_service.match(req.topic, k=4)
    items = moments_service.derive_moments(req.topic, n=req.n, kb_chunks=kb_chunks, deep=req.deep)
    return {"items": items, "kb_used": [c["path"] for c in (kb_chunks or [])], "deep": req.deep}


# ---- 公众号:大纲 + 长文 ----
class ArticleOutlineReq(BaseModel):
    topic: str
    use_kb: bool = True
    deep: bool = True


@app.post("/api/article/outline")
def article_outline(req: ArticleOutlineReq):
    kb_chunks = None
    if req.use_kb and req.topic:
        kb_chunks = kb_service.match(req.topic, k=3)
    items = article_service.gen_outline(req.topic, kb_chunks=kb_chunks, deep=req.deep)
    return {"outline": items, "kb_used": [c["path"] for c in (kb_chunks or [])], "deep": req.deep}


class ArticleExpandReq(BaseModel):
    topic: str
    outline: list[dict] = Field(default_factory=list)
    use_kb: bool = True
    deep: bool = True


@app.post("/api/article/expand")
def article_expand(req: ArticleExpandReq):
    kb_chunks = None
    if req.use_kb and req.topic:
        kb_chunks = kb_service.match(req.topic, k=4)
    result = article_service.expand_article(req.topic, req.outline, kb_chunks=kb_chunks, deep=req.deep)
    return {**result, "kb_used": [c["path"] for c in (kb_chunks or [])], "deep": req.deep}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000, log_level="info")
