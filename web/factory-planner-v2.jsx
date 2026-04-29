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
  const [taskId, setTaskId] = useTaskPersist("planner");  // D-037b5
  const [skillInfo, setSkillInfo] = React.useState(null);
  React.useEffect(() => { api.get("/api/planner/skill-info").then(setSkillInfo).catch(() => {}); }, []);

  // D-082b 完整版: 跳页 retry 自动预填
  React.useEffect(() => {
    try {
      const retry = sessionStorage.getItem("retry_payload_planner");
      if (retry) {
        const p = JSON.parse(retry);
        const recovered = p.brief_preview || p.brief || p.prompt_preview || p.text;
        if (recovered && !brief) { setBrief(recovered); }
        sessionStorage.removeItem("retry_payload_planner");
      }
    } catch (_) {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // D-037b5 轮询 write_plan 任务
  const poller = useTaskPoller(taskId, {
    onComplete: (r) => { setPlanResult(r); setTaskId(null); },
    onError: (e) => { setErr(e || "策划失败"); /* 留 taskId 让 FailedRetry 渲染 */ },
  });

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
  async function pickLevel(level) {
    setPickedLevel(level);
    setStep("plan"); setErr(""); setPlanResult(null); setTaskId(null);
    try {
      const r = await api.post("/api/planner/write", {
        brief: brief.trim(), detected: analysis?.detected || {}, level,
      });
      setTaskId(r.task_id);  // 后端立即返 task_id, useTaskPoller 接着轮
    } catch (e) { setErr(e.message); setStep("levels"); }
  }
  function retry() {
    if (!pickedLevel) { setStep("levels"); return; }
    setErr(""); setPlanResult(null); setTaskId(null);
    pickLevel(pickedLevel);
  }
  function reset() {
    setStep("input"); setErr(""); setBrief(""); setAnalysis(null);
    setPickedLevel(null); setPlanResult(null); setTaskId(null);
    clearWorkflow("planner");
  }

  const wfState = { step, brief, analysis, pickedLevel, planResult, taskId };
  const wfRestore = (s) => {
    if (s.brief != null) setBrief(s.brief);
    if (s.analysis) setAnalysis(s.analysis);
    if (s.pickedLevel) setPickedLevel(s.pickedLevel);
    if (s.planResult) setPlanResult(s.planResult);
    if (s.taskId) setTaskId(s.taskId);
    if (s.step) setStep(s.step);
  };
  const wf = useWorkflowPersist({ ns: "planner", state: wfState, onRestore: wfRestore });
  const showInlineError = err && !(step === "plan" && (poller.isFailed || poller.isCancelled));

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", background: T.bg, position: "relative", overflow: "hidden" }}>
      <StepHeader icon="🗓️" title="内容策划 · 3 步"
        steps={PLANNER_STEPS} currentStep={step}
        skillInfo={null} onBack={() => onNav("home")} />
      <div style={{ flex: 1, overflow: "auto" }}>
        <WfRestoreBanner show={wf.hasSnapshot} onDismiss={wf.dismissSnapshot}
          onClear={() => { reset(); wf.dismissSnapshot(); }}
          label="内容策划工作流" />
        {/* D-086: 走全站 InlineError；任务失败时只保留 FailedRetry 友好卡片。 */}
        {showInlineError && <InlineError err={err} />}
        {step === "input"  && <PStepInput brief={brief} setBrief={setBrief} onGo={doAnalyze} loading={loading} />}
        {step === "levels" && <PStepLevels analysis={analysis} loading={loading} onPick={pickLevel} onPrev={() => setStep("input")} onRegen={doAnalyze} />}
        {step === "plan"   && (
          poller.isRunning ? (
            <LoadingProgress
              task={poller.task}
              icon="🗓️"
              title="小华正在写策划..."
              subtitle={`${pickedLevel?.label || pickedLevel?.name || ""} · ${brief.length} 字`}
              onCancel={() => { poller.cancel(); setStep("levels"); }}
            />
          ) : poller.isFailed || poller.isCancelled ? (
            <FailedRetry
              error={poller.error || err}
              onRetry={retry}
              onEdit={() => { setTaskId(null); setErr(""); setStep("levels"); }}
              icon="🗓️"
              title={poller.isCancelled ? "任务已取消" : "策划没跑成功"}
            />
          ) : (
            <PStepPlan plan={planResult} level={pickedLevel} loading={false} onPrev={() => setStep("levels")} onReset={reset} onNav={onNav} brief={brief} />
          )
        )}
      </div>
    </div>
  );
}

function PStepInput({ brief, setBrief, onGo, loading }) {
  const ready = !!brief.trim() && !loading;
  return (
    <div style={{ padding: "32px 40px 80px", maxWidth: 820, margin: "0 auto" }}>
      {/* A7-todo3 hero polish (与其他 skill 一致 30px) */}
      <div style={{ textAlign: "center", margin: "8px 0 24px" }}>
        <div style={{ fontSize: 30, fontWeight: 700, color: T.text, letterSpacing: "-0.02em", marginBottom: 8 }}>
          明天/下周/下月有什么活动? 🗓️
        </div>
        <div style={{ fontSize: 14, color: T.muted, lineHeight: 1.6 }}>
          一句话讲活动 · 小华规划怎么把内容产出做到最大化
        </div>
      </div>
      <div style={{ background: "#fff", border: `1.5px solid ${T.brand}`, boxShadow: `0 0 0 5px ${T.brandSoft}`, borderRadius: 16, padding: 18 }}>
        <textarea rows={6} value={brief} onChange={e => setBrief(e.target.value)}
          placeholder="例: 下周三在武汉给 200 个实体老板讲一天 AI 内容获客, 有 1 个编导助理"
          style={{ width: "100%", padding: 12, border: "none", outline: "none", background: "transparent", fontSize: 14, fontFamily: "inherit", resize: "vertical", lineHeight: 1.7, color: T.text, minHeight: 140 }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12, paddingTop: 14, borderTop: `1px solid ${T.borderSoft}` }}>
          {brief.trim() ? (
            <Tag size="xs" color="gray">{brief.trim().length} 字</Tag>
          ) : (
            <span style={{ fontSize: 12, color: T.muted2 }}>✨ 缺什么细节小华自己推断, 末尾你看了再改</span>
          )}
          <div style={{ flex: 1 }} />
          <button onClick={onGo} disabled={!ready} style={{
            padding: "10px 22px", fontSize: 14, fontWeight: 600,
            background: ready ? T.brand : T.muted3, color: "#fff",
            border: "none", borderRadius: 100, cursor: ready ? "pointer" : "not-allowed", fontFamily: "inherit",
          }}>{loading ? "推断中..." : "🚀 出三档目标 →"}</button>
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

function PStepPlan({ plan, level, loading, onPrev, onReset, onNav, brief }) {
  if (loading || !plan) return <Spinning icon="📋" phases={[
    { text: "拉 6 模块结构", sub: "前/中/后 + 团队 + 清单 + 知识沉淀" },
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
          <div style={{ fontSize: 12, color: T.muted }}>6 个模块,实际执行可分发给团队</div>
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
        <Btn onClick={onReset}>再策划一个活动</Btn>
      </div>

      {/* C9: 完成态加 "从策划摘段做视频" CTA (策划完直接出预热视频) */}
      {onNav && (p.summary || p.before_event) && (
        <div style={{
          marginTop: 16, padding: 16,
          background: "linear-gradient(135deg, #f6fbf7, #fff)",
          border: `1.5px solid ${T.brand}`, boxShadow: `0 0 0 4px ${T.brandSoft}`,
          borderRadius: 12, display: "flex", alignItems: "center", gap: 14,
        }}>
          <div style={{ fontSize: 26 }}>✨</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: T.text }}>下一步: 把策划摘成预热视频?</div>
            <div style={{ fontSize: 12, color: T.muted, marginTop: 3 }}>
              一键带活动概要 + 内容计划 → 做视频 Step 1, 选改写 / 直接做
            </div>
          </div>
          <Btn variant="primary" onClick={() => {
            // seed: summary + after_event 第一段 (内容生产计划)
            let seed = "";
            if (p.summary) seed += p.summary + "\n\n";
            const afterEvent = p.after_event || {};
            const afterEntries = Object.entries(afterEvent).filter(([k]) => k !== "title").slice(0, 2);
            if (afterEntries.length) {
              seed += `# 活动后的内容计划\n`;
              afterEntries.forEach(([k, v]) => {
                if (typeof v === "string") seed += `${k}: ${v}\n`;
                else if (Array.isArray(v)) seed += `${k}: ${v.slice(0, 3).join(" / ")}\n`;
              });
            }
            try {
              localStorage.setItem("make_v2_seed_script", seed.trim() || (brief || ""));
              localStorage.setItem("make_v2_seed_from", JSON.stringify({
                skill: "planner",
                title: `策划: ${(brief || "").slice(0, 24)}`,
                ts: Date.now(),
              }));
            } catch (_) {}
            onNav("make");
          }}>🎬 做成预热视频 →</Btn>
        </div>
      )}
    </div>
  );
}

function PlanSection({ icon, data, sectionKey }) {
  // D-037 主次反转 (2026-04-26): 每模块加 "📋 复制本模块" 按钮, 让用户分模块拷贝
  const [copied, setCopied] = React.useState(false);
  function copySection() {
    const lines = [`## ${data.title || sectionKey}`, ""];
    for (const [k, v] of Object.entries(data)) {
      if (k === "title") continue;
      lines.push(`### ${k}`);
      lines.push(planFieldToText(v));
      lines.push("");
    }
    try { navigator.clipboard.writeText(lines.join("\n").trim()); } catch (_) {}
    setCopied(true); setTimeout(() => setCopied(false), 1500);
  }
  return (
    <div style={{ padding: 16, background: "#fff", border: `1px solid ${T.borderSoft}`, borderRadius: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 18 }}>{icon}</span>
        <div style={{ fontSize: 15, fontWeight: 600, color: T.text, flex: 1 }}>{data.title || sectionKey}</div>
        <button onClick={copySection} style={{
          padding: "4px 10px", fontSize: 11.5,
          background: copied ? T.brandSoft : "#fff",
          border: `1px solid ${copied ? T.brand : T.border}`,
          color: copied ? T.brand : T.muted,
          borderRadius: 6, cursor: "pointer", fontFamily: "inherit", fontWeight: 500,
        }}>{copied ? "✓ 已复制" : "📋 复制本模块"}</button>
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

// 把 plan field 转成纯文本 (复制用)
function planFieldToText(value, depth = 0) {
  const ind = "  ".repeat(depth);
  if (typeof value === "string") return ind + value;
  if (Array.isArray(value)) return value.map(v => `${ind}- ${typeof v === "string" ? v : planFieldToText(v, depth + 1).trimStart()}`).join("\n");
  if (value && typeof value === "object") {
    return Object.entries(value).map(([k, v]) => `${ind}${k}: ${typeof v === "string" ? v : "\n" + planFieldToText(v, depth + 1)}`).join("\n");
  }
  return ind + String(value ?? "");
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
