"""wechat_scripts._run 错误回报回归测试 (D-039)。

push_to_wechat.sh 等微信脚本把错误用 `echo "❌ ..."` 写到 stdout 而不是 >&2,
原版 _run 错误信息只展示 stderr 导致前端看到 "stderr: " 空字符串无法定位.
修复后失败时 stdout 也要附在错误信息里.
"""
from __future__ import annotations

import subprocess
from unittest.mock import patch

import pytest

from backend.services import wechat_scripts


def _make_completed(rc: int, stdout: str = "", stderr: str = ""):
    return subprocess.CompletedProcess(args=["dummy"], returncode=rc, stdout=stdout, stderr=stderr)


def test_run_failure_with_stderr_only():
    with patch.object(subprocess, "run", return_value=_make_completed(1, stderr="real error")):
        with pytest.raises(wechat_scripts.WechatScriptError) as exc:
            wechat_scripts._run(["bash", "x.sh"])
    msg = str(exc.value)
    assert "rc=1" in msg
    assert "real error" in msg


def test_run_failure_with_stdout_only_falls_back_to_stdout():
    """微信脚本典型情况: stderr 空, 错误在 stdout."""
    fake = _make_completed(1, stdout="❌ 配置文件不存在: /Users/x/.wechat-article-config", stderr="")
    with patch.object(subprocess, "run", return_value=fake):
        with pytest.raises(wechat_scripts.WechatScriptError) as exc:
            wechat_scripts._run(["bash", "push_to_wechat.sh", "title"])
    msg = str(exc.value)
    assert "stdout(tail)" in msg
    assert "配置文件不存在" in msg


def test_run_failure_with_both_stderr_and_stdout():
    fake = _make_completed(2, stdout="last log line", stderr="boom")
    with patch.object(subprocess, "run", return_value=fake):
        with pytest.raises(wechat_scripts.WechatScriptError) as exc:
            wechat_scripts._run(["bash", "x.sh"])
    msg = str(exc.value)
    assert "boom" in msg
    assert "last log line" in msg


def test_run_success_returns_completed_process():
    fake = _make_completed(0, stdout="ok\n", stderr="")
    with patch.object(subprocess, "run", return_value=fake):
        r = wechat_scripts._run(["echo", "hi"])
    assert r.returncode == 0
    assert r.stdout == "ok\n"


def test_gen_section_image_extracts_local_path_and_returns_media_url(tmp_path, monkeypatch):
    """gen_section_image 解析 stderr 里的 LOCAL_PATH 并拷贝到 data/wechat-images/."""
    # 准备一个 fake 本地图
    src = tmp_path / "fake.png"
    src.write_bytes(b"\x89PNG\r\n\x1a\nfake")

    # 重定向 DATA_DIR 到 tmp
    data_dir = tmp_path / "data"
    data_dir.mkdir()
    monkeypatch.setattr("shortvideo.config.DATA_DIR", data_dir)

    # mock skill_loader.script_path 返回一个 "存在" 的脚本
    fake_script = tmp_path / "gen_section_image.sh"
    fake_script.write_text("#!/bin/bash\necho mmbiz_url\n")
    monkeypatch.setattr(wechat_scripts.skill_loader, "script_path", lambda slug, name: fake_script)

    fake_proc = _make_completed(
        0,
        stdout=f"https://mmbiz.qpic.cn/abc/xxx\n",
        stderr=f"🎨 调 apimart 生图...\n💾 本地已存 {src}\n",
    )
    with patch.object(subprocess, "run", return_value=fake_proc):
        out = wechat_scripts.gen_section_image("一张测试图", size="16:9")

    assert out["mmbiz_url"] == "https://mmbiz.qpic.cn/abc/xxx"
    assert out["media_url"] is not None
    assert out["media_url"].startswith("/media/wechat-images/")
    assert out["local_path"] is not None
    # 本地拷贝确实落到了 data/wechat-images/
    copied = data_dir / "wechat-images"
    assert copied.exists()
    assert any(copied.iterdir()), "应至少有一张拷贝过来的图"


def test_gen_section_image_no_local_path_in_stderr_returns_none_media_url(tmp_path, monkeypatch):
    """旧脚本(没 echo 💾 行)时 media_url 退化到 None, 不报错."""
    fake_script = tmp_path / "gen_section_image.sh"
    fake_script.write_text("#!/bin/bash\necho mmbiz_url\n")
    monkeypatch.setattr(wechat_scripts.skill_loader, "script_path", lambda slug, name: fake_script)

    fake_proc = _make_completed(0, stdout="https://mmbiz.qpic.cn/aaa\n", stderr="(no local path line)")
    with patch.object(subprocess, "run", return_value=fake_proc):
        out = wechat_scripts.gen_section_image("p", size="16:9")
    assert out["mmbiz_url"] == "https://mmbiz.qpic.cn/aaa"
    assert out["media_url"] is None
    assert out["local_path"] is None
