// factory-moments.jsx — 朋友圈 4 步:选题 → 衍生 3-5 条 → 配图 → 一键复制

const MOMENTS_STEPS = [
  { id: "topic",   n: 1, label: "选题" },
  { id: "derive",  n: 2, label: "衍生 3-5 条" },
  { id: "cover",   n: 3, label: "配图" },
  { id: "copy",    n: 4, label: "一键复制" },
];

function PageMoments({ onNav }) {
  const [step, setStep] = React.useState("topic");
  const [topic, setTopic] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [items, setItems] = React.useState([]);
  const [kbUsed, setKbUsed] = React.useState([]);
  const [coversMap, setCoversMap] = React.useState({});   // itemIdx → [cover...]

  async function derive() {
    if (!topic.trim()) return;
    setLoading(true); setItems([]);
    setStep("derive");
    try {
      const r = await api.post("/api/moments/derive", { topic: topic.trim(), n: 5, use_kb: true, deep: getDeep() });
      setItems(r.items || []);
      setKbUsed(r.kb_used || []);
    } catch (e) { alert(e.message); setStep("topic"); }
    setLoading(false);
  }

  async function genCoverFor(idx) {
    const it = items[idx];
    const slogan = (it?.text || "").split(/[\n。!?!?]/).filter(s => s.trim().length >= 4)[0]?.slice(0, 14) || "今日一句";
    try {
      const r = await api.post("/api/cover", { slogan, category: "朋友圈配图", n: 1, size: "1:1" });
      const tid = r.tasks[0].task_id;
      setCoversMap(prev => ({ ...prev, [idx]: { task_id: tid, status: "running", media_url: null } }));
      for (let i = 0; i < 40; i++) {
        await new Promise(r => setTimeout(r, 5000));
        const q = await api.get(`/api/cover/query/${tid}`);
        setCoversMap(prev => ({ ...prev, [idx]: q }));
        if (q.status === "succeed" || q.status === "failed") return;
      }
    } catch (e) { alert(e.message); }
  }

  const CHAT = {
    topic:  { prompt: "发一组朋友圈吧 · 一个话题,小华衍生 3-5 条不同角度", chips: ["老板心法", "干货输出", "学员动态", "今日一句"] },
    derive: { prompt: "小华正从金句库里找灵感...", chips: ["再快一点", "更犀利", "换口气"] },
    cover:  { prompt: "点每条底下的'生成配图',AI 按内容来配一张 1:1 图", chips: ["不用配图", "全都配", "换风格"] },
    copy:   { prompt: "分别复制,按朋友圈节奏一条一条发", chips: ["都复制", "只复制第一条", "隔半小时再发下一条"] },
  };
  const sp = CHAT[step];

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", background: T.bg, position: "relative", overflow: "hidden" }}>
      <MomentsHeader current={step} onBack={() => onNav("home")} />
      <div style={{ flex: 1, overflow: "auto" }}>
        {step === "topic" && <MStepTopic topic={topic} setTopic={setTopic} onGo={derive} loading={loading} />}
        {step === "derive" && <MStepDeriving topic={topic} items={items} loading={loading} onPrev={() => setStep("topic")} onNext={() => setStep("cover")} />}
        {step === "cover" && <MStepCover items={items} coversMap={coversMap} onGenCover={genCoverFor} onPrev={() => setStep("derive")} onNext={() => setStep("copy")} />}
        {step === "copy" && <MStepCopy items={items} coversMap={coversMap} onPrev={() => setStep("cover")} onDone={() => onNav("home")} />}
      </div>
      <MChatBar prompt={sp.prompt} chips={sp.chips} />
    </div>
  );
}

function MomentsHeader({ current, onBack }) {
  return (
    <div style={{ padding: "12px 24px", background: "#fff", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 14, flexShrink: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ width: 26, height: 26, borderRadius: 7, background: T.text, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13 }}>📱</div>
        <div style={{ fontSize: 13.5, fontWeight: 600 }}>朋友圈 · 4 步</div>
      </div>
      <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 6, marginLeft: 8 }}>
        {MOMENTS_STEPS.map((s, i) => {
          const active = s.id === current;
          const done = MOMENTS_STEPS.findIndex(x => x.id === current) > i;
          return (
            <React.Fragment key={s.id}>
              <div style={{
                display: "flex", alignItems: "center", gap: 5, padding: "4px 10px 4px 5px", borderRadius: 100, fontSize: 11.5, fontWeight: 500,
                background: active ? T.text : "transparent",
                color: active ? "#fff" : done ? T.brand : T.muted,
                whiteSpace: "nowrap",
              }}>
                <div style={{
                  width: 18, height: 18, borderRadius: "50%",
                  background: active ? "#fff" : done ? T.brandSoft : T.bg2,
                  color: active ? T.text : done ? T.brand : T.muted2,
                  display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700,
                }}>{done ? "✓" : s.n}</div>
                {s.label}
              </div>
              {i < MOMENTS_STEPS.length - 1 && <span style={{ color: T.muted3, fontSize: 10 }}>—</span>}
            </React.Fragment>
          );
        })}
      </div>
      <ApiStatusLight />
      <button onClick={onBack} style={{ background: "transparent", border: "none", color: T.muted, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>← 返回</button>
    </div>
  );
}

function MChatBar({ prompt, chips }) {
  const [text, setText] = React.useState("");
  return (
    <div style={{ padding: "12px 24px", background: "#fff", borderTop: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 14, flexShrink: 0 }}>
      <div style={{ width: 30, height: 30, borderRadius: "50%", background: T.brandSoft, color: T.brand, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, flexShrink: 0 }}>华</div>
      <div style={{ minWidth: 0, maxWidth: 380 }}>
        <div style={{ fontSize: 13, color: T.text, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{prompt}</div>
        <div style={{ display: "flex", gap: 6, marginTop: 5 }}>
          {chips.map((c, i) => (
            <div key={i} style={{ padding: "3px 10px", background: T.bg2, border: `1px solid ${T.borderSoft}`, borderRadius: 100, fontSize: 11, color: T.muted, cursor: "pointer", whiteSpace: "nowrap" }}>{c}</div>
          ))}
        </div>
      </div>
      <div style={{ flex: 1 }} />
      <div style={{ display: "flex", alignItems: "center", gap: 8, width: 420, background: T.bg2, border: `1px solid ${T.border}`, borderRadius: 100, padding: "4px 4px 4px 16px" }}>
        <input value={text} onChange={e => setText(e.target.value)} placeholder="跟小华说..." style={{ flex: 1, border: "none", outline: "none", background: "transparent", fontSize: 13, fontFamily: "inherit", color: T.text }} />
        <button style={{ width: 30, height: 30, borderRadius: "50%", background: T.text, color: "#fff", border: "none", cursor: "pointer" }}>➤</button>
      </div>
    </div>
  );
}

// Step 1 · 选题
function MStepTopic({ topic, setTopic, onGo, loading }) {
  return (
    <div style={{ padding: "40px 40px 120px", maxWidth: 720, margin: "0 auto" }}>
      <div style={{ textAlign: "center", marginBottom: 24 }}>
        <div style={{ fontSize: 28, fontWeight: 700, color: T.text, marginBottom: 8, letterSpacing: "-0.02em" }}>发一组朋友圈吧 📱</div>
        <div style={{ fontSize: 14, color: T.muted }}>一个话题 · 小华从金句库衍生 3-5 条不同角度 · 配图一键复制</div>
        <div style={{ marginTop: 12, display: "flex", justifyContent: "center" }}>
          <DeepToggle />
        </div>
      </div>

      <div style={{ background: "#fff", border: `1.5px solid ${T.brand}`, boxShadow: `0 0 0 5px ${T.brandSoft}`, borderRadius: 16, padding: 18, marginBottom: 18 }}>
        <textarea
          rows={4}
          value={topic}
          onChange={e => setTopic(e.target.value)}
          placeholder="例:今天想发「老板心法 · 私域复购」相关 · 或直接贴一句话..."
          style={{ width: "100%", border: "none", outline: "none", background: "transparent", fontSize: 14.5, fontFamily: "inherit", resize: "none", lineHeight: 1.7, color: T.text }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, paddingTop: 12, borderTop: `1px solid ${T.borderSoft}` }}>
          <div style={{ fontSize: 11.5, color: T.muted2 }}>📚 小华自动从「钩子库 + 认知金句 + 朋友圈风格 DNA」里取素材</div>
          <div style={{ flex: 1 }} />
          <button onClick={onGo} disabled={!topic.trim() || loading} style={{
            padding: "8px 20px", fontSize: 13, fontWeight: 600,
            background: (!topic.trim() || loading) ? T.muted3 : T.brand,
            color: "#fff", border: "none", borderRadius: 100,
            cursor: (!topic.trim() || loading) ? "not-allowed" : "pointer", fontFamily: "inherit",
          }}>{loading ? "生成中..." : "衍生 5 条 →"}</button>
        </div>
      </div>

      <div style={{ fontSize: 11.5, color: T.muted, fontWeight: 600, letterSpacing: "0.08em", marginBottom: 10 }}>快速开始</div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {["老板心法 · 私域复购", "AI 时代趋势观察", "今日金句", "学员案例 · Rose 单月破百万", "干货:前后端一致性链路"].map((c, i) => (
          <div key={i} onClick={() => setTopic(c)} style={{ padding: "7px 14px", background: "#fff", border: `1px solid ${T.border}`, borderRadius: 100, fontSize: 12.5, color: T.muted, cursor: "pointer" }}>{c}</div>
        ))}
      </div>
    </div>
  );
}

// Step 2 · 衍生中 + 列表
function MStepDeriving({ topic, items, loading, onPrev, onNext }) {
  if (loading || items.length === 0) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "60px 40px", gap: 18, minHeight: "70%" }}>
        <div style={{ width: 96, height: 96, borderRadius: "50%", background: T.brandSoft, position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ width: 96, height: 96, borderRadius: "50%", border: `4px solid ${T.brandSoft}`, borderTopColor: T.brand, animation: "qlspin 1.2s linear infinite", position: "absolute", top: 0, left: 0 }} />
          <div style={{ fontSize: 28 }}>📱</div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 20, fontWeight: 700 }}>小华正从金句库衍生朋友圈</div>
          <div style={{ fontSize: 13, color: T.muted, marginTop: 6 }}>通常 10-15 秒 · 覆盖 老板心法/学员动态/今日一句/干货/生活感悟 5 种类型</div>
        </div>
      </div>
    );
  }
  return (
    <div style={{ padding: "32px 40px 120px", maxWidth: 820, margin: "0 auto" }}>
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: T.text, marginBottom: 6 }}>{items.length} 条出好了 ✨</div>
        <div style={{ fontSize: 13, color: T.muted }}>看看哪几条合你口味 · 也可直接编辑 · 下一步给想配图的那几条生成 1:1 图</div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {items.map((m, i) => (
          <div key={i} style={{ padding: 16, background: "#fff", border: `1px solid ${T.borderSoft}`, borderRadius: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 20 }}>{m.emoji}</span>
              <Tag size="xs" color={["pink", "purple", "amber", "blue", "green"][i % 5]}>{m.type}</Tag>
              <span style={{ fontSize: 11, color: T.muted2 }}>· {(m.text || "").length} 字</span>
            </div>
            <div style={{ fontSize: 14, lineHeight: 1.85, color: T.text, whiteSpace: "pre-wrap" }}>{m.text}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", marginTop: 20 }}>
        <Btn variant="outline" onClick={onPrev}>← 换话题</Btn>
        <div style={{ flex: 1 }} />
        <Btn variant="primary" onClick={onNext}>去配图 →</Btn>
      </div>
    </div>
  );
}

// Step 3 · 配图
function MStepCover({ items, coversMap, onGenCover, onPrev, onNext }) {
  return (
    <div style={{ padding: "32px 40px 120px", maxWidth: 860, margin: "0 auto" }}>
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: T.text, marginBottom: 6 }}>配个图? 🎨</div>
        <div style={{ fontSize: 13, color: T.muted }}>点"生成配图"为这条出一张 1:1 方图 · 不配图直接下一步</div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {items.map((m, i) => {
          const c = coversMap[i];
          return (
            <div key={i} style={{ padding: 14, background: "#fff", border: `1px solid ${T.borderSoft}`, borderRadius: 12, display: "flex", gap: 12 }}>
              <div style={{ width: 120, height: 120, borderRadius: 8, flexShrink: 0, background: c?.media_url ? `url(${api.media(c.media_url)}) center/cover` : T.bg2, border: `1px solid ${T.borderSoft}`, display: "flex", alignItems: "center", justifyContent: "center", color: T.muted, fontSize: 11 }}>
                {!c && "(未配图)"}
                {c && !c.media_url && (c.status === "failed" ? <span style={{ color: T.red }}>失败</span> : "生成中...")}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <Tag size="xs" color={["pink", "purple", "amber", "blue", "green"][i % 5]}>{m.type}</Tag>
                </div>
                <div style={{ fontSize: 13, color: T.text, lineHeight: 1.75, marginBottom: 10, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                  {m.text}
                </div>
                <Btn size="sm" onClick={() => onGenCover(i)} disabled={c && !c.media_url && c.status !== "failed"}>
                  {!c ? "🎨 生成配图" : c.media_url ? "↻ 换一张" : c.status === "failed" ? "重试" : "生成中..."}
                </Btn>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ display: "flex", marginTop: 20 }}>
        <Btn variant="outline" onClick={onPrev}>← 改文案</Btn>
        <div style={{ flex: 1 }} />
        <Btn variant="primary" onClick={onNext}>去复制 →</Btn>
      </div>
    </div>
  );
}

// Step 4 · 一键复制
function MStepCopy({ items, coversMap, onPrev, onDone }) {
  const [copiedIdx, setCopiedIdx] = React.useState(null);
  function doCopy(i) {
    navigator.clipboard?.writeText(items[i]?.text || "");
    setCopiedIdx(i);
    setTimeout(() => setCopiedIdx(null), 1500);
  }
  return (
    <div style={{ padding: "32px 40px 120px", maxWidth: 820, margin: "0 auto" }}>
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: T.text, marginBottom: 6 }}>复制去发吧 📤</div>
        <div style={{ fontSize: 13, color: T.muted }}>一条一条复制 · 建议间隔 20-30 分钟发一条,别轰炸</div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {items.map((m, i) => {
          const c = coversMap[i];
          return (
            <div key={i} style={{ padding: 14, background: "#fff", border: `1px solid ${T.borderSoft}`, borderRadius: 12, display: "flex", gap: 12 }}>
              {c?.media_url && (
                <div style={{ width: 88, height: 88, borderRadius: 8, flexShrink: 0, background: `url(${api.media(c.media_url)}) center/cover` }} />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <Tag size="xs" color={["pink", "purple", "amber", "blue", "green"][i % 5]}>{m.type}</Tag>
                  <div style={{ flex: 1 }} />
                  <Btn size="sm" variant={copiedIdx === i ? "soft" : "outline"} onClick={() => doCopy(i)}>
                    {copiedIdx === i ? "✓ 已复制" : "📋 复制"}
                  </Btn>
                  {c?.media_url && (
                    <a href={api.media(c.media_url)} download style={{ textDecoration: "none" }}>
                      <Btn size="sm">⬇ 下图</Btn>
                    </a>
                  )}
                </div>
                <div style={{ fontSize: 13.5, color: T.text, lineHeight: 1.85, whiteSpace: "pre-wrap" }}>{m.text}</div>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 18, padding: 12, background: T.amberSoft, border: `1px solid ${T.amber}33`, borderRadius: 10, fontSize: 12.5, color: T.amber }}>
        🚧 一键定时发布到微信朋友圈 · Phase 3 落地(需要接微信 SDK / UI 自动化)
      </div>

      <div style={{ display: "flex", marginTop: 20 }}>
        <Btn variant="outline" onClick={onPrev}>← 换配图</Btn>
        <div style={{ flex: 1 }} />
        <Btn variant="primary" onClick={onDone}>完成 · 回首页</Btn>
      </div>
    </div>
  );
}

Object.assign(window, { PageMoments });
