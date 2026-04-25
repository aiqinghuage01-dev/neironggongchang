# make-step2-3-4-5 Survey · Tick 2

## 文件 + 行数

`web/factory-make-v2.jsx`:
- Step 2 MakeV2StepVoiceDh (909-1104, ~196 行) — 声音 + 数字人
- Step 3 MakeV2StepTemplate (1217-1352, ~136 行) — 选模板
- Step 4 MakeV2StepEdit (1357-1543, ~186 行) — 剪辑
- Step 5 MakeV2StepPreview + FeedbackPanel + PublishPanel (1544-1807, ~263 行) — 预览 + 发布

## API endpoints (各 step 用到的 backend)

- Step 2: `GET /api/speakers` · `GET /api/avatars` · `POST /api/video/submit` · `GET /api/video/query/{id}` · `GET /api/works/{id}/local-path`
- Step 3: `GET /api/dhv5/templates`
- Step 4: `POST /api/dhv5/align` · `POST /api/dhv5/render` (推测)
- Step 5: `GET /api/tasks/{id}` 渲染状态

## localStorage / 跨 step state

- `make_v2_last`: 上次选的 voiceId/avatarId (默认勾选用)
- `make_v2_feedback_note`: 重剪意见带回 step 4 用
- `publish_marks::{outputPath}`: 各平台已发标记

## 显眼问题清单 (按 SELF_REVIEW 8 项过)

### 命名拟人化 (FAIL — 多处)
- `video_id={taskInfo.video_id} · work_id={taskInfo.work_id}` 暴露 ID
- "柿榴异步" / "柿榴合成中" — 用户不一定知道柿榴是数字人服务
- "数字人 mp4" / "成片 mp4" / "套不同模板" — mp4 是技术词
- "通过 work_id 拿绝对路径" — 注释 (代码 OK 但用户能看到顶上路径)
- alert("...待 D-062kk-ext\n(可去柿榴后台看)") — 用户 alert 含 D-062xx 代号

### 入口可见性 (PASS — 主路径都一级)
- 大卡 picker / 朴素选项 / 一键造数字人 都是主按钮
- "跳过合成填路径" 藏 `<details>` OK (power user)

### 删自嗨文案 (FAIL — 多处)
- "(D-061g 接通)" / "(当前实现: ... · D-061g+ 接 AI 自动改)" — 暴露开发阶段
- "(后续: 由编导维护 v5 模板包后, 这里会自动出现可选模板)" — 用户不关心
- "video_id=xxx · work_id=xxx" 显在 generating 中 — 用户看不懂这行

### 视觉规范 (PASS — 复用 BigPickerColumn)
- step 2 大卡 ✓ · step 3 朴素卡视觉一致 ✓
- ErrorBanner 复用 ✓

### 加分观察
- ✓ 默认勾选上次的 voiceId/avatarId (省手点)
- ✓ 朴素模式跳过 align/render (省步)
- ✓ PublishPanel 5 平台一键复制 + 一键全标已发
- ✓ FeedbackPanel "带意见回剪辑步" (重剪闭环)

### 缺口 (本次 task 范围内可改)
1. 用户可见处所有 mp4 / video_id / work_id / D-061x / 柿榴 — 改人话或拟人化
2. 完成态不要显路径
3. 失败态友好化 (stderr 太硬, 加翻译/常见原因)
4. 渲染中文案干瘪, 加点小华味

### 缺口 (本次 task 范围外, 单独 backlog)
- step 4 align 字段 form 体验 — 大改 UI 才能改善 (跳过)
- AI 自动改 (D-061g+) — backend 工程, 非本审计范围

## 下一 stage: plan
按 SELF_REVIEW 8 项给每个 step 出具体改造方案 (主要是文案 / 错误态)
