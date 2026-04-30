import json
import os
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
QUEUE = ROOT / "scripts" / "agent_queue.py"


def run_queue(tmp_path, *args):
    env = os.environ.copy()
    env["NRG_AGENT_QUEUE_DIR"] = str(tmp_path / "queue")
    return subprocess.run(
        [sys.executable, str(QUEUE), *args],
        cwd=ROOT,
        env=env,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )


def add_task(tmp_path, task_id="T-X", role="qa"):
    result = run_queue(
        tmp_path,
        "add",
        "--id",
        task_id,
        "--role",
        role,
        "--title",
        "测试任务",
        "--instructions",
        "用于测试队列行为",
    )
    assert result.returncode == 0, result.stderr


def get_task(tmp_path, task_id):
    result = run_queue(tmp_path, "list", "--format", "json")
    assert result.returncode == 0, result.stderr
    tasks = json.loads(result.stdout)
    return next(task for task in tasks if task["id"] == task_id)


def test_controller_takeover_of_delegated_task_requires_reason(tmp_path):
    add_task(tmp_path, "T-QA", "qa")

    result = run_queue(tmp_path, "done", "T-QA", "--agent", "NRG 总控")

    assert result.returncode != 0
    assert "--takeover-reason" in result.stderr
    assert get_task(tmp_path, "T-QA")["status"] == "queued"


def test_controller_takeover_reason_is_recorded(tmp_path):
    add_task(tmp_path, "T-MEDIA", "media")

    result = run_queue(
        tmp_path,
        "block",
        "T-MEDIA",
        "--agent",
        "NRG 总控",
        "--reason",
        "worker 假忙, 需要总控兜底",
        "--takeover-reason",
        "worker_stuck",
    )

    assert result.returncode == 0, result.stderr
    task = get_task(tmp_path, "T-MEDIA")
    assert task["status"] == "blocked"
    assert task["takeover_reason"] == "worker_stuck"
    assert task["takeover_at"]


def test_non_controller_agent_can_close_own_delegated_task_without_takeover_reason(tmp_path):
    add_task(tmp_path, "T-CONTENT", "content")

    result = run_queue(
        tmp_path,
        "done",
        "T-CONTENT",
        "--agent",
        "NRG 内容开发自动",
        "--report",
        "docs/agent-handoff/DEV_T_CONTENT.md",
        "--commit",
        "abc123",
    )

    assert result.returncode == 0, result.stderr
    task = get_task(tmp_path, "T-CONTENT")
    assert task["status"] == "done"
    assert not task.get("takeover_reason")
