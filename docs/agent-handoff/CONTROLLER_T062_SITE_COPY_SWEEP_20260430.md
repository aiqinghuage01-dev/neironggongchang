# 总控交接: T-062 全站可见文案二轮清理

时间: 2026-04-30 03:36
角色: 总控 Agent

## 背景

T-061 独立 QA 通过后, 总控继续跑全站可见文案扫描。21 个路由页面 console/http 均正常, 只剩两处用户可见工程词:

- 首页卡片: `即梦 AIGC`
- 写文案页统计: `AI token`

## 修改

- `web/factory-home.jsx`
  - `6 个 AI 工具` -> `6 个写作工具`
  - `即梦 AIGC` -> `即梦图片视频`
  - `2 个引擎按场景选` -> `2 种方式按场景选`
- `web/factory-write.jsx`
  - `用 AI 帮你产出文案` -> `让小华帮你产出文案`
  - `来自 6 个 AI 工具` -> `来自 6 个写作工具`
  - `AI token` -> `今日用量`
  - 最近文案卡不再展示 `token`

## 验证

- `git diff --check` 通过。
- 针对性 Playwright:
  - 页面: `home`, `write`
  - 扫描词: `AIGC`, `AI token`, `token`, `tokens`
  - 结果: 命中 0, console/pageerror/requestfailed/http error 均 0
  - 截图: `/tmp/_ui_shots/t062_fix_home.png`, `/tmp/_ui_shots/t062_fix_write.png`
- 全站 Playwright:
  - 页面: `home/strategy/make/wechat/moments/write/ad/hotrewrite/voicerewrite/baokuan/planner/compliance/image/imagegen/dreamina/beta/materials/works/knowledge/nightshift/settings`
  - 扫描词: `/Users`, `/private`, `API`, `LLM`, `prompt`, `token(s)`, `credits`, `task_id`, `submit_id`, `traceback`, `Pydantic`, `provider`, `watcher`, `daemon`, `Opus`, `DeepSeek`, `AIGC`, `CLI`, `ffmpeg`, `PIL`, `transcript`, `scenes`, `Downloads`, `404/500/502/503/504`
  - 结果: 21/21 页面命中 0, console/pageerror/requestfailed/http error 均 0
  - 截图: `/tmp/_ui_shots/t062_site_scan_after_*.png`

## Credits / 外部服务

- 只读页面扫描, 未提交任何生成任务, 未消耗 credits。

## 结论

通过。本轮只改用户可见文案, 未改后端/API/数据模型。
