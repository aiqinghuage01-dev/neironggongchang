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

  // D-101: 改写模式默认两种都勾, 直接生成 V1-V4 四版.
  const [withBiz, setWithBiz] = React.useState(true);
  const [pureRewrite, setPureRewrite] = React.useState(true);

  const [skillInfo, setSkillInfo] = React.useState(null);
  React.useEffect(() => { api.get("/api/hotrewrite/skill-info").then(setSkillInfo).catch(() => {}); }, []);

  // D-037b5: write 异步任务. ref 存当前 task 的 angle/modeLabel 给 onComplete 用.
  const [taskId, setTaskId] = useTaskPersist("hotrewrite");
  const taskMetaRef = React.useRef({ angle: null, modeLabel: "", baseCount: 0 });
  const partialSeenRef = React.useRef({});
  const poller = useTaskPoller(taskId, {
    onComplete: (r) => {
      const meta = taskMetaRef.current;
      const now = Date.now();
      const incoming = Array.isArray(r?.versions) && r.versions.length
        ? r.versions.map((v, idx) => ({
          ...v,
          angle: meta.angle,
          mode_label: v.mode_label || meta.modeLabel,
          ts: now + idx,
        }))
        : [{ ...r, angle: meta.angle, mode_label: meta.modeLabel, ts: now }];
      setVersions((vs) => {
        const baseCount = Math.min(meta.baseCount || 0, vs.length);
        const startIdx = baseCount;
        const next = [...vs.slice(0, baseCount), ...incoming];
        setActiveVersionIdx(startIdx);
        setScript(next[startIdx]);
        return next;
      });
      setTaskId(null);
    },
    onError: (e) => { setErr(e || "改写失败"); /* 留 taskId 让 FailedRetry 渲染 */ },
  });

  // D-062nn-C3: 检测 make 那边丢的 hotrewrite_seed_hotspot, 自动填 + 自动 doAnalyze
  // (跳过 input step, 直接进 angles step)
  // ⚠ 同 voicerewrite: 必须同步删 wf:hotrewrite snap, 防 D-016 useWorkflowPersist 的
  // restore effect (跑得晚) 把 hotspot 覆盖回老的空值
  const seedConsumedRef = React.useRef(false);
  React.useEffect(() => {
    if (seedConsumedRef.current) return;
    try {
      // D-082b 完整版: failed task "🔄 重新生成" 跳页时 sessionStorage 写入 hotspot_preview
      const retry = sessionStorage.getItem("retry_payload_hotrewrite");
      if (retry) {
        const p = JSON.parse(retry);
        const recoveredHotspot = p.hotspot_preview || p.prompt_preview || p.text;
        if (recoveredHotspot && !hotspot) {
          seedConsumedRef.current = true;
          setHotspot(recoveredHotspot);
          sessionStorage.removeItem("retry_payload_hotrewrite");
          localStorage.removeItem("wf:hotrewrite");
          // 不自动跑 — 只填回, 让用户改一下再提交
        }
      }
      const seed = localStorage.getItem("hotrewrite_seed_hotspot");
      if (seed && !hotspot) {
        seedConsumedRef.current = true;
        setHotspot(seed);
        localStorage.removeItem("hotrewrite_seed_hotspot");
        localStorage.removeItem("wf:hotrewrite");  // 防 wf restore 覆盖
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

  // D-037b5: callWrite 改异步, 返 task_id (不再返结果). 结果走 useTaskPoller onComplete.
  async function callWrite(angle, modeLabel, baseCountOverride) {
    const baseCount = typeof baseCountOverride === "number" ? baseCountOverride : versions.length;
    taskMetaRef.current = { angle, modeLabel, baseCount };
    const r = await api.post("/api/hotrewrite/write", {
      hotspot: hotspot.trim(),
      breakdown: analyze?.breakdown || {},
      angle,
      modes: { with_biz: withBiz, pure_rewrite: pureRewrite },
    });
    setTaskId(r.task_id);
  }

  async function pickAngle(angle) {
    setPickedAngle(angle);
    setVersions([]); setScript(null); setErr(""); setTaskId(null);
    setStep("write");
    try {
      const modeLabel = withBiz ? (pureRewrite ? "结合业务+纯改写" : "结合业务") : "纯改写";
      await callWrite(angle, modeLabel, 0);
    } catch (e) { setErr(e.message); setStep("angles"); }
  }

  // D-037b5: 同角度再来一版 (异步任务, append 到 versions[]) — onComplete 自动 append
  async function addAnotherVersion(sameAngle = true, newAngle = null) {
    const angle = sameAngle ? pickedAngle : newAngle;
    if (!angle) return;
    if (poller.isRunning) return;  // 防 race: 一次只跑一个任务
    if (!sameAngle) setPickedAngle(newAngle);
    setErr("");
    try {
      const modeLabel = withBiz ? (pureRewrite ? "结合业务+纯改写" : "结合业务") : "纯改写";
      await callWrite(angle, modeLabel + (sameAngle ? " · 再来一版" : " · 换角度"), versions.length);
    } catch (e) { setErr(e.message); }
  }

  function retry() {
    if (!pickedAngle) { setStep("angles"); return; }
    setErr(""); setTaskId(null);
    pickAngle(pickedAngle);
  }

  function switchVersion(idx) {
    setActiveVersionIdx(idx);
    setScript(versions[idx] || null);
  }

  function reset() {
    setStep("input"); setErr("");
    setHotspot(""); setAnalyze(null);
    setPickedAngle(null); setScript(null);
    setVersions([]); setActiveVersionIdx(0); setTaskId(null);
    clearWorkflow("hotrewrite");
  }

  // 工作流持久化 (D-016 + D-037b5 加 taskId/versions)
  const wfState = { step, hotspot, analyze, pickedAngle, script, versions, activeVersionIdx, taskId };
  const wfRestore = (s) => {
    if (s.hotspot != null) setHotspot(s.hotspot);
    if (s.analyze) setAnalyze(s.analyze);
    if (s.pickedAngle) setPickedAngle(s.pickedAngle);
    if (s.script) setScript(s.script);
    if (Array.isArray(s.versions)) setVersions(s.versions);
    if (typeof s.activeVersionIdx === "number") setActiveVersionIdx(s.activeVersionIdx);
    if (s.taskId) {
      taskMetaRef.current = { angle: s.pickedAngle || null, modeLabel: "", baseCount: Array.isArray(s.versions) ? s.versions.length : 0 };
      setTaskId(s.taskId);
    }
    if (s.step) setStep(s.step);
  };
  const wf = useWorkflowPersist({ ns: "hotrewrite", state: wfState, onRestore: wfRestore });

  const partialResult = (poller.isRunning || poller.isFailed) ? (poller.task?.partial_result || null) : null;
  const liveVersions = Array.isArray(partialResult?.versions) && partialResult.versions.length
    ? partialResult.versions.map((v, idx) => ({
      ...v,
      angle: taskMetaRef.current.angle || pickedAngle,
      mode_label: v.mode_label || taskMetaRef.current.modeLabel,
      ts: Date.now() + idx,
    }))
    : [];
  const liveBaseCount = Math.min(taskMetaRef.current.baseCount || 0, versions.length);
  const displayVersions = liveVersions.length ? [...versions.slice(0, liveBaseCount), ...liveVersions] : versions;
  const displayScript = displayVersions[activeVersionIdx] || displayVersions[liveBaseCount] || script;
  const showInlineError = err && !(step === "write" && (poller.isFailed || poller.isCancelled) && displayVersions.length === 0);

  React.useEffect(() => {
    if (!taskId || !liveVersions.length) return;
    if (partialSeenRef.current[taskId]) return;
    partialSeenRef.current[taskId] = true;
    const idx = Math.min(taskMetaRef.current.baseCount || 0, displayVersions.length - 1);
    setActiveVersionIdx(idx);
  }, [taskId, liveVersions.length, displayVersions.length]);

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", background: T.bg, position: "relative", overflow: "hidden" }}>
      <HotHeader current={step} onBack={() => onNav("home")} skillInfo={skillInfo} />
      <div style={{ flex: 1, overflow: "auto" }}>
        <div style={{ maxWidth: 820, margin: "16px auto 0" }}>
          <FromMakeBanner fromMake={fm.fromMake} dismiss={fm.dismiss}
            label="改写完点页底「做成视频」就回到做视频流程, 接着合成" />
        </div>
        <WfRestoreBanner show={wf.hasSnapshot} onDismiss={wf.dismissSnapshot}
          onClear={() => { reset(); wf.dismissSnapshot(); }}
          label="热点改写工作流" />
        {/* D-086: 走全站 InlineError；首版写作失败时只保留 FailedRetry 友好卡片。 */}
        {showInlineError && <InlineError err={err} />}
        {step === "input"  && <HotStepInput hotspot={hotspot} setHotspot={setHotspot} onGo={doAnalyze} loading={loading} skillInfo={skillInfo} />}
        {step === "angles" && <HotStepAngles analyze={analyze} loading={loading} onPick={pickAngle} onPrev={() => setStep("input")} onRegen={doAnalyze}
          withBiz={withBiz} setWithBiz={setWithBiz} pureRewrite={pureRewrite} setPureRewrite={setPureRewrite} />}
        {step === "write"  && (
          poller.isRunning && displayVersions.length === 0 ? (
            // 第一次写, 没有任何版本, 单独显 LoadingProgress
            <LoadingProgress
              task={poller.task}
              icon="🔥"
              title="小华正在写口播..."
              subtitle={`${pickedAngle?.label || pickedAngle?.angle_id || ""} · 1800-2600 字`}
              onCancel={() => { poller.cancel(); setStep("angles"); }}
            />
          ) : poller.isFailed || poller.isCancelled ? (
            // 第一次失败 (versions 为空) 时单独显 FailedRetry
            displayVersions.length === 0 ? (
              <FailedRetry
                error={poller.error || err}
                onRetry={retry}
                onEdit={() => { setTaskId(null); setErr(""); setStep("angles"); }}
                icon="🔥"
                title={poller.isCancelled ? "任务已取消" : "改写没跑成功"}
                hint={poller.isCancelled ? "已发起的生成可能仍会消耗额度；页面已停止等待，不会继续自动追加版本。" : null}
              />
            ) : (
              // 已有版本时, 失败的 retry 按钮挂在底部 HotStepWrite 里 (用现成 onAddSameAngle)
              <HotStepWrite script={displayScript} hotspot={hotspot} angle={pickedAngle} loading={false} onPrev={() => setStep("angles")} onRewrite={retry} onReset={reset} onNav={onNav}
                versions={displayVersions} activeVersionIdx={activeVersionIdx} onSwitchVersion={switchVersion}
                allAngles={analyze?.angles || []}
                onAddSameAngle={() => addAnotherVersion(true)}
                onAddOtherAngle={(a) => addAnotherVersion(false, a)}
                appendingVersion={false}
                progressTask={poller.task}
                progressStartIdx={liveBaseCount}
                onCancelProgress={() => { poller.cancel(); }}
              />
            )
          ) : (
            // 已有版本 (running 追加版本 / ok 完成)
            <HotStepWrite script={displayScript} hotspot={hotspot} angle={pickedAngle} loading={false} onPrev={() => setStep("angles")} onRewrite={() => pickAngle(pickedAngle)} onReset={reset} onNav={onNav}
              versions={displayVersions} activeVersionIdx={activeVersionIdx} onSwitchVersion={switchVersion}
              allAngles={analyze?.angles || []}
              onAddSameAngle={() => addAnotherVersion(true)}
              onAddOtherAngle={(a) => addAnotherVersion(false, a)}
              appendingVersion={poller.isRunning}
              progressTask={poller.task}
              progressStartIdx={liveBaseCount}
              onCancelProgress={() => { poller.cancel(); }}
            />
          )
        )}
      </div>
    </div>
  );
}

// ─── 顶栏 ────────────────────────────────────────────────
function HotHeader({ current, onBack, skillInfo }) {
  return (
    <div style={{ padding: "10px clamp(12px, 4vw, 24px)", background: "#fff", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", flexShrink: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flex: "1 1 250px", minWidth: 0, flexWrap: "wrap" }}>
        <div style={{ width: 26, height: 26, borderRadius: 7, background: T.text, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, flexShrink: 0 }}>🔥</div>
        <div style={{ fontSize: 13.5, fontWeight: 600, whiteSpace: "nowrap" }}>热点文案改写 · 3 步</div>
        {skillInfo && (
          <span title="本页方法已加载"
            style={{ fontSize: 10.5, color: T.brand, background: T.brandSoft, padding: "2px 8px", borderRadius: 100, whiteSpace: "nowrap" }}>
            方法已加载
          </span>
        )}
      </div>
      <div style={{ flex: "999 1 330px", display: "flex", alignItems: "center", gap: 6, minWidth: 0, flexWrap: "wrap" }}>
        {HOT_STEPS.map((s, i) => {
          const active = s.id === current;
          const done = HOT_STEPS.findIndex(x => x.id === current) > i;
          return (
            <React.Fragment key={s.id}>
              <div style={{
                display: "flex", alignItems: "center", gap: 5, padding: "4px 9px 4px 5px", borderRadius: 100, fontSize: 11.5, fontWeight: 500,
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
              {i < HOT_STEPS.length - 1 && <span style={{ color: T.muted3, flexShrink: 0 }}>—</span>}
            </React.Fragment>
          );
        })}
      </div>
      <ApiStatusLight />
      <button onClick={onBack} style={{ background: "transparent", border: "none", color: T.muted, fontSize: 12, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap", marginLeft: "auto" }}>← 返回</button>
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
    <div style={{ padding: "32px 40px 80px", maxWidth: 720, margin: "0 auto" }}>
      {/* A7-todo2 hero polish (与其他 skill 一致 30px) */}
      <div style={{ textAlign: "center", margin: "8px 0 24px" }}>
        <div style={{ fontSize: 30, fontWeight: 700, color: T.text, letterSpacing: "-0.02em", marginBottom: 8 }}>
          什么热点要改写? 🔥
        </div>
        <div style={{ fontSize: 14, color: T.muted, lineHeight: 1.6 }}>
          贴一条热点 · 小华出 3 个角度选 · 改写成你视角的口播 (1800-2600 字)
        </div>
      </div>

      <div style={{ background: "#fff", border: `1.5px solid ${T.brand}`, boxShadow: `0 0 0 5px ${T.brandSoft}`, borderRadius: 16, padding: 18, marginBottom: 18 }}>
        <textarea rows={6} value={hotspot} onChange={e => setHotspot(e.target.value)}
          placeholder="例:最近某平台头部主播人设翻车, 大量带货数据作假被曝光..."
          style={{ width: "100%", padding: 12, border: "none", outline: "none", background: "transparent", fontSize: 14.5, fontFamily: "inherit", resize: "vertical", lineHeight: 1.7, color: T.text, minHeight: 140 }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12, paddingTop: 14, borderTop: `1px solid ${T.borderSoft}` }}>
          {hotspot.trim() ? (
            <Tag size="xs" color="gray">{hotspot.trim().length} 字</Tag>
          ) : (
            <span style={{ fontSize: 12, color: T.muted2 }}>✨ 写完点 "开始拆解" · 小华给 3 个切入角度</span>
          )}
          <div style={{ flex: 1 }} />
          <button onClick={onGo} disabled={!ready} style={{
            padding: "10px 22px", fontSize: 14, fontWeight: 600,
            background: ready ? T.brand : T.muted3, color: "#fff",
            border: "none", borderRadius: 100, cursor: ready ? "pointer" : "not-allowed", fontFamily: "inherit",
          }}>{loading ? "拆解中..." : "🚀 开始拆解 →"}</button>
        </div>
      </div>

      {/* D-062aa: 今日热点 (候选 / 飞轮 CTA) */}
      <div style={{ background: "#fff", border: `1px solid ${T.borderSoft}`, borderRadius: 12, padding: 14, marginBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: T.text }}>📅 今日热点</span>
          <Tag size="xs" color="gray">{hotTopics?.length || 0}</Tag>
          <span style={{ fontSize: 10.5, color: T.muted2 }}>· 点一条自动填入上方</span>
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

      {/* D-069: 删 "skill 资源" 调试面板 — 短视频露馅, 老板自己改方法论走文件 */}
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

      {/* D-101: 默认两种都勾, 直接出 V1-V4 四版; 至少保留 1 个 */}
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
          💡 默认出 4 篇对比 · 想省时间可取消一种模式, 只出 2 篇 · 至少保留 1 个
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
  versions, activeVersionIdx, onSwitchVersion, allAngles, onAddSameAngle, onAddOtherAngle, appendingVersion,
  progressTask, progressStartIdx, onCancelProgress }) {
  if (loading || !script) return <Spinning icon="✍️" phases={[
    { text: "理顺方法论", sub: "流量骨架 + 人设 + 业务植入" },
    { text: "3 秒判词开场", sub: "直接态度,不先背景" },
    { text: "30 秒画面还原", sub: "人物 + 动作 + 关键话" },
    { text: "底层机制解释", sub: "易记理论词 / 比喻" },
    { text: "连续反转推进", sub: "每 300-500 字一次「你以为/其实」" },
    { text: "三条建议 · 第 3 条接业务", sub: "80% 价值 + 20% 业务 · 轻引导不硬塞" },
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
      {(progressTask?.status === "running" || progressTask?.status === "failed") && progressTask?.partial_result?.versions?.length > 0 && (
        <HotLiveProgress
          task={progressTask}
          versions={versions}
          activeVersionIdx={activeVersionIdx}
          onSwitchVersion={onSwitchVersion}
          startIdx={progressStartIdx || 0}
          onCancel={onCancelProgress}
        />
      )}

      {/* D-062nn-C4: 多版 tab 切换 (versions 数组 > 1 时显) */}
      {versions && versions.length > 1 && (
        <HotVersionSwitcher versions={versions} activeVersionIdx={activeVersionIdx}
          onSwitchVersion={onSwitchVersion} compact />
      )}

      {/* Hero (1 行 + 自检 chip 右挂, 替代 240px 抢戏卡) */}
      <div style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 280 }}>
          <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>热点口播正文 · {script.word_count} 字 ✍️</div>
          <div style={{ fontSize: 12, color: T.muted }}>
            角度: <b style={{ color: T.text }}>{angle?.label}</b>
            {script.mode_label && <> · 模式: <b style={{ color: T.text }}>{script.mode_label}</b></>}
          </div>
        </div>
        <SelfCheckChip pass={sc.pass} score={total} max={120} threshold={105} veto={veto} summary={sc.summary} dims={dims} />
      </div>

      <div style={{ background: "#fff", border: `1px solid ${T.borderSoft}`, borderRadius: 12, padding: 20 }}>
        <textarea value={script.content || ""} readOnly
          style={{ width: "100%", border: "none", outline: "none", background: "transparent", fontSize: 14.5, fontFamily: "inherit", resize: "vertical", lineHeight: 1.9, color: T.text, minHeight: 460 }} />
      </div>

      {versions && versions.length > 1 && (
        <HotVersionSwitcher versions={versions} activeVersionIdx={activeVersionIdx}
          onSwitchVersion={onSwitchVersion} />
      )}

      {/* D-062nn-C4: 操作行 — 多版累积 + 切角度 + 复制 */}
      <div style={{ display: "flex", gap: 10, marginTop: 18, alignItems: "center", flexWrap: "wrap", position: "relative" }}>
        <Btn variant="outline" onClick={onPrev}>← 改角度选择</Btn>
        <Btn onClick={onAddSameAngle || onRewrite} disabled={appendingVersion}>
          {appendingVersion ? "小华写中..." : "🔄 再出一组 (同角度)"}
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

function HotLiveProgress({ task, versions, activeVersionIdx, onSwitchVersion, startIdx, onCancel }) {
  const partial = task?.partial_result || {};
  const done = partial.completed_versions || (partial.versions || []).length || 0;
  const total = partial.total_versions || task?.progress_data?.total_versions || done;
  const remaining = Math.max(0, total - done);
  const offset = startIdx || 0;
  const taskVersions = (versions || []).slice(offset, offset + done);
  const running = task?.status === "running";
  const failed = task?.status === "failed";
  const progressText = task?.progress_text || (remaining > 0 ? `正在写第 ${done + 1}/${total} 版` : "已完成");
  const elapsed = task?.elapsed_sec || 0;
  const slow = running && remaining > 0 && elapsed > Math.max(180, Math.round((task?.estimated_seconds || 360) * 0.75));
  const statusText = failed
    ? `后面 ${remaining} 版没有跑完，前面 ${done} 版已保留`
    : remaining > 0
      ? `正在处理剩余 ${remaining} 版，先出的版本可以直接看`
      : "这一组已经全部生成";
  return (
    <div style={{
      marginBottom: 16,
      padding: 14,
      background: "linear-gradient(135deg, #f6fbf7, #fff)",
      border: `1.5px solid ${T.brand}`,
      boxShadow: `0 0 0 4px ${T.brandSoft}`,
      borderRadius: 12,
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
      gap: 14,
      alignItems: "stretch",
    }}>
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
          <span style={{ fontSize: 14, fontWeight: 800, color: T.text }}>先出的版本已经能看</span>
          <Tag size="xs" color="green">已完成 {done}/{total}</Tag>
          {remaining > 0 && <span style={{ fontSize: 12, color: T.muted }}>后面 {remaining} 版继续在后台写</span>}
        </div>
        <div style={{
          marginBottom: 10,
          padding: "9px 10px",
          borderRadius: 8,
          background: failed ? "#fff7ed" : slow ? "#fef3c7" : T.bg2,
          border: `1px solid ${failed || slow ? "#f59e0b55" : T.borderSoft}`,
          color: failed ? "#9a3412" : T.text,
          fontSize: 12.5,
          lineHeight: 1.55,
        }}>
          <b>{progressText}</b>
          <span style={{ color: failed ? "#9a3412" : T.muted }}> · 已等 {fmtSec(elapsed)} · {statusText}</span>
          {slow && !failed && <span style={{ color: "#92400e" }}> · 比预期慢，正在等模型返回</span>}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 8 }}>
          {taskVersions.map((v, i) => {
            const versionIdx = offset + i;
            const on = versionIdx === activeVersionIdx;
            return (
              <button key={`${v.variant_id || "v"}-${versionIdx}`} onClick={() => onSwitchVersion(versionIdx)}
                style={{
                  textAlign: "left",
                  padding: 10,
                  background: on ? T.brand : "#fff",
                  color: on ? "#fff" : T.text,
                  border: `1px solid ${on ? T.brand : T.borderSoft}`,
                  borderRadius: 8,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  boxShadow: on ? `0 0 0 3px ${T.brandSoft}` : "none",
                }}>
                <div style={{ fontSize: 12.5, fontWeight: 800, marginBottom: 4 }}>第 {v.version_index || (versionIdx + 1)} 版</div>
                <div style={{ fontSize: 11.5, opacity: on ? 0.9 : 0.72, lineHeight: 1.35 }}>
                  {v.mode_label || "已完成"} · {v.word_count || 0} 字
                </div>
              </button>
            );
          })}
        </div>
        {running && remaining > 0 && onCancel && (
          <div style={{ marginTop: 10 }}>
            <button onClick={onCancel} style={{
              padding: "7px 10px",
              borderRadius: 8,
              border: `1px solid ${T.border}`,
              background: "#fff",
              color: T.muted,
              fontSize: 12,
              cursor: "pointer",
              fontFamily: "inherit",
            }}>
              取消剩余生成
            </button>
            <div style={{ marginTop: 6, fontSize: 11.5, color: T.muted2, lineHeight: 1.45 }}>
              已发起的生成可能仍会消耗额度；取消后页面会停止等待剩余版本。
            </div>
          </div>
        )}
      </div>
      <TaskProgressTimeline task={task} title="生成现场" />
    </div>
  );
}

function HotVersionSwitcher({ versions, activeVersionIdx, onSwitchVersion, compact }) {
  if (!versions || versions.length <= 1) return null;
  const active = versions[activeVersionIdx] || versions[0];
  return (
    <div style={{
      margin: compact ? "0 0 14px" : "14px 0 0",
      padding: compact ? 10 : 12,
      background: compact ? T.bg2 : "linear-gradient(135deg, #f6fbf7, #fff)",
      border: compact ? "none" : `1px solid ${T.brand}33`,
      borderRadius: 12,
      display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
    }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: compact ? 110 : 150 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: T.text }}>
          📚 {versions.length} 版文案
        </span>
        {!compact && (
          <span style={{ fontSize: 10.5, color: T.muted2 }}>
            当前: 第 {activeVersionIdx + 1} 版 · {active?.mode_label || "未命名"}
          </span>
        )}
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", flex: 1 }}>
        {versions.map((v, i) => {
          const on = i === activeVersionIdx;
          const label = (v.mode_label || `第 ${i + 1} 版`).replace(/^结合业务\s*/, "").replace(/^纯改写\s*/, "");
          return (
            <button key={i} onClick={() => onSwitchVersion(i)}
              title={`角度: ${v.angle?.label || ""} · ${new Date(v.ts || Date.now()).toLocaleTimeString().slice(0, 5)}`}
              style={{
                padding: compact ? "5px 10px" : "7px 12px",
                fontSize: compact ? 11.5 : 12,
                fontFamily: "inherit",
                background: on ? T.brand : "#fff",
                color: on ? "#fff" : T.muted,
                border: `1px solid ${on ? T.brand : T.borderSoft}`,
                borderRadius: 100,
                cursor: "pointer",
                fontWeight: on ? 700 : 600,
                boxShadow: on && !compact ? `0 0 0 3px ${T.brandSoft}` : "none",
              }}>
              第 {i + 1} 版 · {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

Object.assign(window, { PageHotrewrite });
