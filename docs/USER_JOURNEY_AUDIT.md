# 用户旅程审计(D-062b)

> 清华哥批评:"我做的都是功能堆砌,缺用户视角完整闭环思维"。
> 这份文档是站在 **创作者/老板视角**,从零打开网站到发布完成视频,走 4 条典型起点路径,**找出每一处断点**。
> 后续 D-062c+ 按这份 audit 一项项修。

最后更新:2026-04-25
作者:Claude(被清华哥点名要"自我迭代复盘能力")

---

## 4 条典型起点路径

### A. 从热点起步 — "今天有什么能蹭的"
**理想链路:** 看热点 → 选一条 → 写口播 → 数字人 → 模板剪辑 → 发布
**用户心智:** "我有点子,但要趁热"

### B. 从录音起步 — "刚开了个会/直播,要切素材"
**理想链路:** 上传录音 → 转写 → 改写 → 数字人 → 模板剪辑 → 发布
**用户心智:** "我有原始素材,要快速转化"

### C. 从投流任务起步 — "要批量出 N 版投流文案"
**理想链路:** 输入卖点 → AI 出 N 版 → 选最佳 → 数字人 → 模板剪辑 → 发布
**用户心智:** "我要批量化产出"

### D. 从空白起步 — "我直接来做条视频"
**理想链路:** 进做视频 → Step 1 选起点(热点/粘贴/skill)→ 后续 5 步
**用户心智:** "我有想法,直接动手"

---

## 当前每条路径的断点(具体哪里崩)

### A 热点路径 ❌ 多个断点

| 位置 | 现状 | 问题 |
|---|---|---|
| sidebar 🔥 热点改写 | 进去要先填 hotspot 文字 | **空白 — 没列今日热点供选** |
| /api/hot-topics | 空表 (没数据) | 默认无内容 |
| 改写完成后 | 显示改写结果就完了 | **没"做成视频"CTA** |
| 跨 skill 状态 | 改写文案没自动带到做视频 | 用户得手动复制粘贴 |

**修法:**
1. 🔥 热点改写顶部默认列今日热点(从 hot_topics 拉)+ 一键填进 hotspot input
2. 改写完后底部加 ✨"下一步:做成数字人视频?"CTA → 跳 PageMakeV2 Step 1 + script 预填
3. hot_topics 空时,引导启用 🌙 小华夜班"凌晨抓热点"(D-047 已实现)

### B 录音路径 ⚠️ 中度断点

| 位置 | 现状 | 问题 |
|---|---|---|
| sidebar 🎙️ 录音改写 | 让用户粘贴 transcript | **没上传音频自动转写** |
| 改写完成后 | 显示改写结果 | **没"做成视频"CTA** |

**修法:**
1. 🎙️ 录音改写加文件上传 → 调 /api/transcribe/submit → 自动填进 transcript
2. 改写完后加 ✨"下一步:做成数字人视频?"CTA

### C 投流路径 ⚠️ 重度断点

| 位置 | 现状 | 问题 |
|---|---|---|
| sidebar 💰 投流文案 | 默认 n=10 | **数量太多,生成慢,默认应是 1** |
| 生成中 | 等几分钟无中间反馈 | **没流式输出,只能干等** |
| 生成完成后 | 显示 N 条文案 | **没"做成视频"CTA** |
| 单条文案 | 只能看 / 复制 | **没"用这条文案做视频"按钮** |

**修法:**
1. n 改 [1, 3, 5, 10] 选项,默认 1
2. 加流式输出(SSE 或轮询展示中间态)
3. 每条文案下面加 ✨"用这条做视频"按钮 → 跳 PageMakeV2 Step 1 + script 预填这条

### D 空白路径 ✅ D-062a 部分修了

| 位置 | 现状 | 问题 |
|---|---|---|
| 🎬 做视频 Step 1 | textarea 置顶 + 当日热点 + 6 大按钮 (D-062a) | ✓ |
| 当日热点空时 | 显示"去维护"提示 | ✓ |
| 大按钮跳出去 | 跳 sidebar skill 不带"我从 make 来"标记 | **跨页面 state 丢** |

**修法:**
1. 大按钮跳转时塞 localStorage `from_make=true` + script seed
2. 各 skill 完成时检测此 flag,显"返回做视频继续"按钮

---

## 跨链路共性问题

### 1. 各 skill 完成态全部是"死胡同" 🔴 P0
**问题描述:** 投流/朋友圈/公众号/录音/热点 各 skill 写完后都是"显示结果完",没有"下一个动作"引导。用户得自己回 sidebar 找下一步。

**用户视角:**
> "我刚生成完投流文案,我就要看下面有没有'要不要做数字人'这种引导。
>  你不告诉我下一步,我会觉得这个流程是断的。"

**修法:** 每个 skill 完成态底部统一加 **"下一步行动"区**:
- 文字成果(投流/朋友圈/录音/热点改写) → ✨ 做成数字人视频(用这段)
- 公众号长文 → ✨ 摘金句段做视频 / ✨ 推送到草稿箱
- 视频成品(PageMakeV2 Step 5) → ✨ 多平台发布 / ✨ 同 mp4 套别的模板

跳转时:
- 写 localStorage `make_v2_seed_script` 把生成的文案带过去
- 写 localStorage `from_<skill_id>` 让 PageMakeV2 显"从 X 来"

### 2. 数据空时没有"启动飞轮"引导 🔴 P0
**问题描述:** 热点库空 / 选题库空 / 作品库空 时,用户看到的是"暂无"占位,没告诉他**怎么把数据填起来**。

**用户视角:**
> "你这功能没数据,那要这功能干啥?"

**修法:** 数据空状态都加 **"启动飞轮"行动按钮**:
- hot_topics 空 → "启用 🌙 小华夜班 / 凌晨 23:00 自动抓 / [立即试一次]"
- topics 空 → "AI 帮你生 5 条 / [立即生]"
- works 空 → "现在就做第一条视频 / [开始]"

### 3. 生成时间长的 skill 没流式反馈 🟡 P1
**问题描述:** 投流写要等 2-3 分钟,公众号 write 要 30-60s,这期间用户只能看 spinner,**没"AI 正在写第 3 段了""现在写到 1500 字了"这种中间态**。

**修法:** 长 skill 加流式:
- 后端用 Server-Sent Events 或简单 polling progress 字段
- 前端显示 "AI 正在写第 N 段..." / "已生成 X 字" 实时数

### 4. 默认值过激进 🟡 P1
**问题描述:**
- 投流 n=10 默认 → 生成 2-3 分钟才出
- v5 模板渲染 3-10 分钟无中断机制
- 数字人合成 30-90s 无估计提示

**修法:**
- 投流默认 n=1, 选项 [1, 3, 5, 10]
- 渲染加 [取消] 按钮 + 时间估计
- 数字人合成显"通常 30-90s 完成"

### 5. sidebar 入口没体现"频次"和"推荐路径" 🟢 P2
**问题描述:** sidebar 是平铺列表,看不出"今天该先点哪个"。

**修法:** 暂不动(等总部决策台 D-070+ 一起做)

---

## D-062 实施 backlog(按优先级)

### Phase 1 — 各 skill 加"下一步" CTA(P0)
- [x] **D-062c** hotrewrite 完成态加 ✨"做成数字人视频"按钮 + script 预填 (待 commit hash)
      + PageMakeV2 检测 localStorage 自动填 textarea + 显 banner "从 🔥 热点改写 带过来"
      = D-062c 同时把 D-062m/n 的"跨页面 state 锚机制" 也做了
- [x] **D-062d** voicerewrite 完成态加同款 CTA (VStepWrite + onNav, banner pattern)
- [x] **D-062e** touliu 每条文案下加"用这条做视频"按钮
      n 默认 1, 选项 [1, 3, 5, 10] (旧 [5, 10, 15] 太重)
      TLBatchCard onNav + makeVideo() 写 seed + skill: touliu
- [x] **D-062f** wechat 完成态加"摘金句段做视频"+"推送草稿"双 CTA
      WxStepWrite 底部追加渐变 CTA 卡: 选中段 ≥ 10 字优先用选段, 否则带全文(切 1200)
      推送草稿提示沿用现有 next 链路 (write → images → html → cover → push)
- [x] **D-062g** moments 完成态加同款 CTA
      MStepCopy 每条 + 🎬 做视频 mini button
      底部追加 "把第 1 条做成视频" 渐变 CTA
- [x] **D-062h** PageMakeV2 Step 5 多平台发布卡片化 (D-062h commit)
      PublishPanel 改: chip 列表 → 5 张可操作卡 (抖音/视频号/小红书/快手/B站)
      公共素材区: 复制标题(首句切 30 字) + 复制全文 + 复制 mp4 路径
      每平台单独 "标记已发" toggle, localStorage 按 outputPath 分桶记状态
      头部显 "已发 X/5" 计数 + 下载 mp4 按钮
      不接 OAuth (Phase 4 再做), 不 window.open 外链 (URL 易腐)

### Phase 2 — 数据空时启动飞轮(P0)
- [x] **D-062i** hot_topics 空时加"启用夜班 / 立即试一次"按钮
      新建 web/factory-flywheel.jsx 共享组件 NightHotFlywheel
      调用链: seed-defaults → list-jobs 找 凌晨抓热点 → PATCH enabled=true 或 POST /run
      "立即抓"轮询 30 × 3s 看 runs status, 成功调 onTopics 回调刷新
      接入: PageMakeV2 Step 1 + PageMaterials HotTab 两处空状态
- [x] **D-062j** topics 空时加"AI 生 5 条"按钮(已有 /api/topics/generate)
      PageMaterials TopicTab list.length === 0 分支重写
      内嵌 input + "✨ 让小华生 5 条" 主按钮 (默认 n=5, 区别于顶部"批量 10 条")
      Enter 键也能触发 · 默认 placeholder 给 3 个示例方向引导
- [ ] **D-062k** works 空时加"现在做第一条"按钮
- [ ] **D-062l** 各 skill empty state 统一加"启动飞轮"组件 (D-062i 已抽好, 后续按需接)

### Phase 3 — 跨页面 state(P1)
- [ ] **D-062m** localStorage make_v2_seed_script + from_make 锚机制
- [ ] **D-062n** PageMakeV2 检测 seed 自动填 textarea + 显"从 X 来"banner
- [ ] **D-062o** 各 skill 检测 from_make 显"做完返回 →"按钮

### Phase 4 — 默认值收敛(P1)
- [ ] **D-062p** 投流 n 默认 1 + [1, 3, 5, 10] 选择
- [ ] **D-062q** 数字人合成 estimate 时间提示

### Phase 5 — 流式输出(P2,需后端改)
- [ ] **D-062r** 后端 SSE infrastructure
- [ ] **D-062s** touliu/hotrewrite/voicerewrite/wechat write 接 SSE
- [ ] **D-062t** 前端 SSE 客户端 + progress UI

### Phase 6 — 自我复盘(每 3 拍做一次)
- [x] **D-062-AUDIT-1** 2026-04-25 14:10 复盘 (D-062c-h 后第一拍)
      新发现的断点 (写进 backlog 7-9 期):
      - **D-062u** ✅ PageMakeV2 Step 1 6-skill cards desc 提示已过时
        改成: "✨ 写完点 skill 完成态的'做成视频' CTA, 文案自动带回这里 (跨页 state 已通)"
      - **D-062v** ✅ Step 2 PickerColumn empty 加 actionable CTA
        PickerColumn 加 emptyAction prop ({label, onClick}), 无 action 退化原文字
        声音空 → "去 ⚙️ 设置·克隆样本上传" (onNav("settings"), 透 onNav 进 step 2)
        数字人空 → "📋 复制柿榴说明" (柿榴外部, 写到剪贴板让用户对照操作)
      - **D-062w** ✅ Step 3 模板空提示用户化 + 一键朴素 CTA
        模板空时显 brandSoft 提示卡 + "👆 用朴素模式继续" 按钮 (setTemplateId(null))
        筛选无匹配但有模板时改成 "换筛选条件 或 用朴素模式" (无 CTA, 让用户改 chip)
      - **D-062x** ✅ 反向 anchor 实现 (web/factory-flywheel.jsx + 各 skill page 入口)
        setFromMake(skill_id) 在 PageMakeV2 Step 1 ScriptSkillCard 跳前调用
        useFromMake(currentSkill) hook 在每个 PageX 入口 (hot/voice/touliu/wechat/moments) 检测
        FromMakeBanner 在 skill 顶部显眼 banner: "你从🎬做视频来 · 完成后点 X CTA 自动带回"
        TTL 30 分钟避免长尾误显; PageMakeV2 收 seed 后 clearFromMake 双向收尾
        Planner skip (无文案产出 CTA) — 留给后续 D-062x2
      - **D-062y** ✅ WxStepWrite 选段 ≥10 字阈值显眼化
        CTA hint 改成 "💡 选中正文一段 (≥ 10 字) 再点 → 只带选段 · 不选则带全文(切 1200 字)"
        阈值 + 行为 + 全文 fallback 一行讲清
      - **D-062z** Step 5 "标记已发"无导出/统计入口
        现状: 标了已发只是本地 UI tag, 没法导出周报/复盘
        建议: 沿 storeKey 跨视频聚合, sidebar "我的作品" tab 显多平台发布矩阵

      新发现的 bug + 待修:
      - **D-062-AUDIT-2-fix1** ✅ PageMaterials HotTab/TopicTab "做成视频" 不带 seed
        line 82-83 onUse 之前只 onNav("make"), 用户辛苦挑的热点/选题完全丢失
        现已修: 写 make_v2_seed_script + skill: "hot-topic" / "topic"
        加 MAKE_V2_SKILL_NAMES 映射, banner 显 "🔥 热点库 / 💡 选题库 来"
      - **D-062-AUDIT-2-todo1** ✅ ViralTab + Works WorkDrawer onRemake 统一到 seed
        删 window.__materialHandoff 双轨 (验证: 全 codebase grep 无 reader, 安全)
        viral 用 m.original_text 作 seed; works 重制用 picked.original_text
        skill 标 "viral" / "rework", MAKE_V2_SKILL_NAMES 加映射
        banner 显 "🔥 爆款素材 / ♻️ 重做作品 来"
      - **D-062-AUDIT-2-todo2** PageMakeV2 Step 1 hot_topics 列表点 "用这条 →"
        line 174 写的是 hardcoded 模板, 而非走 hot-topic seed 机制
        现状能工作 (因为本就在 PageMakeV2 内), 但语义不一致
      - **D-062-AUDIT-2-todo3** ✅ seed 文案过长 amber 警告
        Step 1 Tag 行加判断: > 600 字时
          - 秒数 Tag 颜色 blue → amber
          - 多挂一个 amber Tag "⚠ 偏长 · 建议精简 300-500"
        不强制截断, 让用户自己决策 (可能他真要长口播)

- [x] **D-062-AUDIT-3** 2026-04-25 14:35 复盘 (AUDIT-2 + 3 commit 后第三拍)
      新发现:
      - **D-062aa** ✅ PageHotrewrite Step 1 没列今日热点候选
        原 Path A audit 第 1 条断点早就发现, 但只在 PageMakeV2 Step 1 修了 (D-062a)
        sidebar 直接进 🔥 热点改写的用户还得自己粘热点, 跟 audit 不一致
        Fix: HotStepInput 加 hotTopics state + 拉 /api/hot-topics + 列前 3 条
        点 → 拼"# 来自热点库 (...)"模板塞 textarea (与 PageMakeV2 Step 1 一致)
        热点空时直接显 NightHotFlywheel CTA (复用 D-062i 共享组件)
      - **D-062bb** ✅ voicerewrite Step 1 加 URL 自动转写 (短视频)
        VStepInput 加"🔗 有短视频链接? 一键自动转写" 卡 (textarea 上方)
        URL 输入 + Enter / 主按钮 → /api/transcribe/submit + 60×5s poll
        success 自动塞 transcript + 显字数 + 标题; failed 显 error
        本地 m4a/mp3 上传留 ext (D-062bb-ext) 待后端 ASR 接入
      - **D-062cc** ✅ 错误信息友好化 + 重试 CTA
        web/factory-flywheel.jsx 加 humanizeError + ErrorBanner
        13 条 ERROR_PATTERNS 覆盖: 模板缺失/mp4 丢/文案空/生图超时/quota/AI 抽风/索引超界 等
        每条返回 {icon, title, suggestion}, 原始 msg 默认折叠
        actions 槽支持 "重试" + "关闭" 双按钮
        接入 PageMakeV2 Step 2/3/4 三处 localErr 显示
      - **D-062dd** sidebar 各 skill 入口没"今日产出"小数字
        用户进 sidebar 不知道 "我今天做了几条投流", 缺即时反馈
        优先级 P3, 可加 dot 计数 (近 24h 该 skill 调用数 / works.created_today 等)

---

## 文档维护规则

1. **每完成一个 D-062x commit,把对应行打勾 + commit hash**
2. **每 3 拍一次 AUDIT 复盘,新断点加进 backlog 段**
3. 修复完移到"## 已修归档"段

## 已修归档

(暂无 — D-062a 是 Step 1 重排,在 D-062 系列前一步,不算 audit 项)
