# QA T-113 · 写文案首页摘要 polish

## 任务 ID

T-113

## 测试对象

- 主线 commit: `f28e339 fix: polish write active task recovery`
- 页面: `http://127.0.0.1:8001/?page=write`
- API: `http://127.0.0.1:8000`
- 接管说明: 自动 QA worktree 未包含 `f28e339`, 继续等待会测到旧代码。总控停止该过期进程后按同等 QA 标准接管。

## 真实操作

- 打开写文案首页空任务状态。
- 注入 mock running/failed tasks, 查看首页摘要。
- 点击恢复 7 类任务: 投流、热点、录音、爆款、内容策划、违规审查、公众号长文。
- 校验旧 `wf:*` 快照至少保留热点、公众号, 脚本同时覆盖录音/策划/爆款/投流/违规审查。
- 注入无 `finished_ts/updated_ts` 的 failed task, 确认首页不展示。
- 390px 视口检查横向溢出。

## 证据

- `node --check scripts/e2e_write_active_tasks.js` -> pass
- `.venv/bin/python -m pytest -q tests/test_frontend_copy_static.py` -> 11 passed
- `git diff --check HEAD~1..HEAD` -> clean
- `curl http://127.0.0.1:8000/api/health` -> HTTP 200; AI 探活 timeout 被记录为 `ai.ok=false`, 不影响本 no-credit 页面回归
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

## Credits / 外部服务

- 是否真烧: 否
- 说明: 全部写作任务使用 Playwright route mock; 非 GET API 请求数为 0。
- 是否重复提交: 否

## 结果

通过。

## 发现的问题

无阻塞问题。

## 下一步建议

T-114 审查确认无 P0/P1/P2 后, T-101/T-112 这一轮可关闭。

## 是否需要老板确认

否。
