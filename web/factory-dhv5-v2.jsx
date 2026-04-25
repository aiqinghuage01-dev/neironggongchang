// factory-dhv5-v2.jsx — 🎬 v5 模板成片 (D-059b)
//
// 用户拍板的关键设计:
//   数字人 mp4 是上游复用资源 (顶部锁定)
//   v5 是下游"套不同模板剪辑成多版"剪辑器 (主区模板挑选)
//   一次数字人投入, N 版本产出
//
// 本轮 (D-059b) 只做 Step 1+2: 选数字人 + 选模板
// D-059c 文案对齐 + B-roll
// D-059d 渲染 + 预览 + "用同 mp4 再套" 复用闭环

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

  function backToSelect() {
    setStep("select");
  }

  // STEP 路由
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
                  <Dhv5SceneRow key={i} idx={i} scene={s} onChange={(field, v) => updateSceneField(i, field, v)} />
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
                  <Btn variant="primary" disabled
                    onClick={() => alert("D-059d 渲染调用尚未接入")}>
                    渲染 (D-059d 待接)
                  </Btn>
                </div>
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

// ─── Dhv5SceneRow (单 scene 行 · 内联编辑) ──────────────────
function Dhv5SceneRow({ idx, scene, onChange }) {
  const t = (scene.type || "").toUpperCase();
  const isB = t === "B";
  const fieldKey = isB ? "big_text" : "subtitle";
  const fieldVal = scene[fieldKey] || "";
  const sceneColor = t === "A" ? T.brand : t === "B" ? T.amber : T.text;
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
      background: "#fff", border: `1px solid ${T.borderSoft}`, borderRadius: 8, fontSize: 12,
    }}>
      <span style={{ color: T.muted2, fontFamily: "SF Mono, monospace", fontSize: 11, minWidth: 18 }}>#{idx + 1}</span>
      <span title={`${t} 型 · ${(scene.start || 0).toFixed(1)}s - ${(scene.end || 0).toFixed(1)}s`}
        style={{
          width: 22, height: 22, borderRadius: "50%", background: sceneColor, color: "#fff",
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700,
        }}>{t}</span>
      <span style={{ color: T.muted2, fontFamily: "SF Mono, monospace", fontSize: 10.5, minWidth: 64 }}>
        {(scene.start || 0).toFixed(1)}-{(scene.end || 0).toFixed(1)}s
      </span>
      <input
        value={fieldVal}
        onChange={e => onChange(fieldKey, e.target.value)}
        placeholder={isB ? "大字金句 4-10 字" : "字幕 8-18 字"}
        style={{
          flex: 1, padding: "6px 10px", border: `1px solid ${T.borderSoft}`, borderRadius: 6,
          fontSize: 12.5, fontFamily: "inherit", outline: "none", background: "#fff",
        }} />
      <span style={{ fontSize: 10, color: fieldVal.length > (isB ? 10 : 18) ? T.red : T.muted3, fontFamily: "SF Mono, monospace", minWidth: 32, textAlign: "right" }}>
        {fieldVal.length}/{isB ? 10 : 18}
      </span>
    </div>
  );
}


Object.assign(window, { PageDhv5 });
