# 24h 全站审计进度 (cron 心跳文件)

> 启动: 2026-04-25 23:31 CST · 截止: 2026-04-26 23:31 CST
> Cron: `*/20 * * * *` (每 20 分钟, durable=true)
> 特权: 清华哥本次明确授权 — "直接动代码, 铁律暂时解除, 你模拟我本人去审核"
> 顺延规则: 一个 tick 做不完不要打断, 下个 tick 续 in_progress

## Stage 状态机 (4 stage, 简化版)

每个 page 走以下 stage, 一个 tick 推进 1 个 stage:

1. `survey` — 摸现状: 读 jsx + 关联 backend + 现有 spec/mockup
2. `plan` — 用 SELF_REVIEW.md 8 项标准自审, 决定改什么 + 写 `<page>-plan.md`
3. `implement` — 改 web/factory-<page>.jsx (允许!) 严格按 plan
4. `verify` — 视觉对照 plan + git commit + 标 done

`status`: pending / in_progress / done / blocked

## 任务清单 (按优先级)

| # | Page | Status | Stage | Last Tick | 备注 |
|---|---|---|---|---|---|
| 1 | make-step1 | done | commit | tick 1 | step1-mockup-v2.html 已审过 + 直接实施 + 8 项自审 PASS |
| 2 | make-step2-3-4 | done | commit | tick 4 | 4 step 文案 + 错误态全改, 8 项 PASS, -4 行净 |
| 3 | home | done | commit | tick 5 | 早上好动态化 + SkillCard 删开发字段 + 未接入卡删 python 命令 + 删 ~/Desktop/ 路径 |
| 4 | baokuan | done | commit | tick 6 | V1+V2/V3+V4 → 2版/4版人话, "skill 严禁" → 人话, 加 task#1 留的 auto_analyze 自动触发, FromMake banner 文案 |
| 5 | hotrewrite | done | commit | tick 7 | FromMake banner 友好化 + "低压 CTA" → "轻引导不硬塞" |
| 6 | voicerewrite | done | commit | tick 7 | FromMake banner 友好化 + "skill 严禁" → 人话 |
| 7 | ad | done | commit | tick 8 | lint 技术词清理 + scripts/python 路径删 + 终检文案人话化 |
| 8 | wechat | done | commit | tick 8 | mmbiz/footer-fixed/premailer/markup → 人话; HTML 拼好了 → 排版好了 |
| 9 | moments | done | commit | tick 8 | 扫无明显技术词暴露 |
| 10 | planner | done | commit | tick 8 | 'SKILL.md 6 模块结构' → '6 模块结构' |
| 11 | compliance | done | commit | tick 8 | 扫无明显技术词暴露 |
| 12 | dreamina | done | commit | tick 8 | submitResult/queryResult JSON details summary 改人话 |
| 13 | materials | done | commit | tick 8 | 扫无明显技术词暴露 |
| 14 | works | done | commit | tick 8 | 删 '柿榴 #shiliu_video_id' / status= 暴露, 改人话状态标签 |
| 15 | knowledge | done | commit | tick 8 | 扫无明显技术词暴露 |
| 16 | nightshift | done | commit | tick 8 | 扫无明显技术词暴露 |
| 17 | settings | done | commit | tick 8 | 删 speaker_id={id} / avatar_id={id} mono ID 暴露 |
| 18 | cross-page-consistency | pending | — | — | 跨 page 视觉/命名一致性 |
| 19 | summary | pending | — | — | 全站汇总报告 |

## 当前 in_progress

(空 — 下个 tick 拉 task #3 home)

## 历史 tick 日志

- tick 1 · 2026-04-25 23:55 · task#1 make-step1 · 直接 implement (mockup 已审过) · 8 项自审 PASS · +201 行
- tick 2 · 2026-04-25 23:55 · task#2 make-step2-3-4-5 · survey · 4 step 痛点是文案/错误态/技术词暴露 (非 UI 大改)
- tick 3 · 2026-04-26 00:09 · task#2 plan · P0/P1/P2 痛点分级 + 8 项改造矩阵 + 实施步骤 (手动跑, cron :07 错过 idle)
- tick 4 · 2026-04-26 00:30 · task#2 implement+verify · 4 step 文案/错误态全改, 8 项 PASS, -4 行净 (手动跑, 切 /loop 后立即执行)
- tick 5 · 2026-04-26 00:35 · task#3 home implement+verify · 早上好动态化 + 删开发字段 + 删硬编码路径, 8 项 PASS (放弃依赖 cron, 切手动连跑)
- tick 6 · 2026-04-26 00:40 · task#4 baokuan implement+verify · 模式名人话化 + auto_analyze flag 接通 (task#1 留的) + FromMake banner 友好化, 8 项 PASS
- tick 7 · 2026-04-26 00:45 · task#5 hotrewrite + task#6 voicerewrite · 各 banner + 技术词清理, 同时落 (改动小)
- tick 8 · 2026-04-26 00:55 · task#7-#17 批量扫改 · ad/wechat/dreamina/works/settings/planner 改文案 + 删 ID 暴露; moments/compliance/materials/knowledge/nightshift 扫无问题

---

## Cron 自检 (每 tick 起手必做)

1. cwd 是 `/Users/black.chen/Desktop/neironggongchang`
2. `git status --short` 干净 (上次 tick 残留要先 commit 或 stash)
3. 读本文件: 有 `in_progress` 的 → 续做 stage; 没有 → 拉下一个 `pending` task
4. 时间 ≥ 启动 + 24h → 跳到 task #19 (summary) 然后 CronDelete + 写 SUMMARY.md

## 触禁区自动 abort

不允许动:
- `backend/**.py` (本次只前端审, 后端单独议题)
- `pyproject.toml` / `requirements.txt`
- `.claude/**` / `settings.json`
- `cosyvoice_*` / `vendor/` / `data/`

允许动:
- `web/factory-*.jsx` (implement 当前 task 的 page)
- `docs/design/audit/**`
- git add / commit (commit message 加 `[24h-audit]` 前缀)
