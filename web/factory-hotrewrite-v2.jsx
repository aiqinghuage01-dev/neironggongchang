// factory-hotrewrite-v2.jsx — 热点文案改写V2 skill 全链路 (D-012)
// Skill 源: ~/Desktop/skills/热点文案改写V2/
// 3 步: 输入热点 → 看拆解+选 3 个角度 → 看正文+六维自检

const HOT_STEPS = [
  { id: "input",   n: 1, label: "输入热点" },
  { id: "angles",  n: 2, label: "选切入角度" },
  { id: "write",   n: 3, label: "正文+自检" },
];

// D-062nn-C3: 改写模式 checkbox 卡 (Step 2 用)
function ModeCheckCard({ on, onClick, disabled, title, desc, recommend }) {
  return (
    <label onClick={onClick} style={{
      padding: "12px 14px", borderRadius: 8,
      cursor: disabled ? "not-allowed" : "pointer",
      background: on ? "#fff" : "transparent",
      border: `1.5px solid ${on ? T.brand : T.muted3}`,
      display: "flex", alignItems: "flex-start", gap: 10,
      opacity: disabled ? 0.85 : 1,
    }}>
      <div style={{
        width: 18, height: 18, borderRadius: 4,
        border: `1.5px solid ${on ? T.brand : T.muted2}`,
        background: on ? T.brand : "transparent", flexShrink: 0, marginTop: 1,
        display: "flex", alignItems: "center", justifyContent: "center",
        color: "#fff", fontSize: 12, fontWeight: 700,
      }}>{on && "✓"}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13.5, fontWeight: 600, color: T.text }}>{title}</span>
          {recommend && <Tag size="xs" color="green">推荐</Tag>}
          <Tag size="xs" color="brand">+2 篇</Tag>
        </div>
        <div style={{ fontSize: 11.5, color: T.muted, lineHeight: 1.5 }}>{desc}</div>
      </div>
    </label>
  );
}

function PageHotrewrite({ onNav }) {
  // D-062x: 反向 anchor — 检测从 PageMakeV2 跳来
  const fm = useFromMake("hotrewrite");
  const [step, setStep] = React.useState("input");
  const [loading, setLoading] = React.useState(false);
  const [err, setErr] = React.useState("");

  const [hotspot, setHotspot] = React.useState("");
  const [analyze, setAnalyze] = React.useState(null);  // {breakdown, angles}
  const [pickedAngle, setPickedAngle] = React.useState(null);
  const [script, setScript] = React.useState(null);     // {content, word_count, self_check, tokens} — 当前展示的那篇 (back compat)
  // D-062nn-C4: 累积所有写过的版本, 让用户对比挑
  const [versions, setVersions] = React.useState([]);   // [{content, angle, mode_label, word_count, self_check, tokens, ts}]
  const [activeVersionIdx, setActiveVersionIdx] = React.useState(0);
  const [appendingVersion, setAppendingVersion] = React.useState(false);

  // D-062nn-C3: 改写模式 (checkbox 制, 默认 ☑ 业务)
  const [withBiz, setWithBiz] = React.useState(true);
  const [pureRewrite, setPureRewrite] = React.useState(false);

  const [skillInfo, setSkillInfo] = React.useState(null);
  React.useEffect(() => { api.get("/api/hotrewrite/skill-info").then(setSkillInfo).catch(() => {}); }, []);

  // D-062nn-C3: 检测 make 那边丢的 hotrewrite_seed_hotspot, 自动填 + 自动 doAnalyze
  // (跳过 input step, 直接进 angles step)
  const seedConsumedRef = React.useRef(false);
  React.useEffect(() => {
    if (seedConsumedRef.current) return;
    try {
      const seed = localStorage.getItem("hotrewrite_seed_hotspot");
      if (seed && !hotspot) {
        seedConsumedRef.current = true;
        setHotspot(seed);
        localStorage.removeItem("hotrewrite_seed_hotspot");
        // 等 setHotspot flush 后再 doAnalyze
      }
    } catch (_) {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 当 hotspot 是从 seed 来的, 自动触发 doAnalyze
  React.useEffect(() => {
    if (seedConsumedRef.current && hotspot && !analyze && step === "input" && !loading) {
      doAnalyze();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hotspot]);

  async function runStep({ nextStep, rollbackStep, clearSetter, apiCall }) {
    if (clearSetter) clearSetter(null);
    setStep(nextStep);
    setLoading(true); setErr("");
    try {
      await apiCall();
    } catch (e) {
      setErr(e.message);
      if (rollbackStep) setStep(rollbackStep);
    } finally {
      setLoading(false);
    }
  }

  function doAnalyze() {
    if (!hotspot.trim()) return;
    return runStep({
      nextStep: "angles", rollbackStep: "input", clearSetter: setAnalyze,
      apiCall: async () => {
        const r = await api.post("/api/hotrewrite/analyze", { hotspot: hotspot.trim() });
        setAnalyze(r);
      },
    });
  }

  // D-062nn-C4: 抽出 callWrite 让 pickAngle / addVersion 复用
  async function callWrite(angle, modeLabel) {
    const r = await api.post("/api/hotrewrite/write", {
      hotspot: hotspot.trim(),
      breakdown: analyze?.breakdown || {},
      angle,
      modes: { with_biz: withBiz, pure_rewrite: pureRewrite },
    });
    return { ...r, angle, mode_label: modeLabel, ts: Date.now() };
  }

  function pickAngle(angle) {
    setPickedAngle(angle);
    setVersions([]);  // 换角度从 0 开始
    return runStep({
      nextStep: "write", rollbackStep: "angles", clearSetter: setScript,
      apiCall: async () => {
        const modeLabel = withBiz ? (pureRewrite ? "结合业务+纯改写" : "结合业务") : "纯改写";
        const v = await callWrite(angle, modeLabel);
        setScript(v);
        setVersions([v]);
        setActiveVersionIdx(0);
      },
    });
  }

  // D-062nn-C4: 同角度再来一版 (复用现有 angle, append 到 versions[])
  async function addAnotherVersion(sameAngle = true, newAngle = null) {
    const angle = sameAngle ? pickedAngle : newAngle;
    if (!angle) return;
    if (!sameAngle) setPickedAngle(newAngle);
    setAppendingVersion(true); setErr("");
    try {
      const modeLabel = withBiz ? (pureRewrite ? "结合业务+纯改写" : "结合业务") : "纯改写";
      const v = await callWrite(angle, modeLabel + (sameAngle ? " · 再来一版" : " · 换角度"));
      const newVersions = [...versions, v];
      setVersions(newVersions);
      setActiveVersionIdx(newVersions.length - 1);
      setScript(v);
    } catch (e) { setErr(e.message); }
    finally { setAppendingVersion(false); }
  }

  function switchVersion(idx) {
    setActiveVersionIdx(idx);
    setScript(versions[idx]);
  }

  function reset() {
    setStep("input"); setErr("");
    setHotspot(""); setAnalyze(null);
    setPickedAngle(null); setScript(null);
    setVersions([]); setActiveVersionIdx(0);
    clearWorkflow("hotrewrite");
  }

  // 工作流持久化 (D-016)
  const wfState = { step, hotspot, analyze, pickedAngle, script };
  const wfRestore = (s) => {
    if (s.step) setStep(s.step);
    if (s.hotspot != null) setHotspot(s.hotspot);
    if (s.analyze) setAnalyze(s.analyze);
    if (s.pickedAngle) setPickedAngle(s.pickedAngle);
    if (s.script) setScript(s.script);
  };
  const wf = useWorkflowPersist({ ns: "hotrewrite", state: wfState, onRestore: wfRestore });

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", background: T.bg, position: "relative", overflow: "hidden" }}>
      <HotHeader current={step} onBack={() => onNav("home")} skillInfo={skillInfo} />
      <div style={{ flex: 1, overflow: "auto" }}>
        <div style={{ maxWidth: 820, margin: "16px auto 0" }}>
          <FromMakeBanner fromMake={fm.fromMake} dismiss={fm.dismiss}
            label="热点改写完, 点完成态'做成视频' CTA 自动带回" />
        </div>
        <WfRestoreBanner show={wf.hasSnapshot} onDismiss={wf.dismissSnapshot}
          onClear={() => { reset(); wf.dismissSnapshot(); }}
          label="热点改写工作流" />
        {err && (
          <div style={{ maxWidth: 820, margin: "16px auto 0", padding: 12, background: T.redSoft, color: T.red, borderRadius: 10, fontSize: 13 }}>
            ⚠️ {err}
          </div>
        )}
        {step === "input"  && <HotStepInput hotspot={hotspot} setHotspot={setHotspot} onGo={doAnalyze} loading={loading} skillInfo={skillInfo} />}
        {step === "angles" && <HotStepAngles analyze={analyze} loading={loading} onPick={pickAngle} onPrev={() => setStep("input")} onRegen={doAnalyze}
          withBiz={withBiz} setWithBiz={setWithBiz} pureRewrite={pureRewrite} setPureRewrite={setPureRewrite} />}
        {step === "write"  && <HotStepWrite script={script} hotspot={hotspot} angle={pickedAngle} loading={loading} onPrev={() => setStep("angles")} onRewrite={() => pickAngle(pickedAngle)} onReset={reset} onNav={onNav}
          versions={versions} activeVersionIdx={activeVersionIdx} onSwitchVersion={switchVersion}
          allAngles={analyze?.angles || []}
          onAddSameAngle={() => addAnotherVersion(true)}
          onAddOtherAngle={(a) => addAnotherVersion(false, a)}
          appendingVersion={appendingVersion}
        />}
      </div>
    </div>
  );
}

// ─── 顶栏 ────────────────────────────────────────────────
function HotHeader({ current, onBack, skillInfo }) {
  return (
    <div style={{ padding: "12px 24px", background: "#fff", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 14, flexShrink: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ width: 26, height: 26, borderRadius: 7, background: T.text, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13 }}>🔥</div>
        <div style={{ fontSize: 13.5, fontWeight: 600 }}>热点文案改写 · 3 步</div>
        {skillInfo && (
          <span title={`~/Desktop/skills/${skillInfo.slug}/ · SKILL.md ${skillInfo.skill_md_chars} 字`}
            style={{ fontSize: 10.5, color: T.brand, background: T.brandSoft, padding: "2px 8px", borderRadius: 100, marginLeft: 6 }}>
            用技能:{skillInfo.slug}
          </span>
        )}
      </div>
      <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, marginLeft: 8 }}>
        {HOT_STEPS.map((s, i) => {
          const active = s.id === current;
          const done = HOT_STEPS.findIndex(x => x.id === current) > i;
          return (
            <React.Fragment key={s.id}>
              <div style={{
                display: "flex", alignItems: "center", gap: 5, padding: "4px 10px 4px 5px", borderRadius: 100, fontSize: 11.5, fontWeight: 500,
                background: active ? T.text : "transparent",
                color: active ? "#fff" : done ? T.brand : T.muted,
                whiteSpace: "nowrap",
              }}>
                <div style={{
                  width: 18, height: 18, borderRadius: "50%",
                  background: active ? "#fff" : done ? T.brandSoft : T.bg2,
                  color: active ? T.text : done ? T.brand : T.muted2,
                  display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700,
                }}>{done ? "✓" : s.n}</div>
                {s.label}
              </div>
              {i < HOT_STEPS.length - 1 && <span style={{ color: T.muted3 }}>—</span>}
            </React.Fragment>
          );
        })}
      </div>
      <ApiStatusLight />
      <button onClick={onBack} style={{ background: "transparent", border: "none", color: T.muted, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>← 返回</button>
    </div>
  );
}

// ─── Step 1 · 输入热点 ──────────────────────────────────
function HotStepInput({ hotspot, setHotspot, onGo, loading, skillInfo }) {
  const ready = !!hotspot.trim() && !loading;
  // D-062aa: 加今日热点候选, 一键塞进 textarea (原 audit path A item 1)
  const [hotTopics, setHotTopics] = React.useState(null);
  function reloadTopics() {
    api.get("/api/hot-topics?limit=10")
      .then(items => setHotTopics(items || []))
      .catch(() => setHotTopics([]));
  }
  React.useEffect(reloadTopics, []);
  function pickTopic(t) {
    const seed = `# 来自热点库 (${t.platform || "?"} · 热度 ${t.heat_score || 0})\n${t.title}\n${t.match_reason ? "\n匹配原因: " + t.match_reason : ""}`;
    setHotspot(seed);
  }

  return (
    <div style={{ padding: "40px 40px 60px", maxWidth: 720, margin: "0 auto" }}>
      <div style={{ textAlign: "center", marginBottom: 24 }}>
        <div style={{ fontSize: 28, fontWeight: 700, color: T.text, marginBottom: 8, letterSpacing: "-0.02em" }}>什么热点要改写? 🔥</div>
        <div style={{ fontSize: 14, color: T.muted }}>skill 自带方法论: 80% 价值输出 + 20% 业务植入 · 1800-2600 字口播</div>
      </div>

      <div style={{ background: "#fff", border: `1.5px solid ${T.brand}`, boxShadow: `0 0 0 5px ${T.brandSoft}`, borderRadius: 16, padding: 18, marginBottom: 18 }}>
        <textarea rows={6} value={hotspot} onChange={e => setHotspot(e.target.value)}
          placeholder="贴一条热点(事件描述/新闻链接/关键信息都行)...&#10;&#10;例:最近某平台头部主播人设翻车,大量带货数据作假被曝光..."
          style={{ width: "100%", border: "none", outline: "none", background: "transparent", fontSize: 14.5, fontFamily: "inherit", resize: "vertical", lineHeight: 1.7, color: T.text }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, paddingTop: 12, borderTop: `1px solid ${T.borderSoft}` }}>
          <div style={{ fontSize: 11.5, color: T.muted2 }}>🔥 skill 会先拆解事件,给你 3 个切入角度挑</div>
          <div style={{ flex: 1 }} />
          <button onClick={onGo} disabled={!ready} style={{
            padding: "8px 20px", fontSize: 13, fontWeight: 600,
            background: ready ? T.brand : T.muted3, color: "#fff",
            border: "none", borderRadius: 100, cursor: ready ? "pointer" : "not-allowed", fontFamily: "inherit",
          }}>{loading ? "拆解中..." : "开始拆解 →"}</button>
        </div>
      </div>

      {/* D-062aa: 今日热点 (候选 / 飞轮 CTA) */}
      <div style={{ background: "#fff", border: `1px solid ${T.borderSoft}`, borderRadius: 12, padding: 14, marginBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: T.text }}>📅 今日热点</span>
          <Tag size="xs" color="gray">{hotTopics?.length || 0}</Tag>
          <span style={{ fontSize: 10.5, color: T.muted2 }}>· 点一条一键塞 textarea</span>
        </div>
        {!hotTopics ? (
          <div style={{ fontSize: 11, color: T.muted2, padding: 8 }}>加载…</div>
        ) : hotTopics.length === 0 ? (
          <NightHotFlywheel onTopics={reloadTopics} compact />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {hotTopics.slice(0, 3).map(t => (
              <div key={t.id} onClick={() => pickTopic(t)}
                style={{
                  padding: "7px 10px",
                  background: t.fetched_from === "night-shift" ? "linear-gradient(135deg, #fff8ec, #fff)" : T.bg2,
                  border: `1px solid ${T.borderSoft}`, borderRadius: 6, cursor: "pointer",
                  display: "flex", alignItems: "center", gap: 10, fontSize: 12,
                }}>
                <span style={{ fontWeight: 700, color: T.amber, minWidth: 36, fontSize: 12.5 }}>🔥{t.heat_score || 0}</span>
                {t.platform && <Tag size="xs" color="pink">{t.platform}</Tag>}
                {t.fetched_from === "night-shift" && <Tag size="xs" color="amber">🌙</Tag>}
                <span style={{ flex: 1, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</span>
                <span style={{ fontSize: 10.5, color: T.brand, fontWeight: 500, whiteSpace: "nowrap" }}>用这条 →</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {skillInfo && (
        <div style={{ padding: 14, background: "#fff", border: `1px solid ${T.borderSoft}`, borderRadius: 10, fontSize: 12, color: T.muted, lineHeight: 1.8 }}>
          <div style={{ fontWeight: 600, color: T.text, marginBottom: 6 }}>skill 资源</div>
          <div>SKILL.md · {skillInfo.skill_md_chars} 字符</div>
          <div style={{ marginTop: 6, color: T.muted2 }}>在 {skillInfo.root} 改 SKILL.md,下次调用自动同步</div>
        </div>
      )}
    </div>
  );
}

// ─── Step 2 · 拆解 + 挑角度 (D-062nn-C3 加 checkbox 改写模式) ─────────
function HotStepAngles({ analyze, loading, onPick, onPrev, onRegen, withBiz, setWithBiz, pureRewrite, setPureRewrite }) {
  const [hoverIdx, setHoverIdx] = React.useState(-1);
  if (loading || !analyze) return <Spinning icon="🔍" phases={[
    { text: "拆解事件核心", sub: "事实核查 · 起因后果" },
    { text: "找冲突点", sub: "最刺痛老板的那个矛盾" },
    { text: "标情绪入口", sub: "委屈 / 焦虑 / 无力 / 机会感" },
    { text: "产出 3 个切入角度", sub: "每个带适用场景 + 开场草稿" },
  ]} />;
  const b = analyze.breakdown || {};
  const angles = analyze.angles || [];

  // D-062nn-C3: 至少保留 1 个 checkbox 不能取消
  function toggleBiz() {
    if (withBiz && !pureRewrite) return;  // 只剩 biz 时不让取消
    setWithBiz(!withBiz);
  }
  function togglePure() {
    if (pureRewrite && !withBiz) return;
    setPureRewrite(!pureRewrite);
  }
  const totalCount = (withBiz ? 2 : 0) + (pureRewrite ? 2 : 0);

  return (
    <div style={{ padding: "32px 40px 120px", maxWidth: 820, margin: "0 auto" }}>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>拆解完毕 · 挑个切入角度 🎯</div>
        <div style={{ fontSize: 13, color: T.muted }}>选下面 1 个角度, 小华按勾选的模式各写 2 篇.</div>
      </div>

      <div style={{ padding: 16, background: T.bg2, border: `1px solid ${T.borderSoft}`, borderRadius: 12, marginBottom: 16 }}>
        <div style={{ fontSize: 11.5, color: T.muted2, fontWeight: 600, letterSpacing: "0.08em", marginBottom: 10 }}>热点拆解</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 13, lineHeight: 1.7 }}>
          <div><b style={{ color: T.text }}>事件核心</b> · <span style={{ color: T.muted }}>{b.event_core}</span></div>
          <div><b style={{ color: T.text }}>冲突点</b> · <span style={{ color: T.muted }}>{b.conflict}</span></div>
          <div><b style={{ color: T.text }}>情绪入口</b> · <span style={{ color: T.muted }}>{b.emotion}</span></div>
        </div>
      </div>

      {/* D-062nn-C3: 改写模式 checkbox 卡 (默认 ☑ 业务 · 至少保留 1 个) */}
      <div style={{ marginBottom: 16, padding: 14, background: T.brandSoft, borderRadius: 10, border: `1px solid ${T.brand}33` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: T.text }}>改写模式</span>
          <span style={{ fontSize: 11, color: T.muted }}>· 多选 · 每勾一项加 2 篇</span>
          <div style={{ flex: 1 }} />
          <span style={{
            fontSize: 12, fontWeight: 700, color: T.brand,
            padding: "3px 12px", background: "#fff", borderRadius: 100,
          }}>本次会出 {totalCount} 篇</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <ModeCheckCard
            on={withBiz} onClick={toggleBiz}
            disabled={withBiz && !pureRewrite}
            title="结合业务" recommend
            desc="80% 价值 + 20% 业务植入 · V3 翻转版 + V4 圈人版" />
          <ModeCheckCard
            on={pureRewrite} onClick={togglePure}
            disabled={pureRewrite && !withBiz}
            title="纯改写"
            desc="不带业务植入 · V1 换皮版 + V2 狠劲版" />
        </div>
        <div style={{ marginTop: 8, fontSize: 10.5, color: T.muted2, lineHeight: 1.5 }}>
          💡 默认勾"结合业务"出 2 篇 · 都勾出 4 篇对比 · 至少保留 1 个
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {angles.map((a, i) => {
          const hover = hoverIdx === i;
          return (
            <div key={i}
              onClick={() => onPick(a)}
              onMouseEnter={() => setHoverIdx(i)}
              onMouseLeave={() => setHoverIdx(-1)}
              style={{
                padding: 18, background: "#fff",
                border: `1px solid ${hover ? T.brand : T.borderSoft}`,
                boxShadow: hover ? `0 0 0 4px ${T.brandSoft}` : "none",
                borderRadius: 12, cursor: "pointer",
                transition: "border-color 0.15s, box-shadow 0.15s",
              }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <Tag size="xs" color={["pink","blue","purple","amber","green"][i % 5]}>{a.label?.split('.')[0] || (i + 1)}</Tag>
                <span style={{ fontSize: 15, fontWeight: 600, color: T.text }}>{a.label?.replace(/^[A-Z]\.\s*/, '')}</span>
              </div>
              <div style={{ fontSize: 12, color: T.muted, marginBottom: 8 }}>适合: {a.audience}</div>
              <div style={{ fontSize: 13, color: T.text, background: T.bg2, padding: "8px 12px", borderRadius: 6, lineHeight: 1.6, borderLeft: `3px solid ${T.brand}` }}>
                💬 开场草稿: <b>"{a.draft_hook}"</b>
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 18, alignItems: "center" }}>
        <Btn variant="outline" onClick={onPrev}>← 改热点</Btn>
        <Btn onClick={onRegen}>🔄 重新拆解</Btn>
      </div>
    </div>
  );
}

// ─── Step 3 · 正文 + 六维自检 ───────────────────────────
function HotStepWrite({ script, hotspot, angle, loading, onPrev, onRewrite, onReset, onNav,
  versions, activeVersionIdx, onSwitchVersion, allAngles, onAddSameAngle, onAddOtherAngle, appendingVersion }) {
  if (loading || !script) return <Spinning icon="✍️" phases={[
    { text: "读 skill 完整方法论", sub: "Step 2-5 · 流量骨架 + 人设 + 业务植入" },
    { text: "3 秒判词开场", sub: "直接态度,不先背景" },
    { text: "30 秒画面还原", sub: "人物 + 动作 + 关键话" },
    { text: "底层机制解释", sub: "易记理论词 / 比喻" },
    { text: "连续反转推进", sub: "每 300-500 字一次「你以为/其实」" },
    { text: "三条建议 · 第 3 条接业务", sub: "80% 价值 + 20% 业务(低压 CTA)" },
    { text: "金句收口", sub: "可传播结论" },
    { text: "六维自检 · 一票否决", sub: "总 ≥ 105 · 单项 ≥ 16" },
  ]} />;

  const sc = script.self_check || {};
  const dims = sc.six_dimensions || {};
  const total = Object.values(dims).reduce((a, b) => a + (b || 0), 0);
  const veto = sc.one_veto || {};

  const [copied, setCopied] = React.useState(false);
  function copy() {
    navigator.clipboard?.writeText(script.content || "");
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  // D-062nn-C4: 切角度的 popover
  const [showAngleSwitch, setShowAngleSwitch] = React.useState(false);
  const otherAngles = (allAngles || []).filter(a => a?.label !== angle?.label);

  return (
    <div style={{ padding: "32px 40px 120px", maxWidth: 1080, margin: "0 auto" }}>
      {/* D-062nn-C4: 多版 tab 切换 (versions 数组 > 1 时显) */}
      {versions && versions.length > 1 && (
        <div style={{ marginBottom: 14, padding: 10, background: T.bg2, borderRadius: 10, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: T.text }}>📚 共 {versions.length} 版:</span>
          {versions.map((v, i) => (
            <button key={i} onClick={() => onSwitchVersion(i)}
              title={`角度: ${v.angle?.label || ""} · ${new Date(v.ts).toLocaleTimeString().slice(0, 5)}`}
              style={{
                padding: "4px 12px", fontSize: 11.5, fontFamily: "inherit",
                background: i === activeVersionIdx ? T.brand : "#fff",
                color: i === activeVersionIdx ? "#fff" : T.muted,
                border: `1px solid ${i === activeVersionIdx ? T.brand : T.borderSoft}`,
                borderRadius: 100, cursor: "pointer", fontWeight: i === activeVersionIdx ? 600 : 500,
              }}>
              第 {i + 1} 版 · {v.mode_label}
            </button>
          ))}
        </div>
      )}

      <div style={{ marginBottom: 16, display: "flex", alignItems: "flex-start", gap: 16 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>热点口播正文 · {script.word_count} 字 ✍️</div>
          <div style={{ fontSize: 12, color: T.muted }}>
            角度: <b style={{ color: T.text }}>{angle?.label}</b> · write {script.tokens?.write} tok · check {script.tokens?.check} tok
            {script.mode_label && <> · 模式: <b style={{ color: T.text }}>{script.mode_label}</b></>}
          </div>
        </div>
        <div style={{ padding: 12, background: sc.pass ? T.brandSoft : T.redSoft, border: `1px solid ${sc.pass ? T.brand + "44" : T.red + "44"}`, borderRadius: 10, fontSize: 12, color: sc.pass ? T.brand : T.red, minWidth: 240 }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>📋 六维自检 {sc.pass ? "✅" : "❌"}</div>
          <div>六维评分: {total}/120 {total >= 105 ? "✓" : "(需 ≥105)"}</div>
          <div>一票否决: {veto.triggered ? `触发: ${(veto.items || []).join('、')}` : "无"}</div>
        </div>
      </div>

      <div style={{ background: "#fff", border: `1px solid ${T.borderSoft}`, borderRadius: 12, padding: 20 }}>
        <textarea value={script.content || ""} readOnly
          style={{ width: "100%", border: "none", outline: "none", background: "transparent", fontSize: 14.5, fontFamily: "inherit", resize: "vertical", lineHeight: 1.9, color: T.text, minHeight: 420 }} />
      </div>
      {sc.summary && <div style={{ marginTop: 10, padding: 10, background: T.bg2, borderRadius: 8, fontSize: 12, color: T.muted, lineHeight: 1.6 }}>💬 <b>总评:</b> {sc.summary}</div>}

      {/* D-062nn-C4: 操作行 — 多版累积 + 切角度 + 复制 */}
      <div style={{ display: "flex", gap: 10, marginTop: 18, alignItems: "center", flexWrap: "wrap", position: "relative" }}>
        <Btn variant="outline" onClick={onPrev}>← 改角度选择</Btn>
        <Btn onClick={onAddSameAngle || onRewrite} disabled={appendingVersion}>
          {appendingVersion ? "AI 写中..." : "🔄 再来一版 (同角度)"}
        </Btn>
        {otherAngles.length > 0 && (
          <div style={{ position: "relative" }}>
            <Btn onClick={() => setShowAngleSwitch(!showAngleSwitch)} disabled={appendingVersion}>
              🎯 换角度再写 ▾
            </Btn>
            {showAngleSwitch && (
              <div style={{
                position: "absolute", top: "100%", left: 0, marginTop: 6,
                background: "#fff", border: `1px solid ${T.border}`, borderRadius: 10,
                boxShadow: "0 8px 24px rgba(0,0,0,0.12)", padding: 8, zIndex: 10, minWidth: 280,
              }}>
                {otherAngles.map((a, i) => (
                  <div key={i} onClick={() => {
                    setShowAngleSwitch(false);
                    onAddOtherAngle && onAddOtherAngle(a);
                  }} style={{
                    padding: "8px 10px", borderRadius: 6, cursor: "pointer", fontSize: 12.5,
                    color: T.text, lineHeight: 1.5,
                  }}
                    onMouseEnter={e => { e.currentTarget.style.background = T.brandSoft; }}
                    onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}>
                    <b>{a.label}</b> · <span style={{ color: T.muted }}>{a.audience}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        <div style={{ flex: 1 }} />
        <Btn onClick={copy} variant={copied ? "soft" : "default"}>{copied ? "✓ 已复制" : "📋 复制正文"}</Btn>
        <Btn onClick={onReset}>再写一条热点</Btn>
      </div>

      {/* D-062c: 完成态加 "下一步: 做成数字人视频" CTA */}
      {onNav && script.content && (
        <div style={{ marginTop: 16, padding: 16, background: "linear-gradient(135deg, #f6fbf7, #fff)",
                      border: `1.5px solid ${T.brand}`, boxShadow: `0 0 0 4px ${T.brandSoft}`,
                      borderRadius: 12, display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ fontSize: 26 }}>✨</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: T.text }}>下一步: 把这条热点改写做成数字人视频?</div>
            <div style={{ fontSize: 12, color: T.muted, marginTop: 3 }}>
              一键带文案过去 · 选声音 + 数字人 + 模板 · 出片
            </div>
          </div>
          <Btn variant="primary" onClick={() => {
            try {
              localStorage.setItem("make_v2_seed_script", script.content);
              localStorage.setItem("make_v2_seed_from", JSON.stringify({
                skill: "hotrewrite", title: hotspot?.slice(0, 30) || "热点改写",
                ts: Date.now(),
              }));
            } catch (_) {}
            onNav("make");
          }}>🎬 做成数字人视频 →</Btn>
        </div>
      )}
    </div>
  );
}

Object.assign(window, { PageHotrewrite });
