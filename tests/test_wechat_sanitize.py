"""sanitize_for_push 测试 (D-042) — 推送前剥掉 errcode 45166 雷区元素.

⚠️ 重要诚实说明:
本地没 WeChat draft/add sandbox, 没法 100% 验证 sanitize 后能 push 通.
这些测试只验证 "我们想剥的东西被剥了". 真正的 45166 修复要靠用户重试 +
看 /tmp/preview/last_push_request.{html,json} 反馈.
"""
from __future__ import annotations

import pytest

from backend.services.wechat_scripts import sanitize_for_push


def test_strips_template_avatar_block_with_appmsg():
    """模板硬编码的头像 (http + ?from=appmsg) — 这是 D-042 怀疑的 45166 主犯."""
    html = '''
    <section><a href="https://mp.weixin.qq.com/x"><img class="author-avatar" alt="清华哥"
      src="http://mmbiz.qpic.cn/mmbiz_png/abc/0?from=appmsg"
      style="width:88px"/></a></section>'''
    r = sanitize_for_push(html)
    assert "<img" not in r["clean"]
    assert "from=appmsg" not in r["clean"]
    # 空的 <a></a> 也清干净
    assert "<a " not in r["clean"]
    assert r["removed"].get("img_from_appmsg", 0) == 1


def test_strips_http_only_img_keeps_https_mmbiz():
    """https://mmbiz.qpic.cn 留, http://mmbiz.qpic.cn 剥."""
    html = (
        '<p><img src="https://mmbiz.qpic.cn/good/abc"/></p>'
        '<p><img src="http://mmbiz.qpic.cn/old/xyz"/></p>'
    )
    r = sanitize_for_push(html)
    assert "https://mmbiz.qpic.cn/good/abc" in r["clean"]
    assert "http://mmbiz.qpic.cn/old/xyz" not in r["clean"]
    assert r["removed"].get("img_http_only", 0) == 1


def test_strips_external_image_apimart():
    """非 mmbiz / qlogo 域的图 (e.g. apimart) 剥掉."""
    html = '<p><img src="https://apimart.example.com/foo.png"/></p>'
    r = sanitize_for_push(html)
    assert "<img" not in r["clean"]
    assert r["removed"].get("img_external", 0) == 1


def test_keeps_mp_weixin_anchor():
    html = '<a href="https://mp.weixin.qq.com/s/xxx">点这</a>'
    r = sanitize_for_push(html)
    assert r["clean"] == html
    assert "a_external" not in r["removed"]


def test_unwraps_external_anchor_keeps_text():
    html = '<a href="https://example.com/article">外站好文</a>'
    r = sanitize_for_push(html)
    assert "<a " not in r["clean"]
    assert "外站好文" in r["clean"]
    assert r["removed"].get("a_external", 0) == 1


def test_strips_dangerous_tags():
    html = (
        '<p>OK</p>'
        '<script>alert(1)</script>'
        '<iframe src="x"></iframe>'
        '<form><input type="text"/></form>'
    )
    r = sanitize_for_push(html)
    assert "<script" not in r["clean"]
    assert "<iframe" not in r["clean"]
    assert "<form" not in r["clean"]
    assert "<input" not in r["clean"]
    assert "<p>OK</p>" in r["clean"]
    assert r["removed"].get("<script>", 0) >= 1
    assert r["removed"].get("<iframe>", 0) >= 1


def test_real_failed_payload_avatar_removed():
    """用 /tmp/preview/wechat_article.html 那种真实结构跑一遍, 验证 sanitize 有效."""
    html = '''<section style="max-width:580px">
<section align="center" style="padding:32px"><a href="https://mp.weixin.qq.com/mp/profile_ext?action=home&amp;__biz=MzkxMzQ0ODk4Ng==#wechat_redirect"><img alt="清华哥" height="88" src="http://mmbiz.qpic.cn/mmbiz_png/g1XXDunwiaWQhxtM4CtQDe6Y0cZ4Zhq7GpKibRWp1nxqQI6WQ4w0SkLY2LTZcx33nQgyfq0zt07KEj7So6OBgoQHOOMdubnZUalLn4UAibgIss/0?from=appmsg" style="width:88px" width="88"/></a></section>
<p>正文</p>
<p><img src="https://mmbiz.qpic.cn/mmbiz_jpg/section1/0?from=appmsg" /></p>
</section>'''
    r = sanitize_for_push(html)
    # 模板头像应该没了
    assert "g1XXDunwiaWQhxtM4CtQDe6Y0cZ4Zhq7Gp" not in r["clean"]
    # section1 那张也是 ?from=appmsg, 应该也没了 (符合 sanitize 规则)
    assert "section1/0?from=appmsg" not in r["clean"]
    # 正文保留
    assert "正文" in r["clean"]
    # 至少 2 张 from=appmsg 被干掉
    assert r["removed"].get("img_from_appmsg", 0) >= 2


def test_empty_html_returns_empty():
    r = sanitize_for_push("")
    assert r["clean"] == ""
    assert r["removed"] == {}


def test_single_quote_attrs():
    """单引号 attr 也要识别."""
    html = "<img src='http://mmbiz.qpic.cn/x'>"
    r = sanitize_for_push(html)
    assert "<img" not in r["clean"]
    assert r["removed"].get("img_http_only", 0) == 1
