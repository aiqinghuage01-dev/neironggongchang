#!/usr/bin/env bash
# 启动 CosyVoice 2 sidecar 服务(独立 venv,监听 8766 端口)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COSY_DIR="$ROOT/vendor/CosyVoice"
VENV="$COSY_DIR/.venv"
MODEL_DIR="$HOME/.cache/cosyvoice2/iic/CosyVoice2-0___5B"

if [ ! -x "$VENV/bin/python" ]; then
    echo "❌ CosyVoice 独立 venv 不存在。请先运行: bash scripts/setup_cosyvoice.sh"
    exit 1
fi

if [ ! -f "$MODEL_DIR/flow.pt" ]; then
    echo "❌ CosyVoice 模型未下载。请先运行: bash scripts/setup_cosyvoice.sh"
    exit 1
fi

# 避免端口冲突
if lsof -Pi :8766 -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo "⚠️  端口 8766 已占用(可能 sidecar 已在运行)。"
    echo "    检查: curl http://127.0.0.1:8766/health"
    exit 0
fi

cd "$COSY_DIR"
source "$VENV/bin/activate"
export PYTORCH_ENABLE_MPS_FALLBACK=1

echo "🚀 启动 CosyVoice sidecar  on :8766  model=$MODEL_DIR"
exec python sv_server.py --port 8766 --model-dir "$MODEL_DIR"
