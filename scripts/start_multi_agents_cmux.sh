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
  --no-open-fallback
                    If cmux CLI socket is unavailable, fail instead of using
                    macOS 'open -a cmux <dir>' fallback.
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
open_fallback=1
cmux_cli="/Applications/cmux.app/Contents/Resources/bin/cmux"
codex_model="${CODEX_MODEL:-gpt-5.5}"
codex_effort="${CODEX_REASONING_EFFORT:-xhigh}"
codex_sandbox="${CODEX_SANDBOX:-danger-full-access}"
codex_approval="${CODEX_APPROVAL_POLICY:-never}"
codex_search="${CODEX_SEARCH:-1}"
claude_model="${CLAUDE_MODEL:-opus}"
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
    --no-open-fallback)
      open_fallback=0
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

role_queue_role() {
  case "$1" in
    controller) printf '%s\n' "controller" ;;
    content) printf '%s\n' "content" ;;
    media) printf '%s\n' "media" ;;
    qa) printf '%s\n' "qa" ;;
    review) printf '%s\n' "review" ;;
    *) return 1 ;;
  esac
}

agent_display_name() {
  case "$1" in
    controller) printf '%s\n' "NRG 总控" ;;
    content) printf '%s\n' "NRG 内容开发" ;;
    media) printf '%s\n' "NRG 媒体开发" ;;
    qa) printf '%s\n' "NRG QA 测试" ;;
    review) printf '%s\n' "NRG Claude 审查" ;;
    *) return 1 ;;
  esac
}

workspace_name() {
  agent_display_name "$1"
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
  for pattern in ".agent-role.md" ".agent-start.sh" "start" "开工"; do
    if ! grep -qxF "$pattern" "$exclude_file"; then
      printf '\n%s\n' "$pattern" >> "$exclude_file"
    fi
  done
}

install_global_shortcut() {
  local bin_dir="${HOME}/.local/bin"
  local shortcut="${bin_dir}/开工"

  if [[ "$dry_run" -eq 1 ]]; then
    echo "Would install global shortcut: ${shortcut}"
    return 0
  fi

  mkdir -p "$bin_dir"
  cat > "$shortcut" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

if [[ -x "./.agent-start.sh" ]]; then
  exec "./.agent-start.sh"
fi

if [[ -x "./start" ]]; then
  exec "./start"
fi

echo "这里不是 Agent 工作区。请先点 cmux 左侧的某个 Agent 工作区, 再输入: 开工" >&2
exit 1
EOF
  chmod +x "$shortcut"
}

write_role_files() {
  local role="$1"
  local dir title doc branch tool display_name queue_role codex_search_arg
  dir="$(role_dir "$role")"
  title="$(role_title "$role")"
  doc="$(role_doc "$role")"
  branch="$(role_branch "$role")"
  tool="$(role_tool "$role")"
  display_name="$(agent_display_name "$role")"
  queue_role="$(role_queue_role "$role")"
  codex_search_arg=""
  if [[ "$codex_search" == "1" || "$codex_search" == "true" || "$codex_search" == "yes" ]]; then
    codex_search_arg="--search"
  fi

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
- 完成后把报告写到 docs/agent-handoff/ 并 commit.
- 不让老板复制粘贴报告全文; 总控通过收件箱读取.
- 启动后先领共享任务队列, 不等老板手工派:
  python3 "${repo_root}/scripts/agent_queue.py" claim --role ${queue_role} --agent "${display_name}" --format prompt
- 领到任务就执行; 完成后用 agent_queue.py done/block 更新状态; 然后继续 claim 下一条.

老板短口令:
- "领 T-XXX" = 去 docs/AGENT_BOARD.md 找任务并按角色开工.
- "测一下" = QA 按 ROLE_QA 做真实测试.
- "审一下" = 审查 Agent 只读审查, 不改代码.
- "汇总一下" / 收件箱 = 总控运行 python3 scripts/agent_inbox.py --hours 24, 自己读取报告并决定合并或返工.
EOF

  if [[ "$tool" == "claude" ]]; then
    cat > "${dir}/.agent-start.sh" <<EOF
#!/usr/bin/env bash
set -euo pipefail
cd "\$(dirname "\$0")"
printf '\033]0;%s\007' "${display_name}"
exec claude --model "${claude_model}" --effort "${claude_effort}" "\$(cat .agent-role.md)"
EOF
  else
    cat > "${dir}/.agent-start.sh" <<EOF
#!/usr/bin/env bash
set -euo pipefail
cd "\$(dirname "\$0")"
printf '\033]0;%s\007' "${display_name}"
exec codex --cd "\$PWD" --model "${codex_model}" --sandbox "${codex_sandbox}" --ask-for-approval "${codex_approval}" ${codex_search_arg} -c "model_reasoning_effort=\"${codex_effort}\"" "\$(cat .agent-role.md)"
EOF
  fi
  chmod +x "${dir}/.agent-start.sh"

  cat > "${dir}/start" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
exec ./.agent-start.sh
EOF
  chmod +x "${dir}/start"

  cat > "${dir}/开工" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
exec ./.agent-start.sh
EOF
  chmod +x "${dir}/开工"
}

fallback_open_path() {
  local role="$1"
  local dir display_name alias_root alias_path
  dir="$(role_dir "$role")"
  display_name="$(agent_display_name "$role")"
  alias_root="${HOME}/Desktop/nrg-agent-workspaces"
  alias_path="${alias_root}/${display_name}"

  if [[ "$dry_run" -eq 1 ]]; then
    echo "$alias_path"
    return 0
  fi

  mkdir -p "$alias_root"
  if [[ -L "$alias_path" ]]; then
    rm "$alias_path"
  elif [[ -e "$alias_path" ]]; then
    echo "Fallback alias path exists and is not a symlink: ${alias_path}" >&2
    echo "$dir"
    return 0
  fi
  ln -s "$dir" "$alias_path"
  echo "$alias_path"
}

workspace_command() {
  if [[ "$launch" -eq 1 ]]; then
    printf '开工'
  else
    printf 'clear; cat .agent-role.md; echo; echo "本 cmux workspace 已准备好。启动本角色: 开工"; echo "备用: ./start 或 ./开工"'
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

  return 1
}

cmux_has_workspace_for_dir() {
  local dir="$1"
  osascript - "$dir" <<'OSA' >/dev/null 2>&1
on run argv
  set targetDir to item 1 of argv
  tell application "cmux"
    repeat with t in tabs of front window
      try
        set wd to working directory of focused terminal of t as text
        if wd is targetDir then return "yes"
      end try
    end repeat
  end tell
  error "not found"
end run
OSA
}

cleanup_cmux_default_home_workspace() {
  local dirs=()
  local role
  for role in "${roles[@]}"; do
    dirs+=("$(role_dir "$role")")
  done

  osascript - "${dirs[@]}" <<'OSA' >/dev/null 2>&1 || true
on run argv
  tell application "cmux"
    if (count of windows) is 0 then return

    set matched to 0
    repeat with t in tabs of front window
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
    if matched < 5 then return

    set homeDir1 to POSIX path of (path to home folder)
    if homeDir1 ends with "/" then
      set homeDir2 to text 1 thru -2 of homeDir1
    else
      set homeDir2 to homeDir1
    end if

    repeat with i from (count of tabs of front window) to 1 by -1
      set t to item i of tabs of front window
      set wd to ""
      try
        set wd to working directory of focused terminal of t as text
      end try
      if wd is homeDir1 or wd is homeDir2 then
        close tab t
      end if
    end repeat
  end tell
end run
OSA
}

cmux_has_all_target_workspaces() {
  local dirs=()
  local role
  for role in "${roles[@]}"; do
    dirs+=("$(role_dir "$role")")
  done

  osascript - "${dirs[@]}" <<'OSA' >/dev/null 2>&1
on run argv
  tell application "cmux"
    if (count of windows) is 0 then error "no windows"
    set matched to 0
    repeat with t in tabs of front window
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
    if matched < 5 then error "missing target workspaces"
  end tell
end run
OSA
}

cleanup_cmux_extra_app_windows() {
  [[ "$dry_run" -eq 1 ]] && return 0
  cmux_has_all_target_workspaces || return 0

  osascript <<'OSA' >/dev/null 2>&1 || true
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
      delay 0.2
    end repeat
  end tell
end tell
OSA
}

roles=(controller content media qa review)

echo "Repo:   ${repo_root}"
echo "cmux:   ${cmux_cli}"
echo "Launch: ${launch}"
echo "Codex:  ${codex_model} / effort=${codex_effort}"
echo "Access: sandbox=${codex_sandbox} / approval=${codex_approval} / search=${codex_search}"
echo "Claude: ${claude_model} / effort=${claude_effort}"
echo

install_global_shortcut

for role in "${roles[@]}"; do
  ensure_worktree "$role"
  sync_to_main_if_clean "$role"
  write_role_files "$role"
done

cmux_ready=0
if ensure_cmux_ready; then
  cmux_ready=1
elif [[ "$open_fallback" -eq 1 ]]; then
  echo "cmux CLI socket is unavailable; falling back to: open -a cmux <worktree>" >&2
  if [[ "$launch" -eq 1 ]]; then
    echo "--launch requires the cmux CLI socket. Fallback will only open workspaces." >&2
  fi
else
  echo "cmux CLI did not become ready. Open cmux manually, then rerun this script." >&2
  echo "CLI path: ${cmux_cli}" >&2
  exit 1
fi

for role in "${roles[@]}"; do
  dir="$(role_dir "$role")"
  name="$(workspace_name "$role")"
  command="$(workspace_command)"

  if [[ "$dry_run" -eq 1 ]]; then
    echo "Would create cmux workspace: ${name}"
    echo "  cwd:     ${dir}"
    echo "  command: ${command}"
    echo "  fallback: open -a cmux '$(fallback_open_path "$role")'"
    continue
  fi

  if cmux_has_workspace_for_dir "$dir"; then
    echo "Skip existing cmux workspace: ${name} (${dir})"
    continue
  fi

  if [[ "$cmux_ready" -eq 1 ]]; then
    "$cmux_cli" new-workspace \
      --name "$name" \
      --description "$(role_title "$role") · $(role_branch "$role")" \
      --cwd "$dir" \
      --command "$command" >/dev/null
  else
    open -a cmux "$(fallback_open_path "$role")"
    sleep 0.2
  fi
done

if [[ "$dry_run" -eq 1 ]]; then
  echo
  echo "Dry run only. No cmux workspace created."
  exit 0
fi

sleep 0.5
cleanup_cmux_default_home_workspace
cleanup_cmux_extra_app_windows

cat <<EOF

Done. 5 个 cmux workspace 已创建或已请求打开。

默认模式只展示角色说明:
  在某个 workspace 里输入 开工 启动该 Agent.
  备用命令: ./start 或 ./开工

下次要直接启动模型:
  bash scripts/start_multi_agents_cmux.sh --launch
EOF
