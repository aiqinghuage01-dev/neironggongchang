# Dev Report

## 任务 ID

T-099

## 分支 / worktree

- branch: `codex/content-dev`
- worktree: `/Users/black.chen/Desktop/nrg-worktrees/content-dev`

## 改动摘要

- 投流 `n=1` 生成任务写入真实阶段:
  - 准备风格
  - 生成正文
  - 解析结果
  - 自检/整理
- 不增加 LLM 调用: `n=1` 仍只走一次 `touliu.generate.quick`; `n>1` 不拆 item, 仍走原批量路径。
- `/api/tasks` / `/api/tasks/{id}` 对 `touliu.*` 的 `result` / `partial_result` / `progress_data` / `error` 做展示清洗, 不把内部字段和底层错误串给页面。
- 投流结果页 running/failed 改为专用阶段面板:
  - 慢等待显示已等时间和白话解释。
  - 内容回传不完整显示可读失败原因。
  - failed 保留并展示已记录阶段信息。
  - 390px 窄屏无横向裁切。
- `docs/TECHNICAL-DECISIONS.md` 追加 D-130; 未改 `docs/PROGRESS.md`。

## 改了哪些文件

- `backend/services/touliu_pipeline.py`
- `backend/api.py`
- `web/factory-touliu-v2.jsx`
- `tests/test_touliu_progress.py`
- `tests/test_pipelines.py`
- `scripts/e2e_touliu_progress.js`
- `docs/TECHNICAL-DECISIONS.md`
- `docs/agent-handoff/DEV_CONTENT_T099_TOULIU_N1_PROGRESS_20260501.md`

## commit hash

本报告所在提交以队列 `--commit` 记录为准。

## 已跑验证

- `python3 -m py_compile backend/services/touliu_pipeline.py backend/api.py` -> pass
- `node --check scripts/e2e_touliu_progress.js` -> pass
- `command -v npx` -> `npx=ok`
- `git diff --check` -> pass
- `/Users/black.chen/Desktop/neironggongchang/.venv/bin/pytest -q tests/test_touliu_progress.py tests/test_pipelines.py -k 'touliu' tests/test_ai_routing.py tests/test_tasks_api.py` -> 30 passed
- no-credit Playwright:
  - `APP_URL='http://127.0.0.1:18199/?page=ad' node scripts/e2e_touliu_progress.js` -> pass
  - 覆盖: `slow-ok`, `parse-failed`, `timeout-failed`, `ok`, `390px`
  - console/pageerror/requestfailed/http error: `0/0/0/0`
  - 390px: `maxOverflow=0`, `bodyScrollWidth=390`, `rootScrollWidth=390`
  - 页面可见文本未命中 `prompt/tokens/API/model/provider/JSON/route/submit_id//Users`
- 截图已读:
  - `/tmp/_ui_shots/t099_touliu_slow_wait.png`
  - `/tmp/_ui_shots/t099_touliu_ok.png`
  - `/tmp/_ui_shots/t099_touliu_parse_failed.png`
  - `/tmp/_ui_shots/t099_touliu_task_failed_friendly.png`
  - `/tmp/_ui_shots/t099_touliu_mobile_390.png`
- 隔离 DB 真 curl:
  - 临时 API `127.0.0.1:18198`
  - `GET /api/tasks/a93faaff78984b789f4fbb8d2e3daab1` 返回投流 failed task, `error=内容回传不完整...`, `partial_result.batch[0].body=可展示正文`, `progress_data.timeline[0].label=解析结果`
  - 同一返回用 `rg -i 'prompt|tokens|API|model|provider|JSON|route|submit_id|/Users'` 命中 0

## 没测到 / 需要 QA 重点测

- 未真烧 credits。任务明确要求不烧 credits; 本轮全部通过 mock/no-credit 验证。
- 全量 `pytest -q -x` 已跑, 但停在既有媒体线基线:
  - `tests/test_apimart_service.py::test_apimart_watcher_enriches_single_image_task_result`
  - 失败原因: 用例期待图片作品 `local_path` 为绝对路径, 当前系统迁移红线要求保存相对路径 `image-gen/gen_regression.png`。
  - 该失败与本次投流改动无关, T-095/T-098 报告也记录过同一基线问题。

## 风险说明

- raw task 里仍可能保存底层异常用于排查, 但 `/api/tasks` 展示出口已对 `touliu.*` 做清洗和白话化。
- `n=1` 只有阶段可见, 不是流式正文; 正文仍在最终整理完成后一次显示。
- 取消按钮语义改成“取消任务”, 不承诺保留半成品。

## 下一步建议

- T-106 QA 用正式端口跑同一 no-credit 脚本, 重点看慢等待说明、失败阶段、390px。
- T-107 Review 重点看 `touliu.*` task 清洗是否覆盖 detail/list 两个出口。

## 是否需要老板确认

否
