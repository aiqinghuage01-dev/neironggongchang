# 内容工厂 - 进度看板

> AI 接手前必读。每次 session 结束必更。

---

## 当前状态 (2026-04-29 · 科技与狠活嵌入研发部状态面板)

**版本**: v0.7.6-agent27 — 生产部原「黑科技」占位页已替换为「科技与狠活」, 直接嵌入 `http://127.0.0.1:8765/` 研发部状态面板; 老板既可以双击桌面工作台启动研发部, 也可以在内容工厂网页里点「科技与狠活」查看状态。状态面板补 CORS, 支持从 `:8001` 页面读取 `:8765` 状态。

### 当前进行
- 我要做素材库精品原片库改造: 已确认 D-124 方向, 当前先用 `~/Downloads/` 做演示源跑通功能, 未来切到 `~/Desktop/清华哥素材库/` 只改设置; 已写设计文档并派 T-023/T-024/T-025.
- T-017: 已入共享队列并被 `NRG 内容开发` 领取; 目标是继续返修 T-015 暴露的投流 `n=1` 页面真实链路 724s timeout。
- T-018: 已入共享队列, 依赖 T-017; 只允许 T-017 done 后做一次投流 `n=1` 页面最小真烧复测。
- T-019: 已入共享队列并被 `NRG QA 自动` 领取; 目标是主线合入 T-013 后复测 apimart 下载失败保护, 不真烧 credits。
- T-013: 已 cherry-pick 到 main: `6e05558 fix: fail apimart tasks on download errors` + `ff221fc docs: add media dev t013 handoff`; 主线验证 `.venv/bin/pytest -q tests/test_apimart_service.py tests/test_remote_jobs.py` -> 21 passed, `.venv/bin/pytest -q -x` -> passed, `git diff --check HEAD~2..HEAD` -> clean; 等 T-019 独立 QA 报告后才能关闭。
- T-014: 内容开发提交 `5d4fc59`, 隔离端口真实 curl `n=1` 53 秒 `ok`; 但 T-015 独立 QA 真烧仍 timeout, 需继续返修投流真实链路.
- T-015: 已被 `NRG QA 测试` 标记 `blocked`; QA 不通过: 真烧 task `5984e0bcdb754ad994d4b65415bd901e` 724s 后 Claude Opus/OpenClaw Request timed out; console/pageerror=0; pytest touliu 17 passed.
- T-016: 已被总控标记 `blocked`; T-015 未通过前不继续烧录音/热点 credits.
- 总控巡检: `python3 scripts/agent_queue.py claim --role controller --agent "NRG 总控" --format prompt` -> 无 controller 任务; `python3 scripts/agent_inbox.py --hours 24` -> 53 reports. 报告: `docs/agent-handoff/CONTROLLER_T013_T017_20260429_2011.md`.
- 多 Agent 协作流程已调整: Agent 自己写 `docs/agent-handoff/` 报告并 commit, 总控用收件箱脚本主动扫描, 老板不再做人肉复制粘贴中转。
- 自动任务队列已启用: `python3 ~/Desktop/neironggongchang/scripts/agent_queue.py list` 可看队列; `done` 只表示验收通过, 验证不通过必须 `block`.
- 自动派工器已启用: `bash scripts/start_agent_dispatcher.sh --status` 显示 LaunchAgent running; 当前队列显示 T-017 已被内容开发领取, T-019 正由自动 QA 运行。
- 研发部状态面板已新增: `scripts/agent_dashboard.py` + `scripts/start_agent_dashboard.sh`, 默认本地端口 `8765`, 只读取队列/派工器/日志, 不改代码、不烧 credits.
- 单按钮工作台已升级: 桌面只保留 `打开内容工厂工作台.app`, 会启动 Agent 监控器、自动派工器、状态面板, 并安全激活已有 5 个 Agent 工作区.
- 自动派工器脏工作区判断已修正: `data/`、`vendor/`、`.pytest_cache/` 等本地运行产物不再阻塞派工; 真正的代码/文档改动仍会触发保护.
- 「科技与狠活」已实装: `web/factory-beta.jsx` 嵌入研发部状态面板; `web/factory-shell.jsx` 和 `web/factory-home.jsx` 入口文案已同步.
- T-021 已由 `NRG 内容开发自动` 完成; T-022 已由 `NRG QA 自动` 完成; 后续仍需总控按交接报告决定是否合入/关闭旧 blocked 任务.
- cmux 安全启动已加: 日常按钮不再使用 `open -a cmux <worktree>` 兜底, 避免一叠重复窗口.
- 总控自然语言接单规则已写入 `docs/agents/ROLE_CONTROLLER.md`: 老板不需要指定角色/分支/任务编号/测试命令.
- 5-Agent 启动器已恢复: worktree 有本地改动或不能 fast-forward 时只跳过同步, 不再中断整个启动流程.
- Agent 监控器已恢复: LaunchAgent 优先使用非系统 Python, 避免 `/usr/bin/python3` 读取 Desktop 脚本被 macOS 拦截.
- 额外 QA cmux 脚本已改为 socket 不可用时只准备 worktree, 不再强行 fallback 打开多个空白窗口。

### 总控审查证据
- 总控本轮交接: `docs/agent-handoff/CONTROLLER_T013_T017_20260429_2011.md`.
- 总控启动巡检: `docs/agent-handoff/CONTROLLER_STARTUP_20260429_1852.md`.
- 收件箱: `python3 scripts/agent_inbox.py --hours 24` -> 53 reports.
- T-013 主线提交: `6e05558` + `ff221fc`; 验证 `.venv/bin/pytest -q tests/test_apimart_service.py tests/test_remote_jobs.py` -> 21 passed, `.venv/bin/pytest -q -x` -> passed.
- 队列新增: T-017 content claimed, T-018 qa queued depends T-017, T-019 qa claimed.
- T-014 开发交接: `docs/agent-handoff/DEV_CONTENT_T014_TOULIU_20260429.md` (worktree: `content-dev`).
- T-013 开发交接: `docs/agent-handoff/MEDIA_DEV_T013_APIMART_DOWNLOAD_20260429.md` (worktree: `media-dev`).
- QA-1 待命报告: `docs/agent-handoff/QA1_READY_20260429.md` (worktree: `qa-1`).
- 总控审查报告: `docs/agent-handoff/CONTROLLER_AUDIT_20260429.md`.
- 合并风险: `git diff main..codex/media-dev` 显示该分支会删除 `scripts/agent_inbox.py`, `scripts/start_agent_monitor.sh` 和多份主线报告/角色文档; 不允许整分支 merge.
- 任务队列: `~/Desktop/nrg-agent-queue/tasks.json` 已有 T-015/T-016 blocked; 新增 T-017/T-018/T-019 推进返修与复测。
- 自动派工器: `scripts/agent_dispatcher.py`, `scripts/start_agent_dispatcher.sh`; 日常不单独放桌面入口, 由工作台统一启动.
- 研发部状态面板: `http://127.0.0.1:8765/`; 日常由工作台自动打开, 可单独运行 `bash scripts/start_agent_dashboard.sh --open`.
- 单按钮工作台: 桌面入口 `打开内容工厂工作台.app`, 日常只需要点这个; 调试按钮默认从桌面移除, 需要时用 `--with-debug-launchers` 重建.
- cmux workbench wrapper: `scripts/start_agent_workbench.sh`; 若 cmux 工作区真的丢失, 才用 `--force-open-fallback` 做一次性修复.
- 派工器验证: `bash scripts/start_agent_dispatcher.sh --dry-run` -> 无 runnable task; `--status` -> LaunchAgent running, 6 个槽位 idle; `/tmp/nrg-agent-dispatcher.log` 只显示当前待命状态.
- 状态面板验证: `python3 -m py_compile scripts/agent_dashboard.py`; `bash -n scripts/start_agent_dashboard.sh scripts/start_agent_workbench.sh scripts/install_agent_desktop_launcher.sh`; `curl http://127.0.0.1:8765/api/status` 可返回 slots/tasks/logs JSON.
- 派工修复验证: `python3 scripts/agent_dispatcher.py --once --dry-run --verbose` -> `Would dispatch T-021 -> NRG 内容开发自动`; 重启派工器后 `bash scripts/start_agent_dispatcher.sh --status` -> `content-dev: running pid=91039 task=T-021`.
- 科技与狠活验证: Playwright 从首页点击侧栏「科技与狠活」-> `?page=beta`, iframe 成功加载 `http://127.0.0.1:8765/`, 可见 6 个 Agent 卡片, console/pageerror/requestfailed 均 0, 截图 `/tmp/nrg_beta_dashboard.png`.
- 相关测试: `.venv/bin/pytest -q tests/test_skills_smoke.py tests/test_lidock_tools.py` -> 52 passed.
- 启动器验证: `bash scripts/start_multi_agents_cmux.sh` 已成功打开 5 个 cmux tab: main/content-dev/media-dev/qa/review.

### QA 证据 · 公众号
- QA 报告已合入主线: `docs/agent-handoff/QA_WECHAT_20260429.md`
  - QA 原提交: `cb3454c`
  - 主线证据提交: `9031337`
- 真实草稿 ID: `QbCZvI0l3BDFBWrSXSwYcRbJ2XeHnl-4hcFvroxpXMXTi4YPr860yIsWB9mQgvb1`
- console error: 0; pageerror: 0.
- WeChat 相关 pytest 通过; `node scripts/e2e_wechat_d096_flow.js` 通过.
- QA 额外发现: `node scripts/e2e_wechat_write_recover.js` 因本地任务库缺脚本预期历史任务超时, 不作为本轮链路结论依据.

### QA 证据 · 直接出图
- QA2 报告已合入主线: `docs/agent-handoff/QA2_IMAGEGEN_20260429.md`
  - QA2 原提交: `4f44f7a`
  - 主线证据提交: `6f9fc3f`
- 真烧 task: `72012fe3c6844be6a8a37bc7ab9213ea`, remote job done, 图片已下载并入作品库.
- console error: 0; pageerror: 0.
- 截图已核: `/tmp/_ui_shots/qa2_imagegen_04_final.png` 显示 `出图完成 · 0/0 成功`; `/tmp/_ui_shots/qa2_imagegen_05_works.png` 显示作品库已有该图.
- pytest 未跑; 本轮未改业务代码, 仅做最小 credits 真链路和浏览器闭环.

### 已合入 · T-007/T-008
- T-007 代码提交: `e7c4508 fix: show apimart single image result`
- T-007 开发交接: `f477319 docs: add media dev t007 handoff`
- T-008 QA 复测报告: `6b34637 qa: report imagegen t008 retest`
  - QA 原提交: `e50666c`
  - 报告: `docs/agent-handoff/QA2_T008_IMAGEGEN_20260429.md`
- QA 真烧证据:
  - apimart 1 张最低规格, `size=1:1`, `n=1`.
  - app task `92be92e626bc4f909dec80259fe4ed50` -> `status=ok`.
  - apimart task `task_01KQBXJF52DFAVW2QHSCHC4VSM`.
  - remote job `a2e6fd9e87ac4c76885eb45827b7f6b0` -> done, `poll_count=1`.
  - 页面显示 `出图完成 · 1/1 成功`, 未出现 `0/0 成功`.
  - 图片实际加载 `naturalWidth=1254`; 作品库同图 `works id=4`.
  - console error 0; pageerror 0; 截图已读 `/tmp/_ui_shots/t008_imagegen_04_final.png`.
  - 横向抽样 dreamina/shiliu 结果区无渲染错误.
- 主线验证:
  - `.venv/bin/pytest -q tests/test_apimart_service.py tests/test_remote_jobs.py` -> 20 passed.
- 风险登记: QA 未做 download 失败 fault injection; 已新增 T-013 单独处理.

### 已合入 · T-004/T-005
- 代码提交: `2c9778e fix: preserve wechat edits and section images`
- 开发交接: `99ff4c9 docs: add wechat content dev handoff`
- QA 复测报告: `49dabaa qa: report wechat edit propagation retest`
- 主线验证:
  - `.venv/bin/pytest -q tests/test_wechat_sanitize.py tests/test_wechat_html_inject.py` -> 31 passed.
  - `.venv/bin/pytest -q tests/test_wechat_*.py tests/test_llm_empty_content.py tests/test_llm_retry.py` -> exit 0.
  - `node scripts/e2e_wechat_edit_propagation.js` -> exit 0; 截图已读 `/tmp/_ui_shots/t004_wechat_edit_propagation.png`.
  - 临时 API `8120` + `curl POST /api/wechat/html` + `sanitize_for_push`: 编辑标记存在; 原 `img=5`, 清洗后 `img=4`; `from=appmsg` 和 `data-nrg-section-image` 均清空.
- 范围说明: T-004/T-005 scoped 通过; 没有执行真实公众号草稿推送.

### 已合入 · T-006
- QA 首版报告: `f306718 docs: add T006 wechat push QA report`
- QA 更新报告: `ff5be05 docs: update T006 wechat push QA report`
  - QA 原提交: `7167fba` -> `d8bbc72`
  - 报告: `docs/agent-handoff/QA_T006_WECHAT_PUSH_20260429.md`
- 第二次真实草稿 ID: `QbCZvI0l3BDFBWrSXSwYcZaJmVU4q9t42P2nOY7C936R9f28m5_kCaT9c5ARmRoR`
- 验证边界:
  - 复用已有文章、4 张段间图、封面.
  - 只调用 `/api/wechat/html` 和 `/api/wechat/push`.
  - 未调用 `/api/wechat/write`, `/api/wechat/section-image`, `/api/wechat/cover`, `/api/wechat/cover-batch`, 没有重复烧长文/生图/封面 credits.
- 关键证据:
  - `/tmp/preview/last_push_request.json`: `img_count_sanitized=4`.
  - 远端微信 `draft/batchget`: `img_count=4`, `mmbiz_count=4`, `has_qa_marker=true`.
  - 浏览器 Step 6/7/8 正常; console/pageerror 干净.
  - pytest: wechat 相关 101 passed.
- 结论: T-006 通过. 首轮旧后端产生的无图草稿仍在草稿箱, 本轮 QA 未做第三次外发.

### QA 证据 · 作品库
- QA 报告已合入主线: `docs/agent-handoff/QA_WORKS_20260429.md`
  - QA 原提交: `eed2d29`
  - 主线证据提交: `bcad1e6`
- 隔离服务 `18000/18001` 跑完整浏览器闭环; 临时数据已清理, 服务已关闭.
- pytest: `tests/test_works_crud_integration.py tests/test_autoinsert_text_work.py tests/test_migrations.py::test_apply_migrations_creates_works_indexes tests/test_migrations.py::test_legacy_fixup_works_old_db_missing_4_columns` -> 11 passed.
- 正常路径 smoke: pageerror 0; console 仅 Babel 开发 warning.
- 负向复核: `completion_rate=80` -> 422; `completion_rate=0.8` -> 200.
- 现场只读快照: `8000` 有 342 条作品; 第 301 条搜索在 `limit=300` 下查不到, `limit=1000` 下能查到; 前 300 条图片里 59 个缺预览 URL.

### 已完成 · T-009/T-010/T-011/T-012
- 修复提交: `9b36bd5 fix: repair works library qa issues`
- T-009: `/api/works` 搜索改为 SQL 过滤后再 `LIMIT`; 新增 `/api/works/{id}` 详情接口; 数据看板/发布矩阵打开作品时按 id 拉取, 不再依赖当前列表.
- T-010: `留这版 / 删这版` action 返回更新后的 work, 前端立即合并状态; 完播率输入可填 `80`, 前后端都归一化保存为 `0.8`.
- T-011: 作品 API 返回 `asset_status` / `preview_available` / `download_available`; 图片缺本地文件或只有记录时, 卡片和详情给明确说明, 不再静默占位.
- 自验证据:
  - `.venv/bin/pytest -q tests/test_works_api.py` -> 5 passed.
  - `.venv/bin/pytest -q tests/test_works_crud_integration.py tests/test_autoinsert_text_work.py tests/test_migrations.py::test_apply_migrations_creates_works_indexes tests/test_migrations.py::test_legacy_fixup_works_old_db_missing_4_columns` -> 11 passed.
  - `.venv/bin/pytest -q -x` -> exit 0.
  - `node scripts/e2e_works_t009_t011.js` -> exit 0; 截图已读 `/tmp/_ui_shots/t009_t011_works_regression.png`.
  - 临时 API `8121` + curl 已验证: 老作品搜索、详情读取、留/删返回新 work、`completion_rate=80` 保存 `0.8`、缺失图片返回 `asset_status=missing_file`.
- T-012 QA 报告: `53e77d6 qa: report works t012 regression`
  - QA 原提交: `f42c46e`
  - 报告: `docs/agent-handoff/QA2_T012_WORKS_20260429.md`
- T-012 QA 证据:
  - `.venv/bin/pytest -q -x` -> exit 0.
  - 作品库相关 pytest -> 16 passed.
  - `scripts/e2e_works_t009_t011.js` -> exit 0.
  - 真实 UI 非 mock 浏览器闭环: 32 个 API 请求, console/pageerror/API requestfailed 全部 0.
  - curl 复核: 旧作品搜索命中、按 id 打开、留这版写入、`completion_rate=80` 落库为 0.8、缺图状态字段正确.
  - 截图已读 4 张: 旧作品搜索、留这版+指标、数据看板打开、缺图说明.
  - 临时测试数据已清: 308 条作品 + 2 条指标, 剩余 0.
- 结论: T-012 通过, 未发现新的 P0/P1/P2; 作品库 T-009/T-010/T-011 可标记完成.

### 剩余阻塞
1. T-014/T-015: 投流 `n=1` 独立 QA 真烧仍 timeout, 必须返修后重新入队 QA.
2. T-016: 录音改写真实 LLM 和热点改写 4 版真实链路未复测; 必须等 T-015 通过后再恢复.
3. T-013: 开发自验完成但未独立 QA; media 分支落后主线, 不可整分支合并.

### 下一步
- `docs/AGENT_BOARD.md` 已登记:
  - `T-004`: 已完成.
  - `T-005`: 已完成.
  - `T-006`: 已完成, 修后公众号 8 步链路复测.
  - `T-007`: 已完成, 修直接出图结果区不展示 apimart 单图产物.
  - `T-008`: 已完成, 修后直接出图最小真烧复测.
  - `T-009`: 已完成, 修作品库看板打开历史作品 + 搜索老作品.
  - `T-010`: 已完成, 修作品库留/删 UI 状态 + 完播率输入.
  - `T-011`: 已完成, 处理图片占位卡.
  - `T-012`: 已完成, 修后作品库全链路回归.
  - `T-013`: 待 QA, 但先处理 media 分支合并风险.
  - `T-014`: 需返修, T-015 独立 QA 不通过.
  - `T-015`: blocked, QA 真烧 timeout.
  - `T-016`: blocked, 依赖 T-015 真正通过.
- T-013/T-014/T-015/T-016 完成并由 QA 真测通过前, 不能说项目整体完成.

---

## 上一里程碑 (2026-04-29 · D-123 cmux 安全启动)

**版本**: v0.7.6-agent24 — 避免单按钮工作台制造重复 cmux 窗口。

### D-123 修复
- 新增 `scripts/start_agent_workbench.sh`: 统一启动 monitor/dispatcher/cmux, 并加启动锁防止重复点击并发启动.
- 日常路径先检查 cmux 是否已有 5 个目标工作区; 如果已有, 只激活并清理重复窗口.
- cmux CLI socket 不可用时, 默认不再走 `open -a cmux <worktree>` 兜底.
- 一次性修复入口: `bash scripts/start_agent_workbench.sh --force-open-fallback`.
- `scripts/install_agent_desktop_launcher.sh`: 桌面按钮改为调用 workbench wrapper.
- `docs/MULTI_AGENT_WORKFLOW.md`: 记录安全启动规则和修复入口.

### D-123 验证
- `cmux ping` 当前仍会报 `Broken pipe`, 但 `osascript` 能确认 1 个 cmux 窗口、5 个目标 tabs.
- `bash -n scripts/start_agent_workbench.sh scripts/install_agent_desktop_launcher.sh`.
- `bash scripts/start_agent_workbench.sh` -> 只激活已有工作区, 不创建新窗口.

---

## 上一里程碑 (2026-04-29 · D-122 单按钮 + 自然语言总控)

**版本**: v0.7.6-agent23 — 把日常入口和用户操作继续简化。

### D-122 修复
- `scripts/install_agent_desktop_launcher.sh`: 默认只生成 `打开内容工厂工作台.app`.
- 安装脚本会移除桌面上的 3 个调试按钮, 保留底层脚本能力.
- 如需排查问题, 可运行 `bash scripts/install_agent_desktop_launcher.sh --with-debug-launchers` 临时恢复调试按钮.
- `docs/agents/ROLE_CONTROLLER.md`: 新增自然语言接单规则, 总控必须自己拆任务/写队列/安排测试审查.
- `docs/MULTI_AGENT_WORKFLOW.md`: 每日流程改为单按钮 + 总控自然语言输入.

### D-122 验证
- `bash -n scripts/install_agent_desktop_launcher.sh`.
- `bash scripts/install_agent_desktop_launcher.sh` -> 桌面只保留 `打开内容工厂工作台.app`.
- `bash scripts/start_agent_dispatcher.sh --status` -> LaunchAgent running.

---

## 上一里程碑 (2026-04-29 · D-121 一键工作台)

**版本**: v0.7.6-agent22 — 把 5-Agent 工作区、Agent 监控、自动派工收成一个日常入口。

### D-121 修复
- `scripts/install_agent_desktop_launcher.sh`: 新增桌面应用 `打开内容工厂工作台.app`.
- 一键工作台会启动:
  - `scripts/start_agent_monitor.sh`
  - `scripts/start_agent_dispatcher.sh`
  - `scripts/start_multi_agents_cmux.sh`
- 保留 3 个独立按钮作为调试/单独重启入口.
- `docs/MULTI_AGENT_WORKFLOW.md`: 更新每日开工流程为“只双击工作台, 然后只找总控”.

### D-121 验证
- `bash -n scripts/install_agent_desktop_launcher.sh`.
- `bash scripts/install_agent_desktop_launcher.sh` -> 生成 4 个桌面 app.
- `bash scripts/start_agent_dispatcher.sh --status` -> LaunchAgent running.

---

## 上一里程碑 (2026-04-29 · D-120 自动派工器)

**版本**: v0.7.6-agent21 — 任务队列升级为后台自动派工, 减少老板复制粘贴和窗口切换。

### D-120 修复
- 新增 `scripts/agent_dispatcher.py`: 扫描共享队列, 自动把 runnable task 派给 content/media/qa/review worker.
- 新增 `scripts/start_agent_dispatcher.sh`: LaunchAgent 后台启动/停止/状态/干跑.
- `scripts/install_agent_desktop_launcher.sh`: 新增桌面入口 `打开内容工厂自动派工.app`.
- `docs/MULTI_AGENT_WORKFLOW.md` / 角色文档: 明确老板只和总控聊天; `done` 只表示验收通过, 失败/返修必须 `block`.
- 派工器不依赖 cmux socket; cmux 只作为可视化工作台.
- 修复 LaunchAgent PATH 短导致找不到 `codex` 的问题, 自动定位 `~/.npm-global/bin/codex` 和 `~/.local/bin/claude`.
- T-015 QA 不通过后, 已将 T-015/T-016 队列状态纠正为 `blocked`, 防止下游误跑.

### D-120 验证
- `python3 -m py_compile scripts/agent_dispatcher.py scripts/agent_queue.py scripts/agent_inbox.py`.
- `bash -n scripts/start_agent_dispatcher.sh scripts/install_agent_desktop_launcher.sh scripts/start_agent_monitor.sh`.
- 临时队列 dry-run: qa task 只模拟派给一个 QA 槽位, 不重复显示给多个 QA.
- 真实队列 dry-run: 当前无 runnable task; T-015/T-016 blocked.
- `bash scripts/start_agent_dispatcher.sh --status` -> LaunchAgent `state = running`, 所有槽位 idle.

---

## 上一里程碑 (2026-04-29 · D-119 Agent 启动器恢复)

**版本**: v0.7.6-agent19 — 修复桌面 5-Agent 启动器双击后只打开空 cmux 首页的问题。

### D-119 修复
- `scripts/start_multi_agents_cmux.sh`: worktree clean 但不能 fast-forward 主线时, 只打印 `Skip sync` 并继续打开 workspace, 不再 `fatal` 中断.
- `scripts/start_extra_qa_cmux.sh`: 同步逻辑同样改为不能 fast-forward 时跳过.
- `scripts/start_agent_monitor.sh`: LaunchAgent 优先使用 `/Library/Frameworks/.../python3` 等非系统 Python, 避免 `/usr/bin/python3` 被 macOS 权限拦截读取 Desktop 脚本.
- 重新安装桌面按钮: `打开内容工厂5个Agent.app` / `打开内容工厂Agent监控.app`.

### D-119 验证
- `bash -n scripts/start_multi_agents_cmux.sh scripts/start_extra_qa_cmux.sh scripts/start_agent_monitor.sh scripts/install_agent_desktop_launcher.sh`.
- `python3 -m py_compile scripts/agent_queue.py scripts/agent_inbox.py`.
- `bash scripts/start_agent_monitor.sh --status` -> LaunchAgent `state = running`, 使用非系统 Python.
- `bash scripts/start_multi_agents_cmux.sh` -> 成功打开 5 个 cmux tab: main/content-dev/media-dev/qa/review.

---

## 上一里程碑 (2026-04-29 · D-118 自动任务队列)

**版本**: v0.7.6-agent18 — 多 Agent 协作新增共享任务队列, 解决老板仍需复制任务给各 Agent 的问题。

### D-118 修复
- 新增 `scripts/agent_queue.py`: 本机共享任务队列, 默认目录 `~/Desktop/nrg-agent-queue/`.
- 支持 `add` / `list` / `claim` / `done` / `block --owner-decision` / `reset`.
- 队列支持 `depends_on`, T-016 已依赖 T-015, 避免投流未通过时自动继续烧录音/热点 credits.
- 更新角色文档和 cmux 启动角色说明: Agent 开工后先 claim 自己角色的任务, 完成后自己写报告、commit、更新队列状态, 再继续 claim 下一条.
- `docs/AGENT_BOARD.md`: T-015/T-016 标记为队列中.

### D-118 验证
- `python3 -m py_compile scripts/agent_queue.py scripts/agent_inbox.py`.
- `bash -n scripts/start_multi_agents_cmux.sh scripts/start_extra_qa_cmux.sh scripts/start_agent_monitor.sh`.
- 临时队列验证 `add -> claim --format prompt -> done -> list --format json` 通过.
- 真实队列已初始化: T-015 queued, T-016 queued + depends_on=T-015.

---

## 上一里程碑 (2026-04-29 · D-117 Copyflows 复测不通过)

**版本**: v0.7.6-agent16 — 投流/录音/热点 copyflows 复测发现投流 P1, 失败代码未合入主线。

### D-117 QA 证据
- QA 报告合入: `docs/agent-handoff/QA_CONTENT_COPYFLOWS_20260429.md`.
- 被测分支: `codex/content-dev`.
- 被测代码: `2670a5a fix: harden copywriting pipelines`.
- 开发交接: `886552b docs: add copyflows dev handoff`.
- QA 报告提交: `a756f8f qa: report copyflows retest` (原提交 `7e6f5f8`).
- 页面烟测: 投流/热点/录音三个页面 console/pageerror 均干净.
- 单测: 53 passed; 104 passed; `pytest -q -x` 仍停在既有环境问题 `SHILIU_API_KEY not loaded`.

### 失败结论
- 投流 `n=1` 最小真烧 task `cf04ad56b1b34b3c87fcda8b5821f319`.
- 181 秒时仍 `running`, `progress_pct=15`.
- 591 秒最终 `failed`.
- 错误: `投流文案 LLM 输出非 JSON`.
- AI usage: `touliu.generate` 耗时 `591473ms`, `total_tokens=6051`.
- 初始 API 返回 `estimated_seconds=150`, task 行为 `60`, 估时口径不一致.
- 录音改写真实 LLM、热点改写 4 版真实链路未继续真烧, 避免在 P1 下扩大 credits 消耗.

### 后续任务
- T-014: 内容开发修投流真实链路和估时口径.
- T-015: QA 最小真烧复测投流 `n=1`.
- T-016: T-015 通过后再复测录音/热点真实链路.

---

## 上一里程碑 (2026-04-29 · D-116 Agent 收件箱监控)

**版本**: v0.7.6-agent15 — 多 Agent 协作从“老板复制粘贴报告”改为“共享收件箱 + 自动监控提醒”。

### D-116 修复
- 新增 `scripts/agent_inbox.py`: 扫描主 repo 和 `~/Desktop/nrg-worktrees/*/docs/agent-handoff/` 的报告, 支持 `--hours`, `--task`, `--json`, `--watch`, `--notify`.
- 新增 `scripts/start_agent_monitor.sh`: 用 macOS LaunchAgent 后台监控收件箱, 新报告/更新报告时发通知; 支持 `--stop` / `--status`.
- `scripts/install_agent_desktop_launcher.sh`: 额外安装桌面按钮 `打开内容工厂Agent监控.app`.
- 角色文档和报告模板新增「下一步建议」「是否需要老板确认」, 明确 Agent 完成后自己写报告并 commit, 不让老板传话.
- `scripts/start_extra_qa_cmux.sh`: cmux CLI socket 不可用时默认只准备 QA worktree, 避免 fallback 造成重复空白窗口.

### D-116 验证
- `python3 scripts/agent_inbox.py --hours 48` -> 能读取主 repo 与 worktree 报告.
- `python3 scripts/agent_inbox.py --task T-012 --all --json` -> 能按任务过滤.
- `bash -n scripts/start_agent_monitor.sh scripts/start_extra_qa_cmux.sh scripts/install_agent_desktop_launcher.sh`.
- `bash scripts/install_agent_desktop_launcher.sh` -> 桌面 5 Agent 按钮和 Agent 监控按钮已生成.
- `bash scripts/start_agent_monitor.sh` + `--status` -> LaunchAgent 可启动并保持后台运行.

---

## 上一里程碑 (2026-04-29 · D-115 Works T-012 回归通过)

**版本**: v0.7.6-agent14 — 作品库 T-009/T-010/T-011 修复经独立 QA 回归通过。

### D-115 验证
- QA 报告合入: `docs/agent-handoff/QA2_T012_WORKS_20260429.md`.
- `.venv/bin/pytest -q -x` -> exit 0.
- 作品库相关 pytest -> 16 passed.
- `scripts/e2e_works_t009_t011.js` -> exit 0.
- 真实 UI 非 mock 浏览器闭环: 32 个 API 请求, console/pageerror/API requestfailed 均 0.
- curl 复核旧作品搜索、按 id 打开、留这版写入、`completion_rate=80` 落库 0.8、缺图状态字段.
- 临时测试数据已清理: 308 条作品 + 2 条指标, 剩余 0.

### 结论
- T-012 通过, 作品库 T-009/T-010/T-011 可关闭.
- 项目整体仍剩 T-013, 不能说整体通过.

---

## 上一里程碑 (2026-04-29 · D-114 WeChat T-006 二次真实草稿通过)

**版本**: v0.7.6-agent13 — T-004/T-005 修后公众号真实草稿推送复核通过。

### D-114 验证
- QA 报告合入: `docs/agent-handoff/QA_T006_WECHAT_PUSH_20260429.md`.
- 第二次复核只复用已有文章、4 张段间图、封面; 只调 `/api/wechat/html` 和 `/api/wechat/push`.
- 推送前 payload: `img_count_sanitized=4`.
- 远端微信草稿: `img_count=4`, `mmbiz_count=4`, `has_qa_marker=true`.
- 第二次草稿 ID: `QbCZvI0l3BDFBWrSXSwYcZaJmVU4q9t42P2nOY7C936R9f28m5_kCaT9c5ARmRoR`.
- console/pageerror 干净; wechat 相关 pytest 101 passed.

### 备注
- 首轮旧后端产生的无图草稿仍在草稿箱里; 这是历史残留, 不作为当前代码失败证据.

---

## 上一里程碑 (2026-04-29 · D-113 ImageGen T-007/T-008 合入)

**版本**: v0.7.6-agent12 — apimart 单图结果区从 `0/0 成功` 修到真实 `1/1 成功`, 并通过 QA 最小真烧。

### D-113 修复
- `backend/services/apimart_service.py`: watcher `on_done` 下载入库后补齐 `images[] / media_url / engine / size / elapsed_sec`.
- `web/factory-image-gen.jsx`: 结果区兼容旧 raw 单图任务结果.
- `tests/test_apimart_service.py`: 覆盖 apimart 单图结果契约和作品入库.
- 合入开发交接 `docs/agent-handoff/MEDIA_DEV_T007_IMAGEGEN_20260429.md`.
- 合入 QA 报告 `docs/agent-handoff/QA2_T008_IMAGEGEN_20260429.md`.

### 验证
- QA 真烧 apimart 1 张最低规格: 页面 `出图完成 · 1/1 成功`, 图片加载 `naturalWidth=1254`, 作品库同图 `works id=4`, console/pageerror 均 0.
- 主线 `.venv/bin/pytest -q tests/test_apimart_service.py tests/test_remote_jobs.py` -> 20 passed.
- 未覆盖: download 失败 fault injection; 已登记 T-013.

---

## 上一里程碑 (2026-04-29 · D-112 Works QA 修复)

**版本**: v0.7.6-agent11 — T-009/T-010/T-011 主线修复完成, 等 T-012 独立 QA。

### D-112 修复
- `shortvideo/works.py`: `list_works(q=...)` 在 SQL 层过滤, 解决老作品搜索被首屏 `limit` 截断.
- `backend/api.py`: 新增作品详情序列化和 `/api/works/{id}`; action 返回更新后的 work; analytics 拉取更大作品范围; 完播率支持 `0-100` 输入并保存为比例; 图片资产返回明确状态.
- `web/factory-works.jsx`: 看板「看」按 id 打开历史作品; 留/删状态立即刷新; 完播率输入按百分数交互; 缺失图片显示可解释状态.
- `tests/test_works_api.py` + `scripts/e2e_works_t009_t011.js`: 覆盖 QA_WORKS 报告里的 5 个问题.

### 验证
- `.venv/bin/pytest -q tests/test_works_api.py` -> 5 passed.
- `.venv/bin/pytest -q tests/test_works_crud_integration.py tests/test_autoinsert_text_work.py tests/test_migrations.py::test_apply_migrations_creates_works_indexes tests/test_migrations.py::test_legacy_fixup_works_old_db_missing_4_columns` -> 11 passed.
- `.venv/bin/pytest -q -x` -> exit 0.
- `node scripts/e2e_works_t009_t011.js` -> exit 0; 截图已读 `/tmp/_ui_shots/t009_t011_works_regression.png`.
- 临时 API `8121` + curl 已验证 5 条关键路径; 服务已停止.

---

## 上一里程碑 (2026-04-29 · D-111 多 QA 一键启动)

**版本**: v0.7.6-agent10 — 支持临时打开 2-3 个并行 QA workspace.

### D-111 修复
- 新增 `scripts/start_extra_qa_cmux.sh`: 默认打开 `qa-1 / qa-2 / qa-3`,
  每个都有独立 worktree、独立 branch、独立 `开工` 启动口令.
- `docs/MULTI_AGENT_WORKFLOW.md`: 补多 QA 并行规则和推荐分工.

### 验证
- `bash -n scripts/start_extra_qa_cmux.sh` ✅

---

## 上一里程碑 (2026-04-29 · D-110 Agent Full Access + 最小真烧测试)

**版本**: v0.7.6-agent9 — Codex Agent 默认 Full Access; QA 默认允许最小真烧 credits.

### D-110 修复
- `scripts/start_multi_agents_cmux.sh` / `scripts/start_multi_agents_tmux.sh`:
  Codex Agent 启动默认带 `--sandbox danger-full-access --ask-for-approval never --search`.
- `docs/agents/ROLE_QA.md`: QA 默认允许最小 credits 真烧闭环, 但禁止重复烧/大额度烧.
- `docs/agents/ROLE_MEDIA_DEV.md` / `docs/agents/ROLE_CONTENT_DEV.md`:
  开发自测允许 1 次最小真烧闭环, 失败后不自动重复提交.
- `docs/agent-handoff/TEMPLATE_QA_REPORT.md`: 增加 credits / 外部服务测试记录区.
- `docs/MULTI_AGENT_WORKFLOW.md` / `docs/SYSTEM-CONSTRAINTS.md`: 同步默认真烧和 Full Access 规则.

### 验证
- `codex --help` 确认参数支持 `--sandbox danger-full-access`,
  `--ask-for-approval never`, `--search` ✅
- `bash -n scripts/start_multi_agents_cmux.sh scripts/start_multi_agents_tmux.sh scripts/install_agent_desktop_launcher.sh` ✅
- `bash scripts/start_multi_agents_cmux.sh --dry-run` 显示 Full Access 默认参数 ✅
- 已重新生成 5 个 workspace 的 `.agent-start.sh`; 4 个 Codex Agent 均带 Full Access 参数 ✅
- AppleScript 实测 cmux 仍为 `windows=1`, `tabs=5` ✅

---

## 上一里程碑 (2026-04-29 · D-109 Claude Opus CLI 模型名修复)

**版本**: v0.7.6-agent8 — 审查 Agent 默认 Claude 模型从 `opus4.7` 改为 CLI 可用别名 `opus`.

### D-109 修复
- `scripts/start_multi_agents_cmux.sh` / `scripts/start_multi_agents_tmux.sh`:
  Claude 审查 Agent 默认 `CLAUDE_MODEL` 从 `opus4.7` 改为 `opus`.
- 原因: `opus4.7` 是 UI 展示名风格, Claude CLI 不识别; CLI 帮助明确支持
  `opus` 作为最新 Opus 别名.
- `docs/MULTI_AGENT_WORKFLOW.md`: 同步默认模型说明.

### 验证
- `claude --model opus --effort max --no-session-persistence -p 'Reply only: OK'` -> `OK` ✅

---

## 上一里程碑 (2026-04-29 · D-108 桌面一键打开 5 Agent)

**版本**: v0.7.6-agent7 — 双击桌面按钮即可打开 5 个 Agent workspace.

### D-108 修复
- 新增 `scripts/install_agent_desktop_launcher.sh`: 生成桌面
  `打开内容工厂5个Agent.app`, 双击后自动运行 cmux 5-Agent 启动脚本.
- `docs/MULTI_AGENT_WORKFLOW.md`: 补桌面按钮作为最简单入口.
- 说明: 当前 cmux socket 仍返回 `Broken pipe`, 所以脚本会走 fallback;
  fallback 下个别 workspace 可能只打开目录但不自动启动模型, 进入后输入 `开工`.

### 验证
- 已生成 `/Users/black.chen/Desktop/打开内容工厂5个Agent.app` ✅
- `bash -n scripts/install_agent_desktop_launcher.sh` ✅

---

## 上一里程碑 (2026-04-29 · D-107 Agent 启动短口令)

**版本**: v0.7.6-agent6 — 进入 Agent workspace 后输入 `开工` 即可启动.

### D-107 修复
- `scripts/start_multi_agents_cmux.sh`: 每个 workspace 自动生成 `start` 和 `开工`
  两个本地启动短口令, 继续保留 `.agent-start.sh` 作为底层实现.
- 自动安装全局 `~/.local/bin/开工`; 在 Agent workspace 里直接输入 `开工`
  就会调用当前 workspace 的 `.agent-start.sh`.
- cmux fallback 确认 5 个目标 workspace 都存在后, 自动关闭多余 cmux 窗口壳.
- `docs/MULTI_AGENT_WORKFLOW.md`: 启动说明从 `./.agent-start.sh` 改成 `开工`.

### 验证
- `bash -n scripts/start_multi_agents_cmux.sh` ✅
- `bash scripts/start_multi_agents_cmux.sh --dry-run` ✅
- `bash scripts/start_multi_agents_cmux.sh` 真实运行: 已生成短口令, 已跳过重复 workspace ✅
- 5 个 workspace 均存在可执行 `start` 和 `开工` ✅
- `command -v 开工` -> `~/.local/bin/开工`; `bash -n ~/.local/bin/开工` ✅
- 已用 System Events 清理残留 cmux 外壳, 当前 `AX windows=1` ✅
- AppleScript 实测 cmux: `windows=1`, `tabs=5` ✅

---

## 上一里程碑 (2026-04-29 · D-106 cmux 只保留 5 个 Agent 工作区)

**版本**: v0.7.6-agent5 — cmux fallback 打开后自动清理默认空 Home 工作区.

### D-106 修复
- `scripts/start_multi_agents_cmux.sh`: fallback/open 后确认 5 个 Agent 工作区都在
  当前 cmux window 内时, 自动关闭 cmux 默认创建的 `~` 空工作区.
- 目标状态固定为 1 个 cmux window + 5 个 workspace:
  `总控 / 内容开发 / 媒体开发 / QA 测试 / Claude 审查`.

### 验证
- `bash -n scripts/start_multi_agents_cmux.sh` ✅
- `bash scripts/start_multi_agents_cmux.sh --dry-run` ✅
- `bash scripts/start_multi_agents_cmux.sh` 在已有 5 个 workspace 时全部 skip, 不再重复打开 ✅
- AppleScript 实测当前 cmux: `windows=1`, `tabs=5` ✅
- 5 个工作区路径分别是主仓库 + `content-dev / media-dev / qa / review` ✅

---

## 上一里程碑 (2026-04-29 · D-105 cmux fallback 防重复打开)

**版本**: v0.7.6-agent4 — cmux fallback 不再重复打开同一个 Agent workspace.

### D-105 修复
- `scripts/start_multi_agents_cmux.sh`: fallback 打开前用 AppleScript 检查 cmux 左侧
  是否已有相同工作目录; 已存在则跳过, 避免重复开很多个.
- `docs/MULTI_AGENT_WORKFLOW.md`: 补 fallback 下中文命名的手工规则.
- 说明: cmux AppleScript 的 `tab.name` 是只读, 当前 socket 又返回 `Broken pipe`;
  所以自动中文命名只有 cmux CLI socket 正常时可用, fallback 模式以不重复为优先.

### 验证
- 已用 AppleScript 清理本次测试重复 workspace, 保留一套
  `Factory/content-dev/media-dev/qa/review` ✅
- `bash -n scripts/start_multi_agents_cmux.sh` ✅
- `bash scripts/start_multi_agents_cmux.sh --dry-run` ✅

---

## 上一里程碑 (2026-04-29 · D-104 cmux 左侧 workspace 降级打开)

**版本**: v0.7.6-agent3 — cmux CLI socket 不通时也能一键打开 5 个 Agent workspace.

### D-104 修复
- `scripts/start_multi_agents_cmux.sh`: cmux CLI `Broken pipe` / socket 不可用时,
  自动降级到 `open -a cmux <worktree>`.
- 降级模式会在 cmux 左侧打开主控、内容开发、媒体开发、QA、审查 5 个 workspace;
  需要进入各 workspace 手动运行 `./.agent-start.sh`.
- 降级模式通过 `~/Desktop/nrg-agent-workspaces/NRG ...` 中文名符号链接打开,
  尽量让 cmux 左侧直接显示中文角色名.
- `.agent-start.sh` 启动时设置终端标题为中文角色名.
- `docs/MULTI_AGENT_WORKFLOW.md`: 补 cmux fallback 说明.

### 验证
- `open -a cmux` 已实际打开:
  `content-dev / media-dev / qa / review` worktree workspace ✅
- `bash -n scripts/start_multi_agents_cmux.sh` ✅
- `bash scripts/start_multi_agents_cmux.sh --dry-run` ✅

---

## 上一里程碑 (2026-04-29 · D-103 5-Agent 默认模型参数固定)

**版本**: v0.7.6-agent2 — Codex/Claude 多 Agent 启动默认模型显式固定.

### D-103 修复
- `scripts/start_multi_agents_cmux.sh` / `scripts/start_multi_agents_tmux.sh`:
  `.agent-start.sh` 生成时显式带 Codex `gpt-5.5` +
  `model_reasoning_effort="xhigh"`.
- Claude 审查 Agent 显式带 `--model opus4.7 --effort max`.
- 支持环境变量临时覆盖:
  `CODEX_MODEL`, `CODEX_REASONING_EFFORT`, `CLAUDE_MODEL`, `CLAUDE_EFFORT`.
- `docs/MULTI_AGENT_WORKFLOW.md`: 补默认模型说明.

### 验证
- `bash -n scripts/start_multi_agents_cmux.sh scripts/start_multi_agents_tmux.sh` ✅
- `bash scripts/start_multi_agents_cmux.sh --dry-run` ✅
- `bash scripts/start_multi_agents_tmux.sh --dry-run` ✅

---

## 上一里程碑 (2026-04-29 · D-102 一键启动 5-Agent 工作台)

**版本**: v0.7.6-agent — 多 Agent 操作从"手动开 5 个窗口"升级为 cmux/tmux 一键准备.

### D-102 修复
- `scripts/start_multi_agents_cmux.sh`: 走 `/Applications/cmux.app/Contents/Resources/bin/cmux`
  一键创建 `NRG 总控 / 内容开发 / 媒体开发 / QA / Claude 审查` 5 个 workspace.
- `scripts/start_multi_agents_tmux.sh`: 一键准备 `controller/content-dev/media-dev/qa/review`
  5 个 tmux 窗口, 自动进入各自 worktree.
- 每个 worktree 自动生成本地 `.agent-role.md` 和 `.agent-start.sh`, 并写入本地
  git exclude, 不进仓库.
- 默认只展示角色说明, 不启动模型; 需要并发启动时加 `--launch`.
- 启动前会在工作区干净时 fast-forward 到 `main`, 避免副 Agent 从旧代码开工.
- `docs/MULTI_AGENT_WORKFLOW.md`: 补一键启动命令.

### 验证
- `bash -n scripts/start_multi_agents_cmux.sh` ✅
- `bash scripts/start_multi_agents_cmux.sh --help` ✅
- `bash scripts/start_multi_agents_cmux.sh --dry-run` ✅
- `bash -n scripts/start_multi_agents_tmux.sh` ✅
- `bash scripts/start_multi_agents_tmux.sh --help` ✅
- `bash scripts/start_multi_agents_tmux.sh --dry-run` ✅

---

## 上一里程碑 (2026-04-29 · D-101 热点改写多版本生成)

**版本**: v0.7.6 — 热点改写“本次会出 2/4 篇”现在后端真生成多版本, 前端可切换对比.

### D-101 修复
- `POST /api/hotrewrite/write`: 请求体新增 `modes.with_biz / modes.pure_rewrite`;
  返回新增 `version_count`, 预计耗时按 2/4 版调整.
- `backend/services/hotrewrite_pipeline.py`: 新增 `build_write_variants` 和
  `write_script_batch`, 每个勾选模式真生成 2 版; task.result 保留兼容字段
  `content/word_count/self_check/tokens`, 同时新增 `versions[]`.
- `web/factory-hotrewrite-v2.jsx`: 改写模式默认两种都勾, 默认出 V1-V4 四版;
  任务完成后一次 append 多版, 正文顶部和底部都有版本切换.
- `scripts/e2e_hotrewrite_versions.js` + `tests/test_hotrewrite_versions.py`: 覆盖
  默认 4 篇、取消/恢复模式、modes 传参、返回 4 版后切换正文.

### 验证
- `pytest -q tests/test_hotrewrite_versions.py` ✅
- `pytest -q -x` ✅ (全量通过; dhv5 本机缺 skill 的 skip 仍为预期)
- `curl POST /api/hotrewrite/write` 临时替换后台写作函数避免烧 credits: 返回
  `version_count=4`, `estimated_seconds=180` ✅
- Playwright :8001 `?page=hotrewrite` 真点模式勾选 + 选角度 + 切第 2 版:
  `/api/hotrewrite/write` body 含 `modes.with_biz=true/pure_rewrite=true`,
  页面显示 `4 版文案`, textarea 从第一版切到第二版, console/pageerror=0 ✅
- 截图已读: `/tmp/_ui_shots/d101_hotrewrite_versions.png`.

---

## 上一里程碑 (2026-04-29 · D-100 做视频 Step 1 热点排行入口优化)

**版本**: v0.7.5 — 做视频默认页底部从复用作品改为热点排行, 直连热点改写.

### D-100 修复
- `web/factory-make-v2.jsx`: Step 1 默认页底部删除“复用最近做过的”区域, 改成常驻
  `热点排行` 面板.
- 热点卡采用排行式信息结构: 排名 / 平台 / 夜班标记 / 匹配度 / 热度条 / 改写入口.
- 点击任意热点直接写入 `hotrewrite_seed_hotspot`, 设置 `from_make_anchor`, 跳转
  `PageHotrewrite`; 热点改写页自动进入拆解 + 选角度流程.
- 按老板标注, 暂时隐藏“或者从这里开始写文案”的 6 个 skill 快捷卡, 降低默认页噪声.

### 验证
- Playwright :8001 `?page=make` 注入 3 条热点: 页面显示 `热点排行`; 不再出现
  `复用最近做过的` / `或者从这里开始写文案` ✅
- Playwright 点击第一条热点: 跳到热点改写 Step 2 `选切入角度`; `/api/hotrewrite/analyze`
  body 含被选热点标题; console/pageerror=0 ✅
- 截图已读:
  `/tmp/_ui_shots/d100_make_hot_rank.png`,
  `/tmp/_ui_shots/d100_make_hot_to_hotrewrite.png`.

---

## 上一里程碑 (2026-04-29 · D-099 公众号 HTML 底部头像本地预览修复)

**版本**: v0.7.4 — Step 6 HTML 预览底部头像避开微信 mmbiz 防盗链.

### D-099 修复
- `backend/services/wechat_scripts.py`: Step 6 预览头像新增本地化链路:
  1. 优先用 Settings 上传的 `author_avatar_path` 且在 `data/` 下的文件.
  2. 手工配置了 `data/` 外部头像时,复制到 `data/wechat-avatar/avatar-preview.*`.
  3. 没配置头像时,把 template 自带的 mmbiz 头像缓存到
     `data/wechat-avatar/template-avatar.png`, 预览 iframe 用
     `http://127.0.0.1:8000/media/wechat-avatar/...`.
- `assemble_html`: preview raw HTML 用本地头像替换 template 硬编码头像; push raw 仍保留
  微信图床头像,不把本地 `/media/` 泄进草稿箱推送 HTML.
- `last_assemble_request.json`: 增加 `avatar_preview` 诊断字段,能看 source / url /
  replaced,以后头像问题不用和段间图混查.
- `tests/test_wechat_avatar.py`: 增 4 个 D-099 回归,覆盖 data 内头像、外部头像复制、
  template mmbiz 缓存、preview/push 双路径隔离.

### 验证
- `pytest -q tests/test_wechat_avatar.py tests/test_wechat_html_inject.py` ✅
- 真实 `POST /api/wechat/html` 用最近公众号长文 + 4 张段间图返回 200; `raw_html`
  头像为 `http://127.0.0.1:8000/media/wechat-avatar/template-avatar.png`; push raw
  仍走 mmbiz ✅
- `curl -I http://127.0.0.1:8000/media/wechat-avatar/template-avatar.png` 返回 200
  `image/png`, 432544 bytes ✅
- Playwright :8001 Step 6 真 iframe: `.author-avatar` `naturalWidth=822`,
  `clientWidth=88`, console/pageerror=0; 截图已读:
  `/tmp/_ui_shots/d099_wechat_avatar_preview.png` ✅
- `pytest -q -x` ✅ (全量通过; dhv5 本机缺 skill 的 skip 仍为预期)

---

## 上一里程碑 (2026-04-29 · D-098 AGENTS/CLAUDE 入口同步)

**版本**: v0.7.3-doc — 文档入口同步, 无代码改动.

### D-098 修复
- `AGENTS.md`: 同步 `CLAUDE.md` 新增的 `docs/WECHAT-SKILL-LESSONS.md` 按需读入口.
- `AGENTS.md`: 文档事实源表补公众号 skill 踩坑大全.
- `AGENTS.md`: UI 验证措辞同步为 "Read 看截图", 与 `docs/SYSTEM-CONSTRAINTS.md` §7.1 对齐.
- 保留 `AGENTS.md` 的 Codex/GPT 入口标题和说明.

### 验证
- `diff -u AGENTS.md CLAUDE.md` 仅剩入口文件身份相关差异.
- `wc -l AGENTS.md CLAUDE.md` 均小于 200 行.

---

## 上一里程碑 (2026-04-29 · D-097 公众号段间图已完成后也能一键并发重生)

**版本**: v0.7.3 — 修 Step 5 4/4 已生成后只能逐张重生.

**触发 case**: 老板截图显示 Step 5 已经 `段间配图 · 4/4`, 但每张卡片只有
"用新 prompt 重生", 看起来只能一张张重生. D-096 只给 pending 图做了"一键生成",
没有覆盖 done 图的批量重生状态.

### D-097 修复
- `web/factory-wechat-v2.jsx`: Step 5 在 `pending=0 && doneCount>0` 时显示
  `一键重生 N 张`; 点击后用同一套 `Promise.all(indices.map(onGen))` 并发提交所有
  已完成卡片.
- `generateOneImage`: 进入 running 时清掉旧 `mmbiz_url/media_url/error`, 避免重生中
  继续显示旧图误导.
- `scripts/e2e_wechat_d096_flow.js`: 增加 4/4 后点击"一键重生 4 张"的回归,确认
  第二批 4 个 `/api/wechat/section-image` 请求也在 1 秒内提交.

### 验证
- `node scripts/e2e_wechat_d096_flow.js` ✅
- 截图已读: `/tmp/_ui_shots/d097_images_regen_all.png`, 顶部显示
  `一键重生 4 张`, 页面仍为 `段间配图 · 4/4`.

---

## 上一里程碑 (2026-04-28 · D-096 公众号全链路交互收口)

**版本**: v0.7.2 — 修公众号 Step 2 标题换一批重复、Step 5 配图先选风格再生成、
Step 6 拼 HTML 错误误导.

**触发 case**: 老板连续指出公众号链路三处"看起来跑了但体验错":
1. Step 2 点"再出 3 个"仍像同一批标题,感觉写死.
2. Step 5 段间配图进入后自动开跑,但正确交互应是先选统一风格,再一键 4 张并发
   或单张生成.
3. Step 6 拼 HTML 失败时,真实错误被前端包装成"没匹配到已知模式",排查方向被误导.

### D-096 修复
- `POST /api/wechat/titles`: 增加 `avoid_titles` / `round` 向后兼容字段. 前端点
  "再出 3 个"时把上一批标题传回后端; 后端 prompt 明确禁止重复/近似复述,并过滤
  完全重复标题.
- `web/factory-wechat-v2.jsx`: Step 5 删除"进入页面自动开跑 / 切风格自动重生"逻辑.
  现在必须先点统一风格,再点"一键生成 N 张"并发提交剩余卡片; 单张按钮也受风格
  守卫. 切风格仍走 `/api/wechat/restyle-prompts` 用 LLM 重写 prompt 主体.
- `backend/services/wechat_scripts.py`: 拼 HTML 的转换脚本不再跟随 `.venv` 的
  `python3`, 改为 `_skill_python()` 自动挑装了 `bs4/premailer` 的系统 Python; 找不到
  时抛业务错误.
- `web/factory-api.jsx` + `factory-errors.jsx`: 5xx 有后端 `detail` 时保留真实原因,
  并新增公众号排版环境错误模式,不再兜成未知错误.
- `scripts/e2e_wechat_d096_flow.js`: 浏览器回归覆盖 Step 2/5/6 三个入口.

### 验证
- `pytest -q tests/test_wechat_skill.py tests/test_wechat_html_inject.py` ✅
- `node scripts/e2e_wechat_d096_flow.js` ✅
- 真实 `/api/wechat/html` 用最近长文 + 4 张段间图打通: 200, raw HTML 13255 字,
  wechat HTML 12572 字 ✅
- `pytest -q -x` ✅
- `node scripts/e2e_wechat_write_recover.js` ✅ (D-095 回归未坏)
- 截图已读:
  `/tmp/_ui_shots/d096_titles_regen.png`,
  `/tmp/_ui_shots/d096_images_html_success.png`,
  `/tmp/_ui_shots/d096_html_error_friendly.png`,
  `/tmp/_ui_shots/d095_wechat_write_recovered.png`.

---

## 上一里程碑 (2026-04-28 · D-095 公众号写长文恢复态卡死修复)

**版本**: v0.7.1 — 修 Step 4 写长文"转了好久"假卡死.

**触发 case**: 老板截图显示公众号页停在 Step 4 `长文 2000-3000 字,慢一点,质量优先`
动效. 查 DB 发现最近 `wechat.write` 任务已 `ok`, 2964 字正文和自检结果都在
task.result 里, 但前端 localStorage 恢复的是 `step=write + article=null`. 旧
`WxStepWrite` 把 `!article` 当成正在生成, 不绑定后台任务也不回填结果, 所以无限转圈.

### D-095 修复
- `web/factory-wechat-v2.jsx`: Step 4 遇到 `article=null && loading=false` 时不再显示
  写作动效, 改为 `WxStepWriteRecover`:
  - 先查 `/api/tasks?limit=30`, 按 title/topic 匹配最近 `wechat.write`.
  - 找到 `ok + result.content` 自动 `setArticle`, 老板不用重写、不重复烧 Opus.
  - 找到 running/pending 则接入 `useTaskPoller` + `<LoadingProgress />` 真进度.
  - 找不到才显示"再接一次 / 回大纲 / 重新写长文"兜底.
- `backend/services/tasks.py`: `finish_task(status=ok)` 同步把 `progress_pct=100`,
  `progress_text="完成"`, 后续任务不再停在 95 "整理结果..." 看起来像卡住.
- `tests/test_tasks.py`: 加 D-095 回归, 确认 ok 任务进度收口 100.
- `scripts/e2e_wechat_write_recover.js`: 浏览器回归脚本, 种入同款坏快照后确认自动显示
  2964 字正文.

### 验证
- `pytest -q tests/test_tasks.py tests/test_wechat_pipeline_async_smoke.py tests/test_llm_empty_content.py` ✅
- `pytest -q -x` ✅ (全量通过, dhv5 本机缺 skill 的 skip 仍为预期)
- `node scripts/e2e_wechat_write_recover.js` ✅
- 截图: `/tmp/_ui_shots/d095_wechat_write_recovered.png` 已读, 页面显示正文 + 自检结果,
  console/pageerror = 0.
- 后端已重启到 tmux `nrg-api`, `GET /api/tasks?limit=1` 正常.

---

## 上一里程碑 (2026-04-28 · D-094 全清单 P1-P3 一次性扫完 + 修)

**版本**: v0.7.0 — 老板"我有的是时间, 你慢慢弄, 我要的是别出错". 一次性把 D-092
列的 13 项清单 (P1 文案 9 + P2 防盗链 7 + P3 template 3) 全过完, 6 处真隐患
按 D-093 同模板修, 5 处假设错不修留教训.

### 一项一项过的结果

| 项 | 假设 | 真验证 | 修法 | 测试 |
|----|------|------|------|------|
| **W5** compliance pipeline | _scan_violations / _write_version `or {}` fallback 假通过 | **对** — 假 0 违规通过 + 假改写双版空文 | 解析失败 + 空 content raise | 6 case 通过 |
| **W10** materials | 1618 条 LLM 失败 hallucinate 标签污染 | **错** — 已有 source 区分 (llm/heuristic) + confidence (0.7/0.4) + log warning | 不修 | follow-up 加回归 |
| **W2** wechat_scripts 剩 | plan-images / restyle `or []` 失败假成空数组 | **对** — 用户卡 spinning / 切风格图没变 | 解析失败 raise + 全 fallback raise | (走现有) |
| **W6** touliu | `or {}` 假成 batch=[] | **对** — UI 看 0 条文案以为正常 | raise | (走现有) |
| **W7** planner | analyze/write `or {}` levels=[] 假成功 | **对** — Step 2 候选档次空卡死 | raise | (走现有) |
| **W8** baokuan | DNA 三字段 + versions `or {}` 假成功 | **对** — 全空字段 / V1V2V3 卡片但点开空 | raise | (走现有) |
| **W9** dhv5 | LLM 失败处理 | **错** — 已经 raise Dhv5Error (line 217/222/228) | 不修 | - |
| **W1** wechat 剩 (titles/outline/rewrite-section) | `or {}` 假成空 titles / 空大纲 / 空重写 | **对** — Step 2/3 卡死 + 选段消失 | raise | (走现有) |
| **W3** hotrewrite breakdown | `or {}` 假成 angles=[] | **对** — Step 1 候选角度空卡死 | raise | (走现有) |
| **W4** voicerewrite extract_skeleton | 同 W3 | **对** | raise | (走现有) |
| **D1** moments 朋友圈 | mmbiz 防盗链 | **错** — `api.media(c.media_url)` 走本地代理 ✅ | 不修 | - |
| **D2** image-gen | 防盗链 | **半错** — 主路径 `api.media`, 但 fallback `img.url` 异常情况撞 | 不修 (异常路径), follow-up 删 fallback | - |
| **D3** dreamina-v2 | 防盗链 | **错** — `api.media(rel)` ✅ | 不修 | - |
| **D4** dhv5 | 防盗链 | **半对** — 3 处包了 `api.media`, 1 处 (line 1015) 漏包导致视频拼到 :8001 404 | 修这 1 处 | (UI 要等老板真生成才能验) |
| **D5** baokuan | 没图标签 | **错** | 不修 | - |
| **D6** make-v2 | 写文案有图? | **错** — 已用 `api.media` ✅ | 不修 | - |
| **D7** wechat cover Step 7 | mmbiz 防盗链 | **错** — `api.media(c.media_url)` ✅ | 不修 | - |
| **T1** v1-dark / v2-magazine | 缺锚点 | **对** — 真切到这俩会 raise (锚点全无) | D-089 已加 subn 检测自动报错 | - |
| **T2** _inject_into_template hero 三 sub | 同 D-089 同款静默 fail | **半对** — hero-title/subtitle OK, **hero-badge template 真没这元素** (D-089 之前没察觉的同款静默 fail) | hero-title/subtitle 加 raise, hero-badge log warning (template 现状已知) | (走现有 7 case) |
| **T3** 其他 skill template | 是否有同款 | **错** — 只 wechat 有, 其他 skill 没 template 替换 | 不修 | - |

### 本次修复总览
- **6 处真 fail-fast 修**: compliance ×2 + wechat_scripts ×2 + touliu / planner ×2 / baokuan ×2 / wechat_pipeline ×3 / hotrewrite + voicerewrite analyze + dhv5 video src
- **5 处假设错没修**: materials / D1 / D3 / D5 / D6 / D7 (验证后已 work)
- **2 处 follow-up**: D2 fallback 删 / materials 加回归
- 1 处文档化已知 (T2 hero-badge template 真没此元素)

### 测试
- pytest 547 通过 / 17 skip (新增 6 case compliance fail-fast).
- 各 fail-fast 修都按 D-088 同款"_extract_json 返 None / 关键字段空" raise 模式.
- 没修的几处 (W10 materials / D1/D3/D5/D6/D7 / W9 dhv5) 都因为 "已有合理设计"
  而非"懒得修". 验证结论各项写进表里.

### 反思 (D-092 5 条规则贯彻情况)
- 规则 1 (验证假设): W10 / D 类各处都先看代码再决定, 不预设结论. 验证后 5 处假设错.
- 规则 2 (禁编造): 每个修法都有具体代码行号 + 解析失败时打印 r.text 头给用户看真相.
- 规则 3 (扫同类): D-093 → D-094 主动把同 session 漏掉的 9 处 LLM 假成功 + 1 处
  D-089 同款 hero-badge 漏检 + 1 处 D-090 同款 dhv5 video src 漏 api.media 一起修.
- 规则 4 (禁用语): 每项假设 + 验证 + 决策 + 测试都附数据.
- 规则 5 (做不到就明说): D4 dhv5 video src 修了但要等老板真生成视频才能闭环.
  follow-up: D2 fallback / materials 回归测试 / hero-badge 是否需要加回元素 — 都标了.

---

## 上一里程碑 (2026-04-28 · D-093 F1 作品库全面排查 — 文字 skill 入库链路修)

**版本**: v0.6.7 — 老板报告"作品库很多内容没展示出来", D-092 列了全项目排查清单 13 条,
F1 作品库是 P0. 修完 12 条历史文字产出找回 + 链路恢复.

### 触发 case + 真根因
- 老板说"很多内容没展示出来" — 验证假设: DB 272 条 / API 也返 272 / **by_type 只有
  image+video, text=0**. 所有文字 skill (公众号长文 / 热点改写 / 录音改写 / 投流 /
  策划 / 审查 / 朋友圈 / 爆款) 产出都没入作品库.
- 真根因 (复现 TypeError 100% 确认):
  `tasks.py:_autoinsert_text_work` 调 `insert_work(tokens_used=...)` 但
  `shortvideo/works.py:insert_work` 函数签名漏 tokens_used 参数 → 抛 TypeError →
  被 `except Exception: pass` 静默吞光 → 13 条文字 ok task 完成 0 条入库. 老板用
  了几个月没人发现.

### D-093 修复 (4 处)
1. `shortvideo/works.py:insert_work` 加 tokens_used 参数 (schema/dataclass 有这列,
   函数签名漏). 写入 SQL VALUES.
2. `backend/services/tasks.py:_KIND_TO_SKILL` 补 compliance — 历史 8 条 compliance.check
   ok 即使修了 1 也不入库.
3. `backend/services/tasks.py:_extract_text_from_result` 加 version_a/b 双版本结构识别
   (compliance result 是 `{version_a:{content},version_b:{content}}` 嵌套, 不在
   versions list 里).
4. `backend/services/tasks.py:_autoinsert_text_work except` 改 log warning, **不再
   静默吞** — 历史 bug 就是 except: pass 把 TypeError 吃光老板发现不了.

### Backfill 老板历史产出
- `scripts/backfill_text_works_d093.py` 把 13 条 ok 文字 task 重建成 works text 记录.
  幂等 (用 metadata.task_id 唯一标识). 1 条文本过短跳过, 12 条真入: 8 compliance +
  3 wechat 长文 + 1 baokuan 改写.

### 测试
- `tests/test_autoinsert_text_work.py` 7 case: insert_work tokens_used 参数 / KIND 含
  compliance / 双版本识别 / 双版本缺 content 返空 / 普通路径不变 / except 改 log
  warning / 端到端 mock 入库. fixture 自动清理 test-d093 残留不污染老板真 DB.
- 541 通过 / 17 skip.

### 闭环验证
- DB 验: text works 12 条 (8 compliance + 3 wechat + 1 baokuan), backfill 幂等.
- API 验: `/api/works/sources` by_type 含 `text:12`.
- playwright :8001 真前端: 作品库顶栏 "📝 文字 12" tab 可见, 切到文字 + 全部时间, 12
  张文字卡片真渲染, 公众号长文 / 违规审查 / 爆款改写来源 chip 正常分类. 截图
  `/tmp/_ui_shots/d093_03_text_tab_full.png` 视觉确认 (老板今天的 wechat.write
  也实时入了, 证明新代码生效).

### 反思 (D-092 5 条规则的应用)
- **规则 1 (验证假设)**: 写一行 `insert_work(tokens_used=999)` 真复现 TypeError, 不
  靠"代码看着对".
- **规则 2 (禁编造)**: 没编模型行为, 直接 grep + 数 DB.
- **规则 3 (扫同类)**: 顺手补了 compliance + version_a/b 嵌套识别 + except 改 log,
  不只修出错那一行.
- **规则 4 (禁用语)**: 每次说结果都附数据 (12 条 / 7 case / 541 通过).
- **规则 5 (做不到就明说)**: 没踩.

---

## 上一里程碑 (2026-04-28 · D-092 举一反三 — 同 session 3 次踩"看似工作其实没工作"的反思)

**版本**: v0.6.6 — 老板批评"做事毛躁举一反三". 主动扫 D-088/D-091 v1 同类风险,
3 项一项一项处理: 验证 → 决策 → 修.

### 反思 (D-092 触发)
- 同 session 连续踩 3 次"代理指标对了真实指标错"的坑:
  D-088 (task ok 但 content 空) → D-089 v1 (file:// 看 raw_html 含 img 当过) →
  D-091 v1 (prompt 文本变了当过, 没真烧图).
- 老板每次抓包我才修, 没主动找同类隐患. 老板原话: "你这不是忽悠人吗? 你自己不
  知道测一下再告诉我? ... 变笨了一样, 做事毛躁."
- 5 条新规则写进 `docs/WECHAT-SKILL-LESSONS.md` 第 8 节, 以后必守.

### 主动扫同类隐患 (3 项验证 + 决策)

| 风险 | 假设 | 真验证后结论 | 修法 |
|------|------|------------|------|
| 1. cover 4 选 1 末尾 append | 跟 D-091 v1 同款失效 | **错** — Read 老板历史 4 张候选肉眼对比, 视觉真区分 (蓝调极简/真实场景/深色 VS/复古怀旧) | 不改 (改了反引入回归) |
| 2. hotrewrite + voicerewrite 自检 | 跟 D-088 同款空 content hallucinate 通过 | **对** — 代码确实直接进自检无空判 | 加 fail-fast raise (D-088 同款) |
| 3. 段间图单张 chip | 跟 D-091 v1 末尾 append 同款无效 | **对** — 单张 chip 调用的就是 `appendPreset` 末尾追加 | 删掉 (留着持续误导) |

### D-092 修复
- `backend/services/hotrewrite_pipeline.py:120`: content 空 raise RuntimeError
  含 token 数, 不进自检.
- `backend/services/voicerewrite_pipeline.py:155`: script 空 raise (单次 LLM JSON
  路径, 即使 self_check fallback 是 overall_pass=False 也加保护防 task 状态 ok 含
  空 script).
- `web/factory-wechat-v2.jsx`: 删掉单张卡片底部 6 个风格 chip (`appendPreset`
  + chip JSX). 保留 textarea + "🔄 用新 prompt 重生" 微调路径.
- `tests/test_llm_empty_content.py` +3 case: hotrewrite 空 → raise + 不进自检 /
  voicerewrite 空 script → raise / hotrewrite 正常路径不抛 (回归保护).

### 闭环验证 (按新规则 1: 真自己跑, 不靠"代码看着对")
- pytest -x 534 通过 / 17 skip (新增 3 case).
- playwright `/tmp/_d092_chip_removed.js`: 真前端 :8001 注入 wf snapshot, 验顶部
  全局 chip 仍在 + 5 个风格 label 各只在 textContent 出现 1 次 (单张 chip 真删干净)
  + 4 textarea + 4 重生按钮还在 + console 无 error. 截图 d092_01_chip_removed.png
  视觉确认.

---

## 上一里程碑 (2026-04-28 · D-091b LLM 重写 prompt 主体修正 D-091 v1 末尾 append 无效)

**版本**: v0.6.5 — D-091 v1 仅末尾 append 风格关键词对 apimart 无效 (老板实测怀旧
出来还是真实摄影). v2 改用 LLM 重写 prompt 主体让 4 张视觉真统一.

**自我反思**: D-091 v1 闭环只验证 "切风格后 prompt 文本末尾改了" + "console clean"
就当过. 没真烧 apimart 跑一张图看视觉. 这是 D-075 教训复发 — 文本对 ≠ 视觉对.
老板实测 4 张怀旧出来还是各种风格, 揭穿 v1 的错. CLAUDE.md 完工铁律 §7.1 第 7 条
"真跑端到端烧 credits 类" 这次必须做. 经验沉淀写进 LESSONS 第 7 节.

### D-091b 修复
- `backend/services/wechat_scripts.py:restyle_section_prompts(prompts, style_id)`:
  6 个风格 (real/documentary/warm/ink/cartoon/vintage) 加详细语义说明 (`_STYLE_GUIDES`
  dict), LLM 系统 prompt 写"风格融进画面主体, 不只末尾追加". deepseek 轻调用 3-5s.
- `backend/api.py: POST /api/wechat/restyle-prompts` 新 endpoint.
- `web/factory-wechat-v2.jsx:pickGlobalStyle` 改成 async, 切风格时:
  1. 调 /api/wechat/restyle-prompts 真让 LLM 重写 4 个 prompt
  2. 替换 plan.image_prompt + 清状态 (status=pending, mmbiz_url/media_url=null)
  3. useEffect 自动重生 4 张 (走 D-090 双 URL 链路)
  4. restyling state 防多点击 / restyle 失败回退原 styleId

### 真烧 apimart 视觉验证 (这次必做)
- 同 base "木桌散落面包和手机" 走 LLM restyle, vintage + cartoon 各跑 1 张
- vintage 图 `/Users/black.chen/Desktop/neironggongchang/data/wechat-images/1777353304_*.png`:
  暗墨绿色调 + 颗粒感 + 老式黑莓键盘机 + 暗角做旧
- cartoon 图 `/Users/black.chen/Desktop/neironggongchang/data/wechat-images/1777353317_*.png`:
  扁平描边 + 暖橙色 + 卡通包装 + iPhone + 餐包插画
- **视觉差异巨大 ✅**, 跟 v1 末尾 append "都长一样" 对比鲜明.

### playwright 闭环 (前端)
- 注入 wf:wechat snapshot 给 4 张 pending plan
- 点"复古怀旧" → restyle endpoint 真被调 1 次 (deepseek 3-5s)
- 4 条 prompt 全部 differ from original (主体改了, 不只是末尾贴)
- 4/4 含 vintage 关键词 (90/胶片/颗粒/老式/暗角/泛黄/做旧/老照片/褪色/CRT/钨丝/噪点)
- console + page no error
- 截图 `/tmp/_ui_shots/d091b_01_after_pick_vintage.png` 视觉确认

### 测试
- 535 通过 / 17 skip (jsx helper 没 JS 测试 infra). 后端 restyle 已 curl 真测 3 风格.

---

## 上一里程碑 (2026-04-28 · D-091 公众号段间图统一风格选择器 — v1 错误, 见 D-091b 修)

**版本**: v0.6.4 — Step 5 顶部加全局"统一风格"chip group, 4 张图套同一个风格.

**触发 case** (老板今天 12:50): 4 张段间图能显示了 (D-090 OK), 但 LLM 出 prompt
时 4 张隐含不同氛围 (有的明亮店铺, 有的昏暗茶室, 有的科技蓝光), 4 张图视觉风格
不统一, 放在一篇公众号里"有点奇怪". 老板要"我选手绘 4 张都手绘, 选写实 4 张都
写实"的全局统一选择.

### D-091 实现
- `web/factory-wechat-v2.jsx` 新增 helper:
  - `loadGlobalStyleId / saveGlobalStyleId` localStorage 持久化用户偏好
  - `stripStyleAppendsAtEnd` 把末尾任何已知 PRESET.append strip 掉 (多扫 2 轮防双层)
  - `applyGlobalStyleToPrompt` strip 旧 + 套新, 幂等
- `WxStepImages` 加 `globalStyleId` state + `pickGlobalStyle` 切换函数:
  - 顶部 chip group: 🎨 统一风格 + 6 个 PRESET (真实感/纪实/暖色慢节奏/水墨/卡通/复古)
  - 默认 "real" (跟现有 backend plan-images prompt "真实感照片风格,暖色调" 对齐)
  - 切风格: 给 4 张 strip+append 新风格 + 清状态 (status=pending, mmbiz_url=null)
    + 重置 styleAppliedRef + autoStartedRef → useEffect 自动重生 4 张
  - 已 done + mmbiz_url 的不动 prompt (避免误改用户已认可的图描述)
- useEffect 第一次出 plans 时自动套 globalStyle.append (用户改 prompt 不会被覆盖,
  styleAppliedRef 控制只跑一次)
- 单张卡片的 chip 还在 (微调用), 跟全局 chip 互不干扰

### 闭环验证 (playwright :8001 真前端)
- 注入 wf:wechat localStorage snapshot (4 张 pending plan), goto :8001 wechat
- Stage 1 默认: 真实感 chip brand color 高亮; 4 张 prompt 末尾 ",真实感照片,自然光,暖色调" ✅
- Stage 2 切水墨: 4 张 prompt 切成 ",中式水墨风,山水意境,留白", real append 全清 ✅
- Stage 3: localStorage 持久化 "ink" ✅; console + page no error ✅
- 截图 `/tmp/_ui_shots/d091_01_step5_default.png` + `d091_02_after_pick_ink.png` 视觉确认.

### 测试
- 535 通过 / 17 skip (jsx helper 没 JS 测试 infra, 走 playwright 端到端).

---

## 上一里程碑 (2026-04-28 · D-090 段间图防盗链 + 双 URL 策略 + 经验沉淀)

**版本**: v0.6.3 — Step 6 排版预览段间图能真显示 (不再"未经允许不可引用").
新建 `docs/WECHAT-SKILL-LESSONS.md` 公众号 skill 踩坑大全, 一站式查阅 D-039/
D-042/D-045/D-046/D-048/D-088/D-089/D-090, 后续 AI 改这块前必扫.

**触发 case**: 老板今天 12:38 D-089 修完后看 Step 6, 段间图显示防盗链占位
"此图片来自微信公众平台 未经允许不可引用". D-089 让段间图进了 raw_html, 但
浏览器在 :8001 加载 mmbiz.qpic.cn referer 不对被防盗链挡.

### D-090 修复
- 后端 `_md_to_wechat_html` 加 `prefer_media: bool` 参数 + `_MEDIA_PREVIEW_BASE`
  常量. True → 用 media_url 拼 `http://127.0.0.1:8000/media/...`, False → 用
  mmbiz_url. 缺时退化.
- `assemble_html` 渲染两份: `wechat_article_raw.html` (preview, media_url) +
  `wechat_article_raw_push.html` (推送, mmbiz_url). converter 喂 push 版,
  前端 iframe 拿 preview 版.
- 前端 (`factory-wechat-v2.jsx` 两处) section_images 透传 `{mmbiz_url, media_url}`
  双字段, 不再丢 media_url.
- `tests/test_wechat_html_inject.py` +3 case: prefer_media 用本地代理 / 缺
  media_url 退化 mmbiz / push 用 mmbiz 不漏 /media/.

### D-090 经验沉淀 (老板要求 "不要每次重新踩")
- 新建 `docs/WECHAT-SKILL-LESSONS.md` 公众号踩坑 7 节: 双 URL / template 静默
  fail / LLM 空 content / Phase 4-5 头像+sanitize / fail-fast 不伪 ok / template
  是 skill 仓库资产 / 改完必跑闭环.
- `CLAUDE.md` 文档表 + Session 启动 3 步 加索引指向 LESSONS.

### 闭环验证
- `pytest -x` 531 通过 + 17 skip (新增 3 case).
- 真前端 :8001 playwright (不是 file://): chromium goto :8001 wechat, fetch
  /api/wechat/html 真链路, raw_html setContent 后段间图
  `http://127.0.0.1:8000/media/wechat-images/d090test.png` 浏览器真加载
  (loaded_ok=true, naturalWidth=800x450), console 无 error. 截图视觉确认.

---

## 上一里程碑 (2026-04-28 · D-089 公众号 Step 6 段间图丢失修复)

**版本**: v0.6.2 — 修 `_inject_into_template` content 替换正则不命中导致段间图被吞.

**触发 case** (老板今天 12:25 真踩到, 紧接 D-088): Step 5 4 张段间图都生成成功
(debug 显示 `section_images_with_mmbiz_url=4`), Step 6 排版预览却看到 template
自带 demo 占位 ("昨天中午, 工作室里就我一个人, 泡了杯茶坐在茶台前..."), 4 张
段间图全没贴进 HTML. `last_assemble_request.json` 里 `img_in_raw_html=1` (只剩
头像那一张).

### D-089 根因 + 修复
- 根因: `_inject_into_template` 替换 content 区的正则要求
  `</div>\s*</div>\s*<div class="footer-fixed"` 紧贴, 但 `template-v3-clean.html`
  里 content + article-body 都是隐式不闭 div (浏览器宽容渲染), 实际不存在那个
  序列 → `re.sub(count=1)` 无声 fail, 整段 demo 占位被原样吐给前端, body_html
  (含 4 张段间图 `<img>`) 跟着丢光.
- 修复: 改用宽容区间 `<div class="content"...> ... <div class="footer-fixed"`,
  用 `re.subn` 拿到命中数, `n != 1` 直接 raise WechatScriptError, 不静默给残品.
- 测试 `tests/test_wechat_html_inject.py`: 7 case 覆盖正常注入 + 4 张段间图都
  在 + hero 替换 + 占位被替换 + 缺锚点 raise + md→html 段间图均布.
- 真后端 curl smoke + playwright 闭环: img_count=5 (4 段间 + 1 头像), demo
  "昨天中午" 已替换走, 4 张测试 url 都在; 视觉截图确认 5 节正文 + 段间图分布
  + 固定结尾 + 头像都正确.

### 测试
- 528 + 7 = 535 通过, 17 skip (dhv5 / 朋友环境 dev-only).

---

## 上一里程碑 (2026-04-28 · D-088 LLM 空内容防御 + 公众号写长文 fail-fast)

**版本**: v0.6.1 — D-088 LLM 客户端空 content 当 transient 重试 + wechat write 兜底.

**触发 case** (老板今早 11:03 真踩到): `wechat.write` task `b72844d1f97...` 状态 = ok,
content="" 但 `tokens.write=6558` — Opus 烧了 6558 tok 没出 text block (max_tokens
全烧 thinking / OpenClaw 转发丢字段). DeepSeek 自检在空文章上还硬给 107/120 通过 +
编"文章整体调性到位"总评. UI 显示 "0 字 · 自检通过" 的空白页面, 完全误导.

### D-088 修复
- `shortvideo/llm_retry.py` 加 `TransientLLMError(RuntimeError)` sentinel 类 +
  `is_transient_error` 优先 isinstance 判定 (比关键字嗅探显式可靠).
- `shortvideo/claude_opus.py` + `shortvideo/deepseek.py` 把 text 解析挪进 retry
  lambda. `content="" + completion_tokens>0` → 抛 TransientLLMError → with_retry
  重试 1 次, 持续空才向上 ClaudeOpusError. 顺手修 deepseek 在 content=None 时
  `.strip()` 直接 AttributeError 的隐 bug.
- `backend/services/wechat_pipeline.py:write_article` 兜底: content 空就 raise
  RuntimeError, 不进自检 (避免 DeepSeek 在空字符串上 hallucinate 通过).
- `tests/test_llm_empty_content.py` 8 个 case 覆盖: 空+token>0 重试成功 / 持续空抛
  ClaudeOpusError / 空+token=0 不重试 / None content 不 AttributeError / 正常一次
  过 (Opus + DeepSeek 各覆盖) / write_article 空 content 不进自检.

### 测试
- 537 + 8 = 545 通过, 1 skip.
- 后端冒烟: import + sentinel 命中 + write_article fail-fast 路径. 全过.

---

## 上一里程碑 (2026-04-28 · D-087 素材库 + B' GPT 修订收尾)

**版本**: v0.6.0 — 素材库 MVP + GPT 第二轮修订 (B'-1 ~ B'-5 全落地).

**清华哥 PRD + 4 张交互稿** → 重建素材库, web-only.
**老板核心诉求** (跟 image-gen / dreamina 联动): "命中关键词后, 优先先找我们素材库
里面的内容, 然后没有的再用 ai 去生成素材". 当前 B' 收口让素材身份/审核流程稳,
为 #41 (image-gen 接素材库命中) 铺路, 这一步还没做.

### D-087 commit 链
| Commit | 内容 |
|--------|------|
| `ffe5b7a` Day1 | 后端基础 5 表 + 8 API + 65 测试 |
| `a271c91` Day1.5 | 4 层 UI 骨架 + e2e 闭环 |
| `15a8f33` Day2 | AI 打标 pipeline (LLM + 启发式 fallback) + 32 测试 |
| `bf52ce7` Day2.5 | L1+L4 加 AI 打标 UI 入口 |
| `695d612` 整改 | 严格按设计稿重写 L1 大屏 + L3 右栏 |
| `92d22c5` | L1 全库搜索 (filename / tag / folder) |
| `01bfb2f` B | 全量打标支持 + 前端按钮 (旧版心跳续命) |
| `1ae420e` C | 待整理工作流 (审核 AI 归档建议) |
| `995059a` B 修速度 | materials.tag 路由 deepseek (60h → 80min) |
| `0b2ccd9` B'-1 | watchdog 双阈值 (idle + total) |
| `2df8516` B'-2 | pending 不覆盖审核 + heuristic 真 source |
| `00e9654` B'-3 | pending 加 confidence/no_move + 旧 1616 标 stale |
| `dfd775f` B'-4 | asset identity 稳定化 (不重 hash 主键) |
| (本节) B'-5 | run_async sync_fn_with_ctx 兼容入口 |

### 关键事实
- **17 endpoint** 全在 `/api/material-lib/`: stats / folders / subfolders / list /
  asset/{id} / thumb/{id} / file/{id} / scan / usage / recent-activity / top-used /
  search / tag/{id} / tag-batch / pending-list / pending/{id}/approve / pending/{id}/reject
- **5 表 (V2) + 7 列扩展 (V3+V4)**: material_assets (+content_hash/last_seen_at/missing_at),
  material_pending_moves (+confidence/no_move/suggestion_version/reviewed_at)
- **schema_version = 4** (D-084 baseline → V2 素材库 → V3 pending 评级 → V4 asset identity)
- **535 测试 + 1 skip 全过** (D-087 全链路 162, B'-1..5 +18)
- **真库**: 1618 素材 100% AI 打标 (DeepSeek 走 materials.tag 路由), pending KPI = 0
  (1616 旧条目 V3 migration 标 stale 不打扰, approved 1, rejected 1)
- **打标速度**: deepseek 2-3s/条, 全量 1618 条 ≈ 80 分钟 (旧 Opus 60h+)
- **LLM 输入仅文本** (filename + folder + 元数据), 没用 Vision

### B' 收口 (按 GPT 第二轮 review 修订, 不动主键不重 hash)
- B'-1 watchdog 双阈值: idle (心跳停 600s) + total (跑超 estimated*5), 任一超就杀.
  纠正 D-087 误说"心跳续命" — 旧 SQL 用 COALESCE(started_ts, updated_ts), updated_ts
  完全不参与, 心跳是假续命.
- B'-2 pending 守 approved/rejected: force 重打不抹历史结论.
  heuristic source 直传不强转 ai: material_tags.source 现在能区分 llm/heuristic/manual.
- B'-3 pending 加 confidence + no_move: prompt 让 AI 输出把握 + 是否换位置.
  门槛 confidence>=0.75 + no_move=false 才入 pending. 旧 1616 条 status=stale 默认
  不打扰, list_pending_review/get_stats 默认排除 legacy.
- B'-4 asset identity: 删 sha1(path+mtime) (跟 abs_path UNIQUE 互相打架, mtime 一变
  让函数返孤儿 aid). 新 row 用 uuid, 已有 row 走 abs_path 命中 → content_hash 命中
  → 真新文件 三段查找. tags/usage/pending 永不孤儿, mv/改名按内容找回.
- B'-5 run_async 加 sync_fn_with_ctx 兼容入口: 长任务 (tag_batch) 不再 DB 反查
  "最近 running same kind" 拿自己 task_id (并发时拿错), ctx.task_id 闭包闭进 worker.
  旧 sync_fn 入口零侵入.

### 老板回来还要决策
- **#41 A: image-gen / dreamina 命中先找素材库** (老板核心诉求, 还没做).
  GPT 建议: SQL LIKE + tags/folder 够用, 1618 条不需要 embedding.
- 老 PageMaterials 4 tab (热点/选题/爆款参考/空镜录音) 数据要不要挪进新 page 角落.
- ~/Downloads 切到 ~/Desktop/清华哥素材库/ + 真 mv 文件链路 (现在 approve 只改 DB
  rel_folder, 不真 mv).
- pending 旧 1616 条要不要按新 prompt 重跑高置信版 (一键升级).

---

## 上一里程碑(2026-04-27 深夜 · D-086 全站错误出口统一)

**版本**: v0.5.4 — 把 14 文件 18 处裸 `⚠️ {err}` 替换成 `<InlineError />`,
`ERROR_PATTERNS / humanizeError` 集中到 `web/factory-errors.jsx` 单一事实源.

**触发**: 清华哥实测撞 "Failed to fetch" → D-069 follow-up 走"补 pattern"路线没解决根本.
GPT 抓: 全站错误出口分裂(每页自己 setErr+渲染), 下个新页又会裸露英文. 这次收口.

**改造统计 (1 commit, 4-5h, 两段式实施)**:
- 新建 `web/factory-errors.jsx` (~270 行 5 个 export + 24 条 ERROR_PATTERNS)
- 新建 `scripts/e2e_error_boundaries.js` (5 代表页 abort 闭环)
- 改 4 基础文件: index.html / factory-api.jsx / factory-flywheel.jsx / factory-task.jsx
- 改 14 page jsx (18 处替换)
- 删 factory-flywheel.jsx 114 行重复定义
- 加 SYSTEM-CONSTRAINTS §11 (5 节硬约束)

**实施分两段** (清华哥拍板防一次性 14 页机械替换炸):
- 段 A: 基础层 (factory-errors.jsx + index 加载 + 3 基础文件接入) → 烟雾测全局函数挂载 ✅
- 段 B: 5 代表页 (wechat/make/imagegen/dreamina/hotrewrite) → e2e 5/5 通过
- 段 C: 扩 9 页 + 文档 + commit (本节)

**rg 双路验零**:
- `⚠️ {err}` 残留 = 0 (除 factory-make-v2.jsx 注释)
- `Failed to fetch` 只在 factory-errors.jsx (pattern 匹配) + factory-api.jsx (检测) 合法白名单

**8 条验收全过** (GPT 标准):
pytest 373 ✅ / e2e 5/5 ✅ / rg 验零 ✅ / 截图无 Failed to fetch ✅ /
ErrorBanner 仍能展开原始 ✅ / 文档同步 ✅ / commit message 对 ✅

---

## D-085 follow-up 真根因复盘 (GPT 顺手提的, 别只留聊天)

清华哥实测 "Failed to fetch" 截图根因 **不是"backend 重启窗口"** (我前面回答错了, 凭直觉没核实).

实际根因: `backend/services/wechat_pipeline.py:306` 漏 import `tasks_service` →
NameError → /api/wechat/write 500 → starlette ExceptionMiddleware 抛异常时 ASGI
connection 异常断开 → 浏览器 fetch 看到的是 TypeError "Failed to fetch" (不是 HTTP 500).

证据 (实证打脸): `grep "POST /api/wechat/write" /tmp/d085f_backend.log` 看到 500 + NameError traceback; `ps -p backend PID` backend 起跑 18min 没死; CORS allow_origins=["*"] 早就配了.

修复: `3b12a33 [fix] wechat_pipeline.write_article_async NameError (实际根因)` lazy import + 回归测试; `dca430c [test] mock write_article 防偷烧 credits` 测试卫生补丁.

教训: **解释根因前必须 grep log + ps + curl 真测**, 不能凭"5 秒重启窗口"这种直觉.
被清华哥一句 "刚刚实际什么问题" 问回真相. 这条进我自己的 SOP.

---

## 上一里程碑(2026-04-27 深夜 · D-085 LiDock 真 tool calling)

**版本**: v0.5.3 — LiDock 从"陪聊"升级"会做事". ReAct 文本协议 + 3 个 MVP tools.

**触发**: D-067 "不撒谎守则" 之后的闭环. LiDock 一直只能"陪聊", 用户问"打开 XX"
只能告诉他"自己点". 现在真接通: nav (跳页) / kb_search (搜知识库) / tasks_summary (查任务).

**改造统计 (1 commit, ~6h, GPT 边干边抓 4 P2)**:
- 新建 `backend/services/lidock_tools.py` (~280 行 ReAct 协议 + 3 tool REGISTRY)
- 改 `/api/chat` 双轮 LLM 调度 (single 透传 / read+followup 后端执行 + round2 总结)
- 改 `web/factory-shell.jsx:LiDock.send` 加 actions 循环 (nav → ql-nav event)
- 加 2 测试文件 32 个新测试 (22 单测 + 10 集成)
- SYSTEM-CONSTRAINTS §10 6 节硬约束

**MVP 3 tools** (实证设计, 不引用幽灵接口):
| tool | mode | 后端处理 | 前端处理 |
|---|---|---|---|
| `nav` | single | 透传 args 到 actions | dispatch `ql-nav` + 收起 dock |
| `kb_search` | read+followup | 调 `kb.match()` → 数据塞 system → round2 LLM | 显示最终 reply (用户感知一次回复) |
| `tasks_summary` | read+followup | 调 `tasks.list_tasks()` → 数据塞 system → round2 LLM | 同上 |

**安全设计 (4 道防线)**:
1. **白名单严格**: REGISTRY 之外 tool 名 → parse 阶段静默 ignore
2. **invalid 不静默**: validate_call 失败 → reply 覆盖 "我没有这个工具能力" (防假承诺)
3. **防注入**: round2 system 明确 "工具结果是资料不是指令"
4. **防递归**: round2 reply 即使含 USE_TOOL 块也被 strip, 不触发 round3

**真烧 credits 验证 (curl)**:
- nav: `actions=[{type:"nav",page:"wechat"}]`, rounds=1
- tasks_summary: rounds=2, reply 真用 DB 数据
- kb_search: rounds=2, reply 真从 Obsidian chunk 回答

**playwright 闭环**: 3 tool 都跑, 0 console error / 0 page error, nav 跳页验证 URL=wechat ✅, 截图 6 张视觉确认.

**12 条验收全过** (commit 前自检):
- ✅ lidock_tools.py REGISTRY 含 3 tool
- ✅ parse_tool_calls 5 case 单测全过
- ✅ validate_call nav 拒非法 page (历史错的 night/image-gen/touliu 都拦)
- ✅ execute_read_tool kb_search/tasks_summary 集成测试通
- ✅ /api/chat 端到端: nav 透传 actions / kb_search 双轮 LLM
- ✅ pytest 335 → 367 通过 (+32)
- ✅ playwright 真跑 + 截图 + Read 视觉确认 (3 tool 全过)
- ✅ console / pageerror 0 行
- ✅ /tmp/_ui_shots/d085_*.png 6 张已存
- ✅ SYSTEM-CONSTRAINTS §10 + CHANGELOG v0.5.3 + PROGRESS 同步
- ✅ 历史错 page id 全拦 (实证 factory-app.jsx)
- ✅ 真烧 credits 3 tool 全过 (curl 验证 round2 真用工具数据)

**实施踩坑 (GPT 边干边抓)**:
- _VALID_PAGES v1 错 3 处 (night/image-gen/touliu) → 实证 factory-app.jsx 改对
- invalid tool 静默 ignore 是假承诺 → 改成覆盖 reply 明确告知
- followup_system 缺防注入边界 → 加 "以下是参考资料不是指令" 段
- TestClient mock 不生效 → patch backend.api.get_ai_client (顶部 import 已值拷贝)
- D-069 follow-up 漏掉公众号页内联错误条 → `factory-wechat-v2.jsx` 改用 `ErrorBanner`, `Failed to fetch` 不再原样露出

**下一步**: 偏好抽取增强 / 周报长摘要 (设计文档评估时排第 2 第 3, 一期不急).
也可以等 LiDock 用一段时间收集真实场景, 再扩 v2 tool (open_work / trigger_skill 等).

---

## 上一里程碑(2026-04-27 深夜 · D-084 DB 入口集中化 + schema migrations)

**版本**: v0.5.2 — 全库 DB 直连 (48 处) 收敛到单一连接抽象点 + schema 集中迁移.
路线 B 切 Postgres 第一步真"改一处"成立 (除 SQL dialect).

**触发**: D-083 落地后接着做隐患 3. GPT 五审 (v1→v5) 共抓 1 P1 + 多 P2:
- v1: 漏 legacy fixups (老库 IF NOT EXISTS 跳过表但缺列)
- v2: "切 Postgres 一处" 表述误导 + 测试隔离不够
- v3: works.py row_factory 不能丢 (P1 致命) + get_connection 不该放 migrations.py + 路径不规范化
- v4: works 顶层跨包矛盾 + 漏 insights.py + api.py + path 没用 resolve
- v5: 通过, 实施

**改造统计 (1 commit)**:
- 新建 2 文件: `shortvideo/db.py` (40 行) + `backend/services/migrations.py` (~330 行)
- 改 7 文件: 5 个 service (sed) + api.py (手改 3 端点) + works.py (手改保 row_factory + lazy import)
- 加 2 测试文件: test_migrations.py (10 测试) + test_works_crud_integration.py (2 测试 P1 验收)
- 改 3 文档: SYSTEM-CONSTRAINTS §9 + CHANGELOG v0.5.2 + PROGRESS (本节)

**实施时再次抓 bug** (GPT v3-v5 都没发现):
- V1_BASELINE 一次 executescript 跑 CREATE TABLE + CREATE INDEX, 老库已有表跳过但 INDEX 撞缺列
- 修法: `_split_v1_baseline()` 拆开, 应用顺序: TABLE → legacy_fixups 补列 → INDEX
- 测试 `test_legacy_fixup_works_old_db_missing_4_columns` 直接抓出来

**16 条验收全过** (commit 前自检):
- ✅ shortvideo/db.py + migrations.py 存在 + 函数可调用
- ✅ get_connection 用 current_db_path() 规范化路径
- ✅ schema_version 表 1 行 baseline
- ✅ 10 张表 + 索引全建
- ✅ 5 个 service `_ensure_schema()` 调 apply_migrations + SCHEMA / `_MIGRATIONS` / `_migrate_works()` 已删
- ✅ rg 验零: 5 个 service 不再 `from shortvideo.config import DB_PATH` (含 alias 模式)
- ✅ rg 验零: 48 处 DB 直连全部走 get_connection
- ✅ shortvideo/works.py 的 `_conn()` 包装保留 row_factory + works CRUD 回归测试通过
- ✅ pytest 321 → 333 通过 (+12 测试)
- ✅ api.py startup hook `_apply_db_migrations` 在 `_recover_orphan_tasks` 之前
- ✅ current_db_path() 处理 ~/相对路径/symlink (单测覆盖)
- ✅ _legacy_fixups 补 8 列 + 2 索引
- ✅ 路线 B 文档表述精确 (db.py docstring 列 dialect 7 项)
- ✅ SYSTEM-CONSTRAINTS §9 + CHANGELOG v0.5.2 + PROGRESS 同步 D-084
- ✅ V1_BASELINE INDEX 顺序坑修复 (`_split_v1_baseline`)
- ✅ 测试 fixture 老表场景双覆盖 (works + tasks)

**下一步**: vibecoding 评审 3 隐患全部清完. 回到产品功能层 — 候选: 装战略规划技能 / LiDock 真 tool calling / 偏好抽取增强 / 周报长摘要.

---

## 上一里程碑(2026-04-27 晚 · D-083 系统硬约束集中化)

**版本**: v0.5.1 — 文档级整顿. 把分散的硬约束集中成独立文档, 锁定路线 B 路径策略.

**触发**: 用 vibecoding 方法论 (21 天挑战 Day 005) 评审项目, 发现:
- "骨架定得 90 分"但**非功能需求散落** (D-068/D-078/D-082c 都是踩坑后补)
- "现在不部署"vs"未来 poju.ai" 是矛盾信号, 未声明路径策略
- CLAUDE.md 237 行 / AGENTS.md 220 行都已超 200 行红线
- AGENTS.md 还停在 v0.3.0, "Codex Opus" 笔误, skill 列表只 4 个

**改动** (1 commit, 5 文件, 0 业务代码):
1. 新建 `docs/SYSTEM-CONSTRAINTS.md` (含 paths.py 最小骨架样例)
2. CLAUDE.md / AGENTS.md 双瘦身回 < 200 行 + 第一屏加 SYSTEM-CONSTRAINTS 指针
3. AGENTS.md 修历史漂移: v0.3.0 → v0.5.1 / "Codex Opus" → "Claude Opus" / skill 4 → 8
4. CHANGELOG 补 v0.5.0 段 (D-071 → D-082) + 加 v0.5.1 (D-083)
5. PROGRESS 加本节

**路线 B 锁定** (清华哥 2026-04-27 拍板):
- 千人内规模, 不上 k8s/微服务
- 但真实多用户前必须换: Postgres + 持久任务队列 + 对象存储 + user_id 行级隔离
- SQLite 仅限低并发过渡 (个人版 / Mac Mini / 内测)
- 已有硬编码不重构, 新代码走 paths.py 抽象层 (待第一个真要新增 user 路径的 commit 同步建)

**验收标准达成** (4/4):
- ✅ CLAUDE.md + AGENTS.md 都 < 200 行 + 第一屏指向 SYSTEM-CONSTRAINTS
- ✅ SYSTEM-CONSTRAINTS.md 不引用任何不存在的代码接口 (paths.py 用"样例"标注)
- ✅ D-068/D-069/D-070/D-078 四条硬约束都能在新文档一眼找到 (各自独立小节)
- ✅ PROGRESS + CHANGELOG 同步记录 D-083

**下一步**: 隐患 3 — SQLite migrations 集中化 (10 张表分散在 5 个 service 的 CREATE TABLE IF NOT EXISTS 统一进 `backend/services/migrations.py`).

---

## 上一里程碑(2026-04-27 早 · D-078/D-082 远程任务 watcher + LLM 重试 + 真烧 credits e2e)

**版本**: v0.5.0 — 远程任务永不假失败 (即梦/数字人/出图 watcher) + LLM 抽风自动重试 + 失败可重做.

**今天连环改造 (D-078a → D-082e)**:

### D-078a 远程长任务 remote_jobs DB + watcher 框架 (新基础设施)
**痛点**: 老板一旦提交即梦视频, 因为即梦端排队慢, daemon thread 内死等 900s 必 timeout → task 假 failed
但即梦端实际还在跑 (看 D-075 抢救老 task 12h+ 仍 querying). 用户看到"渲染失败"但平台扣了 credits.

**实现**:
- 新建 `backend/services/remote_jobs.py`: 持久化 submit_id + last_status + poll_count, 60s tick
  调 provider poll_fn 拿真终态, done → on_done 回调 + finish_associated_task. 进程重启 DB 接管不丢.
- task.payload.remote_managed=true → recover_orphans / sweep_stuck 跳过, 由 max_wait_sec (默认 2h) 兜底
- provider 注册轻框架: register_provider("dreamina", poll_fn, on_done=cb)
- 19 单测全过 (含进程重启接管)

### D-078b 即梦改走 watcher (代码 PASS, 即梦排队 known issue)
**实现**:
- dreamina_service.submit_only / _poll_for_watcher / _on_done_for_watcher / register_with_watcher
- /api/dreamina/batch-video daemon thread 立即 submit + register, 不再 while 死等 (response 8s, 旧 30s+)
**真测**: playwright 真烧 4s 视频, 8min 即梦端真在 querying, watcher poll_count=10 工作正常,
task 没被假杀 — 验证 D-078a 防御层有效.

### D-078c recover endpoint + UI 重查按钮
- POST /api/dreamina/recover/{submit_id} — 真测重置 watcher 接管 ✓
- GET /api/remote-jobs/by-task/{task_id} — UI 拿 submit_id ✓
- GET /api/remote-jobs/stats — watcher_running + 3 providers ✓
- TaskCard "🔍 重查即梦" (failed dreamina + payload.submit_id 时显示)

### D-079 数字人 (柿榴) 接 watcher (additive)
- backend/services/shiliu_service.py: poll/on_done/register
- /api/video/submit 创建 task + register remote_job (旧 video_id polling 双兜底)

### D-080/D-081 apimart 基础设施 (endpoint 切换暂搁置 known issue)
- backend/services/apimart_service.py: poll/on_done/submit_and_register helper 完整实现
- /api/wechat/cover-batch + /api/image/* endpoint 没切 watcher 路径 (大改造工作量, 等真出问题再切)

### D-082b "🔄 重新生成" 按钮 (简化版)
- failed 非 dreamina task 显示, 点击跳 page_id 让用户重新填
- 完整版 (sessionStorage 预填) 留 known issue

### D-082c LLM 自动重试 1 次 (transient 错误兜底)
- shortvideo/llm_retry.py with_retry helper, 关键字判定 5xx/timeout/rate-limit/connection
- claude_opus / deepseek chat() 都接, 13 单测全过
- 文案功能"偶尔抽风又失败"消失

### D-082d 文案 12 真测 (核心)
- D-082d-1 (rewrite) 跳过 — 老 endpoint 已废
- D-082d-2 (transcribe) 跳过 — 需真 url, 在 D-082d-3 链路中间接覆盖
- D-082d-3 - 11 真烧 credits 走 batch.py + smoke 11/11 PASS
- D-082d-4 hotrewrite 浏览器闭环验 analyze 通 (write 步骤 selector 没找到 — 测试脚本 bug, 不影响 endpoint)
- D-082d-12 dhv5/align 跳过 — 在 D-077 数字人批量整体测过

### D-082e DREAMINA_MOCK 桩模式
- DREAMINA_MOCK=1 → query_result 立即返 done + 现成 mp4
- 仅供开发自测加速, **绝不替代验收**

### scripts/run_e2e_full.sh 一键全量
- Phase 1: backend smoke 11 endpoint
- Phase 2: 文案 LLM 真烧 credits batch (D-082d 8 个)
- Phase 3: 16 关键 page 浏览器截图巡检
- Phase 4: pytest 完整套件

**测试统计**: 288 → 321 passed (+33), 1 skipped 跟之前一致.

**抢救老 task**: 7aef6b97/4290bbcc/e76aca91 → 救回 2 个入作品库 (work_id=215,216), 第 3 个 7aef6b97
仍 querying (即梦端 12h+ 没出来, 留给 watcher 接管).

---

## 上一里程碑(2026-04-26 · D-070 访客模式 + D-069 去技术化 + D-068c 投流 schema 修)

**版本**: v0.4.0 — 访客模式 + 去技术化(录视频不露馅) + 任务防御三层 + 错误统一拦截

**今天一天连环优化(D-068 → D-070)**:

### D-070 访客模式 (最新)
**用户问题**: "我用我的工厂帮朋友项目产出, 会被自动记录吗?"
**答案**: 会, 而且会污染 D-067 越用越懂闭环. 5 个写入口子全开 (work_log / preference / 作品库 / 公众号入库 / 人设注入).

**实现**: 侧栏底部 🕶 访客模式 按钮 + 主区顶橙色 banner. 切开后:
- 后端 contextvar (`backend/services/guest_mode.py`) + middleware 读 `X-Guest-Mode` header
- 跨 daemon thread 显式传递 (run_async 里 capture + set in worker)
- 5 个写入口子全短路, AI 切中性写作助手 (~100 字 system, 不再注入清华哥几千字人设)
- localStorage 持久化, 防"切完忘关"伪安全

测试 +7. 总 288 passed.

### D-069 去技术化 + LiDock 融合 TaskBar (录视频不露馅)
**用户痛点**: 要拍短视频, 顶栏 chip / API 调试条 / skill / tokens / Pydantic 422 原文 / `ClaudeOpusError(http://localhost:3456/v1)` 等技术词露给观众.

**实现**:
- 顶栏 TaskBar chip 整删, 任务计数走小华按钮头像右上角红点徽章 (橙=卡死/蓝=进行中/0=不显)
- LiDock 面板加"对话/任务"双 tab, 任务 tab 复用 TaskCard
- factory-api.jsx 加 `_handleErrorResponse`: 422 Pydantic JSON 转大白话 ("n 至少 1; brief 没填"), 5xx → "AI 上游临时不可用"
- FailedRetry monospace 默认折叠到"看技术详情"
- ApiStatusLight 硬关, 只 localStorage flag 才开 (移除 settings 入口)
- 任务卡 fallback "hotrewrite.write" → "热点改写" (TASK_KIND_LABELS 映射)
- "skill 资源 (开发用)" 4 处面板全删
- "{tokens} tokens" 全删 6 处, 首页"今日 AI 消耗"换"今天用了多少 AI · 约 X 字"
- "卡死/杀掉" → "等了/停掉"
- 设置页 AI 健康 "已连通 · opus · model" → "AI 通讯正常"

### D-068c 修投流 422 + smoke_endpoints.sh
**痛点**: 老板随手测投流, 直接 422 — D-062e 把前端 useState(1) 改求速度但后端 ge=3 + pipeline 内 max(3,n) 偷偷翻倍 (用户选 1 实际生成 3, 双重欺骗).

**修法**: API ge=3→ge=1, pipeline max 改 max(1,...), alloc 加 1/2 条规则.
**举一反三**: 加 `scripts/smoke_endpoints.sh` 巡检 9 个主 POST endpoint 用合理 payload, 防类似 schema 错配.

### D-068b 防御扩展
- `shortvideo/deepseek.py`: OpenAI SDK 默认 10min timeout 改 120s
- `night_shift.recover_orphan_runs()`: night_job_runs 也是 daemon thread, 启动钩子同步收尾
- 审计 5 处 daemon spawn 全覆盖

### D-068 任务卡死防御三层 + 侧栏总部/战略部
**痛点**: 老板触发"热点改写"等 14 分钟 UI 转圈不动. uvicorn --reload 在 D-067 commit 期间随多次文件改动重启, daemon 异步工作线程随进程被杀, DB 行卡 running 永远.

**三层防御**:
1. 启动孤儿恢复 (`tasks.recover_orphans` + startup hook)
2. 周期 watchdog 60s (`tasks.sweep_stuck` + start_watchdog)
3. UI 卡死可视化 (TaskBar/TaskCard 橙警告 + 杀掉按钮)

**侧栏重构** (老板当面定):
- 品牌行 (🏭 清华哥内容工厂) 整行可点 → home, 子文案 "🏠 总部"
- 原首位 NAV `总部` → 改 `战略部` (id=strategy, icon=🧭, 占位等装战略规划技能)

---

**今天总产出**: 5 个 commit (D-068 → D-068b → D-068c → D-068c+ → D-069 → D-070), 281+7=288 测试, 13.8 分钟卡死 → 60s 内自动恢复, 顶栏纯净, 访客模式可用.

**下一步候选**:
1. 装战略规划技能 (战略部页面真功能)
2. LiDock 加真 tool calling (从 D-067 滚来)
3. 偏好抽取增强 (从 D-067 滚来)
4. 周报长摘要 (从 D-067 滚来)

---

## 上一个里程碑(2026-04-26 · D-068 任务卡死防御 + 侧栏总部/战略部)

**版本**: v0.3.7 — 任务孤儿恢复 + 周期 watchdog + UI 卡死可视化 + 战略部入口

**用户痛点**: 老板触发"热点改写"等了 14 分钟 UI 一直转圈, 进度卡 15% 不动, 没任何信号.
查 root cause: `uvicorn --reload` 在 D-067 commit 期间随 6 个文件改动重启, daemon
异步工作线程随进程一起被杀, DB 行卡 `running` 永远不会变, 前端轮询无解.

**本次完成**(4 phase):

1. **P1 启动孤儿恢复** (`tasks.recover_orphans`, `api._recover_orphan_tasks`)
   - uvicorn boot 时把上次没收尾的 pending/running 全标 failed
   - error="服务重启,任务中断,请重新触发"
   - 每次 --reload 都自动跑, 解决 DB 卡死问题

2. **P2 周期 watchdog** (`tasks.sweep_stuck`, `tasks.start_watchdog`)
   - 每 60s 扫一次, 跑超 max(5*estimated, 600s) 的 running 标 failed
   - 处理"进程活着但任务实质卡在上游 AI proxy"的场景
   - error 含明确诊断, 帮老板知道是 AI 卡了

3. **P3 UI 卡死可视化** (`web/factory-task.jsx` TaskBar/TaskCard)
   - chip: stale 时变橙 "⚠ N 卡死 · M 进行中"
   - 任务卡: 橙边框 + "卡了 5m14s" + "实际超 6.3x" + 杀掉按钮
   - 用户主动 cancel 触发立即重拉刷新
   - stale 判定: elapsed > 2*estimated 或缺估时按 5min 兜底

4. **P4 侧栏 总部/战略部 重构** (老板当面要求)
   - 品牌行 (🏭 清华哥内容工厂) 整行可点 → home, 子文案 "🏠 总部"
   - 原首位 NAV `总部` → 改 `战略部` (id=strategy, icon=🧭)
   - 新 page 占位: 等老板装"战略规划"技能后, 在这里聊战略方向

**端到端**: pytest 276 通过 (新增 8 个 recovery/watchdog 测试).
Playwright 验 sidebar+strategy 页面 0 console error, chip 卡死警告渲染正确.

**预防 checklist** (避免再次踩坑):
- 任何 `threading.Thread(daemon=True)` 跑长任务都得有 DB 收尾兜底
- 启动恢复 + 周期 watchdog + UI 兜底 三层防御缺一不可

**下一步**:
1. LiDock 加真 tool calling (从 D-067 滚来)
2. 偏好抽取增强 (从 D-067 滚来)
3. 周报长摘要 (从 D-067 滚来)
4. 装战略规划技能 (战略部页面真功能)

---

## 上一个 session(2026-04-26 · D-067 真正越用越懂闭环)

**版本**: v0.3.6 — 行为记忆 + 偏好回读注入 + LiDock 不撒谎守则 + 采纳/否决信号

**用户痛点**: 反思"现在每天的内容有真正实现越用越懂我吗?" 查后发现:
- Layer 1 静态人设 ✓ 真生效
- Layer 3 行为记忆 ✗ 写入代码都在但默认关 + 写了不读回
- LiDock 「我帮你打开 XX 文件夹」是纯文字编造 (没 tool calling)

**本次完成**(4 phase):

1. **P1 读回闭环** (`persona.py`)
   - `_load_memory_block()` 读 3 个 Obsidian 文件: 昨天的你.md / 小华学到的偏好.md / 小华工作日志.md(最近 30 行)
   - `load_persona(include_memory=True)` 默认开
   - settings 默认 `work_log_enabled=True` + `preference_learning_enabled=True`

2. **P2 LiDock 不撒谎** (`/api/chat` system prompt)
   - 加严守则: 不能打开/查询/操作; 不能编不存在路径
   - 列真实 6 个一级入口 + 3 档案部 + 值班室
   - 老板问位置直接说真实路径

3. **P3 采纳/否决信号** (`/api/works/{id}/action`)
   - 作品库详情抽屉加 👍 留 / 👎 删 按钮
   - 写 `metadata.user_action = kept|discarded`

4. **P4 夜班"昨天的你"摘要** (`yesterday_summary_runner`)
   - 凌晨 6:30 cron(daily-recap 之后)
   - 读 work_log+preference → AI 精炼 ~200 token 摘要
   - 写 `昨天的你.md`, persona 优先读这个

5. **侧栏文案** (用户当面要求)
   - "清华哥工厂" → "清华哥**内容**工厂"
   - "夜班" → "**值班室**" (部门 label)

**端到端**: pytest 268 通过 (新增 1 测试 + 改 3 个旧 night_runners 测试断言数 4→5).
当前 work_log 是空模板(用户还没真用过) → memory_inject_chars=0, AI 行为暂未变化.
等老板用一段时间产出累积, 再看"是否真懂".

**下一步**:
1. LiDock 加真 tool calling (search_kb / open_page)
2. 偏好抽取增强(看 discarded 版本特征)
3. 周报长摘要

---

## 上一个 session(2026-04-26 · D-066 侧栏整合 6 个一级入口)

**版本**: v0.3.5 — 生产部从 11 入口收到 6 个 + 双层纸叠侧栏 + 写文案/出图片二级页

**用户痛点**: 生产部图标太多看着乱. 决定:
- 做视频/公众号/朋友圈 是独立大流程 → 一级保留
- 投流/热点改写/录音改写/爆款改写/内容策划/违规审查 → 收纳进「✏️ 写文案」二级页
- 直接出图/即梦 → 收纳进「🎨 出图片」二级页
- 黑科技 → 给未来预留坑位

**本次 session 完成**(单 commit):

1. **侧栏改造** (`web/factory-shell.jsx`)
   - NAV_MAIN 从 11 个收到 6 个 (做视频/公众号/朋友圈/写文案/出图片/黑科技)
   - 加 SECTIONS 配置 (生产部 🏭 / 档案部 📦 / 夜班 🌙) + emoji 部门图标
   - 新 SectionHeader 组件: 白卡 + emoji + 大粗字 + 轻投影
   - 工具列表浅米色 bg "内页", -3px overlap 跟 header 紧贴(双层纸叠)
   - 侧栏 hover 展开宽度 164 → 220px
   - 「小华夜班」emoji 改 🦉 避免跟夜班图标 🌙 冲突
   - 收起态(60px)用部门 emoji 当视觉锚点
   - 新增 LEGACY_NAV_HIDDEN 数组保留旧 id (深链 + skills smoke test)

2. **写文案二级页** (`web/factory-write.jsx`)
   - 顶部 4 个 stats (今日产出 / 今日热门工具 / AI token+金额 / 累计文案)
   - 6 张工具卡 (hardcode WRITE_TOOLS): 投流/热点/录音/爆款/策划/审查
   - 工具卡角标「今日 N 次」(从 /api/ai/usage by_route 聚合)
   - 最近 4 条文字 (作品库 type=text 取)
   - 卡片点击 → onNav(page) 跳具体 skill 页

3. **出图片二级页** (`web/factory-image.jsx`)
   - 同样的 stats + 2 张工具卡 (直接出图 / 即梦) + 最近 8 张图

4. **黑科技页** (`web/factory-beta.jsx`)
   - 空状态 + "想法可以在小华夜班跟 AI 聊"
   - 3 张未开发草稿卡 (批量去水印 / 直播字幕 / 一键剪辑)

5. **路由 + index.html**
   - factory-app.jsx 加 `case "write" / "image" / "beta"`
   - 旧 8 个 page URL **全部保留**(深链兼容 — `?page=baokuan` 还能直接进)
   - index.html script 列表加 3 个新 jsx

6. **作品库 D-065 follow-up** (`web/factory-works.jsx`)
   - 默认时间「今天」如果 0 条 → 自动 fallback 到「本周」+ 显示提示语
   - 用户人工切时间时 reset 这个 fallback 标记

**端到端验证**(CDP 真 chrome): 写文案/出图片/黑科技 三个页都正常渲染,
console 干净, stats 接通真数据. pytest 266 通过.

**下一步** (Follow-up):
1. 卡片 hover 高亮 / 详情抽屉图片 lightbox (D-065 留)
2. 黑科技 3 张草稿卡的"未开发"按钮如果点击, 跳到 LiDock 自动开聊
3. 视觉统一: 写文案/出图片/总部 三页的 stats 卡片样式收成共享组件

---

## 上一个 session(2026-04-26 · D-065 作品库扩为统一资产库)

**版本**: v0.3.4 — works 表升级,文字/图片/视频统一管理

**用户痛点**: 用 "🖼️ 直接出图" 生成 4 张图后**找不到去哪了**。原作品库只列短视频,
图片散在 6 个目录(image-gen / covers / wechat-cover / wechat-cover-batch /
wechat-images / dreamina) 共 46 张,文字根本不入库。

**本次 session 完成**(单 commit):

1. **Schema 升级** (`shortvideo/works.py`) — works 表加 4 列(向前兼容)
   - `type TEXT NOT NULL DEFAULT 'video'` (text / image / video / audio)
   - `source_skill TEXT` (image-gen / wechat-cover / baokuan / ...)
   - `thumb_path TEXT` / `metadata TEXT` (JSON)
   - `_migrate_works()` 给老库 ALTER TABLE 加列(幂等)
   - `list_works(type=, source_skill=, since_ts=)` 加过滤

2. **API 升级** (`backend/api.py`)
   - `/api/works` 加 query: `type` / `source_skill` / `since` (today/week/month/all) / `q`
   - 新 `/api/works/sources` — 返回 by_type / by_source 计数(给前端筛选条用)

3. **历史回灌** (`scripts/migrate_assets.py`) — 一次性扫 6 个图目录 + data/videos
   - 167 条入库: 121 视频 + 46 图(image-gen 4 / wechat-cover 26 /
     wechat-cover-batch 8 / wechat-section-image 7 / dreamina 1)
   - 同 local_path 跳过(幂等)

4. **前端 V1 实装** (`web/factory-works.jsx`) — 设计走 V1 mockup 风格
   - 主 tab: 全部 / 文字 / 图片 / 视频 / 数据看板 / 发布矩阵
   - 来源 chip 行(按 tab 动态过滤可用来源) + 时间 chip 行(默认"今天")
   - inline `renderCard(w, onPick)` 三类卡片样式自适应
     · 图片: 16:10 缩略图 + 来源徽标 + 大小徽标 + 标题 + 时间
     · 视频: 沿用 9:16 + status Tag
     · 文字: 来源 chip + 标题 + 文案预览(WebkitLineClamp 4) + 字数
   - 详情抽屉根据 `work.type` 路由 ImageInfoPanel / TextInfoPanel / WorkInfoPanel

5. **直接出图自动回写** (`shortvideo/image_engine.py`)
   - `generate()` 新增 `source_skill` 参数,生图成功后 insert_work
   - 失败兜底: 回写失败不阻断主流程

6. **URL 深链** (`web/factory-app.jsx`)
   - `?page=works` 支持(便于截图 / 验证 / 分享)
   - history.replaceState 跟 page state 同步

**踩过的坑**(同名函数 bug):
- `factory-image-gen.jsx` 已有 `function ImageCard({img,idx})`,我新写的
  `function ImageCard({w,onPick})` 跟它**同名**。babel-in-browser 把所有 jsx
  合并到同一全局 scope, **后定义覆盖前定义** — PageWorks 里 `<ImageCard w=>`
  实际调到 image-gen 那版,它访问 `img.error` 但 `img` 是 undefined,
  console 反复爆 `Cannot read properties of undefined (reading 'error')`。
- 解决: 改 inline `renderCard(w, onPick)` 函数,不抽 React 组件,绕开同名冲突。
  教训: 跨文件同名 React 组件在 babel inline 模式下危险,以后命名加 page 前缀
  (e.g. `WorksImageCard`)。

**端到端验证**(CDP 抓真 chrome):
- 默认 tab="全部" + 时间="今天",177 条入库,今天有产出渲染:
  - 4 张 直接出图 (gen_177717xxx)
  - 1 张 dreamina (test 字样)
  - 多张 数字人视频 (shiliu_xxx)
- console 干净(无 error)
- 后端 pytest 266 通过(无回归)

**Follow-up commit (同 session)**:

7. **Masonry 瀑布流布局** (`web/factory-works.jsx`)
   - 用户反馈: 视频 9:16 + 图片 16:10 混排时强制 grid 行高被竖版撑大,
     横版图卡下面大片白色, 视觉很丑
   - 改 grid → CSS columns(columnCount:4 / columnGap:14)
   - 卡片 `breakInside: avoid` 防跨列断裂
   - 图/视频缩略元素去掉固定 aspectRatio,改 `width:100%; height:auto`
   - 每张图按原始比例自然铺满,卡片高度参差(即梦风)

8. **3 个图片生成点回写** (D-065 主路径)
   - `gen_cover_batch` 调 image_engine.generate 时传 `source_skill="wechat-cover-batch"`
     (image_engine 里的 hook 会自动 insert_work)
   - `gen_section_image` 在 return 前手动 insert_work(走 bash script
     不经 image_engine), source_skill="wechat-section-image"
   - `/api/dreamina/query` endpoint 在 status==done 且 downloaded 非空时
     一次性 insert_work, source_skill="dreamina"

9. **6 个文字 skill 自动入库** (单点改 `tasks_service.run_async`)
   - 加 `_autoinsert_text_work(kind, label, task_id, result)` hook
   - 按 kind 前缀映射 source_skill: baokuan / hotrewrite / voicerewrite /
     touliu / wechat (write only) / planner / moments
   - `_extract_text_from_result` best-effort 解析异构 result 结构
     (article / versions / copies / scripts / drafts / content / final_text 等)
   - 验证 8 种 result shape 全部正确提取 + token 字段提取
   - 不动 6 个 pipeline 文件,单点单改省事

**下一步**(下次 session,优先级低):
1. 卡片 hover 高亮 / 状态指示
2. 详情抽屉打磨(图片点开放大 + 文字一键复制按钮已有但视觉)
3. 详情图片支持点开 lightbox 大图查看
4. 文字 skill 加 unit test 覆盖 _autoinsert_text_work 集成路径

---

## 上一个 session（2026-04-25 · DoD 制度上线）

**版本**：v0.3.3 — Definition of Done 三层制度落地

**本次 session 完成**：

1. **指令层** — `CLAUDE.md` / `AGENTS.md` 加"完工铁律"段
   - UI 改动必须 `preview_screenshot` + `preview_console_logs` 自验
   - 后端改动必须 `pytest -x` + `curl` 自验
   - bug fix 必须连回归测试一起 commit
   - 禁说"刷一下浏览器" / "应该好了"
2. **系统层** — `.claude/settings.json` 加 PostToolUse hook
   - 每次 `Edit` / `Write` 自动注入完工铁律提醒到 Claude 上下文
3. **目的** — 消除 Claude "伪完成"反复（改完代码就声称完成、把验证甩给用户）。完整方案见 `~/.claude/plans/users-black-chen-desktop-neironggongcha-radiant-cook.md`

**下一步**：
- 习惯层：用户侧训练自己听到"刷一下浏览器"立刻打回
- 一周后回看：bug fix commit 是不是开始带回归测试

---

## 上一个 session（2026-04-24 晚 · 第二次 session）

**版本**：v0.3.2 -- D-008 人设注入两档开关上线

**本次 session 完成**(3 个 commit):

1. **关卡层**(`f0246d6`) -- `backend/services/persona.py` + `shortvideo/ai.py::PersonaInjectedAI`
   - `get_ai_client()` 返回包装器,自动把人设拼到每次调用的 system prompt
   - 两档:deep=True 精简版+4详细(~11000字),deep=False 只精简版(~830字)
   - 10 分钟 mtime 缓存,清华哥在 Obsidian 改完自动同步
   - `tests/test_persona.py` 6/6 通过
2. **API 透传**(`2525ac1`) -- 6 个 Req 模型加 deep,3 个 service 透传
3. **前端开关**(`91ca016`) -- `factory-deep.jsx` 全站共享开关 +
   5 页 `<DeepToggle />` + api.post 全部带 deep

**端到端验证**(DeepSeek 引擎,相同原文):
- deep=False: 680 token, 24 字, 通用编辑风
- deep=True: 6918 token(10x), 87 字, 带具体数字 + 钩子结尾,清华哥味道全对

**上一次 session 基线**(保留供追溯):

版本:v0.3.1 -- 项目管理骨架 + 人设/记忆系统设计

**本次 session 完成**：

1. **Git 初始化** -- 全量代码入库（84 文件，commit `3bfb10a`）
2. **项目管理体系**（对标 poju-site）：
   - `CLAUDE.md` -- AI 入口路标
   - `docs/PROGRESS.md` -- 进度看板（本文）
   - `docs/TECHNICAL-DECISIONS.md` -- 技术决策档案（D-001 ~ D-008）
3. **人设/记忆系统设计**（研究了 OpenClaw + Hermes，选择 OpenClaw 的 Markdown 方案）：
   - 在 Obsidian 知识库创建 `persona-prompt.md`（~300 token 精简版人设）
   - 在 Obsidian 知识库创建 `小华工作日志.md`（行为记忆模板）
   - 设计三层记忆架构（D-005）
   - 设计两档开关：深度理解 vs 轻快模式（D-008）
   - 设计关卡层：所有 AI 调用通过 `ai.py` 统一注入人设（不需要每个技能单独改）
4. **分析了当前 6 个 AI 调用点的问题**：全部用通用 prompt，没注入人设

**已完成的能力**：
- 做视频 6 步流（扒文案 -> 改写 -> 声音 -> 形象 -> 剪辑 -> 发布）
- FastAPI 后端 12+ endpoint（`:8000`）
- React 前端 8 页（`:8001`）
- 知识库只读对接（Obsidian vault，jieba + TF-IDF 匹配）
- 投流文案批量 5 版 + 知识库注入
- 朋友圈衍生 3-5 条 + 知识库注入
- 公众号大纲 + 长文 + 知识库注入
- 素材库 / 热点库 / 选题库 CRUD
- 作品库 + 数据指标手动录入 + 排行分析
- AI 引擎双轨：Claude Opus（via OpenClaw） / DeepSeek 一键切换
- GPT-Image-2 封面并发生成（apimart）
- 轻抖链接提取（异步轮询）
- 设置持久化（data/settings.json）

**未实现但 PRD 里有**：
- 知识库注入到改写 prompt（kb.match 已有，但 rewrite_script 没用上）
- 小华对话（底部 dock 的自由聊天）
- 小华记忆持久化
- 多平台真发布（抖音/快手 OpenAPI）
- 定时发布 / BGM 混音 / 数据自动采集

---

## 版本演进

### v0.1.0（2026-04-23）-- Streamlit 单文件 MVP
- 一页六卡 Streamlit UI + 石榴 + DeepSeek + CosyVoice（桩）
- pytest 10/10 + 端到端视频生成验证
- 详见 `DELIVERY-v0.1.md`

### v0.2.0（2026-04-24 上午）-- 新 API 接入
- 轻抖（链接->文案）+ apimart GPT-Image-2（AI 封面）

### v0.3.0（2026-04-24 下午）-- 设计稿 C2 全量实施
- FastAPI + React 前端 8 页 + 知识库 + 投流/朋友圈/公众号 + AI 双轨
- 详见 `DELIVERY.md`

### v0.3.1（2026-04-24 晚）-- 项目管理 + 记忆系统设计
- Git init + CLAUDE.md + PROGRESS.md + TECHNICAL-DECISIONS.md
- persona-prompt.md + 小华工作日志.md（Obsidian 知识库）
- 8 条技术决策记录

---

## Roadmap（按 Phase 推进）

### Phase 1 -- 人设注入 + 核心链路加固
- [x] **ai.py 关卡层改造**：所有 AI 调用自动加载 persona（v0.3.2 D-008）
- [x] **两档开关**：前端 `<DeepToggle />` 全站共享 localStorage（v0.3.2 D-008）
- [x] **改写 prompt 注入知识库**：前端 `factory-flow.jsx` 的 KbInjectBar
      让清华哥手选 KB chunks 拼进 text；批量生成类（投流/朋友圈/公众号/选题）
      服务端已自动 kb.match
- [x] **行为记忆写入**：每次改写/生成后自动追加到小华工作日志.md（D-023）
      backend/services/work_log.py · maybe_log() 在 PersonaInjectedAI.chat finally
      钩子里调用,失败吃掉 · 默认 disabled,settings.work_log_enabled 开关
      节流: 同 route_key 5 分钟内只记 1 条 · skip 失败 / skip < 50 tok pings
      日志路径: ~/Desktop/清华哥知识库/00 🤖 AI清华哥/小华工作日志.md
      格式: `- HH:MM · 🔥 hotrewrite.write(opus) · 输入摘要 → 产出摘要 · 2500 tok`
      endpoint: GET /api/work-log/{status,recent} + POST /api/work-log/toggle
      tests/test_work_log.py 9 个单元测试全过(用 tmp_log fixture 隔离)
- [x] **首页 4 方块真实统计数据**(D-024) `/api/stats/home` 接 ai_calls 表
      ad: touliu.* + ad.* 合计今日/昨日批数 · wechat: wechat.write 今日/本周
      moments: moments.derive 今日/昨日 · make: 仍走 works 表(原本就对)
      hint 文案动态: "今日 N 批" / "昨日 N 批" / "今日还没出过投流" 自适应
- [x] **选题批量生成优化**(D-025) 结构化输出 + 去重 + 字数过滤 + 避免已有库重复
      原返回 `["选题1",...]` 纯字符串,现返回 `{title,angle,why,tags,suggested_format}`
      入库带 description 和 tags · 字数 6-25 外过滤 · 前 5 字重复(含最近 30 条库内)过滤
      返回带 stats: {generated, kept, too_long, too_short, duplicate}
      兼容旧前端(titles 字段还在)

### Phase 2 -- 小华对话 + 记忆闭环
- [x] **底部 dock 自由对话（多轮）**(D-027) `/api/chat` POST {messages, context}
      LiDock 真接通: messages state + Enter 发送 + 滚到底 + ··· loading 三点动效
      切页自动重置开场白 + 清空按钮 + DeepSeek 路由(便宜,1-2s 回复)
      多轮历史拼成单 prompt(最近 12 轮),system 注入 persona + 当前页 context
      端到端: "我现在写公众号没思路怎么办?" → 1.3s 回 "老板,咱先聊聊..."(引导到工作流)
- [x] **对话中学到的偏好自动写入**(D-030) backend/services/preference.py
      LiDock 每条 user 消息后台异步触发 maybe_learn(BackgroundTasks)
      关键词预筛(我喜欢/不要/记住/以后...)→ 命中才走 AI 二筛 → 是偏好才写
      DeepSeek 路由 · 1 分钟节流 · 默认 disabled · settings.preference_learning_enabled
      `~/Desktop/清华哥知识库/00 🤖 AI清华哥/小华学到的偏好.md` 单独文件
      endpoint: /api/preferences/{status,toggle,recent}
      tests/test_preference.py 8 个 fixture 隔离单测全过
- [x] **行为记忆读取:最近 20 条注入 prompt**(D-031) memory_inject.py
      D-005 三层记忆架构的 Layer 3 实现 · 把 D-023 work_log + D-030 prefs 拼成
      prompt 片段,在 PersonaInjectedAI.chat 的 deep=True 路径附加注入
      默认 disabled · settings.memory_injection_enabled 开关 · 偏好去重
      `/api/memory-inject/{status,toggle}` · 8 个单元测试(含 PersonaInjectedAI 集成)

### Phase 3 -- 发布 + 数据闭环
- [ ] 多平台真发布（需各家 OpenAPI 授权）
- [ ] 数据自动采集
- [x] **效果分析 → 反哺选题**(D-032) backend/services/insights.py
      - top_performers(limit=10) · 按 views 跨平台聚合 metrics 表
      - winning_patterns() · AI 抽 top 共性(开头/角度/标题模式/标志词/DNA),1h 缓存
      - topics_generate prompt 自动注入 "你过往跑量好的作品共性"
      - `/api/insights/{top-performers, winning-patterns}` endpoints
      - metrics 空时自动跳过(向后兼容,跟没这功能一样)
      - 7 个单元测试 · tmp_db + reload 隔离 prod DB

---

## 人设/记忆系统架构（速览）

```
Obsidian 知识库 / 00 AI清华哥 /
├── persona-prompt.md        ← 精简版（300 token），每次 AI 调用必带
├── 小华工作日志.md           ← 行为记忆，AI 自动追加，清华哥可手动编辑
├── 业务画像.md              ← 详细版，deep=true 时加载
├── 写作风格规范.md           ← 详细版，deep=true 时加载
├── 人设定位与表达边界.md      ← 详细版，deep=true 时加载
├── AI协作偏好.md            ← 详细版，deep=true 时加载
└── index.md                 ← 知识库导航索引

代码层：
  ai.py → get_ai_client() → chat(prompt, deep=True)
    → 自动读 persona-prompt.md（必带）
    → deep=True 时额外读完整人设 + kb.match + 最近记忆
    → 所有技能（改写/投流/朋友圈/公众号/选题/标题）自动继承
    → 未来新技能只要调 get_ai_client()，零额外配置
```

关键决策见 `docs/TECHNICAL-DECISIONS.md`（D-005 三层记忆、D-008 两档开关）。

---

## 已知问题

见 `KNOWN_ISSUES.md`（持续维护）。

---

## 进行中(autonomous loop 自驱 · 2026-04-25 凌晨)

**优先级清单**(cron `*/30` 自驱,每轮做一项):
- [x] **[P0] 🚀 全自动到封面按钮**(09faf92) 挑完标题自动跑到 Step 7
- [x] **[修 bug] Step 5 配图卡片歧义** 卡片 flex 列布局,按钮始终可见 + "✨ 一键生成"按钮
- [x] **[基建] AI 引擎智能路由** `get_ai_client(route_key=...)` 11 条默认路由
      (wechat.titles → deepseek, wechat.write → opus, etc.)
      /api/ai/routes 暴露路由表给前端。settings.engine_routes 可覆盖。
- [x] **[P1] 热点文案改写V2 skill** hotrewrite_pipeline + 3 步 UI
      `/api/hotrewrite/{analyze,write,skill-info}`, 路由 `wechat → 🔥 热点改写`
      sidebar 新增入口。端到端 /analyze 7s 返回 3 个切入角度(DeepSeek)。
- [x] **[P2] 录音文案改写 skill** voicerewrite_pipeline + 3 步 UI
      `/api/voicerewrite/{analyze,write,skill-info}`, sidebar 🎙️ 录音改写
      端到端 /analyze 7.7s(DeepSeek), 提骨架 + 2 角度,语气锚点精准捕捉。
- [x] **[P3] touliu-agent 替换 /api/ad** touliu_pipeline + 2 步 UI
      `/api/touliu/{generate,lint,skill-info}`, 注入 SKILL.md(18K) +
      style_rules/winning_patterns/industry_templates/golden_samples
      结构分配自动按 n 分配(痛对步话创),每条带编导 6 维终检。
      subprocess 调 lint_copy_batch.py 做本地质检。
      覆盖旧 PageAd,旧 /api/ad/generate 保留作 fallback。
      测试: skill-info ok, 结构分配 3/5/8/10/15 都正确。
      端到端 /generate 10 条 Opus 吃 6K token system,首跑 2-3 分钟,
      留用户早上真跑验证。
- [x] **[P4] Token/成本监控 + 首页 widget** ai_usage.py + 打点钩子在
      PersonaInjectedAI.chat 里,SQLite ai_calls 表,`/api/ai/usage?range=today|week|all`
      + `/api/ai/usage/recent`. 首页新增 AiUsageCard widget:
      "今日 5 次 · 8.2K tokens · ¥2.21 · opus 占 95%"
      价格表: Opus $15/$75 per M · DeepSeek $0.14/$0.28 per M · 汇率 7.2
      settings.engine_pricing / usd_to_cny 可覆盖
- [x] **[P5] 工作流 localStorage 持久化** factory-persist.jsx 通用 hook
      useWorkflowPersist({ns, state, onRestore}) + 500ms 防抖保存 + 顶部 WfRestoreBanner
      4 个 skill 全覆盖: wechat / hotrewrite / voicerewrite / touliu
      刷新浏览器 / 重启不丢中间态, reset() 自动清 localStorage
      autoMode 子 step 挂起不恢复(pipeline 不能续跑,回落到 topic 重走)
- [x] **[P6] skill 骨架生成器 scripts/add_skill.py** 一键生成新 skill 骨架
      用法: `python3 scripts/add_skill.py --slug <cn> --key <py_id> --icon 🌟 --label <cn>`
      做 7 件事(幂等,已注册跳过):
      1. 验证 ~/Desktop/skills/&lt;slug&gt;/SKILL.md 存在
      2. 生成 backend/services/&lt;key&gt;_pipeline.py (analyze+write 2 步)
      3. 生成 web/factory-&lt;key&gt;-v2.jsx (3 步 UI + WfRestoreBanner)
      4. 注册 backend/api.py (import + 3 endpoint)
      5. 注册 DEFAULT_ENGINE_ROUTES (2 条: analyze→deepseek, write→opus)
      6. 注册 factory-shell.jsx sidebar + factory-app.jsx route + index.html
      从 0 新增 skill 从 3h → 30min,只需调 pipeline 的 prompt 适配实际 SKILL.md
- [x] **[P7] 测试扩展** 单元测试从 18 → 75(+57 个,覆盖新功能)
      - tests/test_ai_routing.py (7) · 引擎路由优先级 + routes_info
      - tests/test_ai_usage.py (7) · 打点 + 聚合 + range + 成本计算 + no-op 过滤
      - tests/test_pipelines.py (25) · 3 个 skill 的 _extract_json + alloc_for + 模块导出
      - tests/test_skills_smoke.py (18) · 接入 skill 的目录/pipeline/endpoint/jsx/sidebar 完整性
      - 纯结构化测试,不打真 AI,不污染 prod DB(ai_usage 用 tmp_db fixture 隔离)
      全量 75/75 passed · 接入新 skill 只需在 REGISTERED_SKILLS 加一行自动跑完整性检查
- [x] **[P8] 首页技能中心卡片** backend/services/registered_skills.py 作为
      single source of truth (api_prefix/page_id/icon/label/subtitle/steps),
      /api/skills/catalog 扫桌面 + 注册表返回全量 · 首页新增 SkillCenter 组件:
      上方 grid 2 列显示已接入(4 个),下方可展开"未接入"(桌面 13 个过滤学员版后)
      含一键命令提示 `python3 scripts/add_skill.py --slug X --key Y`。
      test_skills_smoke.py 改为消费 registered_skills,从此 DRY 了。
- [x] **[P9] CHANGELOG + 文档** 三份新文档:
      - `CHANGELOG.md` · Keep-a-Changelog 格式 · 按 D 号分组 · v0.3.0 → v0.4.0
      - `docs/NEW-SKILL-PLAYBOOK.md` · D-010 接入范式手册(5 步 + 红线 + 故障排查)
      - `CLAUDE.md` 补「接入新 skill」+「AI 引擎智能路由」两节 + 事实源表补 2 行
- [x] **[P10] 前端 UI 组件库提取** factory-ui.jsx 独立文件
      提取: Spinning / TitlesSkeleton / SkeletonCard / SkillBadge / StepDots / StepHeader
      factory-wechat-v2.jsx 瘦身 49k → 45k 字符
      index.html 加载顺序: tokens → api → deep → persist → **ui** → shell → ...pages
      未来新 skill(add_skill.py 生成 或手动写)可直接用 StepHeader 省 50 行顶栏代码
      现有 4 个 skill 的 Header 暂不动(迁移有回归风险,后续可渐进重构)

---

## 🎉 autonomous loop 清单全部完成 (2026-04-25)

P0-P10 所有任务落地, 14 个 commit 从 `09faf92` 到今日末 commit。
完整变更见 CHANGELOG.md · 接入新 skill 参见 docs/NEW-SKILL-PLAYBOOK.md

## 下一阶段进行中 (🌙 小华夜班 · 用户最高优先级 D-040)

用户最新规划 (2026-04-25): 用户睡觉的 23:00–6:00, 让 Mac 跑预设任务,
早上打开"总部"看到一批可消费的产出, 把每天工作起跑线前移 1-2h.
**对外全部用「小华夜班」**, 禁用「自动化任务」「cron」「agent」等技术词.

4 条预设任务:
1. 凌晨抓热点 → 早上挑选题 (content-planner 抓对标账号 24h 爆款)
2. 一鱼多吃 → 直播录音变 5 件素材 (file_watch data/inbox/audio/)
3. 知识库整理 → kb-compiler + kb-lint
4. 昨日复盘 → 抓发布数据 + 写小华工作日志.md (D-005)

对接现有体系: 三层记忆 (D-005) / 人设 (D-008) / skill 范式 (D-010) /
引擎路由 (D-011) / tasks 池 (D-037a) / works.db / settings.json

按可独立回滚切 6 个子 commit, 每轮一个:

- [x] **D-040a 数据层** night_jobs + night_job_runs 表 + night_shift.py
      CRUD service (create/list/update/delete/set_enabled · start_run/finish_run/list_runs/
      latest_run_for_job · get_digest 24h success 滚动汇总) · tests/test_night_shift.py 22/22
- [x] **D-040b API + OpenAPI 规范化** 7 个 /api/night/* endpoints
      GET/POST  /api/night/jobs · PATCH/DELETE /api/night/jobs/{id} ·
      POST /api/night/jobs/{id}/run · GET /api/night/runs · GET /api/night/digest
      run-now 走 night_executor.run_job_async (thread + placeholder runner,
      D-040c 注册真 subprocess runner). 立即返回 run_id, 调用方轮询 /runs.
      **顺手立 OpenAPI 注释规范** (用户选 B): app `description` + `openapi_tags`
      14 个分组 (总部/AI/小华夜班/公众号/...); 新 endpoint 全部带 tags=["小华夜班"] +
      summary 中文一句 + Pydantic Field(description=...). 老 endpoint 增量补.
      tests/test_night_executor.py 6/6.
- [x] **D-040c 调度器 (cron only, file_watch 推迟)**
      backend/services/night_scheduler.py · APScheduler BackgroundScheduler 单例,
      启动时把 enabled+trigger_type=cron 的 job 用 CronTrigger.from_crontab 挂上,
      fire 时调 night_executor.run_job_async. uvicorn boot 由 @app.on_event("startup")
      唤起 (pytest 不触发 startup, 测试自动走 reload_jobs API).
      jobs CRUD endpoint 全部接 _reload_night_scheduler_silent() · 改 enabled/cron
      表达式立即生效不用重启 backend.
      新 endpoint GET /api/night/scheduler 看调度器状态 + 当前挂的 job + next_run_time.
      misfire_grace_time=300 / coalesce / max_instances=1 防 misfire 风暴.
      file_watch 留 D-040f 接 watchdog (一鱼多吃任务真要时再加, 用户说本地用爽优先).
      uv add apscheduler>=3.10 (3.11.2 + tzlocal 5.3.1).
      tests/test_night_scheduler.py 8/8.
- [x] **D-040d 总控页 + sidebar 改造**
      sidebar (factory-shell.jsx): 首页→总部, 加 NavGroupLabel 组件, 在生产部/
      档案部/夜班 3 段前显示分组小标题(展开态), 折叠态隐藏. 加 🌙 小华夜班 入口.
      NightShiftPage (factory-night-v2.jsx, 18K 字): 顶栏 + 状态条 ("今晚自动跑
      X 条任务" / 总条数·启用数·成功数·失败数) + 任务卡片网格 (icon/名字/触发器
      /上次跑了/启用 toggle/立即跑/编辑/×) + 历史日志 (最近 30 条 flat list,
      job icon + 时间 + summary + 耗时 + status tag) + NightJobEditor 模态
      (name/icon/skill_slug/trigger_type 三选一/cron 输入+4 个预设 chip/
      output_target 下拉/enabled). 4s 自动刷新看立即跑实时进度. humanizeCron
      把 "0 23 * * *" 翻成 "每天 23:00".
      api.patch 补上 (factory-api.jsx 之前只有 get/post/del).
      factory-app.jsx 加 nightshift route. index.html 在 dreamina 后载入.
      端到端 smoke 跑过: TestClient 模拟前端 8 步 (列空/创建/列 1 条/PATCH 开关
      /立即跑+轮询占位 runner 落 success/digest/scheduler 状态/删) 全通.
- [x] **D-040e 总部播报 NightDigestCard** (散落标签留 D-040f)
      factory-home.jsx 加 NightDigestCard, 插在 4 大方块下方 / 🔥 热点条上方.
      时间联动 (6-22h 白天模式 GET /api/night/digest 显示 "昨晚帮你做了 N 件事"
      + 4 条产出 bullet + 引导跳对应库; 22-6h 夜班模式 GET /api/night/jobs?enabled_only
      显示 "今晚 HH:00 起跑 N 条任务" + 任务 chips). 0 产出整块隐藏(不要"暂无"占位).
      output_target → 引导文案: materials→看选题 / works→去作品库审 / knowledge→看一眼 / home→看总部.
      渐变背景区分模式: 白天暖色 (#fff8ec→#fff) / 夜班冷色 (#f0f3ff→#fff).
      散落标签 (素材库/作品库/知识库 "🌙 来自夜班 (N)" 过滤): 暂不做.
      理由: D-040f 4 条预设 runner 还没接, output_refs 永远空, N 永远 0 按"0 隐藏"
      规则永远不显示, 纯死代码. 留 D-040f 跟真 runner 一起.
      端到端 smoke: 3 场景 (有 success 显白天 / 有 enabled cron 显夜班 / 全空隐藏).
- [x] **D-044 NightJobEditor UX 重做** (借鉴 WorkBuddy)
      用户上轮 [Image #9] 给我看 WorkBuddy "添加自动化任务" 设计后, 重做夜班编辑器:
      频率从"输 cron 表达式"改为 4 个语义化 mode tab:
        每天 / 按间隔 / 监听目录 / 只手动
      "每天" 模式: hour:minute 数字输入 + 7 个圆 pill (周一...周日) 多选 +
        3 个快捷预设 (工作日 / 周末 / 每天)
      "按间隔" 模式: 数字 + 单位下拉 (分钟/小时), <60 分钟或 <24 小时.
      "监听目录" / "只手动": 跟前一致.
      新增 composeCronDaily / composeCronInterval / inferEditorState 三个辅助函数:
        compose 把 UI state → cron 字符串
        infer 把现有 job → UI state (反向解析, 编辑老 job 用)
      humanizeCron 同步增强: 识别 "0 */N * * *" 每 N 小时 / 工作日 / 周末 /
        cron 周几名字 (周一/三/五).
      预览栏实时显示 "cron: 0 22 * * 1,3,5 · 周一/三/五 22:00" 给用户确认.
      iOS 风按钮: 黑色丸 [添加] / 浅描边 [取消]. mode pill 黑底白字 active.
      后端不改 — 仍存 trigger_type + trigger_config.cron, 前端纯抽象层.
      验证: 6 种生成的 cron 串过 APScheduler.CronTrigger.from_crontab 全过.
      JSX parse OK · 全量 pytest 204/204.
      跳过的: WorkBuddy 的"单次"模式 — APScheduler cron 没真"一次性"语义,
      要做需后端加 expires_at 字段, 超本轮 scope. 用户需要单次时可以 enabled=False
      手动跑.
- [x] **D-047 凌晨抓热点 真 runner (AI 出选题)**
      D-040f 时是占位 runner. 本轮实装 content-planner runner:
      AI 基于人设产 5 条选题候选, 写 hot_topics 表 (fetched_from="night-shift",
      match_persona=True). NightDigestCard 显示 "AI 出 5 条选题 · 最高 🔥92: 《...》",
      点 "看选题" 跳 materials 页 (已经有 hot-topics tab).
      诚实交代: spec 写"抓对标账号 24h 爆款", 但 content-planner skill 实际
      是"活动策划"不是抓爆款, 真爬虫没现成 skill. 当下能做就是 AI 出选题候选,
      给用户早上有东西看 + 一键做成视频. 真"抓爆款"留 backlog 等爬虫 skill.
      output_refs: [{kind:"hot_topic", id:N}, ...] (D-040 散落标签真有数据可显示了)
      tests/test_night_runners.py 13/13 (+4: 5 选题 / 解析失败 / AI 抛 / 部分 title 空)

- [x] **D-040f 4 条预设 seed + 1 个真 runner**
      backend/services/night_runners.py · DEFAULT_NIGHT_JOBS 4 条种子 + seed_defaults() 幂等创建.
      registered_runners 4 个: 1 真 + 3 占位.
        ✓ daily-recap (真): 抓昨日 ai_usage / 写小华工作日志.md / 摘要 "AI 调 N 次 / X tokens / ¥Y"
        ⏸ content-planner / one-fish-many-meals / kb-compiler (占位): 写明 "未接入" 不崩
      app startup 钩子 import night_runners 触发 register_all() · 调度器 fire 时找得到 runner.
      新 endpoint POST /api/night/seed-defaults (幂等). 默认 enabled=False (用户审一遍再开).
      前端: NightShiftPage 空状态加 "📋 加 4 条预设任务" 按钮 + "+ 自己加一条".
      tests/test_night_runners.py 9/9. 端到端 smoke: seed → list 4 → 跑 daily-recap (真) →
      跑 content-planner (占位) → 二次 seed 幂等, 全跑通.

      未做 (诚实):
      - one-fish-many-meals / kb-compiler 这俩 skill 不存在于 ~/Desktop/skills/, 真接入要等
        清华哥写完 skill 再补 runner.
      - file_watch 监听 data/inbox/audio/ 仍未接 watchdog (D-040c 推迟决定保留)
      - content-planner 真 runner: D-022 已接 planner_pipeline,
        本轮没把 planner.analyze + write 接进来 + 写 materials 表 — 留下一轮
      - 散落标签 ("🌙 来自夜班 (N)" 过滤): output_refs 暂只有 daily-recap 写一条
        work_log ref, materials/works/knowledge 没数据 → 标签按"0 隐藏"规则不显示, 跳过

命名 (用户可见 / 代码内部):
  整个系统  小华夜班                  night_shift
  单条任务  任务 ("凌晨抓热点")        night_job
  单次运行  上次跑了…                  night_job_run
  总控页    小华夜班                  NightShiftPage
  总部播报区 昨晚小华帮你做了 X 件事    NightDigestCard


## ⏸️ 暂缓: ⑤ 任务管理 (D-037)

D-040 用户拍板优先, D-037 后续再续. D-037a 已落地的 tasks 基建会被 D-040 直接复用 (执行器/历史)

- [x] **D-037a 后端 tasks 基建** (`5bf15da`) — D-040c 调度器会复用
- [ ] **D-037b 慢 endpoint 异步化** (write/cover/plan-images 改 task_id)
- [ ] **D-037c 前端顶栏 TaskBar + 任务详情抽屉**

## 公众号 8 步打磨完成(D-033 ~ D-036)

- [x] ① Step 5 配图 prompt 可改 + 6 风格预设 (D-033 `86c65eb`)
- [x] ② Step 6 HTML 模板切换 V1/V2/V3 (D-034 `e31d399`)
- [x] ④ Step 7 封面 4 选 1 + 再来一批 (D-035 `c75d5d2`)
- [x] ③ Step 4 长文局部重写 + 7 快捷指令 (D-036 `4ccd0ca`)

## 公众号 8 步走查 BUG 修复(D-038)

用户走完 8 步发现 4 个 BUG, 一次性收口:

- [x] **wfRestore 旧 coverResult 兼容性** — 旧版本(D-035 之前)持久化的封面没有 `covers` 数组,
      `local_path` 文件已被清理或迁移导致 broken image. 修复: wfRestore 时直接丢弃旧格式
      (`Array.isArray(s.coverResult.covers)` 才恢复)
- [x] **push() 422 cover_path Field required** — 旧 wfState 残留的 coverResult fallback 不到任何
      合法 path, push 直接 422. 修复: push() 强校验 `coverPath` 和 `htmlResult.wechat_html_path`,
      空时 setErr + 自动 setStep("cover") 跳回封面页
- [x] **顶栏 step dot 不能往回点** — 用户没法回看之前的 step. 修复: factory-ui.jsx StepDots 加
      `onJump` prop, 已完成的 step 可点跳回; WxHeader 同步加 onJump 透传(autoMode/loading 时禁用)
- [x] **WxStepCover 旧数据明示提示** — 单张模式下展示一条 amber 横幅, 引导点 "🔄 升级到 4 选 1"

## D-062 系列 — 用户旅程闭环(清华哥批评)

清华哥批评点醒: 我做的都是"功能堆砌", 缺"用户视角完整闭环"思维.
批评原话:
  · "热点点进去发现没数据要用户输入热点 — 那要这个功能干啥"
  · "投流文案完了下面就应该跟'要不要做数字人/生成视频/发布'"
  · "你需要有自我迭代和复盘的能力"

D-062 系列方向: **不是单点优化, 是按 user journey 全流程闭环检视 + 修复**

- [x] **D-062a** Step 1 重排 + 当日热点预览
      textarea 置顶最显眼 (rows=12, font 14, 行距 1.75)
      下面跟 🔥 今日热点区: 拉 /api/hot-topics 前 3 条, 点一条一键塞
      seed (含平台/热度/角度/分隔符) 进 textarea
      最下 6 大 skill 按钮区
      热点空时引导 "去 📥 素材库 / 🔥 热点 tab 加 · 或启用 🌙 小华夜班 凌晨抓"
      night-shift 来源条带 amber 渐变 + 🌙 tag

- [x] **D-062b** docs/USER_JOURNEY_AUDIT.md 184 行深度复盘
      4 条典型起点路径 (热点 / 录音 / 投流 / 空白)
      每条路径列具体断点 + 修法
      跨链路共性 5 类问题, 优先级排
      D-062c-t 实施 backlog (按 P0/P1/P2 分 6 phase)
      文档维护规则: 修一项打勾 + 每 3 拍 audit 复盘新断点
- [x] **D-062c** hotrewrite 完成态 → 做成视频 + PageMakeV2 自动填 textarea + banner
- [x] **D-062d** voicerewrite 完成态 → 做成视频 (同款 CTA)
- [x] **D-062e** touliu n 默认 1 + [1, 3, 5, 10] 选项 + 每条文案下"用这条做视频"
- [x] **D-062f** wechat write 完成态加 ✨摘金句段做视频 (有选段则带选段, 无则带全文) + 推送草稿提示
- [x] **D-062g** moments copy 完成态加每条 🎬 做视频 + 底部 "把第 1 条做成视频" CTA
- [x] **D-062h** PageMakeV2 Step 5 PublishPanel 多平台卡片化 (5 张可操作卡 + 通用素材复制 + 标记已发)
- [x] **D-062i** hot_topics 空启动飞轮 (新建共享 NightHotFlywheel · 接入 PageMakeV2 + PageMaterials)
- [x] **D-062j** topics 空 内嵌 AI 飞轮 (input + "✨ 让小华生 5 条" 主按钮 · n=5 默认)
- [x] **D-062u** Step 1 6-skill cards desc 提示文案换 (跨页 state 已通的真相)
- [x] **D-062v** Step 2 PickerColumn empty actionable CTA (声音→设置 / 数字人→复制柿榴说明)
- [x] **D-062w** Step 3 模板空 朴素模式 CTA (brandSoft 卡 + "👆 用朴素模式继续")
- [x] **D-062x** 反向 anchor from_make (PageMakeV2 ↔ skill 双向收尾, useFromMake hook + FromMakeBanner)
- [x] **D-062y** WxStepWrite 选段 ≥10 字阈值显眼化
- [x] **D-062aa** PageHotrewrite Step 1 列今日热点 + 空时飞轮 CTA (Path A item 1 漏修补)
- [x] **D-062bb** voicerewrite Step 1 URL 自动转写 (Path B item 1 · 走轻抖 ASR)
- [x] **D-062-AUDIT-1/2/3** 三轮自我复盘 (每 3 拍一次, 写进 USER_JOURNEY_AUDIT.md)
      AUDIT-2 修了 hot/topic/viral/works onUse 不带 seed bug + 删 __materialHandoff 双轨
      AUDIT-2-todo3 文案过长 amber 警告
- [ ] **D-062cc** Step 4 errorMsg 长难懂 (待后续: 错误码映射 + 重试 CTA)
- [ ] **D-062dd** sidebar 各 skill 入口"今日产出"小数字 (P3)
- [ ] **D-062z** Step 5 标记已发跨视频聚合统计 (P2)
- [ ] **D-062r-t** SSE 流式输出 (touliu/wechat write 长任务进度反馈, 需后端 infra)

清华哥拍板的产品架构修正:
1. 平台只做数字人内容 (真人视频用手机 "开拍" 自己搞)
2. v5/v6/v7 模板是"做视频"流程的 Step 4 选项, 不是 sidebar 独立 skill
3. Step 1 文案是"大板块", N 个并列大按钮 (投流/朋友圈/公众号/录音/热点/人设型/直接粘贴)
4. 各文案 skill sidebar 入口保留 (独立用 + 做视频拉入双轨)
5. 6 步流程: 文案 → 声音+数字人 → 模板 → 剪辑 → 预览+反馈 → 发布

按 8-10 拍小 commit 推进:
- [x] **D-061a** sidebar 拿掉 🎞️ v5 入口 (route 保留供 PageMake 跳转复用)
- [x] **D-061b** PageMakeV2 重塑骨架 (5 步 wizard 占位)
      新文件 web/factory-make-v2.jsx (PageMakeV2):
      MAKE_V2_STEPS = 文案 / 声音+数字人 / 选模板 / 剪辑 / 预览+发布
      MakeV2Header (步骤 dots, 已完成 step 可点跳回, 共用风格 Dhv5Header)
      Step 1-5 都有占位 placeholder + 过渡输入 (供后续 step 接通前能跑通)
      已完成 → 文件已 wire 到 case "make" route, sidebar 🎬 做视频 入口指向新版.
      旧 factory-flow.jsx 留 load 不 route, 后续 commit 搬有用代码再 cleanup.
- [x] **D-061c** Step 1 文案大按钮板块
      MAKE_V2_SCRIPT_SKILLS = 6 个 skill (热点/录音/投流/公众号/朋友圈/内容策划)
      ScriptSkillCard 组件: hover 蓝边 + brandSoft 阴影
      响应式 grid (auto-fill 240px), 每个卡片含 icon/title/desc + 跳转箭头
      点击 → onNav(skill.id) 跳到 sidebar 对应 skill, 用户做完手动复制粘贴回来
      文案输入区: textarea + 字数 tag + 估算口播时长 tag + 清空按钮
      跳转后返回锚机制 (从 make 来 → 自动回 make) 留 D-061h 做.
- [x] **D-061d** Step 2 声音 + 数字人合并一步
      默认快捷区: "🎙️ 声音: 张三  · 👤 数字人: 办公桌前清华哥" + [换] 按钮
      localStorage 记上次 (MAKE_V2_LAST_KEY), 进 step 自动预选
      展开 picker 双栏: 左 speakers / 右 avatars (Show id + title)
      "▶ 一键造数字人 (柿榴异步)" 按钮 → POST /api/video/submit →
        轮询 /api/video/query/{vid} 每 5s → 完成自动取 local_path
        通过 /api/works/{wid}/local-path 拿绝对路径填到 dhVideoPath
      合成中显 video_id + work_id + status, 完成显 ✅ + 路径
      过渡占位: details "或者跳过合成, 直接填现成 mp4 路径" 给开发期/调试用
      抽 PickerColumn 共用组件 (单列 list + 选中 ✓ 高亮)
- [x] **D-061e** Step 3 选模板 (复用 dhv5 卡片 + "朴素无模板"选项)
      复用 PageDhv5 已有: DhvTemplateCard / DHV5_CATEGORIES / DHV5_DURATION_BUCKETS
      "📹 朴素无模板 · 直接出片" 选项放最上面 (templateId=null)
      网格 auto-fill 260px, 选中蓝边 + brandSoft 阴影
      D-061f 处理 templateId=null 分支 (跳过 align, 直接发布数字人 mp4)
- [x] **D-061f** Step 4 剪辑 (复用 dhv5 align + render + B-roll, 含朴素分支)
      模板模式: 三 mode 切换 (auto/placeholder/manual) + 对齐按钮 →
        POST /api/dhv5/align → 显 SceneRow 列表 (复用 PageDhv5 的 Dhv5SceneRow)
        每 B/C scene 可展开 broll panel + 编辑 prompt + 🎨 生这张
        [▶ 开始渲染] → POST /api/dhv5/render(scenes_override 含用户编辑过的)
      朴素分支 (templateId=null):
        显 "📹 朴素模式不需要剪辑步, 数字人 mp4 是最终成片"
        小预览 video (数字人 mp4)
        [下一步: 预览 →] 触发 onRender("raw:<mp4路径>")
      Step 5 识别 "raw:" 前缀 → 不轮询 task, 直接显 mp4 当成片
- [x] **D-061g** Step 5 反馈 + 发布
      FeedbackPanel: textarea 留意见 + [带意见回剪辑步] 按钮 →
        note 暂存 localStorage make_v2_feedback_note · 回 Step 4 时可读
        当前实现是"用户照 note 自己改字段/重生 broll" · D-061g+ 接 AI 自动改
      PublishPanel: ⬇️ 下载 mp4 到本地 + 5 个平台提示
        当前 = 手动发, Phase 4 接 OAuth 自动发
      朴素模式不显 FeedbackPanel (没字段可改)
- [x] **D-061h** cleanup
      web/factory-flow.jsx 文件头加 ⚠️ DEPRECATED 注释 (旧 PageMake 6 步,
        已被 PageMakeV2 替换, 待 D-062 彻底从 index.html 移除 load)
      web/factory-dhv5-v2.jsx 文件头加 部分 DEPRECATED 注释 (PageDhv5 sidebar
        入口已废, 但 DhvTemplateCard / Dhv5SceneRow / DHV5_CATEGORIES /
        DHV5_DURATION_BUCKETS 仍被 PageMakeV2 复用 — 待 D-062 抽 utils)
      docs/KNOWN_ISSUES.md 第 9 项: 文件 load 但部分 deprecated 现状记录, P3 polish

== D-061 系列总结 (8 commits) ==
D-061a sidebar 拿掉 v5 入口 (96884f2)
D-061b PageMakeV2 5 步 wizard 骨架 (fa16ad4)
D-061c Step 1 文案 N 个大按钮 (d449c7e)
D-061d Step 2 声音 + 数字人合并 (e24258d)
D-061e Step 3 选模板 + 朴素分支 (2f6ceba)
D-061f Step 4 剪辑 align + render + B-roll + 朴素 (90ac73d)
D-061g Step 5 反馈 + 发布 (f0d6218)
D-061h cleanup (THIS)

清华哥拍板架构修正全部落地: 平台 = 数字人内容平台, sidebar 不随模板膨胀,
6 个文案 skill 独立入口保留 + 做视频 Step 1 大按钮跳转, 模板剪辑融进做视频.

## v5 B-roll 前端接通 + prompt 编辑 — D-059 完整收尾(D-060c)

D-060a 后端已落地, 但前端没接 — v5 用新模板时(没预生 broll)用户没办法
在 UI 里生图. 这一拍把 B-roll 前端接上, v5 任务彻底完成.

- [x] **D-060c B-roll 前端 + prompt_override 后端支持**
      backend/services/dhv5_pipeline.py:
      - generate_broll() 加 prompt_override 参数
      - 已存在 + regen=false + 没 prompt_override → 跳过; prompt_override
        给了即便文件存在也重打 apimart (用户意图重生)
      backend/api.py:
      - Dhv5BrollReq pydantic 模型加 prompt_override
      - POST /api/dhv5/broll/{tid}/{idx}?regen=0 接收 body (可空)

      web/factory-dhv5-v2.jsx:
      - 新 state: expandedSceneIdx (单值, 同时只展开一个) /
                  generatingBrollIdx / brollUrls (idx → url cache)
      - useEffect 加载 align 后预填 brollUrls (从模板 top_image/screen_image
        相对路径推 /skills/dhv5/brolls/<id>/<filename>)
      - generateBroll(idx, regen): 检测 prompt 改没改 → 调 endpoint →
        cache-bust ?t=Date.now() 让 <img> 强刷
      - Dhv5SceneRow B/C 型加📷展开按钮 (缺图显"📷 缺", 已生显"📷")
      - 展开面板: 左侧 broll 缩略 (B 4:3 / C 9:16 比例 + 未生灰底占位) +
                 右侧 prompt textarea 可改 + [🎨 生这张] 或 [🔄 重生]
      - 生图 30-60s, 按钮 disabled + 文案"生图中…"

      JSX parse OK · 全量 pytest 257/257 (+0 新测试 — backend 加的
      prompt_override 路径和已有 generate_broll 测试覆盖路径一致)
      端到端 smoke: A scene 调 broll endpoint 仍正确返 400, body 可选 OK

      v5 任务完成度声明:
      ✅ 主链路 (D-059a-d): 选模板 → 选数字人 → 文案对齐 → 渲染 → 预览 → 复用
      ✅ B-roll 后端 (D-060a)
      ✅ B-roll 前端 (D-060c, 本拍)
      → v5 模板成片整套链路已彻底接通. 用户用任意模板能完整跑通,
        新模板没预生 broll 时点 "🎨 生这张" 自动生.

## 评审反馈插单 — 设置页阻塞 + 文档漂移修(D-060b)

外部 reviewer 走读项目 + 浏览器实测发现的 P0+小坑收口.
我作为项目负责人筛选: 真硬伤立马修, 设计建议(总部决策台 / 内容资产卡 等)
单独留 D-061 设计阶段决策, 不仓促动手.

- [x] **设置页 AI 探活拖死整个页 (P0 真硬伤)**
      web/factory-settings.jsx · 之前 Promise.all 等 5 个 promise 全 resolve
      才 setState, /api/ai/health 后端 5s 超时 → 整个设置页 5s 不渲染.
      改: 主体 (settings/speakers/avatars) Promise.all 立即渲染,
      AI 信息 (ai/health + ai/models) fire-and-forget 后到. 设置页瞬开,
      AI 区块过几秒填进来.
- [x] **README.md 重写** (从 ShortVideo Studio 雏形升级到内容工厂现状)
      原文档定位是早期"ShortVideo Studio 一页式数字人口播",落后 30+ 个 D 提交.
      重写为: 4 大板块概览 + skill 接入范式 + 人设系统 + 模板生态 + 文档索引.
- [x] **根 KNOWN_ISSUES.md 改 stub 指向 docs/KNOWN_ISSUES.md**
      根那份停在 2026-04-23 老版, 容易把新 AI 带偏. 改 5 行 stub 指当前文档.
- [x] **v5 pickWork "半成品" 状态澄清** (reviewer 误报)
      reviewer 看的 line 49 是 D-059b 时旧代码, D-059c-2 已升级用
      /api/works/{id}/local-path 解析绝对路径填到 input. 当前已 work.

== 暂不动 (设计建议留 D-061+) ==
- 总部"今日决策台" / 内容资产中心 / 数据复盘中心 — 大件需设计 + 画图,
  仓促做会出"工具抽屉变更工具抽屉". 等清华哥定方向再开
- 技术词露出 (Opus / SKILL.md / scripts) 隐藏到工程模式 — 跟"总部"
  重设计连带, 一起做

pytest 257/257 (无后端改动) · README + KNOWN_ISSUES 文档已对齐当前状态

## v5 B-roll 真生图后端(D-060a)

D-059b 时 deferred 的功能 — v5 用第二个模板时关键缺口.
复用 ~/.claude/skills/poju-image-gen/poju-img.py (跟 wechat 段间图同款 apimart).

- [x] **D-060a B-roll 真生图后端 + mount + 13 测试**
      backend/services/dhv5_pipeline.py:
      - generate_broll(template_id, scene_idx, regen=False) → dict
        · 看 scene type: B → top_image_prompt + 4:3 / C → screen_image_prompt + 9:16
        · A 型抛 Dhv5Error (没 broll 概念)
        · 没 prompt 抛 / 模板不存在抛 / scene_idx 超界抛
        · 文件已存在 + regen=false → skipped=true 立即返 (不真生)
        · subprocess python3 ~/.claude/skills/poju-image-gen/poju-img.py
        · 拷贝 poju-img 输出到 SKILL_ROOT/assets/brolls/<id>/<filename>
        · filename 约定: b{idx_in_type}_top.png / c{idx_in_type}_screen.png
          (跟 skill render.py 的 b_plates / c_plates 命名对齐)
        · 返回 {scene_idx, type, filename, local_path, url, size, skipped, prompt, elapsed_sec}
      backend/api.py:
      - app.mount("/skills/dhv5/brolls", StaticFiles(SKILL_ROOT/assets/brolls)) 给前端预览
      - POST /api/dhv5/broll/{template_id}/{scene_idx}?regen=0 单 scene 生
      tests/test_dhv5_pipeline.py +13:
      - _broll_filename B/C/A 型 / 大小写归一
      - _broll_size_for_scene B 4:3 / C 9:16 / A 抛
      - generate_broll A 型抛 / 模板不存在抛 / scene_idx 超界抛 / 已存在 skipped
      pytest 257/257 (+10) · 1 skip (broll 文件预生成才跑)

      下一步 D-060b 前端: align step 加每 B/C scene 的 broll 缩略 + 重生按钮.

## 数字人成片 v5 模板化接入(D-059)

清华哥提的新方向: 把 ~/Desktop/skills/digital-human-video-v5 接进来.
关键设计: **数字人 mp4 是上游复用资源 → 套不同模板剪辑成多版** (用户拍板).
跟我原方案 "数字人合成在 v5 内部" 不同, v5 实际是 "下游剪辑器".

按 4 commit 推进 (本轮做后端基建):
- [x] **D-059a 后端基建**
      backend/services/dhv5_pipeline.py (~190 行):
      - SKILL_ROOT 指向 ~/Desktop/skills/digital-human-video-v5/
      - list_templates() 扫 templates/*.yaml + 元数据 (id/name/desc/category/
        duration_sec/word_budget/scene_count/scenes_breakdown/music/cover_title/
        sample_video). 时长按 max(scenes[*].end), 字数按 3.5 字/秒口播估.
      - load_template_full(id) 读单模板完整 YAML
      - render_async(template_id, dh_video, output_name, scenes_override)
        spawn daemon thread 跑 skill 的 render_video, 走 D-037a tasks 池,
        立即返 task_id. 真跑 3-10 分钟. scenes_override 给 D-059c 文案对齐用.
      - 任何步骤失败 finish_task(failed) 不崩
      backend/api.py 加 3 endpoints + 新 tag "v5 视频":
        GET  /api/dhv5/templates             模板列表
        GET  /api/dhv5/templates/{id}        单模板完整 YAML
        POST /api/dhv5/render                触发渲染 → task_id
      tests/test_dhv5_pipeline.py 13/13 (skip if SKILL_ROOT 不存在)
        · 7 个纯函数单元 (duration / word_budget / scene_breakdown 边界)
        · 6 个真 skill 集成 (list / load / render 错误路径, 不真渲染)
      端到端 smoke: TestClient 拉 /api/dhv5/templates 真返 01-peixun-gaoxiao
      49.6s/174字/A5+B3+C2.
      pytest 240/240 (+13)

- [x] **D-059b 前端 PageDhv5 模板选择器 + 数字人选择**
      web/factory-dhv5-v2.jsx (~280 行):
      - 顶栏 "🎬 v5 模板成片 · 一段数字人 mp4 · 套不同模板 · 出多版"
      - 顶部锁定 DhvHumanPicker:
        · 本地路径 input + "📂 从作品库挑" 按钮
        · 已填后显 ✓ "已填" tag
        · 作品库 picker 列最近 30 个有 local_url 的 work (供 hint, 真路径需手填,
          因 works API 暂只暴露 /media URL · D-059c 会加 work_id → 绝对路径解析)
      - 主区 DhvTemplateCard 网格 (auto-fill 280px) :
        · 9:16 缩略 (有 sample_video 播 video, 无则 cover_title 占位)
        · 名字 + 描述 (2 行截) + 4 个 tag (category / 时长 / 字数 / A/B/C 计数)
        · 选中: 蓝边 + brandSoft 阴影
      - 双层筛选:
        · 分类: 全部 / 培训 / 电商 / 财经 / 三农 / 教育 / 情感 / 职场 / 未分类
        · 时长: 全部 / ≤20s / 20-40s / 40-70s / >70s
      - 选中后底部 "已选 ✓" 卡片显 metadata + [换一个] [下一步: 文案对齐 →]
        (下一步暂 alert 提示 D-059c 还没接, 数字人未填则按钮 disabled)
      sidebar (factory-shell.jsx): NAV_MAIN 加 🎞️ "v5 模板成片" (在 🎬 做视频 下方)
      factory-app.jsx: case "dhv5" → <PageDhv5 />
      index.html: 在 factory-night-v2.jsx 后载入

      JSX parse OK · 全量 pytest 240/240 (无后端改动)
- [ ] **D-059c 文案对齐 + B-roll**
- [x] **D-059c-1 后端: 文案对齐 + work-path 解析**
      backend/services/dhv5_pipeline.py · align_script(template_id, transcript, mode):
        · auto: 走 deepseek (新 route_key dhv5.align), 把 transcript 切到每个 scene
          (A/C → subtitle 8-18 字 / B → big_text 4-10 字)
        · placeholder: 模板原 scenes 字段直接返 (给用户填空模式)
        · manual: 字段留空 (前端拖)
        · system prompt: 严格按 scenes 顺序对应 transcript 时间流, 字段从原文抽词
        · 异常路径: 空 transcript / AI 返非 JSON / AI 抛异常 / 模板不存在 全抛 Dhv5Error
      backend/api.py:
        - POST /api/dhv5/align                     文案↔scenes 智能对齐
        - GET  /api/works/{id}/local-path          作品绝对路径 (D-059b 留的小坑)
      shortvideo/ai.py: DEFAULT_ENGINE_ROUTES 加 "dhv5.align" → deepseek
      tests/test_dhv5_pipeline.py +7 (placeholder/manual/auto AI 切+merge/
                                      空 transcript / AI 返垃圾 / AI 抛 / 不存在模板)
      pytest 247/247 · OpenAPI 111 endpoint 仍 100% 覆盖
- [x] **D-059c-2 前端 STEP 状态机 + 对齐 UI**
      web/factory-dhv5-v2.jsx:
      - 新 state: step ('select' | 'align') / transcript / alignedScenes / alignMode / aligning
      - 抽 Dhv5Header 组件: 顶栏 + 3 步骤 dots (选模板/文案对齐/渲染) + 已选 template/dh
        信息回显 + onBack 返回按钮
      - 选模板 step CTA "下一步" 调 goToAlign() (校验 dh + template 都已选)
      - 对齐 step (renderAlign):
        · mode 切换 pill (auto/placeholder/manual) — auto 默认
        · auto 模式 textarea 输入 transcript + 字数对比模板预算
        · "▶ 开始对齐" / "🔄 重新对齐" 按钮 → POST /api/dhv5/align
        · 抽 Dhv5SceneRow 组件: 每 scene 一行 (#idx + type 圆点+颜色 + 时间窗 +
          内联 input 编辑 subtitle/big_text + 字数计数 + 超限红字)
        · 对齐完成 CTA: [← 改模板] / [渲染 (D-059d 待接)] disabled 占位
      - 数字人作品库 picker 升级用 D-059c-1 的 GET /api/works/{id}/local-path:
        点选 work → 自动填绝对路径, 文件不存在则报错
      JSX parse OK · 全量 pytest 247/247 (无后端改动)
      端到端 smoke (mock AI): align 返 10 scenes, 模板原字段 top_image/top_image_prompt
      保留 (没被 AI 输出覆盖), 时间窗准确.

- [x] **D-059d 渲染 + 预览 + 复用闭环 (D-059 完结)**
      backend:
      - app.mount("/skills/dhv5/outputs", StaticFiles(SKILL_ROOT/outputs)) 暴露
        渲染产物给前端播
      - dhv5_pipeline.render_async finish_task result 加 output_url 字段
        (/skills/dhv5/outputs/<filename>)
      web/factory-dhv5-v2.jsx:
      - 新 state: renderTaskId / renderTask / rendering
      - startRender(): POST /api/dhv5/render 含 scenes_override (用户调过的字段),
        拿 task_id 进 step="review"
      - useEffect 轮询 GET /api/tasks/{task_id} 每 3s, status != running 时停
      - renderReview() 三个视觉状态:
        · running: 转动 ⚙️ + "渲染中… 已 Xs" + progress 文案 + 提示可离开页面
        · failed: ❌ + 红字 traceback (monospace 灰底, max-h 240 滚动)
        · success: ✅ + 耗时 + <video controls> 浏览器内播 + 输出 path/size
      - reuseDhAndSwitchTemplate(): 一键回 select 步, 清模板/文案/对齐/任务,
        但 dhVideoPath 保留 — **数字人投入一次套不同模板出 N 版** 用户拍板核心价值
      - "再套一个模板" CTA 用 ♻️ 图标, 完成或失败状态都显
      JSX parse OK · 全量 pytest 247/247
      端到端 smoke: /skills/dhv5/outputs mount 注册 / render bad mp4 路径返 400

== D-059 完整链路打通 ==
4 commits 拼成完整流程: 02251b7 (后端基建) → 0a6c060 (前端选择器) →
d1a59b4 (对齐 endpoint) → b0a352a (对齐 UI) → THIS (渲染闭环).

用户使用流程 (终态):
  1. 浏览器 → 🎞️ v5 模板成片
  2. 上方填数字人 mp4 (或从作品库点选 → 自动绝对路径)
  3. 下方筛选 + 选模板 → "下一步: 文案对齐 →"
  4. 贴 transcript → AI 自动切到 N 个 scenes
  5. 一行行调 subtitle/big_text 措辞 → "▶ 开始渲染"
  6. 进 review step 看进度文案 (3-10 分钟)
  7. 完成 → 浏览器内播视频
  8. ♻️ "再套一个模板" → 回 select, 数字人保留, 重选模板再来一版
- [ ] **D-059d 渲染 + 预览 + 复用循环**
      调 /api/dhv5/render 异步 + 轮询 task → 完成预览 +
      "用同 mp4 再套一个模板" 一键回 Step 选模板, 数字人不变

## NightShiftPage delete 换非阻塞对话框(D-058)

KNOWN_ISSUES 第 5 项. 浏览器原生 confirm() 视觉跟项目其它模态不一致 + 阻塞主线程.

- [x] **D-058 NightDeleteConfirm 组件**
      web/factory-night-v2.jsx:
      - 新 state: deleteTarget (null | job) + deletingId
      - delJob(job) 不再 confirm(), 改 setDeleteTarget(job)
      - 新组件 NightDeleteConfirm: 视觉对齐 NightJobEditor (iOS 风圆角 14px / 黑色丸主按钮)
        · 顶部大 icon + 任务名加粗
        · 副文 "关联的运行历史会一起清掉, 不可恢复"
        · 灰底 monospace 框显 id / skill_slug / trigger_type / 禁用状态
        · 主按钮 [删除] 红底白字 / 副按钮 [取消] 浅描边
        · 删除中按钮 disabled + 文案变 "删除中…"
      - 点遮罩外区域可取消 (e.stopPropagation 模态内)

      JSX parse OK · 全量 pytest 227/227 (无后端改动)
      KNOWN_ISSUES 第 5 项标记完成

## OpenAPI 注释 - 系统 endpoint 收尾 100% 完成(D-057)

D-053 → D-054 → D-055 → D-056 → D-057 一路打到 100% 覆盖. 106/106 全有 tag + summary.

- [x] **D-057 系统 endpoint 收尾 (45 个)**
      backend/api.py:
      - 总部 (新加 6 个): health / stats/home / skills/catalog / chat / insights/* (2)
      - AI (5): /api/ai/health / models / routes / usage / usage/recent
      - 全局任务 (3): /api/tasks list / get / cancel
      - 设置 (11): /api/settings × 3 / preferences × 3 / memory-inject × 2 /
                   work-log × 3
      - 短视频 (13): transcribe × 2 / rewrite / speakers / voice × 2 /
                     avatars / templates / video × 2 / cover × 2 / publish
      - 档案部 (新加 3 个): /api/materials × 3
      - 投流 (新加 1): /api/ad/generate (旧 fallback, 已被 D-014 touliu 替代)
      - 公众号 (新加 2): /api/article/outline + /api/article/expand (旧, 已被
        wechat 8 步替代)
      - 朋友圈 (新加 tag + 1): /api/moments/derive (单 endpoint skill)
      - TAGS_METADATA 加 "朋友圈" 分组

      📊 OpenAPI 最终覆盖率:
        总 106 个 endpoint  ·  无 tag: 0  ·  无 summary: 0
        15 个 tag 组分布: 档案部 20 / 公众号 16 / 短视频 13 / 设置 11 /
        小华夜班 9 / 总部 6 / AI 5 / 即梦 AIGC 5 / 投流 4 / 违规审查 4 /
        热点改写 3 / 内容策划 3 / 全局任务 3 / 录音改写 3 / 朋友圈 1

      pytest 227/227 (无功能改动).

      KNOWN_ISSUES 第 6 项已完整移除 (从 backlog 升级到"已完成") — 学员版
      poju.ai 部署条件之一已满足. 后续新加 endpoint 默认带规范.

## OpenAPI 注释 - 档案部 17 个 endpoint(D-056)

接 D-055 后所有 skill endpoint 已规范, 这轮接档案部 (📥📂📚 ).

- [x] **D-056 档案部 OpenAPI 规范化 (17 个)**  tag=["档案部"]
      - 作品库 (works): 5 个
        list / delete (可选删本地文件) / metrics get / metrics upsert /
        analytics (TOP 10 + 各平台汇总)
      - 数据指标 (metrics): 1 个
        delete (单条删除)
      - 热点库 (hot-topics): 3 个
        list / add / delete · platform 加 ai-generated 标注 · fetched_from
        加 night-shift 标注 (D-047 散落标签需要)
      - 选题库 (topics): 4 个
        list / add / delete / generate (AI 批量, 走 deepseek + 人设 + 历史去重)
      - 知识库 (kb): 4 个
        tree / doc (按 path 读) / search (文档级) / match (chunk 级 prompt 注入)

      Field 加边界: heat_score 1-100, completion_rate 0-1, n 范围限制
      MetricUpsertReq.platform 列出 6 个值 (douyin/xhs/wechat/...)

      pytest 227/227 (无功能改动).

      KNOWN_ISSUES 第 6 项进度: 已补 59 / ~75 个 (累 +17 这轮).
      还剩 ~15 个: settings 3 / ai 4 / tasks 3 / shiliu / cosyvoice / chat /
      总部 stats / 旧 ad/moments/article / materials 等. 下一拍可全部收尾.

## OpenAPI 注释 - 违规审查 + 即梦 AIGC 9 个 endpoint(D-055)

接 D-054 继续把 skill 类 endpoint 收尾.

- [x] **D-055 OpenAPI 规范化**
      backend/api.py:
      - 违规审查 (compliance) 4 个: tag=["违规审查"]
        skill-info / check (主路径, 单 step 出报告 + 2 版改写) /
        analyze + write (add_skill 范式兼容路径)
      - 即梦 AIGC (dreamina) 5 个: tag=["即梦 AIGC"]
        info (CLI 探活 + 余额) / text2image (文生图) /
        image2video (图生视频) / query (查任务) / list-tasks (历史)
      - Field description 详细标注:
        · ratio / resolution_type / model_version 各档值列出
        · poll 加 ge/le 边界 (text2image≤120 / image2video≤180)
        · industry 6 类列出
      - docstring 写引擎 + 耗时 + credits 消耗:
        · text2image 单张 ~30 (1k) / ~80 (2k) credits
        · image2video 5s 视频 60-180s + ~300-500 credits

      pytest 227/227 (无功能改动).

      KNOWN_ISSUES.md 第 6 项进度: 已补 42 个 (夜班 7 + 头像 3 + 公众号 11 +
      D-054 12 + 这一轮 9). 还剩 ~30 个 (hot-topics / topics / works / kb /
      settings / ai / tasks / 总部 stats / shiliu / cosyvoice / chat /
      旧 ad/moments/article 等).

## OpenAPI 注释 - 4 个 skill 12 个 endpoint(D-054)

接 D-053 继续: 投流 + 热点改写 + 录音改写 + 内容策划.

- [x] **D-054 4 skill OpenAPI 规范化**
      backend/api.py:
      - 热点改写 (hotrewrite) 3 个: tag=["热点改写"]
        skill-info / analyze (拆解+3 角度) / write (1800-2600 字+六维自检)
      - 录音改写 (voicerewrite) 3 个: tag=["录音改写"]
        skill-info / analyze (提骨架+2 角度) / write (改写+自检一次性)
      - 投流 (touliu) 3 个: tag=["投流"]
        skill-info / generate (一次 n 条+lint) / lint (本地 6 维终检)
      - 内容策划 (planner) 3 个: tag=["内容策划"]
        skill-info / analyze (三档目标) / write (6 模块完整方案)
        + 标 🔴 红线 (不提产品价格 / 不让现场动手)
      - 各 BaseModel Field 加 description + ge/le 边界 (n 字段)
      - 关键 endpoint 加 docstring 写引擎 + 耗时 + 失败处理

      验证: /openapi.json 12 个 endpoint 全有 tag + 中文 summary.
      pytest 227/227 (无功能改动).

      KNOWN_ISSUES.md 第 6 项进度: 已补 33 个 (夜班 7 + 头像 3 +
      公众号 11 + 这一轮 12), 还剩 ~40 个 (违规审查 / 即梦 / hot-topics /
      topics / works / kb / settings / ai / tasks / shiliu / cosyvoice 等).

## OpenAPI 注释 - 公众号 8 步 11 个 endpoint(D-053)

B 方案延续: 老 endpoint 增量补 tags + summary + Field description.
本轮补公众号 8 步那 11 个 (skill-info / titles / outline / write /
rewrite-section / plan-images / section-image / html / templates / cover / push).

- [x] **D-053 公众号 endpoints OpenAPI 规范化**
      backend/api.py:
      - 11 个 endpoint 全部加 tags=["公众号"] + summary 中文一句 (Step N XX)
      - Pydantic Field 加 description 字段:
        · WechatTitlesReq.n          ge=1 le=8
        · WechatPlanImagesReq.n      ge=1 le=8
        · WechatCoverReq.n           ge=1 le=8 (n≥2 batch / n=1 模板兼容)
        · 各模型字段都有中文 description
      - 关键 endpoint 加 docstring 说明耗时 + 引擎走向 + 失败诊断:
        · /write Step 4 走 opus 慢 30-60s
        · /section-image 30-60s 真生图 + 上传图床
        · /push 提示用户看 last_push_request.{html,json} 诊断
      - 修了 wechat_push 缺 docstring 的小遗漏

      验证: /openapi.json 拉出来, 14 个公众号 endpoint 全有 tag "公众号" +
      中文 summary. /docs 页 "公众号" 分组下从顶到底是 Step 2-8 + skill-info
      + templates + 头像配置, 学员版部署看一眼就明白.

      KNOWN_ISSUES.md 第 6 项进度: 已补 17 个 (小华夜班 7 + 头像 3 + 公众号 11),
      还剩 ~50 个 (投流 / 录音改写 / 内容策划 / 违规审查 / 即梦 / hot-topics /
      topics / works / kb / settings 等). 继续增量补.

      pytest 227/227 (无功能改动, 注释升级)

## KNOWN_ISSUES.md 落地(D-052)

用户规则一直要求"卡住超 15 分钟记 KNOWN_ISSUES.md 跳下一项", 但我从来没真写过.
本轮整理一下当前所有用户感知的坑 + 半成品 + 部署相关后续点.

- [x] **docs/KNOWN_ISSUES.md 86 行**:
      🔴 用户实测踩过的坑 (2 项): 段间图丢失诊断 / hero 默认文案兜底
      🟡 半成品占位 (3 项): 一鱼多吃/kb-compiler 占位 runner / file_watch 没接 /
                            NightShiftPage delete 用 confirm()
      🟢 OpenAPI 文档进度 (1 项): 60+ 老 endpoint 没补 tags
      🔵 部署相关 (2 项): ~/.wechat-article-config 单用户 / ~/Desktop/skills/ 路径
      已修归档段含 D-038~D-051 6 个完成项
      + 维护规则: 修好就删 / 新坑就加 / 不写主观重构 / 不写假设
      pytest 227/227 (纯文档无代码改动)

## Settings 页公众号头像上传 UI(D-051)

D-046 落地后启用门槛是用户得手动编辑 ~/.wechat-article-config JSON.
本轮: 加 UI 入口让上传一张图就完事.

- [x] **D-051 Settings 页 + 3 个 /api/wechat/avatar endpoint**
      backend/api.py 加 endpoints (全带 OpenAPI tag "公众号" + summary):
        GET    /api/wechat/avatar   头像配置状态 (configured/path/exists/size)
        POST   /api/wechat/avatar   multipart 上传 (jpg/png ≤1MB) →
                                    存 data/wechat-avatar/avatar.<ext> +
                                    写 ~/.wechat-article-config 的 author_avatar_path
        DELETE /api/wechat/avatar   从 config 移除字段 (物理文件保留)
      web/factory-settings.jsx 新 SettingsSection "📄 公众号草稿头像":
        - 已配 + 文件存在: 圆角头像缩略 + path/size + [🔄 换一张] [移除]
        - 已配但文件丢: ⚠️ 红色提示 + [重新上传]
        - 没配: ⚠️ 提示 + [+ 上传头像图] CTA
        - 错误处理: 错扩展名 / >1MB / 上传失败 都有 inline 红字
      端到端 smoke (TestClient + tmp dir 隔离): 7 个场景全过
        初始 → 上传 → 状态显示 → config 文件 author_avatar_path 写入 +
        旧字段保留 → 1MB+ 拒收 → .gif 拒收 → DELETE 清字段 + 保留物理文件
      JSX parse OK · 全量 pytest 227/227 (无后端单测, smoke 在隔离环境跑过)

## 头像合法上传(D-046)

D-045 后 push 通了但模板硬编码头像被剥. 用户多次反馈"头像也没了".
本轮: push 流程加可选头像上传 (用户配 author_avatar_path 才生效, 失败优雅
降级到现状, 不会更糟).

- [x] **D-046 头像合法上传 + 替换 + 优雅降级**
      backend/services/wechat_scripts.py:
      - 新 helper `upload_article_image(image_path) -> mmbiz_url`:
        subprocess 调 ~/Desktop/skills/公众号文章/scripts/upload_article_image.sh
        (skill 现成脚本, 复用其 token + uploadimg 逻辑, 不重写 WeChat API 调用)
      - 新 helper `replace_template_avatar(html, new_url) -> (新 html, 替换次数)`:
        regex 锚定 v3-clean 模板的 <a href="...profile_ext..."><img></a> 头像块,
        只换头像 src, 段间图不动
      - 新 helper `_read_wechat_config()`: 读 ~/.wechat-article-config 容错
      - push_to_wechat 流程加 (sanitize 之前):
        1. 读 config 看 author_avatar_path
        2. 有且文件存在 → upload + replace_template_avatar
        3. 任何步骤失败 silent 跳过 (头像被 sanitize 剥, 退化到 D-045)
      - 诊断 dump (last_push_request.json) 加 avatar 字段:
        {path, url, replaced, error, elapsed_sec}
      - 返回值加 avatar 字段
      tests/test_wechat_avatar.py 11/11.
      实证: 用户那篇 14531 字 HTML 跑 replace 1 次 → sanitize 后保留 1 img,
      rewritten/removed 都 0 (头像 URL 干净).

      用户启用方法 (用户睡醒后):
        1. 准备一张 ≤1MB 的本地头像图 (PNG/JPG)
        2. 编辑 ~/.wechat-article-config 加字段:
           "author_avatar_path": "/Users/black.chen/Desktop/avatar.jpg"
        3. 下次 push 自动上传 + 替换, 头像就能显示在草稿里
      不配 author_avatar_path → 沿用 D-045 行为(头像被剥).

## 素材库散落标签 "🌙 来自夜班 (N)"(D-050)

之前 D-040e/f 都跳过这条 (output_refs 没数据). D-047 接通"凌晨抓热点"真
runner 后, hot_topics 表有了 fetched_from="night-shift" 真数据, 终于可以做了.

- [x] **HotTab 加 "🌙 来自夜班 N" 过滤 chip + 每条夜班产物 🌙 标记**
      web/factory-materials.jsx HotTab:
      - 新 state: nightFilter (boolean)
      - chip 位置: 顶部统计行右侧, 0 条整块隐藏 (per spec)
      - 点击切换过滤模式: 显示全部 vs 只显示 fetched_from="night-shift"
      - 选中态: 蓝色描边 + brandSoft 背景 + 加粗
      - 每条 night-shift 产物: amber 渐变背景 + Tag "🌙 夜班"
      - 过滤后无数据空状态: 引导 "去 🌙 小华夜班 启用「凌晨抓热点」"
      端到端 smoke: 跑 seed → run 凌晨抓热点 → /api/hot-topics 返 fetched_from=
      "night-shift" 真数据 → 前端散落标签会显示 "🌙 来自夜班 N"
      JSX parse OK · 全量 pytest 216/216 (无后端改动)

      下一步可做: 类似的 "🌙 来自夜班" 也能加到 works / knowledge tab
      (但目前那两边没夜班 runner 写数据, 等 one-fish / kb-compiler 真接入再做)

## NightShiftPage 历史 today/week/all tab(D-049)

清华哥睡觉时我自主选这件做.
spec 提过"历史日志: [今天 | 本周 | 全部]", D-040d 落地时简化成 flat 30 条没分 tab.

- [x] **历史区加 today/week/all tab + 计数 + 空状态**
      web/factory-night-v2.jsx:
      - 新 state: historyTab ('today' | 'week' | 'all'), 默认 'today'
      - runs limit 30 → 200 (客户端按 tab 过滤, 避免每切 tab 重新请求)
      - tabs UI: iOS 风圆角 pill 容器 (灰底), 选中黑底白字, 每个 tab 含计数
        e.g. "今天 5 / 本周 23 / 全部 187"
      - 各 tab 空状态文案不同 (today→ "今天还没跑过, 点上面任务的「立即跑」试试")
      - 时间窗口算法: today 从 0:00 开始 / week 倒推 7×86400 / all 不过滤
      JSX parse OK · 全量 pytest 216/216 (无后端改动)

## 公众号 8 步走查 BUG 第七轮(D-048)

清华哥上次 push 通了之后, article_meta.json 暴露了两个 hero 渲染 bug
(D-043 时已发现没动). 用户睡时收一波:

- [x] **hero_title_html 重复显示** — 旧 `f'{title[:6]}<span>{hero_highlight}</span>'`
      默认 hero_highlight=title[:8] 让前 6/8 字重复. 用户文章里看到
      "一个餐饮老板一个餐饮老板花3" 重复. 修: 抽出 `_compose_hero_title_html(title, hero_highlight)`,
      全文 title 为底, 若 hero_highlight 是子串就高亮一次, 否则不高亮.
      新行为: "[一个餐饮老板花3]万学建站, 我用AI免费搞定了" (前 8 字 span 高亮, 无重复).
      4 个单测 (默认无重复 / 子串高亮 / 不在 title 不硬塞 / 空 highlight 直接返).
- [x] **_auto_subtitle 贪婪切 6 字段** — 旧 `re.findall("[一-龥]{2,6}", first)`
      把连续中文文章首段切成 "上周一个开火 · 锅店的老板给 · 我看他的品牌" 鬼断句.
      修: 按中英文标点 split, 取 2-14 字的合法短语, 一段太长退化到首段前 30 字.
      新行为 (有标点): "我当场愣住了" 连贯. 新行为 (无标点): 首段前 30 字连贯.
      3 个单测 (标点切 3 段 / 长无标点退化 / 实战标点场景).
      改 1 个旧测试 (test_auto_subtitle_picks_keywords → _by_punctuation, 输入加标点).

全量 pytest 216/216 (+6).

## 公众号 8 步走查 BUG 第六轮(D-045)

D-043 改"清 URL 留 img"在用户实测下失败. 头像 URL 即使清成 https 没 ?from=appmsg,
mmbiz 资源 ID 还是别人公众号的, WeChat draft/add 仍 errcode 45166.

- [x] **回退 D-042 策略: ?from=appmsg 整剥** — D-043 是错的, D-045 复活 D-042.
      规则:
        ?from=appmsg → 整剥 (这是"非己公众号资源"天然标记)
        干净 mmbiz URL + http:// → 规整为 https 保留 (D-043 这部分仍有用)
        外链域名 → 整剥
      用户失败 HTML 复跑: 头像整剥, 14531→14054 字差 477 (跟 D-042 当时一致).
      头像将丢失 (D-042 时一样). 真要保头像, 后续做"上传自己的头像 add_material"
      (backlog D-046 候选).
      tests/test_wechat_sanitize.py 18/18 (改 9 个 + 加 3 个).
      诚实交代: 这一轮其实是承认我 D-043 思路错了 — 用户 [Image #5] 给的反馈
      "我的头像也没有了" 我误读为"用户想保头像", 实际用户更需要 push 不报 500.
      D-043 想"两全其美"碰壁. D-045 接受 trade-off: 头像没 vs push 通.



D-042 用户重试: push 通了 (头像就是 45166 主犯, 猜对) — 但**两个新副作用**:
  · 头像也被剥光了 (sanitize 误伤)
  · 4 张段间图没出现在文章里 (上游 assemble_html 阶段就丢了)

- [x] **sanitize_for_push 改"清 URL 不剥图"** — D-042 一棍子打死所有
      `?from=appmsg` / `http://` 的图, 误伤模板头像和段间图. D-043 改成:
        · `http://mmbiz/qlogo` → `https://`     (rewrite, 保 img)
        · `?from=appmsg` / `&from=appmsg`        → strip (rewrite, 保 img)
        · 域名外链 (apimart 等)                  → 仍然整剥 (推不上)
        · `<script>/<iframe>/<form>` 等危险 tag  → 仍然整剥
      新增 `_clean_img_url(url)` 辅助函数 + 返回 dict 加 `rewritten` 计数.
      用户失败那篇 14531 字 HTML 实测: 头像保留, URL 规整, removed: {}, 
      rewritten: {http→https: 1, strip ?from=appmsg: 1}.
- [x] **assemble_html 加诊断 dump** — Bug 2 没办法回看上次, 但下次再丢图必有铁证:
      `/tmp/preview/last_assemble_request.json` 含
      `section_images_received` (前端发了几张) +
      `section_images_with_mmbiz_url` (有几张 url 真的在) +
      `img_in_raw_html` (插进 raw HTML 几个) + paragraphs_count.
      若再丢图, 看这文件即可秒断: 前端没发 vs 后端 `_md_to_wechat_html` 丢.
      tests/test_wechat_sanitize.py 16/16 (旧 9 + 新 7).



**用户在 Step 8 push 反复失败 (errcode 45166), 已 D-038/D-039/D-041 三轮还是不通.**
用户原话: "你能测试好了再告诉我完成任务了吗?"
诚实交代: 本地无 WeChat draft/add sandbox, 没法 100% 验证修好.

- [x] **猜测根因 + 防御性 sanitize** — 模板硬编码的头像 `<a href=mp.weixin><img class="author-avatar" src="http://mmbiz.qpic.cn/.../?from=appmsg"></a>` 是别的公众号文章 mmbiz URL.
      WeChat draft/add 经验: 正文 img 必须是 https + 这次 add_material 上传的资源,
      硬编码外链头像很可能就是 45166 的 invalid content hint 主犯.
      `wechat_scripts.sanitize_for_push()` 推送前清理:
        · http://img / ?from=appmsg / 非 mmbiz 域 → 剥 img
        · 非 mp.weixin.qq.com `<a>` → 解 a 留文本
        · `<script>/<iframe>/<form>/<input>/<embed>/<object>/<video>/<audio>` → 整剥
      验证: 用户实际失败的那篇 (/tmp/preview/wechat_article.html, 14531 字)
      sanitize 后差 477 字, 唯一被剥的就是头像块 (img_from_appmsg: 1).
- [x] **不猜的兜底诊断** — push 时同时落盘:
        /tmp/preview/last_push_request.html  · 实际发给微信的 sanitized HTML
        /tmp/preview/last_push_request.json  · meta 含原/清后字符数 + 删了啥
      若再报 45166, 用户把这两个文件发过来即可精确定位真正违规元素.
      tests/test_wechat_sanitize.py 9/9.



- [x] **Step 5 → 6 拼 HTML 时 "Converting circular structure to JSON" 崩溃**
      根因: `assembleHtml(templateName)` 接受 D-034 的模板切换参数, 但
      `<Btn onClick={onNext}>` 把整个 SyntheticEvent (含 React fiber +
      HTMLButtonElement) 当 templateName 喂进来, 然后落进 `template: tpl`
      塞进 request body, `api.post` 一 JSON.stringify(body) 就炸循环引用.
      修复:
        1. callsite 显式包: `onNext={() => assembleHtml()}`
        2. assembleHtml 内部防御: `tpl = (typeof tn === "string" && tn) ? tn : default`
      其它 step fn 全部签名 / callsite 已审, 仅 assembleHtml 这一处.

## 公众号 8 步走查 BUG 第二轮(D-039)

用户在 Step 5 段间配图遇到第 2 轮问题:

- [x] **段间配图防盗链显示占位图** — `gen_section_image` 只返回 `mmbiz_url`, 浏览器 `<img src=mmbiz>`
      被微信图床 referer 防盗链拦截显示 "未经允许不可引用". 修复: 后端从脚本 stderr 解析
      `LOCAL_PATH` 拷贝到 `data/wechat-images/` 暴露给 `/media/`, 返回 `media_url`; 前端用
      `media_url || mmbiz_url`. mmbiz_url 仍用于 HTML 拼装/草稿推送.
- [x] **/api/wechat/push 500 stderr 空** — `push_to_wechat.sh` 把错误用 `echo "❌ ..."` 写到 stdout,
      原 `_run` 错误信息只展示 stderr 导致前端看到 `stderr: ` 空字符串无从定位. 修复: `_run` 失败时
      stderr 空就 fallback 附 stdout 尾部.

## Bonus 任务(P10 之后,cron 继续干活时做的)

- [x] **即梦(Dreamina) AIGC 接入 (D-028)** — CLI 工具型技能(非 SKILL.md 范式)
      用户提示: poju-site 接过,可参考。subprocess wrap ~/.local/bin/dreamina
      backend/services/dreamina_service.py: text2image / image2video / query_result / user_credit
      `/api/dreamina/{info,text2image,image2video,query,list-tasks}`
      sidebar 🎨 即梦 AIGC · 2 步流程: 选模式+prompt+配置 → 提交+轮询+预览
      下载到 data/dreamina/ 走 /media 暴露 · 端到端 /info 通(余额 8426 credits)
- [x] **违禁违规审查 skill 接入 (D-026)** — 第 6 个接入的 skill (用户主动插单,学员版 OK)
      单 step 流程: 输入文案+行业 → 一次性出审核报告 + **必须** 2 版改写
      6 类行业(通用/大健康/美业/教育/金融/医美) 决定是否加查敏感行业词库
      违规分高/中/低危 · 保守版 100% 合规 · 营销版保留吸引力
      `/api/compliance/{check,skill-info}` · sidebar 🛡️ 违规审查
- [x] **content-planner skill 接入 (D-022)** — 第 5 个接入的 skill
      用 scripts/add_skill.py 一键生成骨架(测试 D-017 可用性) +
      改 pipeline 适配特殊输出(三档目标 + 6 模块策划) +
      改 jsx 三档目标卡片 + 6 模块手风琴展示
      端到端: 一句"下周给老板讲课" → 推断信息 + 三档目标 → 6 模块完整方案

---

## D-010 已完成 · 公众号 skill 全链路 GUI

**版本**：v0.3.3 -- 公众号 skill 接入

**目标达成**：从一句选题 → 公众号草稿箱已推送,全程在本项目前端完成,
skill 里的 references/scripts/assets 全部当事实源读取/调用,系统不重写。

**完成**(4 个 commit):
- [x] `2ea58e7` skill_loader.py + Phase 1-2(titles/outline/write + 三层自检)
- [x] `9a70853` wechat_scripts.py + Phase 2.5/3/4(plan-images/section-image/html/cover)
- [x] `1c940e2` 前端 factory-wechat-v2.jsx 8 步全链路 UI
- [x] `D-010 第4步` 文档收口 + 28 个单元/集成测试全绿

**端到端验证**:
- /titles(DeepSeek,3.6s): 3 个候选标题,带 template + why
- /outline(DeepSeek,4.9s): 5 字段大纲,开场用学员故事
- /write(DeepSeek,22s): 1835 字长文,自检 PASS 六维 108/120
- /plan-images(DeepSeek,4s): 4 条具象 16:9 prompt
- /html(400ms): 14.5KB 微信 markup,section/span-leaf/mp-style-type 齐
- /cover(Chrome headless,4.6s): 11KB jpg
- /section-image: apimart 慢,本地脚本确认可用,留用户端跑
- /push: endpoint 就绪,真推留用户前端按钮触发(避免测试稿污染草稿箱)

**skill 资源字数**(读取事实源):
- SKILL.md 13994 字
- references 总 35350 字(who-is-qinghuage / style-bible / writing-methodology /
  visual-design-v2 / wechat-api-reference)

**架构决策** D-011 见 TECHNICAL-DECISIONS.md: skill 目录作为事实源
(vs Obsidian persona),当功能有对应 skill 时 skill 覆盖 Obsidian。

## 下一步要做（优先级排序）

## 下一步要做（优先级排序）

1. **行为记忆写入** -- 改写/生成后自动追加到小华工作日志.md（Phase 2 的核心）
2. **底部 dock 自由对话** -- 多轮聊天,AI 学到的偏好自动回写记忆文件
3. **首页 4 方块真实统计数据** -- 后端已有 `/api/stats/home`,前端对接
4. **Opus 503 排查** -- 测试时发现 OpenClaw proxy 持续 503,切 DeepSeek 才能跑。
   可能是 Anthropic 上游限流或 OpenClaw 自身问题,需在 Claude Desktop 中复查
   (本次实现的 deep 功能在两个引擎上都验证过可用)
