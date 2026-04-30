# T-072 总控交接: 状态面板显示总控活动

时间: 2026-04-30

## 背景

老板指出: 如果总控在主工作区干活, 研发部状态面板看不到这件事。原面板只展示 content/media/qa/review 派工槽位, 主控手动收口时容易被误判为“没人干活”。

## 已改

- `scripts/agent_dashboard.py`
  - `/api/status` 的 `slots` 第一项增加 `controller` 槽位, 名称为 `NRG 总控`。
  - 总控槽位根据主工作区 significant git status 或 controller claimed 任务显示 `running/idle`。
  - 主工作区 dirty 时, 页面说明“总控正在手动收口或等待提交”, 并展示关键 dirty 文件。
  - `/api/status` 增加 `delegation` 汇总, 显示总控接管副 Agent 任务的总数、缺少接管理由数量和最近记录。
  - 页面新增“总控接管”区块。
  - 增加内联 favicon, 清掉 `/favicon.ico` 404 console 噪音。
- `docs/PROGRESS.md` / `docs/AGENT_BOARD.md` / `docs/TECHNICAL-DECISIONS.md`
  - 记录 T-072 和 D-127。

## 验证

- `python3 -m py_compile scripts/agent_dashboard.py` -> 通过。
- `bash scripts/start_agent_dashboard.sh` -> 已重启面板, `http://127.0.0.1:8765/` 可访问。
- `curl http://127.0.0.1:8765/api/status`:
  - `slots[0].controller=true`
  - `slots[0].agent_name=NRG 总控`
  - `delegation.total_takeovers=17`
- Playwright:
  - 截图已读: `.playwright-cli/page-2026-04-30T08-32-13-976Z.png`
  - 可见 `NRG 总控` 第一张卡和“总控接管审计”。
  - 点击第一个“看日志”按钮后 `#logbox` 显示。
  - console error=0。
  - network 只有 `/api/status` 和 `/api/log` 200。

## 注意

当前主工作区仍有 T-071/素材库相关未提交改动, 本次提交只包含状态面板和文档交接相关文件, 不混入业务功能改动。
