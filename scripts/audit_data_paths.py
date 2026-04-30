#!/usr/bin/env python3
"""
M0 Phase 1 · 数据路径审计(只读)

v1.0 §2.2 规约:扫 data/works.db,把 works.local_path / thumb_path 和
富文本字段(original_text/final_text)里嵌入的 /Users/... 路径分 7 类。
material_assets.user_id = 'qinghua' / NULL / 非数字也单独统计。

不写库,不动数据。只输出两份报告:
  - data/_audit/audit_data_paths.report.md   (给人看)
  - data/_audit/audit_data_paths.report.json (给 Phase 3 migrate 脚本消费)

7 类分类(works.local_path / thumb_path):
  1. relative                       已是相对路径或 /media/x — 无需动作
  2. absolute_inside_data           绝对路径在 DATA_DIR 下 — 自动转相对
  3. absolute_outside_exists        绝对路径在 DATA_DIR 外但文件存在 — 人工
  4. absolute_outside_missing       绝对路径在 DATA_DIR 外且文件不存在 — 自动 archived
  5. old_project_shortvideo         指向 shortvideo-studio 老项目 — 人工
  6. old_project_quanliuchengkelong 指向 quanliuchengkelong 老项目 — 人工
  7. embedded_in_text               original/final_text 里嵌的 /Users/... — 人工

用法:
  python scripts/audit_data_paths.py
"""
from __future__ import annotations

import json
import sqlite3
import sys
from datetime import datetime
from pathlib import Path
from typing import Any

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = PROJECT_ROOT / "data"
DB_PATH = DATA_DIR / "works.db"
OUT_DIR = DATA_DIR / "_audit"


def classify_path(value: str | None) -> tuple[str, dict[str, Any]]:
    """把一个 path 字符串归到 7 类之一。返回 (类别名, 附加信息 dict)。"""
    if value is None or not value.strip():
        return "relative", {"reason": "null_or_empty"}

    s = value.strip()

    # 相对路径 / /media/ 前缀 → 已正确
    if not s.startswith("/"):
        return "relative", {"path": s}
    if s.startswith("/media/"):
        return "relative", {"path": s}

    # 绝对路径 — 看是哪种
    p = Path(s)
    data_dir_resolved = DATA_DIR.resolve()

    if "shortvideo-studio" in s:
        return "old_project_shortvideo", {
            "old_path": s,
            "exists": p.exists(),
        }
    if "quanliuchengkelong" in s:
        return "old_project_quanliuchengkelong", {
            "old_path": s,
            "exists": p.exists(),
        }

    try:
        rel = p.resolve().relative_to(data_dir_resolved)
        return "absolute_inside_data", {
            "old_path": s,
            "new_relative": str(rel),
            "exists": p.exists(),
        }
    except ValueError:
        # 在 DATA_DIR 外
        if p.exists():
            return "absolute_outside_exists", {"old_path": s}
        else:
            return "absolute_outside_missing", {"old_path": s}


def audit_works(conn: sqlite3.Connection) -> dict[str, Any]:
    """扫 works 表的 local_path / thumb_path / 富文本嵌入。"""
    categories: dict[str, list[dict[str, Any]]] = {
        "relative": [],
        "absolute_inside_data": [],
        "absolute_outside_exists": [],
        "absolute_outside_missing": [],
        "old_project_shortvideo": [],
        "old_project_quanliuchengkelong": [],
        "embedded_in_text": [],
    }

    rows = conn.execute(
        "SELECT id, type, source_skill, local_path, thumb_path, "
        "       original_text, final_text "
        "FROM works"
    ).fetchall()

    for row in rows:
        wid, wtype, skill, local_path, thumb_path, orig_text, final_text = row

        # 1. local_path
        cat, info = classify_path(local_path)
        if cat != "relative" or local_path:
            categories[cat].append({
                "id": wid, "type": wtype, "skill": skill,
                "field": "local_path",
                **info,
            })

        # 2. thumb_path
        cat, info = classify_path(thumb_path)
        if cat != "relative" or thumb_path:
            categories[cat].append({
                "id": wid, "type": wtype, "skill": skill,
                "field": "thumb_path",
                **info,
            })

        # 3. 富文本字段嵌入 /Users/...
        for field_name, text in [("original_text", orig_text), ("final_text", final_text)]:
            if text and "/Users/" in text:
                # 抓出第一处嵌入路径作为样本
                sample_idx = text.find("/Users/")
                sample = text[sample_idx:sample_idx + 120].replace("\n", " ")
                categories["embedded_in_text"].append({
                    "id": wid, "type": wtype, "skill": skill,
                    "field": field_name,
                    "sample": sample,
                })

    return categories


def audit_material_assets(conn: sqlite3.Connection) -> dict[str, Any]:
    """扫 material_assets.user_id 分布,看 v1.0 §4.2 双覆盖回填会处理多少行。"""
    distribution = dict(conn.execute(
        "SELECT user_id, COUNT(*) FROM material_assets GROUP BY user_id"
    ).fetchall())

    will_migrate = conn.execute(
        "SELECT COUNT(*) FROM material_assets "
        "WHERE user_id IS NULL OR user_id = 'qinghua' "
        "   OR (user_id IS NOT NULL AND user_id NOT GLOB '[0-9]*')"
    ).fetchone()[0]

    return {
        "distribution": distribution,
        "will_migrate_to_admin": will_migrate,
    }


def audit_materials(conn: sqlite3.Connection) -> dict[str, Any]:
    """扫旧 materials 表(数据少)。"""
    total = conn.execute("SELECT COUNT(*) FROM materials").fetchone()[0]

    # 看 url 字段有没有污染
    url_polluted = conn.execute(
        "SELECT COUNT(*) FROM materials WHERE url LIKE '%127.0.0.1%' OR url LIKE '/Users/%'"
    ).fetchone()[0]

    return {
        "total_rows": total,
        "url_polluted_rows": url_polluted,
    }


def render_markdown(report: dict[str, Any]) -> str:
    """生成给人看的 Markdown 报告。"""
    lines = [
        "# audit_data_paths 报告",
        f"",
        f"- 扫描时间: {report['scanned_at']}",
        f"- DATA_DIR: `{report['data_dir']}`",
        f"- DB: `{report['db_path']}`",
        f"- 总作品数: {report['totals']['works']}",
        f"",
        "## works 表路径分类(7 类)",
        "",
        "| 类别 | 数量 | 处置 |",
        "|---|---|---|",
    ]
    cat_actions = {
        "relative": "✅ 无需动作",
        "absolute_inside_data": "🟢 Phase 3 自动转相对",
        "absolute_outside_exists": "🟡 人工:搬入或标记",
        "absolute_outside_missing": "🟡 Phase 3 自动 status='archived'",
        "old_project_shortvideo": "🔴 人工:看文件还在不在",
        "old_project_quanliuchengkelong": "🔴 人工:看文件还在不在",
        "embedded_in_text": "🔴 人工 + 文档级替换",
    }
    cats = report["categories"]
    for cat in [
        "relative", "absolute_inside_data",
        "absolute_outside_exists", "absolute_outside_missing",
        "old_project_shortvideo", "old_project_quanliuchengkelong",
        "embedded_in_text",
    ]:
        n = len(cats.get(cat, []))
        lines.append(f"| `{cat}` | {n} | {cat_actions[cat]} |")

    lines.append("")
    lines.append("## material_assets.user_id 分布")
    lines.append("")
    ma = report["material_assets"]
    lines.append(f"- 总待回填到 admin (id=1): **{ma['will_migrate_to_admin']}** 行")
    lines.append("")
    lines.append("| user_id | 数量 |")
    lines.append("|---|---|")
    for uid, n in ma["distribution"].items():
        lines.append(f"| `{uid!r}` | {n} |")

    lines.append("")
    lines.append("## materials 旧表")
    m = report["materials"]
    lines.append(f"- 总行数: {m['total_rows']}")
    lines.append(f"- url 字段污染: {m['url_polluted_rows']}")

    # 详细样本(每类最多 5 条)
    lines.append("")
    lines.append("## 样本明细(每类最多 5 条)")
    for cat in [
        "absolute_outside_exists", "absolute_outside_missing",
        "old_project_shortvideo", "old_project_quanliuchengkelong",
        "embedded_in_text",
    ]:
        items = cats.get(cat, [])
        if not items:
            continue
        lines.append(f"")
        lines.append(f"### {cat}({len(items)} 条)")
        lines.append("")
        for item in items[:5]:
            lines.append(f"- id={item['id']} type={item['type']} field={item.get('field', '-')}")
            for k, v in item.items():
                if k in ("id", "type", "skill", "field"):
                    continue
                lines.append(f"  - {k}: `{v}`")

    lines.append("")
    lines.append("---")
    lines.append("")
    lines.append("## 验收(v1.0 §0.6.2 / §2.7)")
    lines.append("")
    lines.append("- [ ] 所有 work 都被分到 7 类之一(无 unclassified)")
    lines.append("- [ ] absolute_outside_exists / shortvideo / quanliuchengkelong / embedded_in_text 各类样本人工过一遍,确认 Phase 3 处置策略")
    lines.append("- [ ] material_assets will_migrate_to_admin 数字与 v1.0 文档实测(1633)对得上")
    return "\n".join(lines)


def main() -> int:
    if not DB_PATH.exists():
        print(f"❌ DB 不存在: {DB_PATH}", file=sys.stderr)
        return 1

    OUT_DIR.mkdir(parents=True, exist_ok=True)

    conn = sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True)
    try:
        works_total = conn.execute("SELECT COUNT(*) FROM works").fetchone()[0]
        categories = audit_works(conn)
        ma_stats = audit_material_assets(conn)
        m_stats = audit_materials(conn)
    finally:
        conn.close()

    report = {
        "scanned_at": datetime.now().isoformat(timespec="seconds"),
        "data_dir": str(DATA_DIR),
        "db_path": str(DB_PATH),
        "totals": {"works": works_total},
        "categories": categories,
        "material_assets": ma_stats,
        "materials": m_stats,
    }

    json_path = OUT_DIR / "audit_data_paths.report.json"
    json_path.write_text(
        json.dumps(report, ensure_ascii=False, indent=2, default=str),
        encoding="utf-8",
    )

    md_path = OUT_DIR / "audit_data_paths.report.md"
    md_path.write_text(render_markdown(report), encoding="utf-8")

    # 控制台摘要
    print(f"✅ audit 完成")
    print(f"   总作品数: {works_total}")
    print(f"   分类汇总:")
    for cat, items in categories.items():
        print(f"     {cat:35s} : {len(items)}")
    print(f"   material_assets 待回填到 admin: {ma_stats['will_migrate_to_admin']}")
    print(f"   报告:")
    print(f"     {md_path}")
    print(f"     {json_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
