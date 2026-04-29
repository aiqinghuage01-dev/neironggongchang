// factory-beta.jsx — 科技与狠活: 研发部状态摘要页

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

      <div style={{ flex: 1, overflow: "auto", background: T.bg, padding: "28px" }}>
        {status === "online" ? (
          <BetaDashboardSummary summary={summary} />
        ) : (
          <DashboardOffline status={status} onRetry={checkDashboard} />
        )}
      </div>
    </div>
  );
}

function BetaDashboardSummary({ summary }) {
  const slots = summary?.slots || [];
  const tasks = summary?.tasks || [];
  const counts = summary?.counts || {};
  const runningSlots = slots.filter((slot) => slot.status === "running");
  const activeTasks = tasks.filter((task) => task.status === "claimed" || task.status === "queued");
  const doneCount = counts.done || 0;
  const blockedCount = counts.blocked || 0;

  return (
    <div style={{ maxWidth: 1180, margin: "0 auto", display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 14 }}>
        <BetaStat title="正在干活" value={runningSlots.length} hint="自动岗位" tone={runningSlots.length > 0 ? "green" : "gray"} />
        <BetaStat title="队列中" value={counts.queued || 0} hint="等待领取" tone={(counts.queued || 0) > 0 ? "amber" : "gray"} />
        <BetaStat title="已领取" value={counts.claimed || 0} hint="正在推进" tone={(counts.claimed || 0) > 0 ? "green" : "gray"} />
        <BetaStat title="需处理" value={blockedCount} hint={`已完成 ${doneCount}`} tone={blockedCount > 0 ? "amber" : "gray"} />
      </div>

      <section style={{ background: "#fff", border: `1px solid ${T.borderSoft}`, borderRadius: 12, padding: 18 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 14 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: T.text }}>谁在上岗</div>
          <div style={{ fontSize: 12, color: T.muted }}>只显示老板需要看的状态</div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
          {slots.map((slot) => (
            <BetaSlotCard key={slot.slot_id} slot={slot} />
          ))}
        </div>
      </section>

      <section style={{ background: "#fff", border: `1px solid ${T.borderSoft}`, borderRadius: 12, padding: 18 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 14 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: T.text }}>当前任务</div>
          <div style={{ fontSize: 12, color: T.muted }}>不展示日志和本机路径</div>
        </div>
        {activeTasks.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {activeTasks.slice(0, 8).map((task) => (
              <BetaTaskRow key={task.id} task={task} />
            ))}
          </div>
        ) : (
          <div style={{ padding: 18, background: T.bg2, borderRadius: 10, color: T.muted, fontSize: 13 }}>
            当前没有正在排队或推进中的任务。
          </div>
        )}
      </section>
    </div>
  );
}

function BetaStat({ title, value, hint, tone }) {
  const color = tone === "green" ? T.brand : tone === "amber" ? "#B55B00" : T.muted;
  const bg = tone === "green" ? "#E7F6EE" : tone === "amber" ? "#FFF0EA" : "#fff";
  return (
    <div style={{ background: bg, border: `1px solid ${T.borderSoft}`, borderRadius: 12, padding: 16 }}>
      <div style={{ fontSize: 12, color: T.muted, marginBottom: 8 }}>{title}</div>
      <div style={{ fontSize: 28, fontWeight: 750, color }}>{value}</div>
      <div style={{ fontSize: 12, color: T.muted2, marginTop: 4 }}>{hint}</div>
    </div>
  );
}

function BetaSlotCard({ slot }) {
  const running = slot.status === "running";
  const stale = slot.status === "stale";
  const task = slot.task || null;
  const statusLabel = running ? "工作中" : stale ? "需要重启" : "空闲";
  const roleLabel = {
    controller: "总控",
    content: "内容开发",
    media: "媒体开发",
    qa: "测试",
    review: "审查",
  }[slot.role] || "协作岗位";
  return (
    <div style={{
      border: `1px solid ${running ? T.brand + "66" : stale ? "#E66B2F66" : T.borderSoft}`,
      borderRadius: 10,
      padding: 14,
      background: running ? "#F4FBF7" : stale ? "#FFF7F0" : T.bg2,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <span style={{ width: 8, height: 8, borderRadius: 99, background: running ? T.brand : stale ? "#E66B2F" : T.muted3 }} />
        <div style={{ fontSize: 14, fontWeight: 700, color: T.text, flex: 1 }}>{slot.agent_name || roleLabel}</div>
        <span style={{ fontSize: 12, color: running ? T.brand : stale ? "#B55B00" : T.muted }}>{statusLabel}</span>
      </div>
      <div style={{ fontSize: 12, color: T.muted, marginBottom: 8 }}>{roleLabel}</div>
      <div style={{ fontSize: 12.5, color: T.text, lineHeight: 1.6 }}>
        {task ? safeTaskTitle(task.title) : "当前没有任务。"}
      </div>
    </div>
  );
}

function BetaTaskRow({ task }) {
  const label = task.status === "claimed" ? "已领取" : task.status === "queued" ? "排队中" : "处理中";
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12,
      padding: "12px 14px", background: T.bg2, borderRadius: 10,
      border: `1px solid ${T.borderSoft}`,
    }}>
      <Tag size="xs" color={task.status === "claimed" ? "green" : "gray"}>{label}</Tag>
      <div style={{ flex: 1, minWidth: 0, fontSize: 13.5, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {safeTaskTitle(task.title)}
      </div>
      <div style={{ fontSize: 12, color: T.muted }}>{task.claimed_by ? "有人在跟" : "等人接手"}</div>
    </div>
  );
}

function safeTaskTitle(title) {
  return String(title || "未命名任务")
    .replace(/\/(?:Users|private)\/\S+/g, "本机目录")
    .replace(/\b(?:submit_id|prompt|tokens?|credits?|watcher|daemon|provider)\s*[:=]\s*\S+/gi, "内部信息")
    .replace(/\bstatus\s*[:=]\s*\S+/gi, "任务状态")
    .replace(/OpenClaw|DeepSeek|Opus|LLM|prompt|tokens?|credits?|Downloads|traceback|Pydantic|watcher|daemon|provider|submit_id|\bAPI\b/gi, "内部信息")
    .replace(/\b(?:404|500|502|503|504)\b/g, "异常状态");
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
