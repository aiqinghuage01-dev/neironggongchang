"""数字人短视频成片 v5 接入 (D-059a · 后端基建).

Skill 源: ~/Desktop/skills/digital-human-video-v5/
模板化: A/B/C 三态交替 (全屏真人 / 网格图+大字+圆头像 / 手机屏+浮动头像)
模板 = YAML, 决定节奏骨架 + 风格 + 资产引用.

本轮只做最薄基建:
  list_templates()       扫 templates/*.yaml 返列表 + 元数据 (含智能时长 / 节奏标签)
  load_template_full(id) 读单模板完整 YAML
  render_async(...)      触发渲染 → spawn daemon thread + tasks 池 → 立即返 task_id

D-059b 前端选择器 / D-059c 文案对齐+broll / D-059d 数字人合成 后续做.
诚实: 渲染调 skill 的 render_video, 真跑要 3-10 分钟, 真验证留用户首次试用.
"""
from __future__ import annotations

import sys
import threading
import traceback
from pathlib import Path
from typing import Any

import yaml

from backend.services import tasks as tasks_service


SKILL_ROOT = Path.home() / "Desktop/skills/digital-human-video-v5"
TEMPLATES_DIR = SKILL_ROOT / "templates"
OUTPUTS_DIR = SKILL_ROOT / "outputs"


class Dhv5Error(RuntimeError):
    pass


def _ensure_skill_path() -> None:
    """skill 自带 core/ 模块 — 把 skill_root 加进 sys.path 让我们能 import."""
    sp = str(SKILL_ROOT)
    if sp not in sys.path:
        sys.path.insert(0, sp)


def _estimate_duration_sec(scenes: list[dict]) -> float:
    """从 scenes 数组算总时长 (取最后一个 scene 的 end)."""
    if not scenes:
        return 0.0
    return max(float(s.get("end") or 0.0) for s in scenes)


def _estimate_word_budget(seconds: float) -> int:
    """按中文 ~3.5 字/秒口播估算文案字数预算."""
    return int(round(seconds * 3.5))


def _scene_breakdown(scenes: list[dict]) -> dict[str, int]:
    """A/B/C 各类型计数."""
    out = {"A": 0, "B": 0, "C": 0}
    for s in scenes:
        t = (s.get("type") or "").upper()
        if t in out:
            out[t] += 1
    return out


def list_templates() -> list[dict[str, Any]]:
    """扫 templates/*.yaml 返列表 + 元数据.

    每条:
      id              文件名去 .yaml (如 "01-peixun-gaoxiao")
      name            模板里的 name
      description     模板里的 description
      version         模板里的 version
      category        模板里的 category (没有则 "未分类")
      duration_sec    根据 scenes 算
      word_budget     按 3.5 字/秒口播估
      scene_count     scene 数量
      scenes_breakdown {A:n, B:n, C:n}
      music           BGM 文件名
      cover_title     封面主标题
      sample_video    "outputs/<id>.mp4" 如果存在 (用于前端样片预览)
    """
    if not TEMPLATES_DIR.exists():
        return []
    out: list[dict[str, Any]] = []
    for p in sorted(TEMPLATES_DIR.glob("*.yaml")):
        try:
            data = yaml.safe_load(p.read_text(encoding="utf-8")) or {}
        except Exception as e:
            out.append({
                "id": p.stem, "name": p.stem, "error": f"YAML parse: {e}",
                "broken": True,
            })
            continue
        scenes = data.get("scenes") or []
        duration = _estimate_duration_sec(scenes)
        sample = OUTPUTS_DIR / f"{p.stem}.mp4"
        out.append({
            "id": p.stem,
            "name": data.get("name") or p.stem,
            "description": data.get("description") or "",
            "version": data.get("version") or "1.0",
            "category": data.get("category") or "未分类",
            "rhythm": data.get("rhythm") or "",
            "duration_sec": round(duration, 1),
            "word_budget": _estimate_word_budget(duration),
            "scene_count": len(scenes),
            "scenes_breakdown": _scene_breakdown(scenes),
            "music": data.get("music") or "",
            "cover_title": (data.get("cover_title") or "").replace("\n", " ").strip(),
            "sample_video": f"/skills/dhv5/outputs/{p.stem}.mp4" if sample.exists() else None,
        })
    return out


def load_template_full(template_id: str) -> dict[str, Any]:
    """读单个模板的完整 YAML 配置. 给前端编辑器 / 文案对齐用."""
    p = TEMPLATES_DIR / f"{template_id}.yaml"
    if not p.exists():
        raise Dhv5Error(f"模板不存在: {template_id}")
    try:
        data = yaml.safe_load(p.read_text(encoding="utf-8")) or {}
    except Exception as e:
        raise Dhv5Error(f"YAML parse: {e}") from e
    return {
        "id": template_id,
        "yaml_path": str(p),
        **data,
    }


def render_async(
    template_id: str,
    digital_human_video: str,
    output_name: str | None = None,
    scenes_override: list[dict] | None = None,
) -> int:
    """触发渲染 → spawn daemon thread + tasks 池 → 立即返 task_id.

    digital_human_video: 数字人 mp4 路径 (柿榴出 / 用户上传 / D-059d 自动接通)
    output_name: 输出文件名 (无 .mp4 扩展, 默认用 template_id + 时间戳)
    scenes_override: 如果给了, 覆盖模板默认 scenes (D-059c 文案对齐用)

    渲染走 skill 的 render_video, 调 PIL+ffmpeg 真跑 3-10 分钟.
    任务进度 + 结果走 backend/services/tasks (D-037a) 的 task 表.
    调用方轮询 GET /api/tasks/{task_id} 看 status 转 success/failed.
    """
    p_template = TEMPLATES_DIR / f"{template_id}.yaml"
    if not p_template.exists():
        raise Dhv5Error(f"模板不存在: {template_id}")
    p_dhv = Path(digital_human_video)
    if not p_dhv.exists():
        raise Dhv5Error(f"数字人 mp4 不存在: {digital_human_video}")

    import time as _t
    name = output_name or f"{template_id}_{int(_t.time())}"
    output_path = OUTPUTS_DIR / f"{name}.mp4"

    payload = {
        "template_id": template_id,
        "digital_human_video": str(p_dhv),
        "output_path": str(output_path),
        "scenes_override_count": len(scenes_override) if scenes_override else 0,
    }

    task_id = tasks_service.create_task(
        kind="dhv5.render",
        label=f"渲染 v5 视频 · {template_id}",
        ns="dhv5",
        page_id="dhv5",
        step="render",
        payload=payload,
    )

    def _worker():
        try:
            _ensure_skill_path()
            from core import load_template, render_video  # type: ignore

            tpl = load_template(p_template)
            if scenes_override:
                # 覆盖 scenes — D-059c 文案对齐结果走这里
                from core.models import Scene, SceneType  # type: ignore
                tpl.scenes = [
                    Scene(
                        type=SceneType(s.get("type", "A")),
                        start=float(s.get("start", 0.0)),
                        end=float(s.get("end", 0.0)),
                        subtitle=s.get("subtitle", ""),
                        big_text=s.get("big_text", ""),
                        top_image=s.get("top_image", ""),
                        top_image_prompt=s.get("top_image_prompt", ""),
                        screen_image=s.get("screen_image", ""),
                        screen_image_prompt=s.get("screen_image_prompt", ""),
                        sticker_image=s.get("sticker_image", ""),
                        sticker_label=s.get("sticker_label", ""),
                        sticker_prompt=s.get("sticker_prompt", ""),
                    )
                    for s in scenes_override
                ]

            tasks_service.update_progress(task_id, "渲染中 · plate + ffmpeg 合成 (3-10 分钟)")
            OUTPUTS_DIR.mkdir(parents=True, exist_ok=True)
            actual_path = render_video(
                tpl=tpl,
                digital_human_video=p_dhv,
                output_path=output_path,
                skill_root=SKILL_ROOT,
            )
        except Exception as e:
            tasks_service.finish_task(
                task_id,
                error=f"{type(e).__name__}: {e}",
                status="failed",
            )
            return
        if tasks_service.is_cancelled(task_id):
            return
        tasks_service.finish_task(
            task_id,
            result={
                "output_path": str(actual_path),
                "size_bytes": Path(actual_path).stat().st_size if Path(actual_path).exists() else 0,
                "template_id": template_id,
            },
        )

    threading.Thread(target=_worker, daemon=True, name=f"dhv5-render-{task_id[:8]}").start()
    return task_id
