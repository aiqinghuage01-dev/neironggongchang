// factory-knowledge.jsx — 知识库:对接 Obsidian vault,分区卡片 → 文档列表 → Markdown 详情
// 视觉对齐 docs/design_v3/factory3-pages.jsx V3Knowledge(分区卡片网格),加了深入访问

function PageKnowledge({ onNav }) {
  const [tree, setTree] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [activeSection, setActiveSection] = React.useState(null);  // 当前打开的分区
  const [doc, setDoc] = React.useState(null);                       // 当前打开的文档
  const [searchQ, setSearchQ] = React.useState("");
  const [searchResults, setSearchResults] = React.useState(null);

  async function load() {
    setLoading(true);
    try {
      const t = await api.get("/api/kb/tree");
      setTree(t);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }
  React.useEffect(() => { load(); }, []);

  async function openDoc(path) {
    try {
      const d = await api.get(`/api/kb/doc?path=${encodeURIComponent(path)}`);
      setDoc(d);
    } catch (e) { alert("读取失败: " + e.message); }
  }

  async function doSearch() {
    if (!searchQ.trim()) { setSearchResults(null); return; }
    try {
      const r = await api.post("/api/kb/search", { query: searchQ.trim(), k: 20 });
      setSearchResults(r);
    } catch (e) { alert(e.message); }
  }

  // 渲染层级:3 态 — 搜索/分区详情/分区总览
  let mainView;
  if (searchResults) {
    mainView = <SearchResults results={searchResults} onOpen={openDoc} onClose={() => { setSearchResults(null); setSearchQ(""); }} />;
  } else if (activeSection) {
    mainView = <SectionDetail section={activeSection} onOpen={openDoc} onBack={() => setActiveSection(null)} />;
  } else {
    mainView = <SectionsGrid tree={tree} onPick={setActiveSection} />;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", position: "relative" }}>
      <div style={{ padding: "22px 32px", background: "#fff", borderBottom: `1px solid ${T.border}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div style={{ fontSize: 20, fontWeight: 600 }}>📚 知识库</div>
          {tree && <Tag color="gray">{tree.total_docs} 条</Tag>}
          {tree && <Tag color="green">Obsidian 同步</Tag>}
          <div style={{ flex: 1 }} />
          <input
            placeholder="🔍 全库搜索 · 标题 / 正文"
            value={searchQ}
            onChange={e => setSearchQ(e.target.value)}
            onKeyDown={e => e.key === "Enter" && doSearch()}
            style={{ width: 300, padding: "8px 14px", fontSize: 13, border: `1px solid ${T.border}`, borderRadius: 100, outline: "none", background: T.bg2, fontFamily: "inherit" }}
          />
          <Btn size="sm" onClick={doSearch}>搜索</Btn>
          <Btn size="sm" onClick={load}>↻ 刷新</Btn>
        </div>
        <div style={{ fontSize: 12.5, color: T.muted, marginTop: 6 }}>
          写文案、做视频时小华自动取用 · 编辑请在 Obsidian · 路径: <code style={{ background: T.bg2, padding: "1px 5px", borderRadius: 4, fontSize: 11 }}>~/Desktop/清华哥知识库/</code>
        </div>
      </div>

      <div style={{ flex: 1, overflow: "auto", padding: "24px 32px", background: T.bg }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          {loading ? <div style={{ textAlign: "center", padding: 40, color: T.muted2 }}>扫 Obsidian vault 中...</div> : mainView}
        </div>
      </div>

      {doc && <DocDrawer doc={doc} onClose={() => setDoc(null)} />}
      <LiDock context="知识库" />
    </div>
  );
}

const SECTION_COLORS = ["green", "amber", "blue", "pink", "purple", "red", "gray"];

function SectionsGrid({ tree, onPick }) {
  if (!tree) return null;
  return (
    <>
      <div style={{ fontSize: 11.5, color: T.muted, fontWeight: 600, letterSpacing: "0.08em", marginBottom: 12 }}>主知识分区</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 28 }}>
        {tree.sections.map((s, i) => (
          <SectionCard key={s.name} section={s} accent={SECTION_COLORS[i % SECTION_COLORS.length]} onClick={() => onPick(s)} />
        ))}
      </div>

      {tree.extras && tree.extras.length > 0 && (
        <>
          <div style={{ fontSize: 11.5, color: T.muted, fontWeight: 600, letterSpacing: "0.08em", marginBottom: 12 }}>其他 · 非标准分区</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
            {tree.extras.map((s) => (
              <SectionCard key={s.name} section={s} accent="gray" onClick={() => onPick(s)} dim />
            ))}
          </div>
        </>
      )}
    </>
  );
}

function SectionCard({ section, accent, onClick, dim }) {
  const colorMap = {
    green: T.brand, amber: T.amber, blue: T.blue, pink: T.pink, purple: T.purple, red: T.red, gray: T.muted,
  };
  const c = colorMap[accent];
  return (
    <div onClick={onClick} style={{
      padding: 18, background: "#fff", border: `1px solid ${T.borderSoft}`, borderRadius: 12,
      cursor: "pointer", opacity: dim ? 0.75 : 1,
    }}>
      <div style={{ fontSize: 13.5, fontWeight: 600, color: T.text, marginBottom: 10, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{section.name}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <div style={{ fontSize: 28, fontWeight: 700, color: c, lineHeight: 1 }}>{section.doc_count}</div>
        <div style={{ fontSize: 11, color: T.muted }}>条</div>
      </div>
      <div style={{ fontSize: 11, color: T.muted2, marginTop: 8 }}>{section.subsections.length} 个子分类</div>
    </div>
  );
}

function SectionDetail({ section, onOpen, onBack }) {
  const [activeSub, setActiveSub] = React.useState(section.subsections[0]?.name || "");
  const sub = section.subsections.find(s => s.name === activeSub) || section.subsections[0];

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
        <Btn size="sm" onClick={onBack}>← 返回分区</Btn>
        <div style={{ fontSize: 18, fontWeight: 600 }}>{section.name}</div>
        <Tag color="gray">{section.doc_count} 条</Tag>
      </div>

      {section.subsections.length > 1 && (
        <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
          {section.subsections.map(s => (
            <button key={s.name} onClick={() => setActiveSub(s.name)} style={{
              padding: "5px 11px", borderRadius: 100, fontSize: 12, fontWeight: 500,
              background: activeSub === s.name ? T.text : "#fff",
              color: activeSub === s.name ? "#fff" : T.muted,
              border: `1px solid ${activeSub === s.name ? "transparent" : T.border}`,
              cursor: "pointer", fontFamily: "inherit",
            }}>
              {s.name === "(root)" ? "根目录" : s.name} <span style={{ opacity: 0.6 }}>{s.count}</span>
            </button>
          ))}
        </div>
      )}

      {sub && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {sub.docs.map(d => (
            <div key={d.path} onClick={() => onOpen(d.path)} style={{
              display: "flex", alignItems: "center", gap: 14, padding: "12px 16px",
              background: "#fff", border: `1px solid ${T.borderSoft}`, borderRadius: 10, cursor: "pointer",
            }}>
              <div style={{ fontSize: 15, color: T.muted2 }}>📄</div>
              <div style={{ flex: 1, fontSize: 13.5, fontWeight: 500, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.title}</div>
              <div style={{ fontSize: 11, color: T.muted2, fontFamily: "SF Mono, Menlo, monospace" }}>
                {Math.round(d.size / 1024)}KB · {new Date(d.mtime * 1000).toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" })}
              </div>
            </div>
          ))}
          {sub.docs.length === 0 && <div style={{ color: T.muted, textAlign: "center", padding: 40 }}>这个子分类没有文档</div>}
        </div>
      )}
    </div>
  );
}

function SearchResults({ results, onOpen, onClose }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
        <Btn size="sm" onClick={onClose}>× 关闭搜索</Btn>
        <div style={{ fontSize: 14, color: T.muted }}>搜索到 <b style={{ color: T.text }}>{results.length}</b> 条</div>
      </div>
      {results.length === 0 ? (
        <div style={{ textAlign: "center", padding: 60, color: T.muted }}>没匹配到 · 换个关键词试试</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {results.map((r, i) => (
            <div key={i} onClick={() => onOpen(r.path)} style={{
              padding: 14, background: "#fff", border: `1px solid ${T.borderSoft}`, borderRadius: 10, cursor: "pointer",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: T.text }}>{r.title}</div>
                <Tag size="xs" color="green">score {r.score}</Tag>
                <Tag size="xs" color="gray">{r.section} / {r.subsection === "(root)" ? "根目录" : r.subsection}</Tag>
              </div>
              <div style={{ fontSize: 12, color: T.muted, lineHeight: 1.55, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{r.preview}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DocDrawer({ doc, onClose }) {
  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 200,
      display: "flex", justifyContent: "flex-end",
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: 680, background: "#fff", height: "100%",
        display: "flex", flexDirection: "column", overflow: "hidden",
        boxShadow: "-8px 0 30px rgba(0,0,0,0.12)",
      }}>
        <div style={{ padding: "16px 22px", borderBottom: `1px solid ${T.borderSoft}`, display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ fontSize: 10.5, color: T.muted2, fontFamily: "SF Mono, Menlo, monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{doc.path}</div>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: T.muted, cursor: "pointer", fontSize: 22 }}>×</button>
        </div>
        <div style={{ padding: "18px 26px 14px 26px", borderBottom: `1px solid ${T.borderSoft}` }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: T.text }}>{doc.title}</div>
          <div style={{ fontSize: 11.5, color: T.muted2, fontFamily: "SF Mono, Menlo, monospace", marginTop: 6 }}>
            {doc.word_count} 字 · 修改于 {new Date(doc.mtime * 1000).toLocaleString("zh-CN")}
          </div>
        </div>
        <div style={{ flex: 1, overflow: "auto", padding: "20px 26px" }}>
          <pre style={{
            fontFamily: "-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', 'Segoe UI', sans-serif",
            fontSize: 14, lineHeight: 1.8, whiteSpace: "pre-wrap", wordBreak: "break-word",
            margin: 0, color: T.text,
          }}>{doc.content}</pre>
        </div>
        <div style={{ padding: "12px 22px", borderTop: `1px solid ${T.borderSoft}`, fontSize: 11.5, color: T.muted2, textAlign: "center" }}>
          编辑请在 Obsidian 里打开 · 工厂这里只读
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { PageKnowledge });
