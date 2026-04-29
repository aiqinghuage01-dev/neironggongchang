# 总控交接 · 素材库定时巡检闭环

时间: 2026-04-29 22:58 CST

## 背景

老板确认素材库要做成「精品原片库」完整页, 并要求出门期间不要只跑一轮半成品。

## 已做

- 已启动素材库返工循环: `bash scripts/start_materials_loop.sh`
- 已启动自动派工器: `bash scripts/start_agent_dispatcher.sh --allow-dirty-slot media-dev`
- `media-dev` 允许接管上一轮留下的素材库半成品, 其他槽位仍保持默认“脏工作区不派工”的安全策略。
- 素材库循环新增技术掉线保护: 若任务只是 worker 退出且没有报告/commit, 优先重置当前轮重试, 不直接消耗下一轮返工额度。

## 当前队列

- T-026: blocked, 第一轮媒体实现 worker 退出但留下完整半成品 diff。
- T-032: blocked, 第二轮 worker 技术退出。
- T-035: claimed, 第三轮媒体开发自动正在接管半成品继续实现。
- T-027/T-028: 仍在等实现任务 done 后进入审查和真实浏览器 QA。

## 验证

- `python3 -m py_compile scripts/agent_dispatcher.py scripts/agent_materials_loop.py`
- `bash -n scripts/start_agent_dispatcher.sh`
- `bash -n scripts/start_materials_loop.sh`
- `bash scripts/start_agent_dispatcher.sh --status`
- `bash scripts/start_materials_loop.sh --status`

## 后续规则

总控继续通过队列和收件箱读报告。只有出现 owner_decision 才需要老板选择; 普通 Review/QA blocked 会自动进入返工。
