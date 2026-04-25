# 模拟清华哥 mockup 审核标准 (Cron 自审用)

> 来源: ~/.claude/projects/-Users-black-chen-Desktop-BLACK-claudecode/memory/feedback_*.md
> 用途: cron review stage 时, 模拟清华哥严苛审 mockup, PASS 才动代码

---

## 必过项 (任一 FAIL → review FAIL → revise)

### 1. 命名拟人化 ✅
> 来源: feedback_naming_style.md
> 原话: "用户能看到的功能命名走'小华XX'拟人化路线，避免技术词"

- ❌ FAIL: 出现 "skill" / "endpoint" / "API" / "DTO" / "transcribe" / "ASR" 等技术词在用户可见处
- ❌ FAIL: 用 D-062xx / D-063 等内部代号
- ✅ PASS: 用"小华XX"或人话, 例: "小华帮你整理" / "今天最值得拍的 3 个" / "提取并洗成你的爆款"

例外: 平台名 (抖音/小红书/B 站) 是用户认得的, OK

### 2. 设计文档完整性 ✅
> 来源: feedback_design_doc_completeness.md
> 原话: "跨窗口设计文档必须含业务 WHY/用户故事/系统关系，不能只写 UI 规格"

spec.md 必须有:
- 业务 WHY (这个 page 解决什么问题, 不解决又如何)
- 用户故事 (主路径 + 至少 1 反例)
- 系统关系 (跟其它 page / backend / skill 的衔接)
- 边界 case (空态/错误态/加载态)
- 不做的事 (明确不动什么, 防 scope 蔓延)

只有 UI 规格的 → FAIL

### 3. 入口可见性 ✅
> 来源: feedback_product_decisions.md
> 原话: "入口可见性 > 侧栏简洁, 日常感知功能给一级入口而不是藏设置"

- ❌ FAIL: 高频功能藏 ▾ popover / 折叠区 / "更多 →"
- ❌ FAIL: "去设置里开关 X" 这种引导
- ✅ PASS: 用户日常用的, 给一级入口或 tab; "次按钮" 是 OK 的

### 4. 不扣玉米 ✅
> 来源: feedback_design_workflow_mockup_first.md
> 原话: "UI 大改先出可视化 mockup HTML, 清华哥点头后再写代码, 不扣玉米"

- ❌ FAIL: spec 还没把核心想清楚就跳到 implementation
- ❌ FAIL: mockup 只画一半 (比如只画主路径不画空态/错误态)
- ❌ FAIL: 部分细节"todo: 待清华哥确认"还塞着, 没自审定

本次特权下: cron 必须自己定完所有"待确认"项, 不留悬念

### 5. 工厂部门心智一致性 ✅
> 来源: project_neironggongchang.md
> 原话: "命名一致性: 用户能看到的所有页面命名走'工厂部门'心智 (总部/生产部/档案部/夜班), 避免技术词"

- ❌ FAIL: 在 mockup 里把 "首页" 写成 "首页" (该叫"总部")
- ❌ FAIL: 把 "我的视频" 写成 "Works" / "Library" 之类英文

### 6. 视觉规范 ✅
> 来源: 现有 web/factory-tokens.jsx + step1-mockup-v2.html

- ❌ FAIL: 引入新色 (蓝/红/紫等) 没复用 brand 绿色调
- ❌ FAIL: 按钮 padding/radius 跟现有 btnPrimary/btnGhost 不一致
- ❌ FAIL: 用 emoji 当主图 (project memory 说"避免 emoji" — 但 brand 已有约定 emoji 可继续用)

### 7. 删开发者向自嗨文案 ✅

- ❌ FAIL: 出现 "(跨页 state 已通)" / "(D-062xx)" / "(backend 待接)" 等研发括号
- ❌ FAIL: 出现 "P0 / P1" / "Phase 1-3" 在用户可见处
- ✅ PASS: 用人话, 例: "提完会自动填回, 你再看要不要改"

### 8. 部署演进可移植 ✅
> 来源: project_neironggongchang.md "部署演进路径"

- ❌ FAIL: 硬编码 `/Users/black.chen/...` 路径
- ❌ FAIL: 假设 chrome / dreamina CLI 必须可用 (要降级路径)
- ❌ FAIL: 引入 brew / launchd / 系统级依赖

---

## 加分项 (不强制, FAIL 不影响审核)

- 主次按钮视觉对比清晰 (主 brand 色实心, 次白底 outline)
- 状态行用 Tag 组件 (而不是裸文字)
- 空态有引导 (不是干巴巴的 "暂无数据")
- 跨 page 衔接自动化 (seed 机制 / banner)
- mockup 自带"演示说明"(用户能 1 分钟看懂交互)

---

## Cron 自审执行流程

每次 review stage:

```
1. 读 spec.md + mockup.html
2. 逐项过 1-8 项必过
3. 给每项打 PASS/FAIL + 理由
4. 全部 PASS → 写 <page>-review.md (PASS 报告) → 进 implement
5. 任一 FAIL → 写 <page>-review.md (FAIL 报告 + 改进项)
   → revise stage: 按改进项重写 mockup → 回 review
6. revise 循环上限 3 次, 超过 → 标 blocked + 进下一个 task (清华哥回来人工 unblock)
```

## 审核输出模板

`<page>-review.md`:

```markdown
# <Page> Review · Tick N · YYYY-MM-DD HH:MM

## 审核结果: PASS / FAIL (revise 第 K 次)

## 必过项

| # | 项 | 结果 | 备注 |
|---|---|---|---|
| 1 | 命名拟人化 | PASS/FAIL | ... |
| 2 | 设计文档完整 | PASS/FAIL | ... |
| 3 | 入口可见性 | PASS/FAIL | ... |
| 4 | 不扣玉米 | PASS/FAIL | ... |
| 5 | 工厂部门心智 | PASS/FAIL | ... |
| 6 | 视觉规范 | PASS/FAIL | ... |
| 7 | 删自嗨文案 | PASS/FAIL | ... |
| 8 | 部署可移植 | PASS/FAIL | ... |

## FAIL 项的改进 action (revise 用)

1. ...
2. ...

## 加分观察

- ...
```
