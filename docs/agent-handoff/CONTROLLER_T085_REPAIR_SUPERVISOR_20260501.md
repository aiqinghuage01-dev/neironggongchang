# 总控交接: 热点改写实时进度返修与自动返修主管

时间: 2026-05-01

## 背景

老板反馈两件事:
- 多 Agent 流程里 QA/Review 打回后, 队列会停在 blocked, 不够自动化。
- 热点改写页面实测仍只是显示“正在写第 N/4 版”, 没有把已完成的一版先展示出来; V4 曾长时间黑箱等待。

## 队列处理

- T-081 第一轮开发不合入: T-082 QA block 390px 布局, T-083 Review block 旧分支覆盖和 partial_result 脱敏风险。
- 已创建 T-085 内容返修: 基于最新 main, 保留 T-058 热点清洗防线, 修 partial_result/progress_data 语义和移动端 header。
- 已创建 T-086 QA 复测: 明确验收“running 中 V1 必须已可读, V2/V3/V4 继续生成; 慢 V4 有可解释状态或兜底”。
- 已创建 T-087 Review 复审: 明确审查 partial_result 展示清洗、终态语义、V4 慢请求策略。
- 已重排 T-084: 等 T-086/T-087 通过后, 再推广到所有写文案功能。

## 自动化修复

新增通用返修主管:

- `scripts/agent_repair_supervisor.py`
- `scripts/start_agent_repair_supervisor.sh`

能力:
- 只扫描新增 QA/Review blocked, 不翻旧账。
- 如果不需要老板决策, 且能追到上一轮 content/media 开发任务, 自动创建:
  - 返修开发任务
  - 返修后 QA
  - 返修后 Review
- worker 技术退出但未 done/block 时最多自动重置 3 次。
- 不自动合并、不改业务代码、不替老板做 credits/业务选择。

已接入:
- `scripts/start_agent_workbench.sh` 日常工作台启动时同步启动返修主管。
- `docs/MULTI_AGENT_WORKFLOW.md` 记录自动返修主管规则。
- `docs/agents/ROLE_CONTROLLER.md` 记录总控检查命令。
- `docs/PROGRESS.md` 更新当前状态。

## 验证

- `python3 -m pytest -q tests/test_agent_repair_supervisor.py tests/test_agent_queue.py` -> 7 passed。
- `bash -n scripts/start_agent_repair_supervisor.sh scripts/start_agent_workbench.sh scripts/start_agent_dispatcher.sh` -> passed。
- `bash scripts/start_agent_repair_supervisor.sh --status` -> LaunchAgent running, pid 97353。
- 首次启动状态: 已忽略历史阻塞 16 条, 避免把旧任务重新翻出来; 后续新增阻塞会进入自动返修链。

## 当前未完成

热点改写实时输出功能仍在 T-085 返修中, 不能说已完成。下一步等 T-085 done 后, T-086/T-087 会自动领取; 若再次 blocked, 新返修主管会自动排下一轮。
