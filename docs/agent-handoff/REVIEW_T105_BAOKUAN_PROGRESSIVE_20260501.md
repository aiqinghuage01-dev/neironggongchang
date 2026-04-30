# Review Report

## 任务 ID

T-105 — T-098 爆款改写实时输出代码审查 (依赖 T-098)

## 审查对象

- 分支 / commit: `codex/content-dev` @ `c9ded74 feat: stream baokuan versions progressively`
  - 后续 doc-only commit: `b16c1a4 docs: fix baokuan progressive handoff hash`, `9353869 docs: align baokuan handoff commit`
  - 注: T-098 尚未合入 `main` (`main@a424a90`); 审查范围以 `c9ded74` 为准, doc-only 后续不影响代码结论
- 范围: T-098 全量 diff (6 文件 / +1140 / -112)
- 报告参考:
  - dev: `docs/agent-handoff/DEV_CONTENT_T098_BAOKUAN_PROGRESSIVE_20260501.md` (commit `c9ded74` 内)
  - 前置 T-094 review (hotrewrite polish 模板): `docs/agent-handoff/REVIEW_T103_HOTREWRITE_PROGRESS_POLISH_20260501.md`
  - 前置 T-095 review (compliance 复用同套防线): `docs/agent-handoff/REVIEW_T095_COMPLIANCE_PROGRESSIVE_20260501.md`
- 改动文件 (6):
  - `backend/services/baokuan_pipeline.py` (+418 / -112)
  - `backend/api.py` (+15 / -3)
  - `web/factory-baokuan-v2.jsx` (+173 / -34)
  - `tests/test_baokuan_progressive.py` (+218, 新增)
  - `scripts/e2e_baokuan_progressive.js` (+353, 新增)
  - `docs/agent-handoff/DEV_CONTENT_T098_BAOKUAN_PROGRESSIVE_20260501.md` (+75, 新增)

## 已校验 (任务说明逐项)

| 项 | 结果 | 证据 |
|---|---|---|
| 1) 是否绕过清华哥人设关卡 | ✓ | `_write_single_version` (`baokuan_pipeline.py:268-319`) 每版仍走 `get_ai_client(route_key="baokuan.rewrite")`; `analyze_baokuan` 走 `route_key="baokuan.analyze"`. route_key 与 T-098 前一致, 关卡层 `shortvideo.ai.get_ai_client` 自动注入清华哥人设. system prompt 仍引用完整 `skill['skill_md']` (`baokuan_pipeline.py:226-244`), 严禁项 (前 5 秒不动 / 不超原文 30% / 严禁 AI 味) 全保留. |
| 2) 是否增加不可控 credits | ⚠ 可控 (有上限) | 旧: 1 次 LLM 调用 (max_tokens=6000). 新: 每版 1 次, mode=`pure`/`business` 共 2 次, mode=`all` 共 4 次, 每次 `max_tokens=2400`. 真实增量约 2-3×, 但是**有界**且无重试循环 (per-call retry 仅 `llm_retry.with_retry` 默认 1 次). version_count ≤ 4, 不会无限叠加. dev 报告 (`没测到 / 需要 QA 重点测`) 已明确标注 credits 增量风险, QA 默认建议 `pure` 2 版小烧, 不直接跑 `all` 4 版, 走风险约束. **不阻塞, 是设计预期成本**. |
| 3) partial 清洗和 failed 保留是否正确 | ✓ | (a) `sanitize_result_for_display` (`baokuan_pipeline.py:95-116`) 用 `_INTERNAL_DISPLAY_KEY_PARTS=("token","route","model","provider","prompt","submit_id","api")` 子串匹配 + `startswith("_")` 双重过滤 keys; `content` 字段额外跑 `_clean_script_content` 7 段正则 (已走技能 / 需要进一步操作吗 / `\n prompt|tokens|api|...`). (b) `backend/api.py:670-687` `_sanitize_task_for_display` 已挂上 `kind.startswith("baokuan.")` 分支, `result/partial_result/progress_data` 三处都走 sanitize. (c) `_emit_partial` 在生成前/中/后都用 `_progress_snapshot` 重新构建并双重 sanitize, 所以 task DB 持久化的 partial 不含内部字段 (单测 `test_baokuan_async_exposes_v1_v2_then_ok` 直接断言 `"tokens" not in json.dumps(partial_result)`). (d) failed 保留: `backend/services/tasks.py:240-242` failed 分支不清 `partial_result/progress_data`, T-088 收口的三态 (ok 清 / cancelled 清 / failed 保留) 未被改写; 单测 `test_baokuan_failure_preserves_completed_versions` 断言 V3 raise 后 `partial_result.units` = `[V1, V2]`, `progress_data.timeline` 仍含 failed V3 行. |
| 4) 测试是否覆盖 UI | ⚠ 部分 (无 cancel) | 后端 `tests/test_baokuan_progressive.py` 4 条都 pass (本机 `pytest -q` 复跑 `4 passed in 1.35s`); 联跑 `test_baokuan_progressive + test_tasks_api + test_hotrewrite_versions + test_compliance_progressive` = `20 passed`. e2e `scripts/e2e_baokuan_progressive.js` 覆盖 5 场景 (running V1 / running V2 / slow V4 / done / failed partial) + 390px 窄屏, 都对前端做断言 + 截图 + 拦 console/pageerror/requestfailed/http>=400 + body forbiddenRe (`已走技能/需要进一步操作吗/prompt/tokens/API/route/model/provider/submit_id/本机路径`) 全 0. **缺 cancel scenario 端到端 UI 验证** — T-103 review 明确建议 "T-098 落地时顺手清" 的 P2-5 (cancel 按钮 click 后消失断言), T-098 没补; 见 P2-3. |
| 5) 不能展示 prompt/tokens/model/provider 等内部字段 | ✓ | `_INTERNAL_DISPLAY_KEY_PARTS=("token","route","model","provider","prompt","submit_id","api")` 用大小写无关子串匹配, 包括衍生字段 (`route_key`, `_tokens`, `model_used`, `apimart_*` 都中). `_write_single_version` 返回的 dict 含 `_tokens`, 在 `rewrite()` 主循环里 `version.pop("_tokens", 0)` 先剥再入 `completed_by_key`, 双重保险. e2e 在每个 scenario 结束前用 `forbiddenRe.test(bodyText)` 断言, 单测 `test_baokuan_task_api_sanitizes_result_and_partial` 给 running/failed/ok 三种状态都塞了 `tokens/route_key/provider/model/prompt + 已走技能 + 需要进一步操作吗 + ---` 故意污染数据, 然后 `client.get("/api/tasks/{id}").json()` dump 断言所有 forbidden 词都不在 body. |

`pytest -q tests/test_baokuan_progressive.py tests/test_tasks_api.py tests/test_hotrewrite_versions.py tests/test_compliance_progressive.py` 本机复跑 = **20 passed** (T-098 加的 4 条 + 既有 16 条).

`node --check scripts/e2e_baokuan_progressive.js` (dev 报告已确认 OK, 本审查未重跑 node).

`python3 -m py_compile backend/services/baokuan_pipeline.py backend/api.py` (dev 报告已确认 OK).

## 结论

**通过, 可关闭** (无 P0/P1).

- 持久化清洗、失败保留、人设关卡、内部字段过滤、UI 展示链路全部对齐 T-094/T-095 已通过的渐进展示模板.
- credits 增量是设计预期 (2-3× 上限, 无失控循环), 风险已记录.
- 4 条 pytest + 5 个前端 mock e2e scenario 通过.
- 取消场景端到端断言、几条沿用 T-103 的 P2 (failed 行子标题 / unitKey fallback / cancel 按钮消失) 留作下一轮 polish.

## P0 风险

无.

## P1 风险

无 (相关 cancel-overwrite 行为是 T-094 / T-095 / 老 baokuan 共有的架构残留, 非 T-098 引入, 详见 P2-1).

## P2 风险

### P2-1 cancel 期间 LLM 抛错时, `cancelled` 终态会被 `failed` 覆盖 (架构遗留, T-098 扩大了触发面)

`backend/services/tasks.py:208-242` 的 `finish_task(status="failed")` SQL 没有 `WHERE status='running'` 守卫, 所以 worker 在 `except Exception` 分支调 `finish_task(failed)` 会无条件覆盖任何已存在状态, 包括 `cancelled`. `backend/services/tasks.py:630-649` `run_async._worker` 仅在**成功路径**有 `if is_cancelled(task_id): return`, **异常路径不查**.

T-098 因为 `rewrite()` 在 `if not out_versions: raise RuntimeError("爆款改写没有生成可用版本")` (`baokuan_pipeline.py:503-505`) 多了一条 raise 路径, 进一步扩大触发面. 复现 (`/tmp/repro_cancel_v1_raise.py`):

```
submitted task: cf530a932a614baaa55fec898ea8bed0
cancel_task returned: True
After cancel: status='cancelled'
FINAL: status='failed', error='RuntimeError: LLM transient error during cancel'
✗✗✗ BUG: cancelled overwritten as failed!
```

同样脚本对 hotrewrite (`/tmp/repro_hotrewrite_cancel.py`) 也复现:

```
cancel_task returned: True
FINAL: status='failed', error='RuntimeError: LLM transient error'
hotrewrite same overwrite: 'failed'
```

UX: 老板点 "取消剩余生成" 后, 任务页本应显示 "任务已取消", 但若取消瞬间 LLM 也抛了 transient error, 看到的是 "改写失败" + "RuntimeError: ..." — 跟用户期望差一截. 但因为该 bug 早已存在于 T-094 / T-095 / 旧版 baokuan, 单独阻塞 T-098 不一致, 故归 P2.

修法 (1 行级别, 建议起独立"取消语义收口"任务):
```python
# backend/services/tasks.py run_async._worker 异常分支首行
except Exception as e:
    if is_cancelled(task_id):
        return
    finish_task(task_id, error=..., status="failed")
```

或更稳: `finish_task(failed)` SQL 加 `WHERE status='running'` (但要看是否影响其他 happy path).

### P2-2 cancel scenario 端到端 UI 没有断言 (沿用 T-103 P2-5, T-098 仍未补)

`scripts/e2e_baokuan_progressive.js:255-348` 5 个 scenario 都没 click "取消剩余生成" → 等 "任务已取消" 标题 → 断按钮消失 → 校 `cancelPosts==1` 这条链路. T-103 (T-094 hotrewrite) 已经在 e2e 加了 cancelled 场景, T-098 要 "举一反三" 时漏抄. 修法 ~30 行 (复制 hotrewrite 的 cancelled scenario 改路径). 不阻塞合入, 留给下一轮 polish.

### P2-3 timeline 项 `version_index` vs `completed_versions` 副标题误导 (沿用 T-103 P2-1)

`web/factory-task.jsx:256-264` 的 done/failed 分支用 `completed_versions` 显示 "第 N / M 版", 但 failed V4 后端写入 `{status:"failed", version_index:4, completed_versions:3, total_versions:4}` 会显示成 "第 3 / 4 版" 跟主文案 "第 4 版暂时没跑完" 矛盾. T-103 已点名建议 T-095/T-098 落地时顺手清, T-098 没碰 `factory-task.jsx`. 不阻塞.

### P2-4 `unitKey` fallback 撞 key 风险 (沿用 T-103 P2-2)

`web/factory-task.jsx:206-213` `unitKey` 在缺 `unit_id`/`variant_id`/`version_index` 时回落到 `version:${completed_versions}`. T-098 的后端 timeline 都明确写入 `unit_id` (`baokuan_pipeline.py:435,466,491`), 所以本身没问题; 但 T-103 review 建议 T-098 顺手把 fallback 改成 `running:${ts}` 唯一 key, T-098 同样没改. 不阻塞.

### P2-5 `_clean_script_content` 第 7 段正则在合法行业内容里可能误删

`baokuan_pipeline.py:74-79`:
```python
content = re.sub(
    r"\n{1,2}\s*(?:prompt|tokens?|api|route|model|provider|submit_id|/Users)\b[\s\S]*$",
    "",
    content,
    flags=re.IGNORECASE,
).strip()
```

锚定 "段落开头" + 关键词 + `\b`, 但若用户原文恰好有 "API 改革带来..." / "Model 3 销量..." 这种段落首词, 整段会被截断到 EOF. baokuan 的输入是视频口播逐字稿, 命中概率很低; 但若老板贴了一段科技/汽车爆款, 触发概率上升. 已经有上层 `_is_internal_display_key` 兜底过滤 keys, content 内容被截断属"过度清洗"而非"泄密". 不阻塞, 留作样本驱动收紧.

### P2-6 estimated_seconds 从 45 跳到 110/220 (`pure`/`all`), 老用户预期会落差

`_estimated_seconds(mode)` 按 `55s × version_count` 给, mode=`all` 估 220s. 旧版固定 45s. 估计是更诚实, 但前端 `LoadingProgress` 跑到 220s 才到 100% — 老板若以前习惯 30-45s 等待, 会觉得"变慢了". 真烧 4 版本身 90-180s 是合理的, 文案与等待对齐属正向. 不阻塞.

## 缺失测试

- cancel scenario 端到端 UI 断言 (P2-2) 缺.
- failed 行 `version_index` 子标题回归 (P2-3) 缺.
- `unitKey` fallback 撞 key 边缘 case (P2-4) 缺.
- 真烧 4 版最小链路验证 partial_result 演进 (T-103 P2-6 同款) 缺 — dev 报告已建议 QA 跑 1 次最小 `pure` 模式 V1/V2 真烧, 不直接跑 `all`.
- 取消瞬间 LLM 抛错的 cancelled→failed 覆盖回归 (P2-1) 缺 — 我已经离线复现 (`/tmp/repro_cancel_v1_raise.py`), 用 `monkeypatch _write_single_version` 即可加进 `tests/test_baokuan_progressive.py`.

均为 P2 范畴, 不阻塞合入.

## 用户体验问题

1. **failed 行 timeline 副标题** 跟主文案矛盾 (P2-3); 仍是 T-094 时代沿用的视觉小 bug.
2. **取消按钮文案** "已发起的生成可能仍会消耗额度；取消后页面会停止等待剩余版本" 跟 T-094 hotrewrite 一致, 诚实, OK; 真停烧仍未做 (架构级, 跟 P2-1 同源).
3. 主链路视觉 (V1 提前展示 / 已等 X / 4 版切换 / failed 保留 / 390px) 跟 T-094/T-095 review 一致, 无退化.

## 建议交给谁修

T-105 本身可 done. 下一步:

- **P2-1 (cancel-overwrite 架构级)**: 起独立 "取消语义收口" 任务, 修 `tasks.run_async._worker` 异常分支补 `is_cancelled` 守卫, 同时给 baokuan / hotrewrite / compliance 三处 pipeline 各加一条 cancel-during-V1 + raise 的回归测试.
- **P2-2 / P2-3 / P2-4**: 留给下一个渐进展示举一反三的内容 skill (录音改写 / 投流 / 公众号) 落地时, 抄模板时同步把 `factory-task.jsx` 的 unitKey + 副标题修了; 或起独立 "渐进展示模板收尾" 小任务.
- **P2-5**: 样本驱动, 等真烧时若发现合法内容被误删再收紧.
- **P2-6**: 不修, 是设计预期.

## 下一步建议

1. T-105 在共享队列里 **done**, 报告 + commit 写入 `docs/agent-handoff/REVIEW_T105_BAOKUAN_PROGRESSIVE_20260501.md`.
2. 命令: `python3 ~/Desktop/neironggongchang/scripts/agent_queue.py done T-105 --agent "NRG Claude 审查自动" --report docs/agent-handoff/REVIEW_T105_BAOKUAN_PROGRESSIVE_20260501.md --commit <commit>`.
3. T-105 关闭后, T-098 三方齐 (dev `c9ded74`, QA T-104 进行中, review T-105 通过), 总控可放行 T-098 合入 main.
4. 若总控想把 cancel 真停烧 + cancelled→failed 守卫两件事汇成独立任务, 起一条 "取消语义收口" (优先级中, 老板点取消后看到"失败"会困惑).

## 是否需要老板确认

**否**. T-098 闭环, 无 P0/P1, 无业务取舍, dev 报告已说明 credits 增量与真烧建议. P2-1 是架构级遗留 bug 不限于 T-098, 不应当独立卡住 T-098. 总控用 done 收口即可, 老板只需收一句 "T-105 通过".
