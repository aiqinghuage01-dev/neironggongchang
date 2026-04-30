# Dev Report

## 任务 ID

T-085

## 分支 / worktree

`codex/content-dev` / `/Users/black.chen/Desktop/nrg-worktrees/content-dev`

基线: 已先 `git fetch origin` 并将本分支对齐到 `origin/main` = `42a9605 docs: clarify Mac mini skill source view`。没有合并旧 `content-dev` 的 T-081 分支结果。

## 改动摘要

- 在 main 最新热点改写清洗/快路由/fallback 基础上重新实现版本级实时输出。
- `tasks` 新增 `partial_result` / `progress_data` 迁移和运行中写入接口; `ok/failed/cancelled` 终态清空 partial, 防旧 partial 覆盖最终 result。
- 热点改写每完成一版就写入已清洗 partial; partial 只保留前端展示字段, 不带 `tokens/route_key` 等内部字段。
- `/api/tasks/{id}` 和 `/api/tasks` 对热点改写的 `result` 与 `partial_result` 同时做展示清洗。
- 前端 running 阶段展示已完成版本和生成现场; task ok 后回到最终 `result.versions`; 390px 顶部标题/步骤条/方法徽章改为可换行布局。

## 改了哪些文件

- `backend/services/tasks.py`
- `backend/services/migrations.py`
- `backend/services/hotrewrite_pipeline.py`
- `backend/api.py`
- `web/factory-hotrewrite-v2.jsx`
- `web/factory-task.jsx`
- `tests/test_hotrewrite_versions.py`
- `tests/test_tasks.py`
- `tests/test_migrations.py`
- `scripts/e2e_hotrewrite_progressive.js`

## commit hash

本报告随最终提交一起提交; 队列 `done` 记录使用实际最终 commit hash。

## 已跑验证

- `python -m py_compile backend/services/hotrewrite_pipeline.py backend/services/tasks.py backend/services/migrations.py backend/api.py` -> 通过。
- `node --check scripts/e2e_hotrewrite_progressive.js` -> 通过。
- `/Users/black.chen/Desktop/neironggongchang/.venv/bin/python -m pytest -q tests/test_hotrewrite_versions.py tests/test_tasks.py tests/test_migrations.py` -> 47 passed。
- `/Users/black.chen/Desktop/neironggongchang/.venv/bin/python -m pytest -q tests/test_tasks_api.py tests/test_hotrewrite_versions.py tests/test_tasks.py tests/test_migrations.py` -> 50 passed。
- 临时 API `8126` + curl `/api/tasks/{id}`: running partial 泄漏样本返回 `content="先出的正文"`, forbidden hits `[]`, `tokens/route_key` 字段均未透出。
- 临时 Web `8127` + `APP_URL=http://127.0.0.1:8127/?page=hotrewrite node scripts/e2e_hotrewrite_progressive.js` -> 通过:
  - states: `v1 -> v2 -> ok`
  - console/pageerror/requestfailed/http>=400: 0
  - running V1 截图: `/tmp/_ui_shots/t085_hotrewrite_running_v1.png`
  - running V2 截图: `/tmp/_ui_shots/t085_hotrewrite_running_v2.png`
  - final 4 versions 截图: `/tmp/_ui_shots/t085_hotrewrite_done_4versions.png`
  - 390px 截图: `/tmp/_ui_shots/t085_hotrewrite_mobile_390.png`
  - 390px `maxOverflow=0`, 标题/方法徽章/步骤条均在 viewport 内且未竖排。
- 已打开并人工查看上述 running/final/mobile 截图。

## 没测到 / 需要 QA 重点测

- 未做真实 4 版 LLM credits 链路; 本任务验收要求是 mock e2e 证明 progressive contract。
- 建议 QA 后续只做一次热点改写默认 4 版真链路, 重点看 V1/V2 出现时任务仍 running, 最终 4 版收口。

## 风险说明

- `pytest -q -x` 已跑, 但停在既有非 T-085 范围测试: `tests/test_apimart_service.py::test_apimart_watcher_enriches_single_image_task_result` 仍期待 `works.local_path` 为绝对路径, 当前 main 防腐层实际返回 `image-gen/gen_regression.png` 相对路径。
- 热点 4 版生成仍最多 2 路并发; 取消后无法中断已发起的 LLM 请求, 但不会再提交新排队版本, 且取消会清空 partial。

## 下一步建议

- 总控可安排 QA 用真实热点 4 版最小链路复测。
- apimart 测试的绝对路径旧期望应由媒体/平台范围单独处理, 不建议混进 T-085。

## 是否需要老板确认

否。
