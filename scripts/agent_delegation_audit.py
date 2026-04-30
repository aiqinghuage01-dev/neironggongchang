#!/usr/bin/env python3
"""Audit whether delegated queue tasks were handled by the right role."""

from __future__ import annotations

import argparse
import json
from typing import Any

import agent_queue


DELEGATED_ROLES = {"content", "media", "qa", "review"}


def is_controller(agent: str) -> bool:
    normalized = (agent or "").lower()
    return "总控" in agent or "controller" in normalized


def delegated_takeovers(tasks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        task
        for task in tasks
        if str(task.get("role") or "") in DELEGATED_ROLES
        and is_controller(str(task.get("claimed_by") or ""))
    ]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--format", choices=("human", "json"), default="human")
    parser.add_argument("--fail-on-missing", action="store_true")
    args = parser.parse_args()

    with agent_queue.locked_queue() as tasks:
        items = delegated_takeovers(list(tasks))

    missing = [task for task in items if not task.get("takeover_reason")]
    payload = {
        "total_takeovers": len(items),
        "missing_takeover_reason": len(missing),
        "items": [
            {
                "id": task.get("id"),
                "role": task.get("role"),
                "status": task.get("status"),
                "claimed_by": task.get("claimed_by"),
                "title": task.get("title"),
                "takeover_reason": task.get("takeover_reason") or "",
                "takeover_at": task.get("takeover_at") or "",
            }
            for task in items
        ],
    }

    if args.format == "json":
        print(json.dumps(payload, ensure_ascii=False, indent=2))
    else:
        print(
            f"Delegated task takeovers: {payload['total_takeovers']} "
            f"(missing reason: {payload['missing_takeover_reason']})"
        )
        for task in payload["items"]:
            marker = "!" if not task["takeover_reason"] else "-"
            print(
                f"{marker} {task['id']} [{task['status']}] role={task['role']} "
                f"claimed_by={task['claimed_by']}"
            )
            print(f"  title: {task['title']}")
            print(f"  takeover_reason: {task['takeover_reason'] or '(missing)'}")

    if args.fail_on_missing and missing:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
