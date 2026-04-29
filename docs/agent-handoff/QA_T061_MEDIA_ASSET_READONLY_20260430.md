# QA Report

## 任务 ID

T-061

## 测试对象

- 任务: D-126 后媒体/资产区只读复测
- 分支: `codex/qa`
- main commit: `296b700 docs: queue strict media qa retest`
- QA 同步 commit: `de4a754 Merge branch 'main' into codex/qa`
- 页面: `?page=image,imagegen,dreamina,dhv5,works,materials`

## 端口与执行边界

- 只使用当前已运行的 `http://127.0.0.1:8000` 和 `http://127.0.0.1:8001`。
- 未执行 kill / stop / restart / uvicorn / `scripts/start_api.sh` / `scripts/start_web.sh`。
- 未调用 `/api/health` 作为环境门禁。
- 未点击任何生成、提交、渲染、上传类按钮。

## 真实操作

- 打开:
  - `http://127.0.0.1:8001/?page=image`
  - `http://127.0.0.1:8001/?page=imagegen`
  - `http://127.0.0.1:8001/?page=dreamina`
  - `http://127.0.0.1:8001/?page=dhv5`
  - `http://127.0.0.1:8001/?page=works`
  - `http://127.0.0.1:8001/?page=materials`
- 点击: 每页点击页面空白区域 `360,240`, 避免触发生成提交。
- 输入: `imagegen/dreamina/dhv5/works/materials` 的首个可见文本框输入 `QA只读检查，不提交生成`; `image` 页无可见文本框。
- 等待: 每页等待 DOM + 网络稳定, 再滚动 520px 并截图。

## 证据

- `curl /api/material-lib/categories`:
  - `source_label='临时素材源'`
  - `root='/Users/black.chen/Downloads'`
  - `category_count=8`
  - `total=1618`
- 截图:
  - `/tmp/_ui_shots/t061_media_asset_readonly_20260430/image.png`
  - `/tmp/_ui_shots/t061_media_asset_readonly_20260430/imagegen.png`
  - `/tmp/_ui_shots/t061_media_asset_readonly_20260430/dreamina.png`
  - `/tmp/_ui_shots/t061_media_asset_readonly_20260430/dhv5.png`
  - `/tmp/_ui_shots/t061_media_asset_readonly_20260430/works.png`
  - `/tmp/_ui_shots/t061_media_asset_readonly_20260430/materials.png`
  - 结果 JSON: `/tmp/_ui_shots/t061_media_asset_readonly_20260430/results.json`
- 禁止词扫描: 6 页可见文案均 0 命中。
  - 扫描词: `AIGC`, `CLI`, `credits`, `submit_id`, `task_id`, `daemon`, `ffmpeg`, `PIL`, `deepseek`, `transcript`, `scenes`, `text2video`, `image2video`, `multimodal2video`, `seedance`, `Downloads`, `并发`, `并行`, `个 task`, `工程耗时`, `xx-xxs/min` 模式。
- console/pageerror/requestfailed/http>=400:
  - console error: `0`
  - console warning: `6` 条, 均为本地开发模式 Babel warning。
  - console info: `6` 条, 均为 React DevTools 提示。
  - pageerror: `0`
  - requestfailed: `0`
  - HTTP >= 400: `0`
- 生成类请求:
  - 非 GET 请求: `0`
  - 命中媒体生成提交接口的请求: `0`
- pytest:
  - 命令: `/Users/black.chen/Desktop/neironggongchang/.venv/bin/python -m pytest -q tests/test_health_api.py tests/test_works_api.py tests/test_apimart_service.py tests/test_materials_lib_api.py`
  - 结果: selected tests all passed `[100%]`; 仅 FastAPI/Pydantic deprecation warnings。

## Credits / 外部服务

- 是否真烧: 否。
- 测试规格: 只读页面覆盖 + 业务接口读取。
- 输入参数: 仅输入 `QA只读检查，不提交生成`, 未提交。
- task id / 作品 id: 无。
- 实际消耗: 未消耗媒体生成 credits。
- 是否重复提交: 否。

## 结果

通过。

## 发现的问题

无。

## 复现步骤

1. 在 `codex/qa` 合入 main commit `296b700`。
2. 不调用 `/api/health`, 不启停端口。
3. `curl -fsS --max-time 10 http://127.0.0.1:8000/api/material-lib/categories`。
4. Playwright 打开 6 个页面, 填写只读 QA 文案, 点击空白区域, 滚动, 截图并扫描可见文案。
5. 运行指定 pytest。

## 下一步建议

T-061 可标记 done, 交给总控收件箱处理。

## 是否需要老板确认

否。
