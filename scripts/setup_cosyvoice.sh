#!/usr/bin/env bash
# CosyVoice 2 本地声音克隆安装脚本(Apple Silicon)
# 用法: bash scripts/setup_cosyvoice.sh
#
# 会做:
#   1. 克隆 CosyVoice 仓库到 vendor/CosyVoice
#   2. 初始化子模块(Matcha-TTS 等)
#   3. 下载 CosyVoice2-0.5B 模型到 ~/.cache/cosyvoice2
#   4. 装依赖到当前 .venv
#
# 注意: 首次约 2-3 GB 下载,需耐心等待。
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

VENDOR="$ROOT/vendor"
COSY_DIR="$VENDOR/CosyVoice"
MODEL_DIR="$HOME/.cache/cosyvoice2"

mkdir -p "$VENDOR" "$MODEL_DIR"

echo "════════════════════════════════════════════════════════"
echo "  CosyVoice 2 · 本地声音克隆安装"
echo "════════════════════════════════════════════════════════"

# 1. 激活 venv
if [ ! -d ".venv" ]; then
    echo "❌ 找不到 .venv,请先跑 bash scripts/setup.sh"
    exit 1
fi
source .venv/bin/activate

# 2. 克隆仓库
if [ ! -d "$COSY_DIR" ]; then
    echo "📥 克隆 CosyVoice 仓库..."
    git clone --recursive https://github.com/FunAudioLLM/CosyVoice.git "$COSY_DIR"
else
    echo "✓ CosyVoice 仓库已存在,跳过克隆"
    (cd "$COSY_DIR" && git submodule update --init --recursive)
fi

# 3. 建 venv
cd "$COSY_DIR"
if [ ! -d ".venv" ]; then
    echo "🔧 创建 Python 3.12 venv..."
    uv venv --python 3.12 .venv
fi
source .venv/bin/activate

# 4. 装依赖(挑最小集,避开 tensorrt / deepspeed 等 Linux-only 组件)
echo "📦 安装 Python 依赖..."

# 关键:先用 ensurepip 装出 pip,再降级 setuptools 到 68.x(新版 setuptools 没 pkg_resources)
VENV_PY="$COSY_DIR/.venv/bin/python"
"$VENV_PY" -m ensurepip --upgrade 2>/dev/null || true
"$VENV_PY" -m pip install --force-reinstall 'setuptools==68.2.2' wheel

# 用 uv 装重头的(torch 等)
uv pip install \
    torch==2.3.1 torchaudio==2.3.1 numpy==1.26.4 \
    librosa soundfile omegaconf hyperpyyaml \
    modelscope onnxruntime conformer diffusers gdown \
    x-transformers lightning matplotlib inflect pyworld \
    transformers==4.51.3 hydra-core HyperPyYAML \
    rich wget gradio typeguard pyyaml tensorboard tiktoken \
    pyarrow protobuf networkx \
    "fastapi>=0.115" "uvicorn[standard]" pydantic

# 这几个 pip 构建时需要 pkg_resources,用 venv 的 pip 装(有 pkg_resources)
"$VENV_PY" -m pip install openai-whisper wetext grpcio==1.57.0 grpcio-tools==1.57.0

# 4. 下载模型(优先 ModelScope 国内镜像)
if [ ! -f "$MODEL_DIR/flow.pt" ]; then
    echo "📥 下载 CosyVoice2-0.5B 模型到 $MODEL_DIR..."
    python - <<PYEOF
from modelscope import snapshot_download
snapshot_download(
    'iic/CosyVoice2-0.5B',
    cache_dir="$MODEL_DIR".rsplit('/', 1)[0],
    local_dir="$MODEL_DIR",
)
PYEOF
else
    echo "✓ 模型已存在,跳过下载"
fi

# 5. 验证
echo "🔍 验证安装..."
python - <<PYEOF
import sys
sys.path.insert(0, "$COSY_DIR")
sys.path.insert(0, "$COSY_DIR/third_party/Matcha-TTS")
try:
    from cosyvoice.cli.cosyvoice import CosyVoice2
    print("✅ CosyVoice2 import OK")
    import torch
    print(f"✅ torch {torch.__version__}  MPS available: {torch.backends.mps.is_available()}")
except Exception as e:
    print(f"❌ import failed: {e}")
    sys.exit(1)
PYEOF

echo ""
echo "✅ CosyVoice 2 安装完成。"
echo "   模型路径:$MODEL_DIR"
echo "   仓库路径:$COSY_DIR"
echo "   推理代码:shortvideo/cosyvoice.py 里 CosyVoiceLocal.clone()"
