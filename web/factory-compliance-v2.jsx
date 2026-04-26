// factory-compliance-v2.jsx — 违禁违规审查 skill (D-026 · 单 step)
// Skill 源: ~/Desktop/skills/违禁违规审查-学员版/
// 2 步: 输入文案 + 行业 → 异步任务 → 报告 + 2 版改写
// D-037b3: 异步化, /api/compliance/check 立即返 task_id, useTaskPoller 轮询真进度.

const COMPLIANCE_STEPS = [
  { id: "input",   n: 1, label: "输入文案" },
  { id: "result",  n: 2, label: "报告+2 版改写" },
];

const COMPLIANCE_INDUSTRIES = [
  { id: "通用", label: "通用(无行业)", hint: "只走通用词库 8 类" },
  { id: "大健康", label: "大健康/医疗", hint: "+ 医疗功效词" },
  { id: "美业",   label: "美容/美业",   hint: "+ 化妆品虚假宣传" },
  { id: "教育",   label: "教育/培训",   hint: "+ 教育承诺" },
  { id: "金融",   label: "金融/知识付费", hint: "+ 收益承诺" },
  { id: "医美",   label: "医美/整形",   hint: "+ 医美超高危 §1+§2+§5" },
];

function PageCompliance({ onNav }) {
  const [step, setStep] = React.useState("input");
  const [err, setErr] = React.useState("");
  const [text, setText] = React.useState("");
  const [industry, setIndustry] = React.useState("通用");
  const [result, setResult] = React.useState(null);
  const [skillInfo, setSkillInfo] = React.useState(null);
  const [taskId, setTaskId] = useTaskPersist("compliance");
  React.useEffect(() => { api.get("/api/compliance/skill-info").then(setSkillInfo).catch(() => {}); }, []);

  // D-037b3 轮询任务状态. 完成回写 result + 清 taskId; 失败/取消保留 taskId 让 FailedRetry 显示.
  const poller = useTaskPoller(taskId, {
    onComplete: (r) => { setResult(r); setStep("result"); setTaskId(null); },
    onError: (e) => { setErr(e || "任务失败"); setStep("result"); /* 留 taskId 让 FailedRetry 渲染 */ },
  });

  async function check() {
    if (!text.trim()) return;
    setErr("");
    setResult(null);
    try {
      const r = await api.post("/api/compliance/check", { text: text.trim(), industry });
      // 后端立即返 { task_id, status, estimated_seconds, page_id }
      setTaskId(r.task_id);
      setStep("result");
    } catch (e) {
      setErr(e.message || "提交失败");
    }
  }

  function reset() {
    setStep("input"); setErr(""); setText(""); setResult(null); setTaskId(null);
    clearWorkflow("compliance");
  }

  function retry() {
    setErr(""); setResult(null); setTaskId(null);
    check();  // 重新提交
  }

  // D-016 wf state. 把 taskId 也存上, 切走再回来能续轮询.
  // 老格式 wfState (没 taskId 但有 result) 仍兼容: wfRestore 直接还原 result.
  const wfState = { step, text, industry, result, taskId };
  const wfRestore = (s) => {
    if (s.text != null) setText(s.text);
    if (s.industry) setIndustry(s.industry);
    if (s.result) setResult(s.result);
    if (s.taskId) setTaskId(s.taskId);
    if (s.step) setStep(s.step);
  };
  const wf = useWorkflowPersist({ ns: "compliance", state: wfState, onRestore: wfRestore });

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", background: T.bg, position: "relative", overflow: "hidden" }}>
      <StepHeader icon="🛡️" title="违规审查 · 2 步"
        steps={COMPLIANCE_STEPS} currentStep={step}
        skillInfo={skillInfo} onBack={() => onNav("home")} />
      <div style={{ flex: 1, overflow: "auto" }}>
        <WfRestoreBanner show={wf.hasSnapshot} onDismiss={wf.dismissSnapshot}
          onClear={() => { reset(); wf.dismissSnapshot(); }}
          label="违规审查工作流" />
        {err && step === "input" && (
          <div style={{ maxWidth: 820, margin: "16px auto 0", padding: 12, background: T.redSoft, color: T.red, borderRadius: 10, fontSize: 13 }}>
            ⚠️ {err}
          </div>
        )}
        {step === "input"  && <CStepInput text={text} setText={setText} industry={industry} setIndustry={setIndustry} onGo={check} loading={false} />}
        {step === "result" && (
          poller.isRunning ? (
            <LoadingProgress
              task={poller.task}
              icon="🛡️"
              title="小华正在审查违规..."
              subtitle={`${industry} · ${text.length} 字 · 通用 + 敏感词库双层扫`}
              onCancel={() => { poller.cancel(); setStep("input"); }}
            />
          ) : poller.isFailed || poller.isCancelled ? (
            <FailedRetry
              error={poller.error || err}
              onRetry={retry}
              onEdit={() => { setTaskId(null); setErr(""); setStep("input"); }}
              icon="🛡️"
              title={poller.isCancelled ? "任务已取消" : "这次没跑成功"}
            />
          ) : (
            <CStepResult result={result} onPrev={() => setStep("input")} onReset={reset} />
          )
        )}
      </div>
    </div>
  );
}

function CStepInput({ text, setText, industry, setIndustry, onGo, loading }) {
  const ready = !!text.trim() && !loading;
  return (
    <div style={{ padding: "40px 40px 60px", maxWidth: 820, margin: "0 auto" }}>
      <div style={{ textAlign: "center", marginBottom: 24 }}>
        <div style={{ fontSize: 28, fontWeight: 700, color: T.text, marginBottom: 8 }}>什么文案要查违规? 🛡️</div>
        <div style={{ fontSize: 14, color: T.muted }}>两层审核(通用 + 敏感行业) · **必出** 2 版改写(保守 + 营销)</div>
      </div>

      <div style={{ background: "#fff", border: `1.5px solid ${T.brand}`, boxShadow: `0 0 0 5px ${T.brandSoft}`, borderRadius: 16, padding: 18, marginBottom: 14 }}>
        <textarea rows={9} value={text} onChange={e => setText(e.target.value)}
          placeholder="贴文案进来(短视频口播 / 朋友圈 / 投流 / 直播话术都可)...&#10;&#10;会扫通用违禁词 + 行业敏感词,输出:&#10;1. 高/中/低危分级报告&#10;2. 保守版(100% 合规,牺牲营销)&#10;3. 营销版(高危必改,保留营销力)"
          style={{ width: "100%", border: "none", outline: "none", background: "transparent", fontSize: 14, fontFamily: "inherit", resize: "vertical", lineHeight: 1.7, color: T.text }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, paddingTop: 12, borderTop: `1px solid ${T.borderSoft}` }}>
          <div style={{ fontSize: 11.5, color: T.muted2 }}>🛡️ 文案长度 {text.length} 字</div>
          <div style={{ flex: 1 }} />
          <button onClick={onGo} disabled={!ready} style={{
            padding: "8px 20px", fontSize: 13, fontWeight: 600,
            background: ready ? T.brand : T.muted3, color: "#fff",
            border: "none", borderRadius: 100, cursor: ready ? "pointer" : "not-allowed", fontFamily: "inherit",
          }}>{loading ? "审查中..." : "开始审查 →"}</button>
        </div>
      </div>

      <div style={{ padding: 14, background: "#fff", border: `1px solid ${T.borderSoft}`, borderRadius: 10 }}>
        <div style={{ fontSize: 11.5, color: T.muted2, fontWeight: 600, letterSpacing: "0.08em", marginBottom: 10 }}>行业(决定是否加查敏感词库)</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {COMPLIANCE_INDUSTRIES.map(ind => (
            <div key={ind.id} title={ind.hint} onClick={() => setIndustry(ind.id)} style={{
              padding: "6px 12px", borderRadius: 100, fontSize: 12, cursor: "pointer",
              background: industry === ind.id ? T.brandSoft : T.bg2,
              color: industry === ind.id ? T.brand : T.muted,
              border: `1px solid ${industry === ind.id ? T.brand : T.borderSoft}`,
              fontWeight: industry === ind.id ? 600 : 500,
            }}>{ind.label}</div>
          ))}
        </div>
      </div>
    </div>
  );
}

function CStepResult({ result, onPrev, onReset }) {
  // D-037b3: loading 状态由外层 LoadingProgress 显示, 这里只负责渲染完成态.
  if (!result) return null;

  const stats = result.stats || {};
  const violations = result.violations || [];
  const hasAny = (stats.total || 0) > 0;
  const [tab, setTab] = React.useState("A");
  const version = tab === "A" ? (result.version_a || {}) : (result.version_b || {});
  const [copied, setCopied] = React.useState(false);
  function copy() {
    navigator.clipboard?.writeText(version.content || "");
    setCopied(true); setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div style={{ padding: "32px 40px 120px", maxWidth: 1180, margin: "0 auto" }}>
      <div style={{ marginBottom: 16, display: "flex", alignItems: "flex-start", gap: 16 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>
            {hasAny ? "🛡️ 审查完成 · 发现违规" : "✅ 审查完成 · 无违规"}
          </div>
          <div style={{ fontSize: 12, color: T.muted }}>
            扫描范围: {result.scan_scope || "通用审查"} · {result.tokens?.total || "?"} tokens
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <StatBadge color={T.red}   count={stats.high || 0}   label="高危" />
          <StatBadge color={T.amber} count={stats.medium || 0} label="中危" />
          <StatBadge color={T.brand} count={stats.low || 0}    label="低危" />
        </div>
      </div>

      {result.summary && (
        <div style={{ padding: 14, background: hasAny ? T.redSoft : T.brandSoft, border: `1px solid ${hasAny ? T.red + "44" : T.brand + "44"}`, borderRadius: 10, marginBottom: 14, fontSize: 13.5, color: hasAny ? T.red : T.brand, fontWeight: 500, lineHeight: 1.7 }}>
          💬 {result.summary}
        </div>
      )}

      {violations.length > 0 && (
        <div style={{ background: "#fff", border: `1px solid ${T.borderSoft}`, borderRadius: 12, padding: 18, marginBottom: 14 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: T.text, marginBottom: 12 }}>📋 违规清单</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {violations.map((v, i) => <ViolationRow key={i} v={v} />)}
          </div>
        </div>
      )}

      {/* 2 版改写 Tab */}
      <div style={{ background: "#fff", border: `1px solid ${T.borderSoft}`, borderRadius: 12, padding: 18, marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, borderBottom: `1px solid ${T.bg3}`, paddingBottom: 10 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: T.text, flex: 1 }}>✍️ 2 版改写</div>
          <div style={{ display: "flex", gap: 2, background: T.bg2, padding: 3, borderRadius: 100 }}>
            {["A", "B"].map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                padding: "5px 14px", fontSize: 12, borderRadius: 100, border: "none", cursor: "pointer", fontFamily: "inherit",
                background: tab === t ? "#fff" : "transparent",
                color: tab === t ? T.text : T.muted,
                fontWeight: tab === t ? 600 : 500,
              }}>
                {t === "A" ? "保守版 · 100% 合规" : "营销版 · 保留吸引力"}
              </button>
            ))}
          </div>
          <Btn size="sm" variant={copied ? "soft" : "outline"} onClick={copy}>{copied ? "✓ 已复制" : "📋 复制版本 " + tab}</Btn>
        </div>

        <div style={{ fontSize: 11.5, color: T.muted, marginBottom: 10 }}>
          合规度 {version.compliance || 0}% · {version.word_count || (version.content || "").length} 字 · {version.description || ""}
        </div>
        {version.kept_marketing?.length > 0 && (
          <div style={{ fontSize: 11.5, color: T.brand, background: T.brandSoft, padding: "6px 10px", borderRadius: 6, marginBottom: 10 }}>
            ✨ 保留的营销点: {version.kept_marketing.join(" · ")}
          </div>
        )}
        <textarea value={version.content || ""} readOnly
          style={{ width: "100%", border: "none", outline: "none", background: T.bg2, borderRadius: 6, padding: 14, fontSize: 14, fontFamily: "inherit", resize: "vertical", lineHeight: 1.9, color: T.text, minHeight: 280 }} />
      </div>

      <div style={{ display: "flex", gap: 10 }}>
        <Btn variant="outline" onClick={onPrev}>← 改输入</Btn>
        <div style={{ flex: 1 }} />
        <Btn variant="primary" onClick={onReset}>再查一段</Btn>
      </div>
    </div>
  );
}

function StatBadge({ color, count, label }) {
  return (
    <div style={{
      padding: "6px 12px", borderRadius: 10,
      background: count > 0 ? color + "22" : T.bg2,
      border: `1px solid ${count > 0 ? color + "66" : T.borderSoft}`,
      minWidth: 64, textAlign: "center",
    }}>
      <div style={{ fontSize: 18, fontWeight: 700, color: count > 0 ? color : T.muted2, fontFamily: "SF Mono, monospace" }}>{count}</div>
      <div style={{ fontSize: 10.5, color: count > 0 ? color : T.muted2, marginTop: 2 }}>{label}</div>
    </div>
  );
}

function ViolationRow({ v }) {
  const colors = { high: T.red, medium: T.amber, low: T.brand };
  const labels = { high: "🔴 高危", medium: "🟡 中危", low: "🟢 低危" };
  const col = colors[v.level] || T.muted;
  return (
    <div style={{ padding: 12, background: col + "11", borderLeft: `3px solid ${col}`, borderRadius: 6 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, fontSize: 11.5 }}>
        <span style={{ fontWeight: 600, color: col }}>{labels[v.level] || v.level}</span>
        {v.type && <span style={{ color: T.muted2, background: "#fff", padding: "2px 8px", borderRadius: 100 }}>{v.type}</span>}
      </div>
      <div style={{ fontSize: 13, color: T.text, lineHeight: 1.7 }}>
        <b>原文:</b> <span style={{ color: col }}>{v.original}</span>
      </div>
      {v.reason && <div style={{ fontSize: 12, color: T.muted, marginTop: 4, lineHeight: 1.6 }}>💡 {v.reason}</div>}
      {v.fix && <div style={{ fontSize: 12.5, color: T.brand, marginTop: 4, lineHeight: 1.6 }}>→ 建议: <b>{v.fix}</b></div>}
    </div>
  );
}

Object.assign(window, { PageCompliance });
