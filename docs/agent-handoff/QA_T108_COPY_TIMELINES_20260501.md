# QA Report

## 任务 ID

T-108

## 结论

通过。T-100 已在 main 上验证公众号写长文、录音改写、内容策划三类页面的阶段时间线、slow/failed/ok、390px 和内部词清理。

本报告由总控接管完成: QA 自动进程卡在 Codex websocket 重连, 未进入真实测试, 已停止该进程。

## 验证环境

- worktree: `/Users/black.chen/Desktop/neironggongchang`
- branch: `main`
- implementation commit: `5a9ada7`
- polish commit: `9da1aa7`
- API: `http://127.0.0.1:8000`
- Web: `http://127.0.0.1:8001`

## 已跑命令

- `.venv/bin/python -m py_compile backend/services/copy_progress.py backend/services/wechat_pipeline.py backend/services/voicerewrite_pipeline.py backend/services/planner_pipeline.py backend/api.py` -> pass
- `node --check scripts/e2e_copy_timelines.js` -> pass
- `.venv/bin/python -m pytest -q tests/test_copy_progress_timelines.py tests/test_wechat_pipeline_async_smoke.py tests/test_tasks_api.py` -> 10 passed
- `curl http://127.0.0.1:8000/api/health` -> HTTP 200, `ok=true`
  - `ai.ok=false` 是 OpenClaw 探活超时, no-credit QA 不依赖真烧。
- `curl 'http://127.0.0.1:8001/?page=wechat'` -> HTTP 200
- `APP_BASE='http://127.0.0.1:8001' node scripts/e2e_copy_timelines.js` -> pass

## Playwright 覆盖

- wechat:
  - slow: `["slow"]`, 390px `maxOverflow=0`
  - failed: `["failed"]`
  - ok: `["ok"]`
- voicerewrite:
  - slow: `["slow"]`
  - failed: `["failed"]`, 390px `maxOverflow=0`
  - ok: `["ok"]`
- planner:
  - slow: `["slow"]`
  - failed: `["failed"]`
  - ok: `["ok"]`, 390px `maxOverflow=0`
- 浏览器错误统计:
  - consoleErrors: 0
  - pageErrors: 0
  - failedRequests: 0
  - httpErrors: 0

## 截图已读

- `/tmp/_ui_shots/t100_wechat_slow_390.png`
- `/tmp/_ui_shots/t100_wechat_failed.png`
- `/tmp/_ui_shots/t100_voice_failed_390.png`
- `/tmp/_ui_shots/t100_planner_slow.png`
- `/tmp/_ui_shots/t100_planner_ok_390.png`

## 用户可见检查

- 公众号长文 running 可见“整理写作材料 / 正在写长文正文”。
- 公众号 failed 可见“停在哪一步”。
- 录音改写 failed 390px 左侧不再被侧栏遮挡。
- 内容策划 running 和 ok 均可读。
- 页面未命中:
  - `prompt`
  - `tokens`
  - `API`
  - `model`
  - `provider`
  - `route`

## 备注

未真烧 credits。本轮为 no-credit / mock 浏览器闭环。
