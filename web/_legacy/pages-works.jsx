// pages-works.jsx — 作品库页

function PageWorks({ onBack, onOpen, onJumpTo }) {
  const [list, setList] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState('');
  const [health, setHealth] = React.useState(null);

  async function load() {
    setLoading(true);
    try {
      const r = await api.get('/api/works?limit=200');
      setList(r);
    } catch (e) {
      setErr(e.message);
    }
    setLoading(false);
  }

  React.useEffect(() => {
    load();
    api.get('/api/health').then(setHealth).catch(() => {});
  }, []);

  async function removeWork(id) {
    if (!confirm('删除这条作品?(文件也会删除)')) return;
    try {
      await api.del(`/api/works/${id}?remove_file=true`);
      load();
    } catch (e) { alert(e.message); }
  }

  const statusColors = {
    ready: ['🟢 已生成', cPalette.accent, cPalette.accentSoft],
    published: ['🚀 已发布', cPalette.accent, cPalette.accentSoft],
    generating: ['🟡 生成中', cPalette.warn, cPalette.warnSoft],
    pending: ['⚪ 排队', cPalette.textMid, cPalette.borderSoft],
    failed: ['🔴 失败', cPalette.danger, '#fbe8e6'],
  };

  return (
    <div style={c2S.root}>
      <div style={{ ...c2S.topbar, gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <div style={{ width: 26, height: 26, borderRadius: 6, background: cPalette.text, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="folder" size={13} color="#fff" strokeWidth={2.2} />
          </div>
          <div style={{ fontSize: 14.5, fontWeight: 600 }}>作品库</div>
        </div>
        <div style={{ flex: 1 }} />
        {health && (
          <div style={{ display: 'flex', gap: 10, fontSize: 11.5 }}>
            {health.shiliu?.ok && <span style={{ color: cPalette.accent }}>🟢 石榴 {health.shiliu.points} 点</span>}
            {health.deepseek?.ok && <span style={{ color: cPalette.accent }}>🟢 DeepSeek</span>}
            {health.cosyvoice?.ok && <span style={{ color: cPalette.accent }}>🟢 CosyVoice</span>}
            {health.qingdou?.ok && <span style={{ color: cPalette.accent }}>🟢 轻抖</span>}
            {health.apimart?.ok && <span style={{ color: cPalette.accent }}>🟢 GPT-Image</span>}
          </div>
        )}
        <Btn primary size="sm" onClick={onBack}>+ 新作品</Btn>
      </div>

      <div style={{ flex: 1, padding: 30, minHeight: 700, overflow: 'auto' }}>
        {loading ? <div style={{ color: cPalette.textMid, textAlign: 'center', paddingTop: 80 }}>加载中...</div>
          : err ? <div style={{ color: cPalette.danger, textAlign: 'center', paddingTop: 80 }}>{err}</div>
          : list.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '80px 20px' }}>
              <div style={{ fontSize: 48, marginBottom: 10 }}>📂</div>
              <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>还没有作品</div>
              <div style={{ fontSize: 12, color: cPalette.textMid, marginBottom: 20 }}>开始第一条视频吧</div>
              <Btn primary onClick={onBack}>+ 做条新视频</Btn>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
              {list.map(w => {
                const [label, fg, bg] = statusColors[w.status] || statusColors.pending;
                const date = new Date(w.created_at * 1000);
                return (
                  <div key={w.id} style={{ background: cPalette.panel, border: `1px solid ${cPalette.border}`, borderRadius: 14, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                    {w.local_url ? (
                      <video src={api.media(w.local_url)} style={{ width: '100%', aspectRatio: '9/16', background: '#000', objectFit: 'cover' }} muted />
                    ) : (
                      <div style={{ width: '100%', aspectRatio: '9/16', background: 'linear-gradient(135deg, #3a5a4a 0%, #6a8a7a 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>
                        {w.status === 'generating' ? '生成中...' : '未生成'}
                      </div>
                    )}
                    <div style={{ padding: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: fg, background: bg, padding: '2px 7px', borderRadius: 100 }}>{label}</span>
                        <span style={{ fontSize: 10.5, color: cPalette.textSoft }}>{date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 4, display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{w.title || '(无标题)'}</div>
                      <div style={{ fontSize: 11.5, color: cPalette.textMid, lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', minHeight: 34 }}>{w.final_text || ''}</div>
                      <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                        {w.local_url && (
                          <a href={api.media(w.local_url)} download style={{ textDecoration: 'none' }}>
                            <Btn size="sm"><Icon name="download" size={11} /> 下载</Btn>
                          </a>
                        )}
                        <div style={{ flex: 1 }} />
                        <Btn size="sm" onClick={() => removeWork(w.id)}><Icon name="trash" size={11} /></Btn>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
      </div>
    </div>
  );
}

Object.assign(window, { PageWorks });
