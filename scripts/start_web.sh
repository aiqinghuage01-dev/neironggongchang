#!/usr/bin/env bash
# 启动静态 web 服务 :8001 (no-cache 默认, 避免 JSX 改了浏览器拿老版本)
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if lsof -Pi :8001 -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo "⚠️  端口 8001 已占用"
    exit 0
fi

echo "🌐 静态服务 on :8001 (no-cache) · http://localhost:8001/"
exec python3 scripts/start_web_nocache.py 8001
