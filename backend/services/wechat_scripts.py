"""公众号文章 skill 的脚本调用层 — Phase 2.5 / 3 / 4 / 5。

把 skill 下的 scripts/*.sh 和 *.py 封装成 Python 函数,
后端 endpoint 调用这里,这里 subprocess 出去。

skill 源: ~/Desktop/skills/公众号文章/scripts/
  push_to_wechat.sh             Phase 5
  gen_section_image.sh          Phase 2.5
  upload_article_image.sh       Phase 2.5 内部被调
  generate_cover.py             Phase 4
  convert_to_wechat_markup.py   Phase 3

原则:不重写脚本,subprocess 代调。依赖(premailer/bs4/chrome)由系统 python3 提供,
本项目 venv 不重复安装。
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import time
from pathlib import Path
from typing import Any

from backend.services import tasks as tasks_service  # D-037b6 异步化

from backend.services import skill_loader

SKILL_SLUG = "公众号文章"

# 产物临时目录(skill 脚本里 /tmp/preview/ 是约定)
PREVIEW_DIR = Path("/tmp/preview")
PREVIEW_DIR.mkdir(parents=True, exist_ok=True)


class WechatScriptError(RuntimeError):
    pass


_SKILL_PYTHON_CACHE: str | None = None


def _skill_python(require_modules: tuple[str, ...] = ("bs4", "premailer")) -> str:
    """公众号 skill 脚本依赖装在系统 Python, 不能跟随 backend .venv 的 python3.

    backend 由 `.venv/bin/uvicorn` 启动时, 子进程里直接调用 `python3` 可能命中
    `.venv/bin/python3`, 导致 convert_to_wechat_markup.py 找不到 bs4/premailer.
    """
    global _SKILL_PYTHON_CACHE
    if _SKILL_PYTHON_CACHE:
        return _SKILL_PYTHON_CACHE
    candidates = [
        os.environ.get("WECHAT_SKILL_PYTHON", ""),
        "/Library/Frameworks/Python.framework/Versions/3.14/bin/python3",
        "/usr/local/bin/python3",
        "/opt/homebrew/bin/python3",
        "python3",
    ]
    seen: set[str] = set()
    for exe in candidates:
        if not exe or exe in seen:
            continue
        seen.add(exe)
        code = "; ".join(f"import {m}" for m in require_modules) or "pass"
        try:
            r = subprocess.run([exe, "-c", code], capture_output=True, text=True, timeout=5)
        except Exception:
            continue
        if r.returncode == 0:
            _SKILL_PYTHON_CACHE = exe
            return exe
    raise WechatScriptError(
        "公众号排版工具缺运行依赖: 找不到已安装 bs4/premailer 的 Python. "
        "可设置 WECHAT_SKILL_PYTHON 指向系统 python3."
    )


def _run(cmd: list[str], *, timeout: int = 180, cwd: str | None = None) -> subprocess.CompletedProcess:
    """跑 subprocess,失败抛 WechatScriptError 带 stderr+stdout。

    D-039 改: 微信 skill 脚本 (push_to_wechat.sh 等) 把错误用 echo 写到 stdout 而不是 >&2,
    所以 stderr 经常为空. 失败时同时附 stdout 尾部, 便于定位真正原因.
    """
    try:
        r = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout,
            cwd=cwd,
            env={**os.environ},
        )
    except subprocess.TimeoutExpired as e:
        raise WechatScriptError(f"超时 {timeout}s: {' '.join(cmd[:3])}") from e
    if r.returncode != 0:
        err = (r.stderr or "").strip()
        out = (r.stdout or "").strip()
        msg = f"脚本失败 rc={r.returncode}: {' '.join(cmd[:3])}"
        if err:
            msg += f"\nstderr: {err[-600:]}"
        if out:
            msg += f"\nstdout(tail): {out[-600:]}"
        raise WechatScriptError(msg)
    return r


# ─── Phase 2.5 · 段间配图 ─────────────────────────────────────

def gen_section_image(prompt: str, size: str = "16:9", engine: str | None = None) -> dict[str, Any]:
    """给一段文字生图,上传微信图床,返回 mmbiz 永久 URL。

    耗时 30-60s(生图 25-50s + 上传 5-10s)。

    D-039: 同时把生成的图本地拷贝到 data/wechat-images/, 返回 media_url 给前端预览.
    原因: mmbiz.qpic.cn 有 referer 防盗链, 浏览器直接 <img src=mmbiz_url> 显示
    "未经允许不可引用" 占位图, 用户看不到真实图. HTML 拼装 / 推送公众号草稿仍用 mmbiz_url.

    D-064: engine 参数. apimart 走原 skill 脚本 (含微信图床上传).
    dreamina 暂不支持 (需要单独做 dreamina → 微信图床上传链路, 留待 D-064b).
    """
    from shortvideo import image_engine
    actual_engine = (engine or image_engine.get_default_engine()).lower()
    if actual_engine == "dreamina":
        raise WechatScriptError(
            "段间图暂不支持即梦引擎 (需要先把生成的图上传微信图床, 即梦客户端没接这条链路). "
            "改成默认 apimart, 或用即梦独立页生图后手动复制 mmbiz_url."
        )

    script = skill_loader.script_path(SKILL_SLUG, "gen_section_image.sh")
    if not script.exists():
        raise WechatScriptError(f"脚本不存在: {script}")

    t0 = time.time()
    r = _run(["bash", str(script), prompt, "--size", size], timeout=600)
    mmbiz_url = r.stdout.strip().splitlines()[-1] if r.stdout.strip() else ""
    if not mmbiz_url.startswith("http"):
        raise WechatScriptError(f"生图脚本未输出 URL: stdout={r.stdout[-300:]}")

    # D-039: 从 stderr 解析 LOCAL_PATH (脚本里 echo "💾 本地已存 $LOCAL_PATH" >&2)
    local_path: str | None = None
    media_url: str | None = None
    m = re.search(r"💾 本地已存 (\S+)", r.stderr or "")
    if m:
        src = Path(m.group(1))
        if src.exists():
            from shortvideo.config import DATA_DIR
            target_dir = DATA_DIR / "wechat-images"
            target_dir.mkdir(parents=True, exist_ok=True)
            target = target_dir / f"{int(time.time())}_{src.name}"
            try:
                import shutil
                shutil.copy2(src, target)
                local_path = str(target)
                media_url = f"/media/wechat-images/{target.name}"
            except Exception:
                pass  # 拷贝失败不影响主流程, 退化到只回 mmbiz_url

    # D-065: 段间图入作品库
    # D-070: 访客模式跳过 (帮朋友写不入清华哥作品)
    from backend.services import guest_mode as _gm
    if local_path and not _gm.is_guest():
        try:
            from shortvideo.works import insert_work
            import json as _json
            insert_work(
                type="image", source_skill="wechat-section-image",
                title=(prompt or "")[:60] or None,
                local_path=local_path, thumb_path=local_path, status="ready",
                metadata=_json.dumps({
                    "prompt": prompt, "size": size,
                    "mmbiz_url": mmbiz_url,
                    "elapsed_sec": round(time.time() - t0, 1),
                }, ensure_ascii=False),
            )
        except Exception:
            pass

    return {
        "mmbiz_url": mmbiz_url,
        "media_url": media_url,    # 前端预览用 (可能为 null, 退化到 mmbiz_url)
        "local_path": local_path,
        "prompt": prompt,
        "size": size,
        "elapsed_sec": round(time.time() - t0, 1),
    }


# ─── Phase 2.5 辅助 · AI 产 3-5 张图的 prompt ─────────────────

def plan_section_images(content: str, title: str, n: int = 4) -> list[dict[str, str]]:
    """让 AI 把文章切成 n 个大段,每段产一个具象 16:9 配图 prompt。

    不真生图,只产 prompts。前端让清华哥确认后再调 gen_section_image。
    """
    from shortvideo.ai import get_ai_client

    skill = skill_loader.load_skill(SKILL_SLUG)
    style = skill["references"].get("style-bible", "")

    system = f"""你在执行公众号文章 skill 的 Phase 2.5 · 段间配图 prompt 规划。

===== 风格参考(只看大框架) =====
{style[:2000]}

规则(硬):
- 按语义把正文切成 {n} 个大段(开场通常不配图,结尾 CTA 通常不配图,这 {n} 张都在正文中间)
- 每段给一个具象画面 prompt,长度 ≤ 60 字
- 具体场景优先(如"店老板站在打印机前"),避免抽象概念("AI赋能老板")
- 真实感照片风格,暖色调,避免人脸特写
- 16:9 横版
"""
    prompt = f"""标题: {title}
正文(Markdown):
---
{content}
---

为这篇文章产出 {n} 张段间配图的 prompt。严格 JSON 数组:
[
  {{"section_hint": "这张图插在哪一段之后的提示(20字内)", "image_prompt": "具象画面描述 ≤60字"}},
  ...
]"""
    ai = get_ai_client(route_key="wechat.plan-images")
    from backend.services import wechat_pipeline as wp
    r = ai.chat(prompt, system=system, deep=False, temperature=0.7, max_tokens=1500)
    arr = wp._extract_json(r.text, "array")
    # D-094: 不让 LLM 解析失败 fallback 成空 plans → 前端 Step 5 spinning 卡死.
    # 老板看不到错只能干等. 失败 raise, UI 看到明确"重试"按钮.
    if not arr:
        raise WechatScriptError(
            f"段间图 prompt 规划 LLM 输出非 JSON 数组 (tokens={r.total_tokens}). "
            f"输出头: {(r.text or '')[:200]!r}"
        )
    plans = [
        {
            "section_hint": (x.get("section_hint") or "").strip(),
            "image_prompt": (x.get("image_prompt") or "").strip(),
        }
        for x in arr
        if isinstance(x, dict) and x.get("image_prompt")
    ][:n]
    if not plans:
        raise WechatScriptError(
            f"段间图 prompt 规划解析后 0 条有效 plan (LLM 输出格式不对). "
            f"输出头: {(r.text or '')[:200]!r}"
        )
    return plans


# ─── D-091b · 全局统一风格重写 prompt ────────────────────────
# D-091 v1 错: 仅 append 风格关键词到 prompt 末尾, apimart 模型按主体叙事走,
# 末尾权重低被忽略 → 4 张图视觉风格不变 (老板实测怀旧出来还是真实摄影).
# v2: 让 LLM 把 4 个 prompt 主体重写一遍, 把目标风格融进画面描述 (不只是末尾贴).

# 风格语义说明 (给 LLM 看的, 让它知道每个 styleId 该怎么改 prompt)
_STYLE_GUIDES: dict[str, dict[str, str]] = {
    "real": {
        "label": "真实感照片",
        "desc": "真实摄影, 自然光, 暖色调, 写实质感, 35mm 镜头, 浅景深, 像生活随手拍",
    },
    "documentary": {
        "label": "纪实风",
        "desc": "纪实摄影风格, 高细节真实环境, 像新闻照, 自然光线, 抓拍感, 不摆拍",
    },
    "warm": {
        "label": "暖色慢节奏",
        "desc": "暖黄色调, 柔光, 慢节奏氛围, 像清晨/傍晚, 温馨治愈感, 模糊背景",
    },
    "ink": {
        "label": "水墨/中式",
        "desc": "中式水墨画风格, 山水意境, 大片留白, 黑白灰为主点缀朱砂, 毛笔笔触, 写意不写实",
    },
    "cartoon": {
        "label": "卡通插画",
        "desc": "扁平卡通插画, 暖色配色, 简化造型, 描边线稿, 像绘本风格, 不写实",
    },
    "vintage": {
        "label": "复古怀旧",
        "desc": "复古胶片摄影, 90 年代色调, 颗粒感, 偏黄偏绿暗角, 做旧划痕, 老照片质感",
    },
}


def restyle_section_prompts(prompts: list[str], style_id: str) -> list[str]:
    """让 LLM 把每个 prompt 按目标风格重写主体, 4 张统一风格.

    返回长度跟入参一致的新 prompt 数组. LLM 失败/解析失败时退化到原 prompt
    (前端 fallback: 之前的 append 兜底).
    """
    from shortvideo.ai import get_ai_client

    style = _STYLE_GUIDES.get(style_id) or _STYLE_GUIDES["real"]
    items = [p for p in prompts if isinstance(p, str) and p.strip()]
    if not items:
        return list(prompts)

    system = f"""你在重写一组段间配图的 prompt, 让 4 张图视觉风格统一.

目标风格: {style['label']}
风格特征: {style['desc']}

重写规则 (硬):
- 保留原 prompt 描述的核心场景和主体 (人/物/动作)
- 把风格特征融进描述本身, 不只是末尾追加风格关键词
  (apimart 等模型对 prompt 主体权重高, 风格只能放前置或者改写主体才生效)
- 输出长度控制在 60 字以内, 每条独立成一行的画面描述
- 不要 markdown / 不要编号 / 不要解释, 直接输出新 prompt
"""

    user = "\n".join(f"{i+1}. {p}" for i, p in enumerate(items))
    user += f"\n\n按 {style['label']} 风格重写以上 {len(items)} 个 prompt, 严格 JSON 数组输出:\n"
    user += '["重写后的 prompt 1", "重写后的 prompt 2", ...]'

    ai = get_ai_client(route_key="wechat.plan-images")  # 复用现有路由 (deepseek 轻 LLM 够)
    r = ai.chat(user, system=system, deep=False, temperature=0.6, max_tokens=1500)

    from backend.services import wechat_pipeline as wp
    arr = wp._extract_json(r.text, "array")
    # D-094: LLM 解析失败 → raise, 不要默默全 fallback 原 prompt 让用户看图没变以为 bug.
    # 前端 pickGlobalStyle 已 try/catch + 失败回退 styleId, 走 raise 路径用户看到明确错误.
    if not arr:
        raise RuntimeError(
            f"段间图风格重写 LLM 输出非 JSON 数组 (tokens={r.total_tokens}). "
            f"输出头: {(r.text or '')[:200]!r}"
        )
    out: list[str] = []
    rewritten_count = 0
    for i, original in enumerate(prompts):
        if i < len(arr) and isinstance(arr[i], str) and arr[i].strip():
            out.append(arr[i].strip())
            rewritten_count += 1
        else:
            out.append(original)  # 这一条没拿到重写就保留原 prompt (其他条仍生效)
    # 全部 fallback 也 raise — 等于 LLM 完全没工作, 用户看图没变以为 bug
    if rewritten_count == 0:
        raise RuntimeError(
            f"段间图风格重写 LLM 输出 0 条有效结果, 全部 fallback 原 prompt. "
            f"输出头: {(r.text or '')[:200]!r}"
        )
    return out


# ─── Phase 3 · HTML 拼装 + 微信 markup 转换 ───────────────────

TEMPLATE_FILES = {
    "v3-clean":   "template-v3-clean.html",
    "v2-magazine": "template-v2-magazine.html",
    "v1-dark":    "template-v1-dark.html",
}


def list_templates() -> list[dict[str, Any]]:
    """返回可用模板列表 + 文件存在性。"""
    out = []
    for name, fn in TEMPLATE_FILES.items():
        p = skill_loader.asset_path(SKILL_SLUG, fn)
        out.append({"name": name, "filename": fn, "exists": p.exists()})
    return out


def _load_template(name: str = "v3-clean") -> str:
    fn = TEMPLATE_FILES.get(name) or TEMPLATE_FILES["v3-clean"]
    p = skill_loader.asset_path(SKILL_SLUG, fn)
    if not p.exists():
        # 回退到 v3-clean
        p = skill_loader.asset_path(SKILL_SLUG, TEMPLATE_FILES["v3-clean"])
        if not p.exists():
            raise WechatScriptError(f"模板不存在: {p}")
    return p.read_text(encoding="utf-8")


def assemble_html(
    title: str,
    content_md: str,
    section_images: list[dict[str, str]] | None = None,
    hero_badge: str = "老板必看",
    hero_highlight: str = "",
    hero_subtitle: str = "",
    template: str = "v3-clean",
) -> dict[str, Any]:
    """把长文 Markdown + 段间图 URL 拼成可贴的 V3 Clean HTML,
    再调 convert_to_wechat_markup.py 转成微信 markup。

    返回:
      raw_html_path: /tmp/preview/wechat_article_raw.html
      wechat_html_path: /tmp/preview/wechat_article.html
      meta_path: /tmp/preview/article_meta.json
      wechat_html: 转换后 HTML 字符串(给前端预览)
    """
    template_html = _load_template(template)

    # hero 默认值:取标题前 10 字,副标题从正文抽 3 个关键词占位
    if not hero_highlight:
        hero_highlight = title[:8]
    if not hero_subtitle:
        hero_subtitle = _auto_subtitle(content_md)

    # Markdown → HTML body. D-090 双 URL: 渲染两份, 一份 preview (media_url) 一份 push (mmbiz_url).
    body_html_preview = _md_to_wechat_html(content_md, section_images or [], prefer_media=True)
    body_html_push = _md_to_wechat_html(content_md, section_images or [], prefer_media=False)

    digest = _auto_digest(content_md)
    author_url = _read_asset_text("avatar-wechat-url.txt").strip() or ""

    # 把 body 塞进 template 里 .article-body > .content 的位置
    # template-v3-clean.html 本身是完整 HTML,我们做字符串替换
    hero_title_html = _compose_hero_title_html(title, hero_highlight)
    html_preview = _inject_into_template(
        template_html,
        title=title,
        hero_badge=hero_badge,
        hero_title_html=hero_title_html,
        hero_subtitle=hero_subtitle,
        body_html=body_html_preview,
        avatar_url=author_url,
    )
    html_push = _inject_into_template(
        template_html,
        title=title,
        hero_badge=hero_badge,
        hero_title_html=hero_title_html,
        hero_subtitle=hero_subtitle,
        body_html=body_html_push,
        avatar_url=author_url,
    )

    # 兼容下文 `len(re.findall(r"<img\b", html))` 诊断 (取 preview 版数图)
    html = html_preview

    raw_path = PREVIEW_DIR / "wechat_article_raw.html"
    raw_path.write_text(html_preview, encoding="utf-8")
    # D-090: push 用的 raw HTML (mmbiz_url) 单独落盘喂 converter, 不污染前端预览.
    push_raw_path = PREVIEW_DIR / "wechat_article_raw_push.html"
    push_raw_path.write_text(html_push, encoding="utf-8")

    # D-043: 诊断落盘 — 段间图丢失的话至少能看到这条记录定位到底是前端没发还是后端丢
    _images_in = section_images or []
    _images_with_url = [x for x in _images_in if x.get("mmbiz_url")]
    (PREVIEW_DIR / "last_assemble_request.json").write_text(
        json.dumps({
            "title": title,
            "template": template,
            "content_md_chars": len(content_md or ""),
            "section_images_received": len(_images_in),
            "section_images_with_mmbiz_url": len(_images_with_url),
            "section_images_urls": [x.get("mmbiz_url", "") for x in _images_in[:8]],
            "img_in_raw_html": len(re.findall(r"<img\b", html)),
            "paragraphs_count": len([p for p in (content_md or "").split("\n\n") if p.strip()]),
        }, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    wechat_path = PREVIEW_DIR / "wechat_article.html"
    meta_path = PREVIEW_DIR / "article_meta.json"

    scripts_dir = skill_loader.load_skill(SKILL_SLUG)["scripts_dir"]
    converter = scripts_dir / "convert_to_wechat_markup.py"
    # D-090: 喂 push 版 raw (mmbiz_url) 给 converter, 推送给微信识别自家图床;
    # 前端预览的 raw_path 用 media_url 走本地 :8000/media 避防盗链.
    _run([
        _skill_python(), str(converter),
        "--input", str(push_raw_path),
        "--output", str(wechat_path),
        "--meta", str(meta_path),
    ], timeout=60, cwd=str(scripts_dir))

    meta = {}
    if meta_path.exists():
        try:
            meta = json.loads(meta_path.read_text(encoding="utf-8"))
        except Exception:
            meta = {}
    meta.setdefault("title", title)
    meta.setdefault("digest", digest)
    meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")

    return {
        "raw_html_path": str(raw_path),
        "wechat_html_path": str(wechat_path),
        "meta_path": str(meta_path),
        "raw_html": raw_path.read_text(encoding="utf-8"),
        "wechat_html": wechat_path.read_text(encoding="utf-8"),
        "title": title,
        "digest": digest,
    }


_MEDIA_PREVIEW_BASE = "http://127.0.0.1:8000"  # 路线 B 部署改 env (LH 本机够用)


def _md_to_wechat_html(
    md: str,
    section_images: list[dict[str, str]],
    *,
    prefer_media: bool = False,
) -> str:
    """简易 MD→HTML: 只处理 # / ## / 段落 / 加粗,并按段落数均匀插图。

    D-090 双 URL 策略:
    - prefer_media=True (前端预览): 优先 media_url -> 拼 http://127.0.0.1:8000/media/...
      避开 mmbiz.qpic.cn referer 防盗链 ("此图片来自微信公众平台 未经允许不可引用").
    - prefer_media=False (推送给微信): 用 mmbiz_url, 微信识别自家图床.
    media_url 缺时退化到 mmbiz_url, 不会抛错; 但前端预览会再次撞防盗链.
    """
    # 去掉首个 H1(Hero 已经展示标题,正文不再重复)
    lines = md.splitlines()
    if lines and lines[0].startswith("# "):
        lines = lines[1:]

    paragraphs: list[str] = []
    buf: list[str] = []
    for ln in lines:
        if not ln.strip():
            if buf:
                paragraphs.append("\n".join(buf).strip())
                buf = []
        else:
            buf.append(ln)
    if buf:
        paragraphs.append("\n".join(buf).strip())

    imgs_html: list[str] = []
    for item in section_images:
        url = ""
        if prefer_media:
            rel = (item.get("media_url") or "").strip()
            if rel.startswith("/"):
                url = _MEDIA_PREVIEW_BASE + rel
            elif rel.startswith("http"):
                url = rel
        if not url:
            url = (item.get("mmbiz_url") or "").strip()
        if url:
            imgs_html.append(
                f'<p><img src="{url}" style="width:100%;border-radius:10px;margin:24px 0" /></p>'
            )

    total = len(paragraphs)
    out: list[str] = []
    img_idx = 0
    for i, p in enumerate(paragraphs):
        if p.startswith("## "):
            heading = p[3:].strip()
            out.append(f'<h2 class="section-title"><span class="icon">💎</span>{heading}</h2>')
        elif p.startswith("### "):
            out.append(f'<h3>{p[4:].strip()}</h3>')
        elif p.strip() == "---":
            out.append('<div class="divider">· · ·</div>')
        else:
            html_p = p.replace("\n", "<br>")
            html_p = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", html_p)
            out.append(f"<p>{html_p}</p>")
        # 均匀插图:段落总数 / (图数+1) 为间距
        if imgs_html and img_idx < len(imgs_html):
            spacing = max(1, total // (len(imgs_html) + 1))
            if (i + 1) % spacing == 0 and img_idx < len(imgs_html) and i < total - 2:
                out.append(imgs_html[img_idx])
                img_idx += 1
    # 未插完的图补到末尾
    while img_idx < len(imgs_html):
        out.append(imgs_html[img_idx])
        img_idx += 1

    return "\n".join(out)


def _inject_into_template(template: str, *, title: str, hero_badge: str,
                          hero_title_html: str, hero_subtitle: str,
                          body_html: str, avatar_url: str) -> str:
    """粗暴替换:template-v3-clean.html 里预留的占位。

    template 里大致结构: <div class="wrapper"> <div class="hero">... <div class="article-body"> <div class="content"> ... </div>
    我们用正则匹配 .hero 的 3 个字段和 .content 的 innerHTML,替换成实际内容。
    """
    t = template
    # 替换 hero-badge 文本
    # D-094: hero 三 sub 加 subn 命中检测 (D-089 同款防御).
    # 注意: v3-clean template 没有 <div class="hero-badge"> 元素 (只有 .hero-emoji
    # + hero-title + hero-subtitle). hero_badge 参数实际从未渲染, 是 D-089 之前没察觉
    # 的同款静默 fail. 不 raise (template 真没这元素是已知现状), 但 log warning 让以后
    # 模板加了这元素能感知到; hero-title / hero-subtitle 必须命中, 不命中 raise.
    t, _n_badge = re.subn(
        r'(<div class="hero-badge"[^>]*>)[^<]*(</div>)',
        rf'\g<1>{hero_badge}\g<2>',
        t, count=1,
    )
    if _n_badge != 1:
        import logging
        logging.getLogger("wechat_scripts.inject").debug(
            f"hero-badge 锚点不命中 (template 无此元素, 现状已知). hero_badge={hero_badge!r} 没渲染."
        )
    t, _n_title = re.subn(
        r'(<div class="hero-title"[^>]*>)[\s\S]*?(</div>)',
        rf'\g<1>{hero_title_html}\g<2>',
        t, count=1,
    )
    if _n_title != 1:
        raise WechatScriptError("HTML template 注入失败: hero-title 锚点不命中, 模板结构改了?")
    t, _n_sub = re.subn(
        r'(<div class="hero-subtitle"[^>]*>)[^<]*(</div>)',
        rf'\g<1>{hero_subtitle}\g<2>',
        t, count=1,
    )
    if _n_sub != 1:
        raise WechatScriptError("HTML template 注入失败: hero-subtitle 锚点不命中, 模板结构改了?")
    # 替换 content 内容 (D-089).
    # 旧锚点 `</div>\s*</div>\s*<div class="footer-fixed"` 期望 content + article-body 都
    # 显式闭合, 但 template-v3-clean.html 这两个 div 是隐式不闭的 (浏览器宽容渲染),
    # 实际不存在 `</div></div><div class="footer-fixed">` 序列 → 正则永远不命中,
    # re.sub 静默 fail, content 区原 demo 占位被吐给用户. 同时 4 张段间图 (在 body_html
    # 里) 也跟着被丢光. 改成宽容区间 + 用 subn 检测命中数, 不命中 raise.
    t, _n = re.subn(
        r'(<div class="content"[^>]*>)[\s\S]*?(<div class="footer-fixed")',
        rf'\g<1>\n{body_html}\n\g<2>',
        t, count=1,
    )
    if _n != 1:
        raise WechatScriptError(
            "HTML template 注入失败: 找不到 <div class=\"content\"> 到 "
            "<div class=\"footer-fixed\"> 的替换区间. 模板结构是不是被改了?"
        )
    # 替换头像 URL(如果 template 里是占位符)
    if avatar_url:
        t = re.sub(r'src="\{[^}]*avatar[^}]*\}"', f'src="{avatar_url}"', t)
        t = t.replace("{avatar_wechat_url}", avatar_url)
    return t


def _compose_hero_title_html(title: str, hero_highlight: str) -> str:
    """合成 hero 区标题 HTML (D-048 修).

    之前: f'{title[:6]}<span>{hero_highlight}</span>', 默认 hero_highlight=title[:8]
          导致前 6/8 字重复显示 ("一个餐饮老板一个餐饮老板花3").
    现在: 全文 title 为底, 若 hero_highlight 是 title 的子串就高亮一次, 否则不高亮.
    """
    if hero_highlight and hero_highlight in title and hero_highlight != title:
        return title.replace(
            hero_highlight,
            f'<span class="hero-highlight">{hero_highlight}</span>',
            1,
        )
    return title


def _auto_subtitle(md: str) -> str:
    """从正文首段抽副标题占位。

    D-048 修: 之前 re.findall("[一-龥]{2,6}", ...) 贪婪把连续中文切 6 字一段,
    用户看到 "上周一个开火 · 锅店的老板给 · 我看他的品牌" 不可读.
    改: 按中英文标点切短语, 取前 3 个 2-14 字的合法短语. 不行就退化到首段前 30 字.
    """
    first = ""
    for ln in md.splitlines():
        s = ln.strip()
        if s and not s.startswith("#") and not s.startswith("---"):
            first = s
            break
    if not first:
        return ""
    plain = re.sub(r"[#*_`>\[\]()【】]", "", first)
    # 按标点切短语 (中英文 + 空格)
    phrases = re.split(r"[，。！？；、,.!?;\s]+", plain)
    phrases = [p.strip() for p in phrases if 2 <= len(p.strip()) <= 14]
    if len(phrases) >= 3:
        return " · ".join(phrases[:3])
    if phrases:
        return " · ".join(phrases)
    # 退化: 首段前 30 字
    return plain[:30] + ("…" if len(plain) > 30 else "")


def _auto_digest(md: str) -> str:
    """取首段前 80 字作摘要。"""
    for ln in md.splitlines():
        s = ln.strip()
        if s and not s.startswith("#") and not s.startswith("---"):
            return re.sub(r"[#*_`>\[\]()]", "", s)[:80]
    return ""


def _read_asset_text(filename: str) -> str:
    p = skill_loader.asset_path(SKILL_SLUG, filename)
    return p.read_text(encoding="utf-8") if p.exists() else ""


# ─── Phase 4 · 封面 4 选 1 (D-035) ───────────────────────

COVER_STYLE_VARIANTS = [
    "现代简约风格,大留白,清爽冷色调,高级感",
    "暖色暖光,真实感照片,生活场景,自然氛围",
    "深色高对比,大字醒目,锐利冲击力",
    "复古胶片质感,80-90 年代色调,怀旧氛围",
]


def gen_cover_batch(title: str, n: int = 2, engine: str | None = None) -> dict[str, Any]:
    """生 n 张候选封面 · 16:9 · 串行避免并发限制.

    D-064: 走 image_engine 抽象, 支持 apimart / dreamina 切换 (默认 settings 配置).
    n 默认 2 (D-064 统一从 4 改 2).
    """
    from shortvideo import image_engine

    cover_dir = PREVIEW_DIR.parent / "wechat-cover-batch"
    cover_dir.mkdir(parents=True, exist_ok=True)
    media_target_dir = None
    try:
        from shortvideo.config import DATA_DIR
        media_target_dir = DATA_DIR / "wechat-cover-batch"
        media_target_dir.mkdir(parents=True, exist_ok=True)
    except Exception:
        pass

    base = f"公众号文章封面图 · 主题「{title}」 · 横版 16:9 · 视觉冲击 · 标题文字自然融入"
    prompts = [f"{base} · {COVER_STYLE_VARIANTS[i % len(COVER_STYLE_VARIANTS)]}" for i in range(n)]

    results = []
    t0_total = time.time()
    actual_engine = (engine or image_engine.get_default_engine()).lower()

    for i, p in enumerate(prompts):
        try:
            r = image_engine.generate(p, size="16:9", n=1, engine=actual_engine, label=f"wxcover_{i}", output_dir=media_target_dir or cover_dir, source_skill="wechat-cover-batch")
            imgs = r.get("images") or []
            if imgs and not imgs[0].get("error"):
                img = imgs[0]
                results.append({
                    "index": i,
                    "prompt": p,
                    "style": COVER_STYLE_VARIANTS[i % len(COVER_STYLE_VARIANTS)],
                    "local_path": img.get("local_path"),
                    "media_url": img.get("media_url"),
                    "url": img.get("url"),
                    "engine": r.get("engine"),
                    "elapsed_sec": r.get("elapsed_sec"),
                })
            else:
                err = imgs[0].get("error", "unknown") if imgs else "no images"
                results.append({
                    "index": i, "prompt": p,
                    "style": COVER_STYLE_VARIANTS[i % len(COVER_STYLE_VARIANTS)],
                    "error": str(err)[:200],
                })
        except Exception as e:
            results.append({
                "index": i, "prompt": p,
                "style": COVER_STYLE_VARIANTS[i % len(COVER_STYLE_VARIANTS)],
                "error": f"{type(e).__name__}: {e}",
            })

    succeeded = [r for r in results if r.get("local_path")]
    return {
        "covers": results,
        "succeeded_count": len(succeeded),
        "total_count": len(results),
        "engine": actual_engine,
        "total_elapsed_sec": round(time.time() - t0_total, 1),
    }


# ─── Phase 4 旧版 · Chrome 模板封面(单张,保留兼容) ─────────

def gen_cover(title: str, label: str = "清华哥说", output_path: str | None = None) -> dict[str, Any]:
    """生成 900×383 封面图,走 skill 的 generate_cover.py(Chrome headless 截图)。"""
    scripts_dir = skill_loader.load_skill(SKILL_SLUG)["scripts_dir"]
    script = scripts_dir / "generate_cover.py"
    if not script.exists():
        raise WechatScriptError(f"封面脚本不存在: {script}")

    out = Path(output_path or PREVIEW_DIR / "cover.jpg")
    out.parent.mkdir(parents=True, exist_ok=True)

    t0 = time.time()
    _run([
        "python3", str(script),
        "--title", title,
        "--label", label,
        "--output", str(out),
    ], timeout=60, cwd=str(scripts_dir))

    if not out.exists():
        raise WechatScriptError(f"封面未生成: {out}")

    return {
        "local_path": str(out),
        "size_bytes": out.stat().st_size,
        "elapsed_sec": round(time.time() - t0, 1),
    }


# ─── Phase 5 · 推送到微信草稿箱 ────────────────────────────────
# 已知坑 (D-042):
#   WeChat draft/add 接口 errcode 45166 "invalid content hint" 触发条件难定位,
#   常见原因: <img http://...>、外站 <a>、<script>/<iframe>、from=appmsg URL 等.
#   sanitize_for_push() 推送前清理一道; 同时把请求 payload 落盘 /tmp/preview/
#   last_push_request.{html,json}, 再失败时方便用户把它发回来精确定位.

# 允许保留的 <a href> 域名前缀
_ALLOWED_LINK_PREFIXES = (
    "https://mp.weixin.qq.com",
    "http://mp.weixin.qq.com",
)
# 允许的 <img src> scheme + host
_ALLOWED_IMG_RE = re.compile(r'^https?://(?:[a-z0-9-]+\.)*(mmbiz\.qpic\.cn|wx\.qlogo\.cn)/', re.IGNORECASE)


def _clean_img_url(url: str) -> tuple[str, list[str]]:
    """规整 mmbiz 图 URL, 不剥图. 返回 (新 url, 修改记录)."""
    changes: list[str] = []
    new = url
    # http→https (mmbiz/qlogo 都支持 https, 微信草稿要求)
    if new.startswith("http://"):
        new = "https://" + new[len("http://"):]
        changes.append("http→https")
    # 剥 from=appmsg 来源标记 (经验上 errcode 45166 嫌疑标记)
    new = re.sub(r"\?from=appmsg(&|$)", lambda m: "" if m.group(1) == "" else "?", new)
    new = re.sub(r"&from=appmsg", "", new)
    if new != url and "from=appmsg" in url:
        changes.append("strip ?from=appmsg")
    # 收尾: 末尾 ? 单独留时清掉
    if new.endswith("?"):
        new = new[:-1]
    return new, changes


def sanitize_for_push(html: str) -> dict[str, Any]:
    """推送前清理 HTML, 降低 errcode 45166 风险.

    返回 {clean: str, removed: dict[str, int], rewritten: dict[str, int]}.

    设计原则 (D-043 修正 D-042 误伤):
      D-042 把 ?from=appmsg / http:// 的图整张剥掉, 误杀了模板头像和段间图.
      D-043 改成: 能修就修 URL, 不能修(域名外链 / 危险 tag)才剥.

    清理规则:
      1. <img>:
         · http://mmbiz/qlogo → https://      (改 url, 保 img)
         · ?from=appmsg / &from=appmsg → strip (改 url, 保 img)
         · 域名不在 mmbiz/qlogo 白名单 → 整剥 (apimart / 外链, 推不上)
      2. <a> 指向非 mp.weixin.qq.com → 解 <a> 留内文
      3. <script>/<iframe>/<form>/<input>/<embed>/<object>/<video>/<audio>/
         <link>/<meta> → 整剥
    """
    if not html:
        return {"clean": "", "removed": {}, "rewritten": {}}

    removed: dict[str, int] = {}
    rewritten: dict[str, int] = {}
    out = html

    # 3) 整段 strip 的 tag
    DROP_TAGS = ("script", "iframe", "form", "input", "embed", "object",
                 "video", "audio", "link", "meta")
    for tag in DROP_TAGS:
        pat_pair = re.compile(rf"<{tag}\b[^>]*>.*?</{tag}>", re.IGNORECASE | re.S)
        n_pair = len(pat_pair.findall(out))
        if n_pair:
            out = pat_pair.sub("", out)
            removed[f"<{tag}>"] = removed.get(f"<{tag}>", 0) + n_pair
        pat_self = re.compile(rf"<{tag}\b[^>]*/?>", re.IGNORECASE)
        n_self = len(pat_self.findall(out))
        if n_self:
            out = pat_self.sub("", out)
            removed[f"<{tag}>"] = removed.get(f"<{tag}>", 0) + n_self

    # 1) 处理 <img>:
    #    D-045 修正 D-043: ?from=appmsg 是"别家公众号资源"的天然标记 (template
    #    硬编码的头像必带, 这次 push 的段间图通过 uploadimg 上传不带). 即便把
    #    URL 清成 https 没 ?from=appmsg, mmbiz 资源 ID 不变 — WeChat draft/add
    #    仍按"非己 add_material 上传"拒收 (errcode 45166).
    #    所以 ?from=appmsg 必须整剥, 不能只清 URL.
    img_re = re.compile(r"<img\b[^>]*?/?>", re.IGNORECASE)
    def _img_sub(m: re.Match) -> str:
        full = m.group(0)
        src_m = re.search(r'\bsrc=(["\'])([^"\']*)\1', full, re.IGNORECASE)
        if not src_m:
            removed["img_no_src"] = removed.get("img_no_src", 0) + 1
            return ""
        url = src_m.group(2)
        # 别家公众号 msg 资源 — 整剥 (D-042 原策略, D-045 复活)
        if "?from=appmsg" in url or "&from=appmsg" in url:
            removed["img_from_appmsg"] = removed.get("img_from_appmsg", 0) + 1
            return ""
        probe = "https://" + url[len("http://"):] if url.startswith("http://") else url
        if not _ALLOWED_IMG_RE.match(probe):
            removed["img_external"] = removed.get("img_external", 0) + 1
            return ""
        # 域名 OK, 干净 mmbiz URL — 仅 http→https 规整 (D-043 仍有用)
        new_url, changes = _clean_img_url(url)
        if changes:
            for c in changes:
                rewritten[c] = rewritten.get(c, 0) + 1
            return full.replace(src_m.group(0), f'src={src_m.group(1)}{new_url}{src_m.group(1)}', 1)
        return full
    out = img_re.sub(_img_sub, out)

    # 1b) <img> 整段被外链规则剥之后, <a><img></a> 里的 <a> 空了, 清掉
    out = re.sub(r"<a\b[^>]*>\s*</a>", "", out, flags=re.IGNORECASE | re.S)

    # 2) 非 mp.weixin.qq.com 的 <a>: 解 <a> 留内文
    a_re = re.compile(r"<a\b[^>]*\bhref=([\"'])([^\"']*)\1[^>]*>(.*?)</a>", re.IGNORECASE | re.S)
    def _a_sub(m: re.Match) -> str:
        href = m.group(2)
        if any(href.startswith(p) for p in _ALLOWED_LINK_PREFIXES):
            return m.group(0)
        removed["a_external"] = removed.get("a_external", 0) + 1
        return m.group(3)
    out = a_re.sub(_a_sub, out)

    return {"clean": out, "removed": removed, "rewritten": rewritten}


# 落盘诊断目录, 失败时用户可以把这里的文件发给我精确定位
_DIAG_DIR = PREVIEW_DIR


# ─── D-046 头像合法上传 ────────────────────────────────────
# 模板硬编码的头像 URL ?from=appmsg 是别人公众号资源, sanitize 整剥导致 push
# 后头像丢. 解法: 用户在 ~/.wechat-article-config 里配 author_avatar_path
# 指向本地图, push 流程先调 upload_article_image.sh 上传到 mmbiz, 拿合法 URL,
# 替换 HTML 里头像 src. 任何步骤失败 silent 跳过, 退化到剥头像 (不阻塞 push).

_WECHAT_CONFIG_PATH = Path.home() / ".wechat-article-config"


def _read_wechat_config() -> dict:
    if not _WECHAT_CONFIG_PATH.exists():
        return {}
    try:
        return json.loads(_WECHAT_CONFIG_PATH.read_text(encoding="utf-8"))
    except Exception:
        return {}


def upload_article_image(image_path: Path, timeout: int = 30) -> str:
    """subprocess 调 skill 的 upload_article_image.sh, 拿 mmbiz 永久 URL.

    脚本依赖 ~/.wechat-article-config 的 wechat_appid / wechat_appsecret.
    脚本 stdout 输出 URL, stderr 输 log 文本. 失败抛 WechatScriptError.
    """
    if not image_path.exists():
        raise WechatScriptError(f"头像文件不存在: {image_path}")
    scripts_dir = skill_loader.load_skill(SKILL_SLUG)["scripts_dir"]
    script = scripts_dir / "upload_article_image.sh"
    if not script.exists():
        raise WechatScriptError(f"上传脚本不存在: {script}")
    r = _run(["bash", str(script), str(image_path)], timeout=timeout, cwd=str(scripts_dir))
    url = (r.stdout or "").strip().splitlines()[-1] if r.stdout.strip() else ""
    if not url.startswith("http"):
        raise WechatScriptError(f"upload_article_image 未输出 URL: stdout={r.stdout[-300:]}")
    return url


# 模板头像识别正则: <a href="...mp.weixin.qq.com/mp/profile_ext..."><img...></a>
# 这是 v3-clean 模板硬编码的头像锚, 全篇唯一. 只换这里的 img src.
_AVATAR_BLOCK_RE = re.compile(
    r'(<a\b[^>]*href="https?://mp\.weixin\.qq\.com/mp/profile_ext[^"]*"[^>]*>\s*'
    r'<img\b[^>]*?src=)(["\'])([^"\']*)\2',
    re.IGNORECASE | re.S,
)


def replace_template_avatar(html: str, new_url: str) -> tuple[str, int]:
    """把模板硬编码头像 img 的 src 换成 new_url. 返回 (新 html, 替换次数)."""
    if not new_url or not html:
        return html, 0
    count = 0
    def _sub(m: re.Match) -> str:
        nonlocal count
        count += 1
        return f"{m.group(1)}{m.group(2)}{new_url}{m.group(2)}"
    out = _AVATAR_BLOCK_RE.sub(_sub, html)
    return out, count


def push_to_wechat(
    title: str,
    digest: str,
    html_path: str,
    cover_path: str,
    author: str = "清华哥",
) -> dict[str, Any]:
    """调 push_to_wechat.sh 推送到草稿箱。需要 ~/.wechat-article-config 已配。

    D-042: 推送前 sanitize_for_push 清一道, 把清理后的 HTML 写到
    /tmp/preview/last_push_request.html 给脚本; 同时落 last_push_request.json
    含原 / 清理后字符数和被剥的元素统计, 失败时方便定位 errcode 45166 原因.
    """
    scripts_dir = skill_loader.load_skill(SKILL_SLUG)["scripts_dir"]
    script = scripts_dir / "push_to_wechat.sh"
    if not script.exists():
        raise WechatScriptError(f"推送脚本不存在: {script}")

    for p in [html_path, cover_path]:
        if not Path(p).exists():
            raise WechatScriptError(f"文件不存在: {p}")

    original_html = Path(html_path).read_text(encoding="utf-8")

    # ── D-046 头像合法上传 (在 sanitize 之前): 用户配 author_avatar_path 的话
    # 上传到 mmbiz 拿合法 URL, 替换模板硬编码头像 src. 失败 silent 跳, 退化到 D-045 剥头像.
    avatar_meta = {"path": None, "url": None, "replaced": 0, "error": None, "elapsed_sec": 0}
    cfg = _read_wechat_config()
    avatar_path_str = cfg.get("author_avatar_path") or ""
    if avatar_path_str:
        avatar_path = Path(avatar_path_str).expanduser()
        avatar_meta["path"] = str(avatar_path)
        if avatar_path.exists():
            try:
                t_av = time.time()
                new_url = upload_article_image(avatar_path)
                avatar_meta["url"] = new_url
                avatar_meta["elapsed_sec"] = round(time.time() - t_av, 1)
                replaced_html, n_replaced = replace_template_avatar(original_html, new_url)
                avatar_meta["replaced"] = n_replaced
                if n_replaced > 0:
                    original_html = replaced_html
            except Exception as e:
                avatar_meta["error"] = f"{type(e).__name__}: {e}"
        else:
            avatar_meta["error"] = "本地头像文件不存在"

    # ── D-042 推送前 sanitize ──
    clean_result = sanitize_for_push(original_html)
    sanitized_html = clean_result["clean"]

    # 落盘清理后的 html, 让脚本读这个 (而不是 raw 那个)
    sanitized_path = _DIAG_DIR / "last_push_request.html"
    sanitized_path.write_text(sanitized_html, encoding="utf-8")

    # 诊断 dump (D-043: rewritten · D-046: avatar)
    diag = {
        "title": title,
        "digest": digest,
        "author": author,
        "cover_path": cover_path,
        "original_html_path": str(html_path),
        "sanitized_html_path": str(sanitized_path),
        "original_chars": len(original_html),
        "sanitized_chars": len(sanitized_html),
        "img_count_original": len(re.findall(r"<img\b", original_html)),
        "img_count_sanitized": len(re.findall(r"<img\b", sanitized_html)),
        "removed": clean_result["removed"],
        "rewritten": clean_result.get("rewritten", {}),
        "avatar": avatar_meta,
    }
    (_DIAG_DIR / "last_push_request.json").write_text(
        json.dumps(diag, ensure_ascii=False, indent=2), encoding="utf-8",
    )

    t0 = time.time()
    r = _run([
        "bash", str(script),
        title, author, digest, str(sanitized_path), cover_path,
    ], timeout=90, cwd=str(scripts_dir))

    tail = r.stdout.strip().splitlines()[-20:]
    return {
        "ok": True,
        "stdout_tail": tail,
        "elapsed_sec": round(time.time() - t0, 1),
        "sanitize_removed": clean_result["removed"],
        "sanitize_rewritten": clean_result.get("rewritten", {}),
        "sanitized_html_path": str(sanitized_path),
        "avatar": avatar_meta,
    }


# ─── 异步 (D-037b6) ─────────────────────────────────────

def gen_section_image_async(prompt: str, size: str = "16:9", engine: str | None = None) -> str:
    """异步触发 gen_section_image, 立即返 task_id. 30-60s (apimart GPT-Image-2 + 微信图床上传).

    D-064: engine 透传给 gen_section_image. dreamina 当前不支持, 同步抛错.
    """
    from shortvideo import image_engine
    actual_engine = (engine or image_engine.get_default_engine()).lower()
    return tasks_service.run_async(
        kind="wechat.section-image",
        label=f"段间图 · {prompt[:32]}",
        ns="wechat",
        page_id="wechat",
        step="section-image",
        payload={"prompt_preview": prompt[:200], "size": size, "engine": actual_engine},
        estimated_seconds=45,
        progress_text=f"{actual_engine} 生图 ({size}) + 微信图床上传...",
        sync_fn=lambda: gen_section_image(prompt, size=size, engine=engine),
    )
