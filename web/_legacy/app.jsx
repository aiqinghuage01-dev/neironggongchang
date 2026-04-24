// app.jsx — 顶级 App: 状态机 + 路由 + 7 步随时跳转 + 每步数据来源追踪

// 示例数据(健身房引流)
const DEMO = {
  url: 'https://v.douyin.com/iRxxxxxx/',
  title: '健身房春节不打烊,老会员带新免一个月',
  author: '@力量健身工作室',
  duration: 102,
  originalText: '今年春节我们不关门,每天照常开。老会员带一个新朋友来办卡,你们俩各免一个月,相当于一块钱没多花俩月白送。位置还在老地方,今晚上新年套餐也上了,过来溜达溜达。这可能是你今年最划算的会员卡了,错过等明年。',
  finalText: '哎各位老铁看过来,春节我们这儿不关门啊,大年三十都照常开。\n最实在的是这个——老会员你要是带一个新朋友来办卡,你们俩,各免一个月的会员费。\n相当于一块钱没多花,俩月白送。\n位置还在老地方,今晚上新年套餐也上了,过来溜达溜达。',
};

// stage → page 映射(7 步)
const STAGE_TO_PAGE = {
  1: 'intro',
  2: 'transcribeResult',   // 扒文案(独立)
  3: 'content',             // 改写
  4: 'voice',
  5: 'avatar',
  6: 'edit',
  7: 'publish',
};

function App() {
  const [page, setPage] = React.useState('intro');
  const [ctx, setCtx] = React.useState({
    url: '', batchId: '',
    originalText: '', finalText: '',
    title: '', author: '', duration: 0,
    speakerId: null, avatarId: null,
    speakerTitle: '', avatarTitle: '',
    templateId: 't1', bgmId: 'b1',
    workId: null, videoId: null, localUrl: '',
    style: 'casual',
  });
  const [pathKind, setPathKind] = React.useState(null);  // 'link' | 'text' | null
  // 每步的数据来源:'real' | 'demo' | 'history' | undefined
  const [source, setSource] = React.useState({});
  const [covers, setCovers] = React.useState([]);
  const [sp, setSp] = React.useState([]);
  const [av, setAv] = React.useState([]);

  React.useEffect(() => {
    api.get('/api/speakers').then(setSp).catch(() => {});
    api.get('/api/avatars').then(setAv).catch(() => {});
  }, []);

  const update = (patch) => setCtx(c => ({ ...c, ...patch }));
  const markSource = (page, src) => setSource(s => ({ ...s, [page]: src }));

  // 跳转到某步,缺哪些数据就补 demo
  function jumpTo(stage) {
    const target = STAGE_TO_PAGE[stage] || 'intro';
    const need = {
      transcribeResult: ['originalText', 'title'],
      content: ['originalText'],
      voice: ['originalText', 'finalText'],
      avatar: ['finalText', 'speakerId'],
      edit: ['finalText', 'speakerId', 'avatarId'],
      publish: ['finalText', 'speakerId', 'avatarId', 'workId'],
    }[target] || [];
    const patch = {};
    let usedDemo = false;
    for (const k of need) {
      if (!ctx[k]) {
        if (k === 'speakerId' && sp[0]) { patch.speakerId = sp[0].id; patch.speakerTitle = sp[0].title || `声音 ${sp[0].id}`; }
        else if (k === 'avatarId' && av[0]) { patch.avatarId = av[0].id; patch.avatarTitle = av[0].title || `形象 ${av[0].id}`; }
        else if (k === 'workId') patch.workId = -1;
        else if (DEMO[k] !== undefined) patch[k] = DEMO[k];
        usedDemo = true;
      }
    }
    if (!ctx.url && !ctx.originalText && target === 'transcribeResult') {
      patch.url = DEMO.url; patch.author = DEMO.author;
    }
    if (!ctx.author && target === 'transcribeResult' && !ctx.originalText) {
      patch.author = DEMO.author;
    }
    if (Object.keys(patch).length) setCtx(c => ({ ...c, ...patch }));
    markSource(target, usedDemo ? 'demo' : 'real');
    if (usedDemo && target === 'publish') setCovers([]);
    setPage(target);
  }

  async function handleIntroSubmit({ kind, value }) {
    setPathKind(kind);
    if (kind === 'url') {
      update({ url: value, originalText: '', title: '', author: '', duration: 0 });
      try {
        const r = await api.post('/api/transcribe/submit', { url: value });
        update({ batchId: r.batch_id });
        markSource('transcribing', 'real');
        setPage('transcribing');
      } catch (e) {
        alert('提交失败: ' + e.message + '\n可以直接粘文案');
      }
    } else {
      update({ originalText: value, url: '', title: '', author: '' });
      markSource('content', 'real');
      setPage('content');
    }
  }

  function handleTranscribeSuccess({ text, title, author, duration_sec }) {
    update({ originalText: text, title, author, duration: duration_sec });
    markSource('transcribeResult', 'real');
    setPage('transcribeResult');
    // 同时存入素材库
    api.post('/api/materials', {
      url: ctx.url, title, author, duration_sec,
      original_text: text, source: 'qingdou',
    }).catch(() => {});
  }

  async function handleVideoSubmit() {
    try {
      setCovers([]);
      const r = await api.post('/api/video/submit', {
        text: ctx.finalText,
        avatar_id: ctx.avatarId,
        speaker_id: ctx.speakerId,
        title: (ctx.title || ctx.finalText.slice(0, 24)),
        source_url: ctx.url || null,
        original_text: ctx.originalText || null,
      });
      update({ workId: r.work_id, videoId: r.video_id });
      markSource('waiting', 'real');
      markSource('publish', 'real');
      setPage('waiting');
    } catch (e) {
      alert('提交失败: ' + e.message);
    }
  }

  const common = {
    onGoWorks: () => setPage('works'),
    onGoMaterials: () => setPage('materials'),
    onJumpTo: jumpTo,
    pathKind,
  };

  // ─── 渲染 ───
  if (page === 'works') {
    return <PageWorks onBack={() => setPage('intro')} onJumpTo={jumpTo} onGoMaterials={() => setPage('materials')} />;
  }
  if (page === 'materials') {
    return <PageMaterials
      onBack={() => setPage('intro')}
      onJumpTo={jumpTo}
      onGoWorks={() => setPage('works')}
      onUseMaterial={(m) => {
        update({
          url: m.url || '',
          originalText: m.original_text || '',
          title: m.title || '',
          author: m.author || '',
          duration: m.duration_sec || 0,
        });
        setPathKind(m.url ? 'link' : 'text');
        markSource('transcribeResult', 'history');
        setPage('transcribeResult');
      }}
    />;
  }

  if (page === 'intro') {
    return <PageIntro onSubmit={handleIntroSubmit} {...common} />;
  }

  if (page === 'transcribing') {
    return <PageTranscribing
      url={ctx.url}
      batchId={ctx.batchId}
      onSuccess={handleTranscribeSuccess}
      onFallbackPaste={() => setPage('intro')}
      onCancel={() => setPage('intro')}
      source={source.transcribing}
      {...common}
    />;
  }

  if (page === 'transcribeResult') {
    return <PageTranscribeResult
      url={ctx.url}
      text={ctx.originalText}
      title={ctx.title}
      author={ctx.author}
      duration={ctx.duration}
      onConfirm={() => { markSource('content', source.transcribeResult === 'demo' ? 'demo' : 'real'); setPage('content'); }}
      onBack={() => setPage('intro')}
      source={source.transcribeResult}
      {...common}
    />;
  }

  if (page === 'content') {
    return <PageContent
      original={ctx.originalText}
      initialFinal={ctx.finalText}
      sourceUrl={ctx.url}
      author={ctx.author}
      onBack={() => setPage(ctx.url ? 'transcribeResult' : 'intro')}
      onNext={({ finalText, style }) => { update({ finalText, style: style || ctx.style }); markSource('voice', source.content === 'demo' ? 'demo' : 'real'); setPage('voice'); }}
      source={source.content}
      {...common}
    />;
  }

  if (page === 'voice') {
    return <PageVoice
      finalText={ctx.finalText}
      onBack={() => setPage('content')}
      onNext={({ speakerId, speakerTitle }) => { update({ speakerId, speakerTitle: speakerTitle || `声音 ${speakerId}` }); markSource('avatar', source.voice === 'demo' ? 'demo' : 'real'); setPage('avatar'); }}
      source={source.voice}
      {...common}
    />;
  }

  if (page === 'avatar') {
    return <PageAvatar
      finalText={ctx.finalText}
      speakerTitle={ctx.speakerTitle}
      onBack={() => setPage('voice')}
      onNext={({ avatarId, avatarTitle }) => { update({ avatarId, avatarTitle: avatarTitle || `形象 ${avatarId}` }); markSource('edit', source.avatar === 'demo' ? 'demo' : 'real'); setPage('edit'); }}
      source={source.avatar}
      {...common}
    />;
  }

  if (page === 'edit') {
    return <PageEdit
      finalText={ctx.finalText}
      speakerId={ctx.speakerId}
      speakerTitle={ctx.speakerTitle}
      avatarId={ctx.avatarId}
      avatarTitle={ctx.avatarTitle}
      onBack={() => setPage('avatar')}
      onConfirm={({ templateId, bgmId }) => {
        update({ templateId, bgmId });
        if (source.edit === 'demo' || source.avatar === 'demo' || source.voice === 'demo') {
          markSource('publish', 'demo');
          setTimeout(() => setPage('publish'), 300);
        } else {
          handleVideoSubmit();
        }
      }}
      source={source.edit}
      {...common}
    />;
  }

  if (page === 'waiting') {
    return <PageWaiting
      workId={ctx.workId}
      videoId={ctx.videoId}
      onDone={({ localUrl }) => { update({ localUrl }); setPage('publish'); }}
      onError={(e) => alert(e)}
      source={source.waiting}
      {...common}
    />;
  }

  if (page === 'publish') {
    return <PagePublish
      localUrl={ctx.localUrl}
      workId={ctx.workId}
      finalText={ctx.finalText}
      speakerTitle={ctx.speakerTitle}
      avatarTitle={ctx.avatarTitle}
      covers={covers}
      setCovers={setCovers}
      demoMode={source.publish === 'demo'}
      onBack={() => setPage('edit')}
      source={source.publish}
      {...common}
    />;
  }

  return <div>Unknown page: {page}</div>;
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
