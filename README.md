# 内容工厂(neironggongchang)

清华哥的个人内容生产工具 · 本地运行(localhost:8001)·
公众号 / 短视频 / 投流 / 朋友圈 / 选题 / 复盘 一条链路走完。

## 当前状态

**项目已远超最早的 ShortVideo Studio 雏形** — 现在是一个 8 skill 接入的内容工厂:

| 板块 | 内容 |
|---|---|
| 🏭 生产部 | 做视频 v4 / **🎞️ v5 模板成片** / 投流 / 公众号 / 朋友圈 / 热点改写 / 录音改写 / 内容策划 / 违规审查 / 即梦 AIGC |
| 📁 档案部 | 素材库 / 作品库 / 知识库(对接 Obsidian vault) |
| 🌙 夜班 | 小华夜班 — APScheduler cron 定时跑预设任务(凌晨抓热点 / 昨日复盘) |
| ⚙️ 设置 | 全局配置 + 偏好学习 + 行为记忆 + 工作日志开关 |

后端 FastAPI · 前端原生 React + Babel(无构建)· SQLite 数据持久化 ·
AI 智能路由(DeepSeek 走轻任务,Opus 走重任务)。

OpenAPI 100% 覆盖(111 endpoint 都带中文 summary)— 浏览器开
`localhost:8001/docs` 按 15 个 tag 分组看接口。

## 架构关键点

**Skill 接入范式(D-010)**:`~/Desktop/skills/<slug>/SKILL.md` →
`backend/services/<key>_pipeline.py` → `/api/<skill>/*` → `factory-<key>-v2.jsx`。
新加 skill 用 `python3 scripts/add_skill.py --slug X --key Y --icon Z --label W` 一键生成骨架。

**人设系统(D-005 + D-008)**:三层记忆(persona/preferences/work_log)
+ 两档注入开关(deep=True 全人设 ~7500 token / deep=False 精简 ~300 token)。
所有 AI 调用走 `shortvideo.ai.get_ai_client()` 关卡层自动注入。

**模板生态(D-059)**:数字人 mp4 是**上游复用资源**,套不同模板剪辑成多版。
模板 = YAML(节奏骨架 + 字体音乐 + scenes 时间轴),核心沉淀在
`~/Desktop/skills/digital-human-video-v5/templates/`。

## 快速上手

```bash
cd ~/Desktop/neironggongchang
bash scripts/start_all.sh                 # backend + frontend
open http://localhost:8001
```

依赖管理走 uv(`pyproject.toml` + `uv.lock`),前端无构建直接 `<script type="text/babel">`。

## 文档

- `docs/PROGRESS.md` — D-001 → D-060 完整变更日志
- `docs/KNOWN_ISSUES.md` — 当前用户感知的坑 + 半成品状态
- `docs/TECHNICAL-DECISIONS.md` — 技术决策档案
- `docs/NEW-SKILL-PLAYBOOK.md` — D-010 接入新 skill 范式手册
- `CLAUDE.md` — 项目级 AI 协作规则

## 路线图

短期:模板编辑器 UI / 数据复盘中心 / 内容资产卡(一个观点衍生多形态)
长期:学员通用版部署在 poju.ai
