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


def test_hero_title_no_duplication_on_default():
    """D-048 真实 bug: 默认 hero_highlight 是 title[:8], 旧逻辑 prefix title[:6] 再
    高亮 hero_highlight, 用户文章看到 '一个餐饮老板一个餐饮老板花3' 重复显示.
    """
    title = "一个餐饮老板花3万学建站，我用AI免费搞定了"
    # 用户传的 hero_highlight = title[:8] (默认 frontend 这么干)
    h = wechat_scripts._compose_hero_title_html(title, title[:8])
    # 不应该重复显示前缀
    assert h.count("一个餐饮老板") <= 2  # 一次在前缀, 一次在 span 里
    # 但绝不能有 "一个餐饮老板一个餐饮老板" 这种连续重复
    assert "一个餐饮老板一个餐饮老板" not in h.replace('<span class="hero-highlight">', '').replace('</span>', '')


def test_hero_title_highlight_when_substring():
    title = "AI 时代, 老板的护城河变了"
    h = wechat_scripts._compose_hero_title_html(title, "护城河")
    assert '<span class="hero-highlight">护城河</span>' in h
    # 全文一次完整出现 (高亮替换 1 次)
    assert h.count("护城河") == 1
    assert "AI 时代" in h


def test_hero_title_no_highlight_when_not_substring():
    title = "AI 时代, 老板的护城河变了"
    # hero_highlight 不在 title 里 → 不该硬塞 span
    h = wechat_scripts._compose_hero_title_html(title, "外站不存在文字")
    assert h == title
    assert "<span" not in h


def test_hero_title_empty_highlight():
    title = "纯标题"
    h = wechat_scripts._compose_hero_title_html(title, "")
    assert h == "纯标题"
    assert "<span" not in h


def test_auto_subtitle_picks_phrases_by_punctuation():
    """D-048: 按标点切短语, 不再贪婪切 6 字大段."""
    md = "今天说说护城河, 老板必看, AI 时代底牌"
    sub = wechat_scripts._auto_subtitle(md)
    parts = sub.split(" · ")
    assert len(parts) == 3
    assert all(2 <= len(p) <= 14 for p in parts)


def test_auto_subtitle_long_continuous_chinese_falls_back_to_first_30():
    """D-048 真实 bug 场景: 用户文章首段连续中文无标点, 旧逻辑切 6 字段不可读."""
    md = "上周一个开火锅店的老板给我看他的品牌官网我当场愣住了"
    sub = wechat_scripts._auto_subtitle(md)
    # 新行为: 整句太长 (>14) 被 phrase filter 滤掉, 退化到首段前 30 字 (连贯, 而非 3 段切割).
    # 不应出现旧 bug 的 "上周一个开火 · 锅店的老板给 · 我看他的品牌" 三段切分.
    assert sub.count(" · ") == 0, f"不该有 ' · ' 切分, 实际: {sub!r}"
    # 应是连贯文本前缀 (允许末尾 ……)
    assert sub.startswith("上周一个")
    assert len(sub) <= 31  # 30 字 + 末尾 …


def test_auto_subtitle_with_punctuation_in_real_article():
    """实战场景: 首段有标点, 应抽 3 个语义完整的短语."""
    md = "上周一个开火锅店的老板给我看他的品牌官网, 我当场愣住了。"
    sub = wechat_scripts._auto_subtitle(md)
    parts = sub.split(" · ")
    # 应该 1-3 段, 每段都是完整短语
    assert all(2 <= len(p) <= 14 for p in parts)
    assert "锅店" not in " ".join(parts) or "我看他的品牌" not in " ".join(parts) or any(len(p) >= 8 for p in parts)
