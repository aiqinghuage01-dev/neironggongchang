# Review Report

## 任务 ID

T-109

## 结论

通过。未发现 P0/P1。T-100 没有增加模型调用, 没有绕过 `shortvideo.ai.get_ai_client`, 没有改变公众号/录音/策划的生成语义; 新增内容只负责向 task 写阶段时间线和展示清洗。

本报告由总控接管完成: review 自动进程卡在外部 CLI 执行层, 未产出审查报告, 已停止该进程。

## 审查范围

- `backend/services/copy_progress.py`
- `backend/services/wechat_pipeline.py`
- `backend/services/voicerewrite_pipeline.py`
- `backend/services/planner_pipeline.py`
- `backend/api.py`
- `web/factory-task.jsx`
- `web/factory-wechat-v2.jsx`
- `web/factory-voicerewrite-v2.jsx`
- `web/factory-planner-v2.jsx`
- `tests/test_copy_progress_timelines.py`
- `scripts/e2e_copy_timelines.js`

## 关键判断

- 生成语义:
  - 公众号仍是写长文一次 LLM + 三层自检一次 LLM。
  - 录音改写仍是原有写正文 + 自检一次 LLM。
  - 内容策划仍是原有完整方案一次 LLM。
- credits:
  - 没有新增 `ai.chat` 调用。
  - 没有新增真烧测试。
- AI 关卡:
  - 仍通过 `get_ai_client(route_key=...)`。
  - 未新增 provider/client 直连。
- 任务恢复:
  - 三条链路写作阶段都改为 `sync_fn_with_ctx`, 只在原调用前后更新 `partial_result` / `progress_data`。
  - 公众号手动写长文保存 `wechat:write` task id, 页面可继续轮询。
- 出口清洗:
  - `/api/tasks` 和 `/api/tasks/{id}` 覆盖 `wechat.write` / `voicerewrite.*` / `planner.*`。
  - 递归移除 `token/route/model/provider/prompt/raw/engine/api` 等内部字段。
  - failed error 显示白话说明。

## 已复核证据

- `tests/test_copy_progress_timelines.py` 覆盖三条 pipeline 的阶段时间线、失败停点、task 出口清洗。
- `scripts/e2e_copy_timelines.js` 覆盖 wechat/voicerewrite/planner 的 slow、failed、ok 和 390px。
- 主线验证见 `QA_T108_COPY_TIMELINES_20260501.md`。

## 非阻塞风险

- 当前仍是阶段时间线, 不是正文逐字流式; 这符合 T-100 第一阶段范围。
- 公众号自动流程只显示子 task 的进度, 不支持整条自动流程断点续跑; 旧逻辑本来也不恢复 auto pipeline。
- 通用失败卡为适配左侧固定侧栏收窄了移动端宽度, 后续如改全站布局可再统一优化。

## 是否阻塞合并

不阻塞。
