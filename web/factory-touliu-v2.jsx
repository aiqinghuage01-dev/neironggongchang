// factory-touliu-v2.jsx — touliu-agent skill (D-014)
// Skill 源: ~/Desktop/skills/touliu-agent/
// 2 步: 采集输入 → 一次生成 n 条 + 风格摘要 + lint 质检
// 覆盖旧 PageAd(factory-ad.jsx) · sidebar "投流文案" 直接走新版

const TL_STEPS = [
  { id: "input",  n: 1, label: "卖点 / 采集" },
  { id: "result", n: 2, label: "批量 + 质检" },
];

function PageTouliu({ onNav }) {
  // D-062x: anchor — 注意 PageMakeV2 用 skill id "ad", 这里是 PageTouliu (route="ad")
  const fm = useFromMake("ad");
  const [step, setStep] = React.useState("input");
  const [loading, setLoading] = React.useState(false);
  const [err, setErr] = React.useState("");

  const [pitch, setPitch] = React.useState("");
  const [industry, setIndustry] = React.useState("通用老板");
  const [targetAction, setTargetAction] = React.useState("点头像进直播间");
  const [n, setN] = React.useState(1);  // D-062e: 默认 1 (5 太多生成慢)
  const [channel, setChannel] = React.useState("直播间");

  const [result, setResult] = React.useState(null);
  const [skillInfo, setSkillInfo] = React.useState(null);
  React.useEffect(() => { api.get("/api/touliu/skill-info").then(setSkillInfo).catch(() => {}); }, []);

  async function runStep({ nextStep, rollbackStep, clearSetter, apiCall }) {
    if (clearSetter) clearSetter(null);
    setStep(nextStep);
    setLoading(true); setErr("");
    try { await apiCall(); }
    catch (e) { setErr(e.message); if (rollbackStep) setStep(rollbackStep); }
    finally { setLoading(false); }
  }

  function generate() {
    if (!pitch.trim()) return;
    return runStep({
      nextStep: "result", rollbackStep: "input", clearSetter: setResult,
      apiCall: async () => {
        const r = await api.post("/api/touliu/generate", {
          pitch: pitch.trim(), industry, target_action: targetAction, n, channel, run_lint: true,
        });
        setResult(r);
      },
    });
  }
  function reset() {
    setStep("input"); setErr("");
    setResult(null);
    clearWorkflow("touliu");
  }

  // 工作流持久化 (D-016)
  const wfState = { step, pitch, industry, targetAction, n, channel, result };
  const wfRestore = (s) => {
    if (s.step) setStep(s.step);
    if (s.pitch != null) setPitch(s.pitch);
    if (s.industry != null) setIndustry(s.industry);
    if (s.targetAction != null) setTargetAction(s.targetAction);
    if (s.n != null) setN(s.n);
    if (s.channel != null) setChannel(s.channel);
    if (s.result) setResult(s.result);
  };
  const wf = useWorkflowPersist({ ns: "touliu", state: wfState, onRestore: wfRestore });

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", background: T.bg, position: "relative", overflow: "hidden" }}>
      <TLHeader current={step} onBack={() => onNav("home")} skillInfo={skillInfo} />
      <div style={{ flex: 1, overflow: "auto" }}>
        <div style={{ maxWidth: 1040, margin: "16px auto 0" }}>
          <FromMakeBanner fromMake={fm.fromMake} dismiss={fm.dismiss}
            label="挑一条最炸的, 点'用这条做视频'自动带回" />
        </div>
        <WfRestoreBanner show={wf.hasSnapshot} onDismiss={wf.dismissSnapshot}
          onClear={() => { reset(); wf.dismissSnapshot(); }}
          label="投流文案工作流" />
        {err && (
          <div style={{ maxWidth: 1040, margin: "16px auto 0", padding: 12, background: T.redSoft, color: T.red, borderRadius: 10, fontSize: 13 }}>
            ⚠️ {err}
          </div>
        )}
        {step === "input"  && <TLStepInput pitch={pitch} setPitch={setPitch} industry={industry} setIndustry={setIndustry}
          targetAction={targetAction} setTargetAction={setTargetAction} n={n} setN={setN} channel={channel} setChannel={setChannel}
          loading={loading} onGo={generate} skillInfo={skillInfo} />}
        {step === "result" && <TLStepResult result={result} n={n} loading={loading} onPrev={() => setStep("input")} onRegen={generate} onReset={reset} onNav={onNav} pitch={pitch} />}
      </div>
    </div>
  );
}

function TLHeader({ current, onBack, skillInfo }) {
  return (
    <div style={{ padding: "12px 24px", background: "#fff", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 14, flexShrink: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ width: 26, height: 26, borderRadius: 7, background: T.text, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13 }}>💰</div>
        <div style={{ fontSize: 13.5, fontWeight: 600 }}>投流文案 · 批量生成</div>
        {skillInfo && (
          <span title={`~/Desktop/skills/${skillInfo.slug}/`}
            style={{ fontSize: 10.5, color: T.brand, background: T.brandSoft, padding: "2px 8px", borderRadius: 100, marginLeft: 6 }}>
            用技能:{skillInfo.slug}
          </span>
        )}
      </div>
      <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, marginLeft: 8 }}>
        {TL_STEPS.map((s, i) => {
          const active = s.id === current;
          const done = TL_STEPS.findIndex(x => x.id === current) > i;
          return (
            <React.Fragment key={s.id}>
              <div style={{
                display: "flex", alignItems: "center", gap: 5, padding: "4px 10px 4px 5px", borderRadius: 100, fontSize: 11.5, fontWeight: 500,
                background: active ? T.text : "transparent",
                color: active ? "#fff" : done ? T.brand : T.muted, whiteSpace: "nowrap",
              }}>
                <div style={{
                  width: 18, height: 18, borderRadius: "50%",
                  background: active ? "#fff" : done ? T.brandSoft : T.bg2,
                  color: active ? T.text : done ? T.brand : T.muted2,
                  display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700,
                }}>{done ? "✓" : s.n}</div>
                {s.label}
              </div>
              {i < TL_STEPS.length - 1 && <span style={{ color: T.muted3 }}>—</span>}
            </React.Fragment>
          );
        })}
      </div>
      <ApiStatusLight />
      <button onClick={onBack} style={{ background: "transparent", border: "none", color: T.muted, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>← 返回</button>
    </div>
  );
}

// C6: 参数行通用组件 (label + chip 组)
function ParamRow({ label, items, value, onChange, getKey, getLabel, getTitle }) {
  const _key = getKey || (x => x);
  const _label = getLabel || (x => x);
  return (
    <div>
      <div style={{ fontSize: 12.5, color: T.muted, fontWeight: 500, marginBottom: 8 }}>{label}</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {items.map(it => {
          const k = _key(it);
          const on = k === value;
          return (
            <div key={k} title={getTitle ? getTitle(it) : undefined}
              onClick={() => onChange(k)}
              style={{
                padding: "6px 14px", borderRadius: 100, fontSize: 12, cursor: "pointer",
                background: on ? T.brandSoft : T.bg2,
                color: on ? T.brand : T.muted,
                border: `1px solid ${on ? T.brand : T.borderSoft}`,
                fontWeight: on ? 600 : 500,
              }}>{_label(it)}</div>
          );
        })}
      </div>
    </div>
  );
}

const INDUSTRIES = ["通用老板", "餐饮", "美业", "教培", "制造业", "门店零售", "建材/家装", "汽服"];
const TARGETS = [
  { id: "点头像进直播间", label: "进直播间", hint: "默认 · 最稳" },
  { id: "留资", label: "留资", hint: "表单 / 电话" },
  { id: "加私域", label: "加私域", hint: "私信 / 企微" },
  { id: "到店", label: "到店", hint: "线下导流" },
];
const CHANNELS = ["直播间", "短视频投放", "信息流", "混合"];

function TLStepInput({ pitch, setPitch, industry, setIndustry, targetAction, setTargetAction, n, setN, channel, setChannel, loading, onGo, skillInfo }) {
  const ready = !!pitch.trim() && !loading;
  return (
    <div style={{ padding: "32px 40px 80px", maxWidth: 820, margin: "0 auto" }}>
      {/* C6 hero (跟 hotrewrite/voicerewrite 一致) */}
      <div style={{ textAlign: "center", margin: "8px 0 24px" }}>
        <div style={{ fontSize: 30, fontWeight: 700, color: T.text, letterSpacing: "-0.02em", marginBottom: 8 }}>
          这批投流要推啥? 💰
        </div>
        <div style={{ fontSize: 14, color: T.muted, lineHeight: 1.6 }}>
          一句话讲清卖点 · 小华按 5 种结构 (痛 / 对 / 步 / 话 / 创) 出 N 条
        </div>
      </div>

      {/* 卖点输入大对话框 */}
      <div style={{ background: "#fff", border: `1.5px solid ${T.brand}`, boxShadow: `0 0 0 5px ${T.brandSoft}`, borderRadius: 16, padding: 18, marginBottom: 16 }}>
        <textarea rows={5} value={pitch} onChange={e => setPitch(e.target.value)}
          placeholder="例:帮实体老板用 AI + 短视频做获客 · 三天出一条 · 不用拍摄不用剪辑"
          style={{ width: "100%", padding: 12, border: "none", outline: "none", background: "transparent", fontSize: 14.5, fontFamily: "inherit", resize: "vertical", lineHeight: 1.7, color: T.text, minHeight: 120 }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12, paddingTop: 14, borderTop: `1px solid ${T.borderSoft}` }}>
          {pitch.trim() ? (
            <Tag size="xs" color="gray">{pitch.trim().length} 字</Tag>
          ) : (
            <span style={{ fontSize: 12, color: T.muted2 }}>✨ 选下面参数, 点 "生成"</span>
          )}
          <div style={{ flex: 1 }} />
          <button onClick={onGo} disabled={!ready} style={{
            padding: "10px 22px", fontSize: 14, fontWeight: 600,
            background: ready ? T.brand : T.muted3, color: "#fff",
            border: "none", borderRadius: 100, cursor: ready ? "pointer" : "not-allowed", fontFamily: "inherit",
          }}>{loading ? `生成中 (${n} 条)...` : `🚀 生成 ${n} 条 →`}</button>
        </div>
      </div>

      {/* C6 采集参数 视觉升级 (4 区段, 标题 13px 600) */}
      <div style={{ background: "#fff", border: `1px solid ${T.borderSoft}`, borderRadius: 12, padding: 18, marginBottom: 14, display: "flex", flexDirection: "column", gap: 16 }}>
        <ParamRow label="🏢 行业/品类" items={INDUSTRIES} value={industry} onChange={setIndustry} />
        <ParamRow label="🎯 目标动作" items={TARGETS} value={targetAction} onChange={setTargetAction}
          getKey={t => t.id} getLabel={t => t.label} getTitle={t => t.hint} />
        <ParamRow label={`📦 本批数量 (默认 1)`} items={[1, 3, 5, 10]} value={n} onChange={setN}
          getLabel={x => `${x} 条`} />
        <ParamRow label="📺 适用渠道" items={CHANNELS} value={channel} onChange={setChannel} />
      </div>

      {skillInfo && (
        <details style={{ padding: "10px 14px", background: T.bg2, borderRadius: 8, fontSize: 11.5, color: T.muted2, cursor: "pointer" }}>
          <summary>skill 资源 (开发用 · 默认折叠)</summary>
          <div style={{ marginTop: 8, lineHeight: 1.6 }}>
            <div>SKILL.md · {skillInfo.skill_md_chars} 字符</div>
            {Object.entries(skillInfo.references || {}).slice(0, 6).map(([k, v]) => (
              <div key={k}>references/{k}.md · {v} 字符</div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function TLStepResult({ result, n, loading, onPrev, onRegen, onReset, onNav, pitch }) {
  if (loading || !result) return <Spinning icon="💰" phases={[
    { text: "读 skill 方法论", sub: "SKILL.md + style_rules + winning_patterns + industry_templates" },
    { text: "写《风格对齐摘要》", sub: "开场 · 纠偏 · AI 动作链 · 机制转折 · CTA 回扣" },
    { text: `按结构分配生成 ${n} 条`, sub: "痛点 / 对比 / 步骤 / 对话 / 创新" },
    { text: "每条走 6 维编导终检", sub: "人味 / 场景 / 业务 / AI 密度 / 说服 / 收口" },
    { text: "过坏稿特征 9 项检查", sub: "栏目标签 / 方法课腔 / AI 标签化 / CTA 跑偏 ..." },
    { text: "本地 lint 质检", sub: "scripts/lint_copy_batch.py · 字数 / 重复度 / 分配" },
  ]} />;

  const batch = result.batch || [];
  const ss = result.style_summary || {};
  const lint = result.lint || {};
  const alloc = result.alloc || {};

  const structCounts = {};
  batch.forEach(b => { structCounts[b.structure] = (structCounts[b.structure] || 0) + 1; });

  return (
    <div style={{ padding: "32px 40px 120px", maxWidth: 1240, margin: "0 auto" }}>
      <div style={{ marginBottom: 16, display: "flex", alignItems: "flex-start", gap: 16 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>批量生成完成 · {batch.length} 条 💰</div>
          <div style={{ fontSize: 12, color: T.muted }}>
            {Object.entries(structCounts).map(([k, v]) => `${k} ${v}`).join(" · ")} · {result.tokens} tokens
          </div>
        </div>
        <div style={{ padding: 12, background: lint.passed ? T.brandSoft : lint.skipped ? T.bg2 : T.amberSoft, border: `1px solid ${lint.passed ? T.brand + "44" : T.amber + "44"}`, borderRadius: 10, fontSize: 11.5, color: lint.passed ? T.brand : T.amber, minWidth: 180 }}>
          <div style={{ fontWeight: 700, marginBottom: 3 }}>📋 lint 本地质检</div>
          <div>{lint.skipped ? "跳过" : lint.passed ? "✓ PASS" : lint.ok === false ? "⚠️ 异常" : "⚠️ FAIL 建议重写"}</div>
          {lint.output && <details style={{ marginTop: 4 }}><summary style={{ cursor: "pointer", fontSize: 10 }}>查看输出</summary><pre style={{ fontSize: 9, margin: "4px 0 0", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{lint.output.slice(0, 400)}</pre></details>}
        </div>
      </div>

      {/* 风格对齐摘要 */}
      {ss.opening_mode && (
        <details style={{ padding: 14, background: T.bg2, border: `1px solid ${T.borderSoft}`, borderRadius: 12, marginBottom: 14 }}>
          <summary style={{ fontSize: 12, fontWeight: 600, color: T.muted, cursor: "pointer", userSelect: "none" }}>
            📐 风格对齐摘要(AI 生成前的自定义)
          </summary>
          <div style={{ fontSize: 12.5, color: T.muted, lineHeight: 1.8, marginTop: 10 }}>
            <div><b style={{ color: T.text }}>开场</b>: {ss.opening_mode}</div>
            <div><b style={{ color: T.text }}>纠偏</b>: {(ss.correction_patterns || []).join(" · ")}</div>
            <div><b style={{ color: T.text }}>AI 动作链</b>: {ss.ai_chain_mode}</div>
            <div><b style={{ color: T.text }}>AI 层级</b>: {ss.ai_layers}</div>
            <div><b style={{ color: T.text }}>机制转折</b>: {ss.transition_mode}</div>
            <div><b style={{ color: T.text }}>CTA 回扣</b>: {ss.cta_mode}</div>
            <div><b style={{ color: T.text }}>人味标准</b>: {ss.humanness_bar}</div>
          </div>
        </details>
      )}

      {/* 批量文案卡片 */}
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {batch.map((item, i) => <TLBatchCard key={i} item={item} onNav={onNav} pitch={pitch} />)}
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 18, alignItems: "center" }}>
        <Btn variant="outline" onClick={onPrev}>← 改卖点</Btn>
        <Btn onClick={onRegen}>🔄 重新生成</Btn>
        <div style={{ flex: 1 }} />
        <Btn variant="primary" onClick={onReset}>再来一批</Btn>
      </div>
    </div>
  );
}

function TLBatchCard({ item, onNav, pitch }) {
  const [copied, setCopied] = React.useState(false);
  const [expand, setExpand] = React.useState(false);
  const dc = item.director_check || {};
  const total = dc.total || Object.values(dc).filter(v => typeof v === "number").reduce((a, b) => a + b, 0);

  function copy() {
    const full = `【${item.structure}】${item.title}\n\n${item.first_line}\n\n${item.body}\n\n${item.cta}`;
    navigator.clipboard?.writeText(full);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function makeVideo() {
    if (!onNav) return;
    const full = `${item.first_line}\n\n${item.body}\n\n${item.cta}`;
    try {
      localStorage.setItem("make_v2_seed_script", full);
      localStorage.setItem("make_v2_seed_from", JSON.stringify({
        skill: "touliu",
        title: `${item.structure} · ${(pitch || item.title || "").slice(0, 24)}`,
        ts: Date.now(),
      }));
    } catch (_) {}
    onNav("make");
  }

  const structColors = { "痛点型": "red", "对比型": "blue", "步骤型": "amber", "对话型": "purple", "创新型": "green" };

  return (
    <div style={{ padding: 16, background: "#fff", border: `1px solid ${T.borderSoft}`, borderRadius: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 11, color: T.muted2, fontFamily: "SF Mono, monospace", width: 26 }}>#{item.no}</span>
        <Tag size="xs" color={structColors[item.structure] || "blue"}>{item.structure}</Tag>
        <span style={{ fontSize: 15, fontWeight: 600, color: T.text, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.title}</span>
        {total > 0 && (
          <span style={{ fontSize: 11, color: total >= 24 ? T.brand : T.amber, fontWeight: 600, fontFamily: "SF Mono, monospace" }}>
            {total}/30 {total >= 24 ? "✓" : "⚠️"}
          </span>
        )}
        <Btn size="sm" variant={copied ? "soft" : "outline"} onClick={copy}>{copied ? "✓ 已复制" : "📋 复制"}</Btn>
      </div>

      <div style={{ fontSize: 13.5, color: T.text, marginBottom: 8, fontWeight: 500, background: T.brandSoft, padding: "8px 12px", borderRadius: 6, lineHeight: 1.6, borderLeft: `3px solid ${T.brand}` }}>
        🎬 {item.first_line}
      </div>

      <div style={{
        fontSize: 13.5, color: T.text, lineHeight: 1.9, whiteSpace: "pre-wrap",
        maxHeight: expand ? "none" : 200, overflow: "hidden", position: "relative",
      }}>
        {item.body}
        {!expand && item.body.length > 400 && (
          <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 60, background: "linear-gradient(transparent, #fff)" }} />
        )}
      </div>
      {item.body.length > 400 && (
        <div onClick={() => setExpand(!expand)} style={{ fontSize: 11.5, color: T.brand, cursor: "pointer", marginTop: 4, fontWeight: 500 }}>
          {expand ? "↑ 收起" : "↓ 展开全文"}
        </div>
      )}

      <div style={{ marginTop: 10, padding: "8px 12px", background: T.bg2, borderRadius: 6, fontSize: 12.5, color: T.text, fontWeight: 500 }}>
        📣 CTA: {item.cta}
      </div>

      {dc && Object.keys(dc).length > 1 && (
        <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 10, fontSize: 10.5, color: T.muted2 }}>
          {["人味", "场景完成度", "业务过渡自然度", "AI机制密度", "说服层数", "收口自然度"].map(k => dc[k] != null && (
            <span key={k}>{k} {dc[k]}/5</span>
          ))}
        </div>
      )}

      {onNav && (
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px dashed ${T.borderSoft}`, display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 11, color: T.muted2 }}>下一步:</span>
          <Btn size="sm" variant="primary" onClick={makeVideo}>🎬 用这条做视频 →</Btn>
          <span style={{ fontSize: 10.5, color: T.muted2 }}>跳到「做视频」 Step 1,文案自动带入</span>
        </div>
      )}
    </div>
  );
}

// 覆盖旧的 PageAd(factory-ad.jsx 里定义的 5 步基础版)
// 此文件在 index.html 里在 factory-ad.jsx 之后加载,最后一个赋值生效
Object.assign(window, { PageAd: PageTouliu, PageTouliu });
