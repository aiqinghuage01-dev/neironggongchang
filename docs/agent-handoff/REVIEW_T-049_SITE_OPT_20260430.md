# Review Report

## 任务 ID

T-049 全站优化后第一轮只读审查

- Agent: NRG Claude 审查自动
- Role: review (只读)
- Worktree: `/Users/black.chen/Desktop/nrg-worktrees/review`
- Branch: `codex/review`
- Date: 2026-04-30 CST

## 审查对象

两条全站优化第一轮分支 + main 当前线:

- T-046 内容生产区: `codex/content-dev` 顶 commit `e4780ec fix: polish content production failures` (2026-04-30 02:28:51).
  - 报告: `docs/agent-handoff/DEV_CONTENT_T046_SITE_OPT_20260430.md` (在 content-dev worktree).
  - 改动: `web/factory-{compliance,errors,hotrewrite,moments,planner,touliu,voicerewrite,wechat,write}-{v2,}.jsx` + `scripts/e2e_content_t046.js`. 11 文件 / +311 / -81.
- T-047 媒体/资产区: `codex/media-dev` 顶 commit `f118857 polish media asset visible copy` (2026-04-30 02:51:23). 同名 commit `284958e` 已在 main 落地 (即 T-047 内容已合入 main).
  - 报告: `docs/agent-handoff/DEV_MEDIA_T047_SITE_OPT_20260430.md` (review 仓有副本).
  - 改动: `backend/api.py` (1 行 `source_label`) + `web/factory-{dhv5,dreamina,image-gen,image,materials-v2,shell,works}.jsx`. 9 文件 / +177 / -76.

参考基线: `main` 当前 tip `c0d3dab`, 与 content-dev merge-base `a3298013`. main 在该 merge-base 之后已合入 6f239a9 / 32389d9 / 0c99c43 / 7989a19 等多个站点文案修复, 并已 cherry-pick T-047 (`284958e`).

## P0 风险

无.

未发现安全 / 数据丢失 / 数据库 schema / AI 关卡层 / 异步任务持久化 类的 P0 级回归. 改动全部集中在 web/ 文案与 React 组件, 加一行 `source_label` 标签.

## P1 风险

### P1-1 · T-046 与 main 已有覆盖性冲突 (合并策略关键风险)

**现象**: codex/content-dev 顶 commit `e4780ec` 与 main 在 merge-base 之后的 4 个 commit 触及同一组文件, 并在多处对同一行的同一段文案做不同改动. 直接 `git merge codex/content-dev` 会产生大量 merge conflict; 选 `--theirs` 会回滚 main 已合入的 QA 修复, 选 `--ours` 会丢掉 T-046 真正新增的逻辑.

主要冲突点:

| 文件 | T-046 (e4780ec) | main 已有 | 冲突级别 |
|---|---|---|---|
| `web/factory-errors.jsx` `humanizeError` default | title `这次没跑成功` / summary `看技术详情` | main 6f239a9: title `这次没跑成` / summary `查看详情` | 同行不同文案 |
| `web/factory-errors.jsx` `<details>` 默认折叠 | 移除 `open={!h.matched}` | main 6f239a9 已先做同向修改 | 同向重复修改 |
| `web/factory-errors.jsx` ERROR_PATTERNS 多条 suggestion | T-046: e.g. `这是后台排版工具的运行环境问题, 修好后重新点一次「去排版」即可` | main 32389d9: e.g. `配图超时` / `今日额度满了` / `小华这次没跑成` 等多条同行重写 | 同行不同文案 |
| `web/factory-touliu-v2.jsx` `TLHeader` skill chip | T-046: `方法论已接上` | main 32389d9: `方法已加载` | 同行不同文案 |
| `web/factory-hotrewrite-v2.jsx` `HotHeader` skill chip + `HotStepInput` 提示 | T-046: `方法论已接上` / `点一条一键塞进文本框` | main 32389d9: `方法已加载` / `点一条自动填入上方` | 同行不同文案 |
| `web/factory-voicerewrite-v2.jsx` `VoiceHeader` skill chip + transcribe 提示 | T-046: `方法论已接上` / `已填进下面文本框` | main 32389d9: `方法已加载` / `已填进下面输入框` | 同行不同文案 |
| `web/factory-wechat-v2.jsx` `WxHeader` skill chip | T-046: `方法论已接上` | main 32389d9: `方法已加载` | 同行不同文案 |
| `web/factory-write.jsx` 顶部 StatBlock `⚡ 今日用量` | T-046: value=`¥${todayCost.toFixed(2)}` / sub=`约 (todayTokens/1000)K 字符量` (token≠字符, 直接除 1000 不准确, 单位写"字符量") | main 0c99c43: value=`Math.round(todayTokens*0.7/1000)+"K字"` / sub=`今日 · 约 ¥${...}` (用 0.7 系数估字数) | 同行语义性回退 |
| `web/factory-write.jsx` `RecentTextCard` token 行 | T-046 改成 `约 (w.tokens_used/1000)K 用量` | main 0c99c43 直接删除整行 | 一边删一边改 |

**为什么是 P1 (而非 P0/P2)**:
- 不会丢数据 / 不会破坏外部链路 → 不是 P0.
- 但任何把 codex/content-dev 直接合进 main 的动作都会引入需要人工解冲突的 5+ 处, 并有相当概率把已上线的 QA 修复回滚 (例如 main 32389d9 是因为 T-063 QA 阻塞才补的, 见 `docs/agent-handoff/CONTROLLER_T063_T064_COPY_REPAIR_20260430.md`).

**为什么发生**: T-046 在 `e4780ec` (02:28:51) 与 main 6f239a9 (01:10:47) 时间上几乎并行, 双方都尝试解决同一个 "可见技术词 + 错误兜底文案" 的目标, 但 controller 用 32389d9 / 0c99c43 / 7989a19 在主线继续推进, 导致 codex/content-dev 后续没 rebase 主线.

**建议合并策略 (留给总控 / 不在 review 边界):**
1. 不要直接 `git merge codex/content-dev`.
2. cherry-pick T-046 真正新增、main 还没做的部分, 推荐如下:
   - `web/factory-touliu-v2.jsx` 的 `showInlineError` 逻辑 (`step==="result" && (poller.isFailed || isCancelled)` 时不再叠加顶部 InlineError) — 这是 T-046 解决 T-044 顶部红条 + FailedRetry 双重提示的核心.
   - `web/factory-hotrewrite-v2.jsx` / `factory-voicerewrite-v2.jsx` / `factory-planner-v2.jsx` 的同款 `showInlineError` 抑制 (按 step + poller 状态 + versions 长度 / plan 步骤判定).
   - `web/factory-moments.jsx` `alert(e.message)` → `setErr(...)` + `<InlineError err={err} />` (D-086 收口).
   - `web/factory-compliance-v2.jsx` `skillInfo={null}` 给 StepHeader (移除右上角 skill chip).
   - `web/factory-wechat-v2.jsx` `WX_STEPS` 第 6 步 label `HTML`→`排版`、`HTML_TEMPLATES` label 中文化 (id 保持 `v3-clean`/`v2-magazine`/`v1-dark` 不变), `Step 6` 套公众号排版话术、`Step 7` 封面 phases 中文化、`Step 8` 推送 phases 中文化, 以及 push() 错误文案 (`HTML 路径丢失`→`排版文件丢失`).
   - `scripts/e2e_content_t046.js` 整文件 (mock-driven, 不烧 credits).
3. 文案重叠部分 (skill chip / humanizeError default / ERROR_PATTERNS suggestion) **以 main 已合入版本为准**, 不引入 T-046 的措辞.
4. `web/factory-write.jsx` 不 cherry-pick T-046 的 StatBlock / RecentTextCard 那段; main 0c99c43 已重做且更准 (0.7 系数 + 删 RecentTextCard token 行), T-046 的 "字符量" 单位会引入新错误.

### P1-2 · T-046 在共享 `web/factory-errors.jsx` (高风险文件) 留下未来再次冲突的可能

**现象**: 即便按上面建议绕开本轮冲突, T-046 的 e2e 脚本里硬编码了 forbidden 关键词 `没匹配到已知模式` `原始 message` `原始错误` `RuntimeError` `LLM 输出非 JSON` `\bJSON\b` 用于反向检测. 其中 `\bJSON\b` 这条非常激进 — 任何未来 ERROR_PATTERNS 出现合法的 `JSON` (例如 "返回内容不是 JSON, 请重试") 会被脚本判失败.

**影响**:
- 现在 main `factory-errors.jsx` ERROR_PATTERNS 已经包含 `AI.*非.*JSON|JSON.*parse|JSON.*解析` 这一项 (匹配 raw error → 转成 `返回内容格式不对`), title 不含 `JSON`. 当前 e2e 不会误报.
- 但只要后续有人在用户可见 title / suggestion 里写一次 `JSON`, 脚本就会假阳性 fail.

**建议**: cherry-pick e2e 脚本时把 `/\\bJSON\\b/i` 这条收紧成 `/\\bJSON\\s*(parse|解析|输出)/i`, 或干脆只检查 raw message 类关键词 (`原始 message`, `原始错误`, `RuntimeError`).

## P2 风险

### P2-1 · `factory-dhv5-v2.jsx::dhvWorkStatusLabel` 默认值掩盖未知状态 (T-047, 已 in main)

```js
function dhvWorkStatusLabel(status) {
  const labels = { ready, published, generating, pending, failed, ok };
  return labels[status] || "可用";
}
```
未匹配的 status (例如新增 `error` / `queued_remote` / 未来扩展) 会被映射成 `"可用"`. picker 的 Tag 不影响选择逻辑 (Tag 只是颜色 + 文字), 但用户视觉上会把"失败的视频"看成"可用". 建议 fallback 改成 `"—"` 或保留 raw status.

### P2-2 · `factory-write.jsx` StatBlock token / 字符 单位混淆 (T-046, 不要 cherry-pick)

T-046 把 sub 写成 `约 ${(todayTokens/1000).toFixed(1)}K 字符量`. token 不等于汉字字符 (中文 token 经验值约 0.7 字). 主线 0c99c43 用 `Math.round(todayTokens*0.7/1000)+"K字"` 修正了. 见 P1-1 第 4 条 — 这段不要 cherry-pick.

### P2-3 · `factory-moments.jsx` 新 `err` state 在第二条路径里只写不清

```jsx
async function genCoverFor(idx) {
  // ...
  } catch (e) { setErr(e.message || "配图没生成出来"); }
}
```
`derive()` 在开头清 `setErr("")`, 但 `genCoverFor()` 没有. 一次 derive 失败后再点封面成功, 顶部 `<InlineError err={err} />` 仍会持续显示旧错误. 比旧版的 alert 体验好, 但属于新行为下的小坑. 建议 `genCoverFor` 开头也 `setErr("")`.

### P2-4 · T-047 dev 报告引用的浏览器闭环工件未入仓 (T-047, 已 in main)

报告说 "Playwright 浏览器闭环 - 覆盖页面: dreamina/imagegen/dhv5/works/materials. 截图 /tmp/_ui_shots/t047_final/*.png, summary /tmp/_ui_shots/t047_final/summary.json". 这些是本地一次性产物, 没入 git, 不可重放. 建议媒体侧补一份 mock-driven 的回归脚本 (类似 `scripts/e2e_content_t046.js`), 至少覆盖:
- dreamina 视频任务失败态 (mock /api/tasks/{id} status=failed) 不出现 `submit_id` `seedance` `daemon` `credits`.
- imagegen 批量任务失败态 (mock) 不出现 `个 task` `并行`.
- dhv5 视频选择器空态不出现英文 status.

### P2-5 · `backend/api.py` 由媒体 Agent 改 1 行 (T-047, 已 in main)

```python
"source_label": "临时素材源" if ms.get_materials_root().name == "Downloads" else "素材库目录",
```
严格按角色边界, `backend/api.py` 列在 `docs/MULTI_AGENT_WORKFLOW.md §4` 的禁止并行改高风险文件中, 应当由总控修改. 但这只是字符串字面量, 没动数据 schema / 路由 / 任务系统, 实际风险为零. 仅作为流程提醒记录.

### P2-6 · 媒体侧 worktree stash 未清

T-047 dev 报告写道:
> 开工前 worktree 有旧脏改, 为避免覆盖 main 上已有修复, 已保存为 stash@{0}: preexisting-media-dev-dirty-before-t047-20260430; 本次提交不包含该 stash.

该 stash 内容未审查, 可能含尚未合入的本机 fix / 实验. 总控合并 T-047 后端口完成时建议:
```bash
cd ~/Desktop/nrg-worktrees/media-dev
git stash list
git stash show -p stash@{0}
```
确认是噪声 (drop) 还是有用 (apply 后另起任务). 不属于本轮 T-049 review 范围, 但属于角色交接漏洞, 标 P2.

### P2-7 · `factory-errors.jsx` 折叠原始错误的隐性代价

T-046 (与 main 6f239a9) 都把 `<details open={!h.matched}>` 改成默认折叠, 即 unmatched 错误首屏只显示 friendly title `这次没跑成` + suggestion. 符合 §5.1 文案脱敏方向, 是正确选择. 但代价: 当 ERROR_PATTERNS 没覆盖一类新错误时, 老板 / 用户排查必须主动点 "查看详情". 没有回归, 仅提示后续 ERROR_PATTERNS 命中率应持续监测.

## 缺失测试

- T-046 提供了 `scripts/e2e_content_t046.js`, mock-driven 不烧 credits, 但只覆盖 **投流失败恢复态**. T-046 还改了:
  - hotrewrite / voicerewrite / planner 同款 InlineError 抑制 (无脚本)
  - moments alert→InlineError (无脚本)
  - 公众号 Step 6 HTML→排版 重命名 + Step 7/8 spinning phases 中文化 + push 错误文案 (无脚本)
  - factory-errors.jsx default 折叠 (无脚本)
  - 这些改动量大, 当前主要靠 T-048 QA 真实浏览器回归手测兜底, 一旦未来同区域重写, 没自动脚本能拦回归.
- T-047 完全没有提交回归脚本 (已合入 main). dreamina / imagegen / dhv5 失败态文案脱敏没有自动反向检测. 见 P2-4.
- 建议总控在 T-046 cherry-pick 完成后, 给 hotrewrite / voicerewrite / planner / moments / wechat 各加一个 mock-driven InlineError 抑制脚本骨架 (复用 `scripts/e2e_content_t046.js` 模式). 这部分可单独开任务交内容/媒体开发完成, 不需要老板决策.

## 用户体验问题

1. **公众号 Step 6 "排版详情" 折叠** (T-046): `result.raw_html_path` / `result.wechat_html_path` 收进 `<details><summary>排版详情</summary>` 后默认不展开. 老板原本可一眼看到本机产物路径, 现在多一次点击. 符合 §5.1 脱敏方向, 但建议 cherry-pick 时同步加一行 "复制路径" 按钮以保留排查效率.
2. **公众号 Step 7 封面 caption 退化** (T-046): 旧版 `{c.style || c.prompt}` 在 style 缺失时显示 prompt 给老板看; T-046 改成 `{c.style || "封面方案"}`, 失去 prompt 兜底. 大概率不影响, 但若某次生成 batch 结构异常导致 style 全空, 4 张卡都显示 "封面方案", 看不出区别. 标记为 UX 小险.
3. **dreamina header skill chip 移除** (T-047, 已 in main): `info?.credit?.credit?.total_credit` 仍显示余额, 用户对"自己接的是即梦还是别的"感知减弱. 由于页面标题已改成 "即梦 · 字节官方图片/视频", 影响可接受.
4. **dhv5 picker Tag** (T-047, 已 in main): 见 P2-1.

## 规则 / 系统硬约束 检查

按 `docs/SYSTEM-CONSTRAINTS.md` 逐项核对 T-046 + T-047:

- §1 异步任务: 未触及 `tasks` / `remote_jobs`, 合规.
- §2 AI 调用关卡层: 未触及 `shortvideo/ai.py`, 合规.
- §3 访客模式: 未触及 `guest_mode` / 写档案口子, 合规.
- §4 知识库只读: 未读写 `~/Desktop/清华哥知识库/`, 合规.
- §5 错误友好化 + 文案脱敏: 主体方向正确 (移除 skill/prompt/tokens/API/task/transcript/seedance/credits/Downloads), 但 T-046 一个角落 e2e 脚本反向检测 `\bJSON\b` 过激 (P1-2), `factory-write.jsx` "字符量" 单位错 (P2-2).
- §6 接入新 skill: 不涉及.
- §7.1 测试 playwright 闭环: T-046 提供了 mock-driven 回归 ✓; T-047 没提供回归脚本 ✗ (但只是文案改动, 不算 bug fix, §7.2 不严格适用).
- §7.2 修 bug 必须加回归: T-046 投流失败恢复态算 bug fix, 已加 e2e ✓; 其余 T-046 / T-047 改动是 UX/copy, §7.2 灰色.
- §8 文档: 副 Agent 没有改 `docs/PROGRESS.md`, 合规.
- §9 数据库: 无 schema 改动.
- §10 LiDock: 不涉及.
- §11 UI 错误出口: T-046 把 moments alert→InlineError, T-047 把 dhv5 errLog 裸渲染→ErrorText, 都符合 D-086. ✓
- §12 素材库: T-047 改 `source_label` 字符串, 没动 schema/路径/扫描白名单, 合规.

## 建议交给谁修

- **本次发现的 P1 不需要返工任何 Agent**, 而是要总控决定怎么把 codex/content-dev 落地 (cherry-pick 增量, 不要直接 merge).
- 媒体侧补 mock-driven 回归脚本 → 媒体开发 Agent (低优).
- 媒体 worktree stash@{0} 处置 → 总控本人.
- e2e 脚本 `\bJSON\b` 收紧 → 内容开发 Agent (低优, cherry-pick 时顺手).

## 下一步建议

1. **不要直接 `git merge codex/content-dev`**. 走 cherry-pick 路径, 优先级见 P1-1 第 2 步. 完成后 codex/content-dev 可视为 stale, 等下一轮重新基线.
2. T-047 已落地 (`284958e` in main), 本次审查里没有要求 T-047 返修, 仅记录 P2-1/-4/-5/-6.
3. T-048 (QA 真实浏览器回归) 应该针对 cherry-pick **后** 的 main 跑, 而不是针对 codex/content-dev. 建议在 cherry-pick 完成后再启动 T-048, 否则会测错版本.
4. 后续给媒体侧 (dreamina / imagegen / dhv5) 加 mock-driven 失败态回归脚本, 并把 forbidden 关键词清单从 `scripts/e2e_content_t046.js` 抽到一个共享 `scripts/_e2e_forbidden_terms.js` (建议, 非必需).

## 是否需要老板确认

否. 全部建议属于 "技术合并策略" / "代码风险记录", 总控可独立判断 cherry-pick 范围与顺序; 不需要老板做业务选择. 等总控 cherry-pick 完成 + T-048 完成后, 如还要我做第二轮审查, 队列再开 T-XX.

---

证据存档:
- 审查范围 commit:
  - codex/content-dev tip: `e4780ec`
  - codex/media-dev tip: `f118857` (= main `284958e`)
  - main tip: `c0d3dab`
  - merge-base content-dev / main: `a3298013`
- 关键 main 后续 commit:
  - `6f239a9 fix: repair site qa blockers` (factory-errors / touliu / dhv5 / image-gen 等)
  - `32389d9 fix: clear remaining visible technical copy` (factory-errors / touliu / hotrewrite / voicerewrite / wechat 等 19 文件)
  - `0c99c43 polish: clear remaining site technical copy` (factory-write / factory-home)
  - `7989a19 fix: clean up site polish wording` (factory-materials-v2 / factory-strategy / factory-home)
- 本审查全程未启动 web/backend/playwright, 未烧 credits, 未改业务代码或文档外文件.
