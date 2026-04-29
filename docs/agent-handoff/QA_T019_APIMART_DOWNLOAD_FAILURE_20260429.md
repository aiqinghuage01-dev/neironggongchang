# QA Report

## 任务 ID

T-019

## 测试对象

- branch: `codex/qa`
- worktree: `/Users/black.chen/Desktop/nrg-worktrees/qa`
- 基线: 已把 `main` 合入 QA 分支后复测, 合入后测试前 HEAD `98d070d`
- T-013 主线修复提交: `6e05558 fix: fail apimart tasks on download errors`
- 隔离服务:
  - backend: `http://127.0.0.1:8100` (临时 DB `/tmp/nrg_t019_apimart_data/works.db`)
  - web: `http://127.0.0.1:8101`

## 真实操作

- 打开: `http://127.0.0.1:8101/?page=imagegen`
- 点击: `1 张`、`出图 (1 张)`、作品库卡片
- 输入: `T-019 remote done but local download fails`
- 等待: failed task 轮询完成、作品库列表加载、详情抽屉打开
- 说明: Playwright 拦截 `/api/image/generate` 返回本次 fault injection 生成的 failed task id, 没有真实提交 apimart。

## 证据

- 截图:
  - `/tmp/_ui_shots/t019_imagegen_failed_state.png`
  - `/tmp/_ui_shots/t019_works_failed_placeholder.png`
- console error: `0`
- pageerror: `0`
- 浏览器证据: `/tmp/_ui_shots/t019_browser_evidence.json`
  - `interceptedGenerate=true`
- fault injection 证据: `/tmp/_ui_shots/t019_fault_evidence.json`
  - remote poll 返回 `done`
  - 本地下载注入 `RuntimeError("qa injected cdn 403")`
  - `task_status=failed`
  - `remote_job_status=failed`
  - `dest_exists=false`
  - `ready_image_gen_count=0`
  - `failed_task_count=1`
- API 证据: `/tmp/_ui_shots/t019_api_evidence.json`
  - `GET /api/tasks/b78bc7fdfd4b48ada61247c88538fc1a` -> `status=failed`, `result.download_failed=true`
  - `GET /api/remote-jobs/by-task/b78bc7fdfd4b48ada61247c88538fc1a` -> `remote_job.last_status=failed`
  - `GET /api/works?type=image&source_skill=image-gen&since=all` -> `[]`
  - `GET /api/works?type=image&source_skill=failed-task&since=all` -> 1 条 failed 占位
- pytest:
  - `/Users/black.chen/Desktop/neironggongchang/.venv/bin/pytest -q tests/test_apimart_service.py tests/test_remote_jobs.py` -> `21 passed`
  - 备注: QA worktree 没有本地 `.venv`, 首次按项目默认命令激活 `.venv` 失败; 随后使用主仓库 venv 跑同一组测试通过。

## Credits / 外部服务

- 是否真烧: 否
- 测试规格: mock/fault injection, 不调用真实 apimart
- 输入参数: 单图、`1:1`、`n=1`, prompt 为 `T-019 remote done but local download fails`
- task id / 作品 id:
  - task: `b78bc7fdfd4b48ada61247c88538fc1a`
  - remote_job: `825d298a1b2b40fab15a1322febd80c1`
  - failed work: `1` (隔离 DB)
- 实际消耗: 0 credits
- 是否重复提交: 否

## 结果

不通过。

后端保护路径通过: remote done 后本地下载失败会把 task 和 remote_job 标为 failed, 不会写 `source_skill=image-gen` 的 ready 坏作品, 会写一条 failed-task 占位。

阻塞点在作品库解释态: 占位能看到, 但用户可见来源 chip / 过滤 chip / 详情来源都直接显示 `failed-task`, 详情页只说“这条作品只有记录 / 可能只保存了外部图床地址”, 没直接解释这是“出图已完成但下载到本地失败”。这不满足 T-019 “作品库是否能看到/解释 failed-task 占位” 和系统“用户可见 UI 不出现技术词”的要求。

## 发现的问题

### P1 - 作品库 failed-task 占位可见但解释不达标

- 现象: 作品库卡片标题有 `(失败)`, 但来源显示 `failed-task`; 详情页仍显示 `failed-task`, 且占位说明是泛化的“只有记录 / 可能只保存了外部图床地址”。
- 证据: `/tmp/_ui_shots/t019_works_failed_placeholder.png`
- 影响: 老板能看到这条失败记录, 但不能从作品库明确知道这是“图片已生成但下载失败, 没写入作品库”, 还会看到英文技术标识。
- 建议返修:
  - `web/factory-works.jsx` 给 `failed-task` 增加中文来源名, 例如 `⚠️ 生成失败`;
  - 图片详情检测 `source_skill === "failed-task"` 或 metadata.error 时, 展示失败原因摘要;
  - 可选: 根据 metadata.page_id/task_id 提供“回去重试”入口。

## 复现步骤

1. 用隔离 DB 造一个 apimart remote_job, poll 返回 `done`, 但 monkeypatch `ApimartClient.download()` 抛错。
2. 调 `remote_jobs.tick_once()`。
3. 查 task: `status=failed`, `result.download_failed=true`。
4. 查 works: `source_skill=image-gen` 为 0 条, `source_skill=failed-task` 为 1 条。
5. 打开作品库, 搜 `T-019`, 打开占位详情。
6. 观察来源仍显示 `failed-task`, 详情没有解释下载失败原因。
