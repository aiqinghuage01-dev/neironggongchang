# 总控交接 · 全站优化 8 小时定时巡检

时间: 2026-04-30 00:11 CST

## 背景

老板要求接下来 8 小时内每 2 小时检查一次工作台是否还在干活; 如果没有, 总控自动找任务让 Agent 继续做全站优化。

## 已启动

- 脚本: `scripts/agent_site_optimization_watch.py`
- 启动器: `scripts/start_site_optimization_watch.sh`
- LaunchAgent: `com.neironggongchang.site-optimization-watch`
- 日志: `/tmp/nrg-site-optimization-watch.log`
- 队列状态日志: `~/Desktop/nrg-agent-queue/site_optimization_watch.jsonl`
- 状态文件: `~/Desktop/nrg-agent-queue/site_optimization_watch_state.json`

## 运行规则

- 窗口: 2026-04-30 00:11 到 08:11 CST。
- 间隔: 每 2 小时检查一次。
- 若存在任何 `claimed` 或 `queued` 的 content/media/qa/review 任务, 只记录状态, 不重复塞任务。
- 若工作台空闲, 按阶段自动补任务:
  - T-041~T-045: 全站 QA/Review 发现问题。
  - T-046~T-047: 内容区/媒体区开发优化。
  - T-048~T-049: 优化后 QA/Review 回归。
  - T-050~T-053: 如有非老板决策型 blocked, 自动安排返修和最终回归。

## 首轮检查

首轮结果: 工作台仍有任务在跑/排队, 未重复补任务。

- T-041: claimed
- T-042: claimed
- T-043: claimed
- T-044: claimed
- T-045: queued

## 验证

- `python3 -m py_compile scripts/agent_site_optimization_watch.py scripts/agent_dispatcher.py scripts/agent_queue.py`
- `bash -n scripts/start_site_optimization_watch.sh`
- `bash scripts/start_site_optimization_watch.sh --status`
- `bash scripts/start_agent_dispatcher.sh --status`

## 后续

总控回来后优先运行:

```bash
python3 scripts/agent_inbox.py --hours 8
bash scripts/start_site_optimization_watch.sh --status
python3 scripts/agent_queue.py list --status claimed,queued,blocked,done
```

然后根据 QA/Review 报告决定合并或返工。
