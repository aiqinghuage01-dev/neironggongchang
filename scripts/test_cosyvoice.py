"""CosyVoice 2 端到端测试 - 用户视频抽的声音样本克隆一段新文字.

前提:
  1. bash scripts/setup_cosyvoice.sh  # 装依赖 + 下模型
  2. bash scripts/start_cosyvoice.sh  # sidecar 在 8766 端口常驻

Run: python scripts/test_cosyvoice.py
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from shortvideo.cosyvoice import CosyVoiceLocal, CosyVoiceNotReady
from shortvideo.config import AUDIO_DIR


def main():
    cli = CosyVoiceLocal()
    print("=" * 70)
    print("CosyVoice 2 端到端测试")
    print("=" * 70)
    print(f"venv ready:     {cli.venv_ready()}")
    print(f"model present:  {cli.model_files_present()}  path={cli.model_dir}")
    print(f"sidecar alive:  {cli._sidecar_alive()}")
    if not cli.is_ready():
        raise CosyVoiceNotReady("not ready")

    ref = AUDIO_DIR / "samples" / "voice_ref_15s.wav"
    out = AUDIO_DIR / "generated" / "cosyvoice_test_output.wav"
    texts = [
        "你好,这是一段用我的声音克隆出来的测试音频,用于验证本地声音克隆链路。",
    ]
    for i, text in enumerate(texts, 1):
        print(f"\n[{i}/{len(texts)}] 合成: {text[:30]}...")
        res = cli.clone(text=text, reference_wav=ref, output_path=out)
        print(f"  ✅ {res.audio_path.name}")
        print(f"     duration={res.duration_sec}s  sr={res.sample_rate}  elapsed={res.elapsed_sec}s")


if __name__ == "__main__":
    main()
