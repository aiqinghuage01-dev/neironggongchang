# CONTROLLER T-073 - 做视频热点排行白底火焰视觉修正

## 结论

已按老板截图反馈修正: 做视频页热点排行头部不再使用生硬红橙色块, 改成白底 + emoji `🔥` 的热度 badge。

## 改动

- `web/factory-make-v2.jsx`
  - 新增 `HotRadarFlameBadge`。
  - 热点排行头部改为白底 `🔥 + 热度数字` badge。
  - 热点卡左侧热度区复用同一白底 badge。
  - 热点卡背景/边框/阴影从偏橙改成白底和浅米灰, 降低颜色刺激。
- `tests/test_make_hot_radar_static.py`
  - 增加静态断言, 锁住 `HotRadarFlameBadge` 和白底样式。

## 验证

- `pytest -q tests/test_make_hot_radar_static.py` -> 3 passed。
- Playwright:
  - 打开 `http://127.0.0.1:8001/?page=make&v=t073-white-fire`
  - 截图已读, 热点排行头部可见白底 `🔥91` badge, 无红橙方块。
  - 点击“换一批”后正常切到第 2/4 批, 头部变为白底 `🔥79` badge。
  - console error=0, pageerror=0, requestfailed=0; 仅 Babel 开发 warning。

## 截图

- 首批: `/tmp/nrg_hot_radar_t073/t073-make-hot-radar-white-fire.png`
- 换批后: `/tmp/nrg_hot_radar_t073/t073-make-hot-radar-white-fire-next.png`

## 范围说明

本轮只改做视频页热点排行视觉, 不改热点抓取、三类分类、接口和文案改写链路。
