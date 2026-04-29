# QA Report

## 任务 ID

T-066

## 测试对象

- 任务: T-048/T-065 返修后 frame-aware 全站复测
- 角色: NRG QA 自动
- 工作区: `/Users/black.chen/Desktop/nrg-worktrees/qa`
- 分支: `codex/qa`
- 被测主线 commit: `287ced9 fix: repair site copy and beta dashboard leaks`
- QA 同步 commit: `7fc1073 Merge branch 'main' into codex/qa`
- 正式服务:
  - `8000`: PID `1140`, 未停启
  - `8001`: PID `61343`, 未停启
- 页面:
  `home,strategy,make,wechat,moments,write,ad,hotrewrite,voicerewrite,baokuan,planner,compliance,image,imagegen,dreamina,beta,materials,works,knowledge,nightshift,settings`

已按任务要求读取:

- `docs/agent-handoff/QA_T-048_SITE_OPT_REGRESSION_20260430.md`
- `docs/agent-handoff/QA_T065_SITE_COPY_REPAIR_20260430.md`
- `docs/agent-handoff/REVIEW_T-049_SITE_OPT_20260430.md`
- `docs/agent-handoff/CONTROLLER_T048_T065_COPY_IFRAME_REPAIR_20260430.md`

## 真实操作

- 打开 21 个正式端口页面: `http://127.0.0.1:8001/?page=<page>`。
- 每页执行安全点击、滚动、截图; 对可安全填写的输入区填入 `QA只读检查，不提交生成` 或检索词 `课堂`。
- 未点击任何生成 / 提交 / 发布 / 上传按钮。
- 未调用 `/api/health` 或 `/api/ai/health` 做门禁。
- 每页采集所有 frame 的 `body.innerText` 和控件 `placeholder/title/aria/alt/value` 后扫描禁词。
- 用 Playwright route 假造 failed `dreamina.text2video` task, 打开 LiDock 任务页, 点击「重查即梦」; recover POST 被 route fulfill, 未触达真实后端。

## 证据

- 截图目录: `/tmp/_ui_shots/t066_frameaware_retest_20260430/`
- 结果 JSON: `/tmp/_ui_shots/t066_frameaware_retest_20260430/results.json`
- 禁词命中 JSON: `/tmp/_ui_shots/t066_frameaware_retest_20260430/forbidden_hits.json`
- LiDock 假任务禁词 JSON: `/tmp/_ui_shots/t066_frameaware_retest_20260430/special_hits.json`
- 关键截图已视觉确认:
  - `04_wechat.png`: 顶部第 6 步为“排版”, 未见 `HTML`
  - `09_voicerewrite.png`: 链接和自动转写口径正常, 未见 `URL/ASR/D-code`
  - `16_beta.png`: 原生研发状态页, 无内部 iframe, 无本机路径
  - `22_dreamina_failed_lidock_card.png`: 假失败任务卡不露 `id/submit_id/watcher/status=`
  - `23_dreamina_failed_lidock_after_recover.png`: 重查后无内部字段外露

Playwright 汇总:

- page count: `21`
- passed pages: `21`
- forbidden hits: `0`
- special LiDock forbidden hits: `0`
- beta frame count: `1`
- beta iframe elements: `0`
- console error: `0`
- pageerror: `0`
- requestfailed: `0`
- HTTP >= 400: `0`
- non-GET: `1`, 且唯一事件为被 route 拦截的 `POST /api/dreamina/recover/QA_FAKE_SUBMIT_ID_1234567890`
- fake `/api/tasks?limit=30` route intercepted: `4`
- fake recover route intercepted: `1`
- recover alert 文案: `🔄 即梦还在生成, 后台会继续跟进, 稍后再看`

命令验证:

- `git diff --check` -> clean
- `/Users/black.chen/Desktop/neironggongchang/.venv/bin/pytest -q tests/test_frontend_copy_static.py tests/test_kb_display.py tests/test_ai_routing.py` -> 15 passed

## Credits / 外部服务

- 是否真烧: 否。
- 测试规格: 全站只读页面扫描 + LiDock 即梦失败态 route 假数据。
- 输入参数: `QA只读检查，不提交生成`, `课堂`。
- task id / 作品 id: 无真实任务; 假 task 为 `QA_FAKE_DREAMINA_TASK_20260430`。
- 实际消耗: 无生成 credits。
- 是否重复提交: 否。

## 结果

通过。

T-048 的 `wechat` / `voicerewrite` 阻塞点已修复; T-065 的 `beta` iframe 泄露已修复。21 页 + 所有 frame 扫描 forbidden hits 为 0, LiDock 即梦失败任务卡和重查弹窗不露内部字段, 浏览器错误指标为 0。

## 发现的问题

无。

## 复现步骤

1. 打开正式端口 `http://127.0.0.1:8001/`。
2. 逐页访问 21 个页面并采集 `body.innerText`、控件属性和值、所有 frame 文本。
3. 打开 `?page=beta`, 确认页面无 iframe 且不露 `/Users/OpenClaw/DeepSeek/Opus/Downloads/404/500/504`。
4. route fake `/api/tasks?limit=30` 返回 failed `dreamina.text2video` task。
5. 打开 LiDock 任务页并点击「重查即梦」, route fake recover 返回 `watcher_will_retry=true`。
6. 检查任务卡和弹窗文案不含 `id/submit_id/watcher/status=`。

## 下一步建议

- 可由总控关闭 T-048/T-065 本轮返修。
- 保留 `tests/test_frontend_copy_static.py` 作为静态回归, 后续全站文案巡检继续使用 frame-aware 扫描口径。

## 是否需要老板确认

否。
