// factory-task.jsx — D-037 异步任务化 · 前端 hook + 共享组件
//
// 加载顺序: factory-ui.jsx 之后 (依赖 T), 各 factory-<skill>-v2.jsx 之前
//
// 提供:
//   useTaskPoller(taskId, opts) — 3s 轮询 GET /api/tasks/{id}
//   useTaskPersist(ns) — localStorage 存 task_id, 切走再回来恢复
//   <LoadingProgress task onCancel /> — 真进度条 + 文字 + 已等/预计 + 取消
//   <FailedRetry error onRetry onEdit /> — 友好失败 + 一键重试
//
// 设计原则 (清华哥 2026-04-26 拍板):
//   - 真进度: 进度条按 task.progress_pct 走真值 (worker 推), 不按时间假动画
//   - 切走再回来: useTaskPersist 把 task_id 落 localStorage, 重启浏览器还能续
//   - 取消: <LoadingProgress> 自带取消按钮, 调 POST /api/tasks/{id}/cancel

// ─── useTaskPoller hook ──────────────────────────────────
function useTaskPoller(taskId, opts) {
  opts = opts || {};
  const interval = opts.interval || 3000;
  const onComplete = opts.onComplete;
  const onError = opts.onError;

  const [task, setTask] = React.useState(null);
  const stopRef = React.useRef(false);
  const completedRef = React.useRef(false);

  React.useEffect(() => {
    if (!taskId) { setTask(null); return; }
    stopRef.current = false;
    completedRef.current = false;

    async function poll() {
      if (stopRef.current) return;
      try {
        const t = await api.get(`/api/tasks/${taskId}`);
        if (stopRef.current) return;
        setTask(t);
        if (t.status === "running" || t.status === "pending") {
          setTimeout(poll, interval);
        } else if (!completedRef.current) {
          completedRef.current = true;
          if (t.status === "ok" && onComplete) onComplete(t.result, t);
          else if (t.status === "failed" && onError) onError(t.error || "任务失败", t);
          else if (t.status === "cancelled" && onError) onError("已取消", t);
        }
      } catch (e) {
        // 网络抖动 / 浏览器节流 → 不停, 退避重试
        if (!stopRef.current) setTimeout(poll, interval);
      }
    }
    poll();
    return () => { stopRef.current = true; };
  }, [taskId, interval]);

  async function cancel() {
    if (!taskId) return;
    try { await api.post(`/api/tasks/${taskId}/cancel`, {}); } catch (e) {}
  }

  return {
    task,
    isRunning: task ? (task.status === "running" || task.status === "pending") : false,
    isOk: task?.status === "ok",
    isFailed: task?.status === "failed",
    isCancelled: task?.status === "cancelled",
    progressText: task?.progress_text || "",
    progressPct: task?.progress_pct,
    estimatedSeconds: task?.estimated_seconds,
    elapsedSec: task?.elapsed_sec || 0,
    error: task?.error,
    cancel,
  };
}

// ─── useTaskPersist hook ─────────────────────────────────
// 把 taskId 存到 localStorage, 切走/重启后能恢复.
// ns 是命名空间, 例如 "compliance" / "wechat:write"
function useTaskPersist(ns) {
  const key = `task:${ns}`;
  const [taskId, setTaskIdState] = React.useState(() => {
    try { return localStorage.getItem(key) || null; } catch (e) { return null; }
  });
  function setTaskId(id) {
    setTaskIdState(id);
    try {
      if (id) localStorage.setItem(key, id);
      else localStorage.removeItem(key);
    } catch (e) {}
  }
  return [taskId, setTaskId];
}

// ─── LoadingProgress 组件 ────────────────────────────────
// 真进度: 优先 progressPct (worker 推真值), 没有就显示不确定动画
// 已等时间从 elapsedSec 取
function LoadingProgress({ task, icon, title, subtitle, onCancel }) {
  const pct = task && typeof task.progress_pct === "number" ? task.progress_pct : null;
  const elapsed = task ? (task.elapsed_sec || 0) : 0;
  const est = task ? task.estimated_seconds : null;
  const text = task ? (task.progress_text || "") : "准备中...";

  return (
    <div style={{
      width: "clamp(230px, calc(100vw - 160px), 680px)", maxWidth: "calc(100% - 24px)",
      boxSizing: "border-box", margin: "40px auto", background: "#fff",
      border: `1.5px solid ${T.brand}`, borderRadius: 16, padding: "clamp(18px, 4vw, 28px)",
      boxShadow: `0 0 0 5px ${T.brandSoft}`, textAlign: "center",
    }}>
      <div style={{ fontSize: 32 }}>{icon || "⏳"}</div>
      <div style={{ fontSize: 18, fontWeight: 600, marginTop: 10, marginBottom: 4 }}>
        {title || "小华正在处理..."}
      </div>
      {subtitle && (
        <div style={{ color: T.muted, fontSize: 13, marginBottom: 14 }}>{subtitle}</div>
      )}

      {/* 进度条 */}
      <div style={{
        height: 8, background: T.bg3, borderRadius: 4, overflow: "hidden",
        margin: "16px 0 12px",
      }}>
        {pct !== null ? (
          <div style={{
            height: "100%", width: `${pct}%`, background: T.brand,
            borderRadius: 4, transition: "width 0.4s ease-out",
          }} />
        ) : (
          // 不确定动画 (没有 pct 时)
          <div style={{
            height: "100%", width: "30%", background: T.brand,
            borderRadius: 4, animation: "qltaskindeterminate 1.6s ease-in-out infinite",
          }} />
        )}
      </div>

      {/* 已等 / 预计 / 进度数 */}
      <div style={{
        display: "flex", justifyContent: "space-around", padding: "8px 0",
        fontSize: 12, color: T.muted, borderTop: `1px dashed ${T.borderSoft}`,
        borderBottom: `1px dashed ${T.borderSoft}`, margin: "4px 0",
      }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 600, color: T.text }}>{fmtSec(elapsed)}</div>
          已等
        </div>
        {est && (
          <div>
            <div style={{ fontSize: 17, fontWeight: 600, color: T.text }}>~ {fmtSec(est)}</div>
            预计
          </div>
        )}
        {pct !== null && (
          <div>
            <div style={{ fontSize: 17, fontWeight: 600, color: T.brand }}>{pct}%</div>
            进度
          </div>
        )}
      </div>

      {/* 真实进度文字 */}
      {text && (
        <div style={{
          marginTop: 14, padding: "10px 14px", background: T.brandSoft,
          borderRadius: 8, fontSize: 12.5, color: T.brand, fontWeight: 500,
        }}>
          {text}
        </div>
      )}

      <TaskProgressTimeline task={task} title="阶段时间线" embedded />

      {/* 提示 */}
      <div style={{
        marginTop: 12, fontSize: 12, color: T.muted2,
        display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
      }}>
        💡 可以切走干别的, 任务在后台跑, 切回来还能看到
      </div>

      {/* 取消按钮 */}
      {onCancel && (
        <button
          onClick={onCancel}
          style={{
            marginTop: 16, background: "#fff", border: `1px solid ${T.border}`,
            color: T.muted, borderRadius: 8, padding: "6px 16px", fontSize: 12.5,
            cursor: "pointer",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = T.red; e.currentTarget.style.color = T.red; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.color = T.muted; }}
        >
          取消任务
        </button>
      )}
    </div>
  );
}

// 结构化任务时间线: 给一批结果分段产出的页面复用。
function TaskProgressTimeline({ task, title, embedded }) {
  const data = task?.progress_data || {};
  const timeline = Array.isArray(data.timeline) ? data.timeline : [];
  if (!timeline.length) return null;
  const total = data.total_versions || data.total_stages || data.total || null;
  const done = typeof data.completed_versions === "number"
    ? data.completed_versions
    : (typeof data.completed_stages === "number"
      ? data.completed_stages
      : (typeof data.completed === "number" ? data.completed : timeline.filter(item => item.status !== "running").length));
  const nowSec = Math.floor(Date.now() / 1000);
  function unitKey(item) {
    if (!item) return null;
    if (item.stage) return `stage:${item.stage}`;
    if (item.unit_id) return `unit:${item.unit_id}`;
    if (item.variant_id) return `variant:${item.variant_id}`;
    if (item.version_index) return `version:${item.version_index}`;
    if (item.completed_versions && item.total_versions) return `version:${item.completed_versions}`;
    return null;
  }
  const doneKeys = new Set();
  timeline.forEach((item) => {
    if (item?.status === "running") return;
    const key = unitKey(item);
    if (key) doneKeys.add(key);
  });
  const visibleTimeline = timeline.filter((item) => {
    if (item?.status !== "running") return true;
    const key = unitKey(item);
    if (key && doneKeys.has(key)) return false;
    return true;
  });
  return (
    <div style={{
      background: embedded ? "transparent" : "#fff",
      border: embedded ? "none" : `1px solid ${T.borderSoft}`,
      borderTop: embedded ? `1px dashed ${T.borderSoft}` : undefined,
      borderRadius: embedded ? 0 : 10,
      padding: embedded ? "12px 0 0" : 12,
      marginTop: embedded ? 12 : 0,
      textAlign: "left",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{title || "生成现场"}</span>
        {total ? <Tag size="xs" color="green">已完成 {Math.min(done, total)}/{total}</Tag> : null}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {visibleTimeline.slice(-6).map((item, idx) => {
          const isRunning = item.status === "running";
          const isFailed = item.status === "failed";
          const started = item.started_ts || item.at_ts;
          const elapsed = isRunning && started ? Math.max(0, nowSec - started) : 0;
          return (
            <div key={`${item.stage || item.variant_id || item.unit_id || "step"}-${item.status || "done"}-${idx}`} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
              <span style={{
                width: 18, height: 18, borderRadius: "50%", flexShrink: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                background: isFailed ? T.redSoft : (isRunning ? T.bg3 : T.brandSoft),
                color: isFailed ? T.red : (isRunning ? T.muted : T.brand),
                fontSize: 11, fontWeight: 800,
              }}>{isFailed ? "!" : (isRunning ? "..." : "✓")}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, color: T.text, fontWeight: 600, lineHeight: 1.45 }}>
                  {item.text || "完成一项"}
                </div>
                {isRunning && item.version_index && item.total_versions ? (
                  <div style={{ fontSize: 10.5, color: T.muted2, marginTop: 2 }}>
                    正在写第 {item.version_index} / {item.total_versions} 版 · 已写 {fmtSec(elapsed)}
                  </div>
                ) : isRunning ? (
                  <div style={{ fontSize: 10.5, color: T.muted2, marginTop: 2 }}>
                    {item.label ? `${item.label} · ` : ""}已等 {fmtSec(elapsed)}
                  </div>
                ) : isFailed ? (
                  <div style={{ fontSize: 10.5, color: T.red, marginTop: 2 }}>
                    停在这里
                  </div>
                ) : item.completed_versions && item.total_versions && (
                  <div style={{ fontSize: 10.5, color: T.muted2, marginTop: 2 }}>
                    第 {item.completed_versions} / {item.total_versions} 版
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── FailedRetry 组件 ────────────────────────────────────
// D-086: _friendlyErrorReason 改调 humanizeError (factory-errors.jsx 是全站事实源),
//        不再维护本文件第二套 if/elif 规则. 任何错误模式新加只在 factory-errors.jsx 改.
function _friendlyErrorReason(raw) {
  const s = String(raw || "");
  if (!s) return null;
  // 走全站 humanizeError, 拿 title 作为 friendly 原因展示
  if (typeof humanizeError === "function") {
    const h = humanizeError(s);
    // 没匹配 pattern 时返兜底文案 (不直接用"出错了 (没匹配到已知模式)" 这种露馅 title)
    return h.matched ? h.title : "通常重试一次就好";
  }
  // factory-errors.jsx 没加载时的极端兜底 (理论上不会触发)
  return "通常重试一次就好";
}

function FailedRetry({ error, onRetry, onEdit, icon, title, hint, task }) {
  const [showRaw, setShowRaw] = React.useState(false);
  const friendly = _friendlyErrorReason(error);
  return (
    <div style={{
      width: "clamp(230px, calc(100vw - 160px), 680px)", maxWidth: "calc(100% - 24px)",
      boxSizing: "border-box", margin: "40px auto", background: "#fff",
      border: `1.5px solid ${T.red}`, borderRadius: 16, padding: "clamp(18px, 4vw, 28px)",
      boxShadow: `0 0 0 5px ${T.redSoft}`, textAlign: "center",
    }}>
      <div style={{ fontSize: 32 }}>{icon || "😅"}</div>
      <div style={{ fontSize: 18, fontWeight: 600, marginTop: 10, marginBottom: 4, color: T.red }}>
        {title || "这次没跑成"}
      </div>
      <div style={{ color: T.muted, fontSize: 13 }}>
        {hint || friendly || "大概率是临时波动, 通常重试一次就好"}
      </div>
      <TaskProgressTimeline task={task} title="停在哪一步" embedded />
      <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 16, flexWrap: "wrap" }}>
        {onRetry && (
          <button
            onClick={onRetry}
            style={{
              background: T.brand, color: "#fff", border: "none",
              borderRadius: 10, padding: "9px 22px", fontSize: 14, fontWeight: 500,
              cursor: "pointer",
            }}
          >
            🔄 再试一次
          </button>
        )}
        {onEdit && (
          <button
            onClick={onEdit}
            style={{
              background: "#fff", border: `1px solid ${T.border}`, color: T.text,
              borderRadius: 10, padding: "9px 22px", fontSize: 14, cursor: "pointer",
            }}
          >
            📝 改一下再试
          </button>
        )}
      </div>
      {/* D-069: 技术原文默认折叠, 排查时再展开 */}
      {error && (
        <div style={{ marginTop: 14, fontSize: 11.5, color: T.muted2 }}>
          <button
            onClick={() => setShowRaw(!showRaw)}
            style={{ background: "transparent", border: "none", color: T.muted2, cursor: "pointer", fontSize: 11.5, padding: 0, fontFamily: "inherit" }}
          >
            {showRaw ? "收起技术详情" : "看技术详情"}
          </button>
          {showRaw && (
            <div style={{
              background: T.bg2, color: T.muted, padding: "8px 12px",
              borderRadius: 8, fontSize: 11.5, marginTop: 8, textAlign: "left",
              fontFamily: "ui-monospace, monospace", wordBreak: "break-all",
              maxHeight: 150, overflow: "auto",
            }}>
              {error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── pollUntilComplete + apiPostThenWait (autoFlow 用) ───────────
// autoFlow (一气呵成的链, 如 wechat 8 步) 内部要 await 任务完成才能进下一步.
// pollUntilComplete: 阻塞轮询某个 task_id 直到 ok/failed/cancelled.
// apiPostThenWait: api.post + (如果返回 task_id 就轮询拿 result, 否则原样返回).
//   这样 autoFlow 代码不用区分同步/异步 endpoint, 一律 await apiPostThenWait().
async function pollUntilComplete(taskId, opts) {
  opts = opts || {};
  const interval = opts.interval || 3000;
  const onProgress = opts.onProgress;
  while (true) {
    const t = await api.get(`/api/tasks/${taskId}`);
    if (onProgress) try { onProgress(t); } catch (_) {}
    if (t.status === "ok") return t.result;
    if (t.status === "failed") throw new Error(t.error || "任务失败");
    if (t.status === "cancelled") throw new Error("任务已取消");
    await new Promise(r => setTimeout(r, interval));
  }
}

async function apiPostThenWait(path, body, opts) {
  const r = await api.post(path, body || {});
  if (r && typeof r === "object" && r.task_id && r.status === "running") {
    return pollUntilComplete(r.task_id, opts);
  }
  return r;
}

// ─── 工具 ────────────────────────────────────────────────
function fmtSec(s) {
  s = Math.max(0, Math.floor(s || 0));
  if (s < 60) return `${s} 秒`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r ? `${m} 分 ${r} 秒` : `${m} 分`;
}

function fmtRelativeTs(unixSec) {
  if (!unixSec) return "";
  const diff = Math.max(0, Math.floor(Date.now() / 1000 - unixSec));
  if (diff < 60) return "刚刚";
  if (diff < 3600) return `${Math.floor(diff / 60)} 分前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
  return `${Math.floor(diff / 86400)} 天前`;
}

// kind → icon 映射 (顶栏 chip / 抽屉任务卡用)
const TASK_KIND_ICONS = {
  "compliance.check":   "🛡️",
  "wechat.write":       "📄",
  "wechat.cover":       "📄",
  "wechat.section-image": "📄",
  "wechat.plan-images": "📄",
  "wechat.titles":      "📄",
  "wechat.outline":     "📄",
  "hotrewrite.write":   "🔥",
  "voicerewrite.write": "🎙️",
  "baokuan.rewrite":    "💥",
  "touliu.generate":    "💰",
  "planner.write":      "📋",
  "moments.derive":     "💬",
  "topics.generate":    "💡",
  "rewrite":            "✏️",
  "dhv5.render":        "🎬",
  "compliance.write":   "🛡️",
  "compliance.analyze": "🛡️",
};
function taskIcon(kind) {
  if (!kind) return "⚙️";
  if (TASK_KIND_ICONS[kind]) return TASK_KIND_ICONS[kind];
  // fallback: 取 ns (kind 第一段)
  const ns = kind.split(".")[0];
  for (const k of Object.keys(TASK_KIND_ICONS)) {
    if (k.startsWith(ns + ".")) return TASK_KIND_ICONS[k];
  }
  return "⚙️";
}

// D-069: kind → 中文 label, 任务卡 fallback 用 (避免直接吐 "hotrewrite.write" 这种技术名)
const TASK_KIND_LABELS = {
  "compliance.check":     "违规审查",
  "compliance.write":     "违规审查",
  "compliance.analyze":   "违规审查",
  "wechat.write":         "公众号长文",
  "wechat.cover":         "公众号封面",
  "wechat.section-image": "公众号配图",
  "wechat.plan-images":   "公众号配图",
  "wechat.titles":        "公众号标题",
  "wechat.outline":       "公众号大纲",
  "hotrewrite.write":     "热点改写",
  "hotrewrite.analyze":   "热点改写",
  "voicerewrite.write":   "录音改写",
  "voicerewrite.analyze": "录音改写",
  "baokuan.rewrite":      "爆款改写",
  "baokuan.analyze":      "爆款改写",
  "touliu.generate":      "投流文案",
  "planner.write":        "内容策划",
  "planner.analyze":      "内容策划",
  "moments.derive":       "朋友圈",
  "topics.generate":      "选题生成",
  "rewrite":              "口播改写",
  "dhv5.render":          "视频渲染",
  "image.generate":       "出图",
};
function taskFriendlyName(task) {
  if (!task) return "任务";
  if (task.label) return task.label;
  const kind = task.kind || "";
  if (TASK_KIND_LABELS[kind]) return TASK_KIND_LABELS[kind];
  // fallback: ns 匹配
  const ns = kind.split(".")[0];
  for (const k of Object.keys(TASK_KIND_LABELS)) {
    if (k.startsWith(ns + ".")) return TASK_KIND_LABELS[k];
  }
  return "任务";
}

// D-068: 任务"卡死"判定 — 跑过预估 2x 或缺预估时跑超 5 min
function isTaskStale(t) {
  if (!t || (t.status !== "running" && t.status !== "pending")) return false;
  const elapsed = t.elapsed_sec || 0;
  const est = t.estimated_seconds || 0;
  if (est > 0) return elapsed > est * 2;
  return elapsed > 300;  // 没估时按 5 min 兜底
}

// ─── TaskBar (顶栏 chip + 抽屉) ───────────────────────────
function TaskBar({ onNav }) {
  const [open, setOpen] = React.useState(false);
  const [tasks, setTasks] = React.useState([]);
  const [counts, setCounts] = React.useState({ running: 0, ok: 0, failed: 0 });
  const [refreshTick, setRefreshTick] = React.useState(0);  // D-068: cancel 后强制刷新

  // 拉数据: 抽屉关时 30s 一次, 抽屉开时 3s 一次, 进行中存在时 3s
  React.useEffect(() => {
    let stop = false;
    async function pull() {
      try {
        const r = await api.get("/api/tasks?limit=30");
        if (stop) return;
        setTasks(r.tasks || []);
        setCounts(r.counts || { running: 0, ok: 0, failed: 0 });
      } catch (e) {}
    }
    pull();
    const running = counts.running > 0 || (counts.pending || 0) > 0;
    const interval = (open || running) ? 3000 : 30000;
    const timer = setInterval(pull, interval);
    return () => { stop = true; clearInterval(timer); };
  }, [open, counts.running, counts.pending, refreshTick]);

  const running = (counts.running || 0) + (counts.pending || 0);
  const today0 = (() => { const d = new Date(); d.setHours(0,0,0,0); return Math.floor(d.getTime()/1000); })();
  const todayOk = tasks.filter(t => t.status === "ok" && (t.finished_ts || 0) >= today0);
  const todayFailed = tasks.filter(t => t.status === "failed" && (t.finished_ts || 0) >= today0);
  const runningTasks = tasks.filter(t => t.status === "running" || t.status === "pending");
  const staleCount = runningTasks.filter(isTaskStale).length;  // D-068

  function go(t) {
    if (t.page_id && onNav) onNav(t.page_id);
    setOpen(false);
  }

  async function handleCancel(taskId) {
    try {
      await api.post(`/api/tasks/${taskId}/cancel`, {});
    } catch (e) {}
    setRefreshTick(x => x + 1);  // 立即重拉
  }

  return (
    <React.Fragment>
      {/* chip — D-068: 卡死任务时变橙警告 */}
      <button
        onClick={() => setOpen(!open)}
        style={{
          position: "fixed", top: 14, right: 16, zIndex: 50,
          background: staleCount > 0 ? "#FFF4E5" : (running ? T.brandSoft : "#fff"),
          color: staleCount > 0 ? "#B55B00" : (running ? T.brand : T.muted),
          border: `1px solid ${staleCount > 0 ? "#FFB066" : (running ? T.brand + "55" : T.border)}`,
          borderRadius: 8, padding: "5px 12px", fontSize: 12, fontWeight: 600,
          cursor: "pointer", display: "flex", alignItems: "center", gap: 8,
          fontFamily: "inherit",
          boxShadow: staleCount > 0 ? "0 2px 8px rgba(181,91,0,0.18)" : (running ? `0 2px 8px ${T.brand}22` : "0 1px 3px rgba(0,0,0,0.04)"),
        }}
        title={staleCount > 0 ? `${staleCount} 个任务可能卡死, 点开看看` : (running ? `${running} 个任务进行中` : "没有进行中的任务")}
      >
        <span style={{
          width: 7, height: 7, borderRadius: "50%",
          background: staleCount > 0 ? "#E07A1A" : (running ? T.brand : T.muted3),
          animation: running ? "qltaskpulse 1.5s infinite" : "none",
        }} />
        {staleCount > 0
          ? `⚠ ${staleCount} 卡死 · ${running - staleCount} 进行中`
          : (running > 0 ? `${running} 个进行中 · ${todayOk.length} 完成` : `没有进行中 · ${todayOk.length} 完成`)}
      </button>

      {/* 抽屉 */}
      {open && (
        <React.Fragment>
          <div onClick={() => setOpen(false)} style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.06)", zIndex: 49,
          }} />
          <div style={{
            position: "fixed", top: 0, right: 0, bottom: 0, width: 380,
            background: "#fff", borderLeft: `1px solid ${T.border}`,
            boxShadow: "-4px 0 20px rgba(0,0,0,0.06)", zIndex: 51,
            padding: "18px 18px 24px", overflow: "auto",
            display: "flex", flexDirection: "column", gap: 10,
          }}>
            <div style={{
              display: "flex", alignItems: "center",
              paddingBottom: 12, borderBottom: `1px solid ${T.borderSoft}`,
            }}>
              <div style={{ fontSize: 15, fontWeight: 600, flex: 1 }}>🌟 我的任务</div>
              <button onClick={() => setOpen(false)} style={{
                background: "transparent", border: "none", cursor: "pointer", fontSize: 16,
                color: T.muted, padding: 4,
              }}>✕</button>
            </div>

            {runningTasks.length > 0 && (
              <React.Fragment>
                <div style={{ fontSize: 11, color: T.muted2, letterSpacing: 0.5, marginTop: 4 }}>
                  进行中 ({runningTasks.length})
                </div>
                {runningTasks.map(t => <TaskCard key={t.id} task={t} onClick={() => go(t)} onCancel={handleCancel} />)}
              </React.Fragment>
            )}

            {todayOk.length > 0 && (
              <React.Fragment>
                <div style={{ fontSize: 11, color: T.muted2, letterSpacing: 0.5, marginTop: 8 }}>
                  今日完成 ({todayOk.length})
                </div>
                {todayOk.slice(0, 8).map(t => <TaskCard key={t.id} task={t} onClick={() => go(t)} compact />)}
              </React.Fragment>
            )}

            {todayFailed.length > 0 && (
              <React.Fragment>
                <div style={{ fontSize: 11, color: T.muted2, letterSpacing: 0.5, marginTop: 8 }}>
                  失败 ({todayFailed.length})
                </div>
                {todayFailed.map(t => <TaskCard key={t.id} task={t} onClick={() => go(t)} />)}
              </React.Fragment>
            )}

            {runningTasks.length === 0 && todayOk.length === 0 && todayFailed.length === 0 && (
              <div style={{
                color: T.muted2, fontSize: 13, textAlign: "center", padding: "60px 0",
              }}>
                今天还没干过活<br />
                <span style={{ fontSize: 12 }}>去生产部找个工具开始干吧</span>
              </div>
            )}
          </div>
        </React.Fragment>
      )}
    </React.Fragment>
  );
}

// ─── TaskCard (抽屉里的单个任务卡) ───────────────────────
// D-068: 加 onCancel + stale 状态 (橙色边框 + "卡了 Xm" + 杀任务按钮)
function TaskCard({ task, onClick, compact, onCancel }) {
  const failed = task.status === "failed";
  const cancelled = task.status === "cancelled";
  const ok = task.status === "ok";
  const running = task.status === "running" || task.status === "pending";
  const stale = isTaskStale(task);
  const pct = typeof task.progress_pct === "number" ? task.progress_pct : null;
  const elapsedDisplay = running ? fmtSec(task.elapsed_sec || 0)
                       : ok ? fmtRelativeTs(task.finished_ts)
                       : fmtRelativeTs(task.finished_ts);

  // D-068: stale 用橙色, failed 用红色
  const accentColor = stale ? "#E07A1A" : (failed ? T.red : T.brand);
  const accentBg = stale ? "#FFF4E5" : (failed ? T.redSoft : T.bg2);
  const accentBorder = stale ? "#FFB066" : (failed ? T.red + "44" : T.borderSoft);

  return (
    <div style={{
      background: accentBg,
      border: `1px solid ${accentBorder}`,
      borderRadius: 10, padding: compact ? "8px 12px" : 12,
      opacity: ok ? 0.75 : 1,
      transition: "all 0.15s",
    }}>
      <div onClick={onClick} style={{ cursor: "pointer" }}
        onMouseEnter={(e) => { e.currentTarget.parentElement.style.background = stale ? "#FFEAD0" : (failed ? T.redSoft : "#fff"); e.currentTarget.parentElement.style.borderColor = accentColor + "99"; }}
        onMouseLeave={(e) => { e.currentTarget.parentElement.style.background = accentBg; e.currentTarget.parentElement.style.borderColor = accentBorder; }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
          <span style={{ fontSize: 15 }}>{taskIcon(task.kind)}</span>
          <span style={{ flex: 1, color: stale ? "#B55B00" : (failed ? T.red : T.text), fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {taskFriendlyName(task)}
          </span>
          <span style={{ color: stale ? "#B55B00" : T.muted2, fontSize: 11, fontWeight: stale ? 600 : 400 }}>
            {ok ? "✓ " : ""}{cancelled ? "⊘ " : ""}{stale ? "⚠ 等了 " : ""}{elapsedDisplay}
          </span>
        </div>
        {running && pct !== null && (
          <div style={{ marginTop: 8, height: 4, background: T.bg3, borderRadius: 2, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${pct}%`, background: stale ? "#E07A1A" : T.brand, borderRadius: 2, transition: "width 0.4s" }} />
          </div>
        )}
        {running && task.progress_text && (
          <div style={{ fontSize: 11.5, color: stale ? "#B55B00" : T.muted, marginTop: 6 }}>
            {task.progress_text}
            {stale && task.estimated_seconds ? ` · 比预想久 ${Math.round(((task.elapsed_sec||0) / task.estimated_seconds) * 10) / 10} 倍` : ""}
          </div>
        )}
        {failed && task.error && (
          <div style={{ fontSize: 11.5, color: T.red, marginTop: 6, lineHeight: 1.5 }}>
            {/* D-086: _friendlyErrorReason 已改调 humanizeError, 永远非空, 删掉 slice 兜底 (防原始错误漏出) */}
            {_friendlyErrorReason(task.error)}
          </div>
        )}
      </div>
      {failed && !((task.kind || "").startsWith("dreamina.") && task.payload?.submit_id) && task.page_id && (
        <div style={{ marginTop: 8, display: "flex", justifyContent: "flex-end" }}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              try { sessionStorage.setItem("retry_payload_" + task.page_id, JSON.stringify(task.payload || {})); } catch {}
              window.location.search = `?page=${encodeURIComponent(task.page_id)}`;
            }}
            style={{
              background: "transparent", color: T.brand,
              border: `1px solid ${T.brand}`,
              borderRadius: 6, padding: "3px 10px",
              fontSize: 11, fontWeight: 500,
              cursor: "pointer", fontFamily: "inherit",
            }}
            title="跳到对应页面重做这个任务 (D-082b)"
          >🔄 重新生成</button>
        </div>
      )}
      {failed && (task.kind || "").startsWith("dreamina.") && task.payload?.submit_id && (
        <div style={{ marginTop: 8, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 10.5, color: T.muted2 }}>
            可尝试重新取回结果
          </span>
          <button
            onClick={async (e) => {
              e.stopPropagation();
              const sid = task.payload.submit_id;
              const btn = e.currentTarget;
              btn.disabled = true;
              btn.textContent = "查询中...";
              try {
                const r = await fetch(`/api/dreamina/recover/${sid}`, { method: "POST" });
                const j = await r.json();
                if (j.recovered) {
                  alert("✅ 即梦端结果已取回, 已放进作品库");
                } else if (j.watcher_will_retry) {
                  alert("🔄 即梦还在生成, 后台会继续跟进, 稍后再看");
                } else {
                  alert(`❌ 暂时没找到结果: ${j.error || "稍后再试"}`);
                }
                if (onClick) onClick();  // 刷新
              } catch (err) {
                alert(`查询失败: ${err.message}`);
              } finally {
                btn.disabled = false;
                btn.textContent = "🔍 重查即梦";
              }
            }}
            style={{
              background: "transparent", color: T.brand,
              border: `1px solid ${T.brand}`,
              borderRadius: 6, padding: "3px 10px",
              fontSize: 11, fontWeight: 500,
              cursor: "pointer", fontFamily: "inherit",
            }}
            title="即梦端可能已经跑出来了, 重查一下入作品库"
          >🔍 重查即梦</button>
        </div>
      )}
      {running && onCancel && (
        <div style={{ marginTop: 8, display: "flex", justifyContent: "flex-end", gap: 6 }}>
          <button
            onClick={(e) => { e.stopPropagation(); if (window.confirm(stale ? "这个等太久了, 停掉重来?" : "确定停掉这个任务?")) onCancel(task.id); }}
            style={{
              background: stale ? "#E07A1A" : "transparent",
              color: stale ? "#fff" : T.muted2,
              border: `1px solid ${stale ? "#E07A1A" : T.border}`,
              borderRadius: 6, padding: "3px 10px",
              fontSize: 11, fontWeight: stale ? 600 : 500,
              cursor: "pointer", fontFamily: "inherit",
            }}
            title={stale ? "停掉这个等太久的" : "停掉这个任务"}
          >{stale ? "停掉" : "取消"}</button>
        </div>
      )}
    </div>
  );
}

// ─── CSS keyframe (注入一次) ─────────────────────────────
(function injectTaskCss() {
  if (typeof document === "undefined") return;
  if (document.getElementById("qltask-css")) return;
  const s = document.createElement("style");
  s.id = "qltask-css";
  s.textContent = `
    @keyframes qltaskindeterminate {
      0% { margin-left: -30%; }
      50% { margin-left: 50%; }
      100% { margin-left: 100%; }
    }
    @keyframes qltaskpulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.4; }
    }
  `;
  document.head.appendChild(s);
})();
