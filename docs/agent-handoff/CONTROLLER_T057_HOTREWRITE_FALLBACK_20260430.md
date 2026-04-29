# T-057 总控交接 · 热点改写 4 版 Opus 超时兜底

时间: 2026-04-30  
角色: 总控 Agent  
分支: `main`

## 背景

T-054 QA-1 复测结论:
- 录音改写真链路通过。
- 热点改写唯一 4 版任务 `673043b93c2f40338e1bb00fa314ad91` 在 Opus/OpenClaw `Request timed out` 后失败。
- QA 未重复提交热点任务, 报告在 `docs/agent-handoff/QA1_T054_VOICE_HOT_RETEST_20260430.md`, QA commit `3471025`。

## 修复

- `shortvideo/ai.py`
  - 新增 `hotrewrite.write.fast -> deepseek` 默认路由。
- `backend/services/hotrewrite_pipeline.py`
  - 纯改写 V1/V2 走快路, 减少 4 版任务对 Opus 的依赖。
  - 业务结合 V3/V4 保持 Opus 优先, Opus 抛异常后自动兜底到 `hotrewrite.write.fast`, 防止整单失败。
  - 4 版任务改用 `sync_fn_with_ctx`, 逐版更新进度: 正在写第 N/4 版、已完成第 N/4 版。
  - 任务估时调整为 4 版 360 秒。
  - 增加产出清洗, 自动去掉模型偶发吐出的 `已走技能...` 和 `需要进一步操作吗...` 菜单。
- `backend/api.py`
  - `/api/hotrewrite/write` 返回的 `estimated_seconds` 与后端任务估时一致。
- `tests/test_hotrewrite_versions.py`
  - 覆盖 fallback、逐版进度、估时、产出清洗。

## 验证

- `git diff --check` -> clean。
- `.venv/bin/pytest -q tests/test_hotrewrite_versions.py tests/test_llm_empty_content.py::test_hotrewrite_write_script_raises_on_empty_content tests/test_llm_empty_content.py::test_hotrewrite_normal_content_no_raise tests/test_ai_routing.py tests/test_pipelines.py::test_hotrewrite_module_exports`
  - 18 passed。
- `.venv/bin/pytest -q -x`
  - passed, 仅本机缺少 dhv5 skill 的既有用例 skipped。
- API 重启后:
  - `curl http://127.0.0.1:8000/api/health` -> `ok=true`。
  - 产出清洗函数本地验证: 输入 `已走技能.../需要进一步操作吗...` 后只保留正文。
- Playwright 真实页面复测:
  - 页面: `http://127.0.0.1:8001/?page=hotrewrite`
  - 只提交 1 次热点改写 4 版任务。
  - task: `250a97291f9d4c8289231d4ab93609c7`
  - 结果: `status=ok`, `version_count=4`, `fallback_count=1`
  - route: `hotrewrite.write.fast, hotrewrite.write.fast, hotrewrite.write.fast, hotrewrite.write`
  - word counts: `1695,1747,1898,1915`
  - 第 3 版 Opus 超时后已兜底到快路, 第 4 版 Opus 正常完成。
  - 浏览器: console=0, pageerror=0, requestfailed=0, http>=400=0。
  - 截图:
    - `/tmp/_ui_shots/t057_hotrewrite_ready.png`
    - `/tmp/_ui_shots/t057_hotrewrite_ok.png`
- 不烧 credits 页面 smoke:
  - `node scripts/e2e_pages_smoke.js /tmp/_ui_shots/site_smoke_after_t057_20260430`
  - 16/16 pages OK, errors=0。

## 后续

- 原 T-054 保留为 QA 发现的阻塞证据。
- T-057 可关闭。
- 建议再派一个只读 QA 任务复核本次补丁, 但不要重复真实 4 版烧 credits; QA 可以跑 pytest、页面 smoke、检查已完成 task 和截图。
