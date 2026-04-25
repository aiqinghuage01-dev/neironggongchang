# 24h 全站审计 SUMMARY · 2026-04-26 01:00 完成

> 启动: 2026-04-25 23:31 CST
> 完成: 2026-04-26 01:00 CST (实耗 1 小时 30 分, 比 24h 计划快 16 倍)
> 提前完成原因: 切手动连跑代替依赖 cron 触发 — session-only cron 在用户高频对话下经常错过 idle, 不可靠

## 落地清单 (19 task)

| # | Page | 状态 | 关键改动 |
|---|---|---|---|
| 1 | make-step1 | ✅ | popover 三选一 → 4-tab 按内容来源分流 (📹别人的视频 / 🎙️我自己录的 / 🔥今天的热点 / ✏️已写好的文案); 解决了改写 skill 语义错配 |
| 2 | make-step2-3-4-5 | ✅ | 删 video_id/work_id/output_path 暴露; 柿榴合成中→小华正在合成数字人; mp4→数字人视频/成片; 删 (D-061g 接通) 等开发代号; 渲染失败 stderr 折叠+加常见原因翻译 |
| 3 | home (总部) | ✅ | "早上好"写死 → greetingByHour() 时间感知; SkillCard 删 {steps}步/SKILL.md mtime/slug; 未接入卡删 python3 scripts CLI 暴露; 删 ~/Desktop/skills/ 硬编码路径 |
| 4 | baokuan | ✅ | V1+V2/V3+V4 → 2版/4版人话; "skill 严禁..." 改人话; **接通 task #1 留的 baokuan_seed_auto_analyze flag** — 现在 tab 1 "提取并洗成我的爆款" 真一键到 V1/V2 |
| 5 | hotrewrite | ✅ | FromMake banner 删完成态/CTA; "低压 CTA" → "轻引导不硬塞" |
| 6 | voicerewrite | ✅ | banner 同; "skill 严禁把你的话改成广告" → "不会把你的话改成广告 · 删口头禅, 不改观点" |
| 7 | ad (投流) | ✅ | "本地 lint 质检 (scripts/lint_copy_batch.py)" → "字数/重复度/分配 终检"; PASS/FAIL → 通过/没过; "lint" 全清 |
| 8 | wechat (公众号) | ✅ | "mmbiz URL/footer-fixed/premailer/微信 markup" 等 6 处技术词改人话; "HTML 拼好了" → "排版好了" |
| 9 | moments (朋友圈) | ✅ | 扫无技术词暴露 |
| 10 | planner | ✅ | "拉 SKILL.md 6 模块结构" → "拉 6 模块结构" |
| 11 | compliance | ✅ | 扫无技术词暴露 |
| 12 | dreamina (即梦) | ✅ | "📋 提交输出 (raw)" → "📋 看提交细节 (一般不用看)"; "查询输出 raw" → "没找到媒体, 看下技术细节" |
| 13 | materials (素材库) | ✅ | 扫无技术词暴露 |
| 14 | works (作品库) | ✅ | 删列表卡 "柿榴 #shiliu_video_id"; 详情面板 "status=published · shiliu=xxx" → "状态: 已发" Tag |
| 15 | knowledge | ✅ | 扫无技术词暴露 |
| 16 | nightshift (夜班) | ✅ | 扫无技术词暴露 |
| 17 | settings | ✅ | 删 speaker_id={id} / avatar_id={id} mono ID 暴露 |
| 18 | cross-page-consistency | ✅ | 全站残留 grep + 27 个 jsx 全部 @babel/parser PASS; flow.jsx 同步删 video_id/workId 暴露 |
| 19 | summary | ✅ (本文件) | — |

## 8 项审核标准全员 PASS

按 `docs/design/audit/SELF_REVIEW.md`:
1. 命名拟人化 ✅ — 用户可见处全清 video_id/work_id/skill 严禁/D-06x/CTA 跑偏 等技术词, "柿榴合成中" 改"小华正在合成"
2. 设计文档完整 ✅ — task #1 含 spec_v2.md + mockup_v2.html + verify.md; task #2 含 survey/plan/verify
3. 入口可见性 ✅ — 4 tab 一级入口替代 popover 折叠 (task #1); 主路径都不在 ▾ 后面
4. 不扣玉米 ✅ — 没留 todo / "待清华哥确认", 全自决落地
5. 工厂部门心智 ✅ — 总部/生产部/档案部/夜班 一致
6. 视觉规范 ✅ — 全站复用 T.brand / Tag size=xs / btnPrimary/Ghost / 大圆角绿边 hero
7. 删自嗨文案 ✅ — D-061g+/D-062kk-ext/D-063 / "(后续: 由编导维护...)" / "(跨页 state 已通)" 全清
8. 部署可移植 ✅ — 删硬编码 ~/Desktop/skills/ / python3 scripts/ 路径

## Git commits

```
[24h-audit] task #1 · make-step1 4-tab 重构落地 (tick 1)
[24h-audit] task #1 make-step1 plan 产物归档
[24h-audit] tick 2 · task#2 make-step2-3-4-5 survey
[24h-audit] tick 3 · task#2 plan
[24h-audit] task #2 · make-step2-3-4-5 文案/错误态全改 (tick 4)
[24h-audit] task #3 · home (总部看板) 文案 + 开发字段清理 (tick 5)
[24h-audit] task #4 · baokuan 文案 + 接通 auto_analyze (tick 6)
[24h-audit] task #5 hotrewrite + task #6 voicerewrite 文案 (tick 7)
[24h-audit] task #7-#17 批量扫改 (tick 8)
[24h-audit] task #18 + #19 跨 page 一致性 + SUMMARY (tick 9)
```

## 本次过程的反思 (清华哥审完可决定要不要存 memory)

1. **session-only cron 不可靠**: 每次清华哥发消息我处理时都不 idle, cron 在那一刻触发就跳过. 应该一开始就**手动连跑**, 不依赖任何 cron 工具
2. **macOS TCC 卡 launchd**: ~/Desktop/ 受 TCC 保护, launchd plist 子进程被拒 (Operation not permitted). user crontab 也可能被拒, 除非 /usr/sbin/cron 已加 Full Disk Access
3. **改文案 > 改 UI**: 大部分 page 的痛点是技术词暴露 (D-xxx 代号 / mp4 / video_id / 柿榴 / SKILL.md / python 命令), 不是 UI 大改
4. **task #1 留的 auto_analyze flag**: 在 task #4 baokuan 接通后, "tab 1 提取并洗" 才真正一键到 V1/V2. 跨 task 联动通过 localStorage flag 实现, 不需要改 backend

## 后续 backlog (本次范围外)

- 录音文件直传 (task #1 tab 2 引导用户去飞书妙记/讯飞听见, 不接独立 ASR)
- AI 自动改 (D-061g+ 删了文案暴露但能力本身留 backlog)
- 模板 align 字段 form UX 优化 (Step 4 模板模式, 现状是字段表单)
- 跨 page wf snap 与 4-tab activeTab 字段兼容 (task #1 注意点, 已在 makeStepScript 内处理)
- backend 改动 (本次审计仅前端, backend.py 全无动)

## Cron 状态

session-only cron `cd4663ee` 仍在跑 (5,25,45 分触发). 任务都 done 了, 可以手动 CronDelete 或让它 7 天后自动 expire.
若 24 小时后还在 (2026-04-26 23:31 CST), 触发的 tick 会读 PROGRESS.md 发现全部 done → 自动跳过.
