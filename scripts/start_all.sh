#!/usr/bin/env bash
# 内容工厂 · 一键启动:FastAPI :8000 + 静态 Web :8001 + CosyVoice sidecar :8766
# 用法:bash scripts/start_all.sh

set -e
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

mkdir -p logs

echo "🏭  内容工厂 · 一键启动"
echo "    $ROOT"
echo ""

# 清理已占用端口
for p in 8000 8001 8766; do
  pid=$(lsof -ti:$p 2>/dev/null || true)
  if [ -n "$pid" ]; then
    echo "  ⚠️  端口 $p 被占用 (pid=$pid),先 kill"
    kill $pid 2>/dev/null || true
    sleep 0.3
  fi
done

# 起 FastAPI
echo "  ▶ 启动 FastAPI :8000"
nohup "$ROOT/.venv/bin/python" -m uvicorn backend.api:app --host 127.0.0.1 --port 8000 --log-level warning > logs/api.log 2>&1 &
API_PID=$!

# 起静态 web
echo "  ▶ 启动 Web :8001"
nohup python3 -m http.server 8001 -d "$ROOT/web" > logs/web.log 2>&1 &
WEB_PID=$!

# 起 CosyVoice sidecar(可选)
if [ -d "$ROOT/vendor/CosyVoice" ]; then
  echo "  ▶ 启动 CosyVoice :8766 (可选)"
  nohup bash "$ROOT/scripts/start_cosyvoice.sh" > logs/cosy.log 2>&1 &
  COSY_PID=$!
else
  echo "  · (跳过 CosyVoice,没有 vendor/CosyVoice)"
fi

# 等 API 起来
echo ""
echo "  等 FastAPI 起来..."
for i in 1 2 3 4 5 6 7 8; do
  if curl -s -f http://127.0.0.1:8000/api/health >/dev/null 2>&1; then
    echo "  ✅ FastAPI OK (http://127.0.0.1:8000)"
    break
  fi
  sleep 0.6
done

# 开浏览器
echo ""
echo "  🎉  打开浏览器 http://localhost:8001"
open http://localhost:8001

echo ""
echo "  查看日志:"
echo "    tail -f logs/api.log"
echo "    tail -f logs/web.log"
echo "    tail -f logs/cosy.log"
echo ""
echo "  停掉所有服务:"
echo "    bash scripts/stop_all.sh  (或 kill $API_PID $WEB_PID ${COSY_PID:-})"
