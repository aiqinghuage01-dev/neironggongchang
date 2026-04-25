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

Object.assign(window, { Spinning, SkeletonCard, TitlesSkeleton, SkillBadge, StepDots, StepHeader });
