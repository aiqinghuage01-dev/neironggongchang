# D-037 异步任务化 · 设计规格

> 状态: 草案 v1 · 等清华哥点头 · 2026-04-26
> 上一轮 D-037a 后端 tasks 池基建已落地 (5bf15da, 12 测试通过), dhv5 已采用样板.

---

## 1. 业务 WHY (为什么要做这件事)

### 1.1 痛点 (今天清华哥实测)

清华哥在违规审查页贴了 2078 字录音稿, 点开始审查, 等到的不是结果, 是一条红色 "⚠️ Failed to fetch", 草稿没了, 工作流断了.

### 1.2 实测数据 (本次 session 端到端复现)

| endpoint | 后端真实耗时 | 前端 fetch 行为 |
|---|---|---|
| compliance/check 短文案 25 字 | **71 秒** | 裸 fetch 等 |
| compliance/check 1313 字 | 88 秒 | 裸 fetch 等 |
| compliance/check **2078 字 (截图同款)** | **97.6 秒** | 复现成功, 但浏览器空闲不切 tab |
| touliu/generate (10 条) | **2-3 分钟** | 裸 fetch 等 |
| wechat/write | 30-60 秒 | 裸 fetch 等 |

### 1.3 根因

`web/factory-api.jsx` 的 `api.post()` 用裸 `fetch()`, 没 timeout, 没 AbortController, 没异步任务化. 后端 AI 调用全程同步阻塞 (90 秒+ 单连接 idle). 浏览器在以下任一情景**必断**:

- Chrome 后台节流 (切到别的 tab, 30 秒后开始降频)
- macOS 短暂休眠 / 锁屏 / 合盖
- WiFi 切换 / 网络抖动
- 反向代理 / OS 网络栈 idle keepalive 超时

断连后浏览器抛 `TypeError: Failed to fetch`, 错误文案对清华哥毫无意义, 草稿丢失, 重做要再等 90 秒.

### 1.4 受影响的 13 个 endpoint (同病灶)

```
违规审查    POST /api/compliance/check     ~70-100s
投流        POST /api/touliu/generate      ~120-180s
公众号长文  POST /api/wechat/write         ~30-60s
公众号封面  POST /api/wechat/cover         ~5-10s
公众号段间图 POST /api/wechat/section-image ~30-60s (apimart)
公众号配图  POST /api/wechat/plan-images   ~5s
公众号大纲  POST /api/wechat/outline       ~5s
公众号标题  POST /api/wechat/titles        ~3-5s
公众号重写  POST /api/wechat/rewrite-section ~10s
爆款改写    POST /api/baokuan/rewrite      ~30-60s
热点改写    POST /api/hotrewrite/write     ~30-60s
录音改写    POST /api/voicerewrite/write   ~30-60s
内容策划    POST /api/planner/write        ~30-60s
朋友圈      POST /api/moments/derive       ~10s
选题       POST /api/topics/generate      ~10s
口播改写    POST /api/rewrite              ~10s
```

任意一个用户感觉到的"卡住没反应/Failed to fetch/工作流挂掉", 根因都是这条裸 fetch.

---

## 2. 用户故事 (清华哥视角)

### 故事 A: 长任务不能因为切 tab 挂

> 清华哥点击"开始审查", 看到"小华在分析(预计 1-2 分钟), 你可以切走干别的". 他切到微信回了条消息, 30 秒后回到工厂, 进度条已经走到 60%, 又过 40 秒报告出来了. 草稿没丢, 网没断.

### 故事 B: 任意时刻能看到正在跑的任务

> 顶栏右上角看到 "🛡️ 违规审查 · 1m12s" 一个小 chip, 点开是抽屉, 列出: 进行中 1 个 (违规审查 进度 60%), 今天完成 5 个, 失败 0 个. 点 "违规审查" 直接跳回那一页看结果.

### 故事 C: 任务失败有可读的理由 + 重试

> AI 真的抛错了 (DeepSeek 上游 502), 抽屉里那条任务变成红色 "❌ AI 上游临时不可用 (DeepSeek 502)", 旁边一颗 "再试一次" 按钮, 点了重新提交一个 task, 不用重新填文案.

### 故事 D: 关闭浏览器再开还能拿到结果

> 清华哥提交了一个 2 分钟的投流, 中途关电脑去开会. 一个小时后开回来, 顶栏 TaskBar 显示 "✅ 投流 · 完成 (54 分钟前)", 点进去看到那 10 条文案, 文案的 work_log 已经记好了.

### 故事 E (反故事): 不是所有功能都该异步化

> 清华哥点 "标题候选", 3 秒就出了, 不需要 loading 进度条 + TaskBar 任务. 短任务保持同步.

---

## 3. 系统关系 (D-037 在工厂里怎么落)

```
       ┌─────────────────────────────────────────────────────┐
       │   前端 (web/)                                        │
       │   ┌─────────────────────────────────────────────┐   │
       │   │ <TaskBar /> (factory-shell.jsx 顶栏)        │   │
       │   │   - 全局, 任意页都看到                       │   │
       │   │   - 点开抽屉看 running / 今日完成 / 失败     │   │
       │   └─────────────────────────────────────────────┘   │
       │                                                      │
       │   ┌─────────────────────────────────────────────┐   │
       │   │ useTaskPoller(taskId) hook (factory-task.jsx │   │
       │   │   - 3 秒轮询 GET /api/tasks/{id}             │   │
       │   │   - 持久化 task_id 到 localStorage           │   │
       │   │   - 切走再回来自动恢复                       │   │
       │   │   - status==ok/failed 停止                   │   │
       │   └─────────────────────────────────────────────┘   │
       │           ↑ 13 个 skill page 全部用这个                │
       └─────────────────────────────────────────────────────┘
                            ↓ POST 立即返 task_id (< 1s)
                            ↑ GET /api/tasks/{id} (< 100ms)
       ┌─────────────────────────────────────────────────────┐
       │   后端 (backend/)                                    │
       │   ┌─────────────────────────────────────────────┐   │
       │   │ api.py 13 个 endpoint 改造:                  │   │
       │   │   - 立即 create_task() 返 {task_id}          │   │
       │   │   - spawn daemon thread 跑真活               │   │
       │   │   - thread 内 update_progress / is_cancelled │   │
       │   │   - thread 终 finish_task(result|error)      │   │
       │   └─────────────────────────────────────────────┘   │
       │                       ↓                              │
       │   ┌─────────────────────────────────────────────┐   │
       │   │ backend/services/tasks.py (D-037a 已有)      │   │
       │   │   SQLite tasks 表 · 5 状态机                 │   │
       │   │   create / list / finish / cancel / counts   │   │
       │   └─────────────────────────────────────────────┘   │
       └─────────────────────────────────────────────────────┘
```

### 3.1 与现有体系的关系

| 系统 | 关系 |
|---|---|
| D-037a tasks 池 | 复用, 不改 schema (除非要加 estimated_seconds, 见 §6) |
| D-040 小华夜班 | 已用 tasks 池, 不影响 |
| D-005 三层记忆 / 工作日志 | 不影响, work_log 在 finish_task 之后照常记 |
| D-008 人设关卡 | 不影响, daemon thread 内照常走 ai.py |
| D-011 引擎路由 | 不影响 |
| D-037a dhv5 异步样板 | 直接抄, 13 个 endpoint 套同款 |
| D-024 首页 stats | tasks 表新增的 task 不污染 ai_calls 表 (那是另一张) |

---

## 4. 数据模型 (tasks 表是否扩字段)

### 4.1 现有字段 (D-037a)

```
id, kind, label, status, ns, page_id, step,
payload(json), result(json), error,
progress_text, started_ts, finished_ts, updated_ts
```

### 4.2 是否要扩

**要加 1 个字段** (推荐):
- `estimated_seconds` INTEGER NULL — 预计耗时 (秒). 创建任务时写, 前端用来画进度条.

**不加** (够用):
- 前端可以硬编码每个 kind 的预计 (compliance.check=90, touliu.generate=180, ...)
- 但硬编码就要前后端两处维护, 前端改完不重启 backend 不一致
- estimated_seconds 后端控制更灵活

**决定**: 加 estimated_seconds. SQL ALTER TABLE 加列, 默认 NULL, 已有任务不影响.

---

## 5. API 改造清单

### 5.1 改造范式 (每个 endpoint 都按这个套)

**改前**:
```python
@app.post("/api/compliance/check")
def compliance_check(req: ComplianceCheckReq):
    return compliance_pipeline.check_compliance(req.text, req.industry)
    # 阻塞 70-100 秒, 前端裸等
```

**改后**:
```python
@app.post("/api/compliance/check")  # 路径不变, 兼容旧前端 (短期)
def compliance_check(req: ComplianceCheckReq):
    task_id = compliance_pipeline.check_compliance_async(req.text, req.industry)
    return {"task_id": task_id, "estimated_seconds": 90}
    # < 200ms 返回
```

**新 pipeline**:
```python
def check_compliance_async(text: str, industry: str) -> str:
    task_id = tasks_service.create_task(
        kind="compliance.check",
        label=f"违规审查 · {industry} · {len(text)}字",
        ns="compliance",
        page_id="compliance",
        step="check",
        payload={"text": text[:200], "industry": industry},
        estimated_seconds=90,
    )
    def _worker():
        try:
            tasks_service.update_progress(task_id, "扫通用违禁词...")
            r = check_compliance(text, industry)  # 调原同步函数
            if tasks_service.is_cancelled(task_id):
                return
            tasks_service.finish_task(task_id, result=r)
        except Exception as e:
            tasks_service.finish_task(task_id, error=f"{type(e).__name__}: {e}", status="failed")
    threading.Thread(target=_worker, daemon=True).start()
    return task_id
```

### 5.2 13 个 endpoint 改造矩阵

| endpoint | 估时 | 风险 | 改造批次 |
|---|---|---|---|
| compliance/check | 90s | 低 (单 step) | **批 1** |
| baokuan/rewrite | 60s | 低 | **批 1** |
| hotrewrite/write | 60s | 低 | **批 1** |
| voicerewrite/write | 60s | 低 | **批 1** |
| planner/write | 60s | 低 | **批 1** |
| touliu/generate | 180s | 中 (有 lint subprocess) | **批 2** |
| wechat/write | 60s | 中 (D-016 wfPersist) | **批 2** |
| wechat/section-image | 60s | 中 (apimart 异步链) | **批 2** |
| wechat/cover | 10s | 低 | **批 3** |
| wechat/plan-images | 5s | 低 | **批 3** |
| moments/derive | 10s | 低 | **批 3** |
| topics/generate | 10s | 低 | **批 3** |
| rewrite | 10s | 低 | **批 3** |
| wechat/titles | 5s | **不改** (3-5 秒, 不挂) |  — |
| wechat/outline | 5s | **不改** | — |
| wechat/rewrite-section | 10s | **不改** (用户已经在写文章, 不会切走) | — |

**保留同步的判断标准**: 平均 <= 10 秒 + 用户在该页心智专注度高 + 切走的概率小.

---

## 6. 前端架构

### 6.1 共享 hook (新文件 web/factory-task.jsx)

```jsx
// useTaskPoller(taskId, options) — 3s 轮询 task 状态
// 返回: { task, isRunning, isOk, isFailed, error, progress, restart, cancel }
function useTaskPoller(taskId, { interval = 3000, onComplete, onError } = {}) {
  const [task, setTask] = React.useState(null);
  React.useEffect(() => {
    if (!taskId) return;
    let stop = false;
    async function poll() {
      try {
        const t = await api.get(`/api/tasks/${taskId}`);
        if (stop) return;
        setTask(t);
        if (t.status === "running" || t.status === "pending") {
          setTimeout(poll, interval);
        } else if (t.status === "ok" && onComplete) {
          onComplete(t.result);
        } else if (t.status === "failed" && onError) {
          onError(t.error);
        }
      } catch (e) {
        if (!stop) setTimeout(poll, interval);  // 网络抖动重试
      }
    }
    poll();
    return () => { stop = true; };
  }, [taskId]);
  return { task, isRunning: task?.status === "running" || task?.status === "pending",
    isOk: task?.status === "ok", isFailed: task?.status === "failed",
    error: task?.error, progress: task?.progress_text };
}
```

### 6.2 共享 LoadingProgress 组件 (factory-ui.jsx 新增)

```jsx
<LoadingProgress
  taskKind="compliance.check"
  estimatedSeconds={90}
  startedTs={task.started_ts}
  progressText={task.progress_text}
/>
// 渲染: 进度条 (走时间百分比, 90s 内匀速)
//        + "已等 32 秒, 通常 60-120 秒"
//        + "扫通用违禁词..." (最新进度文)
//        + "可以切走干别的, 不会挂"
```

### 6.3 顶栏 TaskBar (factory-shell.jsx)

```jsx
<TaskBar />
// 渲染: chip "🛡️ 1 进行中 · 5 完成"
// 点击: 抽屉
//   - 进行中 (1): 违规审查 1m12s ▓▓▓▓░░░░ 60%
//   - 今日完成 (5): ✅ 投流 / ✅ 公众号 / ...
//   - 失败 (0)
//   - 点任意一条 → 跳到对应 page (page_id)
```

### 6.4 page 改造 (compliance 为例)

**改前**:
```jsx
async function check() {
  setLoading(true);
  const r = await api.post("/api/compliance/check", {...});  // 90s 裸等
  setResult(r);
  setLoading(false);
}
```

**改后**:
```jsx
const [taskId, setTaskId] = React.useState(localStorage.getItem("compliance:taskId"));
const { task, isOk, isFailed, error, progress } = useTaskPoller(taskId, {
  onComplete: (r) => { setResult(r); localStorage.removeItem("compliance:taskId"); },
});

async function check() {
  const r = await api.post("/api/compliance/check", {...});  // 200ms 返 task_id
  localStorage.setItem("compliance:taskId", r.task_id);
  setTaskId(r.task_id);
}

// 渲染:
{isRunning && <LoadingProgress taskKind="compliance.check" .../>}
{isFailed && <FailedRetry error={error} onRetry={check} />}
{isOk && <CStepResult result={result} />}
```

**核心收益**: 用户切走、关浏览器、刷新页面, 回来 localStorage 还有 task_id, 自动恢复轮询拿结果.

---

## 7. 改造顺序

### 批次 1 (~ 半天, 5 个改写型 skill)
- compliance/check
- baokuan/rewrite
- hotrewrite/write
- voicerewrite/write
- planner/write

**为什么先这批**: 都是 single-step "提交 → 等长 → 出结果", 改造模式相同, 风险最低. compliance 已经是清华哥实测痛点, 优先证明范式.

### 批次 2 (~ 半天, 复杂的)
- touliu/generate (有 subprocess lint)
- wechat/write (有 D-016 wfPersist 联动)
- wechat/section-image (apimart 已经异步, 整理一下)

### 批次 3 (~ 2-3 小时, 短任务统一)
- wechat/cover, wechat/plan-images
- moments/derive, topics/generate, rewrite

### 批次 4 (~ 1 天, 前端基础设施)
- useTaskPoller hook
- LoadingProgress 组件
- 顶栏 TaskBar 抽屉

**注意**: 批次 4 的基础设施其实要**先于批次 1 落地**. 调整为:

### 实际推荐顺序

1. **D-037b1**: 后端加 `estimated_seconds` 字段 + ALTER TABLE migration
2. **D-037b2**: 前端 useTaskPoller hook + LoadingProgress 组件
3. **D-037b3**: compliance/check 异步化 (1 个 endpoint 试水, 端到端跑通)
4. **D-037b4**: 顶栏 TaskBar (有 1 个 endpoint 用着, 才看得见效果)
5. **D-037b5**: 批次 1 剩下 4 个 skill 异步化
6. **D-037b6**: 批次 2 复杂的
7. **D-037b7**: 批次 3 短任务统一
8. **D-037b8**: 删旧的同步 fallback (如果保留过)

**总工作量估计**: 2-3 天 (含真测).

---

## 8. 风险 + 红线

### 8.1 风险

- **D-016 wfPersist** 的 wfState 当前持久化 result 字段. 异步化后中间态变成 task_id, 要把 task_id 也持久化, 否则切走再回来要轮询不到.
- **wechat 8 步的跨 step 联动**: titles → outline → write → ... 当前是同步链路, write 改异步后 step 切换逻辑要改.
- **PersonaInjectedAI.chat 钩子** (D-031 行为记忆 / D-024 ai_usage 打点): 在 daemon thread 里照常跑, 应该不影响. 但要测.
- **测试基础设施**: 当前 pytest 跑同步函数. 异步化后要 mock daemon thread / 直接调 _worker 避免线程飞掉.

### 8.2 红线 (改完不许破)

- 现有 dhv5 异步任务**继续工作** (它已经在用 tasks 池, 不要碰)
- 现有 night_shift cron 跑出来的任务**继续工作**
- 测试套 (~ 200 个) 通过率不下降
- 用户改造后第一次访问任意 page **不能** 因 localStorage 旧 result 残留炸掉 → wfRestore 要识别 task_id 而非 result

---

## 9. 测试策略

### 9.1 后端单测
每个改造的 pipeline 加 `test_X_async` 测:
- create_task 立即返 task_id (< 1s)
- daemon thread 跑完写入 result
- 失败时写入 error
- is_cancelled 早退

### 9.2 前端
- useTaskPoller hook 单测 (mock fetch)
- LoadingProgress / TaskBar JSX parse PASS

### 9.3 端到端 (playwright)
- 跑 compliance 全流程, 切 tab 30 秒后回来还能拿到结果
- 跑 compliance 提交后刷新页面, 还能恢复
- 跑 compliance AI 故意失败, 显示 retry 按钮

---

## 10. 上线策略

- 不做 feature flag — 工厂只清华哥一个用户, 改完直接发, 失败回滚单个 commit
- 不做双轨 (async + sync 并存) — 心智成本高, 路径全 async
- batch 内每个 endpoint 一个 commit, 出 bug 单点 revert
- 每批结束更新 docs/PROGRESS.md + 端到端验证截图入 docs/design/D-037-async-tasks/verify/

---

## 11. 待清华哥决策点

1. **estimated_seconds 字段**加不加? (推荐加)
2. **顶栏 TaskBar** 要不要做? (推荐做, 故事 B/D 才成立)
3. **取消按钮** D-037b 一并做还是 D-037d 单独? (推荐 D-037b 一并, 反正 is_cancelled 已支持)
4. **改造顺序**接受我推荐的 §7 实际顺序 (基础设施先, compliance 试水, 再扩) 还是别的?
5. **wechat 8 步**改造范围: 只改 write/cover/section-image 这 3 个慢的, 还是把 8 步全部异步化?
6. **mockup 重点**: 先看 LoadingProgress (单 page) 还是 TaskBar (全局)? 我现在出 mockup, 你想先看哪个我先画.
