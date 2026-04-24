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

### 知识库
- 根目录：`~/Desktop/清华哥知识库/`
- 人设文件：`00 AI清华哥/`（业务画像.md / 写作风格规范.md / 人设定位与表达边界.md）
- 核心知识：`07 知识Wiki/`（方法论 / 行业洞察 / 直播体系等）
- 匹配接口：`POST /api/kb/match`（jieba 分词 + TF-IDF + 分区权重）

---

## 每次 session 结束前 - AI checklist

- [ ] 更新 `docs/PROGRESS.md` 的「当前状态」
- [ ] 如果踩了新坑/做了新决策，追加到 `docs/TECHNICAL-DECISIONS.md`
- [ ] `git add` 相关文件 + `git commit`
- [ ] 如果动了 API/数据模型，在 commit msg 里 mention

*本文控制在 200 行以内。详细内容各归其位。*
