from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_wechat_copy_does_not_expose_layout_internals():
    src = (ROOT / "web/factory-wechat-v2.jsx").read_text(encoding="utf-8")
    forbidden = [
        'label: "HTML"',
        "拼 HTML",
        "HTML 还没生成",
        "HTML 路径丢失",
        "原 HTML:",
        "微信 markup:",
        "V3 Clean",
        "V2 Magazine",
        "V1 Dark",
        "Opus 本地 proxy",
        "~7200 token",
        "apimart gpt-image-2",
        "Chrome 模板封面",
        "mp.weixin.qq.com API",
    ]
    for text in forbidden:
        assert text not in src


def test_voice_copy_does_not_expose_transcription_internals():
    src = (ROOT / "web/factory-voicerewrite-v2.jsx").read_text(encoding="utf-8")
    forbidden = [
        "短视频 URL",
        "等短视频 URL",
        "走轻抖 ASR",
        "后端 ASR",
        "D-062bb-ext",
    ]
    for text in forbidden:
        assert text not in src


def test_beta_page_does_not_embed_internal_dashboard():
    src = (ROOT / "web/factory-beta.jsx").read_text(encoding="utf-8")
    assert "<iframe" not in src
    assert "src={AGENT_DASHBOARD_URL}" not in src


def test_beta_task_title_sanitizes_paths_and_internal_terms():
    src = (ROOT / "web/factory-beta.jsx").read_text(encoding="utf-8")
    assert "(?:~|\\/(?:Users|Volumes|Library|Applications|opt|srv|home|root|private|tmp|var))" in src
    assert "(?:https?:\\/\\/)?" in src
    assert "Bearer|Basic" in src
    assert "authorization|x[-_]?" in src
    assert r"(?:sk|tok)-" in src
    for token_piece in [
        '"submit" + "_id"',
        '"pro" + "mpt"',
        '"to" + "ken"',
        '"cre" + "dit"',
        '"watch" + "er"',
        '"dae" + "mon"',
        '"pro" + "vider"',
    ]:
        assert token_piece in src
    assert "betaDesensitizeText" in src
    assert r"\bstatus\s*[:=]\s*" in src


def test_beta_page_has_warroom_sections_and_no_iframe():
    src = (ROOT / "web/factory-beta.jsx").read_text(encoding="utf-8")
    assert "<iframe" not in src
    assert "src={AGENT_DASHBOARD_URL}" not in src
    for text in ["研发部作战室", "谁在干活", "当前任务", "研发现场", "日志与代码证据", "看日志摘要"]:
        assert text in src


def test_beta_page_static_copy_does_not_expose_internal_terms():
    src = (ROOT / "web/factory-beta.jsx").read_text(encoding="utf-8")
    forbidden = [
        "/Users/",
        "/private/",
        "OpenClaw",
        "DeepSeek",
        "Opus",
        "LLM",
        "API",
        "prompt",
        "tokens",
        "credits",
        "Downloads",
        "submit_id",
        "watcher",
        "daemon",
        "provider",
        "有人在跟",
    ]
    for text in forbidden:
        assert text not in src


def test_beta_sanitizer_and_evidence_fields_are_present():
    src = (ROOT / "web/factory-beta.jsx").read_text(encoding="utf-8")
    assert "safeLogText" in src
    assert "safeFileLabel" in src
    assert "agent_name" in src
    assert "claimed_by" in src
    assert "latest_commit" in src
    assert "task.commit" in src
    assert "task.report" in src
