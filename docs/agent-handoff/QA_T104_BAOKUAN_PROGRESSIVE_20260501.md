# QA Report

## 任务 ID

T-104

## 测试对象

- 依赖任务: T-098 爆款改写实时输出
- 被测 worktree: `/Users/black.chen/Desktop/nrg-worktrees/content-dev`
- 被测分支: `codex/content-dev`
- 被测代码提交: `c9ded74` (`feat: stream baokuan versions progressively`)
- 当前 content-dev HEAD: `9353869`，仅比 `c9ded74` 多 T-098 报告修正文档
- 页面: `http://127.0.0.1:18098/?page=baokuan`
- QA worktree: `/Users/black.chen/Desktop/nrg-worktrees/qa` (`codex/qa`)

## 真实操作

- 打开: `http://127.0.0.1:18098/?page=baokuan`
- 输入:
  - 原爆款长文案，包含“成交顺序”等真实正文
  - 行业: `餐饮老板`
  - 转化动作: `加微信`
- 点击:
  - `全都要 · 4 版`
  - `分析爆款基因`
- 等待:
  - running V1: `已完成 1/4`, V1 正文先展示
  - running V2: `已完成 2/4`, V1/V2 同时可读
  - slow V4: `正在写第 4/4 版`, 显示已等时间、慢版本说明和取消入口
  - ok: 4 个版本正常展示
  - failed partial: V4 失败时保留 V1/V2/V3
  - 390px viewport: 检查顶部、步骤条、正文卡片和横向溢出

## 证据

- 截图:
  - `/tmp/_ui_shots/t098_baokuan_running_v1.png`
  - `/tmp/_ui_shots/t098_baokuan_running_v2.png`
  - `/tmp/_ui_shots/t098_baokuan_slow_v4.png`
  - `/tmp/_ui_shots/t098_baokuan_done.png`
  - `/tmp/_ui_shots/t098_baokuan_failed_partial.png`
  - `/tmp/_ui_shots/t098_baokuan_mobile_390.png`
- 浏览器错误统计:
  - running-slow-ok: console error `0`, pageerror `0`, requestfailed `0`, http>=400 `0`
  - failed-partial: console error `0`, pageerror `0`, requestfailed `0`, http>=400 `0`
  - mobile 390px: `assertClean` 通过，console/pageerror/requestfailed/http>=400 均未触发
- Playwright:
  - `APP_URL='http://127.0.0.1:18098/?page=baokuan' node scripts/e2e_baokuan_progressive.js`
  - 结果: `ok=true`, states=`["v1","v2","slow","ok"]`, failed states=`["failed"]`
  - 390px: `maxOverflow=0`, `bodyScrollWidth=390`, `rootScrollWidth=390`
- pytest:
  - `/Users/black.chen/Desktop/neironggongchang/.venv/bin/python -m pytest -q tests/test_baokuan_progressive.py tests/test_tasks_api.py tests/test_hotrewrite_versions.py tests/test_compliance_progressive.py`
  - 结果: `20 passed`
- 静态页面 curl:
  - `curl -s -o /tmp/t104_baokuan_page.html -w '%{http_code}\n' 'http://127.0.0.1:18098/?page=baokuan'` -> `200`
- 语法检查:
  - `node --check scripts/e2e_baokuan_progressive.js` -> pass

## Credits / 外部服务

- 是否真烧: 否
- 测试规格: no-credit / Playwright route mock / 靶向 pytest
- 输入参数: 爆款改写 `all` 模式 4 版 mock；真实填表但不调用 LLM
- task id / 作品 id:
  - `t098-baokuan-progressive`
  - `t098-baokuan-failed`
  - `t098-baokuan-mobile`
- 实际消耗: 0
- 是否重复提交: 否

## 结果

通过。

验收点逐项结果:

- running 中已完成版本先展示: 通过。V1 完成时正文可读，V2 完成时 V1/V2 同屏可读。
- 慢版本可解释: 通过。V4 慢时展示“正在写第 4/4 版”、已等时间、慢等待说明和取消剩余生成入口。
- failed 保留: 通过。failed 后 V1/V2/V3 保留并可读，没有被错误清空。
- ok 结果正常: 通过。最终 4 个版本均展示，V4 正文可见。
- 390px 不裁切: 通过。`maxOverflow=0`，截图人工查看顶部标题、步骤条和卡片未裁切。
- 可见文本无内部词: 通过。页面 body 扫描未命中 `已走技能 / 需要进一步操作吗 / prompt / tokens / API / route / model / provider / submit_id / /Users`。
- 浏览器错误: 通过。console/pageerror/requestfailed/http>=400 全部为 0。

## 发现的问题

无阻塞问题。

说明: 本轮按任务说明默认 no-credit，没有跑真实 LLM。T-098 会把 `all` 模式从旧的一次生成变成最多 4 次逐版生成；如后续要测真实扣费链路，建议单独开额度确认任务。

## 复现步骤

1. 在 `/Users/black.chen/Desktop/nrg-worktrees/content-dev` 启动静态服务: `python3 scripts/start_web_nocache.py 18098`。
2. 运行: `APP_URL='http://127.0.0.1:18098/?page=baokuan' node scripts/e2e_baokuan_progressive.js`。
3. 核对输出 `ok=true`、两组场景错误计数均为 0、390px `maxOverflow=0`。
4. 打开 `/tmp/_ui_shots/t098_baokuan_*.png` 截图核对 running、slow、ok、failed、mobile 状态。
5. 运行靶向回归: `/Users/black.chen/Desktop/neironggongchang/.venv/bin/python -m pytest -q tests/test_baokuan_progressive.py tests/test_tasks_api.py tests/test_hotrewrite_versions.py tests/test_compliance_progressive.py`。

## 下一步建议

T-104 可关闭。等待对应只读审查通过后，由总控决定是否合入 T-098。

## 是否需要老板确认

否。
