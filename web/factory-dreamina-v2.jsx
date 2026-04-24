// factory-dreamina-v2.jsx — 即梦(Dreamina) AIGC 工具 (D-028)
// CLI: ~/.local/bin/dreamina · 字节官方 AIGC
// 2 step: 输入 prompt + 配置 → 提交 → 轮询 → 显示结果

const DM_STEPS = [
  { id: "input",   n: 1, label: "Prompt + 配置" },
  { id: "result",  n: 2, label: "提交 / 轮询 / 结果" },
];

const DM_MODES = [
  { id: "text2image",  label: "文本生图", icon: "🖼️" },
  { id: "image2video", label: "图生视频", icon: "🎞️" },
];

const DM_T2I_MODELS = ["", "3.0", "3.1", "4.0", "4.1", "4.5", "4.6", "5.0", "lab"];
const DM_T2I_RATIOS = ["1:1", "16:9", "9:16", "4:3", "3:4", "21:9", "3:2", "2:3"];
const DM_T2I_RES   = ["", "1k", "2k", "4k"];

const DM_I2V_MODELS = ["", "3.0", "3.0fast", "3.0pro", "3.5pro", "seedance2.0", "seedance2.0fast"];
const DM_I2V_RES   = ["", "720p", "1080p"];

function PageDreamina({ onNav }) {
  const [step, setStep] = React.useState("input");
  const [loading, setLoading] = React.useState(false);
  const [err, setErr] = React.useState("");

  const [info, setInfo] = React.useState(null);
  const [mode, setMode] = React.useState("text2image");
  const [prompt, setPrompt] = React.useState("");
  const [ratio, setRatio] = React.useState("1:1");
  const [resolution, setResolution] = React.useState("");
  const [modelVer, setModelVer] = React.useState("");
  const [imagePath, setImagePath] = React.useState("");
  const [duration, setDuration] = React.useState(5);

  const [submitResult, setSubmitResult] = React.useState(null);  // {submit_id, ...}
  const [polling, setPolling] = React.useState(false);
  const [queryResult, setQueryResult] = React.useState(null);

  React.useEffect(() => { api.get("/api/dreamina/info").then(setInfo).catch(() => {}); }, []);

  // 工作流持久化
  const wfState = { step, mode, prompt, ratio, resolution, modelVer, imagePath, duration, submitResult, queryResult };
  const wfRestore = (s) => {
    if (s.step) setStep(s.step);
    if (s.mode) setMode(s.mode);
    if (s.prompt != null) setPrompt(s.prompt);
    if (s.ratio) setRatio(s.ratio);
    if (s.resolution != null) setResolution(s.resolution);
    if (s.modelVer != null) setModelVer(s.modelVer);
    if (s.imagePath != null) setImagePath(s.imagePath);
    if (s.duration != null) setDuration(s.duration);
    if (s.submitResult) setSubmitResult(s.submitResult);
    if (s.queryResult) setQueryResult(s.queryResult);
  };
  const wf = useWorkflowPersist({ ns: "dreamina", state: wfState, onRestore: wfRestore });

  async function submit() {
    if (!prompt.trim()) return;
    if (mode === "image2video" && !imagePath.trim()) {
      setErr("图生视频需要本地图片路径"); return;
    }
    setStep("result");
    setSubmitResult(null); setQueryResult(null);
    setLoading(true); setErr("");
    try {
      const path = mode === "text2image" ? "/api/dreamina/text2image" : "/api/dreamina/image2video";
      const body = mode === "text2image"
        ? { prompt: prompt.trim(), ratio,
            resolution_type: resolution || undefined,
            model_version: modelVer || undefined, poll: 0 }
        : { image: imagePath.trim(), prompt: prompt.trim(),
            duration: duration || undefined,
            video_resolution: resolution || undefined,
            model_version: modelVer || undefined, poll: 0 };
      const r = await api.post(path, body);
      setSubmitResult(r);
    } catch (e) { setErr(e.message); setStep("input"); }
    setLoading(false);
  }

  async function pollOnce() {
    const submitId = submitResult?.result?.submit_id || submitResult?.result?.SubmitId;
    if (!submitId) { setErr("没拿到 submit_id, 看 raw 输出"); return; }
    setPolling(true); setErr("");
    try {
      const r = await api.post("/api/dreamina/query", { submit_id: submitId, download: true });
      setQueryResult(r);
    } catch (e) { setErr(e.message); }
    setPolling(false);
  }

  function reset() {
    setStep("input"); setErr("");
    setPrompt(""); setSubmitResult(null); setQueryResult(null);
    clearWorkflow("dreamina");
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", background: T.bg, position: "relative", overflow: "hidden" }}>
      <StepHeader icon="🎨" title="即梦 · AIGC"
        steps={DM_STEPS} currentStep={step}
        skillInfo={info ? { slug: "dreamina-cli", skill_md_chars: info.version?.length || 0 } : null}
        onBack={() => onNav("home")} />
      <div style={{ flex: 1, overflow: "auto" }}>
        <WfRestoreBanner show={wf.hasSnapshot} onDismiss={wf.dismissSnapshot}
          onClear={() => { reset(); wf.dismissSnapshot(); }}
          label="即梦工作流" />
        {err && (
          <div style={{ maxWidth: 820, margin: "16px auto 0", padding: 12, background: T.redSoft, color: T.red, borderRadius: 10, fontSize: 13 }}>
            ⚠️ {err}
          </div>
        )}
        {step === "input"  && <DStepInput
          info={info} mode={mode} setMode={setMode} prompt={prompt} setPrompt={setPrompt}
          ratio={ratio} setRatio={setRatio} resolution={resolution} setResolution={setResolution}
          modelVer={modelVer} setModelVer={setModelVer}
          imagePath={imagePath} setImagePath={setImagePath} duration={duration} setDuration={setDuration}
          loading={loading} onGo={submit} />}
        {step === "result" && <DStepResult mode={mode} submitResult={submitResult} queryResult={queryResult}
          loading={loading} polling={polling} onPoll={pollOnce} onPrev={() => setStep("input")} onReset={reset} />}
      </div>
    </div>
  );
}

function DStepInput({ info, mode, setMode, prompt, setPrompt, ratio, setRatio, resolution, setResolution, modelVer, setModelVer, imagePath, setImagePath, duration, setDuration, loading, onGo }) {
  const isVideo = mode === "image2video";
  const models = isVideo ? DM_I2V_MODELS : DM_T2I_MODELS;
  const reses  = isVideo ? DM_I2V_RES    : DM_T2I_RES;
  const ready = !!prompt.trim() && (!isVideo || !!imagePath.trim()) && !loading;
  return (
    <div style={{ padding: "32px 40px 80px", maxWidth: 820, margin: "0 auto" }}>
      <div style={{ textAlign: "center", marginBottom: 16 }}>
        <div style={{ fontSize: 26, fontWeight: 700, color: T.text, marginBottom: 6 }}>即梦 · 字节官方 AIGC 🎨</div>
        <div style={{ fontSize: 13, color: T.muted }}>
          ~/.local/bin/dreamina CLI ·
          {info?.credit?.credit?.total_credit != null ? <> 余额 <b style={{ color: T.brand, fontFamily: "SF Mono, monospace" }}>{info.credit.credit.total_credit}</b> credits</> : " 探活中..."}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
        {DM_MODES.map(m => (
          <div key={m.id} onClick={() => setMode(m.id)} style={{
            padding: 14, background: mode === m.id ? T.brandSoft : "#fff",
            border: `1px solid ${mode === m.id ? T.brand : T.borderSoft}`,
            borderRadius: 10, cursor: "pointer", textAlign: "center",
          }}>
            <div style={{ fontSize: 22, marginBottom: 4 }}>{m.icon}</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: mode === m.id ? T.brand : T.text }}>{m.label}</div>
          </div>
        ))}
      </div>

      <div style={{ background: "#fff", border: `1.5px solid ${T.brand}`, boxShadow: `0 0 0 5px ${T.brandSoft}`, borderRadius: 14, padding: 16, marginBottom: 14 }}>
        {isVideo && (
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11.5, color: T.muted2, fontWeight: 600, marginBottom: 4, letterSpacing: "0.06em" }}>本地图片路径</div>
            <input value={imagePath} onChange={e => setImagePath(e.target.value)}
              placeholder="/Users/black.chen/Desktop/poju-gen/.../xxx.png"
              style={{ width: "100%", border: `1px solid ${T.borderSoft}`, borderRadius: 6, padding: "6px 10px", fontSize: 12, fontFamily: "SF Mono, monospace", outline: "none" }} />
          </div>
        )}
        <textarea rows={5} value={prompt} onChange={e => setPrompt(e.target.value)}
          placeholder={isVideo ? "描述视频内容(画面/动作/氛围)..." : "描述图片(主体/风格/光线/构图)..."}
          style={{ width: "100%", border: "none", outline: "none", background: "transparent", fontSize: 14, fontFamily: "inherit", resize: "vertical", lineHeight: 1.7, color: T.text }} />
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, paddingTop: 10, borderTop: `1px solid ${T.borderSoft}` }}>
          <div style={{ fontSize: 11.5, color: T.muted2 }}>提示 {prompt.length} 字 · 即梦消耗 credits</div>
          <div style={{ flex: 1 }} />
          <button onClick={onGo} disabled={!ready} style={{
            padding: "7px 18px", fontSize: 13, fontWeight: 600,
            background: ready ? T.brand : T.muted3, color: "#fff",
            border: "none", borderRadius: 100, cursor: ready ? "pointer" : "not-allowed", fontFamily: "inherit",
          }}>{loading ? "提交中..." : "提交任务 →"}</button>
        </div>
      </div>

      <div style={{ padding: 14, background: "#fff", border: `1px solid ${T.borderSoft}`, borderRadius: 10 }}>
        <div style={{ fontSize: 11.5, color: T.muted2, fontWeight: 600, letterSpacing: "0.08em", marginBottom: 10 }}>高级参数(留空走默认)</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, fontSize: 12 }}>
          {!isVideo && (
            <div>
              <div style={{ color: T.muted, marginBottom: 4 }}>比例</div>
              <select value={ratio} onChange={e => setRatio(e.target.value)} style={{ width: "100%", padding: "5px 8px", borderRadius: 6, border: `1px solid ${T.borderSoft}`, fontSize: 12 }}>
                {DM_T2I_RATIOS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          )}
          {isVideo && (
            <div>
              <div style={{ color: T.muted, marginBottom: 4 }}>时长(秒)</div>
              <input type="number" value={duration} onChange={e => setDuration(Number(e.target.value))} min={3} max={15}
                style={{ width: "100%", padding: "5px 8px", borderRadius: 6, border: `1px solid ${T.borderSoft}`, fontSize: 12, fontFamily: "inherit" }} />
            </div>
          )}
          <div>
            <div style={{ color: T.muted, marginBottom: 4 }}>{isVideo ? "视频清晰度" : "图片精度"}</div>
            <select value={resolution} onChange={e => setResolution(e.target.value)} style={{ width: "100%", padding: "5px 8px", borderRadius: 6, border: `1px solid ${T.borderSoft}`, fontSize: 12 }}>
              {reses.map(r => <option key={r} value={r}>{r || "(默认)"}</option>)}
            </select>
          </div>
          <div>
            <div style={{ color: T.muted, marginBottom: 4 }}>模型版本</div>
            <select value={modelVer} onChange={e => setModelVer(e.target.value)} style={{ width: "100%", padding: "5px 8px", borderRadius: 6, border: `1px solid ${T.borderSoft}`, fontSize: 12 }}>
              {models.map(m => <option key={m} value={m}>{m || "(默认)"}</option>)}
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}

function DStepResult({ mode, submitResult, queryResult, loading, polling, onPoll, onPrev, onReset }) {
  if (loading || !submitResult) return <Spinning icon="🎨" phases={[
    { text: "提交任务到即梦", sub: "subprocess 调 ~/.local/bin/dreamina" },
    { text: "等任务编号(submit_id)", sub: "" },
  ]} />;
  const submitId = submitResult.result?.submit_id || submitResult.result?.SubmitId;
  const media = queryResult?.media_urls || [];
  const status = queryResult?.result?.status || queryResult?.result?.Status;

  return (
    <div style={{ padding: "32px 40px 80px", maxWidth: 1080, margin: "0 auto" }}>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>
          任务已提交 {status === "succeed" || status === "Success" ? "✅" : "🎨"}
        </div>
        <div style={{ fontSize: 12, color: T.muted, fontFamily: "SF Mono, monospace" }}>
          submit_id: {submitId || "(未获取)"} · 模式: {mode}
        </div>
      </div>

      {/* 提交时返回的原始信息 */}
      <details style={{ padding: 12, background: T.bg2, borderRadius: 8, marginBottom: 14 }}>
        <summary style={{ fontSize: 12, color: T.muted, cursor: "pointer", fontWeight: 600 }}>📋 提交输出 (raw)</summary>
        <pre style={{ fontSize: 11, color: T.muted, lineHeight: 1.6, marginTop: 8, whiteSpace: "pre-wrap", maxHeight: 200, overflow: "auto" }}>
          {JSON.stringify(submitResult.result || {}, null, 2)}
        </pre>
      </details>

      {/* 轮询区 */}
      <div style={{ padding: 16, background: "#fff", border: `1px solid ${T.borderSoft}`, borderRadius: 12, marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
          <div style={{ fontSize: 14, fontWeight: 600, flex: 1 }}>
            {queryResult ? `查询结果: ${status || "状态未知"}` : "等任务跑完后点击「查询结果」"}
          </div>
          <Btn onClick={onPoll} disabled={!submitId || polling} variant="primary">
            {polling ? "查询中..." : queryResult ? "🔄 再查一次" : "🔍 查询结果"}
          </Btn>
        </div>

        {/* media 预览 */}
        {media.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12, marginTop: 10 }}>
            {media.map((u, i) => {
              const isVid = u.match(/\.(mp4|mov|webm)$/i);
              return (
                <div key={i} style={{ background: T.bg2, borderRadius: 8, overflow: "hidden", padding: 4 }}>
                  {isVid ? (
                    <video src={api.media(u)} controls style={{ width: "100%", borderRadius: 6 }} />
                  ) : (
                    <img src={api.media(u)} style={{ width: "100%", borderRadius: 6, display: "block" }} />
                  )}
                  <div style={{ fontSize: 10, color: T.muted2, marginTop: 4, fontFamily: "SF Mono, monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.split("/").pop()}</div>
                </div>
              );
            })}
          </div>
        )}

        {queryResult && !media.length && (
          <details style={{ padding: 10, background: T.bg2, borderRadius: 8, marginTop: 8 }}>
            <summary style={{ fontSize: 11.5, color: T.muted, cursor: "pointer" }}>查询输出 raw</summary>
            <pre style={{ fontSize: 11, color: T.muted, marginTop: 6, whiteSpace: "pre-wrap", maxHeight: 240, overflow: "auto" }}>{JSON.stringify(queryResult, null, 2)}</pre>
          </details>
        )}
      </div>

      <div style={{ display: "flex", gap: 10 }}>
        <Btn variant="outline" onClick={onPrev}>← 改 prompt</Btn>
        <div style={{ flex: 1 }} />
        <Btn variant="primary" onClick={onReset}>再来一个</Btn>
      </div>
    </div>
  );
}

Object.assign(window, { PageDreamina });
