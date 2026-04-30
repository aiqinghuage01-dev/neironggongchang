# Controller Report: T-094 Hotrewrite Progress Polish

## 任务

- T-094: 热点改写渐进展示 polish
- 执行方式: 内容开发自动 Agent 卡在提交前, 总控接管有效补丁并在 `main` 上完成验证与提交
- 日期: 2026-05-01

## 结论

已完成。热点改写的渐进展示模板补齐了 T-090 提到的 P2 风险:

- 已完成版本不会继续在时间线里显示为“进行中”。
- 后端完成某个版本时会清掉同版本 running 事件, 并写入 `variant_id/version_index/status=done`。
- 前端 `TaskProgressTimeline` 对旧格式 progress_data 也做二次过滤, 避免后续其他写文案链路复制 stale running 问题。
- `scripts/e2e_hotrewrite_progressive.js` 增加 failed partial 和 cancel UI 两条 no-credit 回归。
- 取消按钮旁增加用户可理解说明: 已发起的生成可能仍会消耗额度, 但页面会停止等待剩余版本。

## 改动文件

- `backend/services/hotrewrite_pipeline.py`
- `web/factory-task.jsx`
- `web/factory-hotrewrite-v2.jsx`
- `tests/test_hotrewrite_versions.py`
- `scripts/e2e_hotrewrite_progressive.js`

## 验证

- `python3 -m py_compile backend/services/hotrewrite_pipeline.py` 通过
- `node --check scripts/e2e_hotrewrite_progressive.js` 通过
- `python3 -m pytest -q tests/test_hotrewrite_versions.py tests/test_tasks.py tests/test_migrations.py` 通过: 49 passed
- `git diff --check` 通过
- `APP_URL='http://127.0.0.1:8001/?page=hotrewrite' node scripts/e2e_hotrewrite_progressive.js` 通过

浏览器证据:

- running V1: `/tmp/_ui_shots/t085_hotrewrite_running_v1.png`
- running V2: `/tmp/_ui_shots/t085_hotrewrite_running_v2.png`
- slow V4: `/tmp/_ui_shots/t085_hotrewrite_slow_v4.png`
- ok 4 versions: `/tmp/_ui_shots/t085_hotrewrite_done_4versions.png`
- mobile 390: `/tmp/_ui_shots/t085_hotrewrite_mobile_390.png`
- failed partial: `/tmp/_ui_shots/t094_hotrewrite_failed_partial.png`
- cancelled: `/tmp/_ui_shots/t094_hotrewrite_cancelled.png`

浏览器指标:

- consoleErrors: 0
- pageErrors: 0
- requestfailed: 0
- http>=400: 0
- mobile maxOverflow: 0

## 说明

本轮没有烧 credits。所有页面状态通过 Playwright route mock 驱动。

T-094 关闭后可放行 T-102/T-103 独立 QA/审查。T-102/T-103 均通过后, 才进入 T-095 违规审查 partial_result 第一批落地。
