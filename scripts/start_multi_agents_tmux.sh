#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  bash scripts/start_multi_agents_tmux.sh [options]

Options:
  --launch          Start codex/claude inside each tmux window.
                    Default only prepares windows and prints role files.
  --reset           Kill the existing tmux session first.
  --no-sync         Do not fast-forward agent worktrees to main.
  --dry-run         Print planned actions without creating tmux windows.
  --session <name>  tmux session name. Default: nrg-agents
  --socket <path>   tmux socket path. Default: ${TMPDIR:-/tmp}/nrg-agents.sock
  -h, --help        Show this help.

Examples:
  bash scripts/start_multi_agents_tmux.sh
  bash scripts/start_multi_agents_tmux.sh --launch
  bash scripts/start_multi_agents_tmux.sh --reset --launch

After start:
  tmux -S "${TMPDIR:-/tmp}/nrg-agents.sock" attach -t nrg-agents
USAGE
}

launch=0
reset=0
sync_worktrees=1
dry_run=0
session="nrg-agents"
socket="${TMPDIR:-/tmp}/nrg-agents.sock"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --launch)
      launch=1
      shift
      ;;
    --reset)
      reset=1
      shift
      ;;
    --no-sync)
      sync_worktrees=0
      shift
      ;;
    --dry-run)
      dry_run=1
      shift
      ;;
    --session)
      session="${2:?--session requires a name}"
      shift 2
      ;;
    --socket)
      socket="${2:?--socket requires a path}"
      shift 2
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

repo_root="$(git rev-parse --show-toplevel)"
worktree_root="${HOME}/Desktop/nrg-worktrees"

role_dir() {
  case "$1" in
    controller) printf '%s\n' "$repo_root" ;;
    content) printf '%s\n' "${worktree_root}/content-dev" ;;
    media) printf '%s\n' "${worktree_root}/media-dev" ;;
    qa) printf '%s\n' "${worktree_root}/qa" ;;
    review) printf '%s\n' "${worktree_root}/review" ;;
    *) return 1 ;;
  esac
}

role_branch() {
  case "$1" in
    controller) printf '%s\n' "main" ;;
    content) printf '%s\n' "codex/content-dev" ;;
    media) printf '%s\n' "codex/media-dev" ;;
    qa) printf '%s\n' "codex/qa" ;;
    review) printf '%s\n' "codex/review" ;;
    *) return 1 ;;
  esac
}

role_title() {
  case "$1" in
    controller) printf '%s\n' "总控 Agent" ;;
    content) printf '%s\n' "内容开发 Agent" ;;
    media) printf '%s\n' "媒体开发 Agent" ;;
    qa) printf '%s\n' "QA 测试 Agent" ;;
    review) printf '%s\n' "审查 Agent" ;;
    *) return 1 ;;
  esac
}

role_doc() {
  case "$1" in
    controller) printf '%s\n' "docs/agents/ROLE_CONTROLLER.md" ;;
    content) printf '%s\n' "docs/agents/ROLE_CONTENT_DEV.md" ;;
    media) printf '%s\n' "docs/agents/ROLE_MEDIA_DEV.md" ;;
    qa) printf '%s\n' "docs/agents/ROLE_QA.md" ;;
    review) printf '%s\n' "docs/agents/ROLE_REVIEWER.md" ;;
    *) return 1 ;;
  esac
}

role_tool() {
  case "$1" in
    review) printf '%s\n' "claude" ;;
    *) printf '%s\n' "codex" ;;
  esac
}

ensure_worktree() {
  local role="$1"
  local dir
  dir="$(role_dir "$role")"
  if [[ "$role" == "controller" || -d "$dir" ]]; then
    return 0
  fi

  local create_role="$role"
  [[ "$role" == "content" ]] && create_role="content-dev"
  [[ "$role" == "media" ]] && create_role="media-dev"

  if [[ "$dry_run" -eq 1 ]]; then
    echo "Would create worktree: ${create_role}"
  else
    bash "${repo_root}/scripts/create_agent_worktree.sh" "$create_role"
  fi
}

sync_to_main_if_clean() {
  local role="$1"
  local dir
  dir="$(role_dir "$role")"
  [[ "$role" == "controller" ]] && return 0
  [[ "$sync_worktrees" -eq 1 ]] || return 0

  if [[ "$dry_run" -eq 1 ]]; then
    echo "Would sync ${role} worktree to main if clean: ${dir}"
    return 0
  fi

  if [[ -n "$(git -C "$dir" status --porcelain)" ]]; then
    echo "Skip sync, worktree has local changes: ${dir}" >&2
    return 0
  fi

  git -C "$dir" merge --ff-only main >/dev/null
}

add_local_exclude() {
  local dir="$1"
  local exclude_file
  exclude_file="$(git -C "$dir" rev-parse --git-path info/exclude)"
  mkdir -p "$(dirname "$exclude_file")"
  touch "$exclude_file"
  for pattern in ".agent-role.md" ".agent-start.sh"; do
    if ! grep -qxF "$pattern" "$exclude_file"; then
      printf '\n%s\n' "$pattern" >> "$exclude_file"
    fi
  done
}

write_role_files() {
  local role="$1"
  local dir title doc branch tool
  dir="$(role_dir "$role")"
  title="$(role_title "$role")"
  doc="$(role_doc "$role")"
  branch="$(role_branch "$role")"
  tool="$(role_tool "$role")"

  if [[ "$dry_run" -eq 1 ]]; then
    echo "Would write ${dir}/.agent-role.md and .agent-start.sh"
    return 0
  fi

  add_local_exclude "$dir"

  cat > "${dir}/.agent-role.md" <<EOF
# Local Agent Role: ${title}

你是本项目的「${title}」。

当前工作区:
- path: ${dir}
- branch: ${branch}

开工前读取:
- AGENTS.md 或 CLAUDE.md
- docs/MULTI_AGENT_WORKFLOW.md
- ${doc}
- docs/AGENT_BOARD.md

默认规则:
- 先确认 pwd / branch / git status.
- 严格按本角色文件范围工作.
- 副 Agent 不改 docs/PROGRESS.md.
- 没有证据不要说"完成".

老板短口令:
- "领 T-XXX" = 去 docs/AGENT_BOARD.md 找任务并按角色开工.
- "测一下" = QA 按 ROLE_QA 做真实测试.
- "审一下" = 审查 Agent 只读审查, 不改代码.
- "汇总一下" = 总控读取报告并决定合并或返工.
EOF

  if [[ "$tool" == "claude" ]]; then
    cat > "${dir}/.agent-start.sh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
exec claude "$(cat .agent-role.md)"
EOF
  else
    cat > "${dir}/.agent-start.sh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
exec codex --cd "$PWD" "$(cat .agent-role.md)"
EOF
  fi
  chmod +x "${dir}/.agent-start.sh"
}

tmux_window() {
  local role="$1"
  case "$role" in
    controller) printf '%s\n' "controller" ;;
    content) printf '%s\n' "content-dev" ;;
    media) printf '%s\n' "media-dev" ;;
    qa) printf '%s\n' "qa" ;;
    review) printf '%s\n' "review" ;;
    *) return 1 ;;
  esac
}

prepare_window_command() {
  local role="$1"
  if [[ "$launch" -eq 1 ]]; then
    printf './.agent-start.sh\n'
  else
    cat <<EOF
clear
cat .agent-role.md
echo
echo "本窗口已准备好。启动本角色: ./.agent-start.sh"
echo "查看所有窗口: tmux -S '${socket}' list-windows -t '${session}'"
EOF
  fi
}

roles=(controller content media qa review)

echo "Repo:    ${repo_root}"
echo "Session: ${session}"
echo "Socket:  ${socket}"
echo "Launch:  ${launch}"
echo

for role in "${roles[@]}"; do
  ensure_worktree "$role"
  sync_to_main_if_clean "$role"
  write_role_files "$role"
done

if [[ "$dry_run" -eq 1 ]]; then
  echo
  echo "Dry run only. No tmux session created."
  exit 0
fi

mkdir -p "$(dirname "$socket")"

if tmux -S "$socket" has-session -t "$session" 2>/dev/null; then
  if [[ "$reset" -eq 1 ]]; then
    tmux -S "$socket" kill-session -t "$session"
  else
    cat <<EOF
tmux session already exists: ${session}

Attach:
  tmux -S '${socket}' attach -t '${session}'

Or reset it:
  bash scripts/start_multi_agents_tmux.sh --reset
EOF
    exit 0
  fi
fi

first=1
for role in "${roles[@]}"; do
  dir="$(role_dir "$role")"
  window="$(tmux_window "$role")"
  if [[ "$first" -eq 1 ]]; then
    tmux -S "$socket" new-session -d -s "$session" -n "$window" -c "$dir"
    first=0
  else
    tmux -S "$socket" new-window -t "$session" -n "$window" -c "$dir"
  fi
  prepare_window_command "$role" | tmux -S "$socket" load-buffer -
  tmux -S "$socket" paste-buffer -t "${session}:${window}.0"
  tmux -S "$socket" send-keys -t "${session}:${window}.0" Enter
done

cat <<EOF

Done. 5 个 Agent 窗口已准备好。

Attach:
  tmux -S '${socket}' attach -t '${session}'

Windows:
  controller  总控 Agent
  content-dev 内容开发 Agent
  media-dev   媒体开发 Agent
  qa          QA 测试 Agent
  review      审查 Agent

常用:
  tmux -S '${socket}' list-windows -t '${session}'
  tmux -S '${socket}' kill-session -t '${session}'
EOF
