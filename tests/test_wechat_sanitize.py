"""sanitize_for_push 测试 (D-042 → D-043 → D-045).

D-045 复活 D-042 的 "?from=appmsg 整剥" 策略 (D-043 改"清 URL 留 img"被实测打脸):
  ?from=appmsg / &from=appmsg     → 整剥 (是"非己公众号资源"天然标记)
  http://mmbiz/qlogo → https://    (干净 URL 才规整保留)
  域名外链 (apimart 等)             → 整剥 (推不上)

D-045 真实证据: 用户重试 D-043 sanitize 后的 HTML, 头像 URL 已 clean (无 ?from=appmsg
+ https), 但 WeChat 仍报 errcode 45166 — 说明 mmbiz 资源 ID 本身就是别人账号的,
URL 清干净也救不了, 必须整剥.
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

def test_template_avatar_with_appmsg_stripped():
    """D-045 复活 D-042 策略: 模板头像 URL 即使域名 mmbiz, ?from=appmsg 整剥.
    理由: 这种 URL 是别家 msg 资源, 即便清 URL 也是别人账号 ID, WeChat 仍 45166.
    """
    html = ('<a href="https://mp.weixin.qq.com/x">'
            '<img class="author-avatar" src="http://mmbiz.qpic.cn/g1XX.../0?from=appmsg"/></a>')
    r = sanitize_for_push(html)
    # img 应该被整剥
    assert "<img" not in r["clean"]
    assert r["removed"].get("img_from_appmsg", 0) == 1
    # 空 <a></a> 也清掉
    assert "<a " not in r["clean"]


def test_section_image_no_appmsg_kept():
    """段间图 from gen_section_image.sh 经 uploadimg 上传, URL 没 ?from=appmsg, 留."""
    html = '<p><img src="https://mmbiz.qpic.cn/mmbiz_jpg/section1/0"/></p>'
    r = sanitize_for_push(html)
    assert "<img" in r["clean"]
    assert "section1" in r["clean"]


def test_http_mmbiz_without_appmsg_rewritten_to_https():
    """干净 mmbiz URL 只是协议是 http → 升 https 保留 img."""
    html = '<p><img src="http://mmbiz.qpic.cn/section/abc"/></p>'
    r = sanitize_for_push(html)
    assert "<img" in r["clean"]
    assert "https://mmbiz.qpic.cn/section/abc" in r["clean"]
    assert r["rewritten"].get("http→https", 0) == 1


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


def test_real_failed_payload_avatar_stripped_section_kept():
    """D-045: 模板硬编码头像 (?from=appmsg) 整剥; 干净段间图 (无 ?from=appmsg) 保留."""
    html = '''<section style="max-width:580px">
<section align="center" style="padding:32px"><a href="https://mp.weixin.qq.com/mp/profile_ext?action=home&amp;__biz=MzkxMzQ0ODk4Ng==#wechat_redirect"><img alt="清华哥" height="88" src="http://mmbiz.qpic.cn/mmbiz_png/g1XXDunwiaWQhxtM4CtQDe6Y0cZ4Zhq7GpKibRWp1nxqQI6WQ4w0SkLY2LTZcx33nQgyfq0zt07KEj7So6OBgoQHOOMdubnZUalLn4UAibgIss/0?from=appmsg" style="width:88px" width="88"/></a></section>
<p>正文</p>
<p><img src="https://mmbiz.qpic.cn/mmbiz_jpg/cleansectionimg/0" /></p>
</section>'''
    r = sanitize_for_push(html)
    # 头像被整剥
    assert "g1XXDunwiaWQhxtM4CtQDe6Y0cZ4Zhq7Gp" not in r["clean"]
    assert r["removed"].get("img_from_appmsg", 0) == 1
    # 段间图 (无 ?from=appmsg) 留
    assert "cleansectionimg" in r["clean"]


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
    # ?from=appmsg → 整剥
    assert "<img" not in r["clean"]
    assert r["removed"].get("img_from_appmsg", 0) == 1


def test_single_quote_attrs_clean_url_kept():
    """单引号 attr · 干净 mmbiz URL · http → https 规整保留."""
    html = "<img src='http://mmbiz.qpic.cn/clean'>"
    r = sanitize_for_push(html)
    assert "<img" in r["clean"]
    assert "https://mmbiz.qpic.cn/clean" in r["clean"]
