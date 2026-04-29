# QA Report

## 任务 ID

T-048

## 测试对象

- Agent: NRG QA 自动
- 测试时间: 2026-04-30 04:14-04:25
- 浏览器对象: 正式端口 `http://127.0.0.1:8001`
- 后端对象: 正式端口 `http://127.0.0.1:8000`
- 运行来源:
  - API PID 1140, cwd `/Users/black.chen/Desktop/neironggongchang`
  - Web PID 61343, cwd `/Users/black.chen/Desktop/neironggongchang/web`
  - main HEAD `c0d3dab` plus 当前主目录未提交总控返修改动
- 已读开发报告:
  - T-046: `/Users/black.chen/Desktop/nrg-worktrees/content-dev/docs/agent-handoff/DEV_CONTENT_T046_SITE_OPT_20260430.md`
  - T-047: `docs/agent-handoff/DEV_MEDIA_T047_SITE_OPT_20260430.md`
  - T-050/T-051: 共享队列、收件箱、worktree 搜索均未发现对应已完成开发报告。

## 真实操作

- 首页: 打开 `/`, 点击侧栏/作品库入口, 回到首页。
- 写文案目录: 打开 `?page=write`, 点击进入投流文案。
- 内容核心页: 打开并填写 `?page=ad`, `?page=wechat`, `?page=hotrewrite`, `?page=voicerewrite`; 只填表, 未点击生成。
- 媒体资产页: 打开 `?page=image`, 点击即梦入口, 再打开并填写 `?page=imagegen`; 只填表, 未点击出图。
- 作品库: 打开 `?page=works`, 切换图片 tab。
- 素材库: 打开 `?page=materials`, 搜索框输入“课堂”。

## 证据

- 浏览器截图:
  - `/tmp/_ui_shots/t048_site_opt_regression_20260430/01_home_nav.png`
  - `/tmp/_ui_shots/t048_site_opt_regression_20260430/02_write_directory.png`
  - `/tmp/_ui_shots/t048_site_opt_regression_20260430/03_touliu_core.png`
  - `/tmp/_ui_shots/t048_site_opt_regression_20260430/04_wechat_core.png`
  - `/tmp/_ui_shots/t048_site_opt_regression_20260430/05_hotrewrite_core.png`
  - `/tmp/_ui_shots/t048_site_opt_regression_20260430/06_media_asset_core.png`
  - `/tmp/_ui_shots/t048_site_opt_regression_20260430/07_works_library.png`
  - `/tmp/_ui_shots/t048_site_opt_regression_20260430/08_materials_library.png`
  - 已逐张打开截图视觉确认。
- 浏览器汇总:
  - `/tmp/_ui_shots/t048_site_opt_regression_20260430/summary.json`
  - 8 个核心流 `fatal=0`, `consoleErrors=0`, `pageErrors=0`, `requestFailed=0`, `httpErrors=0`
  - 本机路径/内部错误/媒体技术词通用扫描命中 0。
- T-046 口径补扫:
  - `/tmp/_ui_shots/t048_site_opt_regression_20260430/content_forbidden_scan.json`
  - `/tmp/_ui_shots/t048_site_opt_regression_20260430/content_attr_forbidden_scan.json`
  - 命中项见“发现的问题”。
- curl:
  - `GET /api/health` -> HTTP 200, `ok=true`; `ai.ok=false` 为 Opus/OpenClaw timeout, `cosyvoice.ok=false`; 本轮未依赖生成。
  - `GET /api/stats/home` -> HTTP 200, 首页统计返回。
  - `GET /api/tasks/counts` -> HTTP 200, `active=0`, `running=0`。
  - `GET /api/material-lib/categories` -> HTTP 200, `source_label=临时素材源`, 返回 8 类。
  - `GET /api/material-lib/featured?limit=6` -> HTTP 200, 返回 6 条精选素材。
  - `GET /api/works?limit=5&since=all` -> HTTP 200, 返回 5 条作品。
- pytest:
  - 在 `/Users/black.chen/Desktop/neironggongchang` 运行:
    `/Users/black.chen/Desktop/neironggongchang/.venv/bin/pytest -q --disable-warnings tests/test_pipelines.py tests/test_hotrewrite_versions.py tests/test_compliance_fail_fast.py tests/test_works_api.py tests/test_materials_lib_api.py tests/test_tasks_api.py tests/test_kb_display.py`
  - exit 0。
  - collect-only 计数: 113 tests。

## Credits / 外部服务

- 是否真烧: 否。
- 测试规格: 只打开页面、点击导航/切换 tab、填写表单; 未点击投流生成、公众号生成、出图、即梦、数字人提交。
- 实际消耗: 无生成 credits 消耗。
- 是否重复提交: 否。

## 结果

不通过。

运行稳定性通过: 页面交互无 JS 错误、无 pageerror、无 requestfailed、关键 API 均 HTTP 200, targeted pytest 通过。

验收不通过: T-046 开发报告明确写了内容生产区要移除 `URL/ASR/HTML` 等用户可见技术词, 但正式端口仍可见这些词。

## 发现的问题

1. P1 - 公众号页仍显示 `HTML`
   - 页面: `http://127.0.0.1:8001/?page=wechat`
   - 位置: 顶部 8 步进度条第 6 步显示 `HTML`
   - 截图: `/tmp/_ui_shots/t048_site_opt_regression_20260430/04_wechat_core.png`, `/tmp/_ui_shots/t048_site_opt_regression_20260430/10_attr_scan_wechat.png`
   - 扫描证据: `content_attr_forbidden_scan.json` 命中 `HTML`
   - 对应报告承诺: T-046 写明“公众号步骤文案移除 Opus/apimart/HTML/markup/token/API 等用户可见词”。

2. P1 - 录音改写页仍显示 `URL` / `ASR` / 内部 D 编号
   - 页面: `http://127.0.0.1:8001/?page=voicerewrite`
   - 位置:
     - 输入框 placeholder: `抖音 / 视频号 / 小红书 等短视频 URL`
     - 提示文案: `走轻抖 ASR`
     - 提示文案: `待后端 ASR 接入 (D-062bb-ext)`
   - 截图: `/tmp/_ui_shots/t048_site_opt_regression_20260430/05_hotrewrite_core.png`, `/tmp/_ui_shots/t048_site_opt_regression_20260430/10_attr_scan_voicerewrite.png`
   - 扫描证据: `content_attr_forbidden_scan.json` 命中 `URL`, `ASR`, `D-code`
   - 对应报告承诺: T-046 写明“录音改写移除 URL/ASR/textarea 等用户可见词”。

## 复现步骤

1. 打开 `http://127.0.0.1:8001/?page=wechat`。
2. 查看顶部步骤条, 第 6 步仍为 `HTML`。
3. 打开 `http://127.0.0.1:8001/?page=voicerewrite`。
4. 查看短视频链接输入框和下方说明, 仍可见 `URL`, `ASR`, `D-062bb-ext`。

## 下一步建议

- 交给内容开发或总控返修, 将 T-046 的内容页文案清理真正落到正式端口/主线:
  - `HTML` -> “排版”
  - `URL` -> “链接”
  - `ASR` -> “自动转写”
  - `D-062bb-ext` -> 删除或改为“稍后支持本地音频上传”
- 返修后只需做 no-credit 回归: `wechat` + `voicerewrite` 可见文本/placeholder 扫描, 再抽查 `ad/hotrewrite/write`。

## 是否需要老板确认

否。属于已承诺体验清理未落地, 不需要老板做业务选择。
