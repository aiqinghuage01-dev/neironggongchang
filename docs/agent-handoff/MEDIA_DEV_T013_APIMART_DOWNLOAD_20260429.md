# Dev Report

## 任务 ID

T-013

## 分支 / worktree

- branch: `codex/media-dev`
- worktree: `/Users/black.chen/Desktop/nrg-worktrees/media-dev`

## 改动摘要

- 修复 apimart 远端已 `done` 但本地下载失败时, 关联 task 仍被通用 watcher 标成 `ok` 的假成功路径。
- apimart provider 现在会在无下载地址或下载失败时:
  - 标记 `remote_jobs.last_status=failed`
  - 标记关联 task 为 `failed`
  - 不写 `source_skill=image-gen` 的 ready 作品记录
  - 保留 failed-task 占位, 让用户在作品库/任务里看到失败和重试入口
- 新增 fault injection 回归: 模拟远端 done + CDN 下载抛错。

## 改了哪些文件

- `backend/services/apimart_service.py`
- `tests/test_apimart_service.py`

## commit hash

- `99f1fb3 fix: fail apimart tasks on download errors`

## 已跑验证

- `pytest -q tests/test_apimart_service.py tests/test_remote_jobs.py` -> 21 passed
- Playwright 浏览器闭环:
  - URL: `http://127.0.0.1:8101/?page=imagegen`
  - API: route mock `http://127.0.0.1:8100`
  - 真点: `1:1 方版` / `1 张` / 填 prompt / 点 `出图 (1 张)`
  - mock failed task error: `apimart error: 图片已生成, 但下载到本地失败...`
  - 结果: 页面显示失败卡、`AI 调用失败`、`再试一次`、`改一下再试`
  - console error: 0
  - pageerror: 0
  - 截图: `/tmp/_ui_shots/t013_imagegen_download_failure.png`
- `pytest -q -x --ignore=tests/test_integration.py` -> passed
- `git diff --check` -> clean
- `pytest -q -x` -> blocked by local env: `tests/test_integration.py::test_settings_loaded` requires `SHILIU_API_KEY`; this worktree has no `.env`.

## 没测到 / 需要 QA 重点测

- 未真烧 credits。本任务是 fault injection, 不需要重复提交 apimart。
- QA 如复核, 重点看 simulated/download-fail path:
  - task 不应为 `ok`
  - 不应出现 `source_skill=image-gen` 的 ready 坏作品
  - 页面应进入失败卡, 可重试

## 风险说明

- 未改共享 `remote_jobs.py`; 只在 apimart provider 回调内处理本地交付失败。
- remote provider 的 poll 计数仍按通用 watcher 逻辑先记一次 done, apimart 回调随后把 row 改为 failed; 面向用户的 task 状态为 failed。
