"""端到端压测 - 用 5 条不同风格的文案真实生成,验证稳定性。

Run: python scripts/stress_test.py
"""
import time
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from shortvideo.shiliu import ShiliuClient, ShiliuError
from shortvideo.deepseek import DeepSeekClient
from shortvideo.works import init_db, insert_work, update_work
from shortvideo.config import settings

REPORT = ROOT / "test_report.md"

CASES = [
    {
        "title": "短文案 · 30 字",
        "text": "今天你不再是一个人打仗,AI 就是你的那个副驾驶。",
    },
    {
        "title": "中文案 · 100 字",
        "text": "全国高校砍掉了5000多个专业,很多人慌了。其实你仔细看名单就会发现,砍掉的大多是那些培养了十几年都没人招、或者产业早就不需要的。这对年轻人来说恰恰是好事。",
    },
    {
        "title": "长文案 · 200 字",
        "text": "普通人也能靠 AI 在 30 天内狂赚 270 万美元。这不是什么科幻剧情,而是一个叫 Saneris 的外国博主真实干出来的事情。更关键的是他用的方法,90% 的人都能够照搬。他没有用什么神秘代码,也没有什么内部资源,就是把公开的 AI 工具组合起来,然后快速迭代产品、快速上线、快速卖。",
    },
    {
        "title": "含数字和英文",
        "text": "M1 Pro 16G 内存跑 DeepSeek 云端,加上 CosyVoice 2 本地声音克隆,一条视频成本只要 0.1 元。",
    },
    {
        "title": "含问句和感叹句",
        "text": "你知道吗?很多所谓的 AI 工具,其实只是包装了一层 API。真正值钱的,是你会不会问对问题!",
    },
]


def run_case(case: dict, client: ShiliuClient) -> dict:
    t0 = time.time()
    result = {
        "title": case["title"],
        "text_len": len(case["text"]),
        "ok": False,
        "video_id": None,
        "path": None,
        "elapsed_sec": None,
        "file_size_mb": None,
        "error": None,
    }
    wid = insert_work(
        final_text=case["text"],
        title=f"[stress] {case['title']}",
        status="generating",
    )
    try:
        video_id, path = client.generate_and_download(
            case["text"],
            title=case["title"],
        )
        size_mb = path.stat().st_size / 1024 / 1024
        update_work(wid, status="ready", shiliu_video_id=video_id, local_path=str(path))
        result.update(
            ok=True,
            video_id=video_id,
            path=str(path),
            elapsed_sec=round(time.time() - t0, 1),
            file_size_mb=round(size_mb, 2),
        )
    except Exception as e:
        update_work(wid, status="failed", error=str(e))
        result["error"] = f"{type(e).__name__}: {e}"
        result["elapsed_sec"] = round(time.time() - t0, 1)
    return result


def main():
    init_db()
    client = ShiliuClient()

    credits_before = client.get_credits()
    print(f"开始压测 · 余额 {credits_before.points} 点")
    print("=" * 70)

    results = []
    for i, case in enumerate(CASES, 1):
        print(f"\n[{i}/{len(CASES)}] {case['title']}  (文本 {len(case['text'])} 字)")
        r = run_case(case, client)
        results.append(r)
        if r["ok"]:
            print(f"  ✅ {r['elapsed_sec']}s  video_id={r['video_id']}  size={r['file_size_mb']}MB")
        else:
            print(f"  ❌ {r['error']}")

    credits_after = client.get_credits()
    ok_count = sum(1 for r in results if r["ok"])
    total_time = sum(r["elapsed_sec"] or 0 for r in results)

    print("\n" + "=" * 70)
    print(f"结果:{ok_count}/{len(results)} 通过  ·  总耗时 {total_time:.0f}s  ·  消耗 {credits_before.points - credits_after.points} 点")

    # 写入 markdown 报告
    lines = [
        "# Stress Test Report",
        f"- 时间:{time.strftime('%Y-%m-%d %H:%M')}",
        f"- 结果:**{ok_count}/{len(results)} 通过**",
        f"- 总耗时:{total_time:.0f}s",
        f"- 石榴点数消耗:{credits_before.points - credits_after.points}",
        f"- 剩余点数:{credits_after.points}",
        "",
        "| # | Case | 文本字数 | 状态 | 耗时 | 大小 | 错误 |",
        "|---|------|---------|------|------|------|------|",
    ]
    for i, r in enumerate(results, 1):
        status = "✅" if r["ok"] else "❌"
        size = f"{r['file_size_mb']}MB" if r["ok"] else "-"
        err = (r["error"] or "")[:60]
        lines.append(
            f"| {i} | {r['title']} | {r['text_len']} | {status} | {r['elapsed_sec']}s | {size} | {err} |"
        )
    REPORT.write_text("\n".join(lines))
    print(f"\n📄 报告已保存:{REPORT}")

    sys.exit(0 if ok_count == len(results) else 1)


if __name__ == "__main__":
    main()
