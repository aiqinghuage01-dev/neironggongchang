# 总控交接 · T-070 多 Agent 接管护栏

日期: 2026-04-30
角色: 总控 Agent

## 背景

老板指出当前发号施令后观感上像“总控自己在干活”。判断成立: 前一轮全站优化里, 总控承担了大量救火、跨模块收口和最终修复, 但队列缺少机制提醒“正常功能应先派副 Agent”。

## 已改

- `scripts/agent_queue.py`
  - 总控关闭 `content` / `media` / `qa` / `review` 任务时必须带 `--takeover-reason`。
  - 接管理由写入任务字段 `takeover_reason` / `takeover_at` 和事件日志。
  - `list` 输出接管理由, 方便看板排查。
- `scripts/agent_delegation_audit.py`
  - 统计所有由总控接管的 delegated task。
  - 可用 `--fail-on-missing` 检查历史任务是否缺接管理由。
- `docs/agents/ROLE_CONTROLLER.md`
  - 明确总控是技术负责人, 不是默认主力开发。
  - 规定总控只在 worker 卡死/跨模块冲突/紧急止血/最终验证收口时下场。
- `docs/MULTI_AGENT_WORKFLOW.md`
  - 增加总控接管审计流程。
- `tests/test_agent_queue.py`
  - 覆盖总控接管必须写 `--takeover-reason`。
  - 覆盖接管理由落库。
  - 覆盖普通副 Agent 关闭自己任务不需要接管理由。

## 验证

- `python3 -m py_compile scripts/agent_queue.py scripts/agent_delegation_audit.py`
- `python3 scripts/agent_queue.py done --help`
- `python3 scripts/agent_queue.py block --help`
- `.venv/bin/pytest -q tests/test_agent_queue.py`

## 后续规则

以后老板提出正常功能修改, 总控默认写入队列, 由 content/media/qa/review 执行。总控仍可救火, 但必须说明接管理由, 否则队列拒绝关闭副 Agent 任务。
