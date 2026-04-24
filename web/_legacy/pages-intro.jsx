// pages-intro.jsx — P1 原料入口 + P2a 扒文案中 + P2 扒文案成果页

// ─── P1 原料入口:一个大输入框,自动判断链接/文案 ───
function PageIntro({ onSubmit, onGoWorks, onGoMaterials, onJumpTo, pathKind }) {
  const [val, setVal] = React.useState('');
  // 识别分享格式:"文本 + emoji + URL"(抖音/小红书/快手/B站 App 分享都是这样)
  // 只要能从输入里抠出 http(s) URL,就按链接走
  const urlMatch = val.match(/(https?:\/\/[^\s)\]】]+)/i);
  const kind = val.trim() === '' ? null : urlMatch ? 'url' : 'text';

  function go() {
    const v = val.trim();
    if (!v) return;
    // 链接路径只提交提取到的纯 URL,省得后端解析分享文
    onSubmit({ kind, value: urlMatch ? urlMatch[1] : v });
  }

  return (
    <PageShell
      stage={1}
      onGoWorks={onGoWorks}
      onGoMaterials={onGoMaterials}
      onJumpTo={onJumpTo}
      pathKind={pathKind}
      source="none"
      convo={[{ from: 'ai', text: '老板好呀 👋 今天想做条什么视频？\n\n丢给我就行,两种都能认:\n• 视频链接 → 我帮你扒文案\n• 直接粘文案 → 跳过扒文案,直接改写' }]}
      quick={['🔗 试试粘个链接', '📝 我直接写文案', '📦 从素材库选']}
    >
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 40, gap: 24 }}>
        <div style={{ textAlign: 'center', marginBottom: 4 }}>
          <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 8 }}>先给我点东西开始 👇</div>
          <div style={{ fontSize: 13, color: cPalette.textMid }}>粘链接或文案都行,我自动认</div>
        </div>
        <div style={{ width: 560, background: '#fff', border: `1.5px solid ${cPalette.accent}`, boxShadow: `0 0 0 5px ${cPalette.accentSoft}`, borderRadius: 16, padding: 18 }}>
          <textarea
            rows={5}
            value={val}
            onChange={(e) => setVal(e.target.value)}
            placeholder="在这里粘视频链接,或者直接贴一段文案..."
            style={{ width: '100%', border: 'none', outline: 'none', background: 'transparent', fontSize: 14.5, fontFamily: 'inherit', resize: 'none', lineHeight: 1.7 }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, paddingTop: 12, borderTop: `1px solid ${cPalette.borderSoft}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: cPalette.textSoft }}>
              <Icon name="sparkle" size={11} color={cPalette.textSoft} />
              {kind === null ? '小栗会自动判断你给的是链接还是文案'
                : kind === 'url' ? <span style={{ color: cPalette.accent }}>✓ 识别为链接 - 我去扒文案</span>
                : <span style={{ color: cPalette.accent }}>✓ 识别为文案 - 跳过扒文案,直接去改写</span>}
            </div>
            <div style={{ flex: 1 }} />
            <Btn primary onClick={go} disabled={!val.trim()}>开始 →</Btn>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 14, width: 560 }}>
          {[
            { icon: 'link', title: '给个视频链接', desc: '小栗先扒文案 → 你再改 → 声音 → 数字人 → 剪辑 → 发布', sub: '例:https://v.douyin.com/...' },
            { icon: 'edit', title: '文案我已经写好了', desc: '跳过"扒文案",直接去改写 → 声音 → 数字人 → 剪辑 → 发布', sub: '自动跳过步骤 2' },
          ].map((c, i) => (
            <div key={i} style={{ flex: 1, padding: 14, background: '#fcfaf6', border: `1px solid ${cPalette.borderSoft}`, borderRadius: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <div style={{ width: 24, height: 24, borderRadius: 6, background: cPalette.accentSoft, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name={c.icon} size={11} color={cPalette.accent} strokeWidth={2.2} />
                </div>
                <div style={{ fontSize: 12.5, fontWeight: 600 }}>{c.title}</div>
              </div>
              <div style={{ fontSize: 11.5, color: cPalette.textMid, lineHeight: 1.55 }}>{c.desc}</div>
              <div style={{ marginTop: 8, fontSize: 10.5, color: cPalette.textSoft }}>{c.sub}</div>
            </div>
          ))}
        </div>
      </div>
    </PageShell>
  );
}

// ─── P2a 扒文案中:轻抖正在处理,带进度动画 + 超时兜底 ───
function PageTranscribing({ url, batchId, onSuccess, onFallbackPaste, onCancel, onGoWorks, onGoMaterials, onJumpTo, pathKind, source }) {
  const [elapsed, setElapsed] = React.useState(0);
  const [lastStatus, setLastStatus] = React.useState('running');
  const [err, setErr] = React.useState('');

  React.useEffect(() => {
    if (!batchId) return;
    const t0 = Date.now();
    const tick = setInterval(() => setElapsed(Math.floor((Date.now() - t0) / 1000)), 500);
    let cancelled = false;
    async function poll() {
      for (let i = 0; i < 30; i++) {
        if (cancelled) return;
        try {
          const res = await api.get(`/api/transcribe/query/${batchId}`);
          setLastStatus(res.status);
          if (res.status === 'succeed') {
            onSuccess({ text: res.text, title: res.title, author: res.author, duration_sec: res.duration_sec });
            return;
          }
          if (res.status === 'failed') {
            setErr(res.error || '扒不到文案');
            return;
          }
        } catch (e) {
          setErr(e.message);
          return;
        }
        await new Promise(r => setTimeout(r, 3000));
      }
      setErr('超时 90 秒未出结果');
    }
    poll();
    return () => { cancelled = true; clearInterval(tick); };
  }, [batchId]);

  const pct = Math.min(95, Math.floor((elapsed / 20) * 80));

  return (
    <PageShell
      stage={2}
      onGoWorks={onGoWorks}
      onGoMaterials={onGoMaterials}
      onJumpTo={onJumpTo}
      pathKind={pathKind}
      source={source || 'real'}
      productBar={[{ label: '粘的链接', value: url, extra: `batch=${batchId || '...'}` }]}
      convo={[
        { from: 'user', text: url },
        { from: 'ai', text: err ? `扒不到:${err}。直接粘贴文案也行。` : `正在扒文案...大约 15-30 秒,再等等` },
      ]}
      quick={['换个链接', '📝 改用文案粘贴']}
    >
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 40, gap: 22 }}>
        {!err ? (
          <>
            <div style={{ width: 96, height: 96, borderRadius: '50%', background: cPalette.accentSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
              <div style={{ width: 96, height: 96, borderRadius: '50%', border: `4px solid ${cPalette.accentSoft}`, borderTopColor: cPalette.accent, animation: 'qlspin 1.2s linear infinite', position: 'absolute', top: 0, left: 0 }} />
              <Icon name="link" size={28} color={cPalette.accent} strokeWidth={2} />
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 6 }}>正在扒文案...</div>
              <div style={{ fontSize: 13, color: cPalette.textMid }}>通常 15-30 秒 · 已用 <span style={{ fontWeight: 600, color: cPalette.text, fontFamily: 'SF Mono, Menlo, monospace' }}>{elapsed}s</span></div>
            </div>
            <div style={{ width: 480, height: 6, background: cPalette.borderSoft, borderRadius: 100, overflow: 'hidden' }}>
              <div style={{ width: `${pct}%`, height: '100%', background: cPalette.accent, transition: 'width .3s' }} />
            </div>
            <div style={{ fontSize: 11.5, color: cPalette.textSoft, fontFamily: 'SF Mono, Menlo, monospace' }}>batch: {batchId}</div>
            <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
              <Btn onClick={onCancel}>取消</Btn>
              <Btn onClick={onFallbackPaste}>扒不动?直接粘文案 →</Btn>
            </div>
          </>
        ) : (
          <>
            <div style={{ width: 72, height: 72, borderRadius: '50%', background: '#fbe8e6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="x" size={28} color={cPalette.danger} strokeWidth={2.5} />
            </div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>没扒到</div>
            <div style={{ fontSize: 13, color: cPalette.textMid, maxWidth: 440, textAlign: 'center' }}>{err}</div>
            <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
              <Btn onClick={onCancel}>← 换个链接</Btn>
              <Btn primary onClick={onFallbackPaste}>直接粘文案 →</Btn>
            </div>
          </>
        )}
      </div>
    </PageShell>
  );
}

// ─── P2 扒文案成果页(stage 2):原文案停驻 + 可复制 + 再决定改不改 ───
function PageTranscribeResult({ url, title, author, text, duration, onConfirm, onBack, onGoWorks, onGoMaterials, onJumpTo, pathKind, source }) {
  const [copied, setCopied] = React.useState(false);
  async function copyText() {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch {}
  }
  return (
    <PageShell
      stage={2}
      onGoWorks={onGoWorks}
      onGoMaterials={onGoMaterials}
      onJumpTo={onJumpTo}
      pathKind={pathKind}
      source={source}
      onPrev={onBack}
      onNext={onConfirm}
      nextLabel="下一步:改成我的话 →"
      productBar={[
        { label: '来源链接', value: url || '(示例)', extra: author ? `· ${author}` : '' },
      ]}
      convo={[
        { from: 'user', text: url },
        { from: 'ai', text: `✓ ${source === 'demo' ? '示例' : '扒到了'}!${text.length} 字。原文案在中间,可复制 · 下一步改成你的话。` },
      ]}
      quick={['✓ 改成我的话', '📋 复制原文', '换个链接']}
    >
      <div style={{ flex: 1, display: 'flex', padding: '20px 28px 24px', gap: 24, overflow: 'auto' }}>
        {/* 左:原视频占位卡 */}
        <div style={{ width: 220, flexShrink: 0 }}>
          <div style={{
            width: 220, height: 392, borderRadius: 18,
            background: 'linear-gradient(135deg, #1e293b 0%, #475569 100%)',
            display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
            padding: 14, color: '#fff', position: 'relative',
          }}>
            <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}>
              <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'rgba(255,255,255,0.22)', backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="play" size={20} color="#fff" />
              </div>
            </div>
            <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 4 }}>{author || '@原作者'}</div>
            <div style={{ fontSize: 11, lineHeight: 1.5, opacity: 0.9, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{title || text.slice(0, 40)}</div>
          </div>
          <div style={{ marginTop: 10, padding: '8px 10px', background: cPalette.bg, borderRadius: 8, fontSize: 11, color: cPalette.textMid, lineHeight: 1.6 }}>
            <div><b style={{ color: cPalette.text }}>{text.length}</b> 字</div>
            <div>原视频 <b style={{ color: cPalette.text }}>{duration ? `${Math.round(duration)}s` : '-'}</b></div>
            {author && <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{author}</div>}
          </div>
        </div>
        {/* 中:原文案(主体)*/}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>扒到的原文案</div>
            <Badge>{text.length} 字</Badge>
            <div style={{ flex: 1 }} />
            <Btn size="sm" onClick={copyText}>{copied ? '✓ 已复制' : '📋 复制原文'}</Btn>
          </div>
          <div style={{
            flex: 1, background: '#fcfaf6', border: `1.5px solid ${cPalette.borderSoft}`,
            borderRadius: 12, padding: 20, fontSize: 14.5, lineHeight: 1.85, color: cPalette.text,
            whiteSpace: 'pre-wrap', overflow: 'auto', minHeight: 320,
          }}>
            {text}
          </div>
          <div style={{ marginTop: 12, padding: 12, background: cPalette.accentSoft, borderRadius: 10, fontSize: 12.5, color: cPalette.accent, lineHeight: 1.55 }}>
            ✨ 点右下「下一步」会把这段改成你的话(3 种风格可选)。原文案一直在,可以对照着看。
          </div>
        </div>
        {/* 右:识别信息 */}
        <div style={{ width: 220, flexShrink: 0 }}>
          <Section label="小栗识别到">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {[
                ['标题', title || '(无)'],
                ['作者', author || '(未识别)'],
                ['字数', `${text.length} 字`],
                ['时长', duration ? `${Math.round(duration)} 秒` : '(未识别)'],
              ].map(([k, v]) => (
                <div key={k} style={{ display: 'flex', fontSize: 12, padding: '7px 0', borderBottom: `1px solid ${cPalette.borderSoft}` }}>
                  <div style={{ width: 44, color: cPalette.textSoft, flexShrink: 0 }}>{k}</div>
                  <div style={{ flex: 1, color: cPalette.text, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis' }}>{v}</div>
                </div>
              ))}
            </div>
          </Section>
          <div style={{ fontSize: 11.5, color: cPalette.textSoft, lineHeight: 1.6 }}>
            这条原料会自动存进<br/><b style={{ color: cPalette.text }}>📦 素材库</b>,下次做同类可复用。
          </div>
        </div>
      </div>
    </PageShell>
  );
}

Object.assign(window, { PageIntro, PageTranscribing, PageTranscribeResult });
