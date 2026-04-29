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
