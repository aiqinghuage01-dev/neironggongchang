# 总控交接 · T-043 素材库审查返修

时间: 2026-04-30
角色: 总控 Agent
基准: `main@252b4fd`

## 背景

审查 Agent 完成 T-043, 结论无 P0, 但指出 D-125 首页精选有 1 个 P1:

- featured 只看 `thumb_path` 和 `profile_updated_at`, 没过滤 `missing_at`, 原文件已挪走但缩略图仍在的素材可能被推到首页。

同时给出若干 P2: featured 失败拖垮首页、KPI 文案把 `usable` 说成可预览、空 featured 静默消失、limit 未做 FastAPI 校验。

## 已修复

- `list_featured_assets` 增加 `missing_at IS NULL`, 原文件已标记缺失的素材不再进入首页精选。
- `GET /api/material-lib/featured` 增加 `Query(18, ge=1, le=48)`, 超界参数直接 422。
- 首页 `featured` 请求失败时降级为空态, 不再让整个首页进入错误。
- 精选区为空时不再消失, 显示识别引导和「识别 20 条」按钮。
- KPI 副标题从「可直接预览」改为「质量达标」, 避免把 `quality_score>=60` 误说成文件一定能预览。
- 「未入业务类」KPI 和下方整理入口点击规则一致: 有待审核建议时进审核, 否则进 `00 待整理`。
- 增补 featured 回归测试:
  - 独立过滤 `missing_at` / `profile_updated_at` / `thumb_path`。
  - 排序契约: quality -> relevance -> imported_at。
  - 空集合返回 200。
  - limit=0/49 返回 422。

## 验证

- `git diff --check` -> clean.
- `.venv/bin/pytest -q tests/test_materials_lib_api.py tests/test_materials_service.py tests/test_materials_pipeline.py` -> 175 passed.
- `.venv/bin/pytest -q -x` -> passed; 仅 dhv5 本地 skill 缺失相关用例 skipped。
- 正式 API:
  - `/api/material-lib/featured?limit=18` -> 18 条。
  - `bad_missing=[]`, `bad_pending=[]`。
  - `limit=0` -> 422; `limit=49` -> 422。
- Playwright:
  - 首页可见 12 张精选卡, 12 张都有缩略图背景。
  - KPI 显示「42 条质量达标」, 不再显示「条可直接预览」。
  - 点击精选卡可打开原片预览, 标签/文件位置/「用它做视频」可见。
  - 强制 featured 500 时, 首页仍加载 KPI 和 7 个业务大类, 精选区显示空态和「识别 20 条」。
  - 正常路径 console error/pageerror/requestfailed/http error 均为 0。
- 截图:
  - `/tmp/_ui_shots/materials_t043_fix_home.png`
  - `/tmp/_ui_shots/materials_t043_fix_preview.png`
  - `/tmp/_ui_shots/materials_t043_fix_featured_failover.png`

## 未做

- P2 的缩略图文件存在性自愈和 tags/hits N+1 查询优化暂未做, 属于性能/自愈增强, 不阻塞当前验收。
- P3 的业务大类多样性调度暂未做, 以后素材量稳定后再设计。
