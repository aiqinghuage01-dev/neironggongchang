#!/usr/bin/env bash
set -euo pipefail

label="com.neironggongchang.agent-monitor"
repo_root="$(git rev-parse --show-toplevel)"
plist="${HOME}/Library/LaunchAgents/${label}.plist"
log_file="/tmp/nrg-agent-monitor.log"
uid="$(id -u)"
python_bin="$(command -v python3)"

usage() {
  cat <<'USAGE'
Usage:
  bash scripts/start_agent_monitor.sh [options]

Options:
  --stop         Stop the background monitor.
  --status       Show launchctl status.
  --foreground   Internal: run the monitor in the foreground.
  -h, --help     Show this help.
USAGE
}

mode="start"
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
  exec python3 scripts/agent_inbox.py --watch --notify --hours 48 --interval 10
fi

if [[ "$mode" == "stop" ]]; then
  launchctl bootout "gui/${uid}" "$plist" >/dev/null 2>&1 || true
  echo "Agent monitor stopped."
  exit 0
fi

if [[ "$mode" == "status" ]]; then
  launchctl print "gui/${uid}/${label}" || true
  exit 0
fi

mkdir -p "$(dirname "$plist")"
launch_command="cd '${repo_root}' && exec '${python_bin}' scripts/agent_inbox.py --watch --notify --hours 48 --interval 10"
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

echo "Agent monitor started."
echo "LaunchAgent: ${plist}"
echo "Log: ${log_file}"
