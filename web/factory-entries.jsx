// factory-entries.jsx — 投流 / 公众号 / 朋友圈 三个入口页
// Phase 1 版本:入口(V3GenericEntry 视觉)→ 点开始 → 改写结果态(真调 /api/rewrite)
// Phase 2 拆完整 5 步(卖点→批量 5 版→挑最佳→配图→投放 / 选题→大纲→长文→排版→发布 / 选题→衍生 3-5→配图→复制)

const AD_CFG = {
  icon: "💰", name: "投流文案",
  steps: ["卖点", "批量出 5 版", "挑最佳", "配图/视频", "投放"],
  heroTitle: "说说这次要推的是啥?",
  heroSub: "一句话说清卖点 · 小华批量出 5 版 · 自动挑最佳",
  placeholder: "例:私域课程 · 针对中年老板 · 主打「一个人也能做起来」...",
  hint: "💡 一个卖点越聚焦,出文案越精准",
  chips: ["抖音信息流 · 竖版", "视频号短文案", "微信朋友圈广告", "小红书笔记体"],
  aiPrompt: "轻松口语",  // 传给 /api/rewrite style 的参数
  aiContext: "这是投流广告文案,要强吸引力、带钩子、突出卖点。",
  chatPrompt: "说说这次要推的是啥?一句话说清卖点",
  chatChips: ["抖音信息流", "视频号短文案", "朋友圈广告"],
};

const WECHAT_CFG = {
  icon: "📄", name: "公众号",
  steps: ["选题", "大纲", "长文", "排版", "发布"],
  heroTitle: "今天想写什么选题?",
  heroSub: "一个观点 · 小华拉知识库 · 出 2000+ 字方法论长文",
  placeholder: "例:为什么 2026 年做内容必须懂私域 · 或者直接贴一段灵感...",
  hint: "✍️ 小华会自动接入你的知识库(Obsidian 07 Wiki)",
  chips: ["方法论长文", "案例拆解", "观点输出", "行业观察"],
  aiPrompt: "专业讲解",
  aiContext: "这是公众号方法论长文,要结构清晰、有深度、带真实案例。",
  chatPrompt: "今天想写什么选题?",
  chatChips: ["方法论长文", "案例拆解", "观点输出"],
};

const MOMENTS_CFG = {
  icon: "📱", name: "朋友圈",
  steps: ["选题", "衍生 3 条", "配图", "发布"],
  heroTitle: "发一组朋友圈吧",
  heroSub: "从金句库出发 · 衍生 3-5 条 · 配图一键复制",
  placeholder: "例:今天想发「老板心法 · 私域复购」相关 · 或直接贴一句话...",
  hint: "📚 小华从「钩子库 + 认知金句」里取素材",
  chips: ["老板心法", "干货输出", "学员动态", "今日一句"],
  aiPrompt: "故事叙事",
  aiContext: "这是朋友圈文案,短、有钩子、带情绪。",
  chatPrompt: "发一组朋友圈吧",
  chatChips: ["老板心法", "干货输出", "今日一句"],
};

function PageAd({ onNav })       { return <GenericEntry onNav={onNav} cfg={AD_CFG} />; }
function PageWechat({ onNav })   { return <GenericEntry onNav={onNav} cfg={WECHAT_CFG} />; }
function PageMoments({ onNav })  { return <GenericEntry onNav={onNav} cfg={MOMENTS_CFG} />; }

function GenericEntry({ cfg, onNav }) {
  const [text, setText] = React.useState("");
  const [result, setResult] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const [err, setErr] = React.useState("");
  const [tokens, setTokens] = React.useState(0);
  const [currentStep, setCurrentStep] = React.useState(0);

  async function start() {
    if (!text.trim()) return;
    setLoading(true); setErr(""); setResult(null); setCurrentStep(1);
    try {
      const prefixed = `${cfg.aiContext}\n\n原输入:${text.trim()}`;
      const r = await api.post("/api/rewrite", { text: prefixed, style: cfg.aiPrompt });
      setResult(r.text);
      setTokens(r.tokens || 0);
      setCurrentStep(2);
    } catch (e) { setErr(e.message); setCurrentStep(0); }
    setLoading(false);
  }

  function reset() {
    setResult(null); setCurrentStep(0); setErr(""); setTokens(0);
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", background: T.bg, position: "relative", overflow: "hidden" }}>
      <EntryTopbar cfg={cfg} currentStep={currentStep} onBack={() => onNav("home")} />
      <div style={{ flex: 1, overflow: "auto" }}>
        {!result ? (
          <EntryInput cfg={cfg} text={text} setText={setText} loading={loading} onStart={start} err={err} />
        ) : (
          <EntryResult cfg={cfg} result={result} tokens={tokens} setResult={setResult} original={text} onReset={reset} onNav={onNav} />
        )}
      </div>
      <EntryChatBar cfg={cfg} />
    </div>
  );
}

function EntryTopbar({ cfg, currentStep, onBack }) {
  return (
    <div style={{
      padding: "14px 32px", background: "#fff", borderBottom: `1px solid ${T.border}`,
      display: "flex", alignItems: "center", gap: 12, flexShrink: 0,
    }}>
      <div style={{ width: 28, height: 28, borderRadius: 7, background: T.text, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13 }}>{cfg.icon}</div>
      <div style={{ fontSize: 14, fontWeight: 600 }}>{cfg.name}</div>
      <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, marginLeft: 20 }}>
        {cfg.steps.map((s, i) => (
          <React.Fragment key={i}>
            <div style={{
              padding: "5px 11px", borderRadius: 100, fontSize: 11.5, fontWeight: 500,
              background: i === currentStep ? T.text : "transparent",
              color: i === currentStep ? "#fff" : i < currentStep ? T.brand : T.muted,
              border: i === currentStep ? "1px solid transparent" : `1px solid ${T.border}`,
            }}>{i + 1}. {s}</div>
            {i < cfg.steps.length - 1 && <span style={{ color: T.muted3 }}>—</span>}
          </React.Fragment>
        ))}
      </div>
      <ApiStatusLight />
      <button onClick={onBack} style={{ background: "transparent", border: "none", color: T.muted, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>← 返回</button>
    </div>
  );
}

function EntryInput({ cfg, text, setText, loading, onStart, err }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 40px 120px", gap: 28, minHeight: "100%" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 30, fontWeight: 700, color: T.text, marginBottom: 10, letterSpacing: "-0.02em" }}>{cfg.heroTitle}</div>
        <div style={{ fontSize: 14, color: T.muted }}>{cfg.heroSub}</div>
      </div>

      <div style={{ width: 600, background: "#fff", border: `1.5px solid ${T.brand}`, boxShadow: `0 0 0 5px ${T.brandSoft}`, borderRadius: 16, padding: 18 }}>
        <textarea
          rows={4}
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder={cfg.placeholder}
          style={{ width: "100%", border: "none", outline: "none", background: "transparent", fontSize: 14.5, fontFamily: "inherit", resize: "none", lineHeight: 1.7, color: T.text }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, paddingTop: 12, borderTop: `1px solid ${T.borderSoft}` }}>
          <div style={{ fontSize: 11.5, color: T.muted2 }}>{cfg.hint}</div>
          <div style={{ flex: 1 }} />
          <button onClick={onStart} disabled={loading || !text.trim()} style={{
            padding: "8px 20px", fontSize: 13, fontWeight: 600,
            background: (loading || !text.trim()) ? T.muted3 : T.brand,
            color: "#fff", border: "none", borderRadius: 100,
            cursor: (loading || !text.trim()) ? "not-allowed" : "pointer", fontFamily: "inherit",
          }}>{loading ? "生成中..." : "开始 →"}</button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, width: 600, flexWrap: "wrap", justifyContent: "center" }}>
        <span style={{ fontSize: 12, color: T.muted2, marginRight: 4 }}>快速开始:</span>
        {cfg.chips.map((c, i) => (
          <div key={i} onClick={() => setText(c)} style={{ padding: "6px 12px", background: "#fff", border: `1px solid ${T.border}`, borderRadius: 100, fontSize: 12, color: T.muted, cursor: "pointer" }}>{c}</div>
        ))}
      </div>

      {err && <div style={{ width: 600, padding: 12, background: T.redSoft, color: T.red, borderRadius: 10, fontSize: 13 }}>⚠️ {err}</div>}

      <div style={{ maxWidth: 600, padding: 12, background: T.amberSoft, border: `1px solid ${T.amber}33`, borderRadius: 10, fontSize: 12, color: T.amber, lineHeight: 1.6 }}>
        🚧 当前为 Phase 1 简版:输入 → 直出一版文案。完整 5 步流(批量/挑最佳/配图/发布)在 Phase 2 落地。
      </div>
    </div>
  );
}

function EntryResult({ cfg, result, tokens, setResult, original, onReset, onNav }) {
  const [editing, setEditing] = React.useState(result);
  React.useEffect(() => { setEditing(result); }, [result]);

  async function regen() {
    setEditing(""); setResult("");
    try {
      const prefixed = `${cfg.aiContext}\n\n原输入:${original.trim()}\n\n(请给一版更有吸引力的新版本)`;
      const r = await api.post("/api/rewrite", { text: prefixed, style: cfg.aiPrompt });
      setResult(r.text);
    } catch (e) { alert(e.message); }
  }

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: "32px 40px 120px" }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 24, fontWeight: 700, color: T.text, marginBottom: 6 }}>{cfg.name}已出一版 ✨</div>
        <div style={{ fontSize: 13, color: T.muted }}>不满意直接在下面改,或"再来一版"。完整 5 步流在 Phase 2 实装。</div>
      </div>

      <div style={{ background: "#fff", border: `1px solid ${T.borderSoft}`, borderRadius: 12, padding: 24 }}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 12 }}>
          <div style={{ fontSize: 11.5, color: T.muted2, fontWeight: 600, letterSpacing: "0.08em" }}>改写结果 · {(editing || "").length} 字 {tokens ? `· ${tokens} tokens` : ""}</div>
          <div style={{ flex: 1 }} />
          <button onClick={regen} style={{ fontSize: 11.5, color: T.brand, background: "transparent", border: "none", cursor: "pointer", fontFamily: "inherit" }}>🔄 再来一版</button>
        </div>
        <textarea
          value={editing || ""}
          onChange={e => setEditing(e.target.value)}
          style={{ width: "100%", border: "none", outline: "none", background: "transparent", fontSize: 15.5, fontFamily: "inherit", resize: "vertical", lineHeight: 1.9, color: T.text, minHeight: 260 }}
        />
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
        <Btn variant="outline" onClick={onReset}>← 换一个输入</Btn>
        <div style={{ flex: 1 }} />
        <Btn onClick={() => navigator.clipboard?.writeText(editing || "")}>📋 复制</Btn>
        {cfg.name === "投流文案" && <Btn variant="primary" onClick={() => onNav("make")}>做成短视频 →</Btn>}
        {cfg.name === "公众号" && <Btn variant="primary" onClick={() => navigator.clipboard?.writeText(editing || "")}>复制 · 贴到公众号后台 →</Btn>}
        {cfg.name === "朋友圈" && <Btn variant="primary" onClick={() => navigator.clipboard?.writeText(editing || "")}>复制 · 贴到朋友圈 →</Btn>}
      </div>
    </div>
  );
}

function EntryChatBar({ cfg }) {
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
        <div style={{ fontSize: 13, color: T.text, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{cfg.chatPrompt}</div>
        <div style={{ display: "flex", gap: 6, marginTop: 5 }}>
          {cfg.chatChips.map((c, i) => (
            <div key={i} style={{ padding: "3px 10px", background: T.bg2, border: `1px solid ${T.borderSoft}`, borderRadius: 100, fontSize: 11, color: T.muted, cursor: "pointer", whiteSpace: "nowrap" }}>{c}</div>
          ))}
        </div>
      </div>
      <div style={{ flex: 1 }} />
      <div style={{ display: "flex", alignItems: "center", gap: 8, width: 420, background: T.bg2, border: `1px solid ${T.border}`, borderRadius: 100, padding: "4px 4px 4px 16px" }}>
        <input value={text} onChange={e => setText(e.target.value)} placeholder="跟小华说..." style={{ flex: 1, border: "none", outline: "none", background: "transparent", fontSize: 13, fontFamily: "inherit", color: T.text }} />
        <button style={{ width: 30, height: 30, borderRadius: "50%", background: T.text, color: "#fff", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>➤</button>
      </div>
    </div>
  );
}

Object.assign(window, { PageAd, PageWechat, PageMoments });
