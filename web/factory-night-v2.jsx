// factory-night-v2.jsx — 🌙 小华夜班总控页 (D-040d)
// 用户可见命名: 小华夜班 / 任务 / 上次跑了…
// 后端: 7 个 /api/night/* (D-040b) + 调度器 (D-040c)

// D-044: 编辑器不直接选 trigger_type, 改用 4 个语义化 mode, 前端合成 cron
// 后端仍只有 cron / file_watch / manual 三种 trigger_type, mode → trigger_type 映射:
//   daily / interval → cron     (cron 表达式由 mode 配置合成)
//   file_watch       → file_watch
//   manual           → manual
const NIGHT_EDITOR_MODES = [
  { id: "daily",      label: "每天",     desc: "按时间 + 周几跑" },
  { id: "interval",   label: "按间隔",   desc: "每 N 分钟/小时" },
  { id: "file_watch", label: "监听目录", desc: "目录里出现新文件就触发 · 等 watchdog 接入" },
  { id: "manual",     label: "只手动",   desc: "不自动跑, 用户点立即跑" },
];

const WEEKDAY_LABELS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
// cron day-of-week: 0=Sun, 1=Mon, ..., 6=Sat. 我们 UI 上从周一开始排, 内部转换.
const UI_TO_CRON_DOW = [1, 2, 3, 4, 5, 6, 0];

// 合成 cron 表达式
function composeCronDaily(hour, minute, daysUiIdx) {
  // daysUiIdx: 7-bool 数组 (周一..周日选中?)
  const cronDow = daysUiIdx
    .map((sel, i) => (sel ? UI_TO_CRON_DOW[i] : null))
    .filter(x => x !== null);
  if (cronDow.length === 0) return null;
  if (cronDow.length === 7) return `${minute} ${hour} * * *`;
  return `${minute} ${hour} * * ${cronDow.join(",")}`;
}

function composeCronInterval(n, unit) {
  n = Math.max(1, parseInt(n) || 1);
  if (unit === "min") {
    if (n >= 60) return null;       // 60 以上转用"按小时"
    return `*/${n} * * * *`;
  }
  if (unit === "hour") {
    if (n >= 24) return null;
    return `0 */${n} * * *`;
  }
  return null;
}

// 反向解析: 现有 job 的 cron / trigger_type → 推 UI mode 和参数
function inferEditorState(job) {
  const tt = job.trigger_type;
  if (tt === "manual") return { mode: "manual" };
  if (tt === "file_watch") return { mode: "file_watch", watchPath: job.trigger_config?.path || "data/inbox/audio/" };
  // cron
  const expr = job.trigger_config?.cron || "0 23 * * *";
  const m = expr.match(/^(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)$/);
  if (!m) return { mode: "daily", hour: 23, minute: 0, days: [true,true,true,true,true,true,true] };
  const [, mi, h, dom, mon, dow] = m;
  // 按间隔 */N
  if (mi.startsWith("*/") && /^\d+$/.test(mi.slice(2)) && h === "*" && dom === "*" && mon === "*" && dow === "*") {
    return { mode: "interval", intervalN: parseInt(mi.slice(2)), intervalUnit: "min" };
  }
  if (h.startsWith("*/") && /^\d+$/.test(h.slice(2)) && mi === "0" && dom === "*" && mon === "*" && dow === "*") {
    return { mode: "interval", intervalN: parseInt(h.slice(2)), intervalUnit: "hour" };
  }
  // 每天
  const hour = /^\d+$/.test(h) ? parseInt(h) : 23;
  const minute = /^\d+$/.test(mi) ? parseInt(mi) : 0;
  let days = [true,true,true,true,true,true,true];
  if (dow !== "*" && dom === "*" && mon === "*") {
    const cronDows = dow.split(",").map(s => parseInt(s.trim())).filter(n => !isNaN(n));
    days = WEEKDAY_LABELS.map((_, ui_i) => cronDows.includes(UI_TO_CRON_DOW[ui_i]));
  }
  return { mode: "daily", hour, minute, days };
}
const NIGHT_OUTPUT_TARGETS = [
  { id: "materials", label: "📥 素材库" },
  { id: "works",     label: "🗂️ 作品库" },
  { id: "knowledge", label: "📚 知识库" },
  { id: "home",      label: "🏠 总部播报" },
];
// 把 cron 表达式翻成人话 (D-044 加 day-of-week 渲染 + */N 小时)
function humanizeCron(expr) {
  if (!expr) return "(未设置)";
  const m = String(expr).match(/^(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)$/);
  if (!m) return expr;
  const [, mi, h, dom, mon, dow] = m;
  // 按间隔: */N * * * *  (分钟)
  if (mi.startsWith("*/") && h === "*" && dom === "*" && mon === "*" && dow === "*") {
    return `每 ${mi.slice(2)} 分钟`;
  }
  // 按间隔: 0 */N * * *  (小时)
  if (mi === "0" && h.startsWith("*/") && dom === "*" && mon === "*" && dow === "*") {
    return `每 ${h.slice(2)} 小时`;
  }
  // 按时间: M H * * dow
  if (dom === "*" && mon === "*" && /^\d+$/.test(mi) && /^\d+$/.test(h)) {
    const tStr = `${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}`;
    if (dow === "*") return `每天 ${tStr}`;
    if (dow === "1-5") return `工作日 ${tStr}`;
    if (dow === "0,6" || dow === "6,0") return `周末 ${tStr}`;
    // 列出周几名字
    const dowNames = { "0": "日", "1": "一", "2": "二", "3": "三", "4": "四", "5": "五", "6": "六" };
    const cronDows = dow.split(",").map(s => s.trim());
    if (cronDows.every(d => dowNames[d])) {
      const labels = cronDows.map(d => "周" + dowNames[d]).join("/");
      return `${labels} ${tStr}`;
    }
  }
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
  const [historyTab, setHistoryTab] = React.useState("today");  // today | week | all
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState("");
  const [editing, setEditing] = React.useState(null);  // null | {} | {id, ...}
  const [scheduler, setScheduler] = React.useState(null);

  async function refresh() {
    try {
      const [j, r, s] = await Promise.all([
        api.get("/api/night/jobs"),
        api.get("/api/night/runs?limit=200"),  // D-049: 拉到 200 条, 客户端按 today/week/all 过滤
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

  // D-058: 删除走非阻塞模态 (取代浏览器原生 confirm)
  const [deleteTarget, setDeleteTarget] = React.useState(null);
  const [deletingId, setDeletingId] = React.useState(null);
  function delJob(job) { setDeleteTarget(job); }
  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeletingId(deleteTarget.id);
    try {
      await api.del(`/api/night/jobs/${deleteTarget.id}`);
      setDeleteTarget(null);
      refresh();
    } catch (e) {
      setErr(e.message);
    } finally {
      setDeletingId(null);
    }
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

          {/* D-086: 走全站 InlineError */}
          {err && <InlineError err={err} />}

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

          {/* 历史日志 (D-049 加 today/week/all tab) */}
          {runs.length > 0 && (() => {
            const nowSec = Math.floor(Date.now() / 1000);
            const todayStart = (() => { const d = new Date(); d.setHours(0,0,0,0); return Math.floor(d.getTime()/1000); })();
            const weekStart = nowSec - 7 * 86400;
            const filtered = historyTab === "today"
              ? runs.filter(r => r.started_at >= todayStart)
              : historyTab === "week"
                ? runs.filter(r => r.started_at >= weekStart)
                : runs;
            const counts = {
              today: runs.filter(r => r.started_at >= todayStart).length,
              week: runs.filter(r => r.started_at >= weekStart).length,
              all: runs.length,
            };
            const TABS = [
              { id: "today", label: "今天" },
              { id: "week",  label: "本周" },
              { id: "all",   label: "全部" },
            ];
            return (
              <div style={{ marginTop: 28 }}>
                <div style={{ display: "flex", alignItems: "center", marginBottom: 10, gap: 10 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>📜 跑过的</div>
                  <div style={{ flex: 1 }} />
                  <div style={{ display: "flex", gap: 4, background: T.bg2, padding: 3, borderRadius: 100 }}>
                    {TABS.map(t => (
                      <button key={t.id} onClick={() => setHistoryTab(t.id)}
                        style={{
                          padding: "5px 14px", fontSize: 11.5, borderRadius: 100, border: "none",
                          fontFamily: "inherit", cursor: "pointer", transition: "all 0.1s",
                          background: historyTab === t.id ? T.text : "transparent",
                          color: historyTab === t.id ? "#fff" : T.muted,
                          fontWeight: historyTab === t.id ? 600 : 500,
                        }}>
                        {t.label} <span style={{ opacity: 0.7, marginLeft: 2 }}>{counts[t.id]}</span>
                      </button>
                    ))}
                  </div>
                </div>
                {filtered.length === 0 ? (
                  <div style={{ padding: 20, background: T.bg2, color: T.muted2, borderRadius: 8, fontSize: 12, textAlign: "center" }}>
                    {historyTab === "today" ? "今天还没跑过 · 点上面任务的「立即跑」试试" :
                     historyTab === "week" ? "本周还没跑过" : "还没跑过任何任务"}
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {filtered.map(run => {
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
                )}
              </div>
            );
          })()}
        </div>
      </div>

      {editing && <NightJobEditor job={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); refresh(); }} />}
      {deleteTarget && (
        <NightDeleteConfirm
          job={deleteTarget}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={confirmDelete}
          deleting={deletingId === deleteTarget.id} />
      )}
    </div>
  );
}

function NightJobCard({ job, runs, onToggle, onRun, onEdit, onDelete }) {
  const latest = runs[0];
  const target = NIGHT_OUTPUT_TARGETS.find(t => t.id === job.output_target);
  const triggerLabel = job.trigger_type === "cron"
    ? humanizeCron(job.trigger_config?.cron)
    : job.trigger_type === "file_watch"
      ? `监听 ${job.trigger_config?.path || "(未设)"}`
      : "只手动";
  const [hover, setHover] = React.useState(false);

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        padding: "16px 20px", background: "#fff",
        border: `1px solid ${hover && job.enabled ? T.brand : T.borderSoft}`,
        boxShadow: hover && job.enabled ? `0 4px 12px rgba(47,122,82,0.10)` : "0 1px 2px rgba(0,0,0,0.03)",
        borderRadius: 14, display: "flex", alignItems: "center", gap: 14,
        opacity: job.enabled ? 1 : 0.55, transition: "all 0.15s",
      }}>
      <div style={{
        fontSize: 24, width: 44, height: 44, flexShrink: 0,
        background: job.enabled ? T.brandSoft : T.bg2, borderRadius: 10,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>{job.icon || "🌙"}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
          <div style={{ fontSize: 14.5, fontWeight: 600, color: T.text }}>{job.name}</div>
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

// ─── D-058: 删除确认非阻塞模态 ─────────────────────────────
// 取代浏览器原生 confirm() · iOS 风视觉对齐 NightJobEditor
function NightDeleteConfirm({ job, onCancel, onConfirm, deleting }) {
  // Esc 关闭 (P3)
  React.useEffect(() => {
    function onKey(e) { if (e.key === "Escape" && !deleting) onCancel(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel, deleting]);
  return (
    <div onClick={onCancel} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 200,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 440, maxWidth: "100%",
        background: "#fff", borderRadius: 14, padding: 24,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
          <div style={{ fontSize: 30 }}>{job.icon || "🌙"}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: T.text }}>
              确认删除「{job.name}」?
            </div>
            <div style={{ fontSize: 11.5, color: T.muted, marginTop: 3 }}>
              关联的运行历史会一起清掉, 不可恢复
            </div>
          </div>
        </div>

        <div style={{
          padding: "10px 12px", marginBottom: 14, borderRadius: 8, fontSize: 12,
          background: T.bg2, color: T.muted, fontFamily: "SF Mono, Menlo, monospace",
        }}>
          <div>id: {job.id}</div>
          {job.skill_slug && <div>skill_slug: {job.skill_slug}</div>}
          {job.trigger_type && <div>trigger_type: {job.trigger_type}</div>}
          {job.enabled === false && <div style={{ color: T.muted2 }}>(当前已禁用)</div>}
        </div>

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={onCancel} disabled={deleting}
            style={{
              padding: "10px 18px", borderRadius: 100, fontSize: 13, cursor: deleting ? "not-allowed" : "pointer",
              fontFamily: "inherit", background: "transparent",
              border: `1px solid ${T.border}`, color: T.muted,
              opacity: deleting ? 0.5 : 1,
            }}>取消</button>
          <button onClick={onConfirm} disabled={deleting}
            style={{
              padding: "10px 22px", borderRadius: 100, fontSize: 13,
              cursor: deleting ? "not-allowed" : "pointer", fontFamily: "inherit",
              background: T.red, border: "none", color: "#fff", fontWeight: 600,
              opacity: deleting ? 0.6 : 1,
            }}>
            {deleting ? "删除中…" : "删除"}
          </button>
        </div>
      </div>
    </div>
  );
}


function NightJobEditor({ job, onClose, onSaved }) {
  const isNew = !job.id;
  const inferred = isNew ? { mode: "daily", hour: 23, minute: 0, days: [true,true,true,true,true,true,true] } : inferEditorState(job);

  const [name, setName] = React.useState(job.name || "");
  const [icon, setIcon] = React.useState(job.icon || "🌙");
  const [skillSlug, setSkillSlug] = React.useState(job.skill_slug || "");
  const [outputTarget, setOutputTarget] = React.useState(job.output_target || "materials");
  const [enabled, setEnabled] = React.useState(job.enabled !== false);

  // 频率相关
  const [mode, setMode] = React.useState(inferred.mode);
  const [hour, setHour] = React.useState(inferred.hour ?? 23);
  const [minute, setMinute] = React.useState(inferred.minute ?? 0);
  const [days, setDays] = React.useState(inferred.days ?? [true,true,true,true,true,true,true]);
  const [intervalN, setIntervalN] = React.useState(inferred.intervalN ?? 30);
  const [intervalUnit, setIntervalUnit] = React.useState(inferred.intervalUnit ?? "min");
  const [watchPath, setWatchPath] = React.useState(inferred.watchPath ?? "data/inbox/audio/");

  const [saving, setSaving] = React.useState(false);
  const [err, setErr] = React.useState("");

  // Esc 关闭弹窗 (P3)
  React.useEffect(() => {
    function onKey(e) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // 实时预览
  const previewCron = mode === "daily"
    ? composeCronDaily(hour, minute, days)
    : mode === "interval"
      ? composeCronInterval(intervalN, intervalUnit)
      : null;

  const previewLabel = (() => {
    if (mode === "manual") return "不自动跑 · 用户点立即跑才会执行";
    if (mode === "file_watch") return `监听 ${watchPath} 出现新文件触发`;
    if (!previewCron) {
      if (mode === "daily") return "⚠️ 至少选一天";
      if (mode === "interval" && intervalUnit === "min" && intervalN >= 60) return "⚠️ 分钟值 ≥60, 改用按小时";
      if (mode === "interval" && intervalUnit === "hour" && intervalN >= 24) return "⚠️ 小时值 ≥24, 用按天";
      return "⚠️ 频率参数不合法";
    }
    return `cron: ${previewCron} · ${humanizeCron(previewCron)}`;
  })();

  function toggleDay(i) {
    setDays(prev => prev.map((v, j) => j === i ? !v : v));
  }
  function selectDayPreset(preset) {
    if (preset === "weekday") setDays([true,true,true,true,true,false,false]);
    if (preset === "weekend") setDays([false,false,false,false,false,true,true]);
    if (preset === "all")     setDays([true,true,true,true,true,true,true]);
  }

  async function save() {
    if (!name.trim()) { setErr("名字不能空"); return; }
    let trigger_type, trigger_config;
    if (mode === "daily" || mode === "interval") {
      if (!previewCron) { setErr("频率参数不合法, 看上方红字提示"); return; }
      trigger_type = "cron";
      trigger_config = { cron: previewCron, timezone: "Asia/Shanghai" };
    } else if (mode === "file_watch") {
      trigger_type = "file_watch";
      trigger_config = { path: watchPath.trim() || "data/inbox/audio/" };
    } else {
      trigger_type = "manual";
      trigger_config = {};
    }

    const body = {
      name: name.trim(),
      icon: icon || null,
      skill_slug: skillSlug.trim() || null,
      trigger_type,
      trigger_config,
      output_target: outputTarget || null,
      enabled,
    };
    setSaving(true); setErr("");
    try {
      if (isNew) await api.post("/api/night/jobs", body);
      else       await api.patch(`/api/night/jobs/${job.id}`, body);
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
        width: 540, maxWidth: "100%", maxHeight: "90vh", overflow: "auto",
        background: "#fff", borderRadius: 14, padding: 24,
      }}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 14 }}>
          {isNew ? "🌙 加一条夜班任务" : `编辑「${job.name}」`}
        </div>

        <Field label="名字">
          <input value={name} onChange={e => setName(e.target.value)} placeholder="例: 凌晨抓热点" style={inp} />
        </Field>

        <div style={{ display: "flex", gap: 10 }}>
          <Field label="图标" style={{ width: 100 }}>
            <input value={icon} onChange={e => setIcon(e.target.value)} placeholder="🌙" style={inp} />
          </Field>
          <Field label="对应 skill" style={{ flex: 1 }}>
            <input value={skillSlug} onChange={e => setSkillSlug(e.target.value)}
              placeholder="content-planner / daily-recap · 留空走占位" style={inp} />
          </Field>
        </div>

        <Field label="频率">
          <div style={{ display: "flex", gap: 6 }}>
            {NIGHT_EDITOR_MODES.map(m => (
              <button key={m.id} onClick={() => setMode(m.id)} title={m.desc}
                style={{
                  flex: 1, padding: "8px 6px", borderRadius: 100, fontSize: 12, fontFamily: "inherit", cursor: "pointer",
                  border: "none",
                  background: mode === m.id ? T.text : T.bg2,
                  color: mode === m.id ? "#fff" : T.muted,
                  fontWeight: mode === m.id ? 600 : 500,
                  transition: "all 0.15s",
                }}>
                {m.label}
              </button>
            ))}
          </div>
        </Field>

        {mode === "daily" && (
          <>
            <Field label="时间">
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <input type="number" min="0" max="23" value={hour}
                  onChange={e => setHour(Math.max(0, Math.min(23, parseInt(e.target.value) || 0)))}
                  style={{ ...inp, width: 70, fontFamily: "SF Mono, monospace", textAlign: "center" }} />
                <span style={{ fontSize: 16, fontWeight: 600 }}>:</span>
                <input type="number" min="0" max="59" value={minute}
                  onChange={e => setMinute(Math.max(0, Math.min(59, parseInt(e.target.value) || 0)))}
                  style={{ ...inp, width: 70, fontFamily: "SF Mono, monospace", textAlign: "center" }} />
                <div style={{ flex: 1 }} />
                {[
                  { id: "weekday", label: "工作日" },
                  { id: "weekend", label: "周末" },
                  { id: "all",     label: "每天" },
                ].map(p => (
                  <button key={p.id} onClick={() => selectDayPreset(p.id)}
                    style={{ padding: "4px 10px", fontSize: 11, borderRadius: 100, background: T.bg2, border: `1px solid ${T.borderSoft}`, color: T.muted, cursor: "pointer", fontFamily: "inherit" }}>
                    {p.label}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="">
              <div style={{ display: "flex", gap: 6 }}>
                {WEEKDAY_LABELS.map((d, i) => (
                  <button key={i} onClick={() => toggleDay(i)}
                    style={{
                      flex: 1, padding: "8px 0", borderRadius: 100, fontSize: 12, fontFamily: "inherit", cursor: "pointer",
                      border: "none",
                      background: days[i] ? T.text : T.bg2,
                      color: days[i] ? "#fff" : T.muted,
                      fontWeight: days[i] ? 600 : 500,
                      transition: "all 0.1s",
                    }}>
                    {d}
                  </button>
                ))}
              </div>
            </Field>
          </>
        )}

        {mode === "interval" && (
          <Field label="每">
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="number" min="1" max="59" value={intervalN}
                onChange={e => setIntervalN(parseInt(e.target.value) || 1)}
                style={{ ...inp, width: 90, fontFamily: "SF Mono, monospace", textAlign: "center" }} />
              <select value={intervalUnit} onChange={e => setIntervalUnit(e.target.value)}
                style={{ ...inp, width: 100 }}>
                <option value="min">分钟</option>
                <option value="hour">小时</option>
              </select>
              <span style={{ fontSize: 12, color: T.muted2 }}>跑一次</span>
            </div>
          </Field>
        )}

        {mode === "file_watch" && (
          <Field label="监听目录 (相对项目根)">
            <input value={watchPath} onChange={e => setWatchPath(e.target.value)}
              placeholder="data/inbox/audio/" style={{ ...inp, fontFamily: "SF Mono, monospace" }} />
            <div style={{ fontSize: 10.5, color: T.muted2, marginTop: 4 }}>⚠️ watchdog 还没接 · 当前不会真触发, 等下个 commit</div>
          </Field>
        )}

        {/* 频率预览 / 错误提示 */}
        <div style={{
          padding: "8px 12px", marginBottom: 14, borderRadius: 8, fontSize: 11.5,
          background: previewLabel.startsWith("⚠️") ? T.redSoft : T.bg2,
          color: previewLabel.startsWith("⚠️") ? T.red : T.muted,
          fontFamily: "SF Mono, Menlo, monospace",
        }}>
          {previewLabel}
        </div>

        <Field label="产出去向">
          <select value={outputTarget} onChange={e => setOutputTarget(e.target.value)} style={inp}>
            <option value="">不指定</option>
            {NIGHT_OUTPUT_TARGETS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </Field>

        <Field label="">
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
            <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} />
            <span>启用 (取消勾选 = 调度器不挂, 任务保留可手动跑)</span>
          </label>
        </Field>

        {err && <div style={{ padding: 10, background: T.redSoft, color: T.red, borderRadius: 8, fontSize: 12, marginBottom: 10 }}>{err}</div>}

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
          <button onClick={onClose}
            style={{
              padding: "10px 18px", borderRadius: 100, fontSize: 13, cursor: "pointer", fontFamily: "inherit",
              background: "transparent", border: `1px solid ${T.border}`, color: T.muted,
            }}>取消</button>
          <button onClick={save} disabled={saving}
            style={{
              padding: "10px 22px", borderRadius: 100, fontSize: 13, cursor: saving ? "not-allowed" : "pointer", fontFamily: "inherit",
              background: T.text, border: "none", color: "#fff", fontWeight: 600,
              opacity: saving ? 0.5 : 1,
            }}>
            {saving ? "保存中…" : (isNew ? "添加" : "保存")}
          </button>
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
