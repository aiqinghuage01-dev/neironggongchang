// factory-shell.jsx — 窄侧栏 + 浮动小华 dock(LiDock)
// 1:1 还原 docs/design_v3/factory3-shell.jsx

// D-040d 信息架构: 工厂四大板块 (首页→总部 + 生产部 / 档案部 / 夜班分组)
const NAV_TOP = [{ id: "home", icon: "🏠", label: "总部" }];
const NAV_MAIN = [
  { id: "make", icon: "🎬", label: "做视频" },
  // D-061a: 移除独立 v5 入口 — 模板剪辑应是"做视频"流程 Step 4 子选项, 不是 sidebar skill.
  // route "dhv5" 保留供 PageMake 内部跳转 (D-061f 复用 PageDhv5 组件).
  { id: "ad", icon: "💰", label: "投流文案" },
  { id: "wechat", icon: "📄", label: "公众号" },
  { id: "moments", icon: "📱", label: "朋友圈" },
  { id: "hotrewrite", icon: "🔥", label: "热点改写" },
  { id: "voicerewrite", icon: "🎙️", label: "录音改写" },
  { id: "baokuan", icon: "✍️", label: "爆款改写" },
  { id: "planner", icon: "🗓️", label: "内容策划" },
  { id: "compliance", icon: "🛡️", label: "违规审查" },
  { id: "dreamina", icon: "🎨", label: "即梦 AIGC" },
];
const NAV_ASSETS = [
  { id: "materials", icon: "📥", label: "素材库" },
  { id: "works", icon: "🗂️", label: "作品库" },
  { id: "knowledge", icon: "📚", label: "知识库" },
];
const NAV_NIGHT = [{ id: "nightshift", icon: "🌙", label: "小华夜班" }];
const NAV_BOTTOM = [{ id: "settings", icon: "⚙️", label: "设置" }];

function NavGroupLabel({ text, expanded }) {
  if (!expanded) return null;
  return (
    <div style={{
      fontSize: 10, color: T.muted3, fontWeight: 500,
      padding: "10px 10px 4px", letterSpacing: 0.5,
    }}>{text}</div>
  );
}

function Sidebar({ active, onNav }) {
  const [hover, setHover] = React.useState(false);
  const w = hover ? 164 : 60;
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
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 6px 14px", marginBottom: 6, borderBottom: `1px solid ${T.borderSoft}` }}>
        <div style={{ width: 30, height: 30, borderRadius: 8, background: T.brand, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 16 }}>🏭</div>
        {hover && <div style={{ fontSize: 13, fontWeight: 600, color: T.text, whiteSpace: "nowrap" }}>清华哥工厂</div>}
      </div>

      {NAV_TOP.map((n) => (
        <NavItem key={n.id} item={n} active={active === n.id} expanded={hover} onClick={() => onNav(n.id)} count={counts[n.id]} />
      ))}

      <NavGroupLabel text="生产部" expanded={hover} />
      {NAV_MAIN.map((n) => (
        <NavItem key={n.id} item={n} active={active === n.id} expanded={hover} onClick={() => onNav(n.id)} count={counts[n.id]} />
      ))}

      <NavGroupLabel text="档案部" expanded={hover} />
      {NAV_ASSETS.map((n) => (
        <NavItem key={n.id} item={n} active={active === n.id} expanded={hover} onClick={() => onNav(n.id)} />
      ))}

      <NavGroupLabel text="夜班" expanded={hover} />
      {NAV_NIGHT.map((n) => (
        <NavItem key={n.id} item={n} active={active === n.id} expanded={hover} onClick={() => onNav(n.id)} />
      ))}

      <div style={{ flex: 1 }} />
      {NAV_BOTTOM.map((n) => (
        <NavItem key={n.id} item={n} active={active === n.id} expanded={hover} onClick={() => onNav(n.id)} />
      ))}
    </aside>
  );
}

function NavItem({ item, active, expanded, onClick, count }) {
  // D-062dd: 今日产出 > 0 时显小绿点 / 数字
  const showCount = typeof count === "number" && count > 0;
  return (
    <div
      onClick={onClick}
      title={showCount ? `${item.label} · 今日 ${count} 次` : item.label}
      style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "9px 10px", borderRadius: 8, cursor: "pointer",
        background: active ? T.brandSoft : "transparent",
        color: active ? T.brand : T.muted,
        fontSize: 13, fontWeight: active ? 600 : 500, marginBottom: 2,
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
  const [open, setOpen] = React.useState(false);
  const [input, setInput] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [messages, setMessages] = React.useState([
    { role: "assistant", text: `老板在看「${context || "这一页"}」,需要帮忙吗?` }
  ]);
  const scrollRef = React.useRef(null);

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

  return (
    <>
      {open && (
        <div style={{
          position: "fixed", right: 20, bottom: 70, width: 400, maxHeight: 520,
          background: "#fff", borderRadius: 14, border: `1px solid ${T.border}`,
          boxShadow: "0 12px 40px rgba(0,0,0,0.12)", display: "flex", flexDirection: "column",
          zIndex: 100, overflow: "hidden",
        }}>
          <div style={{ padding: "12px 14px", borderBottom: `1px solid ${T.borderSoft}`, display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 26, height: 26, borderRadius: "50%", background: T.brandSoft, color: T.brand, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 600 }}>华</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>小华 · {context || "随时说"}</div>
              <div style={{ fontSize: 10.5, color: T.muted2 }}>多轮对话 · DeepSeek · 不持久化</div>
            </div>
            <button onClick={clearChat} title="清空对话" style={{ background: "transparent", border: "none", color: T.muted2, cursor: "pointer", fontSize: 13, padding: "4px 6px" }}>↻</button>
            <button onClick={() => setOpen(false)} style={{ background: "transparent", border: "none", color: T.muted, cursor: "pointer", fontSize: 18 }}>×</button>
          </div>
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
        <span style={{ width: 26, height: 26, borderRadius: "50%", background: T.brandSoft, color: T.brand, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700 }}>华</span>
        跟小华说一句
      </button>
    </>
  );
}

Object.assign(window, { Sidebar, LiDock });
