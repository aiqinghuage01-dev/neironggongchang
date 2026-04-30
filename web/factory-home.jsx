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
              {greetingByHour()},清华哥 👋
            </div>
            <div style={{ fontSize: 17, color: T.muted, lineHeight: 1.6 }}>
              今天想做点什么?从下面挑一个开始就行。
            </div>
          </div>

          {/* D-066: 6 个一级入口对齐侧栏 */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 36 }}>
            <BigAction
              icon="🎬" title="做视频" subtitle="链接 → 文案 → 声音 → 数字人 → 剪辑"
              stat={make.hint || "最高频动作"} hot
              onClick={() => onNav("make")}
            />
            <BigAction
              icon="📄" title="公众号" subtitle="方法论长文 · 2000+ 字 · 自动排版"
              stat={stats?.wechat?.hint || "本周还没写过公众号"}
              onClick={() => onNav("wechat")}
            />
            <BigAction
              icon="📱" title="朋友圈" subtitle="一个话题 → 5 条 + 配图 + 一键复制"
              stat={stats?.moments?.hint || "今日还没发朋友圈"}
              onClick={() => onNav("moments")}
            />
            <BigAction
              icon="✏️" title="写文案" subtitle="投流 / 改写 / 策划 / 审查 6 个写作工具"
              stat="6 个工具按场景分"
              onClick={() => onNav("write")}
            />
            <BigAction
              icon="🎨" title="出图片" subtitle="直接出图 / 即梦图片/视频 · 一句话出图"
              stat="2 种方式按场景选"
              onClick={() => onNav("image")}
            />
            <BigAction
              icon="🧪" title="科技与狠活" subtitle="研发部状态 · 自动派工进度"
              stat="看谁在干活"
              onClick={() => onNav("beta")}
            />
          </div>

          {/* 🌙 小华夜班播报 (D-040e) · 时间联动 · 0 产出整块隐藏 */}
          <NightDigestCard onNav={onNav} />

          {/* 今日最热一条:接 /api/hot-topics 第一条 */}
          {hot ? (
            <div style={{
              display: "flex", alignItems: "center", gap: 14, padding: "18px 22px",
              background: "linear-gradient(135deg, #fffaf0 0%, #fff 60%)",
              borderRadius: 14, border: `1px solid ${T.amber}33`,
              boxShadow: "0 1px 3px rgba(180,88,9,0.05)",
            }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: T.amber, minWidth: 56 }}>🔥{hot.heat_score || 0}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <Tag size="xs" color="pink">{hot.platform || "?"}</Tag>
                  {hot.match_persona && <Tag size="xs" color="green">✨ 匹配你定位</Tag>}
                  <span style={{ fontSize: 11, color: T.muted2 }}>· 今日最热</span>
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{hot.title}</div>
                {hot.match_reason && <div style={{ fontSize: 12, color: T.muted, marginTop: 3 }}>{hot.match_reason}</div>}
              </div>
              {/* D-062-AUDIT-4 fix: 之前 onNav("make") 不带 seed, 用户白点 */}
              <Btn variant="primary" size="md" onClick={() => {
                try {
                  const seed = `# 今日最热 (${hot.platform || "?"} · 热度 ${hot.heat_score || 0})\n${hot.title}\n${hot.match_reason ? "\n匹配原因: " + hot.match_reason : ""}\n\n---\n\n口播正文:\n`;
                  localStorage.setItem("make_v2_seed_script", seed);
                  localStorage.setItem("make_v2_seed_from", JSON.stringify({
                    skill: "hot-topic", title: (hot.title || "").slice(0, 30), ts: Date.now(),
                  }));
                } catch (_) {}
                onNav("make");
              }}>做成视频 →</Btn>
            </div>
          ) : (
            // D-062-AUDIT-4: 首页 hot 空, 给 NightHotFlywheel CTA (与 PageMakeV2 / Materials 一致)
            <div style={{ background: "#fff", borderRadius: 12, border: `1px dashed ${T.borderSoft}`, padding: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <span style={{ fontSize: 18 }}>🔥</span>
                <span style={{ fontSize: 13, color: T.muted }}>今天还没维护热点 · 启动飞轮让小华夜里抓 ↓</span>
              </div>
              <NightHotFlywheel onTopics={() => api.get("/api/stats/home").then(setStats).catch(() => {})} compact />
            </div>
          )}

          {/* 今日 AI 消耗 widget (D-015) */}
          {usage && usage.overall?.calls > 0 && <AiUsageCard usage={usage} />}

          {/* 技能中心 (D-019) */}
          {catalog && catalog.length > 0 && <SkillCenter catalog={catalog} onNav={onNav} />}
        </div>
      </div>
    </div>
  );
}

function SkillCenter({ catalog, onNav }) {
  const installed = catalog.filter(s => s.installed);
  const unregistered = catalog.filter(s => !s.installed);
  const [showUnreg, setShowUnreg] = React.useState(false);

  return (
    <div style={{ marginTop: 28 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: T.text }}>🛠️ 子工具速选</div>
        <div style={{ fontSize: 12, color: T.muted }}>
          已接入 {installed.length} 个{unregistered.length > 0 ? ` · 还有 ${unregistered.length} 个可接入` : ""}
        </div>
        <div style={{ fontSize: 11.5, color: T.muted2, marginLeft: "auto" }}>
          · 也可以从生产部「✏️ 写文案 / 🎨 出图片」进入
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
            {showUnreg ? "↑ 收起" : "↓ 展开"} 还有 {unregistered.length} 个技能没接入
          </button>
          {showUnreg && (
            <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
              {unregistered.map(s => (
                <div key={s.slug} style={{
                  padding: "12px", background: T.bg2,
                  border: `1px dashed ${T.borderSoft}`, borderRadius: 8,
                  fontSize: 12, color: T.muted, opacity: 0.85,
                }}>
                  <div style={{ fontSize: 13, color: T.muted, marginBottom: 4 }}>
                    {s.icon} {s.label}
                  </div>
                  <div style={{ fontSize: 11, color: T.muted2 }}>
                    去 ⚙️ 设置接入这个技能
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
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <div style={{ fontSize: 14.5, fontWeight: 600, color: T.text }}>{skill.label}</div>
        </div>
        <div style={{ fontSize: 11.5, color: T.muted, lineHeight: 1.55 }}>{skill.subtitle}</div>
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
      marginTop: 16, padding: "16px 20px", background: "#fff",
      borderRadius: 14, border: `1px solid ${T.borderSoft}`,
      boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
      display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap",
    }}>
      {/* D-069: 首页 AI 消耗看板去技术词. tokens → "字" (1 token≈0.7 字), engine 名 → 友好昵称 */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 16 }}>📊</span>
        <div>
          <div style={{ fontSize: 11.5, color: T.muted2, fontWeight: 600, letterSpacing: "0.08em" }}>今天用了多少 AI</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: T.text }}>
            {o.calls} 次 · 约 {Math.round((o.total_tokens || 0) * 0.7 / 1000)}K 字
          </div>
        </div>
      </div>
      <div style={{ width: 1, height: 32, background: T.borderSoft }} />
      <div>
        <div style={{ fontSize: 11.5, color: T.muted2, fontWeight: 600, letterSpacing: "0.08em" }}>今天花了</div>
        <div style={{ fontSize: 15, fontWeight: 600, color: o.cost_cny >= 5 ? T.amber : T.text, fontFamily: "SF Mono, monospace" }}>
          ¥{o.cost_cny.toFixed(2)}
        </div>
      </div>
      <div style={{ flex: 1 }} />
      <div style={{ display: "flex", gap: 10 }}>
        {engines.map(e => {
          const nick = e.engine === "opus" ? "深度 AI" : (e.engine === "deepseek" ? "快速 AI" : e.engine);
          return (
            <div key={e.engine} style={{
              padding: "4px 10px", borderRadius: 100, fontSize: 11,
              background: e.engine === "opus" ? T.amberSoft : T.brandSoft,
              color: e.engine === "opus" ? T.amber : T.brand,
              fontWeight: 600,
            }}>
              {nick} {e.calls} 次 · ¥{e.cost_cny.toFixed(2)}
            </div>
          );
        })}
      </div>
      {o.fails > 0 && (
        <div style={{ fontSize: 11, color: T.red, background: T.redSoft, padding: "3px 8px", borderRadius: 100 }}>
          ⚠️ {o.fails} 次失败
        </div>
      )}
      <RetryStatChip />
    </div>
  );
}

// T9 D-082c retry 命中率小卡片 — 老板看 AI 抽风兜底有没在 work
function RetryStatChip() {
  const [s, setS] = React.useState(null);
  React.useEffect(() => {
    api.get("/api/llm-retry/stats").then(setS).catch(() => {});
    const t = setInterval(() => api.get("/api/llm-retry/stats").then(setS).catch(() => {}), 60000);
    return () => clearInterval(t);
  }, []);
  if (!s || !s.retried) return null;  // 没触发就不显
  return (
    <div title={`AI 调用偶发抽风时自动重试 1 次. 救活率: ${s.save_rate_pct}%`}
      style={{ fontSize: 11, color: T.brand, background: T.brandSoft, padding: "3px 8px", borderRadius: 100, fontWeight: 600 }}>
      🔁 AI 抽风重试 {s.retried} 次 · 救活 {s.saved_after_retry}
    </div>
  );
}

function BigAction({ icon, title, subtitle, stat, hot, onClick }) {
  const [hover, setHover] = React.useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        padding: "26px 26px 22px", background: "#fff",
        border: `${hot ? 1.5 : 1}px solid ${hot || hover ? T.brand : T.borderSoft}`,
        boxShadow: hot
          ? `0 0 0 4px ${T.brandSoft}, 0 6px 20px rgba(47,122,82,0.10)`
          : hover
            ? `0 4px 16px rgba(47,122,82,0.10)`
            : "0 1px 2px rgba(0,0,0,0.03)",
        borderRadius: 16, cursor: "pointer", transition: "all 0.15s",
        minHeight: 150,
        position: "relative",
      }}
    >
      <div style={{ fontSize: 40, marginBottom: 14, lineHeight: 1 }}>{icon}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <div style={{ fontSize: 19, fontWeight: 700, color: T.text }}>{title}</div>
        {hot && <Tag size="xs" color="green">最常用</Tag>}
      </div>
      <div style={{ fontSize: 13, color: T.muted, lineHeight: 1.6, marginBottom: 14 }}>{subtitle}</div>
      <div style={{ fontSize: 12, color: hover ? T.brand : T.muted2, fontWeight: hover ? 500 : 400 }}>
        {stat}
        {hover && <span style={{ float: "right", color: T.brand }}>开始 →</span>}
      </div>
    </div>
  );
}

function formatToday() {
  const d = new Date();
  const week = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][d.getDay()];
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日 · ${week}`;
}

function greetingByHour() {
  const h = new Date().getHours();
  if (h < 5)  return "夜深了"; // 0-4 凌晨
  if (h < 11) return "早上好";  // 5-10
  if (h < 14) return "中午好";  // 11-13
  if (h < 18) return "下午好";  // 14-17
  if (h < 23) return "晚上好";  // 18-22
  return "夜深了";              // 23
}

// ─── 🌙 小华夜班播报卡 (D-040e) ────────────────────────────
// 6:00-22:00 → "昨晚小华帮你做了 X 件事" + 产出条目
// 22:00-6:00 → "今晚 23:00 起跑 N 条任务" + 任务预告
// 0 产出 / 0 任务 → 整块隐藏 (不要 "暂无" 占位)

const NIGHT_DIGEST_TARGET_LABELS = {
  materials: { label: "看选题", page: "materials" },
  works:     { label: "去作品库审", page: "works" },
  knowledge: { label: "看一眼", page: "knowledge" },
  home:      { label: "看总部", page: "home" },
};

function NightDigestCard({ onNav }) {
  const hour = new Date().getHours();
  const isDayMode = hour >= 6 && hour < 22;

  const [digest, setDigest] = React.useState(null);
  const [tonight, setTonight] = React.useState(null);

  React.useEffect(() => {
    if (isDayMode) {
      api.get("/api/night/digest?since_hours=24")
        .then(setDigest).catch(() => setDigest({ items: [], total_runs: 0 }));
    } else {
      api.get("/api/night/jobs?enabled_only=true")
        .then(r => setTonight((r.jobs || []).filter(j => j.trigger_type === "cron")))
        .catch(() => setTonight([]));
    }
  }, [isDayMode]);

  if (isDayMode) {
    if (!digest) return null;
    if (!digest.items || digest.items.length === 0) return null;
    return <NightDigestDay items={digest.items} onNav={onNav} />;
  }
  // 夜班模式
  if (!tonight) return null;
  if (tonight.length === 0) return null;
  return <NightDigestNight jobs={tonight} onNav={onNav} />;
}

function NightDigestDay({ items, onNav }) {
  return (
    <div style={{
      padding: "18px 22px", marginBottom: 16,
      background: "linear-gradient(135deg, #fff8ec, #fff)",
      border: `1px solid ${T.amber}33`, borderRadius: 14,
      boxShadow: "0 1px 3px rgba(180,88,9,0.06)",
    }}>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 10 }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: T.text }}>
          🌙 昨晚小华帮你做了 {items.length} 件事
        </span>
        <div style={{ flex: 1 }} />
        <span onClick={() => onNav("nightshift")}
          style={{ fontSize: 11.5, color: T.brand, cursor: "pointer", fontWeight: 500 }}>
          全部 →
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {items.slice(0, 4).map(it => {
          const t = NIGHT_DIGEST_TARGET_LABELS[it.output_target] || null;
          return (
            <div key={it.run_id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: T.text }}>
              <span style={{ color: T.muted2, minWidth: 14 }}>•</span>
              <span style={{ fontSize: 14, lineHeight: 1 }}>{it.icon || "🌙"}</span>
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                <span style={{ fontWeight: 500 }}>{it.job_name || "任务"}</span>
                {it.output_summary ? <span style={{ color: T.muted, marginLeft: 6 }}>· {it.output_summary}</span> : null}
              </span>
              {t && (
                <span onClick={() => onNav(t.page)}
                  style={{ fontSize: 11, color: T.brand, cursor: "pointer", whiteSpace: "nowrap" }}>
                  → {t.label}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function NightDigestNight({ jobs, onNav }) {
  // 算今晚最早 fire 的时间(粗糙: 取所有 cron 的小时部分最早值)
  const earliestHour = jobs.reduce((min, j) => {
    const m = (j.trigger_config?.cron || "").match(/^\S+\s+(\d+)\s/);
    if (m) {
      const h = parseInt(m[1], 10);
      if (!isNaN(h) && h < min) return h;
    }
    return min;
  }, 24);

  const tonightLabel = earliestHour < 24
    ? `今晚 ${String(earliestHour).padStart(2, "0")}:00 起跑 ${jobs.length} 条任务`
    : `今晚有 ${jobs.length} 条任务待跑`;

  return (
    <div style={{
      padding: "18px 22px", marginBottom: 16,
      background: "linear-gradient(135deg, #f0f3ff, #fff)",
      border: `1px solid ${T.blue}22`, borderRadius: 14,
      boxShadow: "0 1px 3px rgba(30,64,175,0.05)",
    }}>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 8 }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: T.text }}>
          🌙 {tonightLabel}
        </span>
        <div style={{ flex: 1 }} />
        <span onClick={() => onNav("nightshift")}
          style={{ fontSize: 11.5, color: T.brand, cursor: "pointer", fontWeight: 500 }}>
          看清单 →
        </span>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {jobs.slice(0, 8).map(j => (
          <span key={j.id} style={{
            fontSize: 11.5, padding: "3px 10px", borderRadius: 100,
            background: T.bg2, color: T.muted, display: "inline-flex", alignItems: "center", gap: 4,
          }}>
            <span style={{ fontSize: 12 }}>{j.icon || "🌙"}</span>
            {j.name}
          </span>
        ))}
      </div>
    </div>
  );
}

Object.assign(window, { PageHome, NightDigestCard });
