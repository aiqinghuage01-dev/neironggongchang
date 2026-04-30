# Review Report

## 任务 ID

T-097 (审查 T-095 违规审查 partial_result 第一批落地)

## 审查对象

- 主仓: `/Users/black.chen/Desktop/neironggongchang`
- 分支 / commit: `codex/content-dev` @ `aed7571` (主线 main 当前 `1f9ae0d`, 该 commit 尚未合入 main, 仅在 worktree `nrg-worktrees/content-dev` 上)
- 审查的 diff: `git show aed7571` (单 commit, 仅包含本任务实现)
  - `backend/services/compliance_pipeline.py` (+110, 全部为新增辅助函数 `_INTERNAL_DISPLAY_KEY_PARTS / _is_internal_display_key / sanitize_result_for_display / _public_scan / _public_version / _partial_result / _progress_data` + `_worker` 内 3 处 `update_partial_result` 注入, 没改 `_scan_violations / _write_version` 主流程)
  - `backend/api.py` (+18 / -6, `_sanitize_task_for_display` 扩 kind 路由, compliance.* 走 `compliance_pipeline.sanitize_result_for_display` 清洗 `result/partial_result/progress_data`; 兼容路径 `/api/compliance/analyze|write` 也补清洗)
  - `web/factory-compliance-v2.jsx` (+197 / -37, 新增 `useComplianceNarrow / ComplianceLiveStatus / RewriteCard 的 pending/failed 形态` + 复制按钮 promise.catch 兜底 + 窄屏布局)
  - `tests/test_compliance_progressive.py` (+187, 3 个新用例覆盖 scan→保守→ok 顺序、营销失败保留 partial、API 清洗)
  - `scripts/e2e_compliance_progressive.js` (+271, mock-only Playwright 闭环, 覆盖 scan-visible/conservative-visible/marketing-slow/failed-partial/mobile-390)
  - `docs/TECHNICAL-DECISIONS.md` (+19, 加 D-129)
  - `docs/agent-handoff/DEV_CONTENT_T095_COMPLIANCE_PROGRESSIVE_20260501.md` (+87, 新增)
- 审查方法: 只读 `git show aed7571 -- <path>`, 完整 Read 关键文件; 在 `nrg-worktrees/content-dev` 跑了:
  - `pytest -q tests/test_compliance_progressive.py tests/test_compliance_fail_fast.py tests/test_tasks_api.py` -> 12 passed
  - `pytest -q tests/test_tasks.py::test_partial_result_cleared_when_task_finishes_ok_or_cancels test_partial_result_preserved_when_task_fails test_update_partial_result_ignores_finished_task test_update_partial_result_roundtrip_running_task` -> 4 passed
  - `node --check scripts/e2e_compliance_progressive.js` -> ok
  - 手工 Python 验证 `sanitize_result_for_display` 边界 (key 含 `token/route/model/provider/prompt/_priv` 全剥, 列表/嵌套/None 皆稳; 值含 `token-test` 不动; `compliance/description/word_count/violations/stats` 等正常字段不误伤)
  - 手工 Python 验证 `_partial_result` 在 leaky version_a (含 `route_key/model/provider/prompt/_tokens`) 输入下输出仍只有公开字段

## P0 风险

无。

## P1 风险

无。

T-095 验收的 4 个硬约束均落地:
- **partial_result/progress_data 语义** -- `_partial_result` 三级 (scan-only / +version_a / +version_a+version_b) 都把 `completed_stages/total_stages` 写齐, 公开字段走显式 allowlist (`_public_scan` 五字段 + `_public_version` 四字段 +/- `kept_marketing`), 然后再过一次 `sanitize_result_for_display` 兜底; `_progress_data` 也同源走同一个 sanitize. `_worker` 严格按"扫描->保守->营销"三段写 partial, 每段 `update_partial_result` 之后再做 `is_cancelled()` 早退检查 (`backend/services/compliance_pipeline.py:316-372`).
- **failed 保留 / ok / cancel 清空** -- 走 tasks 层既有语义: `update_partial_result` 仅写 running (`backend/services/tasks.py:202`), `finish_task(status=ok)` 清 partial+progress_data (`tasks.py:228-230`), `finish_task(status=failed)` 走 else 分支不清 partial (`tasks.py:239-242`), `cancel_task` 清 partial (`tasks.py:296-300`). T-095 的 `_worker` 在异常分支调 `finish_task(error=..., status="failed")`, 成功分支调 `finish_task(result=...)` (status 默认 ok), 跟 tasks 语义吻合. 已有 `tests/test_tasks.py::test_partial_result_cleared_when_task_finishes_ok_or_cancels / test_partial_result_preserved_when_task_fails / test_update_partial_result_ignores_finished_task` 4 项实跑通过, 加上 T-095 自己的 `test_compliance_marketing_failure_preserves_scan_and_conservative_partial` 端到端验证. failed 路径下 partial 真的留住 scan + version_a, 营销版位永远不出现.
- **API 清洗** -- `_sanitize_task_for_display` 改成 kind 路由 (`backend/api.py:669-685`), compliance.* 同时清 `result + partial_result + progress_data`; `sanitize_result_for_display` 用 `("token","route","model","provider","prompt")` 子串 + `_` 前缀双重过滤, deepcopy 再递归 dict/list 走清, 字段值不会被误删 (案例: `violations[].type="token-test"` 完整保留). 兼容路径 `/api/compliance/analyze|write` 也补了清洗. 自跑测试 `test_compliance_task_api_sanitizes_running_failed_partial_and_ok_result` 注入 `tokens/route_key/model/provider/prompt/prompt_preview` 后, /api/tasks/{id} 和 /api/tasks (list) 两个 endpoint 都不带这五个 substring; 同时 `保守版可用文案` 的正文不被吃掉.
- **不增加 LLM 调用** -- `_worker` 仍走 `_scan_violations -> _write_version("保守") -> _write_version("营销")` 三次 LLM (`compliance_pipeline.py:309-368`), 跟 D-037b3 同步路径一致, partial 写入只是把已有 dict 落到 SQLite, 没有额外 chat 调用. 同步路径 `check_compliance / analyze_input / write_output` 也未变.
- **测试覆盖真实 UI** -- `scripts/e2e_compliance_progressive.js` 是真 Playwright `chromium.launch`, 真填文案 + 选行业 + 点提交, 路由 mock 仅替换 `/api/compliance/check` 和 `/api/tasks/<id>`, 业务渲染走真 React. 覆盖 4 状态序列 (scan/conservative/slow/ok), failed 序列 (scan/conservative/failed), 390px 窄屏. 监听 `console error / pageerror / requestfailed / response>=400` 全部为 0, 且对 body innerText 跑 `forbiddenRe = /(prompt|tokens|route|model|provider|submit_id|\/Users|API)/i` 守住可见文案不露内部. 截图 `t095_compliance_{scan_visible, conservative_visible, marketing_slow, done, failed_preserve, mobile_390}.png` 已落 `/tmp/_ui_shots/`. (本次只读审查没重跑 Playwright, 复测责任在 T-096; 这一项以脚本/截图证据 + dev 报告 已通过为准.)

## P2 风险

### P2-1 取消按钮文案与实际行为不一致 (UX 诚实性)
- 位置: `web/factory-compliance-v2.jsx:93, 233-247` (按钮文案 `"取消剩余生成"`); 配套清理在 `backend/services/tasks.py:296-300` (`cancel_task` 清空 `partial_result/progress_data`)
- 现象: `ComplianceLiveStatus` 上的取消按钮写"取消剩余生成", 暗示已出的扫描和保守版会留下. 实际点了之后:
  1. `poller.cancel()` 触发 `cancel_task` -> partial_result 立即被 NULL 掉
  2. `setStep("input")` 把页面拉回输入
  3. 1-3 秒后 `useTaskPoller` 拿到 `status='cancelled'`, 触发 `onError("已取消")` -> `setErr; setStep("result")` -> 页面被强制跳回 `FailedRetry` 卡片, 标题"任务已取消"
- 影响: 用户以为"我只是不要营销版了, 保守版我还要", 实际上保守版被一起清掉, 还被反弹回 FailedRetry. 不是泄露问题, 是文案承诺和后端语义错位.
- 这是跨技能的共性 (hotrewrite cancel 也清 partial), 不是 T-095 引入. 建议两条路二选一:
  - 把按钮改成"取消整个任务"或"放弃这次"
  - 或在 tasks 层加一种"软取消保留 partial"(比如 status='cancelled', 但 partial 不清), 各 skill 按需选; 但这需要总控级评估
- **不阻塞 T-095**, 留给后续 polish 任务 (T-098 改造爆款时一起想)

### P2-2 保守版自身失败时 RewriteCard A pendingText 不诚实
- 位置: `web/factory-compliance-v2.jsx:282`
  ```jsx
  <RewriteCard variant="A" version={versionA} pending={!hasA}
    pendingText={result.stats ? "保守版正在写..." : "等扫描结束后开始"} />
  ```
- 现象: 当 `_write_version("保守")` 抛错而 `_scan_violations` 已成功时, partial_result 只剩 scan, `task.status='failed'`. 此时:
  - 横幅 (ComplianceLiveStatus) 走 `failed && !(hasA && !hasB)` 分支, 显示"这次没完整跑完，已保留能看的部分", 这是对的
  - 但 RewriteCard A 仍然 `pending=!hasA=true`, 文案 `pendingText` 因为 `result.stats` 真值, 走"保守版正在写...", 跟 task 已 failed 矛盾
  - 对照: RewriteCard B 有 `failed={failed && hasA && !hasB}` + `pendingText={hasA ? (failed ? "营销版暂时没跑完" : "营销版继续写...") : "保守版完成后开始"}`, B 的失败态文案是对的
- 触发概率: 较低. 保守版失败一般也意味着扫描后发的 prompt 严重出问题; 现在 `_write_version` 只对 JSON parse 失败 / content 空两种 raise, 大部分 LLM 抖动会被上游 retry 兜掉
- e2e 没覆盖该路径 (现有 `failed-partial` 场景是营销失败, 不是保守失败)
- 建议: RewriteCard A 也加 `failed={failed && !hasA}` 入参, pendingText 在 failed 且 !hasA 时走 "保守版暂时没跑完". 留给 T-098 爆款实时输出 MVP 一并对齐**不阻塞**

### P2-3 取消场景不在 e2e 覆盖范围
- 位置: `scripts/e2e_compliance_progressive.js` 的 `runScenario` 调用只有 `running-ok` 和 `failed-partial` 两组
- 现象: cancel 路径 (点按钮 -> POST /cancel -> 跳 input -> 反弹 FailedRetry) 没有真实浏览器复演. tasks 层 cancel_task 的清 partial 在 `tests/test_tasks.py` 单测覆盖了, 但 compliance 页面取消按钮的渲染条件 (`running && onCancel`) 和点击回调没有 e2e
- 触发概率: 中, 取消按钮一直可见
- 建议: 给 e2e 加一组 `cancel` 场景 (states=["scan","conservative"], 点取消, 断言下一次 poll 拿到 cancelled, partial 真的没了, 页面要么停留要么跳 FailedRetry). 留给 T-098 实时输出复用同样 hook 时一起做
- **不阻塞**, T-096 QA 可补做手工取消复演

### P2-4 LLM 异常消息中"tokens=N"会落到 task.error
- 位置: `backend/services/compliance_pipeline.py` 在 `_scan_violations` (D-094 注释段) 和 `_write_version` 抛 `RuntimeError(f"... LLM JSON 解析失败 (tokens={r.total_tokens}). 输出头: {r.text[:200]!r}.")`. T-095 没有改这两段, 是预先存在的代码
- 现象: 当 LLM 返非 JSON / 空 content 时, 这条字符串经 `_worker` 的 `f"{type(e).__name__}: {e}"` 写到 `task.error`, /api/tasks 返回的 task envelope 不走 `sanitize_result_for_display` (只清 result/partial_result/progress_data), 所以 `tokens=N` 和 LLM 200 字头会被前端 `FailedRetry` 直接展示
- 影响: `tokens=N` 是个数字, 不是凭证级泄露; 但"输出头"可能含用户原文片段. 跟 T-095 验收"未引入额外内部字段泄露"严格说是无关 (T-095 没改这段), 但顺手指出
- 建议: 后续做 P2 清理时在 `_worker` 的 except 里把 error message 也过一遍脱敏 (剥 `tokens=\d+`, `r.text[:200]`), 或者改 `_scan_violations / _write_version` 直接抛不带这两个字段的 `RuntimeError`. 留给后续脱敏巡检任务**不阻塞 T-095**

## 缺失测试

- 取消场景的 Playwright e2e (P2-3)
- 保守版自己失败的边界用例 (P2-2)
- 同步路径 `check_compliance / analyze_input / write_output` 在新加的 sanitize 包装下的回归测试: 当前 `tests/test_compliance_fail_fast.py` 6 个用例都直接调 `_scan_violations / _write_version`, 没经过 `/api/compliance/analyze|write` endpoint, 也没断言 `tokens` 字段不泄露. 不算必须, 因为同步路径基本只用作单测兜底, 但后面改 sanitize 规则时容易漏一处

## 用户体验问题

- P2-1: cancel 按钮文案承诺和后端语义错位
- P2-2: 保守版失败时 A 卡片仍说"保守版正在写..."
- 其他: 没看到额外问题. 横幅 `ComplianceLiveStatus` 慢提示 (`elapsed > max(70, 0.75 * estimated)`) 阈值合理 (90s 任务到 70s 后才提示慢); 进度文案"扫描完成: N 处风险, 正在写保守版..." -> "保守版已完成, 营销版继续写..." -> "营销版已完成, 正在整理结果..."梯度自然; 复制按钮在 `version.content` 缺失时禁用 + cursor=not-allowed + 文案"待完成", 跟 hotrewrite 同源行为一致

## 建议交给谁修

- 本次**不需要返修**, 直接放行 T-095 进入 T-096 QA 真实浏览器复演
- P2-1 / P2-2 / P2-3 三条 polish 留给内容开发 (NRG 内容开发自动) 在 T-098 爆款实时输出 MVP 时顺手对齐 (爆款会复用同一套 RewriteCard / ComplianceLiveStatus 同形态组件, 一次改完一齐用)
- P2-4 (`tokens=N` 在 error 串里) 是更广的脱敏巡检题, 不局限于 compliance, 可独立派一条"task.error 字段脱敏统一化"任务

## 下一步建议

1. 让 T-096 QA 在主线合并后 (建议先 fast-forward `codex/content-dev` -> `main`) 用正式 8000/8001 跑一次 `APP_URL=http://127.0.0.1:8001/?page=compliance node scripts/e2e_compliance_progressive.js` no-credit 闭环, 把 T-095 dev 报告里 临时 `127.0.0.1:18001` 那一组截图 用正式端口再补一遍
2. T-096 QA 同时手工演练取消场景 (扫描出来 -> 点"取消剩余生成" -> 看是否真的卡到 FailedRetry, 截图记录, 给 P2-1 留实证)
3. T-098 爆款实时输出 MVP 启动前, 让内容开发先把 P2-1 / P2-2 文案/状态对齐(不要再复制粘贴一遍错误形态)

## 是否需要老板确认

否. 无 P0/P1, 4 条 P2 全部明确归属和优先级; 直接 done T-097, 让 T-096 QA 接着复演. 如果 T-096 跑出新问题或主线合并发生冲突, 再找老板.
