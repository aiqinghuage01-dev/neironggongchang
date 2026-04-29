# QA Report

## 任务 ID

QA2-IMAGEGEN-20260429

## 测试对象

分支 / commit / 页面:
- branch: `codex/qa-2`
- commit: `518301d tools: add extra qa launcher`
- 页面: `http://127.0.0.1:8101/?page=imagegen`
- API: `http://127.0.0.1:8100`
- 说明: `8000/8001` 当时跑的是主目录服务, 为避免测错 worktree, 本轮临时使用 `8100/8101` 跑当前分支。

## 真实操作

- 打开: 直接出图页 `?page=imagegen`
- 点击: `1:1 方版`, `1 张`, `出图 (1 张)`
- 输入: `一张简单的白色咖啡杯产品照，干净木桌面，自然光，真实摄影，画面简洁，1:1`
- 等待: 提交后只轮询同一个 task, 未重复提交。
- 复核: 打开作品库页 `?page=works`, 点击图片/全部筛选, 确认生成图入库展示。

## 证据

- 截图:
  - `/tmp/_ui_shots/qa2_imagegen_01_loaded.png`
  - `/tmp/_ui_shots/qa2_imagegen_02_filled_n1.png`
  - `/tmp/_ui_shots/qa2_imagegen_03_submitted.png`
  - `/tmp/_ui_shots/qa2_imagegen_04_final.png`
  - `/tmp/_ui_shots/qa2_imagegen_05_works.png`
- console error: `0`
- pageerror: `0`
- curl:
  - `GET /api/tasks/72012fe3c6844be6a8a37bc7ab9213ea` -> `status=ok`, `elapsed_sec=44`, `progress_text=完成`
  - `GET /api/remote-jobs/by-task/72012fe3c6844be6a8a37bc7ab9213ea` -> `provider=apimart`, `last_status=done`, `poll_count=1`
  - `GET /api/works?type=image&limit=5` -> 返回 1 条 `source_skill=image-gen`, `local_url=/media/image-gen/gen_1777439557_437a2a.png`
- pytest: 未跑；本轮未改代码, 以最小 credits 真实链路和浏览器闭环为主。

## Credits / 外部服务

- 是否真烧: 是
- 测试规格: 生图 1 张最低规格, `engine=apimart`, `size=1:1`, `n=1`, 无参考图
- 输入参数: 见上方真实操作 prompt
- task id / 作品 id:
  - app task id: `72012fe3c6844be6a8a37bc7ab9213ea`
  - apimart task id: `task_01KQBTEJZBM43FKZ1VZQN6RTZ2`
  - remote job id: `4a2683ae9864494aaaf3c64e5c292221`
  - works id: `1`
- 实际消耗: apimart 生成 1 张图；具体 credits 扣减接口未在本轮读取到。
- 是否重复提交: 否

## 结果

不通过。

后端真实链路通过: 提交 apimart -> watcher 一次轮询 done -> 下载本地文件 -> 写入作品库。  
前端结果区不通过: `imagegen` 页面最终显示 `出图完成 · 0/0 成功`, 没有展示刚生成的图片。

## 发现的问题

1. `imagegen` 单图 watcher 路径成功后, 页面结果区显示 `0/0 成功`, 但作品库已有图片。
   - 现象: `/tmp/_ui_shots/qa2_imagegen_04_final.png` 显示 `出图完成 · 0/0 成功`。
   - 后端返回: task.result 只有 `raw/task_id/url`, 没有 `images[]`。
   - 前端结果组件似乎按 `result.images || result.covers || []` 渲染, 因此成功结果被显示为空。
   - 影响: 用户会以为出图失败或没产出, 但 credits 已消耗且作品已入库。

## 复现步骤

1. 当前分支启动 API 到 `8100`, 前端到 `8101`, 浏览器 localStorage 设置 `api_base=http://127.0.0.1:8100`。
2. 打开 `http://127.0.0.1:8101/?page=imagegen`。
3. 输入任意 prompt, 选择 `1:1 方版`, `1 张`, 点击 `出图 (1 张)`。
4. 等待 task 变为 `ok`。
5. 观察结果区显示 `0/0 成功`。
6. 打开作品库或 curl `/api/works?type=image&limit=5`, 可看到同一张图已入库。
