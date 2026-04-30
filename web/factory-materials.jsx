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
              // D-062-AUDIT-2-todo1: 统一到 localStorage seed (替代旧 window.__materialHandoff)
              try {
                const seed = m.original_text || m.title || "";
                if (seed) {
                  localStorage.setItem("make_v2_seed_script", seed);
                  localStorage.setItem("make_v2_seed_from", JSON.stringify({
                    skill: "viral", title: (m.title || "").slice(0, 30), ts: Date.now(),
                  }));
                }
              } catch (_) {}
              onNav("make");
            }} onDel={delMaterial} onReload={loadAll} />
          )}
          {tab === "hot" && <HotTab list={hots} onReload={loadAll} onDel={delHot} onUse={(h) => {
            // D-062-AUDIT-2 fix: 之前只 onNav("make") 不带 seed, 用户白点
            try {
              const seed = `# 热点 (${h.platform || "?"} · 热度 ${h.heat_score || 0})\n${h.title}\n\n${h.match_reason ? "我的角度: " + h.match_reason + "\n\n" : ""}---\n\n口播正文:\n`;
              localStorage.setItem("make_v2_seed_script", seed);
              localStorage.setItem("make_v2_seed_from", JSON.stringify({
                skill: "hot-topic", title: (h.title || "").slice(0, 30), ts: Date.now(),
              }));
            } catch (_) {}
            onNav("make");
          }} />}
          {tab === "topic" && <TopicTab list={topics} onReload={loadAll} onDel={delTopic} onUse={(t) => {
            // D-062-AUDIT-2 fix: 同上, 选题不带 seed 跳过去等于白点
            try {
              const seed = `# 选题\n${t.title}\n\n口播正文:\n`;
              localStorage.setItem("make_v2_seed_script", seed);
              localStorage.setItem("make_v2_seed_from", JSON.stringify({
                skill: "topic", title: (t.title || "").slice(0, 30), ts: Date.now(),
              }));
            } catch (_) {}
            onNav("make");
          }} />}
          {tab === "clip" && <EmptyTabHint tip={MATERIAL_TABS.find(t => t.id === "clip").emptyTip} onAdd={() => {}} />}
        </div>
      </div>
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

// C15: 热点行 (HotTab 列表项, hover ring + 一致化)
function HotRow({ h, onUse, onDel }) {
  const [hover, setHover] = React.useState(false);
  const fromNight = h.fetched_from === "night-shift";
  const matched = !!h.match_persona;
  return (
    <div onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        display: "flex", alignItems: "center", gap: 14, padding: "14px 18px",
        background: fromNight ? "linear-gradient(135deg, #fff8ec, #fff)" : "#fff",
        border: `1px solid ${hover ? T.brand : matched ? T.brand + "55" : T.borderSoft}`,
        boxShadow: hover ? `0 4px 12px rgba(47,122,82,0.10)` : "none",
        borderRadius: 12, transition: "all 0.15s",
      }}>
      <div style={{ fontSize: 18, fontWeight: 700, color: T.amber, minWidth: 56,
                    display: "flex", flexDirection: "column", lineHeight: 1 }}>
        <span>🔥{h.heat_score}</span>
      </div>
      <Tag size="xs" color="pink">{h.platform || "-"}</Tag>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, color: T.text, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.title}</div>
        {h.match_reason && <div style={{ fontSize: 11.5, color: T.muted, marginTop: 3 }}>{h.match_reason}</div>}
      </div>
      {fromNight && <Tag size="xs" color="amber">🌙 夜班</Tag>}
      {matched && <Tag size="xs" color="green">✨ 匹配</Tag>}
      <Btn size="sm" variant="primary" onClick={onUse}>做成视频</Btn>
      <Btn size="sm" onClick={onDel}>🗑</Btn>
    </div>
  );
}

function ViralCard({ m, onUse, onDel }) {
  const [hover, setHover] = React.useState(false);
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        padding: 16, background: "#fff",
        border: `1px solid ${hover ? T.brand : T.borderSoft}`,
        boxShadow: hover ? `0 4px 16px rgba(47,122,82,0.10)` : "0 1px 2px rgba(0,0,0,0.03)",
        borderRadius: 12, display: "flex", flexDirection: "column", gap: 10,
        transition: "all 0.15s",
      }}>
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
  const [nightFilter, setNightFilter] = React.useState(false);  // D-050: 散落标签 来自夜班

  async function submitAdd() {
    if (!form.title.trim()) return;
    await api.post("/api/hot-topics", form);
    setAdding(false);
    setForm({ title: "", platform: "douyin", heat_score: 80, match_persona: true, match_reason: "", source_url: "" });
    onReload();
  }

  // D-050: 过滤来自夜班的 (fetched_from == "night-shift")
  const nightCount = list.filter(h => h.fetched_from === "night-shift").length;
  const visibleList = nightFilter ? list.filter(h => h.fetched_from === "night-shift") : list;

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <div style={{ fontSize: 13, color: T.muted }}>共 <b style={{ color: T.text }}>{list.length}</b> 条热点 · 手动维护(Phase 3 接 tavily 自动)</div>
        {/* D-050: 0 产出整块隐藏 (per spec) */}
        {nightCount > 0 && (
          <button onClick={() => setNightFilter(!nightFilter)}
            title={nightFilter ? "点击退出过滤" : "只看 🌙 小华夜班 跑出来的"}
            style={{
              padding: "4px 10px", fontSize: 11.5, borderRadius: 100, fontFamily: "inherit", cursor: "pointer",
              border: nightFilter ? `1px solid ${T.brand}` : `1px solid ${T.borderSoft}`,
              background: nightFilter ? T.brandSoft : T.bg2,
              color: nightFilter ? T.brand : T.muted,
              fontWeight: nightFilter ? 600 : 500,
            }}>
            🌙 来自夜班 {nightCount}
          </button>
        )}
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

      {visibleList.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px 20px", color: T.muted }}>
          <div style={{ fontSize: 44, marginBottom: 8 }}>{nightFilter ? "🌙" : "🔥"}</div>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6, color: T.text }}>
            {nightFilter ? "暂无夜班产出的热点" : "还没维护热点"}
          </div>
          <div style={{ fontSize: 12.5, marginBottom: 16 }}>
            {nightFilter
              ? "下面启用「凌晨抓热点」, 23:00 后自动出选题"
              : "可手动「＋ 加一条」, 也可让小华夜里自动抓 ↓"}
          </div>
          {/* D-062i: 飞轮 CTA */}
          <div style={{ maxWidth: 480, margin: "0 auto", textAlign: "left" }}>
            <NightHotFlywheel onTopics={onReload} compact />
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {visibleList.map((h, idx) => (
            <HotRow key={h.id || `${h.title}-${idx}`} h={h} onUse={() => onUse(h)} onDel={h.id ? () => onDel(h.id) : null} />
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
      await api.post("/api/topics/generate", { seed: genSeed.trim(), n: 10, deep: getDeep() });
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
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <div style={{ fontSize: 12, color: T.muted, flex: 1 }}>💡 告诉小华一个主题/方向,小华从你知识库出 10 个选题(一次性入库)</div>
            <DeepToggle compact />
          </div>
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
        // D-062j: 空状态从静态文字 → 内嵌 AI 飞轮 CTA
        <div style={{ maxWidth: 560, margin: "32px auto", padding: 24, background: "#fff", border: `1px solid ${T.brand}55`, borderRadius: 12, textAlign: "center" }}>
          <div style={{ fontSize: 44, marginBottom: 8 }}>💡</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: T.text, marginBottom: 6 }}>选题库为空</div>
          <div style={{ fontSize: 12.5, color: T.muted, marginBottom: 16, lineHeight: 1.6 }}>
            告诉小华一个方向, 直接出 5 条选题入库 · 后面做视频从这挑一条开干
          </div>
          <input
            value={genSeed}
            onChange={e => setGenSeed(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && genSeed.trim() && !gening) {
              setGening(true);
              api.post("/api/topics/generate", { seed: genSeed.trim(), n: 5, deep: getDeep() })
                .then(() => { setGenSeed(""); onReload(); })
                .catch(err => alert(err.message))
                .finally(() => setGening(false));
            }}}
            placeholder="例: 围绕私域复购 / AI 时代中年老板 / 我的业务护城河..."
            style={{ width: "100%", border: `1px solid ${T.borderSoft}`, borderRadius: 8, padding: "10px 14px", fontSize: 13, fontFamily: "inherit", outline: "none", marginBottom: 10 }}
          />
          <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
            <Btn size="sm" variant="primary" disabled={gening || !genSeed.trim()}
              onClick={() => {
                setGening(true);
                api.post("/api/topics/generate", { seed: genSeed.trim(), n: 5, deep: getDeep() })
                  .then(() => { setGenSeed(""); onReload(); })
                  .catch(err => alert(err.message))
                  .finally(() => setGening(false));
              }}>
              {gening ? "AI 生成中..." : "✨ 让小华生 5 条"}
            </Btn>
            <Btn size="sm" onClick={() => setAdding(true)}>＋ 手动加</Btn>
          </div>
          <div style={{ fontSize: 10.5, color: T.muted2, marginTop: 12 }}>
            (默认 5 条, 想要 10 条用上面的 ✨ 批量生成 10 条)
          </div>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
          {list.map(t => (
            <TopicRow key={t.id} t={t} onUse={() => onUse(t)} onDel={() => onDel(t.id)} />
          ))}
        </div>
      )}
    </>
  );
}

// C15: 选题行 (TopicTab 列表项, hover ring + 一致化)
function TopicRow({ t, onUse, onDel }) {
  const [hover, setHover] = React.useState(false);
  return (
    <div onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        display: "flex", alignItems: "center", gap: 12, padding: "14px 16px",
        background: "#fff",
        border: `1px solid ${hover ? T.brand : T.borderSoft}`,
        boxShadow: hover ? `0 4px 12px rgba(47,122,82,0.10)` : "none",
        borderRadius: 12, transition: "all 0.15s",
      }}>
      <div style={{ fontSize: 18 }}>💡</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, color: T.text, fontWeight: 500, lineHeight: 1.5 }}>{t.title}</div>
        <div style={{ fontSize: 10.5, color: T.muted2, marginTop: 4, display: "flex", gap: 6 }}>
          <Tag size="xs" color={t.source === "ai-batch" ? "green" : "gray"}>{t.source}</Tag>
          <span>· {new Date(t.created_at * 1000).toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" })}</span>
        </div>
      </div>
      <Btn size="sm" variant="primary" onClick={onUse}>做成视频</Btn>
      {onDel && <Btn size="sm" onClick={onDel}>🗑</Btn>}
    </div>
  );
}

Object.assign(window, { PageMaterials });
