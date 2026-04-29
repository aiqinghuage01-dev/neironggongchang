# Dev Report

## 任务 ID

T-021

## 分支 / worktree

- branch: `codex/content-dev`
- worktree: `/Users/black.chen/Desktop/nrg-worktrees/content-dev`

## 改动摘要

- `touliu.generate.quick` 默认路由从 DeepSeek 改回 Opus, 不再依赖当前认证失败的 DeepSeek.
- `ClaudeOpusClient` / `DeepSeekClient` 显式 `OpenAI(..., max_retries=0)`, 去掉 SDK 内置 retry 与项目 retry 的叠加.
- 给 `touliu.generate.quick` 设置 fail-fast 运行参数: `timeout=55s`, `llm_max_retries=0`; 外部卡住时 60 秒内失败.
- 投流任务结果增加 `engine`, 让 `task.result.route_key` + `task.result.engine` + `ai_calls` usage 可以对账.
- 追加 D-118 技术决策和系统约束: SDK 内置 retry 必须关闭, 项目层 retry 是唯一可观测 retry.

## 改了哪些文件

- `backend/services/touliu_pipeline.py`
- `shortvideo/ai.py`
- `shortvideo/claude_opus.py`
- `shortvideo/deepseek.py`
- `tests/test_ai_routing.py`
- `tests/test_llm_empty_content.py`
- `tests/test_pipelines.py`
- `docs/SYSTEM-CONSTRAINTS.md`
- `docs/TECHNICAL-DECISIONS.md`
- `docs/agent-handoff/DEV_CONTENT_T021_TOULIU_ROUTE_FALLBACK_20260429.md`

## commit hash

- 本报告与代码同 commit 提交, 最终 commit 以总控收件箱/git log 为准.

## 已跑验证

- `python3 -m pytest -q tests/test_ai_routing.py tests/test_llm_retry.py` -> 22 passed.
- `python3 -m pytest -q tests/test_pipelines.py -k touliu` -> 26 passed.
- `python3 -m pytest -q tests/test_llm_empty_content.py` -> 14 passed.
- `python3 -m pytest -q tests/test_ai_routing.py tests/test_pipelines.py tests/test_llm_empty_content.py tests/test_llm_retry.py tests/test_skills_smoke.py` -> exit 0.
- `git diff --check` -> passed.
- `python3 -m pytest -q -x` -> stopped at existing env issue `tests/test_integration.py::test_settings_loaded`: `SHILIU_API_KEY not loaded`; failure is unrelated to T-021 and matches earlier T-014 record.
- 隔离 API `127.0.0.1:8136`:
  - `GET /api/ai/routes` -> `touliu.generate.quick.default=opus`, `effective=opus`.
  - 真实 curl 只提交 1 次 `POST /api/touliu/generate` with `n=1`.
  - task: `c0a4f4817f774c22b5ef7fc3b7f78c5e`.
  - final: `status=ok`, `elapsed_sec=38`, `estimated_seconds=60`, `progress_pct=100`.
  - task result: `route_key=touliu.generate.quick`, `engine=opus`, `tokens=4394`, `batch` 1 条, `lint.passed=true`.
  - AI usage recent id `21`: `engine=opus`, `route_key=touliu.generate.quick`, `duration_ms=37897`, `prompt_tokens=4134`, `completion_tokens=260`, `total_tokens=4394`, `ok=1`.

## 没测到 / 需要 QA 重点测

- 本轮未跑前端 Playwright 页面闭环; T-021 范围是后端路由和 LLM retry 兜底.
- QA 可以安排一次页面 `?page=ad` 最小真烧复测, 但本开发已完成一次真实 curl 生成, 不建议 QA 未经总控安排重复烧.
- QA 页面重点: task 是否显示 1 条文案, console/pageerror 是否为 0, task detail 是否能看到 `route_key=touliu.generate.quick` 和实际 Opus usage.

## 风险说明

- 快出路径回 Opus 后成本高于 DeepSeek, 但当前 DeepSeek 认证失败, Opus 是可用闭环.
- `touliu.generate.quick` 使用 55 秒 fail-fast; 如果 Opus 偶发超过 55 秒, 会失败而不是拖到数分钟. 这是按快出路径的 60 秒验收目标取舍.
- `n>=3` 的 `touliu.generate` 仍走默认 Opus + 项目层 1 次 retry, 未改批量长任务策略.
- 未触碰 `.env`; DeepSeek 认证问题未在本任务内修密钥.

## 下一步建议

- 总控可把 T-021 标开发通过, 再决定是否让 QA 做页面一次最小真烧.
- 若 QA 页面也通过, 可恢复 T-016 录音改写/热点改写真链路复测.
- DeepSeek 认证问题单独排查密钥/代理; 不阻塞投流快出当前路径.

## 是否需要老板确认

否. 本任务没有扩大真烧范围, 也没有修改密钥或业务口径.
