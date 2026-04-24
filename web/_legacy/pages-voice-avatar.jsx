// pages-voice-avatar.jsx — P3 声音 + P4 形象

// ─── P4 声音(现成 speaker + 上传音频 + 试听 CosyVoice)───
function PageVoice({ finalText, onNext, onBack, onGoWorks, onGoMaterials, onJumpTo, pathKind, source }) {
  const [speakers, setSpeakers] = React.useState([]);
  const [picked, setPicked] = React.useState(null);
  const [mode, setMode] = React.useState('saved');  // saved / upload / record
  const [uploadInfo, setUploadInfo] = React.useState(null);
  const [cloneBusy, setCloneBusy] = React.useState(false);
  const [clonePath, setClonePath] = React.useState('');
  const [err, setErr] = React.useState('');
  const fileRef = React.useRef();

  // 录音(MediaRecorder)
  const [recording, setRecording] = React.useState(false);
  const [recorder, setRecorder] = React.useState(null);
  const [recordBlob, setRecordBlob] = React.useState(null);
  const [recordSec, setRecordSec] = React.useState(0);

  React.useEffect(() => {
    api.get('/api/speakers').then(list => {
      setSpeakers(list);
      if (list[0]) setPicked(list[0].id);
    }).catch(e => setErr(e.message));
  }, []);

  async function startRec() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      const chunks = [];
      mr.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      mr.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        setRecordBlob(new Blob(chunks, { type: 'audio/webm' }));
      };
      mr.start();
      setRecorder(mr);
      setRecording(true);
      setRecordSec(0);
      const t0 = Date.now();
      const interval = setInterval(() => {
        const s = Math.floor((Date.now() - t0) / 1000);
        setRecordSec(s);
        if (s >= 60) { mr.stop(); setRecording(false); clearInterval(interval); }
      }, 250);
    } catch (e) {
      setErr('无法访问麦克风: ' + e.message);
    }
  }

  function stopRec() {
    if (recorder) recorder.stop();
    setRecording(false);
  }

  async function uploadSample(file) {
    try {
      const res = await api.upload('/api/voice/upload', file);
      setUploadInfo(res);
    } catch (e) {
      setErr('上传失败: ' + e.message);
    }
  }

  async function tryClone() {
    if (!uploadInfo?.path) return;
    setCloneBusy(true); setErr(''); setClonePath('');
    try {
      const r = await api.post('/api/voice/clone', {
        text: finalText.slice(0, 200),
        ref_path: uploadInfo.path,
        reference_text: '',
      });
      setClonePath(r.media_url);
    } catch (e) {
      setErr('试听合成失败: ' + e.message);
    }
    setCloneBusy(false);
  }

  const pickedObj = speakers.find(s => s.id === picked);
  return (
    <PageShell
      stage={4}
      onGoWorks={onGoWorks}
      onGoMaterials={onGoMaterials}
      onJumpTo={onJumpTo}
      pathKind={pathKind}
      source={source}
      onPrev={onBack}
      onNext={() => picked && onNext({ speakerId: picked, speakerTitle: pickedObj?.title })}
      nextLabel="就用这个声音 →"
      nextDisabled={!picked}
      productBar={[
        { label: '定稿文案', value: `${finalText.length} 字`, extra: `"${(finalText || '').slice(0, 30)}${finalText.length > 30 ? '...' : ''}"` },
      ]}
      convo={[
        { from: 'ai', text: '文案行了 ✓ 接下来用什么声音念?' },
        { from: 'ai', text: '选一个现成的声音最快;也可以上传音频或现场录一段。' },
      ]}
      quick={['🎚 语速慢一点', '😊 加点笑意', '🔁 重新录一个']}
    >
      <div style={{ padding: 24, display: 'flex', flexDirection: 'column', flex: 1, gap: 16, overflow: 'auto' }}>
        <div style={{ display: 'flex', gap: 8 }}>
          {[
            { id: 'saved', label: '用现成的声音', hint: '最快' },
            { id: 'upload', label: '上传音频', hint: '从手机/微信' },
            { id: 'record', label: '现场录 30 秒', hint: '实时克隆' },
          ].map(m => (
            <div
              key={m.id}
              onClick={() => setMode(m.id)}
              style={{
                padding: '9px 14px', borderRadius: 100, cursor: 'pointer', fontSize: 12.5,
                border: `1px solid ${mode === m.id ? cPalette.accent : cPalette.border}`,
                background: mode === m.id ? cPalette.accentSoft : '#fff',
                color: mode === m.id ? cPalette.accent : cPalette.textMid,
                fontWeight: mode === m.id ? 600 : 500,
                display: 'flex', alignItems: 'center', gap: 8,
              }}
            >
              {m.label} <span style={{ fontSize: 10.5, opacity: 0.7 }}>· {m.hint}</span>
            </div>
          ))}
        </div>

        {mode === 'saved' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {speakers.length === 0 && <div style={{ color: cPalette.textMid, fontSize: 13 }}>加载声音列表中...</div>}
            {speakers.map(s => (
              <div
                key={s.id}
                onClick={() => setPicked(s.id)}
                style={{
                  padding: 16, borderRadius: 14, background: '#fff',
                  border: `1.5px solid ${picked === s.id ? cPalette.accent : cPalette.border}`,
                  boxShadow: picked === s.id ? `0 0 0 4px ${cPalette.accentSoft}` : 'none',
                  display: 'flex', alignItems: 'center', gap: 16, cursor: 'pointer',
                }}
              >
                <div style={{ width: 48, height: 48, borderRadius: '50%', flexShrink: 0, background: 'linear-gradient(135deg, #2a6f4a 0%, #4a9f6a 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="mic" size={18} color="#fff" strokeWidth={2} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                    <span style={{ fontSize: 14.5, fontWeight: 600 }}>{s.title || `声音 ${s.id}`}</span>
                    {picked === s.id && <Badge>✓ 已选</Badge>}
                  </div>
                  <div style={{ fontSize: 12, color: cPalette.textMid }}>石榴 · speaker_id={s.id}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {mode === 'upload' && (
          <div style={{ padding: 24, background: '#fcfaf6', border: `1px dashed ${cPalette.border}`, borderRadius: 14, textAlign: 'center' }}>
            <input ref={fileRef} type="file" accept="audio/*" style={{ display: 'none' }} onChange={(e) => e.target.files[0] && uploadSample(e.target.files[0])} />
            {!uploadInfo ? (
              <>
                <Icon name="upload" size={28} color={cPalette.textMid} strokeWidth={1.8} />
                <div style={{ fontSize: 15, fontWeight: 600, marginTop: 12 }}>从电脑选个音频文件</div>
                <div style={{ fontSize: 12, color: cPalette.textMid, marginTop: 4 }}>支持 wav/mp3/m4a,建议 30 秒以上环境安静的录音</div>
                <div style={{ marginTop: 16 }}>
                  <Btn primary onClick={() => fileRef.current.click()}>选择文件</Btn>
                </div>
              </>
            ) : (
              <>
                <Icon name="check" size={28} color={cPalette.accent} strokeWidth={2.5} />
                <div style={{ fontSize: 14, fontWeight: 600, marginTop: 10 }}>已上传: {uploadInfo.name}</div>
                <div style={{ fontSize: 11.5, color: cPalette.textMid, marginTop: 2 }}>{(uploadInfo.size / 1024).toFixed(1)} KB</div>
                <audio src={api.media(uploadInfo.media_url)} controls style={{ marginTop: 12 }} />
                <div style={{ marginTop: 14, display: 'flex', gap: 10, justifyContent: 'center' }}>
                  <Btn onClick={() => fileRef.current.click()}>换一个</Btn>
                  <Btn primary onClick={tryClone} disabled={cloneBusy}>{cloneBusy ? 'CosyVoice 试听合成中 (~25s)...' : '🎧 用这段试听一下'}</Btn>
                </div>
                {clonePath && (
                  <div style={{ marginTop: 14 }}>
                    <div style={{ fontSize: 12, color: cPalette.accent, marginBottom: 6 }}>✓ CosyVoice 克隆完成 · 用你的文案</div>
                    <audio src={api.media(clonePath)} controls />
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {mode === 'record' && (
          <div style={{ padding: 24, background: '#fcfaf6', border: `1px dashed ${cPalette.border}`, borderRadius: 14, textAlign: 'center' }}>
            <div style={{ width: 80, height: 80, borderRadius: '50%', background: recording ? cPalette.danger : cPalette.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto', cursor: 'pointer', boxShadow: recording ? '0 0 0 8px rgba(185,74,61,0.2)' : '0 8px 16px rgba(42, 111, 74, 0.2)' }} onClick={recording ? stopRec : startRec}>
              <Icon name={recording ? 'pause' : 'mic'} size={30} color="#fff" strokeWidth={2} />
            </div>
            <div style={{ fontSize: 15, fontWeight: 600, marginTop: 14 }}>{recording ? `录音中 ${recordSec}s / 60s` : '点一下开始录'}</div>
            <div style={{ fontSize: 12, color: cPalette.textMid, marginTop: 4 }}>{recording ? '念你平时说话的话 30 秒就够' : recordBlob ? '已录完,可以试听' : '建议环境安静,靠近麦克风'}</div>
            {recordBlob && !recording && (
              <>
                <audio src={URL.createObjectURL(recordBlob)} controls style={{ marginTop: 14 }} />
                <div style={{ marginTop: 12 }}>
                  <Btn primary size="sm" onClick={async () => {
                    const f = new File([recordBlob], 'rec.webm', { type: 'audio/webm' });
                    await uploadSample(f);
                    setMode('upload');
                  }}>保存并用它试听 →</Btn>
                </div>
              </>
            )}
          </div>
        )}

        {err && <div style={{ padding: 10, background: '#fbe8e6', color: cPalette.danger, borderRadius: 8, fontSize: 12 }}>⚠️ {err}</div>}
      </div>
    </PageShell>
  );
}

// ─── P5 形象 ───
function PageAvatar({ onNext, onBack, onGoWorks, onGoMaterials, onJumpTo, pathKind, source, finalText, speakerTitle }) {
  const [avatars, setAvatars] = React.useState([]);
  const [picked, setPicked] = React.useState(null);
  const [err, setErr] = React.useState('');

  React.useEffect(() => {
    api.get('/api/avatars').then(list => {
      setAvatars(list);
      if (list[0]) setPicked(list[0].id);
    }).catch(e => setErr(e.message));
  }, []);

  // 真实列表 + 至少 3 个槽位(mock 用于展示设计稿的 3 卡对比,不可选)
  const vis = [...avatars];
  while (vis.length < 3) vis.push({ id: -(vis.length + 1), title: `候选 ${vis.length + 1}`, mock: true });

  const gradients = [
    'linear-gradient(135deg, #3a5a4a 0%, #6a8a7a 100%)',
    'linear-gradient(135deg, #2a3a5a 0%, #5a6a8a 100%)',
    'linear-gradient(135deg, #5a3a4a 0%, #8a6a7a 100%)',
  ];

  const pickedObj = avatars.find(a => a.id === picked);
  return (
    <PageShell
      stage={5}
      onGoWorks={onGoWorks}
      onGoMaterials={onGoMaterials}
      onJumpTo={onJumpTo}
      pathKind={pathKind}
      source={source}
      onPrev={onBack}
      onNext={() => picked && picked > 0 && onNext({ avatarId: picked, avatarTitle: pickedObj?.title })}
      nextLabel="就用这个形象 →"
      nextDisabled={!picked || picked < 0}
      productBar={[
        { label: '定稿', value: `${(finalText || '').length} 字` },
        { label: '声音', value: speakerTitle || '(示例)' },
      ]}
      convo={[
        { from: 'ai', text: '声音搞定 ✓ 现在选形象。' },
        { from: 'ai', text: '选一个你现成的数字人就好,老客户认脸,转化率高 3 倍。' },
      ]}
      quick={['🎬 背景换成店里', '👔 换套衣服', '🪞 镜像翻转']}
    >
      <div style={{ flex: 1, padding: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
        {vis.slice(0, 3).map((a, i) => {
          const sel = picked === a.id;
          return (
            <div
              key={a.id}
              onClick={() => !a.mock && setPicked(a.id)}
              style={{
                width: 220, borderRadius: 14, padding: 12, cursor: a.mock ? 'not-allowed' : 'pointer',
                border: sel ? `2px solid ${cPalette.accent}` : `1px solid ${cPalette.border}`,
                background: sel ? cPalette.accentSoft : cPalette.panel,
                transform: sel ? 'translateY(-6px)' : 'none',
                transition: 'all .2s',
                opacity: a.mock ? 0.5 : 1, position: 'relative',
              }}
            >
              <div style={{ width: '100%', aspectRatio: '3/4', borderRadius: 10, marginBottom: 10, background: gradients[i % 3], position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'flex-end', padding: 12 }}>
                <div style={{ color: 'rgba(255,255,255,0.9)', fontSize: 10.5, fontFamily: 'SF Mono, monospace' }}>[ {a.title} ]</div>
                {sel && <div style={{ position: 'absolute', top: 8, right: 8, background: '#fff', color: cPalette.accent, padding: '3px 8px', borderRadius: 100, fontSize: 10, fontWeight: 600 }}>✓ 已选</div>}
                {a.mock && <div style={{ position: 'absolute', top: 8, right: 8 }}><SoonBadge /></div>}
              </div>
              <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 2 }}>{a.title || `形象 ${a.id}`}</div>
              <div style={{ fontSize: 11, color: cPalette.textMid }}>{a.mock ? '暂未创建,在石榴后台可创建更多' : `avatar_id=${a.id}`}</div>
            </div>
          );
        })}
      </div>
      {err && <div style={{ margin: 24, marginTop: 0, padding: 10, background: '#fbe8e6', color: cPalette.danger, borderRadius: 8, fontSize: 12 }}>⚠️ {err}</div>}
    </PageShell>
  );
}

Object.assign(window, { PageVoice, PageAvatar });
