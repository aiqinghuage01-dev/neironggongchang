// factory-ui.jsx — 跨 skill 复用的 UI 组件 (D-021)
//
// 加载顺序必须在 factory-tokens.jsx 之后(依赖 T),
// 在所有 factory-<skill>-v2.jsx 之前(供它们使用)
//
// 组件清单:
//   <Spinning icon phases={[{text, sub}, ...]} />  阶段文案轮播 + 进度点
//   <StepHeader icon title steps currentStep skillInfo autoBadge onBack />  统一顶栏
//   <SkeletonCard />  单张骨架卡片
//   <SkillBadge skillInfo />  "用技能:xxx" 徽章
//   <StepDots steps currentStep />  顶部圆圈步骤条
//
// 使用示例(新 skill jsx 里):
//   <StepHeader icon="🔥" title="热点改写 · 3 步"
//     steps={HOT_STEPS} currentStep={step}
//     skillInfo={skillInfo} onBack={...} />

// ─── Spinning (阶段文案轮播 + 进度点) ──────────────────────
function Spinning({ icon, phases, text, sub }) {
  const arr = React.useMemo(() => {
    if (phases && phases.length) return phases;
    return [{ text: text || "处理中", sub: sub || "" }];
  }, [phases, text, sub]);
  const [idx, setIdx] = React.useState(0);
  React.useEffect(() => {
    setIdx(0);
    if (arr.length <= 1) return;
    const t = setInterval(() => {
      setIdx(i => (i + 1 < arr.length ? i + 1 : i));
    }, 2000);
    return () => clearInterval(t);
  }, [arr]);
  const current = arr[idx] || {};
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "80px 40px", gap: 18, minHeight: "70%" }}>
      <div style={{ width: 96, height: 96, borderRadius: "50%", background: T.brandSoft, position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: 96, height: 96, borderRadius: "50%", border: `4px solid ${T.brandSoft}`, borderTopColor: T.brand, animation: "qlspin 1.2s linear infinite", position: "absolute", top: 0, left: 0 }} />
        <div style={{ fontSize: 28 }}>{icon || "⏳"}</div>
      </div>
      <div style={{ textAlign: "center", maxWidth: 520 }}>
        <div key={"t" + idx} style={{ fontSize: 20, fontWeight: 700, animation: "qlfadein 0.35s ease-out" }}>{current.text}</div>
        {current.sub && <div key={"s" + idx} style={{ fontSize: 13, color: T.muted, marginTop: 8, animation: "qlfadein 0.35s ease-out 0.05s backwards", lineHeight: 1.7 }}>{current.sub}</div>}
      </div>
      {arr.length > 1 && (
        <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
          {arr.map((_, i) => (
            <span key={i} style={{
              width: i === idx ? 20 : 6, height: 6, borderRadius: 100,
              background: i <= idx ? T.brand : T.bg3,
              transition: "all 0.3s",
            }} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── SkeletonCard (单张 pulse 卡片) ────────────────────────
function SkeletonCard({ delay = 0, lines = 3, titleWidth = "78%" }) {
  return (
    <div style={{
      padding: 18, background: "#fff", border: `1px solid ${T.borderSoft}`, borderRadius: 12,
      animation: `qlskeleton 1.6s ease-in-out ${delay}s infinite`,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <div style={{ height: 18, width: 64, background: T.bg3, borderRadius: 100 }} />
        <div style={{ height: 11, width: 40, background: T.bg2, borderRadius: 4 }} />
      </div>
      <div style={{ height: 22, width: titleWidth, background: T.bg3, borderRadius: 5, marginBottom: 12 }} />
      {Array.from({ length: Math.max(1, lines - 2) }).map((_, i) => (
        <div key={i} style={{ height: 12, width: `${80 - i * 15}%`, background: T.bg2, borderRadius: 4, marginBottom: 6 }} />
      ))}
    </div>
  );
}

// ─── TitlesSkeleton (wechat 专用: 3 张 skeleton + 阶段文案) ──────────
function TitlesSkeleton() {
  const phases = [
    "读人设档案 who-is-qinghuage.md...",
    "读风格圣经 · Section 2 标题工程...",
    "按 6 种模板出候选(结论前置/反常识/数字/故事/热点/对比)...",
    "过滤禁忌词(震惊体/空泛大词/产品名)...",
  ];
  const [phaseIdx, setPhaseIdx] = React.useState(0);
  React.useEffect(() => {
    const t = setInterval(() => setPhaseIdx(i => (i + 1 < phases.length ? i + 1 : i)), 2000);
    return () => clearInterval(t);
  }, []);
  return (
    <div style={{ padding: "32px 40px 120px", maxWidth: 820, margin: "0 auto" }}>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>小华正在出 3 个标题 🎯</div>
        <div style={{ fontSize: 13, color: T.muted, minHeight: 20, animation: "qlfadein 0.35s" }} key={phaseIdx}>
          {phases[phaseIdx]}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {[0, 1, 2].map(i => <SkeletonCard key={i} delay={i * 0.2} />)}
      </div>
    </div>
  );
}

// ─── SkillBadge (顶栏 "用技能:xxx" 徽章) ───────────────────
function SkillBadge({ skillInfo }) {
  if (!skillInfo) return null;
  return (
    <span title={`~/Desktop/skills/${skillInfo.slug}/ · SKILL.md ${skillInfo.skill_md_chars} 字`}
      style={{ fontSize: 10.5, color: T.brand, background: T.brandSoft, padding: "2px 8px", borderRadius: 100, marginLeft: 6 }}>
      用技能:{skillInfo.slug}
    </span>
  );
}

// ─── StepDots (顶部圆圈 step 进度 · D-038 加 onClick 支持往回点) ─────
function StepDots({ steps, currentStep, onJump }) {
  return (
    <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 4, marginLeft: 8, overflowX: "auto" }}>
      {steps.map((s, i) => {
        const active = s.id === currentStep;
        const currentIdx = steps.findIndex(x => x.id === currentStep);
        const done = currentIdx > i;
        // 已完成的 step 可点击跳回 · 当前 step 不响应 · 未来 step 不能跳
        const clickable = !!onJump && done;
        return (
          <React.Fragment key={s.id}>
            <div
              onClick={clickable ? () => onJump(s.id) : undefined}
              title={clickable ? `跳回「${s.label}」(可改后再往后走)` : undefined}
              style={{
                display: "flex", alignItems: "center", gap: 5, padding: "4px 10px 4px 5px", borderRadius: 100, fontSize: 11.5, fontWeight: 500,
                background: active ? T.text : "transparent",
                color: active ? "#fff" : done ? T.brand : T.muted,
                whiteSpace: "nowrap", flexShrink: 0,
                cursor: clickable ? "pointer" : "default",
                transition: "all 0.1s",
              }}>
              <div style={{
                width: 18, height: 18, borderRadius: "50%",
                background: active ? "#fff" : done ? T.brandSoft : T.bg2,
                color: active ? T.text : done ? T.brand : T.muted2,
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700,
              }}>{done ? "✓" : s.n}</div>
              {s.label}
            </div>
            {i < steps.length - 1 && <span style={{ color: T.muted3, fontSize: 10 }}>—</span>}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ─── StepHeader (skill 顶栏总装 · 未来 add_skill 模板可直接用) ─────
// 现有 4 个 skill 的 <XxHeader /> 保留不改(迁移有回归风险),
// 新 skill 的 add_skill.py 骨架和未来重构可直接用 StepHeader
function StepHeader({ icon, title, steps, currentStep, skillInfo, autoBadge, onBack }) {
  return (
    <div style={{ padding: "12px 24px", background: "#fff", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 14, flexShrink: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ width: 26, height: 26, borderRadius: 7, background: T.text, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13 }}>{icon}</div>
        <div style={{ fontSize: 13.5, fontWeight: 600 }}>{title}</div>
        {autoBadge && (
          <span style={{ fontSize: 10.5, color: "#fff", background: T.brand, padding: "2px 8px", borderRadius: 100, marginLeft: 2, fontWeight: 600 }}>
            🚀 全自动中
          </span>
        )}
        <SkillBadge skillInfo={skillInfo} />
      </div>
      <StepDots steps={steps} currentStep={currentStep} />
      <ApiStatusLight />
      <button onClick={onBack} style={{ background: "transparent", border: "none", color: T.muted, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>← 返回</button>
    </div>
  );
}

// ─── SelfCheckChip (D-037 主次反转 · 替代右上 240px 自检卡) ──────
// hero 行右挂的 1 行 chip + 点开 details 看分项. hotrewrite/voicerewrite/touliu 共享.
function SelfCheckChip({ pass, score, max = 120, threshold, label, summary, dims, veto, detailRows }) {
  const [open, setOpen] = React.useState(false);
  const ok = pass !== false;
  const color = ok ? T.brand : T.red;
  const soft = ok ? T.brandSoft : T.redSoft;
  const ico = ok ? "✓" : "❌";
  const headLabel = label || (ok ? "自检通过" : "自检没过");
  const scoreText = (typeof score === "number") ? ` ${score}/${max}` : "";
  return (
    <div style={{ position: "relative" }}>
      <button onClick={() => setOpen(!open)} style={{
        background: soft, border: `1px solid ${color}44`, color,
        padding: "6px 12px", borderRadius: 8, fontSize: 12.5, fontWeight: 600,
        cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6,
      }}>
        <span>{ico}</span>
        <span>{headLabel}{scoreText}</span>
        <span style={{ fontSize: 10, marginLeft: 4, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>▾</span>
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "100%", right: 0, marginTop: 6, zIndex: 10,
          background: "#fff", border: `1px solid ${T.border}`, borderRadius: 10,
          boxShadow: "0 8px 24px rgba(0,0,0,0.08)", padding: 14, minWidth: 280, maxWidth: 380,
          fontSize: 12, color: T.muted, lineHeight: 1.7,
        }}>
          {summary && <div style={{ color: T.text, marginBottom: 8, lineHeight: 1.6 }}>💬 {summary}</div>}
          {threshold && typeof score === "number" && (
            <div>评分: <b style={{ color }}>{score}/{max}</b> {score >= threshold ? "✓" : `(需 ≥${threshold})`}</div>
          )}
          {dims && Object.keys(dims).length > 0 && (
            <div style={{ marginTop: 6 }}>
              <div style={{ color: T.muted2, fontSize: 11, marginBottom: 4 }}>分项</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {Object.entries(dims).map(([k, v]) => (
                  <span key={k} style={{ background: T.bg2, padding: "2px 8px", borderRadius: 4, fontSize: 11 }}>
                    {k} {v}
                  </span>
                ))}
              </div>
            </div>
          )}
          {veto && (
            <div style={{ marginTop: 6 }}>
              一票否决: <b style={{ color: veto.triggered ? T.red : T.brand }}>
                {veto.triggered ? `触发: ${(veto.items || []).join('、')}` : "无"}
              </b>
            </div>
          )}
          {detailRows && detailRows.map((r, i) => (
            <div key={i} style={{ marginTop: i ? 4 : 6 }}>
              <span style={{ color: T.muted2 }}>{r.k}: </span><b style={{ color: T.text }}>{r.v}</b>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── 图引擎 chip + hook (D-064 · 2026-04-26) ────────────────
// 用法 (生图按钮旁边挂):
//   const [imgEngine, setImgEngine] = useImageEngine();
//   ...
//   <ImageEngineChip engine={imgEngine} onChange={setImgEngine} />
//   <button onClick={() => api.post("/api/cover", { ..., engine: imgEngine })}>...</button>
//
// imgEngine: null = 用 settings 默认 (跟着改) / "apimart" / "dreamina" = 临时覆盖.
// 同一浏览器的所有 page 共享这个 override (localStorage), 切了一次全局生效.
//
// 按 settings 改了默认时 hook 会通过 storage 事件感知刷新, 不用手动 reload.

const IMAGE_ENGINE_META = {
  apimart:  { icon: "🎨", label: "apimart", desc: "GPT-Image-2 · 默认 · 30-60s/张" },
  dreamina: { icon: "🎬", label: "即梦",     desc: "字节即梦 · 60-120s/张" },
};
const IMAGE_ENGINE_KEY = "image_engine_override";

function useImageEngine() {
  // 返回 [override, setOverride, defaultEngine]
  // override: null = 用默认 / 字符串 = 临时覆盖
  // defaultEngine: 从 /api/settings 读, 用户没覆盖时跟它走
  const [override, setOverrideState] = React.useState(() => {
    try { return localStorage.getItem(IMAGE_ENGINE_KEY) || null; } catch { return null; }
  });
  const [defaultEngine, setDefaultEngine] = React.useState("apimart");
  React.useEffect(() => {
    api.get("/api/settings").then(s => {
      const e = (s && s.image_engine) || "apimart";
      setDefaultEngine(e);
    }).catch(() => {});
  }, []);
  // 跨 page 同步 override
  React.useEffect(() => {
    function onStorage(e) {
      if (e.key === IMAGE_ENGINE_KEY) {
        setOverrideState(e.newValue || null);
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  function setOverride(v) {
    setOverrideState(v);
    try {
      if (v) localStorage.setItem(IMAGE_ENGINE_KEY, v);
      else localStorage.removeItem(IMAGE_ENGINE_KEY);
    } catch (_) {}
  }
  // 返回当前生效的引擎 + 是否是 override 状态
  const current = override || defaultEngine;
  return [current, setOverride, defaultEngine, !!override];
}

function ImageEngineChip({ engine, onChange, defaultEngine, isOverride, size = "sm" }) {
  // 受控. 父组件提供 engine + onChange, 通常都通过 useImageEngine() 解构.
  // 不传 onChange 时只展示, 不可点.
  const [open, setOpen] = React.useState(false);
  const meta = IMAGE_ENGINE_META[engine] || IMAGE_ENGINE_META.apimart;
  const ref = React.useRef(null);
  React.useEffect(() => {
    function onDoc(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    if (open) document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const pad = size === "xs" ? "3px 8px" : "5px 10px";
  const fs = size === "xs" ? 11 : 12;
  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <button onClick={() => onChange && setOpen(!open)} disabled={!onChange}
        title={onChange ? "点击切换生图引擎 (本浏览器临时, settings 改默认)" : ""}
        style={{
          background: isOverride ? T.amberSoft : T.bg2,
          border: `1px solid ${isOverride ? T.amber + "66" : T.borderSoft}`,
          color: isOverride ? T.amber : T.muted,
          padding: pad, borderRadius: 100, fontSize: fs, fontFamily: "inherit",
          cursor: onChange ? "pointer" : "default",
          display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 500,
        }}
      >
        <span>{meta.icon}</span>
        <span>{meta.label}</span>
        {isOverride && <span style={{ fontSize: 10, opacity: 0.8 }}>(临时)</span>}
        {onChange && <span style={{ fontSize: 9, marginLeft: 2 }}>▾</span>}
      </button>
      {open && onChange && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 20,
          background: "#fff", border: `1px solid ${T.border}`, borderRadius: 8,
          boxShadow: "0 8px 20px rgba(0,0,0,0.08)", minWidth: 220, padding: 4,
        }}>
          {Object.entries(IMAGE_ENGINE_META).map(([id, m]) => {
            const sel = id === engine;
            const isDef = id === defaultEngine;
            return (
              <div key={id} onClick={() => {
                // 选中默认 = 清 override
                onChange(isDef ? null : id);
                setOpen(false);
              }} style={{
                padding: "8px 10px", borderRadius: 6, cursor: "pointer",
                background: sel ? T.brandSoft : "transparent",
                color: sel ? T.brand : T.text,
              }}
              onMouseEnter={(e) => { if (!sel) e.currentTarget.style.background = T.bg2; }}
              onMouseLeave={(e) => { if (!sel) e.currentTarget.style.background = "transparent"; }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: sel ? 600 : 500 }}>
                  <span>{m.icon}</span>
                  <span>{m.label}</span>
                  {isDef && <span style={{ fontSize: 10, color: T.muted2, marginLeft: "auto" }}>设置默认</span>}
                  {sel && !isDef && <span style={{ fontSize: 10, color: T.amber, marginLeft: "auto" }}>临时</span>}
                </div>
                <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>{m.desc}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── ImageWithLightbox (D-074) ─────────────────────────────
// 通用图片组件: 点击展示全屏大图 + ESC/点空白关 + 复制 URL/下载.
// 全站显示 AI 生成图都用这个 (出图/即梦/公众号封面/段间图/朋友圈封面/作品库).
//
// API:
//   <ImageWithLightbox src={url} alt="..." style={{...}} caption="可选,大图底部显" downloadName="可选" />
function ImageWithLightbox({ src, alt, style, caption, downloadName, ...rest }) {
  const [open, setOpen] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  React.useEffect(() => {
    if (!open) return;
    const h = (e) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open]);
  function copyUrl(e) {
    e.stopPropagation();
    if (!src) return;
    try { navigator.clipboard.writeText(src); } catch (_) {}
    setCopied(true); setTimeout(() => setCopied(false), 1500);
  }
  function download(e) {
    e.stopPropagation();
    if (!src) return;
    const a = document.createElement("a");
    a.href = src;
    a.download = downloadName || `image-${Date.now()}.png`;
    a.click();
  }
  if (!src) return null;
  return (
    <>
      <img
        src={src} alt={alt || ""}
        onClick={() => setOpen(true)}
        style={{ cursor: "zoom-in", ...(style || {}) }}
        {...rest}
      />
      {open && (
        <div onClick={() => setOpen(false)} style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.92)", zIndex: 1000,
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          cursor: "zoom-out", padding: 40,
        }}>
          <img
            src={src} alt={alt || ""}
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: "94vw", maxHeight: "82vh", objectFit: "contain", display: "block", cursor: "default" }}
          />
          <button onClick={(e) => { e.stopPropagation(); setOpen(false); }} style={{
            position: "absolute", top: 20, right: 24, width: 40, height: 40,
            background: "rgba(255,255,255,0.18)", border: "none", borderRadius: "50%",
            color: "#fff", fontSize: 22, cursor: "pointer", fontFamily: "inherit",
          }}>×</button>
          <div onClick={(e) => e.stopPropagation()} style={{
            marginTop: 18, display: "flex", alignItems: "center", gap: 12,
          }}>
            <button onClick={copyUrl} style={{
              padding: "8px 18px", fontSize: 13, fontWeight: 600,
              background: copied ? "#fff" : "rgba(255,255,255,0.18)",
              color: copied ? "#000" : "#fff",
              border: "none", borderRadius: 100, cursor: "pointer", fontFamily: "inherit",
              transition: "background 0.15s",
            }}>{copied ? "✓ 已复制 URL" : "📋 复制 URL"}</button>
            <button onClick={download} style={{
              padding: "8px 18px", fontSize: 13, fontWeight: 600,
              background: "rgba(255,255,255,0.18)", color: "#fff",
              border: "none", borderRadius: 100, cursor: "pointer", fontFamily: "inherit",
            }}>⬇ 下载</button>
          </div>
          {caption && (
            <div style={{
              marginTop: 14, color: "rgba(255,255,255,0.7)",
              fontSize: 12.5, maxWidth: "90vw", textAlign: "center",
              lineHeight: 1.6, padding: "0 20px",
            }}>{caption}</div>
          )}
          <div style={{
            position: "absolute", bottom: 14, left: 0, right: 0, textAlign: "center",
            color: "rgba(255,255,255,0.45)", fontSize: 11, fontFamily: "ui-monospace, monospace",
          }}>ESC 或点击空白处关</div>
        </div>
      )}
    </>
  );
}

Object.assign(window, { Spinning, SkeletonCard, TitlesSkeleton, SkillBadge, StepDots, StepHeader, SelfCheckChip, ImageEngineChip, useImageEngine, IMAGE_ENGINE_META, ImageWithLightbox });
