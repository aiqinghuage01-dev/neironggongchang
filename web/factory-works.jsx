// factory-works.jsx — 作品库 V1 (D-065 三类统一)
// 主 tab: 全部 / 文字 / 图片 / 视频 / 数据看板 / 发布矩阵
// 来源 chip: 按当前 type 动态过滤
// 时间 chip: 今天 / 本周 / 本月 / 全部 (默认今天)
// 卡片: 视频沿用 WorkCard, 图片新做 ImageCard, 文字新做 TextCard

// D-065: source_skill → 友好名 + 类型对应表
const SOURCE_LABELS = {
  "image-gen": "🖼️ 直接出图",
  "wechat-cover": "📄 公众号封面",
  "wechat-cover-batch": "📄 封面批量",
  "wechat-section-image": "📄 段间图",
  "dreamina": "🎬 即梦 AIGC",
  "shortvideo": "🎥 数字人视频",
  "baokuan": "💥 爆款改写",
  "hotrewrite": "🔥 热点改写",
  "voicerewrite": "🎙️ 录音改写",
  "touliu": "💰 投流文案",
  "wechat": "📄 公众号长文",
  "planner": "🗓️ 内容策划",
  "compliance": "🛡️ 违规审查",
  "moments": "🌟 朋友圈",
};

function sourceLabel(k) { return SOURCE_LABELS[k] || k || "未知来源"; }

function PageWorks({ onNav }) {
  // 主 tab: all / text / image / video / analytics / publish
  const [tab, setTab] = React.useState("all");
  const [sourceFilter, setSourceFilter] = React.useState("");      // "" = 全部
  const [sinceFilter, setSinceFilter] = React.useState("today");   // today / week / month / all  默认今天
  const [autoFallback, setAutoFallback] = React.useState(false);   // D-066: 今天 0 条时自动 fallback 到 week, 提示一下
  const [works, setWorks] = React.useState([]);
  const [analytics, setAnalytics] = React.useState(null);
  const [sources, setSources] = React.useState({ by_type: {}, by_source: {}, total: 0 });
  const [loading, setLoading] = React.useState(true);
  const [q, setQ] = React.useState("");
  const [picked, setPicked] = React.useState(null);

  // tab 跟 type 的映射
  const tabType = (t) => (t === "text" || t === "image" || t === "video") ? t : null;

  async function load() {
    setLoading(true);
    const t = tabType(tab);
    const params = new URLSearchParams({ limit: "300" });
    if (t) params.set("type", t);
    if (sourceFilter) params.set("source_skill", sourceFilter);
    if (sinceFilter && sinceFilter !== "all") params.set("since", sinceFilter);
    if (q.trim()) params.set("q", q.trim());
    try {
      const [list, a, s] = await Promise.all([
        api.get(`/api/works?${params.toString()}`),
        api.get("/api/works/analytics").catch(() => null),
        api.get("/api/works/sources").catch(() => null),
      ]);
      // D-066: 今天没产出 → 自动切到本周 (只在 sinceFilter='today' 且没有人工切过时)
      if (sinceFilter === "today" && (list || []).length === 0 && !autoFallback) {
        setAutoFallback(true);
        setSinceFilter("week");
        return;
      }
      setWorks(list || []);
      if (a) setAnalytics(a);
      if (s) setSources(s);
    } catch (e) { console.warn("[works] load failed", e); }
    setLoading(false);
  }
  React.useEffect(() => {
    const id = setTimeout(load, q ? 280 : 0);
    return () => clearTimeout(id);
  }, [tab, sourceFilter, sinceFilter, q]);

  async function delOne(id) {
    if (!confirm("删除这条作品?(本地视频/图片文件也一并删除)")) return;
    await api.del(`/api/works/${id}?remove_file=true`).catch(() => {});
    setPicked(null);
    load();
  }

  // 当前 tab 下展示的来源 chip 列表(按 type 过滤 by_source)
  // 由于 by_source 不带 type 信息, 用 SOURCE_LABELS 的语义 + 一个简单分类
  const SOURCE_TYPE = {
    "image-gen": "image", "wechat-cover": "image", "wechat-cover-batch": "image",
    "wechat-section-image": "image", "dreamina": "image",
    "shortvideo": "video",
    "baokuan": "text", "hotrewrite": "text", "voicerewrite": "text", "touliu": "text",
    "wechat": "text", "planner": "text", "compliance": "text", "moments": "text",
  };
  const t = tabType(tab);
  const visibleSources = Object.entries(sources.by_source || {})
    .filter(([k]) => !t || SOURCE_TYPE[k] === t)
    .sort((a, b) => b[1] - a[1]);

  const totalByType = sources.by_type || {};
  const tabCount = (id) => {
    if (id === "all") return sources.total || 0;
    if (id === "analytics") return analytics?.total_works_with_data || 0;
    if (id === "publish") return countPublishMarks();
    return totalByType[id] || 0;
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", position: "relative" }}>
      <div style={{ padding: "22px 32px 0", background: "#fff", borderBottom: `1px solid ${T.border}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ fontSize: 20, fontWeight: 600 }}>🗂️ 作品库</div>
          <Tag color="gray">{sources.total} 条</Tag>
          {totalByType.text > 0 && <Tag color="amber">📝 文字 {totalByType.text}</Tag>}
          {totalByType.image > 0 && <Tag color="blue">🖼️ 图片 {totalByType.image}</Tag>}
          {totalByType.video > 0 && <Tag color="green">🎥 视频 {totalByType.video}</Tag>}
          <div style={{ flex: 1 }} />
          {(tab === "all" || tabType(tab)) && (
            <input
              placeholder="🔍 搜标题 / 文案 / prompt"
              value={q} onChange={e => setQ(e.target.value)}
              style={{ width: 260, padding: "8px 14px", fontSize: 13, border: `1px solid ${T.border}`, borderRadius: 100, outline: "none", background: T.bg2, fontFamily: "inherit" }}
            />
          )}
          <Btn size="sm" onClick={load}>↻ 刷新</Btn>
        </div>
        <div style={{ fontSize: 12.5, color: T.muted, marginTop: 8 }}>
          你做过的全部产出 · 文字 / 图片 / 视频统一管理 · 按来源、时间筛选
        </div>
        <div style={{ display: "flex", gap: 2, marginTop: 14 }}>
          {[
            { id: "all", label: "📦 全部" },
            { id: "text", label: "📝 文字" },
            { id: "image", label: "🖼️ 图片" },
            { id: "video", label: "🎥 视频" },
            { id: "analytics", label: "📊 数据看板" },
            { id: "publish", label: "📤 发布矩阵" },
          ].map(item => {
            const on = tab === item.id;
            return (
              <button key={item.id} onClick={() => setTab(item.id)} style={{
                padding: "9px 14px", background: "transparent", border: "none", cursor: "pointer", fontFamily: "inherit",
                color: on ? T.text : T.muted, fontWeight: on ? 600 : 500, fontSize: 13,
                borderBottom: `2px solid ${on ? T.brand : "transparent"}`,
                display: "flex", alignItems: "center", gap: 5,
              }}>{item.label} <span style={{ fontSize: 11, color: T.muted2 }}>{tabCount(item.id)}</span></button>
            );
          })}
        </div>
      </div>

      {/* D-065: 来源 + 时间筛选条 (analytics/publish 不显示) */}
      {(tab === "all" || tabType(tab)) && (
        <div style={{ padding: "12px 32px", background: T.bg2, borderBottom: `1px solid ${T.borderSoft}`, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", fontSize: 12.5 }}>
          <span style={{ color: T.muted, marginRight: 4 }}>来源</span>
          <FilterChip on={sourceFilter === ""} onClick={() => setSourceFilter("")}>全部</FilterChip>
          {visibleSources.map(([k, n]) => (
            <FilterChip key={k} on={sourceFilter === k} onClick={() => setSourceFilter(sourceFilter === k ? "" : k)}>
              {sourceLabel(k)} · {n}
            </FilterChip>
          ))}
          <span style={{ width: 14 }} />
          <span style={{ color: T.muted, marginRight: 4 }}>时间</span>
          {[["today","今天"],["week","本周"],["month","本月"],["all","全部"]].map(([k, label]) => (
            <FilterChip key={k} on={sinceFilter === k} onClick={() => { setAutoFallback(false); setSinceFilter(k); }}>{label}</FilterChip>
          ))}
          {autoFallback && (
            <span style={{ fontSize: 11, color: T.muted2, marginLeft: 6 }}>· 今天没产出, 已自动切到本周</span>
          )}
        </div>
      )}

      <div style={{ flex: 1, overflow: "auto", padding: "20px 32px", background: T.bg }}>
        <div style={{ maxWidth: 1240, margin: "0 auto" }}>
          {loading && (
            <div style={{ textAlign: "center", padding: 40, color: T.muted2 }}>加载中...</div>
          )}
          {!loading && (tab === "all" || tabType(tab)) && works.length === 0 && (
            <EmptyByTab tab={tab} sinceFilter={sinceFilter} onGo={() => onNav("make")} onClearFilter={() => { setSinceFilter("all"); setSourceFilter(""); setQ(""); }} />
          )}

          {/* D-065: 三类作品瀑布流 (CSS columns, 每张图按原比例铺满卡片) */}
          {!loading && (tab === "all" || tabType(tab)) && works.length > 0 && (
            <div style={{
              columnCount: tab === "text" ? 2 : 4,
              columnGap: 14,
            }}>
              {works.map(w => renderCard(w, () => setPicked(w)))}
            </div>
          )}

          {!loading && tab === "analytics" && (
            <AnalyticsView a={analytics} onOpen={(wid) => {
              const w = works.find(x => x.id === wid);
              if (w) setPicked(w);
            }} />
          )}
          {/* D-062z: 多平台发布矩阵 (跨视频聚合 publish_marks::* localStorage) */}
          {!loading && tab === "publish" && (
            <PublishMatrix works={works} onOpenWork={setPicked} onMake={() => onNav("make")} />
          )}
        </div>
      </div>

      {picked && <WorkDrawer work={picked} onClose={() => setPicked(null)} onDel={() => delOne(picked.id)} onRemake={() => {
        // D-062-AUDIT-2-todo1: 统一到 localStorage seed
        try {
          const seed = picked.original_text || picked.title || "";
          if (seed) {
            localStorage.setItem("make_v2_seed_script", seed);
            localStorage.setItem("make_v2_seed_from", JSON.stringify({
              skill: "rework", title: `重制: ${(picked.title || "").slice(0, 24)}`, ts: Date.now(),
            }));
          }
        } catch (_) {}
        onNav("make");
      }} />}

      <LiDock context="作品库" />
    </div>
  );
}

function EmptyWorks({ onGo }) {
  return (
    <div style={{ maxWidth: 480, margin: "60px auto", padding: 32, textAlign: "center",
                  background: "#fff", border: `1px solid ${T.brand}55`, borderRadius: 16 }}>
      <div style={{ fontSize: 56, marginBottom: 14 }}>🎬</div>
      <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8, color: T.text }}>还没做过视频</div>
      <div style={{ fontSize: 13.5, marginBottom: 22, color: T.muted, lineHeight: 1.6 }}>
        粘个链接 / 写段文案 / 选个热点 → 30s 出第一条
      </div>
      <Btn variant="primary" onClick={onGo}>🎬 现在去做第一条 →</Btn>
    </div>
  );
}

// D-065: 按当前 tab/筛选给出空状态文案
function EmptyByTab({ tab, sinceFilter, onGo, onClearFilter }) {
  const sinceLabel = { today: "今天", week: "本周", month: "本月", all: "" }[sinceFilter] || "";
  const typeLabel = { all: "产出", text: "文字", image: "图片", video: "视频" }[tab] || "产出";
  const isFiltered = sinceFilter !== "all";
  return (
    <div style={{ maxWidth: 480, margin: "60px auto", padding: 32, textAlign: "center",
                  background: "#fff", border: `1px solid ${T.borderSoft}`, borderRadius: 16 }}>
      <div style={{ fontSize: 56, marginBottom: 14 }}>{tab === "image" ? "🖼️" : tab === "text" ? "📝" : tab === "video" ? "🎬" : "📦"}</div>
      <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8, color: T.text }}>
        {isFiltered ? `${sinceLabel}还没有${typeLabel}` : `还没有${typeLabel}`}
      </div>
      <div style={{ fontSize: 13.5, marginBottom: 22, color: T.muted, lineHeight: 1.6 }}>
        {isFiltered ? "把时间放宽试试,或者去生产部做一条新的" : "去生产部做一条吧"}
      </div>
      <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
        {isFiltered && <Btn onClick={onClearFilter}>看全部</Btn>}
        <Btn variant="primary" onClick={onGo}>🎬 去做一条 →</Btn>
      </div>
    </div>
  );
}

// D-065: 来源/时间筛选 chip
function FilterChip({ on, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      padding: "5px 11px", borderRadius: 100,
      background: on ? T.text : "transparent",
      color: on ? "#fff" : T.text2,
      border: `1px solid ${on ? T.text : T.border}`,
      cursor: "pointer", fontSize: 12, fontFamily: "inherit",
      transition: "all .12s",
    }}>{children}</button>
  );
}

// D-065: inline 卡片渲染 — 不抽组件避免 React 18.3 dev build 在大量同名子组件 reconcile 时的 .error 误报
function renderCard(w, onPick) {
  if (!w) return null;
  let meta = {};
  try { meta = w.metadata ? JSON.parse(w.metadata) : {}; } catch (_) {}
  const sizeKB = meta.size_bytes ? Math.round(meta.size_bytes / 1024) : null;
  const sizeText = sizeKB ? (sizeKB > 1024 ? `${(sizeKB / 1024).toFixed(1)} MB` : `${sizeKB} KB`) : null;

  // 文字卡
  if (w.type === "text") {
    const wordCount = (w.final_text || "").length;
    return (
      <div key={w.id} onClick={onPick} style={{
        background: "#fff", border: `1px solid ${T.borderSoft}`, borderRadius: 12, padding: 16,
        cursor: "pointer", transition: "all 0.15s",
        marginBottom: 14, breakInside: "avoid", WebkitColumnBreakInside: "avoid",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <span style={{ padding: "3px 10px", borderRadius: 100, background: T.amberSoft, color: T.amber, fontSize: 11.5, fontWeight: 500 }}>
            {sourceLabel(w.source_skill)}
          </span>
          {w.tokens_used > 0 && <span style={{ fontSize: 11, color: T.muted2 }}>{w.tokens_used} token</span>}
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 11, color: T.muted2 }}>{formatTime(w.created_at)}</span>
        </div>
        {w.title && <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, lineHeight: 1.4 }}>{w.title}</div>}
        <div style={{
          fontSize: 12.5, color: T.text2, lineHeight: 1.65, background: T.bg2,
          padding: "10px 12px", borderRadius: 6, borderLeft: `3px solid ${T.border}`,
          display: "-webkit-box", WebkitLineClamp: 4, WebkitBoxOrient: "vertical", overflow: "hidden",
        }}>{w.final_text || "(空内容)"}</div>
        <div style={{ marginTop: 10, fontSize: 11, color: T.muted }}>{wordCount} 字</div>
      </div>
    );
  }

  // 图片卡 (masonry: 按原始 aspect ratio 铺满)
  if (w.type === "image") {
    return (
      <div key={w.id} onClick={onPick} style={{
        background: "#fff", border: `1px solid ${T.borderSoft}`, borderRadius: 12, overflow: "hidden",
        cursor: "pointer", transition: "all 0.15s",
        marginBottom: 14, breakInside: "avoid", WebkitColumnBreakInside: "avoid",
      }}>
        <div style={{ position: "relative", background: T.bg3 }}>
          {w.thumb_url ? (
            <img src={api.media(w.thumb_url)} alt={w.title || ""} loading="lazy"
              style={{ width: "100%", height: "auto", display: "block" }} />
          ) : (
            <div style={{ aspectRatio: "16/10", display: "flex", alignItems: "center", justifyContent: "center", color: T.muted2, fontSize: 32 }}>🖼️</div>
          )}
          <div style={{ position: "absolute", top: 8, left: 8 }}>
            <span style={{ padding: "3px 9px", borderRadius: 100, background: "rgba(255,255,255,0.92)", color: T.text, fontSize: 11, fontWeight: 500, border: "1px solid rgba(0,0,0,0.04)" }}>
              {sourceLabel(w.source_skill)}
            </span>
          </div>
          {sizeText && (
            <div style={{ position: "absolute", bottom: 8, right: 8, padding: "2px 7px", borderRadius: 5, background: "rgba(0,0,0,0.6)", color: "#fff", fontSize: 10.5 }}>
              {sizeText}
            </div>
          )}
        </div>
        <div style={{ padding: "10px 12px" }}>
          <div style={{ fontSize: 12.5, color: T.text, fontWeight: 500, lineHeight: 1.4, marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {w.title || "(无标题)"}
          </div>
          <div style={{ fontSize: 10.5, color: T.muted2 }}>{formatTime(w.created_at)}</div>
        </div>
      </div>
    );
  }

  // 视频卡(默认)
  const statusMap = {
    published: { color: "green", text: "已发" }, ready: { color: "blue", text: "待发" },
    generating: { color: "amber", text: "合成中" }, pending: { color: "gray", text: "等待" },
    failed: { color: "red", text: "失败" },
  };
  const st = statusMap[w.status] || { color: "gray", text: w.status };
  return (
    <div key={w.id} onClick={onPick} style={{
      background: "#fff", border: `1px solid ${T.borderSoft}`, borderRadius: 12, overflow: "hidden",
      cursor: "pointer", transition: "all 0.15s",
      marginBottom: 14, breakInside: "avoid", WebkitColumnBreakInside: "avoid",
    }}>
      <div style={{
        background: w.local_url ? "#000" : "linear-gradient(135deg, #1e293b 0%, #475569 100%)",
        position: "relative", overflow: "hidden",
      }}>
        {w.local_url ? (
          <video src={api.media(w.local_url)} muted preload="metadata"
            style={{ width: "100%", height: "auto", display: "block" }} />
        ) : (
          <div style={{ aspectRatio: "9/16", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 36, opacity: 0.5 }}>▶</div>
        )}
        <div style={{ position: "absolute", top: 10, right: 10 }}>
          <Tag size="xs" color={st.color}>{st.text}</Tag>
        </div>
        {w.duration_sec ? (
          <div style={{ position: "absolute", top: 10, left: 10, padding: "2px 8px", borderRadius: 100, background: "rgba(0,0,0,0.55)", color: "#fff", fontSize: 10.5, fontWeight: 600 }}>
            {Math.round(w.duration_sec)}s
          </div>
        ) : null}
      </div>
      <div style={{ padding: "12px 14px" }}>
        <div style={{ fontSize: 13, color: T.text, fontWeight: 500, lineHeight: 1.4, marginBottom: 6,
          display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", minHeight: 36 }}>
          {w.title || (w.final_text || "").slice(0, 40)}
        </div>
        <div style={{ fontSize: 10.5, color: T.muted2 }}>{formatTime(w.created_at)}</div>
      </div>
    </div>
  );
}

// D-065: 时间格式化(今天 → "今天 12:07", 否则 "04-25 09:11")
function formatTime(ts) {
  if (!ts) return "";
  const d = new Date(ts * 1000);
  const now = new Date();
  const sameDay = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  if (sameDay) return `今天 ${hh}:${mm}`;
  const yest = new Date(now); yest.setDate(now.getDate() - 1);
  const sameYest = d.getFullYear() === yest.getFullYear() && d.getMonth() === yest.getMonth() && d.getDate() === yest.getDate();
  if (sameYest) return `昨天 ${hh}:${mm}`;
  const M = String(d.getMonth() + 1).padStart(2, "0");
  const D = String(d.getDate()).padStart(2, "0");
  return `${M}-${D} ${hh}:${mm}`;
}


// D-067 P3: 采纳/否决按钮 — 喂行为记忆系统
function KeepDiscardActions({ work, onChange }) {
  let meta = {};
  try { meta = work.metadata ? JSON.parse(work.metadata) : {}; } catch (_) {}
  const cur = meta.user_action;  // kept / discarded / undefined
  async function set(action) {
    try {
      await api.post(`/api/works/${work.id}/action`, { action });
      onChange && onChange();
    } catch (e) { alert("失败: " + e.message); }
  }
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
      <button onClick={() => set(cur === "kept" ? "clear" : "kept")} title="标这版被采纳, 喂行为记忆 → AI 学风格"
        style={{
          padding: "5px 10px", fontSize: 12, fontFamily: "inherit", cursor: "pointer",
          borderRadius: 7, border: `1px solid ${cur === "kept" ? T.brand : T.border}`,
          background: cur === "kept" ? T.brandSoft : "#fff",
          color: cur === "kept" ? T.brand : T.muted, fontWeight: cur === "kept" ? 600 : 500,
        }}>👍 留这版{cur === "kept" ? " ✓" : ""}</button>
      <button onClick={() => set(cur === "discarded" ? "clear" : "discarded")} title="标这版被否决, AI 下次避开类似风格"
        style={{
          padding: "5px 10px", fontSize: 12, fontFamily: "inherit", cursor: "pointer",
          borderRadius: 7, border: `1px solid ${cur === "discarded" ? T.red : T.border}`,
          background: cur === "discarded" ? T.redSoft : "#fff",
          color: cur === "discarded" ? T.red : T.muted, fontWeight: cur === "discarded" ? 600 : 500,
        }}>👎 删这版{cur === "discarded" ? " ✓" : ""}</button>
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
          <KeepDiscardActions work={work} onChange={() => { /* 重读单条; 简化用 reload 整体 */ window.dispatchEvent(new CustomEvent("works-action-changed")); }} />
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: T.muted, cursor: "pointer", fontSize: 22, marginLeft: 4 }}>×</button>
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
          {tab === "info" && work.type === "image" && (
            <ImageInfoPanel work={work} onDel={onDel} />
          )}
          {tab === "info" && work.type === "text" && (
            <TextInfoPanel work={work} onDel={onDel} />
          )}
          {tab === "info" && (work.type === "video" || !work.type) && (
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
        <div style={{ fontSize: 11.5, color: T.muted2 }}>
          {new Date(work.created_at * 1000).toLocaleString("zh-CN")} ·
          状态: <Tag size="xs" color={work.status === "published" ? "green" : work.status === "ready" ? "blue" : "gray"}>{work.status === "published" ? "已发" : work.status === "ready" ? "待发" : work.status === "generating" ? "合成中" : work.status}</Tag>
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

// D-065: 图片详情面板
function ImageInfoPanel({ work, onDel }) {
  const [lightbox, setLightbox] = React.useState(false);
  let meta = {};
  try { meta = work.metadata ? JSON.parse(work.metadata) : {}; } catch (_) {}
  const sizeKB = meta.size_bytes ? Math.round(meta.size_bytes / 1024) : null;
  const sizeText = sizeKB ? (sizeKB > 1024 ? `${(sizeKB / 1024).toFixed(1)} MB` : `${sizeKB} KB`) : "--";
  // ESC 关 lightbox
  React.useEffect(() => {
    if (!lightbox) return;
    const h = (e) => { if (e.key === "Escape") setLightbox(false); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [lightbox]);
  return (
    <>
      {work.thumb_url ? (
        <img src={api.media(work.thumb_url)} alt={work.title || ""}
          onClick={() => setLightbox(true)}
          style={{ width: "100%", maxHeight: 520, objectFit: "contain", borderRadius: 8, background: "#000", display: "block", cursor: "zoom-in" }} />
      ) : (
        <div style={{ aspectRatio: "16/10", background: T.bg3, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", color: T.muted2, fontSize: 32 }}>🖼️</div>
      )}
      {lightbox && work.thumb_url && (
        <div onClick={() => setLightbox(false)} style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.92)", zIndex: 1000,
          display: "flex", alignItems: "center", justifyContent: "center", cursor: "zoom-out",
        }}>
          <img src={api.media(work.thumb_url)} alt={work.title || ""}
            style={{ maxWidth: "94vw", maxHeight: "94vh", objectFit: "contain", display: "block" }} />
          <button onClick={(e) => { e.stopPropagation(); setLightbox(false); }} style={{
            position: "absolute", top: 20, right: 24, width: 36, height: 36,
            background: "rgba(255,255,255,0.15)", border: "none", borderRadius: "50%",
            color: "#fff", fontSize: 20, cursor: "pointer", fontFamily: "inherit",
          }}>×</button>
          <div style={{ position: "absolute", left: 24, bottom: 20, color: "#fff",
            fontSize: 12, opacity: 0.7, fontFamily: "ui-monospace, monospace" }}>
            ESC 或点击空白处关
          </div>
        </div>
      )}
      <div style={{ marginTop: 18 }}>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>{work.title || "(无标题)"}</div>
        <div style={{ fontSize: 11.5, color: T.muted2, display: "flex", gap: 8, flexWrap: "wrap" }}>
          <span>{new Date(work.created_at * 1000).toLocaleString("zh-CN")}</span>
          <span>·</span>
          <span>{sourceLabel(work.source_skill)}</span>
          <span>·</span>
          <span>{sizeText}</span>
        </div>
      </div>
      {meta.filename && (
        <div style={{ marginTop: 16, fontSize: 11, color: T.muted, fontFamily: "SF Mono, monospace", padding: "8px 12px", background: T.bg2, borderRadius: 6, wordBreak: "break-all" }}>
          📁 {meta.filename}
        </div>
      )}
      <div style={{ marginTop: 16, display: "flex", gap: 10 }}>
        {work.local_url && (
          <a href={api.media(work.local_url)} download style={{ textDecoration: "none" }}>
            <Btn size="sm">⬇ 下载原图</Btn>
          </a>
        )}
        <div style={{ flex: 1 }} />
        <Btn size="sm" variant="danger" onClick={onDel}>🗑 删除</Btn>
      </div>
    </>
  );
}

// D-065: 文字详情面板
function TextInfoPanel({ work, onDel }) {
  const [copied, setCopied] = React.useState(false);
  function copy() {
    navigator.clipboard.writeText(work.final_text || "").then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    }).catch(() => {});
  }
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <span style={{ padding: "4px 12px", borderRadius: 100, background: T.amberSoft, color: T.amber, fontSize: 12, fontWeight: 500 }}>
          {sourceLabel(work.source_skill)}
        </span>
        <span style={{ fontSize: 11.5, color: T.muted2 }}>
          {new Date(work.created_at * 1000).toLocaleString("zh-CN")}
        </span>
        <span style={{ fontSize: 11.5, color: T.muted2 }}>·</span>
        <span style={{ fontSize: 11.5, color: T.muted2 }}>{(work.final_text || "").length} 字</span>
        {work.tokens_used > 0 && (
          <>
            <span style={{ fontSize: 11.5, color: T.muted2 }}>·</span>
            <span style={{ fontSize: 11.5, color: T.muted2 }}>{work.tokens_used} token</span>
          </>
        )}
      </div>
      {work.title && (
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 12, lineHeight: 1.4 }}>{work.title}</div>
      )}
      <div style={{ fontSize: 13.5, lineHeight: 1.85, color: T.text, background: T.bg2, padding: "16px 20px", borderRadius: 8, whiteSpace: "pre-wrap", border: `1px solid ${T.borderSoft}` }}>
        {work.final_text || "(空内容)"}
      </div>
      <div style={{ marginTop: 16, display: "flex", gap: 10 }}>
        <Btn size="sm" variant={copied ? "soft" : "default"} onClick={copy}>
          {copied ? "✓ 已复制" : "📄 复制全文"}
        </Btn>
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

// ─── D-062z 多平台发布矩阵 ─────────────────────────────────────
// 数据源: localStorage 里所有 publish_marks::<outputPath> = {plat: ts | null}
// (D-062h Step 5 PublishPanel 写入)
// 聚合: 按 outputPath 一行, 各平台 ✓ / ○ + 总览统计

const PUBLISH_MARK_PREFIX = "publish_marks::";
const PUBLISH_PLATFORMS = ["抖音", "视频号", "小红书", "快手", "B 站"];

function readAllMarks() {
  const out = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(PUBLISH_MARK_PREFIX)) continue;
      const path = key.slice(PUBLISH_MARK_PREFIX.length);
      try {
        const marks = JSON.parse(localStorage.getItem(key) || "{}");
        out.push({ path, marks });
      } catch (_) {}
    }
  } catch (_) {}
  return out;
}

function countPublishMarks() {
  return readAllMarks().filter(r => Object.values(r.marks).some(Boolean)).length;
}

function PublishMatrix({ works, onOpenWork, onMake }) {
  const [rows, setRows] = React.useState(() => readAllMarks());
  function reload() { setRows(readAllMarks()); }

  // 平台聚合统计
  const platCounts = {};
  PUBLISH_PLATFORMS.forEach(p => { platCounts[p] = 0; });
  rows.forEach(r => {
    Object.entries(r.marks || {}).forEach(([p, ts]) => {
      if (ts && platCounts[p] !== undefined) platCounts[p] += 1;
    });
  });
  const totalMarked = rows.filter(r => Object.values(r.marks).some(Boolean)).length;
  const fullCoverage = rows.filter(r => PUBLISH_PLATFORMS.every(p => r.marks[p])).length;

  // works 按 path 索引便于 join
  const worksByPath = {};
  (works || []).forEach(w => {
    const p = w.local_path || w.local_url || "";
    if (p) worksByPath[p] = w;
    // local_url 形如 /media/works/xx.mp4, 也试 /data/.../...
  });

  if (rows.length === 0) {
    return (
      <div style={{ padding: 60, textAlign: "center", color: T.muted }}>
        <div style={{ fontSize: 44, marginBottom: 12 }}>📤</div>
        <div style={{ fontSize: 15, fontWeight: 600, color: T.text, marginBottom: 6 }}>还没标记过任何已发</div>
        <div style={{ fontSize: 13, marginBottom: 18 }}>
          做完视频在 <b>🎬 做视频 Step 5</b> 各平台卡点 "标记已发" · 这里就会聚合
        </div>
        <Btn variant="primary" onClick={onMake}>去做视频 →</Btn>
      </div>
    );
  }

  return (
    <div>
      {/* 顶部聚合统计 */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginBottom: 18 }}>
        <PubStatCard label="标了已发的视频" value={totalMarked} sub={`共 ${rows.length} 条 publish 记录`} />
        <PubStatCard label="全平台覆盖" value={fullCoverage} sub={`${PUBLISH_PLATFORMS.length} 平台都已发`} />
        {PUBLISH_PLATFORMS.map(p => (
          <PubStatCard key={p} label={p} value={platCounts[p]} sub={`累计已发 ${platCounts[p]} 条`} />
        ))}
      </div>

      <div style={{ marginBottom: 10, display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>📋 视频 × 平台矩阵</div>
        <span style={{ fontSize: 11, color: T.muted2 }}>· 数据本地 (localStorage), 跨设备不同步</span>
        <div style={{ flex: 1 }} />
        <Btn size="sm" onClick={reload}>↻ 刷新</Btn>
      </div>

      {/* 矩阵 */}
      <div style={{ background: "#fff", border: `1px solid ${T.borderSoft}`, borderRadius: 12, overflow: "hidden" }}>
        {/* header */}
        <div style={{
          display: "grid", gridTemplateColumns: `1fr repeat(${PUBLISH_PLATFORMS.length}, 80px) 90px`,
          padding: "10px 14px", background: T.bg2, fontSize: 11, fontWeight: 600, color: T.muted, gap: 8,
        }}>
          <div>视频路径</div>
          {PUBLISH_PLATFORMS.map(p => <div key={p} style={{ textAlign: "center" }}>{p}</div>)}
          <div style={{ textAlign: "center" }}>动作</div>
        </div>
        {rows.map((r, idx) => {
          const w = worksByPath[r.path];
          const basename = r.path.split("/").pop() || r.path;
          return (
            <div key={r.path + idx} style={{
              display: "grid", gridTemplateColumns: `1fr repeat(${PUBLISH_PLATFORMS.length}, 80px) 90px`,
              padding: "10px 14px", borderTop: `1px solid ${T.borderSoft}`, fontSize: 12, alignItems: "center", gap: 8,
            }}>
              <div style={{ minWidth: 0, overflow: "hidden" }}>
                <div style={{ color: T.text, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {w ? (w.title || basename) : basename}
                </div>
                <div style={{ fontSize: 10, color: T.muted2, fontFamily: "SF Mono, monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.path}</div>
              </div>
              {PUBLISH_PLATFORMS.map(p => {
                const ts = r.marks[p];
                return (
                  <div key={p} style={{ textAlign: "center" }}>
                    {ts ? (
                      <span title={`已发于 ${new Date(ts).toLocaleString()}`} style={{ fontSize: 14, color: T.brand }}>✓</span>
                    ) : (
                      <span style={{ fontSize: 14, color: T.muted3 }}>○</span>
                    )}
                  </div>
                );
              })}
              <div style={{ textAlign: "center" }}>
                {w ? (
                  <Btn size="sm" onClick={() => onOpenWork(w)}>查看</Btn>
                ) : (
                  <span style={{ fontSize: 10.5, color: T.muted2 }}>(无 work 关联)</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 10, fontSize: 10.5, color: T.muted2, lineHeight: 1.6 }}>
        💡 标记是本地 (localStorage) 行为, 不调任何后端. 跨设备/换浏览器丢. Phase 4 接 OAuth 后会落库.
      </div>
    </div>
  );
}

function PubStatCard({ label, value, sub }) {
  return (
    <div style={{ padding: 12, background: "#fff", border: `1px solid ${T.borderSoft}`, borderRadius: 10 }}>
      <div style={{ fontSize: 11, color: T.muted2, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: T.text, fontFamily: "SF Mono, monospace" }}>{value}</div>
      {sub && <div style={{ fontSize: 10.5, color: T.muted, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

Object.assign(window, { PageWorks, PublishMatrix, countPublishMarks });
