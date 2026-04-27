# CHANGELOG

> Keep-a-Changelog 格式 · 按决策号(D-XXX)和日期组织

所有决策的详细背景和代价见 [`docs/TECHNICAL-DECISIONS.md`](docs/TECHNICAL-DECISIONS.md)。

---

## [v0.5.1] — 2026-04-27 (系统硬约束集中化)

vibecoding 方法论评审后, 把分散在 D-068/D-069/D-070/D-078 的硬约束集中成独立文档,
解决"约束散落, 新 AI 接手只能踩二茬坑"的问题. 同时锁定路线 B (千人内学员版) 路径策略.

### Added
- **[D-083]** `docs/SYSTEM-CONSTRAINTS.md` — 系统硬约束集中文档
  - §0 路径策略: 路线 B 锁定 (千人内, 不上 k8s/微服务, 但多用户前必须换 Postgres + 队列 + 对象存储, SQLite 仅低并发过渡)
  - §1 异步任务: daemon 必须挂 tasks 框架 + 远程任务必须走 remote_jobs watcher
  - §2 AI 调用: 必须走 `shortvideo.ai.get_ai_client()` 关卡层 (绕过 = 丢人设/路由/retry/usage 4 项)
  - §3 访客模式: `guest_mode.is_guest()` + 跨 daemon contextvar capture/set
  - §4-§7 知识库只读 / 错误友好化 / 接入 skill 范式 / playwright 测试闭环
  - 含 `paths.py` 最小骨架样例 (~30 行, 第一个真要新增 user 路径的 commit 同步建)
- **[D-083]** 路径硬编码策略锁定: 已有不重构 + 新代码走 paths.py + 摸到老硬编码顺手替换

### Changed
- `CLAUDE.md`: 237 行 → < 200 行, 第一屏加 SYSTEM-CONSTRAINTS 指针, 分散的 D 编号引用统一指过去
- `AGENTS.md`: 220 行 → < 200 行, 同步瘦身, **修历史漂移**:
  - 版本号 v0.3.0 → v0.5.1
  - "Codex Opus" 笔误 → "Claude Opus"
  - 已接入 skill 列表 4 → 8 个 (补 planner/compliance/dreamina/dhv5)
- 两份入口的 "Session 开始 2 步" → "3 步" (加读 SYSTEM-CONSTRAINTS)
- 两份入口的文档事实源表加一行 SYSTEM-CONSTRAINTS

### 一句话总结
GPT 审查 Claude 评审方案抓出 5 点漏洞 (AGENTS 没同步 / paths.py 引用幽灵接口 / 千人 SQLite 表述太粗 / 缺验收 / CHANGELOG 断层), 全收, 重做.

---

## [v0.5.0] — 2026-04-27 (远程任务 watcher + LLM 重试 + 真烧 credits e2e)

D-071 → D-082 一周连环改造, 远程长任务永不假失败 + LLM 抽风自动重试 + 失败可重做.
覆盖即梦/数字人/出图三类远端长任务. pytest 288 → 321.

### Added
- **[D-071]** 访客模式从侧栏挪进设置页 (D-070 后续, 入口降权)
- **[D-072]** 设置页加密码门 (`qinghua116`) — 防误触敏感开关
- **[D-073]** 出图加参考图 — 上传 → base64 data URL → apimart, 多图融合
- **[D-074]** 通用 `ImageWithLightbox` 组件 + 5 处接入 (作品库/出图/公众号/即梦/数字人)
- **[D-075]** 即梦批量视频 + 9 张参考图 — text2video / image2video / multimodal2video 自动分流
- **[D-076]** 出图批量 + 公众号封面批量 (复用 D-075 卡片堆叠)
- **[D-077]** 数字人 v5 批量渲染 — ≤8 文案 → 共享 dh + 共享模板 → N 个视频
- **[D-078a]** 远程长任务 `remote_jobs` DB + watcher 框架 (新基础设施)
  - 持久化 submit_id + last_status + poll_count, 60s tick 调 provider poll_fn
  - task.payload.remote_managed=true → recover_orphans / sweep_stuck 跳过
  - max_wait_sec 默认 2h 兜底, 进程重启 DB 接管不丢
  - provider 注册框架: `register_provider("dreamina", poll_fn, on_done=cb)`
  - 19 单测全过 (含进程重启接管)
- **[D-078b]** 即梦改走 watcher
  - `dreamina_service.submit_only / _poll_for_watcher / _on_done_for_watcher / register_with_watcher`
  - `/api/dreamina/batch-video` daemon thread 立即 submit + register, response 8s (旧 30s+)
  - 真测 4s 视频, 8min 即梦端真在 querying, watcher poll_count=10 工作正常, task 没被假杀
- **[D-078c]** recover endpoint + UI 重查按钮
  - `POST /api/dreamina/recover/{submit_id}` 真测重置 watcher 接管
  - `GET /api/remote-jobs/by-task/{task_id}` UI 拿 submit_id
  - `GET /api/remote-jobs/stats` watcher_running + 3 providers
  - TaskCard "🔍 重查即梦" (failed dreamina + payload.submit_id 时显示)
- **[D-079]** 数字人 (柿榴) 接 watcher (additive)
  - `backend/services/shiliu_service.py` poll/on_done/register
  - `/api/video/submit` 创建 task + register remote_job
- **[D-080/D-081]** apimart 基础设施
  - `backend/services/apimart_service.py` poll/on_done/submit_and_register helper
  - endpoint 切换暂搁置 (大改造, 等真出问题再切, 见 KNOWN_ISSUES.md)
- **[D-082b]** "🔄 重新生成" 按钮 (简化版) — failed 非 dreamina task 跳 page_id, 完整版 sessionStorage 预填留 known issue
- **[D-082c]** LLM 自动重试 1 次 (transient 错误兜底)
  - `shortvideo/llm_retry.py with_retry` helper
  - 关键字判定 5xx / timeout / rate-limit / connection
  - claude_opus / deepseek `chat()` 都接, 13 单测全过
  - 文案功能"偶尔抽风又失败"消失
- **[D-082d]** 文案 12 真测 (核心)
  - rewrite/transcribe 跳过 (老 endpoint 已废 / 需真 url 间接覆盖)
  - 真烧 credits 走 batch.py + smoke 11/11 PASS
  - hotrewrite 浏览器闭环验 analyze 通
- **[D-082e]** `DREAMINA_MOCK=1` 桩模式 — query_result 立即返 done + 现成 mp4, 仅供开发自测加速
- **[T1-T13]** 13 项全闭环真烧 credits 完整验收 + 5 项新功能
- **`scripts/run_e2e_full.sh`** 一键全量
  - Phase 1: backend smoke 11 endpoint
  - Phase 2: 文案 LLM 真烧 credits batch (D-082d 8 个)
  - Phase 3: 16 关键 page 浏览器截图巡检
  - Phase 4: pytest 完整套件

### Tested
- pytest 288 → **321 passed** (+33), 1 skipped 跟之前一致
- Playwright 真烧 4s 视频, watcher 全程跟踪正常
- 抢救老 task 7aef6b97/4290bbcc/e76aca91 → 救回 2 个入作品库 (work_id=215, 216)

### Known Issues (留作下一轮)
- 即梦超长排队 >2h (case 7aef6b97 仍 12h+ querying)
- apimart endpoint 没切 watcher 路径
- 文案 retry 不预填 sessionStorage
- 录音转文字没直接真测

### 一句话总结
远程长任务永不假失败 + LLM 抽风自动 retry, 老板再也不会"提交即梦后看到失败但平台扣 credits".

---

## [v0.4.0] — 2026-04-26 (任务防御 + 去技术化 + 访客模式)

一天连环修 + 加固 + 去技术化, 5 个 D 编号, 6 个 commit:

### Added
- **[D-068]** 任务卡死防御三层 — 启动孤儿恢复 + 周期 watchdog 60s + UI 卡死可视化
  - `tasks.recover_orphans()` startup hook, --reload 后自动收尾
  - `tasks.sweep_stuck()` + `start_watchdog()` Timer 60s 巡检
  - TaskCard stale 时橙边框 + "等了 Xm" + "停掉"按钮
  - 老板触发"热点改写"等 14min 卡死的 root cause + 全套防御
- **[D-068]** 战略部入口 (placeholder, 等装战略规划技能)
  - 品牌行 (🏭 清华哥内容工厂) 整行可点 → home (作为总部入口)
  - 原首位 NAV `总部` 改名 `战略部` (id=strategy, icon=🧭)
- **[D-068b]** 防御扩展 — deepseek 显式 timeout=120s + `night_shift.recover_orphan_runs()`
  - OpenAI SDK 默认 timeout 10min 改 120s, 上游卡先抛
  - night_job_runs 也是 daemon thread, 启动钩子同步收尾
  - 审计 5 处 daemon spawn 全覆盖 (tasks/compliance/dhv5/cover/night)
- **[D-068c]** 修投流 422 + `scripts/smoke_endpoints.sh`
  - API `n: ge=3 → ge=1`, pipeline `max(3,...) → max(1,...)`
  - 1/2 条 alloc 规则补齐 (单条 = 1痛点, 2 条 = 1痛点+1对比)
  - 巡检 9 个主 POST endpoint 用合理 payload, 防 schema 错配复发
- **[D-069]** 错误统一拦截 + LiDock 融合 TaskBar + 去技术化文案
  - `factory-api.jsx::_handleErrorResponse`: 422 Pydantic JSON → 大白话 ("n 至少 1; brief 没填"), 5xx → "AI 上游临时不可用"
  - `FailedRetry` monospace 默认折叠到"看技术详情"
  - 顶栏 chip 整删, 任务计数走小华按钮头像红点徽章 (橙=卡死/蓝=进行中)
  - LiDock 面板加"对话/任务"双 tab, 任务 tab 复用 TaskCard
  - 跨页跳转走 window event `ql-nav`
  - 任务卡 fallback `task.kind` → `TASK_KIND_LABELS` 中文
  - 设置页"开发调试" section 删, ApiStatusLight 硬关 (只 localStorage 才能开)
  - 文案脱敏: "skill"/"tokens"/"卡死/杀掉" 全替换
- **[D-070]** 访客模式 — 帮朋友写不污染清华哥越用越懂
  - 后端: `backend/services/guest_mode.py` contextvar + middleware 读 `X-Guest-Mode`
  - 跨 daemon thread 显式 capture/set (run_async 里)
  - 5 个写入口子全短路: work_log / preference / autoinsert_text_work / wechat 入库 / persona 注入
  - 访客模式 AI 走"中文写作助手"中性 system (~100 字, 不注入清华哥几千字人设)
  - 前端: 侧栏底部 🕶 按钮 + 主区顶橙 banner + localStorage 持久化

### Fixed
- **[D-067 follow]** `test_persona_short_exists_and_reasonable / _deep_much_larger` 加 `include_memory=False`
  (D-067 默认开了行为记忆注入, 让原断言 < 2000 失败)

### Tested
- pytest 268 → **288** passed (+20: 8 recovery/watchdog + 2 alloc + 7 guest + 2 night recovery + 修 1 个 persona)
- Playwright 21 页全 0 console error / 0 4xx-5xx
- `scripts/smoke_endpoints.sh` 9 个主 endpoint live 200

### Files Changed
- 新加: `backend/services/guest_mode.py`, `tests/test_guest_mode.py`, `tests/test_tasks_recovery.py`, `web/factory-strategy.jsx`, `scripts/smoke_endpoints.sh`
- 改: tasks/persona/work_log/preference/wechat_scripts/night_shift/api.py + 大量 web/*.jsx

### 一句话总结
今天发现 + 修了 daemon thread 集体死亡, 然后举一反三装防御; 顺便把短视频会露馅的技术词全清; 临门一脚加访客模式防朋友项目污染 D-067 越用越懂.

---

## [v0.4.1] — 2026-04-25 (P10 之后续做 · cron 缩短到 10min)

P0-P10 主清单完成后, cron 继续按 PROGRESS 的 Phase 1/2/3 旧 TODO + 用户主动插单 推进。
接入 skill 从 4 → 6 + 1 工具型(即梦)。cron 周期 30min → 10min(D-029),响应更快。

### Added
- **[D-022]** content-planner skill 接入 — 第 5 个 skill · 活动前内容产出策划
  - 三档目标(保底/标准/最大化) + 6 模块完整方案
  - 输出与其他 skill 不同(structured plan 非 content text)
  - 验证 `scripts/add_skill.py`(D-017) 实用性: 骨架一键 + 只调 prompt 适配
- **[D-023]** 行为记忆写入小华工作日志.md — Phase 2 旧 TODO
  - `backend/services/work_log.py` · maybe_log() 在 PersonaInjectedAI.chat finally 钩子
  - 默认 disabled · settings.work_log_enabled 开关 · 5 分钟节流
  - 写到 `~/Desktop/清华哥知识库/00 🤖 AI清华哥/小华工作日志.md`
  - 9 个单元测试,tmp_log fixture 隔离 prod LOG_PATH
- **[D-024]** 首页 4 方块接入真实统计数据 — Phase 1 旧 TODO
  - `/api/stats/home` 接 ai_calls 表 · 按 route_key 前缀聚合
  - hint 文案三种状态: 今日 / 仅昨日 / 全 0
- **[D-025]** 选题批量生成优化 — Phase 1 旧 TODO
  - `/api/topics/generate` 结构化输出 + 去重 + 字数过滤
  - 注入最近 30 条已入库,避免方向重复
  - 入库带 description / tags / suggested_format
- **[D-026]** 违禁违规审查 skill 接入 — 第 6 个 skill (用户主动插单 · 学员版 OK)
  - 单 step 流程: 输入文案 + 行业 → 一次性出审核报告 + 必出 2 版改写
  - 6 类行业敏感词库(通用/大健康/美业/教育/金融/医美)
  - 高/中/低危分级 · 保守版 100% 合规 / 营销版保留吸引力
- **[D-027]** 底部 dock 自由对话(多轮) — Phase 2 旧 TODO
  - `/api/chat` POST {messages, context} → reply
  - LiDock 真接通 · 多轮历史拼成单 prompt(最近 12 轮)
  - DeepSeek 路由(快 + 便宜) · 1.3s 回 80 字以内
  - 切页自动重置 · ··· loading 三点动效 · Enter 发送
- **[D-028]** 即梦(Dreamina) AIGC CLI 接入 — 工具型技能(用户主动插单)
  - subprocess wrap `~/.local/bin/dreamina` · 参考 poju-site 模式
  - text2image / image2video / query_result / user_credit
  - 不走 SKILL.md 范式(CLI 工具不需要 prompt 注入方法论)
  - sidebar 🎨 即梦 AIGC · 2 步 UI(配置 → 提交+轮询+预览)

### Changed
- **[D-029]** cron 从 `*/30 * * * *` 改为 `*/10 * * * *`
  - Job ID `aeca45b6` → `4db2d0ea`
  - 用户反馈"不用一直等" · 10min 是 60min 之内最频繁清晰间隔
- 测试从 85 → 102(自动 cover D-022 / D-026 通过 test_skills_smoke 参数化)

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
