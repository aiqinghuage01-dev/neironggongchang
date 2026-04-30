# 总控交接: T-068 全站常驻小华浮层

时间: 2026-04-30
角色: 总控 Agent
分支: `main`

## 背景

老板反馈右下角悬浮小华只在几个页面有, 要求全站一直都有。

## 根因

`LiDock` 原先由各页面自己手动挂载:

- 首页、做视频、写文案、出图片、作品库、知识库、设置、旧素材库等页面有。
- 公众号、投流、朋友圈、热点改写、录音改写、素材库 v2、即梦、beta 等页面没有。

这种模式导致新页面只要忘记写 `<LiDock />`, 小华就消失。

## 本次改动

- `web/factory-app.jsx`
  - 在顶层 `FactoryApp` 统一挂载一个 `<LiDock context={pageContext} />`。
  - 增加 `PAGE_CONTEXT_LABELS`, 覆盖当前 23 个路由页面, 切页后小华标题自动变成当前页面上下文。

- 多个页面组件
  - 删除页面内单独挂载的 `<LiDock />`, 避免全站统一挂载后出现两个小华按钮。

- `tests/test_lidock_global_static.py`
  - 新增静态回归: 全站只能从 `factory-app.jsx` 挂载 1 个小华, 其他页面不允许再手动挂。
  - 检查所有路由都有小华上下文。

## 验证

- `git diff --check` -> clean。
- `.venv/bin/pytest -q tests/test_lidock_global_static.py tests/test_lidock_tools.py tests/test_chat_dock.py` -> 37 passed。
- `.venv/bin/pytest -q -x` -> passed, 仅本机缺失 dhv5 skill 用例按既有规则 skip。
- Playwright 全站 23 页真实浏览器验证:
  - 结果: `/tmp/_ui_shots/lidock_global_20260430_spa/summary.json`
  - 每页打开后点击右下角小华, `buttonCount=1`, `openButtonCount=1`, 上下文标题正确。
  - page count: 23
  - failures: 0
  - consoleErrors/pageErrors/requestFailed/httpErrors/nonGet: 0
  - 截图: `/tmp/_ui_shots/lidock_global_20260430_spa/01_home.png`, `04_ad.png`, `05_wechat.png`, `15_dreamina.png`, `17_beta.png`, `18_materials.png`, `21_knowledge.png`, `23_settings.png`

## 结论

小华已改成全站常驻, 且全站只有一个实例。后续新增页面只要接入 `FactoryApp` 路由, 小华会自动出现。
