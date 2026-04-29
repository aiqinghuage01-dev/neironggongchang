# 多 Agent 协作工作流

> 目标: 让 3-5 个 AI 同时推进内容工厂, 但不互相覆盖、不让老板当传话筒、不把测试甩给用户.

---

## 1. 一句话原则

**多 Agent 可以并行, 但只有总控 Agent 能合并进主目录.**

每个会写代码的 Agent 必须满足:
- 一个独立 AI 会话
- 一个独立 git worktree
- 一个明确角色
- 一个明确文件范围
- 一个交付报告

---

## 2. 标准 5-Agent 队形

| 角色 | 推荐模型 | 工作目录 | 能否写代码 | 主要职责 |
|---|---|---|---|---|
| 总控 Agent | GPT 5.5 / Codex | `~/Desktop/neironggongchang` | 能 | 拆任务、分派、合并、最终验证、提交 |
| 内容开发 Agent | GPT 5.5 / Codex | `~/Desktop/nrg-worktrees/content-dev` | 能 | 公众号、投流、热点、录音、朋友圈、策划、合规 |
| 媒体开发 Agent | GPT 5.5 / Codex | `~/Desktop/nrg-worktrees/media-dev` | 能 | 数字人、生图、视频、声音、封面、媒体作品 |
| QA 测试 Agent | GPT 5.5 / Codex | `~/Desktop/nrg-worktrees/qa` | 默认不能 | 真实浏览器测试、截图、console、curl、pytest |
| 审查 Agent | Claude Opus | `~/Desktop/nrg-worktrees/review` 或交接文档 | 不能 | 代码风险、漏测、体验误导、规则违反 |

> 稳定前建议先跑 3-Agent: 总控 + 一个开发 + QA/Claude 审查.

---

## 3. 任务分派路由

老板只需要说业务目标, 总控按下表分派.

| 问题类型 | 派给谁 | 常见文件范围 |
|---|---|---|
| 公众号 / 投流 / 热点改写 / 录音改写 / 朋友圈 / 策划 / 合规 | 内容开发 Agent | `web/factory-*-v2.jsx`, `backend/services/*_pipeline.py`, 对应 tests |
| 数字人 / 即梦生图 / 视频 / 声音 / 封面 / 媒体作品展示 | 媒体开发 Agent | `factory-dhv5`, `factory-dreamina`, `image-gen`, `works`, `remote_jobs` |
| 任务系统 / 作品库 / 素材库 / 设置 / 知识库 / 首页统计 / 错误出口 | 平台类任务, 由总控单独派 | `tasks`, `works`, `materials`, `settings`, `factory-api`, `factory-errors` |
| 真点页面 / 真填表 / 截图 / console / curl / pytest | QA 测试 Agent | 不改功能代码, 只加必要测试脚本需总控确认 |
| 找风险 / 找漏测 / 产品体验挑刺 | 审查 Agent | 只读 diff、报告、截图 |

---

## 4. 禁止并行改的高风险文件

这些文件像主水管, 同一时间只允许一个 Agent 改:

- `backend/api.py`
- `web/factory-app.jsx`
- `web/index.html`
- `web/factory-api.jsx`
- `web/factory-errors.jsx`
- `web/factory-task.jsx`
- `backend/services/tasks.py`
- `backend/services/remote_jobs.py`
- `backend/services/migrations.py`
- `shortvideo/ai.py`
- `shortvideo/works.py`
- `docs/PROGRESS.md`
- `AGENTS.md`
- `CLAUDE.md`

规则:
- 副 Agent 不改 `docs/PROGRESS.md`.
- 入口文档只由总控改.
- 两个开发 Agent 不同时改同一个大文件.

---

## 5. 每日开工流程

总控 Agent 先做 5 件事:

1. 读 `AGENTS.md` / `CLAUDE.md`, `docs/PROGRESS.md`, `docs/SYSTEM-CONSTRAINTS.md`.
2. 把老板目标拆成任务, 写进 `docs/AGENT_BOARD.md`.
3. 给每个任务指定角色、worktree、文件范围、验收标准.
4. 用 `scripts/create_agent_worktree.sh` 创建或复用 worktree.
5. 给每个 Agent 一段可复制的任务说明.

老板只需要给总控一句:

```text
今天启动多 Agent 模式。
目标:
1. 修公众号最卡的链路
2. 修数字人/生图作品库展示
3. QA 回归昨天合并的功能
4. Claude 只审查, 不改代码
```

---

## 6. 交付物标准

### 开发 Agent 必须交付

- 改了什么
- 改了哪些文件
- commit hash
- 局部测试结果
- 没测到的地方
- 需要 QA 重点测什么

### QA Agent 必须交付

- 打开了哪个页面
- 点了哪些按钮
- 填了什么内容
- 截图路径
- console/pageerror 是否为 0
- curl / pytest 结果
- bug 清单和复现步骤

### 审查 Agent 必须交付

- P0/P1/P2 风险
- 可能影响的旧链路
- 缺失测试
- 用户体验误导点
- 建议交给哪个 Agent 修

### 总控 Agent 必须交付

- 合并了哪些分支
- 处理了哪些审查/QA 问题
- 最终验证结果
- `docs/PROGRESS.md` 更新
- 最终 commit

---

## 7. Git worktree 操作

创建工作区:

```bash
bash scripts/create_agent_worktree.sh content-dev
bash scripts/create_agent_worktree.sh media-dev
bash scripts/create_agent_worktree.sh qa
bash scripts/create_agent_worktree.sh review
```

查看工作区:

```bash
git worktree list
```

进入某个 Agent 的工作区:

```bash
cd ~/Desktop/nrg-worktrees/content-dev
```

每个 Agent 开工前必须确认:

```bash
pwd
git branch --show-current
git status --short
```

---

## 8. 合并规则

副 Agent 完成后, 总控在主目录做:

```bash
cd ~/Desktop/neironggongchang
git diff main...codex/content-dev
git merge --no-ff codex/content-dev
```

如果分支只需要其中一部分:

```bash
git cherry-pick <commit-hash>
```

合并后必须跑项目规定的真实验证. 代码作者自己的“测过了”不算最终验收.

---

## 9. 老板操作口诀

你不用给每个 AI 分技术任务. 只要告诉总控:

```text
今天我要解决哪些业务问题。
哪些可以并行。
哪些必须真实测试。
Claude 只做审查还是也能提方案。
```

总控负责翻译成:

```text
谁负责
在哪个工作区
能改哪些文件
怎么验收
什么时候合并
```
