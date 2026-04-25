// factory-persist.jsx — 工作流状态持久化 hook (D-016)
//
// 原地保留每页的 useState/setter 代码,加 useWorkflowPersist({ ns, state, onRestore })
// 就能把整个工作流对象 500ms 防抖存到 localStorage `wf:<ns>`。
// 刷新/重启浏览器后自动恢复。reset() 里调 clearWorkflow(ns) 清空。

const WF_PREFIX = "wf:";

function useWorkflowPersist({ ns, state, onRestore }) {
  // 初始化时尝试恢复一次(只跑一次)
  const [restored, setRestored] = React.useState(false);
  const [hasSnapshot, setHasSnapshot] = React.useState(false);
  React.useEffect(() => {
    if (restored) return;
    try {
      const raw = localStorage.getItem(WF_PREFIX + ns);
      if (raw) {
        const snap = JSON.parse(raw);
        if (snap && typeof snap === "object") {
          onRestore(snap);
          setHasSnapshot(true);
        }
      }
    } catch (e) { console.warn("wf restore failed:", e); }
    setRestored(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ns]);

  // 防抖保存
  const timer = React.useRef(null);
  React.useEffect(() => {
    if (!restored) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      try {
        localStorage.setItem(WF_PREFIX + ns, JSON.stringify(state));
      } catch (e) {
        // QuotaExceeded 等,静默
      }
    }, 500);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [ns, state, restored]);

  return {
    restored,
    hasSnapshot,
    dismissSnapshot: () => setHasSnapshot(false),
  };
}

function clearWorkflow(ns) {
  try { localStorage.removeItem(WF_PREFIX + ns); } catch {}
}

function listWorkflows() {
  const items = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(WF_PREFIX)) {
        items.push({ ns: k.slice(WF_PREFIX.length), size: (localStorage.getItem(k) || "").length });
      }
    }
  } catch {}
  return items;
}

// ─── 恢复提示条(放在页面顶部) ───────────────────────────
// C21: WfRestoreBanner 风格统一 (padding 12x16 / radius 10 / border 44 / icon 18 flexShrink)
function WfRestoreBanner({ show, onDismiss, onClear, label }) {
  if (!show) return null;
  return (
    <div style={{
      maxWidth: 1080, margin: "16px auto 0", padding: "12px 16px",
      background: T.amberSoft, border: `1px solid ${T.amber}44`,
      borderRadius: 10, fontSize: 12.5, color: T.amber,
      display: "flex", alignItems: "center", gap: 12,
    }}>
      <span style={{ fontSize: 18, flexShrink: 0 }}>✨</span>
      <span style={{ flex: 1, lineHeight: 1.5 }}>已恢复上次未完成的 <b>{label || "工作流"}</b> · 不想要的话可以清空重来</span>
      <button onClick={onClear} style={{
        padding: "4px 12px", fontSize: 11.5, background: "transparent",
        border: `1px solid ${T.amber}44`, borderRadius: 100,
        color: T.amber, cursor: "pointer", fontFamily: "inherit",
      }}>🗑️ 清空重来</button>
      <button onClick={onDismiss} style={{
        padding: "4px 12px", fontSize: 11.5, background: T.amber,
        border: "none", borderRadius: 100, color: "#fff", cursor: "pointer", fontFamily: "inherit", fontWeight: 500,
      }}>知道了</button>
    </div>
  );
}

Object.assign(window, { useWorkflowPersist, clearWorkflow, listWorkflows, WfRestoreBanner });
