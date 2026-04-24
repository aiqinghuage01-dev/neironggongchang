// pages-materials.jsx — 素材库(扒过的链接 + 原文案的档案)

function PageMaterials({ onBack, onJumpTo, onGoWorks, onUseMaterial }) {
  const [items, setItems] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [q, setQ] = React.useState('');

  async function reload() {
    setLoading(true);
    try {
      const list = await api.get('/api/materials');
      setItems(list);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }
  React.useEffect(() => { reload(); }, []);

  async function del(id) {
    if (!confirm('删除这条素材?')) return;
    await api.del(`/api/materials/${id}`).catch(() => {});
    reload();
  }

  const visible = items.filter(m => {
    if (!q.trim()) return true;
    const k = q.trim().toLowerCase();
    return (m.title || '').toLowerCase().includes(k)
        || (m.original_text || '').toLowerCase().includes(k)
        || (m.author || '').toLowerCase().includes(k);
  });

  return (
    <div style={{ ...c2S.root }}>
      <div style={{ ...c2S.topbar, gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 26, height: 26, borderRadius: 6, background: cPalette.text, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="folder" size={13} color="#fff" strokeWidth={2.2} />
          </div>
          <div style={{ fontSize: 14.5, fontWeight: 600 }}>素材库 · 扒过的链接 + 原文案</div>
        </div>
        <div style={{ flex: 1 }} />
        <ApiStatusLight />
        <div style={{ width: 1, height: 20, background: cPalette.borderSoft }} />
        <Btn size="sm" onClick={onGoWorks}>🎬 作品库</Btn>
        <Btn size="sm" onClick={onBack}>← 回入口</Btn>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: cPalette.panel, margin: 18, borderRadius: 16, border: `1px solid ${cPalette.border}`, overflow: 'hidden' }}>
        <div style={{ padding: '18px 24px 14px', borderBottom: `1px solid ${cPalette.borderSoft}`, display: 'flex', alignItems: 'center', gap: 14 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>📦 素材库</div>
            <div style={{ fontSize: 12, color: cPalette.textMid, marginTop: 2 }}>
              每次扒成功的文案自动存这里 · 共 <b style={{ color: cPalette.text }}>{items.length}</b> 条 · 下次做同类型的可以直接挑一条复用
            </div>
          </div>
          <div style={{ flex: 1 }} />
          <input
            placeholder="🔍 搜标题 / 文案 / 作者"
            value={q} onChange={e => setQ(e.target.value)}
            style={{ width: 260, padding: '8px 14px', fontSize: 13, border: `1px solid ${cPalette.border}`, borderRadius: 100, outline: 'none', background: cPalette.bg, fontFamily: 'inherit' }}
          />
          <Btn size="sm" onClick={reload}>↻ 刷新</Btn>
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: 20 }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 40, color: cPalette.textMid }}>加载中...</div>
          ) : visible.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 60, color: cPalette.textMid }}>
              <div style={{ fontSize: 44, marginBottom: 12 }}>📭</div>
              <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>{items.length === 0 ? '还没有素材' : '没搜到匹配的'}</div>
              <div style={{ fontSize: 12.5 }}>{items.length === 0 ? '回入口粘个链接扒文案,成功后会自动存到这里' : '换个关键词试试'}</div>
              <div style={{ marginTop: 18 }}>
                <Btn primary onClick={onBack}>← 回入口粘链接</Btn>
              </div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 }}>
              {visible.map(m => (
                <div key={m.id} style={{
                  padding: 16, background: '#fcfaf6', border: `1px solid ${cPalette.borderSoft}`,
                  borderRadius: 12, display: 'flex', flexDirection: 'column', gap: 10,
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600, color: cPalette.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {m.title || m.original_text.slice(0, 40)}
                      </div>
                      <div style={{ fontSize: 11.5, color: cPalette.textSoft, marginTop: 3, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                        <span>{m.author || '(无作者)'}</span>
                        {m.duration_sec ? <span>· {Math.round(m.duration_sec)}s</span> : null}
                        <span>· {m.original_text.length} 字</span>
                        <span>· {new Date(m.created_at * 1000).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })}</span>
                      </div>
                    </div>
                    <Badge tone={m.source === 'qingdou' ? 'accent' : 'neutral'}>{m.source || 'manual'}</Badge>
                  </div>
                  {m.url && (
                    <div style={{ fontSize: 10.5, color: cPalette.textSoft, fontFamily: 'SF Mono, Menlo, monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      🔗 {m.url}
                    </div>
                  )}
                  <div style={{
                    fontSize: 12, color: cPalette.textMid, lineHeight: 1.6,
                    background: cPalette.panel, border: `1px solid ${cPalette.borderSoft}`,
                    borderRadius: 8, padding: 10, maxHeight: 80, overflow: 'hidden',
                    position: 'relative',
                  }}>
                    {m.original_text.slice(0, 200)}{m.original_text.length > 200 ? '…' : ''}
                    {m.original_text.length > 200 && (
                      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 20, background: 'linear-gradient(transparent, #fcfaf6)' }} />
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Btn size="sm" primary onClick={() => onUseMaterial(m)}>✨ 用这条再做一次</Btn>
                    {m.url && <Btn size="sm" onClick={() => navigator.clipboard?.writeText(m.url)}>📋 复制链接</Btn>}
                    <div style={{ flex: 1 }} />
                    <Btn size="sm" onClick={() => del(m.id)}>🗑</Btn>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { PageMaterials });
