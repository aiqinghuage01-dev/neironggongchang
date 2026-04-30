# Dev Report

## 任务 ID

T-101

## 分支 / worktree

- branch: `codex/content-dev`
- worktree: `/Users/black.chen/Desktop/nrg-worktrees/content-dev`

## 改动摘要

- 写文案首页新增“正在写 / 可继续”摘要区。
- 只读拉取 `/api/tasks?limit=80`, 不提交任何生成请求。
- 摘要只展示文字类任务的业务名称、当前阶段、已等时间和入口按钮:
  - 进行中 / 待开始: 显示“继续看进度”。
  - 最近失败: 显示“回去处理”。
- 点击入口会写回各页面既有恢复 key, 再跳到对应页面继续看进度:
  - `hotrewrite`, `compliance`, `baokuan`, `touliu`, `voicerewrite`, `planner`, `wechat:write`
- 不展示任务原始 kind、payload、模型、底层调用、字段名、本机路径等内部信息。
- 没有相关任务时不渲染摘要区。
- 顺手把写文案首页投流卡的 `lint` 改成“6 维质检”, 并补了写文案首页 390px 响应式栅格。

## 改了哪些文件

- `web/factory-write.jsx`
- `scripts/e2e_write_active_tasks.js`
- `docs/agent-handoff/DEV_CONTENT_T101_WRITE_ACTIVE_TASKS_20260501.md`

## commit hash

本报告所在提交以队列 `--commit` 记录为准。

## 已跑验证

- `command -v npx` -> `npx=ok`
- `node --check scripts/e2e_write_active_tasks.js` -> pass
- `git diff --check` -> clean
- `python3 -m pytest -q tests/test_frontend_copy_static.py` -> 9 passed
- 临时静态前端 `http://127.0.0.1:18101/?page=write`:
  - `APP_URL='http://127.0.0.1:18101/?page=write' node scripts/e2e_write_active_tasks.js` -> pass
  - 场景:
    - no-task: 无任务时不展示摘要
    - summary-resume: 首页展示 hotrewrite / compliance / baokuan / touliu 四类任务摘要
    - click resume: 四类按钮均跳回对应页面, 并看到进度/失败态
    - mobile: 390px `maxOverflow=0`, `bodyScrollWidth=390`, `rootScrollWidth=390`
  - console/pageerror/requestfailed/http error/non-GET API: 全部 0
  - 未烧 credits, 未触发任何生成类 POST
- 截图已读:
  - `/tmp/_ui_shots/t101_write_no_active_tasks.png`
  - `/tmp/_ui_shots/t101_write_active_tasks.png`
  - `/tmp/_ui_shots/t101_resume_hotrewrite.png`
  - `/tmp/_ui_shots/t101_resume_compliance.png`
  - `/tmp/_ui_shots/t101_resume_baokuan.png`
  - `/tmp/_ui_shots/t101_resume_touliu.png`
  - `/tmp/_ui_shots/t101_write_active_tasks_390.png`

## 没测到 / 需要 QA 重点测

- 未在正式 `8000/8001` 端口重复跑, 本轮使用临时静态前端 + Playwright route mock 做 no-credit 验证。
- 未真烧任何 LLM / 外部 credits; 任务要求是首页摘要和回跳, 不需要生成。
- 建议 T-110 QA 在正式端口复跑 `scripts/e2e_write_active_tasks.js`, 重点看真实任务列表里是否有老任务文案过长导致卡片拥挤。

## 风险说明

- 首页摘要从通用任务列表筛选, 不新增后端 API。
- 点击恢复会覆盖该工具当前浏览器里的旧工作流恢复 key; 这是为了让“回去看进度”一定落到被点击的任务。
- 失败任务只保留 3 天内的文字类任务, 避免首页长期被旧失败打扰。

## 下一步建议

- T-110 QA 用正式端口做独立 no-credit 回归。
- T-111 Review 重点看任务筛选和恢复 key 映射是否覆盖现有文字类工具。

## 是否需要老板确认

否
