# Mac mini 团队内测版架构设计 (v1.0)

> 本文档是 11 轮三方讨论的收口产物,作为 M0~M3 实施的最终蓝图。
> 参与者:Opus 4.7(claude-opus-4-7)、gpt-5.5、清华哥(决策)
> 状态:**🎯 v1.0 定稿 · gpt-5.5 v0.7 review 确认无 P1/P2 阻断 · 可进入 M0 实施**
> 一旦定稿,任何代码改动须以本文档为准;反之改文档不改代码不算落地。
>
> **v1.0 定稿(2026-04-30):**
> - gpt-5.5 v0.7 review 结论:"没有新的 P1/P2 阻断项,v0.7 可以定 v1.0"
> - v0.7 → v1.0 仅 1 条 P3 文案残留修订:line 632 旧"bcrypt 返回 False"表述改为"抛 ValueError,verify_password 兜底"(避免实施时有人按旧文案敲)
> - 无机制变更、无 schema 变更、无验收变更
> - **本版本作为 M0 实施基准。任何后续偏差必须回写到本文档,不允许代码先行**
>
> **v1.0 增补(2026-04-30 · gpt-5.5 v1.0 review 两轮后):**
>
> **第 1 轮增补:**
> - 新增 §0.7「迁移总路径」——把分散在 M0/M1 的迁移操作串成 6 步序列,引入 Tailscale 作为 admin 运维通道(不是团队访问通道,职责与 Cloudflare Tunnel 不重叠)
> - 对应 M1 前置新增"admin 自装 Tailscale + Mac mini 入 tailnet"30 分钟,不计入 M1 主工时
>
> **第 2 轮增补:**
> - 新增 §0.6「迁移防腐层 SOW」——回答"清华哥还在持续开发,该怎么分阶段实施"。把完整迁移拆成"防腐层(锁规范,2.5-3 d 现在做)"+"延期项(物理迁移 + 团队功能,业务窗口再做)"
> - Phase 1 名字改成"代码资产安全 + audit"(原"audit-only"名不副实)
> - Phase 2 前端 API_BASE 改造**不能**直接默认空串(会立即打断当前 8001 开发环境),用 smart default:本地 8001 自动回 8000,生产 Caddy 走同源
> - Phase 3 加 rollback drill 验收(备份能打开 + 抽查作品库 + 失败可恢复,"备份存在 ≠ 能救命")
> - 新增 4 条防腐层红线(R1-R4):禁止新写 `127.0.0.1:8000` / `/Users/` / 裸 StaticFiles / 无 owner 新表
>
> **两轮增补共同点:** 不改任何机制/schema/验收,只把"实施分阶段策略"和"物理迁移路径"显式化
>
> **v1.1 修订(2026-04-30 · Phase 2 完成后,用户洞察触发的路线变更):**
> - **新增 §0.8「干净迁移路线」**——Phase 3 历史路径迁移**取消**,改走"Mac mini 全新空 DB"
> - 触发原因:用户提出"我本来就要重建素材库,旧 DB 是混乱档案,不需要搬"
> - 这一变更绕过了前 11 轮 review 的隐含前提("如何安全迁移")
> - **Phase 1 + Phase 2 已做 5 笔 commit 全部保留**——防腐层在新机器上更刚需
> - 总工时 13.5 d → ~13 d,**总风险降级**(无 DB 改写动作)
> - v1.0 旧路线降级为 fallback,文档保留作为"如未来真要迁数据"参考
>
> **11 轮收敛轨迹:**
>
> | 版本 | 增量 | 总行数 | 主修 |
> |---|---|---|---|
> | v0.1 | — | 863 | 路线收口(13 章 + 工时表) |
> | v0.2 | +199 | 1062 | 网络层 8 个机关(handle_path/header_up/CORS) |
> | v0.3 | +155 | 1217 | 规格一致性 8 颗螺丝(token_hash/migrations append/material_assets) |
> | v0.4 | +63 | 1280 | 实施级 5 条细缝(含 1 条安全级:`/media/works.db` 裸取) |
> | v0.5 | +135 | 1415 | 启动钥匙(bootstrap)+ 权限口径(dhv5 admin-only)+ 锁续命(commit) |
> | v0.6 | +100 | 1515 | 结构性顺序(placeholder admin + 激活)+ 4 条配套 |
> | v0.7 | +99 | 1614 | 3 条 import/语法/异常硬错误(`_vN1` 顺序、bcrypt ValueError、PEP 621) |
> | **v1.0** | **+0** | **1614** | **P3 文案残留 → 定稿** |
>
> **v0.6 → v0.7 修订(已合并,见下):**
> 1. 🔴 **P1:`_vN1_m2_owner_columns` 在 `_MIGRATIONS` 列表之后定义 → 模块 import 直接 NameError**。
>    实测项目既有 callable(`_v3/_v4/_v5`)都是先 def 后 `_MIGRATIONS`(`migrations.py:353/379/401` vs `425`),v0.7 改回这个顺序。
> 2. **P2:placeholder hash `!disabled` 在 bcrypt 4.x 中会抛 `ValueError: Invalid salt`,而不是返回 False → 登录 500 而非 401**。
>    新增密码校验工具函数 `_verify_password()`,把 `(ValueError, TypeError)` 一律当作"凭据无效"返回 False;login API 必须用这个函数,不能裸 `bcrypt.checkpw()`。
> 3. **P3:`pyproject.toml` 现有 PEP 621 `[project] dependencies = [...]` 数组(line 6),不是子表**。
>    v0.6 写的 `[project.dependencies]` 是错的 toml stanza,改成往现有数组里追加 `"bcrypt>=4.1",`。
>
> **新增 1 条验收:** M2 `import sanity check` —
> `python -c "from backend.services.migrations import apply_migrations, _MIGRATIONS"` 必须不报 NameError;
> 干净空库跑 `apply_migrations()` 完成后 `SELECT id, email FROM users WHERE id=1` 必须返回 `(1, 'bootstrap@local.invalid')`。
>
> **v0.5 → v0.6 修订(已合并,见下):**
>
> **核心结构性修订(1 条 · 真正解决 M2 启动顺序):**
> 1. **M2 启动顺序与 `apply_migrations()` 打架**——v0.5 设计"先建表 + 回填 → 然后 bootstrap admin",
>    但 `apply_migrations()` 一口气跑完,**无法在中间停下来**。新方案:
>    - **migration 内插入 disabled placeholder admin (id=1)**,email=`bootstrap@local.invalid`、password_hash=`!disabled`(非合法 bcrypt → 永远登不上)
>    - 回填 `owner_id=1` 在同一 migration 内完成,FK 完整,无人工窗口
>    - `bootstrap_admin.py` 改成"激活 placeholder":只 UPDATE id=1 的 email/name/password_hash;再次运行检测到非 placeholder 直接拒绝
>    - 三个矛盾(鸡生蛋 + FK 顺序 + 自动 migration)一次打平
>
> **必修 4 条(配套):**
> 2. M2 owner migration 改 callable(`_vN_m2_owner_columns`),先 `PRAGMA table_info` 再 ALTER;**`materials` 必须真加 owner_id 列**(v0.5 漏了 ALTER 但已写 UPDATE,会炸 "no such column")
> 3. `bcrypt>=4.1` 加进 `requirements.txt` 和 `pyproject.toml`(实测都没有,bootstrap_admin.py 一跑就 ImportError)
> 4. `bootstrap_admin.py` 用 `shortvideo.db.get_connection()`,不要自己 `Path("data/works.db")` 直连(避开多 DB 路径切换的坑)
> 5. §5.6 M3 验收加 dhv5 两条:member 访问 `/skills/dhv5/outputs/...` 必须 403,admin 访问正常
>
> **v0.4 → v0.5 修订(已合并,见下):**
> **必修 3 条:**
> 1. **首个 admin 鸡生蛋问题** — v0.4 流程"admin 生成邀请码"前提是已经有 admin。新增 §4.0 `bootstrap_admin.py` 一次性 CLI,M2 第一步必须先做
> 2. **`/skills/dhv5/outputs` 权限自相矛盾** — v0.4 既写"admin + owner 可见"又写"放行任意登录"。实测 `source_skill='dhv5'` 在 works 表 0 条 → 没法走 owner 反查 → V1 直接 **admin-only**(V2 待 dhv5 改造写 works 表后再加 owner)
> 3. **`heartbeat()` 漏 `conn.commit()`** — Python sqlite3 默认隐式事务,UPDATE 后不 commit 等于其他连接看不到,锁 10 分钟后被清理 → 长任务还在跑 → 下一个任务再抢进来双跑
>
> **顺手非阻断 1 条:**
> 4. `ALTER TABLE tasks ADD COLUMN waiting_for_lock` 走 callable migration(参考 `_v4_asset_identity` 模式),先 `PRAGMA table_info` 检测列再 ALTER,避免半迁移/测试库二次执行 `duplicate column`
>
> **v0.3 → v0.4 修订(已合并,见下):**
> **必修 3 条(其中 #1 是安全级):**
> 1. 🔴 **媒体鉴权 `work is None` 时不能 fallthrough** — 否则 `/media/works.db`、`/media/main.db`、`/media/settings.json`、`/media/videos/*.log` 全部被登录用户裸取。改成"必须 works/material_assets 命中才放行,否则 404"
> 2. `resource_locks.holder_task_id INTEGER` 错 — 实测 `tasks.id` 是 32 字符 uuid TEXT(`16d49d6fd7784239ad26e0e10e350423`),改 `TEXT`,函数签名同步改 `task_id: str`
> 3. 资源锁内部规格冲突 — 表格写 `video_render`/`cosyvoice` 并行 `≤ 2` 但 `lock_key PRIMARY KEY` 天然单持有者;`queue_length()` 查 `tasks.waiting_for_lock` 但 schema 没该字段。V1 全部并发 1 + 给 tasks 加 `waiting_for_lock TEXT`
>
> **顺手 2 条:**
> 4. Cloudflare Free 配额(50 用户、日志 24h)写为"实施当天复核",不当长期事实源
> 5. `material_assets` 非数字 user_id 直接归 admin(`'1'`),避免出现无主素材让 member 查不到
>
> **v0.2 → v0.3 修订(已合并,见下):**
> **必修 4 条:**
> 1. Session cookie 名 / token hash 校验三处不一致 → 统一 `cookies.get("session")` + `sha256` + `get_by_token_hash`
> 2. `material_assets.user_id` 实测 1633 条全是 `"qinghua"`(不是 NULL)→ migration 改 `IS NULL OR = 'qinghua'`
> 3. 资源锁不能 SELECT 后 INSERT(竞态)→ 独立 `resource_locks` 表 + `BEGIN IMMEDIATE` + `INSERT OR IGNORE` 原子抢
> 4. `resolve_data_path()` 相对路径也要防 `../` → 解析后 `relative_to` 校验仍在 DATA_DIR
>
> **顺手 4 条:**
> 5. macOS 防火墙不要 `--setblockall on`(会挡 SSH/屏幕共享),改靠监听地址兜底
> 6. Caddy 静态前端加 `try_files {path} /index.html` 防 SPA 路由刷新 404
> 7. M0 备份验收改 `PRAGMA integrity_check` + restore 查询,不依赖 `.recover`
> 8. 文档尾部版本号同步
>
> **v0.1 → v0.2 修订(已合并,见下):**
> Caddy 监听 / handle 不剥前缀 / 删 header_up / 先删 mount 再加路由 /
> schema 走 migrations.py / material_assets 复用 user_id / token_hash / CORS 收口

---

## 0. 背景与定位

### 0.1 起源

`neironggongchang` 当前是**清华哥本地工厂**:跑在他 macOS 开发机上,深度依赖
`~/Desktop/skills/`、`~/Desktop/清华哥知识库/`、本地浏览器登录态(Dreamina/即梦/微信公众号)、
本地 CosyVoice 模型推理。**它不是网站,是个长在 macOS Desktop 上的工具集**。

经 5 轮架构讨论得出:**最匹配的演进路线是把它升级成 Mac mini 托管的团队内测版**——
工厂不动,把入口打开给团队成员通过浏览器使用。

### 0.2 范围(SCOPE)

本设计**只做**以下事:

- 5-10 人**内部团队**通过公网域名访问
- 三类角色(admin / member / guest)
- 邀请码 + 邮箱密码注册登录
- 知识库目录级 ACL
- 作品/任务/素材的 owner_id 隔离
- 资源锁(防多人并发撞 Playwright/视频/微信推送等)
- 数据备份与基础审计

### 0.3 明确不做(NON-GOALS)

- ❌ 千人 SaaS / 对外学员开放注册
- ❌ 短信验证码登录
- ❌ 自定义角色 / 复杂 RBAC 引擎(Casbin/Oso)
- ❌ 文档级 / 单条作品级 ACL
- ❌ skill 结构改造(manifest.json 等)
- ❌ 多 Mac mini 集群部署
- ❌ 邮件验证邮箱、邮件找回密码(admin 手动重置即可)

### 0.4 总架构图

```
团队成员浏览器 (5-10 人)
        │
        ▼
 Cloudflare Access (网络门禁,白名单邮箱)
        │
        ▼
 https://gongchang.poju.ai
        │
        ▼
 Mac mini 上的 cloudflared (出站隧道)
        │
        ▼ http://127.0.0.1:8080 (loopback only,局域网无法直连)
        │
 Caddy (本机反向代理)
   ├─ /api/*       → 127.0.0.1:8000  (handle,不剥前缀)
   ├─ /media/*     → 127.0.0.1:8000  (M1 透传 / M3 改鉴权代理 + 先删 mount)
   ├─ /skills/*    → 127.0.0.1:8000  (M1 透传 / M3 同样先删 mount)
   └─ /            → Caddy 直 serve  ~/.../web/  (退役 8001)
        │
        ▼
 FastAPI (账号 + 权限 + 业务逻辑)
        │
        ▼
 SQLite (WAL) + 本地 skill + 本地知识库 + 本地模型
```

### 0.5 路线图(13 天 ± 1)

| 阶段 | 名称 | 工时 | 关键交付 |
|---|---|---|---|
| **M0** | 代码与数据资产安全 | 2 天 | GitHub Private + 数据洗白 + 配置 env 化 |
| **M1** | 同源公网入口 | 2.5 天 | Caddy 同源 + Tunnel + Access + 防火墙 |
| **M2** | 团队账号与权限 | 4 天 | 邀请码 + session + 三角色 + KB ACL + owner_id |
| **M3** | 运行安全与运维 | 5 天 | 媒体鉴权 + 资源锁 + WAL 三件套 + 审计 + 登录态监控 |
| | | **13.5 天** | |

### 0.6 迁移防腐层 SOW(2026-04-30 增补 · 实施分阶段策略)

> **本节性质:** v1.0 § 7 的 13.5 天工时表是"一气呵成"的总账。
> 但现实是清华哥仍在持续开发新功能,**不会一气呵成做完整迁移**。
> 本节回答一个具体问题:**先做哪几步能锁住"不再产生新债",其他可以延后到业务窗口?**
>
> 来源:gpt-5.5 v1.0 review 收尾——"加,而且要加。这对你现在这种还在持续迭代的状态很关键。"

#### 0.6.1 目标

> **先锁住"继续开发不会再产生迁移债",不等于马上团队上线。**

完整迁移 = 防腐层(锁规范)+ 物理迁移(Mac mini/Tailscale/Cloudflare)+ 团队功能(M2/M3)。
**前者是地基,后两者可以延后**。

#### 0.6.2 Phase 1:代码资产安全 + audit(0.5 d)

(注:本 Phase 含 `.gitignore` 修改和 GitHub push,**不是纯只读**。命名取"资产入库 + 路径审计"两层动作。)

**动作清单:**
- [ ] 补 `.gitignore`:`vendor/`、`data/main.db`、`data/works.db`、`*.mp4`、`renders/`、`.playwright-cli/`、`screenshots/*.jpg`
- [ ] secrets 扫:`git grep -iE "api[_-]?key|token|cookie|password|secret" -- ':!tests/' ':!docs/'`
- [ ] 大文件清查:`git ls-files | xargs -I{} du -k "{}" | sort -rn | head -20`
- [ ] 创建 GitHub Private 仓库,push 当前 branch
- [ ] 写 `scripts/audit_data_paths.py`(v1.0 § 2.2 规约)
- [ ] 跑 audit → `audit_data_paths.report.md` + `.json`

**Phase 1 验收:**
- [ ] `git remote -v` 有 GitHub Private origin
- [ ] secrets scan 输出为空(无明文 key/token)
- [ ] audit 报告里所有 work 都属于 7 类之一,无 `unclassified`
- [ ] 备份当前机器(Time Machine 或 rsync 一份完整 `~/Desktop/neironggongchang/` 到 NAS / 移动盘)— **Phase 3 之前的最后一道兜底**

#### 0.6.3 Phase 2:同源与路径写入规范(1.5-2 d)

**动作清单:**

**(a) 前端 API_BASE 同源化(v1.0 § 1.3 修订:不能直接默认空串)**

> **关键(gpt-5.5 v1.0 review 指出):** 你现在本地是前端 `:8001` + 后端 `:8000`,
> 没有 Caddy。如果默认 `""` 同源,浏览器会打 `http://localhost:8001/api/...` → 404。
> **会立即打断你当前的开发环境**。

正确改法 — 用 smart default,本地 8001 自动回 8000:

```js
// web/factory-api.jsx 第 3 行
const stored = (typeof localStorage !== "undefined")
                 ? localStorage.getItem("api_base") : null;
const isLocalWeb = location.hostname === "127.0.0.1"
                   || location.hostname === "localhost";
const API_BASE =
    stored                                                    // localStorage 覆盖优先
    || (isLocalWeb && location.port === "8001"
        ? "http://127.0.0.1:8000"                             // 本地 8001 → 8000
        : "");                                                // 生产 Caddy → 同源
```

行为:
- 本地开发(`http://localhost:8001`)→ API 仍走 `http://127.0.0.1:8000` ✅
- 生产 Caddy(`https://gongchang.poju.ai`)→ API 走同源 `/api/...` ✅
- localStorage `api_base` 设值 → 覆盖以上(开发者临时切环境)✅

替代方案:**本地也起 Caddy 统一入口**(端口 8080,监听 127.0.0.1),那时默认 `""` 就 OK。
M1 实施 Mac mini 时本来就要起 Caddy,提前在本地起一份当于做了"半步 M1"。

**(b) 后端媒体 base env 化**
- [ ] `backend/services/wechat_scripts.py:499` `_MEDIA_PREVIEW_BASE = os.getenv("MEDIA_PUBLIC_BASE", "")`
- [ ] `.env.example` 加 `MEDIA_PUBLIC_BASE=`(生产留空 = 相对路径,本机调试可填 `http://127.0.0.1:8000`)

**(c) 路径解析层**
- [ ] 新建 `backend/services/path_resolver.py::resolve_data_path()`(v1.0 § 2.4 完整 7 种输入实现)
- [ ] `backend/api.py:1651 _work_to_api_dict` 改造,所有 `Path(w.local_path).exists()` 走 `resolve_data_path`
- [ ] `update_work()` / `upsert_work()` / `insert_work()` 三处入口,写库前先 normalize 绝对路径 → 相对

**(d) env 化清单(v1.0 § 1.4 全套)**
- [ ] `.env.example` 加全:`MEDIA_PUBLIC_BASE` `OPUS_BASE_URL` `DATA_DIR` `KB_ROOT` `ASSETS_LIB_ROOT` `APP_ENV` `ALLOWED_ORIGIN`

**Phase 2 验收:**
- [ ] 当前 `:8001` 开发环境继续能用(API 调通)
- [ ] grep `127.0.0.1:8000` 字面量,只剩 Phase 2(a) 那行 smart default 一处
- [ ] 新写入 DB 的 path 字段全是相对路径(写一条新作品验证)
- [ ] `.env.example` 列出所有 env 变量

#### 0.6.4 Phase 3:历史路径迁移(0.5 d)

**前置条件:Phase 2 必须先完成**。否则旧代码读相对路径会炸。

**动作清单:**
- [ ] 写 `scripts/migrate_work_paths.py`(v1.0 § 2.3 规约)
- [ ] **强制备份**(用 `sqlite3.Connection.backup()` API,不是 shell `cp`):
      `data/_backups/works_<ts>.db` + iCloud Drive 一份
- [ ] **rollback drill**(gpt-5.5 v1.0 review 要求 · 新增):
      在动 prod 库前,**先临时 restore 备份到 `/tmp/works_test.db`**,
      用 sqlite3 打开 `SELECT COUNT(*) FROM works`,数字对得上才算备份能救命
- [ ] 跑 `migrate_work_paths.py --dry-run` → 看 changed/skipped/manual 三类报告
- [ ] 跑 `migrate_work_paths.py --apply`
- [ ] 验证 `SELECT COUNT(*) FROM works WHERE local_path LIKE '/Users/%'` = 0
- [ ] Playwright 进作品库,抽查 30 条作品缩略图加载 ≥ 90%
- [ ] **失败 rollback 演练**(可选但建议):
      故意把 `data/works.db` 重命名,从 `_backups/` 拷回,验证 1 分钟内能恢复服务

**Phase 3 验收:**
- [ ] `WHERE local_path LIKE '/Users/%'` = 0
- [ ] `WHERE thumb_path LIKE '/Users/%'` = 0
- [ ] `WHERE user_id = 'qinghua' OR user_id NOT GLOB '[0-9]*'`(material_assets) = 0
- [ ] 缩略图加载率 ≥ 90%
- [ ] **rollback drill 通过:从备份还原后,作品库 API 返回数据正常**

#### 0.6.5 延期项(无业务窗口压力)

| 延期项 | 何时做 | 触发条件 |
|---|---|---|
| Mac mini 装机 + Tailscale | 任意时机 | admin 有 1 天空 + 装备到位 |
| M2 团队账号(邀请码 + 三角色 + KB ACL + owner_id 真隔离) | 业务窗口 | 当真有第一个团队成员要用时 |
| M3 媒体鉴权 + 资源锁 + WAL 三件套 + 审计 + 登录态监控 | M2 之后 1 周内 | M2 完成 |
| Cloudflare Tunnel + Access | M2 上线前 1 周 | 给团队真实访问权限前 |

#### 0.6.6 防腐层红线(继续开发期硬约束)

**Phase 1-3 完成后,任何新增代码不得违反以下 4 条:**

🔴 **R1 · 不许写 `127.0.0.1:8000` / `localhost:8000` 字面量**
- 例外:Phase 2(a) 的 smart default 那一行,以及测试文件里的 `mock_server`
- 检测:`grep -rn "127\.0\.0\.1:8000\|localhost:8000" --include="*.py" --include="*.jsx" backend/ web/` 必须只输出豁免行

🔴 **R2 · 不许写 `/Users/` 绝对路径到 DB**
- 任何 `update_work(local_path=...)` / `insert_work(local_path=...)` 必须先经 normalize
- DB 里 path 字段永远只能是相对路径或 `/media/x` 形式

🔴 **R3 · 不许新加裸 `app.mount("/路径", StaticFiles)`**
- 现有 3 处 mount(`api.py:143/148/153`)是债,M3 要拆
- 新功能要暴露文件 → 加路由,走 `serve_media` 同款"白名单 + owner 校验"模式

🔴 **R4 · 新加业务表必须留 owner 字段**
- 新表(任何业务数据,如新 skill 产出、新统计表)
- schema 里就要带 `owner_id INTEGER REFERENCES users(id)` 或 `user_id TEXT`(沿用 material_assets 风格)
- 默认值或 migration 回填到 admin (id=1)

**这 4 条进项目 PR review checklist。** 任何违反必须有显式 TODO + 在本文档登记。

#### 0.6.7 总账

- 防腐层 = Phase 1 + 2 + 3 = **2.5-3 天**
- 完成后:**继续开发"想写脏都写不进去"**(R1-R4 + Phase 2 的基础设施压住)
- 团队上线相关功能(M2/M3 + Mac mini + Cloudflare)= 10-11 天,**业务窗口期再做**
- **总成本和"一气呵成 13.5 天"一样,但业务零空窗**

---

### 0.7 迁移总路径(2026-04-30 增补 · v1.0 review 后)

> **本节性质:** gpt-5.5 在 v1.0 review 后指出"零件都在文档里,迁移操作顺序还不够显眼"。
> 本节没有新机制,只把分散在 M0/M1/M3 的迁移路径串成一条线,实施时不会迷路。
> Tailscale 是本节明确的新角色——**admin 运维通道**(不是团队访问通道)。

#### 链路全景

```
[当前:macOS 开发机]                          [目标:Mac mini 团队内测]
│                                              │
├─ GitHub Private  ──────── git clone ───────▶ │  (只代码,不含资产)
│                                              │
├─ Tailscale tailnet ─── admin SSH/rsync ────▶ │  (admin 运维通道)
│                                              │
├─ rsync via Tailscale ── 私有资产 ──────────▶ │
│  · ~/Desktop/skills/                         │
│  · ~/Desktop/清华哥知识库/                    │
│  · ~/Desktop/我的内容库/                      │
│  · data/  (M0 洗白后的)                      │
│                                              │
[团队成员 5-10 人]                              │
│                                              │
└─ Cloudflare Tunnel + Access ◀────────────── │  (团队访问通道,M1 末打开)
   https://gongchang.poju.ai
```

#### 6 步迁移序列

| 步骤 | 动作 | 通道 | 所属阶段 | 时长 |
|---|---|---|---|---|
| 1 | GitHub Private 推送代码(不含敏感资产) | 公网 (HTTPS) | M0 | 0.5 d(已含) |
| 2 | admin 装 Tailscale,Mac mini 入 tailnet | Tailscale | M1 前置 | 30 min |
| 3 | Mac mini `git clone` + `pip install -e .` + `apply_migrations` | Tailscale SSH | M1 day 1 | 0.5 d(含 §1) |
| 4 | rsync `skills/` / 知识库 / 素材库 / 洗白后 data/ 到 Mac mini | Tailscale | M1 day 1 | 0.5 d(含 §1) |
| 5 | 通过 Tailscale 内测跑通(Caddy 内网、bootstrap admin、跑一次完整任务) | Tailscale | M1 day 2 | 0.5 d(含 §1) |
| 6 | 配 Cloudflare Tunnel + Access,团队访问 `gongchang.poju.ai` | 公网 (CF) | M1 day 2-3 | 0.5 d(含 §1) |

#### 关键约束(实施前必须理解)

1. **Tailscale ≠ Cloudflare Tunnel,职责不重叠**
   - Tailscale = admin 运维通道:SSH、rsync、调试、临时 port-forward
   - Cloudflare Tunnel + Access = 团队访问通道:浏览器登录、跑业务
   - 两者并存终生(M3 之后也是),不要试图合并

2. **GitHub 永远不放敏感资产,即使是 Private 仓库**
   - `.env`、DB、媒体、`vendor/`、`~/Desktop/skills/`、知识库、素材库——全部走 rsync,不走 git
   - 防 GitHub 泄漏 + 防 admin 切换设备时遗忘"这个目录是不是也得搬"
   - `.gitignore` 是技术保障,**默认不放**是流程保障

3. **步骤 5 → 6 之间是"内测 → 公网"的关键开关,不能跳过**
   - 如果没经过步骤 5(只 admin 内网验证),直接开步骤 6
   - 团队第一眼看到的就可能是坏的——浏览器登录态过期、CosyVoice 没启动、防火墙挡了某端口等
   - 步骤 5 是 admin 给自己留的"踩坑窗口",必须先踩完再上线

4. **rsync 不要 `--delete`(防误删)**
   - 第一次推荐:`rsync -avzP <src>/ <mac-mini>:<dst>/`(不删 Mac mini 端多出的文件)
   - 后续增量同步同上
   - 如果要 mirror,必须先在 Mac mini 上 `cp -R` 一份带时间戳的兜底

5. **私有资产清单(rsync 必搬,git 必不搬)**

   | 路径 | 大小估算 | 必要性 | rsync 频率 |
   |---|---|---|---|
   | `~/Desktop/skills/` | 数百 MB | 必须 | M1 一次性,后续按需 |
   | `~/Desktop/清华哥知识库/` | GB 级 | 必须 | M1 一次性,后续日同步或周同步 |
   | `~/Desktop/我的内容库/` | GB 级 | 必须 | M1 一次性,后续按需 |
   | `data/`(M0 洗白后) | 1.2 G | 必须 | M1 一次性 |
   | `vendor/CosyVoice/` 模型权重 | 1.3 G | 必须 | M1 一次性 |
   | 浏览器登录态(Dreamina/微信公众号 cookie) | KB 级 | 必须 | **不能 rsync,必须 Mac mini 上重新扫码登录一次**——cookie 跟设备指纹绑定 |

#### 与 M0/M1 工时表的对应关系

本节不增加新工时——它只是把 §7 工时表里已有的"GitHub 备份(M0)"+"Mac mini 装环境 + rsync(M1)"+"Cloudflare 配置(M1)"串起来。同时显式补一条:

- **M1 前置:admin 自装 Tailscale + Mac mini 入 tailnet(30 分钟,不计入 M1 主工时)**

这一步在 v1.0 §3 没单列,但实操上必须最先做(否则 M1 day 1 第一行命令"`git clone`"该怎么跑?Mac mini 摆在那儿没法 SSH 过去)。

### 0.8 干净迁移路线(v1.1 修订 · 2026-04-30 Phase 2 完成后决策)

> **本节性质:** 用户在 Phase 2 完成后提出关键洞察——
> **"我本来就要重建素材库,旧 DB 是混乱档案,不需要搬。"**
>
> 这一洞察直接绕过了前 11 轮 review 的隐含前提("如何安全迁移历史 DB")。
> 经三方对齐(Opus 4.7 + gpt-5.5 + 清华哥):**Phase 3 历史路径迁移取消**,
> 改走"干净迁移"路线。本节固化新路线,旧路线作为 fallback 保留。

#### 0.8.1 触发与决策

**用户洞察(原话):**
> "我能在那台电脑上面重建一个空的数据库吗?现在其实也只是一个我电脑里面比较混乱的一个数据。
>  我到另外一台电脑呢,我就把我需要的素材都迁移过去,然后用 ai 给他去打标签,
>  放入知识库,放入数据库……我本身就要重建这个素材库的。"

**前 11 轮 review 的盲区:** 一直在优化"如何更安全地迁移 411 条污染路径 + 1633 条素材记录",
但**没人质疑过"是否需要迁移这些数据"**。这个前提一旦质疑,Phase 3 失去存在意义。

**决策:**
- ✅ **Phase 3 历史路径迁移**:取消(降级为 fallback)
- ✅ **Mac mini 上启动 = 全新空 DB**:`apply_migrations()` 自动建空表 + placeholder admin
- ✅ **旧电脑保留 6 个月作为档案柜**:有需要参考某条历史作品时手动去拿
- ✅ **Phase 1 + Phase 2 已做工作全部保留**:防腐层在新机器上更刚需

#### 0.8.2 新路线总览(干净迁移)

| 类别 | 内容 | 走什么通道 |
|---|---|---|
| **迁过去**(生产资料) | 代码 | GitHub Private clone |
| | `~/Desktop/skills/` | rsync via Tailscale |
| | `~/Desktop/清华哥知识库/` | rsync via Tailscale |
| | 精选素材(用户筛选过的) | rsync via Tailscale |
| | `.env` | 手工新建,照 `.env.example` 配 |
| | 浏览器登录态(Dreamina/微信公众号) | 在 Mac mini 上**重新扫码**,不能 rsync |
| **不迁过去**(历史档案) | `data/works.db` (4.1M, 397 条作品记录) | 留旧电脑 |
| | `data/main.db` (空文件) | 留旧电脑 |
| | `data/_audit/` 报告 | 留旧电脑 |
| | 旧 `data/videos/`、`data/wechat-images/` 等媒体 | 留旧电脑(用户筛选后部分搬) |
| | 各种 `*.log`、`screenshots/`、`demo_videos/` | 留旧电脑 |
| | `material_assets` 索引(1633 条) | 留旧电脑,Mac mini 重扫生成 |

**Mac mini 启动后第一周做的事:**
1. `git clone` + `pip install -e .` + `apply_migrations()` → 空 DB + placeholder admin
2. `bootstrap_admin.py` 激活真实 admin
3. 通过素材库扫描功能,把搬过去的精选素材重新入库
4. 用 AI 给素材打标签、归类
5. 知识库自动接入(`KB_ROOT` env 指向搬过去的目录)

#### 0.8.3 与旧路线的差异(快速对照)

| 维度 | 旧路线(完整迁移) | 新路线(干净迁移 v1.1) |
|---|---|---|
| **Phase 3 历史路径迁移** | 0.5 d,迁 411 条作品路径 | ❌ 取消 |
| **DB 历史数据风险** | UPDATE 字段值,1% 硬盘炸时丢 | ✅ 0 风险(新空 DB,没历史数据可丢) |
| **总工时** | 13.5 d | **~13 d**(省 0.5 d) |
| **placeholder admin** | 占位让 owner_id 回填命中 | 仍要,但**纯粹用于 bootstrap_admin.py 激活流程** |
| **owner_id 回填** | UPDATE works/tasks/materials SET owner_id=1 | **0 行可回填**(空表),migration 仍跑但是 noop |
| **material_assets.user_id 'qinghua' 回填** | 1633 行 UPDATE | ❌ 取消(空表) |
| **rollback drill** | 必做 | ❌ 取消(没东西可 rollback) |
| **备份要求** | Phase 3 启动前必须有 works.db 备份 | ❌ 取消(没历史 DB 可丢) |
| **skill / 知识库迁移** | rsync 必做 | rsync 必做(生产资料) |
| **精选素材迁移** | 隐含包含 | **显式列为必做**,但只迁文件不迁索引 |

#### 0.8.4 Phase 1 + Phase 2 已做工作的适用性

**全部保留,且新机器上更需要。** 理由:防腐层防的是"未来代码继续滚出脏数据",
新机器上你正要建空 DB,绝对不能让新 DB 第一周又脏。

| 已做(GitHub commit) | 在 v1.1 路线下的作用 |
|---|---|
| GitHub Private 代码备份 (`2bb7566`) | ✅ Mac mini clone 代码靠它 |
| `.gitignore` 收紧 (`2bb7566`) | ✅ Mac mini 同样需要 |
| v1.0 设计文档 (`6755d16`) | ✅ 仍是架构基准,本 §0.8 是其修订 |
| `path_resolver.py` (`d5ff212`) | ✅ 新 DB 写入也走它,**防止新 DB 又出绝对路径** |
| `audit_data_paths.py` (`d5ff212`) | 🟡 降级为"旧电脑历史盘点工具",Mac mini 不需再跑 |
| `_normalize_path_for_db` (`57ee1fa`) | ✅ 新机器上比旧机器更刚 — 第一条新作品就 normalize |
| `factory-api.jsx` smart default (`57ee1fa`) | ✅ Mac mini Caddy 同源 + 本机 8001 兜底,直接复用 |
| `wechat_scripts.py` env 化 (`57ee1fa`) | ✅ Mac mini 通过 `.env` 配 `MEDIA_PUBLIC_BASE` |
| `.env.example` 全清单 (`57ee1fa`) | ✅ Mac mini 第一次启动时照着配 |

**结论:11 轮 review 没白做。船的航向变了,船本身仍在。**

#### 0.8.5 关键修订点(细节落地)

**§4.0 placeholder admin 含义微调:**
- v1.0:placeholder 是为了让 owner_id 回填 FK 命中
- v1.1:placeholder 是为了让 `bootstrap_admin.py` 有"激活"对象,流程更优雅
- migration SQL 不变(仍 INSERT id=1 placeholder)

**§4.1 owner migration 行为变更:**
- v1.0:`UPDATE works SET owner_id = 1 WHERE owner_id IS NULL` 影响 397 行
- v1.1:同 SQL,但**影响 0 行**(空 DB),migration 仍跑但是 noop
- 这是设计上的零成本兼容——同样代码同样跑,只是新机器上没历史数据

**§5.6 M3 验收清单不变:**
- M3 验收里"知道 URL 的非 owner 用户访问 `/media/<work>.mp4` 返回 403" 这条仍要测
- 测试方法变成"member 创建一条新作品,另一 member 试着访问"——本来就该这么测

**`audit_data_paths.py` 角色变更:**
- v1.0:Phase 1 必跑,生成报告供 Phase 3 migrate 消费
- v1.1:**保留代码作为档案盘点工具**,旧电脑跑过的报告仍有参考价值
- Mac mini 上不需要再跑(空 DB 跑出来全是 0)

**`migrate_work_paths.py` 命运:**
- v1.0:计划 Phase 3 写
- v1.1:**永不写,从设计文档里降级到 "fallback 方案" 章节**

#### 0.8.6 风险提示

🟡 **风险 1:旧电脑里可能有"金矿"**

旧 `data/works.db` 里有你过去半年的:
- 写过的爆款选题(`title` / `original_text`)
- 改写过的好文案(`final_text`)
- AI 帮你改稿的历史(`ai_calls` 表)
- 微信公众号已发文章的草稿(`source_skill='wechat'`)

**缓解措施:**
- 旧电脑**保留 6 个月**作为档案柜,不清 `data/`
- 如果某天想参考某条历史作品,**手动**去旧电脑找(不需要"系统迁移")
- 6 个月后如果一次都没用到,就可以放心擦除

🟡 **风险 2:浏览器登录态不能 rsync,必须手动重做**

Dreamina/即梦/微信公众号 cookie 跟设备指纹绑定,rsync 过去也用不了。
Mac mini 上必须**重新扫码登录每个外部服务**。这是一次性动作,但要在 M1 day 1 安排时间。

🟡 **风险 3:精选素材的"精选"标准要你自己定**

旧 `data/wechat-images/` (115M)、`data/dreamina/` (33M) 这些都是历史素材。
**只搬你确认要保留的**,不要全 rsync 过去——否则等于把"混乱"原样搬过去,
违背了本路线"重新开干净工作室"的初心。

#### 0.8.7 Fallback 条件:何时回到旧路线

如果未来出现以下情况,可以回退到 v1.0 旧路线(完整迁移):
- 你发现历史作品库里有大量需要日常引用的内容
- 团队成员要求看到 admin 历史产出
- 业务流程上有"作品时间序列"分析需求

回退方法:`migrate_work_paths.py` 仍可按 v1.0 §2.3 规约写出来,Phase 1 audit 报告
还在(旧电脑 `data/_audit/`),想做迁移仍有完整路径。

#### 0.8.8 总账(v1.1)

- 总工时:**13.5 d → ~13 d**(省 0.5 d Phase 3)
- 总风险:**降级**(无 DB 改写动作,无历史数据丢失风险)
- 已做 commit:**全部保留**(d5ff212 / 57ee1fa / 6755d16 / 2bb7566 / 9a409b3)
- 文档版本:**v1.0 主体保留,§0.8 作为修订增补,旧路线降级为 fallback**

---

## 1. 同源化改造清单(P0)

### 1.1 命门列表(基于 5 轮代码核验)

| 命门 | 文件:行 | 现状 | 改造方向 |
|---|---|---|---|
| 1. 前端默认 API_BASE | `web/factory-api.jsx:3` | `localStorage.getItem("api_base") \|\| "http://127.0.0.1:8000"` | 默认改成空串(同源) |
| 2. /media /skills 拼接也走 API_BASE | `web/factory-api.jsx:156` | `${API_BASE}${s}` | 同源后自动 OK |
| 3. 公众号预览 base 硬编码 | `backend/services/wechat_scripts.py:499` | `_MEDIA_PREVIEW_BASE = "http://127.0.0.1:8000"` | 改 env (`MEDIA_PUBLIC_BASE`) |
| 4. 前端静态服务监听全网卡 | `scripts/start_web_nocache.py:31` | `socketserver.TCPServer(("", PORT), ...)` | **退役,Caddy 直 serve `web/`** |
| 5. 后端 host(已经是好的) | `scripts/start_api.sh:17` | `--host 127.0.0.1` ✅ | 保持 |

### 1.2 反向代理路由表

**关键决策(v0.2 修订):**
- Caddy **只监听 `127.0.0.1:8080`**,不监听 `:443` 也不监听 `0.0.0.0`。
  这样局域网用户**绝无可能**绕过 Cloudflare Access 直连 Caddy。
- 用 **`handle`(不是 `handle_path`)**——后端真实路由是 `/api/health`(实测 `api.py:356`),
  `handle_path` 会剥前缀变 `/health` → 后端 404。
- **不写全局 `header_up`**——cloudflared 已经自动透传 `CF-Connecting-IP`,
  Caddy `reverse_proxy` 默认会保留请求头给上游。FastAPI 中间件直接读即可。

```caddy
# /etc/caddy/Caddyfile (Mac mini)
# Caddy 只监听 loopback。cloudflared 出站到 http://127.0.0.1:8080。
127.0.0.1:8080 {
    # API(handle:不剥前缀,保留 /api/...)
    handle /api/* {
        reverse_proxy 127.0.0.1:8000
    }

    # 媒体:M1 透传到后端 StaticFiles;M3 后端先删 mount,再加鉴权路由
    handle /media/* {
        reverse_proxy 127.0.0.1:8000
    }

    # skill 静态(同上,M3 收窄)
    handle /skills/* {
        reverse_proxy 127.0.0.1:8000
    }

    # WebSocket 升级(预留,目前项目无 WS)
    @websockets {
        header Connection *Upgrade*
        header Upgrade websocket
    }
    handle @websockets {
        reverse_proxy 127.0.0.1:8000
    }

    # 静态前端兜底(必须放最后,匹配优先级低于 handle 显式路径)
    root * /Users/black.chen/Desktop/neironggongchang/web
    # SPA history mode 兜底:未来 /login /register /works 等路径刷新不 404
    # 静态文件命中就 serve 文件,没命中的虚拟路由全部 fallback 到 index.html
    try_files {path} /index.html
    file_server
}
```

**为什么不需要 `header_up CF-Connecting-IP`:**
- Cloudflare Edge → cloudflared 时已设置 `CF-Connecting-IP: <真实客户端IP>`
- cloudflared → Caddy 时保留这个头
- Caddy `reverse_proxy` 默认透传所有上游请求头给后端
- FastAPI 中间件 `request.headers.get("cf-connecting-ip")` 直接拿到
- **链路上没有人需要"重新写"这个头,只需要"不丢"**

### 1.3 前端改造(factory-api.jsx)

```js
// 改造前
const API_BASE = (typeof localStorage !== "undefined" && localStorage.getItem("api_base"))
                 || "http://127.0.0.1:8000";

// 改造后:默认同源(空串),localStorage 仅供本机开发覆盖
const API_BASE = (typeof localStorage !== "undefined" && localStorage.getItem("api_base")) || "";
```

副作用:
- 所有 `${API_BASE}${path}` 拼接的结果会变成相对路径(`/api/...`),浏览器自动以当前域作为 host
- 本机开发不受影响:开发者在 `localStorage.api_base` 里塞 `http://127.0.0.1:8000` 仍可用

### 1.4 后端 env 化清单

| env 变量 | 默认值 | 消费者 |
|---|---|---|
| `MEDIA_PUBLIC_BASE` | `""`(空 = 相对路径) | `wechat_scripts.py::_media_preview_url_for_path` |
| `OPUS_BASE_URL` | `http://localhost:3456/v1` | `backend/services/settings.py:42` |
| `DATA_DIR` | 项目根 + `/data` | 全局 |
| `KB_ROOT` | `~/Desktop/清华哥知识库/` | `night_runners.py / preference.py` |
| `ASSETS_LIB_ROOT` | `~/Desktop/我的内容库(勿动)/` | `materials_service.py` |
| `APP_ENV` | `dev`(本机) / `prod`(Mac mini) | CORS 切换、调试日志开关 |
| `ALLOWED_ORIGIN` | `https://gongchang.poju.ai`(prod) | CORS 中间件白名单 |

### 1.5 CORS 收口(v0.2 新增)

**现状:** `backend/api.py:124` 是 `allow_origins=["*"]`——本地开发凑合,公网生产**不能这样**。
理由:
- 浏览器跨域携带 cookie 需要 `allow_credentials=True`,而它**和 `["*"]` 互相冲突**(标准禁止)
- 任意第三方页面能发同源请求滥用 API
- 同源化后,生产其实**完全不需要跨域**

**改造方案:**

```python
# backend/api.py
import os

APP_ENV = os.getenv("APP_ENV", "dev")
ALLOWED_ORIGIN = os.getenv("ALLOWED_ORIGIN", "https://gongchang.poju.ai")

if APP_ENV == "dev":
    # 本机开发:任意 origin,但不带 cookie(避免和真生产环境状态混淆)
    cors_origins = ["*"]
    cors_credentials = False
else:
    # 生产:只允许部署域名,允许 cookie(M2 session 需要)
    cors_origins = [ALLOWED_ORIGIN]
    cors_credentials = True

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=cors_credentials,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

**M1 实施时一并改完。** 否则 M2 cookie session 会被 CORS 直接挡住,debug 起来很费时间。

---

## 2. M0 数据资产审计与路径迁移

### 2.1 现状(实测,2026-04-30)

| 字段 | 污染 | 处置 |
|---|---|---|
| `works.local_path` 项目内绝对路径 | **271 条** | 自动转相对 |
| `works.thumb_path` 项目内绝对路径 | **138 条** | 自动转相对 |
| `works.local_path` 指向 `shortvideo-studio` | **6 条** | 人工:能找到文件就搬,找不到标 archived |
| `works.local_path` 指向 `quanliuchengkelong` | **1 条** | 人工:同上 |
| `works.original_text` / `final_text` 内嵌 `/Users/...` | 待审计 | 单独列一类,大概率少 |
| `material_assets.abs_path` 绝对路径 | 1633 条 | **不洗,Mac mini 上重 scan 即可**(这是设计,不是污染) |
| `materials.meta_json` | **字段不存在** | 无需处理 |

### 2.2 脚本规约 1:`audit_data_paths.py`(只读)

**职责:** 扫描 `works.db` 所有路径字段 + 富文本字段,分类输出。**不写库**。

**输入:** 无参(默认扫 `data/works.db`)

**输出:**
- `audit_data_paths.report.md`(给人看)
- `audit_data_paths.report.json`(给 migrate 脚本消费)

**分类(共 7 类):**

| 类别 | 含义 | 后续动作 |
|---|---|---|
| `relative` | 已是相对路径或 `/media/x` | 无需动作 |
| `absolute_inside_data` | 绝对路径,在当前 `DATA_DIR` 下 | 自动转相对 |
| `absolute_outside_exists` | 绝对路径,在 `DATA_DIR` 外但文件存在 | 人工:搬入或标记 |
| `absolute_outside_missing` | 绝对路径,在 `DATA_DIR` 外且文件不存在 | 自动标 `status=archived` |
| `old_project_shortvideo` | 指向 `shortvideo-studio` 老项目 | 人工 |
| `old_project_quanliuchengkelong` | 指向 `quanliuchengkelong` 老项目 | 人工 |
| `embedded_in_text` | 内嵌在 `original_text/final_text` 里的 `/Users/...` | 人工 + 文档级替换 |

**JSON 输出 schema:**
```json
{
  "scanned_at": "2026-04-30T12:00:00Z",
  "data_dir": "/Users/black.chen/Desktop/neironggongchang/data",
  "totals": { "works": 395, "polluted": 416 },
  "categories": {
    "relative": [<work_id>, ...],
    "absolute_inside_data": [{ "id": 12, "field": "local_path", "old": "...", "new_relative": "videos/a.mp4" }, ...],
    ...
  }
}
```

### 2.3 脚本规约 2:`migrate_work_paths.py`

**职责:** 消费 `audit_data_paths.report.json`,执行迁移。**直接改原表(方案 A)**,但必须满足:

- 启动时**强制备份**:用 `sqlite3.Connection.backup()` API(**不用 shell `cp`**,WAL 模式下 cp 可能拷出半截 DB)
  - 备份目标:`data/_backups/works_<timestamp>.db`
  - 同时拷一份到外部异地(iCloud Drive 或 NAS)
- 默认 `--dry-run`(只打印将做什么,不写库)
- 加 `--apply` 才真改
- 加 `--report-only` 只跑审计不迁移
- apply 完成后输出三类明细:
  - `changed`: 实际改了多少行
  - `skipped`: 类别为 relative/manual 的,跳过
  - `manual`: 需要人工决定的,列出全部

**事务保护:** 整个迁移在单一 `BEGIN ... COMMIT` 里跑,中途崩了 ROLLBACK,不留半截状态。

### 2.4 `resolve_data_path()` 规约(7 种输入)

写一个统一函数,**所有读取 `local_path` / `thumb_path` 的地方都走它**:

```python
# backend/services/path_resolver.py
from pathlib import Path
from urllib.parse import urlparse, unquote
from typing import Optional

def resolve_data_path(value: Optional[str], data_dir: Path) -> Optional[Path]:
    """把 DB 里存的 path 字符串解析成可用的 Path 对象。

    支持的输入(7 种):
      1. None / "" / 空白           → return None
      2. "videos/a.mp4"             → DATA_DIR / "videos/a.mp4"
      3. "/media/videos/a.mp4"      → DATA_DIR / "videos/a.mp4"(去前缀)
      4. "videos/a.mp4?t=12"        → 拆 query,DATA_DIR / "videos/a.mp4"
      5. 绝对路径 in DATA_DIR       → 转成 DATA_DIR / 相对部分
      6. 绝对路径 outside DATA_DIR  → return None(认为已失效)
      7. http(s)://...              → return None(URL 不是文件)
    """
    if not value or not value.strip():
        return None

    s = value.strip()

    # 7. URL 直接 None
    if s.startswith(("http://", "https://")):
        return None

    # 4. 拆 query
    if "?" in s:
        s = s.split("?", 1)[0]

    # 3. 去 /media/ 前缀
    if s.startswith("/media/"):
        s = s[len("/media/"):]

    p = Path(s)
    data_dir_resolved = data_dir.resolve()

    # 5/6. 绝对路径
    if p.is_absolute():
        try:
            rel = p.resolve().relative_to(data_dir_resolved)
            return data_dir / rel
        except ValueError:
            return None  # 6. 在 DATA_DIR 外,认为失效

    # 2. 相对路径(v0.3 修订:也要防 ../ 跳出 DATA_DIR)
    candidate = (data_dir / p).resolve()
    try:
        candidate.relative_to(data_dir_resolved)
        return candidate
    except ValueError:
        return None  # 相对路径解析后跳出 DATA_DIR,认为非法
```

### 2.5 `_work_to_api_dict` 改造点

引用:`backend/api.py:1651`

```python
# 改造前
if w.local_path:
    p = Path(w.local_path)
    if p.exists():
        local_url = _work_media_url(p)
    else:
        local_missing = True

# 改造后
from backend.services.path_resolver import resolve_data_path
from shortvideo.config import DATA_DIR

if w.local_path:
    p = resolve_data_path(w.local_path, DATA_DIR)
    if p and p.exists():
        local_url = _work_media_url(p)
    else:
        local_missing = True
```

同时:**`update_work(local_path=...)` 调用前必须 normalize**(写入 DB 前就转相对路径,
避免新数据继续脏)。这条改在 `backend/services/works_repo.py` 或 `update_work` 实际定义处。

### 2.6 富文本字段扫描

```sql
-- 审计 SQL
SELECT id, type, source_skill,
       CASE WHEN original_text LIKE '%/Users/%' THEN 'orig' END AS orig_hit,
       CASE WHEN final_text    LIKE '%/Users/%' THEN 'final' END AS final_hit
FROM works
WHERE original_text LIKE '%/Users/%' OR final_text LIKE '%/Users/%';
```

发现命中的:
- 单独列出来,人工过一遍
- 大概率是公众号文章里嵌的 `<img src="/Users/...">`
- 改造方案:做一个 `rewrite_local_paths_in_html()`,把 `/Users/...neironggongchang/data/...` 替换成 `/media/...`

### 2.7 M0 验收标准

- [ ] `git remote -v` 显示 GitHub Private 仓库
- [ ] `.gitignore` 已忽略 `vendor/`、`data/main.db`、`data/works.db`、`*.mp4`、`renders/`、`.playwright-cli/`
- [ ] `git status -s` 输出干净(无 `??` 大文件)
- [ ] secrets 扫描通过(grep API key/token/cookie 无泄漏)
- [ ] 跑完 audit 后,JSON 报告里**所有 work_id 都属于 7 类之一**,无 `unclassified`
- [ ] 跑完 migrate apply 后,`SELECT COUNT(*) FROM works WHERE local_path LIKE '/Users/%'` = **0**
- [ ] 跑完 migrate apply 后,`SELECT COUNT(*) FROM works WHERE thumb_path LIKE '/Users/%'` = **0**
- [ ] 备份文件 `data/_backups/works_<ts>.db` 存在,`PRAGMA integrity_check` 返回 `ok`,临时 restore 后 `SELECT COUNT(*) FROM works` 数字与原库一致(`.recover` 仅作灾难修复工具,不进日常验证流程)
- [ ] **Playwright 进作品库**(8001 本机仍跑),抽查 30 条作品的缩略图加载 ≥ 90% 成功
- [ ] env 变量已加入 `.env.example` 和 `README` 的"前置依赖"段落

---

## 3. M1 同源公网入口

### 3.1 Caddy 安装与配置

```bash
# Mac mini 上
brew install caddy
sudo cp Caddyfile /etc/caddy/Caddyfile
sudo brew services start caddy
```

完整 Caddyfile 见 §1.2。

### 3.2 Cloudflare Tunnel

```bash
# 一次性
brew install cloudflared
cloudflared tunnel login                          # 浏览器授权
cloudflared tunnel create gongchang-mini          # 生成 tunnel ID
cloudflared tunnel route dns gongchang-mini gongchang.poju.ai

# 创建 ~/.cloudflared/config.yml
cat > ~/.cloudflared/config.yml <<EOF
tunnel: <tunnel-id>
credentials-file: ~/.cloudflared/<tunnel-id>.json
ingress:
  - hostname: gongchang.poju.ai
    service: http://127.0.0.1:8080      # 指向 Caddy loopback,纯 HTTP 不需要 TLS
  - service: http_status:404
EOF

# 启动 + launchd 自启
sudo cloudflared service install
```

### 3.3 Cloudflare Access(网络门禁)

- 进入 Cloudflare Zero Trust 控制台
- 创建 Self-hosted application,域名 `gongchang.poju.ai`
- 策略:**Email Allow List**(列出团队 5-10 人邮箱)
- 会话时长:24h(每天扫一次邮箱重登)
- 上线初期严格;M2 应用内登录稳定后可以放宽

**外部配额(v0.4 修订:实施当天复核):**
- v0.3 写"Cloudflare Free 支持 ≤ 50 用户、日志 24h"作为长期事实——错。
- 这是外部产品的定价/限额,Cloudflare 随时可能调整,不能当本架构的固定假设。
- **实施 M1 当天**到 [Cloudflare Access pricing](https://www.cloudflare.com/sase/products/access/)
  和 Zero Trust 控制台**复核当时的免费额度和保留期**,把当时核到的数字写进 onboarding runbook。
- 团队 5-10 人这个量级,任何主流方案都够用,但配额数字本身不入设计文档。

### 3.4 macOS 防火墙(防局域网绕过 · v0.2 简化)

**关键洞察(v0.2):** Caddy 已经只监听 `127.0.0.1:8080`、backend 只监听 `127.0.0.1:8000`,
**它们都不接收任何外部传入连接**。cloudflared 是出站连接,也不需要为它开洞。
所以防火墙策略可以**最简**:

```bash
# 打开防火墙(普通启用即可,不要 setblockall)
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --setglobalstate on

# 验证
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --getglobalstate
```

**不要 `--setblockall on`(v0.3 修订):**
`setblockall` 会**连带挡掉 SSH、屏幕共享、Time Machine、Apple Remote Desktop** 等
正常运维通道。Mac mini 远程管理就靠这些,挡了你自己进不去。

**真正的安全保障来自"监听地址",不是 blockall:**
- backend uvicorn `--host 127.0.0.1`(只 loopback)
- Caddy `127.0.0.1:8080`(只 loopback)
- cloudflared 是出站连接,不监听
- → 局域网根本没有任何端口在监听对外,blockall 反而画蛇添足

**不需要为 cloudflared / Caddy 加任何例外**(它们都不监听对外)。

并且:`scripts/start_api.sh` 已经是 `--host 127.0.0.1`,继续保持。
**`scripts/start_web_nocache.py` 在 Mac mini 团队版上不再启动**(由 Caddy 直 serve)。

**自检:**
```bash
# 局域网另一台机器跑(应全部失败)
nc -zv <mac-mini-local-ip> 8000   # connection refused
nc -zv <mac-mini-local-ip> 8080   # connection refused
nc -zv <mac-mini-local-ip> 443    # connection refused / timeout
```

### 3.5 真实客户端 IP 透传

**链路:** 浏览器 → Cloudflare Edge → cloudflared(Mac mini)→ Caddy → FastAPI

**关键(v0.2):** 这条链上**没有人需要重写头**,只需要保证不丢:
- Cloudflare Edge 自动设 `CF-Connecting-IP: <真实IP>`
- cloudflared 透传给 Caddy
- Caddy `reverse_proxy` 默认透传上游请求头给 FastAPI(无需 `header_up`)
- FastAPI 中间件直接读

**uvicorn 启动参数(保留 v0.1):**
```bash
uvicorn backend.api:app \
  --host 127.0.0.1 --port 8000 \
  --proxy-headers \
  --forwarded-allow-ips "127.0.0.1"
```

**FastAPI 中间件:**
```python
@app.middleware("http")
async def extract_real_ip(request, call_next):
    # 优先级:CF-Connecting-IP > X-Forwarded-For 第一项 > request.client.host
    real_ip = (
        request.headers.get("cf-connecting-ip")
        or request.headers.get("x-forwarded-for", "").split(",")[0].strip()
        or (request.client.host if request.client else "")
    )
    request.state.real_ip = real_ip
    return await call_next(request)
```

**自检:** 部署后看后端日志,`request.state.real_ip` 应该是浏览器的真实公网 IP,
不是 `127.0.0.1`(那意味着头没透传)、也不是 cloudflared 节点的 IP。

### 3.6 M1 验收标准(13 条 · v0.2 修订)

- [ ] 远程电脑(非 Mac mini 本机、非内网)打开 `https://gongchang.poju.ai` 能加载页面
- [ ] 先过 Cloudflare Access 邮箱白名单
- [ ] 浏览器 DevTools Network 面板:**所有请求 host 都是 `gongchang.poju.ai`**,搜不到 `127.0.0.1` 或 `:8000`
- [ ] 公众号预览生成的 HTML 里**不再出现 `http://127.0.0.1:8000/media/...`**
- [ ] 局域网另一台机器 `nc -zv <mac-mini-local-ip> 8000` **connection refused**
- [ ] 局域网另一台机器 `nc -zv <mac-mini-local-ip> 8001` **connection refused**(Caddy 不监听 8001,backend 监听 127.0.0.1)
- [ ] 局域网另一台机器 `nc -zv <mac-mini-local-ip> 8080` **connection refused**(Caddy 监听 127.0.0.1:8080,不暴露)✨ **v0.2 新增**
- [ ] 局域网另一台机器 `nc -zv <mac-mini-local-ip> 443` **connection refused / timeout**(Mac mini 上根本没人监听 443)✨ **v0.2 新增**
- [ ] 浏览器控制台**无 mixed content 警告**(全 https,无 http 资源混入)
- [ ] `curl https://gongchang.poju.ai/api/health` 在没 Access cookie 时**应 302 到 Cloudflare 登录页**,不直接 200
- [ ] **`curl https://gongchang.poju.ai/api/health` 过 Access 后应返回 200**,而不是 404(证明 `handle` 没剥前缀)✨ **v0.2 新增**
- [ ] no-credit 页面(如作品库)能正常读数据
- [ ] 后端日志里看到的 `request.state.real_ip` 不是 `127.0.0.1`,是真实客户端 IP
- [ ] **`backend/api.py:124` 的 CORS 已切换到 env 控制,生产 `APP_ENV=prod` 时 `allow_origins=[...]` 只含 `https://gongchang.poju.ai`** ✨ **v0.2 新增**

---

## 4. M2 团队账号与权限

### 4.0 首个 admin 引导(v0.6 重写 · placeholder + 激活)

**v0.5 方案的结构性问题(gpt-5.5 v0.5 review 指出):**
原方案是"先 migration 建表 + 回填 → 中间停下来 → 跑 bootstrap_admin.py 创建 admin"。
但 `apply_migrations()` 是一口气跑完,**没有"中间停下来"的机制**。这导致:
- 回填 `owner_id=1` 时 `users` 表里还没有 id=1,FK 引用空挂
- 自动 migration 跟"等人手工 bootstrap"的语义打架
- 顺序错了就只能手工 SQL 救场

**v0.6 设计:placeholder + 激活**

**Step 1:** M2 第一个 migration 在建 users 表的同时,**直接 INSERT 一个 disabled placeholder admin (id=1)**:

```sql
INSERT OR IGNORE INTO users
  (id, email, password_hash, name, role, feature_flags, kb_paths, created_at)
VALUES
  (1, 'bootstrap@local.invalid', '!disabled', 'Bootstrap Admin',
   'admin', '{}', '["**"]', strftime('%s','now'));
```

关键:
- `email = bootstrap@local.invalid` — RFC 6761 保留的不可达域名,不会和真实用户冲突
- `password_hash = '!disabled'` — 不是合法 bcrypt 字符串。**注意:bcrypt 4.x 对此会抛 `ValueError: Invalid salt`,不是返回 False**。所有密码校验必须走 `verify_password()`(见本节"密码校验工具函数"),把 ValueError catch 成 False → 401,**永远登不上,且不会 500**
- `id = 1` — 显式指定,确保后续 `owner_id=1` 回填一定能引用到

**Step 2:** 同 migration 内立即回填 `owner_id=1`,FK 完整,无人工窗口。

**Step 3:** `scripts/bootstrap_admin.py` 改成"**激活 placeholder**",而不是 INSERT 新行:

```python
# scripts/bootstrap_admin.py (v0.6 重写)
"""
M2 启动钥匙:激活 id=1 的 placeholder admin 为真实 admin。

仅在 Mac mini 本机跑(SSH 进去),不暴露公网/网页入口。
"""
import argparse
import getpass
import time

import bcrypt  # 来自 requirements.txt — v0.6 同时补依赖

from backend.services.migrations import apply_migrations
from shortvideo.db import get_connection  # v0.6 修订:不自己 Path 直连

PLACEHOLDER_EMAIL = "bootstrap@local.invalid"
PLACEHOLDER_HASH = "!disabled"

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--email", required=True, help="真实 admin 邮箱")
    ap.add_argument("--name", required=True, help="真实 admin 显示名")
    args = ap.parse_args()

    # 先确保 migration 跑过,placeholder 已经存在
    apply_migrations()

    conn = get_connection()
    row = conn.execute(
        "SELECT id, email, password_hash FROM users WHERE id = 1"
    ).fetchone()

    if row is None:
        raise SystemExit(
            "id=1 不存在 — migration 是不是没跑到 M2?或者表被人工删过?"
        )

    _, current_email, current_hash = row

    # 双重检测:必须仍是 placeholder 才允许激活
    if current_email != PLACEHOLDER_EMAIL or current_hash != PLACEHOLDER_HASH:
        raise SystemExit(
            f"id=1 已经是真实 admin (email={current_email}) — 拒绝二次激活。\n"
            f"如果你确认要重置 admin 密码,用 admin 后台或单独写 reset_password.py。"
        )

    # 密码不从命令行参数传(bash history 留痕),交互输入
    pw1 = getpass.getpass("Password: ")
    pw2 = getpass.getpass("Confirm:  ")
    if pw1 != pw2 or len(pw1) < 8:
        raise SystemExit("两次密码不一致或少于 8 字符")

    pw_hash = bcrypt.hashpw(pw1.encode(), bcrypt.gensalt()).decode()
    now = int(time.time())

    conn.execute(
        "UPDATE users SET email=?, name=?, password_hash=?, last_login_at=NULL "
        "WHERE id=1",
        (args.email, args.name, pw_hash, ),
    )
    conn.commit()
    print(f"✅ admin activated: id=1 email={args.email}")

if __name__ == "__main__":
    main()
```

**v0.6 关键差异 vs v0.5:**

| 维度 | v0.5(错的) | v0.6(对的) |
|---|---|---|
| migration 后 users 表状态 | 空 | 已有 id=1 placeholder admin |
| 回填 `owner_id=1` | FK 空挂(id=1 不存在) | FK 命中 placeholder |
| bootstrap 行为 | INSERT 新行 | UPDATE id=1 placeholder |
| 重复运行 | "已有 admin" 拒绝 | "已激活" 拒绝(更精确,不挡多 admin 场景) |
| DB 连接 | `sqlite3.connect(Path("data/works.db"))` | `shortvideo.db.get_connection()` |
| migration 依赖 | 假设外部已跑 | 脚本内主动 `apply_migrations()` |

**安全约束(沿用 v0.5):**
- 只能在 Mac mini 本机跑(SSH 进去):`ssh mac-mini && python scripts/bootstrap_admin.py ...`
- 密码不接受命令行参数(`ps`、bash history 泄漏),只交互输入
- bcrypt + 至少 8 字符
- 已激活的 placeholder 拒绝二次激活

**依赖补充(v0.7 修订:pyproject 用 PEP 621 数组,不是子表):**

```
# requirements.txt 追加
bcrypt>=4.1
```

```toml
# pyproject.toml — 项目用的是 PEP 621 [project] dependencies = [...] 数组(line 6 实测)
# v0.6 写的 [project.dependencies] 是错的 toml stanza,会被 pip 忽略或报错
# 正确做法是在现有数组里追加一行:

[project]
name = "neironggongchang"
# ...
dependencies = [
    "httpx>=0.27",
    "python-dotenv>=1.0",
    # ... 现有依赖保持不变 ...
    "bcrypt>=4.1",     # ← v0.7 新增,追加在数组末尾
]
```

**密码校验工具函数(v0.7 修订:必须 catch ValueError,否则 login 会 500):**

bcrypt 4.x 对**畸形 hash**(如 placeholder 的 `!disabled`)会抛 `ValueError: Invalid salt`,
不是返回 False。如果 login API 裸调 `bcrypt.checkpw()`,登录请求会 500 而非 401,
而且攻击者可以通过 timing/error 探测 placeholder 状态。

**所有走密码校验的代码,必须用下面这个工具函数,禁止裸调 `bcrypt.checkpw`:**

```python
# backend/services/password.py (v0.7 新增)
import bcrypt

def verify_password(password: str, password_hash: str) -> bool:
    """安全的 bcrypt 校验,任何畸形 hash 一律返回 False。

    场景:
      - placeholder admin 的 hash 是 '!disabled'(故意非合法 bcrypt 字符串),
        bcrypt.checkpw 4.x 会抛 ValueError: Invalid salt
      - DB 里如果误存其他畸形数据(! 开头、空串、None 字符串等),也不应让 login 500
      - 一律 catch (ValueError, TypeError, AttributeError) → 返回 False
    """
    if not password or not password_hash:
        return False
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except (ValueError, TypeError, AttributeError):
        return False


def hash_password(password: str) -> str:
    """统一的密码哈希入口,bootstrap 和 admin 重置用同一个。"""
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
```

**login API 调用(伪代码):**
```python
from backend.services.password import verify_password

@app.post("/api/auth/login")
async def login(payload: LoginPayload):
    user = users_repo.find_by_email(payload.email)
    if user is None or not verify_password(payload.password, user.password_hash):
        # 同一个错误返回,无论是用户不存在还是密码错或 placeholder hash
        raise HTTPException(401, "邮箱或密码错误")
    # ... 创建 session ...
```

**安全约束:**
- placeholder admin 的 `!disabled` → `verify_password` 返回 False → 401
- 真实 admin 激活后 → `verify_password` 正常返回 True/False
- 任何"看起来格式不对的 hash" → False,不会 500

**对应 M2 验收(v0.7 增强):**

**Import sanity(v0.7 新增 · gpt-5.5 v0.6 review 要求):**
- [ ] `python -c "from backend.services.migrations import apply_migrations, _MIGRATIONS"` **不报 NameError**(P1 验证:callable 必须先 def 后被引用)
- [ ] 干净空库跑 `apply_migrations()` 完成后,`schema_version` 表里有 M2 对应的版本号
- [ ] 空库 + apply_migrations() 后,`SELECT id, email, password_hash FROM users WHERE id=1` 返回 `(1, 'bootstrap@local.invalid', '!disabled')`

**Bootstrap 流程:**
- [ ] migration 跑完,`SELECT COUNT(*) FROM works WHERE owner_id IS NULL` = 0(回填成功,FK 命中 placeholder)
- [ ] **未激活前**直接 `/login` 用 `bootstrap@local.invalid` + 任意密码,**返回 401(不是 500)**(P2 验证:`verify_password` catch 了 ValueError)
- [ ] `python scripts/bootstrap_admin.py --email <你> --name <你>` 激活后,id=1 的 email 变成 `<你>`,password_hash 是合法 `$2b$...` 字符串
- [ ] 第二次跑同命令应直接退出报"已激活,拒绝二次激活"
- [ ] 激活后用真实 email + 密码能在 `/login` 正常登录,并在后台生成邀请码

**依赖验证(v0.7 新增):**
- [ ] `pip install -r requirements.txt` 装出 bcrypt 4.1+
- [ ] `pip install -e .`(从 pyproject)也能装出 bcrypt(P3 验证:数组追加生效)
- [ ] `python -c "import bcrypt; print(bcrypt.__version__)"` ≥ 4.1

### 4.1 数据库 schema(新增 4 张表)

**v0.2 关键:所有 schema 变更必须 append 到 `backend/services/migrations.py::_MIGRATIONS`,
绝不直接 SQL 执行。** 该模块在 line 425 起的 `_MIGRATIONS` 列表是项目唯一事实源,
未来回滚 / 测试 / 新机器初始化都依赖它。

**Migration 添加方式:**

**v0.7 关键(P1):** callable 必须**先 `def` 后被 `_MIGRATIONS` 引用**。
项目既有 `_v3_pending_moves_review`(line 353)、`_v4_asset_identity`(line 379)、
`_v5_material_asset_profiles`(line 401)都在 `_MIGRATIONS = [...]`(line 425)**之前**定义。
否则 Python 模块 import 阶段就 `NameError: name '_vN1_m2_owner_columns' is not defined`。

```python
# backend/services/migrations.py

# ============================================================
# v0.7 修订:callable 必须在 _MIGRATIONS 之前定义,否则 import 即 NameError
# 顺序参考既有 _v3/_v4/_v5 (line 353/379/401 早于 _MIGRATIONS line 425)
# ============================================================

def _vN1_m2_owner_columns(con: sqlite3.Connection) -> None:
    """M2 给 works/tasks/materials 加 owner_id 并回填到 placeholder admin (id=1)。
    幂等:列已存在时跳过 ALTER。"""
    for table in ("works", "tasks", "materials"):
        cols = {row[1] for row in con.execute(f"PRAGMA table_info({table})").fetchall()}
        if "owner_id" not in cols:
            con.execute(
                f"ALTER TABLE {table} ADD COLUMN owner_id INTEGER REFERENCES users(id)"
            )

    # 回填:placeholder admin (id=1) 已经在前一条 migration 的 SQL 里 INSERT,FK 完整
    con.execute("UPDATE works     SET owner_id = 1 WHERE owner_id IS NULL")
    con.execute("UPDATE tasks     SET owner_id = 1 WHERE owner_id IS NULL")
    con.execute("UPDATE materials SET owner_id = 1 WHERE owner_id IS NULL")

    # material_assets 复用现有 user_id 字段(v0.2 决策),双覆盖 + 非数字归 admin
    con.execute(
        "UPDATE material_assets SET user_id = '1' "
        "WHERE user_id IS NULL OR user_id = 'qinghua'"
    )
    con.execute(
        "UPDATE material_assets SET user_id = '1' "
        "WHERE user_id IS NOT NULL AND user_id NOT GLOB '[0-9]*'"
    )


# ============================================================
# 然后才能 append 到 _MIGRATIONS
# ============================================================

_MIGRATIONS: list[tuple[int, str, str | "callable"]] = [
    # ... 已有 v1 baseline ...
    # ... 已有 v2, v3, v4, v5 ...
    (N, "M2: team users + invite_codes + sessions + events", """
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,             -- bcrypt
            name TEXT NOT NULL,
            role TEXT NOT NULL CHECK (role IN ('admin', 'member', 'guest')),
            feature_flags TEXT NOT NULL DEFAULT '{}',
            kb_paths TEXT NOT NULL DEFAULT '[]',
            failed_login_count INTEGER NOT NULL DEFAULT 0,
            locked_until INTEGER,
            created_at INTEGER NOT NULL,
            last_login_at INTEGER
        );
        CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

        CREATE TABLE IF NOT EXISTS invite_codes (
            code TEXT PRIMARY KEY,
            role_template TEXT NOT NULL,
            feature_flags_template TEXT NOT NULL DEFAULT '{}',
            kb_paths_template TEXT NOT NULL DEFAULT '[]',
            expires_at INTEGER NOT NULL,
            used_by INTEGER REFERENCES users(id),
            used_at INTEGER,
            created_by INTEGER REFERENCES users(id),
            created_at INTEGER NOT NULL
        );

        -- v0.2 修订:存 hash 不存明文 token,DB 泄漏不等于 session 被盗
        CREATE TABLE IF NOT EXISTS sessions (
            token_hash TEXT PRIMARY KEY,             -- SHA256(cookie 里的明文 token)
            user_id INTEGER NOT NULL REFERENCES users(id),
            expires_at INTEGER NOT NULL,
            ip TEXT,
            user_agent TEXT,
            created_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
        CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

        CREATE TABLE IF NOT EXISTS events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER REFERENCES users(id),
            cf_email TEXT,
            event_type TEXT NOT NULL,
            target_type TEXT,
            target_id TEXT,
            ip TEXT,
            user_agent TEXT,
            metadata TEXT,
            created_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_events_user ON events(user_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type, created_at DESC);

        -- v0.6 修订:同 migration 内插入 disabled placeholder admin (id=1)
        -- 解决"先建表 + 回填 owner_id" 与 "事后人工 bootstrap admin" 的顺序卡点
        -- email 用 RFC 6761 保留的 .invalid 域名,password_hash 故意非合法 bcrypt → 永远登不上
        INSERT OR IGNORE INTO users
            (id, email, password_hash, name, role, feature_flags, kb_paths, created_at)
        VALUES
            (1, 'bootstrap@local.invalid', '!disabled', 'Bootstrap Admin',
             'admin', '{}', '["**"]', strftime('%s','now'));
    """),
    # v0.6 修订:owner migration 改 callable,先 PRAGMA table_info 再 ALTER,幂等
    # 同时:materials 必须真加 owner_id 列(v0.5 漏了,会撞 'no such column')
    # v0.7 修订:_vN1_m2_owner_columns 在本列表之前定义(参考 _v3/_v4/_v5 模式)
    (N+1, "M2: works/tasks/materials 加 owner_id + 回填 placeholder admin", _vN1_m2_owner_columns),
]
```

**Cookie 协议(v0.2 新增):**

```
Set-Cookie: session=<明文 32 字节随机>;
            HttpOnly;        # JS 不可读
            Secure;          # 仅 HTTPS
            SameSite=Strict; # 严格防 CSRF
            Path=/;
            Max-Age=86400    # 24h
```

**校验流程:**
1. 客户端发请求带 `Cookie: session=<token>`
2. 后端 `hash = sha256(token)`
3. `SELECT user_id FROM sessions WHERE token_hash=? AND expires_at > now()`
4. 命中 → 注入 `request.state.user`

### 4.2 现有表加 owner_id(v0.2 修订:material_assets 不加新列)

**字段策略:**

| 表 | 现状 | v0.2 决策 |
|---|---|---|
| `works` | 无 owner | 加 `owner_id INTEGER` |
| `tasks` | 有 `user_id TEXT`(写死 `"qinghua"`,`tasks.py:106`) | 加 `owner_id INTEGER`,旧 `user_id` 列保留兼容期 1-2 个 release 后再删 |
| `materials`(旧表) | 无 owner | 加 `owner_id INTEGER`(数据少,4 条左右) |
| `material_assets`(新表,主) | **已有 `user_id TEXT`** | **复用 `user_id` 字段**,不加新列 |

**关键(v0.2 来自 gpt-5.5):** `material_assets.user_id TEXT` 已存在(实测 schema)。
重复加 `owner_id` 会造成"两个 owner 字段并存"的混乱。**统一约定:**

- `material_assets.user_id` 存 `users.id` 的字符串形式(如 `"1"`、`"42"`)
- 历史数据 `user_id IS NULL OR user_id = 'qinghua'` 的统一回填 `"1"`(admin)
- API 层做类型转换:`int(asset.user_id)` → 与 `users.id` 比较;非数字一律视为非法 owner

**v0.3 修订事实:**
实测 `SELECT user_id, COUNT(*) FROM material_assets GROUP BY user_id` 返回:
```
qinghua | 1633
```
**0 条 NULL,1633 条全是字符串 `"qinghua"`**。所以 v0.2 写的"`IS NULL` 回填"完全漏掉
所有现实数据。Migration 必须改成下面的 `IS NULL OR = 'qinghua'` 双覆盖。

**回填(v0.6:已迁入 callable migration `_vN1_m2_owner_columns`,见 §4.1):**

回填 SQL 不再分散写在 schema 字符串里,而是统一在 callable migration 中执行。
关键变化:
- materials 必须**先 ALTER 加列再 UPDATE**(v0.5 漏 ALTER 会炸)
- placeholder admin id=1 在前一条 migration 已插入,UPDATE 时 FK 完整
- material_assets 双 UPDATE(NULL/'qinghua' + 非数字)统一归 admin,避免无主素材

代码见 §4.1 末尾 `_vN1_m2_owner_columns(con)`。

**对应验收(v0.3 → v0.4):**
- 迁移后 `SELECT COUNT(*) FROM material_assets WHERE user_id = 'qinghua'` = **0**
- 迁移后 `SELECT COUNT(*) FROM material_assets WHERE user_id IS NULL OR user_id NOT GLOB '[0-9]*'` = **0**
  (v0.4:**完全没有非数字、也没有 NULL** 残留——避免无主素材)

**代码同步改造点:**
- `backend/services/tasks.py:106` 写死 `"qinghua"` → 改读 `request.state.user.id`
- `backend/services/materials_service.py` 所有创建路径,确保写入 `user_id = current_user.id`
- 查询过滤:member 角色一律加 `WHERE owner_id = ?` / `user_id = ?`,admin 不加

### 4.3 角色与权限矩阵

| 资源 / 操作 | admin | member | guest |
|---|---|---|---|
| 注册新邀请码 | ✅ | ❌ | ❌ |
| 查看用户列表 | ✅ | ❌ | ❌ |
| 改设置(AI 引擎、品牌色) | ✅ | ❌ | ❌ |
| 看自己作品 | ✅ | ✅ | ✅ |
| 看他人作品 | ✅ | ❌ | ❌ |
| 删自己作品 | ✅ | ✅ | ✅ |
| 删他人作品 | ✅ | ❌ | ❌ |
| 用 skill(根据 feature_flags) | 全开 | 部分 | 极少 |
| 看知识库根目录 | ✅ | 仅 kb_paths 白名单 | ❌ |
| 看素材库 | ✅ | ✅ | ❌ |
| 触发夜跑/定时任务 | ✅ | ❌ | ❌ |

### 4.4 注册/登录流程

```
admin 后台 → 点"生成邀请码"
  填:role + feature_flags + kb_paths + 有效期
  → 系统输出 8 位 code 例 "A7K9X2M4"
  ↓
admin 把 code 飞书发给小王
  ↓
小王打开 https://gongchang.poju.ai/register
  填:邀请码 + 邮箱 + 密码 + 姓名
  → 后端校验 invite_codes 未过期/未使用
  → bcrypt 哈希密码
  → INSERT users
  → UPDATE invite_codes SET used_by=user_id, used_at=now
  ↓
小王打开 /login
  邮箱 + 密码 → 后端 bcrypt 校验
  → 写 sessions 表 + 下发 HTTP-only cookie
  ↓
后续请求带 cookie → 中间件查 sessions → 注入 request.state.user
```

### 4.5 API 鉴权中间件

```python
# backend/middleware/auth.py (v0.3 修订:cookie 名 / hash 校验三处一致)
import hashlib
from fastapi import Request, Depends, HTTPException

def _sha256_hex(s: str) -> str:
    return hashlib.sha256(s.encode("utf-8")).hexdigest()

async def require_user(request: Request) -> User:
    # cookie 名固定 "session" (跟 §4.1 cookie 协议一致)
    token = request.cookies.get("session")
    if not token:
        raise HTTPException(401)

    # 客户端发送的是明文 token,DB 里只存 hash → 校验靠 hash 等比
    token_hash = _sha256_hex(token)
    sess = sessions_repo.get_by_token_hash(token_hash)
    if not sess or sess.expires_at < int(time.time()):
        raise HTTPException(401)

    return users_repo.get(sess.user_id)

async def require_admin(user: User = Depends(require_user)) -> User:
    if user.role != "admin":
        raise HTTPException(403)
    return user
```

**关键(v0.3):**
- Cookie 名:统一为 `"session"`(跟 §4.1 `Set-Cookie: session=...` 协议一致)
- 仓储方法名:**`sessions_repo.get_by_token_hash(hash)`**(不是 `get(token)`),
  避免有人把明文 token 直接当 PK 查
- 登录时下发:`token = secrets.token_urlsafe(32); db.insert(token_hash=sha256(token))`,
  cookie 里给浏览器的是明文 `token`,DB 里只存 hash,泄漏 DB 也无法重放

**所有写接口必须挂 `Depends(require_user)` 或 `Depends(require_admin)`**,不能只在前端隐藏按钮。

### 4.6 知识库 ACL

```yaml
# data/kb_acl.yaml
admin:
  - "**"

member_default:
  - "02 业务场景/**"
  - "07-知识Wiki/**"

# 私人区(只 admin):
# - "00 AI清华哥/**"
# - "06-人脉关系/**"

guest: []
```

API 在读 KB 前过这个 yaml,不在白名单返回 404 而非 403(防探测)。

### 4.7 设置页 admin-only

`backend/api.py` 中所有 `/api/settings/*` 写接口加 `Depends(require_admin)`,
读接口对 member 屏蔽敏感字段(opus_api_key、内部 URL 等)。

`web/factory-settings.jsx:5` 的前端硬编码密码**直接删掉**(已被后端鉴权替代)。

### 4.8 M2 验收标准(v0.2 增 4 条)

- [ ] 全新邀请码注册流程能跑通(Playwright 自动化)
- [ ] 用 member 账号登录,看不到 admin 后台入口
- [ ] 用 member 账号 `curl /api/admin/users` 返回 403
- [ ] 用 member 账号在作品库**只能看到自己创建的作品**(基于 owner_id)
- [ ] 用 guest 账号访问 `/api/kb/...` 返回 404
- [ ] 历史 395 条作品 `owner_id` 都不为 NULL
- [ ] 历史 tasks 表 `owner_id` 都不为 NULL,旧 `user_id` 列保留(兼容)
- [ ] **`material_assets.user_id` 历史 NULL 数据已回填 `"1"`(admin)** ✨ **v0.2**
- [ ] 失败登录 5 次后账号锁定 15 分钟
- [ ] 设置页里 AI 引擎相关字段对 member 隐藏
- [ ] `factory-settings.jsx:5` 硬编码密码已删除
- [ ] **`SELECT * FROM sessions` 字段名是 `token_hash`,不是 `token`**(确认 schema 走 v0.2)✨ **v0.2**
- [ ] **DB 里 `sessions.token_hash` 全为 SHA256 长度(64 字符 hex),没有任何明文 token 残留** ✨ **v0.2**
- [ ] **浏览器 DevTools Application > Cookies:`session` cookie 标记 HttpOnly + Secure + SameSite=Strict** ✨ **v0.2**
- [ ] **新建 schema 全部走 `migrations.py::_MIGRATIONS` 追加,`schema_version` 表能查到对应版本号** ✨ **v0.2**

---

## 5. M3 运行安全与运维

### 5.1 媒体鉴权代理(v0.2 修订:必须先删 mount)

**现状(实测):** `backend/api.py` 里有 **3 处 `app.mount` StaticFiles**,都要先卸下来:

| 行 | 当前代码 | 影响 |
|---|---|---|
| `api.py:143` | `app.mount("/media", StaticFiles(directory=str(DATA_DIR)), name="media")` | 抢 `/media/*` 路由,任何鉴权 GET 路由永远不被命中 |
| `api.py:148` | `app.mount("/skills/dhv5/outputs", StaticFiles(...), name="dhv5-outputs")` | 同上 |
| `api.py:153` | `app.mount("/skills/dhv5/brolls", StaticFiles(...), name="dhv5-brolls")` | 同上 |

**FastAPI 路由优先级:`mount` > `@app.get` 显式路由**。所以**必须先删 mount,再加路由**,
否则鉴权代理永远不被执行。

**改造步骤(必须按顺序):**

```python
# 步骤 1:删除 3 个 mount(api.py:143/148/153)
# - app.mount("/media", StaticFiles(...))                      # 删
# - app.mount("/skills/dhv5/outputs", StaticFiles(...))        # 删
# - app.mount("/skills/dhv5/brolls", StaticFiles(...))         # 删

# 步骤 2:加鉴权 GET 路由
from fastapi import HTTPException
from fastapi.responses import FileResponse

@app.get("/media/{path:path}")
async def serve_media(path: str, user: User = Depends(require_user)):
    """
    v0.4 安全修订(来自 gpt-5.5 v0.3 review):

    必须 works 或 material_assets 命中才放行。
    否则 /media/works.db /media/main.db /media/settings.json
    /media/videos/e2e_run_01.log 等"data 目录里所有非媒体文件"
    都会被登录用户裸取——这是严重信息泄漏。

    白名单原则:**只有出现在业务表里的文件路径,才视为合法媒体**。
    不在任何业务表里的文件 → 视为 data 目录的内部产物 → 一律 404。
    """
    # 1. 防 path traversal
    safe = (DATA_DIR / path).resolve()
    if not str(safe).startswith(str(DATA_DIR.resolve()) + "/"):
        raise HTTPException(404)
    if not safe.is_file():
        raise HTTPException(404)

    rel = str(safe.relative_to(DATA_DIR))

    # 2. 优先匹配 works.local_path / thumb_path
    work = works_repo.find_by_path(rel)
    if work is not None:
        if work.owner_id != user.id and user.role != "admin":
            raise HTTPException(403)
        return FileResponse(safe)

    # 3. 兜底匹配 material_assets.abs_path / thumb_path
    asset = material_assets_repo.find_by_rel_path(rel)
    if asset is not None:
        # asset.user_id 是字符串形式的 users.id(见 §4.2 约定)
        owner_match = (
            asset.user_id is not None
            and asset.user_id.isdigit()
            and int(asset.user_id) == user.id
        )
        if not owner_match and user.role != "admin":
            raise HTTPException(403)
        return FileResponse(safe)

    # 4. 谁也没命中 → data 目录内部文件,默认 404
    raise HTTPException(404)


# /skills/dhv5/outputs 同理
DHV5_OUTPUTS = Path.home() / "Desktop/skills/digital-human-video-v5/outputs"
DHV5_BROLLS  = Path.home() / "Desktop/skills/digital-human-video-v5/assets/brolls"

# v0.5 修订:dhv5 outputs/brolls 一律 admin-only
# 原因(实测):SELECT COUNT(*) FROM works WHERE source_skill LIKE '%dhv5%' = 0
# → dhv5 任务的产物当前不写 works 表,无法走 owner 反查
# → V1 用最严格的 admin-only,避免"先 admin/owner 后又放行任意登录"的自相矛盾
# → V2 等 dhv5 改造后写 works 表(D-094 后续),再放开成 owner 反查

@app.get("/skills/dhv5/outputs/{path:path}")
async def serve_dhv5_output(path: str, user: User = Depends(require_admin)):
    safe = (DHV5_OUTPUTS / path).resolve()
    if not str(safe).startswith(str(DHV5_OUTPUTS.resolve()) + "/"):
        raise HTTPException(404)
    if not safe.is_file():
        raise HTTPException(404)
    return FileResponse(safe)

@app.get("/skills/dhv5/brolls/{path:path}")
async def serve_dhv5_broll(path: str, user: User = Depends(require_admin)):
    safe = (DHV5_BROLLS / path).resolve()
    if not str(safe).startswith(str(DHV5_BROLLS.resolve()) + "/"):
        raise HTTPException(404)
    if not safe.is_file():
        raise HTTPException(404)
    return FileResponse(safe)
```

**性能优化(可选):** 大视频文件穿过 Python 会慢。可以用 X-Accel-Redirect 模式:
后端只做权限决策,response 加 `X-Accel-Redirect: /internal/<path>` 头,Caddy 内部重定向到
StaticFiles。但 Caddy 默认不支持 X-Accel,要用 `intercept_errors` + `handle_response`,
配置较复杂。**M3 V1 先用 FileResponse 直 stream,压力测过再决定是否优化。**

### 5.2 资源锁清单(5 类,共用 tasks DB)

**v0.4 修订:V1 全部并发 1**(来自 gpt-5.5 v0.3 review):

`resource_locks.lock_key` 是 PRIMARY KEY,**结构上天然只能 1 个持有者**。
v0.3 表里写的 `≤ 2` 跟 schema 矛盾。V1 简化为全部并发 1,V2 真撞瓶颈再做"分桶锁"
(`video_render_0`、`video_render_1`)实现并行。

| lock_key | 抢占资源 | V1 并发 |
|---|---|---|
| `playwright_chromium` | 单 Chromium 实例 + 共享 cookie(即梦/Dreamina/微信公众号都用) | 1 |
| `wechat_push` | 微信公众号 API 限流 | 1 |
| `video_render` | ffmpeg/remotion 渲染 | 1(V2 评估分桶) |
| `cosyvoice` | 模型推理,显存常驻 | 1(V2 评估分桶) |
| `image_gen` | apimart / GPT-Image / Dreamina 图像 | 1 + token bucket(API 自限速) |

**实现(v0.3 修订:必须原子,不能 SELECT 后 INSERT):**

v0.2 写的"先 SELECT 再决定"会有**真实竞态**——两个请求在同一秒进来,
都看到锁空闲,都决定执行,**双跑**。这种 bug 在多人同时点"生成视频"时百分百会发生。

正确做法:**独立 `resource_locks` 表 + `BEGIN IMMEDIATE` + `INSERT OR IGNORE`**。

```sql
-- 写进 migrations.py append
-- v0.4 修订:holder_task_id TEXT(实测 tasks.id 是 32 字符 uuid,不是 INTEGER)
CREATE TABLE resource_locks (
    lock_key TEXT PRIMARY KEY,           -- 'playwright_chromium' / 'wechat_push' 等
    holder_task_id TEXT NOT NULL,        -- tasks.id 是 uuid TEXT,例如 '16d49d6fd7784239ad26e0e10e350423'
    acquired_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,         -- 防 stale lock(进程崩了锁要能过期)
    heartbeat_at INTEGER NOT NULL        -- 长任务要定期 update,证明自己还活着
);
CREATE INDEX idx_resource_locks_expires ON resource_locks(expires_at);

-- v0.4 修订:tasks 加字段供 queue_length() 查
-- 任务进入"等锁"状态时设置,拿到锁清空
-- v0.5 修订:走 callable migration(参考 _v4_asset_identity 模式),
--           而不是直接 ALTER TABLE,避免半迁移/测试库二次执行 'duplicate column'
```

**v0.5 callable migration 写法:**

```python
# backend/services/migrations.py 追加
def _v6_resource_locks_and_tasks_waiting(con: sqlite3.Connection) -> None:
    """V1 资源锁基础设施。幂等:列已存在时跳过 ALTER。"""
    # 1. resource_locks 表(纯 IF NOT EXISTS,天然幂等)
    con.executescript("""
        CREATE TABLE IF NOT EXISTS resource_locks (
            lock_key TEXT PRIMARY KEY,
            holder_task_id TEXT NOT NULL,
            acquired_at INTEGER NOT NULL,
            expires_at INTEGER NOT NULL,
            heartbeat_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_resource_locks_expires ON resource_locks(expires_at);
    """)

    # 2. tasks 加 waiting_for_lock 列(检测后 ALTER,幂等)
    cols = {row[1] for row in con.execute("PRAGMA table_info(tasks)").fetchall()}
    if "waiting_for_lock" not in cols:
        con.execute("ALTER TABLE tasks ADD COLUMN waiting_for_lock TEXT")
    con.execute(
        "CREATE INDEX IF NOT EXISTS idx_tasks_waiting_lock "
        "ON tasks(waiting_for_lock, status)"
    )


# 然后 append 到 _MIGRATIONS:
_MIGRATIONS: list[tuple[int, str, str | "callable"]] = [
    # ...已有...
    (6, "M3 V1 resource locks + tasks.waiting_for_lock", _v6_resource_locks_and_tasks_waiting),
]
```

```python
# backend/services/resource_lock.py
import time
import sqlite3

LOCK_TTL_SEC = 600  # 10 分钟,长任务自己续命

def try_acquire(conn: sqlite3.Connection, lock_key: str, task_id: str) -> bool:
    """原子抢锁。返回 True 成功 / False 已被占用。

    v0.4: task_id 是 uuid 字符串(tasks.id TEXT)。
    SELECT 不能用于决定能否执行(竞态),只能用于 UI 展示队列长度。
    """
    now = int(time.time())
    expires = now + LOCK_TTL_SEC

    # BEGIN IMMEDIATE 立即拿写锁,防止两个事务并行通过 INSERT OR IGNORE
    conn.execute("BEGIN IMMEDIATE")
    try:
        # 1. 清理过期锁(原持有者崩了或没续命)
        conn.execute("DELETE FROM resource_locks WHERE expires_at < ?", (now,))

        # 2. 原子尝试占用 — 已有则 IGNORE,rowcount=0
        cur = conn.execute(
            "INSERT OR IGNORE INTO resource_locks "
            "(lock_key, holder_task_id, acquired_at, expires_at, heartbeat_at) "
            "VALUES (?, ?, ?, ?, ?)",
            (lock_key, task_id, now, expires, now),
        )
        acquired = cur.rowcount == 1
        conn.execute("COMMIT")
        return acquired
    except Exception:
        conn.execute("ROLLBACK")
        raise


def heartbeat(conn, lock_key: str, task_id: str) -> bool:
    """长任务每 60 秒续命一次,防被超时清理。

    v0.5 修订:必须 commit。
    Python sqlite3 默认 isolation_level='' 是隐式事务,UPDATE 后不 commit
    意味着写入不被其他连接看到,清理任务那条连接看到的 expires_at 仍是旧值
    → 锁被错误清掉 → 长任务还在跑,下一个任务又抢进来 → 双跑。
    """
    now = int(time.time())
    cur = conn.execute(
        "UPDATE resource_locks "
        "SET heartbeat_at = ?, expires_at = ? "
        "WHERE lock_key = ? AND holder_task_id = ?",
        (now, now + LOCK_TTL_SEC, lock_key, task_id),
    )
    conn.commit()  # ← v0.5 修订关键
    return cur.rowcount == 1


def release(conn, lock_key: str, task_id: str) -> None:
    """任务结束(成功 / 失败)都必须释放。建议用 try/finally 包。"""
    conn.execute(
        "DELETE FROM resource_locks WHERE lock_key = ? AND holder_task_id = ?",
        (lock_key, task_id),
    )
    conn.commit()


# 仅供 UI 展示队列(不能用于抢锁判定):
def queue_length(conn, lock_key: str) -> int:
    return conn.execute(
        "SELECT COUNT(*) FROM tasks "
        "WHERE waiting_for_lock = ? AND status = 'pending'",
        (lock_key,),
    ).fetchone()[0]
```

**硬约束(写进代码 review checklist):**
- ❌ 任何 `if SELECT(...) is None: INSERT(...)` 模式都是错的
- ✅ 抢锁必须 `BEGIN IMMEDIATE` + `INSERT OR IGNORE` + 看 `rowcount`
- ✅ **每个写操作(`try_acquire` 内显式 COMMIT、`heartbeat`、`release`)都必须 commit,否则其他连接看不到 — v0.5 修订**
- ✅ 长任务必须开心跳,否则 10 分钟后锁会被清掉,下一个任务能抢进来同跑
- ✅ 释放必须 `try/finally`,任务崩了也要释放(或靠 expires_at 兜底)
- ✅ **resource_lock 模块的连接建议用独立 connection,或开 `isolation_level=None` autocommit,避免和业务事务交叉 — v0.5 修订**

### 5.3 SQLite WAL 三件套

```python
# backend/services/db_init.py
def init_db(conn):
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.execute("PRAGMA busy_timeout=5000")  # 5 秒
    conn.execute("PRAGMA foreign_keys=ON")
```

**每日维护任务**(launchd 凌晨 3 点):

```python
# scripts/sqlite_daily_maintenance.py
import sqlite3
from datetime import datetime
from pathlib import Path

DB_PATH = Path("data/works.db")
BACKUP_DIR = Path("data/_backups")
ICLOUD_DIR = Path.home() / "Library/Mobile Documents/com~apple~CloudDocs/neironggongchang_backups"

def daily_maintenance():
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")

    # 1. 一致性备份(用 SQLite backup API,不是 cp)
    src = sqlite3.connect(DB_PATH)
    dst_local = BACKUP_DIR / f"works_{ts}.db"
    dst = sqlite3.connect(dst_local)
    src.backup(dst)
    dst.close()

    # 2. integrity check
    res = src.execute("PRAGMA integrity_check").fetchone()
    assert res[0] == "ok", f"integrity check failed: {res}"

    # 3. WAL truncate,防止 -wal 文件无限增长
    src.execute("PRAGMA wal_checkpoint(TRUNCATE)")
    src.close()

    # 4. 异地备份
    ICLOUD_DIR.mkdir(parents=True, exist_ok=True)
    (ICLOUD_DIR / f"works_{ts}.db").write_bytes(dst_local.read_bytes())

    # 5. 清理 30 天前的本地备份
    cutoff = ts  # 实际用 epoch 比较
    for old in BACKUP_DIR.glob("works_*.db"):
        if (datetime.now() - datetime.fromtimestamp(old.stat().st_mtime)).days > 30:
            old.unlink()
```

### 5.4 审计日志规则

**记录的事件类型:**
- `auth.login_success` / `auth.login_fail` / `auth.logout`
- `auth.register` / `invite_code.generate` / `invite_code.use`
- `work.create` / `work.delete`
- `settings.update`
- `permission.deny`
- `task.submit` / `task.complete`

**禁止记录:**
- ❌ 正文(`original_text` / `final_text`)
- ❌ Prompt 完整内容
- ❌ 知识库内容
- ❌ AI API key / cookie / token

**只记元数据:** user_id / cf_email / event_type / target_type / target_id / ip / user_agent / 短 metadata。

### 5.5 外部登录态新鲜度监控

`/api/admin/health` 页面(只 admin 可见),展示:

```
┌──────────────────────────────────────────────┐
│ 外部服务登录态                                │
├──────────────────────────────────────────────┤
│ ✅ Dreamina         · 上次成功 12 分钟前       │
│ ✅ 微信公众号       · 上次成功 6 小时前        │
│ ⚠️  即梦            · 3 天前 · 需要扫码续期    │
│ ✅ CosyVoice 本地   · 当前在线                │
│ ✅ Claude proxy     · localhost:3456 OK      │
└──────────────────────────────────────────────┘
```

数据来源:每个外部服务调用成功 / 失败时,写一条 `events` 子集到 `service_health` 表
(或者在 `events` 里 event_type=`service.heartbeat`,避免新表)。

**失败时:**
- 不静默 retry,前端给 member 用户看到"等管理员续期"提示
- admin 收到飞书机器人通知

### 5.6 M3 验收标准(v0.4 增 4 条 · 含安全级)

- [ ] 知道 URL 的非 owner 用户访问 `/media/<work>.mp4` 返回 403
- [ ] `../etc/passwd` 之类 path traversal 探测返回 404
- [ ] **`curl /media/works.db` 返回 404**(v0.4 安全级:DB 文件不在任何业务表里,白名单未命中)
- [ ] **`curl /media/main.db` 返回 404**
- [ ] **`curl /media/settings.json` 返回 404**
- [ ] **`curl /media/videos/e2e_run_01.log` 返回 404**(任何 .log/.json 等非媒体文件,只要不在 works/material_assets 里就 404)
- [ ] **member session 访问 `/skills/dhv5/outputs/<任意文件>` 返回 403** ✨ **v0.6 修订**
- [ ] **member session 访问 `/skills/dhv5/brolls/<任意文件>` 返回 403** ✨ **v0.6**
- [ ] **admin session 访问 `/skills/dhv5/outputs/<存在的文件>` 返回 200**(确认 admin 通道未被误挡)✨ **v0.6**
- [ ] 两个 member 同时点"生成 Dreamina 视频",只 1 个执行,另 1 个看到队列中
- [ ] `data/_backups/` 每日凌晨 3 点新增一份 `works_*.db`
- [ ] iCloud Drive 里也有同步的备份
- [ ] 30 天前的本地备份被清理
- [ ] 故意手动改坏一个表 → 下次维护任务 `integrity_check` 报警
- [ ] events 表不存任何正文/prompt 字段(`SELECT * FROM events WHERE LENGTH(metadata) > 1000` ≈ 0)
- [ ] admin 健康页能看到 5 个外部服务状态
- [ ] 故意让 Dreamina cookie 过期 → 健康页变 ⚠️,member 创建任务时看到提示

---

## 6. 总验收清单(汇总)

跑完 M0~M3 后,应满足:

**架构层**
- [ ] 远程电脑能从 `https://gongchang.poju.ai` 完整使用作品库 / 创建任务 / 看历史
- [ ] DevTools Network 全部请求同源
- [ ] 所有 API 写接口要求登录
- [ ] 直接绕过 Caddy 访问 `:8000` 不通

**数据层**
- [ ] `works.local_path` / `thumb_path` 无任何 `/Users/...` 残留
- [ ] 历史 395 条作品有 owner_id
- [ ] WAL + busy_timeout + 每日 backup + integrity check 全开

**权限层**
- [ ] member 互相看不到对方作品
- [ ] member 访问私人 KB 目录 404
- [ ] guest 没有任何写权限
- [ ] admin 后台单独路由,中间件保护

**运行层**
- [ ] 5 类资源锁生效,可压力测(2 个浏览器同时点)
- [ ] 备份能 restore 验证(在另一台机器上 sqlite3 读出来)
- [ ] events 表 24 小时记录数 > 0(说明审计在跑)
- [ ] 外部登录态健康页准确反映现状

---

## 7. 工时与里程碑(详细)

| 阶段 | 子任务 | 工时 | 说明 |
|---|---|---|---|
| **M0** | .gitignore 清理 + secrets 扫 + 大文件清查 + GitHub Private | 0.5 d | |
| | `audit_data_paths.py` 编写 + 自测 | 0.5 d | |
| | `migrate_work_paths.py` 编写 + dry-run + apply | 0.5 d | 包含强制备份 |
| | `resolve_data_path()` + `_work_to_api_dict` 改造 | 0.25 d | |
| | env 化清单(MEDIA_PUBLIC_BASE / OPUS_BASE_URL 等) | 0.25 d | |
| | **M0 小计** | **2 d** | |
| **M1** | Mac mini 装环境 + rsync skill/KB/素材库 | 1 d | |
| | Caddy 安装 + Caddyfile + 退役 8001 | 0.5 d | |
| | 前端 API_BASE 同源化 + 全前端 `/media`/`/skills` 引用排查 | 0.5 d | |
| | wechat_scripts.py:499 改 env + 测公众号预览 | 0.25 d | |
| | Cloudflare Tunnel + Access 配置 | 0.25 d | |
| | 防火墙 + uvicorn proxy-headers + 真实 IP 透传 | 0.25 d | |
| | M1 验收(10 条 checklist) | 0.25 d | |
| | **M1 小计** | **2.5 d** | |
| **M2** | users / invite_codes / sessions / events 表 | 0.5 d | |
| | 注册/登录 API + bcrypt + cookie | 0.5 d | |
| | 失败锁定 + admin 后台用户列表 | 0.25 d | |
| | API 鉴权中间件(`require_user` / `require_admin`) | 0.25 d | |
| | works/tasks/materials 加 owner_id + 迁移历史 | 0.5 d | |
| | 角色 + feature_flags + kb_paths 落地 | 0.5 d | |
| | 知识库 ACL yaml + API 拦截 | 0.5 d | |
| | 前端注册/登录页 + 设置页 admin-only | 0.5 d | |
| | M2 验收 + Playwright 多角色测 | 0.5 d | |
| | **M2 小计** | **4 d** | |
| **M3** | 媒体鉴权代理(`/media` 改造) | 1 d | |
| | 资源锁(5 类)+ tasks 表 lock_key 字段 | 1 d | |
| | SQLite WAL 三件套 + launchd 维护任务 | 0.5 d | |
| | iCloud 异地备份 + 30 天清理 | 0.25 d | |
| | 审计日志写入(7 类事件) | 0.5 d | |
| | 外部登录态健康页 + 飞书通知 | 0.75 d | |
| | M3 验收 + 多人压力测 | 1 d | |
| | **M3 小计** | **5 d** | |
| | **总计** | **13.5 d ± 1** | |

---

## 8. 不做清单(明确边界)

V1 **绝对不做**,即使有人提出也要拒绝:

| 不做项 | 替代方案 / 推迟到何时 |
|---|---|
| 短信验证码登录 | 仅当对外开放注册时(V2+) |
| Google / GitHub OAuth | 团队内邮箱注册够用 |
| 邮件验证邮箱 | 邀请码白名单已经挡住外人 |
| 邮件找回密码(SMTP) | admin 手动重置(`POST /api/admin/users/{id}/reset_password`) |
| 双因素认证 | V2 |
| 自定义角色系统 | 三角色硬编码够 2 年 |
| RBAC 引擎(Casbin/Oso) | 同上 |
| 单条作品级 ACL | owner_id 已经够,V2 再说 |
| 文档级 KB ACL | 目录级白名单够 |
| skill manifest.json 改造 | 优先级低于本架构,V2 |
| 多 Mac mini 集群 / 故障转移 | 团队 5-10 人,单机够;真要做,V3 |
| 全量审计(记 prompt / 正文) | 隐私 + 存储成本,永远不做 |
| 学员版 / 千人 SaaS | 完全不同的产品,另起项目 |

---

## 9. 文档维护

- 本文档 v0.1 由 Opus 4.7 撰写,基于 5 轮 Opus 4.7 ↔ gpt-5.5 讨论
- v1.0 定稿前需:
  - [ ] 清华哥过一遍,标注分歧 / 补充
  - [ ] gpt-5.5 过一遍,标注分歧 / 补充
  - [ ] 三方对齐分歧后,合并为 v1.0
- M0/M1/M2/M3 每个阶段完成后,在本文档对应章节加 `已完成 YYYY-MM-DD` 标记
- 任何"实施时发现的偏差"必须回写到本文档,**不允许代码先行文档不更**

---

**END · v1.0 · 2026-04-30 · 已定稿 · 可进入 M0 实施**
