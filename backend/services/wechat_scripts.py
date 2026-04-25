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

def gen_section_image(prompt: str, size: str = "16:9") -> dict[str, Any]:
    """给一段文字生图,上传微信图床,返回 mmbiz 永久 URL。

    耗时 30-60s(生图 25-50s + 上传 5-10s)。

    D-039 改: 同时把生成的图本地拷贝到 data/wechat-images/, 返回 media_url 给前端预览.
    原因: mmbiz.qpic.cn 有 referer 防盗链, 浏览器直接 <img src=mmbiz_url> 显示
    "未经允许不可引用" 占位图, 用户看不到真实图. HTML 拼装 / 推送公众号草稿仍用 mmbiz_url.
    """
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

    # Markdown → HTML body(用简单正则,不引入 markdown lib,
    # 因为 skill 写的长文本就是段落式,H2 很少)
    body_html = _md_to_wechat_html(content_md, section_images or [])

    digest = _auto_digest(content_md)
    author_url = _read_asset_text("avatar-wechat-url.txt").strip() or ""

    # 把 body 塞进 template 里 .article-body > .content 的位置
    # template-v3-clean.html 本身是完整 HTML,我们做字符串替换
    hero_title_html = f'{title[:6]}<span class="hero-highlight">{hero_highlight}</span>'
    html = _inject_into_template(
        template_html,
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
        "raw_html": raw_path.read_text(encoding="utf-8"),
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


# ─── Phase 4 · 封面 4 选 1 (D-035) ───────────────────────

COVER_STYLE_VARIANTS = [
    "现代简约风格,大留白,清爽冷色调,高级感",
    "暖色暖光,真实感照片,生活场景,自然氛围",
    "深色高对比,大字醒目,锐利冲击力",
    "复古胶片质感,80-90 年代色调,怀旧氛围",
]


def gen_cover_batch(title: str, n: int = 4) -> dict[str, Any]:
    """用 apimart GPT-Image-2 生 n 张候选封面 · 16:9 · 串行避免并发限制。"""
    from shortvideo.apimart import ApimartClient, ApimartError

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
    try:
        client = ApimartClient()
    except Exception as e:
        raise WechatScriptError(f"apimart 客户端初始化失败: {e}")

    with client as c:
        for i, p in enumerate(prompts):
            ts = int(time.time())
            out = cover_dir / f"wxcover_{ts}_{i}.png"
            try:
                res = c.generate_and_download(p, out, size="16:9")
                media_path = res.local_path or out
                media_url_path = None
                if media_target_dir and media_path and Path(media_path).exists():
                    import shutil
                    target = media_target_dir / Path(media_path).name
                    shutil.copy2(media_path, target)
                    try:
                        from shortvideo.config import DATA_DIR
                        media_url_path = "/media/" + str(target.relative_to(DATA_DIR)).replace("\\", "/")
                    except Exception:
                        pass
                results.append({
                    "index": i,
                    "prompt": p,
                    "style": COVER_STYLE_VARIANTS[i % len(COVER_STYLE_VARIANTS)],
                    "local_path": str(media_path) if media_path else None,
                    "media_url": media_url_path,
                    "elapsed_sec": getattr(res, "elapsed_sec", 0),
                })
            except ApimartError as e:
                results.append({
                    "index": i, "prompt": p,
                    "style": COVER_STYLE_VARIANTS[i % len(COVER_STYLE_VARIANTS)],
                    "error": str(e)[:200],
                })

    succeeded = [r for r in results if r.get("local_path")]
    return {
        "covers": results,
        "succeeded_count": len(succeeded),
        "total_count": len(results),
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


def sanitize_for_push(html: str) -> dict[str, Any]:
    """推送前清理 HTML, 降低 errcode 45166 风险.

    返回 {clean: str, removed: dict[str, int]} — 让调用方知道删了啥, 便于诊断.

    清理规则 (从最常见到最防御性):
      1. 干掉硬编码的非本草稿 mmbiz 头像 (template 里 ?from=appmsg 那种)
      2. 干掉 http:// 的图 (微信草稿要求 https)
      3. 干掉非 mmbiz/qlogo 域名的图 (apimart / 外链)
      4. <a> 指向非 mp.weixin.qq.com 的, 解 <a> 但保留内文
      5. <script> / <iframe> / <form> / <input> / <embed> / <object> /
         <video> / <audio> / <link> / <meta> 整条剥
    """
    if not html:
        return {"clean": "", "removed": {}}

    removed: dict[str, int] = {}
    out = html

    # 5) 整段 strip 的 tag (含内容). re.S = . 匹配换行
    DROP_TAGS = ("script", "iframe", "form", "input", "embed", "object",
                 "video", "audio", "link", "meta")
    for tag in DROP_TAGS:
        # 自闭合 + 配对都吃掉
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

    # 1+2+3) 处理 <img>: 看 src 决定保留还是剥
    img_re = re.compile(r"<img\b[^>]*\bsrc=([\"'])([^\"']*)\1[^>]*/?>", re.IGNORECASE)
    def _img_sub(m: re.Match) -> str:
        url = m.group(2)
        if "?from=appmsg" in url or "&from=appmsg" in url:
            removed["img_from_appmsg"] = removed.get("img_from_appmsg", 0) + 1
            return ""
        if url.startswith("http://"):
            removed["img_http_only"] = removed.get("img_http_only", 0) + 1
            return ""
        if not _ALLOWED_IMG_RE.match(url):
            removed["img_external"] = removed.get("img_external", 0) + 1
            return ""
        return m.group(0)
    out = img_re.sub(_img_sub, out)

    # 1b) <a href><img></a> 整段头像块: 上面 img 走了之后 <a> 里就空了, 顺手清掉
    out = re.sub(r"<a\b[^>]*>\s*</a>", "", out, flags=re.IGNORECASE | re.S)

    # 4) 非 mp.weixin.qq.com 的 <a>: 解 <a> 标签, 内文保留
    a_re = re.compile(r"<a\b[^>]*\bhref=([\"'])([^\"']*)\1[^>]*>(.*?)</a>", re.IGNORECASE | re.S)
    def _a_sub(m: re.Match) -> str:
        href = m.group(2)
        if any(href.startswith(p) for p in _ALLOWED_LINK_PREFIXES):
            return m.group(0)
        removed["a_external"] = removed.get("a_external", 0) + 1
        return m.group(3)  # 保留内文
    out = a_re.sub(_a_sub, out)

    return {"clean": out, "removed": removed}


# 落盘诊断目录, 失败时用户可以把这里的文件发给我精确定位
_DIAG_DIR = PREVIEW_DIR


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

    # ── D-042 推送前 sanitize ──
    original_html = Path(html_path).read_text(encoding="utf-8")
    clean_result = sanitize_for_push(original_html)
    sanitized_html = clean_result["clean"]

    # 落盘清理后的 html, 让脚本读这个 (而不是 raw 那个)
    sanitized_path = _DIAG_DIR / "last_push_request.html"
    sanitized_path.write_text(sanitized_html, encoding="utf-8")

    # 诊断 dump
    diag = {
        "title": title,
        "digest": digest,
        "author": author,
        "cover_path": cover_path,
        "original_html_path": str(html_path),
        "sanitized_html_path": str(sanitized_path),
        "original_chars": len(original_html),
        "sanitized_chars": len(sanitized_html),
        "removed": clean_result["removed"],
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
        "sanitized_html_path": str(sanitized_path),
    }
