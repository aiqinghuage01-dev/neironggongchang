// factory-materials.jsx — 素材库:4 Tab(热点/选题/爆款参考/空镜录音)
// 视觉对齐 docs/design_v3/factory3-pages.jsx V3Materials

const MATERIAL_TABS = [
  { id: "hot",    label: "热点",     icon: "🔥", emptyTip: "还没维护热点。MVP 阶段手动在下方粘贴当日热点,Phase 2 接 tavily 自动刷" },
  { id: "topic",  label: "选题",     icon: "💡", emptyTip: "选题库为空。可以手动添加一条,或调批量选题助手生成(下个阶段)" },
  { id: "viral",  label: "爆款参考", icon: "⭐", emptyTip: "还没扒过任何爆款。去做视频页粘个链接,扒到的就会自动存这儿" },
  { id: "clip",   label: "空镜/录音", icon: "🎥", emptyTip: "本地素材库。拖拽文件到这里(下个阶段)" },
];

function PageMaterials({ onNav }) {
  const [tab, setTab] = React.useState("viral");
  const [materials, setMaterials] = React.useState([]);
  const [hots, setHots] = React.useState([]);
  const [topics, setTopics] = React.useState([]);
  const [loading, setLoading] = React.useState(true);

  async function loadAll() {
    setLoading(true);
    try {
      const [m, h, t] = await Promise.all([
        api.get("/api/materials"),
        api.get("/api/hot-topics"),
        api.get("/api/topics"),
      ]);
      setMaterials(m); setHots(h); setTopics(t);
    } catch {}
    setLoading(false);
  }
  React.useEffect(() => { loadAll(); }, []);

  async function delMaterial(id) {
    if (!confirm("删除这条素材?")) return;
    await api.del(`/api/materials/${id}`).catch(() => {});
    loadAll();
  }
  async function delHot(id) {
    if (!confirm("删除这条热点?")) return;
    await api.del(`/api/hot-topics/${id}`).catch(() => {});
    loadAll();
  }
  async function delTopic(id) {
    if (!confirm("删除这条选题?")) return;
    await api.del(`/api/topics/${id}`).catch(() => {});
    loadAll();
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", position: "relative" }}>
      <div style={{ padding: "22px 32px 0 32px", background: "#fff", borderBottom: `1px solid ${T.border}` }}>
        <div style={{ fontSize: 20, fontWeight: 600 }}>📥 素材库</div>
        <div style={{ fontSize: 12.5, color: T.muted, marginTop: 4 }}>热点 · 选题 · 爆款 · 空镜 · 一处存放</div>
        <div style={{ display: "flex", gap: 4, marginTop: 16 }}>
          {MATERIAL_TABS.map((t) => {
            const on = tab === t.id;
            const count = t.id === "viral" ? materials.length
                        : t.id === "hot" ? hots.length
                        : t.id === "topic" ? topics.length : 0;
            return (
              <button key={t.id} onClick={() => setTab(t.id)} style={{
                padding: "10px 16px", background: "transparent", border: "none", cursor: "pointer", fontFamily: "inherit",
                color: on ? T.text : T.muted, fontWeight: on ? 600 : 500, fontSize: 13.5,
                borderBottom: `2px solid ${on ? T.brand : "transparent"}`,
                display: "flex", alignItems: "center", gap: 6,
              }}>
                <span>{t.icon}</span>{t.label}
                <span style={{ fontSize: 11, color: T.muted2 }}>{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ flex: 1, overflow: "auto", padding: "20px 32px", background: T.bg }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          {tab === "viral" && (
            <ViralTab loading={loading} list={materials} onUse={(m) => {
              window.__materialHandoff = m;
              onNav("make");
            }} onDel={delMaterial} onReload={loadAll} />
          )}
          {tab === "hot" && <HotTab list={hots} onReload={loadAll} onDel={delHot} onUse={(h) => onNav("make")} />}
          {tab === "topic" && <TopicTab list={topics} onReload={loadAll} onDel={delTopic} onUse={(t) => onNav("make")} />}
          {tab === "clip" && <EmptyTabHint tip={MATERIAL_TABS.find(t => t.id === "clip").emptyTip} onAdd={() => {}} />}
        </div>
      </div>
      <LiDock context="素材库" />
    </div>
  );
}

function ViralTab({ loading, list, onUse, onDel, onReload }) {
  const [q, setQ] = React.useState("");
  const visible = list.filter(m => {
    if (!q.trim()) return true;
    const k = q.trim().toLowerCase();
    return (m.title || "").toLowerCase().includes(k)
        || (m.original_text || "").toLowerCase().includes(k)
        || (m.author || "").toLowerCase().includes(k);
  });

  if (loading) return <div style={{ textAlign: "center", padding: 40, color: T.muted2 }}>加载中...</div>;
  if (list.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: 80, color: T.muted }}>
        <div style={{ fontSize: 44, marginBottom: 12 }}>📭</div>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6, color: T.text }}>还没扒过任何爆款</div>
        <div style={{ fontSize: 13, marginBottom: 18 }}>去做视频页粘个链接(抖音/小红书/快手/B站),扒到的会自动存到这儿</div>
        <Btn variant="primary" onClick={() => onUse({})}>去做视频 →</Btn>
      </div>
    );
  }
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <div style={{ fontSize: 13, color: T.muted }}>共 <b style={{ color: T.text }}>{list.length}</b> 条爆款参考 · 下次做同类型可复用</div>
        <div style={{ flex: 1 }} />
        <input
          placeholder="🔍 搜标题 / 文案 / 作者"
          value={q} onChange={e => setQ(e.target.value)}
          style={{ width: 260, padding: "8px 14px", fontSize: 13, border: `1px solid ${T.border}`, borderRadius: 100, outline: "none", background: T.bg, fontFamily: "inherit" }}
        />
        <Btn size="sm" onClick={onReload}>↻ 刷新</Btn>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 14 }}>
        {visible.map(m => (
          <ViralCard key={m.id} m={m} onUse={() => onUse(m)} onDel={() => onDel(m.id)} />
        ))}
      </div>
    </>
  );
}

function ViralCard({ m, onUse, onDel }) {
  return (
    <div style={{ padding: 16, background: "#fff", border: `1px solid ${T.borderSoft}`, borderRadius: 12, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {m.title || (m.original_text || "").slice(0, 40)}
          </div>
          <div style={{ fontSize: 11.5, color: T.muted2, marginTop: 3, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <span>{m.author || "(无作者)"}</span>
            {m.duration_sec ? <span>· {Math.round(m.duration_sec)}s</span> : null}
            <span>· {(m.original_text || "").length} 字</span>
            <span>· {new Date(m.created_at * 1000).toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" })}</span>
          </div>
        </div>
        <Tag size="xs" color={m.source === "qingdou" ? "green" : "gray"}>{m.source || "manual"}</Tag>
      </div>
      {m.url && (
        <div style={{ fontSize: 10.5, color: T.muted2, fontFamily: "SF Mono, Menlo, monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          🔗 {m.url}
        </div>
      )}
      <div style={{
        fontSize: 12, color: T.muted, lineHeight: 1.6,
        background: T.bg2, border: `1px solid ${T.borderSoft}`,
        borderRadius: 8, padding: 10, maxHeight: 80, overflow: "hidden",
        position: "relative",
      }}>
        {(m.original_text || "").slice(0, 200)}{(m.original_text || "").length > 200 ? "…" : ""}
        {(m.original_text || "").length > 200 && (
          <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 20, background: `linear-gradient(transparent, ${T.bg2})` }} />
        )}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <Btn size="sm" variant="primary" onClick={onUse}>✨ 做成视频</Btn>
        {m.url && <Btn size="sm" onClick={() => navigator.clipboard?.writeText(m.url)}>📋 复制链接</Btn>}
        <div style={{ flex: 1 }} />
        <Btn size="sm" onClick={onDel}>🗑</Btn>
      </div>
    </div>
  );
}

function EmptyTabHint({ tip, onAdd }) {
  return (
    <div style={{ textAlign: "center", padding: 80, color: T.muted }}>
      <div style={{ fontSize: 44, marginBottom: 12 }}>🚧</div>
      <div style={{ fontSize: 13, maxWidth: 480, margin: "0 auto" }}>{tip}</div>
    </div>
  );
}

// ─── 热点 Tab ──────────────────────────────
function HotTab({ list, onReload, onDel, onUse }) {
  const [adding, setAdding] = React.useState(false);
  const [form, setForm] = React.useState({ title: "", platform: "douyin", heat_score: 80, match_persona: true, match_reason: "", source_url: "" });

  async function submitAdd() {
    if (!form.title.trim()) return;
    await api.post("/api/hot-topics", form);
    setAdding(false);
    setForm({ title: "", platform: "douyin", heat_score: 80, match_persona: true, match_reason: "", source_url: "" });
    onReload();
  }

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <div style={{ fontSize: 13, color: T.muted }}>共 <b style={{ color: T.text }}>{list.length}</b> 条热点 · 手动维护(Phase 3 接 tavily 自动)</div>
        <div style={{ flex: 1 }} />
        <Btn size="sm" variant="primary" onClick={() => setAdding(!adding)}>{adding ? "× 取消" : "＋ 加一条热点"}</Btn>
        <Btn size="sm" onClick={onReload}>↻ 刷新</Btn>
      </div>

      {adding && (
        <div style={{ padding: 16, background: "#fff", border: `1.5px solid ${T.brand}`, boxShadow: `0 0 0 4px ${T.brandSoft}`, borderRadius: 12, marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>新热点</div>
          <textarea
            value={form.title}
            onChange={e => setForm({ ...form, title: e.target.value })}
            placeholder="热点标题(例:AI 客服集体下岗?一线从业者发声)"
            rows={2}
            style={{ width: "100%", border: `1px solid ${T.borderSoft}`, borderRadius: 8, padding: "8px 10px", fontSize: 13.5, fontFamily: "inherit", resize: "none", outline: "none", marginBottom: 10 }}
          />
          <div style={{ display: "flex", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
            {["douyin", "xiaohongshu", "shipinhao", "weibo", "kuaishou"].map(p => (
              <div key={p} onClick={() => setForm({ ...form, platform: p })} style={{
                padding: "5px 12px", borderRadius: 100, fontSize: 12, cursor: "pointer",
                background: form.platform === p ? T.brandSoft : T.bg2,
                color: form.platform === p ? T.brand : T.muted,
                border: `1px solid ${form.platform === p ? T.brand : T.borderSoft}`,
              }}>{p}</div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: T.muted, cursor: "pointer" }}>
              <input type="checkbox" checked={form.match_persona} onChange={e => setForm({ ...form, match_persona: e.target.checked })} />
              匹配我的定位
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: T.muted }}>
              热度
              <input type="number" value={form.heat_score} onChange={e => setForm({ ...form, heat_score: Number(e.target.value) || 0 })} style={{ width: 60, border: `1px solid ${T.borderSoft}`, borderRadius: 6, padding: "4px 8px", fontSize: 12, outline: "none", fontFamily: "inherit" }} />
            </label>
            <input
              value={form.match_reason}
              onChange={e => setForm({ ...form, match_reason: e.target.value })}
              placeholder="匹配原因(可选)"
              style={{ flex: 1, minWidth: 180, border: `1px solid ${T.borderSoft}`, borderRadius: 8, padding: "6px 10px", fontSize: 12.5, outline: "none", fontFamily: "inherit" }}
            />
            <Btn size="sm" variant="primary" onClick={submitAdd}>存入</Btn>
          </div>
        </div>
      )}

      {list.length === 0 ? (
        <div style={{ textAlign: "center", padding: 60, color: T.muted }}>
          <div style={{ fontSize: 44, marginBottom: 12 }}>🔥</div>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6, color: T.text }}>还没维护热点</div>
          <div style={{ fontSize: 13 }}>点「＋ 加一条热点」手动录入当日热点 · Phase 3 会自动从 tavily 抓</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {list.map(h => (
            <div key={h.id} style={{
              display: "flex", alignItems: "center", gap: 14, padding: "14px 18px",
              background: "#fff", border: `1px solid ${h.match_persona ? T.brand + "55" : T.borderSoft}`,
              borderRadius: 10,
            }}>
              <div style={{ fontSize: 17, fontWeight: 700, color: T.amber, minWidth: 50 }}>🔥{h.heat_score}</div>
              <Tag size="xs" color="pink">{h.platform || "-"}</Tag>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, color: T.text, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.title}</div>
                {h.match_reason && <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>{h.match_reason}</div>}
              </div>
              {h.match_persona ? <Tag size="xs" color="green">✨ 匹配</Tag> : null}
              <Btn size="sm" variant="primary" onClick={() => onUse(h)}>做成视频</Btn>
              <Btn size="sm" onClick={() => onDel(h.id)}>🗑</Btn>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

// ─── 选题 Tab ─────────────────────────────
function TopicTab({ list, onReload, onDel, onUse }) {
  const [adding, setAdding] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [gening, setGening] = React.useState(false);
  const [genSeed, setGenSeed] = React.useState("");
  const [showGen, setShowGen] = React.useState(false);

  async function submitAdd() {
    if (!title.trim()) return;
    await api.post("/api/topics", { title: title.trim() });
    setTitle(""); setAdding(false);
    onReload();
  }
  async function batchGen() {
    if (!genSeed.trim()) return;
    setGening(true);
    try {
      await api.post("/api/topics/generate", { seed: genSeed.trim(), n: 10 });
      setGenSeed(""); setShowGen(false);
      onReload();
    } catch (e) { alert(e.message); }
    setGening(false);
  }

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <div style={{ fontSize: 13, color: T.muted }}>共 <b style={{ color: T.text }}>{list.length}</b> 条选题</div>
        <div style={{ flex: 1 }} />
        <Btn size="sm" onClick={() => setAdding(!adding)}>{adding ? "× 取消" : "＋ 手动加一条"}</Btn>
        <Btn size="sm" variant="primary" onClick={() => setShowGen(!showGen)}>{showGen ? "× 取消" : "✨ AI 批量生成 10 条"}</Btn>
        <Btn size="sm" onClick={onReload}>↻ 刷新</Btn>
      </div>

      {adding && (
        <div style={{ padding: 14, background: "#fff", border: `1px solid ${T.brand}`, borderRadius: 10, marginBottom: 14, display: "flex", gap: 10 }}>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            onKeyDown={e => e.key === "Enter" && submitAdd()}
            placeholder="选题标题(15 字内最佳,例:AI 时代老板的内容护城河)"
            style={{ flex: 1, border: "none", outline: "none", fontSize: 14, fontFamily: "inherit", color: T.text }}
          />
          <Btn size="sm" variant="primary" onClick={submitAdd}>加入</Btn>
        </div>
      )}

      {showGen && (
        <div style={{ padding: 14, background: "#fff", border: `1px solid ${T.brand}`, borderRadius: 10, marginBottom: 14 }}>
          <div style={{ fontSize: 12, color: T.muted, marginBottom: 8 }}>💡 告诉小华一个主题/方向,小华从你知识库出 10 个选题(一次性入库)</div>
          <div style={{ display: "flex", gap: 10 }}>
            <input
              value={genSeed}
              onChange={e => setGenSeed(e.target.value)}
              placeholder="例:清华哥业务相关的短视频选题 / 围绕私域复购 / AI 时代中年老板..."
              style={{ flex: 1, border: `1px solid ${T.borderSoft}`, borderRadius: 8, padding: "8px 12px", fontSize: 13, fontFamily: "inherit", outline: "none" }}
            />
            <Btn size="sm" variant="primary" onClick={batchGen} disabled={gening || !genSeed.trim()}>
              {gening ? "生成中..." : "批量生 10 条"}
            </Btn>
          </div>
        </div>
      )}

      {list.length === 0 ? (
        <div style={{ textAlign: "center", padding: 60, color: T.muted }}>
          <div style={{ fontSize: 44, marginBottom: 12 }}>💡</div>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6, color: T.text }}>选题库为空</div>
          <div style={{ fontSize: 13 }}>手动加 或 让小华批量生 · 做视频时从这挑一条直接开干</div>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
          {list.map(t => (
            <div key={t.id} style={{
              display: "flex", alignItems: "center", gap: 12, padding: "12px 14px",
              background: "#fff", border: `1px solid ${T.borderSoft}`, borderRadius: 10,
            }}>
              <div style={{ fontSize: 15 }}>💡</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, color: T.text, fontWeight: 500 }}>{t.title}</div>
                <div style={{ fontSize: 10.5, color: T.muted2, marginTop: 2, display: "flex", gap: 6 }}>
                  <Tag size="xs" color={t.source === "ai-batch" ? "green" : "gray"}>{t.source}</Tag>
                  <span>· {new Date(t.created_at * 1000).toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" })}</span>
                </div>
              </div>
              <Btn size="sm" variant="primary" onClick={() => onUse(t)}>做成视频</Btn>
              <Btn size="sm" onClick={() => onDel(t.id)}>🗑</Btn>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

Object.assign(window, { PageMaterials });
