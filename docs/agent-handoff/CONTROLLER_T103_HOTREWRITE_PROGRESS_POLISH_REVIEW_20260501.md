# Controller Review: T-103 Hotrewrite Progress Polish

## 任务

- T-103: T-094 热点改写 polish 代码审查
- 执行方式: 原审查 Agent 超过 14 分钟无日志、无报告、无文件产物, 总控接管只读审查
- 被审提交: `1900ca1 fix: polish hotrewrite progressive states`
- 日期: 2026-05-01

## 结论

通过。未发现 P0/P1 阻塞。

T-094 没有回退 T-088/T-089/T-090 已通过能力:

- `failed` 时仍保留 `partial_result/progress_data`, 没有重新引入 failed 清空 partial 的回归。
- API 展示清洗路径未被改动, 热点内容清洗仍由既有 `_sanitize_task_for_display` 覆盖。
- `ok/cancelled` 终态语义未改变。
- 取消说明只影响用户可见解释, 不改变后端取消能力。
- E2E 新增 failed partial 与 cancelled 两态, 覆盖了 T-090 提到的测试缺口。

## 审查重点

### 后端 timeline

`backend/services/hotrewrite_pipeline.py` 在版本完成时:

- 用 `variant_id` 找到稳定的 `version_no`。
- 删除同一 `variant_id/version_index` 的 running 事件。
- 追加 `status=done` 的完成事件。

这一层修的是源头, 可以避免后续 progress_data 自身带 stale running。

### 前端 timeline

`web/factory-task.jsx` 用 `unitKey()` 对 `unit_id/variant_id/version_index/completed_versions` 做去重过滤。即使旧格式 progress_data 没有 `variant_id`, 也能根据 `completed_versions` 隐藏已完成版本的 running 条目。

这对后续 T-095/T-098 复用 `TaskProgressTimeline` 有价值。

### failed / cancelled

`web/factory-hotrewrite-v2.jsx`:

- failed 且已有 partial 时仍进入 `HotStepWrite`, 不丢已完成版本。
- cancelled 无 partial 时展示 `FailedRetry` 友好态。
- 取消按钮旁说明“已发起的生成可能仍会消耗额度”, 符合真实 credits 语义, 没有夸大为立即停止模型调用。

### 测试

`scripts/e2e_hotrewrite_progressive.js` 覆盖:

- running V1/V2
- slow V4
- ok 4 versions
- 390px
- failed partial
- cancelled

QA T-102 已在正式 8001 上复测 `main@1900ca1`, 结果通过。

## 风险 / 非阻塞

P2: `FailedRetry` 仍保留“看技术详情”折叠入口, 这是既有全站组件行为, 本次 T-094 没有扩大暴露面。后续若要进一步隐藏技术详情, 应作为全站错误展示策略单独处理, 不阻塞本任务。

## 验证材料

- `git show --stat --oneline 1900ca1`
- `git show --check 1900ca1`
- T-094 总控验证报告: `docs/agent-handoff/CONTROLLER_T094_HOTREWRITE_PROGRESS_POLISH_20260501.md`
- T-102 QA 报告: `/Users/black.chen/Desktop/nrg-worktrees/qa/docs/agent-handoff/QA_T102_HOTREWRITE_PROGRESS_POLISH_20260501.md`

## 队列建议

T-103 可关闭。T-102 + T-103 都通过后, 可以放行 T-095 违规审查 partial_result 第一批落地。
