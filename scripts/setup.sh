#!/usr/bin/env bash
# 首次安装脚本 - 装依赖 + 跑 smoke test
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "📂 Project root: $ROOT"

# 1. uv 检查
if ! command -v uv &> /dev/null; then
    echo "🔧 安装 uv..."
    curl -LsSf https://astral.sh/uv/install.sh | sh
    export PATH="$HOME/.local/bin:$PATH"
fi

# 2. venv
if [ ! -d ".venv" ]; then
    echo "🔧 创建 Python 3.12 虚拟环境..."
    uv venv --python 3.12 .venv
fi

# 3. 依赖
echo "📦 安装 Python 依赖..."
source .venv/bin/activate
uv pip install -r requirements.txt

# 4. ffmpeg 检查
if ! command -v ffmpeg &> /dev/null; then
    echo "⚠️  未找到 ffmpeg。请先用 Homebrew 安装:"
    echo "    brew install ffmpeg"
    exit 1
fi

# 5. .env
if [ ! -f ".env" ]; then
    echo "📝 创建 .env 从模板..."
    cp .env.example .env
    echo "⚠️  请编辑 .env 填入真实的 API Key:"
    echo "    SHILIU_API_KEY   — 向石榴获取:https://shiliu.chat"
    echo "    DEEPSEEK_API_KEY — 在 https://platform.deepseek.com 创建"
    exit 0
fi

# 6. Smoke test
echo "🔍 运行 smoke test..."
python scripts/smoke_test.py

echo ""
echo "✅ 安装完成。启动 App:"
echo "    bash scripts/start.sh"
