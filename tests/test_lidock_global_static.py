from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_lidock_is_mounted_once_from_top_level_app():
    app_src = (ROOT / "web/factory-app.jsx").read_text(encoding="utf-8")
    assert app_src.count("<LiDock ") == 1
    assert "<LiDock context={pageContext} />" in app_src

    for path in (ROOT / "web").glob("factory-*.jsx"):
        if path.name in {"factory-app.jsx", "factory-shell.jsx"}:
            continue
        assert "<LiDock" not in path.read_text(encoding="utf-8"), path.name


def test_lidock_context_covers_all_routes():
    app_src = (ROOT / "web/factory-app.jsx").read_text(encoding="utf-8")
    for page in [
        "home",
        "strategy",
        "make",
        "ad",
        "wechat",
        "moments",
        "hotrewrite",
        "voicerewrite",
        "baokuan",
        "materials",
        "materials-legacy",
        "works",
        "knowledge",
        "settings",
        "planner",
        "compliance",
        "imagegen",
        "dreamina",
        "nightshift",
        "dhv5",
        "write",
        "image",
        "beta",
    ]:
        assert f"\n  {page}:" in app_src or f'\n  "{page}":' in app_src
