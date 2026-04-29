# Agent Board

> 多 Agent 模式下的临时看板. 总控 Agent 维护; 副 Agent 不直接改.

---

## 当前队形

| 角色 | 状态 | 工作区 | 当前任务 |
|---|---|---|---|
| 总控 Agent | 待启动 | `~/Desktop/neironggongchang` | 拆任务、合并、最终验证 |
| 内容开发 Agent | 待启动 | `~/Desktop/nrg-worktrees/content-dev` | 待分配 |
| 媒体开发 Agent | 待启动 | `~/Desktop/nrg-worktrees/media-dev` | 待分配 |
| QA 测试 Agent | 待启动 | `~/Desktop/nrg-worktrees/qa` | 待分配 |
| 审查 Agent | 待启动 | `~/Desktop/nrg-worktrees/review` | 待分配 |

---

## 任务池

| ID | 业务目标 | 负责人 | 状态 | 文件范围 | 验收标准 |
|---|---|---|---|---|---|
| T-001 | 示例: 公众号链路问题 | 内容开发 Agent | 待分配 | 由总控填写 | QA 真测 + 审查通过 |
| T-002 | 示例: 数字人/生图作品展示问题 | 媒体开发 Agent | 待分配 | 由总控填写 | QA 真测 + 审查通过 |
| T-003 | 示例: 昨日功能回归测试 | QA 测试 Agent | 待分配 | 不改功能代码 | 截图 + console + pytest/curl |

---

## 状态约定

- `待分配`: 只有业务目标, 还没开工.
- `进行中`: Agent 已领取, 正在 worktree 内处理.
- `待 QA`: 开发完成, 等 QA 真测.
- `待审查`: 开发完成, 等 Claude/审查 Agent 看风险.
- `待合并`: QA 和审查问题已处理, 等总控合并.
- `已完成`: 总控已合并、验证、提交.
- `阻塞`: 需要老板决策或外部资源.

---

## 今日启动模板

```text
今天启动多 Agent 模式。

目标:
1.
2.
3.

并行安排:
- 内容开发 Agent:
- 媒体开发 Agent:
- QA 测试 Agent:
- 审查 Agent:

总控要求:
- 副 Agent 不改 docs/PROGRESS.md
- 每个开发 Agent 只改自己的文件范围
- QA 必须交截图/console/pytest/curl 证据
- 审查 Agent 只输出风险清单
```
