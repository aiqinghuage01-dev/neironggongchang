# Review T-114 · 写文案首页摘要 polish

## 任务 ID

T-114

## 审查对象

- 主线 commit: `f28e339 fix: polish write active task recovery`
- 文件:
  - `web/factory-write.jsx`
  - `scripts/e2e_write_active_tasks.js`
  - `tests/test_frontend_copy_static.py`
  - `docs/agent-handoff/DEV_CONTENT_T112_WRITE_ACTIVE_POLISH_20260501.md`
- 接管说明: 自动 Review worktree 未包含 `f28e339`, 继续等待会审旧代码。总控停止该过期进程后按 T-111 P2 清单逐项复审。

## 结论

无 P0 / P1 / P2 阻塞。

## T-111 P2 对照

1. `wf:*` 快照覆盖问题已处理。
   - `web/factory-write.jsx:239-261` 新增 `parseWorkflowSnapshot()`, 恢复时先解析旧快照, 再合并 `step` 和 `taskId/writeTaskId`。
   - 不再把热点/爆款/录音 `versions` 清空。
   - E2E 在 `scripts/e2e_write_active_tasks.js:521-583` 断言录音、策划、公众号旧上下文保留; 前面同脚本也覆盖热点、违规审查、爆款、投流。

2. 脱敏黑名单已扩展。
   - `web/factory-write.jsx:202-220` 覆盖本机路径、Windows 路径、本地端口、Bearer/Basic、authorization/header/key/secret、`sk-/tok-`、模型/路由/credits/watcher/daemon/status 等。
   - `scripts/e2e_write_active_tasks.js:198-224` 故意塞入 `Bearer sk-hidden /Volumes/secret x-api-key hidden / Authorization header`, 首页显示回退为“正在处理中”, 未外露内部词。

3. 静态守则已补。
   - `tests/test_frontend_copy_static.py:135-178` 覆盖 7 类写文案任务规则、存储 key、raw task 字段不可直接渲染、脱敏守则。

4. E2E 覆盖已从 4 类扩展到 7 类。
   - `scripts/e2e_write_active_tasks.js:12-299` 构造投流、热点、录音、爆款、内容策划、违规审查、公众号长文任务。
   - `scripts/e2e_write_active_tasks.js:506-587` 专门补录音/策划/公众号恢复。

5. 无时间戳 failed task 永久展示问题已处理。
   - `web/factory-write.jsx:171-180` failed task 缺 `finished_ts/updated_ts` 时直接过滤。
   - `scripts/e2e_write_active_tasks.js:590-605` 有回归场景验证该任务不显示。

## 回归风险

- 旧统计、工具卡、最近作品区域没有被改动。
- `taskStableKey()` 只影响 React key 兜底, 不改变业务过滤/排序。
- 脱敏是展示层保护, 不改变任务原始数据和详情页接口。

## 验证引用

- T-113 QA 报告: `docs/agent-handoff/QA_T113_WRITE_ACTIVE_POLISH_20260501.md`
- 主线正式端口验证:
  - `node --check scripts/e2e_write_active_tasks.js` -> pass
  - `.venv/bin/python -m pytest -q tests/test_frontend_copy_static.py` -> 11 passed
  - `APP_URL='http://127.0.0.1:8001/?page=write' node scripts/e2e_write_active_tasks.js` -> pass, 浏览器错误与非 GET API 请求全 0

## 是否需要老板确认

否。
