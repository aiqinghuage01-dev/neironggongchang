# 内容工厂 - 进度看板

> AI 接手前必读。每次 session 结束必更。

---

## 当前状态（2026-04-24 晚 · 第二次 session）

**版本**：v0.3.2 -- D-008 人设注入两档开关上线

**本次 session 完成**(3 个 commit):

1. **关卡层**(`f0246d6`) -- `backend/services/persona.py` + `shortvideo/ai.py::PersonaInjectedAI`
   - `get_ai_client()` 返回包装器,自动把人设拼到每次调用的 system prompt
   - 两档:deep=True 精简版+4详细(~11000字),deep=False 只精简版(~830字)
   - 10 分钟 mtime 缓存,清华哥在 Obsidian 改完自动同步
   - `tests/test_persona.py` 6/6 通过
2. **API 透传**(`2525ac1`) -- 6 个 Req 模型加 deep,3 个 service 透传
3. **前端开关**(`91ca016`) -- `factory-deep.jsx` 全站共享开关 +
   5 页 `<DeepToggle />` + api.post 全部带 deep

**端到端验证**(DeepSeek 引擎,相同原文):
- deep=False: 680 token, 24 字, 通用编辑风
- deep=True: 6918 token(10x), 87 字, 带具体数字 + 钩子结尾,清华哥味道全对

**上一次 session 基线**(保留供追溯):

版本:v0.3.1 -- 项目管理骨架 + 人设/记忆系统设计

**本次 session 完成**：

1. **Git 初始化** -- 全量代码入库（84 文件，commit `3bfb10a`）
2. **项目管理体系**（对标 poju-site）：
   - `CLAUDE.md` -- AI 入口路标
   - `docs/PROGRESS.md` -- 进度看板（本文）
   - `docs/TECHNICAL-DECISIONS.md` -- 技术决策档案（D-001 ~ D-008）
3. **人设/记忆系统设计**（研究了 OpenClaw + Hermes，选择 OpenClaw 的 Markdown 方案）：
   - 在 Obsidian 知识库创建 `persona-prompt.md`（~300 token 精简版人设）
   - 在 Obsidian 知识库创建 `小华工作日志.md`（行为记忆模板）
   - 设计三层记忆架构（D-005）
   - 设计两档开关：深度理解 vs 轻快模式（D-008）
   - 设计关卡层：所有 AI 调用通过 `ai.py` 统一注入人设（不需要每个技能单独改）
4. **分析了当前 6 个 AI 调用点的问题**：全部用通用 prompt，没注入人设

**已完成的能力**：
- 做视频 6 步流（扒文案 -> 改写 -> 声音 -> 形象 -> 剪辑 -> 发布）
- FastAPI 后端 12+ endpoint（`:8000`）
- React 前端 8 页（`:8001`）
- 知识库只读对接（Obsidian vault，jieba + TF-IDF 匹配）
- 投流文案批量 5 版 + 知识库注入
- 朋友圈衍生 3-5 条 + 知识库注入
- 公众号大纲 + 长文 + 知识库注入
- 素材库 / 热点库 / 选题库 CRUD
- 作品库 + 数据指标手动录入 + 排行分析
- AI 引擎双轨：Claude Opus（via OpenClaw） / DeepSeek 一键切换
- GPT-Image-2 封面并发生成（apimart）
- 轻抖链接提取（异步轮询）
- 设置持久化（data/settings.json）

**未实现但 PRD 里有**：
- 知识库注入到改写 prompt（kb.match 已有，但 rewrite_script 没用上）
- 小华对话（底部 dock 的自由聊天）
- 小华记忆持久化
- 多平台真发布（抖音/快手 OpenAPI）
- 定时发布 / BGM 混音 / 数据自动采集

---

## 版本演进

### v0.1.0（2026-04-23）-- Streamlit 单文件 MVP
- 一页六卡 Streamlit UI + 石榴 + DeepSeek + CosyVoice（桩）
- pytest 10/10 + 端到端视频生成验证
- 详见 `DELIVERY-v0.1.md`

### v0.2.0（2026-04-24 上午）-- 新 API 接入
- 轻抖（链接->文案）+ apimart GPT-Image-2（AI 封面）

### v0.3.0（2026-04-24 下午）-- 设计稿 C2 全量实施
- FastAPI + React 前端 8 页 + 知识库 + 投流/朋友圈/公众号 + AI 双轨
- 详见 `DELIVERY.md`

### v0.3.1（2026-04-24 晚）-- 项目管理 + 记忆系统设计
- Git init + CLAUDE.md + PROGRESS.md + TECHNICAL-DECISIONS.md
- persona-prompt.md + 小华工作日志.md（Obsidian 知识库）
- 8 条技术决策记录

---

## Roadmap（按 Phase 推进）

### Phase 1 -- 人设注入 + 核心链路加固
- [x] **ai.py 关卡层改造**：所有 AI 调用自动加载 persona（v0.3.2 D-008）
- [x] **两档开关**：前端 `<DeepToggle />` 全站共享 localStorage（v0.3.2 D-008）
- [x] **改写 prompt 注入知识库**：前端 `factory-flow.jsx` 的 KbInjectBar
      让清华哥手选 KB chunks 拼进 text；批量生成类（投流/朋友圈/公众号/选题）
      服务端已自动 kb.match
- [x] **行为记忆写入**：每次改写/生成后自动追加到小华工作日志.md（D-023）
      backend/services/work_log.py · maybe_log() 在 PersonaInjectedAI.chat finally
      钩子里调用,失败吃掉 · 默认 disabled,settings.work_log_enabled 开关
      节流: 同 route_key 5 分钟内只记 1 条 · skip 失败 / skip < 50 tok pings
      日志路径: ~/Desktop/清华哥知识库/00 🤖 AI清华哥/小华工作日志.md
      格式: `- HH:MM · 🔥 hotrewrite.write(opus) · 输入摘要 → 产出摘要 · 2500 tok`
      endpoint: GET /api/work-log/{status,recent} + POST /api/work-log/toggle
      tests/test_work_log.py 9 个单元测试全过(用 tmp_log fixture 隔离)
- [x] **首页 4 方块真实统计数据**(D-024) `/api/stats/home` 接 ai_calls 表
      ad: touliu.* + ad.* 合计今日/昨日批数 · wechat: wechat.write 今日/本周
      moments: moments.derive 今日/昨日 · make: 仍走 works 表(原本就对)
      hint 文案动态: "今日 N 批" / "昨日 N 批" / "今日还没出过投流" 自适应
- [x] **选题批量生成优化**(D-025) 结构化输出 + 去重 + 字数过滤 + 避免已有库重复
      原返回 `["选题1",...]` 纯字符串,现返回 `{title,angle,why,tags,suggested_format}`
      入库带 description 和 tags · 字数 6-25 外过滤 · 前 5 字重复(含最近 30 条库内)过滤
      返回带 stats: {generated, kept, too_long, too_short, duplicate}
      兼容旧前端(titles 字段还在)

### Phase 2 -- 小华对话 + 记忆闭环
- [x] **底部 dock 自由对话（多轮）**(D-027) `/api/chat` POST {messages, context}
      LiDock 真接通: messages state + Enter 发送 + 滚到底 + ··· loading 三点动效
      切页自动重置开场白 + 清空按钮 + DeepSeek 路由(便宜,1-2s 回复)
      多轮历史拼成单 prompt(最近 12 轮),system 注入 persona + 当前页 context
      端到端: "我现在写公众号没思路怎么办?" → 1.3s 回 "老板,咱先聊聊..."(引导到工作流)
- [x] **对话中学到的偏好自动写入**(D-030) backend/services/preference.py
      LiDock 每条 user 消息后台异步触发 maybe_learn(BackgroundTasks)
      关键词预筛(我喜欢/不要/记住/以后...)→ 命中才走 AI 二筛 → 是偏好才写
      DeepSeek 路由 · 1 分钟节流 · 默认 disabled · settings.preference_learning_enabled
      `~/Desktop/清华哥知识库/00 🤖 AI清华哥/小华学到的偏好.md` 单独文件
      endpoint: /api/preferences/{status,toggle,recent}
      tests/test_preference.py 8 个 fixture 隔离单测全过
- [x] **行为记忆读取:最近 20 条注入 prompt**(D-031) memory_inject.py
      D-005 三层记忆架构的 Layer 3 实现 · 把 D-023 work_log + D-030 prefs 拼成
      prompt 片段,在 PersonaInjectedAI.chat 的 deep=True 路径附加注入
      默认 disabled · settings.memory_injection_enabled 开关 · 偏好去重
      `/api/memory-inject/{status,toggle}` · 8 个单元测试(含 PersonaInjectedAI 集成)

### Phase 3 -- 发布 + 数据闭环
- [ ] 多平台真发布（需各家 OpenAPI 授权）
- [ ] 数据自动采集
- [x] **效果分析 → 反哺选题**(D-032) backend/services/insights.py
      - top_performers(limit=10) · 按 views 跨平台聚合 metrics 表
      - winning_patterns() · AI 抽 top 共性(开头/角度/标题模式/标志词/DNA),1h 缓存
      - topics_generate prompt 自动注入 "你过往跑量好的作品共性"
      - `/api/insights/{top-performers, winning-patterns}` endpoints
      - metrics 空时自动跳过(向后兼容,跟没这功能一样)
      - 7 个单元测试 · tmp_db + reload 隔离 prod DB

---

## 人设/记忆系统架构（速览）

```
Obsidian 知识库 / 00 AI清华哥 /
├── persona-prompt.md        ← 精简版（300 token），每次 AI 调用必带
├── 小华工作日志.md           ← 行为记忆，AI 自动追加，清华哥可手动编辑
├── 业务画像.md              ← 详细版，deep=true 时加载
├── 写作风格规范.md           ← 详细版，deep=true 时加载
├── 人设定位与表达边界.md      ← 详细版，deep=true 时加载
├── AI协作偏好.md            ← 详细版，deep=true 时加载
└── index.md                 ← 知识库导航索引

代码层：
  ai.py → get_ai_client() → chat(prompt, deep=True)
    → 自动读 persona-prompt.md（必带）
    → deep=True 时额外读完整人设 + kb.match + 最近记忆
    → 所有技能（改写/投流/朋友圈/公众号/选题/标题）自动继承
    → 未来新技能只要调 get_ai_client()，零额外配置
```

关键决策见 `docs/TECHNICAL-DECISIONS.md`（D-005 三层记忆、D-008 两档开关）。

---

## 已知问题

见 `KNOWN_ISSUES.md`（持续维护）。

---

## 进行中(autonomous loop 自驱 · 2026-04-25 凌晨)

**优先级清单**(cron `*/30` 自驱,每轮做一项):
- [x] **[P0] 🚀 全自动到封面按钮**(09faf92) 挑完标题自动跑到 Step 7
- [x] **[修 bug] Step 5 配图卡片歧义** 卡片 flex 列布局,按钮始终可见 + "✨ 一键生成"按钮
- [x] **[基建] AI 引擎智能路由** `get_ai_client(route_key=...)` 11 条默认路由
      (wechat.titles → deepseek, wechat.write → opus, etc.)
      /api/ai/routes 暴露路由表给前端。settings.engine_routes 可覆盖。
- [x] **[P1] 热点文案改写V2 skill** hotrewrite_pipeline + 3 步 UI
      `/api/hotrewrite/{analyze,write,skill-info}`, 路由 `wechat → 🔥 热点改写`
      sidebar 新增入口。端到端 /analyze 7s 返回 3 个切入角度(DeepSeek)。
- [x] **[P2] 录音文案改写 skill** voicerewrite_pipeline + 3 步 UI
      `/api/voicerewrite/{analyze,write,skill-info}`, sidebar 🎙️ 录音改写
      端到端 /analyze 7.7s(DeepSeek), 提骨架 + 2 角度,语气锚点精准捕捉。
- [x] **[P3] touliu-agent 替换 /api/ad** touliu_pipeline + 2 步 UI
      `/api/touliu/{generate,lint,skill-info}`, 注入 SKILL.md(18K) +
      style_rules/winning_patterns/industry_templates/golden_samples
      结构分配自动按 n 分配(痛对步话创),每条带编导 6 维终检。
      subprocess 调 lint_copy_batch.py 做本地质检。
      覆盖旧 PageAd,旧 /api/ad/generate 保留作 fallback。
      测试: skill-info ok, 结构分配 3/5/8/10/15 都正确。
      端到端 /generate 10 条 Opus 吃 6K token system,首跑 2-3 分钟,
      留用户早上真跑验证。
- [x] **[P4] Token/成本监控 + 首页 widget** ai_usage.py + 打点钩子在
      PersonaInjectedAI.chat 里,SQLite ai_calls 表,`/api/ai/usage?range=today|week|all`
      + `/api/ai/usage/recent`. 首页新增 AiUsageCard widget:
      "今日 5 次 · 8.2K tokens · ¥2.21 · opus 占 95%"
      价格表: Opus $15/$75 per M · DeepSeek $0.14/$0.28 per M · 汇率 7.2
      settings.engine_pricing / usd_to_cny 可覆盖
- [x] **[P5] 工作流 localStorage 持久化** factory-persist.jsx 通用 hook
      useWorkflowPersist({ns, state, onRestore}) + 500ms 防抖保存 + 顶部 WfRestoreBanner
      4 个 skill 全覆盖: wechat / hotrewrite / voicerewrite / touliu
      刷新浏览器 / 重启不丢中间态, reset() 自动清 localStorage
      autoMode 子 step 挂起不恢复(pipeline 不能续跑,回落到 topic 重走)
- [x] **[P6] skill 骨架生成器 scripts/add_skill.py** 一键生成新 skill 骨架
      用法: `python3 scripts/add_skill.py --slug <cn> --key <py_id> --icon 🌟 --label <cn>`
      做 7 件事(幂等,已注册跳过):
      1. 验证 ~/Desktop/skills/&lt;slug&gt;/SKILL.md 存在
      2. 生成 backend/services/&lt;key&gt;_pipeline.py (analyze+write 2 步)
      3. 生成 web/factory-&lt;key&gt;-v2.jsx (3 步 UI + WfRestoreBanner)
      4. 注册 backend/api.py (import + 3 endpoint)
      5. 注册 DEFAULT_ENGINE_ROUTES (2 条: analyze→deepseek, write→opus)
      6. 注册 factory-shell.jsx sidebar + factory-app.jsx route + index.html
      从 0 新增 skill 从 3h → 30min,只需调 pipeline 的 prompt 适配实际 SKILL.md
- [x] **[P7] 测试扩展** 单元测试从 18 → 75(+57 个,覆盖新功能)
      - tests/test_ai_routing.py (7) · 引擎路由优先级 + routes_info
      - tests/test_ai_usage.py (7) · 打点 + 聚合 + range + 成本计算 + no-op 过滤
      - tests/test_pipelines.py (25) · 3 个 skill 的 _extract_json + alloc_for + 模块导出
      - tests/test_skills_smoke.py (18) · 接入 skill 的目录/pipeline/endpoint/jsx/sidebar 完整性
      - 纯结构化测试,不打真 AI,不污染 prod DB(ai_usage 用 tmp_db fixture 隔离)
      全量 75/75 passed · 接入新 skill 只需在 REGISTERED_SKILLS 加一行自动跑完整性检查
- [x] **[P8] 首页技能中心卡片** backend/services/registered_skills.py 作为
      single source of truth (api_prefix/page_id/icon/label/subtitle/steps),
      /api/skills/catalog 扫桌面 + 注册表返回全量 · 首页新增 SkillCenter 组件:
      上方 grid 2 列显示已接入(4 个),下方可展开"未接入"(桌面 13 个过滤学员版后)
      含一键命令提示 `python3 scripts/add_skill.py --slug X --key Y`。
      test_skills_smoke.py 改为消费 registered_skills,从此 DRY 了。
- [x] **[P9] CHANGELOG + 文档** 三份新文档:
      - `CHANGELOG.md` · Keep-a-Changelog 格式 · 按 D 号分组 · v0.3.0 → v0.4.0
      - `docs/NEW-SKILL-PLAYBOOK.md` · D-010 接入范式手册(5 步 + 红线 + 故障排查)
      - `CLAUDE.md` 补「接入新 skill」+「AI 引擎智能路由」两节 + 事实源表补 2 行
- [x] **[P10] 前端 UI 组件库提取** factory-ui.jsx 独立文件
      提取: Spinning / TitlesSkeleton / SkeletonCard / SkillBadge / StepDots / StepHeader
      factory-wechat-v2.jsx 瘦身 49k → 45k 字符
      index.html 加载顺序: tokens → api → deep → persist → **ui** → shell → ...pages
      未来新 skill(add_skill.py 生成 或手动写)可直接用 StepHeader 省 50 行顶栏代码
      现有 4 个 skill 的 Header 暂不动(迁移有回归风险,后续可渐进重构)

---

## 🎉 autonomous loop 清单全部完成 (2026-04-25)

P0-P10 所有任务落地, 14 个 commit 从 `09faf92` 到今日末 commit。
完整变更见 CHANGELOG.md · 接入新 skill 参见 docs/NEW-SKILL-PLAYBOOK.md

## 下一阶段进行中 (🌙 小华夜班 · 用户最高优先级 D-040)

用户最新规划 (2026-04-25): 用户睡觉的 23:00–6:00, 让 Mac 跑预设任务,
早上打开"总部"看到一批可消费的产出, 把每天工作起跑线前移 1-2h.
**对外全部用「小华夜班」**, 禁用「自动化任务」「cron」「agent」等技术词.

4 条预设任务:
1. 凌晨抓热点 → 早上挑选题 (content-planner 抓对标账号 24h 爆款)
2. 一鱼多吃 → 直播录音变 5 件素材 (file_watch data/inbox/audio/)
3. 知识库整理 → kb-compiler + kb-lint
4. 昨日复盘 → 抓发布数据 + 写小华工作日志.md (D-005)

对接现有体系: 三层记忆 (D-005) / 人设 (D-008) / skill 范式 (D-010) /
引擎路由 (D-011) / tasks 池 (D-037a) / works.db / settings.json

按可独立回滚切 6 个子 commit, 每轮一个:

- [x] **D-040a 数据层** night_jobs + night_job_runs 表 + night_shift.py
      CRUD service (create/list/update/delete/set_enabled · start_run/finish_run/list_runs/
      latest_run_for_job · get_digest 24h success 滚动汇总) · tests/test_night_shift.py 22/22
- [x] **D-040b API + OpenAPI 规范化** 7 个 /api/night/* endpoints
      GET/POST  /api/night/jobs · PATCH/DELETE /api/night/jobs/{id} ·
      POST /api/night/jobs/{id}/run · GET /api/night/runs · GET /api/night/digest
      run-now 走 night_executor.run_job_async (thread + placeholder runner,
      D-040c 注册真 subprocess runner). 立即返回 run_id, 调用方轮询 /runs.
      **顺手立 OpenAPI 注释规范** (用户选 B): app `description` + `openapi_tags`
      14 个分组 (总部/AI/小华夜班/公众号/...); 新 endpoint 全部带 tags=["小华夜班"] +
      summary 中文一句 + Pydantic Field(description=...). 老 endpoint 增量补.
      tests/test_night_executor.py 6/6.
- [x] **D-040c 调度器 (cron only, file_watch 推迟)**
      backend/services/night_scheduler.py · APScheduler BackgroundScheduler 单例,
      启动时把 enabled+trigger_type=cron 的 job 用 CronTrigger.from_crontab 挂上,
      fire 时调 night_executor.run_job_async. uvicorn boot 由 @app.on_event("startup")
      唤起 (pytest 不触发 startup, 测试自动走 reload_jobs API).
      jobs CRUD endpoint 全部接 _reload_night_scheduler_silent() · 改 enabled/cron
      表达式立即生效不用重启 backend.
      新 endpoint GET /api/night/scheduler 看调度器状态 + 当前挂的 job + next_run_time.
      misfire_grace_time=300 / coalesce / max_instances=1 防 misfire 风暴.
      file_watch 留 D-040f 接 watchdog (一鱼多吃任务真要时再加, 用户说本地用爽优先).
      uv add apscheduler>=3.10 (3.11.2 + tzlocal 5.3.1).
      tests/test_night_scheduler.py 8/8.
- [x] **D-040d 总控页 + sidebar 改造**
      sidebar (factory-shell.jsx): 首页→总部, 加 NavGroupLabel 组件, 在生产部/
      档案部/夜班 3 段前显示分组小标题(展开态), 折叠态隐藏. 加 🌙 小华夜班 入口.
      NightShiftPage (factory-night-v2.jsx, 18K 字): 顶栏 + 状态条 ("今晚自动跑
      X 条任务" / 总条数·启用数·成功数·失败数) + 任务卡片网格 (icon/名字/触发器
      /上次跑了/启用 toggle/立即跑/编辑/×) + 历史日志 (最近 30 条 flat list,
      job icon + 时间 + summary + 耗时 + status tag) + NightJobEditor 模态
      (name/icon/skill_slug/trigger_type 三选一/cron 输入+4 个预设 chip/
      output_target 下拉/enabled). 4s 自动刷新看立即跑实时进度. humanizeCron
      把 "0 23 * * *" 翻成 "每天 23:00".
      api.patch 补上 (factory-api.jsx 之前只有 get/post/del).
      factory-app.jsx 加 nightshift route. index.html 在 dreamina 后载入.
      端到端 smoke 跑过: TestClient 模拟前端 8 步 (列空/创建/列 1 条/PATCH 开关
      /立即跑+轮询占位 runner 落 success/digest/scheduler 状态/删) 全通.
- [x] **D-040e 总部播报 NightDigestCard** (散落标签留 D-040f)
      factory-home.jsx 加 NightDigestCard, 插在 4 大方块下方 / 🔥 热点条上方.
      时间联动 (6-22h 白天模式 GET /api/night/digest 显示 "昨晚帮你做了 N 件事"
      + 4 条产出 bullet + 引导跳对应库; 22-6h 夜班模式 GET /api/night/jobs?enabled_only
      显示 "今晚 HH:00 起跑 N 条任务" + 任务 chips). 0 产出整块隐藏(不要"暂无"占位).
      output_target → 引导文案: materials→看选题 / works→去作品库审 / knowledge→看一眼 / home→看总部.
      渐变背景区分模式: 白天暖色 (#fff8ec→#fff) / 夜班冷色 (#f0f3ff→#fff).
      散落标签 (素材库/作品库/知识库 "🌙 来自夜班 (N)" 过滤): 暂不做.
      理由: D-040f 4 条预设 runner 还没接, output_refs 永远空, N 永远 0 按"0 隐藏"
      规则永远不显示, 纯死代码. 留 D-040f 跟真 runner 一起.
      端到端 smoke: 3 场景 (有 success 显白天 / 有 enabled cron 显夜班 / 全空隐藏).
- [x] **D-044 NightJobEditor UX 重做** (借鉴 WorkBuddy)
      用户上轮 [Image #9] 给我看 WorkBuddy "添加自动化任务" 设计后, 重做夜班编辑器:
      频率从"输 cron 表达式"改为 4 个语义化 mode tab:
        每天 / 按间隔 / 监听目录 / 只手动
      "每天" 模式: hour:minute 数字输入 + 7 个圆 pill (周一...周日) 多选 +
        3 个快捷预设 (工作日 / 周末 / 每天)
      "按间隔" 模式: 数字 + 单位下拉 (分钟/小时), <60 分钟或 <24 小时.
      "监听目录" / "只手动": 跟前一致.
      新增 composeCronDaily / composeCronInterval / inferEditorState 三个辅助函数:
        compose 把 UI state → cron 字符串
        infer 把现有 job → UI state (反向解析, 编辑老 job 用)
      humanizeCron 同步增强: 识别 "0 */N * * *" 每 N 小时 / 工作日 / 周末 /
        cron 周几名字 (周一/三/五).
      预览栏实时显示 "cron: 0 22 * * 1,3,5 · 周一/三/五 22:00" 给用户确认.
      iOS 风按钮: 黑色丸 [添加] / 浅描边 [取消]. mode pill 黑底白字 active.
      后端不改 — 仍存 trigger_type + trigger_config.cron, 前端纯抽象层.
      验证: 6 种生成的 cron 串过 APScheduler.CronTrigger.from_crontab 全过.
      JSX parse OK · 全量 pytest 204/204.
      跳过的: WorkBuddy 的"单次"模式 — APScheduler cron 没真"一次性"语义,
      要做需后端加 expires_at 字段, 超本轮 scope. 用户需要单次时可以 enabled=False
      手动跑.
- [x] **D-047 凌晨抓热点 真 runner (AI 出选题)**
      D-040f 时是占位 runner. 本轮实装 content-planner runner:
      AI 基于人设产 5 条选题候选, 写 hot_topics 表 (fetched_from="night-shift",
      match_persona=True). NightDigestCard 显示 "AI 出 5 条选题 · 最高 🔥92: 《...》",
      点 "看选题" 跳 materials 页 (已经有 hot-topics tab).
      诚实交代: spec 写"抓对标账号 24h 爆款", 但 content-planner skill 实际
      是"活动策划"不是抓爆款, 真爬虫没现成 skill. 当下能做就是 AI 出选题候选,
      给用户早上有东西看 + 一键做成视频. 真"抓爆款"留 backlog 等爬虫 skill.
      output_refs: [{kind:"hot_topic", id:N}, ...] (D-040 散落标签真有数据可显示了)
      tests/test_night_runners.py 13/13 (+4: 5 选题 / 解析失败 / AI 抛 / 部分 title 空)

- [x] **D-040f 4 条预设 seed + 1 个真 runner**
      backend/services/night_runners.py · DEFAULT_NIGHT_JOBS 4 条种子 + seed_defaults() 幂等创建.
      registered_runners 4 个: 1 真 + 3 占位.
        ✓ daily-recap (真): 抓昨日 ai_usage / 写小华工作日志.md / 摘要 "AI 调 N 次 / X tokens / ¥Y"
        ⏸ content-planner / one-fish-many-meals / kb-compiler (占位): 写明 "未接入" 不崩
      app startup 钩子 import night_runners 触发 register_all() · 调度器 fire 时找得到 runner.
      新 endpoint POST /api/night/seed-defaults (幂等). 默认 enabled=False (用户审一遍再开).
      前端: NightShiftPage 空状态加 "📋 加 4 条预设任务" 按钮 + "+ 自己加一条".
      tests/test_night_runners.py 9/9. 端到端 smoke: seed → list 4 → 跑 daily-recap (真) →
      跑 content-planner (占位) → 二次 seed 幂等, 全跑通.

      未做 (诚实):
      - one-fish-many-meals / kb-compiler 这俩 skill 不存在于 ~/Desktop/skills/, 真接入要等
        清华哥写完 skill 再补 runner.
      - file_watch 监听 data/inbox/audio/ 仍未接 watchdog (D-040c 推迟决定保留)
      - content-planner 真 runner: D-022 已接 planner_pipeline,
        本轮没把 planner.analyze + write 接进来 + 写 materials 表 — 留下一轮
      - 散落标签 ("🌙 来自夜班 (N)" 过滤): output_refs 暂只有 daily-recap 写一条
        work_log ref, materials/works/knowledge 没数据 → 标签按"0 隐藏"规则不显示, 跳过

命名 (用户可见 / 代码内部):
  整个系统  小华夜班                  night_shift
  单条任务  任务 ("凌晨抓热点")        night_job
  单次运行  上次跑了…                  night_job_run
  总控页    小华夜班                  NightShiftPage
  总部播报区 昨晚小华帮你做了 X 件事    NightDigestCard


## ⏸️ 暂缓: ⑤ 任务管理 (D-037)

D-040 用户拍板优先, D-037 后续再续. D-037a 已落地的 tasks 基建会被 D-040 直接复用 (执行器/历史)

- [x] **D-037a 后端 tasks 基建** (`5bf15da`) — D-040c 调度器会复用
- [ ] **D-037b 慢 endpoint 异步化** (write/cover/plan-images 改 task_id)
- [ ] **D-037c 前端顶栏 TaskBar + 任务详情抽屉**

## 公众号 8 步打磨完成(D-033 ~ D-036)

- [x] ① Step 5 配图 prompt 可改 + 6 风格预设 (D-033 `86c65eb`)
- [x] ② Step 6 HTML 模板切换 V1/V2/V3 (D-034 `e31d399`)
- [x] ④ Step 7 封面 4 选 1 + 再来一批 (D-035 `c75d5d2`)
- [x] ③ Step 4 长文局部重写 + 7 快捷指令 (D-036 `4ccd0ca`)

## 公众号 8 步走查 BUG 修复(D-038)

用户走完 8 步发现 4 个 BUG, 一次性收口:

- [x] **wfRestore 旧 coverResult 兼容性** — 旧版本(D-035 之前)持久化的封面没有 `covers` 数组,
      `local_path` 文件已被清理或迁移导致 broken image. 修复: wfRestore 时直接丢弃旧格式
      (`Array.isArray(s.coverResult.covers)` 才恢复)
- [x] **push() 422 cover_path Field required** — 旧 wfState 残留的 coverResult fallback 不到任何
      合法 path, push 直接 422. 修复: push() 强校验 `coverPath` 和 `htmlResult.wechat_html_path`,
      空时 setErr + 自动 setStep("cover") 跳回封面页
- [x] **顶栏 step dot 不能往回点** — 用户没法回看之前的 step. 修复: factory-ui.jsx StepDots 加
      `onJump` prop, 已完成的 step 可点跳回; WxHeader 同步加 onJump 透传(autoMode/loading 时禁用)
- [x] **WxStepCover 旧数据明示提示** — 单张模式下展示一条 amber 横幅, 引导点 "🔄 升级到 4 选 1"

## 数字人成片 v5 模板化接入(D-059)

清华哥提的新方向: 把 ~/Desktop/skills/digital-human-video-v5 接进来.
关键设计: **数字人 mp4 是上游复用资源 → 套不同模板剪辑成多版** (用户拍板).
跟我原方案 "数字人合成在 v5 内部" 不同, v5 实际是 "下游剪辑器".

按 4 commit 推进 (本轮做后端基建):
- [x] **D-059a 后端基建**
      backend/services/dhv5_pipeline.py (~190 行):
      - SKILL_ROOT 指向 ~/Desktop/skills/digital-human-video-v5/
      - list_templates() 扫 templates/*.yaml + 元数据 (id/name/desc/category/
        duration_sec/word_budget/scene_count/scenes_breakdown/music/cover_title/
        sample_video). 时长按 max(scenes[*].end), 字数按 3.5 字/秒口播估.
      - load_template_full(id) 读单模板完整 YAML
      - render_async(template_id, dh_video, output_name, scenes_override)
        spawn daemon thread 跑 skill 的 render_video, 走 D-037a tasks 池,
        立即返 task_id. 真跑 3-10 分钟. scenes_override 给 D-059c 文案对齐用.
      - 任何步骤失败 finish_task(failed) 不崩
      backend/api.py 加 3 endpoints + 新 tag "v5 视频":
        GET  /api/dhv5/templates             模板列表
        GET  /api/dhv5/templates/{id}        单模板完整 YAML
        POST /api/dhv5/render                触发渲染 → task_id
      tests/test_dhv5_pipeline.py 13/13 (skip if SKILL_ROOT 不存在)
        · 7 个纯函数单元 (duration / word_budget / scene_breakdown 边界)
        · 6 个真 skill 集成 (list / load / render 错误路径, 不真渲染)
      端到端 smoke: TestClient 拉 /api/dhv5/templates 真返 01-peixun-gaoxiao
      49.6s/174字/A5+B3+C2.
      pytest 240/240 (+13)

- [ ] **D-059b 前端模板选择器 + 数字人选择**
      PageDhv5: 顶部锁定数字人 mp4 (从已有 works 选 / 上传) +
      下方模板选择器 (分类筛选 / 时长筛选 / 智能推荐 / 样片预览)
- [ ] **D-059c 文案对齐 + B-roll**
      文案↔scenes AI 切 (3 模式: 自动/手动/占位) +
      每 B/C scene 走 dreamina/apimart 批量生 broll
- [ ] **D-059d 渲染 + 预览 + 复用循环**
      调 /api/dhv5/render 异步 + 轮询 task → 完成预览 +
      "用同 mp4 再套一个模板" 一键回 Step 选模板, 数字人不变

## NightShiftPage delete 换非阻塞对话框(D-058)

KNOWN_ISSUES 第 5 项. 浏览器原生 confirm() 视觉跟项目其它模态不一致 + 阻塞主线程.

- [x] **D-058 NightDeleteConfirm 组件**
      web/factory-night-v2.jsx:
      - 新 state: deleteTarget (null | job) + deletingId
      - delJob(job) 不再 confirm(), 改 setDeleteTarget(job)
      - 新组件 NightDeleteConfirm: 视觉对齐 NightJobEditor (iOS 风圆角 14px / 黑色丸主按钮)
        · 顶部大 icon + 任务名加粗
        · 副文 "关联的运行历史会一起清掉, 不可恢复"
        · 灰底 monospace 框显 id / skill_slug / trigger_type / 禁用状态
        · 主按钮 [删除] 红底白字 / 副按钮 [取消] 浅描边
        · 删除中按钮 disabled + 文案变 "删除中…"
      - 点遮罩外区域可取消 (e.stopPropagation 模态内)

      JSX parse OK · 全量 pytest 227/227 (无后端改动)
      KNOWN_ISSUES 第 5 项标记完成

## OpenAPI 注释 - 系统 endpoint 收尾 100% 完成(D-057)

D-053 → D-054 → D-055 → D-056 → D-057 一路打到 100% 覆盖. 106/106 全有 tag + summary.

- [x] **D-057 系统 endpoint 收尾 (45 个)**
      backend/api.py:
      - 总部 (新加 6 个): health / stats/home / skills/catalog / chat / insights/* (2)
      - AI (5): /api/ai/health / models / routes / usage / usage/recent
      - 全局任务 (3): /api/tasks list / get / cancel
      - 设置 (11): /api/settings × 3 / preferences × 3 / memory-inject × 2 /
                   work-log × 3
      - 短视频 (13): transcribe × 2 / rewrite / speakers / voice × 2 /
                     avatars / templates / video × 2 / cover × 2 / publish
      - 档案部 (新加 3 个): /api/materials × 3
      - 投流 (新加 1): /api/ad/generate (旧 fallback, 已被 D-014 touliu 替代)
      - 公众号 (新加 2): /api/article/outline + /api/article/expand (旧, 已被
        wechat 8 步替代)
      - 朋友圈 (新加 tag + 1): /api/moments/derive (单 endpoint skill)
      - TAGS_METADATA 加 "朋友圈" 分组

      📊 OpenAPI 最终覆盖率:
        总 106 个 endpoint  ·  无 tag: 0  ·  无 summary: 0
        15 个 tag 组分布: 档案部 20 / 公众号 16 / 短视频 13 / 设置 11 /
        小华夜班 9 / 总部 6 / AI 5 / 即梦 AIGC 5 / 投流 4 / 违规审查 4 /
        热点改写 3 / 内容策划 3 / 全局任务 3 / 录音改写 3 / 朋友圈 1

      pytest 227/227 (无功能改动).

      KNOWN_ISSUES 第 6 项已完整移除 (从 backlog 升级到"已完成") — 学员版
      poju.ai 部署条件之一已满足. 后续新加 endpoint 默认带规范.

## OpenAPI 注释 - 档案部 17 个 endpoint(D-056)

接 D-055 后所有 skill endpoint 已规范, 这轮接档案部 (📥📂📚 ).

- [x] **D-056 档案部 OpenAPI 规范化 (17 个)**  tag=["档案部"]
      - 作品库 (works): 5 个
        list / delete (可选删本地文件) / metrics get / metrics upsert /
        analytics (TOP 10 + 各平台汇总)
      - 数据指标 (metrics): 1 个
        delete (单条删除)
      - 热点库 (hot-topics): 3 个
        list / add / delete · platform 加 ai-generated 标注 · fetched_from
        加 night-shift 标注 (D-047 散落标签需要)
      - 选题库 (topics): 4 个
        list / add / delete / generate (AI 批量, 走 deepseek + 人设 + 历史去重)
      - 知识库 (kb): 4 个
        tree / doc (按 path 读) / search (文档级) / match (chunk 级 prompt 注入)

      Field 加边界: heat_score 1-100, completion_rate 0-1, n 范围限制
      MetricUpsertReq.platform 列出 6 个值 (douyin/xhs/wechat/...)

      pytest 227/227 (无功能改动).

      KNOWN_ISSUES 第 6 项进度: 已补 59 / ~75 个 (累 +17 这轮).
      还剩 ~15 个: settings 3 / ai 4 / tasks 3 / shiliu / cosyvoice / chat /
      总部 stats / 旧 ad/moments/article / materials 等. 下一拍可全部收尾.

## OpenAPI 注释 - 违规审查 + 即梦 AIGC 9 个 endpoint(D-055)

接 D-054 继续把 skill 类 endpoint 收尾.

- [x] **D-055 OpenAPI 规范化**
      backend/api.py:
      - 违规审查 (compliance) 4 个: tag=["违规审查"]
        skill-info / check (主路径, 单 step 出报告 + 2 版改写) /
        analyze + write (add_skill 范式兼容路径)
      - 即梦 AIGC (dreamina) 5 个: tag=["即梦 AIGC"]
        info (CLI 探活 + 余额) / text2image (文生图) /
        image2video (图生视频) / query (查任务) / list-tasks (历史)
      - Field description 详细标注:
        · ratio / resolution_type / model_version 各档值列出
        · poll 加 ge/le 边界 (text2image≤120 / image2video≤180)
        · industry 6 类列出
      - docstring 写引擎 + 耗时 + credits 消耗:
        · text2image 单张 ~30 (1k) / ~80 (2k) credits
        · image2video 5s 视频 60-180s + ~300-500 credits

      pytest 227/227 (无功能改动).

      KNOWN_ISSUES.md 第 6 项进度: 已补 42 个 (夜班 7 + 头像 3 + 公众号 11 +
      D-054 12 + 这一轮 9). 还剩 ~30 个 (hot-topics / topics / works / kb /
      settings / ai / tasks / 总部 stats / shiliu / cosyvoice / chat /
      旧 ad/moments/article 等).

## OpenAPI 注释 - 4 个 skill 12 个 endpoint(D-054)

接 D-053 继续: 投流 + 热点改写 + 录音改写 + 内容策划.

- [x] **D-054 4 skill OpenAPI 规范化**
      backend/api.py:
      - 热点改写 (hotrewrite) 3 个: tag=["热点改写"]
        skill-info / analyze (拆解+3 角度) / write (1800-2600 字+六维自检)
      - 录音改写 (voicerewrite) 3 个: tag=["录音改写"]
        skill-info / analyze (提骨架+2 角度) / write (改写+自检一次性)
      - 投流 (touliu) 3 个: tag=["投流"]
        skill-info / generate (一次 n 条+lint) / lint (本地 6 维终检)
      - 内容策划 (planner) 3 个: tag=["内容策划"]
        skill-info / analyze (三档目标) / write (6 模块完整方案)
        + 标 🔴 红线 (不提产品价格 / 不让现场动手)
      - 各 BaseModel Field 加 description + ge/le 边界 (n 字段)
      - 关键 endpoint 加 docstring 写引擎 + 耗时 + 失败处理

      验证: /openapi.json 12 个 endpoint 全有 tag + 中文 summary.
      pytest 227/227 (无功能改动).

      KNOWN_ISSUES.md 第 6 项进度: 已补 33 个 (夜班 7 + 头像 3 +
      公众号 11 + 这一轮 12), 还剩 ~40 个 (违规审查 / 即梦 / hot-topics /
      topics / works / kb / settings / ai / tasks / shiliu / cosyvoice 等).

## OpenAPI 注释 - 公众号 8 步 11 个 endpoint(D-053)

B 方案延续: 老 endpoint 增量补 tags + summary + Field description.
本轮补公众号 8 步那 11 个 (skill-info / titles / outline / write /
rewrite-section / plan-images / section-image / html / templates / cover / push).

- [x] **D-053 公众号 endpoints OpenAPI 规范化**
      backend/api.py:
      - 11 个 endpoint 全部加 tags=["公众号"] + summary 中文一句 (Step N XX)
      - Pydantic Field 加 description 字段:
        · WechatTitlesReq.n          ge=1 le=8
        · WechatPlanImagesReq.n      ge=1 le=8
        · WechatCoverReq.n           ge=1 le=8 (n≥2 batch / n=1 模板兼容)
        · 各模型字段都有中文 description
      - 关键 endpoint 加 docstring 说明耗时 + 引擎走向 + 失败诊断:
        · /write Step 4 走 opus 慢 30-60s
        · /section-image 30-60s 真生图 + 上传图床
        · /push 提示用户看 last_push_request.{html,json} 诊断
      - 修了 wechat_push 缺 docstring 的小遗漏

      验证: /openapi.json 拉出来, 14 个公众号 endpoint 全有 tag "公众号" +
      中文 summary. /docs 页 "公众号" 分组下从顶到底是 Step 2-8 + skill-info
      + templates + 头像配置, 学员版部署看一眼就明白.

      KNOWN_ISSUES.md 第 6 项进度: 已补 17 个 (小华夜班 7 + 头像 3 + 公众号 11),
      还剩 ~50 个 (投流 / 录音改写 / 内容策划 / 违规审查 / 即梦 / hot-topics /
      topics / works / kb / settings 等). 继续增量补.

      pytest 227/227 (无功能改动, 注释升级)

## KNOWN_ISSUES.md 落地(D-052)

用户规则一直要求"卡住超 15 分钟记 KNOWN_ISSUES.md 跳下一项", 但我从来没真写过.
本轮整理一下当前所有用户感知的坑 + 半成品 + 部署相关后续点.

- [x] **docs/KNOWN_ISSUES.md 86 行**:
      🔴 用户实测踩过的坑 (2 项): 段间图丢失诊断 / hero 默认文案兜底
      🟡 半成品占位 (3 项): 一鱼多吃/kb-compiler 占位 runner / file_watch 没接 /
                            NightShiftPage delete 用 confirm()
      🟢 OpenAPI 文档进度 (1 项): 60+ 老 endpoint 没补 tags
      🔵 部署相关 (2 项): ~/.wechat-article-config 单用户 / ~/Desktop/skills/ 路径
      已修归档段含 D-038~D-051 6 个完成项
      + 维护规则: 修好就删 / 新坑就加 / 不写主观重构 / 不写假设
      pytest 227/227 (纯文档无代码改动)

## Settings 页公众号头像上传 UI(D-051)

D-046 落地后启用门槛是用户得手动编辑 ~/.wechat-article-config JSON.
本轮: 加 UI 入口让上传一张图就完事.

- [x] **D-051 Settings 页 + 3 个 /api/wechat/avatar endpoint**
      backend/api.py 加 endpoints (全带 OpenAPI tag "公众号" + summary):
        GET    /api/wechat/avatar   头像配置状态 (configured/path/exists/size)
        POST   /api/wechat/avatar   multipart 上传 (jpg/png ≤1MB) →
                                    存 data/wechat-avatar/avatar.<ext> +
                                    写 ~/.wechat-article-config 的 author_avatar_path
        DELETE /api/wechat/avatar   从 config 移除字段 (物理文件保留)
      web/factory-settings.jsx 新 SettingsSection "📄 公众号草稿头像":
        - 已配 + 文件存在: 圆角头像缩略 + path/size + [🔄 换一张] [移除]
        - 已配但文件丢: ⚠️ 红色提示 + [重新上传]
        - 没配: ⚠️ 提示 + [+ 上传头像图] CTA
        - 错误处理: 错扩展名 / >1MB / 上传失败 都有 inline 红字
      端到端 smoke (TestClient + tmp dir 隔离): 7 个场景全过
        初始 → 上传 → 状态显示 → config 文件 author_avatar_path 写入 +
        旧字段保留 → 1MB+ 拒收 → .gif 拒收 → DELETE 清字段 + 保留物理文件
      JSX parse OK · 全量 pytest 227/227 (无后端单测, smoke 在隔离环境跑过)

## 头像合法上传(D-046)

D-045 后 push 通了但模板硬编码头像被剥. 用户多次反馈"头像也没了".
本轮: push 流程加可选头像上传 (用户配 author_avatar_path 才生效, 失败优雅
降级到现状, 不会更糟).

- [x] **D-046 头像合法上传 + 替换 + 优雅降级**
      backend/services/wechat_scripts.py:
      - 新 helper `upload_article_image(image_path) -> mmbiz_url`:
        subprocess 调 ~/Desktop/skills/公众号文章/scripts/upload_article_image.sh
        (skill 现成脚本, 复用其 token + uploadimg 逻辑, 不重写 WeChat API 调用)
      - 新 helper `replace_template_avatar(html, new_url) -> (新 html, 替换次数)`:
        regex 锚定 v3-clean 模板的 <a href="...profile_ext..."><img></a> 头像块,
        只换头像 src, 段间图不动
      - 新 helper `_read_wechat_config()`: 读 ~/.wechat-article-config 容错
      - push_to_wechat 流程加 (sanitize 之前):
        1. 读 config 看 author_avatar_path
        2. 有且文件存在 → upload + replace_template_avatar
        3. 任何步骤失败 silent 跳过 (头像被 sanitize 剥, 退化到 D-045)
      - 诊断 dump (last_push_request.json) 加 avatar 字段:
        {path, url, replaced, error, elapsed_sec}
      - 返回值加 avatar 字段
      tests/test_wechat_avatar.py 11/11.
      实证: 用户那篇 14531 字 HTML 跑 replace 1 次 → sanitize 后保留 1 img,
      rewritten/removed 都 0 (头像 URL 干净).

      用户启用方法 (用户睡醒后):
        1. 准备一张 ≤1MB 的本地头像图 (PNG/JPG)
        2. 编辑 ~/.wechat-article-config 加字段:
           "author_avatar_path": "/Users/black.chen/Desktop/avatar.jpg"
        3. 下次 push 自动上传 + 替换, 头像就能显示在草稿里
      不配 author_avatar_path → 沿用 D-045 行为(头像被剥).

## 素材库散落标签 "🌙 来自夜班 (N)"(D-050)

之前 D-040e/f 都跳过这条 (output_refs 没数据). D-047 接通"凌晨抓热点"真
runner 后, hot_topics 表有了 fetched_from="night-shift" 真数据, 终于可以做了.

- [x] **HotTab 加 "🌙 来自夜班 N" 过滤 chip + 每条夜班产物 🌙 标记**
      web/factory-materials.jsx HotTab:
      - 新 state: nightFilter (boolean)
      - chip 位置: 顶部统计行右侧, 0 条整块隐藏 (per spec)
      - 点击切换过滤模式: 显示全部 vs 只显示 fetched_from="night-shift"
      - 选中态: 蓝色描边 + brandSoft 背景 + 加粗
      - 每条 night-shift 产物: amber 渐变背景 + Tag "🌙 夜班"
      - 过滤后无数据空状态: 引导 "去 🌙 小华夜班 启用「凌晨抓热点」"
      端到端 smoke: 跑 seed → run 凌晨抓热点 → /api/hot-topics 返 fetched_from=
      "night-shift" 真数据 → 前端散落标签会显示 "🌙 来自夜班 N"
      JSX parse OK · 全量 pytest 216/216 (无后端改动)

      下一步可做: 类似的 "🌙 来自夜班" 也能加到 works / knowledge tab
      (但目前那两边没夜班 runner 写数据, 等 one-fish / kb-compiler 真接入再做)

## NightShiftPage 历史 today/week/all tab(D-049)

清华哥睡觉时我自主选这件做.
spec 提过"历史日志: [今天 | 本周 | 全部]", D-040d 落地时简化成 flat 30 条没分 tab.

- [x] **历史区加 today/week/all tab + 计数 + 空状态**
      web/factory-night-v2.jsx:
      - 新 state: historyTab ('today' | 'week' | 'all'), 默认 'today'
      - runs limit 30 → 200 (客户端按 tab 过滤, 避免每切 tab 重新请求)
      - tabs UI: iOS 风圆角 pill 容器 (灰底), 选中黑底白字, 每个 tab 含计数
        e.g. "今天 5 / 本周 23 / 全部 187"
      - 各 tab 空状态文案不同 (today→ "今天还没跑过, 点上面任务的「立即跑」试试")
      - 时间窗口算法: today 从 0:00 开始 / week 倒推 7×86400 / all 不过滤
      JSX parse OK · 全量 pytest 216/216 (无后端改动)

## 公众号 8 步走查 BUG 第七轮(D-048)

清华哥上次 push 通了之后, article_meta.json 暴露了两个 hero 渲染 bug
(D-043 时已发现没动). 用户睡时收一波:

- [x] **hero_title_html 重复显示** — 旧 `f'{title[:6]}<span>{hero_highlight}</span>'`
      默认 hero_highlight=title[:8] 让前 6/8 字重复. 用户文章里看到
      "一个餐饮老板一个餐饮老板花3" 重复. 修: 抽出 `_compose_hero_title_html(title, hero_highlight)`,
      全文 title 为底, 若 hero_highlight 是子串就高亮一次, 否则不高亮.
      新行为: "[一个餐饮老板花3]万学建站, 我用AI免费搞定了" (前 8 字 span 高亮, 无重复).
      4 个单测 (默认无重复 / 子串高亮 / 不在 title 不硬塞 / 空 highlight 直接返).
- [x] **_auto_subtitle 贪婪切 6 字段** — 旧 `re.findall("[一-龥]{2,6}", first)`
      把连续中文文章首段切成 "上周一个开火 · 锅店的老板给 · 我看他的品牌" 鬼断句.
      修: 按中英文标点 split, 取 2-14 字的合法短语, 一段太长退化到首段前 30 字.
      新行为 (有标点): "我当场愣住了" 连贯. 新行为 (无标点): 首段前 30 字连贯.
      3 个单测 (标点切 3 段 / 长无标点退化 / 实战标点场景).
      改 1 个旧测试 (test_auto_subtitle_picks_keywords → _by_punctuation, 输入加标点).

全量 pytest 216/216 (+6).

## 公众号 8 步走查 BUG 第六轮(D-045)

D-043 改"清 URL 留 img"在用户实测下失败. 头像 URL 即使清成 https 没 ?from=appmsg,
mmbiz 资源 ID 还是别人公众号的, WeChat draft/add 仍 errcode 45166.

- [x] **回退 D-042 策略: ?from=appmsg 整剥** — D-043 是错的, D-045 复活 D-042.
      规则:
        ?from=appmsg → 整剥 (这是"非己公众号资源"天然标记)
        干净 mmbiz URL + http:// → 规整为 https 保留 (D-043 这部分仍有用)
        外链域名 → 整剥
      用户失败 HTML 复跑: 头像整剥, 14531→14054 字差 477 (跟 D-042 当时一致).
      头像将丢失 (D-042 时一样). 真要保头像, 后续做"上传自己的头像 add_material"
      (backlog D-046 候选).
      tests/test_wechat_sanitize.py 18/18 (改 9 个 + 加 3 个).
      诚实交代: 这一轮其实是承认我 D-043 思路错了 — 用户 [Image #5] 给的反馈
      "我的头像也没有了" 我误读为"用户想保头像", 实际用户更需要 push 不报 500.
      D-043 想"两全其美"碰壁. D-045 接受 trade-off: 头像没 vs push 通.



D-042 用户重试: push 通了 (头像就是 45166 主犯, 猜对) — 但**两个新副作用**:
  · 头像也被剥光了 (sanitize 误伤)
  · 4 张段间图没出现在文章里 (上游 assemble_html 阶段就丢了)

- [x] **sanitize_for_push 改"清 URL 不剥图"** — D-042 一棍子打死所有
      `?from=appmsg` / `http://` 的图, 误伤模板头像和段间图. D-043 改成:
        · `http://mmbiz/qlogo` → `https://`     (rewrite, 保 img)
        · `?from=appmsg` / `&from=appmsg`        → strip (rewrite, 保 img)
        · 域名外链 (apimart 等)                  → 仍然整剥 (推不上)
        · `<script>/<iframe>/<form>` 等危险 tag  → 仍然整剥
      新增 `_clean_img_url(url)` 辅助函数 + 返回 dict 加 `rewritten` 计数.
      用户失败那篇 14531 字 HTML 实测: 头像保留, URL 规整, removed: {}, 
      rewritten: {http→https: 1, strip ?from=appmsg: 1}.
- [x] **assemble_html 加诊断 dump** — Bug 2 没办法回看上次, 但下次再丢图必有铁证:
      `/tmp/preview/last_assemble_request.json` 含
      `section_images_received` (前端发了几张) +
      `section_images_with_mmbiz_url` (有几张 url 真的在) +
      `img_in_raw_html` (插进 raw HTML 几个) + paragraphs_count.
      若再丢图, 看这文件即可秒断: 前端没发 vs 后端 `_md_to_wechat_html` 丢.
      tests/test_wechat_sanitize.py 16/16 (旧 9 + 新 7).



**用户在 Step 8 push 反复失败 (errcode 45166), 已 D-038/D-039/D-041 三轮还是不通.**
用户原话: "你能测试好了再告诉我完成任务了吗?"
诚实交代: 本地无 WeChat draft/add sandbox, 没法 100% 验证修好.

- [x] **猜测根因 + 防御性 sanitize** — 模板硬编码的头像 `<a href=mp.weixin><img class="author-avatar" src="http://mmbiz.qpic.cn/.../?from=appmsg"></a>` 是别的公众号文章 mmbiz URL.
      WeChat draft/add 经验: 正文 img 必须是 https + 这次 add_material 上传的资源,
      硬编码外链头像很可能就是 45166 的 invalid content hint 主犯.
      `wechat_scripts.sanitize_for_push()` 推送前清理:
        · http://img / ?from=appmsg / 非 mmbiz 域 → 剥 img
        · 非 mp.weixin.qq.com `<a>` → 解 a 留文本
        · `<script>/<iframe>/<form>/<input>/<embed>/<object>/<video>/<audio>` → 整剥
      验证: 用户实际失败的那篇 (/tmp/preview/wechat_article.html, 14531 字)
      sanitize 后差 477 字, 唯一被剥的就是头像块 (img_from_appmsg: 1).
- [x] **不猜的兜底诊断** — push 时同时落盘:
        /tmp/preview/last_push_request.html  · 实际发给微信的 sanitized HTML
        /tmp/preview/last_push_request.json  · meta 含原/清后字符数 + 删了啥
      若再报 45166, 用户把这两个文件发过来即可精确定位真正违规元素.
      tests/test_wechat_sanitize.py 9/9.



- [x] **Step 5 → 6 拼 HTML 时 "Converting circular structure to JSON" 崩溃**
      根因: `assembleHtml(templateName)` 接受 D-034 的模板切换参数, 但
      `<Btn onClick={onNext}>` 把整个 SyntheticEvent (含 React fiber +
      HTMLButtonElement) 当 templateName 喂进来, 然后落进 `template: tpl`
      塞进 request body, `api.post` 一 JSON.stringify(body) 就炸循环引用.
      修复:
        1. callsite 显式包: `onNext={() => assembleHtml()}`
        2. assembleHtml 内部防御: `tpl = (typeof tn === "string" && tn) ? tn : default`
      其它 step fn 全部签名 / callsite 已审, 仅 assembleHtml 这一处.

## 公众号 8 步走查 BUG 第二轮(D-039)

用户在 Step 5 段间配图遇到第 2 轮问题:

- [x] **段间配图防盗链显示占位图** — `gen_section_image` 只返回 `mmbiz_url`, 浏览器 `<img src=mmbiz>`
      被微信图床 referer 防盗链拦截显示 "未经允许不可引用". 修复: 后端从脚本 stderr 解析
      `LOCAL_PATH` 拷贝到 `data/wechat-images/` 暴露给 `/media/`, 返回 `media_url`; 前端用
      `media_url || mmbiz_url`. mmbiz_url 仍用于 HTML 拼装/草稿推送.
- [x] **/api/wechat/push 500 stderr 空** — `push_to_wechat.sh` 把错误用 `echo "❌ ..."` 写到 stdout,
      原 `_run` 错误信息只展示 stderr 导致前端看到 `stderr: ` 空字符串无从定位. 修复: `_run` 失败时
      stderr 空就 fallback 附 stdout 尾部.

## Bonus 任务(P10 之后,cron 继续干活时做的)

- [x] **即梦(Dreamina) AIGC 接入 (D-028)** — CLI 工具型技能(非 SKILL.md 范式)
      用户提示: poju-site 接过,可参考。subprocess wrap ~/.local/bin/dreamina
      backend/services/dreamina_service.py: text2image / image2video / query_result / user_credit
      `/api/dreamina/{info,text2image,image2video,query,list-tasks}`
      sidebar 🎨 即梦 AIGC · 2 步流程: 选模式+prompt+配置 → 提交+轮询+预览
      下载到 data/dreamina/ 走 /media 暴露 · 端到端 /info 通(余额 8426 credits)
- [x] **违禁违规审查 skill 接入 (D-026)** — 第 6 个接入的 skill (用户主动插单,学员版 OK)
      单 step 流程: 输入文案+行业 → 一次性出审核报告 + **必须** 2 版改写
      6 类行业(通用/大健康/美业/教育/金融/医美) 决定是否加查敏感行业词库
      违规分高/中/低危 · 保守版 100% 合规 · 营销版保留吸引力
      `/api/compliance/{check,skill-info}` · sidebar 🛡️ 违规审查
- [x] **content-planner skill 接入 (D-022)** — 第 5 个接入的 skill
      用 scripts/add_skill.py 一键生成骨架(测试 D-017 可用性) +
      改 pipeline 适配特殊输出(三档目标 + 6 模块策划) +
      改 jsx 三档目标卡片 + 6 模块手风琴展示
      端到端: 一句"下周给老板讲课" → 推断信息 + 三档目标 → 6 模块完整方案

---

## D-010 已完成 · 公众号 skill 全链路 GUI

**版本**：v0.3.3 -- 公众号 skill 接入

**目标达成**：从一句选题 → 公众号草稿箱已推送,全程在本项目前端完成,
skill 里的 references/scripts/assets 全部当事实源读取/调用,系统不重写。

**完成**(4 个 commit):
- [x] `2ea58e7` skill_loader.py + Phase 1-2(titles/outline/write + 三层自检)
- [x] `9a70853` wechat_scripts.py + Phase 2.5/3/4(plan-images/section-image/html/cover)
- [x] `1c940e2` 前端 factory-wechat-v2.jsx 8 步全链路 UI
- [x] `D-010 第4步` 文档收口 + 28 个单元/集成测试全绿

**端到端验证**:
- /titles(DeepSeek,3.6s): 3 个候选标题,带 template + why
- /outline(DeepSeek,4.9s): 5 字段大纲,开场用学员故事
- /write(DeepSeek,22s): 1835 字长文,自检 PASS 六维 108/120
- /plan-images(DeepSeek,4s): 4 条具象 16:9 prompt
- /html(400ms): 14.5KB 微信 markup,section/span-leaf/mp-style-type 齐
- /cover(Chrome headless,4.6s): 11KB jpg
- /section-image: apimart 慢,本地脚本确认可用,留用户端跑
- /push: endpoint 就绪,真推留用户前端按钮触发(避免测试稿污染草稿箱)

**skill 资源字数**(读取事实源):
- SKILL.md 13994 字
- references 总 35350 字(who-is-qinghuage / style-bible / writing-methodology /
  visual-design-v2 / wechat-api-reference)

**架构决策** D-011 见 TECHNICAL-DECISIONS.md: skill 目录作为事实源
(vs Obsidian persona),当功能有对应 skill 时 skill 覆盖 Obsidian。

## 下一步要做（优先级排序）

## 下一步要做（优先级排序）

1. **行为记忆写入** -- 改写/生成后自动追加到小华工作日志.md（Phase 2 的核心）
2. **底部 dock 自由对话** -- 多轮聊天,AI 学到的偏好自动回写记忆文件
3. **首页 4 方块真实统计数据** -- 后端已有 `/api/stats/home`,前端对接
4. **Opus 503 排查** -- 测试时发现 OpenClaw proxy 持续 503,切 DeepSeek 才能跑。
   可能是 Anthropic 上游限流或 OpenClaw 自身问题,需在 Claude Desktop 中复查
   (本次实现的 deep 功能在两个引擎上都验证过可用)
