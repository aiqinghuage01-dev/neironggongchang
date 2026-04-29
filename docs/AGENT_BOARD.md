# Agent Board

> 多 Agent 模式下的临时看板. 总控 Agent 维护; 副 Agent 不直接改.

---

## 当前队形

| 角色 | 状态 | 工作区 | 当前任务 |
|---|---|---|---|
| 总控 Agent | 进行中 | `~/Desktop/neironggongchang` | Copyflows QA 不通过; 协调 T-013/T-014/T-015/T-016 |
| 内容开发 Agent | 待返工 | `~/Desktop/nrg-worktrees/content-dev` | T-014 待领: 投流 n=1 真链路 10 分钟失败 |
| 媒体开发 Agent | 已完成 | `~/Desktop/nrg-worktrees/media-dev` | T-007 已合入主线; T-013 待分配 |
| QA 测试 Agent | 已完成 | `~/Desktop/nrg-worktrees/qa`, `~/Desktop/nrg-worktrees/qa-2` | T-006/T-008/T-012/Copyflows 报告已合入; 待 T-015/T-016 |
| 审查 Agent | 待启动 | `~/Desktop/nrg-worktrees/review` | 待分配 |

---

## 任务池

| ID | 业务目标 | 负责人 | 状态 | 文件范围 | 验收标准 |
|---|---|---|---|---|---|
| T-004 | 修公众号 Step 4 手动编辑正文没有进入后续配图/HTML/草稿的问题 | 内容开发 Agent | 已完成 | `web/factory-wechat-v2.jsx`; `scripts/e2e_wechat_edit_propagation.js` | 主线已验证: `plan-images` 请求、HTML 预览、curl `/api/wechat/html` 都包含编辑标记 |
| T-005 | 修公众号推送前 sanitize 把真实段间图和头像全部剥掉的问题 | 内容开发 Agent | 已完成 | `backend/services/wechat_scripts.py`, `tests/test_wechat_sanitize.py`, `docs/WECHAT-SKILL-LESSONS.md` | 主线已验证: 4 张本次段间图保留; `from=appmsg` 和内部标记清掉; 历史 appmsg 图仍剥除 |
| T-006 | T-004/T-005 修后公众号 8 步链路复测 | QA 测试 Agent | 已完成 | 不改功能代码; 只提交报告/必要测试脚本需总控确认 | QA 二次真实草稿通过: 推送前 `img_count_sanitized=4`, 远端草稿 `img_count=4`, console/pageerror=0 |
| T-007 | 修直接出图 apimart 单图成功后结果区显示 `0/0 成功`、不展示图片的问题 | 媒体开发 Agent | 已完成 | `backend/services/apimart_service.py`, `web/factory-image-gen.jsx`, 对应 tests/e2e; 避免改 `backend/api.py` 除非总控确认 | 主线已验证: apimart 单图 task.result 补齐 `images[]`; 结果页展示 1 张图; 作品库仍正常入库 |
| T-008 | T-007 修后直接出图最小真烧复测 | QA 测试 Agent | 已完成 | 不改功能代码; 只提交报告/必要测试脚本需总控确认 | QA 真烧通过: 1 张最低规格, console/pageerror=0, 结果区 `1/1 成功`, 作品库同图可见 |
| T-009 | 修作品库数据看板 TOP「看」打不开历史作品 + 搜索只搜前 300 条的问题 | 总控/平台开发 | 已完成 | `web/factory-works.jsx`, `backend/api.py`, `shortvideo/works.py`/tests; `backend/api.py` 单线改 | T-012 已验证: 看板按 id 打开历史作品; 搜索旧作品命中; API/前端回归通过 |
| T-010 | 修作品库「留这版 / 删这版」写入成功但 UI 不变 + 完播率百分比输入误导 | 总控/平台开发 | 已完成 | `web/factory-works.jsx`, 必要时 `backend/api.py`, tests | T-012 已验证: 点击后按钮显示 `✓`; 完播率填 80 落库 0.8; 回归覆盖 |
| T-011 | 处理作品库图片占位卡: 无预览/无下载的图片作品要可解释或可恢复 | 总控/平台开发 | 已完成 | `backend/api.py`, `web/factory-works.jsx`, 可能涉及数据修复脚本; 先读 QA 报告现场数据 | T-012 已验证: 文件缺失图片显示明确状态; API 状态字段正确 |
| T-012 | T-009/T-010/T-011 修后作品库全链路回归 | QA 测试 Agent | 已完成 | 不改功能代码; 只提交报告/必要测试脚本需总控确认 | QA 通过: pytest/e2e/真实 UI/curl/截图均通过, 未发现新 P0/P1/P2 |
| T-013 | 补直接出图 apimart 下载失败路径保护和 fault injection 回归 | 媒体开发 Agent | 待分配 | `backend/services/apimart_service.py`, `tests/test_apimart_service.py`, 必要时前端结果错误展示 | 模拟远端 done 但下载失败时, task 不假成功、不写坏作品记录、用户看到可理解失败/重试信息; 回归覆盖 |
| T-014 | 修投流文案 `n=1` 最小真链路 10 分钟失败 + LLM 非 JSON | 内容开发 Agent | 待分配 | `backend/services/touliu_pipeline.py`, 投流 endpoint 估时返回处, `tests/test_pipelines.py`/相关 tests; 暂不合入失败的 `2670a5a` | `n=1` 使用真实 LLM 能稳定返回 JSON 作品; 不再 181 秒仍 running; 初始 `estimated_seconds` 与 task 行一致; 解析 fenced JSON/前缀或给明确截断错误 |
| T-015 | T-014 修后投流 `n=1` 最小真烧复测 | QA 测试 Agent | 待分配 | 不改功能代码; 只提交报告/必要测试脚本需总控确认 | 只提交 1 次投流 `n=1`; task `ok`; 页面/接口有结果; console/pageerror=0; 记录耗时和 AI usage; 不通过则不继续烧录音/热点 |
| T-016 | 投流通过后复测录音改写真实 LLM + 热点改写 4 版真实链路 | QA 测试 Agent | 待分配 | 不改功能代码; 只提交报告/必要测试脚本需总控确认 | 在 T-015 通过后再跑; 录音改写返回非空正文或明确重试后失败; 热点 4 版返回 4 个版本且进度可见; 控制 credits, 不重复提交 |

---

## 最近证据

- QA 报告: `docs/agent-handoff/QA_WECHAT_20260429.md`
- QA 原提交: `cb3454c`
- 主线证据提交: `9031337`
- 结论: 不通过, 主链路能创建草稿, 但有 2 个 P1 阻塞真实验收.
- QA2 报告: `docs/agent-handoff/QA2_IMAGEGEN_20260429.md`
- QA2 原提交: `4f44f7a`
- 主线证据提交: `6f9fc3f`
- 结论: 不通过, 后端生图/入库成功, 但直接出图结果区显示 `0/0 成功` 且不展示图片.
- T-007 代码提交: `e7c4508`
- T-007 开发交接: `f477319`
- T-008 QA 复测报告: `6b34637`
- T-008 QA 原提交: `e50666c`
- 主线验证: `.venv/bin/pytest -q tests/test_apimart_service.py tests/test_remote_jobs.py` -> 20 passed.
- 结论: T-007/T-008 已合入并通过; download 失败 fault injection 未测, 新增 T-013 单独处理.
- T-004/T-005 代码提交: `2c9778e`
- T-004/T-005 开发交接: `99ff4c9`
- T-004/T-005 QA 复测报告: `49dabaa`
- 结论: T-004/T-005 scoped 通过并已合入主线; 未包含真实公众号草稿推送, T-006 继续待测.
- T-006 QA 首版报告: `f306718`
- T-006 QA 更新报告: `ff5be05`
- T-006 QA 原提交: `7167fba` -> `d8bbc72`
- 第二次草稿 ID: `QbCZvI0l3BDFBWrSXSwYcZaJmVU4q9t42P2nOY7C936R9f28m5_kCaT9c5ARmRoR`
- 结论: T-006 通过; 第二次复核仅调用 `/api/wechat/html` 和 `/api/wechat/push`, 推送前和远端草稿均保留 4 张段间图. 首轮旧后端无图草稿是历史残留.
- Works QA 报告: `docs/agent-handoff/QA_WORKS_20260429.md`
- Works QA 原提交: `eed2d29`
- 主线证据提交: `bcad1e6`
- 结论: 不通过, 作品库有 2 个 P1 + 3 个 P2, 已登记 T-009/T-010/T-011/T-012.
- T-009/T-010/T-011 修复提交: `9b36bd5`
- 主线自验证据:
  - `.venv/bin/pytest -q tests/test_works_api.py` -> 5 passed.
  - `.venv/bin/pytest -q tests/test_works_crud_integration.py tests/test_autoinsert_text_work.py tests/test_migrations.py::test_apply_migrations_creates_works_indexes tests/test_migrations.py::test_legacy_fixup_works_old_db_missing_4_columns` -> 11 passed.
  - `.venv/bin/pytest -q -x` -> exit 0.
  - `node scripts/e2e_works_t009_t011.js` -> exit 0; 截图已读 `/tmp/_ui_shots/t009_t011_works_regression.png`.
  - 临时 API `8121` + curl 已验证: 老作品搜索、按 id 详情、留/删 action 返回新 work、`completion_rate=80` 存 `0.8`、缺失图片返回 `asset_status=missing_file`.
- 结论: T-009/T-010/T-011 已修并自验通过, 等 T-012 独立 QA 复跑后才能说作品库通过.
- T-012 QA 报告: `53e77d6`
- T-012 QA 原提交: `f42c46e`
- T-012 验证:
  - `.venv/bin/pytest -q -x` -> exit 0.
  - 作品库相关 pytest -> 16 passed.
  - `scripts/e2e_works_t009_t011.js` -> exit 0.
  - 真实 UI 非 mock 浏览器闭环: 32 个 API 请求, console/pageerror/API requestfailed 均 0.
  - curl 复核旧作品搜索、按 id 打开、留这版写入、`completion_rate=80` 落库 0.8、缺图状态字段.
- 结论: T-009/T-010/T-011/T-012 通过; 项目整体仍需 T-013.
- Copyflows QA 报告: `a756f8f`
- Copyflows QA 原提交: `7e6f5f8`
- 被测失败代码: `2670a5a` + 开发交接 `886552b` (均只在 `codex/content-dev`, 未合入 main)
- 结论: 不通过. 投流 `n=1` 最小真烧 task `cf04ad56b1b34b3c87fcda8b5821f319` 181 秒仍 running, 591 秒 failed, 错误为 `投流文案 LLM 输出非 JSON`; 录音/热点未继续真烧.

---

## 状态约定

- `待分配`: 只有业务目标, 还没开工.
- `进行中`: Agent 已领取, 正在 worktree 内处理.
- `待 QA`: 开发完成, 等 QA 真测.
- `待审查`: 开发完成, 等 Claude/审查 Agent 看风险.
- `待合并`: QA 和审查问题已处理, 等总控合并.
- `已完成`: 总控已合并、验证、提交.
- `阻塞`: 需要老板决策或外部资源.

---

## 今日启动模板

```text
今天启动多 Agent 模式。

目标:
1.
2.
3.

并行安排:
- 内容开发 Agent:
- 媒体开发 Agent:
- QA 测试 Agent:
- 审查 Agent:

总控要求:
- 副 Agent 不改 docs/PROGRESS.md
- 每个开发 Agent 只改自己的文件范围
- QA 必须交截图/console/pytest/curl 证据
- 审查 Agent 只输出风险清单
```
