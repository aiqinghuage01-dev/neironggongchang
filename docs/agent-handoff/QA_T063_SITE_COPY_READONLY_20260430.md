# QA Report

## 任务 ID

T-063

## 测试对象

- 任务: T-062 全站文案清理独立只读复测
- 角色: NRG QA 自动
- 分支: `codex/qa`
- main commit: `c0d3dab docs: queue site copy qa and review`
- QA 同步 commit: `a2aeb42 Merge branch 'main' into codex/qa`
- T-062 交接: `docs/agent-handoff/CONTROLLER_T062_SITE_COPY_SWEEP_20260430.md`
- 页面: `home,strategy,make,wechat,moments,write,ad,hotrewrite,voicerewrite,baokuan,planner,compliance,image,imagegen,dreamina,beta,materials,works,knowledge,nightshift,settings`

## 执行边界

- 只使用当前已运行的 `http://127.0.0.1:8000` 和 `http://127.0.0.1:8001`。
- 未执行 kill / stop / restart / uvicorn / `scripts/start_api.sh` / `scripts/start_web.sh`。
- 未调用 `/api/health` 做环境门禁。
- 未点击任何生成、提交、发布、上传类按钮。
- 未提交任何生成任务, 未消耗 credits。

端口进程前后保持不变:

- `8001`: PID `61343`, started `Thu Apr 30 03:08:08 2026`, command `scripts/start_web_nocache.py 8001`
- `8000`: PID `79387`, started `Thu Apr 30 03:12:23 2026`, command `.venv/bin/uvicorn backend.api:app --host 127.0.0.1 --port 8000 --log-level info`

## 真实操作

- 打开 21 个 `http://127.0.0.1:8001/?page=<page>` 路由页面。
- 每页点击空白区域 `360,240`。
- 对第一个可见且可编辑文本框填入 `QA只读检查，不提交生成`; 不按回车, 不点提交。
- 每页等待 DOM / 网络稳定, 滚动 520px, 截图并扫描 `body.innerText` 和可见表单占位/标签文案。

## 证据

- 严格扫描结果 JSON: `/tmp/_ui_shots/t063_site_copy_readonly_20260430/results.json`
- 严格扫描截图目录: `/tmp/_ui_shots/t063_site_copy_readonly_20260430/`
- 截图:
  - `/tmp/_ui_shots/t063_site_copy_readonly_20260430/home.png`
  - `/tmp/_ui_shots/t063_site_copy_readonly_20260430/strategy.png`
  - `/tmp/_ui_shots/t063_site_copy_readonly_20260430/make.png`
  - `/tmp/_ui_shots/t063_site_copy_readonly_20260430/wechat.png`
  - `/tmp/_ui_shots/t063_site_copy_readonly_20260430/moments.png`
  - `/tmp/_ui_shots/t063_site_copy_readonly_20260430/write.png`
  - `/tmp/_ui_shots/t063_site_copy_readonly_20260430/ad.png`
  - `/tmp/_ui_shots/t063_site_copy_readonly_20260430/hotrewrite.png`
  - `/tmp/_ui_shots/t063_site_copy_readonly_20260430/voicerewrite.png`
  - `/tmp/_ui_shots/t063_site_copy_readonly_20260430/baokuan.png`
  - `/tmp/_ui_shots/t063_site_copy_readonly_20260430/planner.png`
  - `/tmp/_ui_shots/t063_site_copy_readonly_20260430/compliance.png`
  - `/tmp/_ui_shots/t063_site_copy_readonly_20260430/image.png`
  - `/tmp/_ui_shots/t063_site_copy_readonly_20260430/imagegen.png`
  - `/tmp/_ui_shots/t063_site_copy_readonly_20260430/dreamina.png`
  - `/tmp/_ui_shots/t063_site_copy_readonly_20260430/beta.png`
  - `/tmp/_ui_shots/t063_site_copy_readonly_20260430/materials.png`
  - `/tmp/_ui_shots/t063_site_copy_readonly_20260430/works.png`
  - `/tmp/_ui_shots/t063_site_copy_readonly_20260430/knowledge.png`
  - `/tmp/_ui_shots/t063_site_copy_readonly_20260430/nightshift.png`
  - `/tmp/_ui_shots/t063_site_copy_readonly_20260430/settings.png`

严格扫描汇总:

- 页面: `21`
- 通过页面: `20`
- 禁止词命中: `1`
- console error: `0`
- pageerror: `0`
- requestfailed: `0`
- HTTP >= 400: `0`
- 非 GET 请求: `0`
- 生成/提交类请求: `0`
- console warning: `21`, 均为本地开发模式浏览器提示, 未计入失败。
- console info: `21`, 均为 React DevTools 提示, 未计入失败。

命中明细:

- 页面: `knowledge`
- 禁止词: `prompt`
- 可见文案片段: `04/30 📄 index 29KB · 04/28 📄 persona-prompt 2KB · 04/24 📄 人设定位与表达边界 5KB · 04/05 📄`
- 证据截图: `/tmp/_ui_shots/t063_site_copy_readonly_20260430/knowledge.png`

静态检查 / smoke:

- `git diff --check` -> clean。
- `node scripts/e2e_pages_smoke.js /tmp/_ui_shots/t063_site_copy_smoke_20260430` -> `16/16 pages OK`, errors `0`。
- smoke 截图目录: `/tmp/_ui_shots/t063_site_copy_smoke_20260430/`

## Credits / 外部服务

- 是否真烧: 否。
- 测试规格: 只读页面覆盖 + 可见文案扫描。
- 输入参数: `QA只读检查，不提交生成`, 仅填入可编辑文本框, 未提交。
- task id / 作品 id: 无。
- 实际消耗: 未消耗 credits。
- 是否重复提交: 否。

## 结果

不通过。

## 发现的问题

知识库页面用户可见文件名 `persona-prompt` 触发 T-063 明确禁止词 `prompt`。其余 20 个页面禁止词命中为 0, console error/pageerror/requestfailed/http>=400 均为 0。

## 复现步骤

1. 在 `codex/qa` 合入 main commit `c0d3dab`。
2. 不调用 `/api/health`, 不启停 8000/8001。
3. Playwright 依次打开 21 个目标路由, 每页点击空白、填入只读 QA 文案、滚动、截图。
4. 扫描可见正文和可见表单占位/标签中的禁止词。
5. 观察 `knowledge` 页面命中 `persona-prompt`。

## 下一步建议

交给总控返修知识库页面的文件名展示脱敏, 至少把用户可见的 `prompt` 文件名转成业务友好名称或隐藏内部文件名。返修后重新入队做 T-063 同口径只读复测。

## 是否需要老板确认

否。
