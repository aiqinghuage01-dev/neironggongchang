# Step 1 交互设计稿 v1 (待清华哥确认)

> 我之前在"扣玉米"逐点改 — 清华哥批评对.
> 这份是 Step 1 (做视频 第一步) 的完整交互稿, 等清华哥点头后再写代码.
>
> 作者: Claude · 2026-04-25 · 待 review

---

## 一、清华哥的诉求总结 (我从历次反馈里提炼)

1. **入口要一个对话框, 像 ChatGPT 那种**, 用户粘啥都接得住
2. **几种输入意图**:
   - A) 粘**短视频链接** → 提取原文案 → 看完文案再决定改写 / 直接做
   - B) 粘**有链接 + 转发文 (douyin/抖音分享文)** → 同 A, 自动找出 URL
   - C) 粘**纯文案** → 直接做数字人 / 先改写优化再做
   - D) **没东西**, 想从 0 写 → 走 6 大 skill (热点改写 / 爆款改写 / 投流 / 公众号 / 朋友圈 / 内容策划)
   - E) **想蹭热点** → 看今天的热点候选 → 拍这条 → 进改写流程
3. **删开发者向琐碎文案** (那些 "(跨页 state 已通)" 之类的研发自嗨)
4. **热点要 top 3, 不是 1**, 参照 GPT5.5 方案 (匹配度 + 匹配原因 + 建议渠道 + 拍这条)
5. **skill 内逻辑要融入 UI** (爆款改写: 一次出几版 + 是否结合业务; 热点改写: 切入角度选择)
6. **拍这条 → 直接进入改写流程**, 不是只塞 textarea 让我自己想

---

## 二、Step 1 整体布局 (3 大区, 自上而下)

```
                    🎬 做视频 · 第 1 步: 给我点东西

                    粘链接 / 粘文案 / 选热点 / 用专业 skill 写
                    ───── 都接得住 ─────


    ┌─────────────────────────────────────────────────────┐
    │ [1] 中央对话框 (主路径, hero, 大圆角绿边)             │
    │                                                       │
    │  textarea: 粘视频链接 (抖音/小红书/B 站...)           │
    │            或者直接贴文案 / 念出来转写...             │
    │                                                       │
    │  ───── 状态行 + 动作行 (动态根据输入类型) ─────       │
    └─────────────────────────────────────────────────────┘

    ┌─────────────────────────────────────────────────────┐
    │ [2] 🔥 今天最值得拍的 3 个 (蹭热点路径)               │
    │                                                       │
    │  [1]  AI 客服集体下岗?一线从业者发声     匹配 98%     │
    │       ┃ 匹配原因: 你擅长 AI 落地 + 个人视角           │
    │       ┃ 建议渠道: 抖音 + 视频号 + 公众号              │
    │       ┃                              [📸 拍这条 →]   │
    │  [2]  ...                                            │
    │  [3]  ...                                            │
    │  全部 (6) →                                          │
    └─────────────────────────────────────────────────────┘

    ┌─────────────────────────────────────────────────────┐
    │ [3] 或者从这里开始写 (从 0 写文案的入口)              │
    │                                                       │
    │  🔥 热点改写 │ ✍️ 爆款改写 │ 💰 投流文案             │
    │  📄 公众号    │ 📱 朋友圈   │ 🗓️ 内容策划             │
    └─────────────────────────────────────────────────────┘
```

---

## 三、[1] 中央对话框 — 智能识别 + 动态动作

### 3.1 输入类型识别 (4 种)

输入框里的内容, 按以下顺序判断:

| 类型 | 判断 | 例子 |
|---|---|---|
| **空** | `trim().length === 0` | (空) |
| **纯 URL** | trim 后 `^https?://` 开头, 长度 < 200 | `https://v.douyin.com/abc/` |
| **混合 (链接+转发文)** | 内容里能用正则提到 URL, 且整体长度 > 50 | 抖音"分享自XXX"那种带 URL 的转发文 |
| **纯文案** | 上面都不是, 长度 ≥ 10 | 一段口播 |

混合识别正则: `/(https?:\/\/[^\s]+)|(v\.douyin\.com\/[a-zA-Z0-9]+)|(xhslink\.com\/[a-zA-Z0-9]+)|(b23\.tv\/[a-zA-Z0-9]+)/`

### 3.2 状态行 (textarea 下方一行 tag + 提示)

| 类型 | 状态行显什么 |
|---|---|
| 空 | `✨ 自动识别链接 / 文案 · 选下面动作` |
| 纯 URL | `🔗 看起来是短视频链接` + Tag(平台名 if 识别到) |
| 混合 | `🔗 检测到链接 (隐藏在转发文里)` + Tag(平台名) |
| 纯文案 | `[N 字]` + `[~M 秒口播]` + (>600 时) `[⚠ 偏长 · 建议精简 300-500]` |

### 3.3 动作行 (textarea 下方按钮组, 动态)

**核心原则**: 提供"提取原文案"作为主按钮, 而不是默认走"做数字人".
原因: 用户粘 URL 通常是"我想看看这视频说了什么", 不是"直接做这视频不动".

| 类型 | 主按钮 (brand) | 次按钮 (outline) | 提示 |
|---|---|---|---|
| 空 | `↑ 先填文案 / 链接` (灰 disabled) | – | – |
| 纯 URL | **`📎 提取原文案 →`** | `🎬 直接做(不提取)` | "提完会自动填回, 你看看再决定改写还是直接做" |
| 混合 | **`📎 提取原文案 (从链接)`** | `🎬 用我贴的文字直接做` | "我会提链接里的, 不是你贴的转发文" |
| 纯文案 | **`🎬 做数字人 →`** | `✍️ 先改写优化` | "先改写: 跳 🎙️ 录音改写 / ✍️ 爆款改写, 完成自动带回" |

**改写按钮的细节** (清华哥反复强调的"改写有不同 skill"):

点 `✍️ 先改写优化` 时不直接跳, 弹一个小下拉菜单 (or popover):

```
你想怎么改写?
─ ✍️ 爆款改写  (有原文, 想改成自己版本) ← 推荐
─ 🎙️ 录音改写  (语序乱、有口头禅, 重排理顺)
```

各自跳对应 skill, 完成后 CTA "做成视频" 自动带回 Step 1.

### 3.4 提取原文案的实现 (URL 模式 / 混合模式)

走现有 `/api/transcribe/submit` (轻抖 ASR):

1. 自动从输入里 extract URL (混合模式用正则; 纯 URL 模式直接用 trim)
2. POST /api/transcribe/submit + URL → 拿 batch_id
3. 60 × 5s 轮询 GET /api/transcribe/query/{batch_id}
4. success → setScript(text), 输入框替换为提取出的文案 (转为"纯文案"模式)
5. 顶部加 banner: `✓ 已从 [URL] 提取 N 字 · 标题: XXX`

提取过程中:
- textarea 灰 disable
- 主按钮变 "提取中... 已 Ns" + Spinner
- 状态行显进度 (running / extracting)

---

## 四、[2] 🔥 今天最值得拍的 3 个 (参照 GPT5.5 方案)

### 4.1 数据来源

`GET /api/hot-topics?limit=10` (现有), 取前 3 条 sort by `match_persona DESC, heat_score DESC`.

### 4.2 单卡组件 (HotPickCard)

```
┌──────────────────────────────────────────────────────────┐
│ [1]  AI 客服集体下岗?一线从业者发声        匹配度 98%     │
│      ┃ 匹配原因: 你擅长 AI 落地和个人视角, 一线经验更说服力 │
│      ┃ 建议渠道: 🎵 抖音  📺 视频号  📱 朋友圈           │
│      ┃                       [只塞文案] [📸 拍这条 →]    │
└──────────────────────────────────────────────────────────┘
```

字段:
- 序号: `[1] [2] [3]` 大方块, 第 1 名 brand 底, 其他灰底
- 标题: 16px 600
- 匹配度 (右上, 角标): brandSoft 底 brand 字 — 算法见 4.3
- 匹配原因: 灰色描述 (取自 `t.match_reason`, 没有就 hide)
- 建议渠道: 平台 chip (从 `t.platform` 取 + "短视频" "朋友圈" 默认推) + 夜班 tag
- 主按钮: **`📸 拍这条 →`** (brand) → 见 4.4
- 次按钮: `只塞文案` → 老逻辑, 把热点拼成 seed 塞 textarea, 用户自己写

### 4.3 匹配度算法 (前端简单算)

后端没有"匹配度"字段, 前端按规则算:

```js
matchPct = t.match_persona
  ? clamp(88 + (heat_score % 12), 88, 99)   // ✓ 匹配人设 → 88-99
  : clamp(55 + (heat_score % 28), 55, 82);  // 不匹配 → 55-82
```

### 4.4 "拍这条" 行为 (核心): 直接进改写流程

清华哥强调: "拍这条 → 直接进入文案改写", 不是只塞 textarea.

实现:
1. 拼丰富 seed: `{title} + match_reason + platform + heat 注解`
2. localStorage 写 `hotrewrite_seed_hotspot` (含全部信息)
3. setFromMake("hotrewrite") (反向 anchor)
4. onNav("hotrewrite")
5. **PageHotrewrite Step 1 检测到 seed → 自动 setHotspot + 自动调 doAnalyze + 跳到 angles step (跳过 input step)**

完成态 (改写出 1 条文案 + 6 维评分后):
- "做成视频" CTA → 带文案回 Step 1 (D-062c 已通)
- **新加**: "再来一版" 按钮 (利用 hotrewrite skill 的方法论, 同热点不同切入角度再写一版)

### 4.5 6 + 条时显"全部 →"

热点 > 3 条时, 卡片下方显 `全部 (6) →` 跳 PageMaterials 热点 tab.

### 4.6 0 条时

显 NightHotFlywheel (D-062i 已有), 启用夜班 / 立即抓.

---

## 五、[3] 或者从这里开始写 — 6 大 skill 卡

清华哥说"类似投流文案这种, 我可能直接点下面卡片进入投流 tab" — 这条路径不动, 仅清理研发文案.

### 5.1 删除以下研发向文案

- "✨ 写完点 skill 完成态的"做成视频" CTA, 文案自动带回这里 (跨页 state 已通)" ← 完全删
- "📋 或者用专门的文案 skill 写" → 改 "或者从这里开始写 ↓"
- 6 个 skill 卡 desc 里的研发括号:
  - "公众号长文 (回来后摘金句段做视频)" → "方法论长文 · 2000+ 字"
  - "录音改写 (修语序去口头禅)" → "录音 / 直播 → 转写 + 改写"
  - 等等

### 5.2 清华哥之前说"爆款改写也加进 6 大"

之前没有, 当前是: hotrewrite / voicerewrite / ad / wechat / moments / planner.
建议改成: **hotrewrite / 爆款改写 / ad / wechat / moments / planner**? 还是 hotrewrite + 爆款改写 都加 (变 7 个)?

→ 等清华哥确认.

### 5.3 卡片视觉

参考 D-062kk 大卡片风格, 不是小图标卡:
- icon 24px + 标题 14px 600 + desc 12px 1.5 行
- hover: brand border + 4px ring
- 点击: setFromMake(skill_id) + onNav(skill_id)

---

## 六、PageHotrewrite Step 1 也要改 (配合 4.4 的"拍这条")

清华哥的核心: "拍这条 → 直接进改写流程", 不是停在 hotrewrite 第 1 步让用户重新粘.

### 6.1 检测 seed 自动跳过 input step

PageHotrewrite mount 时:

```js
React.useEffect(() => {
  const seed = localStorage.getItem("hotrewrite_seed_hotspot");
  if (seed) {
    setHotspot(seed);
    localStorage.removeItem("hotrewrite_seed_hotspot");
    // 自动跳过 input, 直接 doAnalyze
    setTimeout(() => doAnalyze(), 100);  // 等 setHotspot flush
  }
}, []);
```

### 6.2 改写完成态加"出 N 版"

参照爆款改写 skill 的"模式 1/2/3" 概念:

完成态 (HotStepWrite) 底部加:
```
[再来一版 (同角度再写)]  [换个角度再来一版]  [出 3 版全部对比]
```

技术上: write 的 API 不变, 调多次 + 把结果累积到一个 `versions` 列表里展示.

### 6.3 是否结合业务 (爆款改写 skill 的核心参数)

Step 1 textarea 上方 (or 折叠区) 加一个 toggle:
```
☑ 结合我的业务 (做 AI + 短视频 + 老板获客)
☐ 纯改写, 不要业务植入 (适合通用爆款改造)
```

默认 ☑ 结合业务. toggle 状态传给 backend (需要 backend 支持新字段).

---

## 七、与 voicerewrite + 爆款改写 skill 的衔接

| 来源 | 去往 | 触发 | 数据 |
|---|---|---|---|
| Step 1 纯文案 + 点 "✍️ 先改写优化" → 选 ✍️ 爆款改写 | PageBaokuanRewrite (新 page, 当前没有) | seed: trimmed | 提示: 待 backend skill API 接入 |
| Step 1 纯文案 + 点 "✍️ 先改写优化" → 选 🎙️ 录音改写 | PageVoicerewrite Step 1 | localStorage `voicerewrite_seed_transcript` (D-062mm 已通) | 自动填 textarea |
| Step 1 [2] 拍这条 | PageHotrewrite Step 2 (跳过 1) | localStorage `hotrewrite_seed_hotspot` | 自动填 + 自动 analyze |
| Step 1 [3] 6 skill 卡 | 各对应 page | setFromMake(id) | banner "你从🎬做视频来" |

各 skill 完成态都已加 "做成视频" CTA (D-062c-g) 自动带回.

### 注意: 爆款改写 skill 还没 backend 接入

- skill 文件: `~/Desktop/skills/爆款改写-学员版/SKILL.md`
- backend: 没有 `/api/baokuan/*` endpoints
- frontend: 没有 PageBaokuanRewrite

→ 当前阶段 "✍️ 先改写优化" 默认走 voicerewrite. 等 backend 接好爆款再加分支选择.
→ 文档先写, 实施分两步: (a) 当下做能做的 (b) backend 接爆款后补完.

---

## 八、实施步骤 (让清华哥批准 1 个 1 个 commit)

### Phase 1 — 视觉清理 + 热点 top 3 + 拍这条 (1 commit)

- 删 [1]/[3] 研发文案
- [2] 改成 HotPickCard 大卡 × 3 + 匹配度 + 拍这条 + "全部" 链接
- "拍这条" 写 hotrewrite_seed_hotspot + nav

### Phase 2 — PageHotrewrite 自动跳过 input + 出 N 版 (1-2 commit)

- HotStepInput useEffect 检测 seed → 自动 setHotspot + auto-trigger
- HotStepWrite 完成态加 "再来一版" / "换角度再写" 按钮 (累积 versions 数组)
- "结合业务" toggle 加 (frontend, backend 待支持)

### Phase 3 — 爆款改写 skill 接入 (3-5 commit, 大工程, 待清华哥决定优先级)

- backend: `/api/baokuan/analyze` + `/api/baokuan/rewrite` (出 V1/V2/V3/V4)
- frontend: 新 PageBaokuanRewrite (3 步)
- 加进 6 大 skill 卡 (变 7 个)
- Step 1 "✍️ 先改写优化" popover 加 ✍️ 爆款改写 选项

### Phase 4 — Step 1 状态行/动作行 智能识别升级 (1 commit)

- 加"混合模式" (转发文里识别 URL)
- 提取原文案的 banner 状态显示

---

## 九、需要清华哥拍板的 5 个决策点

1. **6 大 skill 是否加爆款改写变 7 个?** (我倾向加, 但要 backend 跟上, 是个大工程)
2. **"拍这条" 是直接 auto-analyze 跳到 angles, 还是先停在 input 让用户看一眼再 confirm?**
   (我倾向自动跳, 减少 1 次手动)
3. **改写 toggle "结合业务" 默认 ✓ 还是 ✗?**
   (爆款改写 skill 默认是"纯改写", 但你做的是个人 IP 工厂, 我猜默认 ✓ 更合身)
4. **匹配度算法**: 我用的是 88+ (匹配人设) / 55+ (不匹配) 的简单规则.
   要不要后端真算 (基于 persona embedding), 还是这样够用?
5. **"再来一版"按钮的实现**: backend write 调多次 + 前端累积 versions 数组 (我推荐).
   还是后端真支持 `n=N` 一次出多个?

---

## 十、清华哥确认后我会做的事

- 先实施 Phase 1 (1 commit, 见效快)
- Phase 2 拆 1-2 commit
- Phase 3 单开议题讨论 (爆款改写整 skill 接入 = 重大 backlog)
- Phase 4 收尾

每个 commit 之前都先 "我准备做 X, 改 Y 文件, 期望视觉是 Z" 跟你 1 句话确认.
不再扣玉米.
