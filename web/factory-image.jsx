// factory-image.jsx — D-066 出图片二级页 (整合 直接出图 / 即梦 AIGC)
// 顶部 stats 4 卡 + 2 张工具卡 + 最近图片网格

const IMAGE_TOOLS = [
  {
    page: "imagegen", icon: "🖼️", label: "直接出图",
    desc: "一句 prompt → N 张候选 · 16:9 / 9:16 / 1:1 / 3:4 / 4:3 任选 · apimart GPT-Image-2 默认 30-60s/张",
    steps: 1, route_prefix: "image-gen", source_skill: "image-gen",
  },
  {
    page: "dreamina", icon: "🎬", label: "即梦 AIGC",
    desc: "字节即梦 4K 出图 + 图生视频 · 写实 / 国风 / 二次元等多种模型 · 适合高质量产出 60-120s/张",
    steps: 2, route_prefix: "dreamina", source_skill: "dreamina",
  },
];

function PageImage({ onNav }) {
  const [sources, setSources] = React.useState({ by_type: {}, by_source: {}, total: 0 });
  const [recent, setRecent] = React.useState([]);
  const [usage, setUsage] = React.useState(null);
  const [loading, setLoading] = React.useState(true);

  async function load() {
    setLoading(true);
    try {
      const [s, r, u] = await Promise.all([
        api.get("/api/works/sources"),
        api.get("/api/works?type=image&since=today&limit=8"),
        api.get("/api/ai/usage?range=today").catch(() => null),
      ]);
      setSources(s || {});
      setRecent(r || []);
      setUsage(u);
    } catch (e) { console.warn("[image] load failed", e); }
    setLoading(false);
  }
  React.useEffect(() => { load(); }, []);

  const totalImages = sources.by_type?.image || 0;
  const todayImages = recent.length;
  const todayBytes = recent.reduce((s, w) => {
    let m = {}; try { m = JSON.parse(w.metadata || "{}"); } catch (_) {}
    return s + (m.size_bytes || 0);
  }, 0);
  const todayMB = (todayBytes / 1024 / 1024).toFixed(1);

  // 偏好引擎: 看今日哪个 source_skill 用得多
  const todayBySource = {};
  for (const w of recent) todayBySource[w.source_skill] = (todayBySource[w.source_skill] || 0) + 1;
  const hottest = Object.entries(todayBySource).sort((a,b) => b[1] - a[1])[0];
  const hottestSkill = hottest ? hottest[0] : null;
  const hottestLabel = { "image-gen": "直接出图", "dreamina": "即梦",
    "wechat-cover-batch": "公众号封面", "wechat-section-image": "段间图" }[hottestSkill] || (hottestSkill || "—");

  // 工具卡今日次数
  const todayCounts = {};
  for (const t of IMAGE_TOOLS) {
    todayCounts[t.page] = sources.by_source?.[t.source_skill] || 0;  // 累计, 临时
  }
  // 真实今日次数: 看 recent 里的 source_skill
  const todayBySkill = {};
  for (const w of recent) todayBySkill[w.source_skill] = (todayBySkill[w.source_skill] || 0) + 1;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", position: "relative" }}>
      <div style={{ padding: "22px 32px 18px", background: "#fff", borderBottom: `1px solid ${T.border}` }}>
        <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: -0.2 }}>🎨 出图片</div>
        <div style={{ fontSize: 13, color: T.muted, marginTop: 6 }}>AI 帮你出图 · 2 个引擎按场景选</div>
      </div>

      <div style={{ flex: 1, overflow: "auto", padding: "20px 32px 60px", background: T.bg }}>
        <div style={{ maxWidth: 1240, margin: "0 auto" }}>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 24 }}>
            <StatBlock label="🖼️ 今日出图" value={todayImages} sub={`张 · 共 ${todayMB} MB`} />
            <StatBlock label="📂 累计图片" value={totalImages} sub="作品库看全部 →" sublink={() => onNav("works")} />
            <StatBlock label="⚡ AI 消耗" value={`¥${(usage?.overall?.cost_cny || 0).toFixed(2)}`} sub="今日 apimart + 即梦" />
            <StatBlock label="🌟 今日偏好" value={hottestLabel} sub={hottest ? `用了 ${hottest[1]} 次` : "今天还没出图"} small />
          </div>

          <div style={{ fontSize: 13, fontWeight: 600, color: T.muted, letterSpacing: "0.06em", marginBottom: 14 }}>选个引擎开始</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 14 }}>
            {IMAGE_TOOLS.map(tool => (
              <ToolCard key={tool.page} tool={tool} count={todayBySkill[tool.source_skill] || 0} onClick={() => onNav(tool.page)} />
            ))}
          </div>

          {recent.length > 0 && (
            <>
              <div style={{ fontSize: 13, fontWeight: 600, color: T.muted, letterSpacing: "0.06em", margin: "32px 0 14px", display: "flex", alignItems: "center" }}>
                <span>最近出过的图</span>
                <span style={{ fontSize: 11.5, color: T.muted2, fontWeight: 400, marginLeft: 8 }}>· 今天 {recent.length} 张</span>
                <div style={{ flex: 1 }} />
                <span onClick={() => onNav("works")} style={{ fontSize: 12, color: T.brand, cursor: "pointer", fontWeight: 500 }}>看全部 →</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
                {recent.map(w => <RecentImageCard key={w.id} w={w} onClick={() => onNav("works")} />)}
              </div>
            </>
          )}

          {recent.length === 0 && !loading && (
            <div style={{ marginTop: 32, padding: 30, textAlign: "center", color: T.muted2, background: "#fff", border: `1px solid ${T.borderSoft}`, borderRadius: 12 }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>🖼️</div>
              <div style={{ fontSize: 13.5, color: T.muted }}>今天还没出过图 · 点上面任一引擎开始</div>
            </div>
          )}

        </div>
      </div>

      <LiDock context="出图片" />
    </div>
  );
}

function RecentImageCard({ w, onClick }) {
  const sourceLabels = {
    "image-gen": "🖼️ 直接出图",
    "wechat-cover": "📄 公众号封面", "wechat-cover-batch": "📄 封面批量",
    "wechat-section-image": "📄 段间图", "dreamina": "🎬 即梦 AIGC",
  };
  const ts = new Date(w.created_at * 1000);
  const time = `${String(ts.getHours()).padStart(2,"0")}:${String(ts.getMinutes()).padStart(2,"0")}`;
  let meta = {}; try { meta = JSON.parse(w.metadata || "{}"); } catch (_) {}
  const sizeKB = meta.size_bytes ? Math.round(meta.size_bytes / 1024) : null;
  const sizeText = sizeKB ? (sizeKB > 1024 ? `${(sizeKB/1024).toFixed(1)} MB` : `${sizeKB} KB`) : null;

  return (
    <div onClick={onClick} style={{
      background: "#fff", border: `1px solid ${T.borderSoft}`, borderRadius: 12, overflow: "hidden",
      cursor: "pointer", transition: "transform .12s, box-shadow .12s",
    }}
    onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 4px 16px rgba(0,0,0,0.06)"; }}
    onMouseLeave={e => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = ""; }}>
      <div style={{ position: "relative", aspectRatio: "16/10", background: T.bg3 }}>
        {w.thumb_url ? (
          <img src={api.media(w.thumb_url)} alt={w.title || ""} loading="lazy"
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        ) : (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: T.muted2, fontSize: 28 }}>🖼️</div>
        )}
        <div style={{ position: "absolute", top: 8, left: 8 }}>
          <span style={{ padding: "3px 9px", borderRadius: 100, background: "rgba(255,255,255,0.92)", color: T.text, fontSize: 10.5, fontWeight: 500, border: "1px solid rgba(0,0,0,0.04)" }}>
            {sourceLabels[w.source_skill] || w.source_skill}
          </span>
        </div>
        {sizeText && (
          <div style={{ position: "absolute", bottom: 8, right: 8, padding: "2px 7px", borderRadius: 5, background: "rgba(0,0,0,0.6)", color: "#fff", fontSize: 10 }}>
            {sizeText}
          </div>
        )}
      </div>
      <div style={{ padding: "9px 12px" }}>
        <div style={{ fontSize: 12, fontWeight: 500, color: T.text, lineHeight: 1.4, marginBottom: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {w.title || "(无标题)"}
        </div>
        <div style={{ fontSize: 10.5, color: T.muted2 }}>今天 {time}</div>
      </div>
    </div>
  );
}

Object.assign(window, { PageImage });
