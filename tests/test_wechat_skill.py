"""公众号 skill 接入单元测试 — 不打真 AI,只测编排逻辑。

- skill_loader 读 SKILL.md + references
- wechat_pipeline._extract_json 解析
- wechat_scripts._md_to_wechat_html 纯字符串变换
- wechat_scripts.assemble_html 模板注入(不跑 convert_to_wechat_markup.py)
真 AI / subprocess 测试在冒烟脚本里跑,用户端验证。
"""
from __future__ import annotations

from pathlib import Path

import pytest

from backend.services import skill_loader, wechat_pipeline, wechat_scripts


def test_skill_loader_reads_gongzhonghao():
    skill = skill_loader.load_skill("公众号文章")
    assert "who-is-qinghuage" in skill["references"]
    assert "style-bible" in skill["references"]
    assert "writing-methodology" in skill["references"]
    # SKILL.md 自身也读到了
    assert "Phase 0" in skill["skill_md"] or "phase 0" in skill["skill_md"].lower()


def test_skill_info_sizes_look_right():
    info = skill_loader.skill_info("公众号文章")
    assert info["references_total_chars"] > 20000, "references 加总应超 20K 字"
    assert info["skill_md_chars"] > 5000


def test_script_path_exists():
    p = skill_loader.script_path("公众号文章", "push_to_wechat.sh")
    assert p.exists(), f"push_to_wechat.sh 不存在: {p}"
    p = skill_loader.script_path("公众号文章", "convert_to_wechat_markup.py")
    assert p.exists()


def test_asset_path_template_v3():
    p = skill_loader.asset_path("公众号文章", "template-v3-clean.html")
    assert p.exists()
    body = p.read_text(encoding="utf-8")
    assert "hero-title" in body and "footer-fixed" in body


def test_skill_not_found():
    with pytest.raises(skill_loader.SkillNotFound):
        skill_loader.load_skill("不存在的-skill-xxx")


def test_extract_json_array():
    text = 'prefix ["a","b","c"] suffix'
    assert wechat_pipeline._extract_json(text, "array") == ["a", "b", "c"]


def test_extract_json_object():
    text = '回复: {"title":"x","n":3} 完'
    assert wechat_pipeline._extract_json(text, "object") == {"title": "x", "n": 3}


def test_extract_json_returns_none_on_garbage():
    assert wechat_pipeline._extract_json("没有 JSON 的文本", "array") is None


def test_md_to_html_basic():
    md = "# 标题\n\n第一段文字。\n\n## 小节\n\n第二段,**加粗**。\n\n---\n\n第三段。"
    html = wechat_scripts._md_to_wechat_html(md, [])
    # H1 被去掉(Hero 已展示)
    assert "<h1" not in html
    # H2 带 section-title class
    assert "section-title" in html
    # 加粗转换
    assert "<strong>加粗</strong>" in html
    # 分隔线
    assert "divider" in html


def test_md_to_html_inserts_section_images():
    md = "第一段\n\n第二段\n\n第三段\n\n第四段\n\n第五段\n\n第六段"
    imgs = [{"mmbiz_url": "http://a"}, {"mmbiz_url": "http://b"}]
    html = wechat_scripts._md_to_wechat_html(md, imgs)
    assert html.count("http://a") == 1
    assert html.count("http://b") == 1


def test_auto_digest_cuts_80_chars():
    md = "# 标题\n\n" + ("这是正文" * 40)
    digest = wechat_scripts._auto_digest(md)
    assert len(digest) <= 80
    assert digest.startswith("这是正文")


def test_auto_subtitle_picks_keywords():
    md = "今天说说护城河这事,老板们必看的三样底牌"
    sub = wechat_scripts._auto_subtitle(md)
    parts = sub.split(" · ")
    assert len(parts) == 3
    assert all(len(p) >= 2 for p in parts)
