# Agent Handoff

这里放多 Agent 协作的交接材料.

建议命名:

```text
YYYYMMDD-T001-dev-report.md
YYYYMMDD-T001-qa-report.md
YYYYMMDD-T001-review-report.md
YYYYMMDD-T001-controller-summary.md
```

规则:
- 开发 Agent 用 `TEMPLATE_DEV_REPORT.md`.
- QA Agent 用 `TEMPLATE_QA_REPORT.md`.
- 审查 Agent 用 `TEMPLATE_REVIEW_REPORT.md`.
- 总控可以把关键结论汇总进 `docs/AGENT_BOARD.md` 和 `docs/PROGRESS.md`.
- 不要把密钥、`.env`、真实 token 粘进报告.
- Agent 完成后必须自己写报告并 commit, 不让老板复制粘贴报告全文.
- 总控用 `python3 scripts/agent_inbox.py --hours 24` 扫描所有 worktree 报告.
- 需要自动提醒时, 开 `bash scripts/start_agent_monitor.sh`.
