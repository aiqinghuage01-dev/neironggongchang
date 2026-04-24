"""冒烟:轻抖 + apimart 两个新 API."""
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from shortvideo.config import AUDIO_DIR
from shortvideo.qingdou import QingdouClient, QingdouResult
from shortvideo.apimart import ApimartClient, cover_prompt


TEST_URL = "https://www.douyin.com/video/7512345678901234567"  # 稍后替换为真实 URL


def test_qingdou(url: str):
    print(f"\n[轻抖] 提交 {url}")
    t0 = time.time()
    with QingdouClient() as c:
        try:
            batch_id = c.commit(url)
            print(f"  batch_id={batch_id}")
            last = None
            for i in range(25):
                res = c.query(batch_id)
                if res.status != last:
                    print(f"  [{int(time.time()-t0)}s] status={res.status}")
                    last = res.status
                if res.status in ("succeed", "failed"):
                    print(f"  text_len={len(res.text)}  title='{res.title}'  err='{res.error}'")
                    if res.text:
                        print(f"  excerpt: {res.text[:80]}...")
                    return res.status == "succeed"
                time.sleep(3)
            print("  超时")
            return False
        except Exception as e:
            print(f"  ❌ {type(e).__name__}: {e}")
            return False


def test_apimart():
    print("\n[apimart] 生成一张封面(约 30-90 秒)")
    t0 = time.time()
    out = ROOT / "data" / "covers" / f"smoke_{int(time.time())}.png"
    try:
        with ApimartClient() as c:
            res = c.generate_and_download(
                cover_prompt("各免一个月", "健身房引流"),
                out,
                size="9:16",
            )
        print(f"  ✅ {res.local_path}  {res.elapsed_sec}s  url_len={len(res.url)}")
        return True
    except Exception as e:
        print(f"  ❌ {type(e).__name__}: {e}  ({int(time.time()-t0)}s)")
        return False


def main():
    url = sys.argv[1] if len(sys.argv) > 1 else None
    ok_img = test_apimart()
    ok_qd = True
    if url:
        ok_qd = test_qingdou(url)
    else:
        print("\n(跳过轻抖:未提供 URL 参数,用 python scripts/smoke_new_apis.py https://v.douyin.com/xxx 跑)")
    print(f"\nResult: img={'✅' if ok_img else '❌'}  qingdou={'✅' if ok_qd else '⏭'}")
    sys.exit(0 if (ok_img and ok_qd) else 1)


if __name__ == "__main__":
    main()
