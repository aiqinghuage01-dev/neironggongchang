# Dev Report

## 任务 ID

T-095

## 分支 / worktree

- branch: `codex/content-dev`
- worktree: `/Users/black.chen/Desktop/nrg-worktrees/content-dev`

## 改动摘要

- 违规审查异步任务增加 `partial_result`:
  - 扫描完成后立即写入风险清单。
  - 保守版完成后写入可复制版本。
  - 营销版继续跑时保留扫描 + 保守版并显示已等时间。
  - 营销版失败时 task `failed` 但保留 partial, 不清空前两段。
- `/api/tasks` / `/api/tasks/{id}` 对 `compliance.*` 的 `result` / `partial_result` / `progress_data` 做 kind 级清洗, 递归移除 `tokens/route/model/provider/prompt` 相关字段。
- 前端违规审查页改为 progressive 展示, 并修复无剪贴板权限时点击复制造成 pageerror 的问题。
- 新增 no-credit Playwright 脚本覆盖 scan visible、保守版 visible、营销版 slow、failed 保留、390px 不裁切。
- 已补 `docs/TECHNICAL-DECISIONS.md` D-129; 未改 `docs/PROGRESS.md`。

## 改了哪些文件

- `backend/services/compliance_pipeline.py`
- `backend/api.py`
- `web/factory-compliance-v2.jsx`
- `tests/test_compliance_progressive.py`
- `scripts/e2e_compliance_progressive.js`
- `docs/TECHNICAL-DECISIONS.md`
- `docs/agent-handoff/DEV_CONTENT_T095_COMPLIANCE_PROGRESSIVE_20260501.md`

## commit hash

本报告所在提交（以 agent_queue --commit 记录为准）

## 已跑验证

- `python3 -m py_compile backend/services/compliance_pipeline.py backend/api.py` -> pass
- `node --check scripts/e2e_compliance_progressive.js` -> pass
- `git diff --check` -> pass
- `/Users/black.chen/Desktop/neironggongchang/.venv/bin/pytest -q tests/test_compliance_progressive.py tests/test_compliance_fail_fast.py tests/test_tasks_api.py` -> 12 passed
- `/Users/black.chen/Desktop/neironggongchang/.venv/bin/pytest -q tests/test_tasks.py::test_update_partial_result_roundtrip_running_task tests/test_tasks.py::test_partial_result_cleared_when_task_finishes_ok_or_cancels tests/test_tasks.py::test_partial_result_preserved_when_task_fails tests/test_tasks.py::test_update_partial_result_ignores_finished_task tests/test_autoinsert_text_work.py` -> 11 passed
- 临时 API `127.0.0.1:18000` curl `/api/tasks/<compliance_task>`:
  - `status=running`
  - `partial_keys=['industry','scan_scope','stats','summary','version_a','violations']`
  - `version_a_keys=['compliance','content','word_count']`
  - `forbidden_hits=[]`
- `APP_URL=http://127.0.0.1:18001/?page=compliance node scripts/e2e_compliance_progressive.js` -> pass
  - running-ok states: `scan, conservative, slow, ok`
  - failed-partial states: `scan, conservative, failed`
  - console/pageerror/requestfailed/http error: `0/0/0/0`
  - mobile 390px: `maxOverflow=0`
  - screenshots:
    - `/tmp/_ui_shots/t095_compliance_scan_visible.png`
    - `/tmp/_ui_shots/t095_compliance_conservative_visible.png`
    - `/tmp/_ui_shots/t095_compliance_marketing_slow.png`
    - `/tmp/_ui_shots/t095_compliance_done.png`
    - `/tmp/_ui_shots/t095_compliance_failed_preserve.png`
    - `/tmp/_ui_shots/t095_compliance_mobile_390.png`
- 已用 `view_image` 打开上述关键截图做视觉确认。
- 未烧 credits; Playwright 全部使用 mock API。

## 没测到 / 需要 QA 重点测

- 未做真实 LLM / credits 测试, 因任务明确要求不烧 credits。
- `pytest -q -x` 已尝试, 但全量套件在非 T-095 范围失败:
  - `tests/test_apimart_service.py::test_apimart_watcher_enriches_single_image_task_result`
  - 原因: 测试仍期待图片作品 `local_path` 为绝对路径, 当前实现按迁移红线保存相对路径 `image-gen/gen_regression.png`。
  - 该失败属于媒体/路径测试基线, 本任务未修改相关代码。
- 额外观察: `tests/test_tasks.py::test_run_async_pushes_milestones` 在和 `test_autoinsert_text_work.py` 同跑时出现一次 timing flake; 单独重跑该用例通过。

## 风险说明

- `compliance_pipeline.check_compliance_async()` 仍然是原三次 LLM 调用顺序, 没有增加调用次数。
- `failed` 保留 partial 依赖 tasks 层既有语义; `ok/cancelled` 仍按 tasks 层清空 partial。
- API 清洗只移除内部字段 key, 不改正文内容。

## 下一步建议

- 让 QA Agent 在主线合并后用正式 `8000/8001` 再跑同一 no-credit 脚本。
- 媒体线单独处理 `test_apimart_service.py` 的相对路径断言, 不建议由内容 Agent 越界修改。

## 是否需要老板确认

否
