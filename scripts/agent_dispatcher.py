#!/usr/bin/env python3
"""Background dispatcher for the local multi-agent task queue."""

from __future__ import annotations

import argparse
import fcntl
import json
import os
import re
import shutil
import subprocess
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import agent_queue


REPO_ROOT = Path(__file__).resolve().parents[1]
QUEUE_SCRIPT = Path(__file__).resolve().with_name("agent_queue.py")
WORKTREE_ROOT = Path.home() / "Desktop" / "nrg-worktrees"
QUEUE_ROOT = agent_queue.queue_dir()


@dataclass(frozen=True)
class AgentSlot:
    slot_id: str
    agent_name: str
    role: str
    tool: str
    workdir: Path
    role_doc: str


def env(name: str, default: str) -> str:
    value = os.environ.get(name)
    return value if value else default


CODEX_MODEL = env("CODEX_MODEL", "gpt-5.5")
CODEX_EFFORT = env("CODEX_REASONING_EFFORT", "xhigh")
CODEX_SANDBOX = env("CODEX_SANDBOX", "danger-full-access")
CLAUDE_MODEL = env("CLAUDE_MODEL", "opus")
CLAUDE_EFFORT = env("CLAUDE_EFFORT", "max")
TOOL_PATH = ":".join(
    [
        str(Path.home() / ".npm-global" / "bin"),
        str(Path.home() / ".local" / "bin"),
        "/opt/homebrew/bin",
        "/opt/homebrew/sbin",
        "/usr/local/bin",
        "/Library/Frameworks/Python.framework/Versions/Current/bin",
        "/usr/bin",
        "/bin",
        "/usr/sbin",
        "/sbin",
        os.environ.get("PATH", ""),
    ]
)

IGNORED_STATUS_PREFIXES = (
    "?? data/",
    "?? vendor/",
    "?? .DS_Store",
    "?? .pytest_cache/",
)


def find_bin(name: str, env_name: str, candidates: list[Path]) -> str | None:
    override = os.environ.get(env_name)
    if override:
        return override
    found = shutil.which(name, path=TOOL_PATH)
    if found:
        return found
    for candidate in candidates:
        if candidate.exists() and os.access(candidate, os.X_OK):
            return str(candidate)
    return None


CODEX_BIN = find_bin(
    "codex",
    "CODEX_BIN",
    [
        Path.home() / ".npm-global" / "bin" / "codex",
        Path.home() / ".local" / "bin" / "codex",
        Path("/opt/homebrew/bin/codex"),
        Path("/usr/local/bin/codex"),
    ],
)
CLAUDE_BIN = find_bin(
    "claude",
    "CLAUDE_BIN",
    [
        Path.home() / ".local" / "bin" / "claude",
        Path.home() / ".npm-global" / "bin" / "claude",
        Path("/opt/homebrew/bin/claude"),
        Path("/usr/local/bin/claude"),
    ],
)


DEFAULT_SLOTS = [
    AgentSlot(
        slot_id="content-dev",
        agent_name="NRG 内容开发自动",
        role="content",
        tool="codex",
        workdir=WORKTREE_ROOT / "content-dev",
        role_doc="docs/agents/ROLE_CONTENT_DEV.md",
    ),
    AgentSlot(
        slot_id="media-dev",
        agent_name="NRG 媒体开发自动",
        role="media",
        tool="codex",
        workdir=WORKTREE_ROOT / "media-dev",
        role_doc="docs/agents/ROLE_MEDIA_DEV.md",
    ),
    AgentSlot(
        slot_id="qa",
        agent_name="NRG QA 自动",
        role="qa",
        tool="codex",
        workdir=WORKTREE_ROOT / "qa",
        role_doc="docs/agents/ROLE_QA.md",
    ),
    AgentSlot(
        slot_id="qa-1",
        agent_name="NRG QA-1 自动",
        role="qa",
        tool="codex",
        workdir=WORKTREE_ROOT / "qa-1",
        role_doc="docs/agents/ROLE_QA.md",
    ),
    AgentSlot(
        slot_id="qa-2",
        agent_name="NRG QA-2 自动",
        role="qa",
        tool="codex",
        workdir=WORKTREE_ROOT / "qa-2",
        role_doc="docs/agents/ROLE_QA.md",
    ),
    AgentSlot(
        slot_id="review",
        agent_name="NRG Claude 审查自动",
        role="review",
        tool="claude",
        workdir=WORKTREE_ROOT / "review",
        role_doc="docs/agents/ROLE_REVIEWER.md",
    ),
]


def now_slug() -> str:
    return re.sub(r"[^0-9A-Za-z_-]+", "_", agent_queue.now())


def state_dir() -> Path:
    root = agent_queue.queue_dir() / "dispatcher"
    root.mkdir(parents=True, exist_ok=True)
    return root


def logs_dir() -> Path:
    root = agent_queue.queue_dir() / "logs"
    root.mkdir(parents=True, exist_ok=True)
    return root


def prompts_dir() -> Path:
    root = agent_queue.queue_dir() / "prompts"
    root.mkdir(parents=True, exist_ok=True)
    return root


def state_path(slot: AgentSlot) -> Path:
    return state_dir() / f"{slot.slot_id}.json"


def read_state(slot: AgentSlot) -> dict[str, Any] | None:
    path = state_path(slot)
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        broken = path.with_suffix(f".broken.{int(time.time())}.json")
        path.rename(broken)
        return None


def write_state(slot: AgentSlot, state: dict[str, Any]) -> None:
    path = state_path(slot)
    tmp = path.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(state, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    tmp.replace(path)


def clear_state(slot: AgentSlot) -> None:
    path = state_path(slot)
    if path.exists():
        path.unlink()


def pid_alive(pid: int) -> bool:
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    return True


def significant_git_status(workdir: Path) -> list[str]:
    result = subprocess.run(
        ["git", "-C", str(workdir), "status", "--porcelain"],
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    if result.returncode != 0:
        return [result.stderr.strip() or "git status failed"]
    lines = [line for line in result.stdout.splitlines() if line.strip()]
    return [line for line in lines if not line.startswith(IGNORED_STATUS_PREFIXES)]


def git_dirty(workdir: Path) -> bool:
    return bool(significant_git_status(workdir))


def read_task(task_id: str) -> dict[str, Any] | None:
    with agent_queue.locked_queue() as tasks:
        task = agent_queue.find_task(tasks, task_id)
        return dict(task) if task else None


def queued_candidate(slot: AgentSlot, excluded_ids: set[str] | None = None) -> dict[str, Any] | None:
    excluded_ids = excluded_ids or set()
    with agent_queue.locked_queue() as tasks:
        candidates = [
            task
            for task in tasks
            if task.get("status") == "queued"
            and str(task.get("id")) not in excluded_ids
            and agent_queue.role_matches(str(task.get("role")), slot.role)
            and agent_queue.deps_done(task, tasks)
        ]
        candidates.sort(key=agent_queue.task_key)
        return dict(candidates[0]) if candidates else None


def claim_task(slot: AgentSlot) -> dict[str, Any] | None:
    result = subprocess.run(
        [
            sys.executable,
            str(QUEUE_SCRIPT),
            "claim",
            "--role",
            slot.role,
            "--agent",
            slot.agent_name,
            "--format",
            "json",
        ],
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    if result.returncode != 0:
        return None
    try:
        task = json.loads(result.stdout or "{}")
    except json.JSONDecodeError:
        return None
    return task or None


def block_task(task_id: str, agent: str, reason: str) -> None:
    subprocess.run(
        [
            sys.executable,
            str(QUEUE_SCRIPT),
            "block",
            task_id,
            "--agent",
            agent,
            "--reason",
            reason,
        ],
        text=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        check=False,
    )


def build_prompt(slot: AgentSlot, task: dict[str, Any]) -> str:
    queue_prompt = agent_queue.task_prompt(task)
    branch = subprocess.run(
        ["git", "-C", str(slot.workdir), "branch", "--show-current"],
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        check=False,
    ).stdout.strip()
    main_head = subprocess.run(
        ["git", "-C", str(REPO_ROOT), "rev-parse", "--short", "HEAD"],
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        check=False,
    ).stdout.strip()
    contains_main = False
    if main_head:
        contains_main = subprocess.run(
            ["git", "-C", str(slot.workdir), "merge-base", "--is-ancestor", main_head, "HEAD"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=False,
        ).returncode == 0
    return f"""你是内容工厂后台自动派工器启动的 Agent。

你的身份: {slot.agent_name}
你的角色: {slot.role}
你的工作区: {slot.workdir}
当前分支: {branch or "未知"}
主工作区: {REPO_ROOT}
主线 HEAD: {main_head or "未知"}
本工作区包含主线 HEAD: {"是" if contains_main else "否"}

开工规则:
- 不要等老板复制粘贴上下文; 自己读项目文档、任务报告和代码。
- 先读 AGENTS.md 或 CLAUDE.md、docs/MULTI_AGENT_WORKFLOW.md、{slot.role_doc}。
- 严格按角色边界工作; 副 Agent 不改 docs/PROGRESS.md。
- 如果本工作区不包含主线 HEAD, QA/Review 必须以主工作区和正式端口为事实源; 不要对旧分支下结论。
- 领取依赖任务后, 先确认依赖 commit/report 在被测代码里存在; 不存在就先读主工作区对应文件或 block, 不要测旧代码。
- 需要真实验证时自己跑, 不要让老板当 QA。
- 默认允许最小真烧 credits; 失败后不要重复烧, 记录证据并停止。
- 只有必须老板做业务选择时, 才用 agent_queue.py block --owner-decision。
- 完成或阻塞前必须写 docs/agent-handoff/ 报告并更新共享任务队列。

队列任务:
{queue_prompt}

请立刻开始执行这个任务。完成命令里的 --agent 必须写: {slot.agent_name}
"""


def codex_command(slot: AgentSlot, output_path: Path) -> list[str]:
    if not CODEX_BIN:
        raise FileNotFoundError("codex")
    return [
        CODEX_BIN,
        "exec",
        "--cd",
        str(slot.workdir),
        "--model",
        CODEX_MODEL,
        "--sandbox",
        CODEX_SANDBOX,
        "-c",
        f'model_reasoning_effort="{CODEX_EFFORT}"',
        "-o",
        str(output_path),
        "-",
    ]


def claude_command(prompt: str) -> list[str]:
    if not CLAUDE_BIN:
        raise FileNotFoundError("claude")
    return [
        CLAUDE_BIN,
        "--print",
        "--model",
        CLAUDE_MODEL,
        "--effort",
        CLAUDE_EFFORT,
        "--permission-mode",
        "bypassPermissions",
        "--no-session-persistence",
        "--output-format",
        "text",
        prompt,
    ]


def start_worker(slot: AgentSlot, task: dict[str, Any]) -> subprocess.Popen[Any]:
    run_id = f"{task['id']}_{slot.slot_id}_{now_slug()}"
    log_path = logs_dir() / f"{run_id}.log"
    output_path = logs_dir() / f"{run_id}.last.md"
    prompt_path = prompts_dir() / f"{run_id}.md"
    prompt = build_prompt(slot, task)
    prompt_path.write_text(prompt, encoding="utf-8")
    proc_env = os.environ.copy()
    proc_env["PATH"] = TOOL_PATH

    log_file = log_path.open("a", encoding="utf-8")
    if slot.tool == "claude":
        command = claude_command(prompt)
        proc = subprocess.Popen(
            command,
            cwd=str(slot.workdir),
            stdin=subprocess.DEVNULL,
            stdout=log_file,
            stderr=subprocess.STDOUT,
            text=True,
            close_fds=True,
            env=proc_env,
        )
    else:
        prompt_file = prompt_path.open("r", encoding="utf-8")
        proc = subprocess.Popen(
            codex_command(slot, output_path),
            cwd=str(slot.workdir),
            stdin=prompt_file,
            stdout=log_file,
            stderr=subprocess.STDOUT,
            text=True,
            close_fds=True,
            env=proc_env,
        )
        prompt_file.close()
    log_file.close()

    write_state(
        slot,
        {
            "pid": proc.pid,
            "task_id": task["id"],
            "agent": slot.agent_name,
            "role": slot.role,
            "tool": slot.tool,
            "workdir": str(slot.workdir),
            "started_at": agent_queue.now(),
            "log": str(log_path),
            "last_message": str(output_path),
            "prompt": str(prompt_path),
        },
    )
    agent_queue.append_event(
        {
            "event": "dispatched",
            "task_id": task["id"],
            "agent": slot.agent_name,
            "slot": slot.slot_id,
            "pid": proc.pid,
            "log": str(log_path),
        }
    )
    agent_queue.notify("内容工厂自动派工", f"{task['id']} -> {slot.agent_name}")
    return proc


def finish_if_exited(slot: AgentSlot, proc: subprocess.Popen[Any] | None) -> bool:
    state = read_state(slot)
    if not state:
        return False

    if proc:
        code = proc.poll()
        if code is None:
            return True
    else:
        pid = int(state.get("pid", 0) or 0)
        if pid and pid_alive(pid):
            return True
        code = None

    task_id = str(state.get("task_id") or "")
    agent = str(state.get("agent") or slot.agent_name)
    task = read_task(task_id) if task_id else None
    if task and task.get("status") == "claimed" and task.get("claimed_by") == agent:
        log_path = state.get("log") or ""
        reason = f"自动派工 worker 已退出但任务没有 done/block。请总控查看日志: {log_path}"
        block_task(task_id, agent, reason)

    agent_queue.append_event(
        {
            "event": "worker_exited",
            "task_id": task_id,
            "agent": agent,
            "slot": slot.slot_id,
            "exit_code": code,
        }
    )
    clear_state(slot)
    return False


def slot_available(slot: AgentSlot, args: argparse.Namespace) -> tuple[bool, str]:
    if not slot.workdir.exists():
        return False, f"missing workdir: {slot.workdir}"
    if slot.tool == "codex" and not CODEX_BIN:
        return False, "codex command not found"
    if slot.tool == "claude" and not CLAUDE_BIN:
        return False, "claude command not found"
    dirty_slots = set(args.allow_dirty_slot or [])
    dirty_allowed = args.allow_dirty or slot.slot_id in dirty_slots or slot.role in dirty_slots
    if not dirty_allowed and git_dirty(slot.workdir):
        return False, "worktree has local changes"
    return True, ""


def dispatch_cycle(
    slots: list[AgentSlot],
    args: argparse.Namespace,
    running: dict[str, subprocess.Popen[Any]],
) -> int:
    started = 0
    dry_claimed: set[str] = set()
    for slot in slots:
        proc = running.get(slot.slot_id)
        busy = finish_if_exited(slot, proc)
        if not busy:
            running.pop(slot.slot_id, None)
        if busy:
            continue

        available, reason = slot_available(slot, args)
        if not available:
            if args.verbose:
                print(f"{slot.slot_id}: skip ({reason})")
            continue

        if args.dry_run:
            candidate = queued_candidate(slot, dry_claimed)
            if candidate:
                print(f"Would dispatch {candidate['id']} -> {slot.agent_name} ({slot.workdir})")
                dry_claimed.add(str(candidate["id"]))
                started += 1
            elif args.verbose:
                print(f"{slot.slot_id}: no runnable task")
            continue

        task = claim_task(slot)
        if not task:
            if args.verbose:
                print(f"{slot.slot_id}: no runnable task")
            continue
        try:
            running[slot.slot_id] = start_worker(slot, task)
            started += 1
        except Exception as exc:
            reason = f"自动派工启动失败: {exc}"
            block_task(str(task["id"]), slot.agent_name, reason)
            agent_queue.append_event(
                {
                    "event": "dispatch_failed",
                    "task_id": task.get("id"),
                    "agent": slot.agent_name,
                    "slot": slot.slot_id,
                    "error": str(exc),
                }
            )
            agent_queue.notify("内容工厂自动派工失败", f"{task.get('id')} · {exc}")
            if args.verbose:
                print(f"{slot.slot_id}: dispatch failed ({exc})")
    return started


def print_status(slots: list[AgentSlot]) -> int:
    print(f"Queue: {agent_queue.queue_dir()}")
    for slot in slots:
        state = read_state(slot)
        if not state:
            print(f"{slot.slot_id}: idle · {slot.agent_name}")
            continue
        pid = int(state.get("pid", 0) or 0)
        alive = pid_alive(pid) if pid else False
        print(
            f"{slot.slot_id}: {'running' if alive else 'stale'} "
            f"pid={pid} task={state.get('task_id')} log={state.get('log')}"
        )
    return 0


def acquire_singleton_lock() -> Any:
    root = agent_queue.queue_dir()
    root.mkdir(parents=True, exist_ok=True)
    lock = (root / ".dispatcher.lock").open("w", encoding="utf-8")
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        print("Agent dispatcher is already running.")
        raise SystemExit(0)
    return lock


def selected_slots(names: list[str] | None) -> list[AgentSlot]:
    if not names:
        return list(DEFAULT_SLOTS)
    wanted = set(names)
    slots = [slot for slot in DEFAULT_SLOTS if slot.slot_id in wanted or slot.role in wanted]
    missing = wanted - {slot.slot_id for slot in slots} - {slot.role for slot in slots}
    if missing:
        raise SystemExit(f"Unknown slot/role: {', '.join(sorted(missing))}")
    return slots


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--watch", action="store_true", help="Keep polling the queue.")
    parser.add_argument("--once", action="store_true", help="Run one dispatch cycle and exit.")
    parser.add_argument("--dry-run", action="store_true", help="Show what would be dispatched without claiming.")
    parser.add_argument("--status", action="store_true", help="Show dispatcher slot state.")
    parser.add_argument("--interval", type=float, default=8.0, help="Polling interval in seconds.")
    parser.add_argument("--slot", action="append", help="Restrict to a slot id or role. Can be repeated.")
    parser.add_argument("--allow-dirty", action="store_true", help="Allow dispatching into dirty worktrees.")
    parser.add_argument(
        "--allow-dirty-slot",
        action="append",
        help="Allow dirty worktree dispatch only for this slot id or role. Can be repeated.",
    )
    parser.add_argument("--verbose", action="store_true")
    return parser


def main(argv: list[str]) -> int:
    args = build_parser().parse_args(argv)
    slots = selected_slots(args.slot)

    if args.status:
        return print_status(slots)

    if not args.dry_run:
        lock = acquire_singleton_lock()
    else:
        lock = None

    running: dict[str, subprocess.Popen[Any]] = {}
    try:
        while True:
            dispatch_cycle(slots, args, running)
            if args.once or not args.watch:
                return 0
            time.sleep(max(args.interval, 1.0))
    finally:
        if lock:
            lock.close()


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
