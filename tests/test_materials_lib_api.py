"""素材库 API 集成测试 (D-087).

8 个 /api/material-lib/* endpoint TestClient 真调:
- GET stats / folders / subfolders / list / asset/{id} / thumb/{id} / file/{id}
- POST scan / usage

边界:
- 空 DB stats
- 不存在的 asset_id 返 404
- 大文件 / 无 ext 文件 / 缩略图丢失
- Pydantic 422 入参错
"""
from __future__ import annotations

import tempfile
import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def tmp_db(monkeypatch):
    tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
    tmp.close()
    p = Path(tmp.name)
    monkeypatch.setattr("shortvideo.config.DB_PATH", p)
    yield p
    try:
        p.unlink()
    except Exception:
        pass


@pytest.fixture
def tmp_thumb_dir(monkeypatch, tmp_path):
    thumb_dir = tmp_path / "thumbs"
    thumb_dir.mkdir()
    import backend.services.materials_service as ms
    monkeypatch.setattr(ms, "THUMB_DIR", thumb_dir)
    yield thumb_dir


@pytest.fixture
def tmp_root(monkeypatch, tmp_path):
    root = tmp_path / "materials_root"
    root.mkdir()
    (root / "00 讲台高光").mkdir()
    (root / "00 讲台高光" / "提问").mkdir()
    from PIL import Image
    Image.new("RGB", (400, 300), color="red").save(root / "00 讲台高光" / "提问" / "raise_hand.jpg")
    Image.new("RGB", (400, 300), color="blue").save(root / "00 讲台高光" / "podium.jpg")
    Image.new("RGB", (400, 300), color="green").save(root / "outside.jpg")
    monkeypatch.setattr(
        "backend.services.materials_service.get_materials_root",
        lambda: root,
    )
    yield root


@pytest.fixture
def client(tmp_db, tmp_thumb_dir, tmp_root):
    from backend.api import app
    return TestClient(app)


@pytest.fixture
def populated_client(client, tmp_root):
    """触发一次同步扫描 + 返 client (避开异步 task 等待)."""
    from backend.services.materials_service import scan_root
    scan_root()
    return client


# ─── stats ─────────────────────────────────────────────


def test_stats_empty(client):
    r = client.get("/api/material-lib/stats")
    assert r.status_code == 200
    d = r.json()
    assert d["total"] == 0
    assert d["pending_review"] == 0
    assert d["ai_tagged"] == 0
    assert d["ai_coverage"] == 0
    assert "root" in d


def test_stats_after_scan(populated_client):
    r = populated_client.get("/api/material-lib/stats")
    assert r.status_code == 200
    d = r.json()
    assert d["total"] == 3
    assert d["week_added"] == 3


# ─── folders / subfolders ──────────────────────────────


def test_folders_empty(client):
    r = client.get("/api/material-lib/folders")
    assert r.status_code == 200
    assert r.json()["folders"] == []


def test_folders_after_scan(populated_client):
    r = populated_client.get("/api/material-lib/folders")
    assert r.status_code == 200
    folders = r.json()["folders"]
    names = {f["folder"]: f["total"] for f in folders}
    assert names.get("00 讲台高光") == 2
    assert names.get("_根目录") == 1


def test_folders_limit(populated_client):
    r = populated_client.get("/api/material-lib/folders?limit=1")
    folders = r.json()["folders"]
    assert len(folders) == 1


def test_categories_returns_fixed_8_business_categories(populated_client):
    r = populated_client.get("/api/material-lib/categories")
    assert r.status_code == 200
    d = r.json()
    assert "Downloads" not in [c["key"] for c in d["categories"]]
    assert len(d["categories"]) == 8
    assert d["categories"][0]["key"] == "00 待整理"
    assert d["categories"][0]["total"] == 3


def test_featured_returns_only_previewable_business_assets(populated_client):
    from backend.services.materials_service import list_assets, update_asset_profile

    assets = list_assets(sort="name")
    podium = next(a for a in assets if a["filename"] == "podium.jpg")
    outside = next(a for a in assets if a["filename"] == "outside.jpg")
    update_asset_profile(podium["id"], {
        "category": "01 演讲舞台",
        "visual_summary": "清华哥在舞台演讲",
        "shot_type": "演讲现场",
        "orientation": "横屏",
        "quality_score": 90,
        "usage_hint": "适合做开场和权威背书",
        "relevance_score": 88,
        "recognition_source": "metadata",
        "profile_updated_at": int(time.time()),
    })
    update_asset_profile(outside["id"], {
        "category": "00 待整理",
        "visual_summary": "无明确业务分类",
        "shot_type": "现场照片",
        "orientation": "横屏",
        "quality_score": 95,
        "usage_hint": "先整理",
        "relevance_score": 20,
        "recognition_source": "metadata",
        "profile_updated_at": int(time.time()),
    })

    r = populated_client.get("/api/material-lib/featured?limit=6")
    assert r.status_code == 200
    items = r.json()["items"]
    assert [a["id"] for a in items] == [podium["id"]]
    assert items[0]["thumb_path"]
    assert items[0]["category"] == "01 演讲舞台"


def test_featured_filters_profile_thumb_and_missing_independently(populated_client):
    from backend.services.materials_service import get_connection, list_assets, update_asset_profile

    assets = {a["filename"]: a for a in list_assets(sort="name")}
    podium = assets["podium.jpg"]
    outside = assets["outside.jpg"]
    raise_hand = assets["raise_hand.jpg"]
    now = int(time.time())

    for asset in [podium, outside, raise_hand]:
        update_asset_profile(asset["id"], {
            "category": "01 演讲舞台",
            "visual_summary": "清华哥业务现场素材",
            "shot_type": "现场照片",
            "orientation": "横屏",
            "quality_score": 88,
            "usage_hint": "适合做业务证明",
            "relevance_score": 80,
            "recognition_source": "metadata",
            "profile_updated_at": now,
        })

    with get_connection() as con:
        con.execute("UPDATE material_assets SET missing_at=? WHERE id=?", (now, podium["id"]))
        con.execute("UPDATE material_assets SET profile_updated_at=NULL WHERE id=?", (outside["id"],))
        con.execute("UPDATE material_assets SET thumb_path=NULL WHERE id=?", (raise_hand["id"],))
        con.commit()

    r = populated_client.get("/api/material-lib/featured?limit=6")
    assert r.status_code == 200
    assert r.json()["items"] == []


def test_featured_orders_quality_relevance_then_freshness(populated_client):
    from backend.services.materials_service import get_connection, list_assets, update_asset_profile

    assets = {a["filename"]: a for a in list_assets(sort="name")}
    profiles = [
        ("podium.jpg", 70, 99, 300),
        ("outside.jpg", 90, 70, 100),
        ("raise_hand.jpg", 90, 70, 200),
    ]
    now = int(time.time())
    for filename, quality, relevance, imported_at in profiles:
        asset = assets[filename]
        update_asset_profile(asset["id"], {
            "category": "02 上课教学",
            "visual_summary": filename,
            "shot_type": "现场照片",
            "orientation": "横屏",
            "quality_score": quality,
            "usage_hint": "排序测试",
            "relevance_score": relevance,
            "recognition_source": "metadata",
            "profile_updated_at": now,
        })
        with get_connection() as con:
            con.execute("UPDATE material_assets SET imported_at=? WHERE id=?", (imported_at, asset["id"]))
            con.commit()

    r = populated_client.get("/api/material-lib/featured?limit=3")
    assert r.status_code == 200
    assert [a["filename"] for a in r.json()["items"]] == [
        "raise_hand.jpg",
        "outside.jpg",
        "podium.jpg",
    ]


def test_featured_empty_and_limit_validation(client):
    r = client.get("/api/material-lib/featured")
    assert r.status_code == 200
    assert r.json() == {"items": [], "count": 0}
    assert client.get("/api/material-lib/featured?limit=0").status_code == 422
    assert client.get("/api/material-lib/featured?limit=49").status_code == 422


def test_subfolders_top_level(populated_client):
    r = populated_client.get("/api/material-lib/subfolders?top=00 讲台高光")
    assert r.status_code == 200
    d = r.json()
    assert d["folder"] == "00 讲台高光"
    paths = {s["folder"]: s["total"] for s in d["subfolders"]}
    assert "00 讲台高光/提问" in paths
    assert paths["00 讲台高光/提问"] == 1


def test_subfolders_root_dir(populated_client):
    r = populated_client.get("/api/material-lib/subfolders?top=_根目录")
    d = r.json()
    assert d["subfolders"][0]["folder"] == "."
    assert d["subfolders"][0]["total"] == 1


def test_subfolders_missing_top_returns_422(client):
    """缺 top 参数返 422."""
    r = client.get("/api/material-lib/subfolders")
    assert r.status_code == 422


# ─── list ──────────────────────────────────────────────


def test_list_empty(client):
    r = client.get("/api/material-lib/list")
    assert r.status_code == 200
    d = r.json()
    assert d["count"] == 0
    assert d["items"] == []


def test_list_all_after_scan(populated_client):
    r = populated_client.get("/api/material-lib/list")
    d = r.json()
    assert d["count"] == 3


def test_list_by_folder(populated_client):
    r = populated_client.get("/api/material-lib/list?folder=00 讲台高光/提问")
    d = r.json()
    assert d["count"] == 1
    assert d["items"][0]["filename"] == "raise_hand.jpg"


def test_list_includes_tags_and_hits(populated_client):
    r = populated_client.get("/api/material-lib/list?limit=1")
    d = r.json()
    a = d["items"][0]
    assert "tags" in a and isinstance(a["tags"], list)
    assert "hits" in a
    assert a["hits"] == 0


def test_list_pagination(populated_client):
    r1 = populated_client.get("/api/material-lib/list?limit=2&offset=0").json()
    r2 = populated_client.get("/api/material-lib/list?limit=2&offset=2").json()
    assert r1["count"] == 2
    assert r2["count"] == 1


def test_list_sort_by_name(populated_client):
    r = populated_client.get("/api/material-lib/list?sort=name").json()
    names = [a["filename"] for a in r["items"]]
    assert names == sorted(names)


def test_list_with_tag_ids(populated_client):
    """tag_ids 参数解析 (即使没匹配也不应崩)."""
    r = populated_client.get("/api/material-lib/list?tag_ids=999,888")
    assert r.status_code == 200
    assert r.json()["count"] == 0


def test_list_with_invalid_tag_ids_falls_back(populated_client):
    """tag_ids 含非数字 → 整体 ignore (不崩)."""
    r = populated_client.get("/api/material-lib/list?tag_ids=abc,xyz")
    assert r.status_code == 200
    assert r.json()["count"] == 3  # ignored, 全 list


def test_list_by_category_after_classify(populated_client):
    from backend.services.materials_service import list_assets
    from backend.services.materials_pipeline import classify_asset
    aid = next(a["id"] for a in list_assets() if a["filename"] == "raise_hand.jpg")
    classify_asset(aid)
    r = populated_client.get("/api/material-lib/list?category=01 演讲舞台")
    assert r.status_code == 200
    assert any(a["id"] == aid for a in r.json()["items"])


# ─── asset/{id} ───────────────────────────────────────


def test_asset_404(client):
    r = client.get("/api/material-lib/asset/nonexistent_id")
    assert r.status_code == 404


def test_asset_full_payload(populated_client):
    items = populated_client.get("/api/material-lib/list").json()["items"]
    aid = items[0]["id"]
    r = populated_client.get(f"/api/material-lib/asset/{aid}")
    assert r.status_code == 200
    d = r.json()
    assert d["id"] == aid
    assert "tags" in d
    assert "usage" in d
    assert "hits" in d
    assert d["hits"] == 0


# ─── thumb/{id} ────────────────────────────────────────


def test_thumb_404(client):
    r = client.get("/api/material-lib/thumb/nonexistent_id")
    assert r.status_code == 404


def test_thumb_returns_jpeg(populated_client):
    items = populated_client.get("/api/material-lib/list").json()["items"]
    aid = items[0]["id"]
    r = populated_client.get(f"/api/material-lib/thumb/{aid}")
    assert r.status_code == 200
    assert r.headers["content-type"] == "image/jpeg"
    assert len(r.content) > 100


# ─── file/{id} ────────────────────────────────────────


def test_file_404_when_asset_missing(client):
    r = client.get("/api/material-lib/file/nonexistent_id")
    assert r.status_code == 404


def test_file_returns_original(populated_client):
    items = populated_client.get("/api/material-lib/list").json()["items"]
    aid = items[0]["id"]
    r = populated_client.get(f"/api/material-lib/file/{aid}")
    assert r.status_code == 200
    assert r.headers["content-type"] in ("image/jpeg", "video/mp4")
    assert len(r.content) > 100


def test_file_404_when_original_deleted(populated_client, tmp_root):
    """素材入库后原文件被删 → file endpoint 返 404."""
    items = populated_client.get("/api/material-lib/list").json()["items"]
    a = items[0]
    Path(a["abs_path"]).unlink()  # 删原文件
    r = populated_client.get(f"/api/material-lib/file/{a['id']}")
    assert r.status_code == 404


# ─── scan (异步) ───────────────────────────────────────


def test_scan_returns_task_id(client, tmp_root, monkeypatch):
    """触发 scan endpoint, 应返 task_id + status. 不等异步完成 (避免测试慢)."""
    # mock tasks.run_async 同步跑, 防 daemon 串扰 (跟 wechat 测试同套路)
    from backend.services import tasks as tasks_service
    real_create = tasks_service.create_task
    real_finish = tasks_service.finish_task

    def fake_run(*, kind, label=None, ns=None, page_id=None, step=None,
                 payload=None, estimated_seconds=None, progress_text=None, sync_fn):
        tid = real_create(kind=kind, label=label, ns=ns, page_id=page_id,
                          step=step, payload=payload, estimated_seconds=estimated_seconds)
        try:
            res = sync_fn()
            real_finish(tid, result=res, status="ok")
        except Exception as e:
            real_finish(tid, error=str(e), status="failed")
        return tid

    monkeypatch.setattr("backend.services.tasks.run_async", fake_run)

    r = client.post("/api/material-lib/scan")
    assert r.status_code == 200
    d = r.json()
    assert "task_id" in d
    assert d["status"] == "running"

    # 验扫描真跑了 (同步 mock 已跑完)
    t = tasks_service.get_task(d["task_id"])
    assert t["status"] == "ok"
    assert t["result"]["scanned"] == 3
    assert t["result"]["added"] == 3


def test_scan_with_max_files(client, tmp_root, monkeypatch):
    from backend.services import tasks as tasks_service
    real_create = tasks_service.create_task
    real_finish = tasks_service.finish_task

    def fake_run(*, kind, label=None, ns=None, page_id=None, step=None,
                 payload=None, estimated_seconds=None, progress_text=None, sync_fn):
        tid = real_create(kind=kind, label=label, ns=ns, page_id=page_id,
                          step=step, payload=payload, estimated_seconds=estimated_seconds)
        try:
            res = sync_fn()
            real_finish(tid, result=res, status="ok")
        except Exception:
            real_finish(tid, error="boom", status="failed")
        return tid

    monkeypatch.setattr("backend.services.tasks.run_async", fake_run)
    r = client.post("/api/material-lib/scan?max_files=2")
    d = r.json()
    t = tasks_service.get_task(d["task_id"])
    assert t["result"]["scanned"] == 2


def test_classify_endpoint_writes_profile(populated_client):
    from backend.services.materials_service import list_assets, get_asset
    aid = list_assets()[0]["id"]
    r = populated_client.post(f"/api/material-lib/classify/{aid}")
    assert r.status_code == 200
    d = r.json()
    assert d["recognition_source"] == "metadata"
    a = get_asset(aid)
    assert a["category"]
    assert a["visual_summary"]


def test_classify_batch_requires_limit(client):
    r = client.post("/api/material-lib/classify-batch")
    assert r.status_code == 422


def test_classify_batch_returns_task_id(populated_client, monkeypatch):
    from backend.services import tasks as tasks_service
    real_create = tasks_service.create_task
    real_finish = tasks_service.finish_task

    def sync_run(*, kind, label=None, ns=None, page_id=None, step=None,
                 payload=None, estimated_seconds=None, progress_text=None,
                 sync_fn=None, sync_fn_with_ctx=None):
        tid = real_create(kind=kind, label=label, ns=ns, page_id=page_id,
                          step=step, payload=payload, estimated_seconds=estimated_seconds)
        try:
            if sync_fn_with_ctx is not None:
                res = sync_fn_with_ctx(tasks_service.TaskContext(tid))
            else:
                res = sync_fn()
            real_finish(tid, result=res, status="ok")
        except Exception as e:
            real_finish(tid, error=str(e), status="failed")
        return tid

    monkeypatch.setattr("backend.services.tasks.run_async", sync_run)
    r = populated_client.post("/api/material-lib/classify-batch?limit=2")
    assert r.status_code == 200
    d = r.json()
    assert d["source"] == "metadata"
    t = tasks_service.get_task(d["task_id"])
    assert t["status"] == "ok"
    assert t["result"]["scanned"] == 2


# ─── usage 记录 ───────────────────────────────────────


def test_usage_records(populated_client):
    items = populated_client.get("/api/material-lib/list").json()["items"]
    aid = items[0]["id"]
    r = populated_client.post("/api/material-lib/usage", json={
        "asset_id": aid,
        "used_in": "测试视频.mp4",
        "position_sec": 12.5,
    })
    assert r.status_code == 200
    assert r.json()["ok"] is True

    # 验 hits +1
    r2 = populated_client.get(f"/api/material-lib/asset/{aid}")
    assert r2.json()["hits"] == 1


def test_usage_missing_asset_id_returns_422(client):
    r = client.post("/api/material-lib/usage", json={"used_in": "x"})
    assert r.status_code == 422


def test_usage_minimal_payload(populated_client):
    """只传 asset_id, used_in / position_sec 可省."""
    items = populated_client.get("/api/material-lib/list").json()["items"]
    aid = items[0]["id"]
    r = populated_client.post("/api/material-lib/usage", json={"asset_id": aid})
    assert r.status_code == 200


def test_top_used_includes_profile_fields(populated_client):
    items = populated_client.get("/api/material-lib/list").json()["items"]
    aid = items[0]["id"]
    populated_client.post("/api/material-lib/usage", json={"asset_id": aid, "used_in": "测试视频"})
    r = populated_client.get("/api/material-lib/top-used?limit=1")
    assert r.status_code == 200
    item = r.json()["items"][0]
    assert item["id"] == aid
    assert item["hits"] == 1
    assert "category" in item
    assert "visual_summary" in item
    assert "quality_score" in item
    assert "tags" in item


# ─── 全库搜索 (D-087 整改 follow-up) ────────────────────


def test_search_empty_query_returns_empty(populated_client):
    r = populated_client.get("/api/material-lib/search?q=")
    assert r.status_code == 200
    d = r.json()
    assert d["count"] == 0
    assert d["items"] == []


def test_search_by_filename(populated_client):
    r = populated_client.get("/api/material-lib/search?q=raise")
    d = r.json()
    assert d["count"] == 1
    assert d["items"][0]["filename"] == "raise_hand.jpg"


def test_search_by_folder_name(populated_client):
    """搜 '讲台' 应该匹配 rel_folder 含讲台的素材."""
    r = populated_client.get("/api/material-lib/search?q=讲台")
    d = r.json()
    names = {a["filename"] for a in d["items"]}
    assert "raise_hand.jpg" in names
    assert "podium.jpg" in names


def test_search_no_match(populated_client):
    r = populated_client.get("/api/material-lib/search?q=xyznoexist123")
    d = r.json()
    assert d["count"] == 0
    assert d["items"] == []


def test_search_with_limit(populated_client):
    r = populated_client.get("/api/material-lib/search?q=jpg&limit=2")
    d = r.json()
    assert d["count"] == 2
    assert len(d["items"]) == 2


def test_search_returns_q_in_response(populated_client):
    """响应应该 echo 原 query (前端展示用)."""
    r = populated_client.get("/api/material-lib/search?q=raise")
    assert r.json()["q"] == "raise"


def test_search_matches_visual_summary(populated_client):
    from backend.services.materials_service import list_assets, update_asset_profile
    aid = list_assets()[0]["id"]
    update_asset_profile(aid, {
        "category": "04 出差商务",
        "visual_summary": "机场客户现场商务画面",
        "shot_type": "出差记录",
        "orientation": "横屏",
        "quality_score": 82,
        "usage_hint": "适合商务转场",
        "relevance_score": 72,
        "recognition_source": "metadata",
        "profile_updated_at": int(time.time()),
    })
    r = populated_client.get("/api/material-lib/search?q=客户现场")
    assert r.status_code == 200
    assert any(a["id"] == aid for a in r.json()["items"])


def test_match_endpoint_returns_reason_and_scores(populated_client):
    from backend.services.materials_service import list_assets, update_asset_profile
    aid = next(a["id"] for a in list_assets() if a["filename"] == "podium.jpg")
    update_asset_profile(aid, {
        "category": "01 演讲舞台",
        "visual_summary": "清华哥在舞台演讲",
        "shot_type": "演讲现场",
        "orientation": "横屏",
        "quality_score": 90,
        "usage_hint": "适合做开场和权威背书",
        "relevance_score": 88,
        "recognition_source": "metadata",
        "profile_updated_at": int(time.time()),
    })
    r = populated_client.post("/api/material-lib/match", json={
        "text": "需要演讲舞台开场素材",
        "category": "01 演讲舞台",
        "limit": 5,
    })
    assert r.status_code == 200
    items = r.json()["items"]
    assert items
    assert items[0]["id"] == aid
    assert items[0]["match_score"] > 0
    assert items[0]["match_reason"]


# ─── 待整理工作流 (D-087 C, PRD §3.3) ──────────────────


def test_pending_list_empty(populated_client):
    r = populated_client.get("/api/material-lib/pending-list")
    assert r.status_code == 200
    assert r.json()["items"] == []


def test_pending_list_returns_assets_with_suggestion(populated_client):
    from backend.services.materials_service import list_assets
    from backend.services.materials_pipeline import _write_pending_move
    aid = list_assets()[0]["id"]
    _write_pending_move(aid, "02 学生反应", "AI 觉得这是学生", confidence=0.85, is_new=False)
    r = populated_client.get("/api/material-lib/pending-list")
    items = r.json()["items"]
    assert len(items) == 1
    assert items[0]["id"] == aid
    assert items[0]["suggested_folder"] == "02 学生反应"
    assert items[0]["reason"].startswith("AI")


def test_approve_endpoint_changes_rel_folder(populated_client):
    from backend.services.materials_service import list_assets, get_asset
    from backend.services.materials_pipeline import _write_pending_move
    aid = list_assets()[0]["id"]
    _write_pending_move(aid, "99 新归档", "AI 觉得", confidence=0.85, is_new=True)
    r = populated_client.post(f"/api/material-lib/pending/{aid}/approve")
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is True
    assert body["new_folder"] == "99 新归档"
    a = get_asset(aid)
    assert a["rel_folder"] == "99 新归档"


def test_approve_endpoint_404_when_no_pending(populated_client):
    from backend.services.materials_service import list_assets
    aid = list_assets()[0]["id"]
    # 没写 pending move 直接 approve
    r = populated_client.post(f"/api/material-lib/pending/{aid}/approve")
    assert r.status_code == 404


def test_reject_endpoint_keeps_rel_folder(populated_client):
    from backend.services.materials_service import list_assets, get_asset
    from backend.services.materials_pipeline import _write_pending_move
    a = list_assets()[0]
    aid, original = a["id"], a["rel_folder"]
    _write_pending_move(aid, "99 新归档", "AI 觉得", confidence=0.85, is_new=True)
    r = populated_client.post(f"/api/material-lib/pending/{aid}/reject")
    assert r.status_code == 200
    assert r.json()["ok"] is True
    assert get_asset(aid)["rel_folder"] == original


def test_reject_endpoint_404_when_no_pending(populated_client):
    from backend.services.materials_service import list_assets
    aid = list_assets()[0]["id"]
    r = populated_client.post(f"/api/material-lib/pending/{aid}/reject")
    assert r.status_code == 404


def test_pending_workflow_e2e(populated_client):
    """走通 写 pending → list 看到 → approve 一条 → reject 一条 → list 应空."""
    from backend.services.materials_service import list_assets
    from backend.services.materials_pipeline import _write_pending_move
    items = list_assets()
    a, b = items[0]["id"], items[1]["id"]
    _write_pending_move(a, "01 通过组", "x", confidence=0.85, is_new=True)
    _write_pending_move(b, "02 跳过组", "y", confidence=0.85, is_new=True)
    assert len(populated_client.get("/api/material-lib/pending-list").json()["items"]) == 2
    populated_client.post(f"/api/material-lib/pending/{a}/approve")
    populated_client.post(f"/api/material-lib/pending/{b}/reject")
    after = populated_client.get("/api/material-lib/pending-list").json()["items"]
    assert after == []
    # stats.pending_review 也跟着归零
    assert populated_client.get("/api/material-lib/stats").json()["pending_review"] == 0
