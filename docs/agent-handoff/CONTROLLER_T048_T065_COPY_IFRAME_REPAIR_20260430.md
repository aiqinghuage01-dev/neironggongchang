# 总控交接: T-048/T-065 全站文案与研发页返修

时间: 2026-04-30
角色: 总控 Agent
分支: `main`

## 背景

QA T-048 阻塞:

- 公众号页顶部第 6 步仍显示 `HTML`。
- 录音改写页仍显示 `URL` / `ASR` / `D-062bb-ext`。

QA T-065 阻塞:

- 21 个主页面扫描本身通过, 但 `beta` 页 iframe 嵌入内部研发工作台。
- iframe 正文可见本机路径和历史队列工程词, 包括 `/Users`, `OpenClaw`, `DeepSeek`, `Opus`, `Downloads`, `404/500/504` 等。

Review T-049 补充:

- 不直接 merge 旧 `codex/content-dev` 分支, 只手工吸收仍有价值的小改动。
- 失败卡片与顶部错误条避免重复展示。

## 本次改动

- `web/factory-wechat-v2.jsx`
  - 用户可见 `HTML` 全部改为“排版”口径。
  - 清理公众号写长文/配图/封面/推送过程中的 `Opus`, `token`, `apimart`, `Chrome`, `markup`, `API` 等技术词。
  - 排版产物文件收进折叠区, 且只显示文件名, 不显示本机绝对路径。

- `web/factory-voicerewrite-v2.jsx`
  - `URL` 改为“短视频链接”, `ASR` 改为“自动转写”口径。
  - 删除 `D-062bb-ext` 可见编号。
  - 自动转写失败提示走 `normalizeErrorMessage`, 避免原始错误外露。

- `web/factory-beta.jsx`
  - 移除内部工作台 iframe。
  - 改为本页原生摘要卡, 只展示岗位状态、任务数量和安全任务标题。
  - 不再展示日志、本机路径、历史队列摘要或内部错误。

- `web/factory-hotrewrite-v2.jsx`, `web/factory-planner-v2.jsx`, `web/factory-moments.jsx`, `web/factory-compliance-v2.jsx`
  - 手工吸收 T-049 建议的低风险体验修复: 失败卡片不再和顶部错误条重复; 朋友圈失败改为页面内错误条; 内容策划/违规审查隐藏方法来源 chip。

- `tests/test_frontend_copy_static.py`
  - 新增静态回归, 锁住 T-048/T-065 发现的精确文案和 beta iframe 回归。

## 验证

- `git diff --check` -> clean。
- `.venv/bin/pytest -q tests/test_frontend_copy_static.py tests/test_kb_display.py tests/test_ai_routing.py` -> 15 passed。
- `.venv/bin/pytest -q -x` -> passed, 仅本机缺失 dhv5 skill 用例按既有规则 skip。
- Playwright T-048 靶向复测:
  - `/tmp/_ui_shots/t048_copy_fix_verify_20260430/summary.json`
  - `wechat` + `voicerewrite` 扫描 `HTML/URL/ASR/D-code/API/token/prompt` 等命中 0。
- Playwright T-048 全站复测:
  - `/tmp/_ui_shots/t048_copy_fix_full_scan2_20260430/results.json`
  - 21/21 pages passed, forbiddenHits=0, consoleErrors=0, pageErrors=0, requestFailed=0, httpErrors=0, nonGet=0。
- Playwright T-065 beta 靶向复测:
  - `/tmp/_ui_shots/t065_beta_fix_verify_20260430/summary.json`
  - frames 仅剩主页面 1 个, forbidden hits=0, console/pageerror/requestfailed/http error=0。
- Playwright T-065 frame-aware 全站复测:
  - `/tmp/_ui_shots/t065_beta_fix_full_scan_20260430/results.json`
  - 21/21 pages passed, forbiddenHits=0, consoleErrors=0, pageErrors=0, requestFailed=0, httpErrors=0, nonGet=0。

## 队列建议

- 新增 T-066 给 QA: 按 T-065 同口径复测本次 commit, 必须包含 frame-aware 扫描和 Dreamina 失败任务假数据。
- T-048/T-065 当前保持 blocked 历史结论, 等 T-066 通过后再由总控关闭本轮返修。
