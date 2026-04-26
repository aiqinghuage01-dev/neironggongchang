"""D-065: 历史已生成的图/视频回灌进 works 表.

扫 6 个图片目录 + data/videos, 把没在 works 表里的文件按 mtime + 文件名规则倒灌.
幂等: 已有同 local_path 的行跳过.

用法:
    python scripts/migrate_assets.py
    python scripts/migrate_assets.py --dry-run   # 只打印不插
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

# 让脚本能直接 python scripts/xxx.py 跑
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from shortvideo.config import ROOT  # noqa: E402
from shortvideo.works import init_db, list_works, insert_work  # noqa: E402


# 目录 → (source_skill, type)
DIR_MAP: dict[str, tuple[str, str]] = {
    "data/image-gen":          ("image-gen", "image"),
    "data/covers":             ("wechat-cover", "image"),
    "data/wechat-cover":       ("wechat-cover", "image"),
    "data/wechat-cover-batch": ("wechat-cover-batch", "image"),
    "data/wechat-images":      ("wechat-section-image", "image"),
    "data/dreamina":           ("dreamina", "image"),
    "data/videos":             ("shortvideo", "video"),
}

IMG_EXT = {".png", ".jpg", ".jpeg", ".webp", ".gif"}
VID_EXT = {".mp4", ".mov", ".webm"}


def clean_title(stem: str) -> str:
    """从文件名 stem 提取人类可读标题.

    gen_1777176432_1            → "gen 1"        (空标题)
    cover_07e31dd49df3          → "07e31dd49df3" (hash, 但保留)
    wxcover_1777080343_3        → "3"            (序号)
    shiliu_1863502855760587     → "shiliu 1863502855760587"
    1777079487_poju-091119-...  → "poju-091119-..."  (段间图带描述)
    """
    parts = stem.split("_", 2)
    # 形如 "1777079487_poju-091119-描述": 时间戳前缀剥掉
    if parts and parts[0].isdigit() and len(parts) > 1:
        return "_".join(parts[1:])
    # 形如 "gen_177xxx_N" / "cover_177xxx_N": 留 stem
    return stem


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="只打印不插入")
    args = ap.parse_args()

    init_db()
    existing_paths = {w.local_path for w in list_works(limit=10000) if w.local_path}
    inserted = 0
    skipped = 0
    by_skill: dict[str, int] = {}

    for rel_dir, (skill, type_) in DIR_MAP.items():
        d = ROOT / rel_dir
        if not d.exists():
            continue
        files = [f for f in d.iterdir() if f.is_file()]
        files.sort(key=lambda p: p.stat().st_mtime)
        for f in files:
            ext = f.suffix.lower()
            if type_ == "image" and ext not in IMG_EXT:
                continue
            if type_ == "video" and ext not in VID_EXT:
                continue
            abs_path = str(f.resolve())
            if abs_path in existing_paths:
                skipped += 1
                continue
            stat = f.stat()
            title = clean_title(f.stem)
            metadata = {
                "size_bytes": stat.st_size,
                "filename": f.name,
                "ext": ext,
                "imported_by": "D-065 migrate_assets",
                "imported_at": int(time.time()),
            }
            if args.dry_run:
                print(f"  [DRY] {skill} · {f.name} · {stat.st_size // 1024}KB · {title}")
            else:
                wid = insert_work(
                    type=type_,
                    source_skill=skill,
                    title=title,
                    local_path=abs_path,
                    thumb_path=abs_path if type_ == "image" else None,
                    status="ready",
                    created_at=int(stat.st_mtime),
                    metadata=json.dumps(metadata, ensure_ascii=False),
                )
                print(f"  + [{skill}] {f.name} → wid={wid}")
            inserted += 1
            by_skill[skill] = by_skill.get(skill, 0) + 1

    mode = "(dry-run, 未实际插)" if args.dry_run else ""
    print(f"\n回灌完成{mode}: 新增 {inserted} 条, 跳过 {skipped} 条 (已存在).")
    print("按 source_skill 分布:")
    for k, v in sorted(by_skill.items(), key=lambda x: -x[1]):
        print(f"  {k}: {v}")


if __name__ == "__main__":
    main()
