// factory-works.jsx — 作品库:网格 + 详情抽屉
// 视觉对齐 docs/design_v3/factory3-pages.jsx V3Works

function PageWorks({ onNav }) {
  const [view, setView] = React.useState("grid");     // grid / analytics
  const [works, setWorks] = React.useState([]);
  const [analytics, setAnalytics] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [q, setQ] = React.useState("");
  const [picked, setPicked] = React.useState(null);

  async function load() {
    setLoading(true);
    try {
      const [list, a] = await Promise.all([
        api.get("/api/works?limit=100"),
        api.get("/api/works/analytics").catch(() => null),
      ]);
      setWorks(list);
      if (a) setAnalytics(a);
    } catch {}
    setLoading(false);
  }
  React.useEffect(() => { load(); }, []);

  async function delOne(id) {
    if (!confirm("删除这条作品?(本地视频文件也一并删除)")) return;
    await api.del(`/api/works/${id}?remove_file=true`).catch(() => {});
    setPicked(null);
    load();
  }

  const visible = works.filter(w => {
    if (!q.trim()) return true;
    const k = q.trim().toLowerCase();
    return (w.title || "").toLowerCase().includes(k)
        || (w.final_text || "").toLowerCase().includes(k);
  });

  const statusCount = {
    all: works.length,
    published: works.filter(w => w.status === "published").length,
    ready: works.filter(w => w.status === "ready").length,
    generating: works.filter(w => w.status === "generating").length,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", position: "relative" }}>
      <div style={{ padding: "22px 32px 0", background: "#fff", borderBottom: `1px solid ${T.border}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ fontSize: 20, fontWeight: 600 }}>🗂️ 作品库</div>
          <Tag color="gray">{statusCount.all} 条</Tag>
          {statusCount.published > 0 && <Tag color="green">已发 {statusCount.published}</Tag>}
          {statusCount.ready > 0 && <Tag color="blue">待发 {statusCount.ready}</Tag>}
          {statusCount.generating > 0 && <Tag color="amber">合成中 {statusCount.generating}</Tag>}
          <div style={{ flex: 1 }} />
          {view === "grid" && (
            <input
              placeholder="🔍 搜标题 / 文案"
              value={q} onChange={e => setQ(e.target.value)}
              style={{ width: 260, padding: "8px 14px", fontSize: 13, border: `1px solid ${T.border}`, borderRadius: 100, outline: "none", background: T.bg2, fontFamily: "inherit" }}
            />
          )}
          <Btn size="sm" onClick={load}>↻ 刷新</Btn>
        </div>
        <div style={{ fontSize: 12.5, color: T.muted, marginTop: 8 }}>你做过的全部视频 · 点卡片看详情 / 录入各平台数据 · 看数据视图知道什么类型爆</div>
        <div style={{ display: "flex", gap: 2, marginTop: 14 }}>
          {[
            { id: "grid", label: "📄 作品网格", n: works.length },
            { id: "analytics", label: "📊 数据看板", n: analytics?.total_works_with_data || 0 },
          ].map(t => {
            const on = view === t.id;
            return (
              <button key={t.id} onClick={() => setView(t.id)} style={{
                padding: "9px 14px", background: "transparent", border: "none", cursor: "pointer", fontFamily: "inherit",
                color: on ? T.text : T.muted, fontWeight: on ? 600 : 500, fontSize: 13,
                borderBottom: `2px solid ${on ? T.brand : "transparent"}`,
                display: "flex", alignItems: "center", gap: 5,
              }}>{t.label} <span style={{ fontSize: 11, color: T.muted2 }}>{t.n}</span></button>
            );
          })}
        </div>
      </div>

      <div style={{ flex: 1, overflow: "auto", padding: "20px 32px", background: T.bg }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          {loading && (
            <div style={{ textAlign: "center", padding: 40, color: T.muted2 }}>加载中...</div>
          )}
          {!loading && view === "grid" && visible.length === 0 && (
            <EmptyWorks onGo={() => onNav("make")} />
          )}
          {!loading && view === "grid" && visible.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
              {visible.map(w => (
                <WorkCard key={w.id} w={w} onPick={() => setPicked(w)} />
              ))}
            </div>
          )}
          {!loading && view === "analytics" && (
            <AnalyticsView a={analytics} onOpen={(wid) => {
              const w = works.find(x => x.id === wid);
              if (w) setPicked(w);
            }} />
          )}
        </div>
      </div>

      {picked && <WorkDrawer work={picked} onClose={() => setPicked(null)} onDel={() => delOne(picked.id)} onRemake={() => {
        window.__materialHandoff = { original_text: picked.original_text, title: picked.title };
        onNav("make");
      }} />}

      <LiDock context="作品库" />
    </div>
  );
}

function EmptyWorks({ onGo }) {
  return (
    <div style={{ textAlign: "center", padding: 80, color: T.muted }}>
      <div style={{ fontSize: 44, marginBottom: 12 }}>🎬</div>
      <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6, color: T.text }}>还没做过视频</div>
      <div style={{ fontSize: 13, marginBottom: 18 }}>点下面开干,第一条会出现在这</div>
      <Btn variant="primary" onClick={onGo}>去做视频 →</Btn>
    </div>
  );
}

function WorkCard({ w, onPick }) {
  const statusMap = {
    published: { color: "green", text: "已发" },
    ready: { color: "blue", text: "待发" },
    generating: { color: "amber", text: "合成中" },
    pending: { color: "gray", text: "等待" },
    failed: { color: "red", text: "失败" },
  };
  const st = statusMap[w.status] || { color: "gray", text: w.status };

  return (
    <div onClick={onPick} style={{
      background: "#fff", border: `1px solid ${T.borderSoft}`, borderRadius: 10,
      overflow: "hidden", cursor: "pointer", transition: "all 0.15s",
    }}>
      <div style={{
        aspectRatio: "9 / 16",
        background: w.local_url ? "#000" : "linear-gradient(135deg, #1e293b 0%, #475569 100%)",
        display: "flex", alignItems: "flex-end", padding: 10, color: "#fff", fontSize: 10.5,
        position: "relative", overflow: "hidden",
      }}>
        {w.local_url ? (
          <video src={api.media(w.local_url)} muted preload="metadata"
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", fontSize: 32, opacity: 0.5 }}>▶</div>
        )}
        <div style={{ position: "absolute", top: 8, right: 8 }}>
          <Tag size="xs" color={st.color}>{st.text}</Tag>
        </div>
        <div style={{ position: "relative", zIndex: 1, textShadow: "0 1px 3px rgba(0,0,0,0.6)" }}>
          <div style={{ marginBottom: 4, opacity: 0.85 }}>@清华哥聊私域</div>
          <div style={{ opacity: 0.7, fontFamily: "SF Mono, monospace" }}>{w.duration_sec ? `${Math.round(w.duration_sec)}s` : ""}</div>
        </div>
      </div>
      <div style={{ padding: 10 }}>
        <div style={{ fontSize: 12.5, color: T.text, fontWeight: 500, lineHeight: 1.4, marginBottom: 6, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", minHeight: 32 }}>
          {w.title || (w.final_text || "").slice(0, 40)}
        </div>
        <div style={{ fontSize: 10.5, color: T.muted2 }}>
          {new Date(w.created_at * 1000).toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" })}
          {w.shiliu_video_id ? ` · 石榴 ${w.shiliu_video_id}` : ""}
        </div>
      </div>
    </div>
  );
}

function WorkDrawer({ work, onClose, onDel, onRemake }) {
  const [tab, setTab] = React.useState("info");   // info / metrics
  const [metrics, setMetrics] = React.useState([]);
  const [loading, setLoading] = React.useState(false);

  async function loadMetrics() {
    setLoading(true);
    try {
      const r = await api.get(`/api/works/${work.id}/metrics`);
      setMetrics(r || []);
    } catch {}
    setLoading(false);
  }
  React.useEffect(() => { loadMetrics(); }, [work.id]);

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 200,
      display: "flex", justifyContent: "flex-end",
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: 640, background: "#fff", height: "100%",
        display: "flex", flexDirection: "column", overflow: "hidden",
        boxShadow: "-8px 0 30px rgba(0,0,0,0.12)",
      }}>
        <div style={{ padding: "14px 22px", borderBottom: `1px solid ${T.borderSoft}`, display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ flex: 1, fontSize: 15, fontWeight: 600 }}>作品详情 #{work.id}</div>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: T.muted, cursor: "pointer", fontSize: 22 }}>×</button>
        </div>
        <div style={{ display: "flex", gap: 2, padding: "8px 22px 0", borderBottom: `1px solid ${T.borderSoft}` }}>
          {[
            { id: "info", label: "作品内容", icon: "📄" },
            { id: "metrics", label: `各平台数据 ${metrics.length > 0 ? "· " + metrics.length : ""}`, icon: "📊" },
          ].map(t => {
            const on = tab === t.id;
            return (
              <button key={t.id} onClick={() => setTab(t.id)} style={{
                padding: "8px 14px", background: "transparent", border: "none", cursor: "pointer", fontFamily: "inherit",
                color: on ? T.text : T.muted, fontWeight: on ? 600 : 500, fontSize: 13,
                borderBottom: `2px solid ${on ? T.brand : "transparent"}`,
                display: "flex", alignItems: "center", gap: 5,
              }}>
                <span>{t.icon}</span>{t.label}
              </button>
            );
          })}
        </div>

        <div style={{ flex: 1, overflow: "auto", padding: 22 }}>
          {tab === "info" && (
            <WorkInfoPanel work={work} onDel={onDel} onRemake={onRemake} />
          )}
          {tab === "metrics" && (
            <MetricsPanel work={work} metrics={metrics} loading={loading} onReload={loadMetrics} />
          )}
        </div>
      </div>
    </div>
  );
}

function WorkInfoPanel({ work, onDel, onRemake }) {
  return (
    <>
      {work.local_url ? (
        <video src={api.media(work.local_url)} controls style={{ width: "100%", maxHeight: 520, borderRadius: 8, background: "#000" }} />
      ) : (
        <div style={{ aspectRatio: "9/16", maxWidth: 300, margin: "0 auto", background: "linear-gradient(135deg, #1e293b 0%, #475569 100%)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 32 }}>▶</div>
      )}
      <div style={{ marginTop: 18 }}>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>{work.title || "(无标题)"}</div>
        <div style={{ fontSize: 11.5, color: T.muted2, fontFamily: "SF Mono, monospace" }}>
          {new Date(work.created_at * 1000).toLocaleString("zh-CN")} ·
          status=<Tag size="xs" color={work.status === "published" ? "green" : work.status === "ready" ? "blue" : "gray"}>{work.status}</Tag>
          {work.shiliu_video_id ? ` · shiliu=${work.shiliu_video_id}` : ""}
        </div>
      </div>
      {work.final_text && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 11.5, color: T.muted, fontWeight: 600, letterSpacing: "0.08em", marginBottom: 6 }}>定稿文案</div>
          <div style={{ fontSize: 13, lineHeight: 1.75, color: T.text, background: T.bg2, border: `1px solid ${T.borderSoft}`, borderRadius: 8, padding: 12, whiteSpace: "pre-wrap" }}>
            {work.final_text}
          </div>
        </div>
      )}
      <div style={{ marginTop: 16, display: "flex", gap: 10 }}>
        {work.local_url && (
          <a href={api.media(work.local_url)} download style={{ textDecoration: "none" }}>
            <Btn size="sm">⬇ 下载 MP4</Btn>
          </a>
        )}
        <Btn size="sm" onClick={onRemake}>✨ 再做一条类似的</Btn>
        <div style={{ flex: 1 }} />
        <Btn size="sm" variant="danger" onClick={onDel}>🗑 删除</Btn>
      </div>
    </>
  );
}

const METRIC_PLATFORMS = [
  { id: "douyin", label: "抖音", plat: "douyin" },
  { id: "shipinhao", label: "视频号", plat: "shipinhao" },
  { id: "xiaohongshu", label: "小红书", plat: "xiaohongshu" },
  { id: "kuaishou", label: "快手", plat: "kuaishou" },
  { id: "wechat_article", label: "公众号", plat: "wechat" },
  { id: "moments", label: "朋友圈", plat: "wechat" },
];

function MetricsPanel({ work, metrics, loading, onReload }) {
  const [editPlat, setEditPlat] = React.useState(null);
  const [form, setForm] = React.useState({});

  function startEdit(platformId) {
    const existing = metrics.find(m => m.platform === platformId);
    setForm(existing ? {
      views: existing.views, likes: existing.likes, comments: existing.comments,
      shares: existing.shares, saves: existing.saves,
      followers_gained: existing.followers_gained, conversions: existing.conversions,
      completion_rate: existing.completion_rate || "",
      notes: existing.notes || "",
    } : { views: 0, likes: 0, comments: 0, shares: 0, saves: 0, followers_gained: 0, conversions: 0, completion_rate: "", notes: "" });
    setEditPlat(platformId);
  }

  async function save() {
    try {
      const payload = { ...form, platform: editPlat };
      if (typeof payload.completion_rate === "string") {
        payload.completion_rate = payload.completion_rate === "" ? null : Number(payload.completion_rate);
      }
      ["views","likes","comments","shares","saves","followers_gained","conversions"].forEach(k => { payload[k] = Number(payload[k] || 0); });
      await api.post(`/api/works/${work.id}/metrics`, payload);
      setEditPlat(null);
      onReload();
    } catch (e) { alert(e.message); }
  }

  return (
    <div>
      <div style={{ fontSize: 13, color: T.muted, marginBottom: 14 }}>
        各平台数据手动录入(Phase 4 自动采集) · 随时更新,小华会按这个排效果榜
      </div>

      {METRIC_PLATFORMS.map(p => {
        const m = metrics.find(x => x.platform === p.id);
        const editing = editPlat === p.id;
        return (
          <div key={p.id} style={{
            padding: 12, background: "#fff", border: `1px solid ${T.borderSoft}`,
            borderRadius: 10, marginBottom: 10,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: editing || m ? 10 : 0 }}>
              <PlatformIcon platform={p.plat} size={20} />
              <div style={{ fontSize: 13.5, fontWeight: 600, flex: 1 }}>{p.label}</div>
              {m && (
                <span style={{ fontSize: 11, color: T.muted2, fontFamily: "SF Mono, monospace" }}>
                  ▶ {m.views} · ♥ {m.likes} · 💬 {m.comments}
                </span>
              )}
              {!editing ? (
                <Btn size="sm" onClick={() => startEdit(p.id)}>{m ? "改" : "录入"}</Btn>
              ) : (
                <>
                  <Btn size="sm" onClick={() => setEditPlat(null)}>取消</Btn>
                  <Btn size="sm" variant="primary" onClick={save}>保存</Btn>
                </>
              )}
            </div>
            {editing && (
              <div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 8 }}>
                  {[
                    ["views", "播放/阅读"], ["likes", "点赞"], ["comments", "评论"], ["shares", "分享"],
                    ["saves", "收藏"], ["followers_gained", "涨粉"], ["conversions", "转化/加微"], ["completion_rate", "完播率 %"],
                  ].map(([k, label]) => (
                    <label key={k} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                      <span style={{ fontSize: 11, color: T.muted }}>{label}</span>
                      <input
                        type="number"
                        value={form[k] ?? ""}
                        onChange={e => setForm({ ...form, [k]: e.target.value })}
                        style={{ padding: "5px 8px", fontSize: 12.5, border: `1px solid ${T.borderSoft}`, borderRadius: 6, outline: "none", fontFamily: "inherit" }}
                      />
                    </label>
                  ))}
                </div>
                <input
                  value={form.notes || ""}
                  onChange={e => setForm({ ...form, notes: e.target.value })}
                  placeholder="备注(可选:为什么这条数据好/差)"
                  style={{ width: "100%", padding: "6px 10px", fontSize: 12.5, border: `1px solid ${T.borderSoft}`, borderRadius: 6, outline: "none", fontFamily: "inherit" }}
                />
              </div>
            )}
            {!editing && m && m.notes && (
              <div style={{ fontSize: 11.5, color: T.muted, background: T.bg2, padding: "6px 10px", borderRadius: 6, marginTop: 6 }}>
                📝 {m.notes}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── 数据看板视图 ─────────────────
function AnalyticsView({ a, onOpen }) {
  if (!a) return <div style={{ textAlign: "center", padding: 60, color: T.muted }}>数据加载失败</div>;
  if (a.total_metrics_records === 0) {
    return (
      <div style={{ textAlign: "center", padding: 80, color: T.muted }}>
        <div style={{ fontSize: 44, marginBottom: 12 }}>📊</div>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6, color: T.text }}>还没录入任何数据</div>
        <div style={{ fontSize: 13, lineHeight: 1.6 }}>去作品详情抽屉里的「各平台数据」Tab 手动录入 · 录完 3 条以上,这里就能看到效果排行</div>
      </div>
    );
  }

  return (
    <div>
      {/* 总览统计 */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
        <StatCard label="已录数据作品" value={a.total_works_with_data} icon="🎬" />
        <StatCard label="数据条数" value={a.total_metrics_records} icon="📊" />
        <StatCard label="各平台覆盖" value={Object.keys(a.platform_totals || {}).length} icon="🌐" />
        <StatCard label="TOP 1 播放量" value={(a.top_by_views?.[0]?.views || 0).toLocaleString()} icon="🔥" color={T.amber} />
      </div>

      {/* 平台总量 */}
      {Object.keys(a.platform_totals || {}).length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: T.muted, letterSpacing: "0.08em", marginBottom: 10 }}>各平台总量对比</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
            {Object.entries(a.platform_totals).map(([plat, t]) => (
              <div key={plat} style={{ padding: 12, background: "#fff", border: `1px solid ${T.borderSoft}`, borderRadius: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                  <PlatformIcon platform={PLAT_ICON_MAP[plat] || "douyin"} size={18} />
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{PLAT_LABEL[plat] || plat}</div>
                  <div style={{ flex: 1 }} />
                  <span style={{ fontSize: 11, color: T.muted2 }}>{t.count} 条</span>
                </div>
                <div style={{ display: "flex", gap: 16, fontSize: 11.5, color: T.muted, fontFamily: "SF Mono, monospace" }}>
                  <span>▶ {t.views.toLocaleString()}</span>
                  <span>♥ {t.likes.toLocaleString()}</span>
                  <span>💬 {t.comments.toLocaleString()}</span>
                  {t.conversions > 0 && <span style={{ color: T.brand }}>💫 {t.conversions}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TOP 10 播放量 */}
      {a.top_by_views && a.top_by_views.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: T.muted, letterSpacing: "0.08em", marginBottom: 10 }}>TOP {Math.min(10, a.top_by_views.length)} · 按播放量</div>
          <RankTable rows={a.top_by_views.slice(0, 10)} metric="views" metricLabel="总播放" onOpen={onOpen} />
        </div>
      )}

      {/* TOP 10 转化 */}
      {a.top_by_conversions && a.top_by_conversions.length > 0 && a.top_by_conversions[0].conversions > 0 && (
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: T.muted, letterSpacing: "0.08em", marginBottom: 10 }}>TOP · 按转化(加微信数)</div>
          <RankTable rows={a.top_by_conversions.slice(0, 10)} metric="conversions" metricLabel="转化" onOpen={onOpen} />
        </div>
      )}
    </div>
  );
}

const PLAT_ICON_MAP = { douyin: "douyin", shipinhao: "shipinhao", xiaohongshu: "xiaohongshu", kuaishou: "kuaishou", wechat_article: "wechat", moments: "wechat" };
const PLAT_LABEL = { douyin: "抖音", shipinhao: "视频号", xiaohongshu: "小红书", kuaishou: "快手", wechat_article: "公众号", moments: "朋友圈" };

function StatCard({ label, value, icon, color }) {
  return (
    <div style={{ padding: 16, background: "#fff", border: `1px solid ${T.borderSoft}`, borderRadius: 12 }}>
      <div style={{ fontSize: 11, color: T.muted, marginBottom: 8 }}>{icon} {label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, color: color || T.text, fontFamily: "SF Mono, monospace" }}>{value}</div>
    </div>
  );
}

function RankTable({ rows, metric, metricLabel, onOpen }) {
  return (
    <div style={{ background: "#fff", border: `1px solid ${T.borderSoft}`, borderRadius: 12, overflow: "hidden" }}>
      <div style={{ display: "grid", gridTemplateColumns: "42px 1fr 90px 70px 70px 90px 70px", padding: "10px 16px", fontSize: 11, color: T.muted, background: T.bg2, borderBottom: `1px solid ${T.borderSoft}`, fontWeight: 600 }}>
        <div>#</div><div>标题</div><div>{metricLabel}</div><div>点赞</div><div>评论</div><div>平台</div><div></div>
      </div>
      {rows.map((r, i) => (
        <div key={r.work_id} style={{
          display: "grid", gridTemplateColumns: "42px 1fr 90px 70px 70px 90px 70px",
          alignItems: "center", padding: "11px 16px", borderBottom: `1px solid ${T.borderSoft}`,
          fontSize: 12.5, background: i < 3 ? "#fbf8f0" : "#fff",
        }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: i === 0 ? T.amber : i < 3 ? T.amber + "cc" : T.muted }}>
            {i < 3 ? ["🥇", "🥈", "🥉"][i] : i + 1}
          </div>
          <div style={{ color: T.text, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.title}</div>
          <div style={{ fontFamily: "SF Mono, monospace", color: T.text, fontWeight: 600 }}>{(r[metric] || 0).toLocaleString()}</div>
          <div style={{ fontFamily: "SF Mono, monospace", color: T.muted }}>{(r.likes || 0).toLocaleString()}</div>
          <div style={{ fontFamily: "SF Mono, monospace", color: T.muted }}>{(r.comments || 0).toLocaleString()}</div>
          <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
            {[...new Set(r.platforms || [])].slice(0, 3).map(p => <PlatformIcon key={p} platform={PLAT_ICON_MAP[p] || "douyin"} size={14} />)}
          </div>
          <Btn size="sm" onClick={() => onOpen(r.work_id)}>看</Btn>
        </div>
      ))}
    </div>
  );
}

Object.assign(window, { PageWorks });
