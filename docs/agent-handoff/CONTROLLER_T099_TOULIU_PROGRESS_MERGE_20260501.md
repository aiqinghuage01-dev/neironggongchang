# Controller Merge Report

## 任务

T-099 投流 n=1 慢等待解释与失败可读化

## 合入结论

已合入 main。

- dev commit: `8385761`
- main implementation commit: `331876f`
- QA/review report commit: `6951b36`

## 合入内容

- 投流 `n=1` 增加真实阶段快照:
  - 准备风格
  - 生成正文
  - 解析结果
  - 自检/整理
- `n=1` 仍只走一次 `touliu.generate.quick`, 不增加 LLM 调用。
- `/api/tasks` 和 `/api/tasks/{task_id}` 对 `touliu.*` 做展示清洗和错误白话化。
- 投流页 running/failed 改为专用阶段面板, 显示已等时间、慢等待解释、失败停在哪一步。
- 新增 no-credit Playwright 脚本和后端回归测试。

## 总控补验

- `.venv/bin/python -m py_compile backend/services/touliu_pipeline.py backend/api.py` -> pass
- `node --check scripts/e2e_touliu_progress.js` -> pass
- `curl http://127.0.0.1:8000/api/health` -> HTTP 200, `ok=true`
- `curl 'http://127.0.0.1:8001/?page=ad'` -> HTTP 200
- `.venv/bin/python -m pytest -q tests/test_touliu_progress.py tests/test_pipelines.py -k 'touliu' tests/test_ai_routing.py tests/test_tasks_api.py` -> 30 passed
- `APP_URL='http://127.0.0.1:8001/?page=ad' node scripts/e2e_touliu_progress.js` -> pass
  - slow-ok: `["slow", "ok"]`
  - parse-failed: `["parse_failed"]`
  - timeout-failed: `["timeout_failed"]`
  - console/pageerror/requestfailed/http error: 0
  - 390px: `maxOverflow=0`

## 截图已读

- `/tmp/_ui_shots/t099_touliu_slow_wait.png`
- `/tmp/_ui_shots/t099_touliu_ok.png`
- `/tmp/_ui_shots/t099_touliu_parse_failed.png`
- `/tmp/_ui_shots/t099_touliu_task_failed_friendly.png`
- `/tmp/_ui_shots/t099_touliu_mobile_390.png`

## 接管说明

T-106 QA 和 T-107 Review 自动进程两轮卡在连接/外部 CLI 层, 未产出有效测试和审查报告。总控停止假运行进程后补齐同范围 QA/Review 报告, 并用 `--takeover-reason` 关闭队列任务。

## 风险

- 本轮是“阶段流式”, 不是正文逐字流式; 正文仍在最终整理完成后一次显示。
- 未真烧 credits, 符合任务 no-credit 验收范围。
