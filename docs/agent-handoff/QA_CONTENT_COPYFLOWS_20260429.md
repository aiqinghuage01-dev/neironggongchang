# QA Report - Copyflows QA follow-up

## 任务 ID

Copyflows QA follow-up

## 测试对象

分支 / commit / 页面:

- Dev worktree: `/Users/black.chen/Desktop/nrg-worktrees/content-dev`
- Branch: `codex/content-dev`
- Commit: `886552b docs: add copyflows dev handoff`
- Code commit: `2670a5a fix: harden copywriting pipelines`
- API: `http://127.0.0.1:8010` (content-dev 独立后端)
- Web: `http://127.0.0.1:8011` (content-dev 独立前端)
- 范围: 投流文案、录音改写、热点改写; 爆款改写未测

## 真实操作

- 打开:
  - `http://127.0.0.1:8011/?page=ad`
  - `http://127.0.0.1:8011/?page=hotrewrite`
  - `http://127.0.0.1:8011/?page=voicerewrite`
- 设置: 浏览器 `localStorage.api_base=http://127.0.0.1:8010`
- 真烧: 通过 API 提交投流文案 `n=1` 最小真测
- 输入:
  - `pitch=QA最小真测：老板每天花20分钟用AI把门店成交问题整理成投流文案，先测1条快出是否不再超时。`
  - `industry=通用老板`
  - `target_action=加私域`
  - `n=1`
  - `channel=抖音短视频`
  - `run_lint=true`
- 等待: 先等 181 秒 QA 护栏, 后继续只查询同一 task 到 10 分钟点, 未重复提交

## 证据

- 截图:
  - `/tmp/_ui_shots/content_copyflows_ad_page_8011.png`
  - `/tmp/_ui_shots/content_copyflows_hotrewrite_page_8011.png`
  - `/tmp/_ui_shots/content_copyflows_voicerewrite_page_8011.png`
  - `/tmp/_ui_shots/content_copyflows_touliu_failed_ui.png`
- console error:
  - `/tmp/_ui_shots/content_copyflows_pages_browser_report.json`: `consoleErrors=[]`
  - `/tmp/_ui_shots/content_copyflows_touliu_failed_ui_report.json`: `consoleErrors=[]`
- pageerror:
  - `/tmp/_ui_shots/content_copyflows_pages_browser_report.json`: `pageErrors=[]`
  - `/tmp/_ui_shots/content_copyflows_touliu_failed_ui_report.json`: `pageErrors=[]`
- curl / API:
  - `/api/health`: `ok=true`, `ai.ok=true`, `qingdou.ok=true`, `apimart.ok=true`
  - 投流真测完整记录: `/tmp/_ui_shots/content_copyflows_touliu_real_20260429.json`
  - 投流 10 分钟 task: `/tmp/_ui_shots/content_copyflows_touliu_10min_task.json`
  - 投流最终摘要: `/tmp/_ui_shots/content_copyflows_touliu_final_summary.json`
  - `/api/ai/usage/recent?limit=10`: `touliu.generate` duration `591473ms`, `total_tokens=6051`
- pytest:
  - `/Users/black.chen/Desktop/neironggongchang/.venv/bin/python -m pytest -q tests/test_pipelines.py tests/test_hotrewrite_versions.py tests/test_llm_empty_content.py tests/test_ai_routing.py` -> `53 passed`
  - `/Users/black.chen/Desktop/neironggongchang/.venv/bin/python -m pytest -q tests/test_tasks.py tests/test_guest_mode.py tests/test_hotrewrite_versions.py tests/test_pipelines.py tests/test_llm_empty_content.py tests/test_skills_smoke.py` -> `104 passed`
  - `/Users/black.chen/Desktop/neironggongchang/.venv/bin/python -m pytest -q -x` -> stopped at existing environment issue `tests/test_integration.py::test_settings_loaded`, `SHILIU_API_KEY not loaded`
- diff:
  - `git diff --check f6e20bb..HEAD` -> passed

## Credits / 外部服务

- 是否真烧: 是
- 测试规格: 投流文案 `n=1` 最小真烧, 只提交 1 次
- 输入参数: 见上方真实操作
- task id / 作品 id:
  - `cf04ad56b1b34b3c87fcda8b5821f319`
- 实际消耗:
  - `touliu.generate`: `prompt_tokens=5732`, `completion_tokens=319`, `total_tokens=6051`
  - wall / task elapsed: `591s`
- 是否重复提交: 否

## 结果

不通过。

单测覆盖通过, 页面打开无 console/pageerror, 但投流 `n=1` 最小真实链路未通过: task 在 181 秒 QA 护栏时仍 running, 10 分钟点最终 failed。由于最小真烧已经失败, QA 未继续真实烧录音改写和热点 4 版; 热点 4 版属于多路 Opus 批量真烧, 需要修复投流后再按总控确认执行。

## 发现的问题

### P1 - 投流 `n=1` 快出真实链路仍跑到 10 分钟级并失败

- 请求: `/api/touliu/generate`, `n=1`, `run_lint=true`
- task: `cf04ad56b1b34b3c87fcda8b5821f319`
- 181 秒时:
  - `status=running`
  - `progress_pct=15`
  - `result=null`
  - `error=null`
- 591 秒时:
  - `status=failed`
  - `progress_pct=15`
  - `result=null`
  - `error=RuntimeError: 投流文案 LLM 输出非 JSON (tokens=6051)`
- AI usage:
  - `route_key=touliu.generate`
  - `duration_ms=591473`
  - `prompt_tokens=5732`
  - `completion_tokens=319`
  - `total_tokens=6051`

这说明本次修复没有让 1 条投流从真实链路上稳定快出。即使任务行 `estimated_seconds=60`, 实际仍接近 10 分钟才失败。

### P1 - 投流 JSON 输出解析仍不稳

失败输出头:

````text
已走技能：投流文案

```json
{
  "style_summary": {
    ...
```
````

模型实际开始输出 JSON, 但前面带了说明文字和 fenced code block。当前 `_extract_json` 最终返回 `None`, task 失败。结合 `completion_tokens=319`, 更可能是输出不完整或被上游截断, 需要同时处理:

- prompt 明确禁止“已走技能”等前缀和代码块
- 解析器支持常见 fenced JSON
- 对明显不完整 JSON 给更明确错误, 不让用户看到“投流没生成出来”但不知道是格式截断

### P2 - `/api/touliu/generate` 初始返回仍是 `estimated_seconds=150`

- 初始响应: `estimated_seconds=150`
- task 行: `estimated_seconds=60`

后端 task 内部估时已改成 60, 但 API 立即响应仍返回 150。当前前端主要靠 task 轮询展示, 影响小于 P1; 但这是修复口径不一致。

## 未继续真烧的范围

- 录音改写真实 LLM: 未跑。单测已覆盖“首次空 script 自动重试 1 次, 第二次成功则返回非空正文; 第二次仍空才失败”。
- 热点改写 4 版真实 LLM: 未跑。单测已覆盖 4 版返回和进度回调; 真实 4 版是多路 Opus 批量真烧, 在投流 P1 未修前不继续消耗。

## 复现步骤

1. 在 `content-dev` 启动 API: `set -a; source /Users/black.chen/Desktop/neironggongchang/.env; set +a; /Users/black.chen/Desktop/neironggongchang/.venv/bin/uvicorn backend.api:app --host 127.0.0.1 --port 8010 --log-level warning`
2. 提交:
   ```bash
   curl -s http://127.0.0.1:8010/api/touliu/generate \
     -H 'Content-Type: application/json' \
     -d '{"pitch":"QA最小真测：老板每天花20分钟用AI把门店成交问题整理成投流文案，先测1条快出是否不再超时。","industry":"通用老板","target_action":"加私域","n":1,"channel":"抖音短视频","run_lint":true}'
   ```
3. 轮询 `GET /api/tasks/cf04ad56b1b34b3c87fcda8b5821f319`.
4. 观察 181 秒仍 running, 591 秒 failed, error 为 `投流文案 LLM 输出非 JSON`.
