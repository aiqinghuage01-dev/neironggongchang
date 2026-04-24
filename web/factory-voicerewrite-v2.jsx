// factory-voicerewrite-v2.jsx — 录音文案改写 skill (D-013)
// Skill 源: ~/Desktop/skills/录音文案改写/
// 3 步: 输入转写文本 → 看骨架+选 2 角度 → 看正文+改写说明+自检

const VOICE_STEPS = [
  { id: "input",    n: 1, label: "输入录音转写" },
  { id: "angles",   n: 2, label: "选角度" },
  { id: "write",    n: 3, label: "正文+改写说明" },
];

function PageVoicerewrite({ onNav }) {
  const [step, setStep] = React.useState("input");
  const [loading, setLoading] = React.useState(false);
  const [err, setErr] = React.useState("");

  const [transcript, setTranscript] = React.useState("");
  const [analyze, setAnalyze] = React.useState(null);
  const [pickedAngle, setPickedAngle] = React.useState(null);
  const [script, setScript] = React.useState(null);

  const [skillInfo, setSkillInfo] = React.useState(null);
  React.useEffect(() => { api.get("/api/voicerewrite/skill-info").then(setSkillInfo).catch(() => {}); }, []);

  async function runStep({ nextStep, rollbackStep, clearSetter, apiCall }) {
    if (clearSetter) clearSetter(null);
    setStep(nextStep);
    setLoading(true); setErr("");
    try { await apiCall(); }
    catch (e) { setErr(e.message); if (rollbackStep) setStep(rollbackStep); }
    finally { setLoading(false); }
  }

  function doAnalyze() {
    if (!transcript.trim()) return;
    return runStep({
      nextStep: "angles", rollbackStep: "input", clearSetter: setAnalyze,
      apiCall: async () => {
        const r = await api.post("/api/voicerewrite/analyze", { transcript: transcript.trim() });
        setAnalyze(r);
      },
    });
  }
  function pickAngle(angle) {
    setPickedAngle(angle);
    return runStep({
      nextStep: "write", rollbackStep: "angles", clearSetter: setScript,
      apiCall: async () => {
        const r = await api.post("/api/voicerewrite/write", {
          transcript: transcript.trim(),
          skeleton: analyze?.skeleton || {},
          angle,
        });
        setScript(r);
      },
    });
  }
  function reset() {
    setStep("input"); setErr("");
    setTranscript(""); setAnalyze(null);
    setPickedAngle(null); setScript(null);
    clearWorkflow("voicerewrite");
  }

  // 工作流持久化 (D-016)
  const wfState = { step, transcript, analyze, pickedAngle, script };
  const wfRestore = (s) => {
    if (s.step) setStep(s.step);
    if (s.transcript != null) setTranscript(s.transcript);
    if (s.analyze) setAnalyze(s.analyze);
    if (s.pickedAngle) setPickedAngle(s.pickedAngle);
    if (s.script) setScript(s.script);
  };
  const wf = useWorkflowPersist({ ns: "voicerewrite", state: wfState, onRestore: wfRestore });

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", background: T.bg, position: "relative", overflow: "hidden" }}>
      <VoiceHeader current={step} onBack={() => onNav("home")} skillInfo={skillInfo} />
      <div style={{ flex: 1, overflow: "auto" }}>
        <WfRestoreBanner show={wf.hasSnapshot} onDismiss={wf.dismissSnapshot}
          onClear={() => { reset(); wf.dismissSnapshot(); }}
          label="录音改写工作流" />
        {err && (
          <div style={{ maxWidth: 820, margin: "16px auto 0", padding: 12, background: T.redSoft, color: T.red, borderRadius: 10, fontSize: 13 }}>
            ⚠️ {err}
          </div>
        )}
        {step === "input"  && <VStepInput transcript={transcript} setTranscript={setTranscript} onGo={doAnalyze} loading={loading} skillInfo={skillInfo} />}
        {step === "angles" && <VStepAngles analyze={analyze} loading={loading} onPick={pickAngle} onPrev={() => setStep("input")} onRegen={doAnalyze} />}
        {step === "write"  && <VStepWrite script={script} angle={pickedAngle} loading={loading} onPrev={() => setStep("angles")} onRewrite={() => pickAngle(pickedAngle)} onReset={reset} />}
      </div>
    </div>
  );
}

function VoiceHeader({ current, onBack, skillInfo }) {
  return (
    <div style={{ padding: "12px 24px", background: "#fff", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 14, flexShrink: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ width: 26, height: 26, borderRadius: 7, background: T.text, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13 }}>🎙️</div>
        <div style={{ fontSize: 13.5, fontWeight: 600 }}>录音改写 · 3 步</div>
        {skillInfo && (
          <span title={`~/Desktop/skills/${skillInfo.slug}/`}
            style={{ fontSize: 10.5, color: T.brand, background: T.brandSoft, padding: "2px 8px", borderRadius: 100, marginLeft: 6 }}>
            用技能:{skillInfo.slug}
          </span>
        )}
      </div>
      <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, marginLeft: 8 }}>
        {VOICE_STEPS.map((s, i) => {
          const active = s.id === current;
          const done = VOICE_STEPS.findIndex(x => x.id === current) > i;
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
              {i < VOICE_STEPS.length - 1 && <span style={{ color: T.muted3 }}>—</span>}
            </React.Fragment>
          );
        })}
      </div>
      <ApiStatusLight />
      <button onClick={onBack} style={{ background: "transparent", border: "none", color: T.muted, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>← 返回</button>
    </div>
  );
}

function VStepInput({ transcript, setTranscript, onGo, loading, skillInfo }) {
  const ready = !!transcript.trim() && !loading;
  const len = transcript.length;
  return (
    <div style={{ padding: "40px 40px 60px", maxWidth: 820, margin: "0 auto" }}>
      <div style={{ textAlign: "center", marginBottom: 24 }}>
        <div style={{ fontSize: 28, fontWeight: 700, color: T.text, marginBottom: 8, letterSpacing: "-0.02em" }}>录音转写了吗? 🎙️</div>
        <div style={{ fontSize: 14, color: T.muted }}>观点不变 · 口吻不丢 · 经历保留 · 默认一条完整文案</div>
      </div>

      <div style={{ background: "#fff", border: `1.5px solid ${T.brand}`, boxShadow: `0 0 0 5px ${T.brandSoft}`, borderRadius: 16, padding: 18, marginBottom: 18 }}>
        <textarea rows={14} value={transcript} onChange={e => setTranscript(e.target.value)}
          placeholder="把录音转写文本贴这里(通常很长,1000-5000 字)...&#10;&#10;skill 会:&#10;1. 提骨架 - 核心观点 / 关键经历 / 行业洞察&#10;2. 给最多 2 个切入角度(不罗列,只给最打动的)&#10;3. 按你选的角度做轻改写(黄金三秒 + 轻量重排 + 最小删减)"
          style={{ width: "100%", border: "none", outline: "none", background: "transparent", fontSize: 14, fontFamily: "inherit", resize: "vertical", lineHeight: 1.7, color: T.text }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, paddingTop: 12, borderTop: `1px solid ${T.borderSoft}` }}>
          <div style={{ fontSize: 11.5, color: T.muted2 }}>🎙️ 转写 {len} 字 · skill 严禁把你说的话改成广告</div>
          <div style={{ flex: 1 }} />
          <button onClick={onGo} disabled={!ready} style={{
            padding: "8px 20px", fontSize: 13, fontWeight: 600,
            background: ready ? T.brand : T.muted3, color: "#fff",
            border: "none", borderRadius: 100, cursor: ready ? "pointer" : "not-allowed", fontFamily: "inherit",
          }}>{loading ? "提骨架中..." : "提骨架 + 给切入角度 →"}</button>
        </div>
      </div>

      {skillInfo && (
        <div style={{ padding: 14, background: "#fff", border: `1px solid ${T.borderSoft}`, borderRadius: 10, fontSize: 12, color: T.muted, lineHeight: 1.8 }}>
          <div style={{ fontWeight: 600, color: T.text, marginBottom: 6 }}>skill 资源</div>
          <div>SKILL.md · {skillInfo.skill_md_chars} 字符</div>
          {Object.entries(skillInfo.references || {}).map(([k, v]) => (
            <div key={k}>references/{k}.md · {v} 字符</div>
          ))}
        </div>
      )}
    </div>
  );
}

function VStepAngles({ analyze, loading, onPick, onPrev, onRegen }) {
  const [hoverIdx, setHoverIdx] = React.useState(-1);
  if (loading || !analyze) return <Spinning icon="🔍" phases={[
    { text: "完整读录音", sub: "标 5 类信息:观点/经历/洞察/弱信息/语气锚点" },
    { text: "提炼最打动人的 1 个核心观点", sub: "不罗列所有,要深度分析" },
    { text: "给最多 2 个切入角度", sub: "基于判断,不把选择权全交给你" },
    { text: "每个角度配 10-35 字黄金三秒开场草稿", sub: "反差句 / 结果句 / 态度句" },
  ]} />;
  const sk = analyze.skeleton || {};
  const angles = analyze.angles || [];
  return (
    <div style={{ padding: "32px 40px 120px", maxWidth: 820, margin: "0 auto" }}>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>骨架提完 · 挑一个切入角度 🎯</div>
        <div style={{ fontSize: 13, color: T.muted }}>skill 只给最多 2 个角度(不罗列),选完直接写一条完整文案。</div>
      </div>

      <div style={{ padding: 16, background: T.bg2, border: `1px solid ${T.borderSoft}`, borderRadius: 12, marginBottom: 16 }}>
        <div style={{ fontSize: 11.5, color: T.muted2, fontWeight: 600, letterSpacing: "0.08em", marginBottom: 10 }}>录音骨架</div>
        <div style={{ fontSize: 13, lineHeight: 1.8 }}>
          <div style={{ marginBottom: 6 }}><b style={{ color: T.text }}>核心观点</b> · <span style={{ color: T.muted }}>{sk.core_view}</span></div>
          {sk.key_experiences?.length > 0 && (
            <div style={{ marginBottom: 6 }}><b style={{ color: T.text }}>关键经历</b> · <span style={{ color: T.muted }}>{sk.key_experiences.join(" / ")}</span></div>
          )}
          {sk.insights?.length > 0 && (
            <div style={{ marginBottom: 6 }}><b style={{ color: T.text }}>行业洞察</b> · <span style={{ color: T.muted }}>{sk.insights.join(" / ")}</span></div>
          )}
          {sk.tone_anchors?.length > 0 && (
            <div style={{ marginBottom: 6 }}><b style={{ color: T.text }}>语气锚点</b> · <span style={{ color: T.muted, fontFamily: "SF Mono, monospace", fontSize: 12 }}>{sk.tone_anchors.join(" · ")}</span></div>
          )}
          {sk.weak_to_delete?.length > 0 && (
            <div style={{ color: T.muted2, fontSize: 11.5, marginTop: 8 }}>🗑️ 计划删除: {sk.weak_to_delete.join(" / ")}</div>
          )}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {angles.map((a, i) => {
          const hover = hoverIdx === i;
          return (
            <div key={i} onClick={() => onPick(a)}
              onMouseEnter={() => setHoverIdx(i)}
              onMouseLeave={() => setHoverIdx(-1)}
              style={{
                padding: 18, background: "#fff",
                border: `1px solid ${hover ? T.brand : T.borderSoft}`,
                boxShadow: hover ? `0 0 0 4px ${T.brandSoft}` : "none",
                borderRadius: 12, cursor: "pointer",
                transition: "border-color 0.15s, box-shadow 0.15s",
              }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <Tag size="xs" color={["pink","blue"][i % 2]}>{a.label?.split('.')[0] || (i + 1)}</Tag>
                <span style={{ fontSize: 15, fontWeight: 600, color: T.text }}>{a.label?.replace(/^[A-Z]\.\s*/, '')}</span>
              </div>
              <div style={{ fontSize: 12, color: T.muted, marginBottom: 8 }}>💡 {a.why}</div>
              <div style={{ fontSize: 13.5, color: T.text, background: T.bg2, padding: "10px 14px", borderRadius: 6, lineHeight: 1.6, borderLeft: `3px solid ${T.brand}`, fontWeight: 500 }}>
                🎬 黄金三秒: <b>"{a.opening_draft}"</b>
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 18, alignItems: "center" }}>
        <Btn variant="outline" onClick={onPrev}>← 改转写</Btn>
        <Btn onClick={onRegen}>🔄 重新分析</Btn>
      </div>
    </div>
  );
}

function VStepWrite({ script, angle, loading, onPrev, onRewrite, onReset }) {
  if (loading || !script) return <Spinning icon="✍️" phases={[
    { text: "按你选的角度写黄金三秒", sub: "10-35 字 · 反差/结果/态度句" },
    { text: "轻量重排叙事", sub: "尊重用户原有叙事线,不强行重排" },
    { text: "最小删减 · 只删无效重复", sub: "经历故事绝不动 · 销售话术删掉" },
    { text: "保留用户原口吻", sub: "语感 / 句式 / 标志性表达" },
    { text: "写改写说明", sub: "3-6 条 · 保留了什么 / 删了什么 / 为什么" },
    { text: "7 条自检清单", sub: "观点对齐 / 经历完整 / 真诚感 / 口吻 / 黄金三秒 / 不过删 / 深度" },
  ]} />;

  const sc = script.self_check || {};
  const checks = [
    { key: "core_view_match", label: "核心观点一致" },
    { key: "experiences_kept", label: "关键经历完整保留" },
    { key: "sounds_genuine", label: "像真诚分享 · 非广告" },
    { key: "tone_preserved", label: "口吻风格保留" },
    { key: "golden_3s_strong", label: "黄金三秒抓人" },
    { key: "no_over_trim", label: "没过度删减" },
    { key: "deep_enough", label: "深度够打动人" },
  ];
  const passed = checks.filter(c => sc[c.key]).length;

  const [copied, setCopied] = React.useState(false);
  function copy() {
    navigator.clipboard?.writeText(script.content || "");
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div style={{ padding: "32px 40px 120px", maxWidth: 1080, margin: "0 auto" }}>
      <div style={{ marginBottom: 16, display: "flex", alignItems: "flex-start", gap: 16 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>改写完成 · {script.word_count} 字 🎙️</div>
          <div style={{ fontSize: 12, color: T.muted }}>
            角度: <b style={{ color: T.text }}>{angle?.label}</b> · {script.tokens?.total || "?"} tokens
          </div>
        </div>
        <div style={{ padding: 12, background: sc.overall_pass ? T.brandSoft : T.redSoft, border: `1px solid ${sc.overall_pass ? T.brand + "44" : T.red + "44"}`, borderRadius: 10, fontSize: 12, color: sc.overall_pass ? T.brand : T.red, minWidth: 240 }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>📋 自检 {sc.overall_pass ? "✅" : "⚠️"}</div>
          <div>{passed}/7 通过</div>
          {sc.summary && <div style={{ fontSize: 11, marginTop: 4, opacity: 0.8 }}>{sc.summary}</div>}
        </div>
      </div>

      <div style={{ background: "#fff", border: `1px solid ${T.borderSoft}`, borderRadius: 12, padding: 20, marginBottom: 14 }}>
        <div style={{ fontSize: 11.5, color: T.muted2, fontWeight: 600, letterSpacing: "0.08em", marginBottom: 10 }}>可直接读稿版</div>
        <textarea value={script.content || ""} readOnly
          style={{ width: "100%", border: "none", outline: "none", background: "transparent", fontSize: 14.5, fontFamily: "inherit", resize: "vertical", lineHeight: 1.9, color: T.text, minHeight: 300 }} />
      </div>

      {script.notes?.length > 0 && (
        <div style={{ padding: 14, background: T.bg2, border: `1px solid ${T.borderSoft}`, borderRadius: 12, marginBottom: 14 }}>
          <div style={{ fontSize: 11.5, color: T.muted2, fontWeight: 600, letterSpacing: "0.08em", marginBottom: 8 }}>改写说明</div>
          <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: T.muted, lineHeight: 1.8 }}>
            {script.notes.map((n, i) => <li key={i}>{n}</li>)}
          </ul>
        </div>
      )}

      <div style={{ padding: 12, background: "#fff", border: `1px solid ${T.borderSoft}`, borderRadius: 10, marginBottom: 14, display: "flex", flexWrap: "wrap", gap: 12 }}>
        {checks.map(c => (
          <div key={c.key} style={{ fontSize: 11.5, color: sc[c.key] ? T.brand : T.muted2, display: "flex", alignItems: "center", gap: 4 }}>
            {sc[c.key] ? "✓" : "○"} {c.label}
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <Btn variant="outline" onClick={onPrev}>← 换角度</Btn>
        <Btn onClick={onRewrite}>🔄 同角度再来一版</Btn>
        <div style={{ flex: 1 }} />
        <Btn onClick={copy} variant={copied ? "soft" : "default"}>{copied ? "✓ 已复制" : "📋 复制文案"}</Btn>
        <Btn variant="primary" onClick={onReset}>再来一条录音</Btn>
      </div>
    </div>
  );
}

Object.assign(window, { PageVoicerewrite });
