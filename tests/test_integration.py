"""集成测试 - 验证 shortvideo 包各模块可用,API 可通,作品库可写。

Run: python -m pytest tests/test_integration.py -v -s
"""
import time
from pathlib import Path

import pytest

from shortvideo.config import settings, DATA_DIR, DB_PATH
from shortvideo.shiliu import ShiliuClient, ShiliuError
from shortvideo.deepseek import DeepSeekClient
from shortvideo.works import init_db, insert_work, update_work, get_work, list_works, delete_work
from shortvideo.tasks import get_task_manager
from shortvideo.cosyvoice import CosyVoiceLocal, CosyVoiceNotReady


# ---------- 配置 ----------

def test_settings_loaded():
    assert settings.shiliu_api_key, "SHILIU_API_KEY not loaded"
    assert settings.deepseek_api_key, "DEEPSEEK_API_KEY not loaded"
    assert settings.default_avatar_id
    assert settings.default_speaker_id
    assert DATA_DIR.exists()


# ---------- 石榴 ----------

def test_shiliu_credits():
    c = ShiliuClient()
    credits = c.get_credits()
    assert credits.points > 0, "no points available"
    print(f"    points={credits.points}  valid_to={credits.valid_to}")


def test_shiliu_list_avatars_speakers():
    c = ShiliuClient()
    avatars = c.list_avatars()
    speakers = c.list_speakers()
    assert avatars, "no avatars"
    assert speakers, "no speakers"
    print(f"    avatars={[a.title for a in avatars]}")
    print(f"    speakers={[s.title for s in speakers]}")


# ---------- DeepSeek ----------

def test_deepseek_chat():
    ds = DeepSeekClient()
    r = ds.chat("用一句话说你是谁?不超过15字", temperature=0.3, max_tokens=50)
    assert r.text
    assert r.total_tokens > 0
    print(f"    reply='{r.text}'  tokens={r.total_tokens}")


def test_deepseek_rewrite():
    ds = DeepSeekClient()
    r = ds.rewrite_script(
        "今天我们来聊聊AI数字人。很多人觉得这东西离自己很远,其实你现在就能用。",
        style_hint="口语化,有节奏",
    )
    assert r.text
    assert len(r.text) > 10
    print(f"    rewritten=\n{r.text[:200]}...")
    print(f"    tokens={r.total_tokens}")


def test_deepseek_titles():
    ds = DeepSeekClient()
    r = ds.generate_titles(
        "AI数字人已经普及到每个人都能用了,本地跑一条视频只要几分钟,成本几毛钱。",
        count=3,
    )
    assert r.text
    lines = [x for x in r.text.split("\n") if x.strip()]
    assert len(lines) >= 2
    print(f"    titles=\n{r.text}")


# ---------- 作品库 ----------

def test_works_crud():
    init_db()
    wid = insert_work(final_text="测试文案 CRUD", title="pytest")
    assert wid
    w = get_work(wid)
    assert w and w.title == "pytest"
    assert w.status == "pending"
    update_work(wid, status="ready", shiliu_video_id=999, local_path="/tmp/x.mp4")
    w2 = get_work(wid)
    assert w2.status == "ready"
    assert w2.shiliu_video_id == 999
    all_w = list_works(limit=10)
    assert any(x.id == wid for x in all_w)
    delete_work(wid)
    assert get_work(wid) is None


# ---------- 任务管理器 ----------

def test_task_manager_basic():
    tm = get_task_manager()

    def job(n, progress_cb=None):
        for i in range(n):
            time.sleep(0.05)
            if progress_cb:
                progress_cb(int((i + 1) / n * 100), message=f"step {i+1}/{n}")
        return {"done": True, "n": n}

    tid = tm.submit("demo", job, 4)
    for _ in range(50):
        st = tm.status(tid)
        if st.state in ("succeed", "failed"):
            break
        time.sleep(0.05)
    st = tm.status(tid)
    assert st.state == "succeed", f"state={st.state} error={st.error}"
    assert st.result == {"done": True, "n": 4}
    assert st.progress == 100


# ---------- CosyVoice 本地(独立 sidecar) ----------

def test_cosyvoice_runtime():
    """根据 CosyVoice sidecar 是否在跑,做不同的断言。"""
    tts = CosyVoiceLocal()
    if tts.is_ready():
        print(f"    CosyVoice ready  model={tts.model_dir}  sidecar={tts.sidecar_url}")
        assert tts.venv_ready()
        assert tts.model_files_present()
    else:
        # 当 sidecar 未启动时,clone() 必须优雅报错
        with pytest.raises(CosyVoiceNotReady):
            tts.clone("hello", reference_wav="x.wav")
        print("    CosyVoice not ready (sidecar 未启动),clone() 正确抛 CosyVoiceNotReady")


# ---------- 端到端 · 石榴(不每次都跑,用 -m slow 控制) ----------

@pytest.mark.slow
def test_shiliu_end_to_end_short():
    """真实生成一条 3 秒视频,消耗石榴点数。默认跳过。"""
    c = ShiliuClient()
    text = "这是一条集成测试文案"
    video_id, path = c.generate_and_download(text, title="pytest-slow")
    assert path.exists()
    assert path.stat().st_size > 100_000
    print(f"    generated video {video_id}  {path}")
