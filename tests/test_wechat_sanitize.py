"""sanitize_for_push 测试 (D-042 + D-043).

D-043 修正: 不再把 ?from=appmsg / http:// 的图整剥, 改成"清 URL 保 img":
  http://mmbiz/qlogo → https://    (rewrite, 保 img)
  ?from=appmsg / &from=appmsg     → strip (rewrite, 保 img)
  域名外链 (apimart 等)             → 整剥 (推不上)

⚠️ 诚实: 没有 WeChat sandbox, 真 push 通不通要靠用户验证.
"""
from __future__ import annotations

import pytest

from backend.services.wechat_scripts import sanitize_for_push, _clean_img_url


# ─── _clean_img_url 单元 ──────────────────────────────────────

def test_clean_img_url_http_to_https():
    new, ch = _clean_img_url("http://mmbiz.qpic.cn/abc")
    assert new == "https://mmbiz.qpic.cn/abc"
    assert "http→https" in ch


def test_clean_img_url_strip_from_appmsg_only_query():
    new, ch = _clean_img_url("https://mmbiz.qpic.cn/abc?from=appmsg")
    assert new == "https://mmbiz.qpic.cn/abc"
    assert "strip ?from=appmsg" in ch


def test_clean_img_url_strip_from_appmsg_with_other_params():
    new, ch = _clean_img_url("https://mmbiz.qpic.cn/abc?from=appmsg&wx_fmt=png")
    # ?from=appmsg → 剥成 ? 然后保留后续  · 当前实现退化到 ?wx_fmt=png 是 OK 的
    assert "from=appmsg" not in new
    assert "wx_fmt=png" in new


def test_clean_img_url_strip_from_appmsg_amp():
    new, ch = _clean_img_url("https://mmbiz.qpic.cn/abc?wx_fmt=png&from=appmsg")
    assert "from=appmsg" not in new
    assert "wx_fmt=png" in new


def test_clean_img_url_no_change():
    new, ch = _clean_img_url("https://mmbiz.qpic.cn/abc")
    assert new == "https://mmbiz.qpic.cn/abc"
    assert ch == []


def test_clean_img_url_combo_http_and_appmsg():
    new, ch = _clean_img_url("http://mmbiz.qpic.cn/abc?from=appmsg")
    assert new == "https://mmbiz.qpic.cn/abc"
    assert "http→https" in ch
    assert "strip ?from=appmsg" in ch


# ─── sanitize_for_push 集成 ────────────────────────────────────

def test_template_avatar_url_cleaned_not_stripped():
    """D-043 改动: 模板头像 URL 该保留, 只清 URL."""
    html = ('<a href="https://mp.weixin.qq.com/x">'
            '<img class="author-avatar" src="http://mmbiz.qpic.cn/g1XX.../0?from=appmsg"/></a>')
    r = sanitize_for_push(html)
    # img 应该还在 (D-042 是整剥, 误伤)
    assert "<img" in r["clean"]
    assert "class=\"author-avatar\"" in r["clean"]
    # URL 应该被规整
    assert "https://mmbiz.qpic.cn/g1XX.../0" in r["clean"]
    assert "http://" not in r["clean"]
    assert "from=appmsg" not in r["clean"]
    # rewrite 计数 ≥ 1
    assert r["rewritten"].get("http→https", 0) == 1
    assert r["rewritten"].get("strip ?from=appmsg", 0) == 1
    # 不应有 img 被 removed
    assert "img_from_appmsg" not in r["removed"]
    assert "img_http_only" not in r["removed"]


def test_section_image_with_appmsg_kept():
    """D-043: gen_section_image 上传后微信也回带 ?from=appmsg URL, 必须保留."""
    html = '<p><img src="https://mmbiz.qpic.cn/section1?from=appmsg"/></p>'
    r = sanitize_for_push(html)
    assert "<img" in r["clean"]
    assert "section1" in r["clean"]
    assert "from=appmsg" not in r["clean"]


def test_external_image_apimart_still_stripped():
    """非 mmbiz/qlogo 域名仍然整剥 (推不上去)."""
    html = '<p><img src="https://apimart.example.com/foo.png"/></p>'
    r = sanitize_for_push(html)
    assert "<img" not in r["clean"]
    assert r["removed"].get("img_external", 0) == 1


def test_dangerous_tags_still_stripped():
    html = ('<p>OK</p>'
            '<script>alert(1)</script>'
            '<iframe src="x"></iframe>'
            '<form><input type="text"/></form>')
    r = sanitize_for_push(html)
    assert "<script" not in r["clean"]
    assert "<iframe" not in r["clean"]
    assert "<form" not in r["clean"]
    assert "<input" not in r["clean"]
    assert "<p>OK</p>" in r["clean"]


def test_keeps_mp_weixin_anchor():
    html = '<a href="https://mp.weixin.qq.com/s/xxx">点这</a>'
    r = sanitize_for_push(html)
    assert r["clean"] == html


def test_unwraps_external_anchor_keeps_text():
    html = '<a href="https://example.com/article">外站好文</a>'
    r = sanitize_for_push(html)
    assert "<a " not in r["clean"]
    assert "外站好文" in r["clean"]
    assert r["removed"].get("a_external", 0) == 1


def test_real_failed_payload_avatar_now_kept_url_cleaned():
    """复跑用户失败那篇的真实结构 — D-043 后头像保留 + URL 干净."""
    html = '''<section style="max-width:580px">
<section align="center" style="padding:32px"><a href="https://mp.weixin.qq.com/mp/profile_ext?action=home&amp;__biz=MzkxMzQ0ODk4Ng==#wechat_redirect"><img alt="清华哥" height="88" src="http://mmbiz.qpic.cn/mmbiz_png/g1XXDunwiaWQhxtM4CtQDe6Y0cZ4Zhq7GpKibRWp1nxqQI6WQ4w0SkLY2LTZcx33nQgyfq0zt07KEj7So6OBgoQHOOMdubnZUalLn4UAibgIss/0?from=appmsg" style="width:88px" width="88"/></a></section>
<p>正文</p>
<p><img src="https://mmbiz.qpic.cn/mmbiz_jpg/section1/0?from=appmsg" /></p>
</section>'''
    r = sanitize_for_push(html)
    # 头像现在保留
    assert 'class' in r["clean"] or 'alt="清华哥"' in r["clean"]
    assert "g1XXDunwiaWQhxtM4CtQDe6Y0cZ4Zhq7Gp" in r["clean"]
    # 段间图也保留
    assert "section1" in r["clean"]
    # URL 都已规整
    assert "from=appmsg" not in r["clean"]
    assert "http://mmbiz" not in r["clean"]
    # 计数: 2 张图都改了
    assert r["rewritten"].get("strip ?from=appmsg", 0) == 2
    assert r["rewritten"].get("http→https", 0) == 1


def test_image_without_src_stripped():
    html = '<img alt="x"/>'
    r = sanitize_for_push(html)
    assert "<img" not in r["clean"]
    assert r["removed"].get("img_no_src", 0) == 1


def test_empty_html_returns_empty():
    r = sanitize_for_push("")
    assert r["clean"] == ""
    assert r["removed"] == {}
    assert r["rewritten"] == {}


def test_single_quote_attrs():
    html = "<img src='http://mmbiz.qpic.cn/x?from=appmsg'>"
    r = sanitize_for_push(html)
    assert "<img" in r["clean"]
    assert "https://mmbiz.qpic.cn/x" in r["clean"]
    assert "from=appmsg" not in r["clean"]
    assert "http://" not in r["clean"]
