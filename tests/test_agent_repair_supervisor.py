import json
import os
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
QUEUE = ROOT / "scripts" / "agent_queue.py"
SUPERVISOR = ROOT / "scripts" / "agent_repair_supervisor.py"


def run_cmd(tmp_path, *args):
    env = os.environ.copy()
    env["NRG_AGENT_QUEUE_DIR"] = str(tmp_path / "queue")
    return subprocess.run(
        [sys.executable, *map(str, args)],
        cwd=ROOT,
        env=env,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )


def run_queue(tmp_path, *args):
    return run_cmd(tmp_path, QUEUE, *args)


def run_supervisor(tmp_path, *args):
    return run_cmd(tmp_path, SUPERVISOR, *args)


def add_task(tmp_path, task_id, role, *, depends_on=""):
    args = [
        "add",
        "--id",
        task_id,
        "--role",
        role,
        "--title",
        f"{task_id} 标题",
        "--instructions",
        f"{task_id} 说明",
    ]
    if depends_on:
        args.extend(["--depends-on", depends_on])
    result = run_queue(tmp_path, *args)
    assert result.returncode == 0, result.stderr


def list_tasks(tmp_path):
    result = run_queue(tmp_path, "list", "--format", "json")
    assert result.returncode == 0, result.stderr
    return json.loads(result.stdout)


def task_by_id(tmp_path, task_id):
    return next(task for task in list_tasks(tmp_path) if task["id"] == task_id)


def test_supervisor_creates_repair_qa_and_review_for_blocked_qa(tmp_path):
    add_task(tmp_path, "T-100", "content")
    assert run_queue(
        tmp_path,
        "done",
        "T-100",
        "--agent",
        "NRG 内容开发自动",
        "--report",
        "docs/agent-handoff/DEV_T100.md",
        "--commit",
        "abc100",
    ).returncode == 0
    add_task(tmp_path, "T-101", "qa", depends_on="T-100")
    assert run_queue(
        tmp_path,
        "block",
        "T-101",
        "--agent",
        "NRG QA 自动",
        "--reason",
        "页面没有逐版显示, 需要返修",
    ).returncode == 0

    result = run_supervisor(tmp_path, "--process-existing")

    assert result.returncode == 0, result.stderr
    tasks = {task["id"]: task for task in list_tasks(tmp_path)}
    assert tasks["T-102"]["role"] == "content"
    assert tasks["T-102"]["status"] == "queued"
    assert "T-100" in tasks["T-102"]["title"]
    assert "页面没有逐版显示" in tasks["T-102"]["instructions"]
    assert tasks["T-103"]["role"] == "qa"
    assert tasks["T-103"]["depends_on"] == ["T-102"]
    assert tasks["T-104"]["role"] == "review"
    assert tasks["T-104"]["depends_on"] == ["T-102"]


def test_supervisor_ignores_existing_blockers_on_first_tick_then_handles_new_ones(tmp_path):
    add_task(tmp_path, "T-110", "media")
    assert run_queue(
        tmp_path,
        "done",
        "T-110",
        "--agent",
        "NRG 媒体开发自动",
        "--report",
        "docs/agent-handoff/MEDIA_T110.md",
        "--commit",
        "abc110",
    ).returncode == 0
    add_task(tmp_path, "T-111", "qa", depends_on="T-110")
    assert run_queue(
        tmp_path,
        "block",
        "T-111",
        "--agent",
        "NRG QA 自动",
        "--reason",
        "启动前历史阻塞",
    ).returncode == 0

    first = run_supervisor(tmp_path)

    assert first.returncode == 0, first.stderr
    assert {task["id"] for task in list_tasks(tmp_path)} == {"T-110", "T-111"}

    add_task(tmp_path, "T-112", "review", depends_on="T-110")
    assert run_queue(
        tmp_path,
        "block",
        "T-112",
        "--agent",
        "NRG Claude 审查自动",
        "--reason",
        "启动后新增阻塞",
    ).returncode == 0

    second = run_supervisor(tmp_path)

    assert second.returncode == 0, second.stderr
    tasks = {task["id"]: task for task in list_tasks(tmp_path)}
    assert tasks["T-113"]["role"] == "media"
    assert "启动后新增阻塞" in tasks["T-113"]["instructions"]
    assert tasks["T-114"]["role"] == "qa"
    assert tasks["T-115"]["role"] == "review"


def test_supervisor_does_not_repair_owner_decision_blockers(tmp_path):
    add_task(tmp_path, "T-120", "content")
    assert run_queue(
        tmp_path,
        "done",
        "T-120",
        "--agent",
        "NRG 内容开发自动",
        "--report",
        "docs/agent-handoff/DEV_T120.md",
        "--commit",
        "abc120",
    ).returncode == 0
    add_task(tmp_path, "T-121", "qa", depends_on="T-120")
    assert run_queue(
        tmp_path,
        "block",
        "T-121",
        "--agent",
        "NRG QA 自动",
        "--reason",
        "需要老板决定是否真烧",
        "--owner-decision",
    ).returncode == 0

    result = run_supervisor(tmp_path, "--process-existing")

    assert result.returncode == 0, result.stderr
    assert {task["id"] for task in list_tasks(tmp_path)} == {"T-120", "T-121"}


def test_supervisor_resets_technical_worker_exit_blockers(tmp_path):
    add_task(tmp_path, "T-130", "qa")
    reason = "自动派工 worker 已退出但任务没有 done/block。请总控查看日志: /tmp/fake.log"
    assert run_queue(
        tmp_path,
        "block",
        "T-130",
        "--agent",
        "NRG QA 自动",
        "--reason",
        reason,
    ).returncode == 0

    result = run_supervisor(tmp_path, "--process-existing")

    assert result.returncode == 0, result.stderr
    task = task_by_id(tmp_path, "T-130")
    assert task["status"] == "queued"
    assert not task["claimed_by"]
