# QA Report - T-006 公众号 8 步真实草稿推送复测

## 任务 ID

T-006

## 测试对象

- 被测主线目录: `/Users/black.chen/Desktop/neironggongchang`
- 首轮被测主线 commit: `564de48 docs: register works QA follow-ups`
- 第二次复核主线 commit: `9b36bd5`
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
- 第二次真实推送浏览器报告: `/tmp/_ui_shots/t006_second_push_browser_report.json`
- 第二次真实推送 payload 复核:
  - `/tmp/preview/last_push_request.json`
  - `/tmp/preview/last_push_request.html`
  - `/tmp/_ui_shots/t006_second_push_payload_check.json`
- 第二次真实推送远端草稿 API 复核:
  - `/tmp/_ui_shots/t006_second_push_remote_draft_check.json`
  - `/tmp/_ui_shots/t006_second_push_remote_draft_raw.json`
- 截图:
  - `/tmp/_ui_shots/t006_wechat_20260429060157_01_topic.png`
  - `/tmp/_ui_shots/t006_wechat_20260429060157_04_outline.png`
  - `/tmp/_ui_shots/t006_wechat_20260429060157_06_article_edited.png`
  - `/tmp/_ui_shots/t006_wechat_20260429060157_09_images_done.png`
  - `/tmp/_ui_shots/t006_wechat_20260429060157_10_html.png`
  - `/tmp/_ui_shots/t006_wechat_20260429060157_11_cover.png`
  - `/tmp/_ui_shots/t006_wechat_20260429060157_12_push_done.png`
  - `/tmp/_ui_shots/t006_second_push_step5_reuse_images.png`
  - `/tmp/_ui_shots/t006_second_push_step6_html_rebuilt.png`
  - `/tmp/_ui_shots/t006_second_push_step7_reuse_cover.png`
  - `/tmp/_ui_shots/t006_second_push_step8_push_done.png`
- console/pageerror:
  - 恢复继续脚本: `console_errors=0`, `pageerrors=0`
  - 第二次真实推送脚本: `console_errors=[]`, `page_errors=[]`
  - 首轮脚本有 harness 等待条件错误: 把加载动画里的“三层自检”当完成态, 未造成二次写文; 后续通过同一 `wechat.write` task 恢复继续.
- pytest:
  - `/Users/black.chen/Desktop/neironggongchang/.venv/bin/python -m pytest -q tests/test_wechat_skill.py tests/test_wechat_avatar.py tests/test_wechat_html_inject.py tests/test_wechat_scripts_run.py tests/test_wechat_sanitize.py tests/test_wechat_pipeline_async_smoke.py tests/test_llm_empty_content.py tests/test_llm_retry.py` -> `101 passed`
- curl/API:
  - `/api/health` -> `ok=true`, `ai=true`, `apimart=true`, `qingdou=true`
  - 远端 `draft/batchget` 找到草稿 ID, 内容 `img_count=0`
  - 第二次远端 `draft/batchget` 找到草稿 ID, 内容 `img_count=4`, `mmbiz_count=4`, `has_qa_marker=true`

## Credits / 外部服务

- 是否真烧: 是
- 测试规格:
  - LLM: 1 次真实长文
  - 段间图: 4 张 apimart + 微信图床上传
  - 封面: 2 张 apimart 候选
  - 公众号草稿: 2 次真实创建
    - 第 1 次命中旧后端进程, 远端 `img_count=0`
    - 第 2 次经总控/老板确认, 只复用已有文章、4 张段间图、封面, 只重建 HTML + 执行 Step 8
- task id / 作品 id:
  - wechat.write: `ff279a59d4d549b6b8513e77a825d287`, `ok`, `85s`
  - section-image: `fd1d4031ec2047e9a807f890d5870aae`, `3dd6e108e6d0402eb404eb1bdd2a351d`, `87a9d0d817e349febcdd002568c86683`, `e64cc2f653624c2e9495c9183bdf7675`
  - 首轮草稿 ID: `QbCZvI0l3BDFBWrSXSwYcT6KiPSFi04oATgkze-_0Sitcc0iXGYmrOtDYvPlOPyA`
  - 第二次复核草稿 ID: `QbCZvI0l3BDFBWrSXSwYcZaJmVU4q9t42P2nOY7C936R9f28m5_kCaT9c5ARmRoR`
- 实际消耗: 第二次复核未重跑长文、未重生段间图、未重生封面, 没有重复烧 AI/出图 credits; 仅按确认边界新增 1 次真实微信草稿创建.
- 是否重复提交: 是, 但仅 1 次, 且先获总控/老板确认. 若第二次仍失败, 不再自动第三次外发.

## 结果

通过。

第二次真实推送复核通过: 当前后端代码重建 HTML 后, 推送前 sanitizer 保留 4 张本次段间图, 远端微信公众号草稿正文也查到 4 张图片。

首轮失败原因已归因: 首轮真实推送创建草稿成功, 但命中 11:08 启动的旧后端进程, 早于 T-004/T-005 主线合入时间 `13:30`, 生成的 push HTML 没有 `data-nrg-section-image` 内部标记, sanitizer 把 4 张本次段间图剥掉。

第二次复核边界:

- 复用已有文章: `wechat.write` task `ff279a59d4d549b6b8513e77a825d287`
- 复用已有 4 张段间图: `fd1d4031ec2047e9a807f890d5870aae`, `3dd6e108e6d0402eb404eb1bdd2a351d`, `87a9d0d817e349febcdd002568c86683`, `e64cc2f653624c2e9495c9183bdf7675`
- 复用已有封面: `/Users/black.chen/Desktop/neironggongchang/data/wechat-cover-batch/wxcover_0_1777442791_0.png`
- 只调用 `/api/wechat/html` 和 `/api/wechat/push`; 未调用 `/api/wechat/write`, `/api/wechat/section-image`, `/api/wechat/cover`, `/api/wechat/cover-batch`

第二次复核结果:

- `/tmp/preview/last_push_request.json`: `img_count_original=5`, `img_count_sanitized=4`
- sanitizer: `removed.img_from_appmsg=1` (模板头像), `trusted appmsg kept=4`, `http→https=4`, `strip ?from=appmsg=4`
- `/tmp/preview/last_push_request.html`: `img_count=4`, `mmbiz_count=4`, `has_from_appmsg=false`, `has_internal_marker=false`, `has_media_url=false`, `has_localhost=false`, `has_qa_marker=true`
- 远端草稿 API: `found=true`, `img_count=4`, `mmbiz_count=4`, `has_qa_marker=true`, `has_from_appmsg=false`, `has_internal_marker=false`, `has_media_url=false`, `has_localhost=false`
- 第二次草稿 ID: `QbCZvI0l3BDFBWrSXSwYcZaJmVU4q9t42P2nOY7C936R9f28m5_kCaT9c5ARmRoR`

## 发现的问题

### P1 - 首轮真实草稿无图 (已通过第二次复核关闭)

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

### 第二次真实草稿推送复核通过

- 后端 PID: `91656`
- 复核方式: 恢复已有工作流到 Step 5 完成态, 点击 `拼 HTML`, 再恢复已有封面到 Step 7, 点击 `推送草稿箱`.
- 网络调用:
  - 允许: `/api/wechat/html`, `/api/wechat/push`
  - 禁止且未发生: `/api/wechat/write`, `/api/wechat/section-image`, `/api/wechat/cover`, `/api/wechat/cover-batch`
- 本地 payload:
  - `img_count_sanitized=4`
  - `rewritten.trusted appmsg kept=4`
  - `has_from_appmsg=false`
  - `has_internal_marker=false`
- 远端草稿:
  - `img_count=4`
  - 4 张图均为 `https://mmbiz.qpic.cn/.../640`
  - `has_qa_marker=true`

## 复现步骤

1. 用旧后端进程跑完整公众号 8 步并推送草稿.
2. 查看 `/tmp/preview/last_push_request.json`.
3. 观察 `img_count_sanitized=0`, `removed.img_from_appmsg=5`.
4. 用微信公众号 `draft/batchget` 查同一草稿 ID, 正文 `img_count=0`.
5. 重启后端到当前主线代码.
6. 复用同一批段间图调用 `/api/wechat/html`, 再对 `wechat_html` 调 `sanitize_for_push`, 可见 4 张本次段间图被保留.

## 后续

T-006 可标记通过。首轮旧后端产生的无图草稿仍在微信草稿箱里, 如需清理请由总控/老板决定; QA 本轮不再进行第三次外发。
