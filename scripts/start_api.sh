#!/usr/bin/env bash
# 启动 FastAPI backend :8000
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [ ! -d ".venv" ]; then
    echo "❌ 没有 .venv,请先 bash scripts/setup.sh"
    exit 1
fi

if lsof -Pi :8000 -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo "⚠️  端口 8000 已占用,先 kill -9 \$(lsof -ti:8000) 再启动"
    exit 0
fi

exec .venv/bin/uvicorn backend.api:app --host 127.0.0.1 --port 8000 --log-level info
