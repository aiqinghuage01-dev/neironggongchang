# 总控交接: T-042/T-044/T-045 全站阻塞返修

- Agent: NRG 总控
- 时间: 2026-04-30
- 范围: 战略部任务统计、投流失败恢复态、作品/图片媒体 URL、直接出图/作品库文案、数字人视频选择器
- 结论: 已在 main 工作区完成返修并自测通过; 建议 QA 再做一次不烧 credits 的 T-055 综合回归。

## 修复内容

1. `/api/tasks/counts` 新增独立接口, 避免战略部把 `counts` 当 task_id 导致 404。
2. 作品库只暴露 `/media` 可服务文件; 已存在但位于 pytest 临时目录或其他本机绝对路径的图片不再返回 `local_url/thumb_url`。
3. 前端 `api.media()` 只允许 `http(s) / data / blob / /media / /skills` URL, 阻断 `/private`、`/Users` 等本机路径进入 `<img>/<video>`。
4. 投流任务失败恢复态只显示 `FailedRetry` 友好卡片, 顶部不再重复出现未匹配错误; 通用错误兜底不再显示“没匹配到已知模式 / 原始 message”。
5. 直接出图、作品库、图片预览按钮去掉用户可见 `prompt / apimart / URL`, 改为“画面描述 / 快速出图 / 链接”。
6. 数字人 v5 作品选择器只请求视频作品, 点击后校验 `.mp4`, 不再允许图片作品写入数字人视频字段; 页面不再露本机技能路径。
7. `web/index.html` 增加内联 favicon, 去掉所有页面自动请求 `/favicon.ico` 404 的 console 噪音。

## 验证

- `git diff --check` -> clean
- `.venv/bin/pytest -q tests/test_tasks_api.py tests/test_tasks.py::test_counts tests/test_works_api.py::test_image_missing_file_gets_explicit_asset_status tests/test_works_api.py::test_image_existing_outside_media_root_does_not_expose_absolute_path` -> 4 passed
- `.venv/bin/pytest -q -x` -> passed; 仅 dhv5 本地 skill 缺失用例跳过
- curl:
  - `/api/tasks/counts` -> 200, 返回 `active`
  - `/api/works?type=image&limit=8&since=all` -> `bad_absolute=[]`; pytest 临时图 `#784` 变为 `record_only`
- Playwright:
  - 战略部: `/api/tasks/counts` 200, console error=0
  - 投流失败恢复: visible text 不含 `没匹配到已知模式 / 原始 message / RuntimeError / LLM 输出非 JSON`, 显示“投流没生成出来 / 通常重试一次就好”
  - 直接出图绝对路径恢复: 无 `/private` 媒体源或请求, 显示“没有可预览图”
  - 作品库: 无 `/private`/`/Users` 媒体源或请求, console error=0
  - 直接出图表单: visible text 不含 `prompt / apimart / URL`
  - 数字人 v5: picker 请求 `/api/works?limit=80&type=video&source_skill=shortvideo&since=all`; 点击视频后仅显示文件名 `shiliu_*.mp4`, visible text 不含 `/Users`/`/private`

## 截图

- `/tmp/_ui_shots/t042_fix_strategy_cli.png`
- `/tmp/_ui_shots/t044_fix_touliu_failed_restore_cli.png`
- `/tmp/_ui_shots/t042_fix_imagegen_private_url_cli.png`
- `/tmp/_ui_shots/t042_fix_works_images_cli.png`
- `/tmp/_ui_shots/t045_fix_imagegen_terms_cli.png`
- `/tmp/_ui_shots/t045_fix_works_terms_paths_cli.png`
- `/tmp/_ui_shots/t045_fix_dhv5_picked_video_cli.png`

## 后续

- 已覆盖 T-042/T-044/T-045 报告中的可直接修复项。
- 数字人 v5 当前模板数仍为 0, 页面已改成友好空态并建议走「做视频」主流程; 如果后续仍要把独立 v5 页作为正式入口, 需要补真实模板资产。
