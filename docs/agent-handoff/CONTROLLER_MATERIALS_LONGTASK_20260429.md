# 总控交接 · 素材库完整长任务

日期: 2026-04-29
角色: 总控 Agent

## 老板新指示

清华哥出门 2 天, 允许把素材库页安排成完整长任务, 工作量可以饱满一些, 回来直接验收成品.

## 调整

- 旧 T-023 是第一阶段 MVP, 已因媒体开发自动 Agent 网络证书错误阻断.
- 旧 T-024/T-025 依赖废弃的 T-023, 已标 cancelled.
- 新任务链:
  - T-026: 媒体开发实现完整素材库页.
  - T-027: Review 审查 T-026.
  - T-028: QA 做真实浏览器闭环.

## T-026 完整范围

- 继续用 `~/Downloads/` 做当前演示源.
- 未来迁移到 `~/Desktop/清华哥素材库/` 只改 `settings.materials_root`.
- 首页主心智改为 8 个业务大类: 待整理、演讲舞台、上课教学、研发产品、出差商务、做课素材、空镜补画面、品牌资产.
- 每条素材沉淀结构化画像: category、visual_summary、shot_type、orientation、quality_score、usage_hint、relevance_score、recognition_source.
- 新增限量分类批处理, 不允许无确认把 Downloads 上万文件全量烧 AI.
- 新增 `/api/material-lib/match`, 让后续剪辑按文案语义优先命中本地真实素材.
- 页面完成总览、大类、搜索、预览、待整理、用它做视频的闭环.

## 关键边界

- 不破坏 D-087 `material_*` 表隔离.
- 不改 `docs/PROGRESS.md` 的副 Agent 规则仍有效; 只有总控维护.
- 视觉识别可做扩展点和有限样本; 若视觉模型不可用, 第一版必须用 metadata 推断并在 UI 标明来源.
