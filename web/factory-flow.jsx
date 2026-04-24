// factory-flow.jsx — 做视频 6 步完整流程,对齐 docs/design_v3/factory3-flow.jsx 视觉,接真 API
// 步骤:素材 → 文案 → 声音 → 形象 → 剪辑 → 发布(中间态:扒文案中 / 合成中)

const FLOW_STEPS = [
  { id: "source",  n: 1, label: "素材" },
  { id: "script",  n: 2, label: "文案" },
  { id: "voice",   n: 3, label: "声音" },
  { id: "avatar",  n: 4, label: "形象" },
  { id: "edit",    n: 5, label: "剪辑" },
  { id: "publish", n: 6, label: "发布" },
];

function FlowHeader({ current, onJumpStep, onNav }) {
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
        <ApiStatusLight />
      </div>
      <button onClick={() => onNav?.("materials")} style={{ padding: "5px 12px", background: "#fff", border: `1px solid ${T.border}`, borderRadius: 100, fontSize: 12, color: T.text, cursor: "pointer", fontFamily: "inherit" }}>
        📥 素材库
      </button>
      <button onClick={() => onNav?.("works")} style={{ padding: "5px 12px", background: "#fff", border: `1px solid ${T.border}`, borderRadius: 100, fontSize: 12, color: T.text, cursor: "pointer", fontFamily: "inherit" }}>
        🗂️ 作品库
      </button>
    </div>
  );
}

function FlowChatBar({ stepPrompt, quickChips }) {
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
          {(quickChips || []).map((c, i) => (
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

// ─── 全局 FlowContext: 各步骤之间传递业务数据 ───
function PageMake({ onNav }) {
  const [step, setStep] = React.useState("source");
  // 中间态:扒文案中 (transcribing) / 合成中 (waiting)
  const [subStep, setSubStep] = React.useState(null);

  // 业务数据
  const [ctx, setCtx] = React.useState({
    url: "", batchId: "",
    originalText: "", finalText: "",
    title: "", author: "", duration: 0,
    speakerId: null, speakerTitle: "",
    avatarId: null, avatarTitle: "",
    templateId: "t1",
    workId: null, videoId: null, localUrl: "",
    covers: [],
  });
  const update = (patch) => setCtx(c => ({ ...c, ...patch }));

  const STEP_PROMPTS = {
    source:  { prompt: "老板好呀 👋 今天想做条什么视频?", chips: ["🔗 试试粘个链接", "📝 我直接写文案", "🎁 从素材库选"] },
    script:  { prompt: "文案风格挑好了吗?要不要再随意一点?", chips: ["再随意一点", "加促销钩子", "缩短到 20 秒"] },
    voice:   { prompt: "声音用上次那个就挺自然的", chips: ["🎚 语速慢一点", "😊 加点笑意", "🔁 重新录"] },
    avatar:  { prompt: "建议用你本人的形象,老客户认脸", chips: ["用本人", "试试专业教练", "什么是数字人?"] },
    edit:    { prompt: "挑个剪辑风格,我按这个出片", chips: ["口播大字幕", "快节奏", "不露脸版"] },
    publish: { prompt: "看看发哪里?标题我已经按每个平台的调调改好了", chips: ["全都发", "就发抖音", "我自己贴"] },
  };
  const sp = STEP_PROMPTS[step];

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", background: T.bg, position: "relative", overflow: "hidden" }}>
      <FlowHeader current={step} onJumpStep={setStep} onNav={onNav} />
      <div style={{ flex: 1, overflow: "auto" }}>
        {subStep === "transcribing" && (
          <StepTranscribing
            url={ctx.url} batchId={ctx.batchId}
            onSuccess={({ text, title, author, duration }) => { update({ originalText: text, title, author, duration }); setSubStep(null); setStep("script"); }}
            onFallbackPaste={() => { setSubStep(null); update({ url: "", batchId: "" }); }}
          />
        )}
        {subStep === "waiting" && (
          <StepWaiting
            workId={ctx.workId} videoId={ctx.videoId}
            onDone={({ localUrl }) => { update({ localUrl }); setSubStep(null); setStep("publish"); }}
            onError={(e) => alert(e)}
          />
        )}
        {!subStep && step === "source" && (
          <StepSource
            onSubmit={async ({ kind, value }) => {
              if (kind === "url") {
                update({ url: value, originalText: "", title: "", author: "" });
                try {
                  const r = await api.post("/api/transcribe/submit", { url: value });
                  update({ batchId: r.batch_id });
                  setSubStep("transcribing");
                } catch (e) { alert("提交失败: " + e.message + "\n可以直接粘文案"); }
              } else {
                update({ originalText: value, url: "", title: "", author: "" });
                setStep("script");
              }
            }}
          />
        )}
        {!subStep && step === "script" && (
          <StepScript
            original={ctx.originalText}
            initialFinal={ctx.finalText}
            author={ctx.author}
            sourceUrl={ctx.url}
            onPrev={() => setStep("source")}
            onNext={({ finalText }) => { update({ finalText }); setStep("voice"); }}
          />
        )}
        {!subStep && step === "voice" && (
          <StepVoice
            finalText={ctx.finalText}
            onPrev={() => setStep("script")}
            onNext={({ speakerId, speakerTitle }) => { update({ speakerId, speakerTitle }); setStep("avatar"); }}
          />
        )}
        {!subStep && step === "avatar" && (
          <StepAvatar
            onPrev={() => setStep("voice")}
            onNext={({ avatarId, avatarTitle }) => { update({ avatarId, avatarTitle }); setStep("edit"); }}
          />
        )}
        {!subStep && step === "edit" && (
          <StepEdit
            finalText={ctx.finalText}
            speakerTitle={ctx.speakerTitle}
            avatarTitle={ctx.avatarTitle}
            onPrev={() => setStep("avatar")}
            onConfirm={async ({ templateId }) => {
              update({ templateId });
              try {
                const r = await api.post("/api/video/submit", {
                  text: ctx.finalText,
                  avatar_id: ctx.avatarId,
                  speaker_id: ctx.speakerId,
                  title: ctx.title || ctx.finalText.slice(0, 24),
                  source_url: ctx.url || null,
                  original_text: ctx.originalText || null,
                });
                update({ workId: r.work_id, videoId: r.video_id });
                setSubStep("waiting");
              } catch (e) { alert("提交失败: " + e.message); }
            }}
          />
        )}
        {!subStep && step === "publish" && (
          <StepPublish
            ctx={ctx} update={update}
            onPrev={() => setStep("edit")}
            onDone={() => onNav("works")}
          />
        )}
      </div>
      <FlowChatBar stepPrompt={sp.prompt} quickChips={sp.chips} />
    </div>
  );
}

// ─── Step 1 · 素材 ───
function StepSource({ onSubmit }) {
  const [text, setText] = React.useState("");
  const urlMatch = text.match(/(https?:\/\/[^\s)\]】]+)/i);
  const kind = text.trim() === "" ? null : urlMatch ? "url" : "text";

  function go() {
    if (!text.trim()) return;
    onSubmit({ kind, value: urlMatch ? urlMatch[1] : text.trim() });
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 40px 120px", gap: 28, minHeight: "100%" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 30, fontWeight: 700, color: T.text, letterSpacing: "-0.02em", marginBottom: 10 }}>先给我点东西开始 👇</div>
        <div style={{ fontSize: 14, color: T.muted }}>粘链接或文案都行,小华自动认</div>
      </div>
      <div style={{ width: 600, background: "#fff", border: `1.5px solid ${T.brand}`, boxShadow: `0 0 0 5px ${T.brandSoft}`, borderRadius: 16, padding: 18 }}>
        <textarea
          rows={5}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="在这里粘视频链接,或者直接贴一段文案..."
          style={{ width: "100%", border: "none", outline: "none", background: "transparent", fontSize: 14.5, fontFamily: "inherit", resize: "none", lineHeight: 1.7, color: T.text }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, paddingTop: 12, borderTop: `1px solid ${T.borderSoft}` }}>
          <div style={{ fontSize: 11.5, color: T.muted2 }}>
            {kind === null ? "✨ 小华自动判断是链接还是文案"
              : kind === "url" ? <span style={{ color: T.brand }}>✓ 识别为链接 - 我去扒文案</span>
              : <span style={{ color: T.brand }}>✓ 识别为文案 - 跳过扒文案,直接去改</span>}
          </div>
          <div style={{ flex: 1 }} />
          <button onClick={go} disabled={!text.trim()} style={{ padding: "8px 20px", fontSize: 13, fontWeight: 600, background: text.trim() ? T.brand : T.muted3, color: "#fff", border: "none", borderRadius: 100, cursor: text.trim() ? "pointer" : "not-allowed", fontFamily: "inherit" }}>开始 →</button>
        </div>
      </div>
      <div style={{ display: "flex", gap: 14, width: 600 }}>
        <ExCard icon="🔗" title="给个视频链接" desc="小华扒文案 → 你改 → 声音 → 数字人 → 剪辑 → 发布" example="例:https://v.douyin.com/... / 小红书分享文 / 快手" />
        <ExCard icon="📝" title="文案我已经写好了" desc="跳过扒文案 → 直接到改 → 声音 → 数字人 → 剪辑 → 发布" example='省一步,自动跳过"扒文案"' />
      </div>
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

// ─── 中间态:扒文案中(轻抖轮询)───
function StepTranscribing({ url, batchId, onSuccess, onFallbackPaste }) {
  const [elapsed, setElapsed] = React.useState(0);
  const [status, setStatus] = React.useState("running");
  const [err, setErr] = React.useState("");
  React.useEffect(() => {
    if (!batchId) return;
    const t0 = Date.now();
    const tick = setInterval(() => setElapsed(Math.floor((Date.now() - t0) / 1000)), 500);
    let cancelled = false;
    async function poll() {
      for (let i = 0; i < 30; i++) {
        if (cancelled) return;
        try {
          const res = await api.get(`/api/transcribe/query/${batchId}`);
          setStatus(res.status);
          if (res.status === "succeed") {
            onSuccess({ text: res.text, title: res.title, author: res.author, duration: res.duration_sec });
            // 自动入素材库
            api.post("/api/materials", { original_text: res.text, url, title: res.title, author: res.author, duration_sec: res.duration_sec, source: "qingdou" }).catch(() => {});
            return;
          }
          if (res.status === "failed") { setErr(res.error || "扒不到文案"); return; }
        } catch (e) { setErr(e.message); return; }
        await new Promise(r => setTimeout(r, 3000));
      }
      setErr("超时 90 秒未出结果");
    }
    poll();
    return () => { cancelled = true; clearInterval(tick); };
  }, [batchId]);

  const pct = Math.min(95, Math.floor((elapsed / 20) * 80));
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "60px 40px", gap: 22, minHeight: "70%" }}>
      {!err ? (
        <>
          <div style={{ width: 96, height: 96, borderRadius: "50%", background: T.brandSoft, display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
            <div style={{ width: 96, height: 96, borderRadius: "50%", border: `4px solid ${T.brandSoft}`, borderTopColor: T.brand, animation: "qlspin 1.2s linear infinite", position: "absolute", top: 0, left: 0 }} />
            <div style={{ fontSize: 28 }}>🔗</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: T.text, marginBottom: 6 }}>正在扒文案...</div>
            <div style={{ fontSize: 13, color: T.muted }}>通常 15-30 秒 · 已用 <span style={{ fontWeight: 600, color: T.text, fontFamily: "SF Mono, Menlo, monospace" }}>{elapsed}s</span></div>
          </div>
          <div style={{ width: 480, height: 6, background: T.borderSoft, borderRadius: 100, overflow: "hidden" }}>
            <div style={{ width: `${pct}%`, height: "100%", background: T.brand, transition: "width .3s" }} />
          </div>
          <div style={{ fontSize: 11.5, color: T.muted2, fontFamily: "SF Mono, Menlo, monospace" }}>batch: {batchId}</div>
          <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
            <Btn onClick={onFallbackPaste}>扒不动?直接粘文案 →</Btn>
          </div>
        </>
      ) : (
        <>
          <div style={{ width: 72, height: 72, borderRadius: "50%", background: T.redSoft, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, color: T.red }}>✕</div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>没扒到</div>
          <div style={{ fontSize: 13, color: T.muted, maxWidth: 440, textAlign: "center" }}>{err}</div>
          <div style={{ display: "flex", gap: 10 }}>
            <Btn variant="primary" onClick={onFallbackPaste}>直接粘文案 →</Btn>
          </div>
        </>
      )}
    </div>
  );
}

// ─── 知识库注入栏(Step 2 用) ───
function KbInjectBar({ loading, matches, selected, toggle, expanded, setExpanded, onReload }) {
  if (!loading && matches.length === 0) {
    return (
      <div style={{
        padding: "10px 14px", borderRadius: 10, background: T.bg2, border: `1px dashed ${T.borderSoft}`,
        fontSize: 12, color: T.muted2, marginBottom: 14, display: "flex", alignItems: "center", gap: 8,
      }}>
        <span>📚</span>
        <span>知识库没找到相关条目 · <span onClick={onReload} style={{ color: T.brand, cursor: "pointer" }}>重试</span></span>
      </div>
    );
  }
  return (
    <div style={{
      padding: "11px 14px", borderRadius: 10,
      background: T.brandSoft, border: `1px solid ${T.brand}44`,
      marginBottom: 14, fontSize: 12.5,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }} onClick={() => setExpanded(!expanded)}>
        <span style={{ fontSize: 14 }}>📚</span>
        <span style={{ color: T.brand, fontWeight: 600 }}>
          {loading ? "小华正从知识库找相关素材..." : `小华从 Obsidian 找到 ${matches.length} 条相关,已默认选 ${selected.size} 条注入 AI`}
        </span>
        <div style={{ flex: 1 }} />
        {!loading && (
          <span style={{ color: T.brand, fontSize: 11 }}>{expanded ? "收起 ▲" : "展开看看 ▼"}</span>
        )}
      </div>
      {expanded && !loading && (
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
          {matches.map((m, i) => {
            const on = selected.has(m.path);
            return (
              <div key={m.path + i} onClick={() => toggle(m.path)} style={{
                display: "flex", alignItems: "flex-start", gap: 10, padding: "9px 12px",
                background: on ? "#fff" : T.bg2,
                border: `1px solid ${on ? T.brand : T.borderSoft}`,
                borderRadius: 8, cursor: "pointer",
              }}>
                <div style={{
                  width: 16, height: 16, borderRadius: 4, marginTop: 1,
                  border: `1.5px solid ${on ? T.brand : T.muted2}`,
                  background: on ? T.brand : "transparent",
                  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                  color: "#fff", fontSize: 10, fontWeight: 700,
                }}>{on ? "✓" : ""}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                    <Tag size="xs" color="gray">{m.section.replace(/^\d+\s[^\s]+\s/, "")}</Tag>
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {m.title}{m.heading ? ` · ${m.heading}` : ""}
                    </div>
                    <span style={{ fontSize: 10, color: T.muted2, fontFamily: "SF Mono, monospace" }}>{m.score}</span>
                  </div>
                  <div style={{ fontSize: 11.5, color: T.muted, lineHeight: 1.55, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                    {m.preview}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Step 2 · 文案 ───
function StepScript({ original, initialFinal, author, sourceUrl, onNext, onPrev }) {
  const [style, setStyle] = React.useState("casual");
  const [final, setFinal] = React.useState(initialFinal || "");
  const [sending, setSending] = React.useState(false);
  const [tokens, setTokens] = React.useState(0);
  const [err, setErr] = React.useState("");

  // 知识库注入
  const [kbMatches, setKbMatches] = React.useState([]);
  const [kbSelected, setKbSelected] = React.useState(new Set());
  const [kbLoading, setKbLoading] = React.useState(false);
  const [kbExpanded, setKbExpanded] = React.useState(false);

  async function loadKb() {
    if (!original || original.length < 20) return;
    setKbLoading(true);
    try {
      const r = await api.post("/api/kb/match", { query: original.slice(0, 200), k: 5 });
      setKbMatches(r || []);
      // 默认勾选 Top 3
      setKbSelected(new Set((r || []).slice(0, 3).map(x => x.path)));
    } catch (e) { console.error(e); }
    setKbLoading(false);
  }

  async function rewrite(includeKb = true) {
    setSending(true); setErr("");
    try {
      let text = original;
      if (includeKb && kbSelected.size > 0) {
        const chunks = kbMatches.filter(m => kbSelected.has(m.path));
        const kbBlock = chunks.map(c => `## ${c.title}${c.heading ? " · " + c.heading : ""}\n${c.text}`).join("\n\n");
        text = `【可参考的知识库素材,可适度引用】\n${kbBlock}\n\n【要改写的原文案】\n${original}`;
      }
      const r = await api.post("/api/rewrite", { text, style });
      setFinal(r.text);
      setTokens(r.tokens || 0);
    } catch (e) { setErr(e.message); }
    setSending(false);
  }
  React.useEffect(() => {
    loadKb();
    // eslint-disable-next-line
  }, [original]);
  React.useEffect(() => {
    if (!initialFinal && original && !final) {
      // 等 kb 加载一会再 rewrite
      const timer = setTimeout(() => rewrite(true), 1200);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line
  }, []);

  function toggleKb(path) {
    const next = new Set(kbSelected);
    if (next.has(path)) next.delete(path);
    else next.add(path);
    setKbSelected(next);
  }

  return (
    <div style={{ padding: "32px 40px 120px", maxWidth: 960, margin: "0 auto" }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 24, fontWeight: 700, color: T.text, marginBottom: 6 }}>改成你的话 ✍️</div>
        <div style={{ fontSize: 13, color: T.muted }}>挑个风格,小华帮你改。不满意直接在右边改,或按下面快捷再来一版。</div>
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
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

      {/* 知识库注入栏 */}
      <KbInjectBar
        loading={kbLoading}
        matches={kbMatches}
        selected={kbSelected}
        toggle={toggleKb}
        expanded={kbExpanded}
        setExpanded={setKbExpanded}
        onReload={loadKb}
      />


      <div style={{ display: "flex", gap: 14 }}>
        {/* 原文 */}
        <div style={{ flex: 1, background: T.bg2, border: `1px solid ${T.borderSoft}`, borderRadius: 12, padding: 18, minHeight: 280 }}>
          <div style={{ fontSize: 11.5, color: T.muted2, fontWeight: 600, letterSpacing: "0.08em", marginBottom: 10 }}>
            原文案 · {original.length} 字 · {sourceUrl ? `链接 · ${author || "@原作者"}` : "你粘的文案"}
          </div>
          <div style={{ fontSize: 13.5, color: T.muted, lineHeight: 1.8, whiteSpace: "pre-wrap", maxHeight: 360, overflow: "auto" }}>{original}</div>
        </div>
        {/* 改写后 */}
        <div style={{ flex: 1.1, background: "#fff", border: `1px solid ${T.borderSoft}`, borderRadius: 12, padding: 18 }}>
          <div style={{ display: "flex", alignItems: "center", marginBottom: 10 }}>
            <div style={{ fontSize: 11.5, color: T.text, fontWeight: 600, letterSpacing: "0.08em" }}>
              改写结果 · {final.length} 字 · 约 {Math.round(final.length / 4.5)} 秒 {tokens ? `· ${tokens} tokens` : ""}
            </div>
            <div style={{ flex: 1 }} />
            <button onClick={rewrite} disabled={sending || !original} style={{ fontSize: 11.5, color: T.brand, background: "transparent", border: "none", cursor: sending ? "wait" : "pointer", fontFamily: "inherit" }}>
              {sending ? "改写中..." : "🔄 再来一版"}
            </button>
          </div>
          <textarea
            value={final}
            onChange={(e) => setFinal(e.target.value)}
            placeholder={sending ? "改写中..." : "改写结果会出现在这里..."}
            style={{ width: "100%", border: "none", outline: "none", background: "transparent", fontSize: 14.5, fontFamily: "inherit", resize: "vertical", lineHeight: 1.9, color: T.text, minHeight: 240 }}
          />
        </div>
      </div>

      {err && <div style={{ marginTop: 12, padding: 10, background: T.redSoft, color: T.red, borderRadius: 8, fontSize: 12 }}>⚠️ {err}</div>}

      <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
        {["再随意一点", "加促销钩子", "缩短到 20 秒", "强调免费"].map((t) => (
          <div key={t} onClick={async () => {
            if (!final) return;
            setSending(true);
            try {
              const r = await api.post("/api/rewrite", { text: final + "\n\n(要求:" + t + ")", style });
              setFinal(r.text);
              setTokens(x => x + (r.tokens || 0));
            } catch (e) { setErr(e.message); }
            setSending(false);
          }} style={{ padding: "6px 12px", background: "#fff", border: `1px solid ${T.border}`, borderRadius: 100, color: T.muted, fontSize: 12, cursor: "pointer" }}>{t}</div>
        ))}
        <div style={{ flex: 1 }} />
        <Btn variant="outline" onClick={onPrev}>← 上一步</Btn>
        <Btn variant="primary" onClick={() => onNext({ finalText: final })} disabled={!final || sending}>就用这个 →</Btn>
      </div>
    </div>
  );
}

// ─── Step 3 · 声音 ───
function StepVoice({ finalText, onNext, onPrev }) {
  const [speakers, setSpeakers] = React.useState([]);
  const [voice, setVoice] = React.useState(null);
  const [err, setErr] = React.useState("");
  React.useEffect(() => {
    api.get("/api/speakers").then(list => {
      setSpeakers(list);
      if (list[0]) setVoice(list[0].id);
    }).catch(e => setErr(e.message));
  }, []);

  return (
    <div style={{ padding: "32px 40px 120px", maxWidth: 860, margin: "0 auto" }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 24, fontWeight: 700, color: T.text, marginBottom: 6 }}>用什么声音念? 🎙️</div>
        <div style={{ fontSize: 13, color: T.muted }}>文案 {finalText?.length || 0} 字,约 {Math.round((finalText?.length || 0) / 4.5)} 秒。选一个声音就行。</div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {speakers.length === 0 && <div style={{ color: T.muted, fontSize: 13 }}>加载声音列表中...</div>}
        {speakers.map((v, i) => (
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
                <div style={{ fontSize: 14, fontWeight: 600 }}>{v.title || `声音 ${v.id}`}</div>
                {i === 0 && <Tag size="xs" color="green">推荐</Tag>}
                <Tag size="xs" color="gray">石榴</Tag>
              </div>
              <div style={{ fontSize: 12, color: T.muted }}>speaker_id={v.id}</div>
            </div>
            <button style={{ padding: "6px 12px", background: "#fff", border: `1px solid ${T.border}`, borderRadius: 100, fontSize: 12, color: T.muted, cursor: "pointer", fontFamily: "inherit" }}>▶ 试听</button>
          </div>
        ))}
      </div>

      {err && <div style={{ marginTop: 12, padding: 10, background: T.redSoft, color: T.red, borderRadius: 8, fontSize: 12 }}>⚠️ {err}</div>}

      <div style={{ display: "flex", marginTop: 20 }}>
        <Btn variant="outline" onClick={onPrev}>← 上一步</Btn>
        <div style={{ flex: 1 }} />
        <Btn variant="primary" onClick={() => {
          const picked = speakers.find(s => s.id === voice);
          voice && onNext({ speakerId: voice, speakerTitle: picked?.title || `声音 ${voice}` });
        }} disabled={!voice}>合成口播 →</Btn>
      </div>
    </div>
  );
}

// ─── Step 4 · 形象 ───
function StepAvatar({ onNext, onPrev }) {
  const [avatars, setAvatars] = React.useState([]);
  const [picked, setPicked] = React.useState(null);
  const [err, setErr] = React.useState("");
  const gradients = [
    "linear-gradient(135deg, #2a6f4a 0%, #1e5537 100%)",
    "linear-gradient(135deg, #2c5d86 0%, #1e4166 100%)",
    "linear-gradient(135deg, #b8456b 0%, #8c3050 100%)",
  ];
  React.useEffect(() => {
    api.get("/api/avatars").then(list => {
      setAvatars(list);
      if (list[0]) setPicked(list[0].id);
    }).catch(e => setErr(e.message));
  }, []);

  // 不足 3 个时占位
  const cards = [...avatars];
  while (cards.length < 3) cards.push({ id: -(cards.length + 1), title: ["专业教练", "邻家姐姐"][cards.length - 1] || `候选 ${cards.length + 1}`, mock: true });

  return (
    <div style={{ padding: "32px 40px 120px", maxWidth: 960, margin: "0 auto" }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 24, fontWeight: 700, color: T.text, marginBottom: 6 }}>挑个数字人形象 👤</div>
        <div style={{ fontSize: 13, color: T.muted }}>建议用你本人,老客户认脸,转化高很多。</div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
        {cards.slice(0, 3).map((a, i) => {
          const sel = picked === a.id;
          return (
            <div key={a.id} onClick={() => !a.mock && setPicked(a.id)} style={{
              background: "#fff",
              border: `1px solid ${sel ? T.brand : T.borderSoft}`,
              boxShadow: sel ? `0 0 0 3px ${T.brandSoft}` : "none",
              borderRadius: 12, cursor: a.mock ? "not-allowed" : "pointer", overflow: "hidden",
              opacity: a.mock ? 0.5 : 1,
            }}>
              <div style={{ aspectRatio: "3/4", background: gradients[i], display: "flex", alignItems: "flex-end", padding: 16, color: "#fff" }}>
                <div style={{ fontSize: 10.5, fontFamily: "SF Mono, monospace", opacity: 0.9 }}>[ {a.title || `avatar_${a.id}`} ]</div>
              </div>
              <div style={{ padding: 14 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{a.title || `形象 ${a.id}`}</div>
                  {i === 0 && !a.mock && <Tag size="xs" color="green">推荐</Tag>}
                </div>
                <div style={{ fontSize: 12, color: T.muted }}>{a.mock ? "石榴后台还没创建 · 下个版本" : `avatar_id=${a.id}`}</div>
              </div>
            </div>
          );
        })}
      </div>

      {err && <div style={{ marginTop: 12, padding: 10, background: T.redSoft, color: T.red, borderRadius: 8, fontSize: 12 }}>⚠️ {err}</div>}

      <div style={{ display: "flex", marginTop: 20 }}>
        <Btn variant="outline" onClick={onPrev}>← 上一步</Btn>
        <div style={{ flex: 1 }} />
        <Btn variant="primary" onClick={() => {
          const picked_obj = avatars.find(x => x.id === picked);
          picked > 0 && onNext({ avatarId: picked, avatarTitle: picked_obj?.title || `形象 ${picked}` });
        }} disabled={!picked || picked < 0}>合成视频 →</Btn>
      </div>
    </div>
  );
}

// ─── Step 5 · 剪辑 ───
function StepEdit({ finalText, speakerTitle, avatarTitle, onConfirm, onPrev }) {
  const [tpl, setTpl] = React.useState("t1");
  const templates = [
    { id: "t1", name: "口播 · 字幕大", sub: "最常用,说服力强", hot: true },
    { id: "t2", name: "口播 + 空镜", sub: "穿插场景画面" },
    { id: "t3", name: "快节奏切镜", sub: "每 3 秒一切" },
    { id: "t4", name: "纯字幕", sub: "不露脸版本" },
  ];
  return (
    <div style={{ padding: "32px 40px 120px", maxWidth: 960, margin: "0 auto" }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 24, fontWeight: 700, color: T.text, marginBottom: 6 }}>一键剪辑 ✂️</div>
        <div style={{ fontSize: 13, color: T.muted }}>
          文案 {finalText?.length || 0} 字 · 声音 <b style={{ color: T.text }}>{speakerTitle || "(空)"}</b> · 形象 <b style={{ color: T.text }}>{avatarTitle || "(空)"}</b>。挑一个剪辑模板,小华按这个风格出片。
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        {templates.map((t) => (
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
        ⏳ 合成大约需要 60-90 秒 · 你先想想发哪儿,小华弄好了叫你
      </div>

      <div style={{ display: "flex", marginTop: 20 }}>
        <Btn variant="outline" onClick={onPrev}>← 上一步</Btn>
        <div style={{ flex: 1 }} />
        <Btn variant="primary" onClick={() => onConfirm({ templateId: tpl })}>开始合成 →</Btn>
      </div>
    </div>
  );
}

// ─── 中间态:合成中(石榴视频轮询)───
function StepWaiting({ workId, videoId, onDone, onError }) {
  const [progress, setProgress] = React.useState(0);
  const [status, setStatus] = React.useState("pending");
  const [elapsed, setElapsed] = React.useState(0);
  const [err, setErr] = React.useState("");
  React.useEffect(() => {
    if (!videoId) return;
    const t0 = Date.now();
    const tick = setInterval(() => setElapsed(Math.floor((Date.now() - t0) / 1000)), 500);
    let cancelled = false;
    async function poll() {
      for (let i = 0; i < 60; i++) {
        if (cancelled) return;
        try {
          const r = await api.get(`/api/video/query/${videoId}`);
          setProgress(r.progress || 0);
          setStatus(r.status);
          if (r.local_url || (r.status || "").toLowerCase() === "ready" || (r.status || "").toLowerCase() === "succeed") {
            onDone({ localUrl: r.local_url || r.video_url });
            return;
          }
          if ((r.status || "").toLowerCase() === "failed") { setErr("石榴生成失败"); onError?.("石榴生成失败"); return; }
        } catch (e) { setErr(e.message); }
        await new Promise(r => setTimeout(r, 6000));
      }
      setErr("超时 6 分钟未生成完");
    }
    poll();
    return () => { cancelled = true; clearInterval(tick); };
  }, [videoId]);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "60px 40px", gap: 22, minHeight: "70%" }}>
      {!err ? (
        <>
          <div style={{ position: "relative", width: 140, height: 140 }}>
            <svg width="140" height="140" viewBox="0 0 100 100" style={{ transform: "rotate(-90deg)" }}>
              <circle cx="50" cy="50" r="44" fill="none" stroke={T.brandSoft} strokeWidth="6" />
              <circle cx="50" cy="50" r="44" fill="none" stroke={T.brand} strokeWidth="6" strokeLinecap="round"
                strokeDasharray={`${Math.max(progress, elapsed > 10 ? 15 : 5) * 2.76} 276`} style={{ transition: "stroke-dasharray .5s" }} />
            </svg>
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column" }}>
              <div style={{ fontSize: 26, fontWeight: 700, color: T.brand }}>{progress || Math.min(95, Math.floor(elapsed / 60 * 90))}%</div>
              <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>{status}</div>
            </div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: T.text, marginBottom: 6 }}>小华正在把你说的话装进数字人里</div>
            <div style={{ fontSize: 13, color: T.muted }}>通常 60-90 秒 · video_id={videoId} · work={workId}</div>
          </div>
          <div style={{ padding: 12, background: T.brandSoft, borderRadius: 10, fontSize: 12.5, color: T.brand, lineHeight: 1.55, maxWidth: 560 }}>
            ⏳ 生成完自动跳到发布页,会有 4 张 AI 封面已备好。
          </div>
        </>
      ) : (
        <>
          <div style={{ fontSize: 40 }}>❌</div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>生成失败</div>
          <div style={{ color: T.muted, fontSize: 13, textAlign: "center", maxWidth: 440 }}>{err}</div>
        </>
      )}
    </div>
  );
}

// ─── Step 6 · 发布 ───
function StepPublish({ ctx, update, onDone, onPrev }) {
  const [plats, setPlats] = React.useState({ douyin: true, shipinhao: true, xhs: false, kuaishou: false });
  const toggle = (p) => setPlats({ ...plats, [p]: !plats[p] });
  const [publishing, setPublishing] = React.useState(false);
  const [publishNote, setPublishNote] = React.useState("");
  const [picked, setPicked] = React.useState(0);

  function pickSlogan() {
    const s = (ctx.finalText || "").split(/[\n。!?!?]/).filter(x => x.trim().length >= 4);
    const short = s.filter(x => x.length <= 14);
    return (short[0] || s[0] || "精彩内容").trim().slice(0, 14);
  }

  React.useEffect(() => {
    if (ctx.covers && ctx.covers.length > 0) return;
    async function gen() {
      try {
        const r = await api.post("/api/cover", { slogan: pickSlogan(), category: "实体店引流", n: 4 });
        const ts = r.tasks.map(t => ({ task_id: t.task_id, status: "running", media_url: null }));
        update({ covers: ts });
        ts.forEach((t, idx) => pollCover(t.task_id, idx));
      } catch (e) { console.error(e); }
    }
    gen();
    // eslint-disable-next-line
  }, []);

  async function pollCover(tid, idx) {
    for (let i = 0; i < 40; i++) {
      try {
        const r = await api.get(`/api/cover/query/${tid}`);
        update({
          covers: (window.__latestCtx?.covers || ctx.covers || []).map((c, j) => j === idx ? { ...c, status: r.status, media_url: r.media_url } : c),
        });
        if (r.status === "succeed" || r.status === "failed") return;
      } catch {}
      await new Promise(r => setTimeout(r, 5000));
    }
  }
  React.useEffect(() => { window.__latestCtx = ctx; }, [ctx]);

  async function publish() {
    setPublishing(true);
    try {
      const chosen = Object.keys(plats).filter(k => plats[k]);
      const r = await api.post("/api/publish", { work_id: ctx.workId, platforms: chosen, schedule_at: null });
      setPublishNote(r.note || "已标记发布");
    } catch (e) {
      setPublishNote("发布失败: " + e.message);
    }
    setPublishing(false);
  }

  const covers = ctx.covers || [];

  return (
    <div style={{ padding: "32px 40px 120px", maxWidth: 1060, margin: "0 auto" }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 24, fontWeight: 700, color: T.text, marginBottom: 6 }}>发出去吧 🚀</div>
        <div style={{ fontSize: 13, color: T.muted }}>选要发的平台 · 标题和标签小华自动按每个平台的调调改好了。</div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 20 }}>
        {/* 视频预览 */}
        <div style={{ background: "#fff", border: `1px solid ${T.borderSoft}`, borderRadius: 12, padding: 14 }}>
          {ctx.localUrl ? (
            <video src={api.media(ctx.localUrl)} controls style={{ width: "100%", aspectRatio: "9/16", borderRadius: 8, marginBottom: 10, background: "#000" }} />
          ) : (
            <div style={{ aspectRatio: "9/16", background: "linear-gradient(135deg, #1e293b 0%, #475569 100%)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 40, marginBottom: 10 }}>▶</div>
          )}
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>{(ctx.finalText || "").slice(0, 24)}...</div>
          <div style={{ fontSize: 11, color: T.muted }}>
            {ctx.localUrl ? `work=${ctx.workId} · 已合成` : "(未合成)"}
          </div>
          {ctx.localUrl && (
            <a href={api.media(ctx.localUrl)} download style={{ textDecoration: "none" }}>
              <Btn size="sm" style={{ marginTop: 10, width: "100%" }}>⬇ 下载 MP4</Btn>
            </a>
          )}
        </div>

        {/* 封面 + 平台 */}
        <div>
          {/* 4 张封面 */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11.5, color: T.muted, fontWeight: 600, letterSpacing: "0.08em", marginBottom: 8 }}>
              封面 · GPT-Image-2 生成 · {covers.filter(c => c.status === "succeed").length}/{covers.length || 4}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
              {(covers.length ? covers : Array(4).fill({ status: "running" })).map((c, i) => {
                const ready = c.media_url;
                return (
                  <div key={i} onClick={() => ready && setPicked(i)} style={{
                    aspectRatio: "3/4", borderRadius: 10, overflow: "hidden", cursor: ready ? "pointer" : "wait",
                    background: ready ? `url(${api.media(c.media_url)}) center/cover` : T.bg2,
                    border: picked === i && ready ? `2px solid ${T.brand}` : `2px solid transparent`,
                    boxShadow: picked === i && ready ? `0 0 0 3px ${T.brandSoft}` : "none",
                    position: "relative",
                  }}>
                    {!ready && (
                      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: T.muted, fontSize: 11 }}>
                        {c.status === "failed" ? <span style={{ color: T.red }}>失败</span> : "生成中..."}
                      </div>
                    )}
                    {ready && picked === i && (
                      <div style={{ position: "absolute", top: 4, right: 4, background: "#fff", color: T.brand, padding: "2px 7px", borderRadius: 100, fontSize: 10, fontWeight: 700 }}>使用中</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* 平台选择 */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[
              { id: "douyin", plat: "douyin", name: "抖音", sub: "你的「清华哥聊私域」· 35.2K 粉", hot: true },
              { id: "shipinhao", plat: "shipinhao", name: "视频号", sub: "老客户主要在这", hot: true },
              { id: "xhs", plat: "xiaohongshu", name: "小红书", sub: "女生用户多" },
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
      </div>

      {publishNote && (
        <div style={{ marginTop: 16, padding: 12, background: T.brandSoft, color: T.brand, borderRadius: 10, fontSize: 13 }}>✓ {publishNote}</div>
      )}

      <div style={{ display: "flex", marginTop: 24, alignItems: "center" }}>
        <Btn variant="outline" onClick={onPrev}>← 上一步</Btn>
        <div style={{ flex: 1 }} />
        <div style={{ fontSize: 12, color: T.muted, marginRight: 12 }}>将发布到 {Object.values(plats).filter(Boolean).length} 个平台</div>
        <Btn variant="primary" size="lg" onClick={async () => { await publish(); setTimeout(() => onDone(), 800); }} disabled={publishing || !ctx.workId}>
          {publishing ? "发布中..." : "一键发布 🚀"}
        </Btn>
      </div>
    </div>
  );
}

Object.assign(window, { PageMake });
