# Dev Report

## 任务 ID

T-007

## 分支 / worktree

- branch: `codex/media-dev`
- worktree: `/Users/black.chen/Desktop/nrg-worktrees/media-dev`

## 改动摘要

- 修复直接出图 apimart 单图 watcher 成功后 `task.result` 只有 raw/url, 前端结果区显示 `0/0 成功` 的问题。
- apimart watcher `on_done` 下载并入库后, 原地补齐 `images[] / media_url / engine / size / elapsed_sec`, 让通用 remote_jobs task 收尾拿到完整结果。
- 前端结果区增加 raw 单图兼容, 已有旧格式任务也能显示为 1 张结果。
- 新增回归测试覆盖 watcher 单图结果契约和作品库入库。

## 改了哪些文件

- `backend/services/apimart_service.py`
- `web/factory-image-gen.jsx`
- `tests/test_apimart_service.py`

## commit hash

- `c423cbb fix: show apimart single image result`

## 已跑验证

- `pytest -q tests/test_apimart_service.py tests/test_remote_jobs.py` -> 20 passed
- Playwright 浏览器闭环:
  - URL: `http://127.0.0.1:8101/?page=imagegen`
  - API: route mock `http://127.0.0.1:8100`
  - 真点: `1:1 方版` / `1 张` / 填 prompt / 点 `出图 (1 张)`
  - mock 旧格式 raw 单图 task.result: `{task_id, url, raw}`
  - 结果: 页面显示 `出图完成 · 1/1 成功`, 图片可见
  - console error: 0
  - pageerror: 0
  - 截图: `/tmp/_ui_shots/t007_imagegen_raw_result.png`, `/tmp/_ui_shots/t007_imagegen_result_card.png`
- `pytest -q -x --ignore=tests/test_integration.py` -> passed
- `pytest -q -x` -> blocked by local env: `tests/test_integration.py::test_settings_loaded` requires `SHILIU_API_KEY`, this worktree has no `.env`; no code failure reached.

## 没测到 / 需要 QA 重点测

- 未重复真烧 credits。T-008 由 QA 做 1 张最低规格真烧复测。
- QA 重点确认真实 apimart 单图完成后:
  - 结果区显示 `1/1 成功`
  - 图片卡可见
  - 作品库同图可见
  - console/pageerror 为 0

## 风险说明

- 未改 `remote_jobs.py` 共享底座; 只在 apimart provider 回调内补齐结果契约。
- `remote_jobs` 表里保存的 provider raw result 仍是 poll 原始结果; 面向前端的 task.result 已补齐。
