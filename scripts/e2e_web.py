"""端到端验证 · 前端 + 后端全链路(不依赖浏览器,纯 HTTP)

1. POST /api/rewrite      → DeepSeek 改写
2. GET /api/speakers + /api/avatars
3. POST /api/video/submit → 石榴提交
4. 轮询 /api/video/query  → 获得 local_url
5. POST /api/cover n=4    → apimart 封面(并发)
6. 轮询 /api/cover/query  → 获得 4 张图
7. POST /api/publish      → 模拟发布
8. GET /api/works         → 确认作品落库
"""
import sys, time, json
from pathlib import Path

import httpx

API = "http://127.0.0.1:8000"


def main():
    t_all = time.time()
    c = httpx.Client(timeout=120.0)

    # 1. health
    h = c.get(f"{API}/api/health").json()
    print(f"[health] shiliu={h['shiliu']['ok']}  DS={h['deepseek']['ok']}  "
          f"cosy={h['cosyvoice']['ok']}  qingdou={h['qingdou']['ok']}  apimart={h['apimart']['ok']}")
    assert h["shiliu"]["ok"] and h["deepseek"]["ok"]

    # 2. rewrite
    t0 = time.time()
    r = c.post(f"{API}/api/rewrite", json={
        "text": "全国高校砍掉了5000多个专业,很多人慌了,其实仔细看名单会发现砍掉的大多是那些培养十几年都没人招的。",
        "style": "casual",
    }).json()
    print(f"[rewrite] {len(r['text'])} 字 · {r['tokens']} tokens · {time.time()-t0:.1f}s")
    final_text = r["text"]

    # 3. speakers + avatars
    sps = c.get(f"{API}/api/speakers").json()
    avs = c.get(f"{API}/api/avatars").json()
    print(f"[resources] speakers={[s['title'] for s in sps]}  avatars={[a['title'] for a in avs]}")
    speaker_id = sps[0]["id"]
    avatar_id = avs[0]["id"]

    # 4. video submit
    t1 = time.time()
    sub = c.post(f"{API}/api/video/submit", json={
        "text": final_text,
        "avatar_id": avatar_id,
        "speaker_id": speaker_id,
        "title": "[e2e-web] 高校砍专业",
    }).json()
    vid = sub["video_id"]
    wid = sub["work_id"]
    print(f"[video/submit] video_id={vid}  work_id={wid}")

    # 5. poll video
    local_url = None
    for i in range(60):
        q = c.get(f"{API}/api/video/query/{vid}").json()
        if q.get("local_url"):
            local_url = q["local_url"]
            print(f"[video/ready] {local_url}  ({int(time.time()-t1)}s)")
            break
        if q.get("status", "").lower() == "failed":
            print(f"[video/failed] {q}")
            return False
        time.sleep(6)
    if not local_url:
        print("[video/timeout]")
        return False

    # 6. covers: 起 4 张
    t2 = time.time()
    cv = c.post(f"{API}/api/cover", json={"slogan": "各免一个月", "category": "实体店引流", "n": 4}).json()
    task_ids = [t["task_id"] for t in cv["tasks"]]
    print(f"[cover/submit] {len(task_ids)} tasks")

    # 7. poll covers(最多 2 分钟)
    cover_results = {tid: None for tid in task_ids}
    for i in range(30):
        pending = [tid for tid, v in cover_results.items() if v is None]
        if not pending:
            break
        for tid in pending:
            q = c.get(f"{API}/api/cover/query/{tid}").json()
            if q.get("status") in ("succeed", "failed"):
                cover_results[tid] = q
        time.sleep(5)
    succ = [v for v in cover_results.values() if v and v.get("status") == "succeed"]
    fail = [v for v in cover_results.values() if v and v.get("status") == "failed"]
    print(f"[cover] succeed={len(succ)}/{len(task_ids)}  fail={len(fail)}  · {int(time.time()-t2)}s")
    for v in succ:
        print(f"   - {v.get('media_url') or v.get('local_path')}")

    # 8. publish
    pub = c.post(f"{API}/api/publish", json={
        "work_id": wid, "platforms": ["douyin", "shipinhao"], "schedule_at": None
    }).json()
    print(f"[publish] {pub['note']}")

    # 9. works 确认
    ws = c.get(f"{API}/api/works").json()
    latest = ws[0] if ws else None
    print(f"[works] total={len(ws)}  latest: id={latest['id']} status={latest['status']} title='{latest['title']}'")

    total = int(time.time() - t_all)
    print(f"\n✅ E2E OK · 总耗时 {total}s  ·  covers={len(succ)}/4  video={local_url}")
    return True


if __name__ == "__main__":
    ok = main()
    sys.exit(0 if ok else 1)
