# Review Report

## 任务 ID

T-079

## 审查对象

- 仓库主目录: `/Users/black.chen/Desktop/neironggongchang` (分支 `main`)
- 审查的 diff: `git diff HEAD` 含两层
  - 已 staged: 把 `codex/content-dev` 的 T-075 实现 (ec8922d) 落到 main 工作树
  - 未 staged: 总控对 T-076/T-077 反馈的两类返修
    - 脱敏强化: `betaDesensitizeText` 正则覆盖扩面 (路径/凭证/host:port)
    - 响应式返修: 新增 `useBetaNarrow` 钩子, 顶栏/统计卡/任务行/时间线/日志证据全部按 `< 760px` 切换布局
- 涉及文件 (相对 HEAD 的累积变更):
  - `web/factory-beta.jsx` (+608 / -140, 整体重写为作战室)
  - `tests/test_frontend_copy_static.py` (+64 / -3, 新增 3 个 beta 守则, 强化标题脱敏断言, 保留 wechat/voice 守则)
  - `scripts/e2e_beta_warroom.js` (+216, 新增, 含真烧场景全敏感词扫描)
  - `docs/agent-handoff/DEV_CONTENT_T075_BETA_WARROOM_20260430.md` (+64, 新增)
- 审查方法: 只读 diff 加 `Read` 完整文件; 对照 T-077 已发现的 P0/P1/P2、T-076 阻塞反馈、CONTROLLER_T067/CONTROLLER_T048_T065 处置记录; 在主目录跑 `pytest tests/test_frontend_copy_static.py` 确认 7 项全过。

## P0 风险

无。

T-077 的 P0-1 (`tests/test_frontend_copy_static.py` 整文件被覆盖, wechat/voice 守则被删) 已闭环:
- 主目录 staged 版本仍保留 `test_wechat_copy_does_not_expose_layout_internals` (`tests/test_frontend_copy_static.py:7-26`) 与 `test_voice_copy_does_not_expose_transcription_internals` (`tests/test_frontend_copy_static.py:29-39`)。
- 主目录最终的 7 个测试全部通过 (`.venv/bin/pytest -q tests/test_frontend_copy_static.py` -> 7 passed)。

## P1 风险

无 P1 阻塞。T-077 的 P1-1 / P1-2 / P1-4 与 T-076 的 P1 (窄屏不可读) 已在本轮 unstaged 改动中处理:

- T-077 P1-1 路径正则覆盖不全 → `web/factory-beta.jsx:30` 已扩面为 `(?:~|\/(?:Users|Volumes|Library|Applications|opt|srv|home|root|private|tmp|var))\/[^\s"'<>),，。；;]+`, 覆盖 `~/`, `/Volumes/`, `/Library/`, `/Applications/`, `/opt/`, `/srv/`, `/home/`, `/root/`。
- T-077 P1-2 缺 API key / Bearer token 脱敏 → 新增三条 (`web/factory-beta.jsx:33-35`):
  - `\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+`
  - `\b(?:authorization|x[-_]?api[-_]?key|api[-_]?secret|openai[-_]?key)\s*[:=]\s*[^\s,，;；]+`
  - `\b(?:sk|tok)-[A-Za-z0-9_-]{12,}\b`
  全部归一为"凭证已隐藏"。
- T-077 P1-4 host:port 不带 scheme 漏脱敏 → `web/factory-beta.jsx:32` 改为 `(?:https?:\/\/)?(?:127\.0\.0\.1|localhost):\d+(?:\/[^\s"'<>)]*)?` 兼覆盖裸 `127.0.0.1:3456`。
- T-076 P1 窄屏不可读 → 新 `useBetaNarrow` (`web/factory-beta.jsx:150-158`) 在 < 760px 时:
  - 顶栏 `flex-direction: column`, 状态胶囊换到下一行并 `justify-content: flex-start` (`web/factory-beta.jsx:196-211`)
  - 标题 `fontSize: 19` + `lineHeight: 1.25` + `overflowWrap: anywhere`, 不再一字一行 (`web/factory-beta.jsx:200`)
  - 统计 4 卡 → 2 卡 (`web/factory-beta.jsx:241`)
  - 谁在干活卡片 → 单列 (`web/factory-beta.jsx:249`)
  - 当前任务 + 研发现场时间线 → 单列 (`web/factory-beta.jsx:256`)
  - 日志/代码证据 → 单列 (`web/factory-beta.jsx:273`)
  - `BetaTaskRow` 两列网格 + 标题/领取人 `gridColumn: "1 / -1"` 全宽换行 (`web/factory-beta.jsx:350-365`)
  - 日志条目 `flexWrap: wrap`, 文件名 `overflowWrap: anywhere`, 按钮 `flexShrink: 0` 防止被挤掉 (`web/factory-beta.jsx:428-444`)
  - `BetaKV` 标签列改为 `minmax(58px, 82px)`, 防止窄屏标签列吃掉值列 (`web/factory-beta.jsx:504`)
- T-077 P2-1 `slot.latest_commit` 是消费侧死字段 → `scripts/agent_dashboard.py:177 controller_slot()` 已在 927807b 真正提供 `latest_commit`, 这一项也顺带闭环 (无需阻塞)。

响应式返修没有引入新的安全/脱敏破绽 (审查要点 2 通过):
- 所有窄屏改动只是 `display/grid-template/whitespace/wrap/min-width/flex-shrink` 的 CSS 切换。
- 没有新数据通道或新 fetch, 没有新文本来源未走 `safeText / safeAgentName / safeFileLabel / safeCommit / safeLogText`。
- 唯一新增的浏览器副作用是 `window.addEventListener("resize", onResize)`, `useEffect` 已正确返回 `removeEventListener` 清理函数 (`web/factory-beta.jsx:152-156`)。

## P2 风险

### P2-1 缺脱敏函数级单元测试 (T-077 P1-3 降级)
- 位置: `tests/test_frontend_copy_static.py:48-66, 101-109`
- 现象: 静态测试只断言关键正则片段或函数名"出现在源码", 不调用 `safeLogText / betaDesensitizeText / safeFileLabel` 验证输出。如果有人把 `Volumes|Library` 改成 `Volumes` 同时漏改测试断言, 单测可能仍然过。
- 缓解: `scripts/e2e_beta_warroom.js` 用 Playwright 真渲染并对可见文本做 `forbidden` 正则全量扫描, 真正覆盖了 `safeLogText` 的输出口。这条 e2e 已经包含 `/Volumes`、`~/Desktop`、`/home`、`Bearer sk-...`、`x-api-key=...`、`127.0.0.1:3456`、`OpenClaw / DeepSeek / Opus / LLM / API / prompt / tokens / credits / Downloads / watcher / daemon / provider / submit_id / 4xx-5xx / 有人在跟` 等真实样本 (`scripts/e2e_beta_warroom.js:9-32, 125-135`)。
- 残留风险: e2e 脚本不在 `pytest` / `bash scripts/run_e2e_full.sh` 闭环里, 也不在自动派工器的常规跑量内, 必须开发或 QA 手跑。
- 建议: 把 e2e 脚本接入 `bash scripts/run_e2e_full.sh` 或加一个 `tests/test_beta_sanitizer_node.py` 用 `subprocess` 跑 `node -e "...require beta..."` 做单元级断言。**不阻塞本次合并**。

### P2-2 `\b(?:4|5)\d{2}\b` 异常状态正则仍偏宽 (T-077 P2-2 未变)
- 位置: `web/factory-beta.jsx:36`
- 现象: `412 个素材`、`已发 500 条数据` 这类合法三位数字仍会被替换成"异常状态"。属 UX 噪声, 非泄露。
- 建议: 收紧到 `\b(?:HTTP\s*)?(?:4\d{2}|5\d{2})\b` 或加上下文断言。不阻塞。

### P2-3 dashboard 服务 `:8765` 仍未做 API 级脱敏 (T-077 P2-3 未变)
- 位置: `scripts/agent_dashboard.py:97-113, 116-178`
- 现象: 学员若直接访问 `http://127.0.0.1:8765/api/status` 或 `/api/log` (跳过 beta 页 UI), 会看到:
  - `slots[*].workdir` 绝对路径 (`scripts/agent_dashboard.py:167`)
  - `slots[*].latest_commit` 中 `git log %h %s` 的提交 subject 原文 (`scripts/agent_dashboard.py:131-139`, 若 commit message 含路径/内部词不会被脱敏)
  - `slots[*].dirty_details` (git status 文件列表)
  - `logs[*].path` 绝对路径 (`scripts/agent_dashboard.py:107-112`)
- 评估: 当前 beta 页 UI 不消费 `workdir / dirty_details`, 消费 `latest_commit` 时通过 `safeCommit` 截 7 位短号, 走 `safeLogText` 处理摘要文本。所以从 beta 页面入口不会泄露。**仅当学员绕过前端直接访问 dashboard 后端**才会看到。
- 建议: 后续派一条独立任务做"dashboard 学员公开版", 在服务侧对 `workdir/path/dirty_details/commit subject` 也做 `betaDesensitizeText` 等价处理或干脆开 `/api/public-status` 仅暴露脱敏字段。**本轮不阻塞 T-075 收尾**。

### P2-4 `scripts/e2e_beta_warroom.js` 写死本机 playwright 路径 (T-077 P2-4 未变)
- 位置: `scripts/e2e_beta_warroom.js:3`
- 现象: `require("/Users/black.chen/.npm-global/lib/node_modules/playwright")`。换机器/换用户跑会 fail。
- 评估: `~/.claude/CLAUDE.md` 项目模板规定的写法; 也不会被 `tests/test_frontend_copy_static.py` 扫到 (静态测试只看 `web/factory-beta.jsx`)。
- 建议: 后续可改为 `process.env.PLAYWRIGHT_PATH || "playwright"` 兜底。不阻塞。

### P2-5 `safeAgentName` 把 `Claude` 整词替换为"审查", 出现"审查 审查"双词
- 位置: `web/factory-beta.jsx:57-59`
- 现象: 输入 `NRG Claude 审查自动` → 输出 `NRG 审查 审查自动`。T-076 QA 报告里也出现这一字面 (`docs/agent-handoff/QA_T076_BETA_WARROOM_20260430.md:34`).
- 评估: 不算泄露, 学员看到也能理解; 仅 UX 略冗。
- 建议: 在 `safeAgentName` 里做 `replace(/Claude\s*审查/gi, "审查")` 之类的去重或在统一表里登记完整名。不阻塞。

### P2-6 窄屏 `BetaTaskRow` 网格里有半行空白
- 位置: `web/factory-beta.jsx:347-368`
- 现象: 窄屏两列网格依次放 `id / 角色标签 / 状态胶囊 / 标题(span 1/-1) / 领取人(span 1/-1)`。第二行只放状态胶囊, 第二列空着。
- 评估: 视觉浪费一格不影响功能或安全。
- 建议: 把状态胶囊也加 `gridColumn: "1 / -1"` 或者改成单列 grid. 不阻塞。

### P2-7 `test_beta_page_static_copy_does_not_expose_internal_terms` 是字面子串扫源
- 位置: `tests/test_frontend_copy_static.py:77-98`
- 现象: 该测试对源文件做 `text not in src`, 任何注释/常量字符串里出现 `OpenClaw / Opus / LLM / API / prompt / tokens / credits / Downloads` 都会失败。当前用 `BETA_INTERNAL_WORDS = ["Open" + "Claw", ...]` 字符串拆分绕开。
- 评估: 这是有意设计, 强制后续改动也用拆分写法; 不是缺陷, 但对未来贡献者门槛高。
- 建议: 在文件头加一行注释说明"该列表必须保持拆分写法, 静态守则会按字面扫源", 防止后人误整理。不阻塞。

## 缺失测试

1. **`betaDesensitizeText / safeLogText / safeFileLabel / safeCommit / safeAgentName` 没有函数级单测**: 见 P2-1。当前完全靠 `scripts/e2e_beta_warroom.js` 端到端兜底, 但 e2e 不在自动 CI 里。
2. **`useBetaNarrow` 切换边界 (760px) 没有静态守则**: 如果未来有人把阈值改成 600 或 1024, `tests/test_frontend_copy_static.py` 不会发现, 只能靠 T-078 真渲染 QA。
3. **dashboard 服务侧脱敏没有测试**: 配合 P2-3, 后续若做服务侧脱敏需要补 pytest 覆盖 `/api/status` 输出不含 `Users / private / Volumes` 等。
4. **未把 `node scripts/e2e_beta_warroom.js` 接入 `bash scripts/run_e2e_full.sh`**: 见 P2-1 残留风险。

## 用户体验问题

- 窄屏标题、统计、任务、时间线、日志按钮的视觉走查靠 T-076 截图与本次响应式 diff 推演, 审查 Agent 没有在浏览器实跑 (角色边界); 这部分必须由 T-078 QA 用 `390x900` + `1440x1000` 实测兜底。
- "看日志摘要"按钮在窄屏下因 `flexShrink: 0 + whiteSpace: nowrap`, 文件名换行而按钮保持完整, 视觉上会出现"标签 + 按钮各占一行"。读起来比裁掉按钮好, 但要求 QA 截图确认按钮没有被夹到屏幕外。
- `BetaOffline` (`web/factory-beta.jsx:558-583`) 没有按 `isNarrow` 调小 padding (`46px 44px`), 在 390px 屏幕上看会偏窄但还能用; 不算 bug。
- 文案"打开内容工厂工作台后, 这里会自动变成作战室。当前页面不会展示本机路径。"明确给学员承诺, 与 T-077 的方向一致, 通过。

## 建议交给谁修

- **T-078** (NRG QA 自动): 桌面 + 窄屏真渲染 QA, 这是 T-076 阻塞解除的硬要求, 必须先于总控提交 done 完成。
- **总控**: 完成 T-078 后即可在主目录 `git add -A && git commit`。建议 commit message 同时提到 T-075 / T-076 / T-077 闭环。
- **(可选, 不阻塞)** 内容开发或总控后续补:
  - P2-1: e2e 脚本接入 `run_e2e_full.sh` 或加 Node 单测
  - P2-2: 4xx/5xx 正则收紧
  - P2-5: `safeAgentName` 双"审查"去重
  - P2-6: 窄屏 TaskRow 状态胶囊加 `gridColumn: "1 / -1"`
  - P2-7: 在 `BETA_INTERNAL_WORDS` 上加保留注释
- **新派独立任务** (建议总控登记新 T 编号, 不阻塞 T-075 收尾):
  - dashboard 学员公开版脱敏 (P2-3)

## 下一步建议

1. **可以进入总控提交**。审查没有 P0/P1 阻塞, 全部 T-077 高优先项与 T-076 反馈都已在本轮 diff 内闭环, 静态测试 7/7 通过。
2. **强烈建议先等 T-078 QA done 再 commit**: 响应式 CSS 改动只能由真浏览器在 390x900 / 1440x1000 截图验证, 静态审查无法替代。T-078 一旦 done 即可由总控执行 `git add tests/test_frontend_copy_static.py web/factory-beta.jsx scripts/e2e_beta_warroom.js docs/agent-handoff/DEV_CONTENT_T075_BETA_WARROOM_20260430.md && git commit`。
3. 总控合入 commit 时建议在主目录再跑一次:
   - `.venv/bin/pytest -q tests/test_frontend_copy_static.py` (本轮已确认 7 passed)
   - `node scripts/e2e_beta_warroom.js` (确认 violations / consoleErrors / pageErrors / requestFailed / httpErrors 全 0)
4. 跟进 P2-3 (dashboard 学员公开版脱敏), 把它登记成新任务, 与 T-075 解耦。
5. 若 T-078 QA 在窄屏看到任何残留横向裁切或按钮被截, 应直接 block T-079 + T-078, 让总控再调。本审查不替 T-078 做最终视觉验收。

## 是否需要老板确认

否。审查结论是"无 P0/P1 阻塞, 可在 T-078 通过后由总控提交"; P2 全部为非阻塞跟进项。仅当老板要求"dashboard 学员公开版"提前到本期, 或希望 e2e 必须先接入 CI 才允许合并, 才需要老板做业务取舍。
