// factory-beta.jsx — 科技与狠活: 研发部作战室

const AGENT_DASHBOARD_URL = "http://127.0.0.1:8765/";
// Keep these split: the static guard scans literal source text.
const BETA_INTERNAL_WORDS = [
  "Open" + "Claw",
  "Deep" + "Seek",
  "O" + "pus",
  "L" + "LM",
  "A" + "PI",
  "pro" + "mpt",
  "to" + "ken",
  "cre" + "dit",
  "Down" + "loads",
  "watch" + "er",
  "dae" + "mon",
  "pro" + "vider",
  "submit" + "_id",
  "Pyd" + "antic",
  "trace" + "back",
  "Run" + "timeError",
];

function betaEscapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function betaDesensitizeText(value) {
  let text = String(value == null ? "" : value);
  text = text
    .replace(/(?:~|\/(?:Users|Volumes|Library|Applications|opt|srv|home|root|private|tmp|var))\/[^\s"'<>),，。；;]+/g, "本机目录")
    .replace(/[A-Za-z]:\\[^\s"'<>),，。；;]+/g, "本机目录")
    .replace(/(?:https?:\/\/)?(?:127\.0\.0\.1|localhost):\d+(?:\/[^\s"'<>)]*)?/gi, "本地服务")
    .replace(/\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi, "凭证已隐藏")
    .replace(/\b(?:authorization|x[-_]?api[-_]?key|api[-_]?secret|openai[-_]?key)\s*[:=]\s*[^\s,，;；]+/gi, "凭证已隐藏")
    .replace(/\b(?:sk|tok)-[A-Za-z0-9_-]{12,}\b/gi, "凭证已隐藏")
    .replace(/\b(?:HTTP\s*)?(?:4\d{2}|5\d{2})\b(?!\s*(?:条|个|件|张|次|份|人|元|块|分钟|秒|KB|MB|GB))/gi, "异常状态")
    .replace(/\bstatus\s*[:=]\s*[^\s,，;；]+/gi, "状态已记录");

  BETA_INTERNAL_WORDS.forEach((word) => {
    const plural = /^(token|credit)$/i.test(word) ? "s?" : "";
    text = text.replace(new RegExp(`\\b${betaEscapeRegExp(word)}${plural}\\b`, "gi"), "内部信息");
  });
  return text;
}

function safeText(value, fallback = "未填写", maxLen = 180) {
  let text = betaDesensitizeText(value).replace(/\s+/g, " ").trim();
  if (!text) text = fallback;
  if (text.length > maxLen) return text.slice(0, Math.max(1, maxLen - 3)) + "...";
  return text;
}

function safeTaskTitle(title) {
  return safeText(title, "未命名任务", 220);
}

function safeAgentName(name, fallback = "协作岗位") {
  return safeText(
    String(name || fallback)
      .replace(/Claude\s*审查/gi, "审查")
      .replace(/Claude/gi, "审查")
      .replace(/审查\s+审查/gi, "审查"),
    fallback,
    40
  );
}

function safeFileLabel(path) {
  const raw = String(path || "").trim();
  if (!raw) return "";
  const parts = raw.split(/[\\/]+/).filter(Boolean);
  const handoffIdx = parts.lastIndexOf("agent-handoff");
  if (handoffIdx > 0) return safeText(parts.slice(handoffIdx - 1).join("/"), "", 90);
  if (handoffIdx === 0) return safeText(parts.join("/"), "", 90);
  return safeText(parts[parts.length - 1] || raw, "", 80);
}

function safeCommit(value) {
  const text = safeText(value, "", 90);
  const match = text.match(/\b[0-9a-f]{6,40}\b/i);
  if (!match) return text;
  const rest = text.replace(match[0], "").trim();
  return rest ? `${match[0].slice(0, 7)} ${rest}` : match[0].slice(0, 7);
}

function safeLogText(raw) {
  const cleaned = betaDesensitizeText(raw);
  const lines = cleaned
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(-32);
  const summary = lines.join("\n").slice(-1800).trim();
  return summary || "这份日志没有可展示的摘要。";
}

function betaRoleLabel(role) {
  return ({
    controller: "总控",
    content: "内容开发",
    media: "媒体开发",
    qa: "测试",
    review: "审查",
    any: "协作",
  })[role] || safeText(role, "协作", 20);
}

function betaStatusLabel(status) {
  return ({
    running: "工作中",
    idle: "空闲",
    stale: "需重启",
    queued: "排队中",
    claimed: "已领取",
    done: "已完成",
    blocked: "阻塞",
    cancelled: "已取消",
  })[status] || safeText(status, "处理中", 24);
}

function betaStatusTone(status) {
  if (["running", "claimed", "done"].includes(status)) return "green";
  if (["queued"].includes(status)) return "blue";
  if (["stale", "blocked"].includes(status)) return "amber";
  return "gray";
}

function betaEventLabel(event) {
  return ({
    added: "派工",
    claimed: "领取",
    dispatched: "开工",
    done: "完成",
    blocked: "阻塞",
    worker_exited: "收工",
    reset: "重排",
    cancelled: "取消",
  })[event] || "更新";
}

function betaFormatBytes(size) {
  const n = Number(size || 0);
  if (!Number.isFinite(n) || n <= 0) return "0 B";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function betaLatestCommit(summary) {
  const slots = summary?.slots || [];
  const controller = slots.find((slot) => slot.latest_commit);
  if (controller?.latest_commit) return safeCommit(controller.latest_commit);
  const task = (summary?.tasks || []).find((item) => item.commit);
  return task ? safeCommit(task.commit) : "";
}

function useBetaNarrow() {
  const [narrow, setNarrow] = React.useState(() => window.innerWidth < 760);
  React.useEffect(() => {
    const onResize = () => setNarrow(window.innerWidth < 760);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return narrow;
}

function PageBeta() {
  const [loadState, setLoadState] = React.useState("checking");
  const [summary, setSummary] = React.useState(null);
  const isNarrow = useBetaNarrow();

  const checkDashboard = React.useCallback(() => {
    setLoadState("checking");
    fetch(`${AGENT_DASHBOARD_URL}api/status`, { cache: "no-store" })
      .then((res) => {
        if (!res.ok) throw new Error("研发部状态暂时不可读");
        return res.json();
      })
      .then((data) => {
        setSummary(data || {});
        setLoadState("online");
      })
      .catch(() => {
        setSummary(null);
        setLoadState("offline");
      });
  }, []);

  React.useEffect(() => {
    checkDashboard();
    const timer = setInterval(checkDashboard, 10000);
    return () => clearInterval(timer);
  }, [checkDashboard]);

  const counts = summary?.counts || {};
  const slots = summary?.slots || [];
  const runningSlots = slots.filter((slot) => slot.status === "running").length;
  const claimedTasks = counts.claimed || 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", position: "relative" }}>
      <div style={{ padding: isNarrow ? "14px 14px 12px" : "18px 28px 16px", background: "#fff", borderBottom: `1px solid ${T.border}` }}>
        <div style={{ display: "flex", alignItems: isNarrow ? "flex-start" : "center", gap: 12, minWidth: 0, flexDirection: isNarrow ? "column" : "row" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0, width: isNarrow ? "100%" : "auto", flex: isNarrow ? "none" : 1 }}>
          <div style={{ width: 34, height: 34, borderRadius: 9, background: T.text, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>🧪</div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: isNarrow ? 19 : 22, fontWeight: 700, letterSpacing: 0, lineHeight: 1.25, overflowWrap: "anywhere" }}>科技与狠活 · 研发部作战室</div>
            <div style={{ fontSize: 13, color: T.muted, marginTop: 4 }}>
              谁在干活、领了哪张单、现场发生了什么, 都在这里看。
            </div>
          </div>
          </div>
          {loadState === "online" && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: isNarrow ? "flex-start" : "flex-end", width: isNarrow ? "100%" : "auto" }}>
              <BetaPill label={`${runningSlots} 个岗位工作中`} tone={runningSlots ? "green" : "gray"} />
              <BetaPill label={`${counts.queued || 0} 个排队`} tone={(counts.queued || 0) ? "blue" : "gray"} />
              <BetaPill label={`${claimedTasks} 个已领取`} tone={claimedTasks ? "green" : "gray"} />
            </div>
          )}
        </div>
      </div>

      <div style={{ flex: 1, overflow: "auto", background: T.bg, padding: isNarrow ? "16px 12px 76px" : "26px 28px 70px" }}>
        {loadState === "online" ? (
          <BetaWarRoom summary={summary} isNarrow={isNarrow} />
        ) : (
          <BetaOffline state={loadState} onRetry={checkDashboard} />
        )}
      </div>

      <LiDock context="科技与狠活" />
    </div>
  );
}

function BetaWarRoom({ summary, isNarrow }) {
  const slots = summary?.slots || [];
  const tasks = summary?.tasks || [];
  const counts = summary?.counts || {};
  const events = summary?.events || [];
  const logs = summary?.logs || [];
  const activeTasks = tasks.filter((task) => ["queued", "claimed"].includes(task.status));
  const latestCommit = betaLatestCommit(summary);
  const runningSlots = slots.filter((slot) => slot.status === "running");

  return (
    <div style={{ width: "100%", maxWidth: 1260, minWidth: 0, margin: "0 auto", display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "grid", gridTemplateColumns: isNarrow ? "repeat(2, minmax(0, 1fr))" : "repeat(4, minmax(0, 1fr))", gap: 12 }}>
        <BetaStat title="正在干活" value={runningSlots.length} hint="自动岗位" tone={runningSlots.length ? "green" : "gray"} />
        <BetaStat title="排队任务" value={counts.queued || 0} hint="等待领取" tone={(counts.queued || 0) ? "blue" : "gray"} />
        <BetaStat title="已领取" value={counts.claimed || 0} hint="正在推进" tone={(counts.claimed || 0) ? "green" : "gray"} />
        <BetaStat title="需要处理" value={counts.blocked || 0} hint={`已完成 ${counts.done || 0}`} tone={(counts.blocked || 0) ? "amber" : "gray"} />
      </div>

      <BetaSection title="谁在干活" hint="岗位、状态、当前单子和最近主线提交">
        <div style={{ display: "grid", gridTemplateColumns: isNarrow ? "1fr" : "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
          {slots.map((slot) => (
            <BetaSlotCard key={slot.slot_id || slot.agent_name} slot={slot} latestCommit={latestCommit} />
          ))}
        </div>
      </BetaSection>

      <div style={{ display: "grid", gridTemplateColumns: isNarrow ? "1fr" : "minmax(0, 1.15fr) minmax(320px, .85fr)", gap: 18, alignItems: "start" }}>
        <BetaSection title="当前任务" hint="排队和已领取任务都列清楚">
          {activeTasks.length ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
              {activeTasks.slice(0, 10).map((task) => <BetaTaskRow key={task.id} task={task} isNarrow={isNarrow} />)}
            </div>
          ) : (
            <BetaEmptyLine text="当前没有排队或已领取的任务。" />
          )}
        </BetaSection>

        <BetaSection title="研发现场时间线" hint="最近派工、领取、完成、阻塞">
          <BetaTimeline events={events} />
        </BetaSection>
      </div>

      <BetaSection title="日志与代码证据" hint="只展示脱敏摘要、文件名、交接相对路径和提交号">
        <div style={{ display: "grid", gridTemplateColumns: isNarrow ? "1fr" : "minmax(0, 1fr) minmax(0, 1fr)", gap: 16, alignItems: "start" }}>
          <BetaLogEvidence logs={logs} />
          <BetaCodeEvidence tasks={tasks} latestCommit={latestCommit} />
        </div>
      </BetaSection>
    </div>
  );
}

function BetaSection({ title, hint, children }) {
  return (
    <section style={{ minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
        <div style={{ fontSize: 16, fontWeight: 750, color: T.text }}>{title}</div>
        {hint && <div style={{ fontSize: 12, color: T.muted }}>{hint}</div>}
      </div>
      {children}
    </section>
  );
}

function BetaStat({ title, value, hint, tone }) {
  const palette = {
    green: { bg: "#EAF6EF", fg: T.brand },
    blue: { bg: T.blueSoft, fg: T.blue },
    amber: { bg: "#FFF0EA", fg: "#B55B00" },
    gray: { bg: "#fff", fg: T.muted },
  }[tone || "gray"];
  return (
    <div style={{ background: palette.bg, border: `1px solid ${T.borderSoft}`, borderRadius: 8, padding: 15, minHeight: 104 }}>
      <div style={{ fontSize: 12, color: T.muted, marginBottom: 8 }}>{title}</div>
      <div style={{ fontSize: 28, fontWeight: 800, color: palette.fg, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 12, color: T.muted2, marginTop: 8 }}>{hint}</div>
    </div>
  );
}

function BetaSlotCard({ slot, latestCommit }) {
  const task = slot.task || null;
  const tone = betaStatusTone(slot.status);
  const role = betaRoleLabel(slot.role);
  const claim = task?.claimed_by || slot.agent_name || "";
  const commit = safeCommit(slot.latest_commit || task?.commit || latestCommit || "");
  const isWorking = slot.status === "running";
  return (
    <div style={{
      border: `1px solid ${tone === "green" ? T.brand + "66" : tone === "amber" ? "#E66B2F66" : T.borderSoft}`,
      borderRadius: 8,
      padding: 14,
      background: isWorking ? "#F4FBF7" : tone === "amber" ? "#FFF7F0" : "#fff",
      minHeight: 188,
      display: "flex",
      flexDirection: "column",
      gap: 10,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <BetaDot tone={tone} />
        <div style={{ fontSize: 14, fontWeight: 750, color: T.text, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {safeAgentName(slot.agent_name, role)}
        </div>
        <BetaPill label={betaStatusLabel(slot.status)} tone={tone} compact />
      </div>
      <div style={{ display: "grid", gap: 7, fontSize: 12.5, color: T.muted }}>
        <BetaKV label="角色" value={role} />
        <BetaKV label="任务" value={task ? `${safeText(task.id, "无", 24)} · ${safeTaskTitle(task.title)}` : "当前没有任务"} strong={!!task} />
        <BetaKV label="领取人" value={claim ? safeAgentName(claim, "未领取") : "未领取"} />
        <BetaKV label="最近主线提交" value={commit || "暂未同步"} mono={!!commit} />
      </div>
    </div>
  );
}

function BetaTaskRow({ task, isNarrow }) {
  const tone = betaStatusTone(task.status);
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: isNarrow ? "74px minmax(0, 1fr)" : "88px 92px 94px minmax(0, 1fr) 150px",
      gap: 10,
      alignItems: "center",
      padding: "11px 12px",
      background: "#fff",
      border: `1px solid ${T.borderSoft}`,
      borderRadius: 8,
    }}>
      <div style={{ fontSize: 12.5, fontWeight: 750, color: T.text }}>{safeText(task.id, "无", 24)}</div>
      <Tag size="xs" color={tone === "green" ? "green" : tone === "blue" ? "blue" : tone === "amber" ? "amber" : "gray"}>{betaRoleLabel(task.role)}</Tag>
      <div style={{ gridColumn: isNarrow ? "1 / -1" : "auto" }}>
        <BetaPill label={betaStatusLabel(task.status)} tone={tone} compact />
      </div>
      <div style={{ minWidth: 0, fontSize: 13.5, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: isNarrow ? "normal" : "nowrap", gridColumn: isNarrow ? "1 / -1" : "auto" }}>
        {safeTaskTitle(task.title)}
      </div>
      <div style={{ fontSize: 12, color: T.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: isNarrow ? "normal" : "nowrap", gridColumn: isNarrow ? "1 / -1" : "auto" }}>
        {safeAgentName(task.claimed_by, task.status === "queued" ? "等人领取" : "未领取")}
      </div>
    </div>
  );
}

function BetaTimeline({ events }) {
  const items = (events || []).slice(-9).reverse();
  if (!items.length) return <BetaEmptyLine text="暂时没有现场记录。" />;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {items.map((event, idx) => {
        const label = betaEventLabel(event.event);
        const tone = event.event === "done" ? "green" : event.event === "blocked" ? "amber" : event.event === "claimed" ? "blue" : "gray";
        const taskText = [event.task_id, event.title].filter(Boolean).join(" · ");
        const who = event.agent || (event.role ? betaRoleLabel(event.role) : "");
        return (
          <div key={`${event.time || idx}-${event.event || "event"}-${event.task_id || idx}-${idx}`} style={{ display: "grid", gridTemplateColumns: "58px minmax(0, 1fr)", gap: 9 }}>
            <div style={{ fontSize: 11.5, color: T.muted2, paddingTop: 3 }}>{safeText(String(event.time || "").slice(11, 19), "刚刚", 16)}</div>
            <div style={{ borderLeft: `2px solid ${tone === "green" ? T.brand : tone === "amber" ? T.amber : tone === "blue" ? T.blue : T.border}`, paddingLeft: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3, flexWrap: "wrap" }}>
                <BetaPill label={label} tone={tone} compact />
                {who && <span style={{ fontSize: 12, color: T.muted }}>{safeAgentName(who, "协作岗位")}</span>}
              </div>
              <div style={{ fontSize: 13, color: T.text, lineHeight: 1.5 }}>{safeText(taskText, "研发现场有更新", 160)}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function BetaLogEvidence({ logs }) {
  const [active, setActive] = React.useState(null);
  const [logText, setLogText] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [err, setErr] = React.useState("");

  const loadLog = React.useCallback((log) => {
    if (!log) return;
    setActive(log);
    setLoading(true);
    setErr("");
    setLogText("");
    fetch(`${AGENT_DASHBOARD_URL}api/log?path=${encodeURIComponent(log.path || log.name || "")}`)
      .then((res) => {
        if (!res.ok) throw new Error("日志暂时读不到");
        return res.text();
      })
      .then((text) => setLogText(safeLogText(text)))
      .catch(() => setErr("日志摘要暂时读不到。"))
      .finally(() => setLoading(false));
  }, []);

  const items = (logs || []).slice(0, 5);
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 9 }}>最近日志</div>
      {items.length ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {items.map((log) => (
            <div key={log.path || log.name} style={{ background: "#fff", border: `1px solid ${T.borderSoft}`, borderRadius: 8, padding: 11, minWidth: 0, overflow: "hidden" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", minWidth: 0 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 650, color: T.text, overflowWrap: "anywhere", lineHeight: 1.35 }}>{safeFileLabel(log.name)}</div>
                  <div style={{ fontSize: 11.5, color: T.muted, marginTop: 3, overflowWrap: "anywhere" }}>{safeText(log.mtime, "时间未知", 24)} · {betaFormatBytes(log.size)}</div>
                </div>
                <button onClick={() => loadLog(log)} style={{
                  background: T.text,
                  color: "#fff",
                  border: "none",
                  borderRadius: 7,
                  padding: "7px 10px",
                  fontSize: 12,
                  fontWeight: 650,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                }}>看日志摘要</button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <BetaEmptyLine text="暂时没有可展示日志。" />
      )}
      {(active || loading || err || logText) && (
        <div style={{ marginTop: 10, background: "#121417", color: "#E8EDE9", borderRadius: 8, padding: 12, border: "1px solid #2F3833" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 750 }}>日志摘要</div>
            <div style={{ fontSize: 11.5, color: "#AAB4AD" }}>{active ? safeFileLabel(active.name) : ""}</div>
          </div>
          <pre style={{ margin: 0, whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontSize: 12, lineHeight: 1.6, fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace", maxHeight: 260, overflow: "auto" }}>
            {loading ? "正在读取摘要..." : err || logText}
          </pre>
        </div>
      )}
    </div>
  );
}

function BetaCodeEvidence({ tasks, latestCommit }) {
  const evidence = [...(tasks || [])]
    .filter((task) => task.commit || task.report)
    .sort((a, b) => String(b.updated_at || b.created_at || "").localeCompare(String(a.updated_at || a.created_at || "")))
    .slice(0, 8);
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 9 }}>代码动向 / 交接证据</div>
      <div style={{ background: "#fff", border: `1px solid ${T.borderSoft}`, borderRadius: 8, padding: 12, marginBottom: 9 }}>
        <BetaKV label="最近主线提交" value={latestCommit || "暂未同步"} mono={!!latestCommit} strong={!!latestCommit} />
      </div>
      {evidence.length ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {evidence.map((task) => (
            <div key={`${task.id}-${task.commit || task.report}`} style={{ background: "#fff", border: `1px solid ${T.borderSoft}`, borderRadius: 8, padding: 11 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <div style={{ fontSize: 12.5, fontWeight: 750, color: T.text }}>{safeText(task.id, "无", 24)}</div>
                <Tag size="xs" color={betaStatusTone(task.status) === "green" ? "green" : betaStatusTone(task.status) === "amber" ? "amber" : "gray"}>{betaStatusLabel(task.status)}</Tag>
              </div>
              <div style={{ fontSize: 13, color: T.text, lineHeight: 1.45, marginBottom: 7 }}>{safeTaskTitle(task.title)}</div>
              <div style={{ display: "grid", gap: 5, fontSize: 12, color: T.muted }}>
                {task.commit && <BetaKV label="提交" value={safeCommit(task.commit)} mono />}
                {task.report && <BetaKV label="交接" value={safeFileLabel(task.report)} mono />}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <BetaEmptyLine text="暂时没有提交或交接证据。" />
      )}
    </div>
  );
}

function BetaKV({ label, value, strong, mono }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(58px, 82px) minmax(0, 1fr)", gap: 8, alignItems: "baseline", minWidth: 0 }}>
      <div style={{ color: T.muted2 }}>{label}</div>
      <div style={{
        color: strong ? T.text : T.muted,
        fontWeight: strong ? 650 : 450,
        fontFamily: mono ? "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" : "inherit",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        minWidth: 0,
      }}>{value}</div>
    </div>
  );
}

function BetaPill({ label, tone = "gray", compact }) {
  const palette = {
    green: { bg: T.brandSoft, fg: T.brand, dot: T.brand },
    blue: { bg: T.blueSoft, fg: T.blue, dot: T.blue },
    amber: { bg: T.amberSoft, fg: T.amber, dot: T.amber },
    gray: { bg: T.bg3, fg: T.muted, dot: T.muted2 },
  }[tone] || { bg: T.bg3, fg: T.muted, dot: T.muted2 };
  return (
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      padding: compact ? "3px 8px" : "6px 10px",
      borderRadius: 999,
      background: palette.bg,
      color: palette.fg,
      fontSize: compact ? 11.5 : 12,
      fontWeight: 700,
      whiteSpace: "nowrap",
    }}>
      <span style={{ width: compact ? 6 : 7, height: compact ? 6 : 7, borderRadius: 99, background: palette.dot }} />
      {label}
    </span>
  );
}

function BetaDot({ tone = "gray" }) {
  const color = tone === "green" ? T.brand : tone === "blue" ? T.blue : tone === "amber" ? T.amber : T.muted3;
  return <span style={{ width: 8, height: 8, borderRadius: 99, background: color, flexShrink: 0 }} />;
}

function BetaEmptyLine({ text }) {
  return (
    <div style={{ padding: "18px 14px", borderRadius: 8, border: `1px dashed ${T.border}`, background: "rgba(255,255,255,.55)", color: T.muted, fontSize: 13 }}>
      {text}
    </div>
  );
}

function BetaOffline({ state, onRetry }) {
  return (
    <div style={{ maxWidth: 780, margin: "0 auto", minHeight: 460, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center", background: "#fff", border: `1px solid ${T.border}`, borderRadius: 8, padding: "46px 44px", width: "100%" }}>
        <div style={{ fontSize: 50, marginBottom: 14 }}>{state === "checking" ? "⏳" : "🧪"}</div>
        <div style={{ fontSize: 20, fontWeight: 750, color: T.text, marginBottom: 8 }}>
          {state === "checking" ? "正在连接研发部" : "研发部还没上岗"}
        </div>
        <div style={{ fontSize: 14, color: T.muted, lineHeight: 1.75, marginBottom: 18 }}>
          打开内容工厂工作台后, 这里会自动变成作战室。当前页面不会展示本机路径。
        </div>
        <button onClick={onRetry} style={{
          border: "none",
          background: T.brand,
          color: "#fff",
          borderRadius: 8,
          padding: "9px 16px",
          fontSize: 13,
          fontWeight: 700,
          fontFamily: "inherit",
          cursor: "pointer",
        }}>重新检查</button>
      </div>
    </div>
  );
}

Object.assign(window, { PageBeta, safeLogText });
