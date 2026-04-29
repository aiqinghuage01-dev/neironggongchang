# DEV_MEDIA T-047 全站媒体与资产区体验优化第一轮

- Agent: NRG 媒体开发自动
- Role: media
- Worktree: `/Users/black.chen/Desktop/nrg-worktrees/media-dev`
- Branch: `codex/media-dev`
- Date: 2026-04-30
- Status: done

## 范围

只处理媒体/资产相关低/中风险优化: 素材库、作品库、出图片二级页、直接出图、即梦、数字人入口。未改内容生产页, 未改 `docs/PROGRESS.md`。

开工前 worktree 有旧脏改, 为避免覆盖 main 上已有修复, 已保存为 `stash@{0}: preexisting-media-dev-dirty-before-t047-20260430`; 本次提交不包含该 stash。

## 前置报告回应

- T-041 QA: 素材库 formal 测试已通过, 无 P0/P1/P2。本轮仅做资产区文案与空态体验补强, 保持素材库主流程不变。
- T-042 QA: `/api/tasks/counts` 与绝对路径问题已由 controller 修复并在本轮基线中存在。本轮没有改 task 路由, 但继续扫描媒体页可见文案, 确认未出现 `/Users/`、`/private/`、`task_id`。
- T-043 Review: 素材库 featured/筛选/空态问题已由 controller 修复。本轮补掉素材库首页剩余的 `Downloads` 展示心智, 改成“临时素材源”。
- T-044 QA: 内容页问题不在 media 角色范围, 本轮未改内容生产页。
- T-045 QA: 媒体低风险项已由 controller 修复第一批。本轮继续补齐残留用户可见技术词: 即梦 `CLI/credits/text2video/seedance/task`、直接出图 `个 task/并行`、数字人 `transcript/scenes/ffmpeg/PIL/min/s`、出图片二级页 `AIGC/引擎/s/张`、素材库 `Downloads`。

## 改动

- `web/factory-dreamina-v2.jsx`
  - 即梦标题从 `AIGC` 改为“图片/视频”, 移除技能 badge 展示。
  - 将 `Prompt + 配置`、`PROMPT 列表`、`submit_id`、`text2video/image2video/multimodal2video`、`seedance...`、`credits` 等用户可见词改为中文业务表达。
  - 批量和失败态文案改为“条任务 / 后台队列 / 任务编号 / 点数”, 失败信息走 `ErrorText`。
- `web/factory-image-gen.jsx`
  - 批量结果从 `个 task / 并行起跑` 改为“条任务 / 会一起开始”。
  - 时间单位改为中文, 失败信息走 `ErrorText`。
- `web/factory-dhv5-v2.jsx`
  - 数字人页替换 `transcript/scenes/PIL/ffmpeg/deepseek/task/min/s` 等可见技术词。
  - 作品库视频选择器状态映射为“待发/已发/合成中/等待/失败/已完成/可用”。
  - 筛选时长改为“20-40秒”这类中文单位。
- `web/factory-image.jsx`, `web/factory-shell.jsx`, `web/factory-works.jsx`
  - `即梦 AIGC` 统一改成“即梦图片/视频”。
  - 出图片二级页 `引擎` 改“工具”, 时间说明改中文单位。
- `web/factory-materials-v2.jsx`, `backend/api.py`
  - 素材库默认演示源对用户展示为“临时素材源”, 不再露出 `Downloads`。

## 验证证据

- 静态检查: `git diff --check` 通过。
- Pytest:  
  `/Users/black.chen/Desktop/neironggongchang/.venv/bin/pytest -q tests/test_works_api.py tests/test_apimart_service.py tests/test_materials_lib_api.py`  
  结果: `61 passed`。
- API 真请求:  
  `curl -s http://127.0.0.1:18000/api/material-lib/categories`  
  证据: `source_label` 返回 `临时素材源`。
- Playwright 浏览器闭环:
  - 覆盖页面: `dreamina`, `imagegen`, `dhv5`, `works`, `materials`。
  - 动作: 真实打开页面、点击视频/批量/作品库选择器/图片 tab、真实填写画面描述。
  - 截图: `/tmp/_ui_shots/t047_final/dreamina.png`, `imagegen.png`, `dhv5.png`, `works.png`, `materials.png`。
  - 文案扫描: `prompt`, `apimart`, `URL`, `/Users/`, `/private/`, `submit_id`, `task_id`, `daemon`, `ffmpeg`, `PIL`, `deepseek`, `transcript`, `scenes`, `个 task`, `用技能`, `CLI`, `credits`, `tokens`, `text2video`, `image2video`, `multimodal2video`, `seedance`, `Downloads`, `并发`, `并行`, `xx-xxs`, `xx-xxmin` 全部 0 命中。
  - 控制台/页面错误/请求失败/HTTP 4xx+ 均为空。
  - 汇总文件: `/tmp/_ui_shots/t047_final/summary.json`。
- 出图片二级页额外验证:
  - 页面: `?page=image`。
  - 截图: `/tmp/_ui_shots/t047_final/image_hub.png`。
  - 扫描额外包含 `引擎`、`N 张`, 0 命中。
  - 汇总文件: `/tmp/_ui_shots/t047_final/image_hub_summary.json`。

## Credits

本轮未提交任何生图、视频、分类或渲染任务, 没有消耗媒体生成 credits。验证中只做过健康检查探活, 返回 `tokens=2`; 不属于媒体生成真烧。

## 风险

- 本轮只改用户可见文案和展示标签, 未改媒体生成、远程任务 watcher、作品库查询或素材库数据结构。
- 数字人页本身当前没有模板和数字人视频数据, 已验证空态可见、无错误。
