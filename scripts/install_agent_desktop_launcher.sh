#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
launcher="${HOME}/Desktop/打开内容工厂5个Agent.app"
script_file="$(mktemp)"

cleanup() {
  rm -f "$script_file"
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

echo "Desktop launcher installed:"
echo "  $launcher"
echo
echo "Double-click it to open the 5 Agent workspaces."
