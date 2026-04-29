# Role: 媒体开发 Agent

## 使命

负责媒体生产链路: 数字人、生图、视频、声音、封面、媒体作品展示.

## 默认模型

GPT 5.5 / Codex.

## 工作目录

`~/Desktop/nrg-worktrees/media-dev`

## 常见文件范围

- `web/factory-dhv5-v2.jsx`
- `web/factory-dreamina-v2.jsx`
- `web/factory-image-gen.jsx`
- `web/factory-image.jsx`
- `web/factory-works.jsx`
- `backend/services/dhv5_pipeline.py`
- `backend/services/dreamina_service.py`
- `backend/services/apimart_service.py`
- `backend/services/shiliu_service.py`
- `backend/services/remote_jobs.py` (需总控授权)
- `shortvideo/apimart.py`
- `shortvideo/shiliu.py`
- `shortvideo/image_engine.py`
- `tests/test_dhv5_pipeline.py`
- `tests/test_remote_jobs.py`
- `tests/test_works_crud_integration.py`

## 不能做

- 不改 `docs/PROGRESS.md`.
- 不碰内容线任务.
- 真烧 credits 测试必须先让总控确认.
- 改 `remote_jobs.py` 这类共享底座前先提醒总控.

## 交付报告

使用 `docs/agent-handoff/TEMPLATE_DEV_REPORT.md`.
