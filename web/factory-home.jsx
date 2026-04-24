// factory-home.jsx — 首页 A(问候型,1:1 对齐 factory3-home.jsx V3HomeGreet)

function PageHome({ onNav }) {
  const [stats, setStats] = React.useState(null);
  const [usage, setUsage] = React.useState(null);
  const [catalog, setCatalog] = React.useState(null);
  React.useEffect(() => {
    api.get("/api/stats/home").then(setStats).catch(() => {});
    api.get("/api/ai/usage?range=today").then(setUsage).catch(() => {});
    api.get("/api/skills/catalog").then(r => setCatalog(r.skills || [])).catch(() => {});
    // 每 30 秒刷新 usage
    const t = setInterval(() => api.get("/api/ai/usage?range=today").then(setUsage).catch(() => {}), 30000);
    return () => clearInterval(t);
  }, []);

  const make = stats?.make || {};
  const hot = stats?.hot;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", position: "relative" }}>
      <div style={{ flex: 1, overflow: "auto", background: T.bg }}>
        <div style={{ maxWidth: 980, margin: "0 auto", padding: "70px 40px 120px" }}>
          <div style={{ marginBottom: 50 }}>
            <div style={{ fontSize: 13, color: T.muted, marginBottom: 10, fontWeight: 500 }}>{formatToday()}</div>
            <div style={{ fontSize: 44, fontWeight: 700, color: T.text, letterSpacing: "-0.02em", marginBottom: 14, lineHeight: 1.15 }}>
              早上好,清华哥 👋
            </div>
            <div style={{ fontSize: 17, color: T.muted, lineHeight: 1.6 }}>
              今天想做点什么?从下面挑一个开始就行。
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 32 }}>
            <BigAction
              icon="🎬" title="做条短视频" subtitle="链接 → 文案 → 声音 → 数字人 → 剪辑 → 发布"
              stat={make.hint || "最高频动作"} hot
              onClick={() => onNav("make")}
            />
            <BigAction
              icon="💰" title="写投流文案" subtitle="一个卖点 · 批量出 5 版 · 自动挑最佳"
              stat={stats?.ad?.hint || "Phase 2 已通 · 5 版批量"}
              onClick={() => onNav("ad")}
            />
            <BigAction
              icon="📄" title="写公众号" subtitle="方法论长文 · 2000+ 字 · 自动排版"
              stat={stats?.wechat?.hint || "Phase 2 已通 · 大纲+长文"}
              onClick={() => onNav("wechat")}
            />
            <BigAction
              icon="📱" title="发朋友圈" subtitle="从金句库衍生 3 条 · 配图 · 一键复制"
              stat={stats?.moments?.hint || "Phase 2 已通 · 衍生 5 条"}
              onClick={() => onNav("moments")}
            />
          </div>

          {/* 今日最热一条:接 /api/hot-topics 第一条 */}
          {hot ? (
            <div style={{
              display: "flex", alignItems: "center", gap: 14, padding: "16px 20px",
              background: "#fff", borderRadius: 12, border: `1px solid ${T.borderSoft}`,
            }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: T.amber, minWidth: 52 }}>🔥{hot.heat_score || 0}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <Tag size="xs" color="pink">{hot.platform || "?"}</Tag>
                  {hot.match_persona && <Tag size="xs" color="green">✨ 匹配你定位</Tag>}
                  <span style={{ fontSize: 11, color: T.muted2 }}>· 今日最热</span>
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{hot.title}</div>
                {hot.match_reason && <div style={{ fontSize: 12, color: T.muted, marginTop: 3 }}>{hot.match_reason}</div>}
              </div>
              <Btn variant="primary" size="md" onClick={() => onNav("make")}>做成视频 →</Btn>
            </div>
          ) : (
            <div style={{
              display: "flex", alignItems: "center", gap: 14, padding: "16px 20px",
              background: T.bg2, borderRadius: 12, border: `1px dashed ${T.borderSoft}`,
              fontSize: 13, color: T.muted,
            }}>
              <span style={{ fontSize: 20 }}>🔥</span>
              <span>今天还没维护热点 · 去 <span style={{ color: T.brand, cursor: "pointer", fontWeight: 600 }} onClick={() => onNav("materials")}>📥 素材库 · 热点 Tab</span> 粘一条当日最热的</span>
            </div>
          )}

          {/* 今日 AI 消耗 widget (D-015) */}
          {usage && usage.overall?.calls > 0 && <AiUsageCard usage={usage} />}

          {/* 技能中心 (D-019) */}
          {catalog && catalog.length > 0 && <SkillCenter catalog={catalog} onNav={onNav} />}
        </div>
      </div>
      <LiDock context="首页" />
    </div>
  );
}

function SkillCenter({ catalog, onNav }) {
  const installed = catalog.filter(s => s.installed);
  const unregistered = catalog.filter(s => !s.installed);
  const [showUnreg, setShowUnreg] = React.useState(false);

  return (
    <div style={{ marginTop: 28 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 14 }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: T.text }}>🛠️ 我的技能</div>
        <div style={{ fontSize: 12, color: T.muted }}>
          已接入 {installed.length} · 桌面还有 {unregistered.length} 个可接入
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
        {installed.map(s => (
          <SkillCard key={s.slug} skill={s} onNav={onNav} />
        ))}
      </div>

      {unregistered.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <button onClick={() => setShowUnreg(!showUnreg)} style={{
            padding: "6px 12px", background: "transparent",
            border: `1px dashed ${T.border}`, borderRadius: 8,
            color: T.muted, fontSize: 12, cursor: "pointer", fontFamily: "inherit",
          }}>
            {showUnreg ? "↑ 收起" : "↓ 展开"} 桌面 ~/Desktop/skills/ 里还没接入的 {unregistered.length} 个 skill
          </button>
          {showUnreg && (
            <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
              {unregistered.map(s => (
                <div key={s.slug} style={{
                  padding: "10px 12px", background: T.bg2,
                  border: `1px dashed ${T.borderSoft}`, borderRadius: 8,
                  fontSize: 12, color: T.muted, opacity: 0.7,
                }}>
                  <div style={{ fontSize: 13, color: T.muted, marginBottom: 2 }}>
                    {s.icon} {s.label}
                  </div>
                  <div style={{ fontSize: 10.5, color: T.muted2, fontFamily: "SF Mono, monospace" }}>
                    python3 scripts/add_skill.py<br/>
                    --slug "{s.slug}" --key &lt;py_id&gt;
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SkillCard({ skill, onNav }) {
  const [hover, setHover] = React.useState(false);
  const mtime = skill.skill_md_mtime;
  const ago = mtime ? timeAgo(mtime) : "";
  return (
    <div
      onClick={() => skill.page_id && onNav(skill.page_id)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        padding: "14px 16px", background: "#fff",
        border: `1px solid ${hover ? T.brand : T.borderSoft}`,
        boxShadow: hover ? `0 0 0 3px ${T.brandSoft}` : "none",
        borderRadius: 10, cursor: "pointer", transition: "all 0.15s",
        display: "flex", gap: 12, alignItems: "flex-start",
      }}>
      <div style={{ fontSize: 24, lineHeight: 1, flexShrink: 0 }}>{skill.icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
          <div style={{ fontSize: 14.5, fontWeight: 600, color: T.text }}>{skill.label}</div>
          <span style={{ fontSize: 10, color: T.muted2, fontFamily: "SF Mono, monospace" }}>{skill.steps} 步</span>
          {skill.has_scripts && <Tag size="xs" color="green">含脚本</Tag>}
        </div>
        <div style={{ fontSize: 11.5, color: T.muted, lineHeight: 1.55, marginBottom: 4 }}>{skill.subtitle}</div>
        <div style={{ fontSize: 10, color: T.muted2, fontFamily: "SF Mono, monospace" }}>
          {skill.slug} · SKILL.md {ago}
        </div>
      </div>
    </div>
  );
}

function timeAgo(ts) {
  const now = Date.now() / 1000;
  const diff = now - ts;
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
  if (diff < 86400 * 30) return `${Math.floor(diff / 86400)} 天前`;
  return new Date(ts * 1000).toLocaleDateString("zh-CN");
}

function AiUsageCard({ usage }) {
  const o = usage.overall || {};
  const engines = usage.by_engine || [];
  return (
    <div style={{
      marginTop: 16, padding: "14px 18px", background: "#fff",
      borderRadius: 12, border: `1px solid ${T.borderSoft}`,
      display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 16 }}>📊</span>
        <div>
          <div style={{ fontSize: 11.5, color: T.muted2, fontWeight: 600, letterSpacing: "0.08em" }}>今日 AI 消耗</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: T.text }}>
            {o.calls} 次 · {(o.total_tokens / 1000).toFixed(1)}K tokens
          </div>
        </div>
      </div>
      <div style={{ width: 1, height: 32, background: T.borderSoft }} />
      <div>
        <div style={{ fontSize: 11.5, color: T.muted2, fontWeight: 600, letterSpacing: "0.08em" }}>估算成本</div>
        <div style={{ fontSize: 15, fontWeight: 600, color: o.cost_cny >= 5 ? T.amber : T.text, fontFamily: "SF Mono, monospace" }}>
          ¥{o.cost_cny.toFixed(2)} <span style={{ fontSize: 11, color: T.muted2, fontWeight: 400 }}>(${o.cost_usd.toFixed(3)})</span>
        </div>
      </div>
      <div style={{ flex: 1 }} />
      <div style={{ display: "flex", gap: 10 }}>
        {engines.map(e => (
          <div key={e.engine} style={{
            padding: "4px 10px", borderRadius: 100, fontSize: 11,
            background: e.engine === "opus" ? T.amberSoft : T.brandSoft,
            color: e.engine === "opus" ? T.amber : T.brand,
            fontWeight: 600, fontFamily: "SF Mono, monospace",
          }}>
            {e.engine} {e.calls} 次 · {(e.total_tokens/1000).toFixed(1)}K · ¥{e.cost_cny.toFixed(2)}
          </div>
        ))}
      </div>
      {o.fails > 0 && (
        <div style={{ fontSize: 11, color: T.red, background: T.redSoft, padding: "3px 8px", borderRadius: 100 }}>
          ⚠️ {o.fails} 次失败
        </div>
      )}
    </div>
  );
}

function BigAction({ icon, title, subtitle, stat, hot, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        padding: "24px 24px 20px", background: "#fff",
        border: `1px solid ${hot ? T.brand : T.borderSoft}`,
        boxShadow: hot ? `0 0 0 3px ${T.brandSoft}` : "none",
        borderRadius: 14, cursor: "pointer", transition: "all 0.15s",
        minHeight: 140,
      }}
    >
      <div style={{ fontSize: 36, marginBottom: 12, lineHeight: 1 }}>{icon}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <div style={{ fontSize: 18, fontWeight: 600, color: T.text }}>{title}</div>
        {hot && <Tag size="xs" color="green">最常用</Tag>}
      </div>
      <div style={{ fontSize: 12.5, color: T.muted, lineHeight: 1.55, marginBottom: 12 }}>{subtitle}</div>
      <div style={{ fontSize: 11.5, color: T.muted2 }}>{stat}</div>
    </div>
  );
}

function formatToday() {
  const d = new Date();
  const week = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][d.getDay()];
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日 · ${week}`;
}

Object.assign(window, { PageHome });
