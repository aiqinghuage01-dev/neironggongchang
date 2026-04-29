# 总控交接: D-126 健康检查短探活 + T-060 QA 阻塞处理

时间: 2026-04-30 03:14
角色: 总控 Agent

## 背景

T-047 媒体/资产区优化已合入 main 后, 总控派 T-060 给 QA 做 no-credit 回归。QA worker 在环境确认阶段使用 `curl -m 5 /api/health`, 但该接口会同步跑 Opus/OpenClaw 真探活, 实测可超过 7 秒, 于是被误判为超时。随后 QA worker 停止 8000/8001 并前台启动 uvicorn, 卡住未产出报告。

## 处理

- 已停止卡住的 T-060 worker, 队列标记为 blocked, 原因是 QA 执行流程阻塞, 不是产品功能不通过。
- `/api/health` 改为短 AI 探活: `timeout=3.0`, `llm_max_retries=0`。
- 完整 AI 重探继续保留在 `/api/ai/health?fresh=1`, 不影响业务生成链路。
- `shortvideo.ai.get_ai_info()` 增加可选短探活参数, 默认行为不变。

## 文件

- `backend/api.py`
- `shortvideo/ai.py`
- `tests/test_ai_routing.py`
- `tests/test_health_api.py`
- `docs/TECHNICAL-DECISIONS.md`

## 验证

- `git diff --check` 通过。
- `.venv/bin/pytest -q tests/test_health_api.py tests/test_ai_routing.py` -> 10 passed。
- `.venv/bin/pytest -q tests/test_works_api.py tests/test_apimart_service.py tests/test_materials_lib_api.py` -> 61 passed。
- `.venv/bin/pytest -q -x` -> 通过, 仅本机缺 dhv5 skill 的 17 个用例跳过。
- 正式端口重启后:
  - `curl -m 5 /api/health` -> HTTP 200, `time=3.308198`, AI 慢响应记录为 `ai.ok=false`。
  - `curl /api/material-lib/categories` -> `source_label=临时素材源`, `category_count=8`。
  - `curl -I http://127.0.0.1:8001/` -> HTTP 200。
- Playwright:
  - `node scripts/e2e_pages_smoke.js /tmp/_ui_shots/t126_full_smoke` -> 16/16 pages OK, errors=0。
  - 媒体/资产 6 页 `image/imagegen/dreamina/dhv5/works/materials` 禁止词扫描命中 0, console/pageerror/requestfailed/http error 均 0。
  - 截图: `/tmp/_ui_shots/t126_media_image.png`, `/tmp/_ui_shots/t126_media_imagegen.png`, `/tmp/_ui_shots/t126_media_dreamina.png`, `/tmp/_ui_shots/t126_media_dhv5.png`, `/tmp/_ui_shots/t126_media_works.png`, `/tmp/_ui_shots/t126_media_materials.png`。

## 后续

- 建议下一条 QA 任务明确禁止停启 8000/8001, 只读复测已运行端口; 如果端口异常, 直接 block 交给总控处理。
