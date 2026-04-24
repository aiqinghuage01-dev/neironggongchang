// factory-planner-v2.jsx — content-planner skill (D-022)
// Skill 源: ~/Desktop/skills/content-planner/
// 3 步: 活动描述 → 三档目标(保底/标准/最大化) → 6 模块完整策划

const PLANNER_STEPS = [
  { id: "input",   n: 1, label: "活动描述" },
  { id: "levels",  n: 2, label: "选三档目标" },
  { id: "plan",    n: 3, label: "完整策划" },
];

function PagePlanner({ onNav }) {
  const [step, setStep] = React.useState("input");
  const [loading, setLoading] = React.useState(false);
  const [err, setErr] = React.useState("");
  const [brief, setBrief] = React.useState("");
  const [analysis, setAnalysis] = React.useState(null);
  const [pickedLevel, setPickedLevel] = React.useState(null);
  const [planResult, setPlanResult] = React.useState(null);
  const [skillInfo, setSkillInfo] = React.useState(null);
  React.useEffect(() => { api.get("/api/planner/skill-info").then(setSkillInfo).catch(() => {}); }, []);

  async function runStep({ nextStep, rollbackStep, clearSetter, apiCall }) {
    if (clearSetter) clearSetter(null);
    setStep(nextStep);
    setLoading(true); setErr("");
    try { await apiCall(); }
    catch (e) { setErr(e.message); if (rollbackStep) setStep(rollbackStep); }
    finally { setLoading(false); }
  }

  function doAnalyze() {
    if (!brief.trim()) return;
    return runStep({
      nextStep: "levels", rollbackStep: "input", clearSetter: setAnalysis,
      apiCall: async () => {
        const r = await api.post("/api/planner/analyze", { brief: brief.trim() });
        setAnalysis(r);
      },
    });
  }
  function pickLevel(level) {
    setPickedLevel(level);
    return runStep({
      nextStep: "plan", rollbackStep: "levels", clearSetter: setPlanResult,
      apiCall: async () => {
        const r = await api.post("/api/planner/write", {
          brief: brief.trim(), detected: analysis?.detected || {}, level,
        });
        setPlanResult(r);
      },
    });
  }
  function reset() {
    setStep("input"); setErr(""); setBrief(""); setAnalysis(null);
    setPickedLevel(null); setPlanResult(null);
    clearWorkflow("planner");
  }

  const wfState = { step, brief, analysis, pickedLevel, planResult };
  const wfRestore = (s) => {
    if (s.step) setStep(s.step);
    if (s.brief != null) setBrief(s.brief);
    if (s.analysis) setAnalysis(s.analysis);
    if (s.pickedLevel) setPickedLevel(s.pickedLevel);
    if (s.planResult) setPlanResult(s.planResult);
  };
  const wf = useWorkflowPersist({ ns: "planner", state: wfState, onRestore: wfRestore });

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", background: T.bg, position: "relative", overflow: "hidden" }}>
      <StepHeader icon="🗓️" title="内容策划 · 3 步"
        steps={PLANNER_STEPS} currentStep={step}
        skillInfo={skillInfo} onBack={() => onNav("home")} />
      <div style={{ flex: 1, overflow: "auto" }}>
        <WfRestoreBanner show={wf.hasSnapshot} onDismiss={wf.dismissSnapshot}
          onClear={() => { reset(); wf.dismissSnapshot(); }}
          label="内容策划工作流" />
        {err && (
          <div style={{ maxWidth: 820, margin: "16px auto 0", padding: 12, background: T.redSoft, color: T.red, borderRadius: 10, fontSize: 13 }}>
            ⚠️ {err}
          </div>
        )}
        {step === "input"  && <PStepInput brief={brief} setBrief={setBrief} onGo={doAnalyze} loading={loading} />}
        {step === "levels" && <PStepLevels analysis={analysis} loading={loading} onPick={pickLevel} onPrev={() => setStep("input")} onRegen={doAnalyze} />}
        {step === "plan"   && <PStepPlan plan={planResult} level={pickedLevel} loading={loading} onPrev={() => setStep("levels")} onReset={reset} />}
      </div>
    </div>
  );
}

function PStepInput({ brief, setBrief, onGo, loading }) {
  const ready = !!brief.trim() && !loading;
  return (
    <div style={{ padding: "40px 40px 60px", maxWidth: 820, margin: "0 auto" }}>
      <div style={{ textAlign: "center", marginBottom: 24 }}>
        <div style={{ fontSize: 28, fontWeight: 700, color: T.text, marginBottom: 8 }}>明天/下周/下月有什么活动? 🗓️</div>
        <div style={{ fontSize: 14, color: T.muted }}>讲课 · 出差 · 直播 · 分享 · 拜访 · 展会 · 一句话说清,小华规划怎么把内容产出做到最大化</div>
      </div>
      <div style={{ background: "#fff", border: `1.5px solid ${T.brand}`, boxShadow: `0 0 0 5px ${T.brandSoft}`, borderRadius: 16, padding: 18 }}>
        <textarea rows={6} value={brief} onChange={e => setBrief(e.target.value)}
          placeholder="例:&#10;下周三在武汉给 200 个实体老板讲一天 AI 内容获客,有 1 个编导助理&#10;&#10;或简化:&#10;下周给老板讲课"
          style={{ width: "100%", border: "none", outline: "none", background: "transparent", fontSize: 14, fontFamily: "inherit", resize: "vertical", lineHeight: 1.7, color: T.text }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, paddingTop: 12, borderTop: `1px solid ${T.borderSoft}` }}>
          <div style={{ fontSize: 11.5, color: T.muted2 }}>🗓️ 缺什么细节小华自己推断 · 末尾会列推断结果让你纠正</div>
          <div style={{ flex: 1 }} />
          <button onClick={onGo} disabled={!ready} style={{
            padding: "8px 20px", fontSize: 13, fontWeight: 600,
            background: ready ? T.brand : T.muted3, color: "#fff",
            border: "none", borderRadius: 100, cursor: ready ? "pointer" : "not-allowed", fontFamily: "inherit",
          }}>{loading ? "推断中..." : "出三档目标 →"}</button>
        </div>
      </div>
    </div>
  );
}

function PStepLevels({ analysis, loading, onPick, onPrev, onRegen }) {
  if (loading || !analysis) return <Spinning icon="📊" phases={[
    { text: "推断活动场景", sub: "活动类型 / 天数 / 人数 / 助理" },
    { text: "套用四层漏斗放大模型", sub: "原始 → 批量 → 改写 → 矩阵" },
    { text: "算出三档目标", sub: "保底 / 标准 / 最大化" },
  ]} />;
  const d = analysis.detected || {};
  const levels = analysis.levels || [];
  const [hoverIdx, setHoverIdx] = React.useState(-1);
  return (
    <div style={{ padding: "32px 40px 120px", maxWidth: 1080, margin: "0 auto" }}>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>挑一个产出目标 📊</div>
        <div style={{ fontSize: 13, color: T.muted }}>选完后小华出 6 模块完整执行方案。</div>
      </div>

      <div style={{ padding: 14, background: T.bg2, border: `1px solid ${T.borderSoft}`, borderRadius: 10, marginBottom: 14, fontSize: 12.5, color: T.muted, lineHeight: 1.8 }}>
        <div style={{ fontWeight: 600, color: T.text, marginBottom: 6 }}>📋 推断的活动信息(不对就回去改 brief)</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8 }}>
          {Object.entries(d).filter(([k]) => k !== "推断说明").map(([k, v]) => (
            <div key={k}>· <b style={{ color: T.text }}>{k}</b>: {String(v)}</div>
          ))}
        </div>
        {d.推断说明 && <div style={{ marginTop: 8, color: T.muted2, fontSize: 11.5 }}>💡 {d.推断说明}</div>}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
        {levels.map((lv, i) => {
          const hover = hoverIdx === i;
          const colors = [T.brand, T.amber, T.pink];
          const col = colors[i % 3];
          return (
            <div key={i}
              onClick={() => onPick(lv)}
              onMouseEnter={() => setHoverIdx(i)}
              onMouseLeave={() => setHoverIdx(-1)}
              style={{
                padding: 18, background: "#fff",
                border: `1px solid ${hover ? col : T.borderSoft}`,
                boxShadow: hover ? `0 0 0 4px ${col}22` : "none",
                borderRadius: 12, cursor: "pointer",
                transition: "all 0.15s",
              }}>
              <div style={{ fontSize: 11.5, color: col, fontWeight: 600, letterSpacing: "0.08em", marginBottom: 8 }}>{lv.name}</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: T.text, marginBottom: 6, fontFamily: "SF Mono, monospace" }}>{lv.total}<span style={{ fontSize: 12, color: T.muted2, fontWeight: 400, marginLeft: 4 }}>条</span></div>
              <div style={{ fontSize: 12, color: T.muted, marginBottom: 10, minHeight: 36, lineHeight: 1.6 }}>{lv.desc}</div>
              <div style={{ fontSize: 11, color: T.muted2, lineHeight: 1.7 }}>
                {(lv.breakdown || []).slice(0, 6).map((x, j) => <div key={j}>· {x}</div>)}
              </div>
            </div>
          );
        })}
      </div>

      {analysis.key_questions?.length > 0 && (
        <div style={{ marginTop: 14, padding: 10, background: T.amberSoft, border: `1px solid ${T.amber}33`, borderRadius: 8, fontSize: 12, color: T.amber }}>
          💬 {analysis.key_questions.join(" · ")}
        </div>
      )}

      <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
        <Btn variant="outline" onClick={onPrev}>← 改活动描述</Btn>
        <Btn onClick={onRegen}>🔄 重新预估</Btn>
      </div>
    </div>
  );
}

function PStepPlan({ plan, level, loading, onPrev, onReset }) {
  if (loading || !plan) return <Spinning icon="📋" phases={[
    { text: "拉 SKILL.md 6 模块结构", sub: "前/中/后 + 团队 + 清单 + 知识沉淀" },
    { text: "活动前: 设备 + 人员 + 前置素材", sub: "" },
    { text: "活动中: 时间线 + 稀缺素材抓拍", sub: "" },
    { text: "活动后: 内容生产计划 + 节奏", sub: "" },
    { text: "团队角色 + 设备配置", sub: "最低/进阶两档" },
    { text: "执行清单 · 知识库回流", sub: "" },
  ]} />;

  const p = plan.plan || {};
  const [copied, setCopied] = React.useState(false);
  function copyAll() {
    navigator.clipboard?.writeText(JSON.stringify(p, null, 2));
    setCopied(true); setTimeout(() => setCopied(false), 1500);
  }

  const sections = [
    { key: "before_event", icon: "📦" },
    { key: "during_event", icon: "🎬" },
    { key: "after_event", icon: "📤" },
    { key: "team", icon: "👥" },
    { key: "checklist", icon: "✅" },
    { key: "knowledge_sink", icon: "🗄️" },
  ];

  return (
    <div style={{ padding: "32px 40px 120px", maxWidth: 1180, margin: "0 auto" }}>
      <div style={{ marginBottom: 16, display: "flex", alignItems: "flex-start", gap: 16 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>策划方案 · {level?.name} 档 ({level?.total} 条)</div>
          <div style={{ fontSize: 12, color: T.muted }}>{plan.tokens?.total || "?"} tokens · 6 个模块,实际执行可分发给团队</div>
        </div>
        <Btn onClick={copyAll} variant={copied ? "soft" : "outline"}>{copied ? "✓ 已复制 JSON" : "📋 复制全部 JSON"}</Btn>
      </div>

      {p.summary && (
        <div style={{ padding: 16, background: T.brandSoft, border: `1px solid ${T.brand}44`, borderRadius: 10, marginBottom: 14, fontSize: 14, color: T.brand, fontWeight: 500, lineHeight: 1.7 }}>
          💡 {p.summary}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {sections.map(s => p[s.key] && <PlanSection key={s.key} icon={s.icon} data={p[s.key]} sectionKey={s.key} />)}
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
        <Btn variant="outline" onClick={onPrev}>← 换档次</Btn>
        <div style={{ flex: 1 }} />
        <Btn variant="primary" onClick={onReset}>再策划一个活动</Btn>
      </div>
    </div>
  );
}

function PlanSection({ icon, data, sectionKey }) {
  return (
    <div style={{ padding: 16, background: "#fff", border: `1px solid ${T.borderSoft}`, borderRadius: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 18 }}>{icon}</span>
        <div style={{ fontSize: 15, fontWeight: 600, color: T.text }}>{data.title || sectionKey}</div>
      </div>
      <div style={{ fontSize: 13, color: T.muted, lineHeight: 1.8 }}>
        {Object.entries(data).filter(([k]) => k !== "title").map(([k, v]) => (
          <div key={k} style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11.5, color: T.muted2, fontWeight: 600, letterSpacing: "0.06em", marginBottom: 4 }}>{k}</div>
            <PlanFieldValue value={v} />
          </div>
        ))}
      </div>
    </div>
  );
}

function PlanFieldValue({ value }) {
  if (typeof value === "string") {
    return <div style={{ color: T.text, lineHeight: 1.7 }}>{value}</div>;
  }
  if (Array.isArray(value)) {
    return (
      <ul style={{ margin: 0, paddingLeft: 18 }}>
        {value.map((x, i) => (
          <li key={i} style={{ color: T.text, lineHeight: 1.8 }}>
            {typeof x === "object" ? <PlanObjectInline o={x} /> : x}
          </li>
        ))}
      </ul>
    );
  }
  if (typeof value === "object" && value !== null) {
    return <PlanObjectInline o={value} />;
  }
  return <div>{String(value)}</div>;
}

function PlanObjectInline({ o }) {
  return (
    <span>
      {Object.entries(o).map(([k, v]) => (
        <span key={k} style={{ marginRight: 12 }}>
          <b style={{ color: T.muted, fontWeight: 500 }}>{k}:</b>{" "}
          {Array.isArray(v) ? v.join(" · ") : (typeof v === "object" ? JSON.stringify(v) : String(v))}
        </span>
      ))}
    </span>
  );
}

Object.assign(window, { PagePlanner });
