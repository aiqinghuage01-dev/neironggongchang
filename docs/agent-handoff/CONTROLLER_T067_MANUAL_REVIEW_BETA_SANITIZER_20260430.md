# 总控交接: T-067 手动审查与 beta 标题脱敏补强

时间: 2026-04-30
角色: 总控 Agent
分支: `main`

## 背景

T-067 原计划交给审查 Agent 做只读审查, 但自动 review worker 领取后 6 分钟日志仍为 0 字节, 未进入审查。总控已停止假忙进程并把队列先标记为 blocked, 随后按同一范围手动完成审查和返修。

审查范围:

- `287ced9 fix: repair site copy and beta dashboard leaks`
- `d8767d7 docs: close frame-aware site retest`
- `web/factory-beta.jsx`
- `web/factory-wechat-v2.jsx`
- `web/factory-voicerewrite-v2.jsx`
- `tests/test_frontend_copy_static.py`
- T-066 QA 报告

## 发现并修复

### P1 已修复: beta 任务标题路径脱敏正则不严

`safeTaskTitle()` 原先使用 `/\/Users\/[^\\s]+/g`, 在 JS 正则里不是“非空白”语义, 极端情况下可能只替换部分本机路径, 留下路径尾巴。并且 `submit_id=abc` 这类带值内部字段会显示成 `内部信息=abc`, 仍有残留值。

本次补强:

- `/Users/...` 和 `/private/...` 改为整段替换成本机目录。
- `submit_id=...`, `prompt=...`, `token=...`, `credits=...`, `watcher=...`, `provider=...` 等带值字段整段替换成“内部信息”。
- `status=500` 这类状态字段整段替换成“任务状态”。
- 保留原有内部词兜底: `OpenClaw/DeepSeek/Opus/LLM/API/Downloads/traceback` 等。
- `tests/test_frontend_copy_static.py` 增加 beta 标题脱敏静态回归。

## 验证

- `git diff --check` -> clean。
- `.venv/bin/pytest -q tests/test_frontend_copy_static.py tests/test_kb_display.py tests/test_ai_routing.py` -> 16 passed。
- `.venv/bin/pytest -q -x` -> passed, 仅本机缺失 dhv5 skill 用例按既有规则 skip。
- Playwright beta 假状态接口验证:
  - 截图: `/tmp/_ui_shots/t067_beta_sanitize_verify_20260430/beta_sanitized_fake_status.png`
  - 结果: `/tmp/_ui_shots/t067_beta_sanitize_verify_20260430/summary.json`
  - 假任务标题包含 `/Users`, `/private`, `status=500`, `submit_id=abc`, `OpenClaw`, `DeepSeek`, `Opus`, `LLM`, `prompt=`, `token=`, `credits=`, `Downloads`, `API`。
  - 页面可见文本命中 0, console/pageerror/requestfailed/http error 均为 0。

## 结论

- 当前无剩余 P0/P1。
- T-048/T-065/T-066 的产品侧阻塞已闭环。
- T-067 自动 review worker 本身启动异常已记录; 审查范围由总控手动补齐。
