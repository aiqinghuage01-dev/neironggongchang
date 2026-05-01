# Controller Final · T-112/T-113/T-114 写文案首页任务摘要收口

## 背景

T-111 审查后留下 5 个 P2: 恢复任务会覆盖旧 `wf:*` 快照、脱敏范围偏窄、缺静态守则、E2E 只覆盖 4/7 类工具、无时间戳 failed task 会长期展示。

## 处理结果

- T-112 内容开发自动进程产出补丁后卡在未提交/未交接状态, 总控按 `worker_stuck` 接管。
- 主线合入:
  - `f28e339 fix: polish write active task recovery`
  - `c4156eb docs: add write active polish verification`
- 队列收口:
  - T-112 -> done, takeover_reason=`worker_stuck`
  - T-113 -> done, takeover_reason=`final_verification`
  - T-114 -> done, takeover_reason=`final_verification`

## 功能变化

- 写文案首页摘要覆盖 7 类任务: 投流、热点、录音、爆款、内容策划、违规审查、公众号长文。
- 点击“继续看进度 / 回去处理”时保留旧 workflow 快照, 不再覆盖热点、标题大纲、录音转写、策划结果等上下文。
- 扩展首页摘要脱敏, 避免展示本机路径、header/key、token、credit、watcher/daemon、模型/路由等内部词。
- 没有 `finished_ts/updated_ts` 的 failed task 不再挂在首页。

## 验证

- `node --check scripts/e2e_write_active_tasks.js` -> pass
- `.venv/bin/python -m pytest -q tests/test_frontend_copy_static.py` -> 11 passed
- `git diff --check HEAD~1..HEAD` -> clean
- `curl http://127.0.0.1:8000/api/health` -> HTTP 200
- `curl http://127.0.0.1:8001/?page=write` -> HTTP 200
- `APP_URL='http://127.0.0.1:8001/?page=write' node scripts/e2e_write_active_tasks.js` -> pass
  - scenarios: `no-task`, `summary-resume`, `more-resume`, `untimed-failed-hidden`, `mobile`
  - consoleErrors/pageErrors/failedRequests/httpErrors/nonGetApiRequests: 全 0
  - 390px `maxOverflow=0`

截图已读:

- `/tmp/_ui_shots/t101_write_active_tasks.png`
- `/tmp/_ui_shots/t112_write_active_tasks_more.png`
- `/tmp/_ui_shots/t112_resume_voicerewrite.png`
- `/tmp/_ui_shots/t112_resume_planner.png`
- `/tmp/_ui_shots/t112_resume_wechat.png`
- `/tmp/_ui_shots/t112_write_untimed_failed_hidden.png`
- `/tmp/_ui_shots/t101_write_active_tasks_390.png`

## 自动化流程备注

自动 QA/Review 被派出时, 对应 worktree 没包含主线 `f28e339`, 会读不到 T-112 报告并测旧代码。总控已停止这两个过期进程, 防止产生误导性“通过”报告。

已补派工器轻量护栏: `scripts/agent_dispatcher.py` 的启动提示现在会写入主工作区、主线 HEAD、当前 worktree 是否包含主线 HEAD, 并要求 QA/Review 在 worktree 落后时以主工作区和正式端口为事实源, 不能对旧分支下结论。

## Credits

未提交真实写作生成任务, 未烧 credits。
