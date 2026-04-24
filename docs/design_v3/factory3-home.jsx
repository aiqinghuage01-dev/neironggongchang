// factory3-home.jsx — 3 个首页方案（左右切换）

function V3HomeSwitcher({ onJump }) {
  const [idx, setIdx] = React.useState(0);
  const variants = [
    { id: "greet", name: "A · 问候型", desc: "大问候 + 四方块主入口" },
    { id: "todo", name: "B · todo 型", desc: "今日 3 件事 · 点一件就开干" },
    { id: "hot", name: "C · 热点型", desc: "今日热点 · 点一条直接做" },
  ];
  const cur = variants[idx];
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", position: "relative" }}>
      {/* 顶部切换条 */}
      <div style={{
        padding: "10px 24px", background: "#fff", borderBottom: `1px solid ${T.border}`,
        display: "flex", alignItems: "center", gap: 12, flexShrink: 0,
      }}>
        <span style={{ fontSize: 11.5, fontWeight: 600, color: T.muted, letterSpacing: "0.08em" }}>首页方案</span>
        <div style={{ display: "flex", gap: 4, background: T.bg2, padding: 3, borderRadius: 100 }}>
          {variants.map((v, i) => (
            <button
              key={v.id}
              onClick={() => setIdx(i)}
              style={{
                padding: "6px 14px", fontSize: 12, borderRadius: 100,
                background: i === idx ? "#fff" : "transparent",
                color: i === idx ? T.text : T.muted,
                border: "none", cursor: "pointer", fontFamily: "inherit",
                fontWeight: i === idx ? 600 : 500,
                boxShadow: i === idx ? "0 1px 3px rgba(0,0,0,0.06)" : "none",
              }}
            >{v.name}</button>
          ))}
        </div>
        <span style={{ fontSize: 11, color: T.muted2 }}>{cur.desc}</span>
        <div style={{ flex: 1 }} />
        <button
          onClick={() => setIdx((idx - 1 + 3) % 3)}
          style={{ width: 28, height: 28, borderRadius: 6, background: "transparent", border: `1px solid ${T.border}`, color: T.muted, cursor: "pointer" }}
        >‹</button>
        <button
          onClick={() => setIdx((idx + 1) % 3)}
          style={{ width: 28, height: 28, borderRadius: 6, background: "transparent", border: `1px solid ${T.border}`, color: T.muted, cursor: "pointer" }}
        >›</button>
      </div>

      {/* 当前方案 */}
      {cur.id === "greet" && <V3HomeGreet onJump={onJump} />}
      {cur.id === "todo" && <V3HomeTodo onJump={onJump} />}
      {cur.id === "hot" && <V3HomeHot onJump={onJump} />}

      <LiDock context="首页" />
    </div>
  );
}

// ——————— A: 问候型 ———————
function V3HomeGreet({ onJump }) {
  return (
    <div style={{ flex: 1, overflow: "auto", background: T.bg }}>
      <div style={{ maxWidth: 980, margin: "0 auto", padding: "70px 40px 120px" }}>
        <div style={{ marginBottom: 50 }}>
          <div style={{ fontSize: 13, color: T.muted, marginBottom: 10, fontWeight: 500 }}>4 月 24 日 · 周五</div>
          <div style={{ fontSize: 44, fontWeight: 700, color: T.text, letterSpacing: "-0.02em", marginBottom: 14, lineHeight: 1.15 }}>
            早上好，清华哥 👋
          </div>
          <div style={{ fontSize: 17, color: T.muted, lineHeight: 1.6 }}>
            今天想做点什么？从下面挑一个开始就行。
          </div>
        </div>

        {/* 四个大方块 */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 32 }}>
          <BigAction
            icon="🎬" title="做条短视频" subtitle="链接 → 文案 → 声音 → 数字人 → 剪辑 → 发布"
            stat="最近 3 条进行中" hot
            onClick={() => onJump("make")}
          />
          <BigAction
            icon="💰" title="写投流文案" subtitle="一个卖点 · 批量出 5 版 · 自动挑最佳"
            stat="昨天新出了 12 条"
            onClick={() => onJump("ad")}
          />
          <BigAction
            icon="📄" title="写公众号" subtitle="方法论长文 · 2000+ 字 · 自动排版"
            stat="本周还没发过"
            onClick={() => onJump("wechat")}
          />
          <BigAction
            icon="📱" title="发朋友圈" subtitle="从金句库衍生 3 条 · 配图 · 一键复制"
            stat="昨天发了 2 条"
            onClick={() => onJump("moments")}
          />
        </div>

        {/* 底下一条：今日最重要的热点 */}
        <div style={{
          display: "flex", alignItems: "center", gap: 14, padding: "16px 20px",
          background: "#fff", borderRadius: 12, border: `1px solid ${T.borderSoft}`,
        }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: T.amber, minWidth: 42 }}>🔥98</div>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <Tag size="xs" color="pink">抖音</Tag>
              <Tag size="xs" color="green">✨ 匹配你定位</Tag>
              <span style={{ fontSize: 11, color: T.muted2 }}>· 今日最热</span>
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, color: T.text }}>AI 客服集体下岗？一线从业者发声</div>
            <div style={{ fontSize: 12, color: T.muted, marginTop: 3 }}>和你「AI × 中年老板」人设很搭，今天做正合适</div>
          </div>
          <Btn variant="primary" size="md" onClick={() => onJump("make")}>做成视频 →</Btn>
        </div>
      </div>
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

// ——————— B: todo 型 ———————
function V3HomeTodo({ onJump }) {
  const todos = [
    { icon: "🎬", title: "发一条短视频到抖音", desc: "昨天排期的「私域运营第 5 段实操」", action: "继续做", target: "make", tag: "进行中", tagColor: "amber" },
    { icon: "💰", title: "补一版投流文案", desc: "周三那版点击率偏低，换一版测测", action: "开始写", target: "ad" },
    { icon: "📱", title: "发 3 条朋友圈", desc: "周五该发今日金句 · 钩子库有备货", action: "一键生成", target: "moments" },
  ];
  return (
    <div style={{ flex: 1, overflow: "auto", background: T.bg }}>
      <div style={{ maxWidth: 860, margin: "0 auto", padding: "60px 40px 120px" }}>
        <div style={{ marginBottom: 40 }}>
          <div style={{ fontSize: 13, color: T.muted, marginBottom: 10, fontWeight: 500 }}>4 月 24 日 · 周五</div>
          <div style={{ fontSize: 38, fontWeight: 700, color: T.text, letterSpacing: "-0.02em", marginBottom: 10 }}>
            早上好，清华哥 👋
          </div>
          <div style={{ fontSize: 16, color: T.muted }}>
            今天安排了 <span style={{ color: T.brand, fontWeight: 600 }}>3 件事</span>，挑一件开干吧。
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {todos.map((t, i) => (
            <div
              key={i}
              style={{
                display: "flex", alignItems: "center", gap: 18,
                padding: "20px 22px", background: "#fff",
                border: `1px solid ${T.borderSoft}`, borderRadius: 14,
                cursor: "pointer",
              }}
              onClick={() => onJump(t.target)}
            >
              <div style={{ width: 32, height: 32, borderRadius: "50%", border: `1.5px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 10, color: T.muted2 }}>{i + 1}</div>
              <div style={{ fontSize: 26, lineHeight: 1 }}>{t.icon}</div>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <div style={{ fontSize: 16, fontWeight: 600, color: T.text }}>{t.title}</div>
                  {t.tag && <Tag size="xs" color={t.tagColor}>{t.tag}</Tag>}
                </div>
                <div style={{ fontSize: 12.5, color: T.muted, lineHeight: 1.55 }}>{t.desc}</div>
              </div>
              <Btn variant="soft" size="md">{t.action} →</Btn>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 28, display: "flex", alignItems: "center", gap: 10 }}>
          <button style={{ padding: "8px 14px", background: "transparent", border: `1px dashed ${T.border}`, borderRadius: 100, color: T.muted, fontSize: 12.5, cursor: "pointer", fontFamily: "inherit" }}>
            ＋ 加一件
          </button>
          <span style={{ fontSize: 11.5, color: T.muted2 }}>或者 <span style={{ color: T.brand, cursor: "pointer" }}>从模板添加</span> / <span style={{ color: T.brand, cursor: "pointer" }}>让小栗推荐</span></span>
        </div>
      </div>
    </div>
  );
}

// ——————— C: 热点型 ———————
function V3HomeHot({ onJump }) {
  const hots = [
    { plat: "抖音", title: "AI 客服集体下岗？一线从业者发声", hot: 98, match: true, why: "匹配你的「AI × 中年老板」人设" },
    { plat: "小红书", title: "45 岁宝妈做副业月入百万被质疑", hot: 87, match: true, why: "和你「老板进化论」话题契合" },
    { plat: "微博", title: "小米 SU7 Ultra 讨论破 10 亿", hot: 94 },
    { plat: "抖音", title: "知识付费 2026 分水岭", hot: 76, match: true, why: "你的私域方法论正好能接住" },
  ];
  return (
    <div style={{ flex: 1, overflow: "auto", background: T.bg }}>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "60px 40px 120px" }}>
        <div style={{ marginBottom: 36 }}>
          <div style={{ fontSize: 13, color: T.muted, marginBottom: 10, fontWeight: 500 }}>4 月 24 日 · 周五 · 过去 12 小时</div>
          <div style={{ fontSize: 38, fontWeight: 700, color: T.text, letterSpacing: "-0.02em", marginBottom: 10 }}>
            早上好，清华哥 👋
          </div>
          <div style={{ fontSize: 16, color: T.muted }}>
            今天有 <span style={{ color: T.brand, fontWeight: 600 }}>3 条热点</span> 跟你的定位很搭，点一条直接做视频。
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {hots.map((h, i) => (
            <div
              key={i}
              onClick={() => h.match && onJump("make")}
              style={{
                padding: "18px 20px", background: "#fff",
                border: `1px solid ${h.match ? T.brand + "55" : T.borderSoft}`,
                borderRadius: 12, cursor: h.match ? "pointer" : "default",
                boxShadow: h.match ? `0 0 0 2px ${T.brandSoft}` : "none",
                display: "flex", alignItems: "center", gap: 14,
              }}
            >
              <div style={{ fontSize: 22, fontWeight: 700, color: T.amber, minWidth: 42 }}>
                🔥{h.hot}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <Tag size="xs" color="pink">{h.plat}</Tag>
                  {h.match && <Tag size="xs" color="green">✨ 匹配你定位</Tag>}
                </div>
                <div style={{ fontSize: 15, fontWeight: 600, color: T.text, marginBottom: h.why ? 4 : 0 }}>{h.title}</div>
                {h.why && <div style={{ fontSize: 12, color: T.muted }}>{h.why}</div>}
              </div>
              {h.match ? (
                <Btn variant="primary" size="md">做成视频 →</Btn>
              ) : (
                <Btn variant="outline" size="sm">采集</Btn>
              )}
            </div>
          ))}
        </div>

        <div style={{ marginTop: 24, textAlign: "center" }}>
          <button onClick={() => onJump("materials")} style={{ background: "transparent", border: "none", color: T.brand, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
            看全部 18 条热点 →
          </button>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { V3HomeSwitcher });
