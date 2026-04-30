# CONTROLLER T-075 - 做视频 Step 1 按参考图重构

## 结论

已按老板给的参考图重构做视频 Step 1 首屏。页面现在是:

- 顶部居中标题: `把素材丢进来 ↓`
- 单一大输入框: 链接 / 文案 / 录音提示统一放进来
- 输入框底部工具按钮: `录音` / `上传` / `选题库` / `我的素材`
- 右下角主按钮: `开始 →`
- 下方热点区: `没思路？从热点开始` + `全网 5 / 行业 5 / 本地 5` + 5 行紧凑列表

## 改动

- `web/factory-make-v2.jsx`
  - Step 1 首屏从四 tab 大入口重构为参考图的大输入框形态。
  - 热点区从大卡改为紧凑列表行, 每行包含热度、小标题、摘要和 `用 →`。
  - 增加全网/行业/本地筛选和换批交互。
  - 真填文案后 `开始 →` 变可用; URL 仍走提取改写, 普通文案进入声音 + 数字人。
- `shortvideo/works.py`
  - 热点雷达默认池从 12 条扩到 15 条。
  - 保底池补齐到大新闻/行业相关/本地热点各 5 条。
- `tests/test_make_hot_radar_static.py`
  - 锁住 `把素材丢进来 ↓`、`没思路？从热点开始`、`全网` 和 5 条批次。
- `tests/test_works_api.py`
  - 锁住 `/api/hot-topics?limit=30` 至少返回 15 条保底池。

## 验证

- `python3 -m py_compile shortvideo/works.py` 通过。
- `pytest -q tests/test_make_hot_radar_static.py tests/test_works_api.py::test_hot_topics_list_gives_batch_pool_for_make_page tests/test_works_api.py::test_hot_topics_list_fills_radar_floor` -> 5 passed。
- `git diff --check` 通过。
- 正式 API 已重启, `curl /api/hot-topics?limit=30` -> 15 条, `大新闻/行业相关/本地热点` 各 5。
- Playwright:
  - 打开 `http://127.0.0.1:8001/?page=make&v=t074-drop-material-2`
  - 截图已读, 页面结构匹配参考图。
  - 真填文案后 `开始 →` 从禁用变为可点。
  - 点击 `行业 5` 和 `换一批 ↻` 后列表正常切换。
  - console error=0, pageerror=0, requestfailed=0, network 全 200; 仅 Babel 开发 warning。

## 截图

- 首屏高视口: `/tmp/nrg_make_t074/t074-make-full-tall-final.png`
- 普通视口: `/tmp/nrg_make_t074/t074-make-drop-material.png`

## 备注

- 本轮未改数字人后续步骤、剪辑和发布链路。
- `data/`, `vendor/`, `docs/design/MAC_MINI_TEAM_BETA_ARCHITECTURE.md` 是工作区既有未跟踪项, 未纳入本轮提交。
