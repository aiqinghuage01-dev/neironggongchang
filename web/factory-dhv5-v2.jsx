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

  function pickWork(w) {
    // works API 返 local_url (相对 /media/), 我们要本地绝对路径给 backend
    // 没有现成 endpoint 给绝对路径 — 用 local_url 拼: GET /api/works 已含 local_url
    // 后端 /api/dhv5/render 接受路径, 但 work 只暴露 media URL
    // 简化方案: 让用户填本地路径, 这个 picker 只是 hint 显示已有作品名字
    setShowWorksPicker(false);
  }

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
      {/* 顶栏 */}
      <div style={{ padding: "12px 24px", background: "#fff", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 14, flexShrink: 0 }}>
        <div style={{ width: 26, height: 26, borderRadius: 7, background: T.text, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13 }}>🎬</div>
        <div style={{ fontSize: 13.5, fontWeight: 600 }}>v5 模板成片</div>
        <div style={{ fontSize: 11.5, color: T.muted, marginLeft: 4 }}>
          一段数字人 mp4 · 套不同模板 · 出多版
        </div>
        <div style={{ flex: 1 }} />
        <ApiStatusLight />
      </div>

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
              <Btn variant="primary" disabled={!dhReady}
                onClick={() => alert("D-059c 文案对齐 + B-roll 还没接 · 这是 D-059b 仅模板选择")}>
                {dhReady ? "下一步: 文案对齐 →" : "↑ 先填数字人 mp4 路径"}
              </Btn>
            </div>
          )}
        </div>
      </div>
    </div>
  );
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

Object.assign(window, { PageDhv5 });
