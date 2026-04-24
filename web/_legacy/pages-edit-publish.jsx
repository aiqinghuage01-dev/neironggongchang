// pages-edit-publish.jsx — P5 剪辑 / P5.5 等待合成 / P6 发布 + 封面

// ─── P6 一键剪辑(模板 + BGM) ───
function PageEdit({ finalText, speakerId, speakerTitle, avatarId, avatarTitle, onConfirm, onBack, onGoWorks, onGoMaterials, onJumpTo, pathKind, source }) {
  const [templates, setTemplates] = React.useState([]);
  const [bgm, setBgm] = React.useState('b1');
  const [tpl, setTpl] = React.useState('t1');

  React.useEffect(() => {
    api.get('/api/templates').then(setTemplates).catch(() => {});
  }, []);

  const bgms = [
    { id: 'b1', label: '热血律动', dur: '32s', vibe: '快 · 动感', hot: true },
    { id: 'b2', label: '温暖日常', dur: '32s', vibe: '慢 · 生活' },
    { id: 'b3', label: '商业节奏', dur: '32s', vibe: '中 · 正式' },
    { id: 'b4', label: '轻松欢快', dur: '32s', vibe: '中 · 活泼' },
  ];

  const pickedTpl = templates.find(t => t.id === tpl) || templates[0];
  const tplColor = pickedTpl?.color || '#d97757';

  return (
    <PageShell
      stage={6}
      onGoWorks={onGoWorks}
      onGoMaterials={onGoMaterials}
      onJumpTo={onJumpTo}
      pathKind={pathKind}
      source={source}
      onPrev={onBack}
      onNext={() => onConfirm({ templateId: tpl, bgmId: bgm })}
      nextLabel="生成成片 →"
      productBar={[
        { label: '定稿', value: `${(finalText || '').length} 字` },
        { label: '声音', value: speakerTitle || '(示例)' },
        { label: '形象', value: avatarTitle || '(示例)' },
      ]}
      convo={[
        { from: 'ai', text: '形象定了 ✓ 现在一键剪成片。' },
        { from: 'ai', text: '默认「高能量快剪」+「热血律动」BGM,最适合实体店引流。' },
      ]}
      quick={['✨ 就用推荐的', '🎵 传我自己的 BGM', '🎬 看看别的模板']}
    >
      <div style={{ flex: 1, display: 'flex', padding: 22, gap: 20 }}>
        {/* 预览 */}
        <div style={{ width: 252, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 252, height: 448, borderRadius: 22,
            background: `linear-gradient(180deg, ${tplColor} 0%, rgba(0,0,0,0.6) 60%, #1a1a1a 100%)`,
            position: 'relative', overflow: 'hidden', boxShadow: '0 20px 40px rgba(0,0,0,0.15)',
          }}>
            <div style={{ position: 'absolute', top: 14, left: 14, fontSize: 10, color: '#fff', background: 'rgba(0,0,0,0.4)', padding: '3px 8px', borderRadius: 100, display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#ff3b30' }} /> 预览
            </div>
            <div style={{ position: 'absolute', top: '42%', left: 14, right: 14, color: '#fff', fontSize: 28, fontWeight: 900, textShadow: '0 3px 12px rgba(0,0,0,0.5)', lineHeight: 1.1 }}>
              {finalText.split('\n')[0].slice(0, 12)}<br />
              <span style={{ fontSize: 40, color: '#ffdd44' }}>{(finalText.match(/[一二三四五六七八九十百千万免]/g) || []).slice(0, 3).join('') || '精彩内容'}</span>
            </div>
            <div style={{ position: 'absolute', bottom: 14, left: 14, right: 14, height: 3, background: 'rgba(255,255,255,0.3)', borderRadius: 100 }}>
              <div style={{ width: '43%', height: '100%', background: '#fff', borderRadius: 100 }} />
            </div>
          </div>
          <div style={{ fontSize: 11, color: cPalette.textMid, fontFamily: 'SF Mono, Menlo, monospace' }}>模板预览 · 9:16</div>
        </div>

        {/* 模板 + BGM */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <Section label="剪辑模板 · 点击切换">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
              {templates.map(t => (
                <div
                  key={t.id}
                  onClick={() => setTpl(t.id)}
                  style={{
                    padding: 8, borderRadius: 10, cursor: 'pointer',
                    border: tpl === t.id ? `2px solid ${cPalette.accent}` : `1px solid ${cPalette.border}`,
                    background: tpl === t.id ? cPalette.accentSoft : '#fff',
                    transform: tpl === t.id ? 'translateY(-3px)' : 'none',
                    transition: 'all .15s',
                  }}
                >
                  <div style={{
                    width: '100%', aspectRatio: '9/16', borderRadius: 6, marginBottom: 6,
                    background: `linear-gradient(180deg, ${t.color} 0%, rgba(0,0,0,0.6) 100%)`,
                    position: 'relative', overflow: 'hidden',
                  }}>
                    {t.hot && <div style={{ position: 'absolute', top: 4, right: 4, fontSize: 8.5, fontWeight: 600, background: '#fff', color: cPalette.accent, padding: '1px 5px', borderRadius: 100 }}>✨</div>}
                    <div style={{ position: 'absolute', bottom: 6, left: 6, right: 6, color: '#fff', fontSize: 9, fontWeight: 700, textShadow: '0 1px 2px rgba(0,0,0,0.6)' }}>{t.label}</div>
                  </div>
                  <div style={{ fontSize: 10.5, fontWeight: 600, color: cPalette.text, lineHeight: 1.3 }}>{t.label}</div>
                  <div style={{ fontSize: 9.5, color: cPalette.textMid, marginTop: 1, lineHeight: 1.3 }}>{t.sub}</div>
                </div>
              ))}
            </div>
          </Section>

          <Section label="背景音乐 · AI 推荐 + 预设库">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {bgms.map(b => (
                <div
                  key={b.id}
                  onClick={() => setBgm(b.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 10,
                    background: bgm === b.id ? cPalette.accentSoft : '#fcfaf6',
                    border: `1px solid ${bgm === b.id ? cPalette.accent : cPalette.borderSoft}`,
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ width: 30, height: 30, borderRadius: '50%', background: bgm === b.id ? cPalette.accent : cPalette.text, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Icon name="play" size={11} color="#fff" />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 1.5, height: 18, width: 70 }}>
                    {Array.from({ length: 22 }).map((_, i) => (
                      <div key={i} style={{ flex: 1, height: 3 + Math.abs(Math.sin(i * 0.7 + b.id.charCodeAt(1))) * 14, borderRadius: 1, background: bgm === b.id ? cPalette.accent : cPalette.textSoft }} />
                    ))}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                      {b.label}
                      {b.hot && <Badge>✨ 推荐</Badge>}
                    </div>
                    <div style={{ fontSize: 10.5, color: cPalette.textMid, marginTop: 1 }}>{b.vibe} · {b.dur}</div>
                  </div>
                  <SoonBadge />
                </div>
              ))}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 10, border: `1px dashed ${cPalette.borderSoft}`, color: cPalette.textMid }}>
                <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#fff', border: `1px solid ${cPalette.borderSoft}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon name="upload" size={12} color={cPalette.textMid} strokeWidth={2} />
                </div>
                <div style={{ fontSize: 12.5 }}>传我自己的音乐 · mp3</div>
                <div style={{ marginLeft: 'auto' }}><SoonBadge /></div>
              </div>
            </div>
          </Section>

          <div style={{ flex: 1 }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 0', borderTop: `1px solid ${cPalette.borderSoft}` }}>
            <div style={{ flex: 1, fontSize: 11.5, color: cPalette.textMid }}>
              预估 <b style={{ color: cPalette.text }}>32 秒</b> · 含字幕 · BGM「{bgms.find(b => b.id === bgm)?.label}」·
              <span style={{ marginLeft: 6, color: cPalette.warn }}>BGM 合成下个版本做,当前只用石榴生成</span>
            </div>
          </div>
        </div>
      </div>
    </PageShell>
  );
}

// ─── P6.5 等待合成(石榴视频生成中)───
function PageWaiting({ workId, videoId, onDone, onError, onGoWorks, onGoMaterials, onJumpTo, pathKind, source }) {
  const [progress, setProgress] = React.useState(0);
  const [status, setStatus] = React.useState('pending');
  const [err, setErr] = React.useState('');
  const [elapsed, setElapsed] = React.useState(0);

  React.useEffect(() => {
    if (!videoId) return;
    const t0 = Date.now();
    const tick = setInterval(() => setElapsed(Math.floor((Date.now() - t0) / 1000)), 500);
    let cancelled = false;
    async function poll() {
      for (let i = 0; i < 60; i++) {
        if (cancelled) return;
        try {
          const r = await api.get(`/api/video/query/${videoId}`);
          setProgress(r.progress || 0);
          setStatus(r.status);
          if (r.local_url || r.status?.toLowerCase() === 'ready' || r.status?.toLowerCase() === 'succeed') {
            onDone({ localUrl: r.local_url || r.video_url, status: r.status });
            return;
          }
          if (r.status?.toLowerCase() === 'failed') {
            setErr('石榴生成失败');
            onError && onError('石榴生成失败');
            return;
          }
        } catch (e) {
          setErr(e.message);
        }
        await new Promise(r => setTimeout(r, 6000));
      }
      setErr('超时 6 分钟未生成完');
    }
    poll();
    return () => { cancelled = true; clearInterval(tick); };
  }, [videoId]);

  return (
    <PageShell
      stage={7}
      statusLabel={`石榴生成中 · ${elapsed}s`}
      onGoWorks={onGoWorks}
      onGoMaterials={onGoMaterials}
      onJumpTo={onJumpTo}
      pathKind={pathKind}
      source={source || 'real'}
      productBar={[
        { label: '石榴任务', value: `video_id=${videoId}` },
        { label: '作品', value: `work=${workId}` },
      ]}
      convo={[
        { from: 'ai', text: `正在合成视频 · 通常 60-90 秒 · 已用 ${elapsed}s` },
        { from: 'ai', text: '你先想想发到哪儿,我准备好就喊你。' },
      ]}
      quick={['⏱ 给我预估时间', '❓ 进度还行吗']}
    >
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 40, gap: 24 }}>
        {!err ? (
          <>
            <div style={{ position: 'relative', width: 140, height: 140 }}>
              <svg width="140" height="140" viewBox="0 0 100 100" style={{ transform: 'rotate(-90deg)' }}>
                <circle cx="50" cy="50" r="44" fill="none" stroke={cPalette.accentSoft} strokeWidth="6" />
                <circle cx="50" cy="50" r="44" fill="none" stroke={cPalette.accent} strokeWidth="6" strokeLinecap="round"
                  strokeDasharray={`${Math.max(progress, elapsed > 10 ? 15 : 5) * 2.76} 276`} style={{ transition: 'stroke-dasharray .5s' }} />
              </svg>
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
                <div style={{ fontSize: 28, fontWeight: 700, color: cPalette.accent }}>{progress || Math.min(95, Math.floor(elapsed / 60 * 90))}%</div>
                <div style={{ fontSize: 11, color: cPalette.textMid, marginTop: 2 }}>{status}</div>
              </div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 6 }}>小栗正在把你说的话装进数字人里</div>
              <div style={{ fontSize: 13, color: cPalette.textMid }}>通常 60-90 秒 · video_id={videoId}</div>
            </div>
            <div style={{ padding: 12, background: cPalette.accentSoft, borderRadius: 10, fontSize: 12.5, color: cPalette.accent, lineHeight: 1.55, maxWidth: 560 }}>
              ⏳ 生成完会自动下载到本地。稍后在第 6 步会看到视频 + 自动生成的 4 张封面 + 平台发布。
            </div>
          </>
        ) : (
          <>
            <Icon name="x" size={40} color={cPalette.danger} />
            <div style={{ fontSize: 18, fontWeight: 700 }}>生成失败</div>
            <div style={{ color: cPalette.textMid, fontSize: 13, textAlign: 'center', maxWidth: 440 }}>{err}</div>
            <Btn onClick={onGoWorks}>← 返回作品库</Btn>
          </>
        )}
      </div>
    </PageShell>
  );
}

// ─── P7 合成完成 + 4 张封面 + 发布 ───
function PagePublish({ localUrl, workId, finalText, speakerTitle, avatarTitle, onGoWorks, onGoMaterials, onBack, onJumpTo, covers: coversFromApp, setCovers: setCoversFromApp, demoMode, pathKind, source }) {
  const [coversLocal, setCoversLocal] = React.useState([]);
  const covers = coversFromApp !== undefined ? coversFromApp : coversLocal;
  const setCovers = setCoversFromApp || setCoversLocal;
  const [picked, setPicked] = React.useState(0);
  const [platforms, setPlatforms] = React.useState({ douyin: true, shipinhao: true, xhs: false, kuaishou: false });
  const [publishNote, setPublishNote] = React.useState('');
  const [publishing, setPublishing] = React.useState(false);

  // 从文案里挑 slogan
  function pickSlogan() {
    const sentences = finalText.split(/[\n。!?!?]/).filter(s => s.trim().length >= 4);
    const short = sentences.filter(s => s.length <= 14);
    return (short[0] || sentences[0] || '精彩内容').trim().slice(0, 14);
  }

  React.useEffect(() => {
    // 已经有(App 里缓存),或者 demo 模式,都不重新生成
    if (covers.length > 0) return;
    if (demoMode) {
      // demo 模式下不调 apimart,用占位数据
      setCovers([
        { task_id: 'demo1', status: 'succeed', media_url: null, demoSlogan: pickSlogan(), demoColor: 'linear-gradient(135deg, #d97757 0%, #f0a080 100%)' },
        { task_id: 'demo2', status: 'succeed', media_url: null, demoSlogan: '老带新', demoColor: 'linear-gradient(135deg, #3a5a4a 0%, #6a8a7a 100%)' },
        { task_id: 'demo3', status: 'succeed', media_url: null, demoSlogan: '春节不打烊', demoColor: 'linear-gradient(135deg, #2a3a5a 0%, #5a6a8a 100%)' },
        { task_id: 'demo4', status: 'succeed', media_url: null, demoSlogan: '省一年', demoColor: 'linear-gradient(135deg, #c78a3b 0%, #e8b870 100%)' },
      ]);
      return;
    }
    async function genCovers() {
      try {
        const r = await api.post('/api/cover', { slogan: pickSlogan(), category: '实体店引流', n: 4 });
        const ts = r.tasks.map(t => ({ task_id: t.task_id, status: 'running', media_url: null }));
        setCovers(ts);
        ts.forEach((t, idx) => pollCover(t.task_id, idx));
      } catch (e) {
        console.error(e);
      }
    }
    genCovers();
    // eslint-disable-next-line
  }, []);

  async function pollCover(tid, idx) {
    for (let i = 0; i < 40; i++) {
      try {
        const r = await api.get(`/api/cover/query/${tid}`);
        setCovers(prev => prev.map((c, j) => j === idx ? { ...c, status: r.status, media_url: r.media_url } : c));
        if (r.status === 'succeed' || r.status === 'failed') return;
      } catch { }
      await new Promise(r => setTimeout(r, 5000));
    }
  }

  async function publish() {
    setPublishing(true);
    try {
      const chosen = Object.keys(platforms).filter(k => platforms[k]);
      const r = await api.post('/api/publish', { work_id: workId, platforms: chosen, schedule_at: null });
      setPublishNote(r.note || '已标记发布');
    } catch (e) {
      setPublishNote('发布失败: ' + e.message);
    }
    setPublishing(false);
  }

  return (
    <PageShell
      stage={7}
      onGoWorks={onGoWorks}
      onGoMaterials={onGoMaterials}
      onJumpTo={onJumpTo}
      pathKind={pathKind}
      source={source}
      onPrev={onBack}
      productBar={[
        { label: '成片', value: localUrl ? `已下载 work=${workId}` : (demoMode ? '(示例占位)' : '(未合成)') },
        { label: '声音', value: speakerTitle || '(示例)' },
        { label: '形象', value: avatarTitle || '(示例)' },
      ]}
      convo={[
        { from: 'ai', text: '成片出来了 ✓' },
        { from: 'ai', text: '平台已选抖音 + 视频号;封面、标签都生成了,右边能改。' },
      ]}
      quick={['⏱ 定别的时间', '➕ 加小红书', '✏️ 改发布文案']}
    >
      <div style={{ flex: 1, display: 'flex', padding: 20, gap: 20, overflow: 'auto' }}>
        {/* 左:真视频 */}
        <div style={{ width: 252, flexShrink: 0 }}>
          {localUrl ? (
            <video src={api.media(localUrl)} controls style={{ width: 252, height: 448, borderRadius: 20, background: '#000', boxShadow: '0 20px 40px rgba(0,0,0,0.15)' }} />
          ) : (
            <div style={{ width: 252, height: 448, borderRadius: 20, background: 'linear-gradient(180deg, #3a5a4a 0%, #6a8a7a 70%, #1a2a24 100%)', position: 'relative', overflow: 'hidden', boxShadow: '0 20px 40px rgba(0,0,0,0.15)' }}>
              <div style={{ position: 'absolute', top: 16, left: 16, right: 16, display: 'flex', justifyContent: 'space-between', color: 'rgba(255,255,255,0.85)', fontSize: 11 }}>
                <span>● 示例预览</span><span>00:00 / 00:32</span>
              </div>
              <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', color: '#fff', fontSize: 15, fontWeight: 700, textAlign: 'center', lineHeight: 1.5, textShadow: '0 2px 8px rgba(0,0,0,0.5)' }}>
                {demoMode ? <>从入口流程走完一次<br />就会在这看到你的数字人视频</> : '视频加载中...'}
              </div>
              {demoMode && (
                <div style={{ position: 'absolute', bottom: 14, left: 14, right: 14, height: 3, background: 'rgba(255,255,255,0.3)', borderRadius: 100 }}>
                  <div style={{ width: '0%', height: '100%', background: '#fff', borderRadius: 100 }} />
                </div>
              )}
            </div>
          )}
          <div style={{ marginTop: 10, fontSize: 11, color: cPalette.textMid, fontFamily: 'SF Mono, Menlo, monospace', textAlign: 'center' }}>
            9:16 · {workId ? `work=${workId}` : ''}
          </div>
          {localUrl && (
            <div style={{ marginTop: 10, display: 'flex', gap: 8, justifyContent: 'center' }}>
              <a href={api.media(localUrl)} download style={{ textDecoration: 'none' }}>
                <Btn size="sm"><Icon name="download" size={12} /> 下载 MP4</Btn>
              </a>
            </div>
          )}
        </div>

        {/* 右:封面 + 标签 + 平台 */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, gap: 14 }}>
          <Section label={`封面 · GPT-Image-2 生成 · ${covers.filter(c => c.status === 'succeed').length}/${covers.length}`}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
              {covers.map((c, i) => {
                const isDemo = !!c.demoColor;
                const bg = c.media_url ? `url(${api.media(c.media_url)}) center/cover`
                        : isDemo ? c.demoColor : cPalette.borderSoft;
                return (
                  <div
                    key={i}
                    onClick={() => (c.media_url || isDemo) && setPicked(i)}
                    style={{
                      aspectRatio: '3/4', borderRadius: 10, cursor: (c.media_url || isDemo) ? 'pointer' : 'wait',
                      background: bg, position: 'relative', overflow: 'hidden',
                      border: picked === i && (c.media_url || isDemo) ? `2px solid ${cPalette.accent}` : `2px solid transparent`,
                      boxShadow: picked === i && (c.media_url || isDemo) ? `0 0 0 3px ${cPalette.accentSoft}` : 'none',
                    }}
                  >
                    {isDemo && (
                      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 10 }}>
                        <div style={{ color: '#fff', fontSize: 15, fontWeight: 900, textAlign: 'center', textShadow: '0 2px 6px rgba(0,0,0,0.5)', lineHeight: 1.1 }}>{c.demoSlogan}</div>
                      </div>
                    )}
                    {!c.media_url && !isDemo && (
                      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', fontSize: 11, color: cPalette.textMid }}>
                        {c.status === 'failed' ? <span style={{ color: cPalette.danger }}>失败</span> : <><TypingDots /><span style={{ marginTop: 6 }}>生成中...</span></>}
                      </div>
                    )}
                    {(c.media_url || isDemo) && picked === i && (
                      <div style={{ position: 'absolute', top: 4, right: 4, background: '#fff', color: cPalette.accent, padding: '2px 7px', borderRadius: 100, fontSize: 10, fontWeight: 600 }}>使用中</div>
                    )}
                    {isDemo && (
                      <div style={{ position: 'absolute', bottom: 4, left: 4, fontSize: 9, color: 'rgba(255,255,255,0.85)', background: 'rgba(0,0,0,0.35)', padding: '1px 6px', borderRadius: 100 }}>示例</div>
                    )}
                  </div>
                );
              })}
            </div>
          </Section>

          <Section label="发布文案 + 标签">
            <div style={{ background: '#fcfaf6', border: `1px solid ${cPalette.borderSoft}`, borderRadius: 10, padding: 12, fontSize: 12.5, lineHeight: 1.6 }}>
              <div>{finalText.slice(0, 100)}{finalText.length > 100 ? '...' : ''}</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                {['#实体店', '#同城引流', '#数字人', '#AI营销', '#老带新'].map(t => (
                  <span key={t} style={{ fontSize: 11.5, color: cPalette.accent, background: '#fff', padding: '3px 9px', borderRadius: 100, border: `1px solid ${cPalette.accentSoft}` }}>{t}</span>
                ))}
              </div>
            </div>
          </Section>

          <Section label="发到这些平台">
            {[
              { id: 'douyin', label: '抖音', sub: '主阵地', hot: true },
              { id: 'shipinhao', label: '视频号', sub: '老客户在这' },
              { id: 'xhs', label: '小红书', sub: '女性用户多' },
              { id: 'kuaishou', label: '快手', sub: '同城流量大' },
            ].map(p => (
              <div
                key={p.id}
                onClick={() => setPlatforms(ps => ({ ...ps, [p.id]: !ps[p.id] }))}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '11px 13px', marginBottom: 6, borderRadius: 10,
                  background: platforms[p.id] ? cPalette.accentSoft : '#fcfaf6',
                  border: `1px solid ${platforms[p.id] ? cPalette.accent : cPalette.borderSoft}`, cursor: 'pointer',
                }}
              >
                <div style={{ width: 18, height: 18, borderRadius: 5, border: `1.5px solid ${platforms[p.id] ? cPalette.accent : cPalette.textSoft}`, background: platforms[p.id] ? cPalette.accent : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {platforms[p.id] && <Icon name="check" size={11} color="#fff" strokeWidth={3} />}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>
                    {p.label}
                    {p.hot && <Badge>推荐</Badge>}
                  </div>
                  <div style={{ fontSize: 11, color: cPalette.textMid, marginTop: 1 }}>{p.sub}</div>
                </div>
              </div>
            ))}
          </Section>

          <div style={{ padding: 11, borderRadius: 10, background: '#fcfaf6', border: `1px dashed ${cPalette.borderSoft}`, fontSize: 12, color: cPalette.textMid, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="clock" size={13} color={cPalette.textSoft} />
            定时 <b style={{ color: cPalette.text }}>明天 08:30</b> 发 · 你粉丝活跃度最高 <SoonBadge />
          </div>

          <Btn primary size="lg" onClick={publish} disabled={publishing}>
            {publishing ? '发布中...' : `发布到 ${Object.values(platforms).filter(Boolean).length} 个平台 →`}
          </Btn>
          {publishNote && (
            <div style={{ padding: 12, background: cPalette.accentSoft, color: cPalette.accent, borderRadius: 10, fontSize: 12.5 }}>✓ {publishNote}</div>
          )}
        </div>
      </div>
    </PageShell>
  );
}

Object.assign(window, { PageEdit, PageWaiting, PagePublish });
