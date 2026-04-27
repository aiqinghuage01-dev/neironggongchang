// factory-baokuan-v2.jsx — 爆款改写 skill (D-063)
// Skill 源: ~/Desktop/skills/爆款改写-学员版/SKILL.md
// 2 步: 输入原爆款 + 选模式 → 一次跑 analyze + rewrite, 出 DNA 卡 + N 版

const BK_STEPS = [
  { id: "input",  n: 1, label: "贴原爆款 + 选模式" },
  { id: "result", n: 2, label: "DNA 分析 + 多版改写" },
];

// 模式定义 (跟 baokuan_pipeline.py 的 _mode_versions 完全对齐)
const BK_MODES = [
  { id: "pure",     icon: "📝", label: "纯改写 · 2 版",    desc: "换皮版 + 狠劲版 · 不植入业务", recommend: true },
  { id: "business", icon: "🎯", label: "业务钩子 · 2 版",  desc: "翻转版 + 圈人版 · 自然带业务", needsProfile: true },
  { id: "all",      icon: "🔥", label: "全都要 · 4 版",    desc: "纯+业务都要, 一次出 4 版", needsProfile: true },
];

function PageBaokuan({ onNav }) {
  const fm = useFromMake("baokuan");
  const [step, setStep] = React.useState("input");
  const [loading, setLoading] = React.useState(false);
  const [err, setErr] = React.useState("");

  const [text, setText] = React.useState("");
  const [mode, setMode] = React.useState("pure");
  const [industry, setIndustry] = React.useState("");
  const [targetAction, setTargetAction] = React.useState("");

  const [dna, setDna] = React.useState(null);
  const [versions, setVersions] = React.useState([]);
  const [activeVersionIdx, setActiveVersionIdx] = React.useState(0);
  const [taskId, setTaskId] = useTaskPersist("baokuan");  // D-037b5

  const [skillInfo, setSkillInfo] = React.useState(null);
  React.useEffect(() => { api.get("/api/baokuan/skill-info").then(setSkillInfo).catch(() => {}); }, []);

  // D-082b 完整版: 跳页 retry 自动预填
  React.useEffect(() => {
    try {
      const retry = sessionStorage.getItem("retry_payload_baokuan");
      if (retry) {
        const p = JSON.parse(retry);
        const recovered = p.text_preview || p.text || p.prompt_preview;
        if (recovered && !text) { setText(recovered); }
        if (p.industry && !industry) { setIndustry(p.industry); }
        sessionStorage.removeItem("retry_payload_baokuan");
      }
    } catch (_) {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // D-037b5: 轮询 rewrite 任务状态
  const poller = useTaskPoller(taskId, {
    onComplete: (r) => {
      if (r?.error) { setErr(r.error); }
      setVersions(r?.versions || []);
      setActiveVersionIdx(0);
      setTaskId(null);
    },
    onError: (e) => { setErr(e || "改写失败"); /* 留 taskId 让 FailedRetry 渲染 */ },
  });

  // 检测 make 那边丢的 baokuan_seed_text, 自动填 textarea
  // ⚠ 同 voicerewrite/hotrewrite: 必须同步删 wf snap, 防 D-016 restore 覆盖
  // task #1 留: 如果 baokuan_seed_auto_analyze=1, 自动触发 analyze (一键到 V1/V2)
  const autoAnalyzeRef = React.useRef(false);
  React.useEffect(() => {
    try {
      const seed = localStorage.getItem("baokuan_seed_text");
      if (seed && !text) {
        setText(seed);
        localStorage.removeItem("baokuan_seed_text");
        localStorage.removeItem("wf:baokuan");
        if (localStorage.getItem("baokuan_seed_auto_analyze") === "1") {
          localStorage.removeItem("baokuan_seed_auto_analyze");
          autoAnalyzeRef.current = true;
        }
      }
    } catch (_) {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // text 从 seed 设入后, 如果 autoAnalyzeRef = true, 自动跑 analyze (默认 pure 模式不需要画像)
  React.useEffect(() => {
    if (autoAnalyzeRef.current && text && step === "input" && !loading) {
      autoAnalyzeRef.current = false;
      doRewrite();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  async function doRewrite() {
    if (!text.trim()) return;
    const m = BK_MODES.find(x => x.id === mode);
    if (m?.needsProfile && (!industry.trim() || !targetAction.trim())) {
      setErr(`选了"${m.label}"模式, 需要填"行业"和"转化动作" (例: 餐饮老板 + 加微信)`);
      return;
    }
    setLoading(true); setErr(""); setDna(null); setVersions([]); setTaskId(null);
    try {
      // analyze 同步 (5-7s) — 先出 DNA, 立即可显示
      const a = await api.post("/api/baokuan/analyze", { text: text.trim() });
      setDna(a.dna || null);
      setStep("result");
      // rewrite 异步 (D-037b5) — 立即拿 task_id, useTaskPoller 监听
      const r = await api.post("/api/baokuan/rewrite", {
        text: text.trim(), mode,
        industry: industry.trim(), target_action: targetAction.trim(),
        dna: a.dna || {},
      });
      setTaskId(r.task_id);
    } catch (e) {
      setErr(e.message);
      setStep("input");
    } finally {
      setLoading(false);
    }
  }

  function retry() {
    setErr(""); setVersions([]); setTaskId(null);
    doRewrite();
  }

  function reset() {
    setStep("input"); setErr("");
    setText(""); setDna(null); setVersions([]); setActiveVersionIdx(0); setTaskId(null);
    clearWorkflow("baokuan");
  }

  // 工作流持久化 (D-016 + D-037b5 加 taskId)
  const wfState = { step, text, mode, industry, targetAction, dna, versions, activeVersionIdx, taskId };
  const wfRestore = (s) => {
    if (s.text != null) setText(s.text);
    if (s.mode) setMode(s.mode);
    if (s.industry != null) setIndustry(s.industry);
    if (s.targetAction != null) setTargetAction(s.targetAction);
    if (s.dna) setDna(s.dna);
    if (s.versions) setVersions(s.versions);
    if (typeof s.activeVersionIdx === "number") setActiveVersionIdx(s.activeVersionIdx);
    if (s.taskId) setTaskId(s.taskId);
    if (s.step) setStep(s.step);
  };
  const wf = useWorkflowPersist({ ns: "baokuan", state: wfState, onRestore: wfRestore });

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", background: T.bg, position: "relative", overflow: "hidden" }}>
      <BkHeader current={step} onBack={() => onNav("home")} skillInfo={skillInfo} />
      <div style={{ flex: 1, overflow: "auto" }}>
        <div style={{ maxWidth: 820, margin: "16px auto 0" }}>
          <FromMakeBanner fromMake={fm.fromMake} dismiss={fm.dismiss}
            label="改写完点页底「做成视频」就回到做视频流程, 接着合成" />
        </div>
        <WfRestoreBanner show={wf.hasSnapshot} onDismiss={wf.dismissSnapshot}
          onClear={() => { reset(); wf.dismissSnapshot(); }}
          label="爆款改写工作流" />
        {/* D-086: 走全站 InlineError */}
        {err && <InlineError err={err} />}
        {step === "input" && (
          <BkStepInput
            text={text} setText={setText}
            mode={mode} setMode={setMode}
            industry={industry} setIndustry={setIndustry}
            targetAction={targetAction} setTargetAction={setTargetAction}
            onGo={doRewrite} loading={loading}
          />
        )}
        {step === "result" && (
          poller.isRunning ? (
            <React.Fragment>
              {dna && <BkDnaCard dna={dna} />}
              <LoadingProgress
                task={poller.task}
                icon="💥"
                title="小华正在改写爆款..."
                subtitle={`${BK_MODES.find(m => m.id === mode)?.label || mode} · ${text.length} 字`}
                onCancel={() => { poller.cancel(); setStep("input"); }}
              />
            </React.Fragment>
          ) : poller.isFailed || poller.isCancelled ? (
            <FailedRetry
              error={poller.error || err}
              onRetry={retry}
              onEdit={() => { setTaskId(null); setErr(""); setStep("input"); }}
              icon="💥"
              title={poller.isCancelled ? "任务已取消" : "这次没改写出来"}
            />
          ) : (
            <BkStepResult
              dna={dna} versions={versions} loading={false}
              activeVersionIdx={activeVersionIdx} setActiveVersionIdx={setActiveVersionIdx}
              onPrev={() => setStep("input")} onReset={reset} onNav={onNav}
            />
          )
        )}
      </div>
    </div>
  );
}

function BkHeader({ current, onBack, skillInfo }) {
  return (
    <div style={{ padding: "12px 24px", background: "#fff", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 14, flexShrink: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ width: 26, height: 26, borderRadius: 7, background: T.text, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13 }}>✍️</div>
        <div style={{ fontSize: 13.5, fontWeight: 600 }}>爆款改写 · 2 步</div>
        {skillInfo && (
          <span title={`~/Desktop/skills/${skillInfo.slug}/`}
            style={{ fontSize: 10.5, color: T.brand, background: T.brandSoft, padding: "2px 8px", borderRadius: 100, marginLeft: 6 }}>
            用技能:{skillInfo.slug}
          </span>
        )}
      </div>
      <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, marginLeft: 8 }}>
        {BK_STEPS.map((s, i) => {
          const active = s.id === current;
          const done = BK_STEPS.findIndex(x => x.id === current) > i;
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
              {i < BK_STEPS.length - 1 && <span style={{ color: T.muted3 }}>—</span>}
            </React.Fragment>
          );
        })}
      </div>
      <ApiStatusLight />
      <button onClick={onBack} style={{ background: "transparent", border: "none", color: T.muted, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>← 返回</button>
    </div>
  );
}

// ─── Step 1 · 输入 + 选模式 + (业务模式) 填画像 ────────────────

function BkStepInput({ text, setText, mode, setMode, industry, setIndustry, targetAction, setTargetAction, onGo, loading }) {
  const ready = !!text.trim() && !loading;
  const len = text.length;
  const m = BK_MODES.find(x => x.id === mode);
  const needsProfile = !!m?.needsProfile;

  return (
    <div style={{ padding: "40px 40px 60px", maxWidth: 820, margin: "0 auto" }}>
      <div style={{ textAlign: "center", marginBottom: 24 }}>
        <div style={{ fontSize: 30, fontWeight: 700, color: T.text, marginBottom: 8, letterSpacing: "-0.02em" }}>哪条爆款想改? ✍️</div>
        <div style={{ fontSize: 14, color: T.muted, lineHeight: 1.6 }}>整段贴进来 · 前 5 秒不动 · 换说法不换意思 · 出可念稿的版本</div>
      </div>

      {/* 大输入框 (跟 voicerewrite/hotrewrite 一致) */}
      <div style={{ background: "#fff", border: `1.5px solid ${T.brand}`, boxShadow: `0 0 0 5px ${T.brandSoft}`, borderRadius: 16, padding: 18, marginBottom: 18 }}>
        <textarea rows={12} value={text} onChange={e => setText(e.target.value)}
          placeholder="把别人的爆款文案整段贴这里, 至少 100 字, 300 字以上效果更好..."
          style={{ width: "100%", padding: 12, border: "none", outline: "none", background: "transparent", fontSize: 14, fontFamily: "inherit", resize: "vertical", lineHeight: 1.7, color: T.text, minHeight: 200 }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12, paddingTop: 14, borderTop: `1px solid ${T.borderSoft}` }}>
          {len > 0 ? (
            <>
              <Tag size="xs" color="gray">{len} 字</Tag>
              {len < 100 && <span style={{ fontSize: 11, color: T.amber }}>字数偏短 · 100+ 字效果更好</span>}
              {len >= 100 && <span style={{ fontSize: 11, color: T.muted2 }}>· 前 5 秒不动 · 不加广告 (纯改写) · 不带 AI 味</span>}
            </>
          ) : (
            <span style={{ fontSize: 12, color: T.muted2 }}>✨ 贴完选下面模式, 一键出版本</span>
          )}
        </div>
      </div>

      {/* 模式选 (radio 风格大卡) */}
      <div style={{ marginBottom: needsProfile ? 14 : 18 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: T.text, marginBottom: 10 }}>选改写模式</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
          {BK_MODES.map(x => {
            const on = mode === x.id;
            return (
              <label key={x.id} onClick={() => setMode(x.id)} style={{
                padding: "14px 14px", borderRadius: 12, cursor: "pointer",
                background: on ? "#fff" : "transparent",
                border: `1.5px solid ${on ? T.brand : T.muted3}`,
                boxShadow: on ? `0 0 0 4px ${T.brandSoft}` : "none",
                display: "flex", flexDirection: "column", gap: 6,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{
                    width: 18, height: 18, borderRadius: "50%",
                    border: `1.5px solid ${on ? T.brand : T.muted2}`,
                    background: on ? T.brand : "transparent", flexShrink: 0,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    {on && <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#fff" }} />}
                  </div>
                  <span style={{ fontSize: 18 }}>{x.icon}</span>
                  <span style={{ fontSize: 13.5, fontWeight: 600, color: T.text }}>{x.label}</span>
                  {x.recommend && <Tag size="xs" color="green">推荐</Tag>}
                </div>
                <div style={{ fontSize: 11.5, color: T.muted, lineHeight: 1.5, paddingLeft: 26 }}>{x.desc}</div>
              </label>
            );
          })}
        </div>
      </div>

      {/* 画像 (业务/全都要 才显) */}
      {needsProfile && (
        <div style={{ background: "#fff", border: `1px solid ${T.borderSoft}`, borderRadius: 12, padding: 14, marginBottom: 18 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: T.text, marginBottom: 10 }}>
            🎯 业务画像 <span style={{ color: T.muted2, fontWeight: 400, fontSize: 11 }}>(业务钩子版必填 · 不然结尾植入会硬接)</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <input value={industry} onChange={e => setIndustry(e.target.value)}
              placeholder="行业 (例: 餐饮老板 / 大健康)"
              style={{ padding: "9px 12px", border: `1px solid ${T.borderSoft}`, borderRadius: 8, fontSize: 13, fontFamily: "inherit", outline: "none" }} />
            <input value={targetAction} onChange={e => setTargetAction(e.target.value)}
              placeholder="转化动作 (例: 加微信 / 到店 / 留资)"
              style={{ padding: "9px 12px", border: `1px solid ${T.borderSoft}`, borderRadius: 8, fontSize: 13, fontFamily: "inherit", outline: "none" }} />
          </div>
        </div>
      )}

      {/* 提交按钮 */}
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button onClick={onGo} disabled={!ready} style={{
          padding: "10px 24px", fontSize: 14, fontWeight: 600,
          background: ready ? T.brand : T.muted3, color: "#fff", border: "none",
          borderRadius: 100, cursor: ready ? "pointer" : "not-allowed", fontFamily: "inherit",
          boxShadow: ready ? `0 4px 12px ${T.brand}40` : "none",
        }}>
          {loading ? "改写中..." : "✨ 分析爆款基因 + 改写"}
        </button>
      </div>
    </div>
  );
}

// ─── BkVersionCard (D-037 主次反转: 多版网格中的单版卡) ────────
function BkVersionCard({ version, onMakeVideo }) {
  const [copied, setCopied] = React.useState(false);
  function copy() {
    if (!version?.content) return;
    try { navigator.clipboard.writeText(version.content); } catch (_) {}
    setCopied(true); setTimeout(() => setCopied(false), 1500);
  }
  return (
    <div style={{
      background: "#fff", border: `1.5px solid ${T.brand}`, borderRadius: 14,
      padding: 16, boxShadow: `0 0 0 4px ${T.brandSoft}`,
      display: "flex", flexDirection: "column",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, paddingBottom: 10, borderBottom: `1px dashed ${T.borderSoft}` }}>
        <span style={{ fontSize: 11.5, padding: "3px 8px", borderRadius: 4, background: T.brandSoft, color: T.brand, fontWeight: 600 }}>
          {version.key}
        </span>
        <span style={{ fontSize: 13, fontWeight: 600, color: T.text, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {version.label}
        </span>
        <Tag size="xs" color="gray">{version.word_count || 0} 字</Tag>
        <button onClick={copy} style={{
          padding: "4px 10px", fontSize: 11.5, background: copied ? T.brandSoft : "#fff",
          border: `1px solid ${copied ? T.brand : T.border}`, borderRadius: 6,
          color: copied ? T.brand : T.muted, cursor: "pointer", fontFamily: "inherit", fontWeight: 500,
        }}>{copied ? "✓ 已复制" : "📋 复制"}</button>
      </div>
      <div style={{
        background: T.bg2, border: `1px solid ${T.borderSoft}`, borderRadius: 8,
        padding: "12px 14px", fontSize: 13, lineHeight: 1.85, color: T.text,
        whiteSpace: "pre-wrap", fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace",
        maxHeight: 360, overflow: "auto", flex: 1,
      }}>{version.content || "(空)"}</div>
      {onMakeVideo && (
        <button onClick={onMakeVideo} style={{
          marginTop: 10, padding: "8px 14px", fontSize: 13, fontWeight: 500,
          background: T.brand, color: "#fff", border: "none",
          borderRadius: 8, cursor: "pointer", fontFamily: "inherit",
        }}>🎬 用这版做成视频 →</button>
      )}
    </div>
  );
}

// ─── DNA 卡 (D-037b5 提出来共享: rewrite 异步跑时也能先显示) ────

function BkDnaCard({ dna }) {
  if (!dna) return null;
  return (
    <div style={{ maxWidth: 820, margin: "20px auto 16px", padding: "0 40px" }}>
      <div style={{ background: "#fff", border: `1px solid ${T.brand}33`, borderLeft: `4px solid ${T.brand}`, borderRadius: 12, padding: "14px 18px" }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: T.brand, marginBottom: 8 }}>💡 爆款基因分析</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12.5, color: T.text, lineHeight: 1.6 }}>
          <div><span style={{ color: T.muted2 }}>为什么火 · </span>{dna.why_hot || "(空)"}</div>
          <div><span style={{ color: T.muted2 }}>情绪钩子 · </span>{dna.emotion_hook || "(空)"}</div>
          <div><span style={{ color: T.muted2 }}>结构节奏 · </span>{dna.structure || "(空)"}</div>
        </div>
      </div>
    </div>
  );
}

// ─── Step 2 · 结果 (DNA 卡 + 多版 tab) ────────────────────

function BkStepResult({ dna, versions, loading, activeVersionIdx, setActiveVersionIdx, onPrev, onReset, onNav }) {
  // D-037 主次反转 (2026-04-26): 多版从 tab 改成网格并排, N 版同框对比拷贝
  return (
    <div style={{ padding: "32px 40px 60px", maxWidth: 1280, margin: "0 auto" }}>
      {/* DNA 卡 (顶部薄薄一条, 80px) */}
      {dna && (
        <div style={{ background: "#fff", border: `1px solid ${T.brand}33`, borderLeft: `4px solid ${T.brand}`, borderRadius: 12, padding: "14px 18px", marginBottom: 16 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: T.brand, marginBottom: 8 }}>💡 爆款基因分析</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12.5, color: T.text, lineHeight: 1.6 }}>
            <div><span style={{ color: T.muted2 }}>为什么火 · </span>{dna.why_hot || "(空)"}</div>
            <div><span style={{ color: T.muted2 }}>情绪钩子 · </span>{dna.emotion_hook || "(空)"}</div>
            <div><span style={{ color: T.muted2 }}>结构节奏 · </span>{dna.structure || "(空)"}</div>
          </div>
        </div>
      )}

      {!dna && loading && (
        <div style={{ background: T.bg2, border: `1px dashed ${T.border}`, borderRadius: 12, padding: 24, textAlign: "center", color: T.muted, fontSize: 13, marginBottom: 16 }}>
          🔍 正在分析爆款基因...
        </div>
      )}

      {/* 多版网格并排 (替代 tab 切换). 1 版全宽 / 2-4 版 auto-fit 双列 */}
      {versions.length > 0 && (
        <div style={{
          display: "grid",
          gridTemplateColumns: versions.length === 1 ? "1fr" : "repeat(auto-fit, minmax(420px, 1fr))",
          gap: 16, marginBottom: 16,
        }}>
          {versions.map((v, i) => <BkVersionCard key={v.gen_id || i} version={v} onMakeVideo={onNav ? () => {
            try {
              localStorage.setItem("make_v2_seed_script", v.content);
              localStorage.setItem("make_v2_seed_from", JSON.stringify({
                skill: "baokuan", title: `${v.key} · ${v.label}`, ts: Date.now(),
              }));
            } catch (_) {}
            onNav("make");
          } : null} />)}
        </div>
      )}

      {!loading && versions.length === 0 && (
        <div style={{ background: T.bg2, border: `1px dashed ${T.border}`, borderRadius: 12, padding: 32, textAlign: "center", color: T.muted, fontSize: 13 }}>
          没生成版本 · 回上一步重试
        </div>
      )}

      {/* 完成态 CTA (做视频按钮挪到每张卡内, 这里只剩导航) */}
      {versions.length > 0 && !loading && (
        <div style={{ display: "flex", gap: 10, marginTop: 18, alignItems: "center", flexWrap: "wrap" }}>
          <Btn variant="outline" onClick={onPrev}>← 改输入或换模式</Btn>
          <Btn variant="ghost" onClick={onReset}>🔄 清空重来</Btn>
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 12, color: T.muted2 }}>💡 每张卡都能独立"做视频" / "复制"</span>
        </div>
      )}
    </div>
  );
}
