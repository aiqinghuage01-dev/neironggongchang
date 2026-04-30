# QA Report

## 任务 ID

T-106

## 结论

通过。T-099 已在主线 `331876f` 上验证投流 `n=1` 的等待阶段、慢生成说明、解析失败友好态、完成态和 390px 窄屏。

本报告由总控接管完成: 原 QA 自动进程只写入 Codex websocket 重连失败日志, 未进入真实测试, 已停止该进程以避免假运行。

## 验证环境

- worktree: `/Users/black.chen/Desktop/neironggongchang`
- branch: `main`
- dev commit: `331876f`
- API: `http://127.0.0.1:8000`
- Web: `http://127.0.0.1:8001/?page=ad`

## 已跑命令

- `.venv/bin/python -m py_compile backend/services/touliu_pipeline.py backend/api.py` -> pass
- `node --check scripts/e2e_touliu_progress.js` -> pass
- `curl -sS -m 8 -w '\nHTTP %{http_code}\n' http://127.0.0.1:8000/api/health` -> HTTP 200
  - `ok=true`
  - `ai.ok=false` because OpenClaw probe timed out; total health still returned normally, no-credit QA 不依赖真烧。
- `curl -sS -m 5 -w '\nHTTP %{http_code}\n' 'http://127.0.0.1:8001/?page=ad'` -> HTTP 200
- `.venv/bin/python -m pytest -q tests/test_touliu_progress.py tests/test_pipelines.py -k 'touliu' tests/test_ai_routing.py tests/test_tasks_api.py` -> 30 passed
- `APP_URL='http://127.0.0.1:8001/?page=ad' node scripts/e2e_touliu_progress.js` -> pass

## Playwright 覆盖

- slow-ok: states `["slow", "ok"]`
- parse-failed: states `["parse_failed"]`
- timeout-failed: states `["timeout_failed"]`
- 390px:
  - `innerWidth=390`
  - `maxOverflow=0`
  - `bodyScrollWidth=390`
  - `rootScrollWidth=390`
- 浏览器错误统计:
  - consoleErrors: 0
  - pageErrors: 0
  - failedRequests: 0
  - httpErrors: 0

## 截图已读

- `/tmp/_ui_shots/t099_touliu_slow_wait.png`
- `/tmp/_ui_shots/t099_touliu_ok.png`
- `/tmp/_ui_shots/t099_touliu_parse_failed.png`
- `/tmp/_ui_shots/t099_touliu_task_failed_friendly.png`
- `/tmp/_ui_shots/t099_touliu_mobile_390.png`

## 用户可见检查

- 慢等待态可见:
  - 准备风格
  - 生成正文
  - 解析结果
  - 自检/整理
  - “比预期慢，正在等正文回传...”
- 解析失败态显示白话:
  - “投流没生成出来”
  - “内容回传不完整，已经停下。改短一点或重试一次。”
- 完成态正常显示 1 条投流文案。
- 页面未命中内部词:
  - `prompt`
  - `tokens`
  - `API`
  - `model`
  - `provider`
  - `route`
  - `JSON`
  - `submit_id`
  - `/Users`

## 备注

未真烧 credits。本任务验收明确默认 no-credit, 真实链路留给后续小批量专项验证。
