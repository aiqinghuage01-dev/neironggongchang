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
              <div key={i} style={{
                background: "#fff", border: `1px solid ${T.borderSoft}`, borderRadius: 14,
                padding: "18px 20px", opacity: 0.55, cursor: "not-allowed",
                display: "flex", flexDirection: "column",
              }}>
                <div style={{ fontSize: 32, marginBottom: 10, filter: "grayscale(40%)" }}>{d.icon}</div>
                <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>{d.label}</div>
                <div style={{ fontSize: 12.5, color: T.muted, lineHeight: 1.55, flex: 1, marginBottom: 12 }}>{d.desc}</div>
                <div style={{ paddingTop: 10, borderTop: `1px solid ${T.borderSoft}` }}>
                  <span style={{ padding: "2px 8px", borderRadius: 100, background: T.amberSoft, color: T.amber, fontSize: 11, fontWeight: 500 }}>未开发</span>
                </div>
              </div>
            ))}
          </div>

        </div>
      </div>

      <LiDock context="黑科技" />
    </div>
  );
}

Object.assign(window, { PageBeta });
