# 总控交接: T-088 热点改写逐版可见最终收口

时间: 2026-05-01
角色: 总控 Agent
接管原因: `worker_stuck`

## 背景

老板实测发现热点文案改写仍是“7 分钟写完 4 篇后一次性展示”, 没有在第 1 篇写完时立即可看。T-085 内容开发完成第一轮后, T-086 QA 与 T-087 Review 均正确 block:

- 慢 V4 状态仍黑箱, 缺第 4 版耗时/重试/兜底说明。
- `partial_result` 清洗边界不足, 正文后半段出现“已走技能”时仍可能外露。
- `finish_task(failed)` 会清空 `partial_result/progress_data`, 如果 V4 失败会丢掉 V1/V2/V3。
- 缺 failed/慢 V4/cancel 相关回归。

自动返修主管创建 T-088 后, content-dev worker 长时间在旧 worktree 里重复改同一范围。总控在 main 上接管收口, 停止旧 T-088 worker PID `38689/38691`, 避免重复实现覆盖主线。

## 本次完成

- 合入并修正 T-085 的渐进展示基础: 热点改写 4 版生成过程中, 后端写入 `partial_result/progress_data`, 前端可先展示已完成版本。
- 修复清洗边界: `已走技能/已走 skill` 出现在正文后面时, 从该内部菜单起截断; 开头内部提示仍只移除提示段, 不误删正文。
- 修复失败保留: task `ok/cancelled` 清掉 partial, `failed` 保留 partial/progress_data, 让用户仍能看到已经写好的版本。
- 前端 running/failed 都读取 partial; 已完成版本可切换、可复制; 慢 V4 展示 `progress_text`、已等时间、剩余版本说明和“取消剩余生成”。
- 后端开始每一版前写入用户可见进度: `正在写第 X/4 版 · ...`, 生成现场 timeline 可解释。
- 扩展 Playwright 回归脚本, 覆盖 `v1 -> v2 -> slow V4 -> ok` 四态, 并验证 390px 窄屏。

## 验证

通过:

- `python3 -m py_compile backend/services/hotrewrite_pipeline.py backend/services/tasks.py backend/api.py`
- `node --check scripts/e2e_hotrewrite_progressive.js`
- `git diff --check && git diff --cached --check`
- `python3 -m pytest -q tests/test_hotrewrite_versions.py tests/test_tasks.py tests/test_tasks_api.py tests/test_migrations.py`
  结果: 51 passed
- 正式端口重启后:
  - `curl -sS http://127.0.0.1:8000/api/health` 返回 HTTP 200, `ok=true`; AI 探活超时被记录为 `ai.ok=false`, 不影响本次 mock/no-credit 页面回归。
  - `APP_URL='http://127.0.0.1:8001/?page=hotrewrite' node scripts/e2e_hotrewrite_progressive.js`
  - 状态序列: `v1`, `v2`, `slow`, `ok`
  - consoleErrors=0, pageErrors=0, failedRequests=0, httpErrors=0
  - 390px `maxOverflow=0`

截图:

- `/tmp/_ui_shots/t085_hotrewrite_running_v1.png`
- `/tmp/_ui_shots/t085_hotrewrite_running_v2.png`
- `/tmp/_ui_shots/t085_hotrewrite_slow_v4.png`
- `/tmp/_ui_shots/t085_hotrewrite_done_4versions.png`
- `/tmp/_ui_shots/t085_hotrewrite_mobile_390.png`

全量测试:

- `python3 -m pytest -q` 运行完成, 但有 8 个既有失败, 均不在本次热点改写范围:
  - `tests/test_apimart_service.py::test_apimart_watcher_enriches_single_image_task_result` 期望绝对 `local_path`, 当前实现返回相对路径。
  - `tests/test_lidock_global_static.py::test_lidock_is_mounted_once_from_top_level_app` 发现 `web/factory-beta.jsx` 仍有页面内 `<LiDock />`。
  - `tests/test_wechat_avatar.py` 4 个用例期望预览头像为 `http://127.0.0.1:8000/media/...`, 当前实现返回 `/media/...`。
  - `tests/test_wechat_html_inject.py` 2 个用例同样期望公众号预览图为绝对本地 media URL。

这些失败与本次改动文件无交集, 本轮不混入返修。

## 后续

- T-088 可由总控用 `worker_stuck` 接管关闭。
- T-089/T-090 可继续做独立 QA/Review。若两者通过, T-084 “所有写文案功能举一反三”应改为依赖 T-089/T-090 后继续推进。
