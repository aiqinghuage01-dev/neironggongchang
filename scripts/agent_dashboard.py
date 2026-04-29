#!/usr/bin/env python3
"""Local web dashboard for the multi-agent queue and dispatcher."""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlparse

import agent_dispatcher
import agent_queue


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_PORT = int(os.environ.get("AGENT_DASHBOARD_PORT", "8765"))
PROJECT_NAME = os.environ.get("AGENT_PROJECT_NAME", REPO_ROOT.name)
MONITOR_LABEL = os.environ.get("AGENT_MONITOR_LABEL", "com.neironggongchang.agent-monitor")
DISPATCHER_LABEL = os.environ.get("AGENT_DISPATCHER_LABEL", "com.neironggongchang.agent-dispatcher")
DASHBOARD_LABEL = os.environ.get("AGENT_DASHBOARD_LABEL", "com.neironggongchang.agent-dashboard")


def now() -> str:
    return time.strftime("%Y-%m-%d %H:%M:%S", time.localtime())


def read_json_file(path: Path, fallback: Any) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        return fallback


def task_items() -> list[dict[str, Any]]:
    with agent_queue.locked_queue() as tasks:
        items = [dict(task) for task in tasks]
    items.sort(key=agent_queue.task_key)
    return items


def event_items(limit: int = 30) -> list[dict[str, Any]]:
    path = agent_queue.queue_dir() / "events.jsonl"
    if not path.exists():
        return []
    lines = path.read_text(encoding="utf-8", errors="replace").splitlines()[-limit:]
    events = []
    for line in lines:
        try:
            events.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    return events


def pid_elapsed(pid: int) -> str:
    result = subprocess.run(
        ["ps", "-p", str(pid), "-o", "etime="],
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        check=False,
    )
    return result.stdout.strip()


def launch_status(label: str) -> dict[str, Any]:
    uid = str(os.getuid())
    result = subprocess.run(
        ["launchctl", "print", f"gui/{uid}/{label}"],
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    if result.returncode != 0:
        return {"label": label, "running": False, "state": "not loaded", "pid": ""}

    state = ""
    pid = ""
    for line in result.stdout.splitlines():
        stripped = line.strip()
        if stripped.startswith("state ="):
            state = stripped.split("=", 1)[1].strip()
        elif stripped.startswith("pid ="):
            pid = stripped.split("=", 1)[1].strip()
    running = state in {"running", "active"} or bool(pid)
    return {"label": label, "running": running, "state": state or "loaded", "pid": pid}


def log_files(limit: int = 20) -> list[dict[str, Any]]:
    root = agent_queue.queue_dir() / "logs"
    if not root.exists():
        return []
    files = sorted(root.glob("*.log"), key=lambda path: path.stat().st_mtime, reverse=True)
    out = []
    for path in files[:limit]:
        stat = path.stat()
        out.append(
            {
                "name": path.name,
                "path": str(path),
                "size": stat.st_size,
                "mtime": time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(stat.st_mtime)),
            }
        )
    return out


def tail_log(path_text: str, limit: int = 16000) -> str:
    path = Path(path_text).expanduser()
    logs_root = (agent_queue.queue_dir() / "logs").resolve()
    try:
        resolved = path.resolve()
    except OSError:
        return "Log path not found."
    if logs_root not in resolved.parents and resolved != logs_root:
        return "Log path is outside the agent logs directory."
    if not resolved.exists():
        return "Log path not found."
    data = resolved.read_bytes()
    return data[-limit:].decode("utf-8", errors="replace")


def slot_status() -> list[dict[str, Any]]:
    tasks = task_items()
    slots = []
    for slot in agent_dispatcher.DEFAULT_SLOTS:
        state = agent_dispatcher.read_state(slot)
        status = "idle"
        pid = ""
        elapsed = ""
        task: dict[str, Any] | None = None
        log = ""
        if state:
            pid_int = int(state.get("pid", 0) or 0)
            alive = bool(pid_int and agent_dispatcher.pid_alive(pid_int))
            status = "running" if alive else "stale"
            pid = str(pid_int or "")
            elapsed = pid_elapsed(pid_int) if alive else ""
            log = str(state.get("log") or "")
            task_id = str(state.get("task_id") or "")
            task = next((item for item in tasks if item.get("id") == task_id), None)

        if not task:
            task = next(
                (
                    item
                    for item in tasks
                    if item.get("status") == "claimed" and item.get("claimed_by") == slot.agent_name
                ),
                None,
            )

        dirty = False
        dirty_details: list[str] = []
        missing = not slot.workdir.exists()
        if not missing:
            dirty_details = agent_dispatcher.significant_git_status(slot.workdir)
            dirty = bool(dirty_details)

        slots.append(
            {
                "slot_id": slot.slot_id,
                "agent_name": slot.agent_name,
                "role": slot.role,
                "tool": slot.tool,
                "workdir": str(slot.workdir),
                "status": status,
                "pid": pid,
                "elapsed": elapsed,
                "log": log,
                "dirty": dirty,
                "dirty_details": dirty_details[:6],
                "missing": missing,
                "task": task,
            }
        )
    return slots


def dashboard_payload() -> dict[str, Any]:
    tasks = task_items()
    counts: dict[str, int] = {}
    for task in tasks:
        counts[str(task.get("status") or "unknown")] = counts.get(str(task.get("status") or "unknown"), 0) + 1

    return {
        "project": PROJECT_NAME,
        "repo_root": str(REPO_ROOT),
        "queue_dir": str(agent_queue.queue_dir()),
        "time": now(),
        "launch": {
            "monitor": launch_status(MONITOR_LABEL),
            "dispatcher": launch_status(DISPATCHER_LABEL),
            "dashboard": launch_status(DASHBOARD_LABEL),
        },
        "slots": slot_status(),
        "tasks": tasks,
        "counts": counts,
        "events": event_items(),
        "logs": log_files(),
    }


HTML = """<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Agent 工作台</title>
  <style>
    :root {
      --bg: #111317;
      --panel: #1b1f26;
      --panel2: #232934;
      --text: #edf1f7;
      --muted: #9ba7b8;
      --line: #303846;
      --green: #55d187;
      --yellow: #f1c96b;
      --red: #ff7a7a;
      --blue: #7bb7ff;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    header {
      position: sticky;
      top: 0;
      z-index: 10;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 18px 22px;
      border-bottom: 1px solid var(--line);
      background: rgba(17,19,23,.94);
      backdrop-filter: blur(12px);
    }
    h1 { margin: 0; font-size: 20px; letter-spacing: 0; }
    .sub { color: var(--muted); margin-top: 2px; font-size: 13px; }
    .wrap { padding: 18px 22px 32px; }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 12px;
    }
    .card {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 14px;
      min-height: 120px;
    }
    .card.running { border-color: rgba(85,209,135,.65); }
    .card.stale { border-color: rgba(255,122,122,.65); }
    .row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
    .name { font-weight: 700; font-size: 15px; }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      border: 1px solid var(--line);
      color: var(--muted);
      border-radius: 999px;
      padding: 3px 9px;
      font-size: 12px;
      white-space: nowrap;
    }
    .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--muted); }
    .running .dot, .ok .dot { background: var(--green); }
    .stale .dot, .bad .dot { background: var(--red); }
    .warn .dot { background: var(--yellow); }
    .meta { color: var(--muted); margin-top: 8px; overflow-wrap: anywhere; }
    .task { margin-top: 12px; padding: 10px; background: var(--panel2); border-radius: 7px; }
    .task-title { font-weight: 650; }
    section { margin-top: 20px; }
    h2 { font-size: 16px; margin: 0 0 10px; }
    table {
      width: 100%;
      border-collapse: collapse;
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      overflow: hidden;
    }
    th, td { text-align: left; padding: 10px 12px; border-bottom: 1px solid var(--line); vertical-align: top; }
    th { color: var(--muted); font-weight: 600; background: #151922; }
    tr:last-child td { border-bottom: 0; }
    code { color: #c9e2ff; }
    button {
      background: var(--panel2);
      color: var(--text);
      border: 1px solid var(--line);
      border-radius: 7px;
      padding: 7px 10px;
      cursor: pointer;
    }
    button:hover { border-color: var(--blue); }
    .log-box {
      display: none;
      margin-top: 10px;
      white-space: pre-wrap;
      background: #0b0d11;
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 12px;
      max-height: 360px;
      overflow: auto;
      color: #d7dde8;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 12px;
    }
    .pillbar { display: flex; flex-wrap: wrap; gap: 8px; }
    .small { font-size: 12px; color: var(--muted); }
  </style>
</head>
<body>
  <header>
    <div>
      <h1 id="title">Agent 工作台</h1>
      <div class="sub" id="subtitle">加载中...</div>
    </div>
    <div class="pillbar" id="launch"></div>
  </header>
  <main class="wrap">
    <section>
      <h2>谁在上岗</h2>
      <div class="grid" id="slots"></div>
    </section>
    <section>
      <h2>任务队列</h2>
      <div id="tasks"></div>
    </section>
    <section>
      <h2>最近日志</h2>
      <div id="logs"></div>
      <div class="log-box" id="logbox"></div>
    </section>
  </main>
  <script>
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const statusText = s => ({running:'工作中', idle:'空闲', stale:'异常退出'}[s] || s);
    const taskStatus = s => ({queued:'排队', claimed:'已领取', done:'已完成', blocked:'阻塞', cancelled:'取消'}[s] || s);
    function badge(label, ok) {
      return `<span class="badge ${ok ? 'ok' : 'bad'}"><span class="dot"></span>${esc(label)}</span>`;
    }
    async function loadLog(path) {
      const box = document.getElementById('logbox');
      const r = await fetch('/api/log?path=' + encodeURIComponent(path));
      box.textContent = await r.text();
      box.style.display = 'block';
    }
    function render(data) {
      document.getElementById('title').textContent = `${data.project} · Agent 工作台`;
      document.getElementById('subtitle').textContent = `${data.time} · ${data.repo_root}`;
      document.getElementById('launch').innerHTML =
        badge('监控 ' + (data.launch.monitor.running ? '运行中' : '未运行'), data.launch.monitor.running) +
        badge('派工 ' + (data.launch.dispatcher.running ? '运行中' : '未运行'), data.launch.dispatcher.running) +
        badge('面板 ' + (data.launch.dashboard.running ? '运行中' : '未运行'), data.launch.dashboard.running);

      document.getElementById('slots').innerHTML = data.slots.map(slot => {
        const cls = slot.status === 'running' ? 'running' : (slot.status === 'stale' ? 'stale' : '');
        const task = slot.task;
        const logButton = slot.log ? `<button onclick="loadLog('${esc(slot.log)}')">看日志</button>` : '';
        return `<div class="card ${cls}">
          <div class="row">
            <div class="name">${esc(slot.agent_name)}</div>
            <span class="badge ${slot.status}"><span class="dot"></span>${statusText(slot.status)}</span>
          </div>
          <div class="meta">${esc(slot.role)} · ${esc(slot.tool)}${slot.elapsed ? ' · ' + esc(slot.elapsed) : ''}</div>
          <div class="meta">${slot.dirty ? '工作区有未提交改动，自动派工会谨慎跳过。' : '工作区干净或当前可用。'}</div>
          ${slot.dirty_details && slot.dirty_details.length ? `<div class="small">${esc(slot.dirty_details.join(' · '))}</div>` : ''}
          ${task ? `<div class="task"><div class="task-title">${esc(task.id)} · ${esc(task.title)}</div><div class="small">${taskStatus(task.status)} · ${esc(task.claimed_by || '-')}</div></div>` : '<div class="meta">当前没有任务。</div>'}
          ${logButton}
        </div>`;
      }).join('');

      const rows = data.tasks.map(t => `<tr>
        <td><code>${esc(t.id)}</code></td>
        <td>${taskStatus(t.status)}</td>
        <td>${esc(t.role)}</td>
        <td>${esc(t.title)}${t.summary ? `<div class="small">${esc(t.summary)}</div>` : ''}</td>
        <td>${esc(t.claimed_by || '-')}</td>
      </tr>`).join('');
      document.getElementById('tasks').innerHTML = `<table><thead><tr><th>ID</th><th>状态</th><th>角色</th><th>任务</th><th>领取人</th></tr></thead><tbody>${rows || '<tr><td colspan="5">暂无任务</td></tr>'}</tbody></table>`;

      document.getElementById('logs').innerHTML = `<table><thead><tr><th>时间</th><th>日志</th><th>大小</th><th></th></tr></thead><tbody>` +
        data.logs.map(l => `<tr><td>${esc(l.mtime)}</td><td><code>${esc(l.name)}</code><div class="small">${esc(l.path)}</div></td><td>${esc(l.size)}</td><td><button onclick="loadLog('${esc(l.path)}')">看日志</button></td></tr>`).join('') +
        `</tbody></table>`;
    }
    async function tick() {
      try {
        const r = await fetch('/api/status', {cache: 'no-store'});
        render(await r.json());
      } catch (e) {
        document.getElementById('subtitle').textContent = '状态读取失败: ' + e;
      }
    }
    tick();
    setInterval(tick, 3000);
  </script>
</body>
</html>
"""


class Handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path == "/api/status":
            self.send_json(dashboard_payload())
            return
        if parsed.path == "/api/log":
            query = parse_qs(parsed.query)
            text = tail_log(query.get("path", [""])[0])
            self.send_text(text, content_type="text/plain; charset=utf-8")
            return
        if parsed.path in {"/", "/index.html"}:
            self.send_text(HTML, content_type="text/html; charset=utf-8")
            return
        self.send_error(404)

    def log_message(self, fmt: str, *args: Any) -> None:
        return

    def send_json(self, payload: Any) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def send_text(self, text: str, *, content_type: str) -> None:
        body = text.encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT)
    return parser


def main(argv: list[str]) -> int:
    args = build_parser().parse_args(argv)
    server = ThreadingHTTPServer((args.host, args.port), Handler)
    print(f"Agent dashboard: http://{args.host}:{args.port}/", flush=True)
    server.serve_forever()
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
