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
import threading
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
from backend.services import baokuan_pipeline
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
    {"name": "短视频", "description": "做视频流水线 (转写/语音克隆/数字人合成/封面/发布)"},
    {"name": "朋友圈", "description": "朋友圈衍生 skill"},
    {"name": "v5 视频", "description": "数字人成片 v5 模板化 (D-059) — 下游套模板, 数字人 mp4 是上游复用资源"},
    {"name": "档案部", "description": "素材库 / 作品库 / 知识库 / 热点 / 选题"},
    {"name": "设置", "description": "全局配置 / 偏好学习 / 行为记忆 / 工作日志开关"},
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


# D-070: 访客模式中间件 — 读 X-Guest-Mode header → 写 contextvar.
# 各服务 (work_log/preference/insert_work/persona) 自己读 contextvar 决定写不写.
@app.middleware("http")
async def _guest_mode_middleware(request, call_next):
    from backend.services import guest_mode
    flag = request.headers.get("X-Guest-Mode", "").strip() in ("1", "true", "yes")
    token = guest_mode.set_guest(flag)
    try:
        return await call_next(request)
    finally:
        guest_mode.reset(token)

# 静态资源 — 让前端拿到本地生成的图/音频/视频
app.mount("/media", StaticFiles(directory=str(DATA_DIR)), name="media")

# D-059d: 暴露 dhv5 skill outputs 给前端播放渲染产物
_DHV5_OUTPUTS = Path.home() / "Desktop/skills/digital-human-video-v5/outputs"
if _DHV5_OUTPUTS.exists():
    app.mount("/skills/dhv5/outputs", StaticFiles(directory=str(_DHV5_OUTPUTS)), name="dhv5-outputs")

# D-060a: 暴露 dhv5 brolls 给前端 align step 预览缩略
_DHV5_BROLLS = Path.home() / "Desktop/skills/digital-human-video-v5/assets/brolls"
if _DHV5_BROLLS.exists():
    app.mount("/skills/dhv5/brolls", StaticFiles(directory=str(_DHV5_BROLLS)), name="dhv5-brolls")

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
    n: int = 2  # D-064 统一 2 张候选 (旧默认 4)
    size: str = "9:16"
    engine: str | None = None  # D-064 apimart / dreamina · None 用 settings 默认


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


def _run_cover_task(task_id: str, prompt: str, size: str, engine: str | None = None):
    """D-064: 走 image_engine 抽象, 支持切 apimart / dreamina."""
    COVER_TASKS[task_id] = {"status": "running", "url": None, "local_path": None, "error": None, "started": time.time(), "engine": engine}
    try:
        from shortvideo import image_engine
        r = image_engine.generate(prompt, size=size, n=1, engine=engine, label="cover")
        imgs = r.get("images") or []
        if imgs and not imgs[0].get("error"):
            img = imgs[0]
            local_path = img.get("local_path")
            COVER_TASKS[task_id].update(
                status="succeed",
                url=img.get("url"),
                local_path=local_path,
                media_url=img.get("media_url") or (media_url(local_path) if local_path else None),
                elapsed_sec=r.get("elapsed_sec"),
                engine=r.get("engine"),
            )
        else:
            err = imgs[0].get("error", "unknown") if imgs else "no images"
            COVER_TASKS[task_id].update(status="failed", error=err)
    except Exception as e:
        COVER_TASKS[task_id].update(status="failed", error=f"{type(e).__name__}: {e}")


# --------- 启动钩子: SQLite schema migrations (D-084, 必须最先) ----------
@app.on_event("startup")
def _apply_db_migrations():
    """uvicorn boot 时一次性建好/补齐所有表 schema. 必须在 recover_orphans/watcher 之前.

    pytest 不触发 startup event, 测试 fixture 自己调 migrations.apply_migrations().
    挂了直接 raise: schema 不可用时后续 startup hook 必撞错, 早死早超生.
    """
    import logging
    log = logging.getLogger("migrations")
    try:
        from backend.services import migrations
        version = migrations.apply_migrations()
        log.info(f"db schema applied, version={version}")
    except Exception as e:
        log.error(f"migrations failed: {e}")
        raise


# --------- 启动钩子: 小华夜班调度器 (D-040c) ----------
@app.on_event("startup")
def _start_night_scheduler():
    """uvicorn boot 时把 enabled+cron 的夜班任务挂上 APScheduler.
    pytest 不会触发 startup event, 所以测试不会启动真调度."""
    try:
        # D-040f: 先 import night_runners 触发 register_all() 把 4 个 runner 注册到 executor.
        # 不然 cron fire 时找不到 runner 走 _placeholder_runner 兜底.
        from backend.services import night_runners  # noqa: F401
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


# --------- 启动钩子: 孤儿任务回收 + 周期 watchdog (D-068) ----------
@app.on_event("startup")
def _recover_orphan_tasks():
    """uvicorn boot 时把上次进程没收尾的 pending/running 任务全标 failed.
    场景: --reload 改文件 / 进程崩 / Ctrl-C → daemon 工作线程死, DB 卡 running 永远轮询.
    同步收尾 night_job_runs (D-068b) 和 tasks 两层. 再挂上周期 watchdog (60s 一次)."""
    import logging
    log = logging.getLogger("tasks")
    try:
        from backend.services import tasks as tasks_service
        from backend.services import night_shift
        n_tasks = tasks_service.recover_orphans()
        if n_tasks:
            log.warning(f"recovered {n_tasks} orphan tasks (服务重启,任务中断)")
        n_runs = night_shift.recover_orphan_runs()
        if n_runs:
            log.warning(f"recovered {n_runs} orphan night runs")
        if tasks_service.start_watchdog():
            log.info("watchdog started (60s sweep stuck running)")
        # T10: 老 task 自动 cleanup (24h 一次)
        if tasks_service.start_cleanup():
            log.info("task cleanup started (24h tick, ok>7d / failed>30d)")
    except Exception as e:
        log.error(f"orphan/watchdog setup failed: {e}")


# --------- 启动钩子: 远程长任务 watcher (D-078) ----------
@app.on_event("startup")
def _start_remote_jobs_watcher():
    """启动 remote_jobs watcher daemon (60s 一 tick), 让即梦/数字人/出图等远程任务排队
    不假 fail. 进程重启自动接管 last_status 不是终态的 row.

    各 provider (dreamina/hedra/apimart) 在自家 service 里调 register_provider 注册.
    这里只起 watcher 主循环, 没 provider 就 log warning + skip (安全降级).
    """
    import logging
    log = logging.getLogger("remote_jobs")
    try:
        from backend.services import remote_jobs
        # 触发 dreamina provider 注册 (D-078b 接入)
        try:
            from backend.services import dreamina_service as _ds
            if hasattr(_ds, "register_with_watcher"):
                _ds.register_with_watcher()
        except Exception as e:
            log.warning(f"dreamina register_with_watcher skipped: {e}")
        # D-079 shiliu (数字人) provider
        try:
            from backend.services import shiliu_service as _ss
            if hasattr(_ss, "register_with_watcher"):
                _ss.register_with_watcher()
        except Exception as e:
            log.warning(f"shiliu register_with_watcher skipped: {e}")
        # D-080/081 apimart (出图/封面) provider
        try:
            from backend.services import apimart_service as _as
            if hasattr(_as, "register_with_watcher"):
                _as.register_with_watcher()
        except Exception as e:
            log.warning(f"apimart register_with_watcher skipped: {e}")
        if remote_jobs.start_watcher():
            log.info(f"remote_jobs watcher started (60s tick), providers={remote_jobs.list_providers()}")
    except Exception as e:
        log.error(f"remote_jobs watcher setup failed: {e}")


# --------- Endpoints ----------
@app.get("/api/health", tags=["总部"], summary="健康检查 + 各依赖探活")
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
@app.post("/api/transcribe/submit", tags=["短视频"], summary="ASR 转写提交 (URL 链接)")
def transcribe_submit(req: TranscribeReq):
    try:
        with QingdouClient() as c:
            batch_id = c.commit(req.url)
        return {"batch_id": batch_id}
    except QingdouError as e:
        raise HTTPException(400, str(e))


@app.get("/api/transcribe/query/{batch_id}", tags=["短视频"], summary="查转写结果")
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
@app.post("/api/rewrite", tags=["短视频"], summary="改写口播文案 (走 ai 关卡层 + persona)")
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
@app.get("/api/speakers", tags=["短视频"], summary="CosyVoice 已克隆的声音列表")
def speakers():
    with ShiliuClient() as c:
        items = c.list_speakers()
    return [{"id": s.speaker_id, "title": s.title} for s in items]


@app.post("/api/voice/upload", tags=["短视频"], summary="上传音频参考样本 (供克隆用)")
async def voice_upload(file: UploadFile = File(...)):
    """上传一个音频文件作为参考样本,供 CosyVoice 克隆使用。"""
    ext = Path(file.filename or "sample.wav").suffix or ".wav"
    out = UPLOAD_DIR / f"upload_{int(time.time())}_{uuid.uuid4().hex[:6]}{ext}"
    data = await file.read()
    out.write_bytes(data)
    return {"path": str(out), "media_url": media_url(out), "size": len(data), "name": file.filename}


@app.post("/api/voice/clone", tags=["短视频"], summary="CosyVoice 克隆 (基于参考样本生成 speaker)")
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
@app.get("/api/avatars", tags=["短视频"], summary="数字人形象列表 (柿榴 sidecar)")
def avatars():
    with ShiliuClient() as c:
        items = c.list_avatars()
    return [{"id": a.avatar_id, "title": a.title} for a in items]


# ---- P5: 剪辑模板 ----
@app.get("/api/templates", tags=["短视频"], summary="视频模板列表 (柿榴)")
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
@app.post("/api/video/submit", tags=["短视频"], summary="数字人视频合成提交 (柿榴 异步)")
def video_submit(req: VideoSubmitReq):
    """D-079: 提交后建 task + register remote_job, watcher 接管轮询.
    旧字段 video_id / work_id 保留兼容前端 setInterval polling (双兜底)."""
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

    # D-079: 接 remote_jobs watcher
    try:
        from backend.services import tasks as tasks_service
        from backend.services import remote_jobs
        task_id = tasks_service.create_task(
            kind="shiliu.video",
            label=f"数字人视频 · {(req.title or req.text[:20])[:24]}",
            ns="shiliu",
            page_id="make",
            step="video",
            payload={
                "shiliu_video_id": vid,
                "work_id": wid,
                "title": req.title or req.text[:20],
                "text_preview": req.text[:200],
                "remote_managed": True,  # D-078 watchdog 跳过
                "submit_id": str(vid),
            },
            estimated_seconds=180,
        )
        tasks_service.update_progress(task_id, f"已提交柿榴 (video_id={vid}), 等远程出结果...", pct=20)
        remote_jobs.register(
            provider="shiliu",
            submit_id=str(vid),
            task_id=task_id,
            submit_payload={
                "work_id": wid,
                "title": req.title or req.text[:20],
                "text_preview": req.text[:200],
            },
            max_wait_sec=3600,  # 数字人一般 3-10min, 1h 兜底
        )
    except Exception as e:
        # 不破坏旧路径 — task/remote_jobs 失败不影响 video_id 返回
        import logging
        logging.getLogger("shiliu").warning(f"D-079 task/remote_jobs register skipped: {e}")
        task_id = None

    return {"video_id": vid, "work_id": wid, "estimated_length_ms": length_ms, "task_id": task_id}


@app.get("/api/video/query/{video_id}", tags=["短视频"], summary="查视频合成结果")
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
@app.post("/api/cover", tags=["短视频"], summary="出短视频/朋友圈封面 (异步, n 个 task_id)")
def cover_create(req: CoverReq):
    """D-064: 走 image_engine 抽象, 默认 2 张候选, 支持 engine 切换 (apimart / dreamina).

    返回 {tasks: [{task_id}, ...], engine}. 前端轮询每个 /api/cover/query/{task_id}.
    """
    tasks = []
    for _ in range(max(1, min(req.n, 8))):
        tid = uuid.uuid4().hex[:12]
        prompt = cover_prompt(req.slogan, req.category)
        COVER_TASKS[tid] = {"status": "pending"}
        import threading
        threading.Thread(target=_run_cover_task, args=(tid, prompt, req.size, req.engine), daemon=True).start()
        tasks.append({"task_id": tid})
    # 把实际生效的 engine 回传给前端 (None 时按 settings 默认)
    from shortvideo import image_engine as _ie
    actual_engine = req.engine or _ie.get_default_engine()
    return {"tasks": tasks, "engine": actual_engine}


@app.get("/api/cover/query/{task_id}", tags=["短视频"], summary="查封面生成结果")
def cover_query(task_id: str):
    t = COVER_TASKS.get(task_id)
    if not t:
        raise HTTPException(404, "task not found")
    return t


# ---- 发布(模拟态) ----
@app.post("/api/publish", tags=["短视频"], summary="发布作品 (登记到 works 库, 不真发各平台)")
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
# AI 探活 60s 缓存: 真打 AI 要 5-7s, 设置页加载 / 多 page 同时进会重复打.
# fresh=1 query 强制重探.
_AI_HEALTH_CACHE: dict = {"data": None, "ts": 0}
_AI_HEALTH_TTL = 60  # 秒


@app.get("/api/ai/health", tags=["AI"], summary="AI 引擎元信息 + 探活 (60s 缓存, fresh=1 强探)")
def ai_health(fresh: int = 0):
    """实测 ping 一次 AI 引擎要 5-7s, 设置页首屏会感觉卡. 60s 内复用结果, 用户点 '↻ 重探' 时传 fresh=1."""
    now = time.time()
    if not fresh and _AI_HEALTH_CACHE["data"] and (now - _AI_HEALTH_CACHE["ts"]) < _AI_HEALTH_TTL:
        return {**_AI_HEALTH_CACHE["data"], "_cached_age_sec": round(now - _AI_HEALTH_CACHE["ts"], 1)}
    info = get_ai_info()
    _AI_HEALTH_CACHE["data"] = info
    _AI_HEALTH_CACHE["ts"] = now
    return {**info, "_cached_age_sec": 0}


@app.get("/api/ai/models", tags=["AI"], summary="可用 Opus 模型列表 (settings 切换用)")
def ai_models():
    return {"models": list_opus_models()}


@app.get("/api/ai/routes", tags=["AI"], summary="引擎路由表 (默认 + 用户 override + 实际生效)")
def ai_routes():
    """返回当前的引擎路由表(默认 + 用户 override + 实际生效)。"""
    return routes_info()


@app.get("/api/ai/usage", tags=["AI"], summary="AI 用量聚合统计 (D-015)")
def ai_usage_endpoint(range: str = "today"):
    """AI 调用用量聚合统计 (D-015)。range: today|yesterday|week|month|all"""
    from backend.services import ai_usage
    return ai_usage.get_usage(range_=range)


@app.get("/api/ai/usage/recent", tags=["AI"], summary="最近 N 次 AI 调用明细 (调试用)")
def ai_usage_recent(limit: int = 50):
    """最近 N 次 AI 调用明细(调试用)。"""
    from backend.services import ai_usage
    return {"calls": ai_usage.recent_calls(limit=limit)}


@app.get("/api/skills/catalog", tags=["总部"], summary="技能中心目录 (已接入 + 桌面发现)")
def skills_catalog():
    """返回技能中心的完整目录: 已接入的 skill + 桌面 ~/Desktop/skills/ 里发现的未接入 skill."""
    return {"skills": registered_skills.list_catalog()}


# ─── 全局任务清单 (D-037a) ───────────────────────────────
# 只读 + 取消。endpoint 异步化在 D-037b 做。

@app.get("/api/tasks", tags=["全局任务"], summary="任务列表 + 状态计数")
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


@app.get("/api/tasks/{task_id}", tags=["全局任务"], summary="任务详情 (404 if not found)")
def tasks_get(task_id: str):
    from backend.services import tasks as tasks_service
    t = tasks_service.get_task(task_id)
    if not t:
        raise HTTPException(status_code=404, detail="task not found")
    return t


@app.post("/api/tasks/{task_id}/cancel", tags=["全局任务"], summary="软取消任务 (409 if already finished)")
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


@app.post("/api/night/seed-defaults", tags=["小华夜班"], summary="一键加 4 条预设任务")
def night_seed_defaults():
    """幂等: 创建 4 条预设 (凌晨抓热点 / 一鱼多吃 / 知识库整理 / 昨日复盘).
    已存在 (按 name 匹配) 跳过. 默认 enabled=False, 用户审一遍再开."""
    from backend.services import night_runners
    result = night_runners.seed_defaults()
    # 触发调度器重读 (新增的若 enabled=True 立即生效)
    _reload_night_scheduler_silent()
    return result


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

@app.get("/api/dreamina/info", tags=["即梦 AIGC"], summary="CLI 探活 + 余额")
def dreamina_info():
    """探 ~/.local/bin/dreamina · 返回 {ok, version, credit: {points, ...}}.
    余额 ≥10 才能稳定生图. 不通常因为 dreamina CLI 没装或登录态过期."""
    info = dreamina_service.cli_info()
    credit = dreamina_service.user_credit() if info.get("ok") else {}
    return {**info, "credit": credit}


class DreaminaText2ImageReq(BaseModel):
    prompt: str = Field(..., description="生图 prompt (英文 / 中文都行)")
    ratio: str = Field("1:1", description="比例: 1:1 / 16:9 / 9:16 / 3:4 / 4:3")
    resolution_type: Optional[str] = Field(None, description="分辨率档: 1k / 2k / 4k")
    model_version: Optional[str] = Field(None, description="模型: 3.0 / 3.1 / 4.0 / 4.1 / 4.5 / 4.6 / 5.0 / lab")
    poll: int = Field(0, ge=0, le=120, description="同步轮询秒数, 0=异步立即返回 submit_id, ≤120s")


@app.post("/api/dreamina/text2image", tags=["即梦 AIGC"], summary="文生图")
def dreamina_text2image(req: DreaminaText2ImageReq):
    """submit_id 异步任务. poll>0 时同步等结果, =0 立即返回 submit_id 让前端轮询.
    单张消耗 ~30 credits (1k) / ~80 credits (2k)."""
    try:
        return dreamina_service.text2image(
            req.prompt, ratio=req.ratio,
            resolution_type=req.resolution_type,
            model_version=req.model_version,
            poll=max(0, min(req.poll, 120)),
        )
    except dreamina_service.DreaminaError as e:
        raise HTTPException(500, str(e))


class DreaminaImage2VideoReq(BaseModel):
    image: str = Field(..., description="本地图片绝对路径 (输入图)")
    prompt: str = Field(..., description="动作 prompt, 例 '人物缓慢走出'")
    duration: Optional[int] = Field(None, description="时长秒数, 默认 5s")
    video_resolution: Optional[str] = Field(None, description="分辨率: 720p / 1080p")
    model_version: Optional[str] = Field(None, description="模型: 3.0 / 3.0fast / 3.0pro / 3.5pro / seedance2.0 / seedance2.0fast")
    poll: int = Field(0, ge=0, le=180, description="同步轮询秒数, ≤180s")


@app.post("/api/dreamina/image2video", tags=["即梦 AIGC"], summary="图生视频")
def dreamina_image2video(req: DreaminaImage2VideoReq):
    """submit_id 异步. 5s 视频耗时 60-180s + 大量 credits (~300-500 各模型不一)."""
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
    submit_id: str = Field(..., description="text2image / image2video 返回的 submit_id")
    download: bool = Field(True, description="完成后是否下载到 data/dreamina/, 转 media_url")


@app.post("/api/dreamina/query", tags=["即梦 AIGC"], summary="查任务结果")
def dreamina_query(req: DreaminaQueryReq):
    """状态: pending / running / done / failed. done 时附 downloaded 路径列表 +
    media_urls (本地下载的转 /media/... URL 给前端预览)."""
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
        # D-065: 即梦产物入作品库 (done 时一次性写入). prompt/title 没保留, 用 submit_id.
        # D-075 patch: CLI 实际字段是 gen_status, 多字段兜底.
        _gen_status = (result.get("gen_status") or result.get("status") or result.get("Status") or "").lower()
        if (_gen_status in ("done", "succeed", "success") or result.get("downloaded")) and result.get("downloaded"):
            try:
                from shortvideo.works import insert_work
                import json as _json
                kind = (result.get("type") or "").lower()  # image / video
                wtype = "video" if "video" in kind else "image"
                for p in result["downloaded"]:
                    pp = Path(p)
                    if not pp.exists():
                        continue
                    insert_work(
                        type=wtype, source_skill="dreamina",
                        title=f"即梦 {wtype} · {pp.stem[:24]}",
                        local_path=str(pp),
                        thumb_path=str(pp) if wtype == "image" else None,
                        status="ready",
                        metadata=_json.dumps({
                            "submit_id": req.submit_id,
                            "filename": pp.name,
                            "kind": kind,
                        }, ensure_ascii=False),
                    )
            except Exception:
                pass
        return result
    except dreamina_service.DreaminaError as e:
        raise HTTPException(500, str(e))


@app.get("/api/dreamina/list-tasks", tags=["即梦 AIGC"], summary="历史任务列表")
def dreamina_list_tasks():
    """CLI 拉最近所有任务 (text2image + image2video 混排), 含 status / submit_id /
    prompt 摘要. 给前端 PageDreamina 历史区用."""
    return dreamina_service.list_tasks()


@app.post("/api/dreamina/recover/{submit_id}", tags=["即梦 AIGC"], summary="(D-078c) 失败/超时手动重查")
def dreamina_recover(submit_id: str):
    """对一个 submit_id 重查即梦 CLI 拿真终态.

    场景:
    - watcher timeout 标 task=failed 但即梦其实出来了 → 用户点"🔍 重查"补救
    - 用户从 list_tasks 历史里捞一个 submit_id 重新触发入库

    流程:
    1. 调 dreamina_service._poll_for_watcher(submit_id) 拿真终态
    2. done → 入作品库 + 找到关联的 remote_job 标 done + finish 关联 task
    3. failed → 标 failed
    4. 仍 querying → 重置 remote_job 为 pending, watcher 接管 (如果有 remote_job 行)
    """
    from backend.services import remote_jobs
    poll = dreamina_service._poll_for_watcher(submit_id)
    status = poll.get("status", "")
    result = poll.get("result")
    err = poll.get("error", "")

    rj = remote_jobs.get_by_submit_id(submit_id)

    out = {"submit_id": submit_id, "status": status, "error": err}

    if status == "done":
        # 入作品库
        if rj:
            try:
                dreamina_service._on_done_for_watcher(rj, result)
            except Exception as e:
                out["autoinsert_error"] = str(e)
            remote_jobs.mark_done(rj["id"], result=result)
            # finish 关联 task
            tid = rj.get("task_id")
            if tid:
                try:
                    from backend.services import tasks as tasks_service
                    t = tasks_service.get_task(tid)
                    if t and t["status"] in ("running", "failed"):
                        tasks_service.finish_task(tid, result=result, status="ok")
                except Exception:
                    pass
        else:
            # 没 remote_job 行 (老历史 task) → 直接入作品库
            try:
                from shortvideo.works import insert_work
                downloaded = (result or {}).get("downloaded") or []
                for p in downloaded:
                    pp = Path(p)
                    if pp.exists():
                        insert_work(
                            type="video" if pp.suffix.lower() in (".mp4",".mov",".webm") else "image",
                            source_skill="dreamina",
                            title=f"即梦 recover · {pp.stem[:24]}",
                            local_path=str(pp), thumb_path=None, status="ready",
                            metadata=json.dumps({"submit_id": submit_id, "route": "recover"}, ensure_ascii=False),
                        )
            except Exception as e:
                out["insert_error"] = str(e)
        out["result"] = result
        out["recovered"] = True

    elif status in ("failed", "fail", "error", "cancelled"):
        if rj:
            remote_jobs.mark_failed(rj["id"], error=err or status)
        out["recovered"] = False

    else:
        # 还在 querying / 未知 — 重置 watcher 接管
        if rj:
            remote_jobs.reset_for_recover(rj["id"])
            out["watcher_will_retry"] = True
        out["recovered"] = False

    return out


@app.get("/api/remote-jobs/by-task/{task_id}", tags=["即梦 AIGC"], summary="(D-078c) 由 task_id 查 remote_job")
def remote_jobs_by_task(task_id: str):
    """前端 TaskCard 失败态时用. 拿到 submit_id + last_status, 给 '🔍 重查' 按钮用."""
    from backend.services import remote_jobs
    from shortvideo.db import get_connection
    import sqlite3
    from contextlib import closing
    remote_jobs._ensure_schema()
    with closing(get_connection()) as con:
        con.row_factory = sqlite3.Row
        r = con.execute(
            "SELECT * FROM remote_jobs WHERE task_id=? ORDER BY submitted_at DESC LIMIT 1",
            (task_id,),
        ).fetchone()
    if not r:
        return {"ok": False, "error": "no remote_job for this task"}
    row = remote_jobs._row_to_dict(r)
    return {"ok": True, "remote_job": row}


@app.get("/api/remote-jobs/stats", tags=["即梦 AIGC"], summary="(D-078) remote_jobs watcher 统计")
def remote_jobs_stats():
    from backend.services import remote_jobs
    return {
        "stats": remote_jobs.stats(),
        "providers": remote_jobs.list_providers(),
        "watcher_running": remote_jobs.watcher_running(),
    }


@app.get("/api/dreamina/queue-status", tags=["即梦 AIGC"], summary="(T8) 即梦排队拥堵预判")
def dreamina_queue_status():
    """看用户当前在即梦端排队中的任务数 + 历史平均出结果时间.
    给前端 dreamina 页提交前 banner 用.
    返回 {querying_count, recent_avg_minutes, last_done_at_min_ago}.
    """
    from backend.services import remote_jobs
    from shortvideo.db import get_connection
    from contextlib import closing
    now = int(time.time())
    with closing(get_connection()) as con:
        # 当前 querying / pending 数
        querying = con.execute(
            "SELECT COUNT(*) FROM remote_jobs WHERE provider='dreamina' "
            "AND (last_status IS NULL OR last_status NOT IN ('done','failed','timeout','cancelled'))"
        ).fetchone()[0]
        # 最近 10 个 done 任务的平均出结果时间 (submitted → finished_at)
        rows = con.execute(
            "SELECT submitted_at, finished_at FROM remote_jobs "
            "WHERE provider='dreamina' AND last_status='done' AND finished_at IS NOT NULL "
            "ORDER BY submitted_at DESC LIMIT 10"
        ).fetchall()
        durations = [(f - s) for s, f in rows if s and f]
        avg_sec = (sum(durations) / len(durations)) if durations else 0
        # 最近一次 done 距今多久
        last_done_at = max([f for _, f in rows], default=0)
        last_done_min = (now - last_done_at) // 60 if last_done_at else None
    avg_min = round(avg_sec / 60, 1)
    # 拥堵程度判断
    if querying == 0:
        level = "idle"; hint = "目前队列空, 提交后基本立刻开始"
    elif querying < 3:
        level = "light"; hint = f"你有 {querying} 个任务排队, 一般 {avg_min}min 出结果" if avg_min else f"你有 {querying} 个任务排队"
    elif querying < 8:
        level = "moderate"; hint = f"⚠ 有 {querying} 个任务排队中, 新提交可能要等 {avg_min*2:.0f}min+"
    else:
        level = "heavy"; hint = f"🔴 队列已挤 ({querying} 个), 建议晚一点提交或耐心等"
    return {
        "querying_count": querying,
        "recent_avg_minutes": avg_min,
        "last_done_at_min_ago": last_done_min,
        "congestion_level": level,
        "hint": hint,
    }


@app.get("/api/llm-retry/stats", tags=["总部"], summary="(T9) LLM 自动重试命中率")
def llm_retry_stats():
    """D-082c retry 命中率: retried 触发次数, saved 重试成功救活, failed 重试也挂.
    in-process 计数, 进程重启清零. 首页"今天 LLM 重试 N 次救活 M 次" 用."""
    from shortvideo.llm_retry import get_retry_stats
    s = get_retry_stats()
    save_rate = round(s["saved_after_retry"] / max(1, s["retried"]) * 100, 1) if s["retried"] else 0
    return {**s, "save_rate_pct": save_rate}


# 即梦 CLI 要本地路径不要 data URL, 不能复用 D-073 的 /api/image/upload-ref (那个返 base64).
# 落盘到 data/dreamina/refs/ , 用完不删 (CLI submit 后还会再读一次, 不能临时清).
DREAMINA_REFS_DIR = Path("data/dreamina/refs")
DREAMINA_REFS_DIR.mkdir(parents=True, exist_ok=True)


@app.post("/api/dreamina/upload-ref", tags=["即梦 AIGC"], summary="上传参考图 → 落盘 path")
async def dreamina_upload_ref(file: UploadFile = File(...)):
    """单张图 → 落盘 data/dreamina/refs/ → 返回本地绝对路径.
    即梦 CLI 的 multimodal2video / image2video 都要本地路径.
    ≤4MB, jpg/png/webp.
    """
    data = await file.read()
    if not data:
        raise HTTPException(400, "空文件")
    if len(data) > 4 * 1024 * 1024:
        raise HTTPException(400, f"图太大 {len(data)//1024} KB · 上限 4096 KB")
    ext = (Path(file.filename or "ref.jpg").suffix or ".jpg").lower()
    if ext not in (".jpg", ".jpeg", ".png", ".webp"):
        raise HTTPException(400, f"只支持 jpg/png/webp · 收到 {ext}")
    fname = f"{int(time.time()*1000)}-{uuid.uuid4().hex[:8]}{ext}"
    fpath = (DREAMINA_REFS_DIR / fname).resolve()
    fpath.write_bytes(data)
    return {
        "ok": True,
        "path": str(fpath),
        "name": file.filename or fname,
        "size_bytes": len(data),
        "media_url": media_url(fpath),
    }


class DreaminaBatchVideoReq(BaseModel):
    prompts: list[str] = Field(..., min_length=1, max_length=20,
        description="一条或多条 prompt, ≤20. 每条独立起一个异步 task.")
    ref_paths: list[str] = Field(default_factory=list, max_length=9,
        description="参考图本地路径 (上传 endpoint 返回的 path). 0=text2video / 1=image2video / ≥2=multimodal2video. 所有 prompt 共享这组参考图.")
    duration: Optional[int] = Field(None, ge=4, le=15)
    ratio: Optional[str] = Field(None, description="1:1/3:4/16:9/4:3/9:16/21:9 (text2video 和 multimodal2video 用)")
    video_resolution: Optional[str] = Field("720p", description="720p / 1080p")
    model_version: Optional[str] = Field("seedance2.0fast", description="seedance2.0 / seedance2.0fast")


@app.post("/api/dreamina/batch-video", tags=["即梦 AIGC"], summary="批量生视频 (统一入口, 单/批都走)")
def dreamina_batch_video(req: DreaminaBatchVideoReq):
    """D-078b: 每条 prompt 独立起一个 task. 按 ref_paths 数量自动分流:
      - 0 张 → text2video (纯文字)
      - 1 张 → image2video (首帧动)
      - ≥2 张 → multimodal2video (全参考)

    新流程 (相比 D-075 旧的 daemon 内 while 死等):
      1. daemon thread 调 submit_only 拿 submit_id 立即返回 (~3-5s 不阻塞)
      2. register_remote_job 持久化 → watcher 60s 接管轮询
      3. task.payload.remote_managed=true → watchdog 不假杀
      4. 远程真终态 watcher 写 task + 入作品库
      5. 即梦排队 30min+ / 进程重启 都不丢
    """
    from backend.services import tasks as tasks_service
    from backend.services import remote_jobs

    prompts = [p.strip() for p in req.prompts if p and p.strip()]
    if not prompts:
        raise HTTPException(400, "prompts 全为空")
    refs = [p for p in (req.ref_paths or []) if p]
    for p in refs:
        if not Path(p).exists():
            raise HTTPException(400, f"参考图不存在: {p}")

    if len(refs) == 0:
        route = "text2video"
    elif len(refs) == 1:
        route = "image2video"
    else:
        route = "multimodal2video"

    est_per = 180 if req.model_version == "seedance2.0fast" else 240
    out_tasks = []
    for prompt in prompts:
        # 创建 placeholder task — 立即返 task_id 给前端, daemon thread 后台 submit
        task_id = tasks_service.create_task(
            kind=f"dreamina.{route}",
            label=f"即梦 {route} · {prompt[:24]}" + (f" · {len(refs)} 张参考图" if refs else ""),
            ns="dreamina",
            page_id="dreamina",
            step="batch",
            payload={
                "prompt_preview": prompt[:200],
                "route": route,
                "refs_count": len(refs),
                "model_version": req.model_version,
                "duration": req.duration,
                "remote_managed": True,  # D-078: watchdog 跳过, 由 watcher 接管
            },
            estimated_seconds=est_per,
        )
        tasks_service.update_progress(task_id, "提交即梦 CLI 中...", pct=5)

        # daemon thread 跑 submit_only — 拿 submit_id 后 register, watcher 接管
        from backend.services import guest_mode as _gm
        captured = _gm.capture()

        def _submit_worker(p=prompt, tid=task_id, cap=captured):
            tok = _gm.set_guest(cap)
            try:
                sub = dreamina_service.submit_only(
                    prompt=p, refs=refs,
                    duration=req.duration, ratio=req.ratio,
                    video_resolution=req.video_resolution,
                    model_version=req.model_version,
                )
                submit_id = sub["submit_id"]
                # D-078c: 把 submit_id 写到 task.payload 让 UI / recover 拿到
                tasks_service.update_payload(tid, {"submit_id": submit_id})
                tasks_service.update_progress(
                    tid,
                    f"已提交即梦 ({route}, {req.model_version}, {req.duration or 5}s) · submit_id={submit_id[:8]}... · 等远程出结果",
                    pct=20,
                )
                remote_jobs.register(
                    provider="dreamina",
                    submit_id=submit_id,
                    task_id=tid,
                    submit_payload={
                        "prompt": p, "route": route,
                        "refs": refs, "duration": req.duration,
                        "model_version": req.model_version,
                    },
                    max_wait_sec=7200,
                )
            except dreamina_service.DreaminaError as e:
                tasks_service.finish_task(tid, error=f"即梦提交失败: {e}", status="failed")
            except Exception as e:
                tasks_service.finish_task(tid, error=f"{type(e).__name__}: {e}", status="failed")
            finally:
                _gm.reset(tok)

        threading.Thread(target=_submit_worker, daemon=True).start()
        out_tasks.append({"task_id": task_id, "prompt": prompt})

    return {
        "tasks": out_tasks,
        "route": route,
        "refs_count": len(refs),
        "estimated_seconds": est_per,
        "page_id": "dreamina",
    }


@app.post("/api/chat", tags=["总部"], summary="小华自由对话 dock 多轮 (D-027 / D-085 tool calling)")
def chat_dock(req: ChatDockReq, background_tasks: "BackgroundTasks" = None):
    """小华浮动 dock 自由对话(多轮)。messages 是完整对话历史,context 是当前页。

    D-085: 走 ReAct 工具协议. AI 输出 <<USE_TOOL>>{json}<<END>>, 后端解析:
      - single (nav): 透传 actions 给前端 (前端 dispatch ql-nav)
      - read+followup (kb_search/tasks_summary): 后端执行 + round2 LLM 总结

    返回 {reply, actions, tokens, rounds}.
    后台异步触发偏好学习(D-030), 失败吃掉.
    """
    from backend.services import lidock_tools

    # 把多轮历史拼成单 user prompt
    history_lines = []
    for m in req.messages[-12:]:  # 最近 12 轮,避免太长
        prefix = "老板" if m.role == "user" else "小华"
        history_lines.append(f"{prefix}: {m.text.strip()}")
    history = "\n".join(history_lines)

    # base system: 人设 + D-085 tool registry + D-067 守则 + 真实页面结构
    base_system = (
        "你是小华,清华哥的内容生产副驾。当前老板在看「" + (req.context or "首页") + "」页面。\n\n"
        + lidock_tools.build_tool_system_block()
        + "\n\n## 工厂真实页面 id (nav.args.page 用, 实证来自 web/factory-app.jsx):\n"
        "一级: home / strategy / make / wechat / moments / write / image / beta / "
        "materials / works / knowledge / nightshift / settings\n"
        "二级 skill 页: ad / hotrewrite / voicerewrite / baokuan / "
        "planner / compliance / imagegen / dreamina / dhv5\n\n"
        "## D-067 守则 (没工具能解决的不要瞎编):\n"
        "1. 不能撒谎说自己能直接打开/查询本地文件、文件夹.\n"
        "2. 工具只有上面列的 3 个, 别编不存在的能力.\n"
        "3. 跳页只能用 nav (page id 必须真实), 不要说'我帮你打开 XX 文件夹'之类.\n\n"
        "## 对话规则:\n"
        "- 简短,口语,像跟兄弟聊天\n"
        "- 回复正文不超过 80 字 (USE_TOOL 块不算)\n"
        "- 直接回答,不要前言"
    )
    prompt = f"对话历史:\n{history}\n\n小华:"

    ai = get_ai_client(route_key="chat.dock")

    # ─── Round 1 ──────────────────────────────────────────
    r1 = ai.chat(prompt, system=base_system, deep=False, temperature=0.85, max_tokens=600)
    reply, calls = lidock_tools.parse_tool_calls(r1.text)

    actions: list[dict] = []
    rounds = 1
    total_tokens = r1.total_tokens

    if calls:
        call = calls[0]
        invalid = lidock_tools.validate_call(call)
        if invalid is None:
            tool = lidock_tools.REGISTRY[call["name"]]
            if tool.mode == "single":
                # nav 等: 透传给前端 (前端 dispatch ql-nav)
                actions.append({"type": call["name"], **call["args"]})
            elif tool.mode == "read+followup":
                # kb_search / tasks_summary: 后端执行 + round2 LLM
                tool_result = lidock_tools.execute_read_tool(call)
                followup_system = lidock_tools.build_followup_system(
                    base_system, call["name"], tool_result
                )
                followup_prompt = f"对话历史:\n{history}\n\n小华 (基于上面工具结果回答):"
                # round2 LLM 失败兜底: OpenClaw 503 / timeout / rate-limit 时
                # 不让整个 /api/chat 抛 500, 也不让用户看到 round1 的 "老板稍等" 误导文字.
                rounds = 2
                try:
                    r2 = ai.chat(
                        followup_prompt,
                        system=followup_system,
                        deep=False,
                        temperature=0.7,
                        max_tokens=400,
                    )
                    reply2, _calls2 = lidock_tools.parse_tool_calls(r2.text)  # round2 再有 USE_TOOL 也 strip
                    total_tokens += r2.total_tokens
                    if reply2:
                        reply = reply2
                    else:
                        # round2 输出空 (e.g. AI 只输出 USE_TOOL 块没正文): 不留 round1 误导
                        reply = "我查到了但表达不出来, 你可以稍后再问一次."
                except Exception as e:
                    import logging
                    logging.getLogger("chat_dock").warning(
                        f"round2 LLM failed (tool={call['name']}): {e}"
                    )
                    # tool_result 有 error 时优先告知失败原因, 否则给 friendly fallback
                    if isinstance(tool_result, dict) and tool_result.get("error"):
                        reply = f"工具调用没成功: {str(tool_result['error'])[:120]}. 你可以再问我一次或者去对应页面手动看."
                    else:
                        reply = "刚才查到数据了但 AI 回答抽风了, 稍后再问一次试试."
        else:
            # invalid / unknown / 白名单外 tool: **不静默, 覆盖 reply 明确告知**
            # (防 AI 调了不存在的 tool 后用户看到 "我帮你跑了 XX" 之类假承诺)
            reply = (
                f"我没有这个工具能力 ({invalid.get('error', '未知错误')}). "
                f"我能做的只有 3 件事: 跳页 (nav) / 搜知识库 (kb_search) / 查任务概况 (tasks_summary)."
            )

    # D-030: 异步学偏好(失败吃掉)
    if background_tasks is not None:
        try:
            from backend.services import preference
            msgs_dict = [{"role": m.role, "text": m.text} for m in req.messages]
            background_tasks.add_task(preference.maybe_learn, msgs_dict, req.context)
        except Exception:
            pass

    return {
        "reply": reply,
        "actions": actions,
        "tokens": total_tokens,
        "rounds": rounds,
    }


# ─── 偏好学习 endpoints (D-030) ──────────────────────────

@app.get("/api/preferences/status", tags=["设置"], summary="偏好学习开关状态 (D-030)")
def preferences_status():
    from backend.services import preference
    return preference.status()


class PrefToggleReq(BaseModel):
    enabled: bool


@app.post("/api/preferences/toggle", tags=["设置"], summary="切换偏好学习 (开启后从对话学偏好)")
def preferences_toggle(req: PrefToggleReq):
    settings_service.update({"preference_learning_enabled": bool(req.enabled)})
    from backend.services import preference
    return preference.status()


@app.get("/api/preferences/recent", tags=["设置"], summary="最近学到的偏好列表 (D-030)")
def preferences_recent(limit: int = 30):
    from backend.services import preference
    return {"preferences": preference.recent_preferences(limit=limit)}


# ─── 行为记忆注入开关 (D-031) ────────────────────────────

@app.get("/api/memory-inject/status", tags=["设置"], summary="行为记忆注入开关状态 (D-031)")
def memory_inject_status():
    from backend.services import memory_inject
    return memory_inject.stats()


# ─── 效果分析 → 反哺选题 (D-032) ─────────────────────────

@app.get("/api/insights/top-performers", tags=["总部"], summary="效果分析 TOP 共性 (D-032)")
def insights_top_performers(limit: int = 10):
    from backend.services import insights
    return {"items": insights.top_performers(limit=limit)}


@app.get("/api/insights/winning-patterns", tags=["总部"], summary="爆款模式总结 (D-032)")
def insights_winning_patterns(refresh: bool = False):
    """跑量好的作品共性 · 1h 缓存,topics_generate 自动注入此结果。"""
    from backend.services import insights
    return insights.winning_patterns(refresh=refresh)


class MemInjectToggleReq(BaseModel):
    enabled: bool


@app.post("/api/memory-inject/toggle", tags=["设置"], summary="切换行为记忆注入 (开启后 deep=True 调用注入最近 20 条)")
def memory_inject_toggle(req: MemInjectToggleReq):
    settings_service.update({"memory_injection_enabled": bool(req.enabled)})
    from backend.services import memory_inject
    return memory_inject.stats()


# ─── 小华工作日志(行为记忆 · D-023) ──────────────────────

@app.get("/api/work-log/status", tags=["设置"], summary="小华工作日志开关状态 + 路径 (D-023)")
def work_log_status():
    """看行为记忆开关 + 当前日志体积。"""
    from backend.services import work_log
    return work_log.status()


class WorkLogToggleReq(BaseModel):
    enabled: bool


@app.post("/api/work-log/toggle", tags=["设置"], summary="切换工作日志写入 (开启后每次 AI 调用追写)")
def work_log_toggle(req: WorkLogToggleReq):
    """开关行为记忆写入。enabled=true 后,每次 AI 调用追加到 Obsidian 日志。"""
    settings_service.update({"work_log_enabled": bool(req.enabled)})
    from backend.services import work_log
    return work_log.status()


@app.get("/api/work-log/recent", tags=["设置"], summary="最近 N 条工作日志条目 (D-023)")
def work_log_recent(limit: int = 20):
    """最近 N 条行为记忆(给前端调试页或首页 widget 用)。"""
    from backend.services import work_log
    return {"entries": work_log.recent_entries(limit=limit)}


# ---- 设置 ----
@app.get("/api/settings", tags=["设置"], summary="读全部设置")
def settings_get():
    return settings_service.get_all()


class SettingsUpdateReq(BaseModel):
    class Config:
        extra = "allow"


@app.post("/api/settings", tags=["设置"], summary="部分更新设置 (key/value 增量)")
def settings_update(payload: dict[str, Any]):
    return settings_service.update(payload or {})


@app.post("/api/settings/reset", tags=["设置"], summary="重置全部设置为默认")
def settings_reset_ep():
    return settings_service.reset()


@app.get("/api/stats/home", tags=["总部"], summary="首页 4 方块统计 + 今日热点")
def stats_home():
    """4 方块 + 1 热点条的统计数据 (D-024 接入 ai_calls 真实数据)。"""
    import time as _t
    from contextlib import closing
    from shortvideo.db import get_connection
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
        with closing(get_connection()) as con:
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

    # D-062dd: 各 skill sidebar 入口"今日产出"小数字 (route_key 前缀聚合)
    sidebar_counts = {
        "make":         today_works,                              # 今日开 N 条视频
        "ad":           ad_today,
        "wechat":       wechat_today,
        "moments":      moments_today,
        "hotrewrite":   _sum("today", ["hotrewrite."]),
        "voicerewrite": _sum("today", ["voicerewrite."]),
        "planner":      _sum("today", ["planner."]),
        "compliance":   _sum("today", ["compliance."]),
        "dreamina":     _sum("today", ["dreamina.", "cover."]),   # AIGC 包含 cover
    }

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
        "sidebar_counts": sidebar_counts,   # D-062dd 各 skill 今日产出
    }


# ---- 作品库 ----
@app.get("/api/works", tags=["档案部"], summary="作品库列表 (D-065: 三类统一)")
def works_list(
    limit: int = 200,
    type: Optional[str] = None,
    source_skill: Optional[str] = None,
    since: Optional[str] = None,  # today / week / month / all
    q: Optional[str] = None,
):
    """D-065: 支持按 type / source_skill / since / 关键词筛选.

    type:           text / image / video (None = 全部)
    source_skill:   image-gen / wechat-cover / baokuan / ... (None = 全部)
    since:          today / week / month / all (None = 全部)
    q:              在 title / final_text / metadata 里模糊搜
    """
    since_ts: Optional[int] = None
    if since and since != "all":
        now = time.time()
        if since == "today":
            t = time.localtime(now)
            since_ts = int(time.mktime((t.tm_year, t.tm_mon, t.tm_mday, 0, 0, 0, 0, 0, -1)))
        elif since == "week":
            since_ts = int(now - 7 * 86400)
        elif since == "month":
            since_ts = int(now - 30 * 86400)
    items = list_works(limit=limit, type=type, source_skill=source_skill, since_ts=since_ts)
    if q:
        kw = q.strip().lower()
        items = [
            w for w in items
            if kw in (w.title or "").lower()
            or kw in (w.final_text or "").lower()
            or kw in (w.metadata or "").lower()
        ]
    out = []
    for w in items:
        local_url = None
        thumb_url = None
        if w.local_path:
            p = Path(w.local_path)
            if p.exists():
                try:
                    local_url = media_url(p)
                except Exception:
                    pass
        if w.thumb_path:
            p2 = Path(w.thumb_path)
            if p2.exists():
                try:
                    thumb_url = media_url(p2)
                except Exception:
                    pass
        # 图片类:缩略图 = 原图(没单独抽缩略)
        if not thumb_url and w.type == "image" and local_url:
            thumb_url = local_url
        out.append({
            "id": w.id,
            "type": w.type,
            "source_skill": w.source_skill,
            "title": w.title,
            "created_at": w.created_at,
            "status": w.status,
            "final_text": w.final_text[:200] if w.final_text else "",
            "avatar_id": w.avatar_id,
            "speaker_id": w.speaker_id,
            "shiliu_video_id": w.shiliu_video_id,
            "duration_sec": w.duration_sec,
            "local_url": local_url,
            "thumb_url": thumb_url,
            "metadata": w.metadata,  # 前端可 JSON.parse
            "tokens_used": w.tokens_used,
        })
    return out


@app.get("/api/works/sources", tags=["档案部"], summary="可选来源 + 各类型计数 (D-065 给筛选条用)")
def works_sources():
    """返回:
      - by_type:   {video: N, image: N, text: N}
      - by_source: {image-gen: N, wechat-cover: N, ...}
    """
    items = list_works(limit=10000)
    by_type: dict[str, int] = {}
    by_source: dict[str, int] = {}
    for w in items:
        by_type[w.type] = by_type.get(w.type, 0) + 1
        if w.source_skill:
            by_source[w.source_skill] = by_source.get(w.source_skill, 0) + 1
    return {
        "total": len(items),
        "by_type": by_type,
        "by_source": by_source,
    }


@app.delete("/api/works/{work_id}", tags=["档案部"], summary="删作品 (可选删本地文件)")
def works_delete(work_id: int, remove_file: bool = False):
    """remove_file=True 同时删本地视频/音频文件; False (默认) 只删 DB 记录留文件."""
    delete_work(work_id, remove_file=remove_file)
    return {"ok": True}


# D-067 P3: 作品库采纳/否决信号 → 写到 metadata.user_action, 反过来喂记忆系统
class WorkActionReq(BaseModel):
    action: str = Field(..., description="kept | discarded | clear")


@app.post("/api/works/{work_id}/action", tags=["档案部"], summary="标记作品被留下/删除 (D-067 喂记忆)")
def works_action(work_id: int, req: WorkActionReq):
    """老板在作品库点 👍 留这版 / 👎 删这版, 写到 metadata.user_action.

    后续行为记忆抽取优先收 kept 的版本(高质量信号), discarded 的也记
    (避免重蹈覆辙). clear 撤销标记.
    """
    w = next((x for x in list_works(limit=10000) if x.id == work_id), None)
    if not w:
        raise HTTPException(404, f"work {work_id} not found")
    action = (req.action or "").strip().lower()
    if action not in ("kept", "discarded", "clear"):
        raise HTTPException(400, "action must be kept | discarded | clear")
    try:
        meta = json.loads(w.metadata) if w.metadata else {}
    except Exception:
        meta = {}
    if action == "clear":
        meta.pop("user_action", None)
        meta.pop("user_action_at", None)
    else:
        meta["user_action"] = action
        meta["user_action_at"] = int(time.time())
    update_work(work_id, metadata=json.dumps(meta, ensure_ascii=False))
    return {"ok": True, "work_id": work_id, "user_action": meta.get("user_action")}


@app.get("/api/works/{work_id}/local-path", tags=["档案部"], summary="作品本地绝对路径 (D-059c 给 v5 视频用)")
def works_local_path(work_id: int):
    """v5 视频流程需要数字人 mp4 的绝对路径 (不是 /media URL).
    返回 {work_id, local_path, exists}."""
    items = list_works(limit=500)
    w = next((x for x in items if x.id == work_id), None)
    if not w:
        raise HTTPException(404, f"work {work_id} not found")
    p = w.local_path
    return {
        "work_id": work_id,
        "local_path": p,
        "exists": Path(p).exists() if p else False,
        "title": w.title,
    }


# ---- 数据指标:手动录入 + 查询 + 排行 ----
class MetricUpsertReq(BaseModel):
    platform: str = Field(..., description="平台: douyin / shipinhao / xiaohongshu / wechat / kuaishou / weibo")
    views: int = Field(0, ge=0, description="播放量")
    likes: int = Field(0, ge=0, description="点赞")
    comments: int = Field(0, ge=0, description="评论")
    shares: int = Field(0, ge=0, description="分享/转发")
    saves: int = Field(0, ge=0, description="收藏")
    followers_gained: int = Field(0, ge=0, description="新增粉丝")
    conversions: int = Field(0, ge=0, description="转化数 (留资/到店/加微等)")
    completion_rate: Optional[float] = Field(None, ge=0, le=1, description="完播率 0-1")
    notes: Optional[str] = Field(None, description="备注")


@app.get("/api/works/{work_id}/metrics", tags=["档案部"], summary="查作品在各平台的指标")
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


@app.post("/api/works/{work_id}/metrics", tags=["档案部"], summary="录入作品指标 (按 work+platform upsert)")
def work_metrics_upsert(work_id: int, req: MetricUpsertReq):
    """每条 work × platform 唯一. 重复录入同 work + platform 会更新而非新增."""
    mid = upsert_metric(
        work_id=work_id, platform=req.platform,
        views=req.views, likes=req.likes, comments=req.comments,
        shares=req.shares, saves=req.saves,
        followers_gained=req.followers_gained, conversions=req.conversions,
        completion_rate=req.completion_rate, notes=req.notes,
    )
    return {"id": mid, "ok": True}


@app.delete("/api/metrics/{metric_id}", tags=["档案部"], summary="删一条指标记录")
def metric_delete(metric_id: int):
    delete_metric(metric_id)
    return {"ok": True}


@app.get("/api/works/analytics", tags=["档案部"], summary="作品库效果分析 TOP 10")
def works_analytics(limit: int = 50):
    """TOP 10 (按总曝光排序) + 各平台总量汇总 + 历史. 给作品库 PageWorks 数据 tab 用."""
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
@app.get("/api/materials", tags=["档案部"], summary="素材库列表 (含爆款参考)")
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


@app.post("/api/materials", tags=["档案部"], summary="新增素材")
def materials_add(req: MaterialReq):
    mid = insert_material(
        original_text=req.original_text,
        url=req.url, title=req.title, author=req.author,
        duration_sec=req.duration_sec, source=req.source,
    )
    return {"id": mid, "ok": True}


# ─── D-087 素材库 (本地素材文件管理) ────────────────────────
# 与老 /api/materials (爆款参考业务) 数据/语义独立, 走 material_assets/material_tags 等 5 张表.
# 路径前缀 /api/material-lib/ 避免冲突.

from fastapi.responses import FileResponse  # noqa: E402


@app.get("/api/material-lib/stats", tags=["档案部"], summary="(D-087) 素材库总览 KPI")
def material_lib_stats():
    from backend.services import materials_service as ms
    return ms.get_stats()


@app.get("/api/material-lib/folders", tags=["档案部"], summary="(D-087) 一级文件夹列表 (L1 大屏 8 张大卡片)")
def material_lib_folders(limit: int = 12):
    from backend.services import materials_service as ms
    return {"folders": ms.list_top_folders(limit=limit)}


@app.get("/api/material-lib/subfolders", tags=["档案部"], summary="(D-087) 二级子文件夹 (L2)")
def material_lib_subfolders(top: str, limit: int = 32):
    from backend.services import materials_service as ms
    return {"folder": top, "subfolders": ms.list_subfolders(top, limit=limit)}


@app.get("/api/material-lib/list", tags=["档案部"], summary="(D-087) 素材列表 (L3 网格)")
def material_lib_list(
    folder: str | None = None,
    limit: int = 100,
    offset: int = 0,
    sort: str = "imported",
    tag_ids: str | None = None,  # 逗号分隔
):
    from backend.services import materials_service as ms
    tids = None
    if tag_ids:
        try:
            tids = [int(x) for x in tag_ids.split(",") if x.strip()]
        except ValueError:
            tids = None
    items = ms.list_assets(folder=folder, limit=limit, offset=offset, tag_ids=tids, sort=sort)
    return {"items": items, "count": len(items), "folder": folder}


@app.get("/api/material-lib/asset/{asset_id}", tags=["档案部"], summary="(D-087) 单条素材详情 (L4 大预览)")
def material_lib_asset(asset_id: str):
    from backend.services import materials_service as ms
    a = ms.get_asset(asset_id)
    if not a:
        raise HTTPException(status_code=404, detail="素材不存在")
    return a


@app.get("/api/material-lib/thumb/{asset_id}", tags=["档案部"], summary="(D-087) 缩略图 (静态 jpg)")
def material_lib_thumb(asset_id: str):
    from backend.services import materials_service as ms
    p = ms.thumb_abs_path(asset_id)
    if not p:
        raise HTTPException(status_code=404, detail="缩略图不存在")
    return FileResponse(str(p), media_type="image/jpeg")


@app.get("/api/material-lib/file/{asset_id}", tags=["档案部"], summary="(D-087) 素材原文件 (L4 video src)")
def material_lib_file(asset_id: str):
    from backend.services import materials_service as ms
    a = ms.get_asset(asset_id)
    if not a:
        raise HTTPException(status_code=404, detail="素材不存在")
    p = Path(a["abs_path"])
    if not p.exists():
        raise HTTPException(status_code=404, detail="原文件不存在 (可能已删/移走)")
    media = "video/mp4" if a["ext"] in (".mp4", ".mov", ".m4v") else "image/jpeg"
    return FileResponse(str(p), media_type=media)


@app.post("/api/material-lib/scan", tags=["档案部"], summary="(D-087) 触发扫描素材根目录 (异步, 返 task_id)")
def material_lib_scan(max_files: int | None = None):
    """异步扫描. 走 D-068 tasks.run_async daemon thread + 防卡死.
    前端轮询 GET /api/tasks/{task_id} 看进度.
    """
    from backend.services import materials_service as ms
    from backend.services import tasks as tasks_service

    def _do():
        return ms.scan_root(max_files=max_files)

    task_id = tasks_service.run_async(
        kind="materials.scan",
        label=f"扫描素材库{'(限 ' + str(max_files) + ')' if max_files else ''}",
        ns="materials",
        page_id="materials",
        step="scan",
        payload={"max_files": max_files, "root": str(ms.get_materials_root())},
        estimated_seconds=300,
        progress_text="扫描素材文件 + 生成缩略图...",
        sync_fn=_do,
    )
    return {"task_id": task_id, "status": "running"}


class MaterialUsageReq(BaseModel):
    asset_id: str
    used_in: str | None = None
    position_sec: float | None = None


@app.post("/api/material-lib/usage", tags=["档案部"], summary="(D-087) 记录素材被用 (PRD §3.5 做视频对接)")
def material_lib_usage(req: MaterialUsageReq):
    from backend.services import materials_service as ms
    ms.log_usage(req.asset_id, req.used_in or "", req.position_sec)
    return {"ok": True}


# ─── D-087 Day 2: AI 打标 ───────────────────────────────


@app.post("/api/material-lib/tag/{asset_id}", tags=["档案部"], summary="(D-087) 单条素材 AI 打标 (LLM + 启发式 fallback)")
def material_lib_tag(asset_id: str, force: bool = False):
    """同步打一条. 走文本 LLM (注入清华哥人设) + 启发式兜底."""
    from backend.services import materials_pipeline as mp
    try:
        return mp.tag_asset(asset_id, force=force)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@app.post("/api/material-lib/tag-batch", tags=["档案部"], summary="(D-087) 批量打标 (异步, 走 tasks.run_async)")
def material_lib_tag_batch(limit: int = 10, force: bool = False):
    """异步批量打 N 条 (默认 10). 大批量请分多次调用. 真烧 credits 谨慎."""
    from backend.services import materials_pipeline as mp
    from backend.services import tasks as tasks_service

    def _do():
        return mp.tag_batch(limit=limit, force=force)

    task_id = tasks_service.run_async(
        kind="materials.tag_batch",
        label=f"AI 打标{'(强制重打 ' + str(limit) + ')' if force else f'(限 {limit})'}",
        ns="materials",
        page_id="materials",
        step="tag_batch",
        payload={"limit": limit, "force": force},
        estimated_seconds=max(60, limit * 4),
        progress_text="AI 给素材打标中...",
        sync_fn=_do,
    )
    return {"task_id": task_id, "status": "running"}


@app.delete("/api/materials/{material_id}", tags=["档案部"], summary="删素材")
def materials_delete(material_id: int):
    delete_material(material_id)
    return {"ok": True}


# ---- 热点库 ----
class HotTopicReq(BaseModel):
    title: str = Field(..., description="热点标题")
    platform: Optional[str] = Field(None, description="来源平台 douyin/xiaohongshu/shipinhao/weibo/kuaishou/ai-generated")
    heat_score: int = Field(0, ge=0, le=100, description="热度 1-100")
    match_persona: bool = Field(False, description="是否匹配清华哥定位")
    match_reason: Optional[str] = Field(None, description="匹配原因 (一句话)")
    source_url: Optional[str] = Field(None, description="原热点链接")
    fetched_from: str = Field("manual", description="来源: manual / night-shift (D-047 凌晨抓热点) / tavily 等")


@app.get("/api/hot-topics", tags=["档案部"], summary="热点列表")
def hot_topics_list(limit: int = 50):
    items = list_hot_topics(limit=limit)
    return [{
        "id": h.id, "created_at": h.created_at, "platform": h.platform,
        "title": h.title, "heat_score": h.heat_score,
        "match_persona": bool(h.match_persona), "match_reason": h.match_reason,
        "source_url": h.source_url, "fetched_from": h.fetched_from, "status": h.status,
    } for h in items]


@app.post("/api/hot-topics", tags=["档案部"], summary="新增热点")
def hot_topics_add(req: HotTopicReq):
    """手动维护或夜班 runner 写入. 素材库 HotTab "🌙 来自夜班 (N)" 过滤靠 fetched_from."""
    tid = insert_hot_topic(
        title=req.title, platform=req.platform, heat_score=req.heat_score,
        match_persona=req.match_persona, match_reason=req.match_reason,
        source_url=req.source_url, fetched_from=req.fetched_from,
    )
    return {"id": tid, "ok": True}


@app.delete("/api/hot-topics/{topic_id}", tags=["档案部"], summary="删热点")
def hot_topics_delete(topic_id: int):
    delete_hot_topic(topic_id)
    return {"ok": True}


# ---- 选题库 ----
class TopicReq(BaseModel):
    title: str = Field(..., description="选题标题")
    description: Optional[str] = Field(None, description="选题描述/角度")
    tags: Optional[str] = Field(None, description="标签, 逗号分隔")
    heat_score: int = Field(0, ge=0, le=100, description="热度评分")
    source: str = Field("manual", description="来源: manual / generate (AI 批量生成) / hot (从热点转化)")


@app.get("/api/topics", tags=["档案部"], summary="选题列表")
def topics_list(limit: int = 100):
    items = list_topics(limit=limit)
    return [{
        "id": t.id, "created_at": t.created_at,
        "title": t.title, "description": t.description,
        "tags": t.tags, "heat_score": t.heat_score,
        "source": t.source, "status": t.status,
    } for t in items]


@app.post("/api/topics", tags=["档案部"], summary="新增选题")
def topics_add(req: TopicReq):
    tid = insert_topic(
        title=req.title, description=req.description,
        tags=req.tags, heat_score=req.heat_score, source=req.source,
    )
    return {"id": tid, "ok": True}


@app.delete("/api/topics/{topic_id}", tags=["档案部"], summary="删选题")
def topics_delete(topic_id: int):
    delete_topic(topic_id)
    return {"ok": True}


# ---- 选题批量生成(简化版,用 DeepSeek) ----
class TopicGenReq(BaseModel):
    seed: str = Field(..., description="种子提示, 例 '老板用 AI 自动化' / '内容创业'")
    n: int = Field(10, ge=3, le=30, description="出几条选题, 默认 10")
    deep: bool = Field(True, description="True=注入完整人设 (~7500 token) · False=精简人设 (~300 token)")


def _dedup_topic_title(title: str, existing_prefixes: set[str]) -> bool:
    """前 5 字重复算重 · True = 通过,False = 拒绝。"""
    key = re.sub(r"\s+", "", title)[:5]
    if not key or key in existing_prefixes:
        return False
    existing_prefixes.add(key)
    return True


@app.post("/api/topics/generate", tags=["档案部"], summary="AI 批量出选题 (走 deepseek + 人设 + 历史去重)")
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
@app.get("/api/kb/tree", tags=["档案部"], summary="知识库目录树")
def kb_tree(refresh: bool = False):
    """读 ~/Desktop/清华哥知识库/ 整体目录结构. refresh=true 强刷缓存."""
    return kb_service.build_tree(refresh=refresh)


@app.get("/api/kb/doc", tags=["档案部"], summary="读单篇文档")
def kb_doc(path: str):
    """path 是相对知识库根目录的路径, 例 '03 灵感系统/test.md'."""
    try:
        return kb_service.read_doc(path)
    except FileNotFoundError as e:
        raise HTTPException(404, str(e))


class KbSearchReq(BaseModel):
    query: str = Field(..., description="搜索关键词")
    k: int = Field(8, ge=1, le=30, description="返回 top k 条匹配, 默认 8")


@app.post("/api/kb/search", tags=["档案部"], summary="文档级搜索")
def kb_search(req: KbSearchReq):
    """命中文档列表, 含 path / title / 命中片段."""
    return kb_service.search(req.query, k=req.k)


class KbMatchReq(BaseModel):
    query: str = Field(..., description="搜索关键词")
    k: int = Field(5, ge=1, le=20, description="返回 top k 条 chunk")


@app.post("/api/kb/match", tags=["档案部"], summary="chunk 级匹配 (给 prompt 注入用)")
def kb_match(req: KbMatchReq):
    """chunk 级别匹配, 比 /search 粒度更细. 供文案生成 prompt 注入."""
    return kb_service.match(req.query, k=req.k)


# ---- 投流文案:批量 5 版 + 点评 ----
class AdGenerateReq(BaseModel):
    pitch: str
    platform: str = "douyin"
    n: int = 5
    use_kb: bool = True
    deep: bool = True


@app.post("/api/ad/generate", tags=["投流"], summary="(旧) 5 版投流批量 · 已被 D-014 touliu 替代, 保留 fallback")
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


@app.post("/api/moments/derive", tags=["朋友圈"], summary="朋友圈衍生 (从金句库出 N 条)")
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


@app.post("/api/article/outline", tags=["公众号"], summary="(旧) 通用文章大纲 · 公众号 8 步用 /api/wechat/* 替代")
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


@app.post("/api/article/expand", tags=["公众号"], summary="(旧) 通用文章长文展开 · 已被 /api/wechat/write 替代")
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


@app.get("/api/wechat/skill-info", tags=["公众号"], summary="skill 元信息")
def wechat_skill_info():
    """供前端展示"用技能:公众号文章 · XX 字"标识 (skill_md_chars + references)."""
    try:
        return skill_loader.skill_info(WECHAT_SKILL_SLUG)
    except skill_loader.SkillNotFound as e:
        raise HTTPException(404, str(e))


class WechatTitlesReq(BaseModel):
    topic: str = Field(..., description="选题, 例 '一个老板花3万学AI'")
    n: int = Field(3, ge=1, le=8, description="出几个候选标题, 默认 3")


@app.post("/api/wechat/titles", tags=["公众号"], summary="Step 2 出标题候选")
def wechat_titles(req: WechatTitlesReq):
    """走 wechat_pipeline.gen_titles, 6 模板差异化 + 禁忌词过滤. 返回 {titles: [...]}."""
    titles = wechat_pipeline.gen_titles(req.topic, n=req.n)
    return {"titles": titles}


class WechatOutlineReq(BaseModel):
    topic: str = Field(..., description="选题")
    title: str = Field(..., description="挑定的标题")


@app.post("/api/wechat/outline", tags=["公众号"], summary="Step 3 出大纲")
def wechat_outline(req: WechatOutlineReq):
    """5 字段大纲 (核心观点/分论点/数据例证/金句/钩子). 走 deepseek 路由."""
    outline = wechat_pipeline.gen_outline(req.topic, req.title)
    return outline


class WechatWriteReq(BaseModel):
    topic: str = Field(..., description="选题")
    title: str = Field(..., description="挑定的标题")
    outline: dict[str, Any] = Field(default_factory=dict, description="Step 3 输出的大纲 JSON")


@app.post("/api/wechat/write", tags=["公众号"], summary="Step 4 写长文 (异步, 立即返 task_id)")
def wechat_write(req: WechatWriteReq):
    """D-037b6 异步化: 立即返 task_id, daemon thread 跑 30-60s (Opus 长文 + DeepSeek 自检).

    完成后 task.result = {article, self_check, tokens}.
    """
    task_id = wechat_pipeline.write_article_async(req.topic, req.title, req.outline)
    return {"task_id": task_id, "status": "running", "estimated_seconds": 50, "page_id": "wechat"}


# ─── 局部重写 (D-036) ────────────────────────────────────

class WechatRewriteSectionReq(BaseModel):
    full_article: str = Field(..., description="完整文章")
    selected: str = Field(..., description="选中要改的那段 (必须是 full_article 子串)")
    instruction: str = Field("", description="改写指令, 例 '更口语化' / '加个数字' / 留空走默认重写")


@app.post("/api/wechat/rewrite-section", tags=["公众号"], summary="Step 4 长文局部重写")
def wechat_rewrite_section(req: WechatRewriteSectionReq):
    """选中一段重写, 不动其它. 走 opus, 返回 {new_section, new_full, instruction}."""
    if not req.selected.strip():
        raise HTTPException(400, "selected 不能为空")
    if req.selected not in req.full_article:
        raise HTTPException(400, "selected 不是 full_article 的子串")
    return wechat_pipeline.rewrite_section(req.full_article, req.selected, req.instruction)


# ─── Phase 2.5 · 段间配图 ───────────────────────────────────

class WechatPlanImagesReq(BaseModel):
    content: str = Field(..., description="正文 markdown")
    title: str = Field(..., description="文章标题")
    n: int = Field(4, ge=1, le=8, description="出几条配图 prompt, 默认 4")


@app.post("/api/wechat/plan-images", tags=["公众号"], summary="Step 5 规划配图 prompt")
def wechat_plan_images(req: WechatPlanImagesReq):
    """AI 产 n 条段间配图 prompt (不真生图). 给前端 Step 5 让用户改 prompt 后再调 /section-image."""
    plans = wechat_scripts.plan_section_images(req.content, req.title, n=req.n)
    return {"plans": plans}


class WechatSectionImageReq(BaseModel):
    prompt: str = Field(..., description="生图 prompt (具象画面 ≤60 字)")
    size: str = Field("16:9", description="尺寸: 16:9 (横版默认) / 9:16 / 1:1")
    engine: str | None = Field(None, description="apimart | dreamina · None 用 settings 默认 (D-064)")


@app.post("/api/wechat/section-image", tags=["公众号"], summary="Step 5 真生一张段间图 (异步, 立即返 task_id)")
def wechat_section_image(req: WechatSectionImageReq):
    """D-037b6 异步化 + D-064 图引擎切换:

    立即返 task_id, daemon thread 跑 30-60s (apimart) 或 60-120s (dreamina).
    完成后 task.result = {mmbiz_url, media_url, local_path, prompt, size, engine, elapsed_sec}.
    autoFlow 用 apiPostThenWait 自动轮询.
    """
    task_id = wechat_scripts.gen_section_image_async(req.prompt, size=req.size, engine=req.engine)
    return {"task_id": task_id, "status": "running", "estimated_seconds": 45, "page_id": "wechat"}


# ─── Phase 3 · HTML 拼装 ─────────────────────────────────────

class WechatHtmlReq(BaseModel):
    title: str = Field(..., description="文章标题")
    content_md: str = Field(..., description="正文 markdown")
    section_images: list[dict[str, Any]] = Field(default_factory=list, description="段间图列表 [{mmbiz_url:'...'}], 通常 4 张")
    hero_badge: str = Field("老板必看", description="顶部 badge 文字, 例 '老板必看' / '深度好文'")
    hero_highlight: str = Field("", description="标题中要高亮的子串, 留空不高亮")
    hero_subtitle: str = Field("", description="副标题, 留空自动从首段抽")
    template: str = Field("v3-clean", description="模板: v3-clean / v2-magazine / v1-dark (D-034)")


@app.post("/api/wechat/html", tags=["公众号"], summary="Step 6 拼装 HTML 模板")
def wechat_html(req: WechatHtmlReq):
    """正文 + 段间图 + hero 注入到模板, 走 convert_to_wechat_markup.py 转微信 markup.
    返回 {raw_html_path, wechat_html_path, meta_path, raw_html, wechat_html, title, digest}."""
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


@app.get("/api/wechat/templates", tags=["公众号"], summary="可用 HTML 模板列表")
def wechat_templates():
    """返回 v3-clean / v2-magazine / v1-dark 等模板的 id + 描述 + 预览缩略 (D-034)."""
    return {"templates": wechat_scripts.list_templates()}


# ─── Phase 4 · 封面 ──────────────────────────────────────────

class WechatCoverReq(BaseModel):
    title: str = Field(..., description="文章标题")
    label: str = Field("清华哥说", description="封面右下角小标签 (n=1 模板模式才用)")
    n: int = Field(2, ge=1, le=8, description="出几张候选 · ≥2 走 image_engine N 选 1 · =1 走 Chrome 模板兼容老调用 (D-035 → D-064 默认 2)")
    engine: str | None = Field(None, description="apimart | dreamina · None 用 settings 默认 (D-064)")


@app.post("/api/wechat/cover", tags=["公众号"], summary="Step 7 出封面 (默认 2 选 1)")
def wechat_cover(req: WechatCoverReq):
    """D-064: 默认 n=2 (旧 4 张), 走 image_engine 抽象, 支持 apimart / dreamina 切换.
    n=1 走旧 Chrome 模板单张 (兼容). N 张走批量耗时 30-60s × N."""
    try:
        if req.n >= 2:
            return wechat_scripts.gen_cover_batch(req.title, n=max(2, min(req.n, 8)), engine=req.engine)
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


class WechatCoverBatchReq(BaseModel):
    titles: list[str] = Field(..., min_length=1, max_length=10,
        description="多个标题, ≤10. 每个标题独立起 task 出 n 张候选封面.")
    n: int = Field(2, ge=1, le=8, description="每个标题出几张候选")
    engine: str | None = Field(None, description="apimart | dreamina · None 用 settings 默认")


@app.post("/api/wechat/cover-batch", tags=["公众号"], summary="批量出多标题封面 (D-076)")
def wechat_cover_batch(req: WechatCoverBatchReq):
    """场景: 老板攒一周 5 篇文章, 一次出齐封面.
    每个标题独立起 task 调 gen_cover_batch, N×n 张. 跟单标题 wechat/cover 区分:
    那个是 1 标题 N 候选 (选 1 张), 这个是 N 标题各 n 张 (各篇文章选自己的)."""
    from backend.services import tasks as tasks_service

    titles = [t.strip() for t in req.titles if t and t.strip()]
    if not titles:
        raise HTTPException(400, "titles 全为空")

    est_per = 30 * req.n  # apimart ~30s/张
    out_tasks = []
    for title in titles:
        def _make_sync(t=title):
            def _sync():
                return wechat_scripts.gen_cover_batch(t, n=req.n, engine=req.engine)
            return _sync

        task_id = tasks_service.run_async(
            kind="wechat.cover-batch",
            label=f"批量封面 · {title[:24]} · {req.n} 张",
            ns="wechat",
            page_id="wechat",
            step="cover-batch",
            payload={"title": title, "n": req.n, "engine": req.engine},
            estimated_seconds=est_per,
            progress_text=f"出 {req.n} 张封面候选...",
            sync_fn=_make_sync(),
        )
        out_tasks.append({"task_id": task_id, "title": title})

    return {
        "tasks": out_tasks,
        "n_per_title": req.n,
        "engine": req.engine,
        "estimated_seconds": est_per,
        "page_id": "wechat",
    }


# ─── Phase 5 · 推送草稿箱 ────────────────────────────────────

class WechatPushReq(BaseModel):
    title: str = Field(..., description="文章标题")
    digest: str = Field(..., description="摘要 (≤120 字)")
    html_path: str = Field(..., description="HTML 路径, 通常 /tmp/preview/wechat_article.html")
    cover_path: str = Field(..., description="封面图路径")
    author: str = Field("清华哥", description="作者名")


@app.post("/api/wechat/push", tags=["公众号"], summary="Step 8 推送草稿箱")
def wechat_push(req: WechatPushReq):
    """需要 ~/.wechat-article-config 已配 wechat_appid + wechat_appsecret.
    推送前自动 sanitize HTML (剥 ?from=appmsg / 危险 tag), 配了 author_avatar_path
    则上传头像合法替换. 失败时看 /tmp/preview/last_push_request.{html,json} 诊断."""
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


# ─── D-051 公众号头像配置 (D-046 启用 UI) ───────────────────
# 用户在 Settings 页上传一张本地头像图 → 后端存到 data/wechat-avatar/ +
# 写 author_avatar_path 进 ~/.wechat-article-config. push 流程自动用.

WECHAT_AVATAR_DIR = DATA_DIR / "wechat-avatar"


@app.get("/api/wechat/avatar", tags=["公众号"], summary="头像配置状态")
def wechat_avatar_status():
    """读 ~/.wechat-article-config 看 author_avatar_path 是否配 + 文件是否存在.
    返回 {configured: bool, path: str | null, exists: bool, size_bytes: int | null}"""
    cfg = wechat_scripts._read_wechat_config()
    raw = (cfg.get("author_avatar_path") or "").strip()
    if not raw:
        return {"configured": False, "path": None, "exists": False, "size_bytes": None}
    p = Path(raw).expanduser()
    return {
        "configured": True,
        "path": str(p),
        "exists": p.exists(),
        "size_bytes": p.stat().st_size if p.exists() else None,
    }


@app.post("/api/wechat/avatar", tags=["公众号"], summary="上传头像")
async def wechat_avatar_upload(file: UploadFile = File(...)):
    """上传本地头像图 → 存 data/wechat-avatar/avatar.<ext> + 写
    ~/.wechat-article-config 的 author_avatar_path 字段.

    单张 ≤1MB (微信 uploadimg 上限). 立即生效, 下次 push 自动用.
    """
    data = await file.read()
    if len(data) > 1024 * 1024:
        raise HTTPException(400, f"图太大 {len(data)//1024} KB · 微信 uploadimg 上限 1024 KB")
    if not data:
        raise HTTPException(400, "空文件")

    ext = (Path(file.filename or "avatar.jpg").suffix or ".jpg").lower()
    if ext not in {".jpg", ".jpeg", ".png"}:
        raise HTTPException(400, f"只支持 jpg/png · 收到 {ext}")

    WECHAT_AVATAR_DIR.mkdir(parents=True, exist_ok=True)
    # 用固定名 avatar.<ext>, 覆盖式存储 (不要囤旧版头像)
    target = WECHAT_AVATAR_DIR / f"avatar{ext}"
    # 删旧扩展名残留 (之前上传 png 又上传 jpg)
    for old in WECHAT_AVATAR_DIR.glob("avatar.*"):
        if old != target:
            try:
                old.unlink()
            except Exception:
                pass
    target.write_bytes(data)

    # 写 ~/.wechat-article-config 的 author_avatar_path
    cfg_path = wechat_scripts._WECHAT_CONFIG_PATH
    cfg = wechat_scripts._read_wechat_config()
    cfg["author_avatar_path"] = str(target)
    try:
        cfg_path.write_text(json.dumps(cfg, ensure_ascii=False, indent=2), encoding="utf-8")
    except Exception as e:
        raise HTTPException(500, f"写配置文件失败: {e}")

    return {
        "ok": True,
        "path": str(target),
        "size_bytes": len(data),
        "config_updated": str(cfg_path),
    }


@app.delete("/api/wechat/avatar", tags=["公众号"], summary="移除头像配置")
def wechat_avatar_clear():
    """从 config 中删 author_avatar_path 字段, 物理文件保留 (避免误删)."""
    cfg_path = wechat_scripts._WECHAT_CONFIG_PATH
    cfg = wechat_scripts._read_wechat_config()
    had = "author_avatar_path" in cfg
    cfg.pop("author_avatar_path", None)
    cfg_path.write_text(json.dumps(cfg, ensure_ascii=False, indent=2), encoding="utf-8")
    return {"ok": True, "had_config": had}


# ═══════════════════════════════════════════════════════════════════
# 热点文案改写V2 skill 接入 (D-012)
# Skill 源: ~/Desktop/skills/热点文案改写V2/SKILL.md
# 3 步: analyze(拆解+3角度) → write(1800-2600字+六维自检) → done
# ═══════════════════════════════════════════════════════════════════

HOTREWRITE_SKILL_SLUG = "热点文案改写V2"


@app.get("/api/hotrewrite/skill-info", tags=["热点改写"], summary="skill 元信息")
def hotrewrite_skill_info():
    try:
        return skill_loader.skill_info(HOTREWRITE_SKILL_SLUG)
    except skill_loader.SkillNotFound as e:
        raise HTTPException(404, str(e))


class HotrewriteAnalyzeReq(BaseModel):
    hotspot: str = Field(..., description="热点事件描述, 例 'OpenAI 发布 Sora 2'")


@app.post("/api/hotrewrite/analyze", tags=["热点改写"], summary="Step 1 拆解热点 + 出 3 角度")
def hotrewrite_analyze(req: HotrewriteAnalyzeReq):
    """走 deepseek 7s 出 JSON: breakdown (5W2H 拆解) + 3 个切入角度建议."""
    return hotrewrite_pipeline.analyze_hotspot(req.hotspot)


class HotrewriteWriteReq(BaseModel):
    hotspot: str = Field(..., description="热点事件描述")
    breakdown: dict[str, Any] = Field(default_factory=dict, description="Step 1 输出的拆解 JSON")
    angle: dict[str, Any] = Field(default_factory=dict, description="挑定的切入角度 JSON")


@app.post("/api/hotrewrite/write", tags=["热点改写"], summary="Step 2 写口播文案 (异步, 立即返 task_id)")
def hotrewrite_write(req: HotrewriteWriteReq):
    """D-037b5 异步化: 立即返 task_id, daemon thread 跑 30-60s.

    走 opus 出长口播 + 六维自检 (开头钩子/数据/反差/金句/Call to action/字数).
    完成后 task.result = {content, word_count, self_check, tokens}.
    """
    task_id = hotrewrite_pipeline.write_script_async(req.hotspot, req.breakdown, req.angle)
    return {"task_id": task_id, "status": "running", "estimated_seconds": 50, "page_id": "hotrewrite"}


# ═══════════════════════════════════════════════════════════════════
# 录音文案改写 skill 接入 (D-013)
# Skill 源: ~/Desktop/skills/录音文案改写/
# 3 步: analyze(提骨架+2角度) → write(轻改写+自检清单) → done
# ═══════════════════════════════════════════════════════════════════

VOICEREWRITE_SKILL_SLUG = "录音文案改写"


@app.get("/api/voicerewrite/skill-info", tags=["录音改写"], summary="skill 元信息")
def voicerewrite_skill_info():
    try:
        return skill_loader.skill_info(VOICEREWRITE_SKILL_SLUG)
    except skill_loader.SkillNotFound as e:
        raise HTTPException(404, str(e))


class VoicerewriteAnalyzeReq(BaseModel):
    transcript: str = Field(..., description="录音逐字稿 (CosyVoice / 飞书会议自动转写都行)")


@app.post("/api/voicerewrite/analyze", tags=["录音改写"], summary="Step 1 提骨架 + 出 2 角度")
def voicerewrite_analyze(req: VoicerewriteAnalyzeReq):
    """走 deepseek 7-8s. 输出 skeleton (核心论点 + 论据排序) + 2 个语气锚点."""
    return voicerewrite_pipeline.analyze_recording(req.transcript)


class VoicerewriteWriteReq(BaseModel):
    transcript: str = Field(..., description="原录音逐字稿")
    skeleton: dict[str, Any] = Field(default_factory=dict, description="Step 1 提的骨架")
    angle: dict[str, Any] = Field(default_factory=dict, description="挑定的语气锚点")


@app.post("/api/voicerewrite/write", tags=["录音改写"], summary="Step 2 改写 + 自检一次性 (异步, 立即返 task_id)")
def voicerewrite_write(req: VoicerewriteWriteReq):
    """D-037b5 异步化: 立即返 task_id, daemon thread 跑 30-60s.

    走 opus 改写 + 自检一次出. 保留口播感, 修语序去口头禅, 不删核心观点.
    完成后 task.result = {content, word_count, notes, self_check, tokens}.
    """
    task_id = voicerewrite_pipeline.write_script_async(req.transcript, req.skeleton, req.angle)
    return {"task_id": task_id, "status": "running", "estimated_seconds": 50, "page_id": "voicerewrite"}


# ═══════════════════════════════════════════════════════════════════
# 爆款改写 skill 接入 (D-063)
# Skill 源: ~/Desktop/skills/爆款改写-学员版/SKILL.md
# 2 步: analyze (爆款基因 3 句话) → rewrite (按模式 pure/business/all 出 V1-V4)
# ═══════════════════════════════════════════════════════════════════

BAOKUAN_SKILL_SLUG = "爆款改写-学员版"


@app.get("/api/baokuan/skill-info", tags=["爆款改写"], summary="skill 元信息")
def baokuan_skill_info():
    try:
        return skill_loader.skill_info(BAOKUAN_SKILL_SLUG)
    except skill_loader.SkillNotFound as e:
        raise HTTPException(404, str(e))


class BaokuanAnalyzeReq(BaseModel):
    text: str = Field(..., description="原爆款文案 (整段贴进来)")


@app.post("/api/baokuan/analyze", tags=["爆款改写"], summary="Step 1 爆款基因分析 (3 句话)")
def baokuan_analyze(req: BaokuanAnalyzeReq):
    """走 deepseek 5-7s. 输出 dna: why_hot / emotion_hook / structure 各一句话."""
    return baokuan_pipeline.analyze_baokuan(req.text)


class BaokuanRewriteReq(BaseModel):
    text: str = Field(..., description="原爆款文案")
    mode: str = Field("pure", description="模式: pure (V1+V2 纯改写) / business (V3+V4 业务钩子) / all (4 版全出)")
    industry: str = Field("", description="行业 (业务/全都要时必填, 例 '餐饮老板')")
    target_action: str = Field("", description="转化动作 (业务/全都要时必填, 例 '加微信' '到店')")
    dna: dict[str, Any] = Field(default_factory=dict, description="Step 1 输出的爆款基因 (可选, 传了改写更准)")


@app.post("/api/baokuan/rewrite", tags=["爆款改写"], summary="Step 2 按模式改写出 N 版 (异步, 立即返 task_id)")
def baokuan_rewrite(req: BaokuanRewriteReq):
    """D-037b5 异步化: 立即返 task_id, daemon thread 跑 30-60s.

    SKILL.md 严禁项硬约束: 前 5 秒不动 / 不超原文 30% / 无 AI 味.
    前端轮询 GET /api/tasks/{id} 看进度, 完成后 task.result = {versions, mode, tokens}.
    """
    task_id = baokuan_pipeline.rewrite_async(
        text=req.text, mode=req.mode,
        industry=req.industry, target_action=req.target_action,
        dna=req.dna,
    )
    return {"task_id": task_id, "status": "running", "estimated_seconds": 45, "page_id": "baokuan"}


# ═══════════════════════════════════════════════════════════════════
# touliu-agent skill 接入 (D-014) — 替换旧 /api/ad/generate
# Skill 源: ~/Desktop/skills/touliu-agent/
# 一次生成 n 条投流文案(按结构分配) + lint 本地质检
# 旧 /api/ad/generate 保留不动作为 fallback
# ═══════════════════════════════════════════════════════════════════

TOULIU_SKILL_SLUG = "touliu-agent"


@app.get("/api/touliu/skill-info", tags=["投流"], summary="skill 元信息")
def touliu_skill_info():
    try:
        return skill_loader.skill_info(TOULIU_SKILL_SLUG)
    except skill_loader.SkillNotFound as e:
        raise HTTPException(404, str(e))


class TouliuGenerateReq(BaseModel):
    pitch: str = Field(..., description="一个卖点, 例 '我有 8000 个老板私域'")
    industry: str = Field("通用老板", description="行业 (大健康/美业/教育/金融/医美/通用老板)")
    target_action: str = Field("点头像进直播间",
        description="转化目标: 点头像进直播间 / 留资 / 加私域 / 到店")
    n: int = Field(10, ge=1, le=15, description="出几条 (1-15). 后端按结构自动分配 (痛/对/步/话/创). D-068c: 前端默认 1 求速度.")
    channel: str = Field("直播间", description="发布渠道, 例 '直播间' / '抖音正片' / '私信首条'")
    run_lint: bool = Field(True, description="是否顺手跑 lint 终检 (6 维: 字数/钩子/数据/Call/口语/禁忌)")


@app.post("/api/touliu/generate", tags=["投流"], summary="一次出 n 条投流文案 (异步, 立即返 task_id)")
def touliu_generate(req: TouliuGenerateReq):
    """D-037b6 异步化: 立即返 task_id, daemon thread 跑 2-3 分钟 (Opus 6K system + lint).

    完成后 task.result = {batch, lint, alloc, style_summary, tokens}.
    """
    task_id = touliu_pipeline.generate_batch_async(
        pitch=req.pitch,
        industry=req.industry,
        target_action=req.target_action,
        n=max(1, min(req.n, 15)),
        channel=req.channel,
        run_lint=req.run_lint,
    )
    return {"task_id": task_id, "status": "running", "estimated_seconds": 150, "page_id": "ad"}


class TouliuLintReq(BaseModel):
    batch: list[dict[str, Any]] = Field(default_factory=list, description="待 lint 的文案数组")
    target_action: str = Field("live", description="转化目标 (live/reserve/private/visit)")


@app.post("/api/touliu/lint", tags=["投流"], summary="lint 终检 6 维")
def touliu_lint(req: TouliuLintReq):
    """本地 subprocess 调 lint_copy_batch.py · 不打 AI · 1-2s 出结果."""
    return touliu_pipeline.lint_batch(req.batch, target_action=req.target_action)




# ═══════════════════════════════════════════════════════════════════
# content-planner skill 接入 (D-017 骨架,根据实际调整)
# Skill 源: ~/Desktop/skills/content-planner/
# ═══════════════════════════════════════════════════════════════════

PLANNER_SKILL_SLUG = "content-planner"


@app.get("/api/planner/skill-info", tags=["内容策划"], summary="skill 元信息")
def planner_skill_info():
    try:
        return skill_loader.skill_info(PLANNER_SKILL_SLUG)
    except skill_loader.SkillNotFound as e:
        raise HTTPException(404, str(e))


class PlannerAnalyzeReq(BaseModel):
    brief: str = Field(..., description="活动描述, 例 '下周三给 200 个老板讲 AI 内容获客, 有 1 个助理'")


@app.post("/api/planner/analyze", tags=["内容策划"], summary="Step 1 分析活动 + 三档目标")
def planner_analyze(req: PlannerAnalyzeReq):
    """走 deepseek. 收集活动信息 + 给三档目标 (保底 / 标准 / 最大化产出 N 条素材).
    🔴 红线: 不提产品价格 / 不让参会者现场动手搭建."""
    return planner_pipeline.analyze_event(req.brief)


class PlannerWriteReq(BaseModel):
    brief: str = Field(..., description="活动描述")
    detected: dict[str, Any] = Field(default_factory=dict, description="Step 1 检测出的活动信息")
    level: dict[str, Any] = Field(default_factory=dict, description="挑定的目标档次 (保底/标准/最大化)")


@app.post("/api/planner/write", tags=["内容策划"], summary="Step 2 出 6 模块完整方案 (异步, 立即返 task_id)")
def planner_write(req: PlannerWriteReq):
    """D-037b5 异步化: 立即返 task_id, daemon thread 跑 30-60s.

    走 opus 输出 6 模块: 准备清单 / 现场动作 / 稀缺素材机会 / 角色分工 /
    发布节奏 / 总产出预估.
    完成后 task.result = {plan, tokens}.
    """
    task_id = planner_pipeline.write_plan_async(req.brief, req.detected, req.level)
    return {"task_id": task_id, "status": "running", "estimated_seconds": 50, "page_id": "planner"}




# ═══════════════════════════════════════════════════════════════════
# 违禁违规审查-学员版 skill 接入 (D-017 骨架,根据实际调整)
# Skill 源: ~/Desktop/skills/违禁违规审查-学员版/
# ═══════════════════════════════════════════════════════════════════

COMPLIANCE_SKILL_SLUG = "违禁违规审查-学员版"


@app.get("/api/compliance/skill-info", tags=["违规审查"], summary="skill 元信息")
def compliance_skill_info():
    try:
        return skill_loader.skill_info(COMPLIANCE_SKILL_SLUG)
    except skill_loader.SkillNotFound as e:
        raise HTTPException(404, str(e))


class ComplianceCheckReq(BaseModel):
    text: str = Field(..., description="待审查文案")
    industry: str = Field("通用", description="行业 (通用 / 大健康 / 美业 / 教育 / 金融 / 医美) - 决定是否查敏感词库")


@app.post("/api/compliance/check", tags=["违规审查"], summary="提交审查任务 → 立即返 task_id (异步)")
def compliance_check(req: ComplianceCheckReq):
    """D-037b3 异步化: 立即返 task_id, daemon thread 后台跑 3 段 (扫违规 → 保守版 → 营销版).

    前端轮询 GET /api/tasks/{task_id} 看真进度 (progress_pct 0/5/15/50/80/95/100).
    完成后 task.result = {industry, scan_scope, violations, stats, version_a, version_b, summary, tokens}.

    破坏性变更: 旧前端按同步等返回的会拿到 {task_id, ...} 而不是结果. 工厂只清华哥一个用户,
    前端同 commit 改造, 不留兼容路径.
    """
    task_id = compliance_pipeline.check_compliance_async(req.text, req.industry)
    return {
        "task_id": task_id,
        "status": "running",
        "estimated_seconds": 90,
        "page_id": "compliance",
    }


# 保留 analyze/write 骨架路径以兼容 add_skill 统一约定
class ComplianceAnalyzeReq(BaseModel):
    input: str = Field(..., description="待审查文案 (兼容 add_skill 范式)")


@app.post("/api/compliance/analyze", tags=["违规审查"], summary="(兼容 add_skill 范式) analyze")
def compliance_analyze(req: ComplianceAnalyzeReq):
    """跟 /check 等价 · 留这条路径让 add_skill 模板统一. 优先用 /check."""
    return compliance_pipeline.analyze_input(req.input)


class ComplianceWriteReq(BaseModel):
    input: str = Field(..., description="原文")
    analysis: dict[str, Any] = Field(default_factory=dict, description="analyze 输出的报告")
    angle: dict[str, Any] = Field(default_factory=dict, description="挑定改写方向")


@app.post("/api/compliance/write", tags=["违规审查"], summary="(兼容 add_skill 范式) write")
def compliance_write(req: ComplianceWriteReq):
    """add_skill 范式留的 step 2 路径. 实际 /check 已一步到位."""
    return compliance_pipeline.write_output(req.input, req.analysis, req.angle)


# ═══════════════════════════════════════════════════════════════════
# 数字人成片 v5 模板化 接入 (D-059a)
# Skill 源: ~/Desktop/skills/digital-human-video-v5/
# 数字人 mp4 是上游复用资源 → 套不同模板剪辑成多版 (用户拍板的关键).
# 本轮只做后端基建. 前端 PageDhv5 后续按 D-059b/c/d 做.
# 渲染异步走 D-037a 的 tasks 池, 调用方轮询 GET /api/tasks/{task_id}.
# ═══════════════════════════════════════════════════════════════════


@app.get("/api/dhv5/templates", tags=["v5 视频"], summary="模板列表")
def dhv5_templates_list():
    """扫 ~/Desktop/skills/digital-human-video-v5/templates/*.yaml 返列表 + 元数据
    (含智能时长 / 节奏标签 / 字数预算 / 样片视频路径). 给模板选择器用."""
    from backend.services import dhv5_pipeline
    return {"templates": dhv5_pipeline.list_templates()}


@app.get("/api/dhv5/templates/{template_id}", tags=["v5 视频"], summary="单模板完整 YAML")
def dhv5_templates_get(template_id: str):
    """读单模板完整 YAML 配置. 给文案对齐 / 模板编辑器用."""
    from backend.services import dhv5_pipeline
    try:
        return dhv5_pipeline.load_template_full(template_id)
    except dhv5_pipeline.Dhv5Error as e:
        raise HTTPException(404, str(e))


class Dhv5RenderReq(BaseModel):
    template_id: str = Field(..., description="模板 id (templates/<id>.yaml 不带后缀)")
    digital_human_video: str = Field(..., description="数字人 mp4 绝对路径 (上游柿榴产出 / 用户上传)")
    output_name: Optional[str] = Field(None, description="输出文件名 (无 .mp4 扩展). 默认 template_id_时间戳")
    scenes_override: Optional[list[dict[str, Any]]] = Field(
        None,
        description="覆盖模板默认 scenes (D-059c 文案对齐结果走这里). 无则用 YAML 原 scenes.",
    )


class Dhv5AlignReq(BaseModel):
    template_id: str = Field(..., description="模板 id")
    transcript: str = Field("", description="数字人念的全文 (mode=auto 时必填)")
    mode: str = Field("auto", description="auto (AI 切) / placeholder (用模板原字段) / manual (留空让前端拖)")


@app.post("/api/dhv5/align", tags=["v5 视频"], summary="文案↔scenes 智能对齐")
def dhv5_align(req: Dhv5AlignReq):
    """三种 mode:
    - auto: 走 deepseek 把 transcript 切到每个 scene 字段 (A/C subtitle / B big_text)
    - placeholder: 模板原字段直接返 (给用户填空)
    - manual: 字段留空, 前端拖
    返回 {scenes: [...], mode, template_id, transcript_chars} — scenes 跟模板严格一一对应,
    用户可以前端再编辑后传给 /api/dhv5/render 的 scenes_override."""
    from backend.services import dhv5_pipeline
    try:
        return dhv5_pipeline.align_script(req.template_id, req.transcript, mode=req.mode)
    except dhv5_pipeline.Dhv5Error as e:
        raise HTTPException(400, str(e))


class Dhv5BrollReq(BaseModel):
    prompt_override: Optional[str] = Field(None, description="可选 — 用户编辑过的 prompt, 不传走 YAML 原 prompt")


@app.post("/api/dhv5/broll/{template_id}/{scene_idx}", tags=["v5 视频"], summary="给单 scene 生 B-roll 图")
def dhv5_broll(template_id: str, scene_idx: int, regen: bool = False, req: Optional[Dhv5BrollReq] = None):
    """B 型 4:3 横版 / C 型 9:16 竖版. 走 ~/.claude/skills/poju-image-gen (apimart).
    存 ~/Desktop/skills/digital-human-video-v5/assets/brolls/<template_id>/.
    返 {scene_idx, scene_type, filename, local_path, url, size_bytes, skipped, prompt}.
    skipped=true 表示文件已存在且 regen=false 且无 prompt_override."""
    from backend.services import dhv5_pipeline
    prompt_override = req.prompt_override if req else None
    try:
        return dhv5_pipeline.generate_broll(template_id, scene_idx, regen=regen, prompt_override=prompt_override)
    except dhv5_pipeline.Dhv5Error as e:
        raise HTTPException(400, str(e))


@app.post("/api/dhv5/render", tags=["v5 视频"], summary="触发渲染 → 立即返 task_id")
def dhv5_render(req: Dhv5RenderReq):
    """异步渲染. 立即返 task_id, 真跑 3-10 分钟 (PIL plate + ffmpeg 合成).
    调用方轮询 GET /api/tasks/{task_id} 看 status: running → success/failed.
    success 时 task.result = {output_path, size_bytes, template_id}."""
    from backend.services import dhv5_pipeline
    try:
        task_id = dhv5_pipeline.render_async(
            template_id=req.template_id,
            digital_human_video=req.digital_human_video,
            output_name=req.output_name,
            scenes_override=req.scenes_override,
        )
    except dhv5_pipeline.Dhv5Error as e:
        raise HTTPException(400, str(e))
    return {"task_id": task_id, "template_id": req.template_id}


class Dhv5BatchRenderReq(BaseModel):
    template_id: str = Field(..., description="模板 id (templates/<id>.yaml 不带后缀)")
    digital_human_video: str = Field(..., description="共享数字人 mp4 绝对路径 (所有 transcript 共用)")
    transcripts: list[str] = Field(..., min_length=1, max_length=8,
        description="多段文案 (≤8, 防 GPU 爆). 每段独立起 task: 内部先 align 再 render.")
    align_mode: str = Field("auto", description="align_script 的 mode: auto / placeholder / manual")


@app.post("/api/dhv5/batch-render", tags=["v5 视频"], summary="批量渲染数字人视频 (D-077)")
def dhv5_batch_render(req: Dhv5BatchRenderReq):
    """场景: 老板有 N 段文案要做 N 个数字人视频, 共享同一个数字人 mp4 + 同一个模板.
    每条独立起 task: sync_fn 内部 align_script (3-5s) + _render_sync (3-10min).
    上限 8 条防 GPU 爆 (8 条串行约 24-80min, 并发约 1 条耗时).
    跟 /api/dhv5/render 区分: 那个是单条 + 已 align 好的 scenes; 这个是多条 + 内部 align."""
    from backend.services import dhv5_pipeline, tasks as tasks_service

    transcripts = [t.strip() for t in req.transcripts if t and t.strip()]
    if not transcripts:
        raise HTTPException(400, "transcripts 全为空")
    if not Path(req.digital_human_video).exists():
        raise HTTPException(400, f"数字人 mp4 不存在: {req.digital_human_video}")
    p_template = dhv5_pipeline.TEMPLATES_DIR / f"{req.template_id}.yaml"
    if not p_template.exists():
        raise HTTPException(400, f"模板不存在: {req.template_id}")

    out_tasks = []
    for i, transcript in enumerate(transcripts):
        def _make_sync(t=transcript, idx=i):
            def _sync():
                align = dhv5_pipeline.align_script(req.template_id, t, mode=req.align_mode)
                scenes = align.get("scenes", [])
                name = f"batch_{req.template_id}_{int(time.time())}_{idx}"
                output_path = dhv5_pipeline.OUTPUTS_DIR / f"{name}.mp4"
                actual = dhv5_pipeline._render_sync(
                    req.template_id, req.digital_human_video, output_path, scenes,
                )
                return {
                    "output_path": str(actual),
                    "output_url": f"/skills/dhv5/outputs/{actual.name}",
                    "size_bytes": actual.stat().st_size if actual.exists() else 0,
                    "scenes_count": len(scenes),
                    "transcript_chars": len(t),
                    "template_id": req.template_id,
                }
            return _sync

        task_id = tasks_service.run_async(
            kind="dhv5.batch-render",
            label=f"批量 v5 · {transcript[:24]}",
            ns="dhv5",
            page_id="dhv5",
            step="batch-render",
            payload={
                "template_id": req.template_id,
                "transcript_preview": transcript[:200],
                "transcript_chars": len(transcript),
            },
            estimated_seconds=300,  # ~5min/条 (align 5s + render 3-5min 平均)
            progress_text="对齐文案 + 渲染中 (3-10min)...",
            sync_fn=_make_sync(),
        )
        out_tasks.append({"task_id": task_id, "transcript": transcript})

    return {
        "tasks": out_tasks,
        "template_id": req.template_id,
        "transcripts_count": len(transcripts),
        "estimated_seconds": 300,
        "page_id": "dhv5",
    }


# ═══════════════════════════════════════════════════════════════════
# D-064b · 直接生图独立入口 (sidebar "🖼️ 直接出图")
# 不绑定业务流程, prompt + size + n + engine → 出 N 张候选
# 走 image_engine.generate, 异步任务. 跟即梦 standalone 入口对称.
# ═══════════════════════════════════════════════════════════════════

class ImageGenReq(BaseModel):
    prompt: str = Field(..., description="生图 prompt")
    size: str = Field("16:9", description="比例 16:9 / 9:16 / 1:1 / 3:4 / 4:3")
    n: int = Field(2, ge=1, le=8, description="出几张候选 (默认 2)")
    engine: str | None = Field(None, description="apimart | dreamina · None 用 settings 默认")
    label: str = Field("gen", description="文件名前缀 (落 data/image-gen/)")
    # D-073: 参考图 (apimart 引擎才支持, dreamina 暂忽略). 传 data URL (base64) 或公网 URL.
    refs: list[str] = Field(default_factory=list, max_length=4,
        description="参考图列表, 最多 4 张. 传了 AI 会基于图来改. apimart 引擎才支持.")


@app.post("/api/image/generate", tags=["生图"], summary="直接生图 (D-064b 独立工具, 异步)")
def image_generate(req: ImageGenReq):
    """异步触发图引擎生图. 立即返 task_id, daemon thread 跑.

    完成后 task.result = {images: [{url, local_path, media_url}, ...], engine, n, size, elapsed_sec}.
    apimart 30-60s/张, dreamina 60-120s/张.
    D-073: refs (参考图 data URL list) 仅 apimart 引擎接, dreamina 忽略.

    D-080: apimart 单图 (n=1) 改走 remote_jobs watcher — 即便 apimart 偶尔卡 >150s 也不假 fail.
    n>1 / dreamina 仍走老 image_engine.generate (sync 同步等), watchdog 600s 兜底.
    """
    from shortvideo import image_engine
    from backend.services import tasks as tasks_service
    actual_engine = (req.engine or image_engine.get_default_engine()).lower()
    est_sec = (30 if actual_engine == "apimart" else 90) * req.n
    refs = req.refs or None

    # D-080: apimart 单图走 watcher 路径
    if actual_engine == "apimart" and req.n == 1:
        from backend.services import apimart_service, remote_jobs
        from shortvideo.config import DATA_DIR
        out_dir = DATA_DIR / "image-gen"
        out_dir.mkdir(parents=True, exist_ok=True)

        task_id = tasks_service.create_task(
            kind="image.generate",
            label=f"直接生图 · {req.prompt[:30]}" + (f" · {len(refs)} 张参考图" if refs else ""),
            ns="image", page_id="imagegen", step="generate",
            payload={
                "prompt_preview": req.prompt[:200], "size": req.size, "n": 1,
                "engine": "apimart", "refs_count": len(refs) if refs else 0,
                "remote_managed": True,  # watchdog 跳过, watcher 接管
            },
            estimated_seconds=est_sec,
        )
        tasks_service.update_progress(task_id, f"apimart 提交中 ({req.size})...", pct=5)

        from backend.services import guest_mode as _gm
        captured = _gm.capture()

        def _submit_worker(p=req.prompt, tid=task_id, cap=captured):
            tok = _gm.set_guest(cap)
            try:
                import uuid as _uu
                fname = f"{req.label or 'img'}_{int(time.time())}_{_uu.uuid4().hex[:6]}.png"
                dest = out_dir / fname
                ar = apimart_service.submit_and_register(
                    prompt=p, size=req.size, refs=refs,
                    task_id=tid,
                    dest_path=str(dest),
                    kind="image",
                    title=p[:48],
                    source_skill="image-gen",
                    max_wait_sec=1200,
                )
                tasks_service.update_payload(tid, {
                    "apimart_task_id": ar["apimart_task_id"],
                    "submit_id": ar["apimart_task_id"],  # UI "🔍 重查" 一致用 submit_id
                    "dest_path": str(dest),
                })
                tasks_service.update_progress(
                    tid,
                    f"已提交 apimart (apimart_task_id={ar['apimart_task_id'][:10]}...), 等真出图",
                    pct=20,
                )
            except Exception as e:
                tasks_service.finish_task(tid, error=f"apimart 提交失败: {e}", status="failed")
            finally:
                _gm.reset(tok)

        threading.Thread(target=_submit_worker, daemon=True).start()
        return {"task_id": task_id, "status": "running", "estimated_seconds": est_sec, "page_id": "imagegen", "engine": "apimart", "remote_managed": True}

    # 老路径 (n>1 / dreamina): 同步 generate (image_engine.generate 内含下载 + 入作品库)
    task_id = tasks_service.run_async(
        kind="image.generate",
        label=f"直接生图 · {req.prompt[:30]} · {req.n} 张" + (f" · {len(refs)} 张参考图" if refs else ""),
        ns="image",
        page_id="imagegen",
        step="generate",
        payload={
            "prompt_preview": req.prompt[:200], "size": req.size, "n": req.n,
            "engine": actual_engine, "refs_count": len(refs) if refs else 0,
        },
        estimated_seconds=est_sec,
        progress_text=f"{actual_engine} 生 {req.n} 张图 ({req.size})..." + (" · 基于参考图" if refs else ""),
        sync_fn=lambda: image_engine.generate(
            prompt=req.prompt, size=req.size, n=req.n,
            engine=req.engine, label=req.label, refs=refs,
        ),
    )
    return {"task_id": task_id, "status": "running", "estimated_seconds": est_sec, "page_id": "imagegen", "engine": actual_engine}


class ImageBatchGenReq(BaseModel):
    prompts: list[str] = Field(..., min_length=1, max_length=20,
        description="一条或多条 prompt, ≤20. 每条独立起一个异步 task 出 n 张候选.")
    size: str = Field("16:9")
    n: int = Field(2, ge=1, le=8, description="每条 prompt 出几张候选")
    engine: str | None = Field(None, description="apimart | dreamina · None 用 settings 默认")
    label: str = Field("gen")
    refs: list[str] = Field(default_factory=list, max_length=4,
        description="参考图 data URL list, 共享给所有 prompt. 仅 apimart 引擎接.")


@app.post("/api/image/batch-generate", tags=["生图"], summary="批量出图 (D-076 N prompt × n 张)")
def image_batch_generate(req: ImageBatchGenReq):
    """每条 prompt 独立起一个异步 task, 立即返 N 个 task_id.
    跟 D-075 即梦视频对称: N 个 prompt × n 张候选 = N×n 张图. 共享 size/engine/refs.
    单 prompt × n 张走旧 /api/image/generate, 这个 endpoint 专门做 N>1 prompt 场景.
    """
    from shortvideo import image_engine
    from backend.services import tasks as tasks_service

    prompts = [p.strip() for p in req.prompts if p and p.strip()]
    if not prompts:
        raise HTTPException(400, "prompts 全为空")
    actual_engine = (req.engine or image_engine.get_default_engine()).lower()
    refs = req.refs or None
    est_per = (30 if actual_engine == "apimart" else 90) * req.n

    out_tasks = []
    for prompt in prompts:
        def _make_sync(p=prompt):
            def _sync():
                return image_engine.generate(
                    prompt=p, size=req.size, n=req.n,
                    engine=req.engine, label=req.label, refs=refs,
                )
            return _sync

        task_id = tasks_service.run_async(
            kind="image.generate",
            label=f"批量生图 · {prompt[:30]} · {req.n} 张" + (f" · {len(refs)} 张参考图" if refs else ""),
            ns="image",
            page_id="imagegen",
            step="batch",
            payload={
                "prompt_preview": prompt[:200], "size": req.size, "n": req.n,
                "engine": actual_engine, "refs_count": len(refs) if refs else 0,
            },
            estimated_seconds=est_per,
            progress_text=f"{actual_engine} 生 {req.n} 张图 ({req.size})..." + (" · 基于参考图" if refs else ""),
            sync_fn=_make_sync(),
        )
        out_tasks.append({"task_id": task_id, "prompt": prompt})

    return {
        "tasks": out_tasks,
        "n_per_prompt": req.n,
        "size": req.size,
        "engine": actual_engine,
        "refs_count": len(refs) if refs else 0,
        "estimated_seconds": est_per,
        "page_id": "imagegen",
    }


# D-073: 参考图上传 — 接本地文件, 转 base64 data URL 返回给前端,
# 前端再把 data URL 加到 /api/image/generate 的 refs 字段里 (apimart 接 data URL).
# 不存盘 (临时素材, 用完即弃, 避免污染作品库).
@app.post("/api/image/upload-ref", tags=["生图"], summary="上传参考图 → base64 data URL (D-073)")
async def image_upload_ref(file: UploadFile = File(...)):
    """单张图 → 转 base64 data URL. apimart 接 data URL, 不需要本地落盘.
    单张 ≤4MB (apimart 大概率接收, 大了会拒). jpg/png/webp.
    """
    data = await file.read()
    if not data:
        raise HTTPException(400, "空文件")
    if len(data) > 4 * 1024 * 1024:
        raise HTTPException(400, f"图太大 {len(data)//1024} KB · 上限 4096 KB")
    ext = (Path(file.filename or "ref.jpg").suffix or ".jpg").lower()
    mime_map = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp"}
    if ext not in mime_map:
        raise HTTPException(400, f"只支持 jpg/png/webp · 收到 {ext}")
    import base64 as _b64
    b64 = _b64.b64encode(data).decode("ascii")
    data_url = f"data:{mime_map[ext]};base64,{b64}"
    return {"ok": True, "data_url": data_url, "size_bytes": len(data), "mime": mime_map[ext]}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000, log_level="info")
