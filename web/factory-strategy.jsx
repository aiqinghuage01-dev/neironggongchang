// factory-strategy.jsx — 战略部 placeholder (D-068b)
// 等老板装上"战略规划"技能后, 这里放真正的战略对话/规划工具.

function PageStrategy({ onNav }) {
  return (
    <div style={{
      flex: 1, padding: "32px 40px", overflowY: "auto",
      background: T.bg, color: T.text,
    }}>
      <div style={{
        maxWidth: 720, margin: "60px auto 0",
        background: "#fff",
        border: `1px solid ${T.border}`,
        borderRadius: 14,
        padding: "40px 48px",
        boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 18 }}>
          <span style={{ fontSize: 32 }}>🧭</span>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>战略部</h1>
        </div>
        <p style={{ fontSize: 14.5, lineHeight: 1.75, color: T.muted, margin: "12px 0 24px" }}>
          老板专属战略沙盘 — 等装上 <code style={{
            background: T.brandSoft, color: T.brand, padding: "2px 6px",
            borderRadius: 4, fontSize: 13, fontFamily: "SF Mono, monospace",
          }}>战略规划</code> 技能后, 我们就在这里聊方向、拆决策、定打法。
        </p>
        <div style={{
          background: T.bg2,
          border: `1px dashed ${T.border}`,
          borderRadius: 10,
          padding: "18px 22px",
          fontSize: 13.5, color: T.muted2 || T.muted, lineHeight: 1.7,
        }}>
          <div style={{ fontWeight: 600, color: T.text, marginBottom: 8 }}>战略部计划承接的事情</div>
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            <li>季度/月度战略目标拆解</li>
            <li>新业务方向的可行性对话</li>
            <li>资源 / 时间 / 人力的分配讨论</li>
            <li>关键决策的多视角推演</li>
          </ul>
        </div>
        <div style={{ marginTop: 28, display: "flex", gap: 10 }}>
          <button onClick={() => onNav && onNav("home")} style={{
            background: T.brand, color: "#fff",
            border: "none", borderRadius: 8,
            padding: "9px 18px", fontSize: 13.5, fontWeight: 600,
            cursor: "pointer",
          }}>← 回总部</button>
          <button onClick={() => onNav && onNav("settings")} style={{
            background: "transparent", color: T.muted,
            border: `1px solid ${T.border}`, borderRadius: 8,
            padding: "9px 18px", fontSize: 13.5,
            cursor: "pointer",
          }}>去设置装技能</button>
        </div>
      </div>
      {/* T11: 远程任务 watcher 观察台 */}
      <SystemObservatory />
    </div>
  );
}

// T11 远程任务 watcher 系统观察台 — 让老板看 watcher 在 work
function SystemObservatory() {
  const [rj, setRj] = React.useState(null);
  const [retry, setRetry] = React.useState(null);
  const [taskCounts, setTaskCounts] = React.useState(null);
  React.useEffect(() => {
    const load = () => {
      api.get("/api/remote-jobs/stats").then(setRj).catch(() => {});
      api.get("/api/llm-retry/stats").then(setRetry).catch(() => {});
      api.get("/api/tasks/counts").then(setTaskCounts).catch(() => {});
    };
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, []);
  if (!rj && !retry) return null;
  const stats = rj?.stats || {};
  return (
    <div style={{
      maxWidth: 720, margin: "20px auto 60px",
      background: "#fff", border: `1px solid ${T.border}`,
      borderRadius: 14, padding: "28px 36px",
      boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
    }}>
      <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 14, color: T.text, display: "flex", alignItems: "center", gap: 8 }}>
        <span>🛰️</span> 系统观察台
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16 }}>
        <Stat label="远程任务总数" value={stats.total ?? "-"} />
        <Stat label="排队中" value={stats.querying ?? 0} accent={stats.querying ? T.amber : T.muted} />
        <Stat label="已完成" value={stats.done ?? 0} accent={T.brand} />
        <Stat label="失败/超时" value={(stats.failed ?? 0) + (stats.timeout ?? 0)} accent={(stats.failed || stats.timeout) ? T.red : T.muted} />
      </div>
      <div style={{ marginTop: 18, paddingTop: 14, borderTop: `1px dashed ${T.borderSoft}`, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
        <Stat small label="LLM 重试触发" value={retry?.retried ?? 0} />
        <Stat small label="重试救活" value={retry?.saved_after_retry ?? 0} accent={T.brand} />
        <Stat small label="救活率" value={`${retry?.save_rate_pct ?? 0}%`} />
      </div>
      <div style={{ marginTop: 14, fontSize: 11.5, color: T.muted2 || T.muted }}>
        watcher: {rj?.watcher_running ? "✓ 在跑" : "❌ 没起"} · providers: {(rj?.providers || []).join(" / ")}
        · 任务总数 {taskCounts?.active ?? 0} 进行中
      </div>
    </div>
  );
}

function Stat({ label, value, accent, small }) {
  return (
    <div style={{
      background: T.bg2, borderRadius: 8, padding: small ? "10px 12px" : "14px 16px",
    }}>
      <div style={{ fontSize: small ? 10.5 : 11.5, color: T.muted2 || T.muted, fontWeight: 600, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: small ? 16 : 22, fontWeight: 700, color: accent || T.text, fontFamily: "SF Mono, monospace" }}>
        {value}
      </div>
    </div>
  );
}

Object.assign(window, { PageStrategy });
