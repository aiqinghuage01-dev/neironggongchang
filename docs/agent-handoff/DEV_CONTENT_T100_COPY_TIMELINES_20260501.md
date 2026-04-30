# Dev Report

## 任务 ID

T-100

## 分支 / worktree

- branch: `codex/content-dev`
- worktree: `/Users/black.chen/Desktop/nrg-worktrees/content-dev`

## 改动摘要

- 新增文字类长任务阶段时间线 helper: `backend/services/copy_progress.py`。
- 公众号写长文、录音改写、内容策划写作阶段接入真实 `progress_data.timeline`:
  - 公众号: 整理写作材料 / 写长文正文 / 三层自检 / 整理结果
  - 录音改写: 整理录音骨架 / 改写正文 / 整理说明和自检
  - 内容策划: 整理活动信息 / 写 6 模块方案 / 整理执行清单
- 不拆长文段落, 不改变 LLM 输出语义, 不增加模型调用。
- `/api/tasks` 和 `/api/tasks/{id}` 对 `wechat.write` / `voicerewrite.*` / `planner.*` 做展示清洗和错误白话化。
- 前端 `LoadingProgress` / `FailedRetry` 支持通用阶段时间线; failed 页面显示“停在哪一步”。
- 公众号手动写长文保存 `wechat:write` task id, 切走后可恢复进度; 公众号自动流程写长文和配图子任务显示当前 task 进度。
- 总控接管自动 worker 留下的未提交 patch 后补了:
  - `raw/engine/api` 字段清洗
  - 390px 失败卡左侧被侧栏遮挡的宽度修正
  - 本报告和 D-131 技术决策

## 改了哪些文件

- `backend/services/copy_progress.py`
- `backend/services/wechat_pipeline.py`
- `backend/services/voicerewrite_pipeline.py`
- `backend/services/planner_pipeline.py`
- `backend/api.py`
- `web/factory-task.jsx`
- `web/factory-wechat-v2.jsx`
- `web/factory-voicerewrite-v2.jsx`
- `web/factory-planner-v2.jsx`
- `tests/test_copy_progress_timelines.py`
- `tests/test_wechat_pipeline_async_smoke.py`
- `scripts/e2e_copy_timelines.js`
- `docs/TECHNICAL-DECISIONS.md`
- `docs/agent-handoff/DEV_CONTENT_T100_COPY_TIMELINES_20260501.md`

## commit hash

本报告所在提交以队列 `--commit` 记录为准。

## 已跑验证

- `/Users/black.chen/Desktop/neironggongchang/.venv/bin/python -m py_compile backend/services/copy_progress.py backend/services/wechat_pipeline.py backend/services/voicerewrite_pipeline.py backend/services/planner_pipeline.py backend/api.py` -> pass
- `node --check scripts/e2e_copy_timelines.js` -> pass
- `/Users/black.chen/Desktop/neironggongchang/.venv/bin/python -m pytest -q tests/test_copy_progress_timelines.py tests/test_wechat_pipeline_async_smoke.py tests/test_tasks_api.py` -> 10 passed
- `git diff --check` -> pass
- 临时静态前端 `http://127.0.0.1:18201`:
  - `APP_BASE='http://127.0.0.1:18201' node scripts/e2e_copy_timelines.js` -> pass
  - 覆盖 wechat/voicerewrite/planner 的 slow、failed、ok
  - 390px 覆盖 wechat slow、voicerewrite failed、planner ok
  - console/pageerror/requestfailed/http error: 0/0/0/0

## 截图已读

- `/tmp/_ui_shots/t100_wechat_slow_390.png`
- `/tmp/_ui_shots/t100_wechat_failed.png`
- `/tmp/_ui_shots/t100_voice_failed_390.png`
- `/tmp/_ui_shots/t100_planner_slow.png`
- `/tmp/_ui_shots/t100_planner_ok_390.png`

## 没测到 / 需要 QA 重点测

- 未真烧 credits; 本轮全部为 no-credit / mock 浏览器验证。
- 未测公众号真实自动全流程生成; 只验证自动流程页面能显示子任务 task 进度。
- QA 请在主线正式 `8000/8001` 上重复 no-credit Playwright, 并重点看:
  - 公众号手动写长文恢复态
  - 公众号自动流程写长文步骤进度
  - 录音/策划 failed 卡片移动端是否仍被侧栏遮挡

## 风险说明

- 这是阶段时间线, 不是正文逐字流式。正文仍在任务 ok 后一次展示。
- `friendly_error_for_display()` 是保守关键词映射; 未知错误统一提示重试, 不展示底层错误。
- 通用 `FailedRetry` 宽度为照顾左侧固定侧栏做了收窄, QA 需看桌面视觉是否仍舒服。

## 下一步建议

- T-108 QA 用正式端口跑 `scripts/e2e_copy_timelines.js`。
- T-109 Review 重点看是否增加模型调用、是否改变生成语义、是否遗漏 task 出口清洗。

## 是否需要老板确认

否
