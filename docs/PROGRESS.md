# 内容工厂 - 进度看板

> AI 接手前必读。每次 session 结束必更。

---

## 当前状态（2026-04-24 晚）

**版本**：v0.3.1 -- 项目管理骨架 + 人设/记忆系统设计

**本次 session 完成**：

1. **Git 初始化** -- 全量代码入库（84 文件，commit `3bfb10a`）
2. **项目管理体系**（对标 poju-site）：
   - `CLAUDE.md` -- AI 入口路标
   - `docs/PROGRESS.md` -- 进度看板（本文）
   - `docs/TECHNICAL-DECISIONS.md` -- 技术决策档案（D-001 ~ D-008）
3. **人设/记忆系统设计**（研究了 OpenClaw + Hermes，选择 OpenClaw 的 Markdown 方案）：
   - 在 Obsidian 知识库创建 `persona-prompt.md`（~300 token 精简版人设）
   - 在 Obsidian 知识库创建 `小华工作日志.md`（行为记忆模板）
   - 设计三层记忆架构（D-005）
   - 设计两档开关：深度理解 vs 轻快模式（D-008）
   - 设计关卡层：所有 AI 调用通过 `ai.py` 统一注入人设（不需要每个技能单独改）
4. **分析了当前 6 个 AI 调用点的问题**：全部用通用 prompt，没注入人设

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
- 知识库注入到改写 prompt（kb.match 已有，但 rewrite_script 没用上）
- 小华对话（底部 dock 的自由聊天）
- 小华记忆持久化
- 多平台真发布（抖音/快手 OpenAPI）
- 定时发布 / BGM 混音 / 数据自动采集

---

## 版本演进

### v0.1.0（2026-04-23）-- Streamlit 单文件 MVP
- 一页六卡 Streamlit UI + 石榴 + DeepSeek + CosyVoice（桩）
- pytest 10/10 + 端到端视频生成验证
- 详见 `DELIVERY-v0.1.md`

### v0.2.0（2026-04-24 上午）-- 新 API 接入
- 轻抖（链接->文案）+ apimart GPT-Image-2（AI 封面）

### v0.3.0（2026-04-24 下午）-- 设计稿 C2 全量实施
- FastAPI + React 前端 8 页 + 知识库 + 投流/朋友圈/公众号 + AI 双轨
- 详见 `DELIVERY.md`

### v0.3.1（2026-04-24 晚）-- 项目管理 + 记忆系统设计
- Git init + CLAUDE.md + PROGRESS.md + TECHNICAL-DECISIONS.md
- persona-prompt.md + 小华工作日志.md（Obsidian 知识库）
- 8 条技术决策记录

---

## Roadmap（按 Phase 推进）

### Phase 1 -- 人设注入 + 核心链路加固（下一步重点）
- [ ] **ai.py 关卡层改造**：所有 AI 调用自动加载 persona-prompt.md（300 token）
- [ ] **两档开关**：前端 checkbox「深度理解业务」，deep=true 时加载完整人设+知识库+记忆
- [ ] **改写 prompt 注入知识库**：kb.match 已就绪，拼进 prompt
- [ ] **行为记忆写入**：每次改写/生成后自动追加到小华工作日志.md
- [ ] 首页 4 方块真实统计数据
- [ ] 选题批量生成优化

### Phase 2 -- 小华对话 + 记忆闭环
- [ ] 底部 dock 自由对话（多轮）
- [ ] 对话中学到的偏好自动写入小华工作日志.md
- [ ] 行为记忆读取：最近 20 条注入 prompt

### Phase 3 -- 发布 + 数据闭环
- [ ] 多平台真发布（需各家 OpenAPI 授权）
- [ ] 数据自动采集
- [ ] 效果分析 -> 反哺选题

---

## 人设/记忆系统架构（速览）

```
Obsidian 知识库 / 00 AI清华哥 /
├── persona-prompt.md        ← 精简版（300 token），每次 AI 调用必带
├── 小华工作日志.md           ← 行为记忆，AI 自动追加，清华哥可手动编辑
├── 业务画像.md              ← 详细版，deep=true 时加载
├── 写作风格规范.md           ← 详细版，deep=true 时加载
├── 人设定位与表达边界.md      ← 详细版，deep=true 时加载
├── AI协作偏好.md            ← 详细版，deep=true 时加载
└── index.md                 ← 知识库导航索引

代码层：
  ai.py → get_ai_client() → chat(prompt, deep=True)
    → 自动读 persona-prompt.md（必带）
    → deep=True 时额外读完整人设 + kb.match + 最近记忆
    → 所有技能（改写/投流/朋友圈/公众号/选题/标题）自动继承
    → 未来新技能只要调 get_ai_client()，零额外配置
```

关键决策见 `docs/TECHNICAL-DECISIONS.md`（D-005 三层记忆、D-008 两档开关）。

---

## 已知问题

见 `KNOWN_ISSUES.md`（持续维护）。

---

## 下一步要做（优先级排序）

1. **ai.py 关卡层 + persona-prompt.md 注入** -- 改一个文件让所有 AI 调用带上清华哥味道
2. **两档开关前端实现** -- 每个内容生产页加 checkbox
3. **行为记忆写入** -- 改写/生成后自动追加到小华工作日志.md
4. **改写 prompt 注入知识库** -- kb.match 结果拼进 prompt
