#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
all_launcher="${HOME}/Desktop/打开内容工厂工作台.app"
launcher="${HOME}/Desktop/打开内容工厂5个Agent.app"
monitor_launcher="${HOME}/Desktop/打开内容工厂Agent监控.app"
dispatcher_launcher="${HOME}/Desktop/打开内容工厂自动派工.app"
all_script_file="$(mktemp)"
script_file="$(mktemp)"
monitor_script_file="$(mktemp)"
dispatcher_script_file="$(mktemp)"
debug_launchers=0

usage() {
  cat <<'USAGE'
Usage:
  bash scripts/install_agent_desktop_launcher.sh [options]

Options:
  --with-debug-launchers   Also create separate 5-Agent / monitor / dispatcher apps.
  -h, --help               Show this help.

Default creates only one daily-use desktop app:
  打开内容工厂工作台.app
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --with-debug-launchers)
      debug_launchers=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage
      exit 2
      ;;
  esac
done

cleanup() {
  rm -f "$all_script_file"
  rm -f "$script_file"
  rm -f "$monitor_script_file"
  rm -f "$dispatcher_script_file"
}
trap cleanup EXIT

cat > "$all_script_file" <<EOF
set repoPath to "${repo_root}"
set logPath to "/tmp/nrg-agent-workbench.log"

do shell script "cd " & quoted form of repoPath & " && /bin/bash scripts/start_agent_workbench.sh >> " & quoted form of logPath & " 2>&1 &"

tell application "cmux"
  activate
end tell

display notification "工作台已启动：状态面板、监控、自动派工、5 个 Agent 工作区。" with title "内容工厂 Agent"
EOF

rm -rf "$all_launcher"
osacompile -o "$all_launcher" "$all_script_file"

if [[ "$debug_launchers" -eq 0 ]]; then
  rm -rf "$launcher" "$monitor_launcher" "$dispatcher_launcher"
  echo "Desktop launcher installed:"
  echo "  $all_launcher"
  echo
  echo "Daily use: double-click only the workbench launcher."
  echo "Debug launchers were removed from Desktop. Recreate them with --with-debug-launchers."
  exit 0
fi

cat > "$script_file" <<EOF
set repoPath to "${repo_root}"
set logPath to "/tmp/nrg-open-5-agents.log"

do shell script "cd " & quoted form of repoPath & " && /bin/bash scripts/start_multi_agents_cmux.sh > " & quoted form of logPath & " 2>&1 &"

tell application "cmux"
  activate
end tell

display notification "5 个 Agent 工作区正在打开。进入某个工作区后输入：开工" with title "内容工厂 Agent"
EOF

rm -rf "$launcher"
osacompile -o "$launcher" "$script_file"

cat > "$monitor_script_file" <<EOF
set repoPath to "${repo_root}"
set logPath to "/tmp/nrg-agent-monitor.log"

do shell script "cd " & quoted form of repoPath & " && /bin/bash scripts/start_agent_monitor.sh > " & quoted form of logPath & " 2>&1"

display notification "Agent 监控已启动。有新报告会自动通知你。" with title "内容工厂 Agent"
EOF

rm -rf "$monitor_launcher"
osacompile -o "$monitor_launcher" "$monitor_script_file"

cat > "$dispatcher_script_file" <<EOF
set repoPath to "${repo_root}"
set logPath to "/tmp/nrg-agent-dispatcher.log"

do shell script "cd " & quoted form of repoPath & " && /bin/bash scripts/start_agent_dispatcher.sh > " & quoted form of logPath & " 2>&1"

display notification "自动派工已启动。你只需要在总控窗口安排任务。" with title "内容工厂 Agent"
EOF

rm -rf "$dispatcher_launcher"
osacompile -o "$dispatcher_launcher" "$dispatcher_script_file"

echo "Desktop launcher installed:"
echo "  $all_launcher"
echo "  $launcher"
echo "  $monitor_launcher"
echo "  $dispatcher_launcher"
echo
echo "Daily use: double-click the workbench launcher."
echo "The other launchers are kept for debugging or separate restarts."
