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
- 不做大额度真烧 credits; 默认只允许最小闭环验证.

## 真烧 credits 自测规则

- 默认允许为验证自己改动跑 1 次最小真烧闭环.
- LLM/外部生成只测 1 次真实生成; 不做批量、多版本、重复重试.
- 公众号草稿/推送类外发动作仍需总控确认, 因为会影响真实账号内容.
- 失败后不要自动重复提交; 记录请求参数 / 错误 / credits 消耗, 交给总控或 QA 复测.

## 交付报告

使用 `docs/agent-handoff/TEMPLATE_DEV_REPORT.md`.
