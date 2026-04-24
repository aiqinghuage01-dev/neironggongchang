# CLAUDE.md

> AI (Claude / GPT / 其他) 进入本项目前必读。按本文指示读对应文档，否则容易做偏。

---

## 你在哪

**内容工厂** -- 清华哥（陈清华）的个人内容生产全链路工具。
打开 `localhost:8001`，做视频/投流文案/公众号/朋友圈，所有内容在一个界面完成。

### 架构
- 前端：React CDN + Babel（`web/index.html`），跑在 `:8001`
- 后端：FastAPI（`backend/api.py`），跑在 `:8000`
- AI 引擎：Claude Opus（via OpenClaw proxy `:3456`）/ DeepSeek（备选）
- 数字人：石榴 16AI API
- 声音克隆：CosyVoice 2 本地 sidecar `:8766`
- 知识库：Obsidian vault 只读（`~/Desktop/清华哥知识库/`）
- 数据：SQLite `data/works.db`
- 仅清华哥本人使用，MacBook 本地，不考虑多用户/部署

### 当前版本
v0.3.0 -- 设计稿 C2 全量实施。详见 `docs/PROGRESS.md`。

---

## Session 开始 - 2 步

```bash
# 1. 看进度：前一个 AI 做到哪、下一步是什么
cat docs/PROGRESS.md

# 2. 如果要动代码，按需读
#    - docs/TECHNICAL-DECISIONS.md  <- 技术决策档案（为什么这么做）
#    - PRD_v2.md                    <- 完整 PRD（1000+ 行，按需读章节）
```

---

## 文档谁是事实源

| 文档 | 作用 | 改动规则 |
|---|---|---|
| `PRD_v2.md` | **产品事实源**（9 页设计 + 数据模型 + API 清单） | 只增不改。大版本升级另起 PRD_v3.md |
| `docs/PROGRESS.md` | 进度看板 + 版本演进 | **每次 session 结束必更** |
| `docs/TECHNICAL-DECISIONS.md` | 技术决策档案（为什么这么做） | 踩到新坑/做新决策就补 |
| `docs/NEW-SKILL-PLAYBOOK.md` | **新 skill 接入手册**（D-010 范式） | 接新 skill 时必读 |
| `CHANGELOG.md` | 版本演进 + 按决策号分组 | 每发版补一节 |
| `CLAUDE.md`（本文） | AI 入口路标 | 极少改，改了要简短 |
| `README.md` | 项目总入口（给人看） | 偶尔维护 |

---

## 做事硬规矩

### 必做

- 大改动前在 `docs/PROGRESS.md` 的 TODO 区写一行"我要做 XX"
- 触及 API/数据模型 -> 先更新 PRD 或决策档案，再写代码
- 每次 session 结束：更新 `docs/PROGRESS.md` + `git add + commit`
- 改写/生成相关代码必须注入清华哥人设（`00 AI清华哥/`），不要用通用 prompt

### 禁区

- 不动 `.env`（密钥文件）
- 不删 git 历史 / 强 push
- 不在学员看得到的 UI 用技术词（API / prompt / token）
- 不重新搭建知识库 -- Obsidian 是唯一事实源，工厂只读
- 不在 PRD 里删除已有设计 -- 只标注"已实现/已废弃"

---

## 遇到清华哥的情况

- 他是项目唯一决策者和唯一用户
- 他**懂技术概念但不写代码**，解释时可以用技术类比但不要堆代码
- 他一次只想决策一件事
- 他的知识库 `~/Desktop/清华哥知识库/` 有 1200+ 条 Markdown，是核心资产
- 他希望 AI 接手流畅，不要重复问上一个 AI 已解决的问题

---

## 快速参考

### 启动
```bash
cd ~/Desktop/neironggongchang
bash scripts/start_api.sh          # 终端 1 - :8000
bash scripts/start_web.sh          # 终端 2 - :8001
bash scripts/start_cosyvoice.sh    # 终端 3 - :8766（可选）
open http://localhost:8001/
```

### 测试
```bash
source .venv/bin/activate
pytest -v -s                       # 10 个集成测试
python scripts/smoke_new_apis.py   # 新 API 冒烟
```

### 目录结构（核心）
```
neironggongchang/
  CLAUDE.md              <- 你在读这个
  PRD_v2.md              <- 产品事实源
  docs/
    PROGRESS.md          <- 进度看板（必读）
    TECHNICAL-DECISIONS.md <- 决策档案
    PRD_v1_hermes.md     <- 归档
    design_v3/           <- 设计原型归档
  backend/
    api.py               <- FastAPI 主文件（12+ endpoint）
    services/
      kb.py              <- 知识库（Obsidian 只读 + TF-IDF 匹配）
      settings.py        <- 设置（data/settings.json）
      ad.py              <- 投流文案生成
      moments.py         <- 朋友圈衍生
      article.py         <- 公众号长文
  shortvideo/
    ai.py                <- AI 引擎抽象层（Opus / DeepSeek 切换）
    claude_opus.py       <- Claude Opus 客户端
    deepseek.py          <- DeepSeek 客户端
    shiliu.py            <- 石榴数字人 API
    qingdou.py           <- 轻抖（链接->文案）
    apimart.py           <- GPT-Image-2 封面
    config.py            <- 环境变量集中加载
    works.py             <- SQLite CRUD
    tasks.py             <- 后台任务池
    extractor.py         <- yt-dlp 提取
    cosyvoice.py         <- CosyVoice TTS
  web/
    index.html           <- React SPA（8 页）
  data/
    works.db             <- SQLite（不入库）
    settings.json        <- 用户设置（不入库）
  scripts/
    start_api.sh         <- 启动后端
    start_web.sh         <- 启动前端
    setup.sh             <- 首次安装
```

### AI 引擎切换
设置页 -> AI 引擎 -> opus（默认）/ deepseek
代码层：`shortvideo/ai.py` 的 `get_ai_client()` 读 `data/settings.json` 的 `ai_engine` 字段

### 接入新 skill (D-010 范式)

完整手册见 [`docs/NEW-SKILL-PLAYBOOK.md`](docs/NEW-SKILL-PLAYBOOK.md),极简版:

```bash
# 骨架自动生成 + 7 处注册
python3 scripts/add_skill.py --slug "爆款改写" --key baokuan --icon 💥 --label 爆款改写

# 登记到 backend/services/registered_skills.py (首页技能中心自动显示)

# 调 backend/services/baokuan_pipeline.py 的 prompt 适配 SKILL.md
```

**已接入 skill** (在 `registered_skills.py` 里):
- 📄 公众号文章 (wechat, 8 步) · 🔥 热点改写 (hotrewrite, 3 步)
- 🎙️ 录音改写 (voicerewrite, 3 步) · 💰 投流 (touliu, 2 步)

**事实源原则**:
- skill 目录 `~/Desktop/skills/<slug>/` 只读,工厂不改也不搬
- 功能级覆盖 persona (skill 有自带人设就不走 Obsidian 关卡层)
- subprocess 调 skill 的 scripts,不重写

### AI 引擎智能路由 (D-011)

`get_ai_client(route_key=...)` 按 11 条默认路由分派:
- 轻任务 → DeepSeek (快 10-20 倍)
- 重任务 → Opus (质量)
- `settings.engine_routes` 可覆盖 · `GET /api/ai/routes` 查表

### 知识库 + 人设系统
- 根目录：`~/Desktop/清华哥知识库/`
- **人设精简版**：`00 AI清华哥/persona-prompt.md`（~300 token，每次 AI 调用必带）
- **行为记忆**：`00 AI清华哥/小华工作日志.md`（AI 自动追加，清华哥可手动编辑）
- 人设详细版：`00 AI清华哥/`（业务画像.md / 写作风格规范.md / 人设定位.md / AI协作偏好.md）
- 核心知识：`07 知识Wiki/`（方法论 / 行业洞察 / 直播体系等）
- 匹配接口：`POST /api/kb/match`（jieba 分词 + TF-IDF + 分区权重）
- **关键架构**：所有 AI 调用通过 `ai.py` 关卡层统一注入人设，新技能��动继承（见 D-005/D-008）

---

## 每次 session 结束前 - AI checklist

- [ ] 更新 `docs/PROGRESS.md` 的「当前状态」
- [ ] 如果踩了新坑/做了新决策，追加到 `docs/TECHNICAL-DECISIONS.md`
- [ ] `git add` 相关文件 + `git commit`
- [ ] 如果动了 API/数据模型，在 commit msg 里 mention

*本文控制在 200 行以内。详细内容各归其位。*
