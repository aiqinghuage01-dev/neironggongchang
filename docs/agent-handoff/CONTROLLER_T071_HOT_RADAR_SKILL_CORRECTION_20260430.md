# CONTROLLER T-071 - 做视频热点雷达按 skill 三类修正

## 结论

已修正老板指出的两处问题:

1. 做视频页热点头部去掉红色方块火焰, 改为 `🔥91` 这类热度视觉。
2. 热点来源不再是围绕清华哥业务自造一批候选, 改按本地 `热点雷达-学员版` 的三类结构输出: 大新闻 / 行业相关 / 本地热点。

## 改动

- `shortvideo/works.py`
  - 新增 TopHub 实时热榜抓取: 百度、微博、抖音、知乎。
  - 新增 `radar_category`: `大新闻` / `行业相关` / `本地热点`。
  - 做视频雷达列表按三类交错输出, 每批 3 条。
  - TopHub 不可用时才使用同三类结构的保底池。
- `backend/api.py`
  - `/api/hot-topics` 返回 `radar_category`。
- `web/factory-make-v2.jsx`
  - 热点头部改为 `🔥热度` 视觉, 删除旧红色方块。
  - 热点卡增加三类标签, 每批显示三类各一条。
  - “换一批”继续按 3 条一组直接切下一批。
- `tests/test_works_api.py`
  - 覆盖 live 热榜 monkeypatch 后三类顺序。
  - 覆盖 TopHub 不可用时三类保底批次。
- `tests/test_make_hot_radar_static.py`
  - 锁住“大新闻 / 行业 / 本地”口径。
  - 锁住旧红色渐变方块不再出现。

## 验证

- `python -m py_compile shortvideo/works.py backend/api.py` 通过。
- `pytest -q tests/test_works_api.py::test_hot_topics_list_fills_radar_floor tests/test_works_api.py::test_hot_topics_list_gives_batch_pool_for_make_page tests/test_make_hot_radar_static.py` -> 5 passed。
- `pytest -q -x` -> passed, 仅 dhv5 本地 skill 缺失用例按既有规则 skipped。
- 正式 API `curl http://127.0.0.1:8000/api/hot-topics?limit=6` 返回三类交错结果, `fetched_from=hot-topic-radar`。
- Playwright 桌面:
  - `http://127.0.0.1:8001/?page=make`
  - `actionButtons=3`
  - `hasThreeTypes=true`
  - `nextStillThreeTypes=true`
  - `oldBusinessFallbackGone=true`
  - console/pageerror/requestfailed 均为 0, 仅 Babel 开发 warning。
- Playwright 移动:
  - `buttons=3`
  - `bodyWidth=390`
  - `viewportWidth=390`
  - 无横向溢出。

## 截图

- 桌面首批: `/tmp/nrg_hot_radar_t071/make-hot-radar-final.png`
- 桌面换批: `/tmp/nrg_hot_radar_t071/make-hot-radar-next-final.png`
- 移动端: `/tmp/nrg_hot_radar_t071/make-hot-radar-mobile-final.png`

## 备注

- D-103 已记录: D-102 的“业务候选保底”口径被修正, 业务相关只能作为“行业相关”一类, 不能覆盖整批热点雷达。
- `scripts/agent_dashboard.py` 工作区已有未提交改动, 本轮未触碰、未纳入提交。
