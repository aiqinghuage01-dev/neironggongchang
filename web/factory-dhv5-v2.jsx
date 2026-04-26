// factory-dhv5-v2.jsx — ⚠️ 部分 DEPRECATED (D-061a 起) ⚠️
// PageDhv5 作为独立 sidebar 入口已废 — 模板剪辑现在融进 PageMakeV2 Step 3+4
// (factory-make-v2.jsx).
//
// 本文件 *仍 load* 因为 PageMakeV2 复用了这里 export 的组件:
//   · DhvTemplateCard (Step 3 模板网格用)
//   · Dhv5SceneRow (Step 4 内联编辑 + B-roll 展开 panel)
//   · DHV5_CATEGORIES / DHV5_DURATION_BUCKETS (Step 3 筛选)
//
// PageDhv5 本身保留路由 case "dhv5" 但 sidebar 没入口, 没人调用.
// 后续 D-062 可以把上面 4 个共用组件移到独立 utils 文件,
// 然后 PageDhv5 + 本文件其它无用代码可以彻底清理.
//
// === 旧版本注释 ===
// 用户拍板: 数字人 mp4 是上游复用资源, v5 套模板剪辑成多版
// (这个原则现在由 PageMakeV2 全流程承载, 数字人在 Step 2 造好,
//  Step 3 选模板, Step 4 剪辑 — 跟 PageDhv5 单页里 3 步是一样的逻辑)

const DHV5_CATEGORIES = ["全部", "培训", "电商", "财经", "三农", "教育", "情感", "职场", "未分类"];
const DHV5_DURATION_BUCKETS = [
  { id: "all",     label: "全部时长", test: () => true },
  { id: "15s",     label: "≤20s",   test: d => d <= 20 },
  { id: "30s",     label: "20-40s", test: d => d > 20 && d <= 40 },
  { id: "60s",     label: "40-70s", test: d => d > 40 && d <= 70 },
  { id: "long",    label: ">70s",   test: d => d > 70 },
];

function PageDhv5({ onNav }) {
  // 顶部锁定: 数字人 mp4 上游
  const [dhVideoPath, setDhVideoPath] = React.useState("");
  const [worksList, setWorksList] = React.useState(null);
  const [showWorksPicker, setShowWorksPicker] = React.useState(false);

  // 主区: 模板选择
  const [templates, setTemplates] = React.useState(null);
  const [selectedTemplateId, setSelectedTemplateId] = React.useState(null);
  const [filterCategory, setFilterCategory] = React.useState("全部");
  const [filterDuration, setFilterDuration] = React.useState("all");
  const [err, setErr] = React.useState("");

  // D-059c-2: STEP 状态机
  const [step, setStep] = React.useState("select");  // select | align | review
  const [transcript, setTranscript] = React.useState("");
  const [alignedScenes, setAlignedScenes] = React.useState(null);
  const [alignMode, setAlignMode] = React.useState("auto");
  const [aligning, setAligning] = React.useState(false);

  React.useEffect(() => {
    api.get("/api/dhv5/templates")
      .then(r => setTemplates(r.templates || []))
      .catch(e => { setTemplates([]); setErr(e.message); });
  }, []);

  async function loadWorks() {
    if (worksList !== null) return;
    try {
      const list = await api.get("/api/works?limit=50");
      // 只要有 local_url 的 (柿榴出过 mp4 的)
      setWorksList((list || []).filter(w => w.local_url));
    } catch (e) { setErr(e.message); }
  }

  // D-059c-2: 点作品库挑 → 调 /local-path 拿绝对路径
  async function pickWork(w) {
    setShowWorksPicker(false);
    setErr("");
    try {
      const r = await api.get(`/api/works/${w.id}/local-path`);
      if (r.exists && r.local_path) {
        setDhVideoPath(r.local_path);
      } else {
        setErr(`作品 #${w.id} 文件不存在: ${r.local_path || "(无路径)"}`);
      }
    } catch (e) { setErr(e.message); }
  }

  function goToAlign() {
    setErr("");
    if (!dhVideoPath.trim()) { setErr("先填数字人 mp4 路径"); return; }
    if (!selectedTemplateId) { setErr("先选一个模板"); return; }
    setStep("align");
    setAlignedScenes(null);  // 切模板要重对齐
  }

  async function runAlign() {
    if (!selectedTemplateId) return;
    if (alignMode === "auto" && !transcript.trim()) {
      setErr("auto 模式需要 transcript"); return;
    }
    setAligning(true); setErr("");
    try {
      const r = await api.post("/api/dhv5/align", {
        template_id: selectedTemplateId,
        transcript: transcript.trim(),
        mode: alignMode,
      });
      setAlignedScenes(r.scenes || []);
    } catch (e) {
      setErr(e.message || "对齐失败");
    } finally {
      setAligning(false);
    }
  }

  function updateSceneField(idx, field, value) {
    setAlignedScenes(prev => prev.map((s, i) => i === idx ? { ...s, [field]: value } : s));
  }

  // D-060c B-roll 前端
  const [expandedSceneIdx, setExpandedSceneIdx] = React.useState(null);  // 单值, 同时只展开一个
  const [generatingBrollIdx, setGeneratingBrollIdx] = React.useState(null);
  const [brollUrls, setBrollUrls] = React.useState({});  // { sceneIdx: url }

  // 加载 align 结果时, 预填 broll urls (从已存在的文件路径推断)
  React.useEffect(() => {
    if (!alignedScenes || !selectedTemplateId) return;
    // alignedScenes 可能含模板原 top_image / screen_image (相对路径), 转 url
    const initial = {};
    alignedScenes.forEach((s, i) => {
      const t = (s.type || "").toUpperCase();
      const rel = t === "B" ? s.top_image : t === "C" ? s.screen_image : null;
      if (rel) {
        // rel 形如 "assets/brolls/01-peixun-gaoxiao/b0_top.png"
        // mount 在 /skills/dhv5/brolls, 去掉 "assets/brolls/" prefix
        const cleaned = rel.replace(/^assets\/brolls\//, "");
        initial[i] = `/skills/dhv5/brolls/${cleaned}`;
      }
    });
    setBrollUrls(initial);
  }, [alignedScenes, selectedTemplateId]);

  async function generateBroll(idx, regen = false) {
    const scene = alignedScenes[idx];
    const t = (scene.type || "").toUpperCase();
    const promptField = t === "B" ? "top_image_prompt" : "screen_image_prompt";
    const promptInScene = scene[promptField] || "";
    const promptOriginal = scene[`__original_${promptField}`] || promptInScene;
    const promptChanged = promptInScene.trim() !== promptOriginal.trim();

    setGeneratingBrollIdx(idx); setErr("");
    try {
      const r = await api.post(
        `/api/dhv5/broll/${selectedTemplateId}/${idx}?regen=${regen ? 1 : 0}`,
        promptChanged ? { prompt_override: promptInScene.trim() } : {}
      );
      setBrollUrls(prev => ({ ...prev, [idx]: r.url + `?t=${Date.now()}` }));  // bust cache
    } catch (e) {
      setErr(e.message || "生图失败");
    } finally {
      setGeneratingBrollIdx(null);
    }
  }

  function backToSelect() {
    setStep("select");
  }

  // D-059d: 渲染 + 轮询
  const [renderTaskId, setRenderTaskId] = React.useState(null);
  const [renderTask, setRenderTask] = React.useState(null);  // 整个 task 对象
  const [rendering, setRendering] = React.useState(false);

  // D-077: 批量数字人 (N 段文案 → N 个视频, 共享 dh + template)
  const [batchMode, setBatchMode] = React.useState(false);
  const [batchTranscriptList, setBatchTranscriptList] = React.useState([{ id: `bt-${Date.now()}`, text: "" }]);
  const [batchTasks, setBatchTasks] = React.useState([]); // [{task_id, transcript}]
  const BATCH_MAX = 8;
  function addBatchTranscript() {
    setBatchTranscriptList(prev => prev.length >= BATCH_MAX ? prev : [...prev, { id: `bt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, text: "" }]);
  }
  function removeBatchTranscript(id) {
    setBatchTranscriptList(prev => prev.length > 1 ? prev.filter(p => p.id !== id) : prev);
  }
  function dupBatchTranscript(id) {
    setBatchTranscriptList(prev => {
      if (prev.length >= BATCH_MAX) return prev;
      const idx = prev.findIndex(p => p.id === id);
      if (idx < 0) return prev;
      const copy = { id: `bt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, text: prev[idx].text };
      return [...prev.slice(0, idx + 1), copy, ...prev.slice(idx + 1)];
    });
  }
  function updateBatchTranscript(id, text) {
    setBatchTranscriptList(prev => prev.map(p => p.id === id ? { ...p, text } : p));
  }
  const validBatchTranscripts = batchTranscriptList.map(p => (p.text || "").trim()).filter(Boolean);

  async function startBatchRender() {
    if (validBatchTranscripts.length === 0) { setErr("至少填一条文案"); return; }
    if (!dhVideoPath.trim() || !selectedTemplateId) { setErr("先选数字人 + 模板"); return; }
    setErr(""); setRendering(true);
    try {
      const r = await api.post("/api/dhv5/batch-render", {
        template_id: selectedTemplateId,
        digital_human_video: dhVideoPath,
        transcripts: validBatchTranscripts,
        align_mode: "auto",
      });
      setBatchTasks(r.tasks || []);
      setStep("review");
    } catch (e) {
      setErr(e.message || "批量提交失败");
    } finally {
      setRendering(false);
    }
  }

  async function startRender() {
    if (!alignedScenes || alignedScenes.length === 0) {
      setErr("没有 aligned scenes 可渲染"); return;
    }
    setRendering(true); setErr("");
    try {
      const r = await api.post("/api/dhv5/render", {
        template_id: selectedTemplateId,
        digital_human_video: dhVideoPath,
        scenes_override: alignedScenes,
      });
      setRenderTaskId(r.task_id);
      setRenderTask(null);
      setStep("review");
    } catch (e) {
      setErr(e.message || "触发渲染失败");
    } finally {
      setRendering(false);
    }
  }

  // step=review 时轮询 task 状态
  React.useEffect(() => {
    if (step !== "review" || !renderTaskId) return;
    let stop = false;
    async function poll() {
      try {
        const t = await api.get(`/api/tasks/${renderTaskId}`);
        if (stop) return;
        setRenderTask(t);
        if (t.status === "running") {
          setTimeout(poll, 3000);
        }
      } catch (e) {
        if (!stop) setErr(e.message);
      }
    }
    poll();
    return () => { stop = true; };
  }, [step, renderTaskId]);

  // 用同 mp4 再套一个模板 (用户拍板的核心价值)
  function reuseDhAndSwitchTemplate() {
    setStep("select");
    setSelectedTemplateId(null);
    setTranscript("");
    setAlignedScenes(null);
    setRenderTaskId(null);
    setRenderTask(null);
    setErr("");
    // dhVideoPath 保留 — 这就是"复用"
  }

  // STEP 路由
  if (step === "review") return renderReview();
  if (step === "align") return renderAlign();

  const filtered = !templates ? [] : templates.filter(t => {
    if (filterCategory !== "全部" && t.category !== filterCategory) return false;
    const bucket = DHV5_DURATION_BUCKETS.find(b => b.id === filterDuration) || DHV5_DURATION_BUCKETS[0];
    if (!bucket.test(t.duration_sec || 0)) return false;
    return true;
  });

  const selectedTemplate = templates?.find(t => t.id === selectedTemplateId) || null;
  const dhReady = !!dhVideoPath.trim();

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", background: T.bg, position: "relative", overflow: "hidden" }}>
      <Dhv5Header step="select" template={selectedTemplate} dhVideoPath={dhVideoPath} />

      <div style={{ flex: 1, overflow: "auto", padding: "24px 32px 80px" }}>
        <div style={{ maxWidth: 1080, margin: "0 auto" }}>
          {/* 顶部锁定: 数字人 mp4 (Step 1) */}
          <DhvHumanPicker
            value={dhVideoPath}
            onChange={setDhVideoPath}
            worksList={worksList}
            onLoadWorks={loadWorks}
            showPicker={showWorksPicker}
            setShowPicker={setShowWorksPicker}
            onPickWork={pickWork}
          />

          {err && (
            <div style={{ padding: 12, background: T.redSoft, color: T.red, borderRadius: 10, fontSize: 13, marginBottom: 14 }}>
              ⚠️ {err}
            </div>
          )}

          {/* 主区: 模板挑选 (Step 2) */}
          <div style={{ marginTop: 22, marginBottom: 14, display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ fontSize: 16, fontWeight: 600, color: T.text }}>选模板</div>
            <Tag size="xs" color="blue">{templates?.length || 0}</Tag>
            <div style={{ fontSize: 11.5, color: T.muted }}>
              · 三态 A/B/C 交替 (全屏真人 / 网格图+大字 / 手机屏+浮动头像)
            </div>
            <div style={{ flex: 1 }} />
            <span style={{ fontSize: 11, color: T.muted2 }} title="模板存储路径">
              templates/ 在 ~/Desktop/skills/digital-human-video-v5/
            </span>
          </div>

          {/* 筛选 chip */}
          <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
            {DHV5_CATEGORIES.map(c => (
              <button key={c} onClick={() => setFilterCategory(c)}
                style={{
                  padding: "4px 12px", fontSize: 11, borderRadius: 100, border: "none",
                  fontFamily: "inherit", cursor: "pointer",
                  background: filterCategory === c ? T.text : T.bg2,
                  color: filterCategory === c ? "#fff" : T.muted,
                  fontWeight: filterCategory === c ? 600 : 500,
                }}>{c}</button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
            {DHV5_DURATION_BUCKETS.map(b => (
              <button key={b.id} onClick={() => setFilterDuration(b.id)}
                style={{
                  padding: "3px 10px", fontSize: 10.5, borderRadius: 100, border: "none",
                  fontFamily: "inherit", cursor: "pointer",
                  background: filterDuration === b.id ? T.brand : T.bg2,
                  color: filterDuration === b.id ? "#fff" : T.muted,
                  fontWeight: filterDuration === b.id ? 600 : 500,
                }}>{b.label}</button>
            ))}
          </div>

          {/* 模板网格 */}
          {!templates ? (
            <div style={{ padding: 40, textAlign: "center", color: T.muted2 }}>加载中…</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 40, background: "#fff", border: `1px dashed ${T.border}`, borderRadius: 12, textAlign: "center", color: T.muted }}>
              {templates.length === 0
                ? <>
                    <div style={{ fontSize: 32, marginBottom: 10 }}>📂</div>
                    <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6, color: T.text }}>还没有模板</div>
                    <div style={{ fontSize: 12 }}>到 ~/Desktop/skills/digital-human-video-v5/templates/ 加 .yaml 文件</div>
                  </>
                : <>当前筛选下没匹配的模板 · 改下筛选试试</>}
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
              {filtered.map(t => (
                <DhvTemplateCard key={t.id} template={t}
                  selected={selectedTemplateId === t.id}
                  onSelect={() => setSelectedTemplateId(t.id)} />
              ))}
            </div>
          )}

          {/* 选中后 Next CTA */}
          {selectedTemplate && (
            <div style={{ marginTop: 22, padding: 16, background: "#fff", border: `1.5px solid ${T.brand}`, boxShadow: `0 0 0 4px ${T.brandSoft}`, borderRadius: 12, display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{ fontSize: 26 }}>✓</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: T.text }}>已选: {selectedTemplate.name}</div>
                <div style={{ fontSize: 12, color: T.muted, marginTop: 3 }}>
                  时长 {selectedTemplate.duration_sec}s · 字数预算 ~{selectedTemplate.word_budget} ·
                  scenes A{selectedTemplate.scenes_breakdown?.A || 0}+B{selectedTemplate.scenes_breakdown?.B || 0}+C{selectedTemplate.scenes_breakdown?.C || 0}
                </div>
              </div>
              <Btn variant="outline" onClick={() => setSelectedTemplateId(null)}>换一个</Btn>
              <Btn variant="primary" disabled={!dhReady} onClick={goToAlign}>
                {dhReady ? "下一步: 文案对齐 →" : "↑ 先填数字人 mp4 路径"}
              </Btn>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  function renderAlign() {
    return (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", background: T.bg, position: "relative", overflow: "hidden" }}>
        <Dhv5Header step="align" onBack={backToSelect}
          template={selectedTemplate} dhVideoPath={dhVideoPath} />
        <div style={{ flex: 1, overflow: "auto", padding: "24px 32px 80px" }}>
          <div style={{ maxWidth: 1080, margin: "0 auto" }}>
            {/* 错误提示 */}
            {err && <div style={{ padding: 12, background: T.redSoft, color: T.red, borderRadius: 10, fontSize: 13, marginBottom: 14 }}>⚠️ {err}</div>}

            {/* D-077: 单 / 批量 文案 toggle */}
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}>
              <div style={{ display: "inline-flex", gap: 4, padding: 4, background: T.bg2, borderRadius: 100, border: `1px solid ${T.borderSoft}` }}>
                <button onClick={() => setBatchMode(false)} style={dhvPillStyle(!batchMode)}>📝 单文案</button>
                <button onClick={() => setBatchMode(true)} style={dhvPillStyle(batchMode)}>📦 批量文案</button>
              </div>
            </div>

            {/* 批量模式: 文案卡片列表 + 共享数字人/模板 + 直接提交 */}
            {batchMode && (
              <div style={{ background: "#fff", border: `1.5px solid ${T.brand}`, boxShadow: `0 0 0 5px ${T.brandSoft}`, borderRadius: 14, padding: 14, marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <div style={{ fontSize: 11.5, color: T.muted2, fontWeight: 600, letterSpacing: "0.08em" }}>📝 文案列表</div>
                  <span style={{ fontSize: 11, color: T.muted2 }}>{batchTranscriptList.length} 条 · 上限 {BATCH_MAX}</span>
                  <div style={{ flex: 1 }} />
                  <span style={{ fontSize: 11, color: T.muted2 }}>共享数字人 + 共享模板 ({selectedTemplate?.id})</span>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {batchTranscriptList.map((bt, idx) => (
                    <DhvTranscriptCard key={bt.id} idx={idx + 1} text={bt.text}
                      onChange={t => updateBatchTranscript(bt.id, t)}
                      onDup={() => dupBatchTranscript(bt.id)}
                      onRemove={batchTranscriptList.length > 1 ? () => removeBatchTranscript(bt.id) : null} />
                  ))}
                  {batchTranscriptList.length < BATCH_MAX && (
                    <div onClick={addBatchTranscript} style={{
                      padding: 10, border: `1.5px dashed ${T.border}`, borderRadius: 10,
                      textAlign: "center", color: T.muted, fontSize: 12.5, cursor: "pointer", background: T.bg2,
                      fontFamily: "inherit",
                    }}>+ 添加文案</div>
                  )}
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12, paddingTop: 12, borderTop: `1px solid ${T.borderSoft}` }}>
                  <div style={{ fontSize: 11.5, color: T.muted2 }}>
                    共 {validBatchTranscripts.length} 条有内容 · 每条 ~3-10min · 并发起 ≈ 1 条耗时
                  </div>
                  <div style={{ flex: 1 }} />
                  <Btn variant="outline" onClick={backToSelect}>← 改模板</Btn>
                  <Btn variant="primary" onClick={startBatchRender} disabled={rendering || validBatchTranscripts.length === 0}>
                    {rendering ? "提交中…" : `▶ 批量起渲染 ${validBatchTranscripts.length} 条`}
                  </Btn>
                </div>
              </div>
            )}

            {/* 单文案模式: 现有 align UI (mode 选择 + transcript 输入) */}
            {!batchMode && (<>

            {/* mode 选择 + transcript 输入 */}
            <div style={{ background: "#fff", border: `1px solid ${T.borderSoft}`, borderRadius: 12, padding: 16, marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: T.text }}>对齐模式</div>
                <div style={{ display: "flex", gap: 6 }}>
                  {[
                    { id: "auto", label: "AI 自动切", desc: "走 deepseek 把 transcript 切到每个 scene" },
                    { id: "placeholder", label: "用模板原字段", desc: "模板里 cover_title/scenes 字段直接用" },
                    { id: "manual", label: "手动填", desc: "字段留空, 自己一行行填" },
                  ].map(m => (
                    <button key={m.id} onClick={() => setAlignMode(m.id)} title={m.desc}
                      style={{
                        padding: "5px 12px", fontSize: 11.5, borderRadius: 100, border: "none",
                        fontFamily: "inherit", cursor: "pointer",
                        background: alignMode === m.id ? T.text : T.bg2,
                        color: alignMode === m.id ? "#fff" : T.muted,
                        fontWeight: alignMode === m.id ? 600 : 500,
                      }}>{m.label}</button>
                  ))}
                </div>
                <div style={{ flex: 1 }} />
                <Btn variant="primary" onClick={runAlign} disabled={aligning}>
                  {aligning ? "对齐中…" : (alignedScenes ? "🔄 重新对齐" : "▶ 开始对齐")}
                </Btn>
              </div>
              {alignMode === "auto" && (
                <textarea
                  value={transcript}
                  onChange={e => setTranscript(e.target.value)}
                  placeholder="贴数字人念的整段 transcript (可从公众号草稿 / 转写 / 自己写)"
                  rows={6}
                  style={{
                    width: "100%", padding: 12, border: `1px solid ${T.borderSoft}`,
                    borderRadius: 8, fontSize: 13, fontFamily: "inherit",
                    outline: "none", resize: "vertical", lineHeight: 1.7,
                  }} />
              )}
              {alignMode === "auto" && (
                <div style={{ fontSize: 11, color: T.muted2, marginTop: 6 }}>
                  {transcript.length} 字 · 模板预算 ~{selectedTemplate?.word_budget || "?"} 字 ·
                  {transcript.length > 0 && selectedTemplate
                    ? ` 比预算 ${transcript.length > selectedTemplate.word_budget ? "多" : "少"} ${Math.abs(transcript.length - selectedTemplate.word_budget)} 字`
                    : ""}
                </div>
              )}
            </div>

            {/* 对齐结果 - scenes 卡片网格 */}
            {alignedScenes && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: T.text, marginBottom: 4 }}>
                  🎬 {alignedScenes.length} 个 scenes · 内联编辑下面的字段
                </div>
                {alignedScenes.map((s, i) => (
                  <Dhv5SceneRow key={i} idx={i} scene={s}
                    onChange={(field, v) => updateSceneField(i, field, v)}
                    expanded={expandedSceneIdx === i}
                    onToggleExpand={() => setExpandedSceneIdx(prev => prev === i ? null : i)}
                    brollUrl={brollUrls[i]}
                    generating={generatingBrollIdx === i}
                    onGenerate={(regen) => generateBroll(i, regen)} />
                ))}

                <div style={{ marginTop: 18, padding: 16, background: "#fff", border: `1.5px solid ${T.brand}`, boxShadow: `0 0 0 4px ${T.brandSoft}`, borderRadius: 12, display: "flex", alignItems: "center", gap: 14 }}>
                  <div style={{ fontSize: 26 }}>✓</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: T.text }}>对齐完成 · 共 {alignedScenes.length} scene</div>
                    <div style={{ fontSize: 12, color: T.muted, marginTop: 3 }}>
                      下一步: D-059d 触发渲染 (调 /api/dhv5/render 异步走 task 池, 真跑 3-10 分钟)
                    </div>
                  </div>
                  <Btn variant="outline" onClick={backToSelect}>← 改模板</Btn>
                  <Btn variant="primary" onClick={startRender} disabled={rendering}>
                    {rendering ? "提交中…" : "▶ 开始渲染 (3-10 分钟)"}
                  </Btn>
                </div>
              </div>
            )}
            </>)}
          </div>
        </div>
      </div>
    );
  }

  function renderReview() {
    // D-077: 批量模式专属 review (N 个 task 卡片)
    if (batchMode && batchTasks.length > 0) {
      return (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", background: T.bg, position: "relative", overflow: "hidden" }}>
          <Dhv5Header step="review" template={selectedTemplate} dhVideoPath={dhVideoPath}
            onBack={() => setStep("align")} />
          <div style={{ flex: 1, overflow: "auto", padding: "24px 32px 80px" }}>
            <div style={{ maxWidth: 1200, margin: "0 auto" }}>
              <div style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 20, fontWeight: 700 }}>📦 批量数字人渲染中 · {batchTasks.length} 个 task</div>
                  <div style={{ fontSize: 12, color: T.muted, marginTop: 4 }}>
                    每个 ~3-10min · 并发起跑 · 完成后自动入作品库
                  </div>
                </div>
                <Btn variant="outline" onClick={() => { setBatchTasks([]); setStep("align"); }}>← 改文案</Btn>
                <Btn variant="primary" onClick={() => {
                  setBatchTasks([]); setStep("align");
                  setBatchTranscriptList([{ id: `bt-${Date.now()}`, text: "" }]);
                }}>📦 再来一批</Btn>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))", gap: 14 }}>
                {batchTasks.map((t, i) => (
                  <DhvBatchTaskCard key={t.task_id} taskId={t.task_id} transcript={t.transcript} idx={i + 1} />
                ))}
              </div>
            </div>
          </div>
        </div>
      );
    }

    const status = renderTask?.status || "running";
    const result = renderTask?.result || null;
    const errLog = renderTask?.error;
    const elapsed = renderTask?.elapsed_sec || 0;
    const progress = renderTask?.progress_text || "排队中…";
    const isDone = status === "success";
    const isFailed = status === "failed" || status === "cancelled";

    return (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", background: T.bg, position: "relative", overflow: "hidden" }}>
        <Dhv5Header step="review" template={selectedTemplate} dhVideoPath={dhVideoPath}
          onBack={status === "running" ? null : () => setStep("align")} />
        <div style={{ flex: 1, overflow: "auto", padding: "24px 32px 80px" }}>
          <div style={{ maxWidth: 720, margin: "0 auto" }}>
            {err && <div style={{ padding: 12, background: T.redSoft, color: T.red, borderRadius: 10, fontSize: 13, marginBottom: 14 }}>⚠️ {err}</div>}

            {/* 状态卡片 */}
            <div style={{ padding: 24, background: "#fff", border: `1px solid ${T.borderSoft}`, borderRadius: 12, marginBottom: 16 }}>
              {!renderTask ? (
                <div style={{ textAlign: "center", color: T.muted2 }}>
                  <div style={{ fontSize: 32, marginBottom: 10 }}>⏳</div>
                  <div style={{ fontSize: 14 }}>提交中…</div>
                </div>
              ) : status === "running" ? (
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 36, marginBottom: 10, animation: "qlspin 2s linear infinite", display: "inline-block" }}>⚙️</div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: T.text, marginBottom: 6 }}>渲染中… 已 {elapsed}s</div>
                  <div style={{ fontSize: 12, color: T.muted, marginBottom: 12 }}>{progress}</div>
                  <div style={{ fontSize: 11, color: T.muted2 }}>
                    PIL plate + ffmpeg 合成 · 通常 3-10 分钟 · 可以离开页面, 走 task 池后台跑
                  </div>
                </div>
              ) : isFailed ? (
                <div>
                  <div style={{ textAlign: "center", marginBottom: 16 }}>
                    <div style={{ fontSize: 36, marginBottom: 8 }}>❌</div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: T.red }}>渲染失败</div>
                  </div>
                  <div style={{ padding: 12, background: T.redSoft, color: T.red, borderRadius: 8, fontSize: 11.5, fontFamily: "SF Mono, monospace", whiteSpace: "pre-wrap", maxHeight: 240, overflow: "auto" }}>
                    {errLog || "(无错误信息)"}
                  </div>
                </div>
              ) : isDone ? (
                <div>
                  <div style={{ textAlign: "center", marginBottom: 16 }}>
                    <div style={{ fontSize: 36, marginBottom: 8 }}>✅</div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: T.brand }}>渲染完成 · 耗时 {elapsed}s</div>
                  </div>
                  {result?.output_url && (
                    <video src={api.media(result.output_url)} controls
                      style={{ width: "100%", maxHeight: 540, borderRadius: 8, background: "#000", display: "block" }} />
                  )}
                  <div style={{ marginTop: 10, fontSize: 11, color: T.muted2, fontFamily: "SF Mono, monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    📁 {result?.output_path || ""}
                    {result?.size_bytes ? ` · ${(result.size_bytes / 1024 / 1024).toFixed(1)} MB` : ""}
                  </div>
                </div>
              ) : null}
            </div>

            {/* CTA: 用同 mp4 再套一个模板 (复用闭环 — 用户拍板核心价值) */}
            {(isDone || isFailed) && (
              <div style={{ padding: 16, background: "#fff", border: `1.5px solid ${T.brand}`, boxShadow: `0 0 0 4px ${T.brandSoft}`, borderRadius: 12, display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ fontSize: 26 }}>♻️</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: T.text }}>用同一段数字人 mp4 再套一个模板?</div>
                  <div style={{ fontSize: 12, color: T.muted, marginTop: 3 }}>
                    数字人投入一次, 套不同模板出 N 版 — v5 的核心价值
                  </div>
                </div>
                <Btn variant="outline" onClick={() => setStep("align")}>← 回对齐</Btn>
                <Btn variant="primary" onClick={reuseDhAndSwitchTemplate}>
                  ↻ 再套一个模板
                </Btn>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }
}

// ─── 顶部锁定: 数字人 mp4 选择 ─────────────────────────────
function DhvHumanPicker({ value, onChange, worksList, onLoadWorks, showPicker, setShowPicker, onPickWork }) {
  return (
    <div style={{ padding: 14, background: "#fff", border: `1px solid ${T.borderSoft}`, borderRadius: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <div style={{ width: 22, height: 22, borderRadius: 6, background: T.brandSoft, color: T.brand, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700 }}>1</div>
        <div style={{ fontSize: 14, fontWeight: 600, color: T.text }}>数字人 mp4 (上游, 一次做完可复用)</div>
        <div style={{ flex: 1 }} />
        <Btn size="sm" variant="outline" onClick={() => { setShowPicker(!showPicker); if (!showPicker) onLoadWorks(); }}>
          {showPicker ? "× 关" : "📂 从作品库挑"}
        </Btn>
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="本地 mp4 绝对路径, 例: /Users/.../works/xxx.mp4 (柿榴出的)"
          style={{
            flex: 1, padding: "8px 12px", border: `1px solid ${T.border}`, borderRadius: 8,
            fontSize: 12, fontFamily: "SF Mono, Menlo, monospace", outline: "none", background: "#fff",
          }} />
        {value.trim() && (
          <Tag size="xs" color="green">已填</Tag>
        )}
      </div>
      {showPicker && (
        <div style={{ marginTop: 12, maxHeight: 240, overflow: "auto", background: T.bg2, borderRadius: 8, padding: 8 }}>
          {worksList === null ? (
            <div style={{ padding: 20, textAlign: "center", color: T.muted2, fontSize: 12 }}>加载作品库…</div>
          ) : worksList.length === 0 ? (
            <div style={{ padding: 20, textAlign: "center", color: T.muted2, fontSize: 12 }}>
              作品库还没有数字人 mp4 · 去 🎬 做视频 先做一段
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {worksList.slice(0, 30).map(w => (
                <div key={w.id} onClick={() => { onChange(w.local_url || ""); onPickWork(w); }}
                  style={{
                    padding: "8px 10px", background: "#fff", borderRadius: 6, cursor: "pointer",
                    fontSize: 12, display: "flex", gap: 8, alignItems: "center",
                  }}>
                  <span style={{ color: T.muted2, fontFamily: "SF Mono, monospace" }}>#{w.id}</span>
                  <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{w.title || "(无标题)"}</span>
                  <Tag size="xs" color="blue">{w.status}</Tag>
                </div>
              ))}
              <div style={{ padding: "6px 10px", fontSize: 10.5, color: T.muted2, textAlign: "center" }}>
                ⚠️ 当前 picker 仅显示, 实际路径需手填 — 因 works API 暂只返 /media URL
                (D-059c 会加 work_id → 绝对路径解析)
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── 模板卡片 ─────────────────────────────────────────────
function DhvTemplateCard({ template: t, selected, onSelect }) {
  const sb = t.scenes_breakdown || {};
  return (
    <div onClick={onSelect} style={{
      padding: 12, background: "#fff", borderRadius: 10, cursor: "pointer",
      border: selected ? `2px solid ${T.brand}` : `1px solid ${T.borderSoft}`,
      boxShadow: selected ? `0 0 0 4px ${T.brandSoft}` : "none",
      transition: "all 0.15s",
    }}>
      {/* 样片预览或封面文字占位 */}
      <div style={{
        aspectRatio: "9/16", borderRadius: 6, marginBottom: 10,
        background: t.sample_video ? "#000" : "linear-gradient(135deg, #1a1a2e, #16213e, #0f3460)",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        padding: 16, color: "#fff", textAlign: "center", overflow: "hidden",
      }}>
        {t.sample_video ? (
          <video src={api.media(t.sample_video)} controls
            style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <>
            <div style={{ fontSize: 18, fontWeight: 800, color: "#E8D38A", lineHeight: 1.3, marginBottom: 8 }}>
              {t.cover_title || t.name}
            </div>
            <div style={{ fontSize: 9, opacity: 0.5 }}>样片缺失 · 渲一次后会自动显</div>
          </>
        )}
      </div>
      {/* 模板信息 */}
      <div style={{ fontSize: 13, fontWeight: 600, color: T.text, marginBottom: 4 }}>{t.name}</div>
      <div style={{ fontSize: 11, color: T.muted, marginBottom: 6, lineHeight: 1.5,
        display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
        {t.description || "(无描述)"}
      </div>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", fontSize: 10.5 }}>
        {t.category && t.category !== "未分类" && <Tag size="xs" color="amber">{t.category}</Tag>}
        <Tag size="xs" color="blue">{t.duration_sec}s</Tag>
        <Tag size="xs" color="gray">~{t.word_budget}字</Tag>
        <Tag size="xs" color="gray">A{sb.A || 0}/B{sb.B || 0}/C{sb.C || 0}</Tag>
      </div>
    </div>
  );
}

// ─── Dhv5Header (3 步骤进度条 + 上下文回显) ─────────────────
const DHV5_STEPS = [
  { id: "select", n: 1, label: "选模板" },
  { id: "align",  n: 2, label: "文案对齐" },
  { id: "review", n: 3, label: "渲染" },
];

function Dhv5Header({ step, template, dhVideoPath, onBack }) {
  return (
    <div style={{ padding: "12px 24px", background: "#fff", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 14, flexShrink: 0 }}>
      <div style={{ width: 26, height: 26, borderRadius: 7, background: T.text, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13 }}>🎬</div>
      <div style={{ fontSize: 13.5, fontWeight: 600 }}>v5 模板成片</div>

      {/* 步骤 dots */}
      <div style={{ display: "flex", alignItems: "center", gap: 4, marginLeft: 8 }}>
        {DHV5_STEPS.map((s, i) => {
          const active = s.id === step;
          const currentIdx = DHV5_STEPS.findIndex(x => x.id === step);
          const done = currentIdx > i;
          return (
            <React.Fragment key={s.id}>
              <div style={{
                display: "flex", alignItems: "center", gap: 5, padding: "4px 10px 4px 5px", borderRadius: 100, fontSize: 11.5, fontWeight: 500,
                background: active ? T.text : "transparent",
                color: active ? "#fff" : done ? T.brand : T.muted,
                whiteSpace: "nowrap", flexShrink: 0,
              }}>
                <div style={{
                  width: 18, height: 18, borderRadius: "50%",
                  background: active ? "#fff" : done ? T.brandSoft : T.bg2,
                  color: active ? T.text : done ? T.brand : T.muted2,
                  display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700,
                }}>{done ? "✓" : s.n}</div>
                {s.label}
              </div>
              {i < DHV5_STEPS.length - 1 && <span style={{ color: T.muted3, fontSize: 10 }}>—</span>}
            </React.Fragment>
          );
        })}
      </div>

      {/* 已选信息回显 (非 select 步显示) */}
      {step !== "select" && template && (
        <div style={{ marginLeft: 12, display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: T.muted }}>
          <span>📋 {template.name}</span>
          <span style={{ color: T.muted3 }}>·</span>
          <span title={dhVideoPath} style={{ maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            🎬 {dhVideoPath?.split("/").pop() || "(未填)"}
          </span>
        </div>
      )}

      <div style={{ flex: 1 }} />
      <ApiStatusLight />
      {onBack && <button onClick={onBack}
        style={{ background: "transparent", border: "none", color: T.muted, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
        ← 返回选模板
      </button>}
    </div>
  );
}

// ─── Dhv5SceneRow (单 scene · 内联编辑 + B/C broll 展开 D-060c) ─
function Dhv5SceneRow({ idx, scene, onChange, expanded, onToggleExpand, brollUrl, generating, onGenerate }) {
  const t = (scene.type || "").toUpperCase();
  const isB = t === "B";
  const isC = t === "C";
  const hasBroll = isB || isC;
  const fieldKey = isB ? "big_text" : "subtitle";
  const fieldVal = scene[fieldKey] || "";
  const sceneColor = t === "A" ? T.brand : t === "B" ? T.amber : T.text;
  const promptField = isB ? "top_image_prompt" : "screen_image_prompt";
  const promptVal = scene[promptField] || "";

  return (
    <div style={{
      background: "#fff",
      border: `1px solid ${expanded ? T.brand + "55" : T.borderSoft}`,
      borderRadius: 10,
      transition: "border-color 0.1s",
    }}>
      {/* 主行 (C12 polish: padding + fontSize 略升, broll 按钮颜色加重) */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", fontSize: 12.5,
      }}>
        <span style={{ color: T.muted2, fontFamily: "SF Mono, monospace", fontSize: 11, minWidth: 22 }}>#{idx + 1}</span>
        <span title={`${t} 型 · ${(scene.start || 0).toFixed(1)}s - ${(scene.end || 0).toFixed(1)}s`}
          style={{
            width: 24, height: 24, borderRadius: "50%", background: sceneColor, color: "#fff",
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11.5, fontWeight: 700,
            flexShrink: 0,
          }}>{t}</span>
        <span style={{ color: T.muted2, fontFamily: "SF Mono, monospace", fontSize: 10.5, minWidth: 70 }}>
          {(scene.start || 0).toFixed(1)}-{(scene.end || 0).toFixed(1)}s
        </span>
        <input
          value={fieldVal}
          onChange={e => onChange(fieldKey, e.target.value)}
          placeholder={isB ? "大字金句 4-10 字" : "字幕 8-18 字"}
          style={{
            flex: 1, padding: "7px 10px", border: `1px solid ${T.borderSoft}`, borderRadius: 6,
            fontSize: 13, fontFamily: "inherit", outline: "none", background: "#fff",
          }} />
        <span style={{ fontSize: 10.5, color: fieldVal.length > (isB ? 10 : 18) ? T.red : T.muted3, fontFamily: "SF Mono, monospace", minWidth: 32, textAlign: "right" }}>
          {fieldVal.length}/{isB ? 10 : 18}
        </span>
        {hasBroll && (
          <button onClick={onToggleExpand}
            title={expanded ? "收起 B-roll panel" : "展开 B-roll panel · 改 prompt + 重生图"}
            style={{
              padding: "5px 10px", fontSize: 11, borderRadius: 100, border: `1px solid ${expanded ? T.brand : T.borderSoft}`,
              background: expanded ? T.brandSoft : "#fff",
              color: expanded ? T.brand : (brollUrl ? T.muted : T.amber),
              cursor: "pointer", fontFamily: "inherit", fontWeight: 500,
              display: "inline-flex", alignItems: "center", gap: 4,
            }}>
            {brollUrl ? "📷" : "📷 缺图"} {expanded ? "▲" : "▼"}
          </button>
        )}
      </div>
      {/* 展开面板 (仅 B/C) */}
      {hasBroll && expanded && (
        <div style={{ borderTop: `1px solid ${T.borderSoft}`, padding: 12, display: "flex", gap: 12, background: T.bg2 }}>
          {/* broll 缩略 */}
          <div style={{
            width: isB ? 160 : 90, aspectRatio: isB ? "4/3" : "9/16",
            borderRadius: 6, overflow: "hidden", flexShrink: 0,
            background: brollUrl ? "#000" : T.bg3,
            display: "flex", alignItems: "center", justifyContent: "center",
            color: T.muted2, fontSize: 10, textAlign: "center", padding: 8,
            border: `1px solid ${T.borderSoft}`,
          }}>
            {brollUrl ? (
              <img src={api.media(brollUrl)} alt="broll"
                style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            ) : (
              <div>未生<br />{isB ? "4:3" : "9:16"}</div>
            )}
          </div>
          {/* prompt 编辑 + 操作 */}
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 8 }}>
            <textarea
              value={promptVal}
              onChange={e => onChange(promptField, e.target.value)}
              placeholder={`${isB ? "横版 4:3" : "竖版 9:16"} broll prompt (可改)`}
              rows={3}
              style={{
                width: "100%", padding: 8, border: `1px solid ${T.borderSoft}`, borderRadius: 6,
                fontSize: 11.5, fontFamily: "inherit", outline: "none", resize: "vertical",
                lineHeight: 1.6, background: "#fff",
              }} />
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ fontSize: 10, color: T.muted2, fontFamily: "SF Mono, monospace" }}>
                走 ~/.claude/skills/poju-image-gen apimart · 30-60s/张
              </span>
              <div style={{ flex: 1 }} />
              {brollUrl && (
                <Btn size="sm" variant="outline" onClick={() => onGenerate(true)} disabled={generating}>
                  {generating ? "生图中…" : "🔄 重生"}
                </Btn>
              )}
              {!brollUrl && (
                <Btn size="sm" variant="primary" onClick={() => onGenerate(false)} disabled={generating}>
                  {generating ? "生图中…" : "🎨 生这张"}
                </Btn>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


// ─── D-077: 批量数字人 helpers + 组件 ───────────────────────

function dhvPillStyle(active) {
  return {
    padding: "5px 14px", fontSize: 12, fontWeight: 600,
    background: active ? "#fff" : "transparent",
    color: active ? T.brand : T.muted,
    border: "none", borderRadius: 100, cursor: "pointer",
    fontFamily: "inherit",
    boxShadow: active ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
  };
}

function DhvTranscriptCard({ idx, text, onChange, onDup, onRemove }) {
  const charCount = (text || "").length;
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
          {charCount} 字 · 预计 ~3-10min
        </div>
        <div style={{ flex: 1 }} />
        <button onClick={onDup} title="复制" style={{
          cursor: "pointer", padding: "2px 6px", borderRadius: 4,
          fontSize: 12, color: T.muted, lineHeight: 1,
          background: "transparent", border: "none", fontFamily: "inherit",
        }}>📋</button>
        {onRemove && <button onClick={onRemove} title="删除" style={{
          cursor: "pointer", padding: "2px 6px", borderRadius: 4,
          fontSize: 12, color: T.muted, lineHeight: 1,
          background: "transparent", border: "none", fontFamily: "inherit",
        }}>✕</button>}
      </div>
      <textarea rows={3} value={text} onChange={e => onChange(e.target.value)}
        placeholder={`第 ${idx} 段文案 · 数字人念的整段 transcript`}
        style={{
          width: "100%", border: "none", outline: "none", resize: "vertical",
          background: "transparent", fontSize: 12.5, fontFamily: "inherit",
          color: T.text, lineHeight: 1.6, padding: 0, minHeight: 60,
        }} />
    </div>
  );
}

function DhvBatchTaskCard({ taskId, transcript, idx }) {
  const poller = useTaskPoller(taskId);
  const result = poller.task?.result || null;
  const elapsed = poller.elapsedSec || 0;
  const pct = poller.progressPct || (poller.isRunning ? 15 : 0);

  return (
    <div style={{
      background: "#fff",
      border: `1px solid ${poller.isOk ? T.brand : poller.isFailed ? T.red : T.borderSoft}`,
      borderRadius: 12, padding: 12, display: "flex", flexDirection: "column", gap: 10,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{
          width: 24, height: 24, borderRadius: "50%", background: T.brandSoft,
          color: T.brand, fontSize: 11, fontWeight: 700,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>{idx}</div>
        <div style={{ fontSize: 11, color: T.muted2 }}>
          {result?.scenes_count ? `${result.scenes_count} scenes` : "对齐中"}
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ fontSize: 11, color: T.muted }}>{elapsed}s</div>
      </div>

      <div style={{ fontSize: 12, color: T.text, lineHeight: 1.5, maxHeight: 60, overflow: "hidden", textOverflow: "ellipsis" }}>
        {transcript}
      </div>

      {poller.isRunning && (
        <div>
          <div style={{ fontSize: 11, color: T.muted, marginBottom: 4 }}>{poller.progressText || "排队中..."}</div>
          <div style={{ height: 4, background: T.bg2, borderRadius: 2, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${pct}%`, background: T.brand, transition: "width 0.5s" }} />
          </div>
        </div>
      )}

      {poller.isFailed && (
        <div style={{ fontSize: 11, color: T.red, padding: 8, background: T.redSoft, borderRadius: 6 }}>
          ⚠ {poller.error || "渲染失败"}
        </div>
      )}

      {poller.isOk && result?.output_url && (
        <div style={{ background: T.bg2, borderRadius: 6, overflow: "hidden" }}>
          <video src={result.output_url} controls style={{ width: "100%", display: "block" }} />
          <div style={{ fontSize: 10, color: T.muted2, padding: "4px 8px", fontFamily: "SF Mono, monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {(result.output_path || "").split("/").pop()} · {Math.round((result.size_bytes || 0) / 1024)} KB
          </div>
        </div>
      )}
    </div>
  );
}


Object.assign(window, { PageDhv5 });
