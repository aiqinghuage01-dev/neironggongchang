# QA Report

## 任务 ID

T-065

## 测试对象

- 任务: T-063/T-064 返修后全站只读复测
- 角色: NRG QA-1 自动
- 分支: `codex/qa-1`
- 被测主线代码 commit: `32389d9 fix: clear remaining visible technical copy`
- 正式服务所在主目录 HEAD: `cf8b96d docs: queue site copy repair qa`
- QA 分支同步 commit: `e2f619f Merge branch 'main' into codex/qa-1`
- 页面: `home,strategy,make,wechat,moments,write,ad,hotrewrite,voicerewrite,baokuan,planner,compliance,image,imagegen,dreamina,beta,materials,works,knowledge,nightshift,settings`

## 执行边界

- 只使用当前已运行的 `http://127.0.0.1:8000` 和 `http://127.0.0.1:8001`。
- 未执行 kill / stop / restart / `uvicorn` / `scripts/start_api.sh` / `scripts/start_web.sh`。
- 未调用 `/api/health` 或 `/api/ai/health` 做门禁。
- 未点击任何生成、提交、发布、上传类按钮。
- 未提交真实生成任务, 未消耗 credits。

端口进程前后保持不变:

- `8000`: PID `1140`, started `Thu Apr 30 03:51:29 2026`, command `.venv/bin/python -m uvicorn backend.api:app --host 127.0.0.1 --port 8000 --log-level info`
- `8001`: PID `61343`, started `Thu Apr 30 03:08:08 2026`, command `Python scripts/start_web_nocache.py 8001`

## 真实操作

- 打开 21 个 `http://127.0.0.1:8001/?page=<page>` 路由页面。
- 每页点击非提交区域、可安全填写时填入 `QA只读检查，不提交生成`、滚动、截图。
- 扫描主页面可见正文和可见表单 `placeholder/title/aria/alt/value`。
- 额外补跑 frame-aware 扫描, 覆盖 `beta` 页跨端口 iframe 内容。
- 用 Playwright route 假造一条 failed `dreamina.text2video` task, 打开 LiDock 任务页并点击「重查即梦」, recover 请求由 route 直接 fulfill, 未打到后端。

## 证据

- 主扫描结果: `/tmp/_ui_shots/t065_site_copy_repair_20260430/results.json`
- iframe 补扫命中: `/tmp/_ui_shots/t065_site_copy_repair_20260430/frame_scan_hits.json`
- 截图目录: `/tmp/_ui_shots/t065_site_copy_repair_20260430/`
- 21 页截图已读: `home.png`, `strategy.png`, `make.png`, `wechat.png`, `moments.png`, `write.png`, `ad.png`, `hotrewrite.png`, `voicerewrite.png`, `baokuan.png`, `planner.png`, `compliance.png`, `image.png`, `imagegen.png`, `dreamina.png`, `beta.png`, `materials.png`, `works.png`, `knowledge.png`, `nightshift.png`, `settings.png`
- 即梦失败任务截图已读: `dreamina_failed_lidock_card.png`, `dreamina_failed_lidock_after_recover.png`

主页面扫描汇总:

- 页面: `21`
- 通过页面: `21`
- 主页面 forbidden hits: `0`
- console error: `0`
- pageerror: `0`
- requestfailed: `0`
- HTTP >= 400: `0`
- 主扫描非 GET 请求: `0`
- 主扫描生成/提交类请求: `0`

iframe 补扫结果:

- 页面: `beta`
- frame: `http://127.0.0.1:8765/`
- forbidden hits: `13`
- 命中词: `/Users`, `LLM`, `prompt`, `token`, `tokens`, `credits`, `Opus`, `DeepSeek`, `OpenClaw`, `Downloads`, `404`, `500`, `504`
- 第一视口截图 `beta.png` 可见 `/Users/black.chen/Desktop/neironggongchang`。

即梦失败任务卡复核:

- 任务卡 forbidden hits: `0`
- 弹窗 forbidden hits: `0`
- 弹窗文案: `🔄 即梦还在生成, 后台会继续跟进, 稍后再看`
- Playwright route 拦截 `GET /api/tasks?limit=30` 和 `POST /api/dreamina/recover/QA_FAKE_SUBMIT_ID_1234567890`; 该 POST 是假数据 recover 点击验证, 未触达真实后端, 非生成/提交任务。

命令验证:

- `git diff --check` -> clean。
- 当前 worktree 无 `.venv/bin/pytest`; 改用主目录虚拟环境在当前 worktree 执行:
  `/Users/black.chen/Desktop/neironggongchang/.venv/bin/pytest -q tests/test_kb_display.py tests/test_ai_routing.py` -> `12 passed`。

## Credits / 外部服务

- 是否真烧: 否。
- 测试规格: 全站只读扫描 + LiDock 即梦失败态假数据。
- 输入参数: `QA只读检查，不提交生成`, 仅填入可编辑字段, 未提交。
- task id / 作品 id: 无真实任务。
- 实际消耗: 未消耗 credits。
- 是否重复提交: 否。

## 结果

不通过。

## 发现的问题

`beta` 页嵌入的研发部状态面板 iframe 仍把内部路径和历史队列/日志工程词展示给用户。主页面扫描没有命中, 但截图和 frame-aware 补扫确认 iframe 内容是页面可见正文的一部分。

最严重命中:

- `/Users`: `neironggongchang · Agent 工作台 2026-04-30 04:36:37 · /Users/black.chen/Desktop/neironggongchang`
- `OpenClaw`: 历史 QA 队列描述里可见 `Opus/OpenClaw Request timed out`
- `Downloads`: 历史任务描述里可见 `Downloads 演示源`
- `404`: 历史任务描述里可见 `/api/tasks/counts 404`

这违反 T-065 禁词清单, 尤其 `/Users` 在 `beta.png` 第一视口直接可见。

## 复现步骤

1. 打开 `http://127.0.0.1:8001/?page=beta`。
2. 等待研发部状态面板 iframe 加载。
3. 第一视口即可看到 `neironggongchang · Agent 工作台 ... · /Users/black.chen/Desktop/neironggongchang`。
4. 对该 iframe 的 `body.innerText` 扫描禁词, 会命中 `/Users`, `LLM`, `prompt`, `token/tokens`, `credits`, `Opus`, `DeepSeek`, `OpenClaw`, `Downloads`, `404`, `500`, `504`。

## 下一步建议

总控返修 `beta` 页或 `agent_dashboard.py` 的用户可见文案:

- 顶部不要展示本机绝对路径, 改成「本机研发部」或项目名。
- 队列/日志摘要在面板里做脱敏, 至少对 `/Users...`, `OpenClaw`, `DeepSeek`, `Opus`, `tokens`, `credits`, `Downloads`, `404/500/504` 做友好替换或隐藏。
- 返修后 T-065 同口径复测必须继续做 frame-aware 扫描, 不能只扫主页面 DOM。

## 是否需要老板确认

否。属于可见技术词和本机路径脱敏返修, 不需要业务选择。
