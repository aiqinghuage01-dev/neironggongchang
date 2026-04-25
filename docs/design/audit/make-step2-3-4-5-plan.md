# make-step2-3-4-5 Plan · Tick 3 · 2026-04-26 00:09

## 业务 WHY

做视频 5 步 wizard 的 Step 2-5 是用户每次走完 Step 1 必经的"幕后流程": 选声音 / 选数字人 / 选模板 / 剪辑 / 预览发布.

现状问题: 很多文案是开发者向 (mp4 / video_id / D-061g / 柿榴异步 / "由编导维护 v5 模板包"), 用户走过来感受到"这是个工具", 而不是"小华在帮我".

不修复又如何: 清华哥每天跑这个流程 N 次, 每次都被技术词噪音轻微反感. 学员将来用 poju.ai 版本时也会被劝退.

## 用户故事

| 故事 | 主路径 | 期望体验 |
|---|---|---|
| A. 我有一段文案, 想做数字人 | Step 1 → Step 2 选声/选数字人 → 一键合成 → Step 3 选模板 → Step 4 剪辑 → Step 5 预览发布 | 全程像跟小华聊天, 不知道 video_id / mp4 / 柿榴 / D-xxx 这些技术词 |
| B. 数字人合成失败 | Step 2 报错 | 看人话原因 (不是 stderr trace), 给重试按钮 |
| C. 没模板可选 (新装环境) | Step 3 空态 | 引导"用朴素模式直接出片"作为 happy path, 不是"等编导维护" |
| D. 朴素模式跑通, 看预览 | Step 5 预览 | 看到视频本身就够, 不需要看 absolute path / output_path |

反例 (排除掉的伪需求):
- ❌ 给用户看 video_id / work_id / output_path (调试信息, 不是产品功能)
- ❌ 暴露开发计划"D-061g+ 接 AI 自动改" (内部代号, 用户不关心)

## 系统关系

不动:
- backend `/api/speakers` `/api/avatars` `/api/video/submit` `/api/video/query/*` `/api/works/*/local-path` `/api/dhv5/templates` `/api/dhv5/align` `/api/dhv5/render` `/api/tasks/*` 全部不动
- localStorage seed: `make_v2_last` / `make_v2_feedback_note` / `publish_marks::*` 不动
- 跨页 anchor (setFromMake / clearFromMake) 不动
- BigPickerColumn / DhvTemplateCard / Dhv5SceneRow / ErrorBanner 等组件不动 (复用)

动:
- `web/factory-make-v2.jsx` Step 2-5 内部文案 / 错误态 / 完成态展示

## 现状问题清单 (来自 survey)

按"严重度 × 出现频率"排:

### P0 (用户每次都看到, 最影响感知)

1. **Step 2 generating 中显 video_id/work_id**:
   ```jsx
   video_id={taskInfo.video_id} · work_id={taskInfo.work_id}
   ```
   每次合成都暴露 ID, 用户看不懂

2. **Step 2 完成态显 dhVideoPath 全路径**:
   `/Users/black.chen/Desktop/.../works/xxx.mp4`
   用户不需要看路径

3. **Step 5 预览态显 result.output_path**:
   同上, 路径暴露

4. **"柿榴异步" / "柿榴合成中"**:
   柿榴是合作方, 用户不需要知道. 改"小华正在合成你的数字人..."

### P1 (出现在某个状态下)

5. **Step 2 alert 含 D-062kk-ext 代号**:
   ```jsx
   alert(`🔊 试听 #${id} · 后端 CosyVoice 合成接入待 D-062kk-ext`)
   ```
   用户点试听看到这个

6. **Step 2 失败 ErrorBanner 显 e.message**:
   后端 stderr 直接暴露, 用户看不懂

7. **Step 3 空态文案**:
   "(后续: 由编导维护 v5 模板包后, 这里会自动出现可选模板)"
   暴露内部分工

8. **Step 4 朴素模式标题"4. 剪辑 — 朴素模式"**:
   "朴素模式"是技术词, 改"不剪辑直接出"

9. **Step 5 hero 文案带 (D-061g 接通)**:
   `(D-061g 接通)` 直接显在用户看的地方

10. **Step 5 FeedbackPanel 解释含 D-061g+ 代号**:
    `(当前实现: ... · D-061g+ 接 AI 自动改)`

### P2 (轻微优化)

11. Step 3 hero "同 mp4 套不同模板能出多版" — mp4 改"成片"
12. Step 4 视频预览的路径行 `{dhVideoPath}` mono font 显路径 — 删
13. Step 5 渲染中 `task.progress_text` 直显, 可能是英文, 加翻译/兜底

## 改造方案 (按 SELF_REVIEW 8 项过一遍)

| # | 项 | 当前 FAIL | 改后 |
|---|---|---|---|
| 1 | 命名拟人化 | "柿榴合成中" / video_id / mp4 / D-xxx | "小华正在合成数字人..." / 删 ID 显示 / "成片" / 删代号 |
| 2 | 文档完整 | survey + plan 已落 docs/design/audit/ | OK |
| 3 | 入口可见性 | 主路径都一级 | 不动 |
| 4 | 不扣玉米 | survey 已穷尽, plan 给确定方案 | OK |
| 5 | 工厂部门心智 | "做视频" Step 2-5 内 | OK |
| 6 | 视觉规范 | 复用 BigPickerColumn / Tag / btn | 不动视觉, 只改文案 |
| 7 | 删自嗨文案 | (D-061g 接通) / "由编导维护 v5 模板包" | 全删 |
| 8 | 部署可移植 | 无硬编码 | OK |

## 边界 case

- Step 2 emptyAction 提示"去柿榴 Web 后台" — 改"去 ⚙️ 设置 看怎么加数字人形象" (不暴露柿榴)
- Step 2 失败错误来源: 网络/API 限流/合成内部错 — 加常见原因翻译
- Step 3 真无模板时仍引导朴素 (现有逻辑保留)
- Step 5 渲染失败: stderr 暴露给"高级用户" 折叠, 默认显"渲染失败 · 看下面 ▾"

## 不做的事

- ❌ 不动 BigPickerColumn / DhvTemplateCard / FeedbackPanel / PublishPanel 组件结构 (UI OK)
- ❌ 不接 AI 自动改 (D-061g+ 后续 backlog)
- ❌ 不改 align 字段 form UX (大改, 单独议题)
- ❌ 不接 OAuth 真发 (Phase 4)

## 实施步骤 (下个 tick implement)

按文件位置一气呵成, 单个 tick 应能跑完 (改动都是文案 + 简单条件):

1. **Step 2 (909-1104)**:
   - 删 generating 中 `video_id={...} · work_id={...}` 行
   - 删 done 态 `<div ...>{dhVideoPath}</div>` 路径显示
   - "柿榴合成中" → "小华正在合成数字人..."
   - "▶ 一键造数字人 (柿榴异步)" → "▶ 一键造数字人"
   - alert 文案删 D-062kk-ext / 改人话

2. **Step 3 (1217-1352)**:
   - 暂无模板态去掉 "(后续: 由编导维护...)"
   - hero "同 mp4 套不同模板" → "同一段数字人套不同模板能出多版"
   - "朴素 · 直接出数字人 mp4" → "朴素 · 不剪辑直接出"

3. **Step 4 (1357-1543)**:
   - "4. 剪辑 — 朴素模式" → "4. 不剪辑直接出"
   - "数字人 mp4 直接当成片" → "数字人视频直接当成片, 不再剪辑"
   - 预览下方 `{dhVideoPath}` mono 行 → 删

4. **Step 5 (1544-1620)**:
   - "看完成视频 · 不满意留意见 AI 重剪 · 满意去发布 (D-061g 接通)" → "看完成视频 · 不满意留个意见小华回去重剪 · 满意去发布"
   - FeedbackPanel 灰字 "(当前实现: ... · D-061g+ ...)" → 删
   - 输出 `{result.output_path}` mono 行 → 删 (留 size 和下载按钮)
   - 渲染失败态: stderr 折叠到 `<details>`, 默认显"渲染失败 · 点下面看技术细节"

预计 ~30 分钟, 一个 tick 干完. 8 项再过 verify, PASS commit.

## verify stage 重点

改完用 SELF_REVIEW 8 项再过一遍, 重点:
- grep 检查 D-0xx / mp4 / video_id / work_id / 柿榴 在用户可见处全清干净
- syntax check `@babel/parser` PASS
- 行数变化合理 (净 -50 ~ -20 行, 主要是删自嗨文案)
