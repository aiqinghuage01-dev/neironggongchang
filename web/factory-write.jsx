// factory-write.jsx — D-066 写文案二级页 (整合 6 个文字 skill 入口)
// 顶部 stats 4 卡 + 6 张工具卡 + 最近文字列表

const WRITE_TOOLS = [
  { page: "ad",            icon: "💰", label: "投流文案", desc: "一句卖点 → 5 版投流文案 · 自动 6 维质检", steps: 2, route_prefix: "touliu" },
  { page: "hotrewrite",    icon: "🔥", label: "热点改写", desc: "热点拆 3 个角度 · 抢流量爆款公式 · 出口播文案", steps: 3, route_prefix: "hotrewrite" },
  { page: "voicerewrite",  icon: "🎙️", label: "录音改写", desc: "录音 / 转写 → 改成口播脚本 · 保留你的语气和例子", steps: 3, route_prefix: "voicerewrite" },
  { page: "baokuan",       icon: "✍️", label: "爆款改写", desc: "别人的爆款 → 你的风格 · 4 版输出: 模仿/反差/数字/故事", steps: 2, route_prefix: "baokuan" },
  { page: "planner",       icon: "🗓️", label: "内容策划", desc: "活动前先策划 · 三档目标 + 6 模块 · 完整内容计划", steps: 3, route_prefix: "planner" },
  { page: "compliance",    icon: "🛡️", label: "违规审查", desc: "文案过审 · 高/中/低危分级 · 必出 2 版改写(保守 + 营销)", steps: 1, route_prefix: "compliance" },
];

const WRITE_TASK_RULES = [
  { match: (t) => taskKind(t).startsWith("touliu."), page: "ad", ns: "touliu", wf: "touliu", icon: "💰", label: "投流文案", step: "result" },
  { match: (t) => taskKind(t).startsWith("hotrewrite."), page: "hotrewrite", ns: "hotrewrite", wf: "hotrewrite", icon: "🔥", label: "热点改写", step: "write" },
  { match: (t) => taskKind(t).startsWith("voicerewrite."), page: "voicerewrite", ns: "voicerewrite", wf: "voicerewrite", icon: "🎙️", label: "录音改写", step: "write" },
  { match: (t) => taskKind(t).startsWith("baokuan."), page: "baokuan", ns: "baokuan", wf: "baokuan", icon: "✍️", label: "爆款改写", step: "result" },
  { match: (t) => taskKind(t).startsWith("planner."), page: "planner", ns: "planner", wf: "planner", icon: "🗓️", label: "内容策划", step: "plan" },
  { match: (t) => taskKind(t).startsWith("compliance."), page: "compliance", ns: "compliance", wf: "compliance", icon: "🛡️", label: "违规审查", step: "result" },
  { match: (t) => taskKind(t).startsWith("wechat.write"), page: "wechat", ns: "wechat:write", wf: "wechat", icon: "📄", label: "公众号长文", step: "write", taskField: "writeTaskId" },
];

function PageWrite({ onNav }) {
  const [sources, setSources] = React.useState({ by_type: {}, by_source: {}, total: 0 });
  const [recent, setRecent] = React.useState([]);
  const [usage, setUsage] = React.useState(null);
  const [tasks, setTasks] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const narrow = useWriteNarrow();

  async function load() {
    setLoading(true);
    try {
      const [s, r, u] = await Promise.all([
        api.get("/api/works/sources"),
        api.get("/api/works?type=text&since=today&limit=4"),
        api.get("/api/ai/usage?range=today").catch(() => null),
      ]);
      setSources(s || {});
      setRecent(r || []);
      setUsage(u);
    } catch (e) { console.warn("[write] load failed", e); }
    setLoading(false);
  }
  React.useEffect(() => { load(); }, []);
  React.useEffect(() => {
    let stop = false;
    let timer = null;
    async function pullTasks() {
      timer = null;
      try {
        const r = await api.get("/api/tasks?limit=80");
        const nextTasks = Array.isArray(r?.tasks) ? r.tasks : [];
        if (!stop) setTasks(nextTasks);
        if (!stop) {
          const hasRunning = nextTasks.some(t => t.status === "running" || t.status === "pending");
          timer = setTimeout(pullTasks, hasRunning ? 3000 : 30000);
        }
      } catch (_) {}
      if (!stop && !timer) timer = setTimeout(pullTasks, 30000);
    }
    pullTasks();
    return () => { stop = true; if (timer) clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 计算今日各工具调用次数
  const todayCounts = {};
  if (usage && usage.by_route) {
    for (const r of usage.by_route) {
      const k = (r.route_key || "").split(".")[0];
      todayCounts[k] = (todayCounts[k] || 0) + r.calls;
    }
  }

  // type=text 的 source_skill 累计
  const writeSkills = ["baokuan", "hotrewrite", "voicerewrite", "touliu", "wechat", "planner", "moments", "compliance"];
  const totalText = writeSkills.reduce((s, k) => s + (sources.by_source?.[k] || 0), 0);
  const todayText = recent.length;
  const todayTokens = usage?.overall?.total_tokens || 0;
  const todayCost = usage?.overall?.cost_cny || 0;

  // 最热门工具
  const hottest = Object.entries(todayCounts).sort((a,b) => b[1] - a[1])[0];
  const hottestTool = hottest ? WRITE_TOOLS.find(t => t.route_prefix === hottest[0]) : null;
  const activeWritingTasks = getActiveWritingTasks(tasks);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", position: "relative" }}>
      <div style={{ padding: narrow ? "18px 18px 14px" : "22px 32px 18px", background: "#fff", borderBottom: `1px solid ${T.border}` }}>
        <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: -0.2 }}>✏️ 写文案</div>
        <div style={{ fontSize: 13, color: T.muted, marginTop: 6 }}>让小华帮你产出文案 · 6 个工具按场景分</div>
      </div>

      <div style={{ flex: 1, overflow: "auto", padding: narrow ? "16px 14px 56px" : "20px 32px 60px", background: T.bg }}>
        <div style={{ maxWidth: 1240, margin: "0 auto" }}>

          {/* === 顶部 4 个 stats 卡 === */}
          <div style={{ display: "grid", gridTemplateColumns: narrow ? "1fr" : "repeat(4, 1fr)", gap: 12, marginBottom: activeWritingTasks.length ? 18 : 24 }}>
            <StatBlock label="📝 今日产出" value={todayText} sub={`条文案 · 来自 6 个写作工具`} />
            <StatBlock label="🔥 今日热门" value={hottestTool ? hottestTool.label : "—"} sub={hottest ? `用了 ${hottest[1]} 次` : "今天还没用过"} small />
            <StatBlock label="⚡ 今日用量" value={Math.round(todayTokens * 0.7 / 1000) + "K字"} sub={`今日 · 约 ¥${todayCost.toFixed(2)}`} />
            <StatBlock label="📂 累计作品" value={totalText} sub="去作品库看全部 →" sublink={() => onNav("works")} />
          </div>

          {activeWritingTasks.length > 0 && (
            <WritingTaskSummary
              tasks={activeWritingTasks}
              onResume={(task) => resumeWritingTask(task, onNav)}
              narrow={narrow}
            />
          )}

          {/* === 6 张工具卡 === */}
          <div style={{ fontSize: 13, fontWeight: 600, color: T.muted, letterSpacing: "0.06em", marginBottom: 14 }}>选个工具开始</div>
          <div style={{ display: "grid", gridTemplateColumns: narrow ? "1fr" : "repeat(3, 1fr)", gap: 14 }}>
            {WRITE_TOOLS.map(tool => (
              <ToolCard key={tool.page} tool={tool} count={todayCounts[tool.route_prefix] || 0} onClick={() => onNav(tool.page)} />
            ))}
          </div>

          {/* === 最近写过的文案 === */}
          {recent.length > 0 && (
            <>
              <div style={{ fontSize: 13, fontWeight: 600, color: T.muted, letterSpacing: "0.06em", margin: "32px 0 14px", display: "flex", alignItems: "center" }}>
                <span>最近写过的文案</span>
                <span style={{ fontSize: 11.5, color: T.muted2, fontWeight: 400, marginLeft: 8 }}>· 今天 {recent.length} 条</span>
                <div style={{ flex: 1 }} />
                <span onClick={() => onNav("works")} style={{ fontSize: 12, color: T.brand, cursor: "pointer", fontWeight: 500 }}>看全部 →</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: narrow ? "1fr" : "repeat(2, 1fr)", gap: 12 }}>
                {recent.map(w => <RecentTextCard key={w.id} w={w} onClick={() => onNav("works")} />)}
              </div>
            </>
          )}

          {recent.length === 0 && !loading && (
            <div style={{ marginTop: 32, padding: 30, textAlign: "center", color: T.muted2, background: "#fff", border: `1px solid ${T.borderSoft}`, borderRadius: 12 }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>📝</div>
              <div style={{ fontSize: 13.5, color: T.muted }}>今天还没写过文案 · 点上面任一个工具开始</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function useWriteNarrow() {
  const [narrow, setNarrow] = React.useState(() => typeof window !== "undefined" && window.innerWidth < 760);
  React.useEffect(() => {
    const onResize = () => setNarrow(window.innerWidth < 760);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return narrow;
}

function taskKind(task) {
  return String(task?.kind || "");
}

function getWriteTaskRule(task) {
  return WRITE_TASK_RULES.find(rule => rule.match(task)) || null;
}

function getActiveWritingTasks(allTasks) {
  const now = Math.floor(Date.now() / 1000);
  return (Array.isArray(allTasks) ? allTasks : [])
    .filter((task) => {
      if (!getWriteTaskRule(task)) return false;
      if (task.status === "running" || task.status === "pending") return true;
      if (task.status !== "failed") return false;
      const ts = task.finished_ts || task.updated_ts || 0;
      return !ts || now - ts < 3 * 24 * 3600;
    })
    .sort((a, b) => {
      const ar = (a.status === "running" || a.status === "pending") ? 0 : 1;
      const br = (b.status === "running" || b.status === "pending") ? 0 : 1;
      if (ar !== br) return ar - br;
      return (b.updated_ts || b.finished_ts || 0) - (a.updated_ts || a.finished_ts || 0);
    })
    .slice(0, 4);
}

function latestTimelineItem(task, preferredStatus) {
  const timeline = Array.isArray(task?.progress_data?.timeline) ? task.progress_data.timeline : [];
  if (!timeline.length) return null;
  const reversed = [...timeline].reverse();
  if (preferredStatus) {
    const hit = reversed.find(item => item?.status === preferredStatus);
    if (hit) return hit;
  }
  return reversed.find(item => item?.text || item?.label) || null;
}

function safeTaskText(raw, fallback) {
  const text = String(raw || "").replace(/\s+/g, " ").trim();
  if (!text) return fallback;
  if (/(prompt|tokens?|route|model|provider|submit_id|api|\/Users|\/private|OpenClaw|DeepSeek|Opus|LLM)/i.test(text)) {
    return fallback;
  }
  return text.length > 42 ? text.slice(0, 42) + "…" : text;
}

function taskStageText(task) {
  const failed = task.status === "failed";
  const running = task.status === "running" || task.status === "pending";
  const item = failed ? latestTimelineItem(task, "failed") : latestTimelineItem(task, "running");
  const raw = item?.label || item?.text || task.progress_text;
  if (failed) return safeTaskText(raw, "上次停在这一步");
  if (running) return safeTaskText(raw, "正在处理中");
  return safeTaskText(raw, "可以继续查看");
}

function taskElapsedLabel(task) {
  const elapsed = task?.elapsed_sec || 0;
  if (task?.status === "failed") return `上次等了 ${fmtSec(elapsed)}`;
  return `已等 ${fmtSec(elapsed)}`;
}

function resumeSnapshotForTask(task, rule) {
  const snap = { step: rule.step };
  if (rule.taskField) snap[rule.taskField] = task.id;
  else snap.taskId = task.id;
  if (rule.wf === "hotrewrite") snap.versions = [];
  if (rule.wf === "baokuan") snap.versions = [];
  if (rule.wf === "voicerewrite") snap.versions = [];
  return snap;
}

function resumeWritingTask(task, onNav) {
  const rule = getWriteTaskRule(task);
  if (!rule) return;
  try {
    localStorage.setItem(`task:${rule.ns}`, task.id);
    if (rule.wf) localStorage.setItem(`wf:${rule.wf}`, JSON.stringify(resumeSnapshotForTask(task, rule)));
  } catch (_) {}
  onNav(rule.page);
}

function WritingTaskSummary({ tasks, onResume, narrow }) {
  const running = tasks.filter(t => t.status === "running" || t.status === "pending").length;
  const failed = tasks.filter(t => t.status === "failed").length;
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{
        display: "flex", alignItems: narrow ? "flex-start" : "center", gap: 10,
        flexDirection: narrow ? "column" : "row", marginBottom: 12,
      }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>正在写 / 可继续</div>
        <div style={{ fontSize: 12, color: T.muted2, lineHeight: 1.5 }}>
          {running ? `${running} 个还在跑` : "没有正在跑的"}{failed ? ` · ${failed} 个最近没跑完` : ""}
        </div>
      </div>
      <div style={{
        display: "grid",
        gridTemplateColumns: narrow ? "1fr" : "repeat(2, minmax(0, 1fr))",
        gap: 12,
      }}>
        {tasks.map(task => <WritingTaskCard key={task.id} task={task} onResume={onResume} />)}
      </div>
    </div>
  );
}

function WritingTaskCard({ task, onResume }) {
  const rule = getWriteTaskRule(task) || {};
  const failed = task.status === "failed";
  const badge = failed ? "最近失败" : "进行中";
  const badgeColor = failed ? T.red : T.brand;
  const badgeBg = failed ? T.redSoft : T.brandSoft;
  const pct = typeof task.progress_pct === "number" ? Math.max(0, Math.min(100, task.progress_pct)) : null;
  return (
    <div style={{
      background: "#fff",
      border: `1px solid ${failed ? T.red + "44" : T.brand + "44"}`,
      borderRadius: 12,
      padding: 14,
      minWidth: 0,
      boxShadow: failed ? "0 4px 14px rgba(180, 48, 48, .06)" : "0 4px 14px rgba(34, 145, 106, .06)",
    }} data-testid={`write-task-${rule.page || "unknown"}`}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
        <span style={{ fontSize: 22, lineHeight: 1 }}>{rule.icon || "✏️"}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: T.text }}>{rule.label || "写文案"}</span>
            <span style={{ fontSize: 11, color: badgeColor, background: badgeBg, borderRadius: 999, padding: "2px 8px", fontWeight: 700 }}>
              {badge}
            </span>
          </div>
          <div style={{ fontSize: 12, color: T.muted, marginTop: 5, lineHeight: 1.45 }}>
            {taskStageText(task)} · {taskElapsedLabel(task)}
          </div>
        </div>
      </div>
      {pct !== null && !failed && (
        <div style={{ marginTop: 12, height: 5, background: T.bg3, borderRadius: 999, overflow: "hidden" }}>
          <div style={{ width: `${pct}%`, height: "100%", background: T.brand, borderRadius: 999 }} />
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
        <button
          onClick={() => onResume(task)}
          data-testid={`write-task-open-${rule.page || "unknown"}`}
          style={{
            background: failed ? "#fff" : T.brand,
            color: failed ? T.brand : "#fff",
            border: `1px solid ${failed ? T.brand : T.brand}`,
            borderRadius: 9,
            padding: "7px 12px",
            fontSize: 12.5,
            fontWeight: 700,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          {failed ? "回去处理" : "继续看进度"}
        </button>
      </div>
    </div>
  );
}

function StatBlock({ label, value, sub, small, sublink }) {
  return (
    <div style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 12, padding: "14px 16px" }}>
      <div style={{ fontSize: 11.5, color: T.muted, marginBottom: 6 }}>{label}</div>
      <div style={{
        fontSize: small ? 16 : 22, fontWeight: 700,
        fontFamily: small ? "inherit" : "ui-monospace, 'SF Mono', monospace",
        color: T.text, lineHeight: 1.2,
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>{value}</div>
      <div onClick={sublink}
        style={{ fontSize: 11, color: sublink ? T.brand : T.muted2, marginTop: 4, cursor: sublink ? "pointer" : "default", fontWeight: sublink ? 500 : 400 }}>
        {sub}
      </div>
    </div>
  );
}

function ToolCard({ tool, count, onClick }) {
  const [hover, setHover] = React.useState(false);
  return (
    <div onClick={onClick}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        background: "#fff",
        border: `1px solid ${hover ? T.brand : T.border}`,
        borderRadius: 14, padding: "18px 20px",
        cursor: "pointer", transition: "all .12s",
        boxShadow: hover ? "0 4px 16px rgba(0,0,0,0.06)" : "none",
        display: "flex", flexDirection: "column",
      }}>
      <div style={{ fontSize: 32, marginBottom: 10 }}>{tool.icon}</div>
      <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>{tool.label}</div>
      <div style={{ fontSize: 12.5, color: T.muted, lineHeight: 1.55, flex: 1, marginBottom: 14 }}>{tool.desc}</div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 11, color: T.muted2,
        borderTop: `1px solid ${T.borderSoft}`, paddingTop: 10 }}>
        <span style={{ padding: "2px 8px", borderRadius: 100, background: T.bg3, color: T.muted }}>
          {tool.steps === 1 ? "单步" : `${tool.steps} 步流程`}
        </span>
        <span>· 今日 {count} 次</span>
      </div>
    </div>
  );
}

function RecentTextCard({ w, onClick }) {
  const sourceLabels = {
    "baokuan": "💥 爆款改写", "hotrewrite": "🔥 热点改写", "voicerewrite": "🎙️ 录音改写",
    "touliu": "💰 投流文案", "wechat": "📄 公众号", "planner": "🗓️ 内容策划",
    "compliance": "🛡️ 违规审查", "moments": "🌟 朋友圈",
  };
  const tagColors = { "baokuan": T.amberSoft, "touliu": T.pinkSoft, "wechat": T.purpleSoft,
    "hotrewrite": T.amberSoft, "voicerewrite": T.blueSoft, "planner": T.brandSoft,
    "compliance": T.redSoft, "moments": T.brandSoft };
  const tagFgs = { "baokuan": T.amber, "touliu": T.pink, "wechat": T.purple,
    "hotrewrite": T.amber, "voicerewrite": T.blue, "planner": T.brand,
    "compliance": T.red, "moments": T.brand };
  const skill = w.source_skill || "";
  const lbl = sourceLabels[skill] || skill;
  const bg = tagColors[skill] || T.bg3;
  const fg = tagFgs[skill] || T.muted;
  const wordCount = (w.final_text || "").length;
  const ts = new Date(w.created_at * 1000);
  const time = `${String(ts.getHours()).padStart(2,"0")}:${String(ts.getMinutes()).padStart(2,"0")}`;

  return (
    <div onClick={onClick} style={{
      background: "#fff", border: `1px solid ${T.borderSoft}`, borderRadius: 12, padding: 16,
      cursor: "pointer", transition: "transform .12s, box-shadow .12s",
    }}
    onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 4px 16px rgba(0,0,0,0.06)"; }}
    onMouseLeave={e => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = ""; }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{ padding: "3px 10px", borderRadius: 100, background: bg, color: fg, fontSize: 11.5, fontWeight: 500 }}>{lbl}</span>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: T.muted2 }}>今天 {time}</span>
      </div>
      {w.title && <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, lineHeight: 1.4,
        display: "-webkit-box", WebkitLineClamp: 1, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{w.title}</div>}
      <div style={{ fontSize: 12.5, color: T.text2, lineHeight: 1.65, background: T.bg2,
        padding: "10px 12px", borderRadius: 6, borderLeft: `3px solid ${T.border}`,
        display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
        {w.final_text || "(空内容)"}
      </div>
      <div style={{ marginTop: 10, fontSize: 11, color: T.muted, display: "flex", justifyContent: "space-between" }}>
        <span>{wordCount} 字</span>
        <span style={{ color: T.brand, fontWeight: 500 }}>看全文 →</span>
      </div>
    </div>
  );
}

Object.assign(window, { PageWrite });
