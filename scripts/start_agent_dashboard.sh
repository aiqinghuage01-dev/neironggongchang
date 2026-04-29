#!/usr/bin/env bash
set -euo pipefail

label="${AGENT_DASHBOARD_LABEL:-com.neironggongchang.agent-dashboard}"
repo_root="$(git rev-parse --show-toplevel)"
port="${AGENT_DASHBOARD_PORT:-8765}"
host="${AGENT_DASHBOARD_HOST:-127.0.0.1}"
url="http://${host}:${port}/"
plist="${HOME}/Library/LaunchAgents/${label}.plist"
log_file="${AGENT_DASHBOARD_LOG:-/tmp/nrg-agent-dashboard.log}"
uid="$(id -u)"
python_bin=""
tool_path="${HOME}/.npm-global/bin:${HOME}/.local/bin:/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/Library/Frameworks/Python.framework/Versions/Current/bin:/usr/bin:/bin:/usr/sbin:/sbin:${PATH}"

for candidate in \
  "/Library/Frameworks/Python.framework/Versions/Current/bin/python3" \
  "/Library/Frameworks/Python.framework/Versions/3.14/bin/python3" \
  "/opt/homebrew/bin/python3" \
  "$(command -v python3)"
do
  if [[ -n "$candidate" && -x "$candidate" && "$candidate" != "/usr/bin/python3" ]]; then
    python_bin="$candidate"
    break
  fi
done
if [[ -z "$python_bin" ]]; then
  python_bin="$(command -v python3)"
fi

usage() {
  cat <<'USAGE'
Usage:
  bash scripts/start_agent_dashboard.sh [options]

Options:
  --stop         Stop the background dashboard.
  --status       Show launchctl status and dashboard URL.
  --foreground   Run the dashboard in the foreground.
  --open         Start the dashboard and open it in the browser.
  -h, --help     Show this help.
USAGE
}

mode="start"
open_after=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --stop)
      mode="stop"
      shift
      ;;
    --status)
      mode="status"
      shift
      ;;
    --foreground)
      mode="foreground"
      shift
      ;;
    --open)
      open_after=1
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

if [[ "$mode" == "foreground" ]]; then
  cd "$repo_root"
  export PATH="$tool_path"
  export PYTHONUNBUFFERED=1
  exec "$python_bin" scripts/agent_dashboard.py --host "$host" --port "$port"
fi

if [[ "$mode" == "stop" ]]; then
  launchctl bootout "gui/${uid}" "$plist" >/dev/null 2>&1 || true
  echo "Agent dashboard stopped."
  exit 0
fi

if [[ "$mode" == "status" ]]; then
  status_tmp="$(mktemp)"
  if launchctl print "gui/${uid}/${label}" >"$status_tmp" 2>/dev/null; then
    state_line="$(grep -m1 'state =' "$status_tmp" || true)"
    pid_line="$(grep -m1 'pid =' "$status_tmp" || true)"
    echo "LaunchAgent: ${state_line:-loaded}${pid_line:+ · ${pid_line}}"
  else
    echo "LaunchAgent: not loaded"
  fi
  rm -f "$status_tmp"
  echo "Dashboard: ${url}"
  exit 0
fi

mkdir -p "$(dirname "$plist")"
: > "$log_file"
launch_command="export PATH='${tool_path}' && export PYTHONUNBUFFERED=1 && export AGENT_DASHBOARD_PORT='${port}' && export AGENT_DASHBOARD_HOST='${host}' && cd '${repo_root}' && exec '${python_bin}' scripts/agent_dashboard.py --host '${host}' --port '${port}'"
cat > "$plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${label}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/zsh</string>
    <string>-lc</string>
    <string>${launch_command}</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${log_file}</string>
  <key>StandardErrorPath</key>
  <string>${log_file}</string>
</dict>
</plist>
EOF

launchctl bootout "gui/${uid}" "$plist" >/dev/null 2>&1 || true
launchctl bootstrap "gui/${uid}" "$plist"
launchctl enable "gui/${uid}/${label}" >/dev/null 2>&1 || true
launchctl kickstart -k "gui/${uid}/${label}" >/dev/null 2>&1 || true

if [[ "$open_after" -eq 1 ]]; then
  open "$url" >/dev/null 2>&1 || true
fi

echo "Agent dashboard started."
echo "Dashboard: ${url}"
echo "LaunchAgent: ${plist}"
echo "Log: ${log_file}"
