// factory-night-v2.jsx — 🌙 小华夜班总控页 (D-040d)
// 用户可见命名: 小华夜班 / 任务 / 上次跑了…
// 后端: 7 个 /api/night/* (D-040b) + 调度器 (D-040c)

const NIGHT_TRIGGER_TYPES = [
  { id: "cron",       label: "定时", desc: "按 cron 表达式定时跑 (默认 23:00)" },
  { id: "file_watch", label: "监听目录", desc: "目录里出现新文件就触发 · D-040f 接 watchdog" },
  { id: "manual",     label: "只手动", desc: "不自动跑, 用户从这里点立即跑" },
];
const NIGHT_OUTPUT_TARGETS = [
  { id: "materials", label: "📥 素材库" },
  { id: "works",     label: "🗂️ 作品库" },
  { id: "knowledge", label: "📚 知识库" },
  { id: "home",      label: "🏠 总部播报" },
];
const CRON_PRESETS = [
  { label: "每晚 23:00", expr: "0 23 * * *" },
  { label: "凌晨 2 点",  expr: "0 2 * * *" },
  { label: "每早 6:00",  expr: "0 6 * * *" },
  { label: "每 30 分钟", expr: "*/30 * * * *" },
];

// 把 cron 表达式翻成人话 (粗糙能用即可)
function humanizeCron(expr) {
  if (!expr) return "(未设置)";
  const m = String(expr).match(/^(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)$/);
  if (!m) return expr;
  const [_, mi, h, dom, mon, dow] = m;
  if (dom === "*" && mon === "*" && dow === "*" && /^\d+$/.test(mi) && /^\d+$/.test(h)) {
    return `每天 ${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}`;
  }
  if (mi.startsWith("*/")) return `每 ${mi.slice(2)} 分钟`;
  return expr;
}

function fmtTs(ts) {
  if (!ts) return "—";
  const d = new Date(ts * 1000);
  return `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function PageNightShift({ onNav }) {
  const [jobs, setJobs] = React.useState([]);
  const [runs, setRuns] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState("");
  const [editing, setEditing] = React.useState(null);  // null | {} | {id, ...}
  const [scheduler, setScheduler] = React.useState(null);

  async function refresh() {
    try {
      const [j, r, s] = await Promise.all([
        api.get("/api/night/jobs"),
        api.get("/api/night/runs?limit=30"),
        api.get("/api/night/scheduler").catch(() => ({ running: false, scheduled: [] })),
      ]);
      setJobs(j.jobs || []);
      setRuns(r.runs || []);
      setScheduler(s);
      setErr("");
    } catch (e) {
      setErr(e.message || "加载失败");
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    refresh();
    const t = setInterval(refresh, 4000);  // 4s 自动刷, 看到立即跑的最新进度
    return () => clearInterval(t);
  }, []);

  async function toggleEnabled(job) {
    try {
      await api.patch(`/api/night/jobs/${job.id}`, { enabled: !job.enabled });
      refresh();
    } catch (e) { setErr(e.message); }
  }

  async function runNow(job) {
    try {
      await api.post(`/api/night/jobs/${job.id}/run`, {});
      setTimeout(refresh, 300);
    } catch (e) { setErr(e.message); }
  }

  async function delJob(job) {
    if (!confirm(`确认删任务「${job.name}」?\n关联的运行历史也会一起清掉.`)) return;
    try {
      await api.del(`/api/night/jobs/${job.id}`);
      refresh();
    } catch (e) { setErr(e.message); }
  }

  const enabledCronJobs = jobs.filter(j => j.enabled && j.trigger_type === "cron");

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", background: T.bg, position: "relative", overflow: "hidden" }}>
      {/* 顶栏 */}
      <div style={{ padding: "12px 24px", background: "#fff", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 14, flexShrink: 0 }}>
        <div style={{ width: 26, height: 26, borderRadius: 7, background: T.text, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13 }}>🌙</div>
        <div style={{ fontSize: 13.5, fontWeight: 600 }}>小华夜班</div>
        <div style={{ fontSize: 11.5, color: T.muted, marginLeft: 4 }}>
          清华哥睡觉的时候,小华帮你跑预设任务,早上打开总部就能看到一批可消费的产出
        </div>
        <div style={{ flex: 1 }} />
        {scheduler && (
          <span title={scheduler.running ? "调度器运行中" : "调度器未启动"}
            style={{ fontSize: 10.5, color: scheduler.running ? T.brand : T.muted2,
              background: scheduler.running ? T.brandSoft : T.bg2, padding: "2px 8px", borderRadius: 100 }}>
            {scheduler.running ? "● 调度运行中" : "○ 未启动"}
          </span>
        )}
        <ApiStatusLight />
      </div>

      <div style={{ flex: 1, overflow: "auto", padding: "24px 32px 80px" }}>
        <div style={{ maxWidth: 980, margin: "0 auto" }}>
          {/* 状态条 */}
          <div style={{ padding: "16px 20px", background: "#fff", borderRadius: 12, border: `1px solid ${T.borderSoft}`, marginBottom: 18, display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ fontSize: 26 }}>🌙</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: T.text }}>
                {enabledCronJobs.length > 0
                  ? `今晚自动跑 ${enabledCronJobs.length} 条任务`
                  : "还没启用任何定时任务"}
              </div>
              <div style={{ fontSize: 11.5, color: T.muted, marginTop: 4 }}>
                {jobs.length} 条任务总计 ·
                {jobs.filter(j => j.enabled).length} 启用 ·
                {runs.filter(r => r.status === "success").length} 次成功 ·
                {runs.filter(r => r.status === "failed").length} 次失败
              </div>
            </div>
            <Btn variant="primary" onClick={() => setEditing({})}>+ 加一条任务</Btn>
          </div>

          {err && (
            <div style={{ padding: 12, background: T.redSoft, color: T.red, borderRadius: 10, fontSize: 13, marginBottom: 14 }}>
              ⚠️ {err}
            </div>
          )}

          {/* 任务列表 */}
          {loading ? (
            <div style={{ padding: 40, textAlign: "center", color: T.muted2 }}>加载中…</div>
          ) : jobs.length === 0 ? (
            <div style={{ padding: 60, background: "#fff", border: `1px dashed ${T.border}`, borderRadius: 12, textAlign: "center" }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>🌙</div>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>还没有任务</div>
              <div style={{ fontSize: 12, color: T.muted, marginBottom: 18 }}>
                加一条试试 · 例: 23:00 抓对标账号热点 / 02:00 整理知识库 / 06:00 复盘昨日数据
              </div>
              <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
                <Btn variant="primary" onClick={async () => {
                  try {
                    const r = await api.post("/api/night/seed-defaults", {});
                    refresh();
                    if (r.created.length === 0 && r.skipped.length > 0) {
                      setErr("4 条预设已存在 · 没新加");
                    }
                  } catch (e) { setErr(e.message); }
                }}>📋 加 4 条预设任务</Btn>
                <Btn variant="outline" onClick={() => setEditing({})}>+ 自己加一条</Btn>
              </div>
              <div style={{ fontSize: 10.5, color: T.muted2, marginTop: 14 }}>
                4 条预设默认禁用 · 点开关启用后才会按 cron 跑
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {jobs.map(job => (
                <NightJobCard key={job.id} job={job} runs={runs.filter(r => r.job_id === job.id)}
                  onToggle={() => toggleEnabled(job)}
                  onRun={() => runNow(job)}
                  onEdit={() => setEditing(job)}
                  onDelete={() => delJob(job)} />
              ))}
            </div>
          )}

          {/* 历史日志 */}
          {runs.length > 0 && (
            <div style={{ marginTop: 28 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: T.text, marginBottom: 10 }}>
                📜 最近 {runs.length} 次跑了
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {runs.map(run => {
                  const job = jobs.find(j => j.id === run.job_id);
                  return (
                    <div key={run.id} style={{ padding: "10px 14px", background: "#fff", border: `1px solid ${T.borderSoft}`, borderRadius: 8, display: "flex", alignItems: "center", gap: 10, fontSize: 12 }}>
                      <span style={{ fontSize: 14 }}>{job?.icon || "🌙"}</span>
                      <span style={{ fontWeight: 600, color: T.text, minWidth: 90 }}>{job?.name || `#${run.job_id}`}</span>
                      <span style={{ color: T.muted2, fontFamily: "SF Mono, monospace", fontSize: 11 }}>{fmtTs(run.started_at)}</span>
                      <span style={{ flex: 1, color: T.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {run.output_summary || (run.status === "running" ? "跑中…" : "—")}
                      </span>
                      {run.elapsed_sec ? <span style={{ color: T.muted2, fontFamily: "SF Mono, monospace", fontSize: 11 }}>{run.elapsed_sec}s</span> : null}
                      <Tag size="xs" color={run.status === "success" ? "green" : run.status === "failed" ? "red" : "amber"}>
                        {run.status === "success" ? "成功" : run.status === "failed" ? "失败" : "跑中"}
                      </Tag>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {editing && <NightJobEditor job={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); refresh(); }} />}
    </div>
  );
}

function NightJobCard({ job, runs, onToggle, onRun, onEdit, onDelete }) {
  const latest = runs[0];
  const trigger = NIGHT_TRIGGER_TYPES.find(t => t.id === job.trigger_type);
  const target = NIGHT_OUTPUT_TARGETS.find(t => t.id === job.output_target);
  const triggerLabel = job.trigger_type === "cron"
    ? humanizeCron(job.trigger_config?.cron)
    : job.trigger_type === "file_watch"
      ? `监听 ${job.trigger_config?.path || "(未设)"}`
      : "只手动";

  return (
    <div style={{ padding: 16, background: "#fff", border: `1px solid ${T.borderSoft}`, borderRadius: 12, display: "flex", alignItems: "center", gap: 14, opacity: job.enabled ? 1 : 0.55, transition: "opacity 0.15s" }}>
      <div style={{ fontSize: 28, width: 36, textAlign: "center", flexShrink: 0 }}>{job.icon || "🌙"}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: T.text }}>{job.name}</div>
          {job.skill_slug && <Tag size="xs" color="blue">{job.skill_slug}</Tag>}
          {target && <span style={{ fontSize: 11, color: T.muted2 }}>→ {target.label}</span>}
        </div>
        <div style={{ fontSize: 11.5, color: T.muted, display: "flex", gap: 12 }}>
          <span>⏰ {triggerLabel}</span>
          {latest && (
            <span title={`run #${latest.id}`}>
              上次跑了 {fmtTs(latest.started_at)} ·
              {latest.status === "success" && <span style={{ color: T.brand, marginLeft: 4 }}>✓ {latest.output_summary || "成功"}</span>}
              {latest.status === "failed" && <span style={{ color: T.red, marginLeft: 4 }}>✗ 失败</span>}
              {latest.status === "running" && <span style={{ color: T.amber, marginLeft: 4 }}>⏳ 跑中</span>}
            </span>
          )}
        </div>
      </div>
      <button
        onClick={onToggle}
        title={job.enabled ? "点击禁用" : "点击启用"}
        style={{
          width: 36, height: 20, borderRadius: 100, border: "none",
          background: job.enabled ? T.brand : T.bg3, position: "relative",
          cursor: "pointer", transition: "background 0.15s",
        }}>
        <span style={{
          position: "absolute", top: 2, left: job.enabled ? 18 : 2,
          width: 16, height: 16, borderRadius: "50%", background: "#fff",
          transition: "left 0.15s",
        }} />
      </button>
      <Btn size="sm" onClick={onRun}>立即跑</Btn>
      <Btn size="sm" variant="outline" onClick={onEdit}>编辑</Btn>
      <button onClick={onDelete} title="删除"
        style={{ background: "transparent", border: "none", cursor: "pointer", color: T.muted2, fontSize: 14, padding: "4px 6px" }}>×</button>
    </div>
  );
}

function NightJobEditor({ job, onClose, onSaved }) {
  const isNew = !job.id;
  const [form, setForm] = React.useState(() => ({
    name: job.name || "",
    icon: job.icon || "🌙",
    skill_slug: job.skill_slug || "",
    trigger_type: job.trigger_type || "cron",
    cron: (job.trigger_config && job.trigger_config.cron) || "0 23 * * *",
    watch_path: (job.trigger_config && job.trigger_config.path) || "data/inbox/audio/",
    output_target: job.output_target || "materials",
    enabled: job.enabled !== false,
  }));
  const [saving, setSaving] = React.useState(false);
  const [err, setErr] = React.useState("");

  function up(k, v) { setForm(prev => ({ ...prev, [k]: v })); }

  async function save() {
    if (!form.name.trim()) { setErr("名字不能空"); return; }
    setSaving(true);
    setErr("");
    const trigger_config = form.trigger_type === "cron"
      ? { cron: form.cron, timezone: "Asia/Shanghai" }
      : form.trigger_type === "file_watch"
        ? { path: form.watch_path }
        : {};
    const body = {
      name: form.name.trim(),
      icon: form.icon || null,
      skill_slug: form.skill_slug.trim() || null,
      trigger_type: form.trigger_type,
      trigger_config,
      output_target: form.output_target || null,
      enabled: form.enabled,
    };
    try {
      if (isNew) {
        await api.post("/api/night/jobs", body);
      } else {
        await api.patch(`/api/night/jobs/${job.id}`, body);
      }
      onSaved();
    } catch (e) {
      setErr(e.message || "保存失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 200,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 520, maxWidth: "100%", maxHeight: "90vh", overflow: "auto",
        background: "#fff", borderRadius: 14, padding: 24,
      }}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 14 }}>
          {isNew ? "🌙 加一条夜班任务" : `编辑「${job.name}」`}
        </div>

        <Field label="名字 (用户可见)">
          <input value={form.name} onChange={e => up("name", e.target.value)} placeholder="例: 凌晨抓热点" style={inp} />
        </Field>

        <div style={{ display: "flex", gap: 10 }}>
          <Field label="图标" style={{ width: 100 }}>
            <input value={form.icon} onChange={e => up("icon", e.target.value)} placeholder="🌙" style={inp} />
          </Field>
          <Field label="对应 skill (~/Desktop/skills/<slug>/)" style={{ flex: 1 }}>
            <input value={form.skill_slug} onChange={e => up("skill_slug", e.target.value)}
              placeholder="例: content-planner · 留空走占位 runner" style={inp} />
          </Field>
        </div>

        <Field label="触发方式">
          <div style={{ display: "flex", gap: 8 }}>
            {NIGHT_TRIGGER_TYPES.map(t => (
              <button key={t.id} onClick={() => up("trigger_type", t.id)}
                title={t.desc}
                style={{
                  flex: 1, padding: "8px 10px", borderRadius: 8, fontSize: 12, fontFamily: "inherit", cursor: "pointer",
                  border: form.trigger_type === t.id ? `2px solid ${T.brand}` : `1px solid ${T.border}`,
                  background: form.trigger_type === t.id ? T.brandSoft : "#fff",
                  color: form.trigger_type === t.id ? T.brand : T.text,
                  fontWeight: form.trigger_type === t.id ? 600 : 500,
                }}>
                {t.label}
              </button>
            ))}
          </div>
        </Field>

        {form.trigger_type === "cron" && (
          <Field label={`Cron 表达式 · ${humanizeCron(form.cron)}`}>
            <input value={form.cron} onChange={e => up("cron", e.target.value)}
              placeholder="0 23 * * *" style={{ ...inp, fontFamily: "SF Mono, monospace" }} />
            <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
              {CRON_PRESETS.map(p => (
                <button key={p.expr} onClick={() => up("cron", p.expr)}
                  style={{ padding: "3px 8px", fontSize: 10.5, borderRadius: 100, background: T.bg2, border: `1px solid ${T.borderSoft}`, color: T.muted, cursor: "pointer", fontFamily: "inherit" }}>
                  {p.label}
                </button>
              ))}
            </div>
          </Field>
        )}

        {form.trigger_type === "file_watch" && (
          <Field label="监听目录 (相对项目根)">
            <input value={form.watch_path} onChange={e => up("watch_path", e.target.value)}
              placeholder="data/inbox/audio/" style={{ ...inp, fontFamily: "SF Mono, monospace" }} />
            <div style={{ fontSize: 10.5, color: T.muted2, marginTop: 4 }}>⚠️ D-040f 才接 watchdog · 当前不会真触发</div>
          </Field>
        )}

        <Field label="产出去向">
          <select value={form.output_target} onChange={e => up("output_target", e.target.value)} style={inp}>
            <option value="">不指定</option>
            {NIGHT_OUTPUT_TARGETS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </Field>

        <Field label="">
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
            <input type="checkbox" checked={form.enabled} onChange={e => up("enabled", e.target.checked)} />
            <span>启用 (取消勾选 = 调度器不挂)</span>
          </label>
        </Field>

        {err && <div style={{ padding: 10, background: T.redSoft, color: T.red, borderRadius: 8, fontSize: 12, marginBottom: 10 }}>{err}</div>}

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
          <Btn variant="outline" onClick={onClose}>取消</Btn>
          <Btn variant="primary" onClick={save} disabled={saving}>{saving ? "保存中…" : (isNew ? "加上" : "保存")}</Btn>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children, style }) {
  return (
    <div style={{ marginBottom: 14, ...(style || {}) }}>
      {label && <div style={{ fontSize: 12, color: T.muted, marginBottom: 5, fontWeight: 500 }}>{label}</div>}
      {children}
    </div>
  );
}

const inp = {
  width: "100%", border: `1px solid ${T.border}`, borderRadius: 8,
  padding: "8px 10px", fontSize: 13, fontFamily: "inherit", outline: "none", background: "#fff",
};

Object.assign(window, { PageNightShift });
