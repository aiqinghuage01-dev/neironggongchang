# 系统硬约束

> 写新代码前必读. 所有约束都是踩坑后才有的, 违反 = 重新踩坑.
> 集中放一份, 不再散落到 D-XXX 的故事里. 新踩坑就追加.

最后更新: 2026-04-27 (D-083 集中化)

---

## 0. 项目阶段定位 + 路径策略 (路线 B)

### 当前状态
- 仅清华哥本人使用, MacBook 本地, 单用户
- 已有路径硬编码: `~/Desktop/skills/`, `~/Desktop/清华哥知识库/`, `~/.wechat-article-config`

### 路线 B (清华哥 2026-04-27 拍板)
- **未来目标**: poju.ai 学员版, **千人内规模** (不是 SaaS 万人级)
- **不需要**: k8s, 微服务, 分布式
- **真实多用户前必须换**:
  - SQLite → **Postgres** (并发写入 / 行锁 / 真事务)
  - daemon thread → **持久任务队列** (Redis/RQ 或类似, 防进程重启丢任务)
  - 本地文件 → **对象存储** (S3 / OSS, 多 user 隔离)
  - 全表加 `user_id` 行级隔离
- SQLite 仅限**低并发过渡** (个人版 / Mac Mini / 内测), 不能扛千人生产

### 路径硬编码策略 (决策: 不主动重构 + 渐进抽象)
- ✅ **已有硬编码不主动重构** (D-001 → D-082 留下来的, 维持原样)
- ✅ **新写代码不再硬编码 user-specific 路径**
- ✅ 摸到老硬编码顺手替换, 债自然清

### 怎么落地: 新增 user-specific 路径前先建 paths.py
**当前 `backend/services/paths.py` 不存在.** 第一个真要新增 user 路径的 AI / commit 同步建. 最小骨架样例:

```python
# backend/services/paths.py — 路径抽象层
"""所有 user-specific 路径走这里, 不要散硬编码到代码各处.
当前: 单用户, 全部返回清华哥的桌面路径.
未来: 改函数体即可多租户, 不用动调用点.
"""
from pathlib import Path

DEFAULT_USER = "qinghua"

def get_current_user_id() -> str:
    """当前操作 user_id. 单用户期永远返回 DEFAULT_USER. 未来从 session/header 读."""
    return DEFAULT_USER

def get_user_skill_dir(user_id: str = DEFAULT_USER) -> Path:
    """skill 目录. 当前: ~/Desktop/skills/"""
    return Path.home() / "Desktop" / "skills"

def get_user_kb_dir(user_id: str = DEFAULT_USER) -> Path:
    """Obsidian 知识库根目录. 当前: ~/Desktop/清华哥知识库/"""
    return Path.home() / "Desktop" / "清华哥知识库"

def get_user_config_dir(user_id: str = DEFAULT_USER) -> Path:
    """用户配置根目录 (~/.wechat-article-config 等)."""
    return Path.home()

def get_data_dir() -> Path:
    """工厂数据根 (data/works.db / settings.json 等). 与 user 无关."""
    return Path(__file__).resolve().parents[2] / "data"
```

### 学员版预备 (一期不做)
- **新写代码默认接受 `user_id` 参数** (即便当前永远是 'qinghua'), 降低未来重构面积
- 数据表加 user_id 列: 懒加, 真有第二个用户再加
- 人设系统多租户化: 一期不做 (老板没要)

---

## 1. 异步任务硬约束 (D-068 + D-078)

### 1.1 daemon thread 长任务必须挂 tasks 框架
**正例**:
```python
from backend.services import tasks as tasks_service
tasks_service.run_async(kind="...", payload=..., sync_fn=...)
# 或手动: create_task() + finish_task()
```
**反例 (禁止)**:
- `threading.Thread(target=..., daemon=True).start()` 跑长任务但不入 tasks DB
- in-memory dict 跟踪状态 (旧 `COVER_TASKS`, 重启丢)

**为什么**: D-068 三层防御 (启动恢复 / watchdog 60s / UI 卡死可视化) 全靠 tasks 表. 不挂 = 进程重启 → DB 永远卡 running → UI 转圈不动.

### 1.2 远程长任务必须走 remote_jobs watcher
**适用范围**: 即梦, 柿榴数字人, 任何 "提交后远端排队 / 长 polling" 的 provider.

**正例**:
```python
from backend.services import remote_jobs
remote_jobs.register_provider("dreamina", poll_fn, on_done=cb)
# submit + register, 不在 daemon thread 内死等
```
**反例 (禁止)**:
- daemon thread 内 `while not done: poll(); sleep()` 死等 900s
- 即梦端真排队 12h+ 时, daemon timeout 假杀, 但平台已扣 credits

**为什么**: D-078 watcher 进程重启不丢 + max_wait_sec 默认 2h 兜底 + UI 可手动 "🔍 重查".

### 1.3 独立 DB 表的 daemon 必须实现 recover_orphan_runs()
**适用**: night_job_runs, 或任何新加的独立 DB 表跑 daemon thread.

**必须**: 启动钩子里调 `recover_orphan_runs()`, 把上次没收尾的 pending/running 标 failed.

**反例**: night_job_runs 表跑 daemon, 没 recover hook → 进程重启 → DB 永远卡 running.

---

## 2. AI 调用硬约束

### 2.1 必须走关卡层
**正例**:
```python
from shortvideo.ai import get_ai_client
client = get_ai_client(route_key="hotrewrite.write")
client.chat(messages=...)
```
**反例 (禁止)**:
- 直接 `from shortvideo.claude_opus import ClaudeOpusClient; ClaudeOpusClient().chat(...)`
- 自己 `import openai; openai.ChatCompletion.create(...)`

**为什么**: 关卡层自动:
- 注入清华哥人设 (访客模式自动切中性 ~100 字 system)
- 智能路由轻/重任务 → DeepSeek/Opus (D-011, 11 条默认路由)
- 自动 retry 1 次 (D-082c, 5xx/timeout/rate-limit 兜底)
- 打 ai_calls usage 点 (D-015, 首页统计 + 成本核算)

绕过 = 丢 4 项, 任意一项都是债.

### 2.2 deep 参数语义
- `deep=True` 全量人设 ~7500 token (业务画像 + 写作风格 + 协作偏好等)
- `deep=False` 精简 ~300 token (默认)
- 6 个核心模型加 `deep` 参数 (D-008), 新加 endpoint 注意保持

---

## 3. 访客模式硬约束 (D-070)

### 3.1 任何写入档案的 hook 先查 is_guest()
**正例**:
```python
from backend.services import guest_mode
if not guest_mode.is_guest():
    work_log.append(...)
    preference.update(...)
    # ...
```

**当前 5 个写入口子已加** (新加任何写档案口子都要走):
- `work_log` (小华工作日志)
- `preference` (偏好抽取)
- `tasks._autoinsert_text_work` (作品库自动入库)
- `wechat_scripts insert_work` (公众号入库)
- `PersonaInjectedAI` 注入 (人设)

### 3.2 跨 daemon thread 必须 capture/set contextvar
**正例** (`tasks.run_async` 里):
```python
guest = guest_mode.is_guest()  # 主线程读
def worker():
    guest_mode.set_guest(guest)  # daemon 里 set 回去
    sync_fn()
```
**反例**: daemon 起来 contextvar 默认 False, 访客模式失效, 朋友项目脏数据污染清华哥档案.

### 3.3 访客模式 AI 走中性 system
- 不注入清华哥几千字人设, 切 "中文写作助手" ~100 字
- 这块在 `PersonaInjectedAI` 已实现, 新代码别绕过

---

## 4. 知识库硬约束

- **Obsidian vault `~/Desktop/清华哥知识库/` 只读**
- 工厂不改不搬不重建
- 写知识只通过用户 Obsidian 编辑, AI 不直接 write
- 匹配走 `POST /api/kb/match` (jieba + TF-IDF + 分区权重)

**反例 (禁止)**:
- 工厂代码 `Path("~/Desktop/清华哥知识库/...").write_text(...)`
- 把知识库内容拷一份到 `data/` 下 "作为备份"

---

## 5. 错误友好化硬约束 (D-069)

### 5.1 文案脱敏 (录视频会露馅)
**禁词** (UI 不出现):
- `skill` / `prompt` / `tokens` / `API` (用户层文案)
- `卡死` / `杀掉` (用 `等了` / `停掉`)
- `task.kind` 原文 (用 `taskFriendlyName(task)` 走 `TASK_KIND_LABELS` 映射)
- 后端 raise 原文 (前端 `factory-api.jsx::_handleErrorResponse` 统一拦截转大白话)

### 5.2 后端 raise 不必纠结文案
- 422 Pydantic JSON / 5xx / OpenClaw 503 全部由前端 `_handleErrorResponse` 转译
- 后端写 `raise HTTPException(status_code=422, detail="n 至少 1; brief 没填")` OK
- 不要往 detail 里塞 `ClaudeOpusError(http://localhost:3456/v1)` 之类暴露内部地址的串

---

## 6. 接入新 skill 硬约束 (D-010)

### 6.1 走 add_skill.py 一键骨架
```bash
python3 scripts/add_skill.py --slug "X" --key Y --icon Z --label W
```
7 处注册自动: pipeline / jsx / api.py / sidebar / app routes / index.html / ai routes.

### 6.2 skill 源目录只读
- `~/Desktop/skills/<slug>/` **只读**, 工厂不改不搬不重写
- subprocess 调 skill 的 scripts/ 脚本, 不重新实现
- 若 skill 自带人设 (`persona/` 或 SKILL.md 已写), 功能级覆盖 Obsidian 关卡层

### 6.3 必须登记 registered_skills.py
- `backend/services/registered_skills.py` 是首页技能中心的唯一事实源
- 不登记 = 首页看不到

---

## 7. 测试硬约束 (清华哥全局规则)

### 7.1 任何 "测试" 任务必须 playwright 浏览器闭环
单纯后端 sanity / 让用户自测 = 不算完成.

**闭环 7 必备** (缺一项都不能写"测试通过"):
1. 起 chromium 跑真实交互 (`require '/Users/black.chen/.npm-global/lib/node_modules/playwright'`)
2. goto 真实 URL `http://127.0.0.1:8001/?page=<page_id>` (web 8001, backend 8000)
3. 模拟点击/输入 (locator + click + fill, 不能停在 page load)
4. 监听 console error / pageerror (任何 React/JS 报错算失败)
5. 截图保存 `/tmp/_ui_shots/<编号>_<场景>.png`
6. 用 Read 看截图 (视觉确认, 不能只看脚本没报错)
7. 真烧 credits 类 (即梦/数字人/出图) 至少跑一次最便宜组合验证 task → 结果 → 入作品库

**反模式 (禁止)**:
- 只 curl sanity 就标 completed (D-075 教训: 字段抓错也返 200, sanity 看不出)
- 让用户 "在浏览器里实测一下" — 老板没时间, 这是甩锅
- 看到 200 OK 就以为通过

### 7.2 修 bug 必须加回归测试
- 测试 fail before fix → pass after fix
- 测试和代码同 commit
- **没回归测试 = bug 不算修**

---

## 8. 文档硬约束

### 8.1 Session 开始 - AI 入口必读 3 文件
1. `docs/PROGRESS.md` — 进度看板, 上一个 AI 做到哪
2. `docs/SYSTEM-CONSTRAINTS.md` (本文) — 硬约束清单
3. `CLAUDE.md` 或 `AGENTS.md` — 路标 (按 AI 类型选)

### 8.2 Session 结束 - checklist
- [ ] 更新 `docs/PROGRESS.md` 当前状态
- [ ] 踩了新坑 → 追加 `docs/TECHNICAL-DECISIONS.md`
- [ ] 触发新硬约束 → 追加本文 (SYSTEM-CONSTRAINTS.md)
- [ ] `git add` + `git commit`
- [ ] 动了 API/数据模型 → commit msg 里 mention

### 8.3 入口文件 200 行红线
- `CLAUDE.md` / `AGENTS.md` 都控制在 200 行以内
- 超 = 内容下沉到独立 docs/ 文件 (本文就是)

---

## 怎么追加新约束

1. 踩到新坑, 修完代码后回到本文
2. 找最贴近的章节追加一小节, 包含:
   - **现象**: 不写约束会怎样 (具体踩坑 case)
   - **正例**: 正确接口 + 用法
   - **反例**: 禁止的写法
   - **为什么**: 一句话说清后果
3. 同步 `docs/TECHNICAL-DECISIONS.md` 的 D-XXX
4. CHANGELOG 加一行 "约束追加" 条目

---

## 索引: 约束 → D 编号 → 文件

| 约束 | D 编号 | 关键文件 |
|---|---|---|
| daemon 挂 tasks 框架 | D-068 | `backend/services/tasks.py` |
| 远程任务 watcher | D-078 | `backend/services/remote_jobs.py` |
| AI 调用关卡层 | D-005, D-008, D-011, D-082c | `shortvideo/ai.py`, `shortvideo/llm_retry.py` |
| 访客模式 contextvar | D-070 | `backend/services/guest_mode.py` |
| 错误友好化拦截 | D-069 | `web/factory-api.jsx::_handleErrorResponse` |
| 文案脱敏 (TASK_KIND_LABELS) | D-069 | `web/factory-task.jsx` |
| 接入新 skill 范式 | D-010 | `scripts/add_skill.py`, `docs/NEW-SKILL-PLAYBOOK.md` |
| 路径抽象层 (待建) | D-083 | `backend/services/paths.py` (本文骨架) |
