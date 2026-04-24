"""End-to-end: create a Shiliu video by text, poll status until ready, download MP4.

Run: python scripts/e2e_shiliu.py "你的文案"
"""
import os
import sys
import time
from pathlib import Path

import httpx
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")

KEY = os.getenv("SHILIU_API_KEY")
URL = os.getenv("SHILIU_BASE_URL")
AVATAR = int(os.getenv("DEFAULT_AVATAR_ID"))
SPEAKER = int(os.getenv("DEFAULT_SPEAKER_ID"))

OUT_DIR = ROOT / "data" / "videos"
OUT_DIR.mkdir(parents=True, exist_ok=True)


def post(endpoint: str, data: dict | None = None, timeout: float = 30.0) -> dict:
    headers = {
        "Accept": "application/json",
        "Authorization": f"Bearer {KEY}",
        "Content-Type": "application/json",
    }
    r = httpx.post(f"{URL}/{endpoint}", headers=headers, json=data or {}, timeout=timeout)
    r.raise_for_status()
    return r.json()


def create_video(text: str, title: str = "e2e-test") -> tuple[int, int]:
    print(f"[1/3] Submitting video: avatar={AVATAR} speaker={SPEAKER} text_len={len(text)}")
    resp = post(
        "video/createByText",
        {"avatarId": AVATAR, "speakerId": SPEAKER, "text": text, "title": title},
        timeout=120.0,
    )
    if resp.get("code") != 0:
        raise RuntimeError(f"createByText failed: {resp}")
    data = resp["data"]
    video_id = data["videoId"]
    length_ms = data.get("length", 0)
    print(f"      → video_id={video_id} estimated_length={length_ms}ms")
    return video_id, length_ms


def wait_ready(video_id: int, max_wait_sec: int = 600) -> dict:
    print(f"[2/3] Polling video/status (max {max_wait_sec}s)...")
    start = time.time()
    last_status = None
    while time.time() - start < max_wait_sec:
        resp = post("video/status", {"videoId": video_id}, timeout=20.0)
        if resp.get("code") != 0:
            print(f"      status API returned code={resp.get('code')} msg={resp.get('msg')}")
            time.sleep(5)
            continue
        d = resp["data"]
        status = d.get("status")
        progress = d.get("progress")
        video_url = d.get("videoUrl")
        if status != last_status:
            print(f"      status={status} progress={progress}% url={'<yes>' if video_url else '<no>'}")
            last_status = status
        if status in ("SUCCEED", "SUCCESS", "COMPLETE", "COMPLETED", "FINISHED", "DONE") or video_url:
            print(f"      → ready after {int(time.time()-start)}s")
            return d
        if status in ("FAILED", "ERROR"):
            raise RuntimeError(f"video generation failed: {d}")
        time.sleep(8)
    raise TimeoutError(f"video {video_id} not ready after {max_wait_sec}s")


def download(url: str, video_id: int) -> Path:
    print(f"[3/3] Downloading MP4...")
    path = OUT_DIR / f"shiliu_{video_id}.mp4"
    with httpx.stream("GET", url, timeout=120.0, follow_redirects=True) as r:
        r.raise_for_status()
        with open(path, "wb") as f:
            for chunk in r.iter_bytes(1 << 16):
                f.write(chunk)
    size_mb = path.stat().st_size / 1024 / 1024
    print(f"      → saved {path}  ({size_mb:.2f} MB)")
    return path


def main():
    text = sys.argv[1] if len(sys.argv) > 1 else (
        "大家好,这是一次端到端测试。我正在用石榴数字人和我的声音克隆,"
        "生成这条短视频。如果你能看到这段内容,说明整条链路已经跑通了。"
    )
    t0 = time.time()
    video_id, _ = create_video(text)
    status = wait_ready(video_id)
    url = status.get("videoUrl")
    if not url:
        print(f"⚠️ no videoUrl in status: {status}")
        sys.exit(1)
    download(url, video_id)
    print(f"\n✅ E2E OK in {int(time.time()-t0)}s  video_id={video_id}")


if __name__ == "__main__":
    main()
