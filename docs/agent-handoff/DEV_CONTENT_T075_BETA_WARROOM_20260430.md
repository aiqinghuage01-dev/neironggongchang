# Dev Report

## 任务 ID

T-075

## 分支 / worktree

- 分支: `codex/content-dev`
- worktree: `/Users/black.chen/Desktop/nrg-worktrees/content-dev`

## 改动摘要

- 将 `web/factory-beta.jsx` 从黑科技占位页升级为「科技与狠活 · 研发部作战室」。
- 读取研发部状态面板的状态数据, 展示岗位卡、当前任务、研发现场时间线、日志摘要、提交与交接证据。
- 前端统一做脱敏: 不展示本机绝对路径; 日志摘要只显示 `safeLogText` 处理后的内容; 任务标题、领取人、提交、交接路径都做安全展示。
- 当前任务列表明确显示 `id / 角色 / 状态 / 领取人`, 不再显示含糊的“有人在跟”。
- 增加 `tests/test_frontend_copy_static.py` 静态保护和 `scripts/e2e_beta_warroom.js` 最小浏览器验证脚本。

## 改了哪些文件

- `web/factory-beta.jsx`
- `tests/test_frontend_copy_static.py`
- `scripts/e2e_beta_warroom.js`
- `docs/agent-handoff/DEV_CONTENT_T075_BETA_WARROOM_20260430.md`

## commit hash

- 实现提交: `ec8922d feat: upgrade beta war room`
- 共享任务队列 `done` 命令会记录最终交付 commit。

## 已跑验证

- `node --check scripts/e2e_beta_warroom.js` -> pass
- `python3 -m pytest -q tests/test_frontend_copy_static.py` -> 3 passed
- `git diff --check` -> pass
- `BETA_WEB_URL='http://127.0.0.1:8011/?page=beta' node scripts/e2e_beta_warroom.js` -> pass
  - 截图: `/tmp/_ui_shots/t075_beta_warroom.png`
  - 摘要: `/tmp/_ui_shots/t075_beta_warroom_summary.json`
  - consoleErrors/pageErrors/requestFailed/httpErrors 均为 0
  - 可见文本敏感词扫描 violations 为 0
  - 已点击「看日志摘要」并确认脱敏摘要展示

说明: worktree 没有 `.venv/bin/pytest`, 所以静态测试用 `python3 -m pytest` 执行。

## 没测到 / 需要 QA 重点测

- 正式端口 `http://127.0.0.1:8001/?page=beta` 当前仍由主目录服务占用, 本轮开发自测使用 8011 隔离服务验证 worktree 代码。
- T-076 需要在合入/切到正式端口后, 用真实 8765 状态面板数据复测日志按钮、可见文本脱敏、桌面和窄屏截图。

## 风险说明

- 本次不改 8765 状态面板服务, 只消费已有状态与日志接口。
- 如果未来状态数据新增字段并被页面展示, 需要继续走 `safeText` / `safeLogText` / `safeFileLabel`。
- 本次不烧外部生成额度。

## 下一步建议

- 派 T-076 做正式端口真实浏览器 QA。
- 派 T-077 做只读脱敏审查。

## 是否需要老板确认

否。
