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

// ─── 工具 ────────────────────────────────────────────────
function fmtSec(s) {
  s = Math.max(0, Math.floor(s || 0));
  if (s < 60) return `${s} 秒`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r ? `${m} 分 ${r} 秒` : `${m} 分`;
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
  `;
  document.head.appendChild(s);
})();
