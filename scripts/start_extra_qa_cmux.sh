#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  bash scripts/start_extra_qa_cmux.sh [count]

Examples:
  bash scripts/start_extra_qa_cmux.sh      # opens qa-1, qa-2, qa-3
  bash scripts/start_extra_qa_cmux.sh 2    # opens qa-1, qa-2
USAGE
}

count="${1:-3}"
case "$count" in
  -h|--help)
    usage
    exit 0
    ;;
esac

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

echo "Opening ${count} extra QA workspaces..."

for i in $(seq 1 "$count"); do
  slug="qa-${i}"
  dir="${worktree_root}/${slug}"
  ensure_worktree "$slug"
  sync_to_main_if_clean "$dir"
  write_role_files "$slug"
  open -a cmux "$dir"
done

cat <<EOF

Done. Extra QA workspaces are open or requested in cmux.

In each QA workspace, type:
  开工

Suggested split:
  qa-1: 数字人 3-5 秒最小真烧
  qa-2: 生图 1 张最低规格
  qa-3: 公众号 HTML 预览 / 作品库回归
EOF
