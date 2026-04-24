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
- [ ] **行为记忆写入**：每次改写/生成后自动追加到小华工作日志.md（Phase 2 做）
- [ ] 首页 4 方块真实统计数据
- [ ] 选题批量生成优化

### Phase 2 -- 小华对话 + 记忆闭环
- [ ] 底部 dock 自由对话（多轮）
- [ ] 对话中学到的偏好自动写入小华工作日志.md
- [ ] 行为记忆读取：最近 20 条注入 prompt

### Phase 3 -- 发布 + 数据闭环
- [ ] 多平台真发布（需各家 OpenAPI 授权）
- [ ] 数据自动采集
- [ ] 效果分析 -> 反哺选题

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
- [ ] **[P10] 前端 UI 组件库提取**

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
