# 总控交接 · T-056 全页面体验清理

- Agent: NRG 总控
- 时间: 2026-04-30
- 任务: T-055 通过后继续做不烧 credits 的全页面扫描, 清理本机路径和工程词残留。

## 改动

- `web/factory-materials-v2.jsx`
  - 素材库默认只显示“Downloads 演示源 / 专用素材库”。
  - 完整素材源路径只在点击“更换”后作为编辑字段出现。
  - 空态不再直接展示本机路径。
- `web/factory-strategy.jsx`
  - 系统观察台改成用户口径: “外部生成总数 / 自动补救 / 后台巡检 / 链路”。
  - provider 名称映射为“快速出图 / 即梦 / 数字人”。
- `web/factory-home.jsx`
  - 首页“出图片”入口改为“一句话出图”, 去掉 `prompt`。

## 验证

- `git diff --check` -> clean
- `.venv/bin/pytest -q tests/test_materials_lib_api.py tests/test_materials_service.py tests/test_materials_pipeline.py` -> 180 passed
- `.venv/bin/pytest -q -x` -> passed, 仅 dhv5 本地 skill 缺失用例 skipped
- Playwright:
  - `/tmp/_ui_shots/materials_root_hidden_before_20260430.png`
  - `/tmp/_ui_shots/materials_root_edit_after_20260430.png`
  - `/tmp/_ui_shots/strategy_friendly_observatory_20260430.png`
  - `/tmp/_ui_shots/home_prompt_fixed_20260430.png`
- 23 个页面可见文案扫描:
  - `/Users` / `/private` / `prompt` / `apimart` / `tokens` / `API` / `RuntimeError` / `Traceback` / `没匹配到已知模式` / `原始 message` 均未命中
  - console error / pageerror / requestfailed / HTTP >=400 均为 0

## QA 状态

- T-055 独立 QA 已通过: `/Users/black.chen/Desktop/nrg-worktrees/qa/docs/agent-handoff/QA_T055_REPAIR_REGRESSION_20260430.md`, commit `606aea9`。
- T-054 已重置 stale claimed 并重新派给 QA-1, 当前仍在真实录音改写 + 热点改写链路复测中; 等最终 done/block 后总控继续处理。

## 结论

T-056 范围通过, 不烧 credits。
