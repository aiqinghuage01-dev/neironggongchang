#!/usr/bin/env bash
# ShortVideo Studio 一键启动脚本
# 用法: bash scripts/start.sh
#
# 会做:
#   1. 检查 .venv 是否存在,没有就用 uv 创建
#   2. 检查依赖是否装全
#   3. 启动 Streamlit 在 http://localhost:8765
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "📂 Project root: $ROOT"

if [ ! -d ".venv" ]; then
    echo "🔧 创建 Python 3.12 虚拟环境..."
    if ! command -v uv &> /dev/null; then
        echo "❌ 未安装 uv。请先执行: curl -LsSf https://astral.sh/uv/install.sh | sh"
        exit 1
    fi
    uv venv --python 3.12 .venv
fi

# 检查 streamlit 是否装好
if [ ! -x ".venv/bin/streamlit" ]; then
    echo "📦 安装依赖..."
    source .venv/bin/activate
    uv pip install -r requirements.txt
fi

# .env 检查
if [ ! -f ".env" ]; then
    echo "⚠️  未找到 .env 文件。请先复制 .env.example 并填入 API key:"
    echo "    cp .env.example .env"
    echo "    然后编辑 .env 填入 SHILIU_API_KEY 和 DEEPSEEK_API_KEY"
    exit 1
fi

echo "🚀 启动 Streamlit..."
echo "   浏览器打开:http://localhost:8765"
exec .venv/bin/streamlit run app.py \
    --server.port 8765 \
    --server.headless false \
    --browser.gatherUsageStats false
