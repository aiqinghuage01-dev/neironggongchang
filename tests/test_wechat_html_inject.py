"""HTML 注入回归测试 (D-089).

历史 bug: `_inject_into_template` content 替换正则要求
`</div>\\s*</div>\\s*<div class="footer-fixed"`, 但 template-v3-clean.html 里
content + article-body 都是隐式不闭的 div, 实际不存在那个序列 → re.sub 静默
fail, content 区原 demo 占位被吐给前端, 4 张段间图也跟着被丢光.

老板今天 12:25 真踩到: Step 6 排版页面只看到模板自带的 demo 占位 (昨天中午,
工作室里就我一个人...), 4 张已生成的段间图都没插进 HTML.

fix: 用宽容区间 `<div class="content"...> ... <div class="footer-fixed"`
+ subn 检测命中 raise.
"""
from __future__ import annotations

import re

import pytest

from backend.services import skill_loader, wechat_scripts


# 真 template 路径 (~/Desktop/skills/公众号文章/assets/template-v3-clean.html)
TPL_PATH = skill_loader.asset_path("公众号文章", "template-v3-clean.html")


@pytest.fixture
def v3_template() -> str:
    if not TPL_PATH.exists():
        pytest.skip(f"v3-clean template 不存在: {TPL_PATH}")
    return TPL_PATH.read_text(encoding="utf-8")


# ─── _inject_into_template ─────────────────────────────────


def test_inject_replaces_demo_content(v3_template):
    """真 template + body_html → 替换掉 demo 占位."""
    body_html = "<p>这是真实文章正文。</p>"
    out = wechat_scripts._inject_into_template(
        v3_template,
        title="测试标题",
        hero_badge="老板必看",
        hero_title_html="测试标题",
        hero_subtitle="一句副标题",
        body_html=body_html,
        avatar_url="",
    )
    # body_html 真注入了
    assert "这是真实文章正文" in out
    # demo 占位被替换了 (template 自带的 "昨天中午,工作室里就我一个人")
    assert "昨天中午" not in out
    assert "工作室里就我一个人" not in out
    # 后段固定结尾仍在 (确认替换没把 footer 一起干掉)
    assert "footer-fixed" in out
    assert "放轻松，别着急，慢慢来" in out


def test_inject_keeps_4_section_images(v3_template):
    """body_html 里的 4 张段间图都得在 inject 之后的 HTML 里."""
    urls = [
        "http://mmbiz.qpic.cn/sz_mmbiz_jpg/aaa/0?from=appmsg",
        "http://mmbiz.qpic.cn/mmbiz_jpg/bbb/0?from=appmsg",
        "http://mmbiz.qpic.cn/sz_mmbiz_jpg/ccc/0?from=appmsg",
        "http://mmbiz.qpic.cn/mmbiz_jpg/ddd/0?from=appmsg",
    ]
    body_html = "<p>开头段</p>\n" + "\n".join(
        f'<p><img src="{u}" /></p>' for u in urls
    ) + "\n<p>结尾段</p>"

    out = wechat_scripts._inject_into_template(
        v3_template,
        title="T",
        hero_badge="B",
        hero_title_html="T",
        hero_subtitle="s",
        body_html=body_html,
        avatar_url="",
    )
    for u in urls:
        assert u in out, f"段间图 url 丢失: {u}"


def test_inject_replaces_hero_title(v3_template):
    """hero-title 区被替换."""
    out = wechat_scripts._inject_into_template(
        v3_template,
        title="日更一百条没火",
        hero_badge="X",
        hero_title_html='日更一百条<span class="hero-highlight">没火</span>',
        hero_subtitle="",
        body_html="<p>x</p>",
        avatar_url="",
    )
    assert "日更一百条" in out
    # template 默认 hero-title 文案 "这里放文章的" 应该被替换走
    assert "这里放文章的" not in out


def test_inject_raises_when_no_footer_anchor():
    """伪 template 没 footer-fixed div → 抛 WechatScriptError, 不静默吐残品.

    历史 bug: content 区正则不命中时 re.sub 返回原字符串, 用户看不到任何报错,
    但前端拿到带 demo 占位的脏 HTML.
    """
    fake_tpl = (
        '<div class="content">demo content here</div>'
        # 缺 footer-fixed
        '<div class="end"></div>'
    )
    with pytest.raises(wechat_scripts.WechatScriptError) as ei:
        wechat_scripts._inject_into_template(
            fake_tpl,
            title="t", hero_badge="b", hero_title_html="t",
            hero_subtitle="s", body_html="<p>x</p>", avatar_url="",
        )
    assert "注入失败" in str(ei.value)


def test_inject_raises_when_no_content_div():
    """伪 template 没 <div class="content"> → raise."""
    fake_tpl = '<div class="footer-fixed">end</div>'
    with pytest.raises(wechat_scripts.WechatScriptError):
        wechat_scripts._inject_into_template(
            fake_tpl,
            title="t", hero_badge="b", hero_title_html="t",
            hero_subtitle="s", body_html="<p>x</p>", avatar_url="",
        )


# ─── _md_to_wechat_html ───────────────────────────────────


def test_md_to_wechat_html_inserts_4_images_evenly():
    """76 段正文 + 4 张图 → 输出含 4 个 <img>, 间距 ~15 段."""
    paragraphs = [f"段落 {i}" for i in range(76)]
    md = "# 标题\n\n" + "\n\n".join(paragraphs)
    section_images = [
        {"mmbiz_url": f"http://mmbiz/img{i}/0?from=appmsg"} for i in range(1, 5)
    ]
    out = wechat_scripts._md_to_wechat_html(md, section_images)
    # 4 张图都贴进去
    img_count = len(re.findall(r"<img\b", out))
    assert img_count == 4, f"应该 4 张, 实际 {img_count}"
    # 4 张图的 url 都在
    for i in range(1, 5):
        assert f"img{i}" in out


def test_md_to_wechat_html_no_images_when_empty():
    """没传段间图 → 输出不含 <img>."""
    md = "# 标题\n\n段落 A\n\n段落 B"
    out = wechat_scripts._md_to_wechat_html(md, [])
    assert "<img" not in out
    assert "段落 A" in out
    assert "段落 B" in out


# ─── D-090 双 URL 策略 ────────────────────────────────────


def test_md_to_wechat_html_prefer_media_uses_local_proxy():
    """prefer_media=True → 用 media_url, 拼绝对前缀 http://127.0.0.1:8000/media/...
    避开 mmbiz.qpic.cn 防盗链 ('未经允许不可引用')."""
    md = "# 标题\n\n段 1\n\n段 2\n\n段 3\n\n段 4"
    section_images = [
        {"mmbiz_url": "http://mmbiz.qpic.cn/sz_mmbiz_jpg/aaa/0?from=appmsg",
         "media_url": "/media/wechat-images/abc.jpg"},
    ]
    out = wechat_scripts._md_to_wechat_html(md, section_images, prefer_media=True)
    # 用 media_url 拼绝对地址
    assert "http://127.0.0.1:8000/media/wechat-images/abc.jpg" in out
    # 不应该出现 mmbiz_url (前端预览页避防盗链)
    assert "mmbiz.qpic.cn" not in out


def test_md_to_wechat_html_prefer_media_falls_back_to_mmbiz_when_no_local():
    """prefer_media=True 但 media_url 缺 → 退化到 mmbiz_url, 不抛错."""
    md = "# 标题\n\n段 1\n\n段 2\n\n段 3\n\n段 4"
    section_images = [
        {"mmbiz_url": "http://mmbiz.qpic.cn/sz_mmbiz_jpg/aaa/0?from=appmsg"},
    ]
    out = wechat_scripts._md_to_wechat_html(md, section_images, prefer_media=True)
    # 退化到 mmbiz_url (老数据 / 拷贝失败)
    assert "mmbiz.qpic.cn/sz_mmbiz_jpg/aaa" in out


def test_md_to_wechat_html_push_uses_mmbiz_not_media():
    """prefer_media=False (推送) → 用 mmbiz_url, 不用 media_url, 让微信识别自家图床."""
    md = "# 标题\n\n段 1\n\n段 2\n\n段 3\n\n段 4"
    section_images = [
        {"mmbiz_url": "http://mmbiz.qpic.cn/sz_mmbiz_jpg/aaa/0?from=appmsg",
         "media_url": "/media/wechat-images/abc.jpg"},
    ]
    out = wechat_scripts._md_to_wechat_html(md, section_images, prefer_media=False)
    assert "mmbiz.qpic.cn/sz_mmbiz_jpg/aaa" in out
    # 推送 HTML 里不能含本地 /media/ 路径 (微信加载不到 + 暴露本地 ip)
    assert "/media/wechat-images" not in out
    assert "127.0.0.1:8000" not in out
    # D-111: 本次生成的段间图带内部标记, sanitize 用它区分历史 appmsg 外链.
    assert 'data-nrg-section-image="1"' in out


def test_md_to_wechat_html_preview_does_not_mark_local_proxy_images():
    """preview raw_html 走本地 media_url, 不需要 push 专用的内部信任标记."""
    md = "# 标题\n\n段 1\n\n段 2\n\n段 3\n\n段 4"
    section_images = [
        {"mmbiz_url": "http://mmbiz.qpic.cn/sz_mmbiz_jpg/aaa/0?from=appmsg",
         "media_url": "/media/wechat-images/abc.jpg"},
    ]
    out = wechat_scripts._md_to_wechat_html(md, section_images, prefer_media=True)
    assert "http://127.0.0.1:8000/media/wechat-images/abc.jpg" in out
    assert "data-nrg-section-image" not in out
