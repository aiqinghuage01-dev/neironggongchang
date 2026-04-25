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


# ─── D-059c-1 文案对齐 ───────────────────────────────────────
# 把整段口播文案切到模板的 N 个 scenes (A 字幕 / B 大字 / C 字幕)
# 走 ai 关卡层 (人设注入 deep=True 不需要, 这是结构化任务).

_ALIGN_SYSTEM_TPL = """你在执行 v5 模板成片的"文案对齐"任务.

规则:
1. 输入是一段中文口播 transcript + 一个模板的 scenes 节奏骨架 (A/B/C 三态)
2. 你要把 transcript 智能切到每个 scene 的字段:
   · A 型 scene → subtitle (字幕, 8-18 字)
   · B 型 scene → big_text (大字金句, 4-10 字, 比 subtitle 短)
   · C 型 scene → subtitle (字幕, 8-18 字)
3. 严格按 scenes 顺序对应 transcript 的时间流, 不要乱序
4. 每个 scene 的字段是"屏上显示"文本, 不是数字人念的全文 — 数字人念的是
   transcript 全文, 字段是给观众看的精炼提示 (像短视频 SRT 字幕的关键词版)
5. 字段尽量从 transcript 抽词, 也可适当浓缩 (但不要发明新词)
6. 不允许字段为空 — 实在没合适内容也要抽 4-8 字过去

输出 JSON 格式 (顶层 array, 跟输入 scenes 严格对齐):
[{"type":"A","subtitle":"..."}, {"type":"B","big_text":"..."}, ...]
"""


def align_script(
    template_id: str,
    transcript: str,
    mode: str = "auto",
) -> dict[str, Any]:
    """文案↔scenes 智能对齐. 三种 mode:

    auto         走 ai 关卡层智能切, 推荐
    placeholder  直接用模板原 scenes 字段 (不调 AI, 给用户填空模式)
    manual       返空字段, 让前端拖

    返回 {scenes: [...], mode, template_id, transcript_chars}.
    scenes 数组跟模板 scenes 一一对应, 加了 subtitle/big_text 字段.
    """
    full = load_template_full(template_id)
    raw_scenes = full.get("scenes") or []
    if not raw_scenes:
        raise Dhv5Error(f"模板 {template_id} 无 scenes")

    if mode == "manual":
        out_scenes = [
            {**s, "subtitle": "", "big_text": ""} for s in raw_scenes
        ]
        return {"template_id": template_id, "mode": mode, "transcript_chars": len(transcript), "scenes": out_scenes}

    if mode == "placeholder":
        return {
            "template_id": template_id, "mode": mode, "transcript_chars": len(transcript),
            "scenes": raw_scenes,  # 模板原字段直接返
        }

    # auto: 走 AI
    if not transcript or not transcript.strip():
        raise Dhv5Error("transcript 不能为空 (mode=auto)")

    # 准备给 AI 的简化 scenes (只给 type + 顺序)
    simplified = [
        {"idx": i, "type": s.get("type"), "duration_sec": round(float(s.get("end", 0)) - float(s.get("start", 0)), 1)}
        for i, s in enumerate(raw_scenes)
    ]

    prompt = (
        f"模板共 {len(raw_scenes)} 个 scenes:\n"
        f"{simplified}\n\n"
        f"Transcript ({len(transcript)} 字):\n{transcript}\n\n"
        f"请按规则对齐, 直接返 JSON array, 不要任何前言."
    )

    from shortvideo.ai import get_ai_client
    import json
    import re as _re

    try:
        ai = get_ai_client(route_key="dhv5.align")
        r = ai.chat(
            prompt=prompt,
            system=_ALIGN_SYSTEM_TPL,
            deep=False,           # 结构化任务, 不需要全人设
            temperature=0.4,
            max_tokens=2000,
        )
    except Exception as e:
        raise Dhv5Error(f"AI 调用失败: {type(e).__name__}: {e}") from e

    text = r.text or ""
    m = _re.search(r"\[[\s\S]*\]", text)
    if not m:
        raise Dhv5Error(f"AI 返回非 JSON: {text[-300:]}")
    try:
        ai_scenes = json.loads(m.group(0))
        if not isinstance(ai_scenes, list):
            raise ValueError("not a list")
    except Exception as e:
        raise Dhv5Error(f"AI JSON 解析失败: {e}") from e

    # 把 AI 切的字段拼回模板原 scenes (保留 start/end/top_image_prompt 等)
    out_scenes = []
    for i, raw in enumerate(raw_scenes):
        merged = {**raw}
        if i < len(ai_scenes) and isinstance(ai_scenes[i], dict):
            ai_field = ai_scenes[i]
            t = (raw.get("type") or "").upper()
            if t == "B":
                merged["big_text"] = (ai_field.get("big_text") or "").strip() or merged.get("big_text", "")
            else:  # A/C
                merged["subtitle"] = (ai_field.get("subtitle") or "").strip() or merged.get("subtitle", "")
        out_scenes.append(merged)

    return {
        "template_id": template_id,
        "mode": mode,
        "transcript_chars": len(transcript),
        "scenes": out_scenes,
    }


# ─── D-060a B-roll 真生图 ─────────────────────────────────────
# B 型 top_image (4:3 横版) / C 型 screen_image (9:16 竖版).
# 走 ~/.claude/skills/poju-image-gen/poju-img.py (跟 wechat 段间图同款 apimart).
# 下载到 SKILL_ROOT/assets/brolls/<template_id>/<filename>, 同时更新模板 YAML.

import shutil
import subprocess

POJU_IMG = Path.home() / ".claude/skills/poju-image-gen/poju-img.py"

# 每个 B/C scene 的 broll 文件名约定 (跟 SKILL.md 既有约定保持一致)
def _broll_filename(scene_type: str, scene_idx_in_type: int, ext: str = "png") -> str:
    """
    B 型: b{idx_in_type}_top.{ext}    例 b0_top.png
    C 型: c{idx_in_type}_screen.{ext} 例 c0_screen.png
    idx_in_type 是该 scene 在 B/C 同类型里的顺序(从 0 起), 不是全局 idx.
    跟 skill render.py 的 b_plates / c_plates 命名对齐.
    """
    t = scene_type.upper()
    if t == "B":
        return f"b{scene_idx_in_type}_top.{ext}"
    if t == "C":
        return f"c{scene_idx_in_type}_screen.{ext}"
    raise Dhv5Error(f"only B/C scenes have broll, got {scene_type}")


def _broll_size_for_scene(scene_type: str) -> str:
    """B 横版 4:3 / C 竖版 9:16 (matches dhv5 template visual spec)."""
    t = scene_type.upper()
    if t == "B":
        return "4:3"
    if t == "C":
        return "9:16"
    raise Dhv5Error(f"unsupported scene type: {scene_type}")


def generate_broll(
    template_id: str,
    scene_idx: int,
    regen: bool = False,
) -> dict[str, Any]:
    """给某 scene 生 broll 图 (subprocess 调 poju-img.py).

    Args:
      template_id: 模板 id
      scene_idx:   scene 全局索引 (0-based, 模板 scenes 数组里的位置)
      regen:       True 强制重生, False 已存在跳过

    Returns:
      {
        "scene_idx": int,
        "scene_type": "B" | "C",
        "filename": "b0_top.png",
        "local_path": "/Users/.../assets/brolls/<id>/b0_top.png",
        "url": "/skills/dhv5/brolls/<id>/b0_top.png",
        "size_bytes": int,
        "elapsed_sec": float,
        "skipped": bool,  # True 表示已存在没重生
        "prompt": str,    # 实际用的 prompt
      }

    抛 Dhv5Error 当 scene 不存在 / 类型不支持 / 没 prompt / poju-img 失败.
    """
    if not POJU_IMG.exists():
        raise Dhv5Error(f"poju-img.py 不存在: {POJU_IMG}")

    full = load_template_full(template_id)
    raw_scenes = full.get("scenes") or []
    if scene_idx < 0 or scene_idx >= len(raw_scenes):
        raise Dhv5Error(f"scene_idx {scene_idx} 超界 (共 {len(raw_scenes)} scenes)")
    scene = raw_scenes[scene_idx]
    stype = (scene.get("type") or "").upper()
    if stype not in {"B", "C"}:
        raise Dhv5Error(f"只 B/C scene 有 broll, scene #{scene_idx} 是 {stype}")

    # 拿 prompt: B 用 top_image_prompt / C 用 screen_image_prompt
    prompt_field = "top_image_prompt" if stype == "B" else "screen_image_prompt"
    prompt = (scene.get(prompt_field) or "").strip()
    if not prompt:
        raise Dhv5Error(f"scene #{scene_idx} 缺 {prompt_field}, 没法生图")

    # 算同类型顺序索引 (做 filename 用)
    idx_in_type = sum(1 for s in raw_scenes[:scene_idx] if (s.get("type") or "").upper() == stype)
    fname = _broll_filename(stype, idx_in_type)
    out_dir = SKILL_ROOT / "assets" / "brolls" / template_id
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / fname

    # 已存在 + 不强制重生 → 跳过
    if out_path.exists() and not regen:
        return {
            "scene_idx": scene_idx,
            "scene_type": stype,
            "filename": fname,
            "local_path": str(out_path),
            "url": f"/skills/dhv5/brolls/{template_id}/{fname}",
            "size_bytes": out_path.stat().st_size,
            "elapsed_sec": 0,
            "skipped": True,
            "prompt": prompt,
        }

    # subprocess 调 poju-img.py 生图
    import time as _t
    t0 = _t.time()
    size = _broll_size_for_scene(stype)
    try:
        r = subprocess.run(
            ["python3", str(POJU_IMG), prompt, "--size", size,
             "--out", str(out_dir.parent.parent.parent)],  # poju-img 自己会建子目录
            capture_output=True, text=True, timeout=120,
            env={**__import__("os").environ},
        )
    except subprocess.TimeoutExpired:
        raise Dhv5Error("生图超时 120s")

    if r.returncode != 0:
        raise Dhv5Error(
            f"poju-img 失败 rc={r.returncode}\nstderr: {(r.stderr or '')[-300:]}\nstdout: {(r.stdout or '')[-300:]}"
        )

    src_path = (r.stdout or "").strip().splitlines()[-1] if r.stdout.strip() else ""
    if not src_path or not Path(src_path).exists():
        raise Dhv5Error(f"poju-img 没输出有效路径: stdout={r.stdout[-200:]}")

    # 拷贝到 dhv5 brolls 目录, 用约定 filename
    shutil.copy2(src_path, out_path)
    return {
        "scene_idx": scene_idx,
        "scene_type": stype,
        "filename": fname,
        "local_path": str(out_path),
        "url": f"/skills/dhv5/brolls/{template_id}/{fname}",
        "size_bytes": out_path.stat().st_size,
        "elapsed_sec": round(_t.time() - t0, 1),
        "skipped": False,
        "prompt": prompt,
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
                "output_url": f"/skills/dhv5/outputs/{Path(actual_path).name}",  # D-059d 前端 video 播
                "size_bytes": Path(actual_path).stat().st_size if Path(actual_path).exists() else 0,
                "template_id": template_id,
            },
        )

    threading.Thread(target=_worker, daemon=True, name=f"dhv5-render-{task_id[:8]}").start()
    return task_id
