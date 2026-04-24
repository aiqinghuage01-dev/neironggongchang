// factory-wechat-v2.jsx — 公众号 skill 全链路 GUI (D-010)
// Skill 源: ~/Desktop/skills/公众号文章/
// 8 步: 选题 → 3标题挑 → 大纲确认 → 长文+自检 → 段间配图 → HTML → 封面 → 推送草稿箱
//
// 覆盖 factory-article.jsx 的 PageWechat(在 index.html 里加载顺序靠后)

const WX_STEPS = [
  { id: "topic",    n: 1, label: "选题" },
  { id: "titles",   n: 2, label: "挑标题" },
  { id: "outline",  n: 3, label: "确认大纲" },
  { id: "write",    n: 4, label: "写长文" },
  { id: "images",   n: 5, label: "段间配图" },
  { id: "html",     n: 6, label: "HTML" },
  { id: "cover",    n: 7, label: "封面" },
  { id: "push",     n: 8, label: "推送" },
];

function PageWechat({ onNav }) {
  const [step, setStep] = React.useState("topic");
  const [loading, setLoading] = React.useState(false);
  const [err, setErr] = React.useState("");

  // 全流程状态
  const [topic, setTopic] = React.useState("");
  const [titles, setTitles] = React.useState([]);
  const [pickedTitle, setPickedTitle] = React.useState("");
  const [outline, setOutline] = React.useState(null);
  const [article, setArticle] = React.useState(null);
  const [imagePlans, setImagePlans] = React.useState([]);
  const [htmlResult, setHtmlResult] = React.useState(null);
  const [coverResult, setCoverResult] = React.useState(null);
  const [pushResult, setPushResult] = React.useState(null);

  // skill meta (顶栏显示 "正在用技能:公众号文章")
  const [skillInfo, setSkillInfo] = React.useState(null);
  React.useEffect(() => { api.get("/api/wechat/skill-info").then(setSkillInfo).catch(() => {}); }, []);

  async function call(path, body, cb) {
    setLoading(true); setErr("");
    try {
      const r = await api.post(path, body);
      cb?.(r);
      return r;
    } catch (e) { setErr(e.message); throw e; }
    finally { setLoading(false); }
  }

  // Step 1 → 2
  async function genTitles() {
    if (!topic.trim()) return;
    await call("/api/wechat/titles", { topic: topic.trim(), n: 3 }, (r) => {
      setTitles(r.titles || []); setStep("titles");
    });
  }
  // Step 2 → 3
  async function genOutline(title) {
    setPickedTitle(title);
    await call("/api/wechat/outline", { topic: topic.trim(), title }, (r) => {
      setOutline(r); setStep("outline");
    });
  }
  // Step 3 → 4
  async function writeArticle() {
    setStep("write");
    await call("/api/wechat/write", { topic: topic.trim(), title: pickedTitle, outline }, (r) => {
      setArticle(r);
    });
  }
  // Step 4 → 5
  async function planImages() {
    setStep("images");
    await call("/api/wechat/plan-images", { content: article.content, title: pickedTitle, n: 4 }, (r) => {
      setImagePlans((r.plans || []).map(p => ({ ...p, status: "pending", mmbiz_url: null })));
    });
  }
  async function generateOneImage(idx) {
    const plan = imagePlans[idx];
    setImagePlans(prev => prev.map((p, i) => i === idx ? { ...p, status: "running" } : p));
    try {
      const r = await api.post("/api/wechat/section-image", { prompt: plan.image_prompt, size: "16:9" });
      setImagePlans(prev => prev.map((p, i) => i === idx ? { ...p, status: "done", mmbiz_url: r.mmbiz_url, elapsed_sec: r.elapsed_sec } : p));
    } catch (e) {
      setImagePlans(prev => prev.map((p, i) => i === idx ? { ...p, status: "failed", error: e.message } : p));
    }
  }
  // Step 5 → 6
  async function assembleHtml() {
    setStep("html");
    const section_images = imagePlans.filter(p => p.mmbiz_url).map(p => ({ mmbiz_url: p.mmbiz_url }));
    await call("/api/wechat/html", {
      title: pickedTitle,
      content_md: article.content,
      section_images,
      hero_highlight: pickedTitle.slice(0, 6),
    }, setHtmlResult);
  }
  // Step 6 → 7
  async function genCover() {
    setStep("cover");
    await call("/api/wechat/cover", { title: pickedTitle, label: "清华哥说" }, setCoverResult);
  }
  // Step 7 → 8
  async function push() {
    if (!htmlResult || !coverResult) return setErr("HTML 或封面缺失");
    setStep("push");
    await call("/api/wechat/push", {
      title: pickedTitle,
      digest: htmlResult.digest || "",
      html_path: htmlResult.wechat_html_path,
      cover_path: coverResult.local_path_served || coverResult.local_path,
      author: "清华哥",
    }, setPushResult);
  }

  function reset() {
    setStep("topic"); setErr("");
    setTitles([]); setPickedTitle("");
    setOutline(null); setArticle(null);
    setImagePlans([]); setHtmlResult(null);
    setCoverResult(null); setPushResult(null);
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", background: T.bg, position: "relative", overflow: "hidden" }}>
      <WxHeader current={step} onBack={() => onNav("home")} skillInfo={skillInfo} />
      <div style={{ flex: 1, overflow: "auto" }}>
        {err && (
          <div style={{ maxWidth: 820, margin: "16px auto 0", padding: 12, background: T.redSoft, color: T.red, borderRadius: 10, fontSize: 13 }}>
            ⚠️ {err}
          </div>
        )}
        {step === "topic"   && <WxStepTopic topic={topic} setTopic={setTopic} onGo={genTitles} loading={loading} skillInfo={skillInfo} />}
        {step === "titles"  && <WxStepTitles titles={titles} loading={loading} onPick={genOutline} onPrev={() => setStep("topic")} onRegen={genTitles} />}
        {step === "outline" && <WxStepOutline outline={outline} setOutline={setOutline} title={pickedTitle} topic={topic} loading={loading} onPrev={() => setStep("titles")} onNext={writeArticle} onRegen={() => genOutline(pickedTitle)} />}
        {step === "write"   && <WxStepWrite article={article} loading={loading} onPrev={() => setStep("outline")} onNext={planImages} onRewrite={writeArticle} />}
        {step === "images"  && <WxStepImages plans={imagePlans} onGen={generateOneImage} loading={loading} onPrev={() => setStep("write")} onNext={assembleHtml} onRegen={planImages} />}
        {step === "html"    && <WxStepHtml result={htmlResult} loading={loading} onPrev={() => setStep("images")} onNext={genCover} />}
        {step === "cover"   && <WxStepCover cover={coverResult} title={pickedTitle} loading={loading} onPrev={() => setStep("html")} onNext={push} onRegen={genCover} />}
        {step === "push"    && <WxStepPush result={pushResult} loading={loading} onPrev={() => setStep("cover")} onReset={reset} onNav={onNav} />}
      </div>
    </div>
  );
}

// ─── 顶栏 ────────────────────────────────────────────────────
function WxHeader({ current, onBack, skillInfo }) {
  return (
    <div style={{ padding: "12px 24px", background: "#fff", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 14, flexShrink: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ width: 26, height: 26, borderRadius: 7, background: T.text, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13 }}>📄</div>
        <div style={{ fontSize: 13.5, fontWeight: 600 }}>公众号 · 8 步全链路</div>
        {skillInfo && (
          <span title={`~/Desktop/skills/${skillInfo.slug}/ · 精简版 + ${Object.keys(skillInfo.references||{}).length} refs`}
            style={{ fontSize: 10.5, color: T.brand, background: T.brandSoft, padding: "2px 8px", borderRadius: 100, marginLeft: 6 }}>
            用技能:{skillInfo.slug}
          </span>
        )}
      </div>
      <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 4, marginLeft: 8, overflowX: "auto" }}>
        {WX_STEPS.map((s, i) => {
          const active = s.id === current;
          const done = WX_STEPS.findIndex(x => x.id === current) > i;
          return (
            <React.Fragment key={s.id}>
              <div style={{
                display: "flex", alignItems: "center", gap: 4, padding: "3px 8px 3px 4px", borderRadius: 100, fontSize: 11, fontWeight: 500,
                background: active ? T.text : "transparent",
                color: active ? "#fff" : done ? T.brand : T.muted,
                whiteSpace: "nowrap", flexShrink: 0,
              }}>
                <div style={{
                  width: 16, height: 16, borderRadius: "50%",
                  background: active ? "#fff" : done ? T.brandSoft : T.bg2,
                  color: active ? T.text : done ? T.brand : T.muted2,
                  display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700,
                }}>{done ? "✓" : s.n}</div>
                {s.label}
              </div>
              {i < WX_STEPS.length - 1 && <span style={{ color: T.muted3, fontSize: 9 }}>—</span>}
            </React.Fragment>
          );
        })}
      </div>
      <ApiStatusLight />
      <button onClick={onBack} style={{ background: "transparent", border: "none", color: T.muted, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>← 返回</button>
    </div>
  );
}

// ─── Step 1 · 选题 ───────────────────────────────────────────
function WxStepTopic({ topic, setTopic, onGo, loading, skillInfo }) {
  return (
    <div style={{ padding: "40px 40px 60px", maxWidth: 720, margin: "0 auto" }}>
      <div style={{ textAlign: "center", marginBottom: 24 }}>
        <div style={{ fontSize: 28, fontWeight: 700, color: T.text, marginBottom: 8, letterSpacing: "-0.02em" }}>今天想写什么选题? 📄</div>
        <div style={{ fontSize: 14, color: T.muted }}>用公众号 skill 的完整 5 Phase · 一路到微信草稿箱</div>
      </div>

      <div style={{ background: "#fff", border: `1.5px solid ${T.brand}`, boxShadow: `0 0 0 5px ${T.brandSoft}`, borderRadius: 16, padding: 18, marginBottom: 18 }}>
        <textarea rows={5} value={topic} onChange={e => setTopic(e.target.value)}
          placeholder="例:AI 时代实体老板的真正护城河 · 或贴一段灵感..."
          style={{ width: "100%", border: "none", outline: "none", background: "transparent", fontSize: 14.5, fontFamily: "inherit", resize: "none", lineHeight: 1.7, color: T.text }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, paddingTop: 12, borderTop: `1px solid ${T.borderSoft}` }}>
          <div style={{ fontSize: 11.5, color: T.muted2 }}>✍️ skill 自带完整人设 + 风格圣经 + 方法论</div>
          <div style={{ flex: 1 }} />
          <button onClick={onGo} disabled={!topic.trim() || loading} style={{
            padding: "8px 20px", fontSize: 13, fontWeight: 600,
            background: (!topic.trim() || loading) ? T.muted3 : T.brand,
            color: "#fff", border: "none", borderRadius: 100,
            cursor: (!topic.trim() || loading) ? "not-allowed" : "pointer", fontFamily: "inherit",
          }}>{loading ? "出标题中..." : "先出 3 个标题 →"}</button>
        </div>
      </div>

      {skillInfo && (
        <div style={{ padding: 14, background: "#fff", border: `1px solid ${T.borderSoft}`, borderRadius: 10, fontSize: 12, color: T.muted, lineHeight: 1.8 }}>
          <div style={{ fontWeight: 600, color: T.text, marginBottom: 6 }}>skill 资源(事实源)</div>
          <div>SKILL.md · {skillInfo.skill_md_chars} 字符</div>
          {Object.entries(skillInfo.references || {}).map(([k, v]) => (
            <div key={k}>references/{k}.md · {v} 字符</div>
          ))}
          <div style={{ marginTop: 6, color: T.muted2 }}>你在 Obsidian 外的 {skillInfo.root} 改什么,下次调用自动同步。</div>
        </div>
      )}
    </div>
  );
}

// ─── Step 2 · 挑标题 ─────────────────────────────────────────
function WxStepTitles({ titles, loading, onPick, onPrev, onRegen }) {
  if (loading && titles.length === 0) return <Spinning icon="🎯" text="小华正在出 3 个标题" sub="15-25 字 · 情绪触发词 + 身份锚点" />;
  return (
    <div style={{ padding: "32px 40px 120px", maxWidth: 820, margin: "0 auto" }}>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>挑一个标题 🎯</div>
        <div style={{ fontSize: 13, color: T.muted }}>公众号 80% 打开率靠标题。点一个进入下一步,小华就按这个写。</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {titles.map((t, i) => (
          <div key={i} onClick={() => onPick(t.title)} style={{
            padding: 18, background: "#fff", border: `1px solid ${T.borderSoft}`, borderRadius: 12, cursor: "pointer",
            transition: "all 0.15s",
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = T.brand; e.currentTarget.style.boxShadow = `0 0 0 4px ${T.brandSoft}`; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = T.borderSoft; e.currentTarget.style.boxShadow = "none"; }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <Tag size="xs" color={["pink","blue","purple","amber","green"][i % 5]}>{t.template}</Tag>
              <span style={{ fontSize: 11, color: T.muted2 }}>· {(t.title || "").length} 字</span>
            </div>
            <div style={{ fontSize: 18, fontWeight: 600, color: T.text, lineHeight: 1.5, marginBottom: 10 }}>{t.title}</div>
            <div style={{ fontSize: 12, color: T.muted, background: T.bg2, padding: "6px 10px", borderRadius: 6, lineHeight: 1.6 }}>
              💡 <b>为什么这标题</b> — {t.why}
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 18, alignItems: "center" }}>
        <Btn variant="outline" onClick={onPrev}>← 改选题</Btn>
        <Btn onClick={onRegen}>🔄 再出 3 个</Btn>
      </div>
    </div>
  );
}

// ─── Step 3 · 大纲 ───────────────────────────────────────────
function WxStepOutline({ outline, setOutline, title, topic, loading, onPrev, onNext, onRegen }) {
  if (loading && !outline) return <Spinning icon="📐" text="小华正在出大纲" sub="5-7 行 · 开场 + 3 个核心论点 + 业务桥接 + 结尾" />;
  if (!outline) return null;

  function update(k, v) { setOutline({ ...outline, [k]: v }); }
  function updatePoint(i, v) {
    const pts = [...(outline.core_points || [])]; pts[i] = v;
    update("core_points", pts);
  }

  return (
    <div style={{ padding: "32px 40px 120px", maxWidth: 820, margin: "0 auto" }}>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>确认大纲 · 再动笔 📐</div>
        <div style={{ fontSize: 13, color: T.muted }}>标题: <b style={{ color: T.text }}>{title}</b></div>
        <div style={{ fontSize: 12, color: T.muted2, marginTop: 4 }}>想改哪行直接改。满意后点"写长文"——skill 的 Phase 2,约 30-60s 出 2000+ 字。</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <OutlineField label="开场切入" value={outline.opening} onChange={v => update("opening", v)} multi />
        <div style={{ padding: 14, background: "#fff", border: `1px solid ${T.borderSoft}`, borderRadius: 12 }}>
          <div style={{ fontSize: 11.5, color: T.muted2, fontWeight: 600, letterSpacing: "0.08em", marginBottom: 8 }}>中段核心论点 · {outline.core_points.length} 条</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {outline.core_points.map((p, i) => (
              <textarea key={i} rows={2} value={p} onChange={e => updatePoint(i, e.target.value)}
                style={{ width: "100%", border: `1px solid ${T.borderSoft}`, borderRadius: 6, padding: 8, fontSize: 13, fontFamily: "inherit", outline: "none", resize: "vertical", color: T.text, lineHeight: 1.7 }} />
            ))}
          </div>
        </div>
        <OutlineField label="业务桥接" value={outline.business_bridge} onChange={v => update("business_bridge", v)} multi />
        <OutlineField label="结尾落点" value={outline.closing} onChange={v => update("closing", v)} multi />
        <div style={{ fontSize: 12, color: T.muted2, textAlign: "right" }}>预估字数: {outline.estimated_words || 2500}</div>
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 18, alignItems: "center" }}>
        <Btn variant="outline" onClick={onPrev}>← 换标题</Btn>
        <Btn onClick={onRegen}>🔄 重出大纲</Btn>
        <div style={{ flex: 1 }} />
        <Btn variant="primary" onClick={onNext}>写长文 → (2000+ 字)</Btn>
      </div>
    </div>
  );
}
function OutlineField({ label, value, onChange, multi }) {
  return (
    <div style={{ padding: 14, background: "#fff", border: `1px solid ${T.borderSoft}`, borderRadius: 12 }}>
      <div style={{ fontSize: 11.5, color: T.muted2, fontWeight: 600, letterSpacing: "0.08em", marginBottom: 8 }}>{label}</div>
      {multi ? (
        <textarea rows={3} value={value || ""} onChange={e => onChange(e.target.value)}
          style={{ width: "100%", border: "none", outline: "none", background: "transparent", fontSize: 13.5, fontFamily: "inherit", resize: "vertical", lineHeight: 1.8, color: T.text }} />
      ) : (
        <input value={value || ""} onChange={e => onChange(e.target.value)}
          style={{ width: "100%", border: "none", outline: "none", background: "transparent", fontSize: 14, fontFamily: "inherit", color: T.text }} />
      )}
    </div>
  );
}

// ─── Step 4 · 长文 + 三层自检 ───────────────────────────────
function WxStepWrite({ article, loading, onPrev, onNext, onRewrite }) {
  if (loading && !article) return <Spinning icon="✍️" text="小华正在写 2000+ 字长文" sub="30-60s · 完整 7 步骨架 + 三层自检" />;
  if (!article) return null;
  const sc = article.self_check || {};
  const dims = sc.six_dimensions || {};
  const total = Object.values(dims).reduce((a, b) => a + (b || 0), 0);
  const pr = sc.six_principles || [];
  const passed = pr.filter(p => p.pass).length;
  const veto = sc.one_veto || {};

  const [editing, setEditing] = React.useState(article.content);
  React.useEffect(() => setEditing(article.content), [article.content]);

  return (
    <div style={{ padding: "32px 40px 120px", maxWidth: 1080, margin: "0 auto" }}>
      <div style={{ marginBottom: 16, display: "flex", alignItems: "flex-start", gap: 16 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>{article.title}</div>
          <div style={{ fontSize: 12, color: T.muted }}>{article.word_count} 字 · write {article.tokens?.write} tok · check {article.tokens?.check} tok</div>
        </div>
        <div style={{ padding: 12, background: sc.pass ? T.brandSoft : T.redSoft, border: `1px solid ${sc.pass ? T.brand + "44" : T.red + "44"}`, borderRadius: 10, fontSize: 12, color: sc.pass ? T.brand : T.red, minWidth: 240 }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>📋 三层自检 {sc.pass ? "✅" : "❌"}</div>
          <div>六原则: {passed}/6</div>
          <div>六维评分: {total}/120 {total >= 105 ? "✓" : "(需 ≥105)"}</div>
          <div>一票否决: {veto.triggered ? "触发" : "无"}</div>
        </div>
      </div>

      {pr.some(p => !p.pass) && (
        <div style={{ marginBottom: 14, padding: 12, background: T.amberSoft, border: `1px solid ${T.amber}44`, borderRadius: 10, fontSize: 12, color: T.amber, lineHeight: 1.7 }}>
          <b>不过关的原则:</b>{" "}
          {pr.filter(p => !p.pass).map(p => `${p.name}(${p.issue})`).join(" · ")}
        </div>
      )}

      <div style={{ background: "#fff", border: `1px solid ${T.borderSoft}`, borderRadius: 12, padding: 20 }}>
        <textarea value={editing} onChange={e => setEditing(e.target.value)}
          style={{ width: "100%", border: "none", outline: "none", background: "transparent", fontSize: 14.5, fontFamily: "inherit", resize: "vertical", lineHeight: 1.9, color: T.text, minHeight: 420 }} />
      </div>
      {sc.summary && <div style={{ marginTop: 10, padding: 10, background: T.bg2, borderRadius: 8, fontSize: 12, color: T.muted, lineHeight: 1.6 }}>💬 <b>总评:</b> {sc.summary}</div>}

      <div style={{ display: "flex", gap: 10, marginTop: 18, alignItems: "center" }}>
        <Btn variant="outline" onClick={onPrev}>← 改大纲</Btn>
        <Btn onClick={onRewrite}>🔄 重写一版</Btn>
        <div style={{ flex: 1 }} />
        <Btn variant="primary" onClick={onNext}>下一步 · 段间配图 →</Btn>
      </div>
    </div>
  );
}

// ─── Step 5 · 段间配图 ───────────────────────────────────────
function WxStepImages({ plans, onGen, loading, onPrev, onNext, onRegen }) {
  if (loading && plans.length === 0) return <Spinning icon="🎨" text="小华在为你规划 4 张段间配图" sub="AI 产 prompt · 你确认后逐张生图" />;
  const doneCount = plans.filter(p => p.status === "done").length;
  return (
    <div style={{ padding: "32px 40px 120px", maxWidth: 1040, margin: "0 auto" }}>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>段间配图 · {doneCount}/{plans.length} 🎨</div>
        <div style={{ fontSize: 13, color: T.muted }}>每段结尾放一张 16:9 AI 图。prompt 可以改,点"生成"走 apimart → 微信图床。每张约 30-60s。</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 14 }}>
        {plans.map((p, i) => (
          <div key={i} style={{ padding: 14, background: "#fff", border: `1px solid ${T.borderSoft}`, borderRadius: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
              <Tag size="xs" color="blue">#{i + 1}</Tag>
              <span style={{ fontSize: 12, color: T.muted }}>{p.section_hint}</span>
              <div style={{ flex: 1 }} />
              {p.status === "done" && <span style={{ fontSize: 11, color: T.brand, fontWeight: 600 }}>✓ {p.elapsed_sec}s</span>}
              {p.status === "running" && <span style={{ fontSize: 11, color: T.amber }}>生成中...</span>}
              {p.status === "failed" && <span style={{ fontSize: 11, color: T.red }}>失败</span>}
            </div>
            <textarea rows={3} value={p.image_prompt} readOnly
              style={{ width: "100%", border: `1px solid ${T.borderSoft}`, borderRadius: 6, padding: 8, fontSize: 12, fontFamily: "inherit", outline: "none", resize: "vertical", color: T.muted, lineHeight: 1.7, background: T.bg2 }} />
            {p.mmbiz_url ? (
              <div style={{ marginTop: 8, aspectRatio: "16/9", borderRadius: 8, overflow: "hidden", background: `url(${p.mmbiz_url}) center/cover`, border: `1px solid ${T.borderSoft}` }} />
            ) : (
              <div style={{ marginTop: 8, aspectRatio: "16/9", borderRadius: 8, background: T.bg2, border: `1px dashed ${T.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: T.muted2 }}>
                {p.status === "running" ? "生成中,耐心等 30-60s" : p.status === "failed" ? `⚠️ ${p.error || "失败"}` : "未生成"}
              </div>
            )}
            <div style={{ display: "flex", marginTop: 8 }}>
              <div style={{ flex: 1 }} />
              <Btn size="sm" variant={p.status === "done" ? "outline" : "primary"}
                onClick={() => onGen(i)} disabled={p.status === "running"}>
                {p.status === "done" ? "重生" : p.status === "running" ? "生成中..." : "生成这张"}
              </Btn>
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 18, alignItems: "center" }}>
        <Btn variant="outline" onClick={onPrev}>← 回长文</Btn>
        <Btn onClick={onRegen}>🔄 重出 prompt</Btn>
        <div style={{ flex: 1 }} />
        <div style={{ fontSize: 12, color: T.muted, marginRight: 10 }}>有图没图都能继续,没图的段就不配</div>
        <Btn variant="primary" onClick={onNext}>拼 HTML →</Btn>
      </div>
    </div>
  );
}

// ─── Step 6 · HTML ─────────────────────────────────────────
function WxStepHtml({ result, loading, onPrev, onNext }) {
  if (loading && !result) return <Spinning icon="🧩" text="拼 V3 Clean HTML + 转微信 markup" sub="premailer 内联 CSS · section/span-leaf" />;
  if (!result) return null;
  return (
    <div style={{ padding: "32px 40px 120px", maxWidth: 1080, margin: "0 auto" }}>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>HTML 拼好了 🧩</div>
        <div style={{ fontSize: 13, color: T.muted }}>已转成微信 markup 格式(section/span-leaf/mp-style-type)。下面预览原样 HTML,推送时用转换后版本。</div>
      </div>
      <div style={{ background: "#fff", border: `1px solid ${T.borderSoft}`, borderRadius: 12, padding: 2, marginBottom: 14, height: 560, overflow: "hidden" }}>
        <iframe srcDoc={result.wechat_html} style={{ width: "100%", height: "100%", border: "none", borderRadius: 10 }} title="wechat preview" />
      </div>
      <div style={{ padding: 12, background: T.bg2, borderRadius: 8, fontSize: 12, color: T.muted, lineHeight: 1.7 }}>
        <div>原 HTML: <code style={{ fontSize: 11 }}>{result.raw_html_path}</code></div>
        <div>微信 markup: <code style={{ fontSize: 11 }}>{result.wechat_html_path}</code></div>
        <div>摘要: {result.digest}</div>
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 18, alignItems: "center" }}>
        <Btn variant="outline" onClick={onPrev}>← 回配图</Btn>
        <div style={{ flex: 1 }} />
        <Btn variant="primary" onClick={onNext}>生成封面 →</Btn>
      </div>
    </div>
  );
}

// ─── Step 7 · 封面 ───────────────────────────────────────────
function WxStepCover({ cover, title, loading, onPrev, onNext, onRegen }) {
  if (loading && !cover) return <Spinning icon="🖼️" text="Chrome headless 截图 900×383" sub="约 5-10s" />;
  if (!cover) return null;
  return (
    <div style={{ padding: "32px 40px 120px", maxWidth: 820, margin: "0 auto" }}>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>封面 900×383 🖼️</div>
        <div style={{ fontSize: 13, color: T.muted }}>V2 亮色简洁版 · 标签+大标题+作者 · 生成 {cover.elapsed_sec}s · {Math.round(cover.size_bytes/1024)} KB</div>
      </div>
      <div style={{ background: "#fff", border: `1px solid ${T.borderSoft}`, borderRadius: 12, padding: 12, marginBottom: 14 }}>
        <img src={api.media(cover.media_url)} alt="cover" style={{ width: "100%", aspectRatio: "900/383", borderRadius: 8, objectFit: "cover" }} />
      </div>
      <div style={{ padding: 12, background: T.bg2, borderRadius: 8, fontSize: 12, color: T.muted, lineHeight: 1.7 }}>
        本地路径: <code style={{ fontSize: 11 }}>{cover.local_path_served || cover.local_path}</code>
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 18, alignItems: "center" }}>
        <Btn variant="outline" onClick={onPrev}>← 回 HTML</Btn>
        <Btn onClick={onRegen}>🔄 重生封面</Btn>
        <div style={{ flex: 1 }} />
        <Btn variant="primary" onClick={onNext}>推送草稿箱 →</Btn>
      </div>
    </div>
  );
}

// ─── Step 8 · 推送 ───────────────────────────────────────────
function WxStepPush({ result, loading, onPrev, onReset, onNav }) {
  if (loading && !result) return <Spinning icon="🚀" text="推送到微信公众号草稿箱" sub="获取 token → 上传封面 → 创建草稿" />;
  if (!result) return null;
  return (
    <div style={{ padding: "32px 40px 120px", maxWidth: 720, margin: "0 auto" }}>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>✅ 已推到草稿箱</div>
        <div style={{ fontSize: 13, color: T.muted }}>去 mp.weixin.qq.com → 草稿箱 → 点"发布"即可。耗时 {result.elapsed_sec}s。</div>
      </div>
      <div style={{ padding: 14, background: "#fff", border: `1px solid ${T.brand}44`, borderRadius: 12, marginBottom: 14 }}>
        <div style={{ fontSize: 11.5, color: T.muted2, fontWeight: 600, letterSpacing: "0.08em", marginBottom: 8 }}>推送脚本输出(末尾 20 行)</div>
        <pre style={{ fontSize: 11, lineHeight: 1.6, color: T.muted, margin: 0, whiteSpace: "pre-wrap", fontFamily: "SF Mono, Menlo, monospace" }}>
          {(result.stdout_tail || []).join("\n")}
        </pre>
      </div>
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <Btn variant="outline" onClick={onPrev}>← 回封面</Btn>
        <div style={{ flex: 1 }} />
        <Btn onClick={onReset}>再写一篇</Btn>
        <Btn variant="primary" onClick={() => onNav?.("home")}>回首页</Btn>
      </div>
    </div>
  );
}

// ─── 通用 Loading ──────────────────────────────────────────
function Spinning({ icon, text, sub }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "80px 40px", gap: 18, minHeight: "70%" }}>
      <div style={{ width: 96, height: 96, borderRadius: "50%", background: T.brandSoft, position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: 96, height: 96, borderRadius: "50%", border: `4px solid ${T.brandSoft}`, borderTopColor: T.brand, animation: "qlspin 1.2s linear infinite", position: "absolute", top: 0, left: 0 }} />
        <div style={{ fontSize: 28 }}>{icon}</div>
      </div>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 20, fontWeight: 700 }}>{text}</div>
        {sub && <div style={{ fontSize: 13, color: T.muted, marginTop: 6 }}>{sub}</div>}
      </div>
    </div>
  );
}

Object.assign(window, { PageWechat });
