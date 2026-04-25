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
import re
import time
import json
import uuid
from pathlib import Path
from typing import Any, Optional

from fastapi import BackgroundTasks, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from shortvideo.config import settings, ROOT, DATA_DIR, AUDIO_DIR, VIDEO_DIR
from shortvideo.shiliu import ShiliuClient, ShiliuError
from shortvideo.deepseek import DeepSeekClient
from shortvideo.ai import get_ai_client, get_ai_info, list_opus_models, routes_info
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
from backend.services import skill_loader
from backend.services import wechat_pipeline
from backend.services import wechat_scripts
from backend.services import hotrewrite_pipeline
from backend.services import voicerewrite_pipeline
from backend.services import touliu_pipeline
from backend.services import registered_skills
from backend.services import dreamina_service

UPLOAD_DIR = AUDIO_DIR / "uploads"
COVER_DIR = DATA_DIR / "covers"
for d in (UPLOAD_DIR, COVER_DIR):
    d.mkdir(parents=True, exist_ok=True)

# OpenAPI 分组 — 新 endpoint 写 tags=["小华夜班"] 这类中文 tag 即可在 /docs 自动归到这组
TAGS_METADATA = [
    {"name": "总部", "description": "首页 widget / 健康检查 / 技能目录"},
    {"name": "AI", "description": "AI 引擎元信息 / 路由 / 用量统计"},
    {"name": "全局任务", "description": "异步任务清单 (D-037)"},
    {"name": "小华夜班", "description": "夜间自动化任务 (D-040)"},
    {"name": "公众号", "description": "公众号 8 步流水线 (D-010)"},
    {"name": "热点改写", "description": "热点文案改写V2 skill (D-012)"},
    {"name": "录音改写", "description": "录音文案改写 skill (D-013)"},
    {"name": "投流", "description": "touliu-agent skill (D-014)"},
    {"name": "内容策划", "description": "content-planner skill (D-022)"},
    {"name": "违规审查", "description": "违禁违规审查 skill (D-026)"},
    {"name": "即梦 AIGC", "description": "Dreamina CLI 接入 (D-028)"},
    {"name": "短视频", "description": "做视频流水线"},
    {"name": "档案部", "description": "素材库 / 作品库 / 知识库"},
    {"name": "设置", "description": "全局配置"},
]

app = FastAPI(
    title="内容工厂 API",
    version="0.4.0",
    description=(
        "清华哥个人内容生产工具的 HTTP API. "
        "前端 (factory-*.jsx 套件) 全部走这里, 浏览器直接 `/docs` 试调.\n\n"
        "**约定**\n"
        "- 媒体文件全部走 `/media/<相对 data/ 路径>` 暴露\n"
        "- 慢 endpoint (>5s) 优先走异步 + task_id 轮询模式 (D-037)\n"
        "- skill_slug 见 `/api/skills/catalog`, AI 引擎路由见 `/api/ai/routes`"
    ),
    openapi_tags=TAGS_METADATA,
)
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


# --------- 启动钩子: 小华夜班调度器 (D-040c) ----------
@app.on_event("startup")
def _start_night_scheduler():
    """uvicorn boot 时把 enabled+cron 的夜班任务挂上 APScheduler.
    pytest 不会触发 startup event, 所以测试不会启动真调度."""
    try:
        from backend.services import night_scheduler
        night_scheduler.start()
    except Exception as e:
        # 调度器挂了不应影响 API 启动 — 后台静默
        import logging
        logging.getLogger("night.scheduler").error(f"startup failed: {e}")


@app.on_event("shutdown")
def _stop_night_scheduler():
    try:
        from backend.services import night_scheduler
        night_scheduler.shutdown()
    except Exception:
        pass


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
    ai = get_ai_client(route_key="rewrite")
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


@app.get("/api/ai/routes")
def ai_routes():
    """返回当前的引擎路由表(默认 + 用户 override + 实际生效)。"""
    return routes_info()


@app.get("/api/ai/usage")
def ai_usage_endpoint(range: str = "today"):
    """AI 调用用量聚合统计 (D-015)。range: today|yesterday|week|month|all"""
    from backend.services import ai_usage
    return ai_usage.get_usage(range_=range)


@app.get("/api/ai/usage/recent")
def ai_usage_recent(limit: int = 50):
    """最近 N 次 AI 调用明细(调试用)。"""
    from backend.services import ai_usage
    return {"calls": ai_usage.recent_calls(limit=limit)}


@app.get("/api/skills/catalog")
def skills_catalog():
    """返回技能中心的完整目录:已接入 + 桌面 skills 里发现的未接入 skill。"""
    return {"skills": registered_skills.list_catalog()}


# ─── 全局任务清单 (D-037a) ───────────────────────────────
# 只读 + 取消。endpoint 异步化在 D-037b 做。

@app.get("/api/tasks")
def tasks_list(
    status: Optional[str] = None,
    kind: Optional[str] = None,
    ns: Optional[str] = None,
    limit: int = 50,
):
    """列任务。status 支持多值逗号分隔,如 status=running,pending。"""
    from backend.services import tasks as tasks_service
    return {
        "tasks": tasks_service.list_tasks(status=status, kind=kind, ns=ns, limit=limit),
        "counts": tasks_service.counts(),
    }


@app.get("/api/tasks/{task_id}")
def tasks_get(task_id: str):
    from backend.services import tasks as tasks_service
    t = tasks_service.get_task(task_id)
    if not t:
        raise HTTPException(status_code=404, detail="task not found")
    return t


@app.post("/api/tasks/{task_id}/cancel")
def tasks_cancel(task_id: str):
    from backend.services import tasks as tasks_service
    ok = tasks_service.cancel_task(task_id)
    if not ok:
        raise HTTPException(status_code=409, detail="task not cancellable (already finished?)")
    return {"ok": True, "task": tasks_service.get_task(task_id)}


# ─── 小华夜班 (D-040) ─────────────────────────────────────
# 用户睡觉的 23:00-6:00 跑预设流水线 (抓选题 / 拆素材 / 维护知识库 / 复盘).
# 早上打开总部直接看 NightDigestCard 播报.
# 命名规范: 用户可见 "小华夜班 / 任务 / 上次跑了…" · 代码内 night_shift / night_job / night_job_run.
# 本轮 (D-040b) 7 个 endpoint, run-now 走 night_executor 占位, D-040c 接真 skill.

class NightJobCreate(BaseModel):
    name: str = Field(..., max_length=100, description="任务名 (用户可见, 例 '凌晨抓热点')")
    trigger_type: str = Field(..., description="触发器类型: cron | file_watch | manual")
    icon: Optional[str] = Field(None, max_length=8, description="emoji 图标")
    skill_slug: Optional[str] = Field(None, max_length=64, description="对应 ~/Desktop/skills/<slug>/")
    trigger_config: Optional[dict[str, Any]] = Field(
        None,
        description="cron: {cron:'0 23 * * *', timezone:'Asia/Shanghai'} · file_watch: {path:'data/inbox/audio/', patterns:['*.m4a']}",
    )
    output_target: Optional[str] = Field(None, description="产出去向: materials | works | knowledge | home")
    ai_route: Optional[str] = Field(None, description="覆盖默认引擎路由, 如 'opus' / 'deepseek'")
    enabled: bool = Field(True, description="是否启用 (false 则调度器跳过)")


class NightJobUpdate(BaseModel):
    name: Optional[str] = None
    icon: Optional[str] = None
    skill_slug: Optional[str] = None
    trigger_type: Optional[str] = None
    trigger_config: Optional[dict[str, Any]] = None
    output_target: Optional[str] = None
    ai_route: Optional[str] = None
    enabled: Optional[bool] = None


@app.get("/api/night/jobs", tags=["小华夜班"], summary="列任务")
def night_jobs_list(enabled_only: bool = False):
    """列所有夜班任务 (默认含禁用的). 总控页 NightShiftPage 用."""
    from backend.services import night_shift
    return {"jobs": night_shift.list_jobs(enabled_only=enabled_only)}


def _reload_night_scheduler_silent():
    try:
        from backend.services import night_scheduler
        if night_scheduler.is_running():
            night_scheduler.reload_jobs()
    except Exception:
        pass  # 调度器没起 (测试 / 前期) 时静默


@app.post("/api/night/jobs", tags=["小华夜班"], summary="新建任务", status_code=201)
def night_jobs_create(req: NightJobCreate):
    """新建一条夜班任务. 立即写 DB + reload 调度器 (cron 任务下一次 fire 时间立即生效)."""
    from backend.services import night_shift
    try:
        jid = night_shift.create_job(**req.model_dump(exclude_none=True))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    _reload_night_scheduler_silent()
    return night_shift.get_job(jid)


@app.patch("/api/night/jobs/{job_id}", tags=["小华夜班"], summary="改/开关任务")
def night_jobs_update(job_id: int, req: NightJobUpdate):
    """部分更新. 改 enabled 即开关任务. 调度器自动 reload."""
    from backend.services import night_shift
    fields = req.model_dump(exclude_unset=True)
    if not fields:
        raise HTTPException(status_code=400, detail="no fields to update")
    try:
        ok = night_shift.update_job(job_id, **fields)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if not ok:
        raise HTTPException(status_code=404, detail="job not found")
    _reload_night_scheduler_silent()
    return night_shift.get_job(job_id)


@app.delete("/api/night/jobs/{job_id}", tags=["小华夜班"], summary="删任务")
def night_jobs_delete(job_id: int):
    """删任务 (级联删运行历史). 调度器自动 reload."""
    from backend.services import night_shift
    if not night_shift.delete_job(job_id):
        raise HTTPException(status_code=404, detail="job not found")
    _reload_night_scheduler_silent()
    return {"ok": True}


@app.get("/api/night/scheduler", tags=["小华夜班"], summary="调度器状态")
def night_scheduler_status():
    """调度器是否在跑 + 当前挂了哪些 cron 任务 (含 next_run_time). 调试用."""
    from backend.services import night_scheduler
    return {
        "running": night_scheduler.is_running(),
        "scheduled": night_scheduler.list_scheduled(),
    }


@app.post("/api/night/jobs/{job_id}/run", tags=["小华夜班"], summary="立即跑一次")
def night_jobs_run(job_id: int):
    """手动触发. 立即返回 run_id, 后台 thread 跑实际任务.
    轮询 GET /api/night/runs?job_id=... 看结果."""
    from backend.services import night_executor
    try:
        run_id = night_executor.run_job_async(job_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return {"run_id": run_id, "job_id": job_id}


@app.get("/api/night/runs", tags=["小华夜班"], summary="运行历史")
def night_runs_list(
    job_id: Optional[int] = None,
    status: Optional[str] = None,
    since_ts: Optional[int] = None,
    limit: int = 50,
):
    """运行历史. 按 started_at DESC 排.
    `status`: running | success | failed · `since_ts`: unix 秒, 只列之后的."""
    from backend.services import night_shift
    return {
        "runs": night_shift.list_runs(
            job_id=job_id, status=status, since_ts=since_ts, limit=limit
        )
    }


@app.get("/api/night/digest", tags=["小华夜班"], summary="总部播报区数据")
def night_digest(since_hours: int = 24):
    """总部 NightDigestCard 用. 默认最近 24h, 只挑 success runs, 带 job_name/icon/output_target."""
    from backend.services import night_shift
    return night_shift.get_digest(since_hours=max(1, min(int(since_hours), 24 * 7)))


# ─── 小华自由对话 dock (D-027) ────────────────────────────

class ChatDockMsg(BaseModel):
    role: str   # "user" | "assistant"
    text: str


class ChatDockReq(BaseModel):
    messages: list[ChatDockMsg] = Field(default_factory=list)
    context: str = ""  # 当前页面: 首页 / 公众号 / 投流 / etc


# ─── 即梦(Dreamina) AIGC 接入 (D-028) ────────────────────

@app.get("/api/dreamina/info")
def dreamina_info():
    """CLI 探活 + 版本 + 余额。"""
    info = dreamina_service.cli_info()
    credit = dreamina_service.user_credit() if info.get("ok") else {}
    return {**info, "credit": credit}


class DreaminaText2ImageReq(BaseModel):
    prompt: str
    ratio: str = "1:1"
    resolution_type: Optional[str] = None  # 1k / 2k / 4k
    model_version: Optional[str] = None    # 3.0 / 3.1 / 4.0 / 4.1 / 4.5 / 4.6 / 5.0 / lab
    poll: int = 0  # 同步等秒数,0 = 异步立即返回 submit_id


@app.post("/api/dreamina/text2image")
def dreamina_text2image(req: DreaminaText2ImageReq):
    try:
        return dreamina_service.text2image(
            req.prompt, ratio=req.ratio,
            resolution_type=req.resolution_type,
            model_version=req.model_version,
            poll=max(0, min(req.poll, 120)),  # 最多 poll 120s
        )
    except dreamina_service.DreaminaError as e:
        raise HTTPException(500, str(e))


class DreaminaImage2VideoReq(BaseModel):
    image: str   # 本地文件路径
    prompt: str
    duration: Optional[int] = None  # 秒数
    video_resolution: Optional[str] = None  # 720p / 1080p
    model_version: Optional[str] = None     # 3.0 / 3.0fast / 3.0pro / 3.5pro / seedance2.0 / seedance2.0fast
    poll: int = 0


@app.post("/api/dreamina/image2video")
def dreamina_image2video(req: DreaminaImage2VideoReq):
    try:
        return dreamina_service.image2video(
            req.image, req.prompt,
            duration=req.duration,
            video_resolution=req.video_resolution,
            model_version=req.model_version,
            poll=max(0, min(req.poll, 180)),
        )
    except dreamina_service.DreaminaError as e:
        raise HTTPException(500, str(e))


class DreaminaQueryReq(BaseModel):
    submit_id: str
    download: bool = True


@app.post("/api/dreamina/query")
def dreamina_query(req: DreaminaQueryReq):
    try:
        result = dreamina_service.query_result(req.submit_id, download=req.download)
        # 转下载文件路径为 media URL
        if result.get("downloaded"):
            urls = []
            for p in result["downloaded"]:
                pp = Path(p)
                if pp.exists():
                    try:
                        urls.append(media_url(pp))
                    except Exception:
                        urls.append(str(pp))
            result["media_urls"] = urls
        return result
    except dreamina_service.DreaminaError as e:
        raise HTTPException(500, str(e))


@app.get("/api/dreamina/list-tasks")
def dreamina_list_tasks():
    return dreamina_service.list_tasks()


@app.post("/api/chat")
def chat_dock(req: ChatDockReq, background_tasks: "BackgroundTasks" = None):
    """小华浮动 dock 自由对话(多轮)。messages 是完整对话历史,context 是当前页。
    返回后台异步触发偏好学习(D-030),失败吃掉不影响主响应。"""
    # 把多轮历史拼成单 user prompt(PersonaInjectedAI 只接受单 prompt + system)
    history_lines = []
    for m in req.messages[-12:]:  # 最近 12 轮,避免太长
        prefix = "老板" if m.role == "user" else "小华"
        history_lines.append(f"{prefix}: {m.text.strip()}")
    history = "\n".join(history_lines)

    system = (
        "你是小华,清华哥的内容生产副驾。当前老板在看「" + (req.context or "首页") + "」页面。\n"
        "对话规则:\n"
        "- 简短,口语,像跟兄弟聊天\n"
        "- 老板提的工作问题(写文案/改写/查违规等),引导到对应 skill,不要自己写完整内容\n"
        "- 老板没具体问题就轻松聊几句\n"
        "- 一次回复不超过 80 字\n"
        "- 直接回答,不要前言"
    )
    prompt = (
        f"对话历史:\n{history}\n\n小华(回这条,用大白话,不超过 80 字):"
    )

    ai = get_ai_client(route_key="chat.dock")
    r = ai.chat(prompt, system=system, deep=False, temperature=0.85, max_tokens=400)

    # D-030: 异步学偏好(失败吃掉)
    if background_tasks is not None:
        try:
            from backend.services import preference
            msgs_dict = [{"role": m.role, "text": m.text} for m in req.messages]
            background_tasks.add_task(preference.maybe_learn, msgs_dict, req.context)
        except Exception:
            pass

    return {
        "reply": (r.text or "").strip(),
        "tokens": r.total_tokens,
    }


# ─── 偏好学习 endpoints (D-030) ──────────────────────────

@app.get("/api/preferences/status")
def preferences_status():
    from backend.services import preference
    return preference.status()


class PrefToggleReq(BaseModel):
    enabled: bool


@app.post("/api/preferences/toggle")
def preferences_toggle(req: PrefToggleReq):
    settings_service.update({"preference_learning_enabled": bool(req.enabled)})
    from backend.services import preference
    return preference.status()


@app.get("/api/preferences/recent")
def preferences_recent(limit: int = 30):
    from backend.services import preference
    return {"preferences": preference.recent_preferences(limit=limit)}


# ─── 行为记忆注入开关 (D-031) ────────────────────────────

@app.get("/api/memory-inject/status")
def memory_inject_status():
    from backend.services import memory_inject
    return memory_inject.stats()


# ─── 效果分析 → 反哺选题 (D-032) ─────────────────────────

@app.get("/api/insights/top-performers")
def insights_top_performers(limit: int = 10):
    from backend.services import insights
    return {"items": insights.top_performers(limit=limit)}


@app.get("/api/insights/winning-patterns")
def insights_winning_patterns(refresh: bool = False):
    """跑量好的作品共性 · 1h 缓存,topics_generate 自动注入此结果。"""
    from backend.services import insights
    return insights.winning_patterns(refresh=refresh)


class MemInjectToggleReq(BaseModel):
    enabled: bool


@app.post("/api/memory-inject/toggle")
def memory_inject_toggle(req: MemInjectToggleReq):
    settings_service.update({"memory_injection_enabled": bool(req.enabled)})
    from backend.services import memory_inject
    return memory_inject.stats()


# ─── 小华工作日志(行为记忆 · D-023) ──────────────────────

@app.get("/api/work-log/status")
def work_log_status():
    """看行为记忆开关 + 当前日志体积。"""
    from backend.services import work_log
    return work_log.status()


class WorkLogToggleReq(BaseModel):
    enabled: bool


@app.post("/api/work-log/toggle")
def work_log_toggle(req: WorkLogToggleReq):
    """开关行为记忆写入。enabled=true 后,每次 AI 调用追加到 Obsidian 日志。"""
    settings_service.update({"work_log_enabled": bool(req.enabled)})
    from backend.services import work_log
    return work_log.status()


@app.get("/api/work-log/recent")
def work_log_recent(limit: int = 20):
    """最近 N 条行为记忆(给前端调试页或首页 widget 用)。"""
    from backend.services import work_log
    return {"entries": work_log.recent_entries(limit=limit)}


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
    """4 方块 + 1 热点条的统计数据 (D-024 接入 ai_calls 真实数据)。"""
    import time as _t
    import sqlite3
    from contextlib import closing
    from shortvideo.config import DB_PATH
    from backend.services import ai_usage

    now = int(_t.time())
    day = 86400
    week_start = now - day * 7
    yday_start = now - day * 2  # 昨天 = -2 天到 -1 天
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

    # 做视频(works 表): 进行中 / 今日 / 本周已发
    in_progress = sum(1 for w in all_works if w.status in ("generating", "ready", "pending"))
    today_works = sum(1 for w in all_works if w.created_at >= today_start)
    published_week = sum(1 for w in all_works if w.status == "published" and w.created_at >= week_start)

    # 各 skill 调用次数(ai_calls 表): 按 route_key 聚合
    ai_usage._ensure_schema()
    counts: dict[str, dict[str, int]] = {"today": {}, "yesterday": {}, "week": {}}
    try:
        with closing(sqlite3.connect(DB_PATH)) as con:
            for label, since, until in [
                ("today",     today_start,  now),
                ("yesterday", yday_start,   today_start),
                ("week",      week_start,   now),
            ]:
                rows = con.execute(
                    "SELECT route_key, COUNT(*) FROM ai_calls "
                    "WHERE ts >= ? AND ts < ? AND ok = 1 "
                    "GROUP BY route_key", (since, until),
                ).fetchall()
                counts[label] = {rk: c for rk, c in rows}
    except Exception:
        pass

    def _sum(period: str, prefixes: list[str]) -> int:
        d = counts.get(period, {})
        return sum(c for rk, c in d.items() if any(rk.startswith(p) for p in prefixes))

    # ad 卡: touliu.* + ad.* 合计(批量投流文案)
    ad_today = _sum("today", ["touliu.", "ad."])
    ad_yday  = _sum("yesterday", ["touliu.", "ad."])
    # wechat 卡: wechat.write(出长文 = 1 篇)
    wechat_today = counts["today"].get("wechat.write", 0)
    wechat_week  = sum(c for rk, c in counts["week"].items() if rk == "wechat.write")
    # moments 卡: moments.derive
    moments_today = counts["today"].get("moments.derive", 0)
    moments_yday  = counts["yesterday"].get("moments.derive", 0)

    return {
        "make": {
            "in_progress": in_progress, "today": today_works,
            "hint": f"最近 {in_progress} 条进行中" if in_progress else (
                f"今日已开 {today_works} 条" if today_works else "还没有进行中的视频,点开始做"
            ),
        },
        "ad": {
            "today": ad_today, "yesterday": ad_yday,
            "hint": (f"今日 {ad_today} 批 · 昨日 {ad_yday}" if ad_today
                     else (f"昨日 {ad_yday} 批" if ad_yday else "今日还没出过投流")),
        },
        "wechat": {
            "today": wechat_today, "week": wechat_week,
            "hint": (f"今日 {wechat_today} 篇 · 本周共 {wechat_week}" if wechat_today
                     else (f"本周写过 {wechat_week} 篇" if wechat_week else "本周还没写过公众号")),
        },
        "moments": {
            "today": moments_today, "yesterday": moments_yday,
            "hint": (f"今日 {moments_today} 组 · 昨日 {moments_yday}" if moments_today
                     else (f"昨天 {moments_yday} 组" if moments_yday else "今日还没发朋友圈")),
        },
        "hot": top_hot,
        "_published_week": published_week,  # 调试字段,前端不一定用
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


def _dedup_topic_title(title: str, existing_prefixes: set[str]) -> bool:
    """前 5 字重复算重 · True = 通过,False = 拒绝。"""
    key = re.sub(r"\s+", "", title)[:5]
    if not key or key in existing_prefixes:
        return False
    existing_prefixes.add(key)
    return True


@app.post("/api/topics/generate")
def topics_generate(req: TopicGenReq):
    """选题批量生成 (D-025 优化): 结构化输出 + 自动去重 + 字数过滤 + 避免和已有库重复。"""
    kb_chunks = kb_service.match(req.seed, k=3) if req.seed else []
    recent = list_topics(limit=30)  # 最近 30 条让 AI 知道"别再出这些"

    kb_block = ""
    if kb_chunks:
        kb_block = "\n\n【可参考的清华哥业务素材】\n" + "\n".join(
            f"- [{c['title']}] {c['preview']}" for c in kb_chunks
        )
    recent_block = ""
    if recent:
        recent_block = "\n\n【最近已入库选题(不要重复这些方向)】\n" + "\n".join(
            f"- {t.title}" for t in recent[:20]
        )

    # D-032: 注入效果反哺 patterns(若 metrics 表有数据)
    insights_block = ""
    try:
        from backend.services import insights
        wp = insights.winning_patterns()
        if wp.get("patterns"):
            insights_block = "\n\n【你过往跑量好的作品共性 · 参考但不照抄】\n" + wp["patterns"]
    except Exception:
        pass

    prompt = f"""基于下面主题和清华哥人设,出 {req.n} 个犀利的选题(短视频或公众号都能用)。

要求:
- 每个选题 10-20 字,不空泛不标签化
- 覆盖不同角度:痛点/反常识/故事/数据/对比/热点借势
- 不要和「最近已入库选题」重复相同方向
- 为每个选题配一句"为什么这选题能打中清华哥粉丝"
- 标 2-3 个简短 tags(如"AI获客""实体老板""私域"等)
{kb_block}{recent_block}{insights_block}

【本次主题】{req.seed}

严格 JSON 数组(不加前言):
[
  {{"title": "选题标题", "angle": "痛点/反常识/故事/数据/对比/热点借势 其中之一",
    "why": "一句话说为什么能打中清华哥粉丝",
    "tags": ["AI获客", "实体老板"],
    "suggested_format": "短视频/公众号长文/投流 选一个"}},
  ...
]"""
    ai = get_ai_client(route_key="topics.generate")
    r = ai.chat(prompt, max_tokens=2500, temperature=0.9, deep=req.deep)

    import json as _json
    m = re.search(r"\[[\s\S]*\]", r.text or "")
    items_raw: list[dict] = []
    if m:
        try:
            parsed = _json.loads(m.group(0))
            items_raw = [x for x in parsed if isinstance(x, dict) and x.get("title")]
        except Exception:
            items_raw = []

    # 去重 + 字数过滤
    existing_prefixes = {re.sub(r"\s+", "", t.title)[:5] for t in recent if t.title}
    items: list[dict] = []
    dropped = {"too_long": 0, "too_short": 0, "duplicate": 0}
    for it in items_raw:
        title = (it.get("title") or "").strip()
        if len(title) > 25:
            dropped["too_long"] += 1; continue
        if len(title) < 6:
            dropped["too_short"] += 1; continue
        if not _dedup_topic_title(title, existing_prefixes):
            dropped["duplicate"] += 1; continue
        items.append({
            "title": title,
            "angle": (it.get("angle") or "").strip(),
            "why": (it.get("why") or "").strip(),
            "tags": it.get("tags") or [],
            "suggested_format": (it.get("suggested_format") or "").strip(),
        })
        if len(items) >= req.n:
            break

    # 入库:title + description(why) + tags(逗号拼)
    created_ids = []
    for item in items:
        tid = insert_topic(
            title=item["title"][:100],
            description=item["why"][:500] if item["why"] else None,
            tags=",".join(item["tags"])[:200] if item["tags"] else None,
            source="ai-batch",
        )
        created_ids.append(tid)

    # 兼容旧接口(前端可能还用 titles 字段)
    titles = [it["title"] for it in items]
    return {
        "titles": titles, "items": items, "ids": created_ids,
        "kb_used": [c["path"] for c in kb_chunks],
        "stats": {"generated": len(items_raw), "kept": len(items), **dropped},
    }


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


from backend.services import planner_pipeline
from backend.services import compliance_pipeline
# ═══════════════════════════════════════════════════════════════════
# 公众号文章 skill 接入(D-010)
# Skill 源: ~/Desktop/skills/公众号文章/
# Phase 1-2 (本 commit): 标题 / 大纲 / 长文+三层自检
# Phase 2.5-5 在下一 commit 接入
# ═══════════════════════════════════════════════════════════════════

WECHAT_SKILL_SLUG = "公众号文章"


@app.get("/api/wechat/skill-info")
def wechat_skill_info():
    """供前端展示"正在用技能:公众号文章 · XX 字"标识。"""
    try:
        return skill_loader.skill_info(WECHAT_SKILL_SLUG)
    except skill_loader.SkillNotFound as e:
        raise HTTPException(404, str(e))


class WechatTitlesReq(BaseModel):
    topic: str
    n: int = 3


@app.post("/api/wechat/titles")
def wechat_titles(req: WechatTitlesReq):
    titles = wechat_pipeline.gen_titles(req.topic, n=req.n)
    return {"titles": titles}


class WechatOutlineReq(BaseModel):
    topic: str
    title: str


@app.post("/api/wechat/outline")
def wechat_outline(req: WechatOutlineReq):
    outline = wechat_pipeline.gen_outline(req.topic, req.title)
    return outline


class WechatWriteReq(BaseModel):
    topic: str
    title: str
    outline: dict[str, Any] = Field(default_factory=dict)


@app.post("/api/wechat/write")
def wechat_write(req: WechatWriteReq):
    result = wechat_pipeline.write_article(req.topic, req.title, req.outline)
    return result


# ─── 局部重写 (D-036) ────────────────────────────────────

class WechatRewriteSectionReq(BaseModel):
    full_article: str
    selected: str            # 选中要改的那段(必须是 full_article 的子串)
    instruction: str = ""    # 改写指令


@app.post("/api/wechat/rewrite-section")
def wechat_rewrite_section(req: WechatRewriteSectionReq):
    if not req.selected.strip():
        raise HTTPException(400, "selected 不能为空")
    if req.selected not in req.full_article:
        raise HTTPException(400, "selected 不是 full_article 的子串")
    return wechat_pipeline.rewrite_section(req.full_article, req.selected, req.instruction)


# ─── Phase 2.5 · 段间配图 ───────────────────────────────────

class WechatPlanImagesReq(BaseModel):
    content: str
    title: str
    n: int = 4


@app.post("/api/wechat/plan-images")
def wechat_plan_images(req: WechatPlanImagesReq):
    """AI 产 n 条段间配图 prompt(不真生图),给前端确认后再调 /section-image。"""
    plans = wechat_scripts.plan_section_images(req.content, req.title, n=req.n)
    return {"plans": plans}


class WechatSectionImageReq(BaseModel):
    prompt: str
    size: str = "16:9"


@app.post("/api/wechat/section-image")
def wechat_section_image(req: WechatSectionImageReq):
    """真生一张图(30-60s,可能更久),上传微信图床,返回 mmbiz URL。"""
    try:
        return wechat_scripts.gen_section_image(req.prompt, size=req.size)
    except wechat_scripts.WechatScriptError as e:
        raise HTTPException(500, str(e))


# ─── Phase 3 · HTML 拼装 ─────────────────────────────────────

class WechatHtmlReq(BaseModel):
    title: str
    content_md: str
    section_images: list[dict[str, Any]] = Field(default_factory=list)
    hero_badge: str = "老板必看"
    hero_highlight: str = ""
    hero_subtitle: str = ""
    template: str = "v3-clean"  # v3-clean / v2-magazine / v1-dark (D-034)


@app.post("/api/wechat/html")
def wechat_html(req: WechatHtmlReq):
    try:
        return wechat_scripts.assemble_html(
            title=req.title,
            content_md=req.content_md,
            section_images=req.section_images,
            hero_badge=req.hero_badge,
            hero_highlight=req.hero_highlight,
            hero_subtitle=req.hero_subtitle,
            template=req.template,
        )
    except wechat_scripts.WechatScriptError as e:
        raise HTTPException(500, str(e))


@app.get("/api/wechat/templates")
def wechat_templates():
    """返回可用的 HTML 模板列表 (D-034)。"""
    return {"templates": wechat_scripts.list_templates()}


# ─── Phase 4 · 封面 ──────────────────────────────────────────

class WechatCoverReq(BaseModel):
    title: str
    label: str = "清华哥说"
    n: int = 4   # D-035: 4 选 1, 旧调用 n=1 走 Chrome 模板单张


@app.post("/api/wechat/cover")
def wechat_cover(req: WechatCoverReq):
    """D-035: 默认 n=4 走 apimart GPT-Image-2 出 4 张候选,4 选 1 不满意再来一批。
    n=1 时走旧 Chrome 模板单张(兼容)."""
    try:
        if req.n >= 2:
            return wechat_scripts.gen_cover_batch(req.title, n=max(2, min(req.n, 8)))
        # 旧路径: Chrome 模板单张
        r = wechat_scripts.gen_cover(req.title, label=req.label)
        p = Path(r["local_path"])
        if p.exists():
            target_dir = DATA_DIR / "wechat-cover"
            target_dir.mkdir(parents=True, exist_ok=True)
            import shutil
            target = target_dir / p.name
            shutil.copy2(p, target)
            r["media_url"] = media_url(target)
            r["local_path_served"] = str(target)
        return r
    except wechat_scripts.WechatScriptError as e:
        raise HTTPException(500, str(e))


# ─── Phase 5 · 推送草稿箱 ────────────────────────────────────

class WechatPushReq(BaseModel):
    title: str
    digest: str
    html_path: str   # /tmp/preview/wechat_article.html
    cover_path: str  # /tmp/preview/cover.jpg 或 data/wechat-cover/xxx.jpg
    author: str = "清华哥"


@app.post("/api/wechat/push")
def wechat_push(req: WechatPushReq):
    try:
        return wechat_scripts.push_to_wechat(
            title=req.title,
            digest=req.digest,
            html_path=req.html_path,
            cover_path=req.cover_path,
            author=req.author,
        )
    except wechat_scripts.WechatScriptError as e:
        raise HTTPException(500, str(e))


# ═══════════════════════════════════════════════════════════════════
# 热点文案改写V2 skill 接入 (D-012)
# Skill 源: ~/Desktop/skills/热点文案改写V2/SKILL.md
# 3 步: analyze(拆解+3角度) → write(1800-2600字+六维自检) → done
# ═══════════════════════════════════════════════════════════════════

HOTREWRITE_SKILL_SLUG = "热点文案改写V2"


@app.get("/api/hotrewrite/skill-info")
def hotrewrite_skill_info():
    try:
        return skill_loader.skill_info(HOTREWRITE_SKILL_SLUG)
    except skill_loader.SkillNotFound as e:
        raise HTTPException(404, str(e))


class HotrewriteAnalyzeReq(BaseModel):
    hotspot: str


@app.post("/api/hotrewrite/analyze")
def hotrewrite_analyze(req: HotrewriteAnalyzeReq):
    return hotrewrite_pipeline.analyze_hotspot(req.hotspot)


class HotrewriteWriteReq(BaseModel):
    hotspot: str
    breakdown: dict[str, Any] = Field(default_factory=dict)
    angle: dict[str, Any] = Field(default_factory=dict)


@app.post("/api/hotrewrite/write")
def hotrewrite_write(req: HotrewriteWriteReq):
    return hotrewrite_pipeline.write_script(req.hotspot, req.breakdown, req.angle)


# ═══════════════════════════════════════════════════════════════════
# 录音文案改写 skill 接入 (D-013)
# Skill 源: ~/Desktop/skills/录音文案改写/
# 3 步: analyze(提骨架+2角度) → write(轻改写+自检清单) → done
# ═══════════════════════════════════════════════════════════════════

VOICEREWRITE_SKILL_SLUG = "录音文案改写"


@app.get("/api/voicerewrite/skill-info")
def voicerewrite_skill_info():
    try:
        return skill_loader.skill_info(VOICEREWRITE_SKILL_SLUG)
    except skill_loader.SkillNotFound as e:
        raise HTTPException(404, str(e))


class VoicerewriteAnalyzeReq(BaseModel):
    transcript: str


@app.post("/api/voicerewrite/analyze")
def voicerewrite_analyze(req: VoicerewriteAnalyzeReq):
    return voicerewrite_pipeline.analyze_recording(req.transcript)


class VoicerewriteWriteReq(BaseModel):
    transcript: str
    skeleton: dict[str, Any] = Field(default_factory=dict)
    angle: dict[str, Any] = Field(default_factory=dict)


@app.post("/api/voicerewrite/write")
def voicerewrite_write(req: VoicerewriteWriteReq):
    return voicerewrite_pipeline.write_script(req.transcript, req.skeleton, req.angle)


# ═══════════════════════════════════════════════════════════════════
# touliu-agent skill 接入 (D-014) — 替换旧 /api/ad/generate
# Skill 源: ~/Desktop/skills/touliu-agent/
# 一次生成 n 条投流文案(按结构分配) + lint 本地质检
# 旧 /api/ad/generate 保留不动作为 fallback
# ═══════════════════════════════════════════════════════════════════

TOULIU_SKILL_SLUG = "touliu-agent"


@app.get("/api/touliu/skill-info")
def touliu_skill_info():
    try:
        return skill_loader.skill_info(TOULIU_SKILL_SLUG)
    except skill_loader.SkillNotFound as e:
        raise HTTPException(404, str(e))


class TouliuGenerateReq(BaseModel):
    pitch: str
    industry: str = "通用老板"
    target_action: str = "点头像进直播间"
    n: int = 10
    channel: str = "直播间"
    run_lint: bool = True


@app.post("/api/touliu/generate")
def touliu_generate(req: TouliuGenerateReq):
    result = touliu_pipeline.generate_batch(
        pitch=req.pitch,
        industry=req.industry,
        target_action=req.target_action,
        n=max(3, min(req.n, 15)),
        channel=req.channel,
    )
    # 顺手 lint 一下,失败不阻塞返回
    if req.run_lint and result.get("batch"):
        target_map = {"点头像进直播间": "live", "留资": "reserve", "加私域": "private", "到店": "visit"}
        ta = target_map.get(req.target_action, "live")
        result["lint"] = touliu_pipeline.lint_batch(result["batch"], target_action=ta)
    return result


class TouliuLintReq(BaseModel):
    batch: list[dict[str, Any]] = Field(default_factory=list)
    target_action: str = "live"


@app.post("/api/touliu/lint")
def touliu_lint(req: TouliuLintReq):
    return touliu_pipeline.lint_batch(req.batch, target_action=req.target_action)




# ═══════════════════════════════════════════════════════════════════
# content-planner skill 接入 (D-017 骨架,根据实际调整)
# Skill 源: ~/Desktop/skills/content-planner/
# ═══════════════════════════════════════════════════════════════════

PLANNER_SKILL_SLUG = "content-planner"


@app.get("/api/planner/skill-info")
def planner_skill_info():
    try:
        return skill_loader.skill_info(PLANNER_SKILL_SLUG)
    except skill_loader.SkillNotFound as e:
        raise HTTPException(404, str(e))


class PlannerAnalyzeReq(BaseModel):
    brief: str   # 活动描述: "下周三给 200 个老板讲 AI 内容获客,有 1 个助理"


@app.post("/api/planner/analyze")
def planner_analyze(req: PlannerAnalyzeReq):
    return planner_pipeline.analyze_event(req.brief)


class PlannerWriteReq(BaseModel):
    brief: str
    detected: dict[str, Any] = Field(default_factory=dict)
    level: dict[str, Any] = Field(default_factory=dict)


@app.post("/api/planner/write")
def planner_write(req: PlannerWriteReq):
    return planner_pipeline.write_plan(req.brief, req.detected, req.level)




# ═══════════════════════════════════════════════════════════════════
# 违禁违规审查-学员版 skill 接入 (D-017 骨架,根据实际调整)
# Skill 源: ~/Desktop/skills/违禁违规审查-学员版/
# ═══════════════════════════════════════════════════════════════════

COMPLIANCE_SKILL_SLUG = "违禁违规审查-学员版"


@app.get("/api/compliance/skill-info")
def compliance_skill_info():
    try:
        return skill_loader.skill_info(COMPLIANCE_SKILL_SLUG)
    except skill_loader.SkillNotFound as e:
        raise HTTPException(404, str(e))


class ComplianceCheckReq(BaseModel):
    text: str
    industry: str = "通用"   # 大健康/美业/教育/金融/医美/通用


@app.post("/api/compliance/check")
def compliance_check(req: ComplianceCheckReq):
    """单 step 审查: 报告 + 必出 2 版改写(保守/营销)。"""
    return compliance_pipeline.check_compliance(req.text, req.industry)


# 保留 analyze/write 骨架路径以兼容 add_skill 统一约定
class ComplianceAnalyzeReq(BaseModel):
    input: str


@app.post("/api/compliance/analyze")
def compliance_analyze(req: ComplianceAnalyzeReq):
    return compliance_pipeline.analyze_input(req.input)


class ComplianceWriteReq(BaseModel):
    input: str
    analysis: dict[str, Any] = Field(default_factory=dict)
    angle: dict[str, Any] = Field(default_factory=dict)


@app.post("/api/compliance/write")
def compliance_write(req: ComplianceWriteReq):
    return compliance_pipeline.write_output(req.input, req.analysis, req.angle)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000, log_level="info")
