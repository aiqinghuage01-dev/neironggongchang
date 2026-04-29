// factory-beta.jsx — 科技与狠活: 研发部状态面板嵌入页

const AGENT_DASHBOARD_URL = "http://127.0.0.1:8765/";

function PageBeta() {
  const [status, setStatus] = React.useState("checking");
  const [summary, setSummary] = React.useState(null);

  const checkDashboard = React.useCallback(() => {
    setStatus("checking");
    fetch(`${AGENT_DASHBOARD_URL}api/status`, { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error(`status ${r.status}`);
        return r.json();
      })
      .then((data) => {
        setSummary(data);
        setStatus("online");
      })
      .catch(() => {
        setSummary(null);
        setStatus("offline");
      });
  }, []);

  React.useEffect(() => {
    checkDashboard();
    const t = setInterval(checkDashboard, 10000);
    return () => clearInterval(t);
  }, [checkDashboard]);

  const launch = summary?.launch || {};
  const runningSlots = (summary?.slots || []).filter((slot) => slot.status === "running").length;
  const claimedTasks = (summary?.tasks || []).filter((task) => task.status === "claimed").length;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", position: "relative" }}>
      <div style={{ padding: "18px 28px 16px", background: "#fff", borderBottom: `1px solid ${T.border}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
          <div style={{ fontSize: 24, flexShrink: 0 }}>🧪</div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 22, fontWeight: 650, letterSpacing: 0 }}>科技与狠活</div>
            <div style={{ fontSize: 13, color: T.muted, marginTop: 4 }}>
              研发部状态台 · App 开工, 这里看进度
            </div>
          </div>
          {status === "online" && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
              <StatusPill label="监控" ok={!!launch.monitor?.running} />
              <StatusPill label="派工" ok={!!launch.dispatcher?.running} />
              <StatusPill label={`${runningSlots} 个在跑`} ok={runningSlots > 0} quiet={runningSlots === 0} />
              <StatusPill label={`${claimedTasks} 个已领`} ok={claimedTasks > 0} quiet={claimedTasks === 0} />
            </div>
          )}
        </div>
      </div>

      <div style={{ flex: 1, overflow: "hidden", background: "#0F1217", padding: status === "online" ? 0 : "28px" }}>
        {status === "online" ? (
          <iframe
            title="内容工厂研发部状态面板"
            src={AGENT_DASHBOARD_URL}
            style={{
              width: "100%",
              height: "100%",
              border: 0,
              display: "block",
              background: "#0F1217",
            }}
          />
        ) : (
          <DashboardOffline status={status} onRetry={checkDashboard} />
        )}
      </div>
    </div>
  );
}

function StatusPill({ label, ok, quiet }) {
  const bg = quiet ? T.bg2 : (ok ? "#E7F6EE" : "#FFF0EA");
  const color = quiet ? T.muted : (ok ? T.brand : "#B55B00");
  const dot = quiet ? T.muted2 : (ok ? T.brand : "#E66B2F");
  return (
    <div style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      padding: "6px 10px",
      borderRadius: 999,
      background: bg,
      color,
      fontSize: 12,
      fontWeight: 650,
      whiteSpace: "nowrap",
    }}>
      <span style={{ width: 7, height: 7, borderRadius: 99, background: dot }} />
      {label}
    </div>
  );
}

function DashboardOffline({ status, onRetry }) {
  return (
    <div style={{
      height: "100%",
      border: `1px solid ${T.border}`,
      borderRadius: 12,
      background: "#fff",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 24,
    }}>
      <div style={{ textAlign: "center", maxWidth: 520 }}>
        <div style={{ fontSize: 52, marginBottom: 16 }}>{status === "checking" ? "⏳" : "🧪"}</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: T.text, marginBottom: 8 }}>
          {status === "checking" ? "正在连接研发部" : "研发部还没上岗"}
        </div>
        <div style={{ fontSize: 14, color: T.muted, lineHeight: 1.7, marginBottom: 18 }}>
          双击桌面「打开内容工厂工作台.app」后, 这里会自动出现研发部状态台。
        </div>
        <button onClick={onRetry} style={{
          border: `1px solid ${T.border}`,
          background: T.brand,
          color: "#fff",
          borderRadius: 8,
          padding: "9px 16px",
          fontSize: 13,
          fontWeight: 650,
          fontFamily: "inherit",
          cursor: "pointer",
        }}>重新检查</button>
      </div>
    </div>
  );
}

Object.assign(window, { PageBeta });
