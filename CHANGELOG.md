# CHANGELOG

> Keep-a-Changelog 格式 · 按决策号(D-XXX)和日期组织

所有决策的详细背景和代价见 [`docs/TECHNICAL-DECISIONS.md`](docs/TECHNICAL-DECISIONS.md)。

---

## [v0.4.0] — 2026-04-25 (autonomous loop 一夜批量)

这一轮由 cron 每 30 分钟自驱,一晚完成 P0-P8 九个任务 + Opus 修复。接入 skill 数从 0 → 4,测试从 0 → 85,集成深度显著提升。

### Added
- **[D-010]** 公众号文章 skill 全链路 GUI (4 commit) — 8 步流程从一句选题到推进微信草稿箱
  - `backend/services/skill_loader.py` 通用 skill 加载器
  - `backend/services/wechat_pipeline.py` Phase 1-2 (titles/outline/write+三层自检)
  - `backend/services/wechat_scripts.py` Phase 2.5/3/4/5 subprocess 调 skill 脚本
  - `web/factory-wechat-v2.jsx` 覆盖旧 PageWechat
- **[D-012]** 热点文案改写V2 skill — 3 步 (拆解+3角度 → 选 → 写正文+六维自检)
- **[D-013]** 录音文案改写 skill — 3 步 (提骨架+2角度 → 选 → 轻改写+自检清单)
- **[D-014]** touliu-agent skill 替换旧 /api/ad — 2 步 (采集 → 批量+lint)
  - 结构分配自动按 n 缩放 (痛对步话创比例)
  - subprocess 调 `scripts/lint_copy_batch.py` 本地质检
- **[D-015]** AI token/成本监控 — SQLite `ai_calls` 表 + `/api/ai/usage` + 首页 AiUsageCard
  - 价格: Opus $15/$75 per M · DeepSeek $0.14/$0.28 per M (汇率 7.2)
- **[D-016]** 工作流 localStorage 持久化 — `factory-persist.jsx` 通用 hook
  - 4 个 skill 全覆盖 (wechat/hotrewrite/voicerewrite/touliu)
  - 刷新浏览器不丢中间态 · 顶部 WfRestoreBanner 提示
- **[D-017]** Skill 骨架生成器 `scripts/add_skill.py` — 新 skill 从 3h → 30min
  - 幂等: 已注册跳过,不重复插入
  - 7 处注册: pipeline/jsx/api.py/sidebar/app routes/index.html/ai routes
- **[D-018]** 单元测试从 18 → 85 — 新增 4 个测试文件
  - `test_ai_routing.py` (7) · 引擎路由优先级
  - `test_ai_usage.py` (7) · 打点聚合成本计算 (用 tmp_db 隔离)
  - `test_pipelines.py` (25) · 3 skill 的 JSON 解析/分配/导出
  - `test_skills_smoke.py` (18) · 接入 skill 目录/模块/endpoint/jsx 完整性
- **[D-019]** 首页技能中心 — `backend/services/registered_skills.py` 单一事实源
  - `/api/skills/catalog` 扫 desktop + 注册表返回 17 项
  - 已接入 4 + 未接入 13 (过滤学员版)
  - SkillCenter 组件: 已接入 2 列 grid, 未接入可展开带 add_skill.py 命令提示

### Changed (P0 及 Bug 修复)
- **[P0]** 公众号加「🚀 全自动到封面」按钮 — 挑完标题自动跑完所有 AI 步直到封面
  - 顶部大进度条 + 子步骤列表 + 失败回退 + 中断接管
  - 跨 skill 复用设计 (未来其他多步 skill 沿用)
- **[基建] AI 引擎智能路由** — `get_ai_client(route_key=...)` 11 条默认路由
  - 轻任务 (titles/outline/plan) → DeepSeek (快 10-20 倍)
  - 重任务 (write/ad.generate) → Opus (质量)
  - settings.engine_routes 可覆盖
- **公众号流程系统性 UX 修复** — 所有 8 step 统一 `runStep` 模式
  - 点按钮立即跳 step (不等 API 回) · 失败自动回退
  - `Spinning` 组件带阶段文案轮播 (4-8 段/步 · 2s 切换)
  - Step 2 Titles 改用 3 张 pulse skeleton 骨架 + hover state

### Fixed
- **Step 5 配图卡片歧义** — 卡片改 flex 列布局,按钮始终可见 + ✨ 一键生成
- **Opus 持续 503** — 根因: httpx 默认 `trust_env=True` 读 macOS 系统代理 (Clash/VPN),
  即便打 localhost 也走系统代理。修复: `ClaudeOpusClient` 传 `httpx.Client(trust_env=False)`

---

## [v0.3.1] — 2026-04-24 晚 (D-008 人设系统)

### Added
- **[D-008]** 两档开关「深度理解业务」 — 关卡层人设注入
  - `backend/services/persona.py` 精简版 300 字 + 完整版 7500 字两档
  - `shortvideo/ai.py::PersonaInjectedAI` 包装器统一注入
  - 前端 `<DeepToggle />` 全站共享 localStorage
  - 5 页全覆盖 + API 6 模型加 `deep` 参数

---

## [v0.3.0] — 2026-04-24 (初始提交)

### Added
- 项目管理骨架 (CLAUDE.md + docs/PROGRESS.md + docs/TECHNICAL-DECISIONS.md)
- Git 初始化 · 全量代码入库 (84 文件)
- 设计稿 C2 全量实施: FastAPI + React 前端 8 页 + Obsidian 知识库只读
- AI 双轨 (Opus via OpenClaw / DeepSeek) · 一键切换
- 做视频 6 步流 · 投流文案批量 · 朋友圈 · 公众号基础版

---

_Maintainer: 清华哥 · Co-author: Claude Opus 4.7 autonomous loop_
