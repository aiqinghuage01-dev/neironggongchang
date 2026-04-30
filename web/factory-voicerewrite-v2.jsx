// factory-voicerewrite-v2.jsx — 录音文案改写 skill (D-013)
// Skill 源: ~/Desktop/skills/录音文案改写/
// 3 步: 输入转写文本 → 看骨架+选 2 角度 → 看正文+改写说明+自检

const VOICE_STEPS = [
  { id: "input",    n: 1, label: "输入录音转写" },
  { id: "angles",   n: 2, label: "选角度" },
  { id: "write",    n: 3, label: "正文+改写说明" },
];

// C5: 改写模式 checkbox 卡 (与 hotrewrite ModeCheckCard 同款; 复制独立, 文件不依赖 hotrewrite)
function VModeCheckCard({ on, onClick, disabled, title, desc, recommend }) {
  return (
    <label onClick={onClick} style={{
      padding: "12px 14px", borderRadius: 8,
      cursor: disabled ? "not-allowed" : "pointer",
      background: on ? "#fff" : "transparent",
      border: `1.5px solid ${on ? T.brand : T.muted3}`,
      display: "flex", alignItems: "flex-start", gap: 10,
      opacity: disabled ? 0.85 : 1,
    }}>
      <div style={{
        width: 18, height: 18, borderRadius: 4,
        border: `1.5px solid ${on ? T.brand : T.muted2}`,
        background: on ? T.brand : "transparent", flexShrink: 0, marginTop: 1,
        display: "flex", alignItems: "center", justifyContent: "center",
        color: "#fff", fontSize: 12, fontWeight: 700,
      }}>{on && "✓"}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13.5, fontWeight: 600, color: T.text }}>{title}</span>
          {recommend && <Tag size="xs" color="green">推荐</Tag>}
          <Tag size="xs" color="brand">+2 篇</Tag>
        </div>
        <div style={{ fontSize: 11.5, color: T.muted, lineHeight: 1.5 }}>{desc}</div>
      </div>
    </label>
  );
}

function PageVoicerewrite({ onNav }) {
  const fm = useFromMake("voicerewrite");  // D-062x
  const [step, setStep] = React.useState("input");
  const [loading, setLoading] = React.useState(false);
  const [err, setErr] = React.useState("");

  const [transcript, setTranscript] = React.useState("");
  const [analyze, setAnalyze] = React.useState(null);
  const [pickedAngle, setPickedAngle] = React.useState(null);
  const [script, setScript] = React.useState(null);

  // C5: 改写模式 checkbox (默认 ☑ 业务) + 多版累积 (跟 hotrewrite C3-C4 同款)
  const [withBiz, setWithBiz] = React.useState(true);
  const [pureRewrite, setPureRewrite] = React.useState(false);
  const [versions, setVersions] = React.useState([]);
  const [activeVersionIdx, setActiveVersionIdx] = React.useState(0);
  const [appendingVersion, setAppendingVersion] = React.useState(false);

  const [skillInfo, setSkillInfo] = React.useState(null);
  React.useEffect(() => { api.get("/api/voicerewrite/skill-info").then(setSkillInfo).catch(() => {}); }, []);

  // D-082b 完整版: failed task "🔄 重新生成" 跳页 sessionStorage 预填
  React.useEffect(() => {
    try {
      const retry = sessionStorage.getItem("retry_payload_voicerewrite");
      if (retry) {
        const p = JSON.parse(retry);
        const recovered = p.transcript_preview || p.transcript || p.prompt_preview || p.text;
        if (recovered && !transcript) { setTranscript(recovered); }
        sessionStorage.removeItem("retry_payload_voicerewrite");
      }
    } catch (_) {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // D-037b5: write 异步任务. ref 存当前 task 的 angle/modeLabel 给 onComplete 用.
  const [taskId, setTaskId] = useTaskPersist("voicerewrite");
  const taskMetaRef = React.useRef({ angle: null, modeLabel: "" });
  const poller = useTaskPoller(taskId, {
    onComplete: (r) => {
      const meta = taskMetaRef.current;
      const v = { ...r, angle: meta.angle, mode_label: meta.modeLabel, ts: Date.now() };
      setVersions((vs) => {
        const next = [...vs, v];
        setActiveVersionIdx(next.length - 1);
        return next;
      });
      setScript(v);
      setTaskId(null);
    },
    onError: (e) => { setErr(e || "改写失败"); },
  });

  // D-062mm: 检测 make 那边丢过来的 voicerewrite_seed_transcript, 自动填 textarea
  // ⚠ 关键: 必须同步删 wf snap, 避免 D-016 useWorkflowPersist 的 restore effect
  // (注册顺序在我们后面, mount 时跑得晚) 把 transcript 覆盖回老的空值
  React.useEffect(() => {
    try {
      const seed = localStorage.getItem("voicerewrite_seed_transcript");
      if (seed && !transcript) {
        setTranscript(seed);
        localStorage.removeItem("voicerewrite_seed_transcript");
        localStorage.removeItem("wf:voicerewrite");  // 防 wf restore 覆盖
      }
    } catch (_) {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
  // D-037b5: callWrite 异步, 返 task_id (不再返结果). 结果走 useTaskPoller onComplete.
  async function callWrite(angle, modeLabel) {
    taskMetaRef.current = { angle, modeLabel };
    const r = await api.post("/api/voicerewrite/write", {
      transcript: transcript.trim(),
      skeleton: analyze?.skeleton || {},
      angle,
      modes: { with_biz: withBiz, pure_rewrite: pureRewrite },
    });
    setTaskId(r.task_id);
  }
  async function pickAngle(angle) {
    setPickedAngle(angle);
    setVersions([]); setScript(null); setErr(""); setTaskId(null);
    setStep("write");
    try {
      const modeLabel = withBiz ? (pureRewrite ? "结合业务+纯改写" : "结合业务") : "纯改写";
      await callWrite(angle, modeLabel);
    } catch (e) { setErr(e.message); setStep("angles"); }
  }
  async function addAnotherVersion(sameAngle = true, newAngle = null) {
    const angle = sameAngle ? pickedAngle : newAngle;
    if (!angle) return;
    if (poller.isRunning) return;  // 防 race
    if (!sameAngle) setPickedAngle(newAngle);
    setErr("");
    try {
      const modeLabel = withBiz ? (pureRewrite ? "结合业务+纯改写" : "结合业务") : "纯改写";
      await callWrite(angle, modeLabel + (sameAngle ? " · 再来一版" : " · 换角度"));
    } catch (e) { setErr(e.message); }
  }
  function retry() {
    if (!pickedAngle) { setStep("angles"); return; }
    setErr(""); setTaskId(null);
    pickAngle(pickedAngle);
  }
  function switchVersion(idx) {
    setActiveVersionIdx(idx);
    setScript(versions[idx]);
  }
  function reset() {
    setStep("input"); setErr("");
    setTranscript(""); setAnalyze(null);
    setPickedAngle(null); setScript(null);
    setVersions([]); setActiveVersionIdx(0); setTaskId(null);
    clearWorkflow("voicerewrite");
  }

  // 工作流持久化 (D-016 + D-037b5 加 taskId/versions)
  const wfState = { step, transcript, analyze, pickedAngle, script, versions, activeVersionIdx, taskId };
  const wfRestore = (s) => {
    if (s.transcript != null) setTranscript(s.transcript);
    if (s.analyze) setAnalyze(s.analyze);
    if (s.pickedAngle) setPickedAngle(s.pickedAngle);
    if (s.script) setScript(s.script);
    if (Array.isArray(s.versions)) setVersions(s.versions);
    if (typeof s.activeVersionIdx === "number") setActiveVersionIdx(s.activeVersionIdx);
    if (s.taskId) setTaskId(s.taskId);
    if (s.step) setStep(s.step);
  };
  const wf = useWorkflowPersist({ ns: "voicerewrite", state: wfState, onRestore: wfRestore });
  const showInlineError = err && !(step === "write" && (poller.isFailed || poller.isCancelled) && versions.length === 0);

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", background: T.bg, position: "relative", overflow: "hidden" }}>
      <VoiceHeader current={step} onBack={() => onNav("home")} skillInfo={skillInfo} />
      <div style={{ flex: 1, overflow: "auto" }}>
        <div style={{ maxWidth: 820, margin: "16px auto 0" }}>
          <FromMakeBanner fromMake={fm.fromMake} dismiss={fm.dismiss}
            label="改写完点页底「做成视频」就回到做视频流程, 接着合成" />
        </div>
        <WfRestoreBanner show={wf.hasSnapshot} onDismiss={wf.dismissSnapshot}
          onClear={() => { reset(); wf.dismissSnapshot(); }}
          label="录音改写工作流" />
        {/* D-086: 走全站 InlineError；首版改写失败时只保留 FailedRetry 友好卡片。 */}
        {showInlineError && <InlineError err={err} />}
        {step === "input"  && <VStepInput transcript={transcript} setTranscript={setTranscript} onGo={doAnalyze} loading={loading} skillInfo={skillInfo} />}
        {step === "angles" && <VStepAngles analyze={analyze} loading={loading} onPick={pickAngle} onPrev={() => setStep("input")} onRegen={doAnalyze}
          withBiz={withBiz} setWithBiz={setWithBiz} pureRewrite={pureRewrite} setPureRewrite={setPureRewrite} />}
        {step === "write"  && (
          poller.isRunning && versions.length === 0 ? (
            <LoadingProgress
              task={poller.task}
              icon="🎙️"
              title="小华正在改写..."
              subtitle={`${pickedAngle?.label || pickedAngle?.angle_id || ""} · ${transcript.length} 字`}
              onCancel={() => { poller.cancel(); setStep("angles"); }}
            />
          ) : (poller.isFailed || poller.isCancelled) && versions.length === 0 ? (
            <FailedRetry
              error={poller.error || err}
              task={poller.task}
              onRetry={retry}
              onEdit={() => { setTaskId(null); setErr(""); setStep("angles"); }}
              icon="🎙️"
              title={poller.isCancelled ? "任务已取消" : "改写没跑成功"}
            />
          ) : (
            <VStepWrite script={script} angle={pickedAngle} loading={false} onPrev={() => setStep("angles")} onRewrite={() => pickAngle(pickedAngle)} onReset={reset} onNav={onNav}
              versions={versions} activeVersionIdx={activeVersionIdx} onSwitchVersion={switchVersion}
              allAngles={analyze?.angles || []}
              onAddSameAngle={() => addAnotherVersion(true)}
              onAddOtherAngle={(a) => addAnotherVersion(false, a)}
              appendingVersion={poller.isRunning}
            />
          )
        )}
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
          <span title="本页方法已加载"
            style={{ fontSize: 10.5, color: T.brand, background: T.brandSoft, padding: "2px 8px", borderRadius: 100, marginLeft: 6 }}>
            方法已加载
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
  // D-062bb: 短视频链接 → 自动转写 (走 /api/transcribe/submit, 轻抖)
  const [url, setUrl] = React.useState("");
  const [transcribing, setTranscribing] = React.useState(false);
  const [transcribeMsg, setTranscribeMsg] = React.useState("");
  async function transcribeUrl() {
    if (!url.trim() || transcribing) return;
    setTranscribing(true); setTranscribeMsg("");
    try {
      const sub = await api.post("/api/transcribe/submit", { url: url.trim() });
      const batchId = sub.batch_id;
      setTranscribeMsg(`已提交 (batch ${batchId}) · 等转写...`);
      for (let i = 0; i < 60; i++) {  // 5 min max (60 × 5s)
        await new Promise(s => setTimeout(s, 5000));
        try {
          const q = await api.get(`/api/transcribe/query/${batchId}`);
          // 后端返回 "succeed" (qingdou Status Literal), 不是 "success"
          const okStatus = ["succeed", "success", "done", "ok"].includes(q.status);
          if (okStatus && q.text) {
            setTranscript(q.text);
            setUrl("");
            setTranscribeMsg(`✓ ${q.title || "转写完成"} · ${q.text.length} 字 · 已填进下面输入框`);
            setTranscribing(false);
            return;
          }
          if (q.status === "failed") {
            setTranscribeMsg(`转写失败: ${normalizeErrorMessage(q.error || "没有返回失败原因")}`);
            return;
          }
          setTranscribeMsg(`等转写... ${(i + 1) * 5}s`);
        } catch (_) {}
      }
      setTranscribeMsg("等了 5 分钟还没出 · 短视频较长? 去 ⚙️ 设置看转写记录");
    } catch (e) { setTranscribeMsg(`提交失败: ${normalizeErrorMessage(e)}`); }
    finally { setTranscribing(false); }
  }

  return (
    <div style={{ padding: "40px 40px 60px", maxWidth: 820, margin: "0 auto" }}>
      <div style={{ textAlign: "center", marginBottom: 24 }}>
        <div style={{ fontSize: 30, fontWeight: 700, color: T.text, marginBottom: 8, letterSpacing: "-0.02em" }}>录音转写了吗? 🎙️</div>
        <div style={{ fontSize: 14, color: T.muted, lineHeight: 1.6 }}>观点不变 · 口吻不丢 · 经历保留 · 改写出口播文案</div>
      </div>

      {/* D-062bb: 短视频链接自动转写 */}
      <div style={{ background: "#fff", border: `1px solid ${T.borderSoft}`, borderRadius: 12, padding: 14, marginBottom: 14 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: T.text, marginBottom: 6 }}>🔗 有短视频链接? 一键自动转写</div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input value={url} onChange={e => setUrl(e.target.value)}
            placeholder="抖音 / 视频号 / 小红书等短视频链接"
            disabled={transcribing}
            onKeyDown={e => { if (e.key === "Enter") transcribeUrl(); }}
            style={{ flex: 1, minWidth: 240, padding: "8px 12px", border: `1px solid ${T.borderSoft}`, borderRadius: 8, fontSize: 13, fontFamily: "inherit", outline: "none" }} />
          <Btn size="sm" variant="primary" onClick={transcribeUrl} disabled={!url.trim() || transcribing}>
            {transcribing ? "转写中..." : "📥 拉文案"}
          </Btn>
        </div>
        {transcribeMsg && (
          <div style={{ marginTop: 6, fontSize: 11, color: transcribeMsg.startsWith("✓") ? T.brand : transcribeMsg.startsWith("提交失败") || transcribeMsg.startsWith("转写失败") ? T.red : T.muted }}>
            {transcribeMsg}
          </div>
        )}
        <div style={{ marginTop: 6, fontSize: 10.5, color: T.muted2 }}>
          💡 通常 1-3 分钟 · 本地音频上传稍后接上
        </div>
      </div>

      <div style={{ background: "#fff", border: `1.5px solid ${T.brand}`, boxShadow: `0 0 0 5px ${T.brandSoft}`, borderRadius: 16, padding: 18, marginBottom: 18 }}>
        <textarea rows={14} value={transcript} onChange={e => setTranscript(e.target.value)}
          placeholder="把录音文字贴在这里, 或者上面粘短视频链接自动转写..."
          style={{ width: "100%", padding: 12, border: "none", outline: "none", background: "transparent", fontSize: 14, fontFamily: "inherit", resize: "vertical", lineHeight: 1.7, color: T.text, minHeight: 240 }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12, paddingTop: 14, borderTop: `1px solid ${T.borderSoft}` }}>
          {len > 0 ? (
            <>
              <Tag size="xs" color="gray">{len} 字</Tag>
              <span style={{ fontSize: 11, color: T.muted2 }}>· 不会把你的话改成广告 · 删口头禅, 不改观点</span>
            </>
          ) : (
            <span style={{ fontSize: 12, color: T.muted2 }}>✨ 写完点 "提骨架 + 给切入角度"</span>
          )}
          <div style={{ flex: 1 }} />
          <button onClick={onGo} disabled={!ready} style={{
            padding: "8px 20px", fontSize: 13, fontWeight: 600,
            background: ready ? T.brand : T.muted3, color: "#fff",
            border: "none", borderRadius: 100, cursor: ready ? "pointer" : "not-allowed", fontFamily: "inherit",
          }}>{loading ? "提骨架中..." : "提骨架 + 给切入角度 →"}</button>
        </div>
      </div>

      {/* D-069: 删 "skill 资源" 调试面板 (短视频露馅) */}
    </div>
  );
}

function VStepAngles({ analyze, loading, onPick, onPrev, onRegen, withBiz, setWithBiz, pureRewrite, setPureRewrite }) {
  const [hoverIdx, setHoverIdx] = React.useState(-1);
  if (loading || !analyze) return <Spinning icon="🔍" phases={[
    { text: "完整读录音", sub: "标 5 类信息:观点/经历/洞察/弱信息/语气锚点" },
    { text: "提炼最打动人的 1 个核心观点", sub: "不罗列所有,要深度分析" },
    { text: "给最多 2 个切入角度", sub: "基于判断,不把选择权全交给你" },
    { text: "每个角度配 10-35 字黄金三秒开场草稿", sub: "反差句 / 结果句 / 态度句" },
  ]} />;
  const sk = analyze.skeleton || {};
  const angles = analyze.angles || [];
  // C5: checkbox 模式 (跟 hotrewrite C3 一致, 至少保留 1 个)
  function toggleBiz() { if (withBiz && !pureRewrite) return; setWithBiz(!withBiz); }
  function togglePure() { if (pureRewrite && !withBiz) return; setPureRewrite(!pureRewrite); }
  const totalCount = (withBiz ? 2 : 0) + (pureRewrite ? 2 : 0);
  return (
    <div style={{ padding: "32px 40px 120px", maxWidth: 820, margin: "0 auto" }}>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>骨架提完 · 挑一个切入角度 🎯</div>
        <div style={{ fontSize: 13, color: T.muted }}>选 1 个角度, 小华按勾选的模式各写 2 篇.</div>
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

      {/* C5: 改写模式 checkbox 卡 (默认 ☑ 业务) */}
      <div style={{ marginBottom: 16, padding: 14, background: T.brandSoft, borderRadius: 10, border: `1px solid ${T.brand}33` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: T.text }}>改写模式</span>
          <span style={{ fontSize: 11, color: T.muted }}>· 多选 · 每勾一项加 2 篇</span>
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 12, fontWeight: 700, color: T.brand, padding: "3px 12px", background: "#fff", borderRadius: 100 }}>本次会出 {totalCount} 篇</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <VModeCheckCard on={withBiz} onClick={toggleBiz} disabled={withBiz && !pureRewrite}
            title="结合业务" recommend desc="保留你原话观点 + 自然引到业务 · 适合做内容获客" />
          <VModeCheckCard on={pureRewrite} onClick={togglePure} disabled={pureRewrite && !withBiz}
            title="纯改写" desc="只去口头禅 + 修语序 + 强黄金三秒 · 不带业务" />
        </div>
        <div style={{ marginTop: 8, fontSize: 10.5, color: T.muted2, lineHeight: 1.5 }}>
          💡 默认勾"结合业务"出 2 篇 · 都勾出 4 篇对比 · 至少保留 1 个
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

function VStepWrite({ script, angle, loading, onPrev, onRewrite, onReset, onNav,
  versions, activeVersionIdx, onSwitchVersion, allAngles, onAddSameAngle, onAddOtherAngle, appendingVersion }) {
  if (loading || !script) return <Spinning icon="✍️" phases={[
    { text: "按你选的角度写黄金三秒", sub: "10-35 字 · 反差/结果/态度句" },
    { text: "轻量重排叙事", sub: "尊重用户原有叙事线,不强行重排" },
    { text: "最小删减 · 只删无效重复", sub: "经历故事绝不动 · 销售话术删掉" },
    { text: "保留用户原口吻", sub: "语感 / 句式 / 标志性表达" },
    { text: "写改写说明", sub: "3-6 条 · 保留了什么 / 删了什么 / 为什么" },
    { text: "7 条自检清单", sub: "观点对齐 / 经历完整 / 真诚感 / 口吻 / 黄金三秒 / 不过删 / 深度" },
  ]} />;
  // C5: 多版 + 切角度 popover (跟 hotrewrite C4 一致)
  const [showAngleSwitch, setShowAngleSwitch] = React.useState(false);
  const otherAngles = (allAngles || []).filter(a => a?.label !== angle?.label);

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
      {/* C5: 多版 tab 切换 (versions.length > 1 时显) */}
      {versions && versions.length > 1 && (
        <div style={{ marginBottom: 14, padding: 10, background: T.bg2, borderRadius: 10, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: T.text }}>📚 共 {versions.length} 版:</span>
          {versions.map((v, i) => (
            <button key={i} onClick={() => onSwitchVersion(i)}
              title={`角度: ${v.angle?.label || ""} · ${new Date(v.ts).toLocaleTimeString().slice(0, 5)}`}
              style={{
                padding: "4px 12px", fontSize: 11.5, fontFamily: "inherit",
                background: i === activeVersionIdx ? T.brand : "#fff",
                color: i === activeVersionIdx ? "#fff" : T.muted,
                border: `1px solid ${i === activeVersionIdx ? T.brand : T.borderSoft}`,
                borderRadius: 100, cursor: "pointer", fontWeight: i === activeVersionIdx ? 600 : 500,
              }}>
              第 {i + 1} 版 · {v.mode_label}
            </button>
          ))}
        </div>
      )}

      {/* Hero (1 行 + 自检 chip 右挂) */}
      <div style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 280 }}>
          <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>改写完成 · {script.word_count} 字 🎙️</div>
          <div style={{ fontSize: 12, color: T.muted }}>
            角度: <b style={{ color: T.text }}>{angle?.label}</b>
            {script.mode_label && <> · 模式: <b style={{ color: T.text }}>{script.mode_label}</b></>}
          </div>
        </div>
        <SelfCheckChip pass={sc.overall_pass} score={passed} max={7} threshold={5}
          label="自检" summary={sc.summary}
          dims={Object.fromEntries(checks.map(c => [c.label, sc[c.key] ? "✓" : "○"]))}
        />
      </div>

      <div style={{ background: "#fff", border: `1px solid ${T.borderSoft}`, borderRadius: 12, padding: 20, marginBottom: 14 }}>
        <div style={{ fontSize: 11.5, color: T.muted2, fontWeight: 600, letterSpacing: "0.08em", marginBottom: 10 }}>可直接读稿版</div>
        <textarea value={script.content || ""} readOnly
          style={{ width: "100%", border: "none", outline: "none", background: "transparent", fontSize: 14.5, fontFamily: "inherit", resize: "vertical", lineHeight: 1.9, color: T.text, minHeight: 360 }} />
      </div>

      {script.notes?.length > 0 && (
        <div style={{ padding: 14, background: T.bg2, border: `1px solid ${T.borderSoft}`, borderRadius: 12, marginBottom: 14 }}>
          <div style={{ fontSize: 11.5, color: T.muted2, fontWeight: 600, letterSpacing: "0.08em", marginBottom: 8 }}>改写说明</div>
          <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: T.muted, lineHeight: 1.8 }}>
            {script.notes.map((n, i) => <li key={i}>{n}</li>)}
          </ul>
        </div>
      )}

      {/* C5: 操作行 — 多版累积 + 切角度 */}
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", position: "relative" }}>
        <Btn variant="outline" onClick={onPrev}>← 改角度选择</Btn>
        <Btn onClick={onAddSameAngle || onRewrite} disabled={appendingVersion}>
          {appendingVersion ? "AI 写中..." : "🔄 再来一版 (同角度)"}
        </Btn>
        {otherAngles.length > 0 && (
          <div style={{ position: "relative" }}>
            <Btn onClick={() => setShowAngleSwitch(!showAngleSwitch)} disabled={appendingVersion}>🎯 换角度再写 ▾</Btn>
            {showAngleSwitch && (
              <div style={{
                position: "absolute", top: "100%", left: 0, marginTop: 6,
                background: "#fff", border: `1px solid ${T.border}`, borderRadius: 10,
                boxShadow: "0 8px 24px rgba(0,0,0,0.12)", padding: 8, zIndex: 10, minWidth: 280,
              }}>
                {otherAngles.map((a, i) => (
                  <div key={i} onClick={() => { setShowAngleSwitch(false); onAddOtherAngle && onAddOtherAngle(a); }} style={{
                    padding: "8px 10px", borderRadius: 6, cursor: "pointer", fontSize: 12.5, color: T.text, lineHeight: 1.5,
                  }}
                    onMouseEnter={e => { e.currentTarget.style.background = T.brandSoft; }}
                    onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}>
                    <b>{a.label}</b> · <span style={{ color: T.muted }}>{a.why}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        <div style={{ flex: 1 }} />
        <Btn onClick={copy} variant={copied ? "soft" : "default"}>{copied ? "✓ 已复制" : "📋 复制文案"}</Btn>
        <Btn onClick={onReset}>再来一条录音</Btn>
      </div>

      {/* D-062d: 完成态加 "做成视频" CTA */}
      {onNav && script.content && (
        <div style={{ marginTop: 16, padding: 16, background: "linear-gradient(135deg, #f6fbf7, #fff)",
                      border: `1.5px solid ${T.brand}`, boxShadow: `0 0 0 4px ${T.brandSoft}`,
                      borderRadius: 12, display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ fontSize: 26 }}>✨</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: T.text }}>下一步: 把这条改写做成数字人视频?</div>
            <div style={{ fontSize: 12, color: T.muted, marginTop: 3 }}>
              一键带文案过去 · 选声音 + 数字人 + 模板 · 出片
            </div>
          </div>
          <Btn variant="primary" onClick={() => {
            try {
              localStorage.setItem("make_v2_seed_script", script.content);
              localStorage.setItem("make_v2_seed_from", JSON.stringify({
                skill: "voicerewrite", title: (script.content || "").slice(0, 30),
                ts: Date.now(),
              }));
            } catch (_) {}
            onNav("make");
          }}>🎬 做成数字人视频 →</Btn>
        </div>
      )}
    </div>
  );
}

Object.assign(window, { PageVoicerewrite });
