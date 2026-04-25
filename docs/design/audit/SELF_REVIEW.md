# 模拟清华哥自审 checklist (cron 用)

> 来源: ~/.claude/projects/.../memory/feedback_*.md
> 用途: cron 在 plan stage 制定方案前过一遍 + verify stage 改完后再过一遍

---

## 8 项必过 (任一 FAIL → plan 阶段重想 / verify 阶段返工)

### 1. 命名拟人化 ✅ (feedback_naming_style.md)
- ❌ FAIL: 用户可见处出现 "skill" / "endpoint" / "API" / "transcribe" / "ASR" / D-062xx 等技术词
- ✅ PASS: 用"小华XX"或人话, 例: "小华帮你整理" / "提取并洗成你的爆款"
- 例外: 平台名 (抖音/小红书/B 站) 是用户认得的 → OK

### 2. 设计文档完整 ✅ (feedback_design_doc_completeness.md)
plan.md 必须有:
- 业务 WHY (这个 page 解决什么, 不解决又如何)
- 用户故事 (主路径 + ≥1 反例)
- 系统关系 (跟其它 page / backend / skill 衔接)
- 边界 case (空态/错误态/加载态)
- 不做的事 (明确 scope, 防蔓延)

### 3. 入口可见性 > 侧栏简洁 ✅ (feedback_product_decisions.md)
- ❌ FAIL: 高频功能藏 ▾ popover / 折叠 / "更多 →"
- ❌ FAIL: "去设置里开关 X" 这种引导
- ✅ PASS: 日常用的给一级入口或 tab; 次按钮 OK

### 4. 不扣玉米 ✅ (feedback_design_workflow_mockup_first.md)
- ❌ FAIL: 没把核心想清楚就跳 implementation
- ❌ FAIL: 改一半剩"todo: 清华哥确认"塞着
- 本次特权: cron 必须自己定完所有"待确认", 不留悬念给清华哥

### 5. 工厂部门心智 ✅ (project_neironggongchang.md)
- ❌ FAIL: "首页" / "Library" / "Skills" 等技术化命名
- ✅ PASS: 总部 / 生产部 / 档案部 / 夜班 心智一致

### 6. 视觉规范 ✅
- ❌ FAIL: 引入新色没复用 brand 绿 (`T.brand` / `T.brandSoft` 等 factory-tokens.jsx)
- ❌ FAIL: 按钮 padding/radius 跟现有不一致
- ✅ PASS: 复用现有 Tag / 大圆角绿边 hero / btnPrimary/btnGhost 风格

### 7. 删自嗨文案 ✅
- ❌ FAIL: "(跨页 state 已通)" / "(D-062xx)" / "(backend 待接)" / "P0 / Phase 1"
- ✅ PASS: 用人话, 例: "提完会自动填回, 你再看要不要改"

### 8. 部署可移植 ✅ (project_neironggongchang.md)
- ❌ FAIL: 硬编码 `/Users/black.chen/...` 路径
- ❌ FAIL: 假设 chrome / dreamina CLI 一定在
- ❌ FAIL: 引入 brew / launchd

---

## 加分项 (不强制)

- 主次按钮视觉对比突出 (主 brand 实心 / 次白底 outline)
- 状态行用 Tag 组件不裸字
- 空态有引导, 不"暂无数据"干巴
- 跨 page 衔接自动化 (seed / banner)

---

## Plan stage 用法

写 `<page>-plan.md` 时:

```markdown
# <Page> Plan · Tick N

## 业务 WHY
...

## 用户故事
- 主: ...
- 反例: ...

## 系统关系
...

## 现状问题清单 (来自 survey)
1. ...
2. ...

## 改造方案 (按 SELF_REVIEW 8 项过一遍)

| # | 项 | 当前 | 改后 |
|---|---|---|---|
| 1 | 命名拟人化 | 出现"transcribe ASR" | 改"提取文案" |
| 2 | 文档完整 | – | – |
| 3 | 入口可见性 | popover 三选一 | 4 tab segmented |
| ...

## 边界 case 处理
- 空态: ...
- 错误态: ...
- 加载态: ...

## 不做的事
- ...

## 实施步骤
1. ...
2. ...
```

## Verify stage 用法

改完代码后, 再过一遍 8 项:
- 8 项全 PASS → git commit + 标 done
- 任一 FAIL → 改回去, 直到 PASS
- 改 3 次还过不了 → 标 blocked, 进下一个 task, 留给清华哥回来人工 unblock

## Verify 输出模板

`<page>-verify.md`:

```markdown
# <Page> Verify · Tick N

## 8 项自审

| # | 项 | 结果 | 备注 |
|---|---|---|---|
| 1 | 命名拟人化 | PASS | ... |
| 2 | 文档完整 | PASS | plan.md 含全部 5 部分 |
| 3 | 入口可见性 | PASS | 4 tab 一级入口 |
| 4 | 不扣玉米 | PASS | 无 todo |
| 5 | 工厂部门 | PASS | ... |
| 6 | 视觉规范 | PASS | brand 绿 + 现有 Tag |
| 7 | 删自嗨 | PASS | 无 D-062xx |
| 8 | 部署可移植 | PASS | 无硬编码 |

## 落地 commit
- commit: <sha>
- 改动文件: web/factory-<page>.jsx
- 净 +X / -Y 行
```
