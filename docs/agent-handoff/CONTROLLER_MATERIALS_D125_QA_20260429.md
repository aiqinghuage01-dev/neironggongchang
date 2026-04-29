# 总控交接 · D-125 素材库验收补强

时间: 2026-04-29
角色: 总控 Agent
工作区: `/Users/black.chen/Desktop/neironggongchang`
分支: `main`

## 背景

老板验收反馈: 素材库页面看起来仍像空壳, 页面显示大量 0, 看不到符合业务的分类, 也没有素材可预览。

原因拆分:
- D-124 已有分类能力, 但首页把 `00 待整理` 和业务大类混在一起, Downloads 杂文件占主视觉。
- 可预览素材藏在分类页里, 首页没有先给「能直接用的业务素材」。
- 本地正式 `8000` 端口一度仍是旧后端进程, 临时端口验证结果没有同步到老板实际打开的页面。

## 本轮改动

- 新增 `GET /api/material-lib/featured?limit=18`, 只返回非 `00 待整理`、有缩略图、已画像的业务素材。
- 素材库首页新增「可直接预览的业务素材」精选卡片区, 点击卡片可直接打开原片预览。
- KPI 改为「总素材 / 业务素材 / 未入业务类 / 已识别」, 避免把待整理杂文件说成可用素材。
- 主分类只展示 7 个业务大类; `00 待整理` 单独降级为整理入口。
- 补回归测试, 覆盖 featured API 不返回待整理素材、不返回无预览素材。

## 验证证据

- `git diff --check` -> clean.
- `.venv/bin/pytest -q tests/test_materials_lib_api.py tests/test_materials_service.py tests/test_materials_pipeline.py` -> 172 passed.
- `.venv/bin/pytest -q -x` -> passed; 仅 dhv5 本地 skill 缺失相关用例 skipped。
- 正式 API:
  - `/api/material-lib/featured?limit=18` -> 18 条, 全部有 `thumb_path`, 且都不是 `00 待整理`。
  - `/api/material-lib/categories` -> 业务素材 55 条, 可直接预览 42 条, `00 待整理` 1563 条。
- Playwright 正式端口闭环:
  - 首页: 12 张精选卡片、7 个业务大类、待整理入口降级展示。
  - 预览: 点击精选卡片可打开原片预览, 右侧标签/画像/「用它做视频」可见。
  - 分类: 上课教学 30 个素材卡片, 缩略图可见, 右侧原片详情加载完成。
  - 剪辑检索: 输入演讲舞台文案后返回 20 个候选素材。
  - console error/pageerror/requestfailed/http error 均为 0。
- 截图已读:
  - `/tmp/_ui_shots/materials_clean_home.png`
  - `/tmp/_ui_shots/materials_clean_preview.png`
  - `/tmp/_ui_shots/materials_category_side_waited.png`
  - `/tmp/_ui_shots/materials_clean_match.png`
  - `/tmp/_ui_shots/materials_clean_mobile.png`

## 当前边界

- 当前仍以 `~/Downloads/` 做演示源, 所以待整理数量大是符合事实的; 后续切换到专用素材目录后, 首页业务素材质量会更稳定。
- 本轮没有调用视觉大模型或 LLM, 没烧 credits; 现阶段分类主要靠文件名/目录/metadata。
- `web/index.html` 仍是项目既有 `width=1440` 固定视口, 移动截图实际验证的是窄设备下的固定桌面画布, 本轮未改全站响应策略。

## 后续安排

- 素材库修正提交后, 总控继续把全站巡检任务投到共享队列:
  - 素材库正式端口独立 QA 复测。
  - 全站导航/作品库/设置/研发面板 smoke。
  - 内容链路与媒体链路真实页面巡检, 按 credits 风险分层执行。
  - 审查 Agent 只读审查本轮素材库 diff 和全站风险。
