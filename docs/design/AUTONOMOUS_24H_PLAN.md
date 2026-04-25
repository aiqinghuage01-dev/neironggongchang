# 24h 自动梳理工作清单

> 清华哥出门一天, 我自己拍板按这个清单跑.
> Cron 每 20min 一拍, 启动时间: 2026-04-25 ~16:30, 自删时间: 2026-04-26 ~16:30

## 拍板原则 (清华哥不在时)

### 视觉硬规
- brand 绿 `#2f7a52` + brandSoft `#e6f0eb` ring (5px 阴影常用)
- 大圆角: 卡 12, 输入框 16, 按钮 100 (pill)
- 主按钮 padding 10×24 fontSize 14 fontWeight 600
- 次按钮 padding 9×18 fontSize 13 ghost (#fff border)
- Tag 系统: 推荐=green / 已发=brand / 警告=amber / 平台=pink/blue
- 大卡 padding 16×20 + radio dot 22px / checkbox dot 18px
- 行间距 gap 10-14, 上下 section gap 20-24

### 文案硬规
- 删所有 "(D-XXX)" / "(跨页 state 已通)" / "(回来后摘金句段做视频)" 等研发自嗨
- 所有 hint 用人话, 不超过 1 行
- 标题 hero 用 "用什么 X 念? 🎙️" "今天最值得拍的 N 个 🔥" 这种亲切语气
- 默认勾选 / 默认推荐项明确标 [推荐] tag

### 交互硬规
- 默认勾选第 1 项 (声音/数字人/模板/角度/模式)
- 多选 checkbox 至少保留 1 个不能取消
- 多版输出用 versions[] + tab 切换 (D-062nn-C4 模式)
- 所有 empty 状态有 actionable CTA
- 错误走 humanizeError + 默认展开原始 msg
- skill 完成态都有 "做成视频" CTA + 反向 anchor (FromMakeBanner)

### 不做的事
- 不动 backend (除非加非破坏字段)
- 不删 page (除非确认死代码 grep 全 codebase 无引用)
- 不动 DB schema
- 不 push, 不发飞书, 不删 branch
- 不动 token / 凭据 / 隐私

## Phase 清单 (按优先级)

### Phase 1 — 做视频沿线 5 skill (P0 高频)

- **C5** PageVoicerewrite (录音改写) — Step 1 大对话框 + URL/文件双输入 + checkbox 模式 + 多版累积
  文件: web/factory-voicerewrite-v2.jsx
  借鉴: hotrewrite 的 C2-C4 模板

- **C6** PageTouliu (投流文案) — Step 1 卖点输入大对话框 + checkbox 模式 (业务/纯/混合)
  文件: web/factory-touliu-v2.jsx
  注意: 现有 [1,3,5,10] 选 N 条逻辑保留, 加 mode checkbox

- **C7** PageWechat (公众号长文) — Step 1-3 视觉重构 (选题/标题/大纲), 删开发文案
  文件: web/factory-wechat-v2.jsx
  范围: 只重构 Step 1-3, Step 4-8 暂不动

- **C8** PageMoments (朋友圈) — 4 步视觉一致化, MStepDeriving 列表大卡
  文件: web/factory-moments.jsx

- **C9** PagePlanner (内容策划) — 加 "从 plan 摘段做视频" 链路
  文件: web/factory-planner-v2.jsx

### Phase 2 — 做视频内部 5 步精细化

- **C10** Step 1 加 "上次的视频/草稿" 快速复用区
- **C11** Step 3 模板卡视觉 + 朴素卡升级
- **C12** Step 4 SceneRow 默认折叠 + 摘要展示
- **C13** Step 5 平台格式扩展 + 一键复制三平台

### Phase 3 — 档案部 视觉一致

- **C14** PageWorks WorkCard 大卡 + grid 间距
- **C15** PageMaterials viral/hot/topic 三 tab 大卡
- **C16** PageKnowledge 树状 polish

### Phase 4 — 首页 + sidebar

- **C17** PageHome BigAction 大卡 hero
- **C18** AI usage 卡 polish

### Phase 5 — 后台 polish

- **C19** PageSettings 全局卡片化
- **C20** PageNight 任务卡视觉

### Phase 6 — 自审

- **C21** 跨页 banner 风格统一
- **C22** StepHeader 抽公共组件
- **C23** D-062-AUDIT-7 走一遍 4 路径找新断点

## 每拍 fire 的 SOP

1. `git log --oneline | head -10` 看上次到哪
2. `cat docs/design/AUTONOMOUS_24H_PLAN.md` 找下一个未完成的 C 项
3. 大改 (新交互 / 新组件) → 先写 `docs/design/<page>-mockup.html` (5-10 min)
4. 自审 mockup, 按"拍板原则"对照
5. 实施: 改文件 → JSX parse → pytest --deselect 柿榴
6. commit (message 含: 改了啥 + 关键决策 + 下一项是什么)
7. 在本文档底部"已完成"段加一行
8. 余量时间继续做下一个 C, 直到 cron 下一拍

## 完成节奏估算

- 每拍 20min, 大改 1 commit / 小改 2-3 commit
- 24h × 3 = 72 拍, 留余量取 50 个有效拍
- Phase 1-6 共 ~23 commit, 1 天可完
- 多余时间做 audit + 跨页统一

## 自删 cron 机制

- cron 启动时间: T0
- 每拍开头: `date +%s` 拿 now, 跟 T0 比, ≥ 86400s (24h) 就 CronList + CronDelete 自己, 然后停
- 启动时把 T0 写进本文档 "## 启动状态" 段, 之后每拍读

## 启动状态

- 启动时间 (T0): 2026-04-25 16:54 (epoch 1777107271, 也存 /tmp/autoplan_t0.txt)
- 自删时间: 2026-04-26 16:54 (epoch 1777193671)
- Cron expr: `7,27,47 * * * *` (每 20 min 一拍, off-minute 避开 :00/:20/:40)
- 当前拍数: 0
- 已完成: 0 / 23

## 已完成 (C 编号 + commit hash + 一句话)

- C5 PageVoicerewrite 升级 — checkbox 模式 + 多版累积 + 改写完成态加 tab/再来一版/换角度
- C6 PageTouliu Step 1 升级 — hero + 大输入框 + ParamRow 抽组件 + skill 资源默认折叠
- C7 PageWechat WxStepTopic 升级 — hero + 大输入框 + 副标改人话 + skill 资源默认折叠
- C8 PageMoments MStepTopic 升级 — hero 字号 30 + 字数 Tag + 提交按钮升级
- C9 PagePlanner 加做视频链路 — PStepPlan 完成态 "做成预热视频" CTA, seed=summary+after_event
- C5+ voicerewrite VStepInput hero polish — 字号 30 + 副标人话 + textarea minHeight + 字数 Tag
- AUDIT-7 复盘 (Phase 1 完成后) — 写 5 个 todo (各 step hero 不一致 / wechat moments 后续 step 没动 / planner Step 1 没动)
- A7-todo2+3 hotrewrite + planner Step 1 hero polish — 字号 30 + 副标人话 + minHeight + 字数 Tag
- C10 Step 1 复用最近做过的 — 拉 /api/works?limit=3, RecentWorkCard mini 卡, 一键塞 textarea
- C11 Step 3 朴素卡升级 — radio dot + brandSoft 选中 + 大卡风格 + 标题 24px hero
- C12 Step 4 SceneRow polish — 主行 padding 12x14 / font 12.5 / broll 按钮"缺图"amber 强调 + expanded brand border
- C13 Step 5 PublishPanel batch — "✓ 一键全标已发" + "撤销全部标记"
- C14 PageWorks WorkCard + EmptyWorks polish — hover ring + 时长徽章 + Empty hero (480 max + 1 px brand border + 大 emoji)

## 卡住记录

(cron 跑起来后遇到 backend 缺 endpoint / parse 失败 / 死代码等, 写这里)
