# QA Report - T-006 公众号 8 步真实草稿推送复测

## 任务 ID

T-006

## 测试对象

- 被测主线目录: `/Users/black.chen/Desktop/neironggongchang`
- 主线 commit: `564de48 docs: register works QA follow-ups`
- 页面: `http://127.0.0.1:8001/?page=wechat`
- API: `http://127.0.0.1:8000`
- QA 报告工作区: `/Users/black.chen/Desktop/nrg-worktrees/qa`

## 真实操作

- 打开: 公众号 8 步链路页面
- 点击: 分步出标题、选第一个标题、写长文、下一步段间配图、真实感照片、一键生成 4 张、拼 HTML、生成封面、推送草稿箱
- 输入: `QA真测T006 20260429060157: 实体老板用AI做公众号内容, 从选题到成交闭环怎么跑通`
- 手动编辑标记: `QA_T006_EDIT_MARKER_20260429060157`
- 等待: 标题、大纲、长文任务、4 张段间图、HTML、封面、真实草稿推送

## 证据

- 首轮浏览器报告: `/tmp/_ui_shots/t006_wechat_browser_report.json`
- 恢复继续浏览器报告: `/tmp/_ui_shots/t006_wechat_browser_report_recover.json`
- 远端草稿 API 复核: `/tmp/_ui_shots/t006_wechat_remote_draft_check.json`
- 重启后不外发 sanitizer 复核: `/tmp/_ui_shots/t006_wechat_restart_no_push_sanitize.json`
- 截图:
  - `/tmp/_ui_shots/t006_wechat_20260429060157_01_topic.png`
  - `/tmp/_ui_shots/t006_wechat_20260429060157_04_outline.png`
  - `/tmp/_ui_shots/t006_wechat_20260429060157_06_article_edited.png`
  - `/tmp/_ui_shots/t006_wechat_20260429060157_09_images_done.png`
  - `/tmp/_ui_shots/t006_wechat_20260429060157_10_html.png`
  - `/tmp/_ui_shots/t006_wechat_20260429060157_11_cover.png`
  - `/tmp/_ui_shots/t006_wechat_20260429060157_12_push_done.png`
- console/pageerror:
  - 恢复继续脚本: `console_errors=0`, `pageerrors=0`
  - 首轮脚本有 harness 等待条件错误: 把加载动画里的“三层自检”当完成态, 未造成二次写文; 后续通过同一 `wechat.write` task 恢复继续.
- pytest:
  - `/Users/black.chen/Desktop/neironggongchang/.venv/bin/python -m pytest -q tests/test_wechat_skill.py tests/test_wechat_avatar.py tests/test_wechat_html_inject.py tests/test_wechat_scripts_run.py tests/test_wechat_sanitize.py tests/test_wechat_pipeline_async_smoke.py tests/test_llm_empty_content.py tests/test_llm_retry.py` -> `101 passed`
- curl/API:
  - `/api/health` -> `ok=true`, `ai=true`, `apimart=true`, `qingdou=true`
  - 远端 `draft/batchget` 找到草稿 ID, 内容 `img_count=0`

## Credits / 外部服务

- 是否真烧: 是
- 测试规格:
  - LLM: 1 次真实长文
  - 段间图: 4 张 apimart + 微信图床上传
  - 封面: 2 张 apimart 候选
  - 公众号草稿: 1 次真实创建
- task id / 作品 id:
  - wechat.write: `ff279a59d4d549b6b8513e77a825d287`, `ok`, `85s`
  - section-image: `fd1d4031ec2047e9a807f890d5870aae`, `3dd6e108e6d0402eb404eb1bdd2a351d`, `87a9d0d817e349febcdd002568c86683`, `e64cc2f653624c2e9495c9183bdf7675`
  - 草稿 ID: `QbCZvI0l3BDFBWrSXSwYcT6KiPSFi04oATgkze-_0Sitcc0iXGYmrOtDYvPlOPyA`
- 实际消耗: 已真实消耗 1 条公众号闭环所需外部调用; 未做第二次真实推送.
- 是否重复提交: 否. 发现首轮命中旧后端进程后, 只做了不外发 sanitizer 复核; 第二次真实草稿推送需总控/老板确认.

## 结果

未通过 / 阻塞。

原因: 真实推送创建草稿成功, 但真实草稿正文没有图片。随后确认这次真实推送命中了 11:08 启动的旧后端进程, 该进程早于 T-004/T-005 主线合入时间 `13:30`, 生成的 push HTML 没有 `data-nrg-section-image` 内部标记, sanitizer 仍把 4 张本次段间图剥掉。

重启后只做不外发复核, 当前磁盘代码可以保留 4 张本次段间图: `sanitize_img_count_clean=4`, `trusted appmsg kept=4`, `strip ?from=appmsg=4`。但因为 QA 规则不允许失败后自动重复真实外发, T-006 还缺一次重启后真实草稿推送确认。

## 发现的问题

### P1 - 首轮真实草稿无图

- UI 表现: Step 5 显示 `段间配图 · 4/4`, Step 6 HTML 页面生成成功, Step 8 显示 `已推到草稿箱`.
- 推送前诊断:
  - `/tmp/preview/last_push_request.json`: `img_count_original=5`, `img_count_sanitized=0`
  - `removed.img_from_appmsg=5`, `rewritten={}`
  - `/tmp/preview/last_push_request.html`: `img=0`, `mmbiz=0`
- 远端草稿 API:
  - draft found: `true`
  - title: `写了3个月公众号没1个咨询？你从一开始就做反了`
  - content chars: `9750`
  - `img_count=0`
  - `has_qa_marker=true`

### 环境原因 - 后端进程早于修复提交

- 运行中的旧后端 PID: `72530`
- 启动时间: `2026-04-29 11:08:13`
- T-004/T-005 修复提交: `2c9778e`, 时间 `2026-04-29 13:30:02`
- 首轮真实推送时磁盘代码已有 marker 逻辑, 但旧进程未重载.
- 首轮 `/tmp/preview/wechat_article_raw_push.html` 中 4 张段间图 URL 都带 `?from=appmsg`, 但 `data-nrg-section-image` 计数为 `0`.

### 重启后当前代码的无外发复核通过

- 重启后后端 PID: `91656`
- 复用首轮 4 张段间图 task result, 重新调用 `/api/wechat/html`, 未推送草稿.
- `/tmp/_ui_shots/t006_wechat_restart_no_push_sanitize.json`:
  - `section_images=4`
  - `all_mmbiz_from_appmsg=true`
  - `wechat_img_count=5`
  - `wechat_internal_marker_count=4`
  - `sanitize_img_count_clean=4`
  - `removed.img_from_appmsg=1` (头像)
  - `rewritten.trusted appmsg kept=4`
  - `clean_has_from_appmsg=false`
  - `clean_has_internal_marker=false`
  - `clean_has_media=false`

## 复现步骤

1. 用旧后端进程跑完整公众号 8 步并推送草稿.
2. 查看 `/tmp/preview/last_push_request.json`.
3. 观察 `img_count_sanitized=0`, `removed.img_from_appmsg=5`.
4. 用微信公众号 `draft/batchget` 查同一草稿 ID, 正文 `img_count=0`.
5. 重启后端到当前主线代码.
6. 复用同一批段间图调用 `/api/wechat/html`, 再对 `wechat_html` 调 `sanitize_for_push`, 可见 4 张本次段间图被保留.

## 后续

需要总控/老板确认是否允许第二次真实草稿推送。若确认, 可复用已有文章、4 张段间图和封面, 只重新生成当前代码的 HTML 并执行 Step 8, 不需要再烧 LLM/生图 credits。
