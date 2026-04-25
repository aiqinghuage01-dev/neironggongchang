"""头像合法上传测试 (D-046).

替换 + upload helper 都 mock-friendly. 真 push 流程没法本地验证, 留给清华哥
醒来配 author_avatar_path 后试用.
"""
from __future__ import annotations

import subprocess
from pathlib import Path
from unittest.mock import patch

import pytest

from backend.services import wechat_scripts


# ─── replace_template_avatar 单元 ─────────────────────────

def test_replace_template_avatar_v3_clean_block():
    """v3-clean 模板的标准头像块: <a href="...profile_ext..."><img src="..."/></a>"""
    html = (
        '<a href="https://mp.weixin.qq.com/mp/profile_ext?action=home&amp;__biz=ABC#wechat_redirect">'
        '<img alt="清华哥" height="88" src="http://mmbiz.qpic.cn/mmbiz_png/g1XX.../0?from=appmsg" '
        'style="width:88px" width="88"/></a>'
    )
    new_url = "https://mmbiz.qpic.cn/mmbiz_png/freshupload/0"
    out, n = wechat_scripts.replace_template_avatar(html, new_url)
    assert n == 1
    assert "g1XX.../0?from=appmsg" not in out
    assert new_url in out
    # 仍保留 <a> 包装 + 其它 attrs (alt height width style)
    assert 'alt="清华哥"' in out
    assert "profile_ext" in out


def test_replace_template_avatar_no_match():
    """没有 profile_ext 锚的图保持不动."""
    html = '<p><img src="https://mmbiz.qpic.cn/section/1/0"/></p>'
    out, n = wechat_scripts.replace_template_avatar(html, "https://mmbiz.qpic.cn/new/x")
    assert n == 0
    assert out == html


def test_replace_template_avatar_empty_inputs():
    out, n = wechat_scripts.replace_template_avatar("", "https://x")
    assert n == 0
    assert out == ""
    out, n = wechat_scripts.replace_template_avatar("<a><img src='x'/></a>", "")
    assert n == 0


def test_replace_template_avatar_only_replaces_avatar_not_section():
    """页面上有头像 + 段间图, 只换头像, 段间图不动."""
    html = (
        '<p>正文</p>'
        '<p><img src="https://mmbiz.qpic.cn/section1/0" alt="段间图1"/></p>'
        '<a href="https://mp.weixin.qq.com/mp/profile_ext?abc"><img src="http://mmbiz.qpic.cn/avatar/x?from=appmsg"/></a>'
        '<p><img src="https://mmbiz.qpic.cn/section2/0" alt="段间图2"/></p>'
    )
    new_url = "https://mmbiz.qpic.cn/freshavatar/0"
    out, n = wechat_scripts.replace_template_avatar(html, new_url)
    assert n == 1
    assert "section1/0" in out  # 段间图保留
    assert "section2/0" in out  # 段间图保留
    assert new_url in out         # 头像换了
    assert "avatar/x?from=appmsg" not in out


# ─── upload_article_image (mock subprocess) ──────────────

def _make_completed(rc: int, stdout: str = "", stderr: str = ""):
    return subprocess.CompletedProcess(args=["dummy"], returncode=rc, stdout=stdout, stderr=stderr)


def test_upload_article_image_success(tmp_path, monkeypatch):
    """脚本 stdout 输出 mmbiz URL → helper 返回该 URL."""
    fake_img = tmp_path / "avatar.jpg"
    fake_img.write_bytes(b"\xff\xd8\xff\xe0fakeJPEG")

    fake_proc = _make_completed(0, stdout="https://mmbiz.qpic.cn/mmbiz_jpg/uploaded/0\n", stderr="")
    with patch.object(subprocess, "run", return_value=fake_proc):
        url = wechat_scripts.upload_article_image(fake_img)
    assert url == "https://mmbiz.qpic.cn/mmbiz_jpg/uploaded/0"


def test_upload_article_image_missing_file_raises(tmp_path):
    nonexistent = tmp_path / "nope.jpg"
    with pytest.raises(wechat_scripts.WechatScriptError) as exc:
        wechat_scripts.upload_article_image(nonexistent)
    assert "不存在" in str(exc.value)


def test_upload_article_image_script_failure_raises(tmp_path, monkeypatch):
    fake_img = tmp_path / "avatar.jpg"
    fake_img.write_bytes(b"x")
    fake_proc = _make_completed(1, stdout="", stderr="appsecret 不对")
    with patch.object(subprocess, "run", return_value=fake_proc):
        with pytest.raises(wechat_scripts.WechatScriptError) as exc:
            wechat_scripts.upload_article_image(fake_img)
    assert "appsecret 不对" in str(exc.value)


def test_upload_article_image_no_url_in_stdout(tmp_path, monkeypatch):
    fake_img = tmp_path / "avatar.jpg"
    fake_img.write_bytes(b"x")
    fake_proc = _make_completed(0, stdout="some log\n(end)\n", stderr="")
    with patch.object(subprocess, "run", return_value=fake_proc):
        with pytest.raises(wechat_scripts.WechatScriptError) as exc:
            wechat_scripts.upload_article_image(fake_img)
    assert "未输出 URL" in str(exc.value)


# ─── _read_wechat_config ─────────────────────────────────

def test_read_wechat_config_missing_returns_empty(monkeypatch):
    monkeypatch.setattr(wechat_scripts, "_WECHAT_CONFIG_PATH", Path("/tmp/nonexistent-wechat-cfg.json"))
    assert wechat_scripts._read_wechat_config() == {}


def test_read_wechat_config_malformed_returns_empty(tmp_path, monkeypatch):
    p = tmp_path / "cfg.json"
    p.write_text("{not json", encoding="utf-8")
    monkeypatch.setattr(wechat_scripts, "_WECHAT_CONFIG_PATH", p)
    assert wechat_scripts._read_wechat_config() == {}


def test_read_wechat_config_valid(tmp_path, monkeypatch):
    p = tmp_path / "cfg.json"
    p.write_text('{"wechat_appid": "wxabc", "author_avatar_path": "~/Desktop/avatar.jpg"}', encoding="utf-8")
    monkeypatch.setattr(wechat_scripts, "_WECHAT_CONFIG_PATH", p)
    cfg = wechat_scripts._read_wechat_config()
    assert cfg["wechat_appid"] == "wxabc"
    assert cfg["author_avatar_path"] == "~/Desktop/avatar.jpg"
