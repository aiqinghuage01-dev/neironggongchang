# Agent Board

> 多 Agent 模式下的临时看板. 总控 Agent 维护; 副 Agent 不直接改.

---

## 当前队形

| 角色 | 状态 | 工作区 | 当前任务 |
|---|---|---|---|
| 总控 Agent | 进行中 | `~/Desktop/neironggongchang` | 核验 QA 报告、登记修复任务 |
| 内容开发 Agent | 待启动 | `~/Desktop/nrg-worktrees/content-dev` | 待领 T-004 / T-005 |
| 媒体开发 Agent | 待启动 | `~/Desktop/nrg-worktrees/media-dev` | 待领 T-007 |
| QA 测试 Agent | 已完成 | `~/Desktop/nrg-worktrees/qa`, `~/Desktop/nrg-worktrees/qa-2` | QA-WECHAT / QA2-IMAGEGEN 真测不通过报告已提交 |
| 审查 Agent | 待启动 | `~/Desktop/nrg-worktrees/review` | 待分配 |

---

## 任务池

| ID | 业务目标 | 负责人 | 状态 | 文件范围 | 验收标准 |
|---|---|---|---|---|---|
| T-004 | 修公众号 Step 4 手动编辑正文没有进入后续配图/HTML/草稿的问题 | 内容开发 Agent | 待分配 | `web/factory-wechat-v2.jsx`; 必要 e2e 回归脚本 | QA 加标记后, `plan-images` 请求、HTML、草稿推送前 HTML 都包含编辑标记 |
| T-005 | 修公众号推送前 sanitize 把真实段间图和头像全部剥掉的问题 | 内容开发 Agent | 待分配 | `backend/services/wechat_scripts.py`, `tests/test_wechat_sanitize.py`; 如沉淀新坑同步 `docs/WECHAT-SKILL-LESSONS.md` | 真实 `mmbiz_url` 带 `?from=appmsg` 的本次上传图不被误剥; 非己方历史图仍安全处理; 回归测试覆盖 |
| T-006 | T-004/T-005 修后公众号 8 步链路复测 | QA 测试 Agent | 待分配 | 不改功能代码; 只提交报告/必要测试脚本需总控确认 | Playwright 真点真填 + console/pageerror=0 + 截图 + curl/pytest + 最小真烧; 草稿推送前 `img_count_sanitized >= 4` |
| T-007 | 修直接出图 apimart 单图成功后结果区显示 `0/0 成功`、不展示图片的问题 | 媒体开发 Agent | 待分配 | `backend/services/apimart_service.py`, `web/factory-image-gen.jsx`, 对应 tests/e2e; 避免改 `backend/api.py` 除非总控确认 | apimart watcher 单图 task.result 对齐 `{images:[...]}` 契约或前端兼容 raw 结果; 结果页展示生成图; 作品库仍正常入库 |
| T-008 | T-007 修后直接出图最小真烧复测 | QA 测试 Agent | 待分配 | 不改功能代码; 只提交报告/必要测试脚本需总控确认 | 1 张最低规格真烧; console/pageerror=0; 结果区显示 1/1 且有图; 作品库同图可见 |

---

## 最近证据

- QA 报告: `docs/agent-handoff/QA_WECHAT_20260429.md`
- QA 原提交: `cb3454c`
- 主线证据提交: `9031337`
- 结论: 不通过, 主链路能创建草稿, 但有 2 个 P1 阻塞真实验收.
- QA2 报告: `docs/agent-handoff/QA2_IMAGEGEN_20260429.md`
- QA2 原提交: `4f44f7a`
- 主线证据提交: `6f9fc3f`
- 结论: 不通过, 后端生图/入库成功, 但直接出图结果区显示 `0/0 成功` 且不展示图片.

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
