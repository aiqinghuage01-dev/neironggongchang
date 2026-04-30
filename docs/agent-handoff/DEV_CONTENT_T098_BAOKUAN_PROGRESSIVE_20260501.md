# Dev Report

## 任务 ID

T-098

## 分支 / worktree

`codex/content-dev`

`/Users/black.chen/Desktop/nrg-worktrees/content-dev`

## 改动摘要

- 爆款改写后端从“一次黑箱等全部版本”改为逐版生成: 每完成 V1/V2/V3/V4 中一个完整版本, 写入 `task.partial_result.versions` 和 `task.partial_result.units`。
- V4 等慢时, `progress_data.timeline` 保留当前正在写的版本, 前端显示已等时间、当前版本和取消剩余生成。
- `failed` 不清空已完成版本; task API 对 `baokuan.*` 的 `result` / `partial_result` / `progress_data` 做展示清洗, 去掉内部字段和模型偶发菜单。
- 前端爆款页 running / failed 时优先展示 partial, ok 时展示完整版本; 390px 窄屏无横向溢出。

## 改了哪些文件

- `backend/services/baokuan_pipeline.py`
- `backend/api.py`
- `web/factory-baokuan-v2.jsx`
- `tests/test_baokuan_progressive.py`
- `scripts/e2e_baokuan_progressive.js`
- `docs/agent-handoff/DEV_CONTENT_T098_BAOKUAN_PROGRESSIVE_20260501.md`

## commit hash

c9ded74

## 已跑验证

- `python3 -m py_compile backend/services/baokuan_pipeline.py backend/api.py` -> pass
- `node --check scripts/e2e_baokuan_progressive.js` -> pass
- `git diff --check` -> clean
- `/Users/black.chen/Desktop/neironggongchang/.venv/bin/pytest -q tests/test_baokuan_progressive.py tests/test_tasks_api.py tests/test_hotrewrite_versions.py tests/test_compliance_progressive.py` -> 20 passed
- Playwright no-credit: `APP_URL='http://127.0.0.1:18098/?page=baokuan' node scripts/e2e_baokuan_progressive.js` -> pass
  - running partial V1 / V2
  - V4 slow
  - failed partial 保留 V1-V3
  - ok 4 版
  - 390px `maxOverflow=0`
  - console/pageerror/requestfailed/http error 全 0
  - 页面未出现 `prompt/tokens/API/model/provider/已走技能` 等内部词
- 截图已读:
  - `/tmp/_ui_shots/t098_baokuan_running_v1.png`
  - `/tmp/_ui_shots/t098_baokuan_running_v2.png`
  - `/tmp/_ui_shots/t098_baokuan_slow_v4.png`
  - `/tmp/_ui_shots/t098_baokuan_done.png`
  - `/tmp/_ui_shots/t098_baokuan_failed_partial.png`
  - `/tmp/_ui_shots/t098_baokuan_mobile_390.png`
- 临时当前 worktree API `:18099` curl no-credit:
  - `POST /api/baokuan/rewrite` 返回 `task_id/status/page_id/version_count`
  - `GET /api/tasks/{task_id}` 返回已清洗 task result, 无外部生成调用

## 没测到 / 需要 QA 重点测

- 未做真实 LLM 真烧。原因: T-098 要求逐版拆分, 真实 `all` 模式会从原先 1 次 rewrite 调用变成最多 4 次 rewrite 调用, credits 和等待时间都会增加。本轮按任务说明走 mock/no-credit 验收。
- 真烧建议: QA 只跑 1 次最小 `pure` 模式 V1/V2, 确认逐版 partial 与最终 result；`all` 模式等总控确认额度后再跑。

## 风险说明

- 逐版生成改变了真实调用形态: V1/V2/V3/V4 各自走 `shortvideo.ai.get_ai_client(route_key="baokuan.rewrite")`, 保留清华哥人设关卡, 但总 tokens 可能高于旧版一次性 JSON 生成。
- 全量 `pytest -q -x` 未通过, 停在既有媒体线 `tests/test_apimart_service.py::test_apimart_watcher_enriches_single_image_task_result`: 用例期待 `works.local_path` 为绝对路径, 但当前系统硬约束 R2 要求入库相对路径。该失败不在本次 content/baokuan 范围, 未修改媒体线测试。

## 下一步建议

- 让 QA 用本脚本先做独立 no-credit 复测。
- 若要真烧, 先跑 `pure` 两版; 通过后再决定是否跑 `all` 四版。

## 是否需要老板确认

否。
