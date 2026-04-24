# 内容工厂 - 进度看板

> AI 接手前必读。每次 session 结束必更。

---

## 当前状态（2026-04-24）

**版本**：v0.3.0 -- 设计稿 C2 全量实施

**已完成的能力**：
- 做视频 6 步流（扒文案 -> 改写 -> 声音 -> 形象 -> 剪辑 -> 发布）
- FastAPI 后端 12+ endpoint（`:8000`）
- React 前端 8 页（`:8001`）
- 知识库只读对接（Obsidian vault，jieba + TF-IDF 匹配）
- 投流文案批量 5 版 + 知识库注入
- 朋友圈衍生 3-5 条 + 知识库注入
- 公众号大纲 + 长文 + 知识库注入
- 素材库 / 热点库 / 选题库 CRUD
- 作品库 + 数据指标手动录入 + 排行分析
- AI 引擎双轨：Claude Opus（via OpenClaw） / DeepSeek 一键切换
- GPT-Image-2 封面并发生成（apimart）
- 轻抖链接提取（异步轮询）
- 设置持久化（data/settings.json）

**未实现但 PRD 里有**：
- 首页统计方块的真实数据（目前部分 hardcode）
- 知识库注入到改写 prompt（kb.match 已有，但 rewrite_script 没用上）
- 小华对话（底部 dock 的自由聊天）
- 小华记忆持久化（Phase 3）
- 多平台真发布（抖音/快手 OpenAPI）
- 定时发布
- BGM 混音
- 数据自动采集

---

## 版本演进

### v0.1.0（2026-04-23）-- Streamlit 单文件 MVP
- 一页六卡 Streamlit UI
- 石榴 + DeepSeek + CosyVoice（桩）+ yt-dlp
- SQLite 作品库
- pytest 10/10 通过
- 端到端视频生成验证
- 详见 `DELIVERY-v0.1.md`

### v0.2.0（2026-04-24 上午）-- 新 API 接入
- 轻抖（链接->文案）
- apimart GPT-Image-2（AI 封面）
- 两个配套 pytest + smoke

### v0.3.0（2026-04-24 下午）-- 设计稿 C2 全量实施
- FastAPI 后端取代 Streamlit 内嵌逻辑
- React 前端 8 页落地
- 知识库对接（目录树 / 搜索 / chunk 级匹配）
- 投流 / 朋友圈 / 公众号三条生产链路
- 素材库 / 热点库 / 选题库
- AI 引擎双轨（Opus / DeepSeek）
- 设置页持久化
- 详见 `DELIVERY.md`

---

## Roadmap（按 PRD Phase 推进）

### Phase 1 -- 核心链路加固（当前重点）
- [ ] 改写 prompt 注入清华哥人设（`00 AI清华哥/*.md`）
- [ ] 改写 prompt 注入知识库匹配结果（kb.match 已就绪）
- [ ] 首页 4 方块真实统计数据
- [ ] 选题批量生成优化（接知识库）

### Phase 2 -- 小华对话 + 记忆
- [ ] 底部 dock 自由对话（多轮）
- [ ] 人设底座加载（启动时读 `00 AI清华哥/`，缓存注入 system prompt）
- [ ] 行为记忆层（data/memory.jsonl，记录用户选择和手动修改）
- [ ] 偏好学习（最近 N 条记忆注入 prompt）

### Phase 3 -- 发布 + 数据闭环
- [ ] 多平台真发布（需各家 OpenAPI 授权）
- [ ] 数据自动采集
- [ ] 效果分析 -> 反哺选题

---

## 已知问题

见 `KNOWN_ISSUES.md`（持续维护）。

---

## 下一步要做（优先级排序）

1. **改写 prompt 注入人设** -- 最高优先。当前 `rewrite_script` 用通用 prompt，完全没清华哥味道
2. **改写 prompt 注入知识库** -- kb.match 已就绪，只差拼进 prompt
3. **首页统计真实数据** -- 部分 hardcode 要换成真查询
4. **项目管理骨架** -- CLAUDE.md + PROGRESS.md + git init（本次 session 在做）
