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
- [ ] **D-040c 调度器** APScheduler 接入 cron + watchdog file_watch, 启动钩子,
      执行器走 D-010 范式 (subprocess 调 ~/Desktop/skills/<slug>/scripts), AI 走 ai.py 关卡层
- [ ] **D-040d 总控页 + sidebar 改造**
      sidebar: 首页→总部 / 加 "生产部 / 档案部 / 夜班" 分组 / 加 🌙 小华夜班 入口
      NightShiftPage: 状态条 + 任务卡片 (开关/编辑/立即跑) + 历史日志
- [ ] **D-040e 总部播报 NightDigestCard + 散落标签**
      4 大方块下方 + 🔥98 热点条上方; 时间联动 (6-22h "昨晚做了 X" / 22-6h "今晚 N 件");
      0 产出整块隐藏不要"暂无"; 素材库/作品库/知识库加 "🌙 来自夜班 (N)" 过滤标签
- [ ] **D-040f 4 条预设任务实装** 抓热点 / 一鱼多吃 / 知识库整理 / 昨日复盘
      各自 seed 对应 skill_slug 和 trigger_config

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

## 公众号 8 步走查 BUG 第三轮(D-041)

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
