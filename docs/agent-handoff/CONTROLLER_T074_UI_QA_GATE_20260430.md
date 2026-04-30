# T-074 总控交接: 页面变更强制 QA 证据流程

时间: 2026-04-30

## 背景

老板确认: 只要涉及页面变化, 就必须测试。这条要成为多 Agent 流程门禁, 不能只靠总控口头记忆。

## 已改

- `docs/MULTI_AGENT_WORKFLOW.md`
  - 新增“用户可见页面变更门禁”。
  - 明确页面、文案、布局、交互、状态展示变更必须有 QA 证据后才能关闭。
  - 默认流程为开发 Agent 改、QA Agent 测、总控合并。
  - 总控直接小修页面也必须交付同等级 QA 证据。
- `docs/agents/ROLE_CONTROLLER.md`
  - 总控自然语言接单规则加入页面变更 QA 要求。
  - 新增“页面变更测试门禁”。
  - 没有 QA 证据时, 只能说“开发已改/待测”, 不能说“完成”。
- `docs/PROGRESS.md` / `docs/AGENT_BOARD.md` / `docs/TECHNICAL-DECISIONS.md`
  - 记录 T-074 / D-128。

## 规则口径

页面变更的最低 QA 证据:
- 变更后截图。
- console/pageerror/requestfailed/http error 统计。
- 真实点击、填写或切换证据。
- 涉及布局风险时覆盖桌面和窄屏。
- 涉及接口数据时补 curl 或接口返回证据。

## 验证

- `git diff --check` -> 通过。

## 注意

本次只改流程文档, 未触碰当前做视频页面未提交改动。
