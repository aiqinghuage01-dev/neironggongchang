// factory-shell.jsx — 窄侧栏 + 浮动小华 dock(LiDock)
// 1:1 还原 docs/design_v3/factory3-shell.jsx

const NAV_TOP = [{ id: "home", icon: "🏠", label: "首页" }];
const NAV_MAIN = [
  { id: "make", icon: "🎬", label: "做视频" },
  { id: "ad", icon: "💰", label: "投流文案" },
  { id: "wechat", icon: "📄", label: "公众号" },
  { id: "moments", icon: "📱", label: "朋友圈" },
];
const NAV_ASSETS = [
  { id: "materials", icon: "📥", label: "素材库" },
  { id: "works", icon: "🗂️", label: "作品库" },
  { id: "knowledge", icon: "📚", label: "知识库" },
];
const NAV_BOTTOM = [{ id: "settings", icon: "⚙️", label: "设置" }];

function Sidebar({ active, onNav }) {
  const [hover, setHover] = React.useState(false);
  const w = hover ? 164 : 60;
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
        <NavItem key={n.id} item={n} active={active === n.id} expanded={hover} onClick={() => onNav(n.id)} />
      ))}
      <div style={{ height: 1, background: T.borderSoft, margin: "8px 6px" }} />
      {NAV_MAIN.map((n) => (
        <NavItem key={n.id} item={n} active={active === n.id} expanded={hover} onClick={() => onNav(n.id)} />
      ))}
      <div style={{ height: 1, background: T.borderSoft, margin: "8px 6px" }} />
      {NAV_ASSETS.map((n) => (
        <NavItem key={n.id} item={n} active={active === n.id} expanded={hover} onClick={() => onNav(n.id)} />
      ))}
      <div style={{ flex: 1 }} />
      {NAV_BOTTOM.map((n) => (
        <NavItem key={n.id} item={n} active={active === n.id} expanded={hover} onClick={() => onNav(n.id)} />
      ))}
    </aside>
  );
}

function NavItem({ item, active, expanded, onClick }) {
  return (
    <div
      onClick={onClick}
      title={item.label}
      style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "9px 10px", borderRadius: 8, cursor: "pointer",
        background: active ? T.brandSoft : "transparent",
        color: active ? T.brand : T.muted,
        fontSize: 13, fontWeight: active ? 600 : 500, marginBottom: 2,
        whiteSpace: "nowrap", overflow: "hidden",
      }}
    >
      <span style={{ fontSize: 17, flexShrink: 0, width: 20, textAlign: "center" }}>{item.icon}</span>
      {expanded && <span>{item.label}</span>}
    </div>
  );
}

// 每页底部小华 dock (折叠态,点击展开为浮动对话)
function LiDock({ context, messages }) {
  const [open, setOpen] = React.useState(false);
  const [input, setInput] = React.useState("");
  const list = messages || [{ from: "ai", text: `老板在看 "${context || "这一页"}",需要帮忙吗?` }];
  return (
    <>
      {open && (
        <div style={{
          position: "fixed", right: 20, bottom: 70, width: 380, maxHeight: 440,
          background: "#fff", borderRadius: 14, border: `1px solid ${T.border}`,
          boxShadow: "0 12px 40px rgba(0,0,0,0.12)", display: "flex", flexDirection: "column",
          zIndex: 100, overflow: "hidden",
        }}>
          <div style={{ padding: "12px 14px", borderBottom: `1px solid ${T.borderSoft}`, display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 26, height: 26, borderRadius: "50%", background: T.brandSoft, color: T.brand, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 600 }}>华</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>小华</div>
              <div style={{ fontSize: 11, color: T.muted2 }}>{context || "随时说一句调整"}</div>
            </div>
            <button onClick={() => setOpen(false)} style={{ background: "transparent", border: "none", color: T.muted, cursor: "pointer", fontSize: 18 }}>×</button>
          </div>
          <div style={{ flex: 1, overflow: "auto", padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
            {list.map((m, i) => (
              <div key={i} style={{
                padding: "10px 12px",
                background: m.from === "ai" ? T.bg2 : T.brand,
                color: m.from === "ai" ? T.text : "#fff",
                borderRadius: 10, fontSize: 13, lineHeight: 1.55,
                alignSelf: m.from === "ai" ? "flex-start" : "flex-end", maxWidth: "85%",
              }}>
                {m.text}
              </div>
            ))}
          </div>
          <div style={{ padding: 12, borderTop: `1px solid ${T.borderSoft}`, display: "flex", gap: 8 }}>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="跟小华说..."
              style={{ flex: 1, border: `1px solid ${T.border}`, borderRadius: 8, padding: "8px 12px", fontSize: 13, fontFamily: "inherit", outline: "none" }}
            />
            <button style={{ width: 34, height: 34, borderRadius: 8, background: T.brand, color: "#fff", border: "none", cursor: "pointer" }}>➤</button>
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
