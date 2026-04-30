# Agent Board

> 多 Agent 模式下的临时看板. 总控 Agent 维护; 副 Agent 不直接改.

---

## 当前队形

| 角色 | 状态 | 工作区 | 当前任务 |
|---|---|---|---|
| 总控 Agent | 自动派工已接入 | `~/Desktop/neironggongchang` | T-069 做视频热点雷达三条大卡已完成; 继续领队列 |
| 内容开发 Agent | 空闲 | `~/Desktop/nrg-worktrees/content-dev` | T-021/T-022 已合入 main; 等新内容任务 |
| 媒体开发 Agent | 空闲 | `~/Desktop/nrg-worktrees/media-dev` | T-047 已完成并合入 main; 等新媒体任务 |
| QA 测试 Agent | 待领取 | `~/Desktop/nrg-worktrees/qa`, `~/Desktop/nrg-worktrees/qa-1`, `~/Desktop/nrg-worktrees/qa-2` | T-066 已通过; 等后续 QA |
| 审查 Agent | 待领取 | `~/Desktop/nrg-worktrees/review` | T-067 自动 worker 启动阻塞, 已由总控手动审查补齐 |

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
| T-013 | 补直接出图 apimart 下载失败路径保护和 fault injection 回归 | 媒体开发 Agent / 总控 | 已合入待 QA | `backend/services/apimart_service.py`, `tests/test_apimart_service.py`, 必要时前端结果错误展示 | 已 cherry-pick `6e05558`/`ff221fc`; 主线 pytest 通过; 等 T-019 独立 QA 后关闭 |
| T-014 | 修投流文案 `n=1` 最小真链路 10 分钟失败 + LLM 非 JSON | 内容开发 Agent | 需返修 | `backend/services/touliu_pipeline.py`, 投流 endpoint 估时返回处, `tests/test_pipelines.py`/相关 tests; 暂不合入失败的 `2670a5a` | T-015 真实 QA 仍 timeout, 需继续定位 OpenClaw/Claude timeout 与 task 失败态 |
| T-015 | T-014 修后投流 `n=1` 最小真烧复测 | QA 测试 Agent | blocked | 不改功能代码; 只提交报告/必要测试脚本需总控确认 | QA 不通过: 真烧 task `5984e0bcdb754ad994d4b65415bd901e` 724s timeout; console/pageerror=0; pytest touliu 17 passed |
| T-016 | 投流通过后复测录音改写真实 LLM + 热点改写 4 版真实链路 | QA 测试 Agent | blocked(等 T-015 通过) | 不改功能代码; 只提交报告/必要测试脚本需总控确认 | 暂停执行; 投流未通过前不继续烧录音/热点 credits |
| T-017 | 返修投流 `n=1` 页面真实链路 724s timeout | 内容开发 Agent | 已完成(开发自验) | `backend/services/touliu_pipeline.py`, `backend/api.py`, `tests/test_pipelines.py` 或投流直接相关文件; 不改 `docs/PROGRESS.md` | 提交 `3e12f20`, 改走 `touliu.generate.quick/deepseek`; 自测 curl 11 秒 ok, 但 T-020 证明当前 DeepSeek 认证失败, 需 T-021 继续返修 |
| T-018 | T-017 修后投流 `n=1` 页面最小真烧复测 | QA 测试 Agent | blocked | 不改功能代码; 只提交报告/必要测试脚本需总控确认 | 已停止: QA-1 worktree 未包含 T-017 commit, 避免测错 commit |
| T-019 | T-013 主线合入后 apimart 下载失败路径复测 | QA/总控 | 已完成 | `web/factory-works.jsx`, QA fault injection | QA 后端保护通过但 UI 解释不达标; 总控已修 `failed-task` 展示并 Playwright 复测通过 |
| T-020 | T-017 修后投流 `n=1` 正确 commit 页面真烧复测 | 总控 | blocked | `content-dev@3e12f20`, 页面真烧一次 | 命中 `touliu.generate.quick/deepseek`, 但 DeepSeek 返回 Authentication Fails; 未重复提交 |
| T-021 | 返修投流快出 DeepSeek 认证失败和超时兜底 | 内容开发 Agent / 总控合入 | 已完成 | `shortvideo/ai.py`, `shortvideo/claude_opus.py`, `shortvideo/deepseek.py`, `backend/services/touliu_pipeline.py`, 相关 tests | 已合入 main: `3ba6254` + `1384513` + `205d109`; quick route 回 Opus, SDK retry 关闭, `n<=2` 60 秒估时 |
| T-022 | T-021 修后投流 `n=1` 正确路由页面真烧复测 | QA 测试 Agent | 已完成 | 不改功能代码; 只提交报告/必要测试脚本需总控确认 | QA 通过: 只提交 1 次, task `2ca3ceaff54e481c8045573afc7cd50b` ok, 页面 1 条文案, `route_key=touliu.generate.quick`, `engine=opus`, console/pageerror=0 |
| T-023 | 素材库精品原片库 MVP: Downloads 演示源 + 8 业务大类 + 虚拟归类 | 媒体开发 Agent | blocked | 同 T-026 范围子集 | 媒体开发自动 Agent 启动后命中 chatgpt.com websocket 证书错误, 未进入实现; 需求升级为 T-026 |
| T-024 | 已废弃: T-023 代码审查 | 审查 Agent | cancelled | 无 | T-023 已废弃, 改由 T-027 审查 T-026 |
| T-025 | 已废弃: T-023 QA | QA 测试 Agent | cancelled | 无 | T-023 已废弃, 改由 T-028 QA T-026 |
| T-026 | 素材库精品原片库完整页: 业务大类 + 结构化画像 + 剪辑检索 | 媒体开发 Agent / 总控接管 | 已完成 | `backend/services/materials_service.py`, `backend/services/materials_pipeline.py`, `backend/services/migrations.py`, `backend/api.py` 的 `/api/material-lib/*`, `backend/services/settings.py`, `web/factory-materials-v2.jsx`, `tests/test_materials_*` | main 已验证: Downloads 演示源完整页; 首页 8 业务大类; `materials_root` 可保存; V5 画像字段落库; 分类批处理限量; `/api/material-lib/match` 可按文案找素材; 全量 pytest + 浏览器闭环通过 |
| T-027 | T-026 代码审查: 产品方向/安全/漏测 | 审查 Agent / 总控接管 | 已完成 | 只读 T-026 diff、设计文档、报告 | T-029 风险清单逐条对照: 旧分类/设置白名单/业务大类首页/剪辑检索/credits 风险/识别来源均已处理; 剩余视觉识别为后续增强 |
| T-028 | T-026 修后素材库完整真实 QA | QA 测试 Agent / 总控接管 | 已完成 | 不改功能代码; 只提交报告/必要测试脚本需总控确认 | Playwright 已真点真填: 首页/上课教学大类/剪辑检索/移动端; console error/pageerror/requestfailed/http error=0; curl + pytest 证据齐 |
| T-029 | 素材库完整页前置审查: 产品方向与架构风险 | 审查 Agent | done | 只读 D-124 设计和当前实现 | T-026 前置风险清单已交付, 不等开发完成 |
| T-030 | 素材库当前版本基线 QA 与测试脚本准备 | QA 测试 Agent | done | 不改功能代码 | 当前页面截图/console/差距清单已交付, 不烧 credits |
| T-031 | 素材库接口基线 curl/pytest 准备 | QA 测试 Agent | done | 不改功能代码 | 当前 `/api/material-lib/*` 返回形状和复测清单已交付 |
| T-032 | 素材库返修第 2 轮 | 媒体开发 Agent | blocked | 同 T-026 | worker 技术退出, 已由定时巡检推进到 T-035 |
| T-035 | 素材库返修第 3 轮 | 媒体开发 Agent | blocked | 同 T-026 | 重复 worker 已停止; 总控已在 main 完成同范围实现与验证, 避免旧 worktree 覆盖主线 |
| T-038 | 素材库返修第 4 轮 | 媒体开发 Agent | blocked | 同 T-026 | 自动返工循环残留任务; 总控已在 main@7ac7379 完成并关闭 T-026/T-027/T-028 |
| T-036~T-040 | 素材库后续审查/QA/返工循环 | 自动创建 | 停止 | 同 T-026/T-027/T-028 | D-124 本轮已由总控收束; 如后续要做视觉识别/物理整理, 另起新任务 |
| T-041 | D-125 素材库正式端口独立复测 | QA 测试 Agent | claimed | 只读 QA | 正式 8000/8001 端口复测素材库首页精选/大类/预览/剪辑检索/移动端 |
| T-042 | 全站基础导航与页面状态 smoke | QA 测试 Agent / 总控返修 | 已完成 | 只读 QA + 总控修复 | QA 阻塞的 `/api/tasks/counts` 404 与作品库本机绝对路径破图已由总控修复并自验; T-055 再做独立回归 |
| T-043 | D-125 素材库改动只读审查 | 审查 Agent / 总控返修 | 已完成 | 只读审查 + 总控修复 | 审查无 P0; 总控已修 P1/P2: missing_at 过滤、featured 降级、limit 校验、空态引导、补 featured 测试 |
| T-044 | 全站内容链路低风险页面巡检 | QA 测试 Agent / 总控返修 | 已完成 | 只读 QA + 总控修复 | 投流失败恢复态不再露 `没匹配到已知模式/原始 message`; 显示友好失败卡; T-055 再做独立回归 |
| T-045 | 全站媒体链路低风险页面巡检 | QA 测试 Agent / 总控返修 | 已完成 | 只读 QA + 总控修复 | 直接出图/作品库去技术词, 作品库绝对路径过滤, 数字人 picker 只列视频并隐藏本机路径; T-055 再做独立回归 |
| T-046~T-053 | 全站优化自动补任务窗口 | 自动创建 | 已收口 | content/media/qa/review 分批 | T-046/T-047 已完成; T-048/T-065 阻塞点由总控返修并经 T-066 frame-aware QA 通过; T-049 审查建议已吸收 |
| T-047 | 全站媒体与资产区体验优化第一轮 | 媒体开发 Agent / 总控合入 | 已完成 | `backend/api.py`, `web/factory-dhv5-v2.jsx`, `web/factory-dreamina-v2.jsx`, `web/factory-image-gen.jsx`, `web/factory-image.jsx`, `web/factory-materials-v2.jsx`, `web/factory-shell.jsx`, `web/factory-works.jsx` | 媒体/资产区去技术词与内部词, 素材源显示“临时素材源”; pytest/curl/Playwright 通过, 未烧媒体生成 credits |
| T-054 | 投流恢复后录音改写 + 热点改写真链路复测 | QA 测试 Agent | blocked | 只读 QA 报告; 不改功能代码 | QA 结论: 录音改写真链路通过; 热点改写 4 版 task `673043b93c2f40338e1bb00fa314ad91` 因 Opus/OpenClaw timeout 失败, 未重复提交 |
| T-055 | T-042/T-044/T-045 返修后综合回归 | QA 测试 Agent | 已完成 | 只读 QA | QA 通过: 战略部/投流失败恢复/直接出图/作品库/数字人 picker console/pageerror/requestfailed/http error=0, 不烧 credits, 禁止词与本机路径不外露 |
| T-056 | 全页面本机路径与技术词体验清理 | 总控 Agent | 已完成 | `web/factory-materials-v2.jsx`, `web/factory-strategy.jsx`, `web/factory-home.jsx` | 素材库默认不露 `/Users`; 战略部观察台不露 provider 工程词; 首页不露 `prompt`; 23 页可见文案扫描 + full pytest 通过 |
| T-057 | 热点改写 4 版 Opus 超时兜底 | 总控 Agent | 已完成 | `backend/services/hotrewrite_pipeline.py`, `backend/api.py`, `shortvideo/ai.py`, `tests/test_hotrewrite_versions.py` | 4 版任务逐版进度 + 快路兜底 + 产出清洗; 真实 task `250a97291f9d4c8289231d4ab93609c7` ok, `version_count=4`, `fallback_count=1`, browser errors=0; full pytest 通过 |
| T-058 | T-057 热点 4 版兜底独立回归 | QA 测试 Agent | blocked | 只读 QA; 不重复真实提交 4 版 LLM 任务 | QA 不通过: 兜底指标成立, 但旧 task 第 4 版仍露 `已走技能/需要进一步操作吗`; 报告 commit `c662933` |
| T-059 | T-058 返修后热点旧任务展示 no-credit 回归 | QA 测试 Agent | 已完成 | 只读 QA; 不重复真实提交 4 版 LLM 任务 | QA 通过: 旧 task 详情/列表 API 与页面第 4 版均不含内部文案; pytest 10 passed; console/pageerror/requestfailed/http error=0; 未提交新热点任务 |
| T-060 | T-047 媒体/资产区主线 no-credit 回归 | QA 测试 Agent / 总控处理 | blocked | 只读 QA; 不提交媒体生成任务 | QA worker 误停 8000/8001 后前台启动 uvicorn 卡住, 未产出报告; 总控已补 D-126 健康检查短探活并完成 no-credit 自测 |
| T-061 | D-126 后媒体/资产区只读复测 | QA 测试 Agent / 总控合入 | 已完成 | 严格只读 QA; 禁止停启 8000/8001; 不调用 `/api/health` 做门禁 | QA 通过: 素材源、媒体/资产区 6 页禁止词、console/pageerror/requestfailed/http error、pytest 均通过; 未烧媒体 credits |
| T-062 | 全站可见工程词二轮清理 | 总控 Agent | 已完成 | `web/factory-home.jsx`, `web/factory-write.jsx` | 21 个路由页面工程词/本机路径/接口词扫描命中 0, console/pageerror/requestfailed/http error=0 |
| T-063 | T-062 全站文案清理独立只读复测 | QA 测试 Agent / 总控返修 | blocked -> 已返修 | 只读 QA; 禁止停启端口; 不烧 credits | QA 找到知识库 `persona-prompt` 外露; 总控已修知识库展示脱敏与全站方法徽章; 等 T-065 独立复测 |
| T-064 | D-126/T-062 只读审查 | 审查 Agent / 总控返修 | 已完成 -> 已返修 | 只读审查; 不改代码 | Review 无 P0; P1 即梦失败任务卡 `id/watcher` 外露已修; P2 命名/默认探活测试已补 |
| T-065 | T-063/T-064 返修后全站只读复测 | QA 测试 Agent / 总控关闭 | done | 只读 QA; 禁止停启 8000/8001; 不调用 `/api/health` 当门禁; 不烧 credits | QA 主页面通过但 frame-aware 扫描发现 `beta` iframe 外露本机路径/工程词; 总控移除 iframe 后由 T-066 复测通过 |
| T-066 | T-048/T-065 返修后 frame-aware 全站复测 | QA 测试 Agent | done | 只读 QA; 禁止停启 8000/8001; 不调用 `/api/health` 当门禁; 不烧 credits | 21 页 + 所有 frame 禁止词 0; `wechat/voicerewrite/beta` 通过; Dreamina 失败任务假数据不露 `id/submit_id/watcher/status=`; 报告 `docs/agent-handoff/QA_T066_FRAMEAWARE_RETEST_20260430.md` |
| T-067 | T-048/T-065/T-066 返修后代码只读审查 | 审查 Agent / 总控接管 | done | `web/factory-beta.jsx`, `tests/test_frontend_copy_static.py`; 只读审查后小修 | 自动 review worker 假忙 0 字节日志; 总控手动审查发现 beta 标题脱敏正则不严并已修复; 目标测试/full pytest/Playwright 假状态通过 |
| T-068 | 全站常驻小华浮层 | 总控 Agent | done | `web/factory-app.jsx`, 页面内旧 `<LiDock />`, `tests/test_lidock_global_static.py` | 小华改为顶层统一挂载; 23 个路由逐页点击验证只有 1 个小华且上下文正确; console/pageerror/requestfailed/http/nonGET 均 0 |
| T-069 | 做视频页热点雷达三条大卡 + 换一批 | 总控 Agent | done | `web/factory-make-v2.jsx`, `web/factory-materials.jsx`, `shortvideo/works.py`, `backend/api.py`, `tests/test_works_api.py`, `tests/test_make_hot_radar_static.py` | `/api/hot-topics?limit=3` 至少返回 3 条; 做视频页显示 3 条大卡和 3 个“做成视频”; “换一批”切到下一组; full pytest + Playwright 通过 |

---

## 最近证据

- T-069 做视频热点雷达: API `limit=3` 返回 3 条; API `limit=24` 返回 9 条候选池; Playwright 桌面截图 `/tmp/nrg_hot_radar_make/make-hot-radar-final.png`, 换一批截图 `/tmp/nrg_hot_radar_make/make-hot-radar-after-change.png`, 移动截图 `/tmp/nrg_hot_radar_make/make-hot-radar-mobile-2.png`; `pytest -q -x` 通过。
- D-125 素材库验收补强: 首页新增可预览业务素材精选, `00 待整理` 降级为单独整理入口, KPI 区分总素材/业务素材/未入业务类/已识别; 新增 API `/api/material-lib/featured`.
- 全站优化定时巡检已启动: `bash scripts/start_site_optimization_watch.sh`; 当前窗口 2026-04-30 00:11~08:11, 每 2 小时检查一次. 首轮识别 T-041/T-042/T-043/T-044 running、T-045 queued, 未重复补任务.
- D-125 验证: `git diff --check` -> clean; `.venv/bin/pytest -q tests/test_materials_lib_api.py tests/test_materials_service.py tests/test_materials_pipeline.py` -> 172 passed; `.venv/bin/pytest -q -x` -> 通过; 正式 `8000/8001` curl + Playwright 首页/预览/分类/剪辑检索/移动视口通过, console/pageerror/requestfailed/http error=0.
- D-125 报告: `docs/agent-handoff/CONTROLLER_MATERIALS_D125_QA_20260429.md`.
- 投流 T-021/T-022 已合入 main: `3ba6254`, `1384513`, `205d109`; QA 真烧 task `2ca3ceaff54e481c8045573afc7cd50b` -> `ok`, `route_key=touliu.generate.quick`, `engine=opus`, 页面展示 1 条; main 投流相关测试 34 passed, 全量 pytest 通过; 已新增 T-054 恢复下游录音/热点真链路。
- T-043 返修: `docs/agent-handoff/CONTROLLER_T043_MATERIALS_REPAIR_20260430.md`; featured 排除 `missing_at`, limit=0/49 返 422, featured 失败首页可降级, 空态显示识别引导; 素材库相关测试 175 passed, 全量 pytest 通过, Playwright 正常路径 console/pageerror/requestfailed/http error=0.
- T-042/T-044/T-045 返修: `docs/agent-handoff/CONTROLLER_T042_T044_T045_REPAIR_20260430.md`; `/api/tasks/counts` 200, 作品库本机绝对路径不再暴露, 投流失败恢复不露内部错误, 直接出图/作品库/数字人 picker 去技术词与错误选择; targeted pytest 4 passed, 全量 pytest 通过, Playwright console error=0.
- T-055 QA 通过: `/Users/black.chen/Desktop/nrg-worktrees/qa/docs/agent-handoff/QA_T055_REPAIR_REGRESSION_20260430.md`, commit `606aea9`; 5 个页面场景 console/pageerror/requestfailed/http error=0, 无本机路径媒体请求, 投流失败恢复禁词不可见, 数字人 picker 只列视频。
- T-056 总控清理: 素材库路径默认隐藏, 战略部观察台 provider 工程词改用户话, 首页出图入口去 `prompt`; 23 页可见文案扫描均无 `/Users`、`/private`、`prompt`、`apimart`、`tokens`、`API`, full pytest 通过。
- T-054 QA-1 结论: 录音改写真链路通过; 热点改写 4 版唯一 task `673043b93c2f40338e1bb00fa314ad91` Opus timeout 后 failed, 未重复提交。
- T-057 总控返修: 新增 `hotrewrite.write.fast`、4 版逐版进度、Opus 超时后兜底 DeepSeek、产出清洗; 真实页面 task `250a97291f9d4c8289231d4ab93609c7` -> ok, 4 版, `fallback_count=1`; console/pageerror/requestfailed/http>=400 均 0; 页面 smoke 16/16 OK。
- T-058 QA blocked: no-credit 独立复核确认旧 task 第 4 版正文仍用户可见 `已走技能/需要进一步操作吗`; 报告 `/Users/black.chen/Desktop/nrg-worktrees/qa/docs/agent-handoff/QA_T058_HOTREWRITE_FALLBACK_20260430.md`, commit `c662933`。
- T-058 返修: 任务详情/列表 API 对热点改写旧结果做展示清洗, 不改原始 DB; 同一旧 task curl 详情/列表均 `v4_has_skill=false`, `v4_has_next=false`; Playwright 页面 textarea 同样干净, 截图 `/tmp/_ui_shots/t058_hotrewrite_existing_task_v4_fixed.png`。
- T-059 QA 通过: 报告 `docs/agent-handoff/QA_T059_HOTREWRITE_LEGACY_NO_CREDIT_20260430.md`; QA commit `79c8b7d`, main cherry-pick `2461f37`; 旧 task 详情/列表和页面第 4 版 textarea 均干净, `forbiddenPosts=0`, pytest 10 passed, 未烧新热点 credits。
- T-047 媒体/资产区优化已合入: 报告 `docs/agent-handoff/DEV_MEDIA_T047_SITE_OPT_20260430.md`; media commit `f118857`, main cherry-pick `284958e`; 即梦/直接出图/数字人/作品库/素材库可见技术词清理, Playwright 覆盖 6 个媒体页面, console/pageerror/requestfailed/http error=0。
- T-060 已 block: QA worker 执行流程阻塞, 非产品功能不通过; 总控已修 `/api/health` 慢探活并补媒体/资产区 no-credit 验证。
- D-126 健康检查短探活: 报告 `docs/agent-handoff/CONTROLLER_D126_HEALTH_AND_T060_RECOVERY_20260430.md`; full pytest 通过; `/api/health` 3.308s 返回 200; 全站 smoke 16/16 OK; 媒体/资产 6 页禁止词命中 0。
- T-061 QA 通过: 报告 `docs/agent-handoff/QA_T061_MEDIA_ASSET_READONLY_20260430.md`; QA commit `eefa1ec`, main cherry-pick `bbc28f3`; 严格只读, 未停启端口, 未调用 `/api/health` 门禁, 未烧媒体 credits。
- T-062 总控二轮文案清理: 报告 `docs/agent-handoff/CONTROLLER_T062_SITE_COPY_SWEEP_20260430.md`; 首页/写文案残留 `AIGC` / `AI token` 已清理; 21 页扫描命中 0。
- T-063 QA blocked: 报告 `docs/agent-handoff/QA_T063_SITE_COPY_READONLY_20260430.md`; 21 页中仅知识库 `persona-prompt` 命中 `prompt`, 其余错误为 0。
- T-064 Review done: 报告 `docs/agent-handoff/REVIEW_T064_D126_T062_20260430.md`; 无 P0, P1 为即梦失败任务卡仍露 `id/watcher`。
- T-063/T-064 总控返修: 报告 `docs/agent-handoff/CONTROLLER_T063_T064_COPY_REPAIR_20260430.md`; full pytest 通过, 21 页严格扫描 21/21 OK, 禁止词/console/pageerror/requestfailed/http/提交请求均 0, 即梦失败任务卡假数据复核通过。
- T-048/T-065 总控返修: 报告 `docs/agent-handoff/CONTROLLER_T048_T065_COPY_IFRAME_REPAIR_20260430.md`; 公众号/录音改写技术词已清理; `beta` 移除内部工作台 iframe; frame-aware 21 页扫描 21/21 OK, 禁止词/console/pageerror/requestfailed/http/nonGET 均 0; beta 靶向 frames=1。
- D-124 素材库总控交接: `docs/agent-handoff/CONTROLLER_MATERIALS_T026_MAIN_20260429.md`.
- D-124 验证: `python3 -m pytest -q` -> 通过; `git diff --check` -> clean; 临时 API `:18000` curl `/categories`、`/match`、`/classify-batch?limit=100` 通过; Playwright 截图 `/tmp/_ui_shots/t026_materials_desktop_home.png`, `/tmp/_ui_shots/t026_materials_desktop_category.png`, `/tmp/_ui_shots/t026_materials_desktop_match.png`, `/tmp/_ui_shots/t026_materials_mobile_home.png`, console error/pageerror/requestfailed/http error=0.
- 总控本轮交接: `docs/agent-handoff/CONTROLLER_T013_T017_20260429_2011.md`.
- T-013 已安全 cherry-pick 到 main: `6e05558` + `ff221fc`; 未整支 merge `codex/media-dev`.
- T-013 主线验证: `.venv/bin/pytest -q tests/test_apimart_service.py tests/test_remote_jobs.py` -> 21 passed; `.venv/bin/pytest -q -x` -> passed; `git diff --check HEAD~2..HEAD` -> clean.
- 队列状态: T-017 done; T-018/T-020/T-015/T-016 blocked; T-021 queued; T-022 queued depends T-021.
- T-019 QA 报告: `docs/agent-handoff/QA_T019_APIMART_DOWNLOAD_FAILURE_20260429.md`; 后端保护通过, UI 解释不达标.
- T-019 总控修复: `web/factory-works.jsx` 把 `failed-task` 显示为 `⚠️ 生成失败`, 图片失败详情说明保存到本机失败; Playwright 复测 `/tmp/_ui_shots/t019_works_failed_placeholder_fixed.png`, console/pageerror/requestfailed 均 0.
- T-020 总控真烧: task `bfdfb2f4fc484c249bf22a62e14e5b32`, `route_key=touliu.generate.quick`, AI usage `engine=deepseek`, `ok=0`, `duration_ms=202`, `error=Authentication Fails (governor)`, 页面失败态截图 `/tmp/_ui_shots/t020_touliu_failed_auth.png`; 已派 T-021/T-022.
- 总控启动巡检: `docs/agent-handoff/CONTROLLER_STARTUP_20260429_1852.md`.
- 队列状态: T-015 `blocked` by `NRG QA 测试`; T-016 `blocked` by `NRG 总控`, 等 T-015 真正通过后再恢复.
- 收件箱: `python3 scripts/agent_inbox.py --hours 24` -> 53 reports; 未发现新的 T-015/T-016 通过报告.
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
- T-014 修复提交: `5d4fc59`
- T-014 开发交接: `1eb78aa`
- T-014 自验证: `tests/test_pipelines.py` 34 passed; 相关 88 passed; 隔离端口真实 curl `n=1` task `732094744e9e4dd09997d5a9576ecf3c` 53 秒 `ok`; 全量 `pytest -x` 仍停在本机 `SHILIU_API_KEY not loaded`.
- 结论: T-014 只能说开发自验通过, 必须做 T-015 页面真烧复测后才能合并.
- T-013 修复提交: `99f1fb3`
- T-013 开发交接: `a700c0f`
- T-013 自验证: `tests/test_apimart_service.py tests/test_remote_jobs.py` 21 passed; Playwright mock 下载失败路径 console/pageerror=0; `pytest -q -x --ignore=tests/test_integration.py` passed.
- 合并风险: `codex/media-dev` 落后主线, `git diff main..codex/media-dev` 会删除 `scripts/agent_inbox.py`、`scripts/start_agent_monitor.sh` 和多份主线报告/角色文档; 不可整分支合并, 只能同步主线后再合或 cherry-pick `99f1fb3`.
- 总控审查报告: `docs/agent-handoff/CONTROLLER_AUDIT_20260429.md`.
- 自动任务队列:
  - 位置: `~/Desktop/nrg-agent-queue/tasks.json`
  - 当前: T-015/T-016 均 blocked, 避免投流失败后继续烧下游 credits.
  - 领任务命令: `python3 ~/Desktop/neironggongchang/scripts/agent_queue.py claim --role qa --agent qa-1 --format prompt`
- 自动派工器:
  - 启动: `bash scripts/start_agent_dispatcher.sh`
  - 状态: `bash scripts/start_agent_dispatcher.sh --status`
  - 桌面入口: `打开内容工厂自动派工.app`

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
