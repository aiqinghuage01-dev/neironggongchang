#!/usr/bin/env python3
"""Scan agent handoff reports across the main repo and worktrees."""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import time
from dataclasses import asdict, dataclass
from pathlib import Path


TASK_RE = re.compile(r"\bT-\d{3,}\b")
TEMPLATE_NAMES = {
    "README.md",
    "TEMPLATE_DEV_REPORT.md",
    "TEMPLATE_QA_REPORT.md",
    "TEMPLATE_REVIEW_REPORT.md",
    "TEMPLATE_TASK.md",
}


@dataclass
class Report:
    mtime: float
    worktree: str
    task_ids: list[str]
    kind: str
    result: str
    path: str
    rel_path: str
    summary: str


def repo_root() -> Path:
    out = subprocess.check_output(["git", "rev-parse", "--show-toplevel"], text=True)
    return Path(out.strip())


def worktree_dirs(root: Path) -> list[Path]:
    dirs = [root]
    wt_root = Path.home() / "Desktop" / "nrg-worktrees"
    if wt_root.is_dir():
        for child in sorted(wt_root.iterdir()):
            if child.is_dir() and (child / "docs" / "agent-handoff").is_dir():
                dirs.append(child)
    return dirs


def read_text(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        return path.read_text(errors="replace")


def section_after(text: str, heading: str) -> str:
    pattern = re.compile(rf"^##\s+{re.escape(heading)}\s*$", re.MULTILINE)
    match = pattern.search(text)
    if not match:
        return ""
    rest = text[match.end() :]
    next_heading = re.search(r"^##\s+", rest, flags=re.MULTILINE)
    body = rest[: next_heading.start()] if next_heading else rest
    lines = [line.strip() for line in body.splitlines() if line.strip()]
    return " / ".join(lines[:4])


def detect_kind(name: str, text: str) -> str:
    upper = name.upper()
    if "QA" in upper or "# QA Report" in text:
        return "QA"
    if "REVIEW" in upper or "# Review Report" in text:
        return "Review"
    if "DEV" in upper or "# Dev Report" in text:
        return "Dev"
    if "CONTROLLER" in upper or "SUMMARY" in upper:
        return "Controller"
    return "Report"


def detect_result(text: str, kind: str) -> str:
    result = section_after(text, "结果")
    if result:
        return result
    if kind == "Review":
        risks = []
        for heading in ("P0 风险", "P1 风险", "P2 风险"):
            body = section_after(text, heading)
            if body:
                risks.append(f"{heading}: {body}")
        return " / ".join(risks) if risks else "未写明"
    return "未写明"


def detect_summary(text: str, kind: str) -> str:
    for heading in ("下一步建议", "是否需要老板确认", "发现的问题", "改动摘要", "建议交给谁修", "风险说明", "复现步骤"):
        body = section_after(text, heading)
        if body:
            return body
    first_lines = [line.strip() for line in text.splitlines() if line.strip()]
    return " / ".join(first_lines[:3])


def scan_reports(root: Path, hours: float | None, task: str | None) -> list[Report]:
    cutoff = None if hours is None else time.time() - hours * 3600
    reports: list[Report] = []

    for wt in worktree_dirs(root):
        handoff_dir = wt / "docs" / "agent-handoff"
        if not handoff_dir.is_dir():
            continue
        for path in handoff_dir.glob("*.md"):
            if path.name in TEMPLATE_NAMES:
                continue
            stat = path.stat()
            if cutoff is not None and stat.st_mtime < cutoff:
                continue
            text = read_text(path)
            task_ids = sorted(set(TASK_RE.findall(path.name + "\n" + text)))
            if task and task not in task_ids:
                continue
            kind = detect_kind(path.name, text)
            try:
                rel_path = str(path.relative_to(wt))
            except ValueError:
                rel_path = str(path)
            reports.append(
                Report(
                    mtime=stat.st_mtime,
                    worktree=wt.name,
                    task_ids=task_ids,
                    kind=kind,
                    result=detect_result(text, kind),
                    path=str(path),
                    rel_path=rel_path,
                    summary=detect_summary(text, kind),
                )
            )

    return sorted(reports, key=lambda item: item.mtime, reverse=True)


def format_time(ts: float) -> str:
    return time.strftime("%Y-%m-%d %H:%M", time.localtime(ts))


def print_human(reports: list[Report]) -> None:
    if not reports:
        print("No handoff reports found.")
        return

    print(f"Agent inbox: {len(reports)} report(s)")
    print()
    for report in reports:
        task = ", ".join(report.task_ids) if report.task_ids else "-"
        print(f"- [{format_time(report.mtime)}] {report.kind} · {task} · {report.worktree}")
        print(f"  path: {report.path}")
        print(f"  result: {report.result}")
        if report.summary and report.summary != report.result:
            print(f"  summary: {report.summary}")
        print()


def notify(title: str, message: str) -> None:
    script = (
        'display notification '
        + json.dumps(message)
        + ' with title '
        + json.dumps(title)
    )
    subprocess.run(["osascript", "-e", script], check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def print_report_event(report: Report, *, notify_user: bool) -> None:
    task = ", ".join(report.task_ids) if report.task_ids else "-"
    line = f"[{format_time(report.mtime)}] {report.kind} · {task} · {report.worktree}"
    print()
    print("New/updated agent report")
    print(f"- {line}")
    print(f"- path: {report.path}")
    print(f"- result: {report.result}")
    if report.summary and report.summary != report.result:
        print(f"- summary: {report.summary}")
    sys.stdout.flush()

    if notify_user:
        notify("内容工厂 Agent 完成新报告", f"{report.kind} · {task} · {report.worktree}")


def watch_reports(root: Path, hours: float | None, task: str | None, interval: float, notify_user: bool) -> None:
    reports = scan_reports(root, hours=hours, task=task)
    seen = {report.path: report.mtime for report in reports}

    print_human(reports[:10])
    print(f"Watching agent inbox every {interval:g}s. Press Ctrl-C to stop.")
    sys.stdout.flush()

    while True:
        time.sleep(interval)
        latest = scan_reports(root, hours=hours, task=task)
        for report in reversed(latest):
            old_mtime = seen.get(report.path)
            if old_mtime is None or report.mtime > old_mtime:
                print_report_event(report, notify_user=notify_user)
            seen[report.path] = report.mtime


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--hours", type=float, default=24, help="only show reports changed in the last N hours")
    parser.add_argument("--all", action="store_true", help="show all reports")
    parser.add_argument("--task", help="filter by task id, for example T-012")
    parser.add_argument("--json", action="store_true", help="print JSON")
    parser.add_argument("--watch", action="store_true", help="keep watching for new or updated reports")
    parser.add_argument("--interval", type=float, default=15, help="watch interval in seconds")
    parser.add_argument("--notify", action="store_true", help="show a macOS notification when a report changes")
    args = parser.parse_args(argv)

    root = repo_root()
    hours = None if args.all else args.hours
    if args.watch:
        watch_reports(root, hours=hours, task=args.task, interval=args.interval, notify_user=args.notify)
        return 0

    reports = scan_reports(root, hours=hours, task=args.task)
    if args.json:
        print(json.dumps([asdict(item) for item in reports], ensure_ascii=False, indent=2))
    else:
        print_human(reports)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
