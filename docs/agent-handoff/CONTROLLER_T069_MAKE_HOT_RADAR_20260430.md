# CONTROLLER_T069_MAKE_HOT_RADAR_20260430

## 任务

做视频页热点区按老板截图改为大横卡视觉；每天至少展示 3 条热点；接入热点雷达；不满意时可以“换一批”。

## 改动

- `web/factory-make-v2.jsx`
  - 热点区改成“热点雷达”三条大卡: 热度、平台、匹配定位、趋势标签、`做成视频` 主按钮。
  - 一次拉取 `/api/hot-topics?limit=24`, 前端按 3 条一组展示。
  - 新增 `换一批`: 在候选池内切下一组; `刷新`: 重新拉热点雷达。
  - “今天的热点”tab 复用同一张热点大卡, 保留“只塞文案”入口。
- `shortvideo/works.py` / `backend/api.py`
  - 新增 `list_hot_topics_for_radar()`: 真实 `hot_topics` 数据优先。
  - 真实库不足时补清华哥业务相关候选, 小 limit 至少 3 条, 大 limit 至少 9 条, 保证页面和换批可用。
- `web/factory-materials.jsx`
  - 热点库里对保底候选隐藏删除按钮, 避免没有真实数据库 id 的候选触发删除错误。
- `tests/test_works_api.py` / `tests/test_make_hot_radar_static.py`
  - 覆盖热点雷达保底、批量候选池、做视频页批处理和大卡关键文案。
- `docs/TECHNICAL-DECISIONS.md`
  - 记录 D-102: 真实库优先 + 保底候选池的取舍。

## 验证

- `curl http://127.0.0.1:8000/api/hot-topics?limit=3`
  - 返回 3 条, 第一条为真实库已有抖音热点。
- `curl http://127.0.0.1:8000/api/hot-topics?limit=24`
  - 返回 9 条候选池。
- Playwright 桌面 `http://127.0.0.1:8001/?page=make`
  - `做成视频` 按钮数: 3。
  - 第一批含: `AI 客服集体下岗?一线从业者发声`, `老板开始用 AI 盯经营日报`, `线下课学员用 AI 改业务流程`。
  - 点击 `换一批` 后含: `研发团队把会议纪要变工单`, `出差路上用 AI 拆客户需求`, `AI 课不是学工具而是改业务`。
  - `pageErrors=[]`, `requestFailures=[]`; console 仅有项目既有 Babel standalone warning。
  - 截图:
    - `/tmp/nrg_hot_radar_make/make-hot-radar-final.png`
    - `/tmp/nrg_hot_radar_make/make-hot-radar-after-change.png`
    - `/tmp/nrg_hot_radar_make/make-hot-radar-mobile-2.png`
- `source .venv/bin/activate && pytest -q -x`
  - 通过; 仅 dhv5 本机 skill 缺失相关用例跳过。

## 结论

T-069 已通过总控自测, 可交给老板验收视觉与热点题材口味。
