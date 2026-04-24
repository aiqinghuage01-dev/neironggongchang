# 新 skill 接入手册

> D-010 范式手册 · 未来接入任何新 skill 按这个走 · 有 `scripts/add_skill.py` 自动化骨架

---

## TL;DR

```bash
# 1. 生成骨架
python3 scripts/add_skill.py --slug "爆款改写" --key baokuan --icon 💥 --label 爆款改写

# 2. 重启 :8000 (带 --reload 自动)
kill $(lsof -ti:8000) && bash scripts/start_api.sh

# 3. 浏览器刷新 http://127.0.0.1:8001/
# sidebar 多一个「💥 爆款改写」

# 4. 调 backend/services/baokuan_pipeline.py 的 prompt 适配实际 SKILL.md

# 5. 在 registered_skills.py 把 subtitle 改成 skill 的真实描述
```

---

## 架构原则 (D-010 / D-011)

1. **skill 目录 `~/Desktop/skills/<slug>/` 是事实源** — 本项目只读,不复制/搬家
2. **功能级覆盖 persona** — skill 有自带人设就用 skill 的,关掉 Obsidian 关卡层 (`deep=False`)
3. **subprocess 调用 skill 脚本** — 不重写,保持 skill 作为独立 Claude Desktop skill 也能跑

---

## 4 层分工

```
事实源层 (~/Desktop/skills/<slug>/)
  └── SKILL.md
  └── references/*.md      (可选,给 AI 看的方法论)
  └── scripts/*.sh / *.py  (可选,subprocess 调)
  └── assets/               (可选,模板/图等资源)

编排层 (backend/services/)
  ├── skill_loader.py              ← 统一 skill 加载 + 10 分钟缓存
  ├── <slug>_pipeline.py           ← AI 调用编排 (每 step 一个函数)
  └── <slug>_scripts.py (可选)     ← subprocess 调 skill 下的脚本

API 层 (backend/api.py)
  └── /api/<slug>/{skill-info, analyze, write, ...}

UI 层 (web/factory-<slug>-v2.jsx)
  └── Page<Slug> 覆盖式定义 + sidebar 入口
```

---

## 5 步接入范式

### Step 1: 确认 skill 就位

- `~/Desktop/skills/<slug>/SKILL.md` 存在
- skill 目录名以 `-学员版` 结尾的跳过 (那是给学员的,不是清华哥自用)
- 决定 3 个标识:
  - **slug**: 目录名,可中文 (如 "热点文案改写V2")
  - **api_prefix / key**: python/js 标识符,ASCII (如 "hotrewrite")
  - **page_id**: sidebar + factory-app route 的 id,通常 == api_prefix
    (例外: touliu-agent 的 page_id="ad" 沿用旧投流入口)

### Step 2: 跑骨架生成器

```bash
python3 scripts/add_skill.py \
  --slug "<中文 slug>" \
  --key <api_prefix> \
  --icon <emoji> \
  --label "<sidebar 显示名>"
```

做 7 件事(全幂等):
1. 验证 skill 目录存在
2. 生成 `backend/services/<key>_pipeline.py` — analyze/write 2 步模板
3. 生成 `web/factory-<key>-v2.jsx` — 3 步 UI + WfRestoreBanner
4. 注册到 `backend/api.py` — import + 3 个 endpoint
5. 注册 `shortvideo/ai.py` `DEFAULT_ENGINE_ROUTES` (analyze→deepseek, write→opus)
6. 注册 sidebar `factory-shell.jsx` NAV_MAIN
7. 注册 `factory-app.jsx` case + `index.html` script src

### Step 3: 调 pipeline 的 prompt

打开 `backend/services/<key>_pipeline.py`,根据实际 SKILL.md 改:
- `analyze_input` 的 JSON schema (angles 数量/字段视 skill 要求)
- `write_output` 的 system prompt (注入哪些 references? 哪些约束?)
- 返回数据结构 (是否需要 self_check / notes / word_count 等)

参考现有 4 个 pipeline 的风格:
- `wechat_pipeline.py` — 完整 5 Phase 大型 skill
- `hotrewrite_pipeline.py` — 3 步 · SKILL.md 自带完整方法论
- `voicerewrite_pipeline.py` — 3 步 · 2 角度限制 · 7 项自检清单
- `touliu_pipeline.py` — 批量生成 · 结构分配 · lint 质检 · 6 维终检

### Step 4: 前端页面定制

`web/factory-<key>-v2.jsx` 已有 3 步骨架,根据实际需要:
- 增/减 step (公众号 8 步,其他 skill 2-3 步)
- 每个 step 的字段显示根据 pipeline 返回结构
- 加独特功能 (如 touliu 的结构分配饼图,wechat 的段间配图真生图等)

### Step 5: 登记到 registered_skills.py

在 `backend/services/registered_skills.py` 的 `REGISTERED_SKILLS` 列表加一项:

```python
{
    "slug": "<中文 slug>",
    "api_prefix": "<key>",
    "page_id": "<sidebar_id>",
    "icon": "<emoji>",
    "label": "<sidebar 显示名>",
    "subtitle": "<首页卡片一句话描述>",
    "steps": <step 数量>,
    "has_scripts": <bool>,
}
```

自动效果:
- `/api/skills/catalog` 把新 skill 算进 installed
- 首页 SkillCenter 新加一张卡
- `tests/test_skills_smoke.py` 自动跑这个 skill 的完整性检查

---

## Route Key 命名规范

`<key>.<action>` 格式,action 常见:
- `analyze` — 分析输入 + 给切入选项 (通常 DeepSeek)
- `write` — 长文主体生成 (通常 Opus)
- `self-check` — 自检/评分 (通常 DeepSeek · 结构化 JSON)
- `plan-*` — 规划辅助内容 (如配图 prompt)
- `generate` — 批量生成 (如投流 10 条)

默认映射在 `shortvideo/ai.py::DEFAULT_ENGINE_ROUTES`,用户可通过
`settings.json` 的 `engine_routes` 字段覆盖。

---

## 测试策略

每接入 1 个 skill 自动获得:
- `test_skills_smoke.py` 参数化测试 (目录/模块/endpoint/jsx 完整性)

可选自己加:
- `tests/test_<key>_pipeline.py` — 针对该 skill 的结构化单元测试
  - 不打真 AI · 测 `_extract_json` 边界/prompt context 体积/返回字段

---

## 红线

❌ **不做**:
- 推微信草稿箱 / 发飞书消息 / 自动发布到任何外部平台 (除非用户明确点按钮触发)
- 改写 skill 源文件 (那是清华哥/skill 维护者的域)
- 在 Python / JSX 里内嵌 skill 的大段 prompt (要走 skill_loader 读文件)
- 为未接入 skill 自己编 prompt / 造 schema

✅ **该做**:
- subprocess 调 skill 的 scripts,不重写
- skill 事实源改动后,本项目下次调用自动 pick up(10 分钟 mtime 缓存)
- 每 commit 跑 `pytest tests/test_persona.py tests/test_wechat_skill.py`
- 交互变化自主判断,在 commit message 里写明 "我选 X, 理由 Y"

---

## 故障排查

**跑 add_skill.py 报"锚点未找到"**

某个注册文件结构改了。手动检查 `backend/api.py` / `factory-shell.jsx` 等,
或参考已接入 skill 的写法 (hotrewrite 是最干净的参考)。

**sidebar 不显示新 skill**

浏览器 **强制刷新** (Shift+刷新) — 默认浏览器会缓存旧 jsx。

**`/api/<key>/*` 返回 404**

旧 `:8000` 进程没启动 `--reload`,重启:
```bash
kill $(lsof -ti:8000)
cd /Users/black.chen/Desktop/neironggongchang
nohup .venv/bin/uvicorn backend.api:app --host 127.0.0.1 --port 8000 --reload --log-level info > /tmp/neirong-8000.log 2>&1 &
```

**Opus 调用 503**

本地 OpenClaw proxy 走了系统代理。已在 `shortvideo/claude_opus.py` 修复
(`httpx.Client(trust_env=False)`)。若仍 503,检查 proxy 进程:
```bash
lsof -ti:3456 | xargs ps -p
```

---

_Maintainer: 清华哥 · 这份手册本身也是 D-010 范式的产物_
