// shared.jsx — 色板 / 样式 / Icon / API 客户端 / 通用小组件

const API_BASE = (typeof localStorage !== 'undefined' && localStorage.getItem('api_base')) || 'http://127.0.0.1:8000';

// ───────── 色板(从设计稿 c-shared.jsx 抄过来)─────────
const cPalette = {
  bg: '#f7f5f0',
  panel: '#ffffff',
  border: '#ece8df',
  borderSoft: '#f2efe7',
  text: '#1a1a1a',
  textMid: '#6b6960',
  textSoft: '#a19e93',
  accent: '#2a6f4a',
  accentSoft: '#e8f3ed',
  warn: '#c47a1f',
  warnSoft: '#fdf4e3',
  danger: '#b94a3d',
};

// ───────── 外壳尺寸(1280x920 参考)─────────
const c2S = {
  root: {
    width: 1280, minHeight: 920, background: cPalette.bg, color: cPalette.text,
    fontFamily: 'inherit',
    display: 'flex', flexDirection: 'column', overflow: 'hidden', fontSize: 14,
    borderRadius: 20, boxShadow: '0 30px 80px rgba(20, 20, 30, 0.08)',
    border: `1px solid ${cPalette.border}`,
  },
  topbar: {
    height: 60, background: cPalette.panel, borderBottom: `1px solid ${cPalette.border}`,
    display: 'flex', alignItems: 'center', padding: '0 20px', gap: 12, flexShrink: 0,
  },
  stageTab: { display: 'flex', alignItems: 'center', gap: 6, padding: '5px 11px', borderRadius: 100, fontSize: 12, fontWeight: 500, cursor: 'pointer', border: `1px solid ${cPalette.border}`, color: cPalette.textMid, transition: 'all .15s' },
  stageTabActive: { background: cPalette.text, color: '#fff', border: '1px solid transparent', fontWeight: 600 },
  stageTabDone: { background: cPalette.accentSoft, color: cPalette.accent, border: '1px solid transparent' },
  av: { width: 30, height: 30, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600 },
  avAi: { background: cPalette.accentSoft, color: cPalette.accent },
  avUser: { background: cPalette.text, color: '#fff' },
};

// ───────── Icon(从设计稿 shared.jsx 抄)─────────
const Icon = ({ name, size = 16, color = 'currentColor', strokeWidth = 1.6 }) => {
  const paths = {
    link: <><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.72-1.71"/></>,
    mic: <><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2"/><path d="M12 19v3"/></>,
    sparkle: <><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/></>,
    user: <><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></>,
    send: <><path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z"/></>,
    check: <path d="M4 12l5 5L20 6"/>,
    chevronRight: <path d="M9 6l6 6-6 6"/>,
    play: <path d="M6 4l14 8-14 8z" fill="currentColor" stroke="none"/>,
    plus: <path d="M12 5v14M5 12h14"/>,
    folder: <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    download: <><path d="M12 3v13m-5-5 5 5 5-5"/><path d="M5 21h14"/></>,
    upload: <><path d="M12 21V8m-5 5 5-5 5 5"/><path d="M5 3h14"/></>,
    trash: <><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M6 6l1 14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-14"/></>,
    edit: <><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></>,
    x: <><path d="M18 6 6 18M6 6l12 12"/></>,
    refresh: <><path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/></>,
    pause: <><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></>,
    arrow: <path d="M5 12h14m-6-6 6 6-6 6"/>,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, display: 'block' }}>
      {paths[name]}
    </svg>
  );
};

// ───────── 7 步进度 ─────────
const STAGES = [
  { n: 1, label: '原料' },
  { n: 2, label: '扒文案' },
  { n: 3, label: '改写' },
  { n: 4, label: '声音' },
  { n: 5, label: '形象' },
  { n: 6, label: '剪辑' },
  { n: 7, label: '发布' },
];

// ───────── API 客户端(带调用记录)─────────
window.__apiLast = null;
function _emitApi(info) {
  window.__apiLast = info;
  try { window.dispatchEvent(new CustomEvent('api-call', { detail: info })); } catch(e){}
}
async function _trace(method, path, fn) {
  const t0 = Date.now();
  try {
    const data = await fn();
    _emitApi({ method, path, ms: Date.now() - t0, ok: true, at: Date.now() });
    return data;
  } catch (e) {
    _emitApi({ method, path, ms: Date.now() - t0, ok: false, error: String(e.message || e), at: Date.now() });
    throw e;
  }
}
const api = {
  base: API_BASE,
  get(path) {
    return _trace('GET', path, async () => {
      const r = await fetch(`${API_BASE}${path}`);
      if (!r.ok) throw new Error(`${path} HTTP ${r.status}: ${await r.text()}`);
      return r.json();
    });
  },
  post(path, body) {
    return _trace('POST', path, async () => {
      const r = await fetch(`${API_BASE}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
      if (!r.ok) throw new Error(`${path} HTTP ${r.status}: ${await r.text()}`);
      return r.json();
    });
  },
  del(path) {
    return _trace('DELETE', path, async () => {
      const r = await fetch(`${API_BASE}${path}`, { method: 'DELETE' });
      if (!r.ok) throw new Error(`${path} HTTP ${r.status}`);
      return r.json();
    });
  },
  upload(path, file, fieldName = 'file') {
    return _trace('UPLOAD', path, async () => {
      const fd = new FormData();
      fd.append(fieldName, file);
      const r = await fetch(`${API_BASE}${path}`, { method: 'POST', body: fd });
      if (!r.ok) throw new Error(`${path} HTTP ${r.status}`);
      return r.json();
    });
  },
  media(relUrl) {
    if (!relUrl) return '';
    return relUrl.startsWith('http') ? relUrl : `${API_BASE}${relUrl}`;
  },
};

// ───────── 通用小组件 ─────────
function Btn({ children, onClick, primary, disabled, size = 'md', style = {} }) {
  const styles = {
    sm: { padding: '6px 14px', fontSize: 12.5 },
    md: { padding: '9px 20px', fontSize: 13 },
    lg: { padding: '12px 24px', fontSize: 14 },
  }[size];
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        ...styles, fontWeight: 600, borderRadius: 100, cursor: disabled ? 'not-allowed' : 'pointer',
        border: 'none', transition: 'all .15s',
        background: primary ? (disabled ? '#b4cabd' : cPalette.accent) : (disabled ? '#eee' : cPalette.panel),
        color: primary ? '#fff' : (disabled ? '#aaa' : cPalette.text),
        boxShadow: !primary ? `inset 0 0 0 1px ${cPalette.border}` : 'none',
        opacity: disabled ? 0.65 : 1,
        whiteSpace: 'nowrap',
        flexShrink: 0,
        ...style,
      }}
    >
      {children}
    </button>
  );
}

function Chip({ children, active, onClick, variant = 'default' }) {
  const bg = variant === 'soft' ? cPalette.bg : cPalette.panel;
  return (
    <div
      onClick={onClick}
      style={{
        padding: '5px 11px', fontSize: 11.5, borderRadius: 100,
        background: active ? cPalette.text : bg,
        color: active ? '#fff' : cPalette.textMid,
        border: `1px solid ${active ? 'transparent' : cPalette.borderSoft}`,
        cursor: onClick ? 'pointer' : 'default', whiteSpace: 'nowrap',
      }}
    >{children}</div>
  );
}

function Badge({ children, tone = 'accent' }) {
  const colors = {
    accent: [cPalette.accent, cPalette.accentSoft],
    warn: [cPalette.warn, cPalette.warnSoft],
    neutral: [cPalette.textMid, '#f0ede5'],
    danger: [cPalette.danger, '#fbe8e6'],
    mute: [cPalette.textSoft, cPalette.bg],
  }[tone] || [cPalette.accent, cPalette.accentSoft];
  return (
    <span style={{
      fontSize: 10.5, fontWeight: 600, color: colors[0], background: colors[1],
      padding: '2px 8px', borderRadius: 100, display: 'inline-flex', alignItems: 'center', gap: 4,
      whiteSpace: 'nowrap',
    }}>{children}</span>
  );
}

function SoonBadge() {
  return <Badge tone="mute">下个版本</Badge>;
}

// ───────── 数据来源徽章:真调 / 示例 / 历史 ─────────
function SourceBadge({ source }) {
  const cfg = {
    real:    { label: '✓ 真调 API',  tone: 'accent',  title: '本页数据来自后端真实 API' },
    demo:    { label: '⚠ 示例数据',  tone: 'warn',    title: 'demo 模式,没调 API,填的是示例,跳 P7 发布也不会真调 apimart' },
    history: { label: '↺ 历史',       tone: 'neutral', title: '从本地缓存/作品库读取' },
    none:    { label: '·',            tone: 'mute',    title: '' },
  }[source || 'none'] || { label: source, tone: 'mute' };
  return (
    <span title={cfg.title}>
      <Badge tone={cfg.tone}>{cfg.label}</Badge>
    </span>
  );
}

// ───────── API 状态灯(最近一次调用)─────────
function ApiStatusLight() {
  const [last, setLast] = React.useState(window.__apiLast);
  React.useEffect(() => {
    const h = (e) => setLast(e.detail);
    window.addEventListener('api-call', h);
    return () => window.removeEventListener('api-call', h);
  }, []);
  if (!last) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: cPalette.textSoft }} title="还没有 API 调用">
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: cPalette.textSoft }} />
        API idle
      </span>
    );
  }
  const ok = last.ok;
  const color = ok ? cPalette.accent : cPalette.danger;
  const title = `${last.method} ${last.path}\n${ok ? 'OK' : 'FAIL'} · ${last.ms}ms${last.error ? '\n' + last.error : ''}`;
  return (
    <span title={title} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: cPalette.textMid, fontFamily: 'SF Mono, Menlo, monospace' }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, boxShadow: `0 0 0 3px ${color}22` }} />
      {last.method} {last.path.length > 18 ? last.path.slice(0, 16) + '…' : last.path} · {last.ms}ms
    </span>
  );
}

// ───────── 产物区:每步顶部展示上一步产物 ─────────
function ProductBar({ items, source }) {
  if (!items || !items.length) return null;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12, padding: '10px 20px',
      background: source === 'demo' ? cPalette.warnSoft : cPalette.accentSoft,
      borderBottom: `1px solid ${source === 'demo' ? '#f0e2c4' : '#d8ebdf'}`,
      fontSize: 12, flexShrink: 0, flexWrap: 'wrap',
    }}>
      <span style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '0.08em', color: source === 'demo' ? cPalette.warn : cPalette.accent }}>
        上一步产物 →
      </span>
      {items.map((it, i) => (
        <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: cPalette.text }}>
          <span style={{ color: cPalette.textSoft }}>{it.label}:</span>
          <b style={{ fontWeight: 600, maxWidth: 340, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.value}</b>
          {it.extra && <span style={{ color: cPalette.textMid, fontSize: 11 }}>{it.extra}</span>}
        </span>
      ))}
      <span style={{ flex: 1 }} />
      <SourceBadge source={source} />
    </div>
  );
}

function TypingDots() {
  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
      {[0, 1, 2].map(i => (
        <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: cPalette.textSoft, animation: `qldot 1.2s ${i * 0.15}s infinite` }} />
      ))}
    </div>
  );
}

function Section({ label, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: cPalette.textSoft, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>
        {label}
      </div>
      {children}
    </div>
  );
}

// ───────── 顶栏 + 底部对话 dock(全站统一外壳)─────────
function PageShell({ stage, title, projectName, convo, quick, children, sending, onGoWorks, onGoMaterials, onPrev, onNext, nextLabel, nextDisabled, statusLabel, aiName = '栗', onJumpTo, productBar, source, pathKind }) {
  const lastAi = [...(convo || [])].reverse().find(m => m.from === 'ai');
  return (
    <div style={c2S.root}>
      {/* TOPBAR */}
      <div style={{ ...c2S.topbar, gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <div style={{ width: 26, height: 26, borderRadius: 6, background: cPalette.text, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="sparkle" size={13} color="#fff" strokeWidth={2.2} />
          </div>
          <div style={{ fontSize: 14.5, fontWeight: 600 }}>{projectName || '内容工厂'}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 8 }}>
          {STAGES.map((s, i) => {
            const done = s.n < stage;
            const active = s.n === stage;
            const clickable = !!onJumpTo;
            // 扒文案 tab:文案路径时显示"跳过"状态
            const isSkip = s.n === 2 && pathKind === 'text';
            const labelText = isSkip ? `${s.label}(跳过)` : s.label;
            return (
              <React.Fragment key={s.n}>
                <div
                  onClick={() => clickable && onJumpTo(s.n)}
                  title={clickable ? (isSkip ? '文案路径不需要扒文案,点击可切回链接扒文案' : `跳到第 ${s.n} 步:${s.label}`) : ''}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 100,
                    fontSize: 11.5, fontWeight: active ? 600 : 500, cursor: clickable ? 'pointer' : 'default',
                    background: active ? cPalette.text : done ? cPalette.accentSoft : isSkip ? 'transparent' : 'transparent',
                    color: active ? '#fff' : done ? cPalette.accent : isSkip ? cPalette.textSoft : cPalette.textMid,
                    border: active || done ? '1px solid transparent' : `1px dashed ${isSkip ? cPalette.borderSoft : cPalette.border}`,
                    transition: 'all .15s',
                    userSelect: 'none',
                    opacity: isSkip ? 0.6 : 1,
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                  }}
                  onMouseOver={(e) => clickable && !active && (e.currentTarget.style.background = done ? cPalette.accent + '22' : cPalette.bg)}
                  onMouseOut={(e) => clickable && !active && (e.currentTarget.style.background = done ? cPalette.accentSoft : 'transparent')}
                >
                  <span style={{
                    width: 15, height: 15, borderRadius: '50%', fontSize: 9.5, fontWeight: 600,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: active ? 'rgba(255,255,255,0.2)' : done ? cPalette.accent : 'transparent',
                    color: active ? '#fff' : done ? '#fff' : cPalette.textSoft,
                    border: !active && !done ? `1px solid ${cPalette.border}` : 'none',
                  }}>{done ? '✓' : s.n}</span>
                  {labelText}
                </div>
                {i < STAGES.length - 1 && <div style={{ width: 6, height: 1, background: cPalette.border }} />}
              </React.Fragment>
            );
          })}
        </div>
        <div style={{ flex: 1 }} />
        <ApiStatusLight />
        <div style={{ width: 1, height: 20, background: cPalette.borderSoft }} />
        <div style={{ fontSize: 11, color: cPalette.textSoft, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{statusLabel || '草稿已自动保存'}</div>
        {onGoMaterials && <Btn size="sm" onClick={onGoMaterials}>📦 素材库</Btn>}
        <Btn size="sm" onClick={onGoWorks}>🎬 作品库</Btn>
      </div>

      {/* MAIN */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, background: cPalette.panel, margin: 18, marginBottom: 0, borderRadius: 16, border: `1px solid ${cPalette.border}`, overflow: 'hidden' }}>
        {productBar && <ProductBar items={productBar} source={source} />}
        {children}
      </div>

      {/* DOCK */}
      <div style={{ margin: 18, marginTop: 12, background: cPalette.panel, border: `1px solid ${cPalette.border}`, borderRadius: 14, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ ...c2S.av, ...c2S.avAi }}>{aiName}</div>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 12.5, color: cPalette.text, lineHeight: 1.45, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {sending ? <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>小栗正在处理 <TypingDots /></span> : (lastAi ? (lastAi.text || '').split('\n')[0] : '')}
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {(quick || []).slice(0, 3).map((t, i) => (
              <div key={i} style={{ padding: '3px 10px', fontSize: 11, borderRadius: 100, background: cPalette.bg, color: cPalette.textMid, border: `1px solid ${cPalette.borderSoft}`, whiteSpace: 'nowrap' }}>{t}</div>
            ))}
          </div>
        </div>
        <div style={{ width: 1, height: 32, background: cPalette.borderSoft, flexShrink: 0 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: '0 0 280px' }}>
          {onPrev && <Btn size="sm" onClick={onPrev}>上一步</Btn>}
          {onNext && <Btn primary size="sm" onClick={onNext} disabled={nextDisabled}>{nextLabel || '下一步'} →</Btn>}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { cPalette, c2S, Icon, STAGES, api, Btn, Chip, Badge, SoonBadge, SourceBadge, ProductBar, ApiStatusLight, TypingDots, Section, PageShell });
