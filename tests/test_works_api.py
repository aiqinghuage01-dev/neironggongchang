from __future__ import annotations

import json
import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient


@pytest.fixture()
def client(tmp_path, monkeypatch):
    db_path = tmp_path / "works.db"
    monkeypatch.setattr("shortvideo.config.DB_PATH", db_path)
    from backend.services import migrations

    migrations.reset_for_test()
    from backend.api import app

    return TestClient(app)


def test_works_search_filters_before_limit(client):
    from shortvideo.works import insert_work

    old_ts = int(time.time()) - 400 * 86400
    target = insert_work(
        title="needle-old-work-301",
        final_text="target body",
        type="text",
        source_skill="wechat",
        status="ready",
        created_at=old_ts,
    )
    now = int(time.time())
    for i in range(304):
        insert_work(
            title=f"newer work {i}",
            final_text="ordinary",
            type="text",
            source_skill="wechat",
            status="ready",
            created_at=now - i,
        )

    r = client.get("/api/works", params={"limit": 300, "q": "needle-old-work-301"})
    assert r.status_code == 200
    ids = [x["id"] for x in r.json()]
    assert ids == [target]


def test_hot_topics_list_fills_radar_floor(client, monkeypatch):
    from shortvideo import works
    from shortvideo.works import insert_hot_topic

    insert_hot_topic(
        title="真实热点一条",
        platform="douyin",
        heat_score=99,
        match_persona=True,
        match_reason="真实库数据应优先展示",
        fetched_from="manual",
    )
    monkeypatch.setattr(works, "_fetch_hot_radar_live_topics", lambda: [
        works._RadarRawTopic("百度", "跨平台大新闻", "800万", 1, "https://example.com/global"),
        works._RadarRawTopic("知乎", "AI 进入企业经营", "600万", 3, "https://example.com/industry"),
        works._RadarRawTopic("本地", "上海商圈客流升温", "500万", 5, "https://example.com/local"),
    ])

    r = client.get("/api/hot-topics", params={"limit": 3})
    assert r.status_code == 200
    body = r.json()
    assert len(body) == 3
    assert [item["radar_category"] for item in body] == ["大新闻", "行业相关", "本地热点"]
    assert [item["title"] for item in body] == ["跨平台大新闻", "AI 进入企业经营", "上海商圈客流升温"]
    assert all(item["fetched_from"] == "hot-topic-radar" for item in body)


def test_hot_topics_list_gives_batch_pool_for_make_page(client, monkeypatch):
    from shortvideo import works

    monkeypatch.setattr(works, "_fetch_hot_radar_live_topics", lambda: [])
    r = client.get("/api/hot-topics", params={"limit": 30})
    assert r.status_code == 200
    body = r.json()
    assert len(body) >= 15
    assert [item["radar_category"] for item in body[:3]] == ["大新闻", "行业相关", "本地热点"]
    titles = {item["title"] for item in body}
    assert "五一假期各大景点客流升温" in titles
    assert "AI 工具进入企业日常办公" in titles
    assert "上海五一消费和出行升温" in titles


def test_hot_topics_list_blocks_national_leader_news(client, monkeypatch):
    from shortvideo import works
    from shortvideo.works import insert_hot_topic

    with pytest.raises(ValueError):
        insert_hot_topic(
            title="某国总统发表讲话",
            platform="weibo",
            heat_score=99,
            fetched_from="manual",
        )

    insert_hot_topic(
        title="企业用 AI 做经营复盘",
        platform="zhihu",
        heat_score=88,
        match_persona=True,
        match_reason="适合老板视角",
        fetched_from="manual",
    )
    monkeypatch.setattr(works, "_fetch_hot_radar_live_topics", lambda: [
        works._RadarRawTopic("百度", "某国总统发表讲话", "900万", 1, "https://example.com/blocked"),
        works._RadarRawTopic("知乎", "AI 进入企业经营", "600万", 2, "https://example.com/industry"),
        works._RadarRawTopic("本地", "上海商圈客流升温", "500万", 3, "https://example.com/local"),
    ])

    r = client.get("/api/hot-topics", params={"limit": 10})
    assert r.status_code == 200
    titles = [item["title"] for item in r.json()]
    assert "某国总统发表讲话" not in titles
    assert all("总统" not in title for title in titles)
    assert "AI 进入企业经营" in titles


def test_hot_topics_add_rejects_national_leader_news(client):
    r = client.post("/api/hot-topics", json={
        "title": "某国总统发表讲话",
        "platform": "weibo",
        "heat_score": 90,
    })
    assert r.status_code == 400
    assert "已拦截" in r.json()["detail"]


def test_works_detail_reads_work_outside_current_list(client):
    from shortvideo.works import insert_work, upsert_metric

    wid = insert_work(
        title="old analytics work",
        final_text="full text for old analytics work",
        type="text",
        source_skill="wechat",
        status="ready",
        created_at=int(time.time()) - 60 * 86400,
    )
    upsert_metric(work_id=wid, platform="douyin", views=999)

    analytics = client.get("/api/works/analytics").json()
    assert analytics["top_by_views"][0]["work_id"] == wid

    detail = client.get(f"/api/works/{wid}")
    assert detail.status_code == 200
    assert detail.json()["final_text"] == "full text for old analytics work"


def test_works_action_returns_updated_metadata_and_work(client):
    from shortvideo.works import get_work, insert_work

    wid = insert_work(title="action work", final_text="body", type="text", status="ready")
    r = client.post(f"/api/works/{wid}/action", json={"action": "kept"})
    assert r.status_code == 200
    body = r.json()
    assert body["user_action"] == "kept"
    assert json.loads(body["metadata"])["user_action"] == "kept"
    assert json.loads(body["work"]["metadata"])["user_action"] == "kept"
    assert json.loads(get_work(wid).metadata)["user_action"] == "kept"


def test_completion_rate_accepts_percent_input(client):
    from shortvideo.works import insert_work

    wid = insert_work(title="metric work", final_text="body", type="text", status="ready")
    r = client.post(
        f"/api/works/{wid}/metrics",
        json={"platform": "douyin", "views": 10, "completion_rate": 80},
    )
    assert r.status_code == 200
    metrics = client.get(f"/api/works/{wid}/metrics").json()
    assert metrics[0]["completion_rate"] == pytest.approx(0.8)


def test_image_missing_file_gets_explicit_asset_status(client, tmp_path):
    from shortvideo.works import insert_work

    missing = tmp_path / "missing.png"
    wid = insert_work(
        title="missing image",
        final_text="",
        type="image",
        source_skill="wechat-section-image",
        local_path=str(missing),
        thumb_path=str(missing),
        status="ready",
    )
    r = client.get(f"/api/works/{wid}")
    assert r.status_code == 200
    body = r.json()
    assert body["thumb_url"] is None
    assert body["local_url"] is None
    assert body["asset_status"] == "missing_file"
    assert body["preview_available"] is False
    assert body["download_available"] is False


def test_image_existing_outside_media_root_does_not_expose_absolute_path(client, tmp_path):
    from shortvideo.works import insert_work

    outside = tmp_path / "pytest-fake.png"
    outside.write_bytes(b"fake image")
    wid = insert_work(
        title="outside image",
        final_text="",
        type="image",
        source_skill="wechat-section-image",
        local_path=str(outside),
        thumb_path=str(outside),
        status="ready",
    )
    r = client.get(f"/api/works/{wid}")
    assert r.status_code == 200
    body = r.json()
    assert body["thumb_url"] is None
    assert body["local_url"] is None
    assert body["asset_status"] == "missing_file"
    assert body["preview_available"] is False
    assert body["download_available"] is False
