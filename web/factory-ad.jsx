// factory-ad.jsx — 投流文案 完整 5 步:卖点 → 批量 5 版 → 挑最佳 → 配图 → 投放
// 视觉延续 factory-flow.jsx 的顶栏进度条 + 底部横向对话栏模式

const AD_STEPS = [
  { id: "pitch",  n: 1, label: "卖点" },
  { id: "batch",  n: 2, label: "批量 5 版" },
  { id: "pick",   n: 3, label: "挑最佳" },
  { id: "cover",  n: 4, label: "配图" },
  { id: "post",   n: 5, label: "投放" },
];

const AD_PLATFORMS = [
  { id: "douyin",    label: "抖音信息流",     hint: "竖版 · 3-7 秒完读", hot: true },
  { id: "shipinhao", label: "视频号短文案",   hint: "中年老板多 · 稳重有料" },
  { id: "moments",   label: "朋友圈广告",     hint: "熟人感 · 不硬推" },
  { id: "xhs",       label: "小红书笔记体",   hint: "种草感 · 避免硬广" },
];

function PageAd({ onNav }) {
  const [step, setStep] = React.useState("pitch");
  const [pitch, setPitch] = React.useState("");
  const [platform, setPlatform] = React.useState("douyin");
  const [loading, setLoading] = React.useState(false);
  const [items, setItems] = React.useState([]);       // 5 版文案
  const [kbUsed, setKbUsed] = React.useState([]);
  const [picked, setPicked] = React.useState(new Set());
  const [covers, setCovers] = React.useState([]);     // 4 张封面
  const [published, setPublished] = React.useState(false);

  async function generate() {
    if (!pitch.trim()) return;
    setLoading(true); setItems([]);
    setStep("batch");
    try {
      const r = await api.post("/api/ad/generate", { pitch: pitch.trim(), platform, n: 5, use_kb: true });
      setItems(r.items || []);
      setKbUsed(r.kb_used || []);
      // 默认勾选最高分那版
      if (r.items && r.items.length) {
        const best = [...r.items].sort((a, b) => (b.score || 0) - (a.score || 0))[0];
        const idx = r.items.indexOf(best);
        setPicked(new Set([idx]));
      }
      setStep("pick");
    } catch (e) { alert(e.message); setStep("pitch"); }
    setLoading(false);
  }

  function togglePick(idx) {
    const next = new Set(picked);
    if (next.has(idx)) next.delete(idx);
    else next.add(idx);
    setPicked(next);
  }

  async function genCovers() {
    if (picked.size === 0) return;
    setStep("cover");
    const first = items[[...picked][0]];
    const slogan = (first?.copy || "").split(/[\n。!?!?]/).filter(s => s.trim().length >= 4)[0]?.slice(0, 14) || "精彩内容";
    try {
      const r = await api.post("/api/cover", { slogan, category: "投流素材", n: 4 });
      const ts = r.tasks.map(t => ({ task_id: t.task_id, status: "running", media_url: null }));
      setCovers(ts);
      ts.forEach((t, idx) => pollCover(t.task_id, idx));
    } catch (e) { alert(e.message); }
  }
  async function pollCover(tid, idx) {
    for (let i = 0; i < 40; i++) {
      try {
        const r = await api.get(`/api/cover/query/${tid}`);
        setCovers(prev => prev.map((c, j) => j === idx ? { ...c, status: r.status, media_url: r.media_url } : c));
        if (r.status === "succeed" || r.status === "failed") return;
      } catch {}
      await new Promise(r => setTimeout(r, 5000));
    }
  }

  const CHAT_PROMPTS = {
    pitch: { prompt: "说说这次要推的是啥?一句话说清卖点", chips: ["抖音信息流", "视频号", "朋友圈", "小红书"] },
    batch: { prompt: "小华正在从 3 个清华哥的业务素材里出 5 版不同角度", chips: ["痛点型", "好奇型", "数字型"] },
    pick:  { prompt: "挑一版或几版你最喜欢的,小华给每版都点评了", chips: ["都还行", "换一批", "加工一版"] },
    cover: { prompt: "4 张封面并发生成 · GPT-Image-2", chips: ["换配色", "加大字", "侧重数字"] },
    post:  { prompt: "复制文案 + 封面 → 贴到投放后台就能跑了", chips: ["复制抖音", "复制视频号", "都复制"] },
  };
  const sp = CHAT_PROMPTS[step];

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", background: T.bg, position: "relative", overflow: "hidden" }}>
      <AdFlowHeader current={step} onBack={() => onNav("home")} />
      <div style={{ flex: 1, overflow: "auto" }}>
        {step === "pitch" && <StepPitch pitch={pitch} setPitch={setPitch} platform={platform} setPlatform={setPlatform} onGo={generate} loading={loading} />}
        {step === "batch" && <StepBatching pitch={pitch} platform={platform} kbUsed={kbUsed} />}
        {step === "pick" && <StepPick items={items} picked={picked} togglePick={togglePick} kbUsed={kbUsed} onRegen={generate} onNext={genCovers} onPrev={() => setStep("pitch")} />}
        {step === "cover" && <StepCoverGen covers={covers} items={items} picked={picked} onNext={() => setStep("post")} onPrev={() => setStep("pick")} />}
        {step === "post" && <StepPost items={items} picked={picked} covers={covers} platform={platform} onDone={() => { setPublished(true); onNav("works"); }} onPrev={() => setStep("cover")} onNav={onNav} />}
      </div>
      <AdChatBar prompt={sp.prompt} chips={sp.chips} />
    </div>
  );
}

function AdFlowHeader({ current, onBack }) {
  return (
    <div style={{
      padding: "12px 24px", background: "#fff", borderBottom: `1px solid ${T.border}`,
      display: "flex", alignItems: "center", gap: 14, flexShrink: 0,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ width: 26, height: 26, borderRadius: 7, background: T.text, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13 }}>💰</div>
        <div style={{ fontSize: 13.5, fontWeight: 600 }}>投流文案 · 5 步</div>
      </div>
      <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 6, marginLeft: 8 }}>
        {AD_STEPS.map((s, i) => {
          const active = s.id === current;
          const done = AD_STEPS.findIndex(x => x.id === current) > i;
          return (
            <React.Fragment key={s.id}>
              <div style={{
                display: "flex", alignItems: "center", gap: 5,
                padding: "4px 10px 4px 5px", borderRadius: 100, fontSize: 11.5, fontWeight: 500,
                background: active ? T.text : "transparent",
                color: active ? "#fff" : done ? T.brand : T.muted,
                whiteSpace: "nowrap",
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
              {i < AD_STEPS.length - 1 && <span style={{ color: T.muted3, fontSize: 10 }}>—</span>}
            </React.Fragment>
          );
        })}
      </div>
      <ApiStatusLight />
      <button onClick={onBack} style={{ background: "transparent", border: "none", color: T.muted, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>← 返回</button>
    </div>
  );
}

function AdChatBar({ prompt, chips }) {
  const [text, setText] = React.useState("");
  return (
    <div style={{
      padding: "12px 24px", background: "#fff", borderTop: `1px solid ${T.border}`,
      display: "flex", alignItems: "center", gap: 14, flexShrink: 0,
    }}>
      <div style={{ width: 30, height: 30, borderRadius: "50%", background: T.brandSoft, color: T.brand, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, flexShrink: 0 }}>华</div>
      <div style={{ minWidth: 0, maxWidth: 360 }}>
        <div style={{ fontSize: 13, color: T.text, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{prompt}</div>
        <div style={{ display: "flex", gap: 6, marginTop: 5 }}>
          {chips.map((c, i) => (
            <div key={i} style={{ padding: "3px 10px", background: T.bg2, border: `1px solid ${T.borderSoft}`, borderRadius: 100, fontSize: 11, color: T.muted, cursor: "pointer", whiteSpace: "nowrap" }}>{c}</div>
          ))}
        </div>
      </div>
      <div style={{ flex: 1 }} />
      <div style={{ display: "flex", alignItems: "center", gap: 8, width: 420, background: T.bg2, border: `1px solid ${T.border}`, borderRadius: 100, padding: "4px 4px 4px 16px" }}>
        <input value={text} onChange={e => setText(e.target.value)} placeholder="想改哪里跟小华说..." style={{ flex: 1, border: "none", outline: "none", background: "transparent", fontSize: 13, fontFamily: "inherit", color: T.text }} />
        <button style={{ width: 30, height: 30, borderRadius: "50%", background: T.text, color: "#fff", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>➤</button>
      </div>
    </div>
  );
}

// ─── Step 1 · 卖点 ───
function StepPitch({ pitch, setPitch, platform, setPlatform, onGo, loading }) {
  return (
    <div style={{ padding: "40px 40px 120px", maxWidth: 760, margin: "0 auto" }}>
      <div style={{ textAlign: "center", marginBottom: 28 }}>
        <div style={{ fontSize: 28, fontWeight: 700, color: T.text, marginBottom: 8, letterSpacing: "-0.02em" }}>说说这次要推的是啥? 💰</div>
        <div style={{ fontSize: 14, color: T.muted }}>一句话说清卖点 · 小华拉知识库 · 批量出 5 版 · 自动挑最佳</div>
      </div>

      <div style={{ background: "#fff", border: `1.5px solid ${T.brand}`, boxShadow: `0 0 0 5px ${T.brandSoft}`, borderRadius: 16, padding: 18, marginBottom: 18 }}>
        <textarea
          rows={5}
          value={pitch}
          onChange={e => setPitch(e.target.value)}
          placeholder="例:私域课程 · 针对中年老板 · 主打「一个人也能做起来」· 客单价 1000 以内..."
          style={{ width: "100%", border: "none", outline: "none", background: "transparent", fontSize: 14.5, fontFamily: "inherit", resize: "none", lineHeight: 1.7, color: T.text }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, paddingTop: 12, borderTop: `1px solid ${T.borderSoft}` }}>
          <div style={{ fontSize: 11.5, color: T.muted2 }}>💡 一个卖点越聚焦,出文案越精准 · 自动带上清华哥知识库素材</div>
          <div style={{ flex: 1 }} />
          <button onClick={onGo} disabled={!pitch.trim() || loading} style={{
            padding: "8px 20px", fontSize: 13, fontWeight: 600,
            background: (!pitch.trim() || loading) ? T.muted3 : T.brand,
            color: "#fff", border: "none", borderRadius: 100,
            cursor: (!pitch.trim() || loading) ? "not-allowed" : "pointer", fontFamily: "inherit",
          }}>{loading ? "生成中..." : "开始批量出 5 版 →"}</button>
        </div>
      </div>

      <div style={{ fontSize: 11.5, color: T.muted, fontWeight: 600, letterSpacing: "0.08em", marginBottom: 10 }}>选一个投放渠道</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
        {AD_PLATFORMS.map(p => (
          <div key={p.id} onClick={() => setPlatform(p.id)} style={{
            padding: 14, borderRadius: 10, cursor: "pointer",
            background: platform === p.id ? T.brandSoft : "#fff",
            border: `1px solid ${platform === p.id ? T.brand : T.borderSoft}`,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: T.text }}>{p.label}</div>
              {p.hot && <Tag size="xs" color="green">推荐</Tag>}
            </div>
            <div style={{ fontSize: 11.5, color: T.muted }}>{p.hint}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Step 2 · 批量中(加载态) ───
function StepBatching({ pitch, platform, kbUsed }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "60px 40px", gap: 18, minHeight: "70%" }}>
      <div style={{ width: 96, height: 96, borderRadius: "50%", background: T.brandSoft, position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: 96, height: 96, borderRadius: "50%", border: `4px solid ${T.brandSoft}`, borderTopColor: T.brand, animation: "qlspin 1.2s linear infinite", position: "absolute", top: 0, left: 0 }} />
        <div style={{ fontSize: 28 }}>💰</div>
      </div>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: T.text, marginBottom: 6 }}>小华正在拉知识库、出 5 版...</div>
        <div style={{ fontSize: 13, color: T.muted }}>通常 10-20 秒 · 5 版不同角度(痛点/好奇/反常识/数字/场景)</div>
      </div>
      <div style={{ width: 520, padding: 12, background: "#fff", border: `1px solid ${T.borderSoft}`, borderRadius: 10, fontSize: 12, color: T.muted, lineHeight: 1.6 }}>
        <div style={{ color: T.text, fontWeight: 600, marginBottom: 4 }}>你的卖点</div>
        <div>{pitch.slice(0, 100)}{pitch.length > 100 ? "..." : ""}</div>
      </div>
    </div>
  );
}

// ─── Step 3 · 挑最佳 ───
function StepPick({ items, picked, togglePick, kbUsed, onRegen, onNext, onPrev }) {
  return (
    <div style={{ padding: "32px 40px 120px", maxWidth: 1040, margin: "0 auto" }}>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: T.text, marginBottom: 6 }}>5 版出好了,挑一版或几版 🎯</div>
        <div style={{ fontSize: 13, color: T.muted }}>小华给每版都点评了「适合谁 / 优势 / 风险」。已勾选默认最佳,可改。</div>
      </div>

      {kbUsed.length > 0 && (
        <div style={{ padding: "9px 12px", background: T.brandSoft, border: `1px solid ${T.brand}44`, borderRadius: 8, fontSize: 12, color: T.brand, marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
          <span>📚</span>
          <span>已从知识库注入 {kbUsed.length} 条相关素材(清华哥的业务卖点/金句/案例)</span>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {items.map((it, i) => {
          const on = picked.has(i);
          return (
            <div key={i} onClick={() => togglePick(i)} style={{
              padding: 16, background: on ? T.brandSoft : "#fff",
              border: `1px solid ${on ? T.brand : T.borderSoft}`,
              borderRadius: 12, cursor: "pointer", display: "flex", gap: 14,
            }}>
              <div style={{
                width: 20, height: 20, borderRadius: 4, marginTop: 2,
                border: `1.5px solid ${on ? T.brand : T.muted2}`,
                background: on ? T.brand : "transparent",
                display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                color: "#fff", fontSize: 11, fontWeight: 700,
              }}>{on ? "✓" : ""}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <Tag size="xs" color={["pink","blue","purple","amber","green"][i % 5]}>{it.angle || `第 ${i+1} 版`}</Tag>
                  {it.score > 0 && <span style={{ fontSize: 11, color: T.muted2, fontFamily: "SF Mono, monospace" }}>AI 评分 {it.score}</span>}
                  <span style={{ fontSize: 11, color: T.muted2 }}>· {(it.copy || "").length} 字</span>
                </div>
                <div style={{ fontSize: 14, lineHeight: 1.8, color: T.text, whiteSpace: "pre-wrap", marginBottom: 8 }}>
                  {it.copy}
                </div>
                <div style={{ fontSize: 11.5, color: T.muted, background: T.bg2, borderRadius: 6, padding: "6px 10px", lineHeight: 1.6 }}>
                  💬 <b style={{ color: T.text }}>小华点评:</b> {it.comment}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ display: "flex", marginTop: 20, alignItems: "center", gap: 10 }}>
        <Btn variant="outline" onClick={onPrev}>← 改卖点</Btn>
        <Btn onClick={onRegen}>🔄 再来一轮 5 版</Btn>
        <div style={{ flex: 1 }} />
        <div style={{ fontSize: 12, color: T.muted, marginRight: 10 }}>已挑 {picked.size} 版</div>
        <Btn variant="primary" onClick={onNext} disabled={picked.size === 0}>给挑的这 {picked.size} 版配图 →</Btn>
      </div>
    </div>
  );
}

// ─── Step 4 · 配图 ───
function StepCoverGen({ covers, items, picked, onNext, onPrev }) {
  const first = items[[...picked][0]];
  return (
    <div style={{ padding: "32px 40px 120px", maxWidth: 960, margin: "0 auto" }}>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: T.text, marginBottom: 6 }}>配 4 张封面 🎨</div>
        <div style={{ fontSize: 13, color: T.muted }}>GPT-Image-2 并发生成 · 挑一张喜欢的跟文案一起贴到投放后台</div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 18 }}>
        {(covers.length ? covers : Array(4).fill({ status: "running" })).map((c, i) => (
          <div key={i} style={{
            aspectRatio: "3/4", borderRadius: 10, overflow: "hidden",
            background: c.media_url ? `url(${api.media(c.media_url)}) center/cover` : T.bg2,
            border: `1px solid ${T.borderSoft}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            color: T.muted, fontSize: 11,
          }}>
            {!c.media_url && (c.status === "failed" ? <span style={{ color: T.red }}>失败</span> : "生成中...")}
          </div>
        ))}
      </div>

      {first && (
        <div style={{ padding: 14, background: T.bg2, border: `1px solid ${T.borderSoft}`, borderRadius: 10 }}>
          <div style={{ fontSize: 11.5, color: T.muted, fontWeight: 600, letterSpacing: "0.08em", marginBottom: 6 }}>选中的第一版文案</div>
          <div style={{ fontSize: 13.5, lineHeight: 1.75, color: T.text, whiteSpace: "pre-wrap" }}>{first.copy}</div>
        </div>
      )}

      <div style={{ display: "flex", marginTop: 20, alignItems: "center" }}>
        <Btn variant="outline" onClick={onPrev}>← 重挑文案</Btn>
        <div style={{ flex: 1 }} />
        <Btn variant="primary" onClick={onNext}>去投放 →</Btn>
      </div>
    </div>
  );
}

// ─── Step 5 · 投放 ───
function StepPost({ items, picked, covers, platform, onDone, onPrev, onNav }) {
  const [copiedIdx, setCopiedIdx] = React.useState(null);
  function copy(text, idx) {
    navigator.clipboard?.writeText(text);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 1500);
  }
  const pickedItems = [...picked].map(i => items[i]).filter(Boolean);
  return (
    <div style={{ padding: "32px 40px 120px", maxWidth: 960, margin: "0 auto" }}>
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: T.text, marginBottom: 6 }}>投出去吧 🚀</div>
        <div style={{ fontSize: 13, color: T.muted }}>投放平台不开 API,复制文案+封面 → 贴到 {platform} 后台就能跑。</div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {pickedItems.map((it, i) => (
          <div key={i} style={{ padding: 16, background: "#fff", border: `1px solid ${T.borderSoft}`, borderRadius: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <Tag size="xs" color={["pink","blue","purple","amber","green"][i % 5]}>{it.angle}</Tag>
              <div style={{ flex: 1, fontSize: 12, color: T.muted }}>{(it.copy || "").length} 字</div>
              <Btn size="sm" variant={copiedIdx === i ? "soft" : "outline"} onClick={() => copy(it.copy, i)}>
                {copiedIdx === i ? "✓ 已复制" : "📋 复制文案"}
              </Btn>
            </div>
            <div style={{ fontSize: 13.5, lineHeight: 1.8, color: T.text, whiteSpace: "pre-wrap", background: T.bg2, padding: 12, borderRadius: 8 }}>{it.copy}</div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 18, padding: 12, background: T.amberSoft, border: `1px solid ${T.amber}33`, borderRadius: 10, fontSize: 12.5, color: T.amber }}>
        🚧 一键投放(浏览器自动化打开抖音投放后台 / 视频号助手)· Phase 3 落地
      </div>

      <div style={{ display: "flex", marginTop: 20, alignItems: "center", gap: 10 }}>
        <Btn variant="outline" onClick={onPrev}>← 换配图</Btn>
        <div style={{ flex: 1 }} />
        <Btn onClick={() => onNav?.("make")}>做成短视频 →</Btn>
        <Btn variant="primary" onClick={onDone}>完成 · 回首页</Btn>
      </div>
    </div>
  );
}

Object.assign(window, { PageAd });
