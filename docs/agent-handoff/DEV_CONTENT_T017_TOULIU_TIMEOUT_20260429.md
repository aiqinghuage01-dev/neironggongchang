# Dev Report

## 任务 ID

T-017

## 分支 / worktree

- branch: `codex/content-dev`
- worktree: `/Users/black.chen/Desktop/nrg-worktrees/content-dev`

## 改动摘要

- 给投流 `n<=2` 快出路径拆出独立 AI route: `touliu.generate.quick`。
- `touliu.generate.quick` 默认走 DeepSeek, 继续通过 `shortvideo.ai.get_ai_client` 统一关卡层; `n>=3` 仍走原 `touliu.generate` Opus 批量路由。
- `generate_batch` 返回结果里记录实际 `route_key`, 方便后续 task / usage 对齐排查。
- 补投流 pipeline 回归测试和 AI 路由测试, 防止快出路径又落回 Opus。

## 改了哪些文件

- `backend/services/touliu_pipeline.py`
- `shortvideo/ai.py`
- `tests/test_pipelines.py`
- `tests/test_ai_routing.py`
- `docs/agent-handoff/DEV_CONTENT_T017_TOULIU_TIMEOUT_20260429.md`

## commit hash

- 本报告与代码同 commit 提交, 最终 commit 以总控收件箱/git log 为准。

## 已跑验证

- `python3 -m pytest -q tests/test_pipelines.py -k touliu` -> passed.
- `python3 -m pytest -q tests/test_ai_routing.py` -> 7 passed.
- `python3 -m pytest -q tests/test_pipelines.py tests/test_ai_routing.py tests/test_skills_smoke.py` -> passed.
- `git diff --check` -> passed.
- 隔离端口 `8135`:
  - `GET /api/health` -> `ok=true`。
  - `GET /api/ai/routes` -> `touliu.generate.quick.effective=deepseek`, `touliu.generate.effective=opus`。
  - 真实 curl 只提交 1 次投流 `n=1`:
    - task: `228b271fa1d945908c068fb25235b7b0`
    - API 初始返回 `estimated_seconds=60`
    - 最终 `status=ok`, `elapsed_sec=11`, `progress_pct=100`
    - `result.batch` 1 条, `result.route_key=touliu.generate.quick`, `lint.passed=true`
    - AI usage: `engine=deepseek`, `route_key=touliu.generate.quick`, `duration_ms=11591`, `prompt_tokens=9338`, `completion_tokens=652`, `total_tokens=9990`, `ok=1`

## 没测到 / 需要 QA 重点测

- 本轮没有跑前端 Playwright 页面闭环; T-017 是后端 route / pipeline 返修。
- QA 仍需执行 T-015 页面复测: 打开 `?page=ad`, 真点真填 `n=1`, 确认页面展示 1 条文案, console/pageerror 为 0。
- QA 复测对象必须包含本次 T-017 commit, 否则会重复测到旧 Opus 路由。

## 风险说明

- `shortvideo/ai.py` 属于全局路由表, 本次只新增一个投流快出 route, 没改其他 route 解析逻辑。
- 快出路径改用 DeepSeek 后速度明显改善, 但质量仍需 QA 从页面结果做一次人工可读性确认。
- `n>=3` 批量投流仍走 Opus, 不在本次 T-017 范围内。

## 下一步建议

- 总控安排 QA 重新执行 T-015, 明确测试代码包含本次 T-017。
- T-015 通过后再恢复 T-016 录音改写和热点改写真实链路。

## 是否需要老板确认

否。仍是已登记的投流最小闭环返修, 没扩大 credits 范围。
