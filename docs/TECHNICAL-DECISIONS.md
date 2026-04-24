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
