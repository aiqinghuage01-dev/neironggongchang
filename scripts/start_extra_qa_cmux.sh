#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  bash scripts/start_extra_qa_cmux.sh [count] [options]

Options:
  --prepare-only          Only create/sync QA worktrees; do not open cmux.
  --force-open-fallback   If cmux CLI socket is unavailable, use macOS
                          'open -a cmux <dir>' anyway. This can create
                          extra blank windows on some cmux versions.
  --cmux <path>           cmux CLI path. Default: app bundled CLI.
  -h, --help              Show this help.

Examples:
  bash scripts/start_extra_qa_cmux.sh      # prepares qa-1, qa-2, qa-3
  bash scripts/start_extra_qa_cmux.sh 2    # prepares qa-1, qa-2
USAGE
}

count="3"
count_set=0
open_workspaces=1
force_open_fallback=0
cmux_cli="/Applications/cmux.app/Contents/Resources/bin/cmux"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --prepare-only)
      open_workspaces=0
      shift
      ;;
    --force-open-fallback)
      force_open_fallback=1
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
      if [[ "$1" =~ ^[0-9]+$ && "$count_set" -eq 0 ]]; then
        count="$1"
        count_set=1
        shift
      else
        echo "Unknown option: $1" >&2
        usage
        exit 2
      fi
      ;;
  esac
done

if ! [[ "$count" =~ ^[0-9]+$ ]] || [[ "$count" -lt 1 || "$count" -gt 5 ]]; then
  echo "count must be an integer from 1 to 5" >&2
  usage
  exit 2
fi

repo_root="$(git rev-parse --show-toplevel)"
worktree_root="${HOME}/Desktop/nrg-worktrees"
codex_model="${CODEX_MODEL:-gpt-5.5}"
codex_effort="${CODEX_REASONING_EFFORT:-xhigh}"
codex_sandbox="${CODEX_SANDBOX:-danger-full-access}"
codex_approval="${CODEX_APPROVAL_POLICY:-never}"
codex_search="${CODEX_SEARCH:-1}"

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

ensure_worktree() {
  local slug="$1"
  local dir="${worktree_root}/${slug}"
  local branch="codex/${slug}"

  if [[ -d "$dir" ]]; then
    return 0
  fi

  if git show-ref --verify --quiet "refs/heads/${branch}"; then
    echo "Branch exists but worktree is missing: ${branch}" >&2
    echo "Please repair manually before using ${slug}." >&2
    exit 1
  fi

  mkdir -p "$worktree_root"
  git worktree add "$dir" -b "$branch" main >/dev/null
}

sync_to_main_if_clean() {
  local dir="$1"
  if [[ -n "$(git -C "$dir" status --porcelain)" ]]; then
    echo "Skip sync, worktree has local changes: ${dir}" >&2
    return 0
  fi
  git -C "$dir" merge --ff-only main >/dev/null
}

write_role_files() {
  local slug="$1"
  local dir="${worktree_root}/${slug}"
  local title="QA 测试 Agent ${slug#qa-}"
  local codex_search_arg=""
  if [[ "$codex_search" == "1" || "$codex_search" == "true" || "$codex_search" == "yes" ]]; then
    codex_search_arg="--search"
  fi

  add_local_exclude "$dir"

  cat > "${dir}/.agent-role.md" <<EOF
# Local Agent Role: ${title}

你是本项目的「${title}」。

当前工作区:
- path: ${dir}
- branch: codex/${slug}

开工前读取:
- AGENTS.md 或 CLAUDE.md
- docs/MULTI_AGENT_WORKFLOW.md
- docs/agents/ROLE_QA.md
- docs/AGENT_BOARD.md

默认规则:
- 只做测试和问题记录, 不改业务代码.
- 先确认 pwd / branch / git status.
- 真点页面、真填内容、真看结果.
- 默认允许最小 credits 真烧闭环, 但不要重复烧.
- 没有截图、console/pageerror、curl/pytest/task id 证据, 不要说"通过".
- 完成后把报告写到 docs/agent-handoff/ 并 commit.
- 不让老板复制粘贴报告全文; 总控通过收件箱读取.

老板短口令:
- "测数字人" = 数字人最小 3-5 秒真烧测试.
- "测生图" = 生图 1 张最低规格真烧测试.
- "测公众号" = 测到 HTML 预览; 推送草稿前必须问总控.
- "复测 T-XXX" = 只复测指定问题.
EOF

  cat > "${dir}/.agent-start.sh" <<EOF
#!/usr/bin/env bash
set -euo pipefail
cd "\$(dirname "\$0")"
printf '\033]0;%s\007' "NRG QA ${slug#qa-}"
exec codex --cd "\$PWD" --model "${codex_model}" --sandbox "${codex_sandbox}" --ask-for-approval "${codex_approval}" ${codex_search_arg} -c "model_reasoning_effort=\"${codex_effort}\"" "\$(cat .agent-role.md)"
EOF
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

ensure_cmux_ready() {
  [[ "$open_workspaces" -eq 1 ]] || return 1
  [[ -x "$cmux_cli" ]] || return 1

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
    if (count of windows) is 0 then error "no windows"
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

workspace_command() {
  printf '%s\n' 'clear; cat .agent-role.md; echo; echo "本 QA workspace 已准备好。启动: 开工"; echo "备用: ./start 或 ./开工"'
}

echo "Preparing ${count} extra QA workspaces..."

cmux_ready=0
if [[ "$open_workspaces" -eq 1 ]]; then
  if ensure_cmux_ready; then
    cmux_ready=1
  elif [[ "$force_open_fallback" -eq 1 ]]; then
    echo "cmux CLI socket is unavailable; force-opening with macOS open fallback." >&2
    echo "If cmux creates blank extra windows, rerun without --force-open-fallback." >&2
  else
    open_workspaces=0
    echo "cmux CLI socket is unavailable, so this script will prepare QA worktrees only." >&2
    echo "This avoids the duplicate blank-window issue from macOS open fallback." >&2
  fi
fi

for i in $(seq 1 "$count"); do
  slug="qa-${i}"
  dir="${worktree_root}/${slug}"
  ensure_worktree "$slug"
  sync_to_main_if_clean "$dir"
  write_role_files "$slug"

  if [[ "$open_workspaces" -eq 1 ]]; then
    if cmux_has_workspace_for_dir "$dir"; then
      echo "Skip existing cmux QA workspace: ${slug} (${dir})"
    elif [[ "$cmux_ready" -eq 1 ]]; then
      "$cmux_cli" new-workspace \
        --name "NRG QA ${i}" \
        --description "QA 测试 Agent ${i} · codex/${slug}" \
        --cwd "$dir" \
        --command "$(workspace_command)" >/dev/null
    else
      open -a cmux "$dir"
      sleep 0.2
    fi
  fi
done

cat <<EOF

Done. Extra QA workspaces are prepared.

In each QA workspace, type:
  开工

Suggested split:
  qa-1: 数字人 3-5 秒最小真烧
  qa-2: 生图 1 张最低规格
  qa-3: 公众号 HTML 预览 / 作品库回归
EOF
