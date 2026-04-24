"""ShortVideo Studio — Streamlit 一页六卡 UI.

Run: streamlit run app.py
"""
from __future__ import annotations

import time
from pathlib import Path

import streamlit as st

from shortvideo.config import settings, AUDIO_DIR, VIDEO_DIR
from shortvideo.shiliu import ShiliuClient, ShiliuError
from shortvideo.deepseek import DeepSeekClient
from shortvideo.works import init_db, insert_work, update_work, get_work, list_works, delete_work
from shortvideo.tasks import get_task_manager
from shortvideo.cosyvoice import CosyVoiceLocal
from shortvideo.extractor import download_video, transcribe_placeholder

# --------------------------------------------------------------------------- #
# 页面配置                                                                      #
# --------------------------------------------------------------------------- #
st.set_page_config(
    page_title="ShortVideo Studio",
    page_icon="🎬",
    layout="wide",
    initial_sidebar_state="collapsed",
)


CUSTOM_CSS = """
<style>
    html, body, [class*="css"] { font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif; }
    .block-container { padding-top: 2rem; padding-bottom: 3rem; max-width: 1200px; }
    .top-bar {
        background: linear-gradient(135deg, #1a1033 0%, #2d1b5e 50%, #3a2b7a 100%);
        color: #eadfff; padding: 16px 24px; border-radius: 14px; margin-bottom: 18px;
        display: flex; flex-wrap: wrap; gap: 18px; align-items: center;
        box-shadow: 0 6px 24px rgba(58, 43, 122, 0.25);
    }
    .top-bar h2 { margin: 0; font-size: 1.1rem; letter-spacing: 0.5px; }
    .pill { background: rgba(255,255,255,0.1); padding: 4px 12px; border-radius: 999px; font-size: 0.85rem; }
    .pill.ok { background: rgba(76, 217, 100, 0.22); color: #b4f3be; }
    .pill.warn { background: rgba(255, 193, 7, 0.22); color: #ffe08a; }
    .pill.err { background: rgba(255, 82, 82, 0.25); color: #ffb3b3; }
    .card-title { font-size: 1.05rem; font-weight: 600; margin-bottom: 4px; }
    .card-sub { color: #888; font-size: 0.85rem; margin-bottom: 14px; }
    [data-testid="stExpander"] {
        border: 1px solid #e4dff5 !important;
        border-radius: 14px !important;
        background: linear-gradient(180deg, #ffffff 0%, #fbf9ff 100%);
        margin-bottom: 14px;
    }
    [data-testid="stExpander"] > details > summary {
        padding: 14px 20px !important;
        font-weight: 600;
    }
    .stButton > button[kind="primary"] {
        background: linear-gradient(90deg, #6d4bd4 0%, #9768ff 100%);
        border: 0; box-shadow: 0 4px 14px rgba(109, 75, 212, 0.35);
    }
</style>
"""
st.markdown(CUSTOM_CSS, unsafe_allow_html=True)

# --------------------------------------------------------------------------- #
# session_state 初始化                                                          #
# --------------------------------------------------------------------------- #
def ss_init():
    defaults = {
        "original_text": "",
        "rewritten_text": "",
        "final_text": "",
        "titles_raw": "",
        "selected_avatar_id": settings.default_avatar_id,
        "selected_speaker_id": settings.default_speaker_id,
        "avatars": None,
        "speakers": None,
        "credits": None,
        "task_id": None,
        "last_work_id": None,
        "source_url": "",
        "voice_sample_path": str(AUDIO_DIR / "samples" / "voice_ref_15s.wav"),
        "extract_result": None,
        "llm_tokens_used": 0,
    }
    for k, v in defaults.items():
        if k not in st.session_state:
            st.session_state[k] = v


ss_init()
init_db()

# --------------------------------------------------------------------------- #
# 缓存客户端                                                                    #
# --------------------------------------------------------------------------- #
@st.cache_resource
def get_shiliu() -> ShiliuClient:
    return ShiliuClient()


@st.cache_resource
def get_ds() -> DeepSeekClient:
    return DeepSeekClient()


@st.cache_resource
def get_cosyvoice() -> CosyVoiceLocal:
    return CosyVoiceLocal()


@st.cache_data(ttl=60, show_spinner=False)
def fetch_credits():
    return get_shiliu().get_credits()


@st.cache_data(ttl=300, show_spinner=False)
def fetch_avatars():
    return get_shiliu().list_avatars()


@st.cache_data(ttl=300, show_spinner=False)
def fetch_speakers():
    return get_shiliu().list_speakers()


# --------------------------------------------------------------------------- #
# 顶栏 - AI 服务控制台                                                          #
# --------------------------------------------------------------------------- #
def render_top_bar():
    try:
        credits = fetch_credits()
        shiliu_pill = f'<span class="pill ok">🟢 石榴 · {credits.points} 点 · 到期 {credits.valid_to[:10]}</span>'
    except Exception as e:
        shiliu_pill = f'<span class="pill err">🔴 石榴失联 · {type(e).__name__}</span>'

    ds_pill = f'<span class="pill ok">🟢 DeepSeek · {settings.deepseek_model}</span>'

    cosy_ready = get_cosyvoice().is_ready()
    cosy_pill = (
        '<span class="pill ok">🟢 CosyVoice 本地</span>'
        if cosy_ready
        else '<span class="pill warn">🟡 CosyVoice 未就绪(可选)</span>'
    )

    html = f"""
    <div class="top-bar">
        <h2>🎬 ShortVideo Studio</h2>
        {shiliu_pill}
        {ds_pill}
        {cosy_pill}
        <span class="pill">LLM tokens used: {st.session_state.get('llm_tokens_used', 0)}</span>
    </div>
    """
    st.markdown(html, unsafe_allow_html=True)


render_top_bar()

# --------------------------------------------------------------------------- #
# 卡片 1:提取文案 / 直贴文案                                                     #
# --------------------------------------------------------------------------- #
with st.expander("📝 ①  文案输入 · 从视频链接提取 或 直接粘贴", expanded=True):
    tab_url, tab_paste = st.tabs(["🔗 从视频 URL 提取", "✍️ 直接粘贴文案"])

    with tab_url:
        url = st.text_input(
            "视频链接(抖音/小红书/B站/YouTube)",
            value=st.session_state.get("source_url", ""),
            placeholder="https://www.douyin.com/video/...",
            key="ui_source_url",
        )
        col1, col2 = st.columns([1, 4])
        with col1:
            if st.button("⬇️ 下载视频", use_container_width=True, disabled=not url):
                with st.spinner("正在下载..."):
                    try:
                        res = download_video(url)
                        st.session_state.extract_result = res
                        st.session_state.source_url = url
                        st.success(f"✅ 已下载:{res.title}  时长 {res.duration:.1f}s")
                    except Exception as e:
                        st.error(f"下载失败:{type(e).__name__}: {e}")
        with col2:
            if st.session_state.extract_result:
                res = st.session_state.extract_result
                st.caption(f"标题:{res.title} · 时长 {res.duration:.1f}s · 文件 {res.video_path.name}")
                asr_stub = transcribe_placeholder(res.audio_path)
                st.info("ASR 还未集成(P3 阶段接入),请先在右侧「直接粘贴文案」中手动贴原文。")

    with tab_paste:
        DEMO_TEXT = (
            "今天看到一个热搜,全国高校砍掉了5000多个专业,很多人就慌了,"
            "觉得是不是以后冷门专业就彻底没饭吃了。其实你仔细看名单就会发现,"
            "砍掉的大多是那些培养了十几年都没人招、或者产业早就不需要的。"
            "这对年轻人来说恰恰是好事。"
        )

        def _load_demo():
            st.session_state["ui_original"] = DEMO_TEXT

        def _clear_text():
            st.session_state["ui_original"] = ""
            st.session_state["rewritten_text"] = ""

        col_a, col_b, _ = st.columns([1, 1, 3])
        with col_a:
            st.button("📋 加载示例文案", on_click=_load_demo, use_container_width=True)
        with col_b:
            st.button("🧹 清空", on_click=_clear_text, use_container_width=True)

        text = st.text_area(
            "粘贴原文(长文也可以,下一步会改写/精简)",
            height=150,
            placeholder="例:今天看到一个热搜,全国高校砍掉了5000多个专业......",
            key="ui_original",
        )
        st.session_state.original_text = text or ""

# --------------------------------------------------------------------------- #
# 卡片 2:文案改写                                                               #
# --------------------------------------------------------------------------- #
with st.expander("✏️ ②  改写文案 · DeepSeek 优化为口播节奏", expanded=bool(st.session_state.original_text)):
    def _do_rewrite():
        try:
            r = get_ds().rewrite_script(
                st.session_state.get("ui_original", ""),
                style_hint=st.session_state.get("ui_style", ""),
            )
            st.session_state["rewritten_text"] = r.text
            st.session_state["ui_final"] = r.text
            st.session_state["llm_tokens_used"] += r.total_tokens
            st.session_state["_flash_ok"] = f"改写完成,消耗 {r.total_tokens} tokens"
        except Exception as e:
            st.session_state["_flash_err"] = f"改写失败:{type(e).__name__}: {e}"

    def _use_original():
        st.session_state["ui_final"] = st.session_state.get("ui_original", "")

    col1, col2 = st.columns([3, 1])
    with col1:
        st.text_input(
            "风格提示(可选)",
            placeholder="例:有钩子,有冲突感,适合快节奏",
            key="ui_style",
        )
    with col2:
        st.write("")
        st.button(
            "✨ 用 DeepSeek 改写",
            type="primary",
            use_container_width=True,
            disabled=not st.session_state.get("ui_original"),
            on_click=_do_rewrite,
        )

    ok_msg = st.session_state.pop("_flash_ok", None)
    if ok_msg:
        st.success(ok_msg)
    err_msg = st.session_state.pop("_flash_err", None)
    if err_msg:
        st.error(err_msg)

    col_copy, _ = st.columns([1, 4])
    with col_copy:
        st.button(
            "↩️ 使用原文作为最终文案",
            on_click=_use_original,
            disabled=not st.session_state.get("ui_original"),
            use_container_width=True,
        )

    st.text_area(
        "最终文案(可编辑 · 将用于数字人生成)",
        height=180,
        key="ui_final",
    )
    st.session_state["final_text"] = st.session_state.get("ui_final", "")
    st.caption(f"字数:{len(st.session_state['final_text'])}  · 建议 50-400 字")

# --------------------------------------------------------------------------- #
# 卡片 3:声音克隆 (本地 CosyVoice 2 独立模块)                                    #
# --------------------------------------------------------------------------- #
with st.expander("🎙 ③  本地声音克隆 · CosyVoice 2 (独立模块,不影响主流程)"):
    cosy = get_cosyvoice()
    if cosy.is_ready():
        st.success("✅ CosyVoice 2 模型已就绪")
        ref_path = st.text_input("参考音频路径", value=st.session_state.voice_sample_path)
        clone_text = st.text_area("要合成的文本", value="你好,这是本地声音克隆测试。", height=80)
        if st.button("🎤 合成音频", type="primary"):
            with st.spinner("CosyVoice 推理中..."):
                try:
                    res = cosy.clone(clone_text, reference_wav=ref_path)
                    st.audio(str(res.audio_path))
                    st.success(f"生成完成:{res.audio_path.name}")
                except Exception as e:
                    st.error(f"失败:{e}")
    else:
        st.warning(
            "🟡 CosyVoice 2 本地模型尚未安装。"
            "主流程(石榴数字人)不依赖它,可跳过。"
            "要启用,请执行 `bash scripts/setup_cosyvoice.sh`(P3 阶段提供)。"
        )
        sample = Path(st.session_state.voice_sample_path)
        if sample.exists():
            st.audio(str(sample))
            st.caption(f"已就位的参考音频:{sample.name}")

# --------------------------------------------------------------------------- #
# 卡片 4:数字人生成 (石榴)                                                       #
# --------------------------------------------------------------------------- #
with st.expander("🎭 ④  数字人生成 · 石榴 API", expanded=bool(st.session_state.final_text)):
    try:
        avatars = fetch_avatars()
        speakers = fetch_speakers()
    except Exception as e:
        st.error(f"无法拉取 avatar/speaker 列表:{e}")
        avatars, speakers = [], []

    col1, col2 = st.columns(2)
    with col1:
        if avatars:
            idx = 0
            for i, a in enumerate(avatars):
                if a.avatar_id == st.session_state.selected_avatar_id:
                    idx = i
                    break
            av = st.selectbox(
                "Avatar 数字人分身",
                avatars,
                index=idx,
                format_func=lambda a: f"{a.title or '-'} · {a.avatar_id}",
                key="ui_avatar",
            )
            st.session_state.selected_avatar_id = av.avatar_id
    with col2:
        if speakers:
            idx = 0
            for i, s in enumerate(speakers):
                if s.speaker_id == st.session_state.selected_speaker_id:
                    idx = i
                    break
            sp = st.selectbox(
                "Speaker 声音分身",
                speakers,
                index=idx,
                format_func=lambda s: f"{s.title or '-'} · {s.speaker_id}",
                key="ui_speaker",
            )
            st.session_state.selected_speaker_id = sp.speaker_id

    work_title = st.text_input("作品标题(可选)", value="", placeholder="方便作品库检索")
    can_submit = bool(st.session_state.final_text and st.session_state.selected_avatar_id
                      and st.session_state.selected_speaker_id and st.session_state.task_id is None)

    if st.button("🚀 提交生成", type="primary", disabled=not can_submit, use_container_width=True):
        tm = get_task_manager()
        # 所有需要的值在主线程里捕获,避免后台线程访问 st.session_state 报错
        text = st.session_state.final_text
        avatar_id = st.session_state.selected_avatar_id
        speaker_id = st.session_state.selected_speaker_id
        source_url = st.session_state.get("source_url") or None
        original_text = st.session_state.original_text or None
        title = work_title or text[:20]
        wid = insert_work(
            final_text=text,
            title=title,
            source_url=source_url,
            original_text=original_text,
            avatar_id=avatar_id,
            speaker_id=speaker_id,
            status="generating",
        )
        st.session_state.last_work_id = wid

        def job(text, avatar_id, speaker_id, title, progress_cb=None):
            client = ShiliuClient()
            def _on(status):
                if progress_cb:
                    progress_cb(status.progress, message=f"{status.status}  {status.progress}%")
            video_id, path = client.generate_and_download(
                text,
                avatar_id=avatar_id,
                speaker_id=speaker_id,
                title=title,
                on_progress=_on,
            )
            return {"video_id": video_id, "path": str(path)}

        tid = tm.submit("shiliu_video", job, text, avatar_id, speaker_id, title)
        st.session_state.task_id = tid
        st.rerun()

    # ---- 任务进度面板 ----
    if st.session_state.task_id:
        tm = get_task_manager()
        st_task = tm.status(st.session_state.task_id)
        if st_task:
            pct = st_task.progress
            state_emoji = {"pending": "⏳", "running": "🚀", "succeed": "✅", "failed": "❌"}[st_task.state]
            st.markdown(f"**{state_emoji} {st_task.kind} · {st_task.state}** · {st_task.elapsed():.0f}s")
            st.progress(pct / 100, text=st_task.message or f"{pct}%")

            if st_task.state == "succeed":
                result = st_task.result or {}
                path = result.get("path")
                vid = result.get("video_id")
                if path and Path(path).exists():
                    st.video(path)
                    update_work(
                        st.session_state.last_work_id,
                        status="ready",
                        shiliu_video_id=vid,
                        local_path=path,
                    )
                    st.success(f"✅ 生成完成:video_id={vid}  ·  {path}")
                st.session_state.task_id = None
            elif st_task.state == "failed":
                st.error(f"生成失败:{st_task.error}")
                if st.session_state.last_work_id:
                    update_work(st.session_state.last_work_id, status="failed", error=st_task.error)
                st.session_state.task_id = None
            else:
                time.sleep(2)
                st.rerun()

# --------------------------------------------------------------------------- #
# 卡片 5:标题生成                                                               #
# --------------------------------------------------------------------------- #
with st.expander("🏷 ⑤  标题生成 · 批量候选", expanded=False):
    n = st.slider("生成数量", 3, 10, 5)
    if st.button("🪄 生成候选标题", use_container_width=True,
                 disabled=not st.session_state.final_text):
        with st.spinner("DeepSeek 生成中..."):
            try:
                r = get_ds().generate_titles(st.session_state.final_text, count=n)
                st.session_state.titles_raw = r.text
                st.session_state.llm_tokens_used += r.total_tokens
            except Exception as e:
                st.error(f"生成失败:{e}")
    if st.session_state.titles_raw:
        for line in [ln for ln in st.session_state.titles_raw.split("\n") if ln.strip()]:
            st.markdown(f"- {line.strip()}")

# --------------------------------------------------------------------------- #
# 卡片 6:作品库                                                                 #
# --------------------------------------------------------------------------- #
with st.expander("📚 ⑥  作品库", expanded=False):
    works = list_works(limit=50)
    if not works:
        st.info("还没有作品。")
    else:
        st.caption(f"共 {len(works)} 条")
        for w in works:
            cols = st.columns([4, 2, 1, 1])
            with cols[0]:
                st.markdown(f"**{w.title or '(无标题)'}**  ·  *id={w.id}*")
                st.caption((w.final_text or "")[:80] + ("..." if len(w.final_text or "") > 80 else ""))
            with cols[1]:
                status_color = {"ready": "🟢", "generating": "🟡", "failed": "🔴", "pending": "⚪"}.get(w.status, "⚪")
                st.write(f"{status_color} {w.status}")
                if w.local_path and Path(w.local_path).exists():
                    st.caption(f"{Path(w.local_path).name}")
            with cols[2]:
                if w.local_path and Path(w.local_path).exists():
                    if st.button("▶️", key=f"play_{w.id}"):
                        st.session_state[f"show_video_{w.id}"] = True
            with cols[3]:
                if st.button("🗑", key=f"del_{w.id}"):
                    delete_work(w.id, remove_file=True)
                    st.rerun()
            if st.session_state.get(f"show_video_{w.id}"):
                st.video(w.local_path)
            st.divider()
