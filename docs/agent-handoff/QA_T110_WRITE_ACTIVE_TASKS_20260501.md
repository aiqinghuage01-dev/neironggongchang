# QA Report

## 任务 ID

T-110

## 测试对象

- 功能: T-101 写文案首页进行中任务摘要
- 验证代码: 主工作区 `main@bd0eaebe53beb303f55501ee297338fe98665d0a`
- 开发来源: `codex/content-dev@019f680239b24103f1b54e7f03058c4cfcad5e50`
- 页面: `http://127.0.0.1:8001/?page=write`
- 说明: QA 分支仅提交本报告; 未改业务代码。

## 真实操作

- 打开正式端口写文案首页。
- no-credit mock 三类状态:
  - 空任务列表: 确认不展示「正在写 / 可继续」摘要区。
  - 进行中/失败任务列表: 确认展示热点改写、违规审查、爆款改写、投流文案摘要。
  - 390px 窄屏: 确认任务摘要卡片无横向裁切。
- 点击首页摘要入口并恢复:
  - 热点改写: 点击「继续看进度」, 跳到 `?page=hotrewrite`, 写入 `task:hotrewrite`。
  - 违规审查: 点击「回去处理」, 跳到 `?page=compliance`, 写入 `task:compliance`。
  - 爆款改写: 点击「继续看进度」, 跳到 `?page=baokuan`, 写入 `task:baokuan`。
  - 投流文案: 点击「回去处理」, 跳到 `?page=ad`, 写入 `task:touliu`。
  - 录音改写: 点击「继续看进度」, 跳到 `?page=voicerewrite`, 写入 `task:voicerewrite`。
  - 内容策划: 点击「继续看进度」, 跳到 `?page=planner`, 写入 `task:planner`。
  - 公众号长文: 点击「继续看进度」, 跳到 `?page=wechat`, 写入 `task:wechat:write`。
- 打开真实后端数据的写文案首页, 不 mock 接口, 确认真实 GET 集成无浏览器错误。
- 输入: 无业务生成输入; 仅使用 mock 任务数据, 未点击任何生成提交按钮。

## 证据

- 截图已读:
  - `/tmp/_ui_shots/t101_write_no_active_tasks.png`
  - `/tmp/_ui_shots/t101_write_active_tasks.png`
  - `/tmp/_ui_shots/t101_write_active_tasks_390.png`
  - `/tmp/_ui_shots/t101_resume_hotrewrite.png`
  - `/tmp/_ui_shots/t101_resume_compliance.png`
  - `/tmp/_ui_shots/t101_resume_baokuan.png`
  - `/tmp/_ui_shots/t101_resume_touliu.png`
  - `/tmp/_ui_shots/t110_resume_voicerewrite.png`
  - `/tmp/_ui_shots/t110_resume_planner.png`
  - `/tmp/_ui_shots/t110_resume_wechat.png`
  - `/tmp/_ui_shots/t110_write_live_real_api.png`
- Playwright:
  - `APP_URL='http://127.0.0.1:8001/?page=write' node scripts/e2e_write_active_tasks.js` -> pass
  - scenarios `no-task`, `summary-resume`, `mobile`: `consoleErrors=0`, `pageErrors=0`, `failedRequests=0`, `httpErrors=0`, `nonGetApiRequests=0`
  - mobile: `innerWidth=390`, `maxOverflow=0`, `bodyScrollWidth=390`, `rootScrollWidth=390`
  - 补充回跳覆盖 `voicerewrite/planner/wechat`: 3/3 pass, 上述 5 类错误统计全 0, `nonGetApiRequests=0`
  - 真实接口页面 smoke: pass, `forbiddenHit=null`, 上述 5 类错误统计全 0
- 内部词扫描:
  - mock payload 含 `prompt/tokens/API/model/provider/kind/task_id//Users`, 写文案首页可见文本命中 0。
  - 真实接口页面可见文本命中 0。
  - 扫描词: `/Users`, `/private`, `prompt`, `tokens`, `API`, `model`, `provider`, `kind`, `task_id`
- curl:
  - `GET /api/health` -> `200`
  - `GET /api/tasks?limit=5` -> `200`
  - `GET ?page=write` -> `200`
- pytest / 静态:
  - `node --check scripts/e2e_write_active_tasks.js` -> pass
  - `python3 -m pytest -q tests/test_frontend_copy_static.py` -> `9 passed`

## Credits / 外部服务

- 是否真烧: 否
- 测试规格: no-credit; 只读 GET + Playwright route mock
- 输入参数: 无真实生成输入
- task id / 作品 id: 无真实新任务; mock task id 为 `t101-*` / `t110-*`
- 实际消耗: 0
- 是否重复提交: 否

## 结果

通过。

## 发现的问题

无。

## 复现步骤

1. 确认正式端口 `8000/8001` 可访问。
2. 在主工作区运行 `APP_URL='http://127.0.0.1:8001/?page=write' node scripts/e2e_write_active_tasks.js`。
3. 运行补充 Playwright 回跳脚本, 覆盖 `voicerewrite/planner/wechat` 三类摘要入口。
4. 打开真实接口写文案首页, 扫描可见文本和浏览器错误统计。
5. 查看 `/tmp/_ui_shots/` 对应截图。

## 下一步建议

T-111 继续做代码审查即可; T-101 当前 QA 不阻塞。

## 是否需要老板确认

否。
