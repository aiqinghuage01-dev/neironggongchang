#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
launcher="${HOME}/Desktop/打开内容工厂5个Agent.app"
monitor_launcher="${HOME}/Desktop/打开内容工厂Agent监控.app"
script_file="$(mktemp)"
monitor_script_file="$(mktemp)"

cleanup() {
  rm -f "$script_file"
  rm -f "$monitor_script_file"
}
trap cleanup EXIT

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

echo "Desktop launcher installed:"
echo "  $launcher"
echo "  $monitor_launcher"
echo
echo "Double-click it to open the 5 Agent workspaces."
echo "Double-click the monitor launcher to get notifications when reports change."
