from backend.services import kb


def _reset_kb(monkeypatch, root):
    monkeypatch.setattr(kb, "KB_ROOT", root)
    kb._tree_cache = {}
    kb._tree_cache_at = 0.0
    kb._index = None


def test_kb_tree_keeps_real_path_but_sanitizes_display_title(monkeypatch, tmp_path):
    root = tmp_path / "vault"
    section = root / "00 🤖 AI清华哥"
    section.mkdir(parents=True)
    (section / "persona-prompt.md").write_text("清华哥人设说明\n\n用于写作。", encoding="utf-8")
    (section / "OpenClaw记忆摘要.md").write_text("协作记忆。", encoding="utf-8")
    _reset_kb(monkeypatch, root)

    tree = kb.build_tree(refresh=True)
    section_data = tree["sections"][0]
    docs = {doc["title"]: doc for doc in section_data["subsections"][0]["docs"]}
    doc = docs["persona-prompt"]

    assert "AI" not in section_data["display_name"]
    assert doc["path"].endswith("persona-prompt.md")
    assert doc["title"] == "persona-prompt"
    assert "prompt" not in doc["display_title"].lower()
    assert "prompt" not in doc["display_path"].lower()
    assert "openclaw" not in docs["OpenClaw记忆摘要"]["display_title"].lower()


def test_kb_doc_and_search_return_display_fields(monkeypatch, tmp_path):
    root = tmp_path / "vault"
    section = root / "04 📦 飞书档案馆"
    section.mkdir(parents=True)
    (section / "【Prompts】直播相关.md").write_text("直播话术\n\n直播成交脚本。", encoding="utf-8")
    _reset_kb(monkeypatch, root)

    rel = "04 📦 飞书档案馆/【Prompts】直播相关.md"
    doc = kb.read_doc(rel)
    results = kb.search("直播", k=3)

    assert doc["path"] == rel
    assert "prompt" not in doc["display_title"].lower()
    assert "prompt" not in doc["display_path"].lower()
    assert results
    assert "prompt" not in results[0]["display_title"].lower()
    assert "prompt" not in results[0]["display_path"].lower()
