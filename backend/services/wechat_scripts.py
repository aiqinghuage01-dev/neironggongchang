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

from backend.services import skill_loader

SKILL_SLUG = "公众号文章"

# 产物临时目录(skill 脚本里 /tmp/preview/ 是约定)
PREVIEW_DIR = Path("/tmp/preview")
PREVIEW_DIR.mkdir(parents=True, exist_ok=True)


class WechatScriptError(RuntimeError):
    pass


def _run(cmd: list[str], *, timeout: int = 180, cwd: str | None = None) -> subprocess.CompletedProcess:
    """跑 subprocess,失败抛 WechatScriptError 带 stderr。"""
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
        raise WechatScriptError(
            f"脚本失败 rc={r.returncode}: {' '.join(cmd[:3])}\n"
            f"stderr: {r.stderr.strip()[-600:]}"
        )
    return r


# ─── Phase 2.5 · 段间配图 ─────────────────────────────────────

def gen_section_image(prompt: str, size: str = "16:9") -> dict[str, Any]:
    """给一段文字生图,上传微信图床,返回 mmbiz 永久 URL。

    耗时 30-60s(生图 25-50s + 上传 5-10s)。
    """
    script = skill_loader.script_path(SKILL_SLUG, "gen_section_image.sh")
    if not script.exists():
        raise WechatScriptError(f"脚本不存在: {script}")

    t0 = time.time()
    r = _run(["bash", str(script), prompt, "--size", size], timeout=600)
    mmbiz_url = r.stdout.strip().splitlines()[-1] if r.stdout.strip() else ""
    if not mmbiz_url.startswith("http"):
        raise WechatScriptError(f"生图脚本未输出 URL: stdout={r.stdout[-300:]}")
    return {
        "mmbiz_url": mmbiz_url,
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
    ai = get_ai_client()
    from backend.services import wechat_pipeline as wp
    r = ai.chat(prompt, system=system, deep=False, temperature=0.7, max_tokens=1500)
    arr = wp._extract_json(r.text, "array") or []
    return [
        {
            "section_hint": (x.get("section_hint") or "").strip(),
            "image_prompt": (x.get("image_prompt") or "").strip(),
        }
        for x in arr
        if isinstance(x, dict) and x.get("image_prompt")
    ][:n]


# ─── Phase 3 · HTML 拼装 + 微信 markup 转换 ───────────────────

def _load_template() -> str:
    p = skill_loader.asset_path(SKILL_SLUG, "template-v3-clean.html")
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
) -> dict[str, Any]:
    """把长文 Markdown + 段间图 URL 拼成可贴的 V3 Clean HTML,
    再调 convert_to_wechat_markup.py 转成微信 markup。

    返回:
      raw_html_path: /tmp/preview/wechat_article_raw.html
      wechat_html_path: /tmp/preview/wechat_article.html
      meta_path: /tmp/preview/article_meta.json
      wechat_html: 转换后 HTML 字符串(给前端预览)
    """
    template = _load_template()

    # hero 默认值:取标题前 10 字,副标题从正文抽 3 个关键词占位
    if not hero_highlight:
        hero_highlight = title[:8]
    if not hero_subtitle:
        hero_subtitle = _auto_subtitle(content_md)

    # Markdown → HTML body(用简单正则,不引入 markdown lib,
    # 因为 skill 写的长文本就是段落式,H2 很少)
    body_html = _md_to_wechat_html(content_md, section_images or [])

    digest = _auto_digest(content_md)
    author_url = _read_asset_text("avatar-wechat-url.txt").strip() or ""

    # 把 body 塞进 template 里 .article-body > .content 的位置
    # template-v3-clean.html 本身是完整 HTML,我们做字符串替换
    hero_title_html = f'{title[:6]}<span class="hero-highlight">{hero_highlight}</span>'
    html = _inject_into_template(
        template,
        title=title,
        hero_badge=hero_badge,
        hero_title_html=hero_title_html,
        hero_subtitle=hero_subtitle,
        body_html=body_html,
        avatar_url=author_url,
    )

    raw_path = PREVIEW_DIR / "wechat_article_raw.html"
    raw_path.write_text(html, encoding="utf-8")

    wechat_path = PREVIEW_DIR / "wechat_article.html"
    meta_path = PREVIEW_DIR / "article_meta.json"

    scripts_dir = skill_loader.load_skill(SKILL_SLUG)["scripts_dir"]
    converter = scripts_dir / "convert_to_wechat_markup.py"
    _run([
        "python3", str(converter),
        "--input", str(raw_path),
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
        "wechat_html": wechat_path.read_text(encoding="utf-8"),
        "title": title,
        "digest": digest,
    }


def _md_to_wechat_html(md: str, section_images: list[dict[str, str]]) -> str:
    """简易 MD→HTML: 只处理 # / ## / 段落 / 加粗,并按段落数均匀插图。"""
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
        url = item.get("mmbiz_url") or ""
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
    t = re.sub(
        r'(<div class="hero-badge"[^>]*>)[^<]*(</div>)',
        rf'\g<1>{hero_badge}\g<2>',
        t, count=1,
    )
    # 替换 hero-title 整个 innerHTML
    t = re.sub(
        r'(<div class="hero-title"[^>]*>)[\s\S]*?(</div>)',
        rf'\g<1>{hero_title_html}\g<2>',
        t, count=1,
    )
    # 替换 hero-subtitle
    t = re.sub(
        r'(<div class="hero-subtitle"[^>]*>)[^<]*(</div>)',
        rf'\g<1>{hero_subtitle}\g<2>',
        t, count=1,
    )
    # 替换 content 内容
    t = re.sub(
        r'(<div class="content"[^>]*>)[\s\S]*?(</div>\s*</div>\s*<div class="footer-fixed")',
        rf'\g<1>\n{body_html}\n\g<2>',
        t, count=1,
    )
    # 替换头像 URL(如果 template 里是占位符)
    if avatar_url:
        t = re.sub(r'src="\{[^}]*avatar[^}]*\}"', f'src="{avatar_url}"', t)
        t = t.replace("{avatar_wechat_url}", avatar_url)
    return t


def _auto_subtitle(md: str) -> str:
    """从正文首段抽 3 个短关键词做副标题占位。"""
    first = ""
    for ln in md.splitlines():
        s = ln.strip()
        if s and not s.startswith("#") and not s.startswith("---"):
            first = s
            break
    words = re.findall(r"[一-龥]{2,6}", first)
    picks = words[:3] if len(words) >= 3 else (words + ["老板必看", "实体", "AI"])[:3]
    return " · ".join(picks)


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


# ─── Phase 4 · 封面 900×383 ──────────────────────────────────

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

def push_to_wechat(
    title: str,
    digest: str,
    html_path: str,
    cover_path: str,
    author: str = "清华哥",
) -> dict[str, Any]:
    """调 push_to_wechat.sh 推送到草稿箱。需要 ~/.wechat-article-config 已配。"""
    scripts_dir = skill_loader.load_skill(SKILL_SLUG)["scripts_dir"]
    script = scripts_dir / "push_to_wechat.sh"
    if not script.exists():
        raise WechatScriptError(f"推送脚本不存在: {script}")

    for p in [html_path, cover_path]:
        if not Path(p).exists():
            raise WechatScriptError(f"文件不存在: {p}")

    t0 = time.time()
    r = _run([
        "bash", str(script),
        title, author, digest, html_path, cover_path,
    ], timeout=90, cwd=str(scripts_dir))

    tail = r.stdout.strip().splitlines()[-20:]
    return {
        "ok": True,
        "stdout_tail": tail,
        "elapsed_sec": round(time.time() - t0, 1),
    }
