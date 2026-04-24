#!/usr/bin/env bash
# 启动静态 web 服务 :8001
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT/web"

if lsof -Pi :8001 -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo "⚠️  端口 8001 已占用"
    exit 0
fi

echo "🌐 静态服务 on :8001 · http://localhost:8001/"
exec python3 -m http.server 8001
