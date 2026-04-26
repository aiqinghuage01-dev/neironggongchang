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
      maxWidth: 680, margin: "40px auto", background: "#fff",
      border: `1.5px solid ${T.brand}`, borderRadius: 16, padding: 28,
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

// ─── FailedRetry 组件 ────────────────────────────────────
function FailedRetry({ error, onRetry, onEdit, icon, title }) {
  return (
    <div style={{
      maxWidth: 680, margin: "40px auto", background: "#fff",
      border: `1.5px solid ${T.red}`, borderRadius: 16, padding: 28,
      boxShadow: `0 0 0 5px ${T.redSoft}`, textAlign: "center",
    }}>
      <div style={{ fontSize: 32 }}>{icon || "😅"}</div>
      <div style={{ fontSize: 18, fontWeight: 600, marginTop: 10, marginBottom: 4, color: T.red }}>
        {title || "这次没跑成功"}
      </div>
      <div style={{ color: T.muted, fontSize: 13 }}>
        大概率是 AI 上游临时不稳定, 通常重试一次就好
      </div>
      {error && (
        <div style={{
          background: T.redSoft, color: T.red, padding: "10px 14px",
          borderRadius: 8, fontSize: 12.5, margin: "16px 0", textAlign: "left",
          fontFamily: "ui-monospace, monospace", wordBreak: "break-all",
        }}>
          {error}
        </div>
      )}
      <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 16 }}>
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

// ─── TaskBar (顶栏 chip + 抽屉) ───────────────────────────
function TaskBar({ onNav }) {
  const [open, setOpen] = React.useState(false);
  const [tasks, setTasks] = React.useState([]);
  const [counts, setCounts] = React.useState({ running: 0, ok: 0, failed: 0 });

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
  }, [open, counts.running, counts.pending]);

  const running = (counts.running || 0) + (counts.pending || 0);
  const today0 = (() => { const d = new Date(); d.setHours(0,0,0,0); return Math.floor(d.getTime()/1000); })();
  const todayOk = tasks.filter(t => t.status === "ok" && (t.finished_ts || 0) >= today0);
  const todayFailed = tasks.filter(t => t.status === "failed" && (t.finished_ts || 0) >= today0);
  const runningTasks = tasks.filter(t => t.status === "running" || t.status === "pending");

  function go(t) {
    if (t.page_id && onNav) onNav(t.page_id);
    setOpen(false);
  }

  return (
    <React.Fragment>
      {/* chip */}
      <button
        onClick={() => setOpen(!open)}
        style={{
          position: "fixed", top: 14, right: 16, zIndex: 50,
          background: running ? T.brandSoft : "#fff",
          color: running ? T.brand : T.muted,
          border: `1px solid ${running ? T.brand + "55" : T.border}`,
          borderRadius: 8, padding: "5px 12px", fontSize: 12, fontWeight: 600,
          cursor: "pointer", display: "flex", alignItems: "center", gap: 8,
          fontFamily: "inherit",
          boxShadow: running ? `0 2px 8px ${T.brand}22` : "0 1px 3px rgba(0,0,0,0.04)",
        }}
        title={running ? `${running} 个任务进行中` : "没有进行中的任务"}
      >
        <span style={{
          width: 7, height: 7, borderRadius: "50%",
          background: running ? T.brand : T.muted3,
          animation: running ? "qltaskpulse 1.5s infinite" : "none",
        }} />
        {running > 0 ? `${running} 个进行中 · ${todayOk.length} 完成` : `没有进行中 · ${todayOk.length} 完成`}
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
                {runningTasks.map(t => <TaskCard key={t.id} task={t} onClick={() => go(t)} />)}
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
                今天还没跑过任务<br />
                <span style={{ fontSize: 12 }}>去生产部任意 skill 开个活吧</span>
              </div>
            )}
          </div>
        </React.Fragment>
      )}
    </React.Fragment>
  );
}

// ─── TaskCard (抽屉里的单个任务卡) ───────────────────────
function TaskCard({ task, onClick, compact }) {
  const failed = task.status === "failed";
  const cancelled = task.status === "cancelled";
  const ok = task.status === "ok";
  const running = task.status === "running" || task.status === "pending";
  const pct = typeof task.progress_pct === "number" ? task.progress_pct : null;
  const elapsedDisplay = running ? fmtSec(task.elapsed_sec || 0)
                       : ok ? fmtRelativeTs(task.finished_ts)
                       : fmtRelativeTs(task.finished_ts);

  return (
    <div onClick={onClick} style={{
      background: failed ? T.redSoft : (ok ? T.bg2 : T.bg2),
      border: `1px solid ${failed ? T.red + "44" : T.borderSoft}`,
      borderRadius: 10, padding: compact ? "8px 12px" : 12,
      cursor: "pointer", opacity: ok ? 0.75 : 1,
      transition: "all 0.15s",
    }}
    onMouseEnter={(e) => { e.currentTarget.style.background = failed ? T.redSoft : "#fff"; e.currentTarget.style.borderColor = failed ? T.red + "66" : T.brand + "55"; }}
    onMouseLeave={(e) => { e.currentTarget.style.background = failed ? T.redSoft : T.bg2; e.currentTarget.style.borderColor = failed ? T.red + "44" : T.borderSoft; }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
        <span style={{ fontSize: 15 }}>{taskIcon(task.kind)}</span>
        <span style={{ flex: 1, color: failed ? T.red : T.text, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {task.label || task.kind}
        </span>
        <span style={{ color: T.muted2, fontSize: 11 }}>
          {ok ? "✓ " : ""}{cancelled ? "⊘ " : ""}{elapsedDisplay}
        </span>
      </div>
      {running && pct !== null && (
        <div style={{ marginTop: 8, height: 4, background: T.bg3, borderRadius: 2, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${pct}%`, background: T.brand, borderRadius: 2, transition: "width 0.4s" }} />
        </div>
      )}
      {running && task.progress_text && (
        <div style={{ fontSize: 11.5, color: T.muted, marginTop: 6 }}>{task.progress_text}</div>
      )}
      {failed && task.error && (
        <div style={{ fontSize: 11.5, color: T.red, marginTop: 6, lineHeight: 1.5, fontFamily: "ui-monospace, monospace" }}>
          {task.error.length > 100 ? task.error.slice(0, 100) + "..." : task.error}
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
