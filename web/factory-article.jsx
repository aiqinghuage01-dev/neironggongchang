// factory-article.jsx — 公众号 5 步:选题 → 大纲 → 长文 → 排版 → 发布

const ART_STEPS = [
  { id: "topic",    n: 1, label: "选题" },
  { id: "outline",  n: 2, label: "大纲" },
  { id: "expand",   n: 3, label: "长文" },
  { id: "layout",   n: 4, label: "排版" },
  { id: "publish",  n: 5, label: "发布" },
];

function PageWechat({ onNav }) {
  const [step, setStep] = React.useState("topic");
  const [topic, setTopic] = React.useState("");
  const [outline, setOutline] = React.useState([]);
  const [kbUsed, setKbUsed] = React.useState([]);
  const [article, setArticle] = React.useState(null);    // {title, content, word_count, tokens}
  const [loading, setLoading] = React.useState(false);

  async function genOutline() {
    if (!topic.trim()) return;
    setLoading(true);
    setStep("outline");
    try {
      const r = await api.post("/api/article/outline", { topic: topic.trim(), use_kb: true, deep: getDeep() });
      setOutline(r.outline || []);
      setKbUsed(r.kb_used || []);
    } catch (e) { alert(e.message); setStep("topic"); }
    setLoading(false);
  }

  async function genArticle() {
    setLoading(true);
    setStep("expand");
    try {
      const r = await api.post("/api/article/expand", { topic: topic.trim(), outline, use_kb: true, deep: getDeep() });
      setArticle(r);
      setStep("layout");
    } catch (e) { alert(e.message); setStep("outline"); }
    setLoading(false);
  }

  const CHAT = {
    topic:   { prompt: "今天想写什么选题?一个观点 · 一句话就够", chips: ["方法论长文", "案例拆解", "观点输出", "行业观察"] },
    outline: { prompt: "小华正在拉知识库出大纲...", chips: ["加一段", "砍掉一段", "换逻辑链"] },
    expand:  { prompt: "基于大纲,小华在写 2000+ 字长文(这步比较慢)", chips: ["再犀利一点", "加学员案例", "改开头"] },
    layout:  { prompt: "长文写好啦 · Markdown 预览 · 可继续编辑", chips: ["加封面", "缩一点", "加 CTA"] },
    publish: { prompt: "复制 Markdown 贴公众号后台就能发", chips: ["复制全文", "下载 md", "去公众号后台"] },
  };
  const sp = CHAT[step];

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", background: T.bg, position: "relative", overflow: "hidden" }}>
      <ArtHeader current={step} onBack={() => onNav("home")} />
      <div style={{ flex: 1, overflow: "auto" }}>
        {step === "topic" && <AStepTopic topic={topic} setTopic={setTopic} onGo={genOutline} loading={loading} />}
        {step === "outline" && <AStepOutline topic={topic} outline={outline} setOutline={setOutline} kbUsed={kbUsed} loading={loading} onPrev={() => setStep("topic")} onNext={genArticle} onRegen={genOutline} />}
        {step === "expand" && <AStepExpanding loading={loading} article={article} onPrev={() => setStep("outline")} onNext={() => setStep("layout")} />}
        {step === "layout" && <AStepLayout article={article} setArticle={setArticle} onPrev={() => setStep("expand")} onNext={() => setStep("publish")} />}
        {step === "publish" && <AStepPublish article={article} onPrev={() => setStep("layout")} onDone={() => onNav("home")} />}
      </div>
      <AChatBar prompt={sp.prompt} chips={sp.chips} />
    </div>
  );
}

function ArtHeader({ current, onBack }) {
  return (
    <div style={{ padding: "12px 24px", background: "#fff", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 14, flexShrink: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ width: 26, height: 26, borderRadius: 7, background: T.text, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13 }}>📄</div>
        <div style={{ fontSize: 13.5, fontWeight: 600 }}>公众号 · 5 步</div>
      </div>
      <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 6, marginLeft: 8 }}>
        {ART_STEPS.map((s, i) => {
          const active = s.id === current;
          const done = ART_STEPS.findIndex(x => x.id === current) > i;
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
              {i < ART_STEPS.length - 1 && <span style={{ color: T.muted3, fontSize: 10 }}>—</span>}
            </React.Fragment>
          );
        })}
      </div>
      <ApiStatusLight />
      <button onClick={onBack} style={{ background: "transparent", border: "none", color: T.muted, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>← 返回</button>
    </div>
  );
}

function AChatBar({ prompt, chips }) {
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
function AStepTopic({ topic, setTopic, onGo, loading }) {
  return (
    <div style={{ padding: "40px 40px 120px", maxWidth: 720, margin: "0 auto" }}>
      <div style={{ textAlign: "center", marginBottom: 28 }}>
        <div style={{ fontSize: 28, fontWeight: 700, color: T.text, marginBottom: 8, letterSpacing: "-0.02em" }}>今天想写什么选题? 📄</div>
        <div style={{ fontSize: 14, color: T.muted }}>一个观点 · 小华自动拉知识库 · 出 2000+ 字方法论长文</div>
        <div style={{ marginTop: 12, display: "flex", justifyContent: "center" }}>
          <DeepToggle />
        </div>
      </div>

      <div style={{ background: "#fff", border: `1.5px solid ${T.brand}`, boxShadow: `0 0 0 5px ${T.brandSoft}`, borderRadius: 16, padding: 18, marginBottom: 18 }}>
        <textarea
          rows={5}
          value={topic}
          onChange={e => setTopic(e.target.value)}
          placeholder="例:为什么 2026 年做内容必须懂私域 · 或者直接贴一段灵感..."
          style={{ width: "100%", border: "none", outline: "none", background: "transparent", fontSize: 14.5, fontFamily: "inherit", resize: "none", lineHeight: 1.7, color: T.text }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, paddingTop: 12, borderTop: `1px solid ${T.borderSoft}` }}>
          <div style={{ fontSize: 11.5, color: T.muted2 }}>✍️ 小华会接入 Obsidian 07 Wiki + 01 底层资产 + 02 业务场景</div>
          <div style={{ flex: 1 }} />
          <button onClick={onGo} disabled={!topic.trim() || loading} style={{
            padding: "8px 20px", fontSize: 13, fontWeight: 600,
            background: (!topic.trim() || loading) ? T.muted3 : T.brand,
            color: "#fff", border: "none", borderRadius: 100,
            cursor: (!topic.trim() || loading) ? "not-allowed" : "pointer", fontFamily: "inherit",
          }}>{loading ? "出大纲中..." : "先出大纲 →"}</button>
        </div>
      </div>

      <div style={{ fontSize: 11.5, color: T.muted, fontWeight: 600, letterSpacing: "0.08em", marginBottom: 10 }}>快速开始</div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {["方法论长文", "案例拆解", "观点输出", "行业观察"].map((c, i) => (
          <div key={i} onClick={() => setTopic(topic ? topic + " · " + c : c)} style={{ padding: "7px 14px", background: "#fff", border: `1px solid ${T.border}`, borderRadius: 100, fontSize: 12.5, color: T.muted, cursor: "pointer" }}>{c}</div>
        ))}
      </div>
    </div>
  );
}

// Step 2 · 大纲(展开/编辑)
function AStepOutline({ topic, outline, setOutline, kbUsed, loading, onPrev, onNext, onRegen }) {
  if (loading || outline.length === 0) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "60px 40px", gap: 18, minHeight: "70%" }}>
        <div style={{ width: 96, height: 96, borderRadius: "50%", background: T.brandSoft, position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ width: 96, height: 96, borderRadius: "50%", border: `4px solid ${T.brandSoft}`, borderTopColor: T.brand, animation: "qlspin 1.2s linear infinite", position: "absolute", top: 0, left: 0 }} />
          <div style={{ fontSize: 28 }}>📄</div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 20, fontWeight: 700 }}>小华正拉知识库出大纲</div>
          <div style={{ fontSize: 13, color: T.muted, marginTop: 6 }}>通常 15-20 秒 · 4-5 段结构化方法论</div>
        </div>
      </div>
    );
  }

  function updateH2(i, v) {
    const next = [...outline]; next[i] = { ...next[i], h2: v }; setOutline(next);
  }
  function updatePoint(i, j, v) {
    const next = [...outline];
    const points = [...(next[i].points || [])];
    points[j] = v;
    next[i] = { ...next[i], points }; setOutline(next);
  }
  function addSection() {
    setOutline([...outline, { h2: "新段", points: ["要点 1"] }]);
  }
  function removeSection(i) {
    setOutline(outline.filter((_, idx) => idx !== i));
  }

  return (
    <div style={{ padding: "32px 40px 120px", maxWidth: 820, margin: "0 auto" }}>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: T.text, marginBottom: 6 }}>大纲出好了 · 想改哪里直接改 ✏️</div>
        <div style={{ fontSize: 13, color: T.muted }}>满意后点"写长文"· 小华按这个大纲扩写到 2000+ 字</div>
      </div>

      {kbUsed.length > 0 && (
        <div style={{ padding: "9px 12px", background: T.brandSoft, border: `1px solid ${T.brand}44`, borderRadius: 8, fontSize: 12, color: T.brand, marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
          <span>📚</span>
          <span>已从知识库注入 {kbUsed.length} 条素材</span>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {outline.map((sec, i) => (
          <div key={i} style={{ padding: 14, background: "#fff", border: `1px solid ${T.borderSoft}`, borderRadius: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: 12, color: T.muted2, fontFamily: "SF Mono, monospace" }}>H2 · {i+1}</span>
              <input
                value={sec.h2 || ""}
                onChange={e => updateH2(i, e.target.value)}
                style={{ flex: 1, border: `1px solid ${T.borderSoft}`, borderRadius: 6, padding: "6px 10px", fontSize: 14, fontWeight: 600, fontFamily: "inherit", outline: "none" }}
              />
              <button onClick={() => removeSection(i)} style={{ background: "transparent", border: "none", color: T.muted, fontSize: 16, cursor: "pointer" }}>×</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {(sec.points || []).map((p, j) => (
                <div key={j} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 11, color: T.muted2 }}>·</span>
                  <input
                    value={p}
                    onChange={e => updatePoint(i, j, e.target.value)}
                    style={{ flex: 1, border: "none", background: "transparent", fontSize: 13, fontFamily: "inherit", outline: "none", color: T.text, padding: "4px 6px" }}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 14, alignItems: "center" }}>
        <Btn size="sm" onClick={addSection}>＋ 加一段</Btn>
        <Btn size="sm" onClick={onRegen}>🔄 重出大纲</Btn>
        <div style={{ flex: 1 }} />
        <Btn variant="outline" onClick={onPrev}>← 改选题</Btn>
        <Btn variant="primary" onClick={onNext}>写长文 → (2000+ 字)</Btn>
      </div>
    </div>
  );
}

// Step 3 · 扩写(loading)
function AStepExpanding({ loading, article, onPrev, onNext }) {
  if (loading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "60px 40px", gap: 18, minHeight: "70%" }}>
        <div style={{ width: 96, height: 96, borderRadius: "50%", background: T.brandSoft, position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ width: 96, height: 96, borderRadius: "50%", border: `4px solid ${T.brandSoft}`, borderTopColor: T.brand, animation: "qlspin 1.2s linear infinite", position: "absolute", top: 0, left: 0 }} />
          <div style={{ fontSize: 28 }}>✍️</div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 20, fontWeight: 700 }}>小华正在写长文</div>
          <div style={{ fontSize: 13, color: T.muted, marginTop: 6 }}>通常 30-60 秒 · 2000-3000 字 · 先慢一点,质量优先</div>
        </div>
        <div style={{ padding: 12, background: T.amberSoft, border: `1px solid ${T.amber}33`, borderRadius: 10, fontSize: 12, color: T.amber, maxWidth: 520, textAlign: "center" }}>
          🚧 SSE 流式输出(一边写一边显示)留给 Phase 3 做,现在是同步等待
        </div>
      </div>
    );
  }
  // 完成了自动跳到 layout,理论上不会停留在这
  return <div style={{ padding: 40 }}>等跳转...</div>;
}

// Step 4 · 排版(Markdown 预览 + 编辑)
function AStepLayout({ article, setArticle, onPrev, onNext }) {
  const [edit, setEdit] = React.useState(article?.content || "");
  const [showPreview, setShowPreview] = React.useState(true);

  function save() {
    if (article) setArticle({ ...article, content: edit });
  }
  React.useEffect(() => { setEdit(article?.content || ""); }, [article?.content]);

  if (!article) return <div style={{ padding: 40, color: T.muted }}>还没长文</div>;

  return (
    <div style={{ padding: "32px 40px 120px", maxWidth: 1180, margin: "0 auto" }}>
      <div style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 10 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700, color: T.text, marginBottom: 4 }}>{article.title}</div>
          <div style={{ fontSize: 12, color: T.muted }}>{article.word_count} 字 · {article.tokens} tokens</div>
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", gap: 2, background: T.bg2, padding: 3, borderRadius: 100 }}>
          <button onClick={() => setShowPreview(false)} style={{ padding: "5px 12px", fontSize: 12, borderRadius: 100, background: !showPreview ? "#fff" : "transparent", color: !showPreview ? T.text : T.muted, fontWeight: !showPreview ? 600 : 500, border: "none", cursor: "pointer", fontFamily: "inherit" }}>只改</button>
          <button onClick={() => setShowPreview(true)} style={{ padding: "5px 12px", fontSize: 12, borderRadius: 100, background: showPreview ? "#fff" : "transparent", color: showPreview ? T.text : T.muted, fontWeight: showPreview ? 600 : 500, border: "none", cursor: "pointer", fontFamily: "inherit" }}>对照</button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 16 }}>
        <div style={{ flex: 1, background: "#fff", border: `1px solid ${T.borderSoft}`, borderRadius: 12, padding: 14 }}>
          <div style={{ fontSize: 11, color: T.muted2, fontWeight: 600, letterSpacing: "0.08em", marginBottom: 8 }}>Markdown 源码(可编辑)</div>
          <textarea
            value={edit}
            onChange={e => setEdit(e.target.value)}
            onBlur={save}
            style={{ width: "100%", minHeight: 480, border: "none", outline: "none", background: "transparent", fontFamily: "SF Mono, Menlo, monospace", fontSize: 12.5, lineHeight: 1.7, color: T.text, resize: "vertical" }}
          />
        </div>
        {showPreview && (
          <div style={{ flex: 1, background: "#fff", border: `1px solid ${T.borderSoft}`, borderRadius: 12, padding: "20px 28px" }}>
            <div style={{ fontSize: 11, color: T.muted2, fontWeight: 600, letterSpacing: "0.08em", marginBottom: 12 }}>渲染预览(简版)</div>
            <MarkdownPreview md={edit} />
          </div>
        )}
      </div>

      <div style={{ display: "flex", marginTop: 20 }}>
        <Btn variant="outline" onClick={onPrev}>← 改大纲</Btn>
        <div style={{ flex: 1 }} />
        <Btn variant="primary" onClick={() => { save(); onNext(); }}>去发布 →</Btn>
      </div>
    </div>
  );
}

// 简版 Markdown 渲染(只处理 h1/h2/h3 + 段落)
function MarkdownPreview({ md }) {
  const blocks = (md || "").split(/\n\n+/);
  return (
    <div style={{ fontSize: 14, lineHeight: 1.85, color: T.text }}>
      {blocks.map((b, i) => {
        if (/^#\s/.test(b)) return <h1 key={i} style={{ fontSize: 22, fontWeight: 700, marginBottom: 14, color: T.text }}>{b.replace(/^#\s+/, "")}</h1>;
        if (/^##\s/.test(b)) return <h2 key={i} style={{ fontSize: 17, fontWeight: 700, marginTop: 22, marginBottom: 10, color: T.text }}>{b.replace(/^##\s+/, "")}</h2>;
        if (/^###\s/.test(b)) return <h3 key={i} style={{ fontSize: 15, fontWeight: 600, marginTop: 16, marginBottom: 8, color: T.text }}>{b.replace(/^###\s+/, "")}</h3>;
        if (/^[-*]\s/.test(b)) {
          const items = b.split("\n").map(l => l.replace(/^[-*]\s+/, ""));
          return <ul key={i} style={{ paddingLeft: 22, marginBottom: 12 }}>{items.map((it, j) => <li key={j} style={{ marginBottom: 4 }}>{it}</li>)}</ul>;
        }
        if (/^>/.test(b)) return <blockquote key={i} style={{ borderLeft: `3px solid ${T.brand}`, paddingLeft: 12, color: T.muted, margin: "12px 0", fontStyle: "italic" }}>{b.replace(/^>\s*/, "")}</blockquote>;
        return <p key={i} style={{ marginBottom: 12, whiteSpace: "pre-wrap" }}>{b}</p>;
      })}
    </div>
  );
}

// Step 5 · 发布
function AStepPublish({ article, onPrev, onDone }) {
  const [copied, setCopied] = React.useState(false);
  function copy() {
    navigator.clipboard?.writeText(article?.content || "");
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  function download() {
    const blob = new Blob([article?.content || ""], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${article?.title || "untitled"}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div style={{ padding: "32px 40px 120px", maxWidth: 820, margin: "0 auto" }}>
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: T.text, marginBottom: 6 }}>发布 🚀</div>
        <div style={{ fontSize: 13, color: T.muted }}>复制 Markdown 到公众号后台粘贴即可 · 或下载 md 文件</div>
      </div>

      <div style={{ padding: 18, background: "#fff", border: `1px solid ${T.borderSoft}`, borderRadius: 12 }}>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6, color: T.text }}>{article?.title}</div>
        <div style={{ fontSize: 12, color: T.muted, marginBottom: 14 }}>{article?.word_count} 字</div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Btn variant="primary" onClick={copy}>{copied ? "✓ 已复制到剪贴板" : "📋 复制 Markdown"}</Btn>
          <Btn onClick={download}>⬇ 下载 .md</Btn>
          <Btn onClick={() => window.open("https://mp.weixin.qq.com/cgi-bin/home", "_blank")}>🌐 打开公众号后台</Btn>
        </div>
      </div>

      <div style={{ marginTop: 18, padding: 14, background: T.amberSoft, border: `1px solid ${T.amber}33`, borderRadius: 10, fontSize: 12.5, color: T.amber, lineHeight: 1.65 }}>
        🚧 一键直接发到公众号(调公众号 skill)· Phase 3 落地
      </div>

      <div style={{ display: "flex", marginTop: 20 }}>
        <Btn variant="outline" onClick={onPrev}>← 改排版</Btn>
        <div style={{ flex: 1 }} />
        <Btn variant="primary" onClick={onDone}>完成 · 回首页</Btn>
      </div>
    </div>
  );
}

Object.assign(window, { PageWechat });
