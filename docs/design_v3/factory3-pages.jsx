// factory3-pages.jsx — v0.3 其他页面：做视频入口 / 其他生产中转 / 素材库 / 作品库 / 知识库 / 设置

// ——————— 做视频入口页（C2 风格：一个大输入框 + 两个示例路径）———————
function V3MakeVideo({ onJump }) {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", background: T.bg, position: "relative" }}>
      {/* 顶部进度条 */}
      <div style={{
        padding: "14px 32px", background: "#fff", borderBottom: `1px solid ${T.border}`,
        display: "flex", alignItems: "center", gap: 12, flexShrink: 0,
      }}>
        <div style={{ width: 28, height: 28, borderRadius: 7, background: T.text, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13 }}>🎬</div>
        <div style={{ fontSize: 14, fontWeight: 600 }}>做条短视频</div>
        <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, marginLeft: 20 }}>
          {["素材", "文案", "声音", "形象", "剪辑", "发布"].map((s, i) => (
            <React.Fragment key={i}>
              <div style={{
                padding: "5px 11px", borderRadius: 100, fontSize: 11.5, fontWeight: 500,
                background: i === 0 ? T.text : "transparent", color: i === 0 ? "#fff" : T.muted,
                border: i === 0 ? "1px solid transparent" : `1px solid ${T.border}`,
              }}>{i + 1}. {s}</div>
              {i < 5 && <span style={{ color: T.muted3, fontSize: 10 }}>—</span>}
            </React.Fragment>
          ))}
        </div>
        <button onClick={() => onJump("home")} style={{ background: "transparent", border: "none", color: T.muted, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>← 返回</button>
      </div>

      {/* 主区：大标题 + 输入框 + 两个示例 */}
      <div style={{ flex: 1, overflow: "auto", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 40px 120px", gap: 28 }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 30, fontWeight: 700, color: T.text, letterSpacing: "-0.02em", marginBottom: 10 }}>先给我点东西开始 👇</div>
          <div style={{ fontSize: 14, color: T.muted }}>粘链接或文案都行，小华自动认</div>
        </div>

        <div style={{ width: 600, background: "#fff", border: `1.5px solid ${T.brand}`, boxShadow: `0 0 0 5px ${T.brandSoft}`, borderRadius: 16, padding: 18 }}>
          <textarea
            rows={5}
            placeholder="在这里粘视频链接，或者直接贴一段文案..."
            style={{ width: "100%", border: "none", outline: "none", background: "transparent", fontSize: 14.5, fontFamily: "inherit", resize: "none", lineHeight: 1.7, color: T.text }}
          />
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, paddingTop: 12, borderTop: `1px solid ${T.borderSoft}` }}>
            <div style={{ fontSize: 11.5, color: T.muted2 }}>✨ 小华自动判断是链接还是文案</div>
            <div style={{ flex: 1 }} />
            <button style={{ padding: "8px 20px", fontSize: 13, fontWeight: 600, background: T.brand, color: "#fff", border: "none", borderRadius: 100, cursor: "pointer", fontFamily: "inherit" }}>开始 →</button>
          </div>
        </div>

        <div style={{ display: "flex", gap: 14, width: 600 }}>
          <ExCard icon="🔗" title="给个视频链接" desc="小华扒文案 → 你改 → 声音 → 数字人 → 剪辑 → 发布" example="例：https://v.douyin.com/..." />
          <ExCard icon="📝" title="文案我已经写好了" desc="跳过扒文案 → 直接到改 → 声音 → 数字人 → 剪辑 → 发布" example={'省一步，自动跳过"扒文案"'} />
        </div>
      </div>
      <LiDock context="做视频 · 素材" />
    </div>
  );
}
function ExCard({ icon, title, desc, example }) {
  return (
    <div style={{ flex: 1, padding: 14, background: "#fff", border: `1px solid ${T.borderSoft}`, borderRadius: 12, cursor: "pointer" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <div style={{ width: 26, height: 26, borderRadius: 6, background: T.brandSoft, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13 }}>{icon}</div>
        <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{title}</div>
      </div>
      <div style={{ fontSize: 12, color: T.muted, lineHeight: 1.6 }}>{desc}</div>
      <div style={{ marginTop: 8, fontSize: 11, color: T.muted2 }}>{example}</div>
    </div>
  );
}

// ——————— 投流/公众号/朋友圈 — 类似但更简单的入口页 ———————
function V3GenericEntry({ cfg, onJump }) {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", background: T.bg, position: "relative" }}>
      <div style={{
        padding: "14px 32px", background: "#fff", borderBottom: `1px solid ${T.border}`,
        display: "flex", alignItems: "center", gap: 12, flexShrink: 0,
      }}>
        <div style={{ width: 28, height: 28, borderRadius: 7, background: T.text, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13 }}>{cfg.icon}</div>
        <div style={{ fontSize: 14, fontWeight: 600 }}>{cfg.name}</div>
        <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, marginLeft: 20 }}>
          {cfg.steps.map((s, i) => (
            <React.Fragment key={i}>
              <div style={{ padding: "5px 11px", borderRadius: 100, fontSize: 11.5, fontWeight: 500, background: i === 0 ? T.text : "transparent", color: i === 0 ? "#fff" : T.muted, border: i === 0 ? "1px solid transparent" : `1px solid ${T.border}` }}>{i + 1}. {s}</div>
              {i < cfg.steps.length - 1 && <span style={{ color: T.muted3 }}>—</span>}
            </React.Fragment>
          ))}
        </div>
        <button onClick={() => onJump("home")} style={{ background: "transparent", border: "none", color: T.muted, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>← 返回</button>
      </div>

      <div style={{ flex: 1, overflow: "auto", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 40px 120px", gap: 28 }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 30, fontWeight: 700, color: T.text, marginBottom: 10, letterSpacing: "-0.02em" }}>{cfg.heroTitle}</div>
          <div style={{ fontSize: 14, color: T.muted }}>{cfg.heroSub}</div>
        </div>

        <div style={{ width: 600, background: "#fff", border: `1.5px solid ${T.brand}`, boxShadow: `0 0 0 5px ${T.brandSoft}`, borderRadius: 16, padding: 18 }}>
          <textarea rows={4} placeholder={cfg.placeholder} style={{ width: "100%", border: "none", outline: "none", background: "transparent", fontSize: 14.5, fontFamily: "inherit", resize: "none", lineHeight: 1.7, color: T.text }} />
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, paddingTop: 12, borderTop: `1px solid ${T.borderSoft}` }}>
            <div style={{ fontSize: 11.5, color: T.muted2 }}>{cfg.hint}</div>
            <div style={{ flex: 1 }} />
            <button style={{ padding: "8px 20px", fontSize: 13, fontWeight: 600, background: T.brand, color: "#fff", border: "none", borderRadius: 100, cursor: "pointer", fontFamily: "inherit" }}>开始 →</button>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, width: 600, flexWrap: "wrap", justifyContent: "center" }}>
          <span style={{ fontSize: 12, color: T.muted2, marginRight: 4 }}>快速开始：</span>
          {cfg.chips.map((c, i) => (
            <div key={i} style={{ padding: "6px 12px", background: "#fff", border: `1px solid ${T.border}`, borderRadius: 100, fontSize: 12, color: T.muted, cursor: "pointer" }}>{c}</div>
          ))}
        </div>
      </div>
      <LiDock context={cfg.name} />
    </div>
  );
}

const AD_CFG = {
  icon: "💰", name: "投流文案",
  steps: ["卖点", "批量出 5 版", "挑最佳", "配图/视频", "投放"],
  heroTitle: "说说这次要推的是啥？",
  heroSub: "一句话说清卖点 · 小华批量出 5 版 · 自动挑最佳",
  placeholder: "例：私域课程 · 针对中年老板 · 主打「一个人也能做起来」...",
  hint: "💡 一个卖点越聚焦，出文案越精准",
  chips: ["抖音信息流 · 竖版", "视频号短文案", "微信朋友圈广告", "小红书笔记体"],
};
const WECHAT_CFG = {
  icon: "📄", name: "公众号",
  steps: ["选题", "大纲", "长文", "排版", "发布"],
  heroTitle: "今天想写什么选题？",
  heroSub: "一个观点 · 小华拉知识库 · 出 2000+ 字方法论长文",
  placeholder: "例：为什么 2026 年做内容必须懂私域 · 或者直接贴一段灵感...",
  hint: "✍️ 小华会自动接入你的知识库（28 条方法论）",
  chips: ["方法论长文", "案例拆解", "观点输出", "行业观察"],
};
const MOMENTS_CFG = {
  icon: "📱", name: "朋友圈",
  steps: ["选题", "衍生 3 条", "配图", "发布"],
  heroTitle: "发一组朋友圈吧",
  heroSub: "从金句库出发 · 衍生 3-5 条 · 配图一键复制",
  placeholder: "例：今天想发「老板心法 · 私域复购」相关 · 或直接贴一句话...",
  hint: "📚 小华从「钩子库 + 认知金句」里取素材",
  chips: ["老板心法", "干货输出", "学员动态", "今日一句"],
};

// ——————— 素材库 ———————
function V3Materials({ onJump }) {
  const tabs = [
    { id: "hot", label: "热点", count: 18, icon: "🔥" },
    { id: "topic", label: "选题", count: 46, icon: "💡" },
    { id: "viral", label: "爆款参考", count: 32, icon: "⭐" },
    { id: "shots", label: "空镜/录音", count: 58, icon: "🎥" },
  ];
  const [tab, setTab] = React.useState("hot");
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", background: T.bg, position: "relative" }}>
      <div style={{ padding: "22px 32px 0 32px", background: "#fff", borderBottom: `1px solid ${T.border}` }}>
        <div style={{ fontSize: 20, fontWeight: 600 }}>📥 素材库</div>
        <div style={{ fontSize: 12.5, color: T.muted, marginTop: 4 }}>热点 · 选题 · 爆款 · 空镜 · 一处存放</div>
        <div style={{ display: "flex", gap: 4, marginTop: 16 }}>
          {tabs.map((t) => {
            const on = tab === t.id;
            return (
              <button key={t.id} onClick={() => setTab(t.id)} style={{
                padding: "10px 16px", background: "transparent", border: "none", cursor: "pointer", fontFamily: "inherit",
                color: on ? T.text : T.muted, fontWeight: on ? 600 : 500, fontSize: 13.5,
                borderBottom: `2px solid ${on ? T.brand : "transparent"}`,
                display: "flex", alignItems: "center", gap: 6,
              }}>
                <span>{t.icon}</span>{t.label}
                <span style={{ fontSize: 11, color: T.muted2 }}>{t.count}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ flex: 1, overflow: "auto", padding: "20px 32px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", flexDirection: "column", gap: 10 }}>
          {(tab === "hot" ? [
            { tag: "抖音", title: "AI 客服集体下岗？一线从业者发声", h: 98, match: true },
            { tag: "小红书", title: "45 岁宝妈做副业月入百万", h: 87, match: true },
            { tag: "微博", title: "小米 SU7 Ultra 讨论破 10 亿", h: 94 },
            { tag: "微博", title: "知识付费 2026 分水岭已现", h: 76, match: true },
            { tag: "抖音", title: '低价消费者更舍得为"情绪"买单', h: 72 },
          ] : [
            { tag: tabs.find(x => x.id === tab).label, title: "（示例）这里是 " + tabs.find(x => x.id === tab).label + " 的列表", h: 0 },
            { tag: tabs.find(x => x.id === tab).label, title: "（示例）条目 2", h: 0 },
          ]).map((row, i) => (
            <div key={i} onClick={() => row.match && onJump("make")} style={{
              display: "flex", alignItems: "center", gap: 14, padding: "14px 18px",
              background: "#fff", border: `1px solid ${row.match ? T.brand + "55" : T.borderSoft}`,
              borderRadius: 10, cursor: "pointer",
            }}>
              {row.h > 0 && <div style={{ fontSize: 17, fontWeight: 700, color: T.amber, minWidth: 50 }}>🔥{row.h}</div>}
              <Tag size="xs" color="pink">{row.tag}</Tag>
              <div style={{ flex: 1, fontSize: 13.5, color: T.text, fontWeight: 500 }}>{row.title}</div>
              {row.match && <Tag size="xs" color="green">✨ 匹配</Tag>}
              <Btn size="sm" variant={row.match ? "primary" : "outline"}>做成视频</Btn>
            </div>
          ))}
        </div>
      </div>
      <LiDock context="素材库" />
    </div>
  );
}

// ——————— 作品库 ———————
function V3Works({ onJump }) {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", background: T.bg, position: "relative" }}>
      <div style={{ padding: "22px 32px", background: "#fff", borderBottom: `1px solid ${T.border}` }}>
        <div style={{ fontSize: 20, fontWeight: 600 }}>🗂️ 作品库</div>
        <div style={{ fontSize: 12.5, color: T.muted, marginTop: 4 }}>你已经发出去的所有内容 · 47 条视频 · 12 篇文章 · 128 条朋友圈</div>
      </div>
      <div style={{ flex: 1, overflow: "auto", padding: "20px 32px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} style={{ background: "#fff", border: `1px solid ${T.borderSoft}`, borderRadius: 10, overflow: "hidden", cursor: "pointer" }}>
              <div style={{ aspectRatio: "9 / 16", background: "linear-gradient(135deg, #1e293b 0%, #475569 100%)", display: "flex", alignItems: "flex-end", padding: 10, color: "#fff", fontSize: 10.5 }}>
                <div>
                  <div style={{ marginBottom: 4, opacity: 0.85 }}>@清华哥聊私域</div>
                  <div style={{ opacity: 0.7 }}>▶ {(Math.random() * 20 + 1).toFixed(1)}k</div>
                </div>
              </div>
              <div style={{ padding: 10 }}>
                <div style={{ fontSize: 12.5, color: T.text, fontWeight: 500, lineHeight: 1.4, marginBottom: 6, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                  私域七段实操 · 第 {i + 1} 段 · 社群变现闭环
                </div>
                <div style={{ fontSize: 10.5, color: T.muted2 }}>4 月 {20 - i} 日 · 抖音 + 视频号</div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <LiDock context="作品库" />
    </div>
  );
}

// ——————— 知识库 ———————
function V3Knowledge({ onJump }) {
  const cats = [
    { name: "私域方法论", count: 8, color: T.brand },
    { name: "认知金句", count: 42, color: T.amber },
    { name: "钩子模板", count: 18, color: T.blue },
    { name: "爆款结构", count: 12, color: T.pink },
    { name: "行业观点", count: 6, color: T.purple },
    { name: "案例拆解", count: 9, color: T.red },
    { name: "客户画像", count: 4, color: T.brand },
    { name: "高频问答", count: 23, color: T.amber },
  ];
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", background: T.bg, position: "relative" }}>
      <div style={{ padding: "22px 32px", background: "#fff", borderBottom: `1px solid ${T.border}` }}>
        <div style={{ fontSize: 20, fontWeight: 600 }}>📚 知识库</div>
        <div style={{ fontSize: 12.5, color: T.muted, marginTop: 4 }}>你的弹药库 · 写文案、做视频时小华自动取用</div>
      </div>
      <div style={{ flex: 1, overflow: "auto", padding: "24px 32px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
          {cats.map((c, i) => (
            <div key={i} style={{ padding: 18, background: "#fff", border: `1px solid ${T.borderSoft}`, borderRadius: 12, cursor: "pointer" }}>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: T.text, marginBottom: 10 }}>{c.name}</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                <div style={{ fontSize: 28, fontWeight: 700, color: c.color, lineHeight: 1 }}>{c.count}</div>
                <div style={{ fontSize: 11, color: T.muted }}>条</div>
              </div>
              <div style={{ fontSize: 11, color: T.muted2, marginTop: 8 }}>被引用 {Math.floor(Math.random() * 40 + 5)} 次</div>
            </div>
          ))}
        </div>
      </div>
      <LiDock context="知识库" />
    </div>
  );
}

// ——————— 设置 ———————
function V3Settings({ onJump }) {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", background: T.bg, position: "relative" }}>
      <div style={{ padding: "22px 32px", background: "#fff", borderBottom: `1px solid ${T.border}` }}>
        <div style={{ fontSize: 20, fontWeight: 600 }}>⚙️ 设置</div>
        <div style={{ fontSize: 12.5, color: T.muted, marginTop: 4 }}>平台账号 · 声音 · 数字人 · 小华行为</div>
      </div>
      <div style={{ flex: 1, overflow: "auto", padding: "24px 32px" }}>
        <div style={{ maxWidth: 720, margin: "0 auto", display: "flex", flexDirection: "column", gap: 12 }}>
          {[
            { icon: "🔗", name: "平台账号", desc: "抖音 / 视频号 / 小红书 / 公众号 — 已绑 3 个" },
            { icon: "🎙️", name: "我的声音", desc: "清华哥 · 标准版 + 私域专用版" },
            { icon: "👤", name: "数字人形象", desc: "本人形象 · 专业教练 · 邻家姐姐" },
            { icon: "🤖", name: "小华偏好", desc: "语气 · 主动性 · 改写风格默认值" },
            { icon: "🎨", name: "品牌字体/配色", desc: "封面自动套用" },
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
      </div>
      <LiDock context="设置" />
    </div>
  );
}

Object.assign(window, { V3MakeVideo, V3GenericEntry, AD_CFG, WECHAT_CFG, MOMENTS_CFG, V3Materials, V3Works, V3Knowledge, V3Settings });
