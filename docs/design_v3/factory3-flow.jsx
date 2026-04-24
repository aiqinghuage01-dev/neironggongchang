// factory3-flow.jsx — 做视频完整 6 步流程（可点走通）

const FLOW_STEPS = [
  { id: "source", n: 1, label: "素材" },
  { id: "script", n: 2, label: "文案" },
  { id: "voice", n: 3, label: "声音" },
  { id: "avatar", n: 4, label: "形象" },
  { id: "edit", n: 5, label: "剪辑" },
  { id: "publish", n: 6, label: "发布" },
];

function FlowHeader({ current, onBack, onJumpStep, onJumpPage }) {
  return (
    <div style={{
      padding: "12px 24px", background: "#fff", borderBottom: `1px solid ${T.border}`,
      display: "flex", alignItems: "center", gap: 14, flexShrink: 0,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ width: 26, height: 26, borderRadius: 7, background: T.text, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12 }}>✦</div>
        <div style={{ fontSize: 13.5, fontWeight: 600 }}>小华 · 全流程口播</div>
      </div>
      <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 6, marginLeft: 8 }}>
        {FLOW_STEPS.map((s, i) => {
          const active = s.id === current;
          const done = FLOW_STEPS.findIndex((x) => x.id === current) > i;
          return (
            <React.Fragment key={s.id}>
              <div onClick={() => onJumpStep(s.id)} style={{
                display: "flex", alignItems: "center", gap: 5,
                padding: "4px 10px 4px 5px", borderRadius: 100, fontSize: 11.5, fontWeight: 500,
                background: active ? T.text : "transparent",
                color: active ? "#fff" : done ? T.brand : T.muted,
                cursor: "pointer", whiteSpace: "nowrap",
              }}>
                <div style={{
                  width: 18, height: 18, borderRadius: "50%",
                  background: active ? "#fff" : done ? T.brandSoft : T.bg2,
                  color: active ? T.text : done ? T.brand : T.muted2,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 10, fontWeight: 700,
                }}>{done ? "✓" : s.n}</div>
                {s.label}
              </div>
              {i < FLOW_STEPS.length - 1 && <span style={{ color: T.muted3, fontSize: 10 }}>—</span>}
            </React.Fragment>
          );
        })}
      </div>
      <div style={{ fontSize: 11, color: T.muted, display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: T.brand, display: "inline-block" }} />
        草稿已自动保...
      </div>
      <button onClick={() => onJumpPage?.("materials")} style={{ padding: "5px 12px", background: "#fff", border: `1px solid ${T.border}`, borderRadius: 100, fontSize: 12, color: T.text, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 5 }}>
        📥 素材库
      </button>
      <button onClick={() => onJumpPage?.("works")} style={{ padding: "5px 12px", background: "#fff", border: `1px solid ${T.border}`, borderRadius: 100, fontSize: 12, color: T.text, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 5 }}>
        🗂️ 作品库
      </button>
    </div>
  );
}

// 底部横向对话栏（替代 LiDock）
function FlowChatBar({ context, stepPrompt, quickChips }) {
  const [text, setText] = React.useState("");
  return (
    <div style={{
      padding: "12px 24px", background: "#fff", borderTop: `1px solid ${T.border}`,
      display: "flex", alignItems: "center", gap: 14, flexShrink: 0,
    }}>
      <div style={{
        width: 30, height: 30, borderRadius: "50%",
        background: T.brandSoft, color: T.brand,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 13, fontWeight: 700, flexShrink: 0,
      }}>华</div>
      <div style={{ minWidth: 0, maxWidth: 360 }}>
        <div style={{ fontSize: 13, color: T.text, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{stepPrompt}</div>
        <div style={{ display: "flex", gap: 6, marginTop: 5 }}>
          {quickChips.map((c, i) => (
            <div key={i} style={{
              padding: "3px 10px", background: T.bg2, border: `1px solid ${T.borderSoft}`,
              borderRadius: 100, fontSize: 11, color: T.muted, cursor: "pointer", whiteSpace: "nowrap",
            }}>{c}</div>
          ))}
        </div>
      </div>
      <div style={{ flex: 1 }} />
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        width: 420, background: T.bg2, border: `1px solid ${T.border}`,
        borderRadius: 100, padding: "4px 4px 4px 16px",
      }}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="想改哪里直接跟小华说..."
          style={{ flex: 1, border: "none", outline: "none", background: "transparent", fontSize: 13, fontFamily: "inherit", color: T.text }}
        />
        <button style={{
          width: 30, height: 30, borderRadius: "50%",
          background: T.text, color: "#fff", border: "none", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        }}>➤</button>
      </div>
    </div>
  );
}

function V3Flow({ initialStep, initialContext, onJumpPage }) {
  const [step, setStep] = React.useState(initialStep || "source");
  const next = () => {
    const i = FLOW_STEPS.findIndex((s) => s.id === step);
    if (i < FLOW_STEPS.length - 1) setStep(FLOW_STEPS[i + 1].id);
  };
  const prev = () => {
    const i = FLOW_STEPS.findIndex((s) => s.id === step);
    if (i > 0) setStep(FLOW_STEPS[i - 1].id);
  };

  const STEP_PROMPTS = {
    source: { prompt: "老板好呀 👋 今天想做条什么视频？", chips: ["🔗 试试粘个链接", "📝 我直接写文案", "🎁 从素材库选"] },
    script: { prompt: "文案风格挑好了吗？要不要再随意一点？", chips: ["再随意一点", "加促销钩子", "缩短到 20 秒"] },
    voice: { prompt: "声音用上次那个就挺自然的", chips: ["🎚 语速慢一点", "😊 加点笑意", "🔁 重新录"] },
    avatar: { prompt: "建议用你本人的形象，老客户认脸", chips: ["用本人", "试试专业教练", "什么是数字人？"] },
    edit: { prompt: "挑个剪辑风格，我按这个出片", chips: ["口播大字幕", "快节奏", "不露脸版"] },
    publish: { prompt: "看看发哪里？我已经按每个平台的调调改好标题了", chips: ["全都发", "就发抖音", "我自己贴"] },
  };
  const sp = STEP_PROMPTS[step];

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", background: T.bg, position: "relative", overflow: "hidden" }}>
      <FlowHeader current={step} onJumpStep={setStep} onJumpPage={onJumpPage} />
      <div style={{ flex: 1, overflow: "auto" }}>
        {step === "source" && <StepSource onNext={next} initialHint={initialContext?.hint} />}
        {step === "script" && <StepScript onNext={next} onPrev={prev} />}
        {step === "voice" && <StepVoice onNext={next} onPrev={prev} />}
        {step === "avatar" && <StepAvatar onNext={next} onPrev={prev} />}
        {step === "edit" && <StepEdit onNext={next} onPrev={prev} />}
        {step === "publish" && <StepPublish onDone={() => onJumpPage("works")} onPrev={prev} />}
      </div>
      <FlowChatBar stepPrompt={sp.prompt} quickChips={sp.chips} />
    </div>
  );
}

// ——— 1. 素材 ———
function StepSource({ onNext, initialHint }) {
  const [text, setText] = React.useState(initialHint || "");
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 40px 120px", gap: 28, minHeight: "100%" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 30, fontWeight: 700, color: T.text, letterSpacing: "-0.02em", marginBottom: 10 }}>先给我点东西开始 👇</div>
        <div style={{ fontSize: 14, color: T.muted }}>粘链接或文案都行，小华自动认</div>
      </div>
      <div style={{ width: 600, background: "#fff", border: `1.5px solid ${T.brand}`, boxShadow: `0 0 0 5px ${T.brandSoft}`, borderRadius: 16, padding: 18 }}>
        <textarea
          rows={5}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="在这里粘视频链接，或者直接贴一段文案..."
          style={{ width: "100%", border: "none", outline: "none", background: "transparent", fontSize: 14.5, fontFamily: "inherit", resize: "none", lineHeight: 1.7, color: T.text }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, paddingTop: 12, borderTop: `1px solid ${T.borderSoft}` }}>
          <div style={{ fontSize: 11.5, color: T.muted2 }}>✨ 小华自动判断是链接还是文案</div>
          <div style={{ flex: 1 }} />
          <button onClick={onNext} style={{ padding: "8px 20px", fontSize: 13, fontWeight: 600, background: T.brand, color: "#fff", border: "none", borderRadius: 100, cursor: "pointer", fontFamily: "inherit" }}>开始 →</button>
        </div>
      </div>
      <div style={{ display: "flex", gap: 14, width: 600 }}>
        <ExCard icon="🔗" title="给个视频链接" desc="小华扒文案 → 你改 → 声音 → 数字人 → 剪辑 → 发布" example="例：https://v.douyin.com/..." />
        <ExCard icon="📝" title="文案我已经写好了" desc="跳过扒文案 → 直接到改 → 声音 → 数字人 → 剪辑 → 发布" example={'省一步，自动跳过"扒文案"'} />
      </div>
    </div>
  );
}

// ——— 2. 文案 ———
function StepScript({ onNext, onPrev }) {
  const [style, setStyle] = React.useState("casual");
  const [copy, setCopy] = React.useState(
    "哎各位老铁看过来，春节我们这儿不关门啊，\n大年三十都照常开。\n最实在的是这个——老会员你要是带一个新朋友来办卡，\n你们俩，各免一个月的会员费。\n相当于一块钱没多花，俩月白送。\n位置还在老地方，今晚上新年套餐也上了，过来溜达溜达。"
  );
  return (
    <div style={{ padding: "32px 40px 120px", maxWidth: 960, margin: "0 auto" }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 24, fontWeight: 700, color: T.text, marginBottom: 6 }}>改成你的话 ✍️</div>
        <div style={{ fontSize: 13, color: T.muted }}>挑个风格，小华帮你改。不满意直接在右边改，或者按下面快捷让它再来一版。</div>
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
        {[
          { id: "casual", name: "轻松口语", sub: "像跟熟客聊天", hot: true },
          { id: "pro", name: "专业讲解", sub: "讲细节讲流程" },
          { id: "story", name: "故事叙事", sub: "从小场景切入" },
        ].map((s) => (
          <div key={s.id} onClick={() => setStyle(s.id)} style={{
            flex: 1, padding: 14, borderRadius: 10, cursor: "pointer",
            background: style === s.id ? T.brandSoft : "#fff",
            border: `1px solid ${style === s.id ? T.brand : T.borderSoft}`,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: T.text }}>{s.name}</div>
              {s.hot && <Tag size="xs" color="green">推荐</Tag>}
            </div>
            <div style={{ fontSize: 11.5, color: T.muted }}>{s.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ background: "#fff", border: `1px solid ${T.borderSoft}`, borderRadius: 12, padding: 24 }}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 12 }}>
          <div style={{ fontSize: 11.5, color: T.muted2, fontWeight: 600, letterSpacing: "0.08em" }}>改写结果 · 146 字 · 约 32 秒</div>
          <div style={{ flex: 1 }} />
          <button style={{ fontSize: 11.5, color: T.brand, background: "transparent", border: "none", cursor: "pointer", fontFamily: "inherit" }}>🔄 让小华再来一版</button>
        </div>
        <textarea
          value={copy}
          onChange={(e) => setCopy(e.target.value)}
          style={{ width: "100%", border: "none", outline: "none", background: "transparent", fontSize: 15.5, fontFamily: "inherit", resize: "vertical", lineHeight: 1.9, color: T.text, minHeight: 180 }}
        />
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
        {["再随意一点", "加促销钩子", "缩短到 20 秒", "强调免费"].map((t) => (
          <div key={t} style={{ padding: "6px 12px", background: "#fff", border: `1px solid ${T.border}`, borderRadius: 100, color: T.muted, fontSize: 12, cursor: "pointer" }}>{t}</div>
        ))}
        <div style={{ flex: 1 }} />
        <Btn variant="outline" onClick={onPrev}>← 上一步</Btn>
        <Btn variant="primary" onClick={onNext}>就用这个 →</Btn>
      </div>
    </div>
  );
}

// ——— 3. 声音 ———
function StepVoice({ onNext, onPrev }) {
  const [voice, setVoice] = React.useState("saved");
  return (
    <div style={{ padding: "32px 40px 120px", maxWidth: 860, margin: "0 auto" }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 24, fontWeight: 700, color: T.text, marginBottom: 6 }}>用什么声音念？ 🎙️</div>
        <div style={{ fontSize: 13, color: T.muted }}>你上次录过一次效果不错，继续用就行。</div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {[
          { id: "saved", name: "清华哥 · 上次的声音", sub: "30 秒样本 · 音色自然，保留你原来的语气", hot: true, saved: true },
          { id: "pro", name: "清华哥 · 专业版", sub: "语速稳、吐字清，适合长文章" },
          { id: "new", name: "重新录一个", sub: "念 30 秒就够，环境安静点" },
        ].map((v) => (
          <div key={v.id} onClick={() => setVoice(v.id)} style={{
            display: "flex", alignItems: "center", gap: 14, padding: "18px 20px",
            background: voice === v.id ? T.brandSoft : "#fff",
            border: `1px solid ${voice === v.id ? T.brand : T.borderSoft}`,
            borderRadius: 12, cursor: "pointer",
          }}>
            <div style={{
              width: 20, height: 20, borderRadius: "50%",
              border: `1.5px solid ${voice === v.id ? T.brand : T.muted2}`,
              background: voice === v.id ? T.brand : "transparent",
              display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
            }}>
              {voice === v.id && <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#fff" }} />}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{v.name}</div>
                {v.hot && <Tag size="xs" color="green">推荐</Tag>}
                {v.saved && <Tag size="xs" color="gray">已保存</Tag>}
              </div>
              <div style={{ fontSize: 12, color: T.muted }}>{v.sub}</div>
            </div>
            <button style={{ padding: "6px 12px", background: "#fff", border: `1px solid ${T.border}`, borderRadius: 100, fontSize: 12, color: T.muted, cursor: "pointer", fontFamily: "inherit" }}>▶ 试听</button>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", marginTop: 20 }}>
        <Btn variant="outline" onClick={onPrev}>← 上一步</Btn>
        <div style={{ flex: 1 }} />
        <Btn variant="primary" onClick={onNext}>合成口播 →</Btn>
      </div>
    </div>
  );
}

// ——— 4. 形象 ———
function StepAvatar({ onNext, onPrev }) {
  const [avatar, setAvatar] = React.useState("self");
  const avatars = [
    { id: "self", name: "清华哥本人", sub: "老客户认脸，转化高", hot: true, gradient: "linear-gradient(135deg, #2a6f4a 0%, #1e5537 100%)" },
    { id: "pro", name: "专业教练", sub: "模特级形象，走精品路线", gradient: "linear-gradient(135deg, #2c5d86 0%, #1e4166 100%)" },
    { id: "warm", name: "邻家姐姐", sub: "亲和力强，适合女性向", gradient: "linear-gradient(135deg, #b8456b 0%, #8c3050 100%)" },
  ];
  return (
    <div style={{ padding: "32px 40px 120px", maxWidth: 960, margin: "0 auto" }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 24, fontWeight: 700, color: T.text, marginBottom: 6 }}>挑个数字人形象 👤</div>
        <div style={{ fontSize: 13, color: T.muted }}>建议用你本人，老客户认脸，转化高很多。</div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
        {avatars.map((a) => (
          <div key={a.id} onClick={() => setAvatar(a.id)} style={{
            background: "#fff",
            border: `1px solid ${avatar === a.id ? T.brand : T.borderSoft}`,
            boxShadow: avatar === a.id ? `0 0 0 3px ${T.brandSoft}` : "none",
            borderRadius: 12, cursor: "pointer", overflow: "hidden",
          }}>
            <div style={{
              aspectRatio: "3/4", background: a.gradient,
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "#fff", fontSize: 44, fontWeight: 700, letterSpacing: "-0.02em",
            }}>{a.name.slice(0, 2)}</div>
            <div style={{ padding: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{a.name}</div>
                {a.hot && <Tag size="xs" color="green">推荐</Tag>}
              </div>
              <div style={{ fontSize: 12, color: T.muted }}>{a.sub}</div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", marginTop: 20 }}>
        <Btn variant="outline" onClick={onPrev}>← 上一步</Btn>
        <div style={{ flex: 1 }} />
        <Btn variant="primary" onClick={onNext}>合成视频 →</Btn>
      </div>
    </div>
  );
}

// ——— 5. 剪辑 ———
function StepEdit({ onNext, onPrev }) {
  const [tpl, setTpl] = React.useState("t1");
  return (
    <div style={{ padding: "32px 40px 120px", maxWidth: 960, margin: "0 auto" }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 24, fontWeight: 700, color: T.text, marginBottom: 6 }}>一键剪辑 ✂️</div>
        <div style={{ fontSize: 13, color: T.muted }}>挑一个剪辑模板，小华按这个风格出片 · 自动字幕、切镜、BGM。</div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        {[
          { id: "t1", name: "口播 · 字幕大", sub: "最常用，说服力强", hot: true },
          { id: "t2", name: "口播 + 空镜", sub: "穿插场景画面" },
          { id: "t3", name: "快节奏切镜", sub: "每 3 秒一切" },
          { id: "t4", name: "纯字幕", sub: "不露脸版本" },
        ].map((t) => (
          <div key={t.id} onClick={() => setTpl(t.id)} style={{
            background: "#fff",
            border: `1px solid ${tpl === t.id ? T.brand : T.borderSoft}`,
            boxShadow: tpl === t.id ? `0 0 0 3px ${T.brandSoft}` : "none",
            borderRadius: 10, cursor: "pointer", overflow: "hidden",
          }}>
            <div style={{ aspectRatio: "9/16", background: "linear-gradient(135deg, #1e293b 0%, #475569 100%)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 28, opacity: 0.4 }}>▶</div>
            <div style={{ padding: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 3 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600 }}>{t.name}</div>
                {t.hot && <Tag size="xs" color="green">常用</Tag>}
              </div>
              <div style={{ fontSize: 11, color: T.muted }}>{t.sub}</div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 18, padding: 14, background: T.amberSoft, border: `1px solid ${T.amber}33`, borderRadius: 10, fontSize: 13, color: T.amber }}>
        ⏳ 合成大约需要 90 秒 · 你先想想发哪儿，小华弄好了叫你
      </div>

      <div style={{ display: "flex", marginTop: 20 }}>
        <Btn variant="outline" onClick={onPrev}>← 上一步</Btn>
        <div style={{ flex: 1 }} />
        <Btn variant="primary" onClick={onNext}>开始合成 →</Btn>
      </div>
    </div>
  );
}

// ——— 6. 发布 ———
function StepPublish({ onDone, onPrev }) {
  const [plats, setPlats] = React.useState({ douyin: true, shipinhao: true, xhs: false, kuaishou: false });
  const toggle = (p) => setPlats({ ...plats, [p]: !plats[p] });
  return (
    <div style={{ padding: "32px 40px 120px", maxWidth: 960, margin: "0 auto" }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 24, fontWeight: 700, color: T.text, marginBottom: 6 }}>发出去吧 🚀</div>
        <div style={{ fontSize: 13, color: T.muted }}>选要发的平台 · 标题和标签小华自动按每个平台的调调改好了。</div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 20 }}>
        {/* 视频预览 */}
        <div style={{ background: "#fff", border: `1px solid ${T.borderSoft}`, borderRadius: 12, padding: 14 }}>
          <div style={{ aspectRatio: "9/16", background: "linear-gradient(135deg, #1e293b 0%, #475569 100%)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 40, marginBottom: 10 }}>▶</div>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>春节不打烊 · 老带新免一个月</div>
          <div style={{ fontSize: 11, color: T.muted }}>32 秒 · 16.8 MB · 已合成完成</div>
        </div>

        {/* 平台选择 */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[
            { id: "douyin", plat: "douyin", name: "抖音", sub: "你的「清华哥聊私域」· 35.2K 粉", hot: true },
            { id: "shipinhao", plat: "shipinhao", name: "视频号", sub: "老客户主要在这", hot: true },
            { id: "xhs", plat: "xiaohongshu", name: "小红书", sub: "女生用户多，值得试" },
            { id: "kuaishou", plat: "kuaishou", name: "快手", sub: "同城流量大" },
          ].map((p) => {
            const on = plats[p.id];
            return (
              <div key={p.id} onClick={() => toggle(p.id)} style={{
                display: "flex", alignItems: "center", gap: 14, padding: "14px 16px",
                background: on ? T.brandSoft : "#fff",
                border: `1px solid ${on ? T.brand : T.borderSoft}`,
                borderRadius: 10, cursor: "pointer",
              }}>
                <div style={{
                  width: 18, height: 18, borderRadius: 4,
                  border: `1.5px solid ${on ? T.brand : T.muted2}`,
                  background: on ? T.brand : "transparent",
                  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                  color: "#fff", fontSize: 11, fontWeight: 700,
                }}>{on ? "✓" : ""}</div>
                <PlatformIcon platform={p.plat} size={22} />
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600 }}>{p.name}</div>
                    {p.hot && <Tag size="xs" color="green">推荐</Tag>}
                  </div>
                  <div style={{ fontSize: 11.5, color: T.muted, marginTop: 2 }}>{p.sub}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ display: "flex", marginTop: 24, alignItems: "center" }}>
        <Btn variant="outline" onClick={onPrev}>← 上一步</Btn>
        <div style={{ flex: 1 }} />
        <div style={{ fontSize: 12, color: T.muted, marginRight: 12 }}>将发布到 {Object.values(plats).filter(Boolean).length} 个平台</div>
        <Btn variant="primary" size="lg" onClick={onDone}>一键发布 🚀</Btn>
      </div>
    </div>
  );
}

Object.assign(window, { V3Flow });
