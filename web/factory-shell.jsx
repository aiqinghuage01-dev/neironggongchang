// factory-shell.jsx — 窄侧栏 + 浮动小华 dock(LiDock)
// 1:1 还原 docs/design_v3/factory3-shell.jsx

// D-040d 信息架构: 工厂四大板块 (首页→总部 + 生产部 / 档案部 / 夜班分组)
// D-066: 生产部从 11 个收纳到 6 个 (写文案/出图片/黑科技 是 3 个二级页, 子工具进入对应二级页)
// D-068b: 总部入口移到品牌行 (🏭 清华哥内容工厂 → home), 原 NAV_TOP 槽位让给"战略部"
const NAV_TOP = [{ id: "strategy", icon: "🧭", label: "战略部" }];
const NAV_MAIN = [
  { id: "make", icon: "🎬", label: "做视频" },
  { id: "wechat", icon: "📄", label: "公众号" },
  { id: "moments", icon: "📱", label: "朋友圈" },
  { id: "write", icon: "✏️", label: "写文案" },
  { id: "image", icon: "🎨", label: "出图片" },
  { id: "beta", icon: "🧪", label: "黑科技" },
];
const NAV_ASSETS = [
  { id: "materials", icon: "📥", label: "素材库" },
  { id: "works", icon: "🗂️", label: "作品库" },
  { id: "knowledge", icon: "📚", label: "知识库" },
];
const NAV_NIGHT = [{ id: "nightshift", icon: "🦉", label: "小华夜班" }];
const NAV_BOTTOM = [{ id: "settings", icon: "⚙️", label: "设置" }];

// D-066: 旧 sidebar 一级入口已收纳到「写文案 / 出图片」二级页, 但保留 id 让
// (a) ?page=xxx 深链 + 二级页 onNav 跳转还能用
// (b) tests/test_skills_smoke.py::test_skills_in_sidebar 能找到 skill id
// 这个数组不被 sidebar 渲染消费, 仅做注册 + 文档.
const LEGACY_NAV_HIDDEN = [
  { id: "ad", icon: "💰", label: "投流文案" },         // 进 写文案 二级页
  { id: "hotrewrite", icon: "🔥", label: "热点改写" },
  { id: "voicerewrite", icon: "🎙️", label: "录音改写" },
  { id: "baokuan", icon: "✍️", label: "爆款改写" },
  { id: "planner", icon: "🗓️", label: "内容策划" },
  { id: "compliance", icon: "🛡️", label: "违规审查" },
  { id: "imagegen", icon: "🖼️", label: "直接出图" },   // 进 出图片 二级页
  { id: "dreamina", icon: "🎨", label: "即梦 AIGC" },
];

// D-066: 部门 = group, 含 icon + label + 工具列表
const SECTIONS = [
  { id: "main",   icon: "🏭", label: "生产部", items: NAV_MAIN },
  { id: "assets", icon: "📦", label: "档案部", items: NAV_ASSETS },
  { id: "night",  icon: "🌙", label: "值班室", items: NAV_NIGHT },
];

// D-066: 部门 header (双层纸叠风格) — 白卡 + emoji + 大粗字
function SectionHeader({ section, expanded }) {
  if (!expanded) {
    // 窄态: 用一条细分隔线 + 部门 emoji 当锚点
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: "10px 0 6px" }}>
        <span style={{ fontSize: 14, opacity: 0.6 }}>{section.icon}</span>
      </div>
    );
  }
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      padding: "10px 14px", margin: "10px 0 0",
      background: "#fff",
      border: `1px solid ${T.border}`,
      borderRadius: 10,
      fontSize: 13.5, fontWeight: 700, color: T.text,
      boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
      position: "relative", zIndex: 2,
    }}>
      <span style={{ fontSize: 17 }}>{section.icon}</span>
      <span>{section.label}</span>
    </div>
  );
}

function Sidebar({ active, onNav }) {
  const [hover, setHover] = React.useState(false);
  const w = hover ? 220 : 60;  // D-066: 展开宽度从 164 → 220 容纳新版部门 header
  // D-062dd: 各 skill "今日产出" 计数 (拉一次 + 5 min 刷一次 + api 调用后立刻刷)
  // D-062-AUDIT-6-todo1: 加 api-call event listener, OK 的 POST 调用后 1.5s 延后刷
  // (1.5s 等 ai_calls 落库, 避免拉到旧值)
  const [counts, setCounts] = React.useState({});
  React.useEffect(() => {
    function refresh() {
      api.get("/api/stats/home")
        .then(r => setCounts(r.sidebar_counts || {}))
        .catch(() => {});
    }
    refresh();
    const t = setInterval(refresh, 5 * 60 * 1000);

    // D-062-AUDIT-6-todo1: 监听 api-call event, OK POST 后延后刷
    const handler = (e) => {
      const info = e.detail || {};
      if (info.ok && info.method === "POST" && info.path && /\/api\/(touliu|wechat|moments|hotrewrite|voicerewrite|baokuan|planner|compliance|dreamina|cover|video)\b/.test(info.path)) {
        setTimeout(refresh, 1500);
      }
    };
    window.addEventListener("api-call", handler);
    return () => { clearInterval(t); window.removeEventListener("api-call", handler); };
  }, []);

  return (
    <aside
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: w, transition: "width 0.18s", flexShrink: 0,
        background: "#fff", borderRight: `1px solid ${T.border}`,
        display: "flex", flexDirection: "column", padding: "14px 10px",
        overflow: "hidden",
      }}
    >
      {/* D-068b: 品牌行 = 总部入口. 整行点击 → home, hover 高亮, active(home) 时变品牌色 */}
      <div
        onClick={() => onNav("home")}
        title="进总部 (首页)"
        style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "4px 6px 14px", marginBottom: 6,
          borderBottom: `1px solid ${T.borderSoft}`,
          cursor: "pointer",
          background: active === "home" ? T.brandSoft : "transparent",
          borderRadius: 8,
          transition: "background 0.15s",
        }}
      >
        <div style={{ width: 30, height: 30, borderRadius: 8, background: T.brand, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 16 }}>🏭</div>
        {hover && (
          <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: T.text, whiteSpace: "nowrap" }}>清华哥内容工厂</div>
            <div style={{
              fontSize: 11, fontWeight: 500,
              color: active === "home" ? T.brand : T.muted,
              whiteSpace: "nowrap",
              display: "flex", alignItems: "center", gap: 4,
            }}>
              <span>🏠</span><span>总部</span>
            </div>
          </div>
        )}
      </div>

      {NAV_TOP.map((n) => (
        <NavItem key={n.id} item={n} active={active === n.id} expanded={hover} onClick={() => onNav(n.id)} count={counts[n.id]} />
      ))}

      {SECTIONS.map((sec) => (
        <React.Fragment key={sec.id}>
          <SectionHeader section={sec} expanded={hover} />
          {hover ? (
            <div style={{
              background: T.bg2,
              border: `1px solid ${T.borderSoft}`,
              borderTop: "none",
              borderRadius: "0 0 10px 10px",
              padding: "6px 6px 8px",
              margin: "-3px 6px 0",
            }}>
              {sec.items.map((n) => (
                <NavItem key={n.id} item={n} active={active === n.id} expanded={hover} onClick={() => onNav(n.id)} count={counts[n.id]} flat />
              ))}
            </div>
          ) : (
            sec.items.map((n) => (
              <NavItem key={n.id} item={n} active={active === n.id} expanded={hover} onClick={() => onNav(n.id)} count={counts[n.id]} />
            ))
          )}
        </React.Fragment>
      ))}

      <div style={{ flex: 1 }} />
      {/* D-070: 访客模式开关 (侧栏底部, 设置上面) */}
      <GuestToggle expanded={hover} />
      {NAV_BOTTOM.map((n) => (
        <NavItem key={n.id} item={n} active={active === n.id} expanded={hover} onClick={() => onNav(n.id)} />
      ))}
    </aside>
  );
}

// D-070: 访客模式切换 — 默认 off, 切 on 主区上方出 banner + 不写档案
function GuestToggle({ expanded }) {
  const [guest, setGuest] = React.useState(() => api.isGuest());
  React.useEffect(() => {
    const h = (e) => setGuest(!!e.detail?.guest);
    window.addEventListener("guest-mode-change", h);
    return () => window.removeEventListener("guest-mode-change", h);
  }, []);
  function toggle() {
    api.setGuest(!guest);
    setGuest(!guest);
  }
  return (
    <div
      onClick={toggle}
      title={guest ? "访客模式开启 · 这次不会记进你档案 · 点击关闭" : "访客模式 · 帮朋友写时打开, 不污染你的人设"}
      style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "9px 10px", borderRadius: 8, cursor: "pointer",
        background: guest ? "#FFF4E5" : "transparent",
        color: guest ? "#B55B00" : T.muted,
        fontSize: 13, fontWeight: guest ? 600 : 500,
        marginBottom: 2, whiteSpace: "nowrap", overflow: "hidden",
        border: guest ? `1px solid #FFB066` : "1px solid transparent",
      }}
    >
      <span style={{ fontSize: 16, lineHeight: 1, flexShrink: 0 }}>🕶</span>
      {expanded && <span style={{ flex: 1 }}>{guest ? "访客模式 (开)" : "访客模式"}</span>}
    </div>
  );
}

function NavItem({ item, active, expanded, onClick, count, flat }) {
  // D-062dd: 今日产出 > 0 时显小绿点 / 数字
  // D-066: flat=true 在部门工具列表内, padding 略小, 选中态加圆角内置
  const showCount = typeof count === "number" && count > 0;
  return (
    <div
      onClick={onClick}
      title={showCount ? `${item.label} · 今日 ${count} 次` : item.label}
      style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: flat ? "7px 10px" : "9px 10px",
        borderRadius: flat ? 7 : 8, cursor: "pointer",
        background: active ? T.brandSoft : "transparent",
        color: active ? T.brand : T.muted,
        fontSize: 13, fontWeight: active ? 600 : 500,
        marginBottom: flat ? 1 : 2,
        whiteSpace: "nowrap", overflow: "hidden",
        position: "relative",
      }}
    >
      <span style={{ fontSize: 17, flexShrink: 0, width: 20, textAlign: "center", position: "relative" }}>
        {item.icon}
        {/* 收起时显小绿点 (右上角) */}
        {!expanded && showCount && (
          <span style={{
            position: "absolute", top: -3, right: -2, width: 7, height: 7,
            borderRadius: "50%", background: T.brand,
          }} />
        )}
      </span>
      {expanded && <span style={{ flex: 1 }}>{item.label}</span>}
      {expanded && showCount && (
        <span style={{
          fontSize: 10, fontWeight: 600,
          padding: "1px 6px", borderRadius: 100,
          background: active ? "#fff" : T.brandSoft,
          color: T.brand, fontFamily: "SF Mono, monospace",
          minWidth: 16, textAlign: "center",
        }}>{count}</span>
      )}
    </div>
  );
}

// 每页底部小华 dock (D-027 接通真实 /api/chat 多轮对话)
function LiDock({ context }) {
  // D-069: 通过 window event 触发顶层导航, 避免每个 page 都得给 LiDock 传 onNav
  const onNav = React.useCallback((p) => {
    window.dispatchEvent(new CustomEvent("ql-nav", { detail: { page: p } }));
  }, []);
  const [open, setOpen] = React.useState(false);
  const [tab, setTab] = React.useState("chat");  // D-069: chat | tasks
  const [input, setInput] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [messages, setMessages] = React.useState([
    { role: "assistant", text: `老板在看「${context || "这一页"}」,需要帮忙吗?` }
  ]);
  const scrollRef = React.useRef(null);

  // D-069: 任务状态融合 (原顶栏 TaskBar 已删, 信息走小华按钮徽章 + 任务 tab)
  const [tasks, setTasks] = React.useState([]);
  const [counts, setCounts] = React.useState({ running: 0, ok: 0, failed: 0 });
  const [refreshTick, setRefreshTick] = React.useState(0);
  React.useEffect(() => {
    let stop = false;
    async function pull() {
      try {
        const r = await api.get("/api/tasks?limit=30");
        if (stop) return;
        setTasks(r.tasks || []);
        setCounts(r.counts || { running: 0, ok: 0, failed: 0 });
      } catch (_) {}
    }
    pull();
    const running = (counts.running || 0) + (counts.pending || 0);
    const interval = ((open && tab === "tasks") || running) ? 3000 : 30000;
    const t = setInterval(pull, interval);
    return () => { stop = true; clearInterval(t); };
  }, [open, tab, counts.running, counts.pending, refreshTick]);

  const runningTasks = tasks.filter(t => t.status === "running" || t.status === "pending");
  const staleCount = runningTasks.filter(isTaskStale).length;
  const today0 = (() => { const d = new Date(); d.setHours(0,0,0,0); return Math.floor(d.getTime()/1000); })();
  const todayOk = tasks.filter(t => t.status === "ok" && (t.finished_ts || 0) >= today0);
  const todayFailed = tasks.filter(t => t.status === "failed" && (t.finished_ts || 0) >= today0);

  async function handleCancelTask(taskId) {
    try { await api.post(`/api/tasks/${taskId}/cancel`, {}); } catch (_) {}
    setRefreshTick(x => x + 1);
  }

  function goTask(t) {
    if (t.page_id && onNav) onNav(t.page_id);
    setOpen(false);
  }

  // 切页时重置开场白(messages 不持久化跨页)
  const ctxKey = context || "这一页";
  React.useEffect(() => {
    setMessages([{ role: "assistant", text: `老板在看「${ctxKey}」,需要帮忙吗?` }]);
  }, [ctxKey]);

  // 自动滚到底
  React.useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    const userMsg = { role: "user", text };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput("");
    setLoading(true);
    try {
      const r = await api.post("/api/chat", {
        messages: next.map(m => ({ role: m.role, text: m.text })),
        context: ctxKey,
      });
      setMessages(prev => [...prev, { role: "assistant", text: r.reply || "(空回复)" }]);
    } catch (e) {
      setMessages(prev => [...prev, { role: "assistant", text: "❌ " + (e.message || "调用失败") }]);
    } finally {
      setLoading(false);
    }
  }
  function clearChat() {
    setMessages([{ role: "assistant", text: `老板在看「${ctxKey}」,需要帮忙吗?` }]);
  }

  // D-069: 按钮徽章颜色 — 卡死红 > 进行中蓝 > 0 透明
  const badgeNum = runningTasks.length;
  const badgeColor = staleCount > 0 ? "#E07A1A" : (badgeNum > 0 ? T.brand : null);

  return (
    <>
      {open && (
        <div style={{
          position: "fixed", right: 20, bottom: 70, width: 420, maxHeight: 560,
          background: "#fff", borderRadius: 14, border: `1px solid ${T.border}`,
          boxShadow: "0 12px 40px rgba(0,0,0,0.12)", display: "flex", flexDirection: "column",
          zIndex: 100, overflow: "hidden",
        }}>
          <div style={{ padding: "12px 14px", borderBottom: `1px solid ${T.borderSoft}`, display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 26, height: 26, borderRadius: "50%", background: T.brandSoft, color: T.brand, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 600 }}>华</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>小华 · {context || "随时说"}</div>
              <div style={{ fontSize: 10.5, color: T.muted2 }}>对话不会被保存</div>
            </div>
            {tab === "chat" && (
              <button onClick={clearChat} title="清空对话" style={{ background: "transparent", border: "none", color: T.muted2, cursor: "pointer", fontSize: 13, padding: "4px 6px" }}>↻</button>
            )}
            <button onClick={() => setOpen(false)} style={{ background: "transparent", border: "none", color: T.muted, cursor: "pointer", fontSize: 18 }}>×</button>
          </div>

          {/* D-069: tab 切换 */}
          <div style={{ display: "flex", borderBottom: `1px solid ${T.borderSoft}`, padding: "0 8px", gap: 2, background: T.bg2 }}>
            <LiDockTab label="对话" active={tab === "chat"} onClick={() => setTab("chat")} />
            <LiDockTab
              label={badgeNum > 0 ? `任务 · ${badgeNum}` : "任务"}
              active={tab === "tasks"}
              onClick={() => setTab("tasks")}
              accent={staleCount > 0 ? "#E07A1A" : null}
            />
          </div>

          {tab === "chat" ? (
            <>
              <div ref={scrollRef} style={{ flex: 1, overflow: "auto", padding: 14, display: "flex", flexDirection: "column", gap: 10, minHeight: 200 }}>
                {messages.map((m, i) => (
                  <div key={i} style={{
                    padding: "10px 12px",
                    background: m.role === "assistant" ? T.bg2 : T.brand,
                    color: m.role === "assistant" ? T.text : "#fff",
                    borderRadius: 10, fontSize: 13, lineHeight: 1.6,
                    alignSelf: m.role === "assistant" ? "flex-start" : "flex-end",
                    maxWidth: "85%", whiteSpace: "pre-wrap",
                  }}>
                    {m.text}
                  </div>
                ))}
                {loading && (
                  <div style={{
                    padding: "10px 12px", background: T.bg2, color: T.muted,
                    borderRadius: 10, fontSize: 13, alignSelf: "flex-start", maxWidth: "70%",
                  }}>
                    <span style={{ animation: "qldot 1.2s ease-in-out infinite" }}>·</span>
                    <span style={{ animation: "qldot 1.2s ease-in-out 0.3s infinite", marginLeft: 3 }}>·</span>
                    <span style={{ animation: "qldot 1.2s ease-in-out 0.6s infinite", marginLeft: 3 }}>·</span>
                  </div>
                )}
              </div>
              <div style={{ padding: 12, borderTop: `1px solid ${T.borderSoft}`, display: "flex", gap: 8 }}>
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                  placeholder={loading ? "小华在想..." : "跟小华说... (回车发送)"}
                  disabled={loading}
                  style={{ flex: 1, border: `1px solid ${T.border}`, borderRadius: 8, padding: "8px 12px", fontSize: 13, fontFamily: "inherit", outline: "none", background: loading ? T.bg2 : "#fff" }}
                />
                <button onClick={send} disabled={loading || !input.trim()}
                  style={{
                    width: 34, height: 34, borderRadius: 8,
                    background: loading || !input.trim() ? T.muted3 : T.brand,
                    color: "#fff", border: "none",
                    cursor: loading || !input.trim() ? "not-allowed" : "pointer",
                  }}>➤</button>
              </div>
            </>
          ) : (
            // D-069: 任务 tab — 复用 TaskCard
            <div style={{ flex: 1, overflow: "auto", padding: "12px 14px 14px", display: "flex", flexDirection: "column", gap: 8, minHeight: 200 }}>
              {runningTasks.length === 0 && todayOk.length === 0 && todayFailed.length === 0 && (
                <div style={{ color: T.muted2, fontSize: 13, textAlign: "center", padding: "60px 0" }}>
                  今天还没干过活<br />
                  <span style={{ fontSize: 12 }}>左边挑个工具开始干吧</span>
                </div>
              )}
              {runningTasks.length > 0 && (
                <>
                  <div style={{ fontSize: 11, color: T.muted2, letterSpacing: 0.5, marginTop: 2 }}>
                    在跑 ({runningTasks.length})
                  </div>
                  {runningTasks.map(t => <TaskCard key={t.id} task={t} onClick={() => goTask(t)} onCancel={handleCancelTask} />)}
                </>
              )}
              {todayOk.length > 0 && (
                <>
                  <div style={{ fontSize: 11, color: T.muted2, letterSpacing: 0.5, marginTop: 8 }}>
                    今天完成 ({todayOk.length})
                  </div>
                  {todayOk.slice(0, 8).map(t => <TaskCard key={t.id} task={t} onClick={() => goTask(t)} compact />)}
                </>
              )}
              {todayFailed.length > 0 && (
                <>
                  <div style={{ fontSize: 11, color: T.muted2, letterSpacing: 0.5, marginTop: 8 }}>
                    没成 ({todayFailed.length})
                  </div>
                  {todayFailed.map(t => <TaskCard key={t.id} task={t} onClick={() => goTask(t)} />)}
                </>
              )}
            </div>
          )}
        </div>
      )}
      <button
        onClick={() => setOpen(!open)}
        style={{
          position: "fixed", right: 20, bottom: 20, height: 46,
          padding: "0 18px 0 14px", background: T.text, color: "#fff",
          border: "none", borderRadius: 100, cursor: "pointer",
          display: "flex", alignItems: "center", gap: 10,
          boxShadow: "0 6px 20px rgba(0,0,0,0.18)", zIndex: 99,
          fontFamily: "inherit", fontSize: 13.5, fontWeight: 500,
        }}
      >
        <span style={{ position: "relative", width: 26, height: 26, borderRadius: "50%", background: T.brandSoft, color: T.brand, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700 }}>
          华
          {badgeColor && (
            <span style={{
              position: "absolute", top: -4, right: -4,
              minWidth: 16, height: 16, padding: "0 4px",
              borderRadius: 100, background: badgeColor, color: "#fff",
              fontSize: 10, fontWeight: 700,
              display: "flex", alignItems: "center", justifyContent: "center",
              border: "2px solid " + T.text,
              boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
            }}>{badgeNum}</span>
          )}
        </span>
        跟小华说一句
      </button>
    </>
  );
}

// D-069: tab 头小组件
function LiDockTab({ label, active, onClick, accent }) {
  return (
    <button onClick={onClick} style={{
      flex: 1, background: active ? "#fff" : "transparent",
      border: "none",
      borderTop: active ? `2px solid ${accent || T.brand}` : "2px solid transparent",
      color: active ? (accent || T.text) : T.muted,
      padding: "9px 0", fontSize: 12.5, fontWeight: active ? 600 : 500,
      cursor: "pointer", fontFamily: "inherit",
      borderBottom: active ? "1px solid #fff" : "none",
      marginBottom: -1,
      transition: "all 0.15s",
    }}>{label}</button>
  );
}

Object.assign(window, { Sidebar, LiDock });
