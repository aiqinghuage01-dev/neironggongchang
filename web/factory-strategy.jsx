// factory-strategy.jsx — 战略部 placeholder (D-068b)
// 等老板装上"战略规划"技能后, 这里放真正的战略对话/规划工具.

function PageStrategy({ onNav }) {
  return (
    <div style={{
      flex: 1, padding: "32px 40px", overflowY: "auto",
      background: T.bg, color: T.text,
    }}>
      <div style={{
        maxWidth: 720, margin: "60px auto 0",
        background: "#fff",
        border: `1px solid ${T.border}`,
        borderRadius: 14,
        padding: "40px 48px",
        boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 18 }}>
          <span style={{ fontSize: 32 }}>🧭</span>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>战略部</h1>
        </div>
        <p style={{ fontSize: 14.5, lineHeight: 1.75, color: T.muted, margin: "12px 0 24px" }}>
          老板专属战略沙盘 — 等装上 <code style={{
            background: T.brandSoft, color: T.brand, padding: "2px 6px",
            borderRadius: 4, fontSize: 13, fontFamily: "SF Mono, monospace",
          }}>战略规划</code> 技能后, 我们就在这里聊方向、拆决策、定打法。
        </p>
        <div style={{
          background: T.bg2,
          border: `1px dashed ${T.border}`,
          borderRadius: 10,
          padding: "18px 22px",
          fontSize: 13.5, color: T.muted2 || T.muted, lineHeight: 1.7,
        }}>
          <div style={{ fontWeight: 600, color: T.text, marginBottom: 8 }}>战略部计划承接的事情</div>
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            <li>季度/月度战略目标拆解</li>
            <li>新业务方向的可行性对话</li>
            <li>资源 / 时间 / 人力的分配讨论</li>
            <li>关键决策的多视角推演</li>
          </ul>
        </div>
        <div style={{ marginTop: 28, display: "flex", gap: 10 }}>
          <button onClick={() => onNav && onNav("home")} style={{
            background: T.brand, color: "#fff",
            border: "none", borderRadius: 8,
            padding: "9px 18px", fontSize: 13.5, fontWeight: 600,
            cursor: "pointer",
          }}>← 回总部</button>
          <button onClick={() => onNav && onNav("settings")} style={{
            background: "transparent", color: T.muted,
            border: `1px solid ${T.border}`, borderRadius: 8,
            padding: "9px 18px", fontSize: 13.5,
            cursor: "pointer",
          }}>去设置装技能</button>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { PageStrategy });
