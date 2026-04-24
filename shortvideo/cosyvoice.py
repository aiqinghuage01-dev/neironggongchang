"""CosyVoice 2 本地声音克隆客户端.

架构:
  - vendor/CosyVoice/.venv  - 独立 venv,装 torch/cosyvoice/modelscope
  - vendor/CosyVoice/sv_server.py - FastAPI 常驻,模型只加载一次
  - 本文件 - 在主 venv 里,通过 HTTP 调远端 sidecar

这样主 venv 保持轻量,Streamlit 启动快,也避免 torch 和 streamlit 的依赖冲突。

启动 sidecar:
    bash scripts/start_cosyvoice.sh

然后主 App 里就能调 CosyVoiceLocal.clone(...).
"""
from __future__ import annotations

import subprocess
from dataclasses import dataclass
from pathlib import Path

import httpx

from .config import AUDIO_DIR, ROOT

SIDE_CAR_URL_DEFAULT = "http://127.0.0.1:8766"
COSY_DIR = ROOT / "vendor" / "CosyVoice"
COSY_VENV = COSY_DIR / ".venv"
MODEL_DIR_DEFAULT = Path.home() / ".cache" / "cosyvoice2" / "iic" / "CosyVoice2-0___5B"


class CosyVoiceNotReady(RuntimeError):
    pass


@dataclass
class CloneResult:
    audio_path: Path
    duration_sec: float
    sample_rate: int
    elapsed_sec: float


class CosyVoiceLocal:
    def __init__(
        self,
        sidecar_url: str = SIDE_CAR_URL_DEFAULT,
        model_dir: Path | str = MODEL_DIR_DEFAULT,
    ):
        self.sidecar_url = sidecar_url.rstrip("/")
        self.model_dir = Path(model_dir)
        self._client = httpx.Client(timeout=300.0)

    def _sidecar_alive(self) -> bool:
        try:
            r = self._client.get(f"{self.sidecar_url}/health", timeout=2.0)
            return r.status_code == 200 and r.json().get("ok") is True
        except httpx.HTTPError:
            return False

    def model_files_present(self) -> bool:
        need = ["flow.pt", "llm.pt", "hift.pt"]
        return all((self.model_dir / f).exists() for f in need)

    def venv_ready(self) -> bool:
        return (COSY_VENV / "bin" / "python").exists()

    def is_ready(self) -> bool:
        """全链路就绪:venv + 模型文件 + sidecar 可达"""
        return self.venv_ready() and self.model_files_present() and self._sidecar_alive()

    def clone(
        self,
        text: str,
        reference_wav: Path | str,
        output_path: Path | str | None = None,
        reference_text: str = "",
        speed: float = 1.0,
    ) -> CloneResult:
        if not self.venv_ready():
            raise CosyVoiceNotReady("CosyVoice 独立 venv 未创建,请先运行 scripts/setup_cosyvoice.sh")
        if not self.model_files_present():
            raise CosyVoiceNotReady(f"CosyVoice2-0.5B 模型未下载到 {self.model_dir}")
        if not self._sidecar_alive():
            raise CosyVoiceNotReady(
                "CosyVoice sidecar 未运行。在另一个终端:bash scripts/start_cosyvoice.sh"
            )

        if output_path is None:
            output_path = AUDIO_DIR / "generated" / f"cosy_{int(__import__('time').time())}.wav"
        output_path = Path(output_path).resolve()
        output_path.parent.mkdir(parents=True, exist_ok=True)

        r = self._client.post(
            f"{self.sidecar_url}/clone",
            json={
                "text": text,
                "reference_wav": str(Path(reference_wav).resolve()),
                "reference_text": reference_text,
                "output_path": str(output_path),
                "speed": speed,
            },
        )
        r.raise_for_status()
        d = r.json()
        return CloneResult(
            audio_path=Path(d["output_path"]),
            duration_sec=d["duration_sec"],
            sample_rate=d["sample_rate"],
            elapsed_sec=d["elapsed_sec"],
        )


def start_sidecar_if_absent() -> subprocess.Popen | None:
    """如果 sidecar 没起,就起一个子进程。主要供 Streamlit 启动时自动拉起。"""
    cli = CosyVoiceLocal()
    if cli._sidecar_alive():
        return None
    if not cli.venv_ready():
        return None
    py = COSY_VENV / "bin" / "python"
    server = COSY_DIR / "sv_server.py"
    proc = subprocess.Popen(
        [str(py), str(server)],
        cwd=str(COSY_DIR),
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    return proc
