# T-112 写文案首页摘要 P2 polish

接管说明: 内容开发自动进程已产出补丁, 但 16 分钟未提交/交接, 总控按 `worker_stuck` 接管收口并补齐验证。

## 改动

- `web/factory-write.jsx`
  - 恢复写文案任务时合并旧 `wf:*` 快照, 不再清空热点/爆款/录音等旧上下文。
  - 扩展任务摘要脱敏: 路径、端口、header/key、token、credit、watcher/daemon、模型/路由等内部词不展示。
  - 没有 `finished_ts/updated_ts` 的失败任务不再长期挂在首页。
  - 任务卡 key 改为稳定兜底, 避免无 id 任务影响渲染。
- `scripts/e2e_write_active_tasks.js`
  - 覆盖 7 类写文案任务: 投流、热点、录音、爆款、内容策划、违规审查、公众号长文。
  - 增加旧 workflow 快照保留断言。
  - 增加无时间失败任务隐藏断言。
  - 增加 `/api/settings` mock, 避免恢复到写作子页时出现控制台 404。
- `tests/test_frontend_copy_static.py`
  - 增加写文案首页任务规则覆盖守则。
  - 增加 raw task 字段不可直接渲染和脱敏守则。

## 验证

在 content-dev 临时前端 `http://127.0.0.1:18081/?page=write` 验证:

- `node --check scripts/e2e_write_active_tasks.js` -> pass
- `/Users/black.chen/Desktop/neironggongchang/.venv/bin/python -m pytest -q tests/test_frontend_copy_static.py` -> 11 passed
- `git diff --check` -> clean
- `APP_URL='http://127.0.0.1:18081/?page=write' node scripts/e2e_write_active_tasks.js` -> pass
  - scenarios: no-task, summary-resume, more-resume, untimed-failed-hidden, mobile
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

## 备注

- 本轮未提交真实写作生成请求, 未烧 credits。
- 主线合入后仍需总控在正式 `8000/8001` 再跑同一浏览器闭环, 然后进入 T-113 QA 和 T-114 Review。
