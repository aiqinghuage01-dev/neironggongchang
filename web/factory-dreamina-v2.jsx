// factory-dreamina-v2.jsx — 即梦(Dreamina) AIGC 工具 (D-028, D-075 batch + 参考图)
// CLI: ~/.local/bin/dreamina · 字节官方 AIGC
//
// D-075 (2026-04-26): 视频生成统一为 "视频生成" 模式 (替代旧 image2video).
//   按参考图数量自动分流: 0 → text2video / 1 → image2video / ≥2 → multimodal2video
//   prompt 多行 = 自动批量并发 (≤20). 结果区显示 N 个 task 卡片.

const DM_STEPS = [
  { id: "input",   n: 1, label: "描述 + 配置" },
  { id: "result",  n: 2, label: "提交 / 结果" },
];

const DM_MODES = [
  { id: "text2image", label: "文本生图", icon: "🖼️" },
  { id: "video",      label: "视频生成", icon: "🎬" },
];

const DM_T2I_MODELS = ["", "3.0", "3.1", "4.0", "4.1", "4.5", "4.6", "5.0", "lab"];
const DM_T2I_RATIOS = ["1:1", "16:9", "9:16", "4:3", "3:4", "21:9", "3:2", "2:3"];
const DM_T2I_RES   = ["", "1k", "2k", "4k"];

const DM_VIDEO_MODELS = ["seedance2.0fast", "seedance2.0"];
const DM_VIDEO_RATIOS = ["16:9", "9:16", "1:1", "3:4", "4:3", "21:9"];
const DM_VIDEO_RES = ["720p", "1080p"];

const selectStyle = { width: "100%", padding: "5px 8px", borderRadius: 6, border: `1px solid ${T.borderSoft}`, fontSize: 12 };

function videoRoute(refsCount) {
  if (refsCount === 0) return { name: "text2video", label: "纯文字生视频" };
  if (refsCount === 1) return { name: "image2video", label: "首帧图动起来" };
  return { name: "multimodal2video", label: `${refsCount} 张全参考` };
}

function dreaminaRouteLabel(route) {
  const labels = {
    text2image: "文本生图",
    text2video: "纯文字生视频",
    image2video: "首帧图动起来",
    multimodal2video: "多图参考成片",
    video: "视频生成",
  };
  return labels[route] || "视频生成";
}

function dreaminaVideoModelLabel(model) {
  if (model === "seedance2.0fast") return "快速版";
  if (model === "seedance2.0") return "标准版";
  return model || "默认";
}

function PageDreamina({ onNav }) {
  const [step, setStep] = React.useState("input");
  const [loading, setLoading] = React.useState(false);
  const [err, setErr] = React.useState("");

  const [info, setInfo] = React.useState(null);
  const [mode, setMode] = React.useState("text2image");
  const [prompt, setPrompt] = React.useState("");

  // 文本生图
  const [t2iRatio, setT2iRatio] = React.useState("1:1");
  const [t2iRes, setT2iRes] = React.useState("");
  const [t2iModelVer, setT2iModelVer] = React.useState("");
  const [t2iSubmit, setT2iSubmit] = React.useState(null);
  const [t2iQuery, setT2iQuery] = React.useState(null);
  const [polling, setPolling] = React.useState(false);

  // 视频生成 (统一)
  const [videoRatio, setVideoRatio] = React.useState("16:9");
  const [videoRes, setVideoRes] = React.useState("720p");
  const [videoModelVer, setVideoModelVer] = React.useState("seedance2.0fast");
  const [duration, setDuration] = React.useState(5);
  const [refs, setRefs] = React.useState([]);          // [{id, name, path, uploading?, error?}]
  const [promptList, setPromptList] = React.useState([{ id: `p-${Date.now()}`, text: "" }]); // 卡片堆叠
  const [batchTasks, setBatchTasks] = React.useState([]); // [{task_id, prompt}]
  const fileInputRef = React.useRef(null);

  // promptList helpers
  const PROMPT_MAX = 20;
  function addPrompt() {
    setPromptList(prev => prev.length >= PROMPT_MAX ? prev : [...prev, { id: `p-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, text: "" }]);
  }
  function removePrompt(id) {
    setPromptList(prev => prev.length > 1 ? prev.filter(p => p.id !== id) : prev);
  }
  function duplicatePrompt(id) {
    setPromptList(prev => {
      if (prev.length >= PROMPT_MAX) return prev;
      const idx = prev.findIndex(p => p.id === id);
      if (idx < 0) return prev;
      const copy = { id: `p-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, text: prev[idx].text };
      return [...prev.slice(0, idx + 1), copy, ...prev.slice(idx + 1)];
    });
  }
  function updatePrompt(id, text) {
    setPromptList(prev => prev.map(p => p.id === id ? { ...p, text } : p));
  }

  React.useEffect(() => { api.get("/api/dreamina/info").then(setInfo).catch(() => {}); }, []);

  // 工作流持久化 (refs 不持久化, 临时素材)
  const wfState = {
    step, mode, prompt, promptList,
    t2iRatio, t2iRes, t2iModelVer, t2iSubmit, t2iQuery,
    videoRatio, videoRes, videoModelVer, duration, batchTasks,
  };
  const wfRestore = (s) => {
    if (s.step) setStep(s.step);
    if (s.mode) setMode(s.mode);
    if (s.prompt != null) setPrompt(s.prompt);
    if (Array.isArray(s.promptList) && s.promptList.length > 0) setPromptList(s.promptList);
    if (s.t2iRatio) setT2iRatio(s.t2iRatio);
    if (s.t2iRes != null) setT2iRes(s.t2iRes);
    if (s.t2iModelVer != null) setT2iModelVer(s.t2iModelVer);
    if (s.t2iSubmit) setT2iSubmit(s.t2iSubmit);
    if (s.t2iQuery) setT2iQuery(s.t2iQuery);
    if (s.videoRatio) setVideoRatio(s.videoRatio);
    if (s.videoRes) setVideoRes(s.videoRes);
    if (s.videoModelVer) setVideoModelVer(s.videoModelVer);
    if (s.duration != null) setDuration(s.duration);
    if (Array.isArray(s.batchTasks)) setBatchTasks(s.batchTasks);
  };
  const wf = useWorkflowPersist({ ns: "dreamina", state: wfState, onRestore: wfRestore });

  // ── 参考图上传 (落盘版, 调 /api/dreamina/upload-ref 拿本地 path)
  async function uploadRefs(files) {
    const remaining = 9 - refs.length;
    if (remaining <= 0) return;
    const list = Array.from(files).slice(0, remaining);
    const placeholders = list.map((f, i) => ({
      id: `tmp-${Date.now()}-${i}`, name: f.name, size_bytes: f.size, uploading: true,
    }));
    setRefs(prev => [...prev, ...placeholders]);

    for (let i = 0; i < list.length; i++) {
      const f = list[i];
      const ph = placeholders[i];
      try {
        const r = await api.upload("/api/dreamina/upload-ref", f);
        setRefs(prev => prev.map(x => x.id === ph.id ? {
          ...x, uploading: false, path: r.path, media_url: r.media_url,
        } : x));
      } catch (e) {
        setRefs(prev => prev.map(x => x.id === ph.id ? {
          ...x, uploading: false, error: e.message || "上传失败",
        } : x));
      }
    }
  }
  function removeRef(id) {
    setRefs(prev => prev.filter(x => x.id !== id));
  }

  // ── 提交
  const isVideo = mode === "video";
  const videoPrompts = promptList.map(p => (p.text || "").trim()).filter(Boolean);
  const videoPromptCount = videoPrompts.length;
  const readyRefs = refs.filter(r => r.path && !r.error);

  async function submit() {
    setStep("result"); setErr("");
    if (mode === "text2image") {
      if (!prompt.trim()) return;
      setT2iSubmit(null); setT2iQuery(null); setLoading(true);
      try {
        const r = await api.post("/api/dreamina/text2image", {
          prompt: prompt.trim(), ratio: t2iRatio,
          resolution_type: t2iRes || undefined,
          model_version: t2iModelVer || undefined,
          poll: 0,
        });
        setT2iSubmit(r);
      } catch (e) { setErr(e.message); setStep("input"); }
      setLoading(false);
      return;
    }
    // video 模式
    if (videoPromptCount === 0) { setStep("input"); setErr("至少填一条画面描述"); return; }
    setBatchTasks([]); setLoading(true);
    try {
      const r = await api.post("/api/dreamina/batch-video", {
        prompts: videoPrompts,
        ref_paths: readyRefs.map(x => x.path),
        duration: duration || undefined,
        ratio: videoRatio,
        video_resolution: videoRes,
        model_version: videoModelVer,
      });
      setBatchTasks(r.tasks || []);
    } catch (e) { setErr(e.message); setStep("input"); }
    setLoading(false);
  }

  async function pollOnce() {
    const submitId = t2iSubmit?.result?.submit_id || t2iSubmit?.result?.SubmitId;
    if (!submitId) { setErr("还没拿到任务编号, 稍等一下再查"); return; }
    setPolling(true); setErr("");
    try {
      const r = await api.post("/api/dreamina/query", { submit_id: submitId, download: true });
      setT2iQuery(r);
    } catch (e) { setErr(e.message); }
    setPolling(false);
  }

  function reset() {
    setStep("input"); setErr("");
    setPrompt("");
    setPromptList([{ id: `p-${Date.now()}`, text: "" }]);
    setT2iSubmit(null); setT2iQuery(null);
    setBatchTasks([]); setRefs([]);
    clearWorkflow("dreamina");
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", background: T.bg, position: "relative", overflow: "hidden" }}>
      <StepHeader icon="🎨" title="即梦 · 图片/视频"
        steps={DM_STEPS} currentStep={step}
        onBack={() => onNav("home")} />
      <div style={{ flex: 1, overflow: "auto" }}>
        <WfRestoreBanner show={wf.hasSnapshot} onDismiss={wf.dismissSnapshot}
          onClear={() => { reset(); wf.dismissSnapshot(); }}
          label="即梦工作流" />
        {/* D-086: 走全站 InlineError */}
        {err && <InlineError err={err} />}
        {step === "input"  && <DStepInput
          info={info} mode={mode} setMode={setMode} prompt={prompt} setPrompt={setPrompt}
          isVideo={isVideo}
          promptList={promptList} addPrompt={addPrompt} removePrompt={removePrompt}
          duplicatePrompt={duplicatePrompt} updatePrompt={updatePrompt}
          videoPromptCount={videoPromptCount} promptMax={PROMPT_MAX}
          t2iRatio={t2iRatio} setT2iRatio={setT2iRatio}
          t2iRes={t2iRes} setT2iRes={setT2iRes}
          t2iModelVer={t2iModelVer} setT2iModelVer={setT2iModelVer}
          videoRatio={videoRatio} setVideoRatio={setVideoRatio}
          videoRes={videoRes} setVideoRes={setVideoRes}
          videoModelVer={videoModelVer} setVideoModelVer={setVideoModelVer}
          duration={duration} setDuration={setDuration}
          refs={refs} readyRefs={readyRefs} fileInputRef={fileInputRef}
          uploadRefs={uploadRefs} removeRef={removeRef}
          loading={loading} onGo={submit} />}
        {step === "result" && mode === "text2image" && <DStepT2IResult
          submitResult={t2iSubmit} queryResult={t2iQuery}
          loading={loading} polling={polling} onPoll={pollOnce}
          onPrev={() => setStep("input")} onReset={reset} />}
        {step === "result" && mode === "video" && <DStepVideoResult
          batchTasks={batchTasks} loading={loading}
          onPrev={() => setStep("input")} onReset={reset} />}
      </div>
    </div>
  );
}

function DStepInput({
  info, mode, setMode, prompt, setPrompt, isVideo,
  promptList, addPrompt, removePrompt, duplicatePrompt, updatePrompt,
  videoPromptCount, promptMax,
  t2iRatio, setT2iRatio, t2iRes, setT2iRes, t2iModelVer, setT2iModelVer,
  videoRatio, setVideoRatio, videoRes, setVideoRes, videoModelVer, setVideoModelVer,
  duration, setDuration, refs, readyRefs, fileInputRef, uploadRefs, removeRef,
  loading, onGo,
}) {
  const route = isVideo ? videoRoute(readyRefs.length) : null;
  const refsBusy = refs.some(r => r.uploading);
  const readyT2i = !!prompt.trim() && !loading;
  const readyVideo = videoPromptCount > 0 && !loading && !refsBusy;
  const ready = isVideo ? readyVideo : readyT2i;
  return (
    <div style={{ padding: "32px 40px 80px", maxWidth: 820, margin: "0 auto" }}>
      <div style={{ textAlign: "center", marginBottom: 16 }}>
        <div style={{ fontSize: 26, fontWeight: 700, color: T.text, marginBottom: 6 }}>即梦 · 字节官方图片/视频 🎨</div>
        <div style={{ fontSize: 13, color: T.muted }}>
          字节即梦 ·
          {info?.credit?.credit?.total_credit != null ? <> 余额 <b style={{ color: T.brand, fontFamily: "SF Mono, monospace" }}>{info.credit.credit.total_credit}</b> 点</> : " 额度检查中..."}
        </div>
      </div>

      <DreaminaQueueBanner />

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

      {/* === 视频生成: 参考图 → prompt 卡片列表 + 提交 === */}
      {isVideo && (
        <>
          {/* 共享参考图 */}
          <div style={{ padding: 14, background: "#fff", border: `1px solid ${T.borderSoft}`, borderRadius: 10, marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <div style={{ fontSize: 11.5, color: T.muted2, fontWeight: 600, letterSpacing: "0.08em" }}>📷 共享参考图</div>
              <span style={{ fontSize: 11, color: T.muted2 }}>
                {readyRefs.length} 张参考图 · <b style={{ color: T.brand }}>{route.label}</b>
              </span>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {refs.map(r => (
                <div key={r.id} style={{
                  position: "relative", width: 64, height: 64, borderRadius: 8,
                  background: r.media_url ? `url(${api.media(r.media_url)}) center/cover` : T.bg2,
                  border: `1px solid ${r.error ? T.red : T.borderSoft}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }} title={r.name}>
                  {r.uploading && <span style={{ fontSize: 16 }}>⏳</span>}
                  {/* D-086: 走 ErrorText 转友好 */}
                  {r.error && <span style={{ fontSize: 9, padding: 3, textAlign: "center" }}><ErrorText err={r.error} maxLen={16} /></span>}
                  <button onClick={() => removeRef(r.id)} title="删除" style={{
                    position: "absolute", top: -6, right: -6,
                    width: 18, height: 18, borderRadius: "50%",
                    background: "#fff", border: `1px solid ${T.border}`,
                    color: T.muted, fontSize: 10, cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    padding: 0, fontFamily: "inherit",
                    boxShadow: "0 1px 2px rgba(0,0,0,0.1)",
                  }}>✕</button>
                </div>
              ))}
              {refs.length < 9 && (
                <button
                  onClick={() => fileInputRef.current && fileInputRef.current.click()}
                  style={{
                    width: 64, height: 64, borderRadius: 8,
                    border: `1.5px dashed ${T.border}`, background: T.bg2,
                    cursor: "pointer", color: T.muted, fontSize: 11,
                    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                    gap: 2, fontFamily: "inherit",
                  }}>
                  <span style={{ fontSize: 16 }}>+</span>
                  <span style={{ fontSize: 9 }}>添加</span>
                </button>
              )}
            </div>
            <input
              ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp"
              multiple style={{ display: "none" }}
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  uploadRefs(e.target.files); e.target.value = "";
                }
              }}
            />
          </div>

          {/* 画面描述卡片列表 */}
          <div style={{ padding: 14, background: "#fff", border: `1.5px solid ${T.brand}`, boxShadow: `0 0 0 5px ${T.brandSoft}`, borderRadius: 14, marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <div style={{ fontSize: 11.5, color: T.muted2, fontWeight: 600, letterSpacing: "0.08em" }}>📝 画面描述列表</div>
              <span style={{ fontSize: 11, color: T.muted2 }}>{promptList.length} 条 · 上限 {promptMax}</span>
              <div style={{ flex: 1 }} />
              <span style={{ fontSize: 11, color: T.muted2 }}>批量一起跑</span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {promptList.map((p, idx) => (
                <DPromptCard key={p.id} idx={idx + 1} text={p.text} route={route}
                  isLast={idx === promptList.length - 1}
                  onChange={t => updatePrompt(p.id, t)}
                  onDup={() => duplicatePrompt(p.id)}
                  onRemove={promptList.length > 1 ? () => removePrompt(p.id) : null} />
              ))}
              {promptList.length < promptMax && (
                <div onClick={addPrompt} style={{
                  padding: 10, border: `1.5px dashed ${T.border}`, borderRadius: 10,
                  textAlign: "center", color: T.muted, fontSize: 12.5, cursor: "pointer", background: T.bg2,
                  fontFamily: "inherit",
                }}>+ 添加描述</div>
              )}
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, paddingTop: 10, borderTop: `1px solid ${T.borderSoft}` }}>
              <div style={{ fontSize: 11.5, color: T.muted2 }}>
                共 {videoPromptCount} 条有内容
                {refsBusy && <span style={{ color: T.amber, marginLeft: 6 }}>· 等参考图传完</span>}
              </div>
              <div style={{ flex: 1 }} />
              <button onClick={onGo} disabled={!ready} style={{
                padding: "7px 18px", fontSize: 13, fontWeight: 600,
                background: ready ? T.brand : T.muted3, color: "#fff",
                border: "none", borderRadius: 100, cursor: ready ? "pointer" : "not-allowed", fontFamily: "inherit",
              }}>{loading ? "提交中..." : videoPromptCount > 1 ? `批量提交 ${videoPromptCount} 条 →` : "提交 →"}</button>
            </div>
          </div>
        </>
      )}

      {/* === 文本生图: 单 textarea + 提交 (旧路径不变) === */}
      {!isVideo && (
        <div style={{ background: "#fff", border: `1.5px solid ${T.brand}`, boxShadow: `0 0 0 5px ${T.brandSoft}`, borderRadius: 14, padding: 16, marginBottom: 14 }}>
          <textarea rows={5} value={prompt} onChange={e => setPrompt(e.target.value)}
            placeholder="描述图片(主体/风格/光线/构图)..."
            style={{ width: "100%", border: "none", outline: "none", background: "transparent", fontSize: 14, fontFamily: "inherit", resize: "vertical", lineHeight: 1.7, color: T.text }} />
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, paddingTop: 10, borderTop: `1px solid ${T.borderSoft}` }}>
            <div style={{ fontSize: 11.5, color: T.muted2 }}>画面描述 {prompt.length} 字 · 会消耗即梦点数</div>
            <div style={{ flex: 1 }} />
            <button onClick={onGo} disabled={!ready} style={{
              padding: "7px 18px", fontSize: 13, fontWeight: 600,
              background: ready ? T.brand : T.muted3, color: "#fff",
              border: "none", borderRadius: 100, cursor: ready ? "pointer" : "not-allowed", fontFamily: "inherit",
            }}>{loading ? "提交中..." : "提交任务 →"}</button>
          </div>
        </div>
      )}

      {/* 高级参数 */}
      <div style={{ padding: 14, background: "#fff", border: `1px solid ${T.borderSoft}`, borderRadius: 10 }}>
        <div style={{ fontSize: 11.5, color: T.muted2, fontWeight: 600, letterSpacing: "0.08em", marginBottom: 10 }}>高级参数</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, fontSize: 12 }}>
          {!isVideo && (
            <>
              <div>
                <div style={{ color: T.muted, marginBottom: 4 }}>比例</div>
                <select value={t2iRatio} onChange={e => setT2iRatio(e.target.value)} style={selectStyle}>
                  {DM_T2I_RATIOS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div>
                <div style={{ color: T.muted, marginBottom: 4 }}>图片精度</div>
                <select value={t2iRes} onChange={e => setT2iRes(e.target.value)} style={selectStyle}>
                  {DM_T2I_RES.map(r => <option key={r} value={r}>{r || "(默认)"}</option>)}
                </select>
              </div>
              <div>
                <div style={{ color: T.muted, marginBottom: 4 }}>模型版本</div>
                <select value={t2iModelVer} onChange={e => setT2iModelVer(e.target.value)} style={selectStyle}>
                  {DM_T2I_MODELS.map(m => <option key={m} value={m}>{m || "(默认)"}</option>)}
                </select>
              </div>
            </>
          )}
          {isVideo && (
            <>
              <div>
                <div style={{ color: T.muted, marginBottom: 4 }}>时长(秒)</div>
                <input type="number" value={duration} onChange={e => setDuration(Number(e.target.value))} min={4} max={15}
                  style={{ ...selectStyle, fontFamily: "inherit" }} />
              </div>
              <div>
                <div style={{ color: T.muted, marginBottom: 4 }}>比例</div>
                <select value={videoRatio} onChange={e => setVideoRatio(e.target.value)} style={selectStyle}>
                  {DM_VIDEO_RATIOS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div>
                <div style={{ color: T.muted, marginBottom: 4 }}>清晰度</div>
                <select value={videoRes} onChange={e => setVideoRes(e.target.value)} style={selectStyle}>
                  {DM_VIDEO_RES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div style={{ gridColumn: "span 3" }}>
                <div style={{ color: T.muted, marginBottom: 4 }}>模型版本</div>
                <select value={videoModelVer} onChange={e => setVideoModelVer(e.target.value)} style={selectStyle}>
                  {DM_VIDEO_MODELS.map(m => <option key={m} value={m}>{dreaminaVideoModelLabel(m)}{m === "seedance2.0fast" ? " · 推荐, 更快" : ""}</option>)}
                </select>
              </div>
            </>
          )}
        </div>
        {isVideo && (
          <div style={{ fontSize: 11, color: T.muted2, marginTop: 10, lineHeight: 1.6 }}>
            💡 单条约 1-3 分钟. 批量一起开始, 总耗时接近单条. 每条约扣 300-500 点.
          </div>
        )}
      </div>
    </div>
  );
}

const cardActionStyle = {
  cursor: "pointer", padding: "2px 6px", borderRadius: 4,
  fontSize: 12, color: T.muted, lineHeight: 1,
  background: "transparent", border: "none", fontFamily: "inherit",
};

function DPromptCard({ idx, text, route, onChange, onDup, onRemove }) {
  return (
    <div style={{
      background: "#fff", border: `1px solid ${T.borderSoft}`, borderRadius: 10, padding: 10,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <div style={{
          width: 22, height: 22, borderRadius: "50%", background: T.brandSoft,
          color: T.brand, fontSize: 11, fontWeight: 700,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>{idx}</div>
        <div style={{ fontSize: 10.5, color: T.muted, fontFamily: "SF Mono, monospace" }}>
          {route?.label || "视频生成"}
        </div>
        <div style={{ flex: 1 }} />
        <button onClick={onDup} title="复制" style={cardActionStyle}>📋</button>
        {onRemove && <button onClick={onRemove} title="删除" style={cardActionStyle}>✕</button>}
      </div>
      <textarea rows={2} value={text} onChange={e => onChange(e.target.value)}
        placeholder={`第 ${idx} 条 · 描述视频(画面/动作/氛围)...`}
        style={{
          width: "100%", border: "none", outline: "none", resize: "none",
          background: "transparent", fontSize: 12.5, fontFamily: "inherit",
          color: T.text, lineHeight: 1.6, padding: 0,
        }} />
    </div>
  );
}

// ── 文本生图结果区 (D-028 老路径不变, 单 submit_id + 手动轮询)
function DStepT2IResult({ submitResult, queryResult, loading, polling, onPoll, onPrev, onReset }) {
  if (loading || !submitResult) return <Spinning icon="🎨" phases={[
    { text: "提交给即梦", sub: "正在进入生成队列" },
    { text: "等待即梦受理", sub: "" },
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
          任务编号: {submitId || "(未获取)"} · 文本生图
        </div>
      </div>

      <details style={{ padding: 12, background: T.bg2, borderRadius: 8, marginBottom: 14 }}>
        <summary style={{ fontSize: 12, color: T.muted, cursor: "pointer", fontWeight: 600 }}>📋 看提交细节 (一般不用看)</summary>
        <pre style={{ fontSize: 11, color: T.muted, lineHeight: 1.6, marginTop: 8, whiteSpace: "pre-wrap", maxHeight: 200, overflow: "auto" }}>
          {JSON.stringify(submitResult.result || {}, null, 2)}
        </pre>
      </details>

      <div style={{ padding: 16, background: "#fff", border: `1px solid ${T.borderSoft}`, borderRadius: 12, marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
          <div style={{ fontSize: 14, fontWeight: 600, flex: 1 }}>
            {queryResult ? `查询结果: ${status || "状态未知"}` : "等任务跑完后点击「查询结果」"}
          </div>
          <Btn onClick={onPoll} disabled={!submitId || polling} variant="primary">
            {polling ? "查询中..." : queryResult ? "🔄 再查一次" : "🔍 查询结果"}
          </Btn>
        </div>

        {media.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12, marginTop: 10 }}>
            {media.map((u, i) => (
              <div key={i} style={{ background: T.bg2, borderRadius: 8, overflow: "hidden", padding: 4 }}>
                <ImageWithLightbox src={api.media(u)} downloadName={u.split("/").pop()} style={{ width: "100%", borderRadius: 6, display: "block" }} />
                <div style={{ fontSize: 10, color: T.muted2, marginTop: 4, fontFamily: "SF Mono, monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.split("/").pop()}</div>
              </div>
            ))}
          </div>
        )}

        {queryResult && !media.length && (
          <details style={{ padding: 10, background: T.bg2, borderRadius: 8, marginTop: 8 }}>
            <summary style={{ fontSize: 11.5, color: T.muted, cursor: "pointer" }}>没找到媒体, 查看排查信息</summary>
            <pre style={{ fontSize: 11, color: T.muted, marginTop: 6, whiteSpace: "pre-wrap", maxHeight: 240, overflow: "auto" }}>{JSON.stringify(queryResult, null, 2)}</pre>
          </details>
        )}
      </div>

      <div style={{ display: "flex", gap: 10 }}>
        <Btn variant="outline" onClick={onPrev}>← 改描述</Btn>
        <div style={{ flex: 1 }} />
        <Btn variant="primary" onClick={onReset}>再来一个</Btn>
      </div>
    </div>
  );
}

// ── 视频结果区 (D-075 N 个 task 卡片, 每个独立 useTaskPoller)
function DStepVideoResult({ batchTasks, loading, onPrev, onReset }) {
  if (loading || batchTasks.length === 0) return <Spinning icon="🎬" phases={[
    { text: "提交批量任务", sub: `准备 ${batchTasks.length || "N"} 条视频任务` },
    { text: "进入后台队列", sub: "马上开始逐条追踪进度" },
  ]} />;

  return (
    <div style={{ padding: "32px 40px 80px", maxWidth: 1080, margin: "0 auto" }}>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>
          🎬 批量视频生成中 · {batchTasks.length} 条
        </div>
        <div style={{ fontSize: 12, color: T.muted }}>
          每条约 1-3 分钟 · 一起开始 · 完成后自动入作品库
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 12, marginBottom: 14 }}>
        {batchTasks.map((t, i) => (
          <DTaskCard key={t.task_id} taskId={t.task_id} prompt={t.prompt} idx={i + 1} />
        ))}
      </div>

      <div style={{ display: "flex", gap: 10 }}>
        <Btn variant="outline" onClick={onPrev}>← 改描述</Btn>
        <div style={{ flex: 1 }} />
        <Btn variant="primary" onClick={onReset}>再来一批</Btn>
      </div>
    </div>
  );
}

function DTaskCard({ taskId, prompt, idx }) {
  const poller = useTaskPoller(taskId);
  const result = poller.task?.result || null;
  const mediaUrls = result?.media_urls || [];
  const downloaded = result?.downloaded || [];
  const route = result?.route || poller.task?.kind?.replace("dreamina.", "") || "video";
  const routeLabel = dreaminaRouteLabel(route);
  const elapsed = poller.elapsedSec || 0;
  const pct = poller.progressPct || (poller.isRunning ? 15 : 0);

  return (
    <div style={{
      background: "#fff", border: `1px solid ${poller.isOk ? T.green : poller.isFailed ? T.red : T.borderSoft}`,
      borderRadius: 12, padding: 14, display: "flex", flexDirection: "column", gap: 10,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{
          width: 24, height: 24, borderRadius: "50%", background: T.brandSoft,
          color: T.brand, fontSize: 11, fontWeight: 700,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>{idx}</div>
        <div style={{ fontSize: 11, color: T.muted2 }}>{routeLabel}</div>
        <div style={{ flex: 1 }} />
        <div style={{ fontSize: 11, color: T.muted }}>{elapsed}s</div>
      </div>
      <div style={{ fontSize: 12, color: T.text, lineHeight: 1.5, maxHeight: 60, overflow: "hidden" }}>
        {prompt}
      </div>

      {poller.isRunning && (
        <div>
          <div style={{ fontSize: 11, color: T.muted, marginBottom: 4 }}>{poller.progressText || "跑中..."}</div>
          <div style={{ height: 4, background: T.bg2, borderRadius: 2, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${pct}%`, background: T.brand, transition: "width 0.5s" }} />
          </div>
        </div>
      )}

      {poller.isFailed && (
        <div style={{ fontSize: 11, color: T.red, padding: 8, background: T.redSoft, borderRadius: 6 }}>
          ⚠ <ErrorText err={poller.error || "任务失败"} maxLen={80} />
        </div>
      )}

      {poller.isOk && mediaUrls.length > 0 && (
        <div style={{ display: "grid", gap: 6 }}>
          {mediaUrls.map((rel, j) => {
            const fullUrl = api.media(rel);
            const fname = (downloaded[j] || rel).split("/").pop();
            const isVid = /\.(mp4|mov|webm)$/i.test(fname);
            return (
              <div key={j} style={{ background: T.bg2, borderRadius: 6, overflow: "hidden" }}>
                {isVid ? (
                  <video src={fullUrl} controls style={{ width: "100%", display: "block" }} />
                ) : (
                  <ImageWithLightbox src={fullUrl} downloadName={fname} style={{ width: "100%", display: "block" }} />
                )}
                <div style={{ fontSize: 10, color: T.muted2, padding: "4px 6px", fontFamily: "SF Mono, monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{fname}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// T8 即梦排队拥堵预判 banner
function DreaminaQueueBanner() {
  const [q, setQ] = React.useState(null);
  React.useEffect(() => {
    const load = () => api.get("/api/dreamina/queue-status").then(setQ).catch(() => {});
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, []);
  if (!q || q.congestion_level === "idle") return null;
  const colors = {
    light: { bg: T.brandSoft, fg: T.brand, br: T.brand },
    moderate: { bg: T.amberSoft, fg: T.amber, br: T.amber },
    heavy: { bg: T.redSoft, fg: T.red, br: T.red },
  }[q.congestion_level] || { bg: T.bg2, fg: T.muted, br: T.border };
  return (
    <div style={{
      background: colors.bg, color: colors.fg,
      border: `1px solid ${colors.br}33`,
      borderRadius: 10, padding: "10px 16px",
      fontSize: 12.5, marginBottom: 14, fontWeight: 500, textAlign: "center",
    }}>{q.hint}</div>
  );
}

Object.assign(window, { PageDreamina });
