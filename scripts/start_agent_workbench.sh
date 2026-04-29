#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
worktree_root="${HOME}/Desktop/nrg-worktrees"
log_file="${NRG_AGENT_WORKBENCH_LOG:-/tmp/nrg-agent-workbench.log}"
lock_dir="/tmp/nrg-agent-workbench.lock"

usage() {
  cat <<'USAGE'
Usage:
  bash scripts/start_agent_workbench.sh [options]

Options:
  --force-open-fallback   Allow cmux path fallback if the cmux CLI socket is broken.
                          This can create extra windows on some cmux versions.
  -h, --help              Show this help.

Default is safe daily mode:
  - start monitor
  - start dispatcher
  - activate existing cmux workspaces
  - do not use macOS open fallback that creates duplicate windows
USAGE
}

force_open_fallback=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --force-open-fallback)
      force_open_fallback=1
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

if ! mkdir "$lock_dir" 2>/dev/null; then
  echo "Agent workbench is already starting. Skip duplicate launch."
  open -a cmux >/dev/null 2>&1 || true
  exit 0
fi
trap 'rmdir "$lock_dir" 2>/dev/null || true' EXIT

target_dirs=(
  "${repo_root}"
  "${worktree_root}/content-dev"
  "${worktree_root}/media-dev"
  "${worktree_root}/qa"
  "${worktree_root}/review"
)

cmux_has_all_target_workspaces() {
  osascript - "${target_dirs[@]}" <<'OSA' >/dev/null 2>&1
on run argv
  tell application "cmux"
    if (count of windows) is 0 then error "no windows"
    set matched to 0
    repeat with w in windows
      repeat with t in tabs of w
        set wd to ""
        try
          set wd to working directory of focused terminal of t as text
        end try
        repeat with targetDir in argv
          if wd is (targetDir as text) then
            set matched to matched + 1
            exit repeat
          end if
        end repeat
      end repeat
    end repeat
    if matched < 5 then error "missing target workspaces"
  end tell
end run
OSA
}

cleanup_duplicate_cmux_windows() {
  osascript - "${target_dirs[@]}" <<'OSA' >/dev/null 2>&1 || true
on run argv
  tell application "cmux"
    if (count of windows) <= 1 then return

    set primaryIndex to 0
    repeat with wi from 1 to (count of windows)
      set matched to 0
      repeat with t in tabs of window wi
        set wd to ""
        try
          set wd to working directory of focused terminal of t as text
        end try
        repeat with targetDir in argv
          if wd is (targetDir as text) then
            set matched to matched + 1
            exit repeat
          end if
        end repeat
      end repeat
      if matched >= 5 then
        set primaryIndex to wi
        exit repeat
      end if
    end repeat
    if primaryIndex is 0 then return
  end tell

  tell application "System Events"
    if not (exists process "cmux") then return
    tell process "cmux"
      repeat while (count of windows) > 1
        try
          perform action "AXClose" of window 2
        on error
          try
            click button 1 of window 2
          end try
        end try
        delay 0.15
      end repeat
    end tell
  end tell
end run
OSA
}

mkdir -p "$(dirname "$log_file")"
{
  echo "=== $(date '+%Y-%m-%d %H:%M:%S') start workbench ==="
  bash "${repo_root}/scripts/start_agent_monitor.sh" || true
  bash "${repo_root}/scripts/start_agent_dispatcher.sh" || true

  open -a cmux >/dev/null 2>&1 || true
  sleep 0.5

  safe_activated=0
  if cmux_has_all_target_workspaces; then
    echo "cmux target workspaces already available; safe activate only."
    cleanup_duplicate_cmux_windows
    open -a cmux >/dev/null 2>&1 || true
    safe_activated=1
  fi

  if [[ "$safe_activated" -eq 0 ]]; then
    if [[ "$force_open_fallback" -eq 1 ]]; then
      echo "Target workspaces missing; force fallback is enabled."
      bash "${repo_root}/scripts/start_multi_agents_cmux.sh" || true
    else
      echo "Target workspaces missing; trying cmux CLI without macOS open fallback."
      if ! bash "${repo_root}/scripts/start_multi_agents_cmux.sh" --no-open-fallback; then
        echo "cmux CLI unavailable. Skipping path fallback to avoid duplicate windows."
        echo "For one-time repair only: bash scripts/start_agent_workbench.sh --force-open-fallback"
      fi
    fi

    cleanup_duplicate_cmux_windows
    open -a cmux >/dev/null 2>&1 || true
  fi
} >>"$log_file" 2>&1

echo "Agent workbench started. Log: ${log_file}"
