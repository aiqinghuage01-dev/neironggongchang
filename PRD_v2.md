# 内容工厂 · 完整版 PRD

> **版本**: v2.0(完整版,对齐 Claude Design factory-v3 最终敲定方案)
> **日期**: 2026-04-24
> **作者**: Claude(基于 Hermes v1.0 + Claude Design factory-v3 三轮迭代 + 清华哥"自己每天丝滑用"原则)
> **状态**: 待清华哥最终 review → 分阶段实现
> **交付方式**: 本地 Web 应用,仅清华哥一人使用
>
> **归档**:
> - [`docs/PRD_v1_hermes.md`](docs/PRD_v1_hermes.md) — Hermes v1.0 原始 PRD(理想大而全版)
> - [`docs/design_v3/`](docs/design_v3/) — factory-v3 设计原型全部源文件(HTML + 6 个 jsx)

---

## 目录

1. [产品定位与目标](#1-产品定位与目标)
2. [核心设计原则](#2-核心设计原则)
3. [信息架构(9 个页面)](#3-信息架构9-个页面)
4. [小华 · AI 人格规范](#4-小华ai-人格规范)
5. [页面详细设计](#5-页面详细设计)
   - 5.1 首页(问候 A · 每日入口)
   - 5.2 做视频 6 步流
   - 5.3 投流文案入口
   - 5.4 公众号入口
   - 5.5 朋友圈入口
   - 5.6 素材库
   - 5.7 作品库(含数据回收)
   - 5.8 知识库(对接 Obsidian)
   - 5.9 设置
6. [数据模型](#6-数据模型)
7. [后端 API 清单](#7-后端-api-清单)
8. [技术架构](#8-技术架构)
9. [开发阶段计划](#9-开发阶段计划)
10. [已有能力对账](#10-已有能力对账)
11. [待清华哥确认](#11-待清华哥确认)
12. [附录](#12-附录)

---

## 1. 产品定位与目标

### 1.1 一句话

> **打开一个网页,做清华哥全部内容生产** —— 粘链接/写文案 → 小华出视频 → 一键发多平台。打开工厂,今天要拍什么一眼看见。

### 1.2 用户

**仅清华哥本人**,MacBook 本地使用(`localhost:8001`)。不考虑多用户、不考虑部署、不考虑学员版。

### 1.3 核心问题 → 目标状态

| 现状痛点 | 目标状态 |
|---|---|
| 内容生产散落在 10+ 个工具(飞书、Hermes、石榴、剪映、各平台后台、obsidian…) | 打开一个网页,所有操作在一个界面完成 |
| 每次生产内容手动在工具间跳转、复制粘贴 | 内容按步骤自动流转,点一下进下一步 |
| 知识库、素材、选题、作品散落在文件系统各处 | 统一管理、可搜索、一键调用 |
| Obsidian 知识库(8 顶层分区 · 07 Wiki 下 9 个二级分类)写文案时难以快速调用 | 写文案时小华自动从知识库取相关素材注入 |
| 32 个 AI 技能要记住"什么场景用哪个" | 技能隐身,用户看到的永远是业务动作(做视频/改写/变朋友圈) |

### 1.4 成功标准

- **每天都打开**(不打开 = 没做好)
- **做视频全链路 < 5 分钟**(从粘链接到视频下载发布)
- **拍视频时开着工厂当背景**,学员看到觉得"这工具真棒"(但不教学员用,学员版是下个产品)
- 投流/公众号/朋友圈**都能在这里做完**,不用再去 Hermes / 飞书 / obsidian 来回切
- **知识库复用率** ≥ 80%:80% 的文案生成时小华都能从 Obsidian 知识库里取到相关素材

---

## 2. 核心设计原则

### 2.1 一页一事(来自 design-c)

每个页面只干一件事。顶栏 + 中间一个主动作区 + 底部对话栏。不堆三列式、不堆多 widget。

### 2.2 技能隐身,动作外露(来自 Hermes v1 PRD 4.1.1,保留)

用户看到的永远是业务动作(做视频 / 写投流文案 / 变朋友圈 / 写公众号长文),**永远不见** skill 名。32 个 skill 作为底层引擎驱动 UI 上的动作按钮,用户无需知道它们的存在。

### 2.3 知识库自动注入

文案生成时,系统自动从 Obsidian 知识库匹配 3-5 条最相关条目,注入 AI prompt。用户可手动增减。

### 2.4 一料多做(内容杠杆)

一条素材(扒到的文案/录音/热点)可衍生多条内容形态:
- 短视频口播(主)
- 朋友圈金句(从文案提炼)
- 公众号长文(基于文案扩展)
- 投流文案(基于文案换角度)

### 2.5 视觉语言(暖米底 · 延续 design-c)

- 主背景:`#f7f5f0`(暖米)
- 主色:`#2a6f4a`(青绿)
- 不用深色主题(学员看到不要觉得"这是技术系统")
- 大留白、大标题、一页一事

---

## 3. 信息架构(9 个页面)

### 3.1 侧栏结构(窄条 60px · hover 展开 164px)

```
🏭 清华哥工厂
─────────────
🏠 首页

─────────────  · 4 大生产入口(工厂内主要产出)
🎬 做视频
💰 投流文案
📄 公众号
📱 朋友圈

─────────────  · 3 大资产库(生产的原料 · 产出 · 弹药)
📥 素材库
🗂️ 作品库
📚 知识库

─────────────  · 系统
⚙️ 设置(底部)
```

### 3.2 页面清单

| # | 页面 | 层级 | 优先级 | v3 源文件 |
|---|---|---|---|---|
| 1 | 🏠 首页(问候型 A) | 1 层 | P0 | factory3-home.jsx · V3HomeGreet |
| 2 | 🎬 做视频 6 步流 | 2 层直达 | P0 | factory3-flow.jsx · V3Flow |
| 3 | 💰 投流文案完整链路 | 2 层中转 + 子流 | P1 | factory3-pages.jsx · V3GenericEntry(AD_CFG) |
| 4 | 📄 公众号完整链路 | 2 层中转 + 子流 | P1 | V3GenericEntry(WECHAT_CFG) |
| 5 | 📱 朋友圈完整链路 | 2 层中转 + 子流 | P1 | V3GenericEntry(MOMENTS_CFG) |
| 6 | 📥 素材库(4 Tab) | 2 层 | P0 | V3Materials |
| 7 | 🗂️ 作品库(网格 + 数据) | 2 层 | P0 | V3Works |
| 8 | 📚 知识库(对接 Obsidian) | 2 层 | P1 | V3Knowledge |
| 9 | ⚙️ 设置 | 2 层 | P2 | V3Settings |

### 3.3 通用 UI 组件(`factory-tokens.jsx`)

- `<Btn variant="primary|default|ghost|outline|soft|danger" size="sm|md|lg">`
- `<Tag color="gray|green|amber|blue|pink|purple|red" size="xs|sm">`
- `<Card>`
- `<PlatformIcon platform="douyin|xiaohongshu|shipinhao|wechat|kuaishou|feishu">`
- **底部浮动**:`<LiDock context="当前页名">` — 每个页面右下角浮动"跟小华说一句"按钮,点开是迷你聊天面板

---

## 4. 小华 · AI 人格规范

### 4.1 定位

**小华** = 清华哥的内容生产副驾。不是助手,不是客服,是每天并肩干活的那个人。

### 4.2 人格基准

| 维度 | 规范 |
|---|---|
| 称呼清华哥 | "老板" (不叫"用户" / "您") |
| 自称 | "小华" |
| 口吻 | 身边年轻小伙伴,不是机器人。"先给我点东西开始 👇"、"挑个风格,小华帮你改" |
| 情绪 | 主动、利落、不唯唯诺诺。错了敢说"扒不到",不敷衍 |
| 推荐 | 每一步都主动给一句提示 + 3 个快捷 chip(不强推,但预测下一步) |

### 4.3 在各页面的行为

| 页面 | 小华说什么 | 快捷 chip |
|---|---|---|
| 首页 | (不打扰,只是个浮动按钮) | — |
| 做视频 - 素材 | "老板好呀 👋 今天想做条什么视频?" | 🔗 试试粘个链接 / 📝 我直接写文案 / 🎁 从素材库选 |
| 做视频 - 文案 | "文案风格挑好了吗?要不要再随意一点?" | 再随意一点 / 加促销钩子 / 缩短到 20 秒 |
| 做视频 - 声音 | "声音用上次那个就挺自然的" | 🎚 语速慢一点 / 😊 加点笑意 / 🔁 重新录 |
| 做视频 - 形象 | "建议用你本人的形象,老客户认脸" | 用本人 / 试试专业教练 / 什么是数字人? |
| 做视频 - 剪辑 | "挑个剪辑风格,我按这个出片" | 口播大字幕 / 快节奏 / 不露脸版 |
| 做视频 - 发布 | "看看发哪里?我已经按每个平台的调调改好标题了" | 全都发 / 就发抖音 / 我自己贴 |
| 投流文案 | "说说这次要推的是啥?一句话说清卖点" | 抖音信息流 · 竖版 / 视频号短文案 / 微信朋友圈广告 |
| 公众号 | "今天想写什么选题?小华会拉知识库的 28 条方法论" | 方法论长文 / 案例拆解 / 观点输出 / 行业观察 |
| 朋友圈 | "从金句库出发,衍生 3-5 条 · 配图一键复制" | 老板心法 / 干货输出 / 学员动态 / 今日一句 |
| 其他页 | "老板在看『XX』,需要帮忙吗?" | (自由输入) |

### 4.4 技术实现

- **MVP**:DeepSeek API,按场景定制 system prompt
- **Phase 2**:接本地 Claude Opus 代理(`localhost:3456`),上下文更强,支持多轮对话
- **Phase 3**:记忆持久化——小华记住清华哥偏好(如常用风格、常选平台、避讳词)

---

## 5. 页面详细设计

### 5.1 🏠 首页(问候 A · 每日入口)

**目的**:清华哥每天早上打开第一眼看什么。

**布局**:

```
[日期] 4 月 24 日 · 周五

早上好,清华哥 👋

今天想做点什么?从下面挑一个开始就行。

┌────────────────┐ ┌────────────────┐
│ 🎬  做条短视频  │ │ 💰  写投流文案  │
│ 链接→文案→视频    │ │ 一个卖点 · 5 版  │
│ 最近 3 条进行中  │ │ 昨天新出 12 条    │
└────────────────┘ └────────────────┘
┌────────────────┐ ┌────────────────┐
│ 📄  写公众号    │ │ 📱  发朋友圈    │
│ 方法论长文       │ │ 金句库 3 条      │
│ 本周还没发过     │ │ 昨天发了 2 条    │
└────────────────┘ └────────────────┘

─────────────────────────────────────────
🔥98  [抖音][✨匹配你定位]  · 今日最热
AI 客服集体下岗?一线从业者发声
和你「AI × 中年老板」人设很搭     [做成视频→]
─────────────────────────────────────────
```

**交互**:
- 4 方块:点击跳对应入口,四个方块同等大小(不强引导某一个)
- 热点条:点"做成视频 →"直接跳到做视频流 Step 1,输入框已填好热点标题
- 每个方块右下角显示动态统计("最近 3 条进行中" / "昨天发了 2 条")——数据来源:`/api/works` + `/api/publications`

**动态统计数据来源**:

| 统计 | 来源 |
|---|---|
| 做视频:最近 N 条进行中 | `/api/works` 筛选 status in ('generating','ready') |
| 投流:昨天新出 N 条 | `/api/copywritings` 筛选 type=ad AND date=昨天 |
| 公众号:本周发了 N 条 | `/api/publications` 筛选 platform=wechat_article AND 本周 |
| 朋友圈:昨天发了 N 条 | `/api/publications` 筛选 platform=moments AND date=昨天 |

**热点数据**:MVP 阶段手动维护(飞书多维表,通过 lark-cli 同步到本地 SQLite);Phase 2 接 tavily-search + 爬虫。

---

### 5.2 🎬 做视频 6 步流(P0 核心链路)

**入口**:首页 4 方块之一 / 侧栏 / 首页热点"做成视频→"

**6 步**:素材 → 文案 → 声音 → 形象 → 剪辑 → 发布

**顶栏**(整合进度条):

```
✦ 小华 · 全流程口播   ①素材—②文案—③声音—④形象—⑤剪辑—⑥发布   · 草稿已保存  📥素材库  🗂️作品库
```

每步圆圈编号:未做(灰底) → 做中(黑底白字) → 做完(绿勾)。可点击跳步。

**底部横向对话栏**(替代老 C2 的 dock):

```
[华]  [当前步提示语]  [chip1 · chip2 · chip3]   …   [想改哪里跟小华说…_____] ➤
```

#### Step 1 · 素材

- 大输入框(600px 宽),自动识别链接/文案
- 链接路径:正则 `/(https?:\/\/[^\s)\]】]+)/i` 提取 URL(抖音/小红书/B 站/快手分享文都吃)→ 调轻抖 → 出原文案
- 文案路径:直接跳 Step 2
- 下方 2 个示例卡片:🔗 链接模式 · 📝 文案模式

**产物**:原文案文本(扒到的 or 粘的)+ 可选:来源链接 / 标题 / 作者 / 时长

**现有后端复用**:
- `POST /api/transcribe/submit` + `GET /api/transcribe/query/{batch_id}`
- 扒成功自动写入 `/api/materials`(素材库)

#### Step 2 · 文案

- 左:原文案(扒到的 or 粘的),只读
- 右:改写后(可编辑的 textarea)
- 上方:3 个风格卡片(轻松口语 / 专业讲解 / 故事叙事)
- 下方快捷 chip:再随意一点 / 加促销钩子 / 缩短到 20 秒 / 强调免费
- **知识库注入**(新增):右边抽屉可展开,显示从 Obsidian 知识库自动匹配的 3-5 条相关条目,用户可勾选注入 prompt

**产物**:定稿文案文本 + 字数 + 预估口播秒数

**现有后端复用**:
- `POST /api/rewrite` (style: casual/pro/story)
- **新增**:`POST /api/kb/match` — 输入文本,返回 Top N 相关 Obsidian 知识库条目
- **新增**:`POST /api/rewrite` 支持 `knowledge_items` 参数

#### Step 3 · 声音

- 单选列表(radio):
  - 清华哥 · 上次的声音(默认选中,标记"推荐")
  - 清华哥 · 专业版
  - 重新录一个(点击弹录音组件 + 文件上传)
- 每项右侧有"▶ 试听"按钮(播放 speaker demo)

**产物**:speaker_id

**现有后端复用**:
- `GET /api/speakers` — 石榴已有 speaker 列表
- `POST /api/voice/upload` + `POST /api/voice/clone` — CosyVoice 本地克隆

#### Step 4 · 形象

- 3 卡片:清华哥本人(推荐) / 专业教练 / 邻家姐姐
- 每卡片 3:4 占位图 + 名字 + 描述

**产物**:avatar_id

**现有后端复用**:`GET /api/avatars`

#### Step 5 · 剪辑

- 4 卡片模板:口播大字幕(最常用) / 口播+空镜 / 快节奏切镜 / 纯字幕
- 每卡片 9:16 占位 + 名字 + 说明
- 下方 amber 色提示条:"⏳ 合成大约需要 90 秒 · 你先想想发哪儿"
- 点"开始合成" → 调石榴视频合成 → 跳到 P5.5 等待页

**产物**:template_id + video_id + work_id(合成任务)

**现有后端复用**:
- `GET /api/templates` — 5 个模板
- `POST /api/video/submit` — 创建石榴任务 + 写入 works 表
- `GET /api/video/query/{video_id}` — 轮询进度

#### Step 6 · 发布

- 左侧:视频预览(真视频 or 合成中占位)
- 右侧平台选择(勾选):抖音(推荐)/ 视频号(推荐)/ 小红书 / 快手,每个显示自己的账号名 + 粉丝数
- **4 张 GPT-Image-2 封面**(`/api/cover` 并发 4 张,已有)
- 发布按钮:"一键发布 🚀"

**MVP 阶段**:调 `/api/publish`(模拟态,只落库),真发你自己点;顶部提示"标题已按各平台调调改好,复制粘贴即用"

**Phase 3 阶段**:接浏览器自动化(打开各平台发布页 + 自动填标题/标签/封面,你只需确认"发布")

**现有后端复用**:`/api/cover` + `/api/publish`

---

### 5.3 💰 投流文案入口(完整链路)

**目的**:一个卖点 → 批量出 5 版 → 挑最佳 → 配图/视频 → 投放。

**入口页**(P1 层):顶栏进度条 + 大输入框 + 4 chip 快速开始。

```
今天要推的是啥?
[例:私域课程 · 针对中年老板 · 主打「一个人也能做起来」...]
[开始→]

[抖音信息流·竖版] [视频号短文案] [微信朋友圈广告] [小红书笔记体]
```

**子流程**(5 步):

| 步 | 名字 | 做什么 |
|---|---|---|
| 1 | 卖点 | 用户输入核心卖点 / 产品 / 目标人群 |
| 2 | 批量出 5 版 | 调 DeepSeek + touliu-agent skill prompt → 生成 5 版不同角度的文案 |
| 3 | 挑最佳 | 每版卡片展示 + 小华给每版一段"为什么好/不好"的点评 + 手动勾选 |
| 4 | 配图/视频(可选) | 从素材库挑图 / 调 GPT-Image-2 生成 / 跳过 |
| 5 | 投放 | 按平台导出(抖音投放后台标准格式) + 手动贴去平台 |

**后端需要新增**:
- `POST /api/ad/generate` — 输入卖点 + 平台,输出 5 版文案 + 点评
- `GET /api/ad/drafts` / `POST /api/ad/save` — 草稿管理

**skill 映射**:触发底层调用 `touliu-agent` / `strong-marketing-ad-copy`

---

### 5.4 📄 公众号入口(完整链路)

**目的**:一个观点/灵感 → 2000+ 字方法论长文 → 排版 → 发布。

**入口页**:

```
今天想写什么选题?
[例:为什么 2026 年做内容必须懂私域 · 或者直接贴一段灵感...]
[开始→]

[方法论长文] [案例拆解] [观点输出] [行业观察]
```

**子流程**(5 步):

| 步 | 名字 | 做什么 |
|---|---|---|
| 1 | 选题 | 用户输入观点 / 话题 / 灵感片段 |
| 2 | 大纲 | AI 生成 3-5 段大纲,用户微调 |
| 3 | 长文 | 流式生成 2000+ 字;**自动从 Obsidian 知识库注入**方法论/案例/金句 |
| 4 | 排版 | Markdown 预览 + 封面自动生成(apimart) + 二级标题高亮 |
| 5 | 发布 | 直接调公众号 API 发布(现有 `公众号文章` skill 已有完整流程);OR 一键复制到公众号后台 |

**后端需要新增**:
- `POST /api/article/outline` — 输入选题,输出大纲
- `POST /api/article/expand` — 输入大纲 + 知识库条目,流式输出长文
- `POST /api/article/publish/wechat` — 调用 `公众号文章` skill 发布

**skill 映射**:触发底层调用 `公众号文章` skill

---

### 5.5 📱 朋友圈入口(完整链路)

**目的**:从金句库 → 衍生 3-5 条 → 配图 → 一键复制。

**入口页**:

```
发一组朋友圈吧
[例:今天想发「老板心法 · 私域复购」相关 · 或直接贴一句话...]
[开始→]

[老板心法] [干货输出] [学员动态] [今日一句]
```

**子流程**(4 步):

| 步 | 名字 | 做什么 |
|---|---|---|
| 1 | 选题 | 用户输入话题 / 一句灵感 |
| 2 | 衍生 3-5 条 | 从 Obsidian 知识库「金句话术」+「朋友圈原文金句」+「风格参考」抽取匹配条,AI 改写成今日风格 |
| 3 | 配图 | 每条可选:GPT-Image-2 生成 / 从素材库挑 / 跳过 |
| 4 | 一键复制 | 每条独立"复制到剪贴板"按钮,文案+图片一起 |

**后端需要新增**:
- `POST /api/moments/derive` — 输入话题,返回 3-5 条朋友圈文案
- 复用 `/api/cover` 做配图

**skill 映射**:触发底层调用 `朋友圈金句知识库` + Claude Opus 改写

---

### 5.6 📥 素材库

**目的**:所有内容生产的原料——热点 / 选题 / 爆款参考 / 空镜录音——一处存放。

**4 个 Tab**:

| Tab | 内容 | 数据源 |
|---|---|---|
| 🔥 热点 | 已采集热点(标题 + 热度 + 来源 + 是否匹配定位) | MVP:飞书多维表手动维护 → lark-cli 同步。Phase 2:tavily-search + 爬虫 |
| 💡 选题 | 未使用的选题(含批量选题助手生成的) | 手动添加 + `piliang-xuanti-zhushou` skill 调用 |
| ⭐ 爆款参考 | 扒过的同行爆款(轻抖扒的文案 + 数据指标) | `/api/materials`(已有) |
| 🎥 空镜/录音 | 本地素材库(视频片段 / 录音 / 截图) | 本地文件夹扫描 + 手动上传 |

**每条记录**:
- 标题(加粗)
- 标签(tag)
- 核心数据(热度/播放量/字数)
- 是否匹配清华哥定位(绿色 Tag)
- 右侧:"做成视频 →" / "变朋友圈" / "写长文" / "复制文案"

**交互**:
- 点条目 → 弹出详情抽屉
- 点动作按钮 → 跳对应生产入口,带入素材

**后端需要新增**:
- `GET /api/materials?tab=hot|topic|viral|clip` — 按 Tab 筛选
- `POST /api/materials` (已有,扩展字段:tab / heat_score / metrics / match_persona)
- `DELETE /api/materials/{id}` (已有)
- `POST /api/materials/import/feishu` — 从飞书多维表拉取热点

---

### 5.7 🗂️ 作品库(含数据回收)

**目的**:所有已发内容的统一管理 + 数据回收 + 效果分析。

**视图**:

- **默认**:网格(4 列),9:16 缩略图 + 标题 + 日期 + 平台徽章 + 播放量
- **切换**:列表视图(表格式,便于按数据排序)

**每张卡片**:
```
┌──────────────┐
│ [9:16 缩略]   │
│               │
│ @清华哥聊私域  │
│ ▶ 15.2k       │
├──────────────┤
│ 私域七段实操    │
│ 第 3 段 · 社群  │
│ 4 月 21 · 抖音 │
│ + 视频号       │
└──────────────┘
```

**详情抽屉**:
- 完整视频播放
- 文案原文 + 发布各平台标题差异
- 数据指标:播放量 / 点赞 / 评论 / 分享 / 收藏 / 涨粉 / 完播率
- "再做一条类似的"按钮(一键复制成新卡片)
- "下载 MP4"

**数据采集**:
- **MVP**:手动输入(打开作品详情,输入各平台数据)
- **Phase 3**:公众号 API(现成) + 抖音/小红书/视频号爬取

**筛选/搜索**:
- 按时间 / 平台 / 效果排序
- 按标签筛选
- 全文搜索(标题 + 文案)

**后端需要新增**:
- `GET /api/works` (已有)
- `POST /api/works/{id}/metrics` — 录入数据指标(新增)
- `GET /api/works/analytics` — 统计:TOP 10 / 月度趋势 / 各平台对比(新增)

---

### 5.8 📚 知识库(对接 Obsidian)

**核心**:清华哥的真实知识库在 `~/Desktop/清华哥知识库/`(Obsidian vault)。工厂不新建知识库,**直接读这个目录**,并在生产时自动取用。

**Obsidian vault 实际结构**(已探查):

```
~/Desktop/清华哥知识库/
├── 00 🤖 AI清华哥         ← 清华哥人设 / AI 用画像
├── 01 🧠 底层资产          ← 品牌/定位/价值观
├── 02 📋 业务场景          ← S1-S11 分场景(战略/短视频/直播/私域/钩子转化/投流/公开课/正式课/线下课/学员案例/内容分发)
├── 03 💡 灵感系统          ← Daily / 灵感箱(日常原始输入)
├── 04 📦 飞书档案馆        ← 飞书同步进来的原料
├── 05 🔧 系统文件          ← Obsidian 模板 / 插件配置
├── 06 📎 参考库            ← 外部参考资料
├── 07 📚 知识Wiki         ← 核心知识产出(由 04 档案馆经 kb-compiler 编译而来)
│   ├── 方法论 (8 条)
│   ├── 行业洞察 (11 条)
│   ├── 直播体系 (6 条)
│   ├── 产品与转化 (5 条)
│   ├── 私域运营 (4 条)
│   ├── 运营数据 (2 条)
│   ├── 团队知识 (1 条)
│   ├── 投流 (0 条 · 待补)
│   └── 竞品拆解 (0 条 · 待补)
└── (根目录散落的 canvas / pdf / 个人画像 md)
```

**工厂的知识库页面设计**:

**左侧**:树状分区(默认展开到二级):
```
▼ 00 🤖 AI清华哥
▼ 01 🧠 底层资产
▼ 02 📋 业务场景
    · S1 战略与规划
    · S2 短视频
    · ...
▼ 03 💡 灵感系统
▼ 04 📦 飞书档案馆
▼ 07 📚 知识Wiki         ← 核心
    · 方法论 (8)
    · 行业洞察 (11)
    · ...
```

**右侧**:
- 点分区 → 卡片网格(每条一个卡,显示标题 / 摘要 / 字数 / 被引用次数)
- 点条目 → Markdown 全文渲染(只读)
- 顶部搜索框:全文检索

**核心能力 · 知识注入**:

当在做视频 Step 2(文案) / 投流 / 公众号 / 朋友圈 任一页面点"生成"时,后端执行:

```
1. 抽取用户当前输入的核心主题
2. embedding 化 or 关键词匹配 Obsidian 所有 .md 文件
3. 返回 Top 3-5 条最相关
4. 在 UI 侧边显示"本次将注入的知识库条目"(可勾选)
5. 把选中条目内容 concat 进 AI prompt
```

**技术实现**:

- **MVP**:关键词匹配(BM25 / TF-IDF,`rank_bm25` 库) — 简单够用
- **Phase 2**:embedding + FAISS 向量检索 — 语义更准
- **文件监听**:用 `watchdog` 监听 Obsidian vault 变更,增量重建索引

**后端需要新增**:
- `GET /api/kb/tree` — 返回目录树
- `GET /api/kb/doc?path=...` — 返回单篇 Markdown 内容
- `POST /api/kb/match` — 输入文本,返回 Top N 匹配条目
- `POST /api/kb/reindex` — 手动重建索引(添加 / 编辑后)
- (不提供写接口 — 编辑去 Obsidian)

**重要**:编辑 / 新增 / 删除 **都去 Obsidian**,工厂只读。避免 fork 两份知识库。

---

### 5.9 ⚙️ 设置

**5 个配置块**(每块点进去是子页):

| 块 | 内容 |
|---|---|
| 🔗 平台账号 | 抖音 / 视频号 / 小红书 / 公众号 登录状态 + 账号信息(已绑几个) |
| 🎙️ 我的声音 | 已保存的 speaker 列表(石榴 + CosyVoice),可试听、删除、添加 |
| 👤 数字人形象 | 已有 avatar 列表,可预览 |
| 🤖 小华偏好 | 默认语气、主动性(低/中/高)、默认改写风格、避讳词黑名单 |
| 🎨 品牌字体/配色 | 封面/海报自动套用的字体、主色(当前默认青绿) |

**Phase 2 实装**,MVP 只给壳子 + 占位。

---

## 6. 数据模型

### 6.1 SQLite 表结构

```sql
-- 已有(保留)
CREATE TABLE works (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at INTEGER NOT NULL,
  title TEXT,
  source_url TEXT,
  original_text TEXT,
  final_text TEXT NOT NULL,
  avatar_id INTEGER, speaker_id INTEGER,
  shiliu_video_id INTEGER,
  local_path TEXT, duration_sec REAL,
  status TEXT NOT NULL,    -- pending/generating/ready/failed/published
  error TEXT, tokens_used INTEGER DEFAULT 0
);

CREATE TABLE materials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at INTEGER NOT NULL,
  url TEXT, title TEXT, author TEXT,
  duration_sec REAL,
  original_text TEXT NOT NULL,
  source TEXT              -- qingdou/manual/feishu
);

-- 新增
CREATE TABLE hot_topics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at INTEGER NOT NULL,
  platform TEXT,           -- douyin/xiaohongshu/weibo/...
  title TEXT NOT NULL,
  heat_score INTEGER,      -- 0-100
  match_persona BOOLEAN,   -- 是否匹配清华哥定位
  match_reason TEXT,       -- 为什么匹配
  source_url TEXT,
  fetched_from TEXT,       -- tavily/feishu/manual
  status TEXT              -- unused/in_use/used/expired
);

CREATE TABLE topics (        -- 选题库
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  tags TEXT,               -- JSON array
  heat_score INTEGER,
  source TEXT,             -- manual/piliang-xuanti
  status TEXT              -- unused/in_use/used
);

CREATE TABLE copywritings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at INTEGER NOT NULL,
  type TEXT NOT NULL,      -- short_video/ad/article/moments/rewrite
  material_id INTEGER,     -- REFERENCES materials(id)
  work_id INTEGER,         -- REFERENCES works(id)
  template TEXT,           -- skill name
  prompt_config TEXT,      -- JSON
  knowledge_items TEXT,    -- JSON array of Obsidian paths
  draft_versions TEXT,     -- JSON array
  final_content TEXT,
  quality_score INTEGER,
  word_count INTEGER,
  estimated_duration INTEGER,
  status TEXT              -- generating/draft/reviewing/finalized
);

CREATE TABLE publications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at INTEGER NOT NULL,
  work_id INTEGER NOT NULL,      -- REFERENCES works(id)
  platform TEXT NOT NULL,        -- douyin/shipinhao/xiaohongshu/kuaishou/wechat_article/moments
  platform_post_id TEXT,
  platform_url TEXT,
  title TEXT,
  cover_path TEXT,
  hashtags TEXT,                  -- JSON array
  scheduled_at INTEGER,
  published_at INTEGER,
  status TEXT,                    -- draft/scheduled/publishing/published/failed
  error_message TEXT
);

CREATE TABLE metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  publication_id INTEGER NOT NULL,  -- REFERENCES publications(id)
  recorded_at INTEGER NOT NULL,
  views INTEGER, likes INTEGER, comments INTEGER,
  shares INTEGER, saves INTEGER,
  followers_gained INTEGER, conversions INTEGER,
  completion_rate REAL,
  source TEXT                      -- manual/api/scraper
);

CREATE TABLE kb_index (            -- Obsidian 索引缓存
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  path TEXT UNIQUE NOT NULL,       -- ~/Desktop/清华哥知识库/... 的相对路径
  section TEXT,                    -- 00/01/.../07 一级分区
  subsection TEXT,                 -- 07 下的 方法论/行业洞察 等
  title TEXT, summary TEXT,
  word_count INTEGER,
  mtime INTEGER,                   -- 文件修改时间(用于增量更新)
  content TEXT,                    -- 全文(用于 BM25 检索)
  indexed_at INTEGER
);
```

### 6.2 关系图

```
materials ──┐
            ├──> copywritings ──> works ──> publications ──> metrics
topics ─────┤                       │
hot_topics ─┘                       ↓
                              (4 封面 covers 独立表 or JSON 列)

kb_index (独立,只读索引 Obsidian vault)
```

---

## 7. 后端 API 清单

### 7.1 已有(复用,共 15 个)

```
健康 & 静态
  GET  /api/health
  GET  /media/*

做视频链路
  POST /api/transcribe/submit
  GET  /api/transcribe/query/{batch_id}
  POST /api/rewrite
  GET  /api/speakers
  POST /api/voice/upload
  POST /api/voice/clone
  GET  /api/avatars
  GET  /api/templates
  POST /api/video/submit
  GET  /api/video/query/{video_id}
  POST /api/cover
  GET  /api/cover/query/{task_id}
  POST /api/publish

作品/素材
  GET  /api/works
  DELETE /api/works/{id}
  GET  /api/materials
  POST /api/materials
  DELETE /api/materials/{id}
```

### 7.2 新增(分 Phase 推进)

**Phase 1**:
```
首页统计
  GET  /api/stats/home           — 4 方块动态统计

知识库
  GET  /api/kb/tree              — Obsidian 目录树
  GET  /api/kb/doc?path=...      — 单篇内容
  POST /api/kb/match             — 匹配 Top N
  POST /api/kb/reindex           — 手动重建索引

素材库扩展
  GET  /api/materials?tab=...
  GET  /api/hot-topics           — 热点
  POST /api/hot-topics           — 手动新增
  GET  /api/topics               — 选题
  POST /api/topics
```

**Phase 2**:
```
投流文案
  POST /api/ad/generate          — 5 版批量生成
  GET/POST /api/ad/drafts

公众号
  POST /api/article/outline
  POST /api/article/expand       — SSE 流式
  POST /api/article/publish/wechat

朋友圈
  POST /api/moments/derive       — 衍生 3-5 条

文案管理
  GET  /api/copywritings
  POST /api/copywritings
  PATCH /api/copywritings/{id}

数据录入
  POST /api/works/{id}/metrics
  GET  /api/works/analytics
  POST /api/publications
```

**Phase 3**:
```
发布自动化
  POST /api/publish/douyin
  POST /api/publish/shipinhao
  POST /api/publish/xiaohongshu
  POST /api/publish/moments

数据采集
  POST /api/metrics/scrape/{platform}

小华记忆
  GET/POST /api/li/memory
```

---

## 8. 技术架构

### 8.1 不换栈 — 延续现有

| 层 | 技术 | 现状 |
|---|---|---|
| 前端 | React 18 CDN + Babel standalone + JSX(无 build) | 已搭好,与 factory-v3 同构 |
| 样式 | inline style + `T` tokens | factory-tokens.jsx 已定 |
| 后端 | FastAPI + uvicorn :8000 | 已运行,15 个 endpoint |
| 数据库 | SQLite(works.db) | 已有 |
| 文件存储 | 本地(`data/videos/`, `data/covers/`, `data/audio/`) | 已有 |
| AI 引擎 | DeepSeek API(MVP) → Claude Opus 代理(Phase 2) | DeepSeek 已接 |
| 视频 | 石榴 API | 已接 |
| 声音克隆 | CosyVoice sidecar :8766 | 已搭 |
| 扒文案 | 轻抖 API | 已接 |
| 封面 | apimart GPT-Image-2 | 已接 |
| 知识库索引 | `rank_bm25`(Phase 1)→ embedding+FAISS(Phase 2) | 需新增 |
| 文件监听 | `watchdog` | 需新增 |

### 8.2 目录结构(重构后)

```
~/Desktop/neironggongchang/
├── PRD_v2.md                          ← 本文档
├── docs/
│   ├── PRD_v1_hermes.md               ← Hermes 原始 PRD
│   └── design_v3/                     ← factory-v3 原型源文件(存档)
├── .env / .env.example
├── .venv/                             ← Python venv
├── pyproject.toml / uv.lock / requirements.txt
├── backend/
│   ├── api.py                         ← FastAPI 主(扩展新增 endpoint)
│   ├── services/
│   │   ├── kb.py                      ← Obsidian 索引 + 匹配(新增)
│   │   ├── ad.py                      ← 投流文案逻辑(新增)
│   │   ├── article.py                 ← 公众号长文逻辑(新增)
│   │   └── moments.py                 ← 朋友圈衍生逻辑(新增)
│   └── tests/
├── shortvideo/                        ← 已有业务模块(保留)
│   ├── config.py / shiliu.py / deepseek.py / cosyvoice.py
│   ├── qingdou.py / apimart.py / tasks.py / works.py
│   └── extractor.py
├── web/                               ← 前端重构,按 v3
│   ├── index.html
│   ├── factory-tokens.jsx             ← 从 v3 移植
│   ├── factory-shell.jsx              ← V3Sidebar + LiDock
│   ├── factory-home.jsx               ← V3HomeGreet(A)
│   ├── factory-flow.jsx               ← 做视频 6 步流
│   ├── factory-ad.jsx                 ← 投流完整链路(新增)
│   ├── factory-article.jsx            ← 公众号完整链路(新增)
│   ├── factory-moments.jsx            ← 朋友圈完整链路(新增)
│   ├── factory-materials.jsx          ← 素材库 4 Tab
│   ├── factory-works.jsx              ← 作品库 + 数据
│   ├── factory-knowledge.jsx          ← 知识库(Obsidian)
│   ├── factory-settings.jsx           ← 设置
│   ├── factory-app.jsx                ← 顶级路由
│   └── _legacy/                       ← 旧 shared/app/pages-* 存档
├── scripts/
│   ├── start_all.sh                   ← 新增:一键启 3 端 + 开浏览器
│   ├── start_api.sh / start_web.sh / start_cosyvoice.sh
│   ├── setup.sh
│   ├── smoke_new_apis.py
│   └── e2e_web.py
└── data/
    ├── works.db
    ├── covers/ videos/ audio/
    └── kb_index/                      ← 新增:知识库 BM25 索引缓存
```

### 8.3 启动方式

**start_all.sh**(新增):一条命令起全部 + 开浏览器
```bash
#!/usr/bin/env bash
# 启动所有服务 + 打开浏览器
set -e
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# 清理已占用端口
for p in 8000 8001 8766; do
  lsof -ti:$p 2>/dev/null | xargs -r kill 2>/dev/null
done
sleep 1

# 启动 3 个服务(后台)
nohup bash scripts/start_api.sh > logs/api.log 2>&1 &
nohup bash scripts/start_web.sh > logs/web.log 2>&1 &
nohup bash scripts/start_cosyvoice.sh > logs/cosy.log 2>&1 &

# 等服务起来
sleep 3
open http://localhost:8001
```

---

## 9. 开发阶段计划

**总原则**:不是"MVP 砍一刀",而是"完整版分阶段"。每阶段交付一个可以每天用、功能完整的切面。

### Phase 1 · 骨架 + 做视频闭环(第 1-2 周)

**目标**:shell 结构起来,做视频全链路 v3 风格,其他页面至少有个 placeholder 不报错。

| 子任务 | 工作量 | 交付 |
|---|---|---|
| 重构前端目录到 factory-* 命名,移植 v3 tokens + shell + app 路由 | 1 天 | 侧栏 + 路由跑通 |
| 首页 A(问候 + 4 方块 + 1 热点) | 0.5 天 | 首页可点 |
| 做视频 6 步流 · v3 风格(整合顶栏 + 横向对话栏) | 3 天 | E2E 真链路跑通 |
| 素材库 Tab 骨架 + 爆款参考 Tab 接 `/api/materials` | 1 天 | 真数据展示 |
| 作品库网格 + 详情抽屉(无数据录入) | 1 天 | 已发视频可回看 |
| 知识库页骨架(只展示目录树 + 点击看 md) | 1 天 | Obsidian 可浏览 |
| 其他页占位(投流/公众号/朋友圈/设置)— 入口页即可,深入点击给"下个阶段" | 0.5 天 | 不空白 |
| `start_all.sh` + 本地一键启动 | 0.5 天 | 每天 1 行命令 |

**Phase 1 完成后**:每天能打开工厂做视频,是最高频动作的全部承接。

### Phase 2 · 知识库注入 + 3 个内容入口(第 3-4 周)

**目标**:投流/公众号/朋友圈都能在工厂做完,知识库深度融入文案生成。

| 子任务 | 工作量 | 交付 |
|---|---|---|
| 知识库 BM25 索引 + `/api/kb/match`(Python `rank_bm25`) | 1 天 | 关键词匹配跑通 |
| 知识库页增强:全文搜索 + 被引用次数 | 0.5 天 | 搜索可用 |
| 做视频 Step 2 增加"知识库注入"侧边抽屉 | 0.5 天 | 文案生成带知识 |
| 投流文案完整链路(5 步)+ 后端 `/api/ad/*` | 2 天 | 投流可做完整 |
| 公众号完整链路(5 步)+ `/api/article/*` + SSE 流式 | 3 天 | 长文可生产发布 |
| 朋友圈完整链路(4 步)+ `/api/moments/derive` | 1 天 | 朋友圈批量出 |
| 素材库扩展:热点 Tab(手动 + 飞书同步) | 1 天 | 热点能进工厂 |
| `piliang-xuanti-zhushou` skill 接入选题 Tab | 0.5 天 | 选题能批量生 |

**Phase 2 完成后**:Hermes/飞书上现在在做的 3 件事(投流/公众号/朋友圈)全部迁到工厂。

### Phase 3 · 数据回收 + 设置实装(第 5-6 周)

| 子任务 | 工作量 | 交付 |
|---|---|---|
| 作品库数据录入 UI + `POST /api/works/{id}/metrics` | 1 天 | 可记录效果 |
| 作品库效果排行 + 趋势图表 + TOP 10 | 1 天 | 数据看板 |
| 首页 4 方块统计接真数据 | 0.5 天 | 真统计 |
| 设置页实装:平台账号绑定/声音管理/形象管理/小华偏好 | 2 天 | 设置真可改 |
| 知识库升级:embedding + FAISS(可选) | 2 天 | 语义匹配 |

### Phase 4 · 自动化 & 智能化(看需求)

| 子任务 | 说明 |
|---|---|
| 发布浏览器自动化 | 抖音/小红书/视频号打开发布页 + 自动填字段 |
| 数据自动采集 | 公众号 API(已有)+ 其他平台爬取 |
| 热点 tavily + 多平台爬虫 | 自动刷新热点库 |
| 小华 Claude Opus 升级 | 多轮对话 + 记忆持久化 |
| 批量生产模式 | 选 5 个素材 → 批量出 5 条视频 |
| 智能推荐 | 基于历史效果推荐"今天做什么类型最可能爆" |

---

## 10. 已有能力对账

| 能力 | 状态 | 来源 |
|---|---|---|
| DeepSeek 文案改写(3 风格) | ✅ 已接 | `/api/rewrite` |
| 轻抖链接→文案 | ✅ 已接 | `/api/transcribe/*` |
| 石榴 speaker 列表 | ✅ 已接 | `/api/speakers` |
| CosyVoice 声音克隆 | ✅ 已接 | `:8766` sidecar |
| 石榴数字人形象列表 | ✅ 已接 | `/api/avatars` |
| 石榴视频合成 | ✅ 已接 | `/api/video/*` |
| apimart GPT-Image-2 封面 | ✅ 已接 | `/api/cover` |
| 发布(模拟态) | ✅ 已有 | `/api/publish` |
| 素材库 DB | ✅ 已有 | `/api/materials` |
| 作品库 DB | ✅ 已有 | `/api/works` |
| 32 skills | ✅ 已有(待接入) | `~/Desktop/skills/` |
| Obsidian 知识库 | ✅ 已有 | `~/Desktop/清华哥知识库/` |
| 飞书 lark-cli | ✅ 已装 | 用于热点同步 / 公众号发布 / 钉钉通知 |
| Claude Opus 代理 | ✅ 已部署 | `localhost:3456`(Phase 2 接入) |
| 热点采集 | 🔧 Phase 2 | tavily + 手动飞书 |
| 知识库索引 | 🔧 Phase 1 | `rank_bm25` 新装 |
| 数据采集(各平台) | 🔧 Phase 3 | 爬虫 |
| 浏览器自动化发布 | 🔧 Phase 3 | Playwright |

---

## 11. 待清华哥确认

| # | 项 | 判断 | 需你确认 |
|---|---|---|---|
| 1 | **知识库路径** | `~/Desktop/清华哥知识库/`(Obsidian)✅ 已确认 | ☑ |
| 2 | **完整版分阶段,不是 MVP** | Phase 1 骨架+做视频 → Phase 2 三入口+知识库 → Phase 3 数据+设置 → Phase 4 自动化 | ☐ |
| 3 | **首页只做 A(问候型)** | B/C 砍掉,不做切换 | ☐ |
| 4 | **项目名** | UI 顶栏"🏭 清华哥工厂"(v3 已定)· 技术栈叫"内容工厂" | ☐ |
| 5 | **小华人格** | 小华 · 身边年轻小伙伴口吻 · 每步主动提示 + 3 chip(见 4.2) | ☐ |
| 6 | **发布方式** | Phase 1-2:模拟态 + 一键复制 + 打开平台发布页;Phase 3:浏览器自动化 | ☐ |
| 7 | **数据录入** | Phase 3 手动录入各平台数据;Phase 4 爬虫自动采集 | ☐ |
| 8 | **侧栏主入口顺序** | 首页 · 做视频 · 投流 · 公众号 · 朋友圈 · 素材 · 作品 · 知识 · 设置 | ☐ |
| 9 | **启动方式** | `bash scripts/start_all.sh` 一条命令起 3 端 + 开浏览器 | ☐ |
| 10 | **设计师交付** | 打包 `PRD_v2.md` + `docs/design_v3/`(factory-v3 全 6 文件)发给他 | ☐ |

**你扫一遍,哪条想改说一声,都 OK 就开 Phase 1。**

---

## 12. 附录

### 附录 A:factory-v3 源文件清单(对接设计师)

```
docs/design_v3/
├── factory-v3.html                # 入口 HTML
├── factory-tokens.jsx             # 色板 + 通用组件
├── factory3-shell.jsx             # V3Sidebar + LiDock
├── factory3-home.jsx              # V3HomeSwitcher + V3HomeGreet/Todo/Hot
├── factory3-pages.jsx             # V3MakeVideo + V3GenericEntry + V3Materials/Works/Knowledge/Settings
├── factory3-flow.jsx              # V3Flow(做视频 6 步)
└── factory3-app.jsx               # FactoryAppV3(顶级路由)
```

### 附录 B:Obsidian vault 完整结构

`~/Desktop/清华哥知识库/`(8 个顶层分区):

| 分区 | 作用 | 文件量级 |
|---|---|---|
| 00 🤖 AI清华哥 | 给 AI 看的人设/画像/prompt 素材 | 中 |
| 01 🧠 底层资产 | 品牌/定位/价值观 | 中 |
| 02 📋 业务场景 | S1-S11 分场景(战略/短视频/直播/私域/钩子转化/投流/公开课/正式课/线下课/学员案例/内容分发) | 大 |
| 03 💡 灵感系统 | Daily + 灵感箱(原始输入) | 持续增长 |
| 04 📦 飞书档案馆 | 飞书同步进来的原始对话、会议纪要、文档 | 持续增长 |
| 05 🔧 系统文件 | Obsidian 模板 / 插件配置 | 小 |
| 06 📎 参考库 | 外部参考资料 | 小 |
| 07 📚 知识Wiki | **核心知识产出**(由 04 经 kb-compiler 编译而来,9 分类共 37+ 条) | 小而精 |

**注**:工厂做知识库注入时,**优先**用 07 Wiki(小而精、已提炼)+ 01 底层资产(品牌)+ 02 业务场景(分场景)。03/04 是原料,04 会被 kb-compiler 持续炼入 07。

### 附录 C:32 Skills 与动作按钮映射

| 动作按钮 | 调用 Skill | 出现在 |
|---|---|---|
| 改写(轻松/专业/故事) | DeepSeek `/api/rewrite` | 做视频 · Step 2 |
| 热点爆款改写 | 热点爆款文案 1/2/3 | Phase 2:做视频 · Step 2 增强模式 |
| 真诚风改写 | 热点文案真诚版 | 同上 |
| 转投流版 | touliu-agent / strong-marketing-ad-copy | 做视频后 / 投流入口 |
| 变朋友圈 | 朋友圈金句知识库 | 做视频后 / 朋友圈入口 |
| 写公众号长文 | 公众号文章 | 公众号入口 |
| 录音转文案 | 录音文案改写 | 素材库 · 空镜录音 Tab 上传后 |
| 采集小红书 | xiaohongshu-feishu-bitable-sync | 素材库 · 爆款参考 |
| 批量出选题 | piliang-xuanti-zhushou | 素材库 · 选题 Tab |
| 生成口播视频 | shiliu-digital-human | 做视频 · Step 5 |
| 发公众号 | 公众号文章(发布环节) | 公众号入口 · Step 5 |
| 知识库体检 | 黄金五环评审(学员版) | 知识库页 · Phase 3 |
| 网页搜索 | tavily-search | 首页热点 · Phase 2 |
| 内容总结 | summarize | 做视频 · 爆款参考导入后 |

### 附录 D:相比 Hermes v1 PRD 的增删

**保留**(v1 方向正确的核心):
- 技能隐身、动作外露(4.1.1)→ 全版本继承
- 知识库自动注入 → 强化为 Obsidian 真实对接
- 一料多做(一条素材衍生多条)→ 强化为 4 大入口互通

**修改**:
- 看板视图(8 列流水线)→ 改为"作品库网格 + 状态筛选"
- 4 大部门(素材/文案/视频/发布)→ 改为"4 入口 + 3 资产 + 设置"
- Next.js + Prisma + shadcn → 保留 React CDN 轻量栈

**砍掉**:
- 技能配置后台(32 skill 管理)
- 拖拽式卡片流转

**延后**(Phase 3/4):
- 发布浏览器自动化
- 数据自动采集
- 批量生产模式

**新增**:
- 小华人格规范(v1 未定义)
- Obsidian 完整对接(v1 只说"28 条知识库")
- factory-v3 视觉设计语言(暖米底 + 青绿 · 延续 design-c)
- 4 大入口各自完整链路(v1 只有视频 1 个链路)

---

*— 文档结束 · 待清华哥 review → 开工 Phase 1 —*
