# Controller Report

## 任务

- 队列任务: T-080
- 页面: `http://127.0.0.1:8001/?page=beta`
- 相关面板: `http://127.0.0.1:8765/`
- 目标: 降低研发部作战室页面刷新频率, 避免页面看起来过于频繁刷新。

## 改动

- `web/factory-beta.jsx`
  - 新增 `BETA_STATUS_REFRESH_MS = 60000`。
  - `setInterval(checkDashboard, ...)` 从 10 秒改为 60 秒。
- `scripts/agent_dashboard.py`
  - 新增前端常量 `STATUS_REFRESH_MS = 60000`。
  - 独立研发部面板从 3 秒刷新改为 60 秒刷新。
- `tests/test_frontend_copy_static.py`
  - 新增静态守则, 防止 beta 页和独立面板被改回 10 秒/3 秒高频刷新。

## 运行状态

- 已重启 `scripts/start_agent_dashboard.sh`, 独立面板已吃到新脚本。
- 未重启 `8000/8001`; beta 页由前端文件加载, 浏览器刷新后读取新间隔。

## 验证

- `python3 -m pytest -q tests/test_frontend_copy_static.py` -> 8 passed
- `python3 -m py_compile scripts/agent_dashboard.py` -> pass
- `node --check scripts/e2e_beta_warroom.js` -> pass
- `git diff --check` -> clean
- Playwright beta 页刷新计数:
  - 打开 `http://127.0.0.1:8001/?page=beta`
  - 4.2 秒内 `:8765/api/status` 请求数 = 1
  - console/pageerror = 0
  - 截图: `/tmp/_ui_shots/t080_beta_refresh_60s.png`
- Playwright 独立研发部面板刷新计数:
  - 打开 `http://127.0.0.1:8765/`
  - 4.2 秒内 `/api/status` 请求数 = 1
  - console/pageerror = 0
  - 截图: `/tmp/_ui_shots/t080_agent_dashboard_refresh_60s.png`

## 结论

已改为一分钟刷新一次。状态页仍会打开即加载一次, 后续每 60 秒自动刷新。
