#!/usr/bin/env python3
"""Shared task queue for local multi-agent worktrees."""

from __future__ import annotations

import argparse
import fcntl
import json
import os
import subprocess
import sys
import time
import uuid
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Any


DEFAULT_QUEUE_DIR = Path.home() / "Desktop" / "nrg-agent-queue"
VALID_STATUSES = {"queued", "claimed", "done", "blocked", "cancelled"}
VALID_ROLES = {"controller", "content", "media", "qa", "review", "any"}


def now() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%S%z", time.localtime())


def queue_dir() -> Path:
    return Path(os.environ.get("NRG_AGENT_QUEUE_DIR", str(DEFAULT_QUEUE_DIR))).expanduser()


def notify(title: str, message: str) -> None:
    script = (
        "display notification "
        + json.dumps(message, ensure_ascii=False)
        + " with title "
        + json.dumps(title, ensure_ascii=False)
    )
    subprocess.run(["osascript", "-e", script], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)


@contextmanager
def locked_queue() -> Any:
    root = queue_dir()
    root.mkdir(parents=True, exist_ok=True)
    queue_path = root / "tasks.json"
    lock_path = root / ".lock"
    if not queue_path.exists():
        queue_path.write_text("[]\n", encoding="utf-8")

    with lock_path.open("w", encoding="utf-8") as lock_file:
        fcntl.flock(lock_file, fcntl.LOCK_EX)
        try:
            try:
                tasks = json.loads(queue_path.read_text(encoding="utf-8") or "[]")
            except json.JSONDecodeError:
                broken = root / f"tasks.broken.{int(time.time())}.json"
                queue_path.rename(broken)
                tasks = []
            yield tasks
            tmp_path = queue_path.with_suffix(".json.tmp")
            tmp_path.write_text(json.dumps(tasks, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            tmp_path.replace(queue_path)
        finally:
            fcntl.flock(lock_file, fcntl.LOCK_UN)


def append_event(event: dict[str, Any]) -> None:
    root = queue_dir()
    root.mkdir(parents=True, exist_ok=True)
    event = {"time": now(), **event}
    with (root / "events.jsonl").open("a", encoding="utf-8") as file:
        file.write(json.dumps(event, ensure_ascii=False) + "\n")


def task_key(task: dict[str, Any]) -> tuple[int, str]:
    return (int(task.get("priority", 50)), task.get("created_at", ""))


def parse_depends(value: str | None) -> list[str]:
    if not value:
        return []
    return [item.strip() for item in value.split(",") if item.strip()]


def find_task(tasks: list[dict[str, Any]], task_id: str) -> dict[str, Any] | None:
    for task in tasks:
        if task.get("id") == task_id:
            return task
    return None


def deps_done(task: dict[str, Any], tasks: list[dict[str, Any]]) -> bool:
    for dep in task.get("depends_on", []):
        dep_task = find_task(tasks, dep)
        if not dep_task or dep_task.get("status") != "done":
            return False
    return True


def role_matches(task_role: str, role: str) -> bool:
    return task_role in {role, "any"}


def task_prompt(task: dict[str, Any]) -> str:
    depends = ", ".join(task.get("depends_on", [])) or "无"
    script_path = Path(__file__).resolve()
    return f"""你已从共享任务队列领取任务。

任务 ID: {task.get("id")}
角色: {task.get("role")}
标题: {task.get("title")}
依赖: {depends}

任务说明:
{task.get("instructions", "").strip()}

验收/证据要求:
{task.get("acceptance", "").strip() or "按角色文档和 AGENTS.md 完成验证。"}

完成规则:
- 自己完成实现/测试/审查, 不让老板传话.
- 报告写到 docs/agent-handoff/.
- commit 自己的改动和报告.
- 成功后运行: python3 {script_path} done {task.get("id")} --agent "$USER_OR_AGENT" --report <报告路径> --commit <commit>
- 如果需要老板做业务选择, 运行: python3 {script_path} block {task.get("id")} --agent "$USER_OR_AGENT" --reason "<需要老板确认什么>" --owner-decision
- 完成或阻塞后继续 claim 下一条适合自己角色的任务.
"""


def print_task(task: dict[str, Any], fmt: str) -> None:
    if fmt == "json":
        print(json.dumps(task, ensure_ascii=False, indent=2))
    elif fmt == "prompt":
        print(task_prompt(task))
    else:
        deps = ",".join(task.get("depends_on", [])) or "-"
        print(f"{task.get('id')} [{task.get('status')}] role={task.get('role')} priority={task.get('priority')} deps={deps}")
        print(f"  title: {task.get('title')}")
        if task.get("claimed_by"):
            print(f"  claimed_by: {task.get('claimed_by')}")
        if task.get("summary"):
            print(f"  summary: {task.get('summary')}")
        if task.get("owner_decision"):
            print(f"  owner_decision: {task.get('owner_decision')}")


def cmd_init(_: argparse.Namespace) -> int:
    with locked_queue() as tasks:
        count = len(tasks)
    print(f"Queue ready: {queue_dir()} ({count} task(s))")
    return 0


def cmd_add(args: argparse.Namespace) -> int:
    if args.role not in VALID_ROLES:
        raise SystemExit(f"role must be one of: {', '.join(sorted(VALID_ROLES))}")

    with locked_queue() as tasks:
        task_id = args.id or f"Q-{uuid.uuid4().hex[:8]}"
        existing = find_task(tasks, task_id)
        if existing and not args.replace:
            raise SystemExit(f"Task already exists: {task_id}. Use --replace to overwrite.")
        task = {
            "id": task_id,
            "role": args.role,
            "title": args.title,
            "instructions": args.instructions,
            "acceptance": args.acceptance or "",
            "priority": args.priority,
            "status": args.status,
            "depends_on": parse_depends(args.depends_on),
            "created_at": now(),
            "updated_at": now(),
            "claimed_by": "",
            "claimed_at": "",
            "report": "",
            "commit": "",
            "summary": "",
            "owner_decision": "",
        }
        if existing:
            tasks[tasks.index(existing)] = task
        else:
            tasks.append(task)

    append_event({"event": "added", "task_id": task_id, "role": args.role, "title": args.title})
    notify("内容工厂任务入队", f"{task_id} · {args.role} · {args.title}")
    print(f"Added task: {task_id}")
    return 0


def cmd_list(args: argparse.Namespace) -> int:
    with locked_queue() as tasks:
        items = list(tasks)
    if args.role:
        items = [task for task in items if role_matches(str(task.get("role")), args.role)]
    if args.status:
        statuses = set(args.status.split(","))
        items = [task for task in items if task.get("status") in statuses]
    items = sorted(items, key=task_key)
    if args.format == "json":
        print(json.dumps(items, ensure_ascii=False, indent=2))
    else:
        if not items:
            print("No tasks.")
        for task in items:
            print_task(task, args.format)
    return 0


def cmd_claim(args: argparse.Namespace) -> int:
    if args.role not in VALID_ROLES:
        raise SystemExit(f"role must be one of: {', '.join(sorted(VALID_ROLES))}")

    claimed: dict[str, Any] | None = None
    with locked_queue() as tasks:
        candidates = [
            task
            for task in tasks
            if task.get("status") == "queued"
            and role_matches(str(task.get("role")), args.role)
            and deps_done(task, tasks)
        ]
        candidates.sort(key=task_key)
        if candidates:
            claimed = candidates[0]
            claimed["status"] = "claimed"
            claimed["claimed_by"] = args.agent
            claimed["claimed_at"] = now()
            claimed["updated_at"] = now()

    if not claimed:
        if args.format == "json":
            print("{}")
        else:
            print(f"No queued task for role={args.role}.")
        return 1

    append_event({"event": "claimed", "task_id": claimed["id"], "role": args.role, "agent": args.agent})
    notify("内容工厂任务已领取", f"{claimed['id']} · {args.agent}")
    print_task(claimed, args.format)
    return 0


def update_terminal_task(args: argparse.Namespace, status: str) -> int:
    if status not in VALID_STATUSES:
        raise SystemExit(f"invalid status: {status}")

    with locked_queue() as tasks:
        task = find_task(tasks, args.id)
        if not task:
            raise SystemExit(f"Task not found: {args.id}")
        task["status"] = status
        task["updated_at"] = now()
        if args.agent:
            task["claimed_by"] = args.agent
        if getattr(args, "report", None):
            task["report"] = args.report
        if getattr(args, "commit", None):
            task["commit"] = args.commit
        if getattr(args, "summary", None):
            task["summary"] = args.summary
        if getattr(args, "reason", None):
            task["summary"] = args.reason
        if getattr(args, "owner_decision", False):
            task["owner_decision"] = args.reason or "需要老板确认"

    event = {"event": status, "task_id": args.id, "agent": args.agent or ""}
    append_event(event)
    title = "内容工厂任务完成" if status == "done" else "内容工厂任务阻塞"
    notify(title, f"{args.id} · {args.agent or ''}")
    print(f"{args.id} -> {status}")
    return 0


def cmd_reset(args: argparse.Namespace) -> int:
    with locked_queue() as tasks:
        task = find_task(tasks, args.id)
        if not task:
            raise SystemExit(f"Task not found: {args.id}")
        task["status"] = "queued"
        task["claimed_by"] = ""
        task["claimed_at"] = ""
        task["updated_at"] = now()
        task["owner_decision"] = ""
    append_event({"event": "reset", "task_id": args.id})
    print(f"{args.id} -> queued")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)

    init = sub.add_parser("init")
    init.set_defaults(func=cmd_init)

    add = sub.add_parser("add")
    add.add_argument("--id")
    add.add_argument("--role", required=True)
    add.add_argument("--title", required=True)
    add.add_argument("--instructions", required=True)
    add.add_argument("--acceptance", default="")
    add.add_argument("--priority", type=int, default=50)
    add.add_argument("--depends-on", default="")
    add.add_argument("--status", choices=sorted(VALID_STATUSES), default="queued")
    add.add_argument("--replace", action="store_true")
    add.set_defaults(func=cmd_add)

    list_cmd = sub.add_parser("list")
    list_cmd.add_argument("--role")
    list_cmd.add_argument("--status")
    list_cmd.add_argument("--format", choices=("human", "json", "prompt"), default="human")
    list_cmd.set_defaults(func=cmd_list)

    claim = sub.add_parser("claim")
    claim.add_argument("--role", required=True)
    claim.add_argument("--agent", required=True)
    claim.add_argument("--format", choices=("human", "json", "prompt"), default="prompt")
    claim.set_defaults(func=cmd_claim)

    done = sub.add_parser("done")
    done.add_argument("id")
    done.add_argument("--agent", default="")
    done.add_argument("--report", default="")
    done.add_argument("--commit", default="")
    done.add_argument("--summary", default="")
    done.set_defaults(func=lambda args: update_terminal_task(args, "done"))

    block = sub.add_parser("block")
    block.add_argument("id")
    block.add_argument("--agent", default="")
    block.add_argument("--reason", required=True)
    block.add_argument("--owner-decision", action="store_true")
    block.set_defaults(func=lambda args: update_terminal_task(args, "blocked"))

    reset = sub.add_parser("reset")
    reset.add_argument("id")
    reset.set_defaults(func=cmd_reset)

    return parser


def main(argv: list[str]) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
