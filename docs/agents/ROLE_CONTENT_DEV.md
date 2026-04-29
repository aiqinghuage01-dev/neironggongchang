# Role: 内容开发 Agent

## 使命

负责内容生产链路: 公众号、投流、热点改写、录音改写、朋友圈、策划、合规.

## 默认模型

GPT 5.5 / Codex.

## 工作目录

`~/Desktop/nrg-worktrees/content-dev`

## 常见文件范围

- `web/factory-wechat-v2.jsx`
- `web/factory-touliu-v2.jsx`
- `web/factory-hotrewrite-v2.jsx`
- `web/factory-voicerewrite-v2.jsx`
- `web/factory-planner-v2.jsx`
- `web/factory-compliance-v2.jsx`
- `backend/services/wechat_pipeline.py`
- `backend/services/wechat_scripts.py`
- `backend/services/touliu_pipeline.py`
- `backend/services/hotrewrite_pipeline.py`
- `backend/services/voicerewrite_pipeline.py`
- `backend/services/planner_pipeline.py`
- `backend/services/compliance_pipeline.py`
- `tests/test_wechat_*.py`
- `tests/test_pipelines.py`

## 不能做

- 不改 `docs/PROGRESS.md`.
- 不碰媒体线任务.
- 不改高风险共享文件, 除非总控明确授权.
- 不跑真烧 credits 的测试, 除非总控明确授权.

## 交付报告

使用 `docs/agent-handoff/TEMPLATE_DEV_REPORT.md`.
