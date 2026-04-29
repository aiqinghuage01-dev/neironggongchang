#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  bash scripts/start_multi_agents_cmux.sh [options]

Options:
  --launch          Start codex/claude in each cmux workspace.
                    Default only opens workspaces and shows role files.
  --no-sync         Do not fast-forward agent worktrees to main.
  --dry-run         Print planned actions without creating cmux workspaces.
  --cmux <path>     cmux CLI path. Default: app bundled CLI.
  -h, --help        Show this help.

Examples:
  bash scripts/start_multi_agents_cmux.sh
  bash scripts/start_multi_agents_cmux.sh --launch
  bash scripts/start_multi_agents_cmux.sh --dry-run
USAGE
}

launch=0
sync_worktrees=1
dry_run=0
cmux_cli="/Applications/cmux.app/Contents/Resources/bin/cmux"
codex_model="${CODEX_MODEL:-gpt-5.5}"
codex_effort="${CODEX_REASONING_EFFORT:-xhigh}"
claude_model="${CLAUDE_MODEL:-opus4.7}"
claude_effort="${CLAUDE_EFFORT:-max}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --launch)
      launch=1
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
    --cmux)
      cmux_cli="${2:?--cmux requires a path}"
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

if [[ ! -x "$cmux_cli" ]]; then
  echo "cmux CLI not found or not executable: ${cmux_cli}" >&2
  echo "Expected bundled CLI at /Applications/cmux.app/Contents/Resources/bin/cmux" >&2
  exit 1
fi

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

role_create_arg() {
  case "$1" in
    content) printf '%s\n' "content-dev" ;;
    media) printf '%s\n' "media-dev" ;;
    qa) printf '%s\n' "qa" ;;
    review) printf '%s\n' "review" ;;
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

workspace_name() {
  case "$1" in
    controller) printf '%s\n' "NRG 总控" ;;
    content) printf '%s\n' "NRG 内容开发" ;;
    media) printf '%s\n' "NRG 媒体开发" ;;
    qa) printf '%s\n' "NRG QA 测试" ;;
    review) printf '%s\n' "NRG Claude 审查" ;;
    *) return 1 ;;
  esac
}

ensure_worktree() {
  local role="$1"
  local dir
  dir="$(role_dir "$role")"
  if [[ "$role" == "controller" || -d "$dir" ]]; then
    return 0
  fi

  local create_role
  create_role="$(role_create_arg "$role")"
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
    cat > "${dir}/.agent-start.sh" <<EOF
#!/usr/bin/env bash
set -euo pipefail
cd "\$(dirname "\$0")"
exec claude --model "${claude_model}" --effort "${claude_effort}" "\$(cat .agent-role.md)"
EOF
  else
    cat > "${dir}/.agent-start.sh" <<EOF
#!/usr/bin/env bash
set -euo pipefail
cd "\$(dirname "\$0")"
exec codex --cd "\$PWD" --model "${codex_model}" -c "model_reasoning_effort=\"${codex_effort}\"" "\$(cat .agent-role.md)"
EOF
  fi
  chmod +x "${dir}/.agent-start.sh"
}

workspace_command() {
  if [[ "$launch" -eq 1 ]]; then
    printf './.agent-start.sh'
  else
    printf 'clear; cat .agent-role.md; echo; echo "本 cmux workspace 已准备好。启动本角色: ./.agent-start.sh"'
  fi
}

ensure_cmux_ready() {
  if [[ "$dry_run" -eq 1 ]]; then
    echo "Would open cmux app and wait for socket."
    return 0
  fi

  open -a cmux >/dev/null 2>&1 || true

  local i
  for i in {1..20}; do
    if "$cmux_cli" ping >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.5
  done

  echo "cmux CLI did not become ready. Open cmux manually, then rerun this script." >&2
  echo "CLI path: ${cmux_cli}" >&2
  exit 1
}

roles=(controller content media qa review)

echo "Repo:   ${repo_root}"
echo "cmux:   ${cmux_cli}"
echo "Launch: ${launch}"
echo "Codex:  ${codex_model} / effort=${codex_effort}"
echo "Claude: ${claude_model} / effort=${claude_effort}"
echo

for role in "${roles[@]}"; do
  ensure_worktree "$role"
  sync_to_main_if_clean "$role"
  write_role_files "$role"
done

ensure_cmux_ready

for role in "${roles[@]}"; do
  dir="$(role_dir "$role")"
  name="$(workspace_name "$role")"
  command="$(workspace_command)"

  if [[ "$dry_run" -eq 1 ]]; then
    echo "Would create cmux workspace: ${name}"
    echo "  cwd:     ${dir}"
    echo "  command: ${command}"
    continue
  fi

  "$cmux_cli" new-workspace \
    --name "$name" \
    --description "$(role_title "$role") · $(role_branch "$role")" \
    --cwd "$dir" \
    --command "$command" >/dev/null
done

if [[ "$dry_run" -eq 1 ]]; then
  echo
  echo "Dry run only. No cmux workspace created."
  exit 0
fi

cat <<EOF

Done. 5 个 cmux workspace 已创建。

默认模式只展示角色说明:
  在某个 workspace 里输入 ./.agent-start.sh 启动该 Agent.

下次要直接启动模型:
  bash scripts/start_multi_agents_cmux.sh --launch
EOF
