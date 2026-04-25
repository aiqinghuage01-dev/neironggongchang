# make-step2-3-4-5 Verify · Tick 4 · 2026-04-26 00:30 (手动推进, loop 接力)

## 8 项自审

| # | 项 | 结果 | 备注 |
|---|---|---|---|
| 1 | 命名拟人化 | PASS | "柿榴合成中" → "小华正在合成你的数字人..."; 删 video_id/work_id 暴露; "数字人 mp4" → "数字人视频"; alert 删 D-062kk-ext / 改人话 |
| 2 | 文档完整 | PASS | survey + plan + verify 三件齐 |
| 3 | 入口可见性 | PASS | 主路径不动 (BigPickerColumn / DhvTemplateCard / FeedbackPanel / PublishPanel 都保留) |
| 4 | 不扣玉米 | PASS | 4 step 全改完, 无 todo / "待清华哥确认" 残留 |
| 5 | 工厂部门心智 | PASS | "做视频" 内 |
| 6 | 视觉规范 | PASS | 没动组件结构, 复用现有 Tag / btn / hero |
| 7 | 删自嗨文案 | PASS | "(D-061g 接通)" / "(D-061g+ 接 AI 自动改)" / "(后续: 由编导维护 v5 模板包后...)" / "video_id=xxx · work_id=xxx" / output_path 路径行 全清 |
| 8 | 部署可移植 | PASS | 无硬编码 |

## 落地

- 改动文件: `web/factory-make-v2.jsx`
- 行数变化: 1807 → 1803 (-4 净, 主要是改文案不是删块)
- Syntax check: `@babel/parser` PASS

## 关键改动 (按 step)

### Step 2 (909-1104)
- 删 generating 中 `video_id={...} · work_id={...}` 行
- "柿榴合成中…" → "小华正在合成你的数字人..."
- 简化进度文案: 删 status= 暴露, 留 "通常 30-90s 完成 · 合成完自动进下一步"
- 删 done 态 dhVideoPath 路径显, 改 "下一步选模板 / 直接做成片"
- "▶ 一键造数字人 (柿榴异步)" → "▶ 一键造数字人"
- BigPickerColumn alert: "🔊 试听 #${id} · 后端 CosyVoice 合成接入待 D-062kk-ext" → "🔊 试听暂未上线 · 可去 ⚙️ 设置 看声音列表"
- emptyTip "柿榴账号下还没数字人形象 · 去柿榴 Web 后台创建一个 (3-5 分钟 trained)" → "还没数字人形象 · 录一段 30 秒自拍视频上传训练, 3-5 分钟后小华就能用了"
- emptyAction.label "📋 复制柿榴操作" → "📋 复制操作步骤" (复制内容仍含"柿榴后台" — 用户必须知道去哪登录)

### Step 3 (1217-1352)
- "同 mp4 套不同模板能出多版" → "同一段数字人套不同模板能出多版"
- "朴素 · 直接出数字人 mp4" → "朴素 · 不剪辑直接出"
- "数字人原视频直接当成片" → "数字人视频直接当成片"
- 暂无模板态 "(后续: 由编导维护 v5 模板包后, 这里会自动出现可选模板)" 完全删

### Step 4 (1357-1543)
- "4. 剪辑 — 朴素模式" → "4. 不剪辑直接出"
- "没选剪辑模板 · 数字人 mp4 直接当成片 · 不剪辑直接进预览" → "上一步选了「朴素」 · 数字人视频直接当成片, 跳过剪辑进预览"
- "朴素模式不需要剪辑步, 数字人 mp4 是最终成片" → "不剪辑模式 · 数字人视频就是最终成片"
- 删视频预览下方 `{dhVideoPath}` mono 路径行

### Step 5 (1544-1620)
- "看完成视频 · 不满意留意见 AI 重剪 · 满意去发布 (D-061g 接通)" → "看成片 · 不满意留个意见小华回去重剪 · 满意去发布"
- 渲染失败态: stderr 折叠到 `<details>`, 默认显 "❌ 渲染失败 · 看下面 ▾" + 常见原因翻译
- 删 done 态 `📁 {result.output_path}` 路径行, 留 `成片大小 X MB`
- FeedbackPanel: 删 "(当前实现: ... · D-061g+ 接 AI 自动改)" 灰字注释

## 加分观察

- ✓ 渲染失败态加常见原因翻译 (网络/路径失效/资源缺失) — 用户能 self-debug
- ✓ stderr 折叠不删 — 给"想看技术细节"的用户保留, 不强迫给小白
- ✓ 全文检查"柿榴"出现仅 1 处 (复制操作步骤里, 必要), 用户日常感知里完全消失

## 已知保留 (本次不改)

- alignedScenes 字段 form (Step 4 模板模式) — 大改 UI 才能改善, 单独 backlog
- BigPickerColumn 的 describe(item, idx) "30 秒样本 · 音色自然" 等描述 — 现有文案 OK
- 模板 chip "全部 / 7 天内 / 30s / 60s" — DHV5_CATEGORIES + DHV5_DURATION_BUCKETS 来自其它文件
