# 技术决策档案

> 每条决策有背景 + 结论 + 代价。避免将来 AI 问"为什么这么做"。

---

## D-001 - Streamlit -> FastAPI + React CDN（2026-04-24���

**背景**：v0.1 用 Streamlit 单文件 UI，迭代快但 6 步流交互受限（rerun 机制 + 无前进/后退）。设计稿 C2 要求多页流转 + 底部对话 dock + 实时预览。

**结论**：后端 FastAPI（`:8000`）+ 前端 React CDN + Babel（`:8001`）。不上 Vite/Next，纯 CDN 引入 React 18，单个 `index.html` 内 JSX 编译。

**代价**：没有 HMR，改前端要手动刷新。打包体积大（Babel in-browser），但单人本地用无所谓。

**替代方案被否**：Electron（包体积 200MB，打包签名每次 5-10 分钟）

---

## D-002 - AI 引擎双轨：Opus + DeepSeek（2026-04-24）

**背景**：清华哥有 Claude Max 订阅，通过 OpenClaw proxy（`:3456`）走 OpenAI 兼容接口调 Opus。但 Opus 响应 10-30 秒，DeepSeek 1-3 秒。

**结论**：`shortvideo/ai.py` 统一抽象层，`get_ai_client()` 根据 `settings.json` 的 `ai_engine` 字段返回对应客户端。设置页一键切换。

**代价**：两个客户端要保持接口同构（chat / rewrite_script）。

---

## D-003 - 知识库只读，不在工厂内编辑（2026-04-24）

**背景**：清华哥的知识库在 Obsidian（`~/Desktop/清华哥知识库/`），1200+ 条 Markdown，有完整的编辑/插件/双链体系。

**结论**：工厂只读。编辑/新增/删除都去 Obsidian。工厂提供：目录树浏览、全文搜索、chunk 级 TF-IDF 匹配（供 AI prompt 注入）。

**代价**：不能在工厂内快速加知识条目。但避免了两份知识库分叉。

---

## D-004 - 知识库匹配用 jieba + TF-IDF，不用向量（2026-04-24）

**背景**：PRD 规划 Phase 1 用 BM25/TF-IDF，Phase 2 用 embedding + FAISS。

**结论**：当前 `kb.py` 用 jieba 分词 + 倒排索引 + TF-IDF 打分 + 分区权重（07 Wiki 权重 3.0，04 飞书档案馆降到 0.35）。内存索引，600 秒缓存。

**代价**：纯关键词匹配，无语义理解。"怎么做直播"匹配不到"直播间搭建流程"。但当前 1200 条规模够用。

**升级触发**：匹配命中率低于 60% 时考虑 embedding。

---

## D-005 - 人设/记忆架构三层设计（2026-04-24，未实现，设计决策）

**背景**：清华哥希望 AI "越用越了解我"，改写文案能带清华哥味道。

**结论**：三层记忆，从简单到复杂逐步实现：
1. **Layer 1 人设底座**（静态）：读 `00 AI清华哥/*.md`，启动时加载缓存，注入每次 AI 调用的 system prompt
2. **Layer 2 偏好设置**（半静态）：`data/settings.json`，用户主动改（语气/风格/避讳词）
3. **Layer 3 行为记忆**（动态）：`data/memory.jsonl`，追加写，记录每次改写的选择和手动修改，最近 N 条注入 prompt

**代价**：Layer 3 的 JSONL 会无限增长，需要定期清理或只读最近 N 条。

**关键**：不需要向量数据库、不需要 embedding、不需要重搭 OpenClaw。就是文件读取 + prompt 拼接。

---

## D-006 - 石榴 API 只接受文本，声音克隆独立（2026-04-23）

**背景**：石榴 `video/createByText` 只接受文本 + 内置 speaker，不接受外部音频。

**结论**：主链路 = 文案 -> 石榴内置 speaker -> 数字人视频。CosyVoice 2 = 独立模块，生成的音频用于 B-roll 旁白/混剪/试听参考。

---

## D-007 - 项目管理对标 poju-site（2026-04-24）

**背景**：neironggongchang 没有 git、没有 CLAUDE.md、没有进度看板，每个新 AI session 从零摸索。

**结论**：对标 poju-site 的项目管理体系：
- `CLAUDE.md` -- AI 入口路标（200 行内）
- `docs/PROGRESS.md` -- 进度看板，每 session 必更
- `docs/TECHNICAL-DECISIONS.md` -- 决策档案（本文）
- Git 版本控制
- 文档事实源层级（PRD > PROGRESS > 其他）

**和 poju-site 的区别**：
- 不需要 AI-HANDOFF.md（单机项目，没有 Mac mini 后厨）
- 不需要 TECHNICAL-SPEC.md（没有多方协议，PRD 的 API 清单 + 数据模型就是契约）
- 不需要 handoff-check.sh（本地项目，启动就行）

---

## D-008 - 人设注入两档开关：深度理解 vs 轻快模式（2026-04-24）

**背景**：每次 AI 调用都带完整人设文件（4 个 .md，~7200 token）会浪费 token 且拖慢响应。但只带 300 token 精简版又可能丢失风格细节。

**结论**：前端加一个 checkbox「深度理解业务」（默认勾选），对应两档：
- **勾选（deep=true）**：加载 persona-prompt.md（300 token）+ 完整人设文件（~7200 token）+ 知识库匹配 + 行为记忆 ≈ 8000 token
- **不勾选（deep=false）**：只加载 persona-prompt.md（300 token）

**实现要点**：
1. `00 AI清华哥/persona-prompt.md`：新建，300 token 精简版，从 4 个原始文件提炼
2. `ai.py` 的关卡层：新增 `deep` 参数，决定加载哪档
3. 每个内容生产 API（rewrite/ad/moments/article/topics）加 `deep: bool = True` 参数
4. 前端每个内容生产页面上方放一个 checkbox，默认 checked

**代价**：每个 API 多一个参数。但未来新技能只要走 `get_ai_client()`，自动继承两档能力。

**关键原则**：persona-prompt.md 放在 Obsidian 知识库里（`00 AI清华哥/`），清华哥随时能在 Obsidian 里打开编辑，工厂只读。

**实现落地**（v0.3.2，2026-04-24 晚第二次 session）：

1. `backend/services/persona.py::load_persona(deep)` — 按档加载 + 10 分钟 mtime 缓存
2. `shortvideo/ai.py::PersonaInjectedAI` — 关卡层包装器。`get_ai_client()` 返回这个包装器，拦截 `chat / rewrite_script`，把人设拼到 system prompt 最前面（`"persona\n\n---\n\n# 本次任务\n\n{原 system}"`）。底层 Opus / DeepSeek 客户端不改。
3. `rewrite_script` 不再写死 "你是资深编辑"，身份交给人设定义，这里只给任务规则。
4. 6 个 Req 模型（Rewrite/AdGen/MomentsDerive/ArticleOutline/ArticleExpand/TopicGen）加 `deep: bool = True`；3 个 service（ad/moments/article）签名加 `deep`。
5. 前端 `web/factory-deep.jsx` — `useDeepMode()` + `<DeepToggle />` + `getDeep()`。全站一个 localStorage 字段 `factory_deep_mode`，默认 true。
6. 5 个页面（factory-flow/ad/moments/article/materials）放 `<DeepToggle />` + api.post 传 `deep: getDeep()`。

**实测体积**（不是之前估的 7500 token，实际更少）：
- 精简版：830 字（~300 token）
- 详细版合计：10093 字（~3500 token）
- 勾选时 system prompt 约 11000 字（~3800 token），一次改写总 prompt ≈ 6900 token
- 不勾选：system 约 830 字（~300 token），一次改写总 prompt ≈ 680 token

**实测效果**（同一句 "最近很多老板问我 AI 怎么落地..."）：
- deep=False 输出：24 字，通用编辑风
- deep=True 输出：87 字，带具体数字（"一个人一年工资加社保少说七八万"）+ 钩子结尾（"这笔账不用我帮你算吧？"），命中 persona 铁律

---

## D-011 - Skill 目录作为事实源,功能级覆盖 Obsidian persona（2026-04-24）

**背景**：上次 session 用 Obsidian `00 AI清华哥/` 作为全站人设事实源(D-005)。
这次接入 `~/Desktop/skills/公众号文章/` skill,skill 里自带 `who-is-qinghuage.md`
(更深的人设) + `style-bible.md` + `writing-methodology.md`。两边内容有重叠。

**结论**：**功能级覆盖**。
- **默认**(改写/投流/朋友圈/选题等): 走 Obsidian persona(D-005 关卡层)
- **有对应 skill 的功能**(目前仅 /api/wechat/*): skill references 完全覆盖,
  关卡层的 `deep` 关掉(`deep=False`),避免双注入

**为什么这么做**:
1. skill 是产品单元,清华哥在设计 skill 时已经考虑了人设 + 方法论 + 场景,
   读到一半塞个 Obsidian persona 会污染 skill 的叙事
2. 每个 skill 是自给自足的,新 skill 接入时不用担心 Obsidian 的版本兼容
3. Obsidian 是"通用小华"的底座,skill 是"专业小华"的加强

**事实源路径**:
- skill: `~/Desktop/skills/<slug>/` (SKILL.md + references/ + scripts/ + assets/)
- 本项目: `backend/services/skill_loader.py` 只读访问,10 分钟缓存
- 不搬家、不同步、不复制

---

## D-010 - 公众号 skill 接入架构（2026-04-24）

**背景**：把 `~/Desktop/skills/公众号文章/` 这个完整 5 Phase 的 skill 接入本项目,
让清华哥从一句选题到推进草稿箱全程在前端完成。

**架构**：4 层清晰分工
1. **事实源层** = skill 目录(SKILL.md + references + scripts + assets)-- 只读
2. **编排层** = `backend/services/wechat_pipeline.py` + `wechat_scripts.py`
   - pipeline: AI 调用(Phase 1-2 + plan-images 的 AI 产 prompt 那步)
   - scripts: subprocess 调 skill 下的 scripts/(gen_section_image / cover /
     convert_to_wechat_markup / push_to_wechat)
3. **API 层** = `backend/api.py` 的 `/api/wechat/*` 8 个 endpoint
4. **UI 层** = `web/factory-wechat-v2.jsx` 覆盖旧 PageWechat

**不这么做**:
- ❌ 把 skill 的 references 复制到本项目仓库(两份会分叉)
- ❌ 重写 skill 的 scripts 到 Python(失去 skill 作为独立产品的特质)
- ❌ 让 AI 自己走完整 5 Phase(Claude Desktop 的 agentic 模式)-- 这里是 FastAPI,
  需要确定的一步一确认 UI,不能让 AI 黑盒跑完

**skill 脚本依赖 Python 版本**：gen_section_image.sh / push_to_wechat.sh / 
convert_to_wechat_markup.py 用的是系统 python3 (`/usr/bin/env python3`,
macOS 默认 /Library/Frameworks/Python.framework/Versions/3.14/)。所需 premailer /
bs4 / openai 已在系统 python3 装好,本项目 .venv 不重复装。

**新技能接入范式**(未来任意 skill 都走这个 5 步):
1. `skill_loader.load_skill(slug)` 确认能读到
2. 在 `backend/services/<skill>_pipeline.py` 写 AI 调用编排
3. 在 `backend/services/<skill>_scripts.py` 写 subprocess 封装
4. 在 `api.py` 加 `/api/<skill>/*` endpoint
5. 在 `web/factory-<skill>-v2.jsx` 写 UI,覆盖旧入口

---

## D-009 - 关于 /api/rewrite 的 KB 注入（2026-04-24）

**背景**：原计划在服务端给 `/api/rewrite` 自动拼 `kb.match` 结果（Phase 1 第 3 项）。

**结论**：**不做服务端自动注入**。原因：`factory-flow.jsx` 已有 `KbInjectBar`，让清华哥在界面上手选要参考的 KB chunks，前端把选中的 chunks 拼到 `text` 里发出去。服务端再拼一次会双重注入。

**批量生成类**（投流/朋友圈/公众号/选题）是服务端自动 `kb.match`，因为这些场景用户不需要细粒度挑选。

**原则**：改写是创作场景，让用户控制参考素材；批量生成是执行场景，AI 自动匹配。

---

## D-012 ~ D-029 索引(autonomous loop 一夜批量 · 2026-04-25)

每条决策的完整背景和 tradeoff 详见对应 commit message(`git show <hash>`)和 CHANGELOG.md。
PROGRESS.md 行内的 1 行说明 + 这里的 1 句"为什么这么做"是日常查阅入口。

| D 号 | commit | 主题 | 关键决策 |
|---|---|---|---|
| D-012 | `e7a75f6` | 热点改写V2 skill 接入 | 3 步 UI · SKILL.md 自带方法论整篇注入 prompt |
| D-013 | `c9c54f1` | 录音改写 skill 接入 | 同 3 步范式 · angles 上限 2(skill 硬规则)· 7 项自检清单 |
| D-014 | `1f9db04` | touliu-agent skill 替换旧 /api/ad | 2 步 · 注入 SKILL.md+4 references · subprocess 调 lint_copy_batch.py |
| D-015 | `31259a6` | AI token/成本监控 | SQLite ai_calls 表 · 价格常量(可 settings 覆盖) · 首页 widget |
| D-016 | `7d89026` | 工作流 localStorage 持久化 | 通用 useWorkflowPersist hook · 4 skill 全覆盖 · 500ms 防抖 |
| D-017 | `0ba444e` | scripts/add_skill.py 骨架生成器 | 7 处自动注册全幂等 · 新 skill 3h → 30min |
| D-018 | `e3de933` | 测试扩展 18 → 75(后续到 102) | 4 个新测试文件 · tmp_db fixture 隔离 · 不打真 AI |
| D-019 | `e039801` | 首页技能中心 + registered_skills 单一事实源 | api_prefix ≠ page_id 区分 · 自动扫桌面发现"未接入" |
| D-020 | `7af9285` | CHANGELOG + NEW-SKILL-PLAYBOOK 文档 | Keep-a-Changelog 格式 · D-010 范式手册化 |
| D-021 | `8ed1808` | factory-ui.jsx 跨 skill 组件库 | Spinning/SkeletonCard/StepHeader 提取 · 现有 skill Header 暂不迁移 |
| D-022 | `bec198d` | content-planner skill 接入 | 输出与众不同(三档目标 + 6 模块策划) · 验证 add_skill.py 实用 |
| D-023 | `f56ccbd` | 行为记忆写入小华工作日志.md | 默认 disabled · 5min 节流 · 失败吃掉不影响主调用 |
| D-024 | `d7f3550` | 首页 4 方块真实数据 | 接 ai_calls 表按 route_key 前缀聚合 · hint 自适应三态 |
| D-025 | `e4f5324` | 选题批量生成结构化 + 去重 | 注入最近 30 条避免重复 · 字数 6-25 过滤 · 前 5 字 dedup |
| D-026 | `51193b9` | 违规审查 skill (学员版 OK) | 单 step 流程(非 3 步) · 2 版改写 Tab · 6 类行业 chip |
| D-027 | `64f6037` | LiDock 真接通 /api/chat 多轮 | DeepSeek 路由(快+便宜) · 切页重置 · 不持久化 |
| D-028 | `e321c6a` | 即梦 Dreamina CLI 接入 | subprocess wrap(同 poju-site) · 不走 SKILL.md 范式 · 异步 poll |
| D-029 | `(本 commit)` | cron 周期 30min → 10min | 用户反馈"不用一直等" · 10min 是清晰的频次 |

**已接入 skill 全集(共 6 个,1 个 CLI 工具)**:
- 📄 公众号文章 (D-010, 8 步, 含 5 phase scripts)
- 🔥 热点改写 (D-012, 3 步)
- 🎙️ 录音改写 (D-013, 3 步)
- 💰 投流文案 (D-014 替换旧 /api/ad, 2 步, 含 lint 脚本)
- 🗓️ 内容策划 (D-022, 3 步, 输出三档目标 + 6 模块)
- 🛡️ 违规审查 (D-026, 2 步, 学员版 OK)
- 🎨 即梦 AIGC (D-028, CLI 工具型 · 非 SKILL.md 范式)

---

## D-065 - 作品库扩展为统一资产库 / works 表加 type+metadata(2026-04-26)

**背景**:用户实测痛点 — 用"直接出图"生成 4 张图后**找不到去哪了**。原因:
- `works` 表是短视频专用(字段 avatar_id / shiliu_video_id / duration_sec)
- 图片产出散在 6 个目录(image-gen / covers / wechat-cover / wechat-cover-batch / wechat-images / dreamina),46 张图
- 文字产出(改写/投流/朋友圈/公众号长文)根本不入库,只走前端临时展示
- 前端"作品库"页只列短视频,看不到图和文字

**结论**:works 表升级为通用资产库,不另起 artifacts 表(避免双表合并的复杂度,且现有 metrics 表已与 works 联动)。

**Schema 变更**(SQLite ALTER TABLE 加列,向前兼容):
- `type TEXT NOT NULL DEFAULT 'video'` — text / image / video / audio
- `source_skill TEXT` — image-gen / wechat-cover / wechat-section-image / wechat-cover-batch / dreamina / shortvideo / baokuan / hotrewrite / voicerewrite / touliu / wechat / planner
- `thumb_path TEXT` — 图/视频缩略图(图直接用原文件,视频后续抽帧)
- `metadata TEXT` — JSON 字符串,装 type-specific 字段(prompt / size / engine / token / version 等)
- `final_text` 列保留 NOT NULL — 图/视频 insert 时给空串 `""` 兜底,避免改列约束(SQLite 改 NOT NULL 要重建表)

**API 变更** (`/api/works`):
- 新增 query: `type` / `source_skill` / `since` (today/week/month/all) / `q` (搜索)
- 返回: 加 `type` / `source_skill` / `thumb_url` / `metadata` / `local_url`

**接入点改造**(在每个生图/出文 endpoint 落盘后插入 works 行):
- 6 个图入口: `/api/image-gen` / `/api/wechat/cover` / `/api/wechat/section-image` / `/api/wechat/cover-batch` / `/api/dreamina/text2image` / `/api/dreamina/image2video`
- 6 个文字 skill: 改写 / 投流 / 朋友圈 / 公众号长文 / 选题 / 标题
- 短视频走原来的 insert_work + type='video'(默认值,旧代码不改)

**历史回灌**:`scripts/migrate_assets.py` 一次性扫 6 个目录,按 mtime + 文件名规则倒灌已有的 46 张图入库。文字产出无法回灌(没存盘),从 D-065 之后开始累积。

**前端**:V1 mockup 风格(`docs/design/works-gallery-mockup.html`)— 顶部 6 个主 tab(全部 / 文字 / 图片 / 视频 / 数据看板 / 发布矩阵)+ 来源 chip 行 + 时间 chip 行(默认今天)+ 卡片底部可见标题。视频视图复用旧 `WorkCard`,图视图新做,文字视图新做。

**代价**:
- works 表语义从"作品(=视频)"扩为"产物(三类)",老代码读到的字段不变(default type='video')
- 文字产出需各 skill endpoint 改 insert_work + 决定写入哪段为 final_text(选 200 字摘要 vs 全文)— 选**全文**,展示时再截断
- 历史文字内容不可回灌(用户接受)

**替代被否**:新建 `artifacts` 表 — 短视频与 metrics 表的联动会断,两表 union 查询繁琐,得不偿失。

**Follow-up(同 session 第二次 commit)**:

- **UI 改瀑布流**: 视频 9:16 + 图片 16:10 grid 混排丑,改 CSS columns,
  每张图按原始 aspect ratio 自然铺满,卡片高度参差。`breakInside: avoid`
  防跨列断裂。
- **11 个生成点回写完整覆盖**:
  - 直接出图 (`image_engine.generate` 自带 hook,加 `source_skill` 参数)
  - 公众号封面批 (`gen_cover_batch` 调 image_engine 时传 source_skill)
  - 公众号段间图 (`gen_section_image` 走 bash 不经 image_engine,return 前手动 insert)
  - 即梦 text2image / image2video (`/api/dreamina/query` done 时 insert,kind 字段决定 type=image/video)
  - 6 个文字 skill (`tasks_service.run_async` 完成时按 kind 前缀自动 insert,
    `_extract_text_from_result` 覆盖 article/versions/copies/scripts/drafts/content 等 8 种 result shape)
- **同名函数全局污染教训**: babel-in-browser 把所有 jsx 合并到同一全局 scope,
  跨文件同名 React 组件**后定义覆盖前定义**(本次 ImageCard 同名 bug 浪费了 ~1 小时调试)。
  约定: 跨文件 React 组件命名加 page 前缀(WorksImageCard / GenImageCard 而非 ImageCard)。

---

## D-066 - 侧栏整合 6 个一级入口 + 写文案/出图片二级页(2026-04-26)

**背景**: 用户反馈生产部 11 个图标太多, 看着乱. 实际上"做视频/公众号/朋友圈"是
独立大流程(每个都是端到端的多 step 工作流), 而"投流/热点改写/录音改写/爆款改写/
内容策划/违规审查/直接出图/即梦"都是子工具(单页面), 应该收纳到二级页.

**结论**: 生产部从 11 个收到 6 个一级入口:
- 🎬 做视频(独立流程)
- 📄 公众号(独立流程)
- 📱 朋友圈(独立流程)
- ✏️ 写文案(整合 6 个文字 skill 的二级页)
- 🎨 出图片(整合 2 个图引擎的二级页)
- 🧪 黑科技(给未来好玩的功能预留坑位 + 3 张未开发草稿)

**视觉**: 侧栏走"双层纸叠"风格(决策路径见 docs/design/sidebar-*.html 7 份草稿):
- 部门 header = 白卡 + emoji + 大粗字 + 轻投影 (🏭 生产部 / 📦 档案部 / 🌙 夜班)
- 工具列表 = 浅米色 bg "内页", 紧贴 header 下方, 用 -3px overlap + 6px 左右 inset
  (像两张纸叠在一起, 部门是封面纸, 工具是内页)
- 「小华夜班」emoji 改 🦉 避免和夜班 🌙 冲突
- 侧栏宽度 hover 64 → 220px, 收起时只显示 emoji 列表 + 部门图标作为视觉锚点

**二级页架构**(写文案/出图片):
- 顶部 4 个 stats 卡(今日产出 / 今日热门 / AI token / 累计作品)
- 「选个工具开始」标题 + 工具卡网格(hardcode 工具列表, 跟 backend registered_skills.py 解耦)
- 工具卡角标显示「今日 N 次」(从 /api/ai/usage by_route 聚合)
- 「最近写过的文案 / 出过的图」从 /api/works?type=text|image 取最近 4-8 条
- 卡片点击跳具体 skill 页 (?page=baokuan / ?page=imagegen 等), 旧 URL 全部保留兼容

**接通的真实数据**:
- /api/works/sources(by_type / by_source 计数)
- /api/works?type=&since=today&limit=N(最近列表)
- /api/ai/usage?range=today(token / 金额 / by_route 用于工具卡今日次数)

**代价**:
- 侧栏 hover 展开宽度从 164 → 220px(双层纸叠样式需要更多内容)
- 工具列表元数据(slug/icon/label/desc/steps)在前端 hardcode, 跟 backend
  registered_skills.py 不再是 single source of truth — 但子工具列表稳定, 
  改动频率低, hardcode 更省事且视觉描述更精细
- 黑科技页当前空, 仅 placeholder + 3 张灰色草稿卡占位

**Follow-up**:
- 作品库默认时间智能 fallback(今天 0 条 → 自动切本周, 加提示语)
- 卡片 hover 高亮 / 详情抽屉图片 lightbox(仍待做)

---

## D-067 - "真正越用越懂" 闭环 + LiDock 不撒谎(2026-04-26)

**背景**: 用户反思 — 当前 AI 真的越用越懂他了吗? 查后发现:
- Layer 1 (静态人设, 4 份 Obsidian 文件) 真在每次 AI 调用注入 ✓
- Layer 3 (行为记忆) — `work_log.py` D-023 + `preference.py` D-030 写入逻辑都已存在,
  **但默认 disabled + 写出来的内容没读回 system prompt** = 半拉子, 完全没生效
- LiDock 给的"我帮你打开 XX 文件夹"是纯文字编造 — `/api/chat` 没 tool calling 能力,
  也没 system prompt 约束 AI "不能撒谎说自己有能力"

**结论**: 闭环上 4 件事:

**P1 读回闭环** (`backend/services/persona.py`):
- 加 `_load_memory_block()` 读三个 Obsidian 文件:
  · 优先 `昨天的你.md` (P4 夜班精炼摘要, ≤1000 字)
  · `小华学到的偏好.md` (preference.py 写入, ≤1500 字, 取最新)
  · `小华工作日志.md` 最近 30 行(只取 `## YYYY-MM-DD` 节里的真 entries, 跳过用户写的模板)
- `load_persona(deep, include_memory=True)` 默认开 — 把 memory block 拼到 system prompt 末尾
- `settings.work_log_enabled = True` + `preference_learning_enabled = True` 默认改成 True

**P2 LiDock 不撒谎** (`/api/chat` system prompt):
- 加严守则: 不能直接打开/查询/操作任何东西; 不能编不存在的功能或路径
- 列出真实存在的 6 个一级入口 + 3 个档案部入口 + 值班室
- 老板问"我的 X 在哪", 直接说从哪个真实页面进, 不假装能直接打开

**P3 采纳/否决信号** (`/api/works/{id}/action`):
- 作品库详情抽屉 header 加 👍 留这版 / 👎 删这版 按钮
- 写到 `metadata.user_action = kept | discarded` + 时间戳
- (后续) 行为记忆抽取优先收 kept 版本, discarded 进负向偏好库

**P4 小华夜班"昨天的你"摘要** (`night_runners.yesterday_summary_runner`):
- 凌晨 6:30 跑 (daily-recap 之后 30 min)
- 读 work_log 最近 50 条 + preference 全部 → 调 AI 二筛精炼成 ~200 token 摘要
- 写 `~/Desktop/清华哥知识库/00 🤖 AI清华哥/昨天的你.md`
- persona.py 优先读这个摘要 (替代完整 work_log) 注入下次 prompt
- 数据不足 5 条直接跳过, 不写空摘要

**默认禁用 → 默认启用对照**:
| 开关 | D-066 之前 | D-067 之后 |
|---|---|---|
| `work_log_enabled` | False | **True** |
| `preference_learning_enabled` | False | **True** |
| `yesterday-summary` 夜班 | (不存在) | seeded 但默认关 (等数据攒够) |

**代价**:
- system prompt 当前体量: 短人设 ~830 字 + 详细 ~10K 字 + 行为记忆最多 ~3K 字 = 总 ~14K 字 (~3500 token)
  Opus 完全装得下, DeepSeek 也 OK. 后续 prompt 量级再大需要再压 (P4 摘要正是为这个准备)
- LiDock 严格 system prompt 后, 它会更"老实"(说"你去 X 页找吧"), 牺牲一点拟人感换不撒谎

**Follow-up(下次)**:
- LiDock 加真 tool calling: search_kb / open_page 等, 让"我帮你打开"成真
- 偏好抽取增强: 不光看关键词命中, 也分析 user_action=discarded 的版本特征
- 行为日志 `## YYYY-MM-DD` 节按周做"周报"长摘要

---

## D-068 - 任务卡死防御三层 (2026-04-26)

**背景**: 老板触发"热点改写"等了 14 分钟 UI 一直转圈, 进度卡 15%, 没任何信号. 查 root cause:
`uvicorn --reload` 在 D-067 commit 期间随 6 个文件改动重启, 异步任务的 daemon thread 随进程一起被杀, DB 行 `tasks.status='running'` 没人收尾, 前端轮询无解.

**结论**: 三层防御, 缺一不可:

**Layer 1 启动孤儿恢复** (`backend/services/tasks.py::recover_orphans` + `backend/api.py::_recover_orphan_tasks` startup hook):
- uvicorn boot 时把上次没收尾的 `pending`/`running` 全标 `failed` + `error="服务重启,任务中断,请重新触发"`
- 每次 --reload 自动跑

**Layer 2 周期 watchdog** (`tasks.sweep_stuck` + `start_watchdog` threading.Timer 每 60s):
- 跑超 `max(5*estimated_seconds, 600s)` 的 running 标 failed
- 处理"进程活着但任务实质卡在上游 AI proxy"
- error 文案明确: `watchdog: 超时未完成(>5x 预估或 >600s), 任务可能卡在 AI proxy`

**Layer 3 UI 卡死可视化** (`web/factory-task.jsx::TaskCard`):
- `isTaskStale()` 判定: elapsed > 2*estimated 或缺估时按 5min 兜底
- stale 时橙边框 + "等了 5m14s" + "比预想久 6.3 倍" + "停掉"按钮
- 用户主动 cancel 触发立即重拉刷新 (`refreshTick` state)

**代价**:
- 每分钟一次 SQLite 写: `UPDATE tasks SET status='failed' WHERE ... > threshold` — 极轻
- 真正长任务 (touliu 估时 150s, 实际可能 5min+) 也会被 watchdog 误杀: 用户重试或调高 estimated_seconds
- daemon thread 起来时必须手动 capture/set contextvar (D-070 也踩这同一坑)

**预防 checklist** (新加任何 daemon thread 必读):
- 必须用 `tasks_service.run_async()` 或自己 `create_task()` + `finish_task()`, 否则 D-068 三层防御覆盖不到
- 独立 DB 表 (如 `night_job_runs`) 必须自己实现 `recover_orphan_runs()` (D-068b 加了)
- 不要用 in-memory dict 跟踪长任务状态 (旧 `COVER_TASKS` 是反例, 进程重启丢)

**附带做** (老板当面定):
- 侧栏品牌行 (🏭 清华哥内容工厂) 整行可点 → home (作为总部入口)
- 原首位 NAV `总部` 改名 `战略部` (id=strategy, 占位等装战略规划技能)

---

## D-068b - 防御扩展: deepseek timeout + night runs 恢复 (2026-04-26)

**背景**: 举一反三审计 5 处 `threading.Thread(daemon=True)` spawn:
1. `tasks.run_async` ✓ (D-068 已覆盖)
2. `compliance_pipeline` ✓ (用 tasks DB)
3. `dhv5_pipeline` ✓ (用 tasks DB)
4. `api.py::cover_create` 用 in-memory `COVER_TASKS` dict (重启丢, 但短任务用户可重试)
5. `night_executor` 用 `night_shift.finish_run` 写独立 DB 表 `night_job_runs` ✗ 没收尾

另查 httpx 客户端 timeout: `claude_opus.py timeout=120` ✓, `cosyvoice timeout=300` ✓, qingdou/apimart/shiliu 各自显式 ✓, **但 `shortvideo/deepseek.py` 没设, OpenAI SDK 默认 10min** — 卡住要等 10 分钟才让 watchdog 介入.

**结论**:
- `deepseek.py`: 加 `DEFAULT_TIMEOUT = 120.0`, 显式传给 `OpenAI(timeout=...)`
- `night_shift.recover_orphan_runs()`: UPDATE `night_job_runs SET status='failed', log='[recover] 服务重启'` WHERE status='running'
- 接到 `_recover_orphan_tasks` startup hook 一起跑

**代价**: deepseek 120s 上限 (之前 600s) — 真要 deepseek 跑 2 分钟以上的几乎不会发生, 风险极低.

---

## D-068c - 投流 422 修 + scripts/smoke_endpoints.sh (2026-04-26)

**背景**: 老板随手测投流, `POST /api/touliu/generate` 直接 422. D-062e 把前端 `useState(1)` 改默认值求速度, 但后端 `TouliuGenerateReq.n: ge=3` 没同步. 而且 pipeline 里 `max(3, min(n, 15))` 偷偷把 n=1 翻成 3 — **用户选 1 实际生成 3 条, 是双重欺骗**.

**结论**:
- 修 schema: API `ge=3 → ge=1`, pipeline `max(3,...) → max(1,...)`
- `DEFAULT_STRUCTURE_ALLOC` 加 1/2 条规则 (1=1痛点, 2=1痛点+1对比)
- 加 `scripts/smoke_endpoints.sh`: curl 9 个主 POST endpoint 用合理 payload, 自动 task_id cancel, 防同类 schema 错配再发生

**代价**:
- 1 条投流文案 alloc 没什么"结构感" (单条只能选一种), 但快, 这是用户求的
- smoke 不进 pytest (会消耗 token + 需 live AI proxy), 留 scripts/ 老板手动跑

**反例教训** (避免再写):
- 任何"silent clamp" (`max(N, ...)` 偷偷改 user input) 都是欺骗模式. UI 显示什么后端就该执行什么, 不一致时该 422 报错让前端修, 不该悄悄改值.

---

## D-069 - 去技术化 + 错误统一拦截 + LiDock 融合 TaskBar (2026-04-26)

**背景**: 老板录短视频要露屏, 现状一堆"技术味"会被观众看见:
- 错误弹窗直吐 `ClaudeOpusError: Claude Opus 调用失败(http://localhost:3456/v1 · ...)`
- 422 直吐 Pydantic JSON `{"detail":[{"type":"greater_than_equal","loc":["body","n"]...`
- 任务卡 fallback "hotrewrite.write" 这种 dot 命名
- "skill 资源 (开发用 · 默认折叠)" 4 处面板
- "{tokens} tokens" 露 6 处
- 顶栏 chip "0 进行中 · 8 完成"

**结论**:

**1. 错误统一拦截** (`web/factory-api.jsx::_handleErrorResponse`):
- 422 Pydantic JSON 解析: `greater_than_equal/less_than/missing/string_too_short` 等映射成大白话 ("n 至少 1; brief 没填")
- 5xx → 统一 "AI 上游临时不可用, 一会儿再试"
- 其他 4xx 取 detail 截 180 字, 不露 stack trace
- `FailedRetry` monospace 错误区块默认折叠到"看技术详情"按钮, 主区只显友好 reason
- `_friendlyErrorReason()` 把 `timeout/502/429/auth/safety/422` 关键词映射成大白话

**2. LiDock 融合 TaskBar** (老板当面定 — 顶栏 chip 看着累):
- 顶栏 `<TaskBar>` 整删
- `LiDock` 按钮上小华头像加红点徽章 (橙=卡死/蓝=进行中/0=不显)
- LiDock 面板加 "对话/任务" 双 tab
- 任务 tab 复用 `TaskCard` 组件 (代码复用, 不重写)
- 跨页跳转走 window event `ql-nav` (LiDock 不需要每个 page 传 onNav)

**3. 调试件硬隐藏**:
- `ApiStatusLight` 移除 settings 入口, 只 `localStorage.show_api_status=1` 才显
- 设置页 "开发调试" section 整删
- 设置页 AI 健康 "已连通 · opus · model" → "AI 通讯正常"

**4. 文案脱敏**:
- 任务卡 fallback `task.kind` → `TASK_KIND_LABELS` 中文 ("hotrewrite.write" → "热点改写")
- "skill 资源" 4 处面板全删 (hotrewrite/voicerewrite/wechat/touliu)
- "skill 提示 100+" → "字数偏短"
- "{tokens} tokens" 全删 (compliance/flow/planner/touliu/works)
- 首页 "今日 AI 消耗 12.3K tokens" → "今天用了多少 AI · 约 9K 字 · 深度 AI 5 次"
- "卡死/杀掉" → "等了/停掉"

**代价**:
- 老板自己排查问题时要点"看技术详情"展开. 但日常 90% 用户都用不上.
- LiDock 按钮加徽章后视觉略复杂, 但不开任务时干净.

---

## D-070 - 访客模式 (2026-04-26)

**背景**: 老板问"我用我的工厂帮朋友项目产出, 会被自动记录吗?". 是, 而且会污染 D-067 越用越懂闭环 (5 个写入口子全开):
1. `tasks._autoinsert_text_work` 入作品库
2. `wechat_scripts` 公众号入作品库
3. `work_log.maybe_log` 行为日志
4. `preference.maybe_learn` 偏好学习
5. AI 强制注入"清华哥"几千字人设

最贵的是 `preference + work_log` 被污染, 直接歪了 D-067 闭环, 不可逆 (除非手动删 Obsidian 文件).

**结论**: 全局开关, 一切短路:

**架构**:
- `backend/services/guest_mode.py`: `contextvars.ContextVar` 存当前 request 的 guest 状态
- `backend/api.py` HTTP middleware 读 `X-Guest-Mode` header → 写 contextvar
- `tasks.run_async` 跨 daemon thread 显式传递: `captured_guest = guest_mode.capture()`, worker 内 `set_guest(captured_guest)` (否则 daemon 起来 contextvar 默认 False, 失去访客意义)
- 5 个写入口子各加 `if guest_mode.is_guest(): return` 短路
- `PersonaInjectedAI.chat`: 访客时不读 persona, 改"中文写作助手"中性 system (~100 字)

**前端**:
- `factory-api.jsx`: 所有 fetch 自动带 `X-Guest-Mode` header (从 `localStorage.guest_mode` 读)
- `factory-shell.jsx::GuestToggle`: 侧栏底部 🕶 按钮, 开启时橙色高亮
- `factory-app.jsx`: 主区顶橙 banner "🕶 访客模式 · 这次产出不进你的作品库 / ..." + "切回我自己" 一键关
- localStorage 持久化 (跨 session 保留, 防"切完忘关"伪安全)

**代价**:
- contextvar 跨 daemon thread 必须手动 capture/set, 是 Python contextvar 的常见陷阱. 文档化在 `guest_mode.py` 模块 docstring + `tasks.run_async` 注释里.
- 访客模式下 AI 不带清华哥人设 → 朋友项目稿子风格中性, 用户可能想要"切到朋友的人设" — 当前不支持 multi-tenant persona, 一期不做.
- 访客模式不入作品库 → 朋友项目稿子无地方留底, 用户需要手动复制保存. 一期可接受.

**测试** (`tests/test_guest_mode.py`, 7 项):
- contextvar 默认 / set / reset / capture
- work_log / preference / autoinsert_text_work 在访客时短路
- PersonaInjectedAI 访客 system 远小于真人设 (中性约 100 字 vs 真人设 几千字)

**Follow-up**:
- 多租户人设: 给每个朋友项目配自己的 persona-prompt (一期不做, 等真有需求)
- 访客模式独立作品库 (隔离 namespace, 老板用完能"导出/清空"整批) — 一期不做


## D-088 - LLM 空 content 当 transient 重试 + 写长文 fail-fast (2026-04-28)

**触发 case**: 老板今早 11:03 跑公众号 Step 4 写长文, UI 显示标题 + "0 字 · write 6558
tok · check 6686 tok · 三层自检 ✅ 6/6 · 107/120 通过 · 无禁区" 但正文区域空白.
DB 查 task `b72844d1f97...` 状态 = ok, `result.content = ""`, `tokens.write=6558`.

**根因 (两层)**:
1. **Opus / OpenClaw proxy 偶发**: 烧了 6558 completion_tokens 但 message.content 为空.
   推测 max_tokens=6000 全烧在 thinking 上没产 text block, 或代理转发丢 content 字段.
2. **DeepSeek 自检 hallucinate**: 给空字符串当文章, 还硬给 107/120 通过 + 编"文章整体
   调性到位, 开场用学员案例直接切入冲突..." 总评. 自检 prompt 没要求"先确认文章非空".

**为什么 D-082c with_retry 没救**:
- 旧代码 `with_retry(lambda: client.chat.completions.create(...))` 只包了 HTTP 请求,
  没包 text 提取. HTTP 200 (有 token 计数) 走完成功路径, content 解析在 retry 之外,
  空字符串静默吐给上游. with_retry 关键字嗅探 ("timeout"/"503"/...) 当然不命中.
- 自检环节又是另一个 LLM 调用, 各跑各的, DeepSeek 不知道 content 是空的就给打分了.

**决策**:
- **客户端层 (claude_opus / deepseek)**: 把 text 解析挪进 retry 包内, 显式判 "空 content
  + completion_tokens > 0" → 抛新 sentinel 类 `TransientLLMError`. with_retry 优先用
  isinstance 判 transient (比关键字嗅探更显式可靠), 重试 1 次. 持续空才向上 raise.
- **业务层兜底 (wechat_pipeline.write_article)**: 客户端层重试都失败的极端 case, content
  空就直接 raise RuntimeError, 不进自检. 让 task 状态 = failed 给 UI 明确错误, 而不是
  让 DeepSeek 在空字符串上 hallucinate 通过.
- 顺手修 deepseek 在 content=None 时 `.strip()` 直接 AttributeError 的隐 bug.

**为什么不只在客户端层做**:
- 客户端层重试 1 次, 已挡住 80%+ 偶发. 但持续故障 (Opus 模型连续两次都没出 text block,
  或上游有结构性问题) 仍可能空. 业务层兜底 + 不让自检在空文上跑 = 双保险, 更重要的是
  防住 "假 107/120 通过" 这种 worst-of-both-worlds 数据进 task DB.

**为什么不在自检 prompt 里加"先判文章是否为空"**:
- 不可靠 — DeepSeek 已多次证明会 hallucinate. 治本是不让它看到空文章, 不是求它别瞎说.

**测试** (`tests/test_llm_empty_content.py`, 8 项):
- claude_opus 空+token>0 重试成功 / 持续空抛 ClaudeOpusError 含 token 数 /
  空+token=0 不重试返空 (合法 0-output) / content=None 不 AttributeError /
  正常路径不重试.
- deepseek: 同上两个核心 case.
- wechat_pipeline.write_article 空 content → 抛 RuntimeError 含 token 数 +
  断言 self-check ai 没被调用 (回归: 防 hallucinate 重新长出来).

**影响范围**: 所有走 `shortvideo.ai.get_ai_client` 的功能 (公众号 / 投流 / 录音改写 /
热点改写 / 内容策划 / 即梦 prompt / 数字人脚本 ...). 任何空 content 现在都会先重试 1
次, 还空就向上抛清楚的错误, 而不是静默吐空内容让上层伪成功.

**Follow-up**:
- 监控接 retry stats: `shortvideo.llm_retry.get_retry_stats()` 已有计数 (T9). 看 7 天
  内空 content 触发率, 若 > 1% 考虑把 max_retries 加到 2.
- 若 OpenClaw / Opus 修复了 thinking 不出 text 的 bug, 这层防御无害保留.


