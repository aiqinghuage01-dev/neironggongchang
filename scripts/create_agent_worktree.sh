#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  bash scripts/create_agent_worktree.sh <role> [task-slug] [--base <branch>] [--root <dir>] [--dry-run]

Roles:
  content-dev   内容开发 Agent
  media-dev     媒体开发 Agent
  qa            QA 测试 Agent
  review        审查 Agent
  platform-dev  平台开发 Agent (需要总控明确授权)

Examples:
  bash scripts/create_agent_worktree.sh content-dev
  bash scripts/create_agent_worktree.sh media-dev dhv5-works
  bash scripts/create_agent_worktree.sh qa hotrewrite-regression --dry-run

Default:
  base branch: main
  root dir:    ~/Desktop/nrg-worktrees
USAGE
}

role=""
task_slug=""
base_branch="main"
root_dir="${HOME}/Desktop/nrg-worktrees"
dry_run=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help)
      usage
      exit 0
      ;;
    --base)
      base_branch="${2:?--base requires a branch}"
      shift 2
      ;;
    --root)
      root_dir="${2:?--root requires a directory}"
      shift 2
      ;;
    --dry-run)
      dry_run=1
      shift
      ;;
    -*)
      echo "Unknown option: $1" >&2
      usage
      exit 2
      ;;
    *)
      if [[ -z "$role" ]]; then
        role="$1"
      elif [[ -z "$task_slug" ]]; then
        task_slug="$1"
      else
        echo "Unexpected argument: $1" >&2
        usage
        exit 2
      fi
      shift
      ;;
  esac
done

if [[ -z "$role" ]]; then
  usage
  exit 2
fi

case "$role" in
  content-dev|media-dev|qa|review|platform-dev)
    ;;
  *)
    echo "Unknown role: $role" >&2
    usage
    exit 2
    ;;
esac

if [[ -z "$task_slug" ]]; then
  task_slug="$role"
fi

safe_slug="$(printf '%s' "$task_slug" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9._-]+/-/g; s/^-+//; s/-+$//')"
if [[ -z "$safe_slug" ]]; then
  echo "Task slug becomes empty after sanitizing: $task_slug" >&2
  exit 2
fi

repo_root="$(git rev-parse --show-toplevel)"
worktree_path="${root_dir}/${safe_slug}"
branch="codex/${safe_slug}"

if git show-ref --verify --quiet "refs/heads/${branch}"; then
  echo "Branch already exists: ${branch}" >&2
  echo "Use a different task slug, or remove/reuse the existing branch intentionally." >&2
  exit 1
fi

if [[ -e "$worktree_path" ]]; then
  echo "Worktree path already exists: ${worktree_path}" >&2
  exit 1
fi

echo "Repo:       ${repo_root}"
echo "Role:       ${role}"
echo "Base:       ${base_branch}"
echo "Branch:     ${branch}"
echo "Worktree:   ${worktree_path}"

if [[ "$dry_run" -eq 1 ]]; then
  echo
  echo "Dry run only. Command that would run:"
  echo "mkdir -p '${root_dir}'"
  echo "git worktree add '${worktree_path}' -b '${branch}' '${base_branch}'"
  exit 0
fi

mkdir -p "$root_dir"
git worktree add "$worktree_path" -b "$branch" "$base_branch"

cat <<NEXT

Done.

Next:
  cd '${worktree_path}'
  git branch --show-current
  git status --short

Then read:
  AGENTS.md or CLAUDE.md
  docs/MULTI_AGENT_WORKFLOW.md
  docs/agents/ROLE_*.md matching this role
NEXT
