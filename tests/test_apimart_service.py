"""apimart watcher contract regressions."""
from __future__ import annotations

import importlib
from pathlib import Path


def test_apimart_watcher_enriches_single_image_task_result(tmp_path, monkeypatch):
    """Direct imagegen apimart n=1 must finish with images[] for the result UI."""
    db_path = tmp_path / "works.db"
    data_dir = tmp_path / "data"
    data_dir.mkdir()
    monkeypatch.setattr("shortvideo.config.DB_PATH", db_path)
    monkeypatch.setattr("shortvideo.config.DATA_DIR", data_dir)

    from backend.services import apimart_service, migrations, remote_jobs, tasks
    from shortvideo import works

    importlib.reload(migrations)
    importlib.reload(remote_jobs)
    importlib.reload(tasks)
    importlib.reload(apimart_service)
    importlib.reload(works)

    class FakeApimartClient:
        def __enter__(self):
            return self

        def __exit__(self, *args):
            return None

        def download(self, url: str, dest: Path):
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(b"\x89PNG\r\n\x1a\n")
            return dest

    monkeypatch.setattr("shortvideo.apimart.ApimartClient", FakeApimartClient)

    task_id = tasks.create_task(
        kind="image.generate",
        label="直接生图 · regression",
        ns="image",
        page_id="imagegen",
        step="generate",
        payload={"remote_managed": True, "engine": "apimart", "n": 1},
    )
    dest = data_dir / "image-gen" / "gen_regression.png"
    remote_jobs.register(
        provider="apimart",
        submit_id="task_apimart_123456",
        task_id=task_id,
        submit_payload={
            "prompt": "white coffee cup",
            "size": "1:1",
            "dest_path": str(dest),
            "kind": "image",
            "title": "white coffee cup",
            "source_skill": "image-gen",
        },
    )
    remote_jobs.register_provider(
        "apimart",
        lambda submit_id: {
            "status": "done",
            "result": {
                "task_id": submit_id,
                "url": "https://cdn.example.test/generated.png",
                "raw": {"data": {"status": "completed"}},
            },
        },
        on_done=apimart_service._on_done_for_watcher,
    )

    counts = remote_jobs.tick_once()

    assert counts["done"] == 1
    task = tasks.get_task(task_id)
    assert task is not None
    assert task["status"] == "ok"
    assert task["result"]["engine"] == "apimart"
    assert task["result"]["size"] == "1:1"
    assert task["result"]["n"] == 1
    assert task["result"]["images"] == [
        {
            "url": "https://cdn.example.test/generated.png",
            "local_path": str(dest),
            "media_url": "/media/image-gen/gen_regression.png",
            "task_id": "task_apimart_123456",
            "elapsed_sec": task["result"]["elapsed_sec"],
        }
    ]
    assert dest.exists()

    saved = works.list_works(type="image", source_skill="image-gen", limit=5)
    assert len(saved) == 1
    assert saved[0].local_path == str(dest)
    assert saved[0].status == "ready"


def test_apimart_watcher_download_failure_marks_task_failed_without_ready_work(tmp_path, monkeypatch):
    """Remote done + local download failure must not become a fake successful image task."""
    db_path = tmp_path / "works.db"
    data_dir = tmp_path / "data"
    data_dir.mkdir()
    monkeypatch.setattr("shortvideo.config.DB_PATH", db_path)
    monkeypatch.setattr("shortvideo.config.DATA_DIR", data_dir)

    from backend.services import apimart_service, migrations, remote_jobs, tasks
    from shortvideo import works

    importlib.reload(migrations)
    importlib.reload(remote_jobs)
    importlib.reload(tasks)
    importlib.reload(apimart_service)
    importlib.reload(works)

    class FailingApimartClient:
        def __enter__(self):
            return self

        def __exit__(self, *args):
            return None

        def download(self, url: str, dest: Path):
            raise RuntimeError("cdn 403")

    monkeypatch.setattr("shortvideo.apimart.ApimartClient", FailingApimartClient)

    task_id = tasks.create_task(
        kind="image.generate",
        label="直接生图 · download failure",
        ns="image",
        page_id="imagegen",
        step="generate",
        payload={"remote_managed": True, "engine": "apimart", "n": 1},
    )
    dest = data_dir / "image-gen" / "gen_download_failed.png"
    rj_id = remote_jobs.register(
        provider="apimart",
        submit_id="task_apimart_download_failed",
        task_id=task_id,
        submit_payload={
            "prompt": "white coffee cup",
            "size": "1:1",
            "dest_path": str(dest),
            "kind": "image",
            "title": "white coffee cup",
            "source_skill": "image-gen",
        },
    )
    remote_jobs.register_provider(
        "apimart",
        lambda submit_id: {
            "status": "done",
            "result": {
                "task_id": submit_id,
                "url": "https://cdn.example.test/generated.png",
                "raw": {"data": {"status": "completed"}},
            },
        },
        on_done=apimart_service._on_done_for_watcher,
    )

    counts = remote_jobs.tick_once()

    assert counts["done"] == 1
    task = tasks.get_task(task_id)
    assert task is not None
    assert task["status"] == "failed"
    assert "下载到本地失败" in (task["error"] or "")
    assert task["result"]["download_failed"] is True
    assert "images" not in task["result"]
    assert not dest.exists()

    rj = remote_jobs.get(rj_id)
    assert rj is not None
    assert rj["last_status"] == "failed"
    assert "下载到本地失败" in (rj["error"] or "")

    ready = works.list_works(type="image", source_skill="image-gen", limit=5)
    assert ready == []
    failed = works.list_works(type="image", source_skill="failed-task", limit=5)
    assert len(failed) == 1
    assert failed[0].status == "failed"
