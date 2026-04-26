"""图引擎抽象层 (D-064 · 2026-04-26).

工厂里所有"生图"调用走这里, 默认 apimart (GPT-Image-2), 可切 dreamina (即梦).

接口:
    generate(prompt, size, n, engine, refs, label) → {
        images: [{url, local_path, media_url}, ...],
        engine: "apimart" | "dreamina",
        elapsed_sec: float,
    }

引擎规则:
- engine 不传 → 读 settings.image_engine, 默认 "apimart"
- apimart: 串行 submit n 次 (单次 30-60s)
- dreamina: 串行 text2image + poll n 次 (单次 60-120s)
- 失败时返回部分成功 (不抛, 让调用方决定怎么显示)

调用方:
- backend/api.py:cover_run_async (短视频封面 / 朋友圈封面)
- backend/services/wechat_scripts.py:gen_section_image (公众号段间图)
- backend/services/wechat_scripts.py:gen_cover_batch (公众号封面 4 选 1)
"""
from __future__ import annotations

import time
from pathlib import Path
from typing import Any, Literal

from backend.services import settings as settings_svc


Engine = Literal["apimart", "dreamina"]
SUPPORTED_ENGINES: list[Engine] = ["apimart", "dreamina"]
DEFAULT_ENGINE: Engine = "apimart"
DEFAULT_N: int = 2


def get_default_engine() -> Engine:
    """读 settings 里的默认引擎. 用户在 settings 页改这个."""
    s = settings_svc.get_all()
    e = (s.get("image_engine") or DEFAULT_ENGINE).strip().lower()
    return e if e in SUPPORTED_ENGINES else DEFAULT_ENGINE


def get_default_n() -> int:
    s = settings_svc.get_all()
    n = s.get("image_n_default") or DEFAULT_N
    try: return max(1, min(int(n), 8))
    except Exception: return DEFAULT_N


def generate(
    prompt: str,
    *,
    size: str = "16:9",
    n: int | None = None,
    engine: Engine | None = None,
    refs: list[str] | None = None,
    label: str = "图",
    output_dir: Path | str | None = None,
) -> dict[str, Any]:
    """统一图生成入口.

    prompt: 文本提示
    size: 比例 16:9 | 9:16 | 1:1 | 3:4 | 4:3
    n: 出几张 (默认 settings.image_n_default = 2). 1-8.
    engine: "apimart" | "dreamina" | None (None = 用 settings 默认)
    refs: 参考图 URL (apimart 支持, dreamina 暂不传给 CLI)
    label: 文件名前缀
    output_dir: 本地图片保存目录 (默认 data/image-gen/)
    """
    engine = (engine or get_default_engine()).lower()
    if engine not in SUPPORTED_ENGINES:
        raise ValueError(f"unsupported engine: {engine}. supported: {SUPPORTED_ENGINES}")
    n = max(1, min(int(n if n is not None else get_default_n()), 8))

    output_dir = _resolve_output_dir(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    t0 = time.time()
    if engine == "apimart":
        images = _generate_apimart(prompt, size=size, n=n, refs=refs, label=label, output_dir=output_dir)
    elif engine == "dreamina":
        images = _generate_dreamina(prompt, size=size, n=n, label=label, output_dir=output_dir)
    else:
        raise ValueError(engine)

    return {
        "images": images,
        "engine": engine,
        "n": n,
        "size": size,
        "elapsed_sec": round(time.time() - t0, 1),
    }


def _resolve_output_dir(d: Path | str | None) -> Path:
    if d:
        return Path(d)
    from shortvideo.config import DATA_DIR
    return DATA_DIR / "image-gen"


def _to_media_url(local_path: Path | None, sub: str = "image-gen") -> str | None:
    """把绝对本地路径转 /media/<sub>/<filename> 给前端预览."""
    if not local_path:
        return None
    try:
        from shortvideo.config import DATA_DIR
        # 如果路径在 DATA_DIR 下, 推 /media/相对路径
        rel = Path(local_path).resolve().relative_to(DATA_DIR.resolve())
        return f"/media/{rel.as_posix()}"
    except Exception:
        return None


# ─── apimart 实现 ─────────────────────────────────────────

def _generate_apimart(prompt, *, size, n, refs, label, output_dir):
    from shortvideo.apimart import ApimartClient, ApimartError
    out: list[dict[str, Any]] = []
    try:
        client = ApimartClient()
    except Exception as e:
        # 配置/初始化失败, 全部失败
        return [{"error": f"apimart 初始化失败: {type(e).__name__}: {e}"} for _ in range(n)]

    with client as c:
        for i in range(n):
            ts = int(time.time())
            dest = Path(output_dir) / f"{label}_{ts}_{i}.png"
            try:
                res = c.generate_and_download(prompt, dest, size=size, refs=refs)
                out.append({
                    "url": res.url,
                    "local_path": str(res.local_path) if res.local_path else None,
                    "media_url": _to_media_url(res.local_path),
                    "task_id": res.task_id,
                    "elapsed_sec": res.elapsed_sec,
                })
            except ApimartError as e:
                out.append({"error": f"apimart 失败: {e}"})
            except Exception as e:
                out.append({"error": f"{type(e).__name__}: {e}"})
    return out


# ─── dreamina 实现 ─────────────────────────────────────────

# size → dreamina ratio (CLI 接口用 ratio 字段)
_DREAMINA_RATIO_MAP = {
    "16:9": "16:9", "9:16": "9:16", "1:1": "1:1",
    "3:4": "3:4", "4:3": "4:3",
}


def _generate_dreamina(prompt, *, size, n, label, output_dir):
    from backend.services import dreamina_service
    out: list[dict[str, Any]] = []
    ratio = _DREAMINA_RATIO_MAP.get(size, "1:1")
    for i in range(n):
        try:
            # poll=120s 内同步等结果, 内部 CLI 自动下载到本地
            r = dreamina_service.text2image(prompt=prompt, ratio=ratio, poll=120)
            result = r.get("result") or {}
            # CLI 返回结构: {submit_id, status, url, local_path?}
            url = result.get("url") or ""
            local_path = result.get("local_path")
            if not local_path and url:
                # 拷贝到 output_dir 统一管理
                local_path = _download_url_to(url, Path(output_dir) / f"{label}_{int(time.time())}_{i}.png")
            if local_path:
                # 拷贝到统一 image-gen 目录便于 /media 访问
                tgt = Path(output_dir) / f"{label}_{int(time.time())}_{i}.png"
                if Path(local_path) != tgt:
                    try:
                        import shutil
                        shutil.copy2(local_path, tgt)
                        local_path = str(tgt)
                    except Exception: pass
            out.append({
                "url": url,
                "local_path": str(local_path) if local_path else None,
                "media_url": _to_media_url(Path(local_path)) if local_path else None,
                "submit_id": result.get("submit_id"),
                "elapsed_sec": result.get("elapsed_sec"),
            })
        except Exception as e:
            out.append({"error": f"{type(e).__name__}: {e}"})
    return out


def _download_url_to(url: str, dest: Path) -> str | None:
    try:
        import httpx
        with httpx.stream("GET", url, timeout=60.0, follow_redirects=True) as r:
            r.raise_for_status()
            dest.parent.mkdir(parents=True, exist_ok=True)
            with open(dest, "wb") as f:
                for chunk in r.iter_bytes(1 << 16):
                    f.write(chunk)
        return str(dest)
    except Exception:
        return None
