# 总控交接 · T-026 素材库精品原片库主线完成

日期: 2026-04-29  
角色: 总控 Agent  
任务: T-026 / T-027 / T-028 总控接管收束

## 结论

通过。素材库已从 Downloads 文件浏览器主心智改成“精品原片库”主心智: 首页固定 8 个业务大类, 支持素材源目录保存, 支持 metadata 结构化画像, 支持限量分类批处理, 支持按文案/镜头描述做剪辑检索。

媒体开发自动 Agent 在 T-026 输出了可用 patch 但未提交, 总控已停止卡住进程, 审查后把 patch 合入 main 并补了两处收口:

- 右栏“最常用”也返回业务大类、画面摘要、质量分、标签等画像字段。
- 新画像分类会复用旧 AI 标签, 便于从已有 1618 条 Downloads 素材迁移。

## 改动范围

- `backend/services/migrations.py`: schema version 升到 V5, `material_assets` 增加 `category`, `visual_summary`, `shot_type`, `orientation`, `quality_score`, `usage_hint`, `relevance_score`, `recognition_source`, `profile_updated_at`.
- `backend/services/materials_service.py`: 8 个业务大类、metadata 画像、分类聚合、剪辑匹配、画像字段搜索、常用素材画像字段。
- `backend/services/materials_pipeline.py`: 新增 `classify_asset` / `classify_batch`, 走 metadata 快速层, 不烧 LLM credits。
- `backend/api.py`: 新增 `/api/material-lib/categories`, `/api/material-lib/match`, `/api/material-lib/classify/{id}`, `/api/material-lib/classify-batch`; 旧 `tag-batch` 增加大批量保护。
- `backend/services/settings.py`: 增加 `materials_root` 默认值, 当前为 `~/Downloads`, 后续可切专用目录。
- `web/factory-materials-v2.jsx`: 首页固定 8 大类、素材源设置、剪辑检索、大类货架、结构化画像展示、响应式布局。
- `tests/test_materials_*`, `tests/test_migrations.py`: 覆盖新 schema、分类、检索、API、右栏画像字段、旧标签迁移。

## 验证证据

### Pytest

- `python3 -m pytest -q tests/test_materials_service.py tests/test_materials_pipeline.py tests/test_materials_lib_api.py tests/test_migrations.py` -> 通过。
- `python3 -m pytest -q` -> 通过; 仅 `tests/test_dhv5_pipeline.py` 因本机无 dhv5 skill 跳过。
- `git diff --check` -> clean。

### 真实 API

临时后端: `http://127.0.0.1:18000`

- `GET /api/material-lib/stats`: `total=1618`, `root=/Users/black.chen/Downloads`.
- `GET /api/material-lib/categories`: 返回固定 8 类。
- `POST /api/material-lib/match`: 输入“需要出差商务或者演讲现场的素材, 用来做开场证明”后返回演讲舞台候选, 含 `match_score` 和 `match_reason`。
- `POST /api/material-lib/classify-batch?limit=100`: task `64e1eaa9abaf47fbad12864d685c07c2` -> `ok`, `scanned=100`, `ok=100`, `failed=0`, `source=metadata`; 未调用 LLM。
- 当前真实 Downloads 演示源已 metadata 分类 120 条: 演讲舞台 5, 上课教学 30, 研发产品 7, 空镜补画面 12, 品牌资产 1, 其余仍待整理。

### 浏览器

临时前端: `http://127.0.0.1:18001/?page=materials`, API 指向 `18000`.

- 截图已读:
  - `/tmp/_ui_shots/t026_materials_desktop_home.png`
  - `/tmp/_ui_shots/t026_materials_desktop_category.png`
  - `/tmp/_ui_shots/t026_materials_desktop_match.png`
  - `/tmp/_ui_shots/t026_materials_mobile_home.png`
- 桌面: 首页标题为“素材库 · 精品原片”; 8 个大类; 点击“上课教学”进入 30 条素材货架; 剪辑检索返回 8 条候选。
- 移动: `scrollWidth=clientWidth=390`, 标题/搜索/KPI/大类单列展示, 不再挤压成竖排。
- console error: 0; pageerror: 0; requestfailed: 0; HTTP 4xx/5xx: 0。
- 仅有 1 条 Babel CDN 开发 warning, 属现有 React CDN 开发模式提示。

## 审查结论

T-029 前置审查的 P0 已处理:

- 旧 8 类改成 D-124 业务大类。
- `materials_root` 加入 settings 白名单。
- 首页主入口改为固定业务大类, 不再优先显示 Downloads 原始目录。
- 新增 `/match` 剪辑检索。
- 批量分类默认限量, metadata 分类不烧 credits; 旧 LLM `tag-batch` 超 100 需要显式确认。
- UI 标明“按文件信息判断”, 不假装已做视觉识别。

## 剩余边界

- 当前是 metadata 快速层: 依据文件名、路径、尺寸、时长、旧标签判断; 还不是视觉模型看图或视频关键帧识别。
- Downloads 演示源里还有大量泛文件名素材, 会留在 `00 待整理`; 这符合演示阶段预期, 后续专用素材目录 50-200 条精品原片会更准。
- 本轮不做真实文件移动, 只做虚拟分类和检索; 后续如果需要物理整理再单独设计确认。

## 队列处理建议

- T-026 可标记 done, commit 用本轮主线提交。
- T-027/T-028 可由总控以本报告验收关闭; 若老板仍希望独立副 Agent 复核, 需要先把 review/qa worktree 同步到本轮主线 commit, 避免测旧代码。
- T-035 是自动返工循环误触发的重复 worker, 已停止并标 blocked, 以 main 本轮结果为准。
