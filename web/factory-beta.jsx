// factory-beta.jsx — D-066 黑科技占位页 (未来好玩功能放这)

const BETA_DRAFTS = [
  { icon: "🎞️", label: "批量去水印", desc: "视频 / 图片批量识别 + 去水印 · 备料专用" },
  { icon: "🎙️", label: "实时直播字幕", desc: "直播过程中实时识别 + 转文案 · 留底为录音改写素材" },
  { icon: "✂️", label: "一键剪辑", desc: "长视频 → 多个 30s 短片 · 自动找高潮 · 配字幕" },
];

function PageBeta({ onNav }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", position: "relative" }}>
      <div style={{ padding: "22px 32px 18px", background: "#fff", borderBottom: `1px solid ${T.border}` }}>
        <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: -0.2 }}>🧪 黑科技</div>
        <div style={{ fontSize: 13, color: T.muted, marginTop: 6 }}>实验性 / 玩票性的功能放这 · 暂时空着</div>
      </div>

      <div style={{ flex: 1, overflow: "auto", padding: "20px 32px 60px", background: T.bg }}>
        <div style={{ maxWidth: 1240, margin: "0 auto" }}>

          {/* 空状态 */}
          <div style={{ textAlign: "center", padding: "80px 20px 60px", color: T.muted }}>
            <div style={{ fontSize: 56, marginBottom: 18 }}>🧪</div>
            <div style={{ fontSize: 18, fontWeight: 600, color: T.text, marginBottom: 8 }}>暂时还没有黑科技</div>
            <div style={{ fontSize: 14, lineHeight: 1.7, maxWidth: 460, margin: "0 auto" }}>
              这里给未来新好玩的功能留位置 — 比如批量去水印 / 一键剪辑 / 直播实时字幕等。<br/>
              冒出来的实验性想法先放这, 稳定后再决定要不要单独成大入口。
            </div>
            <div style={{ marginTop: 18, fontSize: 12, color: T.muted2 }}>
              想法可以在 <code style={{ background: T.bg3, padding: "2px 6px", borderRadius: 4, fontSize: 11.5 }}
                onClick={() => onNav("nightshift")}>小华夜班</code> 跟 AI 聊
            </div>
          </div>

          {/* 草稿坑位 */}
          <div style={{ fontSize: 13, fontWeight: 600, color: T.muted, letterSpacing: "0.06em", marginTop: 32, marginBottom: 14 }}>
            未来可能放这里的(草稿)
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
            {BETA_DRAFTS.map((d, i) => (
              <BetaDraftCard key={i} draft={d} onTalk={() => {
                // 跳到小华夜班, 让用户跟 AI 聊这个想法 (LiDock seed 暂存到 localStorage 给后续接力)
                try {
                  localStorage.setItem("beta_idea_seed", JSON.stringify({
                    label: d.label, desc: d.desc, ts: Date.now(),
                  }));
                } catch (_) {}
                onNav("nightshift");
              }} />
            ))}
          </div>

        </div>
      </div>

      <LiDock context="黑科技" />
    </div>
  );
}

function BetaDraftCard({ draft, onTalk }) {
  const [hover, setHover] = React.useState(false);
  return (
    <div onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} style={{
      background: "#fff", border: `1px solid ${hover ? T.amber : T.borderSoft}`, borderRadius: 14,
      padding: "18px 20px",
      transition: "all .15s",
      boxShadow: hover ? "0 4px 16px rgba(0,0,0,0.06)" : "none",
      display: "flex", flexDirection: "column",
    }}>
      <div style={{ fontSize: 32, marginBottom: 10, filter: hover ? "" : "grayscale(40%)", transition: "filter .15s" }}>{draft.icon}</div>
      <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>{draft.label}</div>
      <div style={{ fontSize: 12.5, color: T.muted, lineHeight: 1.55, flex: 1, marginBottom: 12 }}>{draft.desc}</div>
      <div style={{ paddingTop: 10, borderTop: `1px solid ${T.borderSoft}`, display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ padding: "2px 8px", borderRadius: 100, background: T.amberSoft, color: T.amber, fontSize: 11, fontWeight: 500 }}>未开发</span>
        <div style={{ flex: 1 }} />
        <button onClick={onTalk} style={{
          padding: "4px 10px", borderRadius: 6, background: hover ? T.brand : "transparent",
          border: `1px solid ${hover ? T.brand : T.border}`,
          color: hover ? "#fff" : T.muted, fontSize: 11.5, cursor: "pointer", fontFamily: "inherit",
          transition: "all .15s",
        }}>💬 跟小华说</button>
      </div>
    </div>
  );
}

Object.assign(window, { PageBeta });
