# 总控交接: T-063/T-064 文案漏网返修

时间: 2026-04-30  
角色: 总控 Agent  
范围: T-063 QA blocked + T-064 Review P1/P2

## 背景

- T-063 QA 严格只读扫描不通过: 知识库页面可见 `persona-prompt`, 命中禁止词 `prompt`。
- T-064 审查无 P0, 但指出失败的即梦任务卡仍可能露 `id:` / `submit_id` / `watcher`, 另有首页即梦命名口径和健康检查默认行为测试缺口。

## 本次修复

- 知识库接口新增展示字段:
  - `display_title`
  - `display_path`
  - `display_name`
  - `display_section`
  - `display_subsection`
- 前端知识库只显示展示字段, 保留真实 `path/title` 给读取原文用。
- 将 `persona-prompt`、`OpenClaw`、`AI清华哥`、`AI协作`、`Promptflow` 等用户可见名称转成业务友好名称。
- 各内容工具顶部徽章从 `用技能:<slug>` 改成 `方法已加载`, 并移除本机方法库路径 tooltip。
- 热点页 `textarea` 提示改为用户话。
- 全站错误卡清理 `prompt/apimart/server log/JSON/quota` 等潜在外露文案。
- 即梦失败任务卡不再展示提交 id, 重查弹窗不再展示 `status=` 或 `watcher`。
- 首页统一 `即梦图片/视频` 口径。
- 补 `get_ai_info()` 默认完整探活行为回归测试。

## 验证

- `git diff --check` -> clean。
- `.venv/bin/pytest -q tests/test_kb_display.py tests/test_ai_routing.py tests/test_lidock_tools.py tests/test_chat_dock.py` -> 47 passed。
- `.venv/bin/pytest -q -x` -> 通过, 仅本机缺失 dhv5 skill 的用例跳过。
- Playwright 知识库定点复核:
  - 截图: `/tmp/_ui_shots/t063_knowledge_display_fixed_v2.png`
  - `prompt/persona-prompt/OpenClaw/AI清华哥/AI协作` 命中 0。
- Playwright 即梦失败任务卡复核:
  - 截图: `/tmp/_ui_shots/t064_dreamina_failed_task_fixed.png`
  - 抽屉可见文案和重查弹窗均不含 `id:` / `submit_id` / `watcher` / `status=`。
- Playwright 全站 21 页严格只读扫描:
  - 结果: `/tmp/_ui_shots/t063_t064_site_final_20260430/results.json`
  - 截图目录: `/tmp/_ui_shots/t063_t064_site_final_20260430/`
  - 页面: 21
  - 通过页面: 21
  - 禁止词命中: 0
  - console error: 0
  - pageerror: 0
  - requestfailed: 0
  - HTTP >= 400: 0
  - 非 GET 请求: 0
  - 生成/提交类请求: 0

## Credits

- 未提交生成任务。
- 未调用媒体生成。
- 未消耗 credits。

## 后续

- 需重新入队一次 QA 只读复测, 覆盖 T-063 原扫描口径和 T-064 即梦失败任务卡条件渲染。
