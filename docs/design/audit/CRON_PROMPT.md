# Cron Tick 标准 Prompt

> 这就是每 20 分钟 cron 触发时给 Claude 的指令.
> 不要修改这个文件 (cron 会读它). 如果要调整流程, 改 PROGRESS.md / SELF_REVIEW.md.

---

## ROLE

你是清华哥 (内容工厂项目主理人) 的 AI 助手, 在执行 24h 全站审计 cron 任务.

**特权 (清华哥本次明确授权)**:
- "直接动代码, 铁律暂时解除"
- "你模拟我本人去审核"
- "我出门了, 回来看结果"
- "如果遇到没有完成的任务, 往后顺延"

**含义**:
- 可以直接改 `web/factory-*.jsx`, 不需要等清华哥点头 mockup
- 但每个 page 改之前 (plan stage) 用 SELF_REVIEW.md 8 项严苛自审
- 改完 (verify stage) 再过一遍 8 项, 全 PASS 才 commit
- 一个 tick 时长有限 (20 min cron 间隔), 一个 stage 做不完不要硬撑, 标 in_progress 退出 — 下个 cron 续

## 起手 (每 tick 必做)

```bash
cd /Users/black.chen/Desktop/neironggongchang
git status --short
cat docs/design/audit/PROGRESS.md
```

1. cwd 不对 → cd 过去
2. git status 有未提交 → 先看是不是上次 tick 残留:
   - 是 → 接着 commit (commit message `[24h-audit] tick N · task K · stage X`)
   - 不是 → stash 留给清华哥, 继续干
3. PROGRESS.md 有 `in_progress` task → 续做该 stage
4. 没有 in_progress → 拉下一个 `pending` task, 标 `in_progress` + `survey` stage

## 时间预算

- 1 个 tick (20 min) 推进 1 个 stage
- 4 stage / page = 80 min / page
- 19 page * 80 min = 1520 min = ~25 h (略超 24h, 顺延 OK)

## Stage 操作详情

### survey (~15 min)

```bash
# 读 page 自身
cat web/factory-<page>.jsx | head -200
wc -l web/factory-<page>.jsx

# 找关联 backend
grep -rn "/api/<page>" backend/ 2>/dev/null

# 找 skill source (如果是 skill page)
ls ~/Desktop/skills/ | grep -i <相关词>
```

写 `docs/design/audit/<page>-survey.md` 简短 (200 字内):
- 现有 stage 数 / 行数 / 关键 component
- 调用的 API endpoints
- localStorage seed key (跨 page 衔接)
- 显眼的问题 (一眼能看出的 bug / UX 卡点)

进入 plan stage. PROGRESS.md 标 stage = plan.

### plan (~15 min)

读 SELF_REVIEW.md 的 8 项, 对当前 page 现状逐项过.

写 `docs/design/audit/<page>-plan.md` (用 SELF_REVIEW.md 提供的模板).

如果发现 page 已经"够好" (8 项全 PASS, 不需要改) → 标 done, 跳过 implement/verify, 进下一个 task.

否则进 implement. PROGRESS.md 标 stage = implement.

### implement (~20-40 min, 可能 2 tick)

严格按 plan.md 改 `web/factory-<page>.jsx`.

- 一个 tick 改不完 → 提交当前进度 (WIP commit, message `[24h-audit] WIP tick N task K implement`) + 标 in_progress + 退出
- 一个 tick 改完 → 进 verify

### verify (~10 min)

```bash
# 视觉对照 (启用现有 dev server 或本地浏览器看)
ls logs/ | tail -5  # 看 dev server 是否还在跑

# 跑一遍 8 项自审
# 写 docs/design/audit/<page>-verify.md
```

8 项全 PASS:
- `git add web/factory-<page>.jsx docs/design/audit/<page>-*.md`
- `git commit -m "[24h-audit] task K · <page> 重构落地 (tick N)"`
- PROGRESS.md 标 done + 写 last tick 日志
- 进下一个 task

任一 FAIL:
- 改回去, revise (上限 3 次)
- 3 次过不了 → 标 blocked + 写 blocker 原因到 PROGRESS.md + 进下一个 task

## 触禁区 abort

不允许动:
- `backend/**.py`
- `pyproject.toml` / `requirements.txt`
- `.claude/**` / `settings.json`
- `cosyvoice_*` / `vendor/` / `data/`
- 已 done 的 task 的 jsx (避免覆盖)

如果一个 page 的 plan 发现必须改 backend → 标 blocked + 在 plan.md 写"blocker: 需要 backend 改 X" + 进下一个 task.

## 完成判定

PROGRESS.md 中所有 task `done` → 写 `docs/design/audit/SUMMARY.md`:
- 哪些 page 改了什么
- 哪些 blocked + 原因 (留给清华哥)
- 跨 page 一致性发现
- 后续建议

然后 CronDelete (用 CronList 找到 cron id).

## Tick 末尾必做

不管这次推进了什么 stage, tick 末尾必须:
1. 更新 PROGRESS.md (status / stage / last tick / 历史日志)
2. git add docs/design/audit/* + 当前 page jsx
3. git commit (除非确实没改任何东西)

不要让 git 树有未提交残留进入下一个 tick (会让下个 cron 起手判断"是不是上次残留"复杂化).

## 紧急停 (清华哥提前回来)

清华哥手动 CronDelete 即可. PROGRESS.md 自然停在最后状态.
