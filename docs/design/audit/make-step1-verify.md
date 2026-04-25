# make-step1 Verify · Tick 1 · 2026-04-25 23:55

## 8 项自审 (verify stage)

| # | 项 | 结果 | 备注 |
|---|---|---|---|
| 1 | 命名拟人化 | PASS | 删 "走轻抖 ASR" → "小华转写"; 用户可见处无 "skill/endpoint/transcribe" 技术词 |
| 2 | 设计文档完整 | PASS | STEP1_INTERACTION_SPEC_v2.md 含 WHY/用户故事/系统关系/边界 case/不做的事 |
| 3 | 入口可见性 | PASS | 4 tab 一级入口 (segmented control); 删 popover ▾ 折叠层级 |
| 4 | 不扣玉米 | PASS | 4 tab 全 implementation 落地, 无 todo / "待清华哥定" 残留 |
| 5 | 工厂部门心智 | PASS | 仅 "做视频" Step 1, 无技术化命名混入 |
| 6 | 视觉规范 | PASS | 复用 T.brand / brandSoft / Tag size=xs / 大圆角绿边 hero (`1.5px solid + 5px ring`) |
| 7 | 删自嗨文案 | PASS | 用户可见处无 D-062xx / Phase 1 / "(跨页 state 已通)"; 代码注释保留 D-062oo-D 是开发注释 |
| 8 | 部署可移植 | PASS | 无硬编码路径 / 不引入新依赖 / 沿用 api.post('/api/transcribe/submit') 现有 backend |

## 落地

- 改动文件: `web/factory-make-v2.jsx`
- 行数变化: 1606 → 1807 (+201 净)
- Syntax check: PASS (`@babel/parser`, sourceType=module, plugins=[jsx])

## 关键改动

- 删 `showRewritePopover` state + popover JSX (~75 行)
- 删 `rewriteVia()` 函数 + onDoc click effect (~25 行)
- 删 `isUrlLike/isMixedMode/isContentLike/extractedUrl` 全局智能识别
- 加 `activeTab` + `extractedBanner` + `tab1Url` + `tab2Transcript` + `tab3SelfHot` state
- 改 `extractFromUrl()` → `doExtract(rawText, mode)` mode-driven
- 加 `jumpVoiceRewrite/jumpHotRewriteFromText/jumpBaokuanFromText` helper
- 替换 textarea hero + 旧热点卡组为 4-tab segmented + 各 tab body
- 复用最近做过的 + 6 大 skill 卡保留, 在 4-tab 之后

## 跨 page 衔接 (不动 backend, 不动其它 page)

- localStorage seed: `baokuan_seed_text` / `voicerewrite_seed_transcript` / `hotrewrite_seed_hotspot` (现有, 各 skill page 已检测)
- 新增: `baokuan_seed_auto_analyze` flag (给 task #4 baokuan page 后续 implement 自动 analyze 用; 当前 baokuan page 还没读这个 flag, 等 task #4 加)

## 加分观察

- ✓ 状态行用 Tag 不裸字
- ✓ 主次按钮视觉对比突出 (主 brand 实心 / 次白底 outline)
- ✓ Tab 1 提取后自动切 tab 4 + 显 banner, 跨 tab 衔接自动化
- ✓ Tab 2 给"飞书妙记/讯飞听见"软引导 (没强迫用户上传录音)
- ✓ Tab 3 复用现有 HotPickCard, 不重写

## 已知缺口 (留给后续 task)

- task #4 (baokuan): 加 `baokuan_seed_auto_analyze` flag 检测 → 自动 doAnalyze, 让 tab 1 "提取并洗" 真正一键到 V1/V2
- task #18 (cross-page-consistency): 看 4 tab 结构是否要扩到其它 page (如 wechat 8 步起手页)
