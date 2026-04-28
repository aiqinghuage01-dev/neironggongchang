// factory-materials-v2.jsx — 素材库 v2 (D-087)
//
// 4 层钻取: L1 数据大屏 → L2 大分区 (C 模式默认 + A 模式可切) → L3 子分类 → L4 大预览
// 设计稿: PRD §3 + 4 张交互稿 (D-087 入口/数据大屏 + 树↔网格 3 方案 A/B/C)
// 后端: /api/material-lib/* (commit ffe5b7a, 8 endpoint + 5 表)
//
// 老 PageMaterials (4 tab: 热点/选题/爆款参考/空镜录音) 暂保留代码 (factory-materials.jsx),
// 但侧栏 case "materials" 改路由到 PageMaterialsV2. 老业务数据 (hot_topics/topics)
// 由 night_shift / planner 等模块继续写, UI 入口由清华哥回来决定要不要保留.
//
// 全站错误出口: 走 D-086 InlineError / ErrorText (factory-errors.jsx 单一事实源).

const T_GREEN = "#2a6f4a";   // 主色深绿
const T_AMBER = "#c08a2e";   // 暖橙 (待整理)


// ─── L1 数据大屏 ─────────────────────────────────────────

function MV2KpiCard({ icon, label, value, sub, accent }) {
  const accentColor = accent === "amber" ? T_AMBER : T_GREEN;
  const bg = accent === "amber" ? "#fff7e6" : "#fff";
  const border = accent === "amber" ? `1.5px solid ${T_AMBER}55` : `1px solid ${T.border}`;
  return (
    <div style={{
      padding: "16px 18px", background: bg, border,
      borderRadius: 10, minHeight: 110,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: T.muted, marginBottom: 8 }}>
        <span>{icon}</span>
        <span>{label}</span>
      </div>
      <div style={{ fontSize: 32, fontWeight: 700, color: accentColor, lineHeight: 1.1 }}>
        {value == null ? "—" : value.toLocaleString?.() || value}
      </div>
      <div style={{ fontSize: 11.5, color: accent === "amber" ? T_AMBER : T.muted2, marginTop: 6 }}>{sub}</div>
    </div>
  );
}


function MV2FolderCard({ folder, onClick }) {
  const isHot = (folder.week_new || 0) >= 10;
  // 不同 folder 用不同主色 (设计稿配色). MVP: 简单按 folder name 哈希分配
  const colors = [T_GREEN, T_AMBER, "#3d6e9c", "#7a4f9d", "#c44545", "#5a8c5a", "#b06030", "#4a7a8c"];
  const colorIdx = Math.abs(_hashStr(folder.folder)) % colors.length;
  const accent = colors[colorIdx];
  return (
    <div onClick={onClick} data-testid="mv2-folder-card" style={{
      padding: "14px 16px", background: "#fff", border: `1px solid ${T.border}`,
      borderRadius: 10, cursor: "pointer", display: "flex", alignItems: "center",
      transition: "all 0.12s", gap: 12,
    }}
      onMouseEnter={e => e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.06)"}
      onMouseLeave={e => e.currentTarget.style.boxShadow = ""}
    >
      <div style={{
        width: 38, height: 38, borderRadius: 8,
        background: accent + "22", display: "flex", alignItems: "center",
        justifyContent: "center", fontSize: 18, flexShrink: 0,
      }}>📁</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{folder.folder}</span>
          {isHot && <Tag size="xs" color="red">热</Tag>}
        </div>
        {folder.week_new > 0 && (
          <div style={{ fontSize: 11, color: T.muted2, marginTop: 2 }}>+{folder.week_new} 本周</div>
        )}
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, color: accent, lineHeight: 1, flexShrink: 0 }}>
        {folder.total}
      </div>
    </div>
  );
}


function _hashStr(s) {
  let h = 0;
  for (let i = 0; i < (s || "").length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return h;
}


// ─── L1 右栏: 最近活动 timeline ────────────────────────────

function MV2RecentActivity({ events, loading }) {
  return (
    <div style={{
      background: "#fff", border: `1px solid ${T.border}`, borderRadius: 10,
      padding: "14px 16px", marginBottom: 12,
    }}>
      <div style={{ fontSize: 12.5, fontWeight: 600, color: T.text, marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
        📈 最近活动
      </div>
      {loading ? (
        <div style={{ fontSize: 11.5, color: T.muted2 }}>加载中...</div>
      ) : events.length === 0 ? (
        <div style={{ fontSize: 11.5, color: T.muted3 }}>· 还没有活动 (扫描后会有)</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          {events.slice(0, 5).map((e, i) => (
            <div key={i} style={{ fontSize: 11.5, color: T.muted, lineHeight: 1.5 }}>
              <span style={{ color: T.muted3 }}>·</span>{" "}
              <span style={{ color: T.muted2 }}>{e.when}</span>{" "}
              · <span style={{ color: T.text }}>{e.text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


// ─── L1 右栏: 最常用 Top 5 ───────────────────────────────

function MV2TopUsed({ items, loading, onPickAsset }) {
  return (
    <div style={{
      background: "#fff", border: `1px solid ${T.border}`, borderRadius: 10,
      padding: "14px 16px",
    }}>
      <div style={{ fontSize: 12.5, fontWeight: 600, color: T.text, marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
        🏆 最常用 Top 5
      </div>
      {loading ? (
        <div style={{ fontSize: 11.5, color: T.muted2 }}>加载中...</div>
      ) : items.length === 0 ? (
        <div style={{ fontSize: 11.5, color: T.muted3 }}>还没用过任何素材<br/>(用了之后这里会有 Top 5)</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {items.slice(0, 5).map((it, i) => (
            <div key={it.id} onClick={() => onPickAsset && onPickAsset(it)} style={{
              display: "flex", alignItems: "center", gap: 8,
              fontSize: 11.5, cursor: onPickAsset ? "pointer" : "default",
              padding: "3px 0",
            }}>
              <span style={{ color: T.muted3, fontWeight: 600, width: 14 }}>{i + 1}.</span>
              <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: T.text }} title={it.filename}>
                {it.filename}
              </span>
              <span style={{ color: T_GREEN, fontWeight: 600 }}>{it.hits}×</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


function MV2L1Home({ stats, folders, loading, err, onPickFolder, onScan, scanning, onBatchTag, batchTagging,
                    activity, topUsed, sideLoading, search, onSearch, searchResults, searching, onPickAsset }) {
  if (loading) return <div style={{ padding: 60, textAlign: "center", color: T.muted }}>加载中...</div>;
  const remainTag = stats ? Math.max(0, stats.total - stats.ai_tagged) : 0;
  return (
    <div>
      {/* Header (顶部 全宽 含搜索框) */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, gap: 16 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>📥 素材库 · 总览</h1>
            <Tag color="green" size="sm">已连接本地</Tag>
          </div>
          <div style={{ fontSize: 12, color: T.muted2, marginTop: 6 }}>
            {stats?.root || "—"}
            {stats != null && (
              <span style={{ marginLeft: 12 }}>
                · 总 {stats.total} 条
                {stats.week_added > 0 && <span> · 本周 +{stats.week_added}</span>}
              </span>
            )}
          </div>
        </div>
        {/* 全库搜索框 (设计稿右上) */}
        <input
          type="text" value={search || ""}
          onChange={e => onSearch && onSearch(e.target.value)}
          placeholder="🔍 全库搜索 · 标签 / 文件名"
          data-testid="mv2-l1-search"
          style={{
            width: 320, padding: "9px 12px",
            border: `1px solid ${T.border}`, borderRadius: 100,
            fontSize: 13, fontFamily: "inherit", background: "#fff",
            outline: "none",
          }}
          onFocus={e => e.target.style.borderColor = T_GREEN}
          onBlur={e => e.target.style.borderColor = T.border}
        />
      </div>

      {err && <InlineError err={err} />}

      {/* 4 KPI 横条 (全宽) */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16 }}>
        <MV2KpiCard
          icon="📦" label="总素材"
          value={stats?.total ?? 0}
          sub={stats?.week_added > 0 ? `本周 +${stats.week_added} ↗` : "本周 +0"}
        />
        <MV2KpiCard
          icon="⚠" label="待整理"
          value={stats?.pending_review ?? 0}
          sub={stats?.pending_review > 0 ? "点这里 → 一键归档 →" : "暂无待办"}
          accent="amber"
        />
        <MV2KpiCard
          icon="✨" label="已 AI 打标"
          value={stats?.ai_tagged ?? 0}
          sub={`覆盖率 ${stats?.ai_coverage ?? 0}%`}
        />
        <MV2KpiCard
          icon="🎯" label="本月使用"
          value={`${stats?.usage_this_month ?? 0} 次`}
          sub={`命中率 ${stats?.hit_rate ?? 0}%`}
        />
      </div>

      {/* 主分区操作条 (搜索时隐藏) */}
      {!(search && search.trim()) && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={{ fontSize: 13, color: T.muted, fontWeight: 500 }}>
            主分区 · {folders.length} 个 · <span style={{ color: T.muted2 }}>点击进入</span>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            {remainTag > 0 && (
              <Btn
                variant="outline" size="sm"
                data-testid="mv2-l1-batch-tag-btn"
                onClick={onBatchTag} disabled={batchTagging}
                style={{ borderColor: T_GREEN, color: T_GREEN }}
              >
                {batchTagging ? "AI 打标中..." : `✨ AI 打 10 条 (剩 ${remainTag})`}
              </Btn>
            )}
            <Btn variant="outline" size="sm" onClick={onScan} disabled={scanning}>
              {scanning ? "扫描中..." : "🔄 重新扫描"}
            </Btn>
          </div>
        </div>
      )}

      {/* 主区 (左) + 右栏 (右栏一直可见) */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 280px", gap: 16 }}>
        <div>
          {/* 搜索状态: 主区显示搜索结果. 否则: 文件夹大卡片 */}
          {search && search.trim() ? (
            <div data-testid="mv2-l1-search-results">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>
                  🔍 搜"<span style={{ color: T_GREEN }}>{search.trim()}</span>"
                  <span style={{ color: T.muted2, fontWeight: 400, marginLeft: 6 }}>
                    {searching ? "搜索中..." : `${searchResults.length} 条`}
                  </span>
                </div>
                <span
                  onClick={() => onSearch("")}
                  style={{ fontSize: 11.5, color: T.muted2, cursor: "pointer" }}
                >✕ 清空</span>
              </div>
              {searching ? (
                <div style={{ padding: 40, textAlign: "center", color: T.muted }}>搜索中...</div>
              ) : searchResults.length === 0 ? (
                <div style={{ padding: 40, textAlign: "center", color: T.muted, background: "#fff", borderRadius: 10 }}>
                  没匹配到. 试试别的关键词 (能搜文件名 / 标签 / 文件夹路径)
                </div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                  {searchResults.map(a => (
                    <MV2AssetCard key={a.id} asset={a} onClick={() => onPickAsset(a)} />
                  ))}
                </div>
              )}
            </div>
          ) : (
            folders.length === 0 ? (
              <div style={{ padding: 60, background: "#fff", borderRadius: 10, border: `1px solid ${T.border}`, textAlign: "center", color: T.muted }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>📂</div>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>素材库还是空的</div>
                <div style={{ fontSize: 12, color: T.muted2, marginBottom: 14 }}>
                  把素材放到 {stats?.root || "~/Downloads/"}, 然后点 "🔄 重新扫描" 入库
                </div>
                <Btn variant="primary" size="md" onClick={onScan} disabled={scanning}>
                  {scanning ? "扫描中..." : "▶ 立即扫描"}
                </Btn>
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
                {folders.slice(0, 8).map(f => (
                  <MV2FolderCard key={f.folder} folder={f} onClick={() => onPickFolder(f.folder)} />
                ))}
              </div>
            )
          )}
        </div>
        {/* 右栏 (一直可见) */}
        <div>
          <MV2RecentActivity events={activity || []} loading={sideLoading} />
          <MV2TopUsed items={topUsed || []} loading={sideLoading} onPickAsset={onPickAsset} />
        </div>
      </div>
    </div>
  );
}


// ─── L2 大分区 (C 模式: 按子分类分组 + 每组 4 张; A 模式: 全部网格) ─────

function MV2L2Folder({ topFolder, mode, onModeChange, onBack, onPickAsset, onPickSubfolder }) {
  const [subfolders, setSubfolders] = React.useState([]);
  const [groupedAssets, setGroupedAssets] = React.useState({});
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState("");

  async function load() {
    setLoading(true); setErr("");
    try {
      const sub = await api.get(`/api/material-lib/subfolders?top=${encodeURIComponent(topFolder)}`);
      const subs = sub.subfolders || [];
      setSubfolders(subs);
      // C 模式: 每个子分类拉前 4 张
      if (mode === "grouped") {
        const grouped = {};
        await Promise.all(subs.map(async s => {
          try {
            const r = await api.get(`/api/material-lib/list?folder=${encodeURIComponent(s.folder)}&limit=4`);
            grouped[s.folder] = r.items || [];
          } catch {}
        }));
        setGroupedAssets(grouped);
      }
    } catch (e) {
      setErr(e.message);
    }
    setLoading(false);
  }
  React.useEffect(() => { load(); }, [topFolder, mode]);

  if (loading) return <div style={{ padding: 60, textAlign: "center", color: T.muted }}>加载中...</div>;

  return (
    <div>
      {/* 面包屑 */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
          <span style={{ cursor: "pointer", color: T_GREEN }} onClick={onBack}>📥 素材库</span>
          <span style={{ color: T.muted3 }}>/</span>
          <span style={{ fontWeight: 600 }}>{topFolder}</span>
          <Tag size="sm" color="green">{subfolders.length} 个子分类</Tag>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <Btn variant={mode === "grouped" ? "primary" : "outline"} size="sm" onClick={() => onModeChange("grouped")}>
            📁 分组
          </Btn>
          <Btn variant={mode === "list" ? "primary" : "outline"} size="sm" onClick={() => onModeChange("list")}>
            📋 列表
          </Btn>
        </div>
      </div>

      {err && <InlineError err={err} />}

      {/* C 模式: 按子分类分组 */}
      {mode === "grouped" && (
        <div>
          {subfolders.length === 0 ? (
            <div style={{ padding: 40, textAlign: "center", color: T.muted, background: "#fff", borderRadius: 10 }}>
              这个分区还没素材
            </div>
          ) : subfolders.map(sub => (
            <div key={sub.folder} style={{ marginBottom: 18 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>
                  📂 {sub.folder} <span style={{ color: T.muted2, fontWeight: 400, fontSize: 12, marginLeft: 6 }}>{sub.total}</span>
                </div>
                {sub.total > 4 && (
                  <span style={{ fontSize: 11.5, color: T_GREEN, cursor: "pointer" }}
                        onClick={() => onPickSubfolder(sub.folder)}>
                    查看全部 {sub.total} →
                  </span>
                )}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
                {(groupedAssets[sub.folder] || []).map(a => (
                  <MV2AssetCard key={a.id} asset={a} onClick={() => onPickAsset(a, sub.folder)} />
                ))}
                {(groupedAssets[sub.folder] || []).length === 0 && (
                  <div style={{ gridColumn: "span 4", padding: 16, color: T.muted3, fontSize: 11.5, textAlign: "center" }}>
                    (空)
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* A 模式: 全网格 */}
      {mode === "list" && (
        <MV2L3Grid folder={topFolder} onPickAsset={onPickAsset} onBack={() => {}} embedded />
      )}
    </div>
  );
}


// ─── L3 网格 (A 模式: 顶部 tab + 5 列网格) ─────────────────

// ─── L3 右栏: 选中预览 (设计稿 A 方案核心特征) ──────────

function MV2L3SidePreview({ asset: assetMini, onPickAsset, onNav, onTagged }) {
  const [asset, setAsset] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const [err, setErr] = React.useState("");
  const [tagging, setTagging] = React.useState(false);

  async function load() {
    if (!assetMini) { setAsset(null); return; }
    setLoading(true); setErr("");
    try {
      const a = await api.get(`/api/material-lib/asset/${assetMini.id}`);
      setAsset(a);
    } catch (e) {
      setErr(e.message);
    }
    setLoading(false);
  }
  React.useEffect(() => { load(); }, [assetMini && assetMini.id]);

  async function handleTag(force) {
    if (!asset) return;
    setTagging(true); setErr("");
    try {
      await api.post(`/api/material-lib/tag/${asset.id}${force ? "?force=true" : ""}`);
      await load();
      if (onTagged) onTagged();
    } catch (e) {
      setErr(e.message);
    }
    setTagging(false);
  }

  async function handleUseInVideo() {
    if (!asset) return;
    try {
      await api.post("/api/material-lib/usage", { asset_id: asset.id, used_in: "make-page" });
    } catch {}
    window.dispatchEvent(new CustomEvent("ql-nav", { detail: { page: "make" } }));
    if (onNav) onNav("make");
  }

  if (!asset && !loading) {
    return (
      <div style={{
        padding: "60px 16px", textAlign: "center", color: T.muted3, fontSize: 12,
        background: "#fff", border: `1px solid ${T.border}`, borderRadius: 10, position: "sticky", top: 16,
      }}>
        点左侧素材卡<br/>查看预览
      </div>
    );
  }

  const isVideo = asset && [".mp4", ".mov", ".m4v", ".avi", ".mpg"].includes(asset.ext);
  const thumbUrl = asset && asset.thumb_path ? `${api.base}/api/material-lib/thumb/${asset.id}` : "";

  return (
    <div style={{
      background: "#fff", border: `1px solid ${T.border}`, borderRadius: 10,
      overflow: "hidden", position: "sticky", top: 16,
    }}>
      {loading ? (
        <div style={{ padding: 30, textAlign: "center", color: T.muted2 }}>加载中...</div>
      ) : (
        <>
          {/* 缩略图 */}
          <div style={{
            aspectRatio: "16/9", background: T.bg2,
            backgroundImage: thumbUrl ? `url(${thumbUrl})` : "",
            backgroundSize: "cover", backgroundPosition: "center",
            display: "flex", alignItems: "center", justifyContent: "center",
            position: "relative", cursor: "pointer",
          }} onClick={() => onPickAsset && onPickAsset(asset)}
            title="点击全屏预览">
            {!thumbUrl && (
              <span style={{ color: T.muted3, fontSize: 22 }}>{isVideo ? "🎬" : "🖼️"}</span>
            )}
            {asset.duration_sec && (
              <span style={{
                position: "absolute", bottom: 6, right: 6,
                background: "rgba(0,0,0,0.65)", color: "#fff",
                fontSize: 11, padding: "2px 6px", borderRadius: 3,
              }}>▶ {_fmtDur(asset.duration_sec)}</span>
            )}
          </div>
          {/* 信息 */}
          <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
            <div>
              <div style={{ fontSize: 12.5, fontWeight: 600, wordBreak: "break-all" }}>{asset.filename}</div>
              <div style={{ fontSize: 10.5, color: T.muted2, marginTop: 2 }}>
                {asset.size_bytes ? `${(asset.size_bytes / 1024 / 1024).toFixed(1)} MB` : ""}
                {asset.width && asset.height ? ` · ${asset.width}×${asset.height}` : ""}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 10.5, color: T.muted, marginBottom: 3 }}>📁 文件位置</div>
              <div style={{ fontSize: 10, color: T.muted2, padding: "5px 7px", background: T.bg2, borderRadius: 4, wordBreak: "break-all" }}>
                {asset.rel_folder === "." ? "(根目录)" : asset.rel_folder}
              </div>
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 3 }}>
                <span style={{ fontSize: 10.5, color: T.muted }}>🏷 标签</span>
                <button
                  onClick={() => handleTag(asset.tags.length > 0)}
                  disabled={tagging}
                  data-testid="mv2-l3-side-tag-btn"
                  style={{
                    fontSize: 10, padding: "1px 7px", borderRadius: 3,
                    background: "transparent", border: `1px solid ${T_GREEN}`,
                    color: T_GREEN, cursor: tagging ? "wait" : "pointer", fontFamily: "inherit",
                  }}
                >
                  {tagging ? "..." : asset.tags.length > 0 ? "✨ 重打" : "✨ AI 打标"}
                </button>
              </div>
              {asset.tags.length === 0 ? (
                <div style={{ fontSize: 10.5, color: T_AMBER }}>⚠ 待标</div>
              ) : (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
                  {asset.tags.slice(0, 8).map(t => (
                    <span key={t.id} style={{
                      fontSize: 10, padding: "1px 5px", borderRadius: 3,
                      background: t.source === "ai" ? "#e8f5e9" : "#e3f2fd",
                      color: t.source === "ai" ? "#2e7d32" : "#1565c0",
                      border: t.source === "ai" ? "1px dashed #81c784" : "none",
                    }}>{t.source === "ai" ? "✨" : ""}{t.name}</span>
                  ))}
                </div>
              )}
            </div>
            <div>
              <div style={{ fontSize: 10.5, color: T.muted, marginBottom: 2 }}>🎯 命中</div>
              <div style={{ fontSize: 11 }}>
                {asset.hits === 0 ? <span style={{ color: T.muted3 }}>还没用过</span> : `用过 ${asset.hits} 次`}
              </div>
            </div>
            {err && <InlineError err={err} />}
            <Btn variant="primary" size="md" onClick={handleUseInVideo} style={{ width: "100%" }}>
              ✨ 用它做视频
            </Btn>
          </div>
        </>
      )}
    </div>
  );
}


function MV2L3Grid({ folder, onPickAsset, onBack, embedded }) {
  const [items, setItems] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState("");
  const [sort, setSort] = React.useState("imported");
  const [limit] = React.useState(60);
  // L3 内部状态: 选中的素材 (右栏预览). 双击全屏走 onPickAsset → L4 modal.
  const [selected, setSelected] = React.useState(null);

  async function load() {
    setLoading(true); setErr("");
    try {
      const r = await api.get(`/api/material-lib/list?folder=${encodeURIComponent(folder)}&sort=${sort}&limit=${limit}`);
      setItems(r.items || []);
      if (r.items && r.items.length > 0 && !selected) {
        setSelected(r.items[0]);  // 默认选第一个, 右栏立即有内容
      }
    } catch (e) {
      setErr(e.message);
    }
    setLoading(false);
  }
  React.useEffect(() => { load(); }, [folder, sort]);

  const grid = (
    <>
      {!embedded && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
            <span style={{ cursor: "pointer", color: T_GREEN }} onClick={onBack}>← 上一级</span>
            <span style={{ color: T.muted3 }}>·</span>
            <span style={{ fontWeight: 600 }}>{folder}</span>
            <Tag size="sm" color="green">{items.length} 条</Tag>
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <span style={{ fontSize: 11.5, color: T.muted2 }}>排序:</span>
            <select value={sort} onChange={e => setSort(e.target.value)}
              style={{ fontSize: 12, padding: "3px 8px", border: `1px solid ${T.border}`, borderRadius: 6, background: "#fff" }}>
              <option value="imported">最新入库</option>
              <option value="hits">命中最多</option>
              <option value="name">文件名</option>
            </select>
          </div>
        </div>
      )}
      {err && <InlineError err={err} />}
      {loading ? (
        <div style={{ padding: 40, textAlign: "center", color: T.muted }}>加载中...</div>
      ) : items.length === 0 ? (
        <div style={{ padding: 40, textAlign: "center", color: T.muted, background: "#fff", borderRadius: 10 }}>
          这里还没素材
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
          {items.map(a => (
            <MV2AssetCard
              key={a.id} asset={a}
              selected={selected && selected.id === a.id}
              onClick={() => setSelected(a)}
              onDoubleClick={() => onPickAsset && onPickAsset(a, folder)}
            />
          ))}
        </div>
      )}
    </>
  );

  // embedded (L2 切 A 模式时调) 不走右栏布局
  if (embedded) return grid;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 320px", gap: 16 }}>
      <div>{grid}</div>
      <MV2L3SidePreview
        asset={selected}
        onPickAsset={onPickAsset}
        onTagged={load}
      />
    </div>
  );
}


// ─── 素材卡片 (L2/L3 共用) ─────────────────────────────────

function MV2AssetCard({ asset, onClick, onDoubleClick, selected }) {
  const isVideo = [".mp4", ".mov", ".m4v", ".avi", ".mpg"].includes(asset.ext);
  const dur = asset.duration_sec ? _fmtDur(asset.duration_sec) : null;
  const tags = asset.tags || [];
  const hits = asset.hits || 0;
  const thumb = asset.thumb_path
    ? `${api.base}/api/material-lib/thumb/${asset.id}`
    : null;
  return (
    <div onClick={onClick} onDoubleClick={onDoubleClick} data-testid="mv2-asset-card" style={{
      borderRadius: 8, overflow: "hidden", cursor: "pointer",
      border: selected ? `2px solid ${T_GREEN}` : `1px solid ${T.border}`,
      background: "#fff", transition: "all 0.12s", position: "relative",
    }}
      onMouseEnter={e => e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.08)"}
      onMouseLeave={e => e.currentTarget.style.boxShadow = ""}
    >
      <div style={{
        aspectRatio: "16/9", background: T.bg2,
        backgroundImage: thumb ? `url(${thumb})` : "",
        backgroundSize: "cover", backgroundPosition: "center",
        display: "flex", alignItems: "center", justifyContent: "center",
        position: "relative",
      }}>
        {!thumb && (
          <span style={{ color: T.muted3, fontSize: 22 }}>{isVideo ? "🎬" : "🖼️"}</span>
        )}
        {dur && (
          <span style={{
            position: "absolute", bottom: 4, right: 4,
            background: "rgba(0,0,0,0.65)", color: "#fff",
            fontSize: 10, padding: "1px 5px", borderRadius: 3,
          }}>▶ {dur}</span>
        )}
      </div>
      <div style={{
        padding: "5px 7px", display: "flex", alignItems: "center",
        justifyContent: "space-between", gap: 4, fontSize: 10.5,
        background: "#fafafa", borderTop: `1px solid ${T.borderSoft}`,
      }}>
        <div style={{ flex: 1, minWidth: 0, display: "flex", gap: 3, alignItems: "center" }}>
          {tags.length === 0 ? (
            <span style={{ color: T_AMBER, fontSize: 10 }}>⚠ 待标</span>
          ) : tags.slice(0, 2).map(t => (
            <span key={t.id} style={{
              fontSize: 9.5, color: T.muted, background: "#f0f0f0",
              padding: "1px 4px", borderRadius: 2, whiteSpace: "nowrap",
            }}>{t.source === "ai" ? "✨" : ""}{t.name}</span>
          ))}
        </div>
        {hits > 0 && (
          <span style={{ color: T.muted3, fontSize: 10 }}>{hits}×</span>
        )}
      </div>
    </div>
  );
}


function _fmtDur(s) {
  if (!s) return "";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}


// ─── L4 大预览 (黑底 + 右栏信息) ────────────────────────────

function MV2L4Preview({ asset: assetMini, onClose, onNav }) {
  const [asset, setAsset] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState("");
  const [tagging, setTagging] = React.useState(false);
  const [tagResult, setTagResult] = React.useState(null);

  async function load() {
    setLoading(true); setErr("");
    try {
      const a = await api.get(`/api/material-lib/asset/${assetMini.id}`);
      setAsset(a);
    } catch (e) {
      setErr(e.message);
    }
    setLoading(false);
  }
  React.useEffect(() => { load(); }, [assetMini.id]);

  async function handleTag(force) {
    setTagging(true); setErr(""); setTagResult(null);
    try {
      const r = await api.post(`/api/material-lib/tag/${asset.id}${force ? "?force=true" : ""}`);
      setTagResult(r);
      await load();  // 刷新 asset.tags
    } catch (e) {
      setErr(e.message);
    }
    setTagging(false);
  }

  function handleEsc(e) {
    if (e.key === "Escape") onClose();
  }
  React.useEffect(() => {
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, []);

  const isVideo = asset && [".mp4", ".mov", ".m4v", ".avi", ".mpg"].includes(asset.ext);
  const fileUrl = asset ? `${api.base}/api/material-lib/file/${asset.id}` : "";

  async function handleUseInVideo() {
    try {
      await api.post("/api/material-lib/usage", {
        asset_id: asset.id,
        used_in: "make-page",
      });
    } catch {}
    // D-085 LiDock nav tool 风格: 跳到 make 页
    window.dispatchEvent(new CustomEvent("ql-nav", { detail: { page: "make" } }));
    if (onNav) onNav("make");
  }

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.92)",
      display: "flex", zIndex: 200,
    }}>
      {/* 主区: 大预览 */}
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, position: "relative" }}>
        <button onClick={onClose} style={{
          position: "absolute", top: 16, left: 16, background: "rgba(255,255,255,0.1)",
          color: "#fff", border: "none", borderRadius: 8, padding: "6px 12px",
          cursor: "pointer", fontSize: 13,
        }}>← 返回</button>
        {loading && <div style={{ color: "#fff" }}>加载中...</div>}
        {err && <div style={{ color: "#fff" }}><InlineError err={err} /></div>}
        {asset && isVideo && (
          <video src={fileUrl} controls autoPlay style={{ maxWidth: "100%", maxHeight: "92vh" }} />
        )}
        {asset && !isVideo && (
          <img src={fileUrl} alt={asset.filename} style={{ maxWidth: "100%", maxHeight: "92vh", objectFit: "contain" }} />
        )}
      </div>

      {/* 右栏: 信息 + "用它做视频" */}
      <div style={{
        width: 340, background: "#fff", padding: "20px 18px",
        overflowY: "auto", display: "flex", flexDirection: "column", gap: 14,
      }}>
        {asset && (
          <>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{asset.filename}</div>
              <div style={{ fontSize: 11.5, color: T.muted2 }}>
                {asset.size_bytes ? `${(asset.size_bytes / 1024 / 1024).toFixed(1)} MB · ` : ""}
                {asset.width && asset.height ? `${asset.width}×${asset.height}` : ""}
                {asset.duration_sec ? ` · ${_fmtDur(asset.duration_sec)}` : ""}
              </div>
            </div>

            <div>
              <div style={{ fontSize: 11, color: T.muted, marginBottom: 4 }}>📁 文件位置</div>
              <div style={{ fontSize: 11, color: T.muted2, padding: "6px 8px", background: T.bg2, borderRadius: 6, wordBreak: "break-all" }}>
                {asset.rel_folder === "." ? "(根目录)" : asset.rel_folder} / {asset.filename}
              </div>
            </div>

            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                <div style={{ fontSize: 11, color: T.muted }}>🏷 标签</div>
                {(asset.tags.length === 0 || asset.tags.length > 0) && (
                  <button
                    onClick={() => handleTag(asset.tags.length > 0)}
                    disabled={tagging}
                    data-testid="mv2-l4-tag-btn"
                    style={{
                      fontSize: 11, padding: "2px 8px", borderRadius: 4,
                      background: tagging ? T.bg2 : "transparent",
                      border: `1px solid ${T_GREEN}`, color: T_GREEN,
                      cursor: tagging ? "wait" : "pointer", fontFamily: "inherit",
                    }}
                  >
                    {tagging ? "AI 打标中..." : asset.tags.length > 0 ? "✨ 重新打标" : "✨ AI 打标"}
                  </button>
                )}
              </div>
              {asset.tags.length === 0 ? (
                <div style={{ fontSize: 11.5, color: T_AMBER }}>⚠ 还没打标 · 点上面"✨ AI 打标"</div>
              ) : (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {asset.tags.map(t => (
                    <span key={t.id} style={{
                      fontSize: 11, padding: "2px 7px", borderRadius: 4,
                      background: t.source === "ai" ? "#e8f5e9" : "#e3f2fd",
                      color: t.source === "ai" ? "#2e7d32" : "#1565c0",
                      border: t.source === "ai" ? "1px dashed #81c784" : "none",
                    }}>{t.source === "ai" ? "✨" : ""}{t.name}</span>
                  ))}
                </div>
              )}
              {tagResult && tagResult.reason && (
                <div style={{ fontSize: 10.5, color: T.muted2, marginTop: 6, padding: "6px 8px", background: "#f0f7f0", borderRadius: 4, border: `1px solid ${T_GREEN}33` }}>
                  💡 {tagResult.reason}
                  {tagResult.folder && tagResult.folder !== asset.rel_folder && (
                    <div style={{ marginTop: 3, color: T_AMBER }}>📂 建议归到: {tagResult.folder}</div>
                  )}
                </div>
              )}
            </div>

            <div>
              <div style={{ fontSize: 11, color: T.muted, marginBottom: 4 }}>🎯 命中</div>
              {asset.hits === 0 ? (
                <div style={{ fontSize: 11.5, color: T.muted2 }}>还没用过</div>
              ) : (
                <div>
                  <div style={{ fontSize: 12 }}>用过 {asset.hits} 次</div>
                  {asset.usage[0] && (
                    <div style={{ fontSize: 11, color: T.muted2, marginTop: 2 }}>
                      最近: {asset.usage[0].used_in || "—"}
                    </div>
                  )}
                </div>
              )}
            </div>

            <Btn variant="primary" size="lg" onClick={handleUseInVideo} style={{ marginTop: 8 }}>
              ✨ 用它做视频
            </Btn>
          </>
        )}
      </div>
    </div>
  );
}


// ─── 主组件 (4 层 state machine) ─────────────────────────

function PageMaterialsV2({ onNav }) {
  const [view, setView] = React.useState("home");  // home | folder | grid | (preview 是叠加 modal)
  const [topFolder, setTopFolder] = React.useState("");
  const [subFolder, setSubFolder] = React.useState("");
  const [previewAsset, setPreviewAsset] = React.useState(null);
  const [mode, setMode] = React.useState("grouped");  // grouped (C) | list (A)

  // 大屏数据
  const [stats, setStats] = React.useState(null);
  const [folders, setFolders] = React.useState([]);
  const [activity, setActivity] = React.useState([]);
  const [topUsed, setTopUsed] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [sideLoading, setSideLoading] = React.useState(true);
  const [err, setErr] = React.useState("");
  const [scanning, setScanning] = React.useState(false);
  const [batchTagging, setBatchTagging] = React.useState(false);
  // 全库搜索 (D-087 整改 follow-up)
  const [search, setSearch] = React.useState("");
  const [searchResults, setSearchResults] = React.useState([]);
  const [searching, setSearching] = React.useState(false);

  // debounce 300ms 触发搜索 (search 状态变后)
  React.useEffect(() => {
    const q = (search || "").trim();
    if (!q) { setSearchResults([]); setSearching(false); return; }
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const r = await api.get(`/api/material-lib/search?q=${encodeURIComponent(q)}&limit=30`);
        setSearchResults(r.items || []);
      } catch (e) {
        setErr(e.message);
        setSearchResults([]);
      }
      setSearching(false);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  async function loadHome() {
    setLoading(true); setSideLoading(true); setErr("");
    try {
      const [s, f, a, t] = await Promise.all([
        api.get("/api/material-lib/stats"),
        api.get("/api/material-lib/folders"),
        api.get("/api/material-lib/recent-activity?limit=6"),
        api.get("/api/material-lib/top-used?limit=5"),
      ]);
      setStats(s);
      setFolders(f.folders || []);
      setActivity(a.events || []);
      setTopUsed(t.items || []);
    } catch (e) {
      setErr(e.message);
    }
    setLoading(false); setSideLoading(false);
  }
  React.useEffect(() => { loadHome(); }, []);

  async function handleScan() {
    setScanning(true); setErr("");
    try {
      const r = await api.post("/api/material-lib/scan");
      const taskId = r.task_id;
      // 轮询 task 状态
      let waited = 0;
      while (waited < 120000) {  // 最多等 2 分钟
        await new Promise(res => setTimeout(res, 2000));
        waited += 2000;
        try {
          const t = await api.get(`/api/tasks/${taskId}`);
          if (t.status === "ok") {
            await loadHome();
            break;
          }
          if (t.status === "failed") {
            setErr(t.error || "扫描失败");
            break;
          }
        } catch {}
      }
    } catch (e) {
      setErr(e.message);
    }
    setScanning(false);
  }

  async function handleBatchTag() {
    setBatchTagging(true); setErr("");
    try {
      const r = await api.post("/api/material-lib/tag-batch?limit=10");
      const taskId = r.task_id;
      // 轮询 (最多 3 分钟)
      let waited = 0;
      while (waited < 180000) {
        await new Promise(res => setTimeout(res, 3000));
        waited += 3000;
        try {
          const t = await api.get(`/api/tasks/${taskId}`);
          if (t.status === "ok") {
            await loadHome();
            break;
          }
          if (t.status === "failed") {
            setErr(t.error || "批量打标失败");
            break;
          }
        } catch {}
      }
    } catch (e) {
      setErr(e.message);
    }
    setBatchTagging(false);
  }

  function handlePickFolder(folder) {
    setTopFolder(folder);
    setMode("grouped");
    setView("folder");
  }
  function handlePickSubfolder(folder) {
    setSubFolder(folder);
    setView("grid");
  }
  function handlePickAsset(asset, folder) {
    setPreviewAsset(asset);
  }
  function handleBackHome() {
    setView("home");
    loadHome();
  }
  function handleBackFolder() {
    setView("folder");
  }
  function handleClosePreview() {
    setPreviewAsset(null);
  }

  return (
    <div style={{ padding: "20px 24px" }}>
      {view === "home" && (
        <MV2L1Home
          stats={stats} folders={folders} loading={loading} err={err}
          onPickFolder={handlePickFolder}
          onScan={handleScan} scanning={scanning}
          onBatchTag={handleBatchTag} batchTagging={batchTagging}
          activity={activity} topUsed={topUsed} sideLoading={sideLoading}
          search={search} onSearch={setSearch}
          searchResults={searchResults} searching={searching}
          onPickAsset={(a) => setPreviewAsset(a)}
        />
      )}
      {view === "folder" && (
        <MV2L2Folder
          topFolder={topFolder}
          mode={mode} onModeChange={setMode}
          onBack={handleBackHome}
          onPickAsset={handlePickAsset}
          onPickSubfolder={handlePickSubfolder}
        />
      )}
      {view === "grid" && (
        <MV2L3Grid
          folder={subFolder}
          onPickAsset={handlePickAsset}
          onBack={handleBackFolder}
        />
      )}
      {previewAsset && (
        <MV2L4Preview
          asset={previewAsset}
          onClose={handleClosePreview}
          onNav={onNav}
        />
      )}
    </div>
  );
}


// 全局挂载
Object.assign(window, { PageMaterialsV2 });
