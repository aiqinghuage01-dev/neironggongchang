// pages-content.jsx — P3 改写(左原文 / 右改写后 对照)

const STYLES = [
  { id: 'casual', label: '轻松口语', sub: '像跟熟客聊天,最容易让人看下去', hot: true },
  { id: 'pro', label: '专业讲解', sub: '适合讲产品细节、服务流程' },
  { id: 'story', label: '故事叙事', sub: '从一个小场景切入,带情绪' },
];

function PageContent({ original, onNext, onBack, onGoWorks, onGoMaterials, initialFinal, onJumpTo, pathKind, source, sourceUrl, author }) {
  const [style, setStyle] = React.useState('casual');
  const [final, setFinal] = React.useState(initialFinal || '');
  const [sending, setSending] = React.useState(false);
  const [err, setErr] = React.useState('');
  const [tokens, setTokens] = React.useState(0);

  async function rewrite() {
    setSending(true); setErr('');
    try {
      const r = await api.post('/api/rewrite', { text: original, style });
      setFinal(r.text);
      setTokens(r.tokens || 0);
    } catch (e) {
      setErr(e.message);
    } finally {
      setSending(false);
    }
  }

  React.useEffect(() => {
    if (!initialFinal && original && !final) rewrite();
    // eslint-disable-next-line
  }, []);

  const originFrom = sourceUrl ? `链接 · ${author || '@原作者'}` : pathKind === 'text' ? '你粘的文案' : '(空)';

  return (
    <PageShell
      stage={3}
      onGoWorks={onGoWorks}
      onGoMaterials={onGoMaterials}
      onJumpTo={onJumpTo}
      pathKind={pathKind}
      source={source}
      onPrev={onBack}
      onNext={() => onNext({ finalText: final, tokens, style })}
      nextLabel="就用这个 →"
      nextDisabled={!final || sending}
      sending={sending}
      productBar={[
        { label: '原文案', value: `${original.length} 字`, extra: `来自:${originFrom}` },
      ]}
      convo={[
        { from: 'ai', text: `拿到 ${original.length} 字原文案。选个风格我帮你改成适合口播的(原文在左边一直都看得见)。` },
        ...(final ? [{ from: 'ai', text: `改好了 · ${final.length} 字 · 不满意可以换风格重改。` }] : []),
      ]}
      quick={['🔙 换风格', '加促销钩子', '缩短到 20 秒']}
    >
      <div style={{ padding: 20, display: 'flex', flexDirection: 'column', flex: 1, gap: 14, minHeight: 0 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          {STYLES.map(s => (
            <div
              key={s.id}
              onClick={() => setStyle(s.id)}
              style={{
                padding: 12, borderRadius: 12, cursor: 'pointer',
                border: `1.5px solid ${style === s.id ? cPalette.accent : cPalette.borderSoft}`,
                background: style === s.id ? cPalette.accentSoft : '#fcfaf6',
                transition: 'all .15s',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>{s.label}</div>
                {s.hot && <Badge>✨ 推荐</Badge>}
              </div>
              <div style={{ fontSize: 11.5, color: cPalette.textMid }}>{s.sub}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Btn size="sm" onClick={rewrite} disabled={sending || !original} primary={!final}>
            {sending ? '改写中...' : final ? '↻ 换风格重改' : '✨ 开始改写'}
          </Btn>
          <div style={{ flex: 1 }} />
          <div style={{ fontSize: 11, color: cPalette.textSoft, fontFamily: 'SF Mono, Menlo, monospace' }}>
            原文 {original.length} 字 · 改写后 {final.length} 字 {tokens ? `· ${tokens} tokens` : ''}
          </div>
        </div>

        {/* 左右对照 */}
        <div style={{ flex: 1, display: 'flex', gap: 14, minHeight: 0 }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: cPalette.textSoft, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>原文案</span>
              <span style={{ fontSize: 10, color: cPalette.textSoft, fontFamily: 'SF Mono, Menlo, monospace', letterSpacing: 0, textTransform: 'none' }}>{originFrom}</span>
            </div>
            <div style={{ flex: 1, background: '#fcfaf6', border: `1px solid ${cPalette.borderSoft}`, borderRadius: 10, padding: 14, fontSize: 13, lineHeight: 1.75, color: cPalette.textMid, overflow: 'auto', whiteSpace: 'pre-wrap', minHeight: 200 }}>
              {original}
            </div>
          </div>
          <div style={{ flex: 1.1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: cPalette.text, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
              改写后(可以继续编辑) {sending && <TypingDots />}
            </div>
            <textarea
              value={final}
              onChange={(e) => setFinal(e.target.value)}
              placeholder={sending ? '改写中...' : '改写结果会出现在这里...'}
              style={{ flex: 1, background: '#fff', border: `1.5px solid ${cPalette.accent}`, boxShadow: `0 0 0 4px ${cPalette.accentSoft}`, borderRadius: 10, padding: 14, fontSize: 14, lineHeight: 1.8, fontFamily: 'inherit', resize: 'none', outline: 'none', color: cPalette.text, minHeight: 200 }}
            />
          </div>
        </div>

        {err && <div style={{ padding: 10, background: '#fbe8e6', color: cPalette.danger, borderRadius: 8, fontSize: 12 }}>⚠️ {err}</div>}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {['再随意一点', '加促销钩子', '缩短到 20 秒', '强调免费', '加一句反问开头'].map((t, i) => (
            <Chip key={i} onClick={async () => {
              if (!final) return;
              setSending(true);
              try {
                const r = await api.post('/api/rewrite', { text: final, style: 'casual' });
                setFinal(r.text);
                setTokens(t2 => t2 + (r.tokens || 0));
              } catch (e) { setErr(e.message); }
              setSending(false);
            }}>{t}</Chip>
          ))}
        </div>
      </div>
    </PageShell>
  );
}

Object.assign(window, { PageContent });
