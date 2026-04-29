# QA Report

## 任务 ID

T-059

## 测试对象

分支 / commit / 页面:
- `codex/qa`
- 已同步 `main@76a1a39` 到 QA 分支: merge commit `b356e12`
- 返修提交: `76a1a39 fix: sanitize legacy hotrewrite task results`
- 页面: `http://127.0.0.1:8001/?page=hotrewrite`
- API: `http://127.0.0.1:8000`
- 旧任务: `250a97291f9d4c8289231d4ab93609c7`

## 真实操作

- 打开: `http://127.0.0.1:8001/?page=hotrewrite`
- 点击: 页面恢复旧 task 快照后点击第 4 版 tab
- 输入: `T-059 no-credit smoke：只填热点输入框，不点击开始拆解，避免提交新的热点任务。`
- 等待: 页面加载、旧 task 第 4 版 textarea 渲染、截图完成
- 未点击: `开始拆解` / `再出一组` / `换角度再写`

## 证据

- 截图:
  - `/tmp/_ui_shots/t059_hotrewrite_existing_task_v4.png`
  - `/tmp/_ui_shots/t059_hotrewrite_input_no_submit.png`
- API 详情: `/tmp/t059_task_detail.json`
  - `GET /api/tasks/250a97291f9d4c8289231d4ab93609c7` -> 200
  - `status=ok`
  - `version_count=4`
  - `result.versions[3].content` 不含 `已走技能`
  - `result.versions[3].content` 不含 `需要进一步操作吗`
- API 列表: `/tmp/t059_tasks_list.json`
  - `GET /api/tasks?ns=hotrewrite&limit=5` -> 200
  - target task found
  - `result.versions[3].content` 不含 `已走技能`
  - `result.versions[3].content` 不含 `需要进一步操作吗`
- 页面恢复证据: `/tmp/_ui_shots/t059_hotrewrite_ui_evidence.json`
  - restored version: 4
  - textarea length: 1900
  - `textareaHasSkill=false`
  - `textareaHasNext=false`
  - `textareaHasSkillEnglish=false`
  - `consoleErrors=0`
  - `pageErrors=0`
  - `requestFailed=0`
  - `httpErrors=0`
  - `forbiddenPosts=0`
- no-credit 输入 smoke: `/tmp/_ui_shots/t059_hotrewrite_input_smoke.json`
  - textarea filled length: 49
  - `consoleErrors=0`
  - `pageErrors=0`
  - `requestFailed=0`
  - `httpErrors=0`
  - `forbiddenPosts=0`
- 任务计数:
  - before: `hotrewrite_task_count=9`
  - after: `hotrewrite_task_count_final=9`
  - latest hotrewrite task remains `250a97291f9d4c8289231d4ab93609c7`
- pytest:
  - `/Users/black.chen/Desktop/neironggongchang/.venv/bin/python -m pytest -q tests/test_tasks_api.py tests/test_hotrewrite_versions.py`
  - result: 10 passed
- `git diff --check` -> clean

## Credits / 外部服务

- 是否真烧: 否
- 测试规格: no-credit regression only
- 输入参数: 只读旧 task; 页面只填 textarea, 不提交拆解/改写
- task id / 作品 id: 只读 `250a97291f9d4c8289231d4ab93609c7`
- 实际消耗: 0 新热点 LLM 任务
- 是否重复提交: 否

## 结果

通过。

旧任务详情 API、旧任务列表 API、页面恢复第 4 版 textarea 均已清洗干净, 没有 `已走技能` 或 `需要进一步操作吗`。浏览器 console/pageerror/requestfailed/http>=400 均为 0, 且没有提交新的热点 4 版 LLM 任务。

## 发现的问题

无。

## 复现步骤

1. 确认正式服务运行在 `main@76a1a39`: API `:8000`, web `:8001`。
2. `GET /api/tasks/250a97291f9d4c8289231d4ab93609c7`, 检查 `result.versions[3].content`。
3. `GET /api/tasks?ns=hotrewrite&limit=5`, 在列表里找到同一 task 并检查第 4 版 content。
4. 打开热点改写页, 从同一 task 的已清洗 GET 结果恢复 workflow 快照。
5. 点击第 4 版, 读取 textarea 实际值并截图。
6. 清空热点 workflow, 填一次输入框但不点击开始拆解, 确认无 POST 和无错误。

## 下一步建议

T-059 可关闭。T-058 返修的旧任务展示清洗已通过独立 no-credit 回归。

## 是否需要老板确认

否。
