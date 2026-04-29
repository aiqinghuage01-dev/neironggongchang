// factory-image-gen.jsx — 🖼️ 直接出图 (D-064b · 2026-04-26)
// 独立 sidebar 入口, 不绑定业务流程. 用户 prompt + size + 引擎 → 出 N 张候选, 直接复制/下载.
// 跟即梦 standalone 对称, 但走 image_engine 抽象 (默认 apimart, 可切 dreamina).

const IMG_GEN_SIZES = [
  { id: "16:9", label: "16:9 横版", desc: "封面/banner" },
  { id: "9:16", label: "9:16 竖版", desc: "短视频封面/小红书" },
  { id: "1:1",  label: "1:1 方版",   desc: "朋友圈/头像" },
  { id: "3:4",  label: "3:4 竖版",   desc: "公众号/海报" },
  { id: "4:3",  label: "4:3 横版",   desc: "ppt/网页配图" },
];

function PageImageGen({ onNav }) {
  const [prompt, setPrompt] = React.useState("");
  const [size, setSize] = React.useState("16:9");
  const [n, setN] = React.useState(2);
  const [imgEngine, setImgEngine, defaultImgEngine, isImgOverride] = useImageEngine();
  const [taskId, setTaskId] = useTaskPersist("imagegen");
  const [result, setResult] = React.useState(null);
  const [err, setErr] = React.useState("");

  // D-076: 批量模式 (N prompt × n 张). 单跑保持原状.
  const [batchMode, setBatchMode] = React.useState(false);
  // D-076 preset: general (通用 prompts) / wechat-cover (公众号标题 → 封面批量)
  const [batchPreset, setBatchPreset] = React.useState("general");
  const [promptList, setPromptList] = React.useState([{ id: `p-${Date.now()}`, text: "" }]);
  const [batchTasks, setBatchTasks] = React.useState([]); // [{task_id, prompt}]
  const PROMPT_MAX = 20;
  const isCoverPreset = batchPreset === "wechat-cover";
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

  // D-073: 参考图 — 最多 4 张, 上传后转 base64 data URL 跟生图请求一起传
  // 每条结构: { id, data_url, name, size_bytes, uploading?, error? }
  const [refs, setRefs] = React.useState([]);
  const fileInputRef = React.useRef(null);

  async function uploadRefs(files) {
    const remaining = 4 - refs.length;
    if (remaining <= 0) return;
    const list = Array.from(files).slice(0, remaining);
    // 先插占位 (uploading 状态)
    const placeholders = list.map((f, i) => ({
      id: `tmp-${Date.now()}-${i}`, name: f.name, size_bytes: f.size, uploading: true,
    }));
    setRefs(prev => [...prev, ...placeholders]);

    for (let i = 0; i < list.length; i++) {
      const f = list[i];
      const ph = placeholders[i];
      try {
        const r = await api.upload("/api/image/upload-ref", f);
        setRefs(prev => prev.map(x => x.id === ph.id ? {
          ...x, uploading: false, data_url: r.data_url, mime: r.mime,
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

  const poller = useTaskPoller(taskId, {
    onComplete: (r) => { setResult(r); setTaskId(null); },
    onError: (e) => { setErr(e || "生图失败"); },
  });

  const readyRefs = refs.filter(r => r.data_url && !r.error).map(r => r.data_url);

  async function generate() {
    if (!prompt.trim()) return;
    setErr(""); setResult(null); setTaskId(null);
    try {
      if (readyRefs.length > 0 && imgEngine === "dreamina") {
        setErr("即梦引擎暂不支持参考图, 切回 apimart 试试");
        return;
      }
      const r = await api.post("/api/image/generate", {
        prompt: prompt.trim(), size, n, engine: imgEngine, label: "gen",
        refs: readyRefs,
      });
      setTaskId(r.task_id);
    } catch (e) { setErr(e.message); }
  }

  // D-076: 批量提交 — N prompt × n 张, 立即返 N 个 task_id
  const batchPrompts = promptList.map(p => (p.text || "").trim()).filter(Boolean);
  async function generateBatch() {
    if (batchPrompts.length === 0) { setErr("至少填一条" + (isCoverPreset ? "标题" : "prompt")); return; }
    setErr(""); setBatchTasks([]); setResult(null); setTaskId(null);
    try {
      if (isCoverPreset) {
        // 公众号封面批量: 调 /api/wechat/cover-batch (titles + n + engine, 锁 16:9, 不接参考图)
        const r = await api.post("/api/wechat/cover-batch", {
          titles: batchPrompts, n, engine: imgEngine,
        });
        setBatchTasks((r.tasks || []).map(t => ({ task_id: t.task_id, prompt: t.title })));
        return;
      }
      if (readyRefs.length > 0 && imgEngine === "dreamina") {
        setErr("即梦引擎暂不支持参考图, 切回 apimart 试试");
        return;
      }
      const r = await api.post("/api/image/batch-generate", {
        prompts: batchPrompts, size, n, engine: imgEngine, label: "gen",
        refs: readyRefs,
      });
      setBatchTasks(r.tasks || []);
    } catch (e) { setErr(e.message); }
  }

  function retry() { setErr(""); setResult(null); setTaskId(null); generate(); }
  function reset() { setResult(null); setTaskId(null); setErr(""); setBatchTasks([]); }

  // wfState (refs 不持久化 — 临时素材, 切页就该丢)
  const wfState = { prompt, size, n, result, taskId, batchMode, promptList, batchTasks };
  const wfRestore = (s) => {
    if (s.prompt != null) setPrompt(s.prompt);
    if (s.size) setSize(s.size);
    if (typeof s.n === "number") setN(s.n);
    if (s.result) setResult(s.result);
    if (s.taskId) setTaskId(s.taskId);
    if (typeof s.batchMode === "boolean") setBatchMode(s.batchMode);
    if (Array.isArray(s.promptList) && s.promptList.length > 0) setPromptList(s.promptList);
    if (Array.isArray(s.batchTasks)) setBatchTasks(s.batchTasks);
  };
  const wf = useWorkflowPersist({ ns: "imagegen", state: wfState, onRestore: wfRestore });

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", background: T.bg, position: "relative", overflow: "hidden" }}>
      <div style={{ padding: "12px 24px", background: "#fff", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 14, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 26, height: 26, borderRadius: 7, background: T.text, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13 }}>🖼️</div>
          <div style={{ fontSize: 13.5, fontWeight: 600 }}>直接出图</div>
          <span style={{ fontSize: 11, color: T.muted, marginLeft: 6 }}>不走业务流程, prompt → 图</span>
        </div>
        <div style={{ flex: 1 }} />
        <button onClick={() => onNav && onNav("home")} style={{ background: "transparent", border: "none", color: T.muted, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>← 返回</button>
      </div>

      <div style={{ flex: 1, overflow: "auto" }}>
        <WfRestoreBanner show={wf.hasSnapshot} onDismiss={wf.dismissSnapshot}
          onClear={() => { reset(); setPrompt(""); wf.dismissSnapshot(); }}
          label="直接出图工作流" />

        {/* D-086: 走全站 InlineError */}
        {err && <InlineError err={err} maxWidth={860} />}

        {/* 输入 + 提交 (单跑 vs 批量 用不同 visibility 条件) */}
        {((!batchMode && !poller.isRunning && !poller.isFailed && !poller.isCancelled) || (batchMode && batchTasks.length === 0)) && (
          <div style={{ padding: "32px 40px 20px", maxWidth: 860, margin: "0 auto" }}>
            <div style={{ textAlign: "center", marginBottom: 16 }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: T.text, marginBottom: 6 }}>
                想要张什么图? 🖼️
              </div>
              <div style={{ fontSize: 13, color: T.muted, lineHeight: 1.6, marginBottom: 12 }}>
                {batchMode
                  ? "N 个 prompt 一次跑 · 共享比例/张数/引擎/参考图 · ≤20 条"
                  : "贴 prompt · 选比例 · 选张数 · 默认 apimart, 旁边 chip 切即梦"}
              </div>
              <div style={{ display: "inline-flex", gap: 4, padding: 4, background: T.bg2, borderRadius: 100, border: `1px solid ${T.borderSoft}` }}>
                <button onClick={() => setBatchMode(false)} style={imgPillStyle(!batchMode)}>📷 单跑</button>
                <button onClick={() => setBatchMode(true)} style={imgPillStyle(batchMode)}>📦 批量</button>
              </div>
              {batchMode && (
                <div style={{ marginTop: 10, display: "flex", gap: 6, justifyContent: "center" }}>
                  <button onClick={() => setBatchPreset("general")} style={imgChipStyle(batchPreset === "general")}>通用</button>
                  <button onClick={() => setBatchPreset("wechat-cover")} style={imgChipStyle(batchPreset === "wechat-cover")}>📄 公众号封面</button>
                </div>
              )}
            </div>

            {!batchMode && (
              <div style={{ background: "#fff", border: `1.5px solid ${T.brand}`, boxShadow: `0 0 0 5px ${T.brandSoft}`, borderRadius: 16, padding: 18, marginBottom: 14 }}>
                <textarea rows={5} value={prompt} onChange={e => setPrompt(e.target.value)}
                  placeholder={"描述你要的画面, 越具体越好...\n\n例:\n- 老板娘站在 18 年的米线店门口, 暖色调, 怀旧氛围, 真实感照片\n- 餐饮老板对着手机看数据, 背景是空荡荡的店面, 暗调"}
                  style={{ width: "100%", border: "none", outline: "none", background: "transparent", fontSize: 14, fontFamily: "inherit", resize: "vertical", lineHeight: 1.7, color: T.text, minHeight: 120 }}
                />
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10, paddingTop: 12, borderTop: `1px solid ${T.borderSoft}`, flexWrap: "wrap" }}>
                  <div style={{ fontSize: 11.5, color: T.muted2 }}>🖼️ {prompt.length} 字</div>
                  <div style={{ flex: 1 }} />
                  <ImageEngineChip engine={imgEngine} onChange={setImgEngine} defaultEngine={defaultImgEngine} isOverride={isImgOverride} />
                  <button onClick={generate} disabled={!prompt.trim()} style={{
                    padding: "8px 22px", fontSize: 13, fontWeight: 600,
                    background: prompt.trim() ? T.brand : T.muted3, color: "#fff",
                    border: "none", borderRadius: 100, cursor: prompt.trim() ? "pointer" : "not-allowed", fontFamily: "inherit",
                  }}>
                    ✨ 出图 ({n} 张) →
                  </button>
                </div>
              </div>
            )}

            {batchMode && (
              <div style={{ background: "#fff", border: `1.5px solid ${T.brand}`, boxShadow: `0 0 0 5px ${T.brandSoft}`, borderRadius: 16, padding: 14, marginBottom: 14 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <div style={{ fontSize: 11.5, color: T.muted2, fontWeight: 600, letterSpacing: "0.08em" }}>
                    {isCoverPreset ? "📰 标题列表" : "📝 PROMPT 列表"}
                  </div>
                  <span style={{ fontSize: 11, color: T.muted2 }}>{promptList.length} 条 · 上限 {PROMPT_MAX}</span>
                  <div style={{ flex: 1 }} />
                  <span style={{ fontSize: 11, color: T.muted2 }}>
                    {isCoverPreset ? `每个标题出 ${n} 张候选 · 共 ${batchPrompts.length * n} 张` : `每条出 ${n} 张 · 共 ${batchPrompts.length * n} 张`}
                  </span>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {promptList.map((p, idx) => (
                    <ImgPromptCard key={p.id} idx={idx + 1} text={p.text} n={n}
                      engine={isCoverPreset ? "公众号封面" : imgEngine}
                      placeholderHint={isCoverPreset ? `第 ${idx + 1} 个标题 · 例: AI 才是实体老板的救命稻草` : null}
                      onChange={t => updatePrompt(p.id, t)}
                      onDup={() => duplicatePrompt(p.id)}
                      onRemove={promptList.length > 1 ? () => removePrompt(p.id) : null} />
                  ))}
                  {promptList.length < PROMPT_MAX && (
                    <div onClick={addPrompt} style={{
                      padding: 10, border: `1.5px dashed ${T.border}`, borderRadius: 10,
                      textAlign: "center", color: T.muted, fontSize: 12.5, cursor: "pointer", background: T.bg2,
                      fontFamily: "inherit",
                    }}>+ 添加{isCoverPreset ? "标题" : " prompt"}</div>
                  )}
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12, paddingTop: 12, borderTop: `1px solid ${T.borderSoft}`, flexWrap: "wrap" }}>
                  <div style={{ fontSize: 11.5, color: T.muted2 }}>共 {batchPrompts.length} 条有内容</div>
                  <div style={{ flex: 1 }} />
                  <ImageEngineChip engine={imgEngine} onChange={setImgEngine} defaultEngine={defaultImgEngine} isOverride={isImgOverride} />
                  <button onClick={generateBatch} disabled={batchPrompts.length === 0} style={{
                    padding: "8px 22px", fontSize: 13, fontWeight: 600,
                    background: batchPrompts.length > 0 ? T.brand : T.muted3, color: "#fff",
                    border: "none", borderRadius: 100, cursor: batchPrompts.length > 0 ? "pointer" : "not-allowed", fontFamily: "inherit",
                  }}>
                    ✨ 批量出 {batchPrompts.length * n} 张{isCoverPreset ? "封面" : ""} →
                  </button>
                </div>
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: isCoverPreset ? "1fr" : "1fr 1fr", gap: 14 }}>
              {/* 比例选择 (cover preset 锁 16:9 不显示) */}
              {!isCoverPreset && (
              <div style={{ padding: 14, background: "#fff", border: `1px solid ${T.borderSoft}`, borderRadius: 10 }}>
                <div style={{ fontSize: 11.5, color: T.muted2, fontWeight: 600, letterSpacing: "0.08em", marginBottom: 10 }}>比例</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {IMG_GEN_SIZES.map(s => (
                    <div key={s.id} title={s.desc} onClick={() => setSize(s.id)} style={{
                      padding: "6px 12px", borderRadius: 100, fontSize: 12, cursor: "pointer",
                      background: size === s.id ? T.brandSoft : T.bg2,
                      color: size === s.id ? T.brand : T.muted,
                      border: `1px solid ${size === s.id ? T.brand : T.borderSoft}`,
                      fontWeight: size === s.id ? 600 : 500,
                    }}>{s.label}</div>
                  ))}
                </div>
              </div>
              )}

              {/* 张数 */}
              <div style={{ padding: 14, background: "#fff", border: `1px solid ${T.borderSoft}`, borderRadius: 10 }}>
                <div style={{ fontSize: 11.5, color: T.muted2, fontWeight: 600, letterSpacing: "0.08em", marginBottom: 10 }}>张数</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {[1, 2, 4, 6].map(num => (
                    <div key={num} onClick={() => setN(num)} style={{
                      padding: "6px 14px", borderRadius: 100, fontSize: 12, cursor: "pointer",
                      background: n === num ? T.brandSoft : T.bg2,
                      color: n === num ? T.brand : T.muted,
                      border: `1px solid ${n === num ? T.brand : T.borderSoft}`,
                      fontWeight: n === num ? 600 : 500,
                    }}>{num} 张</div>
                  ))}
                </div>
                <div style={{ fontSize: 11, color: T.muted2, marginTop: 8 }}>
                  💡 {imgEngine === "dreamina" ? "即梦 60-120s/张" : "apimart 30-60s/张"}, 张数越多越慢
                </div>
              </div>
            </div>

            {/* D-073: 📷 参考图 (可选, 最多 4 张, 仅 apimart) · cover preset 不显示 */}
            {!isCoverPreset && (
            <div style={{ marginTop: 14, padding: 14, background: "#fff", border: `1px solid ${T.borderSoft}`, borderRadius: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <div style={{ fontSize: 11.5, color: T.muted2, fontWeight: 600, letterSpacing: "0.08em" }}>📷 参考图</div>
                <span style={{ fontSize: 11, color: T.muted2 }}>
                  可选 · 最多 4 张 · 传了 AI 会基于图来改
                  {imgEngine === "dreamina" && (
                    <span style={{ color: T.amber, marginLeft: 6 }}>⚠ 即梦暂不支持, 切 apimart</span>
                  )}
                </span>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {refs.map(r => (
                  <div key={r.id} style={{
                    position: "relative", width: 72, height: 72, borderRadius: 8,
                    background: r.data_url ? `url(${r.data_url}) center/cover` : T.bg2,
                    border: `1px solid ${r.error ? T.red : T.borderSoft}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }} title={r.name}>
                    {r.uploading && (
                      <span style={{ fontSize: 18 }}>⏳</span>
                    )}
                    {/* D-086: 走 ErrorText 转友好 + 折行截断 */}
                    {r.error && (
                      <span style={{ fontSize: 10, padding: 4, textAlign: "center" }}>
                        <ErrorText err={r.error} maxLen={20} />
                      </span>
                    )}
                    <button onClick={() => removeRef(r.id)} title="删除" style={{
                      position: "absolute", top: -6, right: -6,
                      width: 20, height: 20, borderRadius: "50%",
                      background: "#fff", border: `1px solid ${T.border}`,
                      color: T.muted, fontSize: 11, cursor: "pointer",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      padding: 0, fontFamily: "inherit",
                      boxShadow: "0 1px 2px rgba(0,0,0,0.1)",
                    }}>✕</button>
                  </div>
                ))}
                {refs.length < 4 && (
                  <button
                    onClick={() => fileInputRef.current && fileInputRef.current.click()}
                    style={{
                      width: 72, height: 72, borderRadius: 8,
                      border: `1.5px dashed ${T.border}`, background: T.bg2,
                      cursor: "pointer", color: T.muted, fontSize: 12,
                      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                      gap: 2, fontFamily: "inherit",
                    }}>
                    <span style={{ fontSize: 18 }}>+</span>
                    <span style={{ fontSize: 10 }}>添加</span>
                  </button>
                )}
              </div>
              <input
                ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp"
                multiple style={{ display: "none" }}
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    uploadRefs(e.target.files);
                    e.target.value = "";  // 允许重新上传同一文件
                  }
                }}
              />
            </div>
            )}

            {result && (
              <div style={{ marginTop: 16, fontSize: 12, color: T.muted, textAlign: "center" }}>
                上次出了 {normalizeImageGenImages(result).length} 张, 点上方"出图"会清空再来
              </div>
            )}
          </div>
        )}

        {/* 单跑: 跑中 */}
        {!batchMode && poller.isRunning && (
          <LoadingProgress
            task={poller.task}
            icon="🖼️"
            title="小华正在出图..."
            subtitle={`${prompt.slice(0, 40)} · ${size} · ${n} 张`}
            onCancel={() => { poller.cancel(); reset(); }}
          />
        )}

        {/* 单跑: 失败 */}
        {!batchMode && (poller.isFailed || poller.isCancelled) && (
          <FailedRetry
            error={poller.error || err}
            onRetry={retry}
            onEdit={reset}
            icon="🖼️"
            title={poller.isCancelled ? "任务已取消" : "这次没出来"}
          />
        )}

        {/* 单跑: 结果 */}
        {!batchMode && result && !poller.isRunning && !poller.isFailed && !poller.isCancelled && (
          <ImageGenResults result={result} prompt={prompt} onAgain={generate} onReset={() => { setPrompt(""); reset(); }} />
        )}

        {/* 批量: N 个 task 卡片网格 */}
        {batchMode && batchTasks.length > 0 && (
          <div style={{ padding: "32px 40px 60px", maxWidth: 1280, margin: "0 auto" }}>
            <div style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 20, fontWeight: 700 }}>📦 批量出图中 · {batchTasks.length} 个 task</div>
                <div style={{ fontSize: 12, color: T.muted, marginTop: 4 }}>
                  每条 prompt 出 {n} 张, 共 {batchTasks.length * n} 张. 并行起跑.
                </div>
              </div>
              <Btn variant="outline" onClick={() => setBatchTasks([])}>← 改 prompt</Btn>
              <Btn variant="primary" onClick={() => { setBatchTasks([]); setPromptList([{ id: `p-${Date.now()}`, text: "" }]); }}>📦 再来一批</Btn>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))", gap: 14 }}>
              {batchTasks.map((t, i) => (
                <ImgBatchTaskCard key={t.task_id} taskId={t.task_id} prompt={t.prompt} idx={i + 1} n={n} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── 结果展示 (双卡 / 多卡 grid) ───────────────────────────
function normalizeImageGenImages(result) {
  if (!result) return [];
  if (Array.isArray(result.images)) return result.images;
  if (Array.isArray(result.covers)) return result.covers;

  const directUrl = result.url || result.media_url || result.local_path;
  if (directUrl || result.task_id || result.apimart_task_id || result.submit_id) {
    return [{
      url: result.url || null,
      local_path: result.local_path || null,
      media_url: result.media_url || null,
      task_id: result.task_id || result.apimart_task_id || result.submit_id || null,
      elapsed_sec: result.elapsed_sec,
    }];
  }

  const rawImages = result.raw?.data?.result?.images;
  if (Array.isArray(rawImages) && rawImages.length > 0) {
    return rawImages.map((img) => {
      const u = img && img.url;
      return {
        url: Array.isArray(u) ? u[0] : u,
        task_id: result.task_id || null,
        elapsed_sec: result.elapsed_sec,
      };
    }).filter(img => img.url);
  }
  return [];
}

function ImageGenResults({ result, prompt, onAgain, onReset }) {
  const images = normalizeImageGenImages(result);
  const ok = images.filter(i => !i.error);
  const failed = images.filter(i => i.error);
  const metaParts = [
    result.engine || "apimart",
    result.size,
    result.elapsed_sec != null ? `总耗时 ${result.elapsed_sec}s` : null,
  ].filter(Boolean);

  return (
    <div style={{ padding: "32px 40px 60px", maxWidth: 1280, margin: "0 auto" }}>
      <div style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 20, fontWeight: 700 }}>
            {ok.length === images.length ? "✨" : ok.length === 0 ? "😅" : "⚠️"} 出图完成 · {ok.length}/{images.length} 成功
          </div>
          <div style={{ fontSize: 12, color: T.muted, marginTop: 4 }}>
            {metaParts.join(" · ")}
          </div>
        </div>
        <Btn variant="outline" onClick={onAgain}>🔄 同 prompt 再来一批</Btn>
        <Btn variant="primary" onClick={onReset}>✨ 换 prompt</Btn>
      </div>

      <div style={{
        display: "grid",
        gridTemplateColumns: images.length === 1 ? "1fr" : "repeat(auto-fit, minmax(380px, 1fr))",
        gap: 16,
      }}>
        {images.map((img, i) => <ImageCard key={i} img={img} idx={i} prompt={prompt} />)}
      </div>

      {failed.length > 0 && (
        <div style={{ marginTop: 16, padding: 12, background: T.redSoft, color: T.red, borderRadius: 8, fontSize: 12.5 }}>
          ⚠️ {failed.length} 张失败 (常见: AI 上游限流 / 网络抖动). 点上方 "🔄 同 prompt 再来一批" 重试.
        </div>
      )}
    </div>
  );
}

function ImageCard({ img, idx, prompt }) {
  const [copied, setCopied] = React.useState(false);
  if (img.error) {
    return (
      <div style={{ background: T.redSoft, border: `1px solid ${T.red}44`, borderRadius: 12, padding: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: T.red, marginBottom: 8 }}>#{idx + 1} 失败</div>
        <div style={{ fontSize: 12, color: T.red, fontFamily: "ui-monospace, monospace", lineHeight: 1.6 }}>{img.error}</div>
      </div>
    );
  }
  const previewSrc = img.media_url ? api.media(img.media_url) : img.url;
  function copyUrl() {
    if (!img.url) return;
    try { navigator.clipboard.writeText(img.url); } catch (_) {}
    setCopied(true); setTimeout(() => setCopied(false), 1500);
  }
  function downloadImg() {
    if (!previewSrc) return;
    const a = document.createElement("a");
    a.href = previewSrc;
    a.download = `image-gen-${Date.now()}-${idx}.png`;
    a.click();
  }
  return (
    <div style={{
      background: "#fff", border: `1.5px solid ${T.brand}`, borderRadius: 14,
      padding: 12, boxShadow: `0 0 0 4px ${T.brandSoft}`,
      display: "flex", flexDirection: "column", gap: 10,
    }}>
      <div style={{
        background: T.bg2, borderRadius: 10, overflow: "hidden",
        aspectRatio: "16/9", display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        {previewSrc ? (
          <ImageWithLightbox
            src={previewSrc} alt={`#${idx + 1}`}
            caption={prompt ? `"${prompt.slice(0, 200)}"` : ""}
            downloadName={`image-gen-${Date.now()}-${idx}.png`}
            style={{ width: "100%", height: "100%", objectFit: "contain" }}
          />
        ) : (
          <span style={{ color: T.muted, fontSize: 12 }}>(没有可预览图)</span>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11.5, color: T.muted }}>
        <span style={{ fontWeight: 600, color: T.text }}>#{idx + 1}</span>
        <span>{img.elapsed_sec}s</span>
        <div style={{ flex: 1 }} />
        <button onClick={copyUrl} style={{
          padding: "4px 10px", fontSize: 11.5, background: copied ? T.brandSoft : "#fff",
          border: `1px solid ${copied ? T.brand : T.border}`, borderRadius: 6,
          color: copied ? T.brand : T.muted, cursor: "pointer", fontFamily: "inherit", fontWeight: 500,
        }}>{copied ? "✓ 复制 URL" : "📋 URL"}</button>
        <button onClick={downloadImg} style={{
          padding: "4px 10px", fontSize: 11.5, background: "#fff",
          border: `1px solid ${T.border}`, borderRadius: 6,
          color: T.muted, cursor: "pointer", fontFamily: "inherit", fontWeight: 500,
        }}>⬇ 下载</button>
      </div>
    </div>
  );
}

// ─── D-076: 批量出图所需 helpers + 组件 ───────────────────

function imgPillStyle(active) {
  return {
    padding: "5px 14px", fontSize: 12, fontWeight: 600,
    background: active ? "#fff" : "transparent",
    color: active ? T.brand : T.muted,
    border: "none", borderRadius: 100, cursor: "pointer",
    fontFamily: "inherit",
    boxShadow: active ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
  };
}

function imgChipStyle(active) {
  return {
    padding: "5px 12px", fontSize: 11.5, fontWeight: active ? 600 : 500,
    background: active ? T.brandSoft : "#fff",
    color: active ? T.brand : T.muted,
    border: `1px solid ${active ? T.brand : T.borderSoft}`,
    borderRadius: 100, cursor: "pointer", fontFamily: "inherit",
  };
}

function ImgPromptCard({ idx, text, n, engine, placeholderHint, onChange, onDup, onRemove }) {
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
          {engine || "apimart"} · {n} 张
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
      <textarea rows={2} value={text} onChange={e => onChange(e.target.value)}
        placeholder={placeholderHint || `第 ${idx} 条 · 描述要画的图...`}
        style={{
          width: "100%", border: "none", outline: "none", resize: "none",
          background: "transparent", fontSize: 12.5, fontFamily: "inherit",
          color: T.text, lineHeight: 1.6, padding: 0,
        }} />
    </div>
  );
}

function ImgBatchTaskCard({ taskId, prompt, idx, n }) {
  const poller = useTaskPoller(taskId);
  const result = poller.task?.result || null;
  // 兼容两种格式: image_engine.generate (images) / wechat gen_cover_batch (covers)
  const images = normalizeImageGenImages(result);
  const okImages = images.filter(i => !i.error && (i.media_url || i.local_path || i.url));
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
        <div style={{ fontSize: 11, color: T.muted2 }}>{n} 张候选</div>
        <div style={{ flex: 1 }} />
        <div style={{ fontSize: 11, color: T.muted }}>{elapsed}s</div>
      </div>

      <div style={{ fontSize: 12, color: T.text, lineHeight: 1.5, maxHeight: 50, overflow: "hidden", textOverflow: "ellipsis" }}>
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
          ⚠ {poller.error || "出图失败"}
        </div>
      )}

      {poller.isOk && okImages.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: okImages.length === 1 ? "1fr" : "1fr 1fr", gap: 6 }}>
          {okImages.map((img, j) => {
            const src = img.media_url ? api.media(img.media_url) : img.url;
            return (
              <div key={j} style={{ background: T.bg2, borderRadius: 6, overflow: "hidden", aspectRatio: "16/9" }}>
                {src && <ImageWithLightbox src={src} downloadName={`batch-${idx}-${j}.png`} caption={prompt.slice(0, 100)}
                  style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

Object.assign(window, { PageImageGen });
