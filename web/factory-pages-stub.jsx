// factory-pages-stub.jsx — 各页面骨架(后续逐页深入填充)
// 每个 PageXxx 先给一个可导航、可验证 reload 不报错的框架

function _PageShell({ title, subtitle, children, context }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", position: "relative" }}>
      <div style={{ padding: "22px 32px", background: "#fff", borderBottom: `1px solid ${T.border}` }}>
        <div style={{ fontSize: 20, fontWeight: 600 }}>{title}</div>
        {subtitle && <div style={{ fontSize: 12.5, color: T.muted, marginTop: 4 }}>{subtitle}</div>}
      </div>
      <div style={{ flex: 1, overflow: "auto", padding: "20px 32px" }}>
        {children}
      </div>
    </div>
  );
}

function _StubBody({ text }) {
  return (
    <div style={{ padding: 40, textAlign: "center", color: T.muted2 }}>
      <div style={{ fontSize: 28, marginBottom: 12 }}>🚧</div>
      <div style={{ fontSize: 14 }}>{text || "这一页正在搭,骨架已落位,内容随后填充"}</div>
    </div>
  );
}

// 占位:后续由 factory-flow.jsx 覆盖
function PageMake({ onNav }) {
  return <_PageShell title="🎬 做视频" subtitle="链接→文案→声音→形象→剪辑→发布" context="做视频">
    <_StubBody text="做视频 6 步流 · Phase 1 正在搭(下一步实现)" />
  </_PageShell>;
}

function PageAd({ onNav }) {
  return <_PageShell title="💰 投流文案" subtitle="一个卖点 · 批量出 5 版 · 挑最佳" context="投流">
    <_StubBody text="投流 5 步完整链路 · Phase 2 实现" />
  </_PageShell>;
}

function PageWechat({ onNav }) {
  return <_PageShell title="📄 公众号" subtitle="方法论长文 · 2000+ 字 · 自动排版" context="公众号">
    <_StubBody text="公众号 5 步完整链路 · Phase 2 实现" />
  </_PageShell>;
}

function PageMoments({ onNav }) {
  return <_PageShell title="📱 朋友圈" subtitle="从金句库衍生 3-5 条 · 配图 · 一键复制" context="朋友圈">
    <_StubBody text="朋友圈 4 步完整链路 · Phase 2 实现" />
  </_PageShell>;
}

function PageMaterials({ onNav }) {
  return <_PageShell title="📥 素材库" subtitle="热点 · 选题 · 爆款参考 · 空镜/录音 一处存放" context="素材库">
    <_StubBody text="4 Tab + 真 /api/materials · Phase 1 下一步实现" />
  </_PageShell>;
}

function PageWorks({ onNav }) {
  return <_PageShell title="🗂️ 作品库" subtitle="你已经发出去的所有内容" context="作品库">
    <_StubBody text="网格 + 详情 · Phase 1 下一步实现" />
  </_PageShell>;
}

function PageKnowledge({ onNav }) {
  return <_PageShell title="📚 知识库" subtitle="写文案、做视频时小华自动取用 · 对接 Obsidian" context="知识库">
    <_StubBody text="8 分区树 + Markdown 渲染 · Phase 1 下一步实现" />
  </_PageShell>;
}

function PageSettings({ onNav }) {
  return <_PageShell title="⚙️ 设置" subtitle="平台账号 · 声音 · 数字人 · 小华偏好" context="设置">
    <div style={{ maxWidth: 720, margin: "0 auto", display: "flex", flexDirection: "column", gap: 12 }}>
      {[
        { icon: "🔗", name: "平台账号", desc: "抖音 / 视频号 / 小红书 / 公众号 — Phase 2 实装" },
        { icon: "🎙️", name: "我的声音", desc: "已有 speaker 列表 · Phase 2 实装" },
        { icon: "👤", name: "数字人形象", desc: "本人形象 · 专业教练 · 邻家姐姐 · Phase 2 实装" },
        { icon: "🤖", name: "小华偏好", desc: "语气 · 主动性 · 默认改写风格 · Phase 2 实装" },
        { icon: "🎨", name: "品牌字体/配色", desc: "封面自动套用 · Phase 2 实装" },
      ].map((r, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 14, padding: "16px 18px", background: "#fff", border: `1px solid ${T.borderSoft}`, borderRadius: 10, cursor: "pointer" }}>
          <div style={{ fontSize: 22 }}>{r.icon}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{r.name}</div>
            <div style={{ fontSize: 12, color: T.muted, marginTop: 3 }}>{r.desc}</div>
          </div>
          <div style={{ fontSize: 16, color: T.muted2 }}>›</div>
        </div>
      ))}
    </div>
  </_PageShell>;
}

Object.assign(window, { PageMake, PageAd, PageWechat, PageMoments, PageMaterials, PageWorks, PageKnowledge, PageSettings });
