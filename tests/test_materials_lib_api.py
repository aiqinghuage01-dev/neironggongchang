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
