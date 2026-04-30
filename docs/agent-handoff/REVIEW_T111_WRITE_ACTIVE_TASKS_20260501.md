# Review Report

## 任务 ID

T-111

## 审查对象

- 任务: T-101 写文案首页"正在写 / 可继续"摘要 + 一键恢复
- 实现 commit: `bd0eaebe53beb303f55501ee297338fe98665d0a` (`feat: show active writing tasks on write home`, on main)
- 开发交接: `docs/agent-handoff/DEV_CONTENT_T101_WRITE_ACTIVE_TASKS_20260501.md`
- QA 交接: `docs/agent-handoff/QA_T110_WRITE_ACTIVE_TASKS_20260501.md` (commit `7802b7b`)
- 改动文件: `web/factory-write.jsx` (+229/-6), `scripts/e2e_write_active_tasks.js` (新增 360 行)
- 审查分支: `codex/review` HEAD `45dbb9023aac0c41018d93c9625ce6e040ac1a13`, 只读对照 main 实现, 未改业务代码

## P0 风险

无.

## P1 风险

无.

## P2 风险

### P2-1 点击"继续看进度 / 回去处理"会覆盖该工具已存的整份 wf 快照

- 文件: `web/factory-write.jsx:222-240` (`resumeSnapshotForTask` + `resumeWritingTask`)
- 现状: `resumeWritingTask` 把 `wf:<wf>` 直接写成 `{ step, taskId|writeTaskId, versions: [] }` 这个最小快照, 不合并已有快照. 落到 `useWorkflowPersist` (`web/factory-persist.jsx:9-49`) 时, onRestore 只 set step + taskId + versions=[], 其余字段保持 useState 初值, 500ms 后防抖 effect 再把"残缺态"完整写回 `wf:<ns>`, 永久覆盖 hotspot/transcript/text/topic/titles/outline/pickedAngle/pickedTitle/result 等已有上下文.
- 影响最大的是公众号长文 (`wf:wechat`): 自动流程或手动 写长文 step="write" 阶段, 用户已选 `pickedTitle` / `outline`, 点摘要回去后 step 仍是 "write", 但 `topic / titles / pickedTitle / outline` 会被清空, 只剩 `writeTaskId` 触发 poller 拉远端 partial. 用户原本辛苦挑的标题和大纲在 localStorage 里彻底丢失.
- 触发路径 (公众号示例):
  1. 写文案 → 公众号长文, 输入选题, gen 标题, 选标题, gen 大纲 → wf:wechat 已经存了 topic/titles/pickedTitle/outline.
  2. 进入 step="write" 跑 wechat.write, 任务开始 running, writeTaskId 已落.
  3. 切回写文案首页, 看到"公众号长文 进行中".
  4. 点 "继续看进度" → resumeWritingTask 把 wf:wechat 覆盖为 `{step:"write", writeTaskId:id}`.
  5. 进 wechat 页, 重新 mount, 读到的快照里没有 topic/titles/outline/pickedTitle, 这些字段全部清回初值, 之后被防抖 effect 永久落地空值.
  6. 即使任务最终 ok, partial article 来了, 用户回看仍找不到自己挑的标题和大纲来源.
- 设计意图: dev 报告里写明"点击恢复会覆盖该工具当前浏览器里的旧工作流恢复 key; 这是为了让"回去看进度"一定落到被点击的任务", 是有意权衡的. 而且任务所需的真实生成输入仍在后端 task.payload 里, partial_result 走 poller 能拉回来 → 不构成 P0/P1 数据丢失.
- 但用户视角"继续看进度"语义上不应该把已挑好的大纲/标题/原文输入清掉. 侧边栏的常规跳转可以保留 wf 快照, 这条恢复入口反而更激进, 容易让人误踩.
- 建议 (供 T-098/T-095 类后续 polish 顺手收): 改成"读老 wf:<ns> 合并新字段"的方式
  ```js
  function resumeSnapshotForTask(task, rule, prevRaw) {
    let prev = {};
    try { prev = prevRaw ? JSON.parse(prevRaw) : {}; } catch (_) { prev = {}; }
    const snap = { ...prev, step: rule.step };
    if (rule.taskField) snap[rule.taskField] = task.id;
    else snap.taskId = task.id;
    return snap;
  }
  function resumeWritingTask(task, onNav) {
    const rule = getWriteTaskRule(task);
    if (!rule) return;
    try {
      localStorage.setItem(`task:${rule.ns}`, task.id);
      if (rule.wf) {
        const prevRaw = localStorage.getItem(`wf:${rule.wf}`);
        localStorage.setItem(`wf:${rule.wf}`, JSON.stringify(resumeSnapshotForTask(task, rule, prevRaw)));
      }
    } catch (_) {}
    onNav(rule.page);
  }
  ```
- 严重度: P2 (已记录在 dev 风险说明; 可走后续 polish)

### P2-2 stage 文案脱敏正则覆盖窄于 beta 作战室方案

- 文件: `web/factory-write.jsx:197-204` (`safeTaskText`)
- 现状: 命中即回退 fallback 的关键词为 `prompt|tokens?|route|model|provider|submit_id|api|/Users|/private|OpenClaw|DeepSeek|Opus|LLM`.
- 对比 `web/factory-beta.jsx` 的 `betaDesensitizeText` (T-077/T-079 沉淀): 还覆盖 `/Volumes /Library /Applications /opt /srv /home /root /tmp /var`、`~` 起头路径、`Bearer|Basic`、`sk-`/`tok-`、`authorization`/`x-...` 等 header、`watcher|daemon|credit|provider` 等内部字段名.
- 当前 `progress_text` 和 `progress_data.timeline.label/text` 是后端 pipeline 自己写中文, 实际泄漏概率低. 但失败兜底 (例如 LLM 抛原始 stack / 远端任务把英文 error 透传到 timeline) 仍可能出现 `Authorization`、`/Volumes/...`、`Bearer ...`. 此时 safeTaskText 不会兜住, 会被截到 42 字直接显示在首页摘要卡上.
- 严重度: P2. 当前正常路径无泄漏, 但脱敏防线建议向 betaDesensitizeText 看齐, 把 path/header/credit/sk-/tok- 加进黑名单.

### P2-3 缺 factory-write.jsx 静态文案/规则守则 (无回归保护)

- 文件: `tests/test_frontend_copy_static.py`
- 现状: 9 个测试覆盖 wechat / voice / beta 等, 没有 factory-write.jsx 任何断言.
- 风险: 后续如果有人在 WritingTaskCard 里随手加 `{task.kind}` / `{task.id}` 调试, 或把 7 条 WRITE_TASK_RULES 改残, 没有静态层兜底.
- 建议补 1-2 条断言:
  - `web/factory-write.jsx` 必须包含 7 条 prefix: `touliu.` / `hotrewrite.` / `voicerewrite.` / `baokuan.` / `planner.` / `compliance.` / `wechat.write`.
  - `web/factory-write.jsx` 不出现 `{task.kind`、`{task.id`、`{task.payload` 等模板.
  - safeTaskText 的黑名单字符串 (`prompt`、`tokens`、`/Users` …) 必须存在.
- 严重度: P2. 不加不影响当前功能, 但缺失保护伞.

### P2-4 e2e 提交脚本只覆盖 7 个工具里的 4 个

- 文件: `scripts/e2e_write_active_tasks.js`
- 现状: 提交脚本仅 mock 并断言 hotrewrite / compliance / baokuan / touliu 4 类回跳. QA T-110 报告里说"补充回跳覆盖 voicerewrite/planner/wechat: 3/3 pass" 但补充脚本未入库.
- 风险: voicerewrite / planner / wechat 三类回跳行为以后改了 ns / step / taskField, 没有 e2e 兜.
- 建议: 把 voicerewrite / planner / wechat 三个 mock task + 三次 click 加进 `runSummaryAndResume`, 保持 7 工具同等覆盖.
- 严重度: P2.

### P2-5 stale 失败任务过滤的边界案例

- 文件: `web/factory-write.jsx:167-184` (`getActiveWritingTasks`)
- 现状: 失败任务保留 3 天; 但 `const ts = task.finished_ts || task.updated_ts || 0; return !ts || now - ts < 3 * 24 * 3600;` —— 当 finished_ts 和 updated_ts 都缺失时 ts=0, `!ts` 为 true, 任务总会展示, 不会被 3 天阈值清掉.
- 风险: 异常 DB 行 (历史 task 没写 ts) 会一直挂在写文案首页. 当前实际数据应该都写了 ts, 影响极小.
- 建议: 把分支收敛成 `if (!ts) return false;` 或保底为 `now`, 避免无 ts 任务永久挂着.
- 严重度: P2.

## 缺失测试

- factory-write.jsx 7 工具回跳的静态/动态守则不全 (见 P2-3、P2-4).
- 没有针对 safeTaskText/getActiveWritingTasks/latestTimelineItem 的纯 JS 单测 (这些是 React 之外的纯函数, 可单独跑 node 校验).
- 没有覆盖 ">4 个任务被 slice 到 4" 的场景.
- 没有覆盖 "无 timeline 的旧任务回退到 progress_text" 的场景.

## 用户体验问题

- WritingTaskCard 失败态按钮文案为"回去处理", 进行中为"继续看进度", 文案到位.
- 首页投流卡 desc 把 "自动 lint 6 维质检" 改成 "自动 6 维质检" → 去技术词 lint, 符合 SYSTEM-CONSTRAINTS §5, 顺手收的对.
- 摘要区只展示 7 类文字 skill, 不会出现 dreamina / dhv5 / materials.scan 等媒体类任务, 边界正确.
- 摘要区 sort 把 running/pending 排前, 失败靠后, 符合"看进度优先"的直觉.
- 没看到对最近作品列表 (`recent` / RecentTextCard) 的回退, 顶部 4 张 stats 卡和 6 张工具卡也没改语义, 只调了 marginBottom 和 grid 列数对齐响应式.

## 建议交给谁修

P2 全部走后续 polish:
- 内容开发: P2-1 (resume 合并 wf 快照), P2-4 (e2e 三件套补齐), P2-5 (stale ts 边界).
- 内容开发或控制台: P2-2 (safeTaskText 黑名单往 betaDesensitizeText 看齐).
- 内容开发或 QA: P2-3 (test_frontend_copy_static 增 factory-write 守则).

## 下一步建议

- T-101 验收通过, 可在写文案首页放心使用. 后续 polish 在下一个写文案相关任务里顺手收.
- 若老板更激进想保住已经选好的标题/大纲, 可以单独排一条 P2-1 修复任务给内容开发.
- 完成 / 阻塞标记走 agent_queue done T-111.

## 是否需要老板确认

否. 没有 P0/P1, 不影响最近作品和原有 6 工具卡入口; 5 条 P2 都是后续 polish 议题, 不卡当前合并.
