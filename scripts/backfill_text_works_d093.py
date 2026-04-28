"""D-093 backfill: 把历史 ok 状态的文字 task 重建成 works text 记录.

历史: tasks.py:_autoinsert_text_work 调 insert_work(tokens_used=...) 但 insert_work
函数签名漏了 tokens_used 参数 → TypeError → except: pass 吞掉 → 13 条文字任务全没入
作品库.

D-093:
1. shortvideo/works.py:insert_work 加 tokens_used 参数 (修 schema)
2. backend/services/tasks.py:_KIND_TO_SKILL 补 compliance
3. backend/services/tasks.py:_autoinsert_text_work except 改 log warning (不再静默吞)
4. 本脚本 backfill 历史已完成的文字 task → works text 记录, 老板找回历史产出.

幂等: 用 task_id 当唯一标识 (写进 metadata.task_id), 已 backfill 过的不重复.

跑法:
    python3 scripts/backfill_text_works_d093.py [--dry-run]
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

# 让脚本能 import 项目模块
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.services.tasks import _KIND_TO_SKILL, _extract_text_from_result, _extract_tokens
from shortvideo import db
from shortvideo.works import insert_work, init_db


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="只列要补的, 不真插")
    args = parser.parse_args()

    init_db()
    # 1. 拉所有 ok 状态的文字 task
    text_kind_prefixes = [p for p, _ in _KIND_TO_SKILL]
    where_clauses = " OR ".join([f"kind LIKE ?" for _ in text_kind_prefixes])
    params = [p + "%" for p in text_kind_prefixes]

    with db.get_connection() as con:
        con.row_factory = __import__("sqlite3").Row
        rows = con.execute(
            f"SELECT id, kind, label, result, finished_ts FROM tasks "
            f"WHERE status='ok' AND ({where_clauses}) ORDER BY finished_ts ASC",
            params,
        ).fetchall()

    if not rows:
        print("没有要 backfill 的文字 task")
        return 0

    # 2. 拉已 backfill 过的 task_id (metadata.task_id 在 works.metadata)
    with db.get_connection() as con:
        con.row_factory = __import__("sqlite3").Row
        existing = con.execute(
            "SELECT metadata FROM works WHERE type='text' AND metadata IS NOT NULL"
        ).fetchall()
    seen_task_ids: set[str] = set()
    for r in existing:
        try:
            m = json.loads(r["metadata"] or "{}")
            tid = m.get("task_id")
            if tid:
                seen_task_ids.add(tid)
        except Exception:
            pass

    print(f"找到 {len(rows)} 条 ok 文字 task. 已 backfill 过 {len(seen_task_ids)} 条 text works.")

    inserted = 0
    skipped_seen = 0
    skipped_short = 0
    failed = 0

    for r in rows:
        task_id = r["id"]
        if task_id in seen_task_ids:
            skipped_seen += 1
            continue

        kind = r["kind"]
        label = r["label"]
        try:
            result = json.loads(r["result"] or "null")
        except Exception:
            result = None

        if result is None:
            skipped_short += 1
            continue

        text = _extract_text_from_result(result)
        if not text or len(text.strip()) < 10:
            skipped_short += 1
            continue

        # 找对应的 source_skill
        skill = None
        for prefix, name in _KIND_TO_SKILL:
            if kind.startswith(prefix):
                skill = name
                break
        if not skill:
            continue

        title = (label or "")[:60] or None
        finished_ts = r["finished_ts"]
        tokens = _extract_tokens(result)

        if args.dry_run:
            print(f"  [DRY] {kind:<25} {skill:<15} chars={len(text):<5} tokens={tokens:<5} title={(title or '-')[:40]}")
            inserted += 1
            continue

        try:
            wid = insert_work(
                type="text",
                source_skill=skill,
                title=title,
                final_text=text,
                tokens_used=tokens,
                status="ready",
                created_at=finished_ts,  # 用 task 完成时间作为作品创建时间, 时间排序对得上
                metadata=json.dumps({
                    "task_id": task_id, "kind": kind, "backfilled_by": "D-093",
                }, ensure_ascii=False),
            )
            print(f"  [OK]  wid={wid:<5} {kind:<25} {skill:<15} chars={len(text):<5} title={(title or '-')[:40]}")
            inserted += 1
        except Exception as e:
            print(f"  [FAIL] task={task_id} kind={kind}: {type(e).__name__}: {e}")
            failed += 1

    print()
    print(f"--- 总结 ---")
    print(f"  插入: {inserted}{'  (dry-run)' if args.dry_run else ''}")
    print(f"  跳过 (已 backfill): {skipped_seen}")
    print(f"  跳过 (文本过短或无 result): {skipped_short}")
    print(f"  失败: {failed}")
    return 0 if failed == 0 else 2


if __name__ == "__main__":
    sys.exit(main())
