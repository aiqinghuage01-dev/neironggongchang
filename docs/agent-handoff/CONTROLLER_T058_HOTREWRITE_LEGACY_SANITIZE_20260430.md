# CONTROLLER_T058_HOTREWRITE_LEGACY_SANITIZE_20260430

## 任务

T-058 QA no-credit 回归发现: T-057 的热点 4 版兜底指标成立, 但修复前生成的历史 task `250a97291f9d4c8289231d4ab93609c7` 第 4 版仍在 API 和页面展示 `已走技能：热点文案改写V2` 与 `需要进一步操作吗` 内部菜单。

本次总控返修目标: 新生成内容继续在生成层清洗, 已落库历史任务在读取展示时也要清洗, 避免老板打开旧任务或页面恢复 workflow 时看到内部提示。

## 改动

- `backend/services/hotrewrite_pipeline.py`
  - 新增 `sanitize_result_for_display(result)`, 清洗顶层 `content` 和 `versions[].content`。
  - 复用同一套正文清洗规则, 并在内容变更时重算 `word_count`。
- `backend/api.py`
  - `/api/tasks/{task_id}` 返回前对 `hotrewrite.write` 任务结果做展示清洗。
  - `/api/tasks` 列表返回前同样清洗, 防任务抽屉/历史任务列表继续露出旧脏内容。
- `tests/test_tasks_api.py`
  - 新增旧热点任务详情清洗回归。
  - 新增旧热点任务列表清洗回归。

## 验证

- `git diff --check` -> clean
- `.venv/bin/pytest -q tests/test_tasks_api.py tests/test_hotrewrite_versions.py tests/test_llm_empty_content.py::test_hotrewrite_write_script_raises_on_empty_content tests/test_llm_empty_content.py::test_hotrewrite_normal_content_no_raise` -> 12 passed
- `.venv/bin/pytest -q -x` -> passed, 仅 dhv5 本机 skill 缺失用例 skip
- 重启正式 API `:8000` 后复核旧任务详情:
  - `status=ok`
  - `version_count=4`
  - `fallback_count=1`
  - `v4_has_skill=false`
  - `v4_has_next=false`
- 复核任务列表 `/api/tasks?ns=hotrewrite&limit=5`:
  - 同一 task `v4_has_skill=false`
  - 同一 task `v4_has_next=false`
- Playwright 页面恢复同一旧 task 第 4 版:
  - `textareaHasSkill=false`
  - `textareaHasNext=false`
  - `consoleErrors=0`
  - `pageErrors=0`
  - `requestfailed=0`
  - `httpErrors=0`
  - 截图: `/tmp/_ui_shots/t058_hotrewrite_existing_task_v4_fixed.png`

## 结论

T-058 暴露的问题已由总控返修。新内容生成层和旧任务展示层都已覆盖, 但仍需 QA 开 T-059 做独立 no-credit 复测后才能关闭这条链路。

