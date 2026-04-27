# CLAUDE.md

> Claude 进入本项目前必读. 按本文指示读对应文档, 否则容易做偏.

---

## 你在哪

**内容工厂** -- 清华哥（陈清华）的个人内容生产全链路工具.
打开 `localhost:8001`, 做视频/投流文案/公众号/朋友圈, 所有内容在一个界面完成.

### 架构
- 前端: React CDN + Babel (`web/index.html`), 跑在 `:8001`
- 后端: FastAPI (`backend/api.py`), 跑在 `:8000`
- AI 引擎: Claude Opus (via OpenClaw proxy `:3456`) / DeepSeek (备选)
- 数字人: 石榴 16AI API · 声音克隆: CosyVoice 2 本地 sidecar `:8766`
- 知识库: Obsidian vault 只读 (`~/Desktop/清华哥知识库/`)
- 数据: SQLite `data/works.db`
- 仅清华哥本人使用, MacBook 本地. **路线 B**: 未来 poju.ai 学员版千人内规模 (见 SYSTEM-CONSTRAINTS §0)

### 当前版本
v0.5.0 -- 远程任务 watcher + LLM 重试 + 真烧 credits e2e (D-078/D-082, 2026-04-27).
v0.5.1 -- 系统硬约束集中化 + 文档同步 (D-083, 2026-04-27).
详见 `docs/PROGRESS.md`.

---

## Session 开始 - 3 步

```bash
# 1. 看进度
cat docs/PROGRESS.md

# 2. 看硬约束 (写新代码前必读)
cat docs/SYSTEM-CONSTRAINTS.md

# 3. 按需读
#    - docs/TECHNICAL-DECISIONS.md  <- 技术决策档案
#    - PRD_v2.md                    <- 完整 PRD (1000+ 行, 按需读章节)
```

---

## 文档谁是事实源

| 文档 | 作用 | 改动规则 |
|---|---|---|
| `PRD_v2.md` | 产品事实源 (9 页设计 + 数据模型 + API 清单) | 只增不改, 大版本另起 PRD_v3.md |
| `docs/PROGRESS.md` | 进度看板 + 版本演进 | 每次 session 结束必更 |
| `docs/SYSTEM-CONSTRAINTS.md` | **系统硬约束** (路径/异步/AI/访客模式等) | 踩新坑写新约束就追加 |
| `docs/TECHNICAL-DECISIONS.md` | 技术决策档案 (为什么这么做) | 踩到新坑/做新决策就补 |
| `docs/NEW-SKILL-PLAYBOOK.md` | 新 skill 接入手册 (D-010 范式) | 接新 skill 时必读 |
| `CHANGELOG.md` | 版本演进 + 按决策号分组 | 每发版补一节 |
| `CLAUDE.md` (本文) | AI 入口路标 | 极少改, 改了要简短 |
| `AGENTS.md` | Codex/GPT 入口路标 (与本文对偶) | 与 CLAUDE 同步更新 |
| `README.md` | 项目总入口 (给人看) | 偶尔维护 |

---

## 做事硬规矩

### 必做
- 大改动前在 `docs/PROGRESS.md` 的 TODO 区写一行 "我要做 XX"
- 触及 API/数据模型 → 先更新 PRD 或决策档案, 再写代码
- 每次 session 结束: 更新 `docs/PROGRESS.md` + `git add + commit`
- 改写/生成相关代码必须注入清华哥人设 (走 `shortvideo.ai.get_ai_client`, 见 SYSTEM-CONSTRAINTS §2)

### 禁区
- 不动 `.env` (密钥)
- 不删 git 历史 / 强 push
- 不在用户看得到的 UI 用技术词 (见 SYSTEM-CONSTRAINTS §5)
- 不重新搭建知识库 (Obsidian 唯一事实源, 工厂只读)
- 不在 PRD 里删除已有设计 (只标注 "已实现/已废弃")

### 完工铁律 (不可绕过)

**任何代码改动后, 自己完成验证. 不许把验证甩给用户.**

- **UI 改动**: playwright 浏览器闭环 7 必备 (见 SYSTEM-CONSTRAINTS §7.1)
  截图 + console clean + 真点真填 + Read 看截图. 缺一项都不算修
- **后端改动**: `pytest -x` + 改了 API 必须 `curl` 真请求看返回
- **修 bug 额外**: 同 commit 加回归测试 (fail before / pass after, 见 §7.2)

#### 禁用语
"刷一下浏览器" / "你试试" / "应该好了" / "理论上修了" → 禁说.
替换为: "我截了图 + console 干净 + 已加回归测试, 请验收."

#### 真做不到验证时
明确说 "我没法本地验证 X 处, 请你帮我确认", 不许默认让用户当 QA.

---

## 遇到清华哥的情况

- 他是项目唯一决策者和唯一用户
- 他**懂技术概念但不写代码**, 解释时可以用技术类比但不要堆代码
- 他一次只想决策一件事
- 他的知识库 `~/Desktop/清华哥知识库/` 有 1200+ Markdown, 是核心资产
- 他希望 AI 接手流畅, 不重复问上一个 AI 已解决的问题

---

## 快速参考

### 启动
```bash
cd ~/Desktop/neironggongchang
bash scripts/start_api.sh          # 终端 1 - :8000
bash scripts/start_web.sh          # 终端 2 - :8001
bash scripts/start_cosyvoice.sh    # 终端 3 - :8766 (可选)
open http://localhost:8001/
```

### 测试
```bash
source .venv/bin/activate
pytest -v -s                       # 当前 321 通过
python scripts/smoke_new_apis.py   # 新 API 冒烟
bash scripts/smoke_endpoints.sh    # 9 个主 POST endpoint 巡检
bash scripts/run_e2e_full.sh       # 一键全量 (smoke + 真烧 + 截图 + pytest)
```

### 系统硬约束 → 见 `docs/SYSTEM-CONSTRAINTS.md`
本文档不复述, 仅列索引:
- §0 路径策略 (路线 B + paths.py 抽象层)
- §1 异步任务 (tasks 框架 + remote_jobs watcher)
- §2 AI 调用关卡层 (`shortvideo.ai.get_ai_client`)
- §3 访客模式 (`guest_mode.is_guest()` + contextvar)
- §4 知识库只读
- §5 错误友好化 + 文案脱敏
- §6 接入新 skill (D-010 范式)
- §7 测试 (playwright 闭环 + 回归测试)

### 目录结构 (核心)
```
neironggongchang/
  CLAUDE.md / AGENTS.md  <- AI 入口路标 (本文)
  PRD_v2.md              <- 产品事实源
  docs/
    PROGRESS.md          <- 进度看板 (必读)
    SYSTEM-CONSTRAINTS.md <- 系统硬约束 (写新代码前必读)
    TECHNICAL-DECISIONS.md <- 决策档案
    NEW-SKILL-PLAYBOOK.md <- 接入新 skill 手册
  backend/
    api.py               <- FastAPI 主文件 (110+ endpoint)
    services/            <- 23 个 service (tasks/remote_jobs/guest_mode/...)
  shortvideo/
    ai.py                <- AI 关卡层 (人设 + 路由 + retry)
    claude_opus.py / deepseek.py / llm_retry.py
    works.py / tasks.py  <- 数据 CRUD
  web/
    index.html           <- React SPA (10+ 页)
    factory-*.jsx        <- 各 page 组件 (36 个)
  data/
    works.db             <- SQLite (不入库)
  scripts/
    add_skill.py         <- D-010 一键骨架
    start_*.sh           <- 启动脚本
```

### 已接入 skill (在 `backend/services/registered_skills.py`)
公众号文章 (wechat) · 热点改写 (hotrewrite) · 录音改写 (voicerewrite) ·
投流 (touliu) · 内容策划 (planner) · 违规审查 (compliance) ·
即梦 AIGC (dreamina) · 数字人 v5 (dhv5)

### 接入新 skill (D-010)
```bash
python3 scripts/add_skill.py --slug "X" --key Y --icon Z --label W
```
完整范式见 `docs/NEW-SKILL-PLAYBOOK.md`. 硬约束见 SYSTEM-CONSTRAINTS §6.

---

## 每次 session 结束前 - checklist

- [ ] 更新 `docs/PROGRESS.md` 的「当前状态」
- [ ] 踩了新坑/做了新决策 → 追加 `docs/TECHNICAL-DECISIONS.md`
- [ ] **触发新硬约束 → 追加 `docs/SYSTEM-CONSTRAINTS.md`**
- [ ] `git add` 相关文件 + `git commit`
- [ ] 动了 API/数据模型 → commit msg 里 mention

*本文控制在 200 行以内. 详细内容各归其位.*
