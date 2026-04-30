from pathlib import Path


SRC = Path("web/factory-make-v2.jsx").read_text(encoding="utf-8")
MATERIALS_SRC = Path("web/factory-materials.jsx").read_text(encoding="utf-8")


def test_make_page_fetches_hot_radar_pool_and_batches_three():
    assert "const HOT_RADAR_BATCH_SIZE = 5" in SRC
    assert "const HOT_RADAR_FETCH_LIMIT = 30" in SRC
    assert "getHotRadarBatch(hotTopics, hotBatchIndex)" in SRC
    assert "换一批" in SRC
    assert "热点雷达" in SRC
    assert "大新闻 / 行业 / 本地" in SRC
    assert "把素材丢进来 ↓" in SRC
    assert "没思路？从热点开始" in SRC
    assert "🌐 全网" in SRC


def test_hot_radar_card_matches_requested_action_card():
    assert "function HotRadarFlameBadge" in SRC
    assert "function HotRadarCard" in SRC
    assert "做成视频" in SRC
    assert "✨ 匹配你定位" in SRC
    assert "今日最热" in SRC
    assert "🔥" in SRC
    assert 'background: "#fff"' in SRC
    assert "linear-gradient(135deg, #ff8a1d" not in SRC


def test_materials_hot_tab_handles_radar_fallback_without_delete_id():
    assert 'onDel={h.id ? () => onDel(h.id) : null}' in MATERIALS_SRC
    assert '{onDel && <Btn size="sm" onClick={onDel}>🗑</Btn>}' in MATERIALS_SRC
