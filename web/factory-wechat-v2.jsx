// factory-wechat-v2.jsx — 公众号 skill 全链路 GUI (D-010)
// Skill 源: ~/Desktop/skills/公众号文章/
// 8 步: 选题 → 3标题挑 → 大纲确认 → 长文+自检 → 段间配图 → HTML → 封面 → 推送草稿箱
//
// 覆盖 factory-article.jsx 的 PageWechat(在 index.html 里加载顺序靠后)

const WX_STEPS = [
  { id: "topic",    n: 1, label: "选题" },
  { id: "titles",   n: 2, label: "挑标题" },
  { id: "outline",  n: 3, label: "确认大纲" },
  { id: "write",    n: 4, label: "写长文" },
  { id: "images",   n: 5, label: "段间配图" },
  { id: "html",     n: 6, label: "HTML" },
  { id: "cover",    n: 7, label: "封面" },
  { id: "push",     n: 8, label: "推送" },
];

function PageWechat({ onNav }) {
  const [step, setStep] = React.useState("topic");
  const [loading, setLoading] = React.useState(false);
  const [err, setErr] = React.useState("");

  // 全流程状态
  const [topic, setTopic] = React.useState("");
  const [titles, setTitles] = React.useState([]);
  const [pickedTitle, setPickedTitle] = React.useState("");
  const [outline, setOutline] = React.useState(null);
  const [article, setArticle] = React.useState(null);
  const [imagePlans, setImagePlans] = React.useState([]);
  const [htmlResult, setHtmlResult] = React.useState(null);
  const [coverResult, setCoverResult] = React.useState(null);
  const [pushResult, setPushResult] = React.useState(null);

  // 全自动模式(P0): 挑完标题后串行跑完剩余 6 步到封面,最后一步推送仍要用户手点
  const [autoMode, setAutoMode] = React.useState(false);
  const [skipImages, setSkipImages] = React.useState(false);
  const [autoSteps, setAutoSteps] = React.useState([]);  // [{key, label, status, err, elapsed_sec}]

  // skill meta (顶栏显示 "正在用技能:公众号文章")
  const [skillInfo, setSkillInfo] = React.useState(null);
  React.useEffect(() => { api.get("/api/wechat/skill-info").then(setSkillInfo).catch(() => {}); }, []);

  // 统一模式: 立即跳 step + 清空目标数据 + loading=true, API 失败时 step 回退
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

  function genTitles() {
    if (!topic.trim()) return;
    return runStep({
      nextStep: "titles", rollbackStep: "topic", clearSetter: () => setTitles([]),
      apiCall: async () => {
        const r = await api.post("/api/wechat/titles", { topic: topic.trim(), n: 3 });
        setTitles(r.titles || []);
      },
    });
  }

  function genOutline(title) {
    setPickedTitle(title);
    if (autoMode) {
      // 全自动模式:挑完标题直接进入 auto pipeline
      return runAutoPipeline(title);
    }
    return runStep({
      nextStep: "outline", rollbackStep: "titles", clearSetter: setOutline,
      apiCall: async () => {
        const r = await api.post("/api/wechat/outline", { topic: topic.trim(), title });
        setOutline(r);
      },
    });
  }

  // ─── 全自动 pipeline (P0) ─────────────────────────────────
  // 串行跑: outline → write → plan-images → 4×section-image → html → cover
  // 结果用局部变量传递,避开 React state 闭包问题
  // 末态停在 Step 7 cover,推送仍需用户手点
  async function runAutoPipeline(title) {
    const plan = makeAutoPlan(skipImages);
    setAutoSteps(plan);
    setStep("auto");
    setErr("");

    const update = (key, patch) => setAutoSteps(prev => prev.map(s => s.key === key ? { ...s, ...patch } : s));

    const runStep_ = async (key, fn) => {
      const t0 = Date.now();
      update(key, { status: "running", _startedAt: t0 });
      try {
        const r = await fn();
        update(key, { status: "done", elapsed_sec: Math.round((Date.now() - t0) / 1000) });
        return r;
      } catch (e) {
        update(key, { status: "failed", err: e.message, elapsed_sec: Math.round((Date.now() - t0) / 1000) });
        throw e;
      }
    };

    try {
      const outlineR = await runStep_("outline", async () => {
        const r = await api.post("/api/wechat/outline", { topic: topic.trim(), title });
        setOutline(r); return r;
      });
      const writeR = await runStep_("write", async () => {
        const r = await api.post("/api/wechat/write", { topic: topic.trim(), title, outline: outlineR });
        setArticle(r); return r;
      });

      let finalPlans = [];
      if (!skipImages) {
        const planR = await runStep_("plan", async () => {
          const r = await api.post("/api/wechat/plan-images", { content: writeR.content, title, n: 4 });
          const p = (r.plans || []).map(x => ({ ...x, status: "pending", mmbiz_url: null }));
          setImagePlans(p); return p;
        });
        finalPlans = [...planR];
        for (let i = 0; i < finalPlans.length; i++) {
          const key = `img${i + 1}`;
          try {
            const imgR = await runStep_(key, async () => {
              return await api.post("/api/wechat/section-image", { prompt: finalPlans[i].image_prompt, size: "16:9" });
            });
            finalPlans[i] = { ...finalPlans[i], status: "done", mmbiz_url: imgR.mmbiz_url, media_url: imgR.media_url, elapsed_sec: imgR.elapsed_sec };
            setImagePlans([...finalPlans]);
          } catch (_) {
            // 单张失败不中断整个流程,继续下一张
            finalPlans[i] = { ...finalPlans[i], status: "failed" };
            setImagePlans([...finalPlans]);
          }
        }
      }

      const section_images = finalPlans.filter(p => p.mmbiz_url).map(p => ({ mmbiz_url: p.mmbiz_url }));
      await runStep_("html", async () => {
        const r = await api.post("/api/wechat/html", {
          title, content_md: writeR.content, section_images, hero_highlight: title.slice(0, 6),
        });
        setHtmlResult(r); return r;
      });
      await runStep_("cover", async () => {
        const r = await api.post("/api/wechat/cover", { title, label: "清华哥说" });
        setCoverResult(r); return r;
      });

      // 全部成功 → 退出 auto,停在 Step 7 封面
      setAutoMode(false);
      setStep("cover");
    } catch (e) {
      setErr(e.message);
      // 不退出 autoMode,用户能看到 WxAutoProgress 里挂在哪一步
    }
  }

  function makeAutoPlan(skipImg) {
    const base = [
      { key: "outline", label: "出大纲", sub: "读方法论 7 步骨架", eta: 5 },
      { key: "write",   label: "写长文 + 三层自检", sub: "2000-3000 字 · Opus 30-60s,慢但质量优", eta: 60 },
    ];
    if (!skipImg) {
      base.push({ key: "plan", label: "规划 4 张段间配图 prompt", sub: "具象画面 · 16:9", eta: 5 });
      for (let i = 1; i <= 4; i++) {
        base.push({ key: `img${i}`, label: `生图 #${i}`, sub: "apimart gpt-image-2 + 上传微信图床 · 约 30-60s", eta: 40 });
      }
    }
    base.push({ key: "html", label: "拼 V3 Clean HTML + 转微信 markup", sub: "premailer 内联 + section/span-leaf", eta: 2 });
    base.push({ key: "cover", label: "生封面 900×383", sub: "Chrome headless 截图", eta: 6 });
    return base.map(s => ({ ...s, status: "pending" }));
  }

  function abortAuto() {
    // 回退到 Step 2 让用户手动走,已生成的 outline/article 保留
    setAutoMode(false);
    setAutoSteps([]);
    setStep(article ? "write" : outline ? "outline" : "titles");
  }

  function writeArticle() {
    return runStep({
      nextStep: "write", rollbackStep: "outline", clearSetter: setArticle,
      apiCall: async () => {
        const r = await api.post("/api/wechat/write", { topic: topic.trim(), title: pickedTitle, outline });
        setArticle(r);
      },
    });
  }

  // D-036 ③ 局部重写 · selected 段调 AI 重写,只换那段
  async function rewriteSelection(selected, instruction) {
    if (!article || !selected) return null;
    setErr("");
    try {
      const r = await api.post("/api/wechat/rewrite-section", {
        full_article: article.content,
        selected, instruction: instruction || "",
      });
      if (r.new_full) {
        setArticle({ ...article, content: r.new_full, word_count: r.new_full.length });
      }
      return r;
    } catch (e) {
      setErr(e.message);
      return null;
    }
  }

  function planImages() {
    return runStep({
      nextStep: "images", rollbackStep: "write", clearSetter: () => setImagePlans([]),
      apiCall: async () => {
        const r = await api.post("/api/wechat/plan-images", { content: article.content, title: pickedTitle, n: 4 });
        setImagePlans((r.plans || []).map(p => ({ ...p, status: "pending", mmbiz_url: null })));
      },
    });
  }

  async function generateOneImage(idx) {
    const plan = imagePlans[idx];
    setImagePlans(prev => prev.map((p, i) => i === idx ? { ...p, status: "running" } : p));
    try {
      const r = await api.post("/api/wechat/section-image", { prompt: plan.image_prompt, size: "16:9" });
      setImagePlans(prev => prev.map((p, i) => i === idx ? { ...p, status: "done", mmbiz_url: r.mmbiz_url, media_url: r.media_url, elapsed_sec: r.elapsed_sec } : p));
    } catch (e) {
      setImagePlans(prev => prev.map((p, i) => i === idx ? { ...p, status: "failed", error: e.message } : p));
    }
  }

  function assembleHtml(templateName) {
    // D-034: 接受 template 参数 · undefined 走默认 v3-clean
    // D-041: 防御式取值 — 直接 onClick={assembleHtml} 时 templateName=SyntheticEvent (HTMLButtonElement),
    //        会被塞进 request body 引发 "Converting circular structure to JSON" 崩溃
    const tpl = (typeof templateName === "string" && templateName)
      ? templateName
      : (htmlResult?.template || "v3-clean");
    const section_images = imagePlans.filter(p => p.mmbiz_url).map(p => ({ mmbiz_url: p.mmbiz_url }));
    return runStep({
      nextStep: "html", rollbackStep: "images", clearSetter: setHtmlResult,
      apiCall: async () => {
        const r = await api.post("/api/wechat/html", {
          title: pickedTitle,
          content_md: article.content,
          section_images,
          hero_highlight: pickedTitle.slice(0, 6),
          template: tpl,
        });
        setHtmlResult({ ...r, template: tpl });
      },
    });
  }

  function genCover() {
    // D-035: 默认 n=4 走 apimart 4 张候选
    return runStep({
      nextStep: "cover", rollbackStep: "html", clearSetter: setCoverResult,
      apiCall: async () => {
        const r = await api.post("/api/wechat/cover", { title: pickedTitle, n: 4 });
        // 自动选第一张已成功的
        const firstOk = (r.covers || []).find(c => c.local_path);
        setCoverResult({ ...r, selected_index: firstOk ? firstOk.index : 0 });
      },
    });
  }

  function selectCover(idx) {
    setCoverResult(prev => prev ? { ...prev, selected_index: idx } : prev);
  }

  function push() {
    if (!htmlResult) { setErr("HTML 还没生成,先回去拼一下"); return; }
    if (!coverResult) { setErr("封面还没生成,回去先生 4 张"); return; }
    // 从 covers 数组挑选中的那张
    let coverPath = "";
    if (Array.isArray(coverResult.covers)) {
      const selected = coverResult.covers[coverResult.selected_index ?? 0];
      coverPath = selected?.local_path || "";
    } else {
      coverPath = coverResult.local_path_served || coverResult.local_path || "";
    }
    if (!coverPath) {
      setErr("没有可推送的封面文件 (旧版数据不可信),点 🔄 再来 4 张重生");
      setStep("cover");  // 自动跳回封面页给用户重生
      return;
    }
    if (!htmlResult.wechat_html_path) {
      setErr("HTML 路径丢失,回去重新拼 HTML"); setStep("html"); return;
    }
    return runStep({
      nextStep: "push", rollbackStep: "cover", clearSetter: setPushResult,
      apiCall: async () => {
        const r = await api.post("/api/wechat/push", {
          title: pickedTitle,
          digest: htmlResult.digest || "",
          html_path: htmlResult.wechat_html_path,
          cover_path: coverPath,
          author: "清华哥",
        });
        setPushResult(r);
      },
    });
  }

  function reset() {
    setStep("topic"); setErr("");
    setTitles([]); setPickedTitle("");
    setOutline(null); setArticle(null);
    setImagePlans([]); setHtmlResult(null);
    setCoverResult(null); setPushResult(null);
    setAutoMode(false); setAutoSteps([]);
    clearWorkflow("wechat");
  }

  // ─── 工作流持久化 (D-016) · 刷新浏览器不丢中间态 ───────
  const wfState = { step, topic, titles, pickedTitle, outline, article, imagePlans, htmlResult, coverResult, pushResult, autoMode, skipImages, autoSteps };
  const wfRestore = (s) => {
    if (s.step) setStep(s.step === "auto" ? "topic" : s.step); // auto step 挂起不恢复(重跑成本高),回落到 topic
    if (s.topic != null) setTopic(s.topic);
    if (s.titles) setTitles(s.titles);
    if (s.pickedTitle != null) setPickedTitle(s.pickedTitle);
    if (s.outline) setOutline(s.outline);
    if (s.article) setArticle(s.article);
    if (s.imagePlans) setImagePlans(s.imagePlans);
    if (s.htmlResult) setHtmlResult(s.htmlResult);
    // D-038 修复: 旧版 coverResult(无 covers 数组,Chrome 单张模板)的字段已不可信
    // (local_path 文件可能已删/迁移),恢复时直接丢掉,让用户重生 4 张
    if (s.coverResult && Array.isArray(s.coverResult.covers)) {
      setCoverResult(s.coverResult);
    }
    if (s.pushResult) setPushResult(s.pushResult);
    // autoMode/autoSteps 不恢复 · pipeline 不能续跑
    if (s.skipImages != null) setSkipImages(s.skipImages);
  };
  const wf = useWorkflowPersist({ ns: "wechat", state: wfState, onRestore: wfRestore });

  function startAuto() {
    if (!topic.trim()) return;
    setAutoMode(true);
    return genTitles();  // 走常规出标题 → Step 2 让用户挑 → onPick 检测 autoMode 后进 runAutoPipeline
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", background: T.bg, position: "relative", overflow: "hidden" }}>
      <WxHeader current={step} onBack={() => onNav("home")} skillInfo={skillInfo} autoMode={autoMode}
        onJump={(stepId) => { if (!loading && !autoMode) { setErr(""); setStep(stepId); } }} />
      <div style={{ flex: 1, overflow: "auto" }}>
        <WfRestoreBanner show={wf.hasSnapshot} onDismiss={wf.dismissSnapshot}
          onClear={() => { reset(); wf.dismissSnapshot(); }}
          label="公众号工作流" />
        {err && (
          <div style={{ maxWidth: 820, margin: "16px auto 0", padding: 12, background: T.redSoft, color: T.red, borderRadius: 10, fontSize: 13 }}>
            ⚠️ {err}
          </div>
        )}
        {step === "auto"    && <WxAutoProgress steps={autoSteps} title={pickedTitle} err={err} onAbort={abortAuto} skipImages={skipImages} />}
        {step === "topic"   && <WxStepTopic topic={topic} setTopic={setTopic} onGo={genTitles} onAuto={startAuto} loading={loading} skillInfo={skillInfo} skipImages={skipImages} setSkipImages={setSkipImages} />}
        {step === "titles"  && <WxStepTitles titles={titles} loading={loading} onPick={genOutline} onPrev={() => setStep("topic")} onRegen={genTitles} autoMode={autoMode} />}
        {step === "outline" && <WxStepOutline outline={outline} setOutline={setOutline} title={pickedTitle} topic={topic} loading={loading} onPrev={() => setStep("titles")} onNext={writeArticle} onRegen={() => genOutline(pickedTitle)} />}
        {step === "write"   && <WxStepWrite article={article} loading={loading} onPrev={() => setStep("outline")} onNext={planImages} onRewrite={writeArticle} onRewriteSelection={rewriteSelection} onNav={onNav} pickedTitle={pickedTitle} topic={topic} />}
        {step === "images"  && <WxStepImages plans={imagePlans} setPlans={setImagePlans} onGen={generateOneImage} loading={loading} onPrev={() => setStep("write")} onNext={() => assembleHtml()} onRegen={planImages} />}
        {step === "html"    && <WxStepHtml result={htmlResult} loading={loading} onPrev={() => setStep("images")} onNext={genCover} onSwitchTemplate={assembleHtml} />}
        {step === "cover"   && <WxStepCover cover={coverResult} title={pickedTitle} loading={loading} onPrev={() => setStep("html")} onNext={push} onRegen={genCover} onSelect={selectCover} />}
        {step === "push"    && <WxStepPush result={pushResult} loading={loading} onPrev={() => setStep("cover")} onReset={reset} onNav={onNav} />}
      </div>
    </div>
  );
}

// ─── 顶栏 ────────────────────────────────────────────────────
function WxHeader({ current, onBack, skillInfo, autoMode, onJump }) {
  return (
    <div style={{ padding: "12px 24px", background: "#fff", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 14, flexShrink: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ width: 26, height: 26, borderRadius: 7, background: T.text, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13 }}>📄</div>
        <div style={{ fontSize: 13.5, fontWeight: 600 }}>公众号 · 8 步全链路</div>
        {autoMode && (
          <span style={{ fontSize: 10.5, color: "#fff", background: T.brand, padding: "2px 8px", borderRadius: 100, marginLeft: 2, fontWeight: 600 }}>
            🚀 全自动中
          </span>
        )}
        {skillInfo && (
          <span title={`~/Desktop/skills/${skillInfo.slug}/ · 精简版 + ${Object.keys(skillInfo.references||{}).length} refs`}
            style={{ fontSize: 10.5, color: T.brand, background: T.brandSoft, padding: "2px 8px", borderRadius: 100, marginLeft: 6 }}>
            用技能:{skillInfo.slug}
          </span>
        )}
      </div>
      <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 4, marginLeft: 8, overflowX: "auto" }}>
        {WX_STEPS.map((s, i) => {
          const active = s.id === current;
          const currentIdx = WX_STEPS.findIndex(x => x.id === current);
          const done = currentIdx > i;
          // D-038: 已完成的 step 可点击跳回(autoMode 不让点 · loading 不让点)
          const clickable = !!onJump && done;
          return (
            <React.Fragment key={s.id}>
              <div
                onClick={clickable ? () => onJump(s.id) : undefined}
                title={clickable ? `跳回「${s.label}」(可改后再往后走)` : undefined}
                style={{
                  display: "flex", alignItems: "center", gap: 4, padding: "3px 8px 3px 4px", borderRadius: 100, fontSize: 11, fontWeight: 500,
                  background: active ? T.text : "transparent",
                  color: active ? "#fff" : done ? T.brand : T.muted,
                  whiteSpace: "nowrap", flexShrink: 0,
                  cursor: clickable ? "pointer" : "default",
                  transition: "all 0.1s",
                }}>
                <div style={{
                  width: 16, height: 16, borderRadius: "50%",
                  background: active ? "#fff" : done ? T.brandSoft : T.bg2,
                  color: active ? T.text : done ? T.brand : T.muted2,
                  display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700,
                }}>{done ? "✓" : s.n}</div>
                {s.label}
              </div>
              {i < WX_STEPS.length - 1 && <span style={{ color: T.muted3, fontSize: 9 }}>—</span>}
            </React.Fragment>
          );
        })}
      </div>
      <ApiStatusLight />
      <button onClick={onBack} style={{ background: "transparent", border: "none", color: T.muted, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>← 返回</button>
    </div>
  );
}

// ─── Step 1 · 选题 ───────────────────────────────────────────
function WxStepTopic({ topic, setTopic, onGo, onAuto, loading, skillInfo, skipImages, setSkipImages }) {
  const ready = !!topic.trim() && !loading;
  return (
    <div style={{ padding: "40px 40px 60px", maxWidth: 720, margin: "0 auto" }}>
      <div style={{ textAlign: "center", marginBottom: 24 }}>
        <div style={{ fontSize: 28, fontWeight: 700, color: T.text, marginBottom: 8, letterSpacing: "-0.02em" }}>今天想写什么选题? 📄</div>
        <div style={{ fontSize: 14, color: T.muted }}>用公众号 skill 的完整 5 Phase · 一路到微信草稿箱</div>
      </div>

      <div style={{ background: "#fff", border: `1.5px solid ${T.brand}`, boxShadow: `0 0 0 5px ${T.brandSoft}`, borderRadius: 16, padding: 18, marginBottom: 14 }}>
        <textarea rows={5} value={topic} onChange={e => setTopic(e.target.value)}
          placeholder="例:AI 时代实体老板的真正护城河 · 或贴一段灵感..."
          style={{ width: "100%", border: "none", outline: "none", background: "transparent", fontSize: 14.5, fontFamily: "inherit", resize: "none", lineHeight: 1.7, color: T.text }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, paddingTop: 12, borderTop: `1px solid ${T.borderSoft}` }}>
          <div style={{ fontSize: 11.5, color: T.muted2 }}>✍️ skill 自带完整人设 + 风格圣经 + 方法论</div>
          <div style={{ flex: 1 }} />
          <button onClick={onGo} disabled={!ready} style={{
            padding: "8px 16px", fontSize: 12.5, fontWeight: 500,
            background: "transparent", color: ready ? T.muted : T.muted3,
            border: `1px solid ${ready ? T.border : T.borderSoft}`, borderRadius: 100,
            cursor: ready ? "pointer" : "not-allowed", fontFamily: "inherit",
          }}>分步 · 先出标题</button>
        </div>
      </div>

      {/* 🚀 全自动入口(P0) - 主推 */}
      <button onClick={onAuto} disabled={!ready} style={{
        width: "100%", padding: "14px 20px", marginBottom: 14,
        background: ready ? `linear-gradient(135deg, ${T.brand}, #1f5638)` : T.muted3,
        color: "#fff", border: "none", borderRadius: 14,
        cursor: ready ? "pointer" : "not-allowed", fontFamily: "inherit",
        fontSize: 15, fontWeight: 600,
        display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
        boxShadow: ready ? `0 4px 16px ${T.brand}44` : "none",
        transition: "all 0.15s",
      }}>
        <span style={{ fontSize: 20 }}>🚀</span>
        <span>全自动到封面 — 一路跑到最后一步让你确认推送</span>
      </button>

      <label style={{
        display: "flex", alignItems: "center", gap: 8, padding: "10px 14px",
        background: skipImages ? T.amberSoft : T.bg2,
        border: `1px solid ${skipImages ? T.amber + "55" : T.borderSoft}`,
        borderRadius: 10, fontSize: 12.5, color: T.muted, cursor: "pointer", marginBottom: 18,
      }}>
        <input type="checkbox" checked={skipImages} onChange={e => setSkipImages(e.target.checked)}
          style={{ margin: 0, accentColor: T.brand, cursor: "pointer" }} />
        <span>跳过段间配图(省 3 分钟 · 但文章无中段插图,推给老板视觉会平)</span>
      </label>

      {skillInfo && (
        <div style={{ padding: 14, background: "#fff", border: `1px solid ${T.borderSoft}`, borderRadius: 10, fontSize: 12, color: T.muted, lineHeight: 1.8 }}>
          <div style={{ fontWeight: 600, color: T.text, marginBottom: 6 }}>skill 资源(事实源)</div>
          <div>SKILL.md · {skillInfo.skill_md_chars} 字符</div>
          {Object.entries(skillInfo.references || {}).map(([k, v]) => (
            <div key={k}>references/{k}.md · {v} 字符</div>
          ))}
          <div style={{ marginTop: 6, color: T.muted2 }}>你在 Obsidian 外的 {skillInfo.root} 改什么,下次调用自动同步。</div>
        </div>
      )}
    </div>
  );
}

// ─── Step 2 · 挑标题 ─────────────────────────────────────────
function WxStepTitles({ titles, loading, onPick, onPrev, onRegen }) {
  const [hoverIdx, setHoverIdx] = React.useState(-1);
  if (loading || titles.length === 0) return <TitlesSkeleton />;
  return (
    <div style={{ padding: "32px 40px 120px", maxWidth: 820, margin: "0 auto" }}>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>挑一个标题 🎯</div>
        <div style={{ fontSize: 13, color: T.muted }}>公众号 80% 打开率靠标题。点一个进入下一步,小华就按这个写。</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {titles.map((t, i) => {
          const hover = hoverIdx === i;
          return (
            <div key={i}
              onClick={() => onPick(t.title)}
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
                <Tag size="xs" color={["pink","blue","purple","amber","green"][i % 5]}>{t.template}</Tag>
                <span style={{ fontSize: 11, color: T.muted2 }}>· {(t.title || "").length} 字</span>
              </div>
              <div style={{ fontSize: 18, fontWeight: 600, color: T.text, lineHeight: 1.5, marginBottom: 10 }}>{t.title}</div>
              <div style={{ fontSize: 12, color: T.muted, background: T.bg2, padding: "6px 10px", borderRadius: 6, lineHeight: 1.6 }}>
                💡 <b>为什么这标题</b> — {t.why}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 18, alignItems: "center" }}>
        <Btn variant="outline" onClick={onPrev}>← 改选题</Btn>
        <Btn onClick={onRegen}>🔄 再出 3 个</Btn>
      </div>
    </div>
  );
}

// ─── Step 3 · 大纲 ───────────────────────────────────────────
function WxStepOutline({ outline, setOutline, title, topic, loading, onPrev, onNext, onRegen }) {
  if (loading || !outline) return <Spinning icon="📐" phases={[
    { text: "小华正在读写作方法论", sub: "references/writing-methodology.md · 7 步骨架" },
    { text: "按你的标题定开场角度", sub: `标题: 「${title}」` },
    { text: "切出 3 个中段核心论点", sub: "每段 300-500 字推进点" },
    { text: "设计业务桥接位置", sub: "6 步序列 · 占比 < 20%" },
    { text: "收尾 · 金句方向", sub: "等下你可以每行改" },
  ]} />;
  if (!outline) return null;

  function update(k, v) { setOutline({ ...outline, [k]: v }); }
  function updatePoint(i, v) {
    const pts = [...(outline.core_points || [])]; pts[i] = v;
    update("core_points", pts);
  }

  return (
    <div style={{ padding: "32px 40px 120px", maxWidth: 820, margin: "0 auto" }}>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>确认大纲 · 再动笔 📐</div>
        <div style={{ fontSize: 13, color: T.muted }}>标题: <b style={{ color: T.text }}>{title}</b></div>
        <div style={{ fontSize: 12, color: T.muted2, marginTop: 4 }}>想改哪行直接改。满意后点"写长文"——skill 的 Phase 2,约 30-60s 出 2000+ 字。</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <OutlineField label="开场切入" value={outline.opening} onChange={v => update("opening", v)} multi />
        <div style={{ padding: 14, background: "#fff", border: `1px solid ${T.borderSoft}`, borderRadius: 12 }}>
          <div style={{ fontSize: 11.5, color: T.muted2, fontWeight: 600, letterSpacing: "0.08em", marginBottom: 8 }}>中段核心论点 · {outline.core_points.length} 条</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {outline.core_points.map((p, i) => (
              <textarea key={i} rows={2} value={p} onChange={e => updatePoint(i, e.target.value)}
                style={{ width: "100%", border: `1px solid ${T.borderSoft}`, borderRadius: 6, padding: 8, fontSize: 13, fontFamily: "inherit", outline: "none", resize: "vertical", color: T.text, lineHeight: 1.7 }} />
            ))}
          </div>
        </div>
        <OutlineField label="业务桥接" value={outline.business_bridge} onChange={v => update("business_bridge", v)} multi />
        <OutlineField label="结尾落点" value={outline.closing} onChange={v => update("closing", v)} multi />
        <div style={{ fontSize: 12, color: T.muted2, textAlign: "right" }}>预估字数: {outline.estimated_words || 2500}</div>
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 18, alignItems: "center" }}>
        <Btn variant="outline" onClick={onPrev}>← 换标题</Btn>
        <Btn onClick={onRegen}>🔄 重出大纲</Btn>
        <div style={{ flex: 1 }} />
        <Btn variant="primary" onClick={onNext}>写长文 → (2000+ 字)</Btn>
      </div>
    </div>
  );
}
function OutlineField({ label, value, onChange, multi }) {
  return (
    <div style={{ padding: 14, background: "#fff", border: `1px solid ${T.borderSoft}`, borderRadius: 12 }}>
      <div style={{ fontSize: 11.5, color: T.muted2, fontWeight: 600, letterSpacing: "0.08em", marginBottom: 8 }}>{label}</div>
      {multi ? (
        <textarea rows={3} value={value || ""} onChange={e => onChange(e.target.value)}
          style={{ width: "100%", border: "none", outline: "none", background: "transparent", fontSize: 13.5, fontFamily: "inherit", resize: "vertical", lineHeight: 1.8, color: T.text }} />
      ) : (
        <input value={value || ""} onChange={e => onChange(e.target.value)}
          style={{ width: "100%", border: "none", outline: "none", background: "transparent", fontSize: 14, fontFamily: "inherit", color: T.text }} />
      )}
    </div>
  );
}

// ─── Step 4 · 长文 + 三层自检 ───────────────────────────────
function WxStepWrite({ article, loading, onPrev, onNext, onRewrite, onRewriteSelection, onNav, pickedTitle, topic }) {
  if (loading || !article) return <Spinning icon="✍️" phases={[
    { text: "读完整人设 + 方法论 + 风格圣经", sub: "who-is-qinghuage + writing-methodology + style-bible · ~7200 token" },
    { text: "铺开场判断", sub: "原则① 先定性再解释 · 避免「不此地无银」" },
    { text: "展开中段 3 条核心论点", sub: "每段 300-500 字 · 带真实细节建画面" },
    { text: "前 40% 完成人设预埋链", sub: "资历 → 阵营 → 双边理解 → 反自夸" },
    { text: "桥接业务 · 6 步序列", sub: "干货在前 → 工具框架化 → 低压 CTA" },
    { text: "金句收尾 · 埋分享钩子", sub: "1-2 处「截图可发朋友圈」的句子" },
    { text: "跑三层自检", sub: "六原则逐段扫 + 六维评分 ≥105 + 一票否决" },
    { text: "长文 2000-3000 字,慢一点,质量优先", sub: "Opus 本地 proxy · 通常 30-60s" },
  ]} />;
  if (!article) return null;
  const sc = article.self_check || {};
  const dims = sc.six_dimensions || {};
  const total = Object.values(dims).reduce((a, b) => a + (b || 0), 0);
  const pr = sc.six_principles || [];
  const passed = pr.filter(p => p.pass).length;
  const veto = sc.one_veto || {};

  const [editing, setEditing] = React.useState(article.content);
  React.useEffect(() => setEditing(article.content), [article.content]);

  // D-036 ③ 局部重写 · selection 监听
  const taRef = React.useRef(null);
  const [selRange, setSelRange] = React.useState({ start: 0, end: 0 });
  const [instruction, setInstruction] = React.useState("");
  const [rewriting, setRewriting] = React.useState(false);
  const selectedText = editing.slice(selRange.start, selRange.end);
  const hasSel = selRange.end > selRange.start && selectedText.trim().length >= 10;

  function captureSel() {
    const ta = taRef.current;
    if (ta) setSelRange({ start: ta.selectionStart, end: ta.selectionEnd });
  }

  async function doRewriteSel() {
    if (!hasSel || rewriting) return;
    setRewriting(true);
    const r = await onRewriteSelection?.(selectedText, instruction);
    setRewriting(false);
    if (r?.new_section) {
      // 替换 editing 中的选中段(用 selRange 而非 indexOf,避免重复字符串误替换)
      const newEdit = editing.slice(0, selRange.start) + r.new_section + editing.slice(selRange.end);
      setEditing(newEdit);
      setSelRange({ start: selRange.start, end: selRange.start + r.new_section.length });
      setInstruction("");
    }
  }

  // 改写指令 chip 快捷
  const QUICK_INSTRUCTIONS = [
    "更犀利", "压短到一半", "拉长 + 加学员故事", "加具体数字",
    "口吻更口语", "去掉营销味", "加反差钩子",
  ];

  return (
    <div style={{ padding: "32px 40px 120px", maxWidth: 1080, margin: "0 auto" }}>
      <div style={{ marginBottom: 16, display: "flex", alignItems: "flex-start", gap: 16 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>{article.title}</div>
          <div style={{ fontSize: 12, color: T.muted }}>{article.word_count} 字 · write {article.tokens?.write} tok · check {article.tokens?.check} tok</div>
        </div>
        <div style={{ padding: 12, background: sc.pass ? T.brandSoft : T.redSoft, border: `1px solid ${sc.pass ? T.brand + "44" : T.red + "44"}`, borderRadius: 10, fontSize: 12, color: sc.pass ? T.brand : T.red, minWidth: 240 }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>📋 三层自检 {sc.pass ? "✅" : "❌"}</div>
          <div>六原则: {passed}/6</div>
          <div>六维评分: {total}/120 {total >= 105 ? "✓" : "(需 ≥105)"}</div>
          <div>一票否决: {veto.triggered ? "触发" : "无"}</div>
        </div>
      </div>

      {pr.some(p => !p.pass) && (
        <div style={{ marginBottom: 14, padding: 12, background: T.amberSoft, border: `1px solid ${T.amber}44`, borderRadius: 10, fontSize: 12, color: T.amber, lineHeight: 1.7 }}>
          <b>不过关的原则:</b>{" "}
          {pr.filter(p => !p.pass).map(p => `${p.name}(${p.issue})`).join(" · ")}
        </div>
      )}

      {/* D-036 ③ 局部重写工具栏 · 选中文字超 10 字才显示 */}
      {hasSel && (
        <div style={{
          background: T.brandSoft, border: `1px solid ${T.brand}44`,
          borderRadius: 10, padding: 12, marginBottom: 10,
          display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
        }}>
          <span style={{ fontSize: 12, color: T.brand, fontWeight: 600, whiteSpace: "nowrap" }}>
            ✏️ 已选 {selectedText.length} 字
          </span>
          <input value={instruction} onChange={e => setInstruction(e.target.value)}
            placeholder="改写指令(留空=更犀利,口吻不变)"
            disabled={rewriting}
            onKeyDown={e => { if (e.key === "Enter") doRewriteSel(); }}
            style={{
              flex: 1, minWidth: 240,
              padding: "6px 12px", fontSize: 12, fontFamily: "inherit",
              border: `1px solid ${T.brand}55`, borderRadius: 6, outline: "none",
              background: "#fff",
            }} />
          <Btn size="sm" variant="primary" onClick={doRewriteSel} disabled={rewriting}>
            {rewriting ? "AI 改写中..." : "🔄 重写选中段"}
          </Btn>
        </div>
      )}
      {hasSel && (
        <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
          {QUICK_INSTRUCTIONS.map(q => (
            <button key={q} onClick={() => setInstruction(q)}
              disabled={rewriting}
              style={{
                padding: "3px 10px", fontSize: 11, borderRadius: 100,
                background: instruction === q ? T.brand : T.bg2,
                color: instruction === q ? "#fff" : T.muted,
                border: `1px solid ${instruction === q ? T.brand : T.borderSoft}`,
                cursor: rewriting ? "not-allowed" : "pointer",
                fontFamily: "inherit",
              }}>{q}</button>
          ))}
        </div>
      )}
      {!hasSel && onRewriteSelection && (
        <div style={{ fontSize: 11.5, color: T.muted2, marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
          💡 选中下面文字 ≥ 10 字 · 上方会出现「重写选中段」工具栏
        </div>
      )}
      <div style={{ background: "#fff", border: `1px solid ${T.borderSoft}`, borderRadius: 12, padding: 20 }}>
        <textarea ref={taRef} value={editing}
          onChange={e => setEditing(e.target.value)}
          onSelect={captureSel} onKeyUp={captureSel} onMouseUp={captureSel}
          style={{ width: "100%", border: "none", outline: "none", background: "transparent", fontSize: 14.5, fontFamily: "inherit", resize: "vertical", lineHeight: 1.9, color: T.text, minHeight: 420 }} />
      </div>
      {sc.summary && <div style={{ marginTop: 10, padding: 10, background: T.bg2, borderRadius: 8, fontSize: 12, color: T.muted, lineHeight: 1.6 }}>💬 <b>总评:</b> {sc.summary}</div>}

      <div style={{ display: "flex", gap: 10, marginTop: 18, alignItems: "center" }}>
        <Btn variant="outline" onClick={onPrev}>← 改大纲</Btn>
        <Btn onClick={onRewrite}>🔄 重写一版</Btn>
        <div style={{ flex: 1 }} />
        <Btn variant="primary" onClick={onNext}>下一步 · 段间配图 →</Btn>
      </div>

      {/* D-062f 双 CTA: 摘金句段做视频 / 推送草稿(下一步即推送) */}
      {onNav && (
        <div style={{
          marginTop: 16, padding: 14,
          background: `linear-gradient(135deg, ${T.brandSoft} 0%, #fff 100%)`,
          border: `1px solid ${T.brandSoft}`, borderRadius: 12,
        }}>
          <div style={{ fontSize: 12.5, color: T.muted, marginBottom: 10, fontWeight: 500 }}>
            ✨ 这篇长文还能干啥
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <Btn size="sm" variant="primary" onClick={() => {
              const seed = (hasSel ? selectedText : (editing || article.content || "")).trim().slice(0, 1200);
              try {
                localStorage.setItem("make_v2_seed_script", seed);
                localStorage.setItem("make_v2_seed_from", JSON.stringify({
                  skill: "wechat",
                  title: `公众号 · ${(pickedTitle || topic || "金句段").slice(0, 24)}${hasSel ? " · 选段" : ""}`,
                  ts: Date.now(),
                }));
              } catch (_) {}
              onNav("make");
            }}>🎬 {hasSel ? "把选中段做成视频" : "摘段做数字人视频"} →</Btn>
            <span style={{ fontSize: 11, color: T.muted2 }}>
              {hasSel ? `已选 ${selectedText.length} 字 · 跳到「做视频」自动带入` : "未选段则带全文,到「做视频」再裁;或先选段再点这里"}
            </span>
            <div style={{ flex: 1 }} />
            <span style={{ fontSize: 11, color: T.muted2 }}>📮 推送草稿箱 → 走完段间配图 + HTML 后即推</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Step 5 · 段间配图 ───────────────────────────────────────
// D-033 ① 段间配图 prompt 可改 + 风格预设 + 改完重生
const IMAGE_STYLE_PRESETS = [
  { id: "real",     label: "📷 真实感照片", append: ",真实感照片,自然光,暖色调" },
  { id: "documentary", label: "🎬 纪实风", append: ",纪实摄影风格,高细节,真实环境" },
  { id: "warm",     label: "🌅 暖色慢节奏", append: ",暖黄色调,慢节奏氛围,柔光" },
  { id: "ink",      label: "🖌️ 水墨/中式", append: ",中式水墨风,山水意境,留白" },
  { id: "cartoon",  label: "🎨 卡通插画", append: ",扁平卡通插画风格,暖色配色" },
  { id: "vintage",  label: "📼 复古怀旧", append: ",复古胶片质感,90 年代色调" },
];

function WxStepImages({ plans, setPlans, onGen, loading, onPrev, onNext, onRegen }) {
  if (loading || plans.length === 0) return <Spinning icon="🎨" phases={[
    { text: "把文章切成 4 个大段", sub: "按 H2 / 语义转折定界" },
    { text: "为每段设计具象画面 prompt", sub: "真实感照片 · 暖色调 · 避免人脸特写" },
    { text: "控长度 ≤ 60 字", sub: "具体场景 > 抽象概念" },
    { text: "规划好了,下一页你可以逐张生图", sub: "每张约 30-60s · apimart gpt-image-2" },
  ]} />;
  const doneCount = plans.filter(p => p.status === "done").length;
  const runningCount = plans.filter(p => p.status === "running").length;
  const pending = plans.filter(p => p.status !== "done" && p.status !== "running");

  async function genAll() {
    for (let i = 0; i < plans.length; i++) {
      if (plans[i].status !== "done" && plans[i].status !== "running") {
        await onGen(i);
      }
    }
  }
  function updatePrompt(i, newPrompt) {
    setPlans(prev => prev.map((p, idx) => idx === i ? { ...p, image_prompt: newPrompt } : p));
  }
  function appendPreset(i, preset) {
    setPlans(prev => prev.map((p, idx) => idx === i ? {
      ...p, image_prompt: (p.image_prompt || "").trimEnd() + preset.append,
    } : p));
  }

  return (
    <div style={{ padding: "32px 40px 120px", maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ marginBottom: 16, display: "flex", alignItems: "flex-start", gap: 16 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>段间配图 · {doneCount}/{plans.length} 🎨</div>
          <div style={{ fontSize: 13, color: T.muted }}>prompt 可改 · 加风格预设 · 改完点「生成/🔄 重生」用新 prompt 重生。每张 30-60s。</div>
        </div>
        {pending.length > 0 && (
          <Btn variant="primary" onClick={genAll} disabled={runningCount > 0}>
            ✨ 一键生成剩余 {pending.length} 张
          </Btn>
        )}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 14 }}>
        {plans.map((p, i) => (
          <div key={i} style={{
            padding: 14, background: "#fff", border: `1px solid ${T.borderSoft}`, borderRadius: 12,
            display: "flex", flexDirection: "column", gap: 8,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Tag size="xs" color="blue">#{i + 1}</Tag>
              <span style={{ fontSize: 12, color: T.muted, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.section_hint}</span>
              {p.status === "done" && <span style={{ fontSize: 11, color: T.brand, fontWeight: 600 }}>✓ {p.elapsed_sec}s</span>}
              {p.status === "running" && <span style={{ fontSize: 11, color: T.amber }}>⏳ 生成中</span>}
              {p.status === "failed" && <span style={{ fontSize: 11, color: T.red }}>⚠️ 失败</span>}
            </div>
            <textarea rows={3} value={p.image_prompt}
              onChange={e => updatePrompt(i, e.target.value)}
              placeholder="改 prompt 再点重生..."
              style={{ width: "100%", border: `1px solid ${T.borderSoft}`, borderRadius: 6, padding: 8, fontSize: 12, fontFamily: "inherit", outline: "none", resize: "vertical", color: T.text, lineHeight: 1.6, background: "#fff" }} />
            {/* 风格预设 chip · 点击 append 到 prompt 末尾 */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {IMAGE_STYLE_PRESETS.map(preset => (
                <button key={preset.id} onClick={() => appendPreset(i, preset)}
                  title={`追加: ${preset.append}`}
                  style={{
                    padding: "3px 8px", fontSize: 10.5, borderRadius: 100,
                    background: T.bg2, border: `1px solid ${T.borderSoft}`,
                    color: T.muted, cursor: "pointer", fontFamily: "inherit",
                  }}>
                  {preset.label}
                </button>
              ))}
            </div>
            {p.mmbiz_url ? (
              // D-039: 用 media_url 走本地 /media/ 避开 mmbiz.qpic.cn 防盗链;
              // 旧数据没有 media_url 时降级到 mmbiz_url (会显示"未经允许不可引用"占位)
              <div style={{ aspectRatio: "16/9", borderRadius: 8, overflow: "hidden",
                background: `url(${p.media_url ? api.media(p.media_url) : p.mmbiz_url}) center/cover`,
                border: `1px solid ${T.borderSoft}` }} />
            ) : (
              <div style={{
                minHeight: 110, maxHeight: 140, borderRadius: 8,
                background: T.bg2, border: `1px dashed ${T.border}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 11.5, color: T.muted2, textAlign: "center", padding: 10,
              }}>
                {p.status === "running" ? "⏳ 生成中 · 30-60s · 别关" :
                 p.status === "failed" ? `⚠️ ${p.error || "失败,可点重生"}` :
                 "未生成"}
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <Btn size="sm" variant={p.status === "done" ? "outline" : "primary"}
                onClick={() => onGen(i)} disabled={p.status === "running"}>
                {p.status === "done" ? "🔄 用新 prompt 重生" : p.status === "running" ? "生成中..." : p.status === "failed" ? "重试" : "生成这张"}
              </Btn>
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 18, alignItems: "center" }}>
        <Btn variant="outline" onClick={onPrev}>← 回长文</Btn>
        <Btn onClick={onRegen}>🔄 重出 prompt</Btn>
        <div style={{ flex: 1 }} />
        <div style={{ fontSize: 12, color: T.muted, marginRight: 10 }}>有图没图都能继续,没图的段不配</div>
        <Btn variant="primary" onClick={onNext}>拼 HTML →</Btn>
      </div>
    </div>
  );
}

// ─── Step 6 · HTML ─────────────────────────────────────────
// D-034 ② HTML 模板可切换
const HTML_TEMPLATES = [
  { id: "v3-clean",    label: "V3 Clean",    sub: "干净有呼吸 · 默认" },
  { id: "v2-magazine", label: "V2 Magazine", sub: "杂志感 · 适合长文方法论" },
  { id: "v1-dark",     label: "V1 Dark",     sub: "深色高对比 · 适合犀利观点" },
];

function WxStepHtml({ result, loading, onPrev, onNext, onSwitchTemplate }) {
  if (loading || !result) return <Spinning icon="🧩" phases={[
    { text: "读模板", sub: "assets/template-*.html" },
    { text: "简易 MD → HTML", sub: "H2 转 section-title · 段间按比例插图" },
    { text: "注入 hero + 正文 + footer-fixed", sub: "保留头像 mmbiz URL 和 CTA 区" },
    { text: "premailer 内联所有 CSS", sub: "class 删除 · style 属性合入" },
    { text: "转微信 markup", sub: "div → section · 文本包 span leaf · 末尾 mp-style-type" },
  ]} />;
  if (!result) return null;
  const currentTpl = result.template || "v3-clean";
  return (
    <div style={{ padding: "32px 40px 120px", maxWidth: 1080, margin: "0 auto" }}>
      <div style={{ marginBottom: 16, display: "flex", alignItems: "flex-start", gap: 16 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>HTML 拼好了 🧩</div>
          <div style={{ fontSize: 13, color: T.muted }}>带样式预览(接近微信渲染) · 推送时自动用微信 markup 格式</div>
        </div>
      </div>

      {/* D-034 模板切换 tab */}
      <div style={{ display: "flex", gap: 6, marginBottom: 12, background: T.bg2, padding: 4, borderRadius: 100, width: "fit-content" }}>
        {HTML_TEMPLATES.map(tpl => (
          <button key={tpl.id} title={tpl.sub}
            onClick={() => tpl.id !== currentTpl && onSwitchTemplate?.(tpl.id)}
            disabled={tpl.id === currentTpl}
            style={{
              padding: "6px 14px", fontSize: 12, borderRadius: 100, border: "none", cursor: tpl.id === currentTpl ? "default" : "pointer", fontFamily: "inherit",
              background: tpl.id === currentTpl ? "#fff" : "transparent",
              color: tpl.id === currentTpl ? T.text : T.muted,
              fontWeight: tpl.id === currentTpl ? 600 : 500,
              boxShadow: tpl.id === currentTpl ? "0 1px 3px rgba(0,0,0,0.06)" : "none",
            }}>
            {tpl.label}
            <span style={{ fontSize: 10, marginLeft: 6, color: tpl.id === currentTpl ? T.muted2 : T.muted3, fontWeight: 400 }}>{tpl.sub}</span>
          </button>
        ))}
      </div>

      <div style={{ background: "#fff", border: `1px solid ${T.borderSoft}`, borderRadius: 12, padding: 2, marginBottom: 14, height: 640, overflow: "hidden" }}>
        <iframe srcDoc={result.raw_html || result.wechat_html} style={{ width: "100%", height: "100%", border: "none", borderRadius: 10, background: "#fff" }} title="wechat preview" />
      </div>
      <div style={{ padding: 12, background: T.bg2, borderRadius: 8, fontSize: 12, color: T.muted, lineHeight: 1.7 }}>
        <div>原 HTML: <code style={{ fontSize: 11 }}>{result.raw_html_path}</code></div>
        <div>微信 markup: <code style={{ fontSize: 11 }}>{result.wechat_html_path}</code></div>
        <div>摘要: {result.digest}</div>
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 18, alignItems: "center" }}>
        <Btn variant="outline" onClick={onPrev}>← 回配图</Btn>
        <div style={{ flex: 1 }} />
        <Btn variant="primary" onClick={onNext}>生成封面 →</Btn>
      </div>
    </div>
  );
}

// ─── Step 7 · 封面 ───────────────────────────────────────────
function WxStepCover({ cover, title, loading, onPrev, onNext, onRegen, onSelect }) {
  if (loading || !cover) return <Spinning icon="🖼️" phases={[
    { text: "构造 4 个不同风格的 prompt", sub: "现代简约 / 暖色暖光 / 深色冲击 / 复古胶片" },
    { text: "调 apimart GPT-Image-2 生第 1 张", sub: "16:9 横版 · 30-60s/张" },
    { text: "生第 2 张", sub: "" },
    { text: "生第 3 张", sub: "" },
    { text: "生第 4 张 · 4 张完成", sub: "" },
    { text: "下载到本地 · 复制到 /media", sub: "" },
  ]} />;
  if (!cover) return null;

  // D-035: 4 选 1 模式. 兼容旧单张模式(cover.local_path 直接有)
  const isBatch = Array.isArray(cover.covers);
  const covers = isBatch ? cover.covers : [{ index: 0, local_path: cover.local_path_served || cover.local_path, media_url: cover.media_url, prompt: "(模板单张)" }];
  const selectedIdx = cover.selected_index ?? 0;
  const successCount = covers.filter(c => c.local_path).length;

  return (
    <div style={{ padding: "32px 40px 120px", maxWidth: 1080, margin: "0 auto" }}>
      <div style={{ marginBottom: 16, display: "flex", alignItems: "flex-start", gap: 16 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>
            封面 {isBatch ? `4 选 1 (${successCount}/${covers.length} 成功)` : ""} 🖼️
          </div>
          <div style={{ fontSize: 13, color: T.muted }}>
            {isBatch ? "点选一张作为正式封面 · 不满意整批重来" : "旧版单张 · 文件可能已丢失,建议重生"}
            {cover.total_elapsed_sec && ` · 总耗时 ${cover.total_elapsed_sec}s`}
          </div>
        </div>
        <Btn onClick={onRegen}>🔄 {isBatch ? "再来 4 张" : "升级到 4 选 1"}</Btn>
      </div>

      {!isBatch && (
        <div style={{ padding: 12, background: T.amberSoft, color: "#92400e", borderRadius: 10, fontSize: 13, marginBottom: 14, lineHeight: 1.6 }}>
          ⚠️ 检测到旧版数据(单张 Chrome 模板封面)· 文件路径可能已失效,推送很可能 422.
          建议点上方 <b>🔄 升级到 4 选 1</b> 重新生 4 张候选封面,再选一张推送.
        </div>
      )}

      {/* grid · 4 选 1 */}
      <div style={{ display: "grid", gridTemplateColumns: isBatch ? "repeat(2, 1fr)" : "1fr", gap: 14, marginBottom: 14 }}>
        {covers.map((c, i) => {
          const isSelected = i === selectedIdx;
          const ok = !!c.local_path;
          return (
            <div key={i}
              onClick={() => ok && isBatch && onSelect?.(c.index ?? i)}
              style={{
                background: "#fff",
                border: `2px solid ${isSelected ? T.brand : T.borderSoft}`,
                boxShadow: isSelected ? `0 0 0 4px ${T.brandSoft}` : "none",
                borderRadius: 12, padding: 8, cursor: ok && isBatch ? "pointer" : "default",
                transition: "all 0.15s",
                opacity: ok ? 1 : 0.5,
                position: "relative",
              }}>
              {ok ? (
                <img src={api.media(c.media_url)} alt={`cover ${i+1}`}
                  style={{ width: "100%", aspectRatio: "16/9", borderRadius: 6, objectFit: "cover", display: "block" }} />
              ) : (
                <div style={{ aspectRatio: "16/9", borderRadius: 6, background: T.bg2, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: T.red, padding: 12, textAlign: "center" }}>
                  ⚠️ {(c.error || "失败").slice(0, 60)}
                </div>
              )}
              <div style={{ fontSize: 11, color: T.muted2, marginTop: 6, padding: "0 4px", display: "flex", alignItems: "center", gap: 6 }}>
                {isBatch && <Tag size="xs" color={isSelected ? "green" : "blue"}>#{i + 1}</Tag>}
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.style || c.prompt}</span>
                {c.elapsed_sec && <span style={{ fontFamily: "SF Mono, monospace" }}>{c.elapsed_sec}s</span>}
              </div>
              {isSelected && ok && (
                <div style={{ position: "absolute", top: 12, right: 12, background: T.brand, color: "#fff", borderRadius: 100, fontSize: 11, padding: "3px 10px", fontWeight: 600 }}>
                  ✓ 已选
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <Btn variant="outline" onClick={onPrev}>← 回 HTML</Btn>
        {isBatch && <Btn onClick={onRegen}>🔄 再来 4 张</Btn>}
        <div style={{ flex: 1 }} />
        <Btn variant="primary" onClick={onNext} disabled={successCount === 0}>
          {successCount === 0 ? "全部失败,先重生" : `推送草稿箱(用第 ${selectedIdx + 1} 张) →`}
        </Btn>
      </div>
    </div>
  );
}

// ─── Step 8 · 推送 ───────────────────────────────────────────
function WxStepPush({ result, loading, onPrev, onReset, onNav }) {
  if (loading || !result) return <Spinning icon="🚀" phases={[
    { text: "读 ~/.wechat-article-config", sub: "wechat_appid + wechat_appsecret" },
    { text: "刷新 access_token", sub: "mp.weixin.qq.com API" },
    { text: "上传封面到素材库", sub: "cdb_add_material · 获取 media_id" },
    { text: "创建草稿 · 去重检查", sub: "同标题+同摘要+同正文会复用已有草稿" },
    { text: "落地到公众号后台", sub: "去草稿箱点「发布」就能推" },
  ]} />;
  const draftsUrl = "https://mp.weixin.qq.com/cgi-bin/appmsg?t=media/appmsg_edit&action=edit&type=77";
  return (
    <div style={{ padding: "32px 40px 120px", maxWidth: 720, margin: "0 auto" }}>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>✅ 已推到草稿箱</div>
        <div style={{ fontSize: 13, color: T.muted }}>耗时 {result.elapsed_sec}s · 去草稿箱点"发布"即可</div>
      </div>

      <a href="https://mp.weixin.qq.com/" target="_blank" rel="noreferrer"
        style={{ display: "block", textDecoration: "none", marginBottom: 14 }}>
        <div style={{
          padding: "18px 20px", background: T.brand, borderRadius: 12,
          display: "flex", alignItems: "center", gap: 14, cursor: "pointer",
          boxShadow: `0 4px 16px ${T.brand}33`,
        }}>
          <div style={{ fontSize: 26 }}>🚀</div>
          <div style={{ flex: 1, color: "#fff" }}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 2 }}>去微信公众号草稿箱</div>
            <div style={{ fontSize: 12, opacity: 0.8 }}>mp.weixin.qq.com · 点"发布"或继续排版</div>
          </div>
          <div style={{ fontSize: 18, color: "#fff" }}>→</div>
        </div>
      </a>

      <details style={{ padding: 14, background: "#fff", border: `1px solid ${T.borderSoft}`, borderRadius: 12, marginBottom: 14 }}>
        <summary style={{ fontSize: 11.5, color: T.muted2, fontWeight: 600, letterSpacing: "0.08em", cursor: "pointer", userSelect: "none" }}>
          推送脚本输出(展开看详情)
        </summary>
        <pre style={{ fontSize: 11, lineHeight: 1.6, color: T.muted, margin: "10px 0 0", whiteSpace: "pre-wrap", fontFamily: "SF Mono, Menlo, monospace" }}>
          {(result.stdout_tail || []).join("\n")}
        </pre>
      </details>

      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <Btn variant="outline" onClick={onPrev}>← 回封面</Btn>
        <div style={{ flex: 1 }} />
        <Btn onClick={onReset}>再写一篇</Btn>
        <Btn variant="primary" onClick={() => onNav?.("home")}>回首页</Btn>
      </div>
    </div>
  );
}

// ─── 🚀 全自动进度页 (P0) ───────────────────────────────
// 显示整条 pipeline 的每步进度,用户不用再点"下一步",挂了可中断接管
function WxAutoProgress({ steps, title, err, onAbort, skipImages }) {
  const [now, setNow] = React.useState(Date.now());
  React.useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const done = steps.filter(s => s.status === "done").length;
  const running = steps.find(s => s.status === "running");
  const failed = steps.some(s => s.status === "failed");
  const allDone = steps.length > 0 && steps.every(s => s.status === "done");
  const progress = steps.length === 0 ? 0 : Math.round((done / steps.length) * 100);

  return (
    <div style={{ padding: "32px 40px 120px", maxWidth: 820, margin: "0 auto" }}>
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 6, display: "flex", alignItems: "center", gap: 10 }}>
          🚀 全自动跑 pipeline 中
          {allDone && <span style={{ fontSize: 12, color: T.brand, background: T.brandSoft, padding: "3px 10px", borderRadius: 100 }}>✓ 已到封面</span>}
          {failed && <span style={{ fontSize: 12, color: T.red, background: T.redSoft, padding: "3px 10px", borderRadius: 100 }}>有步骤挂了</span>}
        </div>
        <div style={{ fontSize: 13, color: T.muted, marginBottom: 10 }}>
          标题: <b style={{ color: T.text }}>{title}</b>
          {skipImages && <span style={{ marginLeft: 10, fontSize: 11, color: T.amber, background: T.amberSoft, padding: "2px 8px", borderRadius: 100 }}>已跳过段间配图</span>}
        </div>
        <div style={{ height: 8, background: T.bg3, borderRadius: 100, overflow: "hidden", marginBottom: 4 }}>
          <div style={{
            height: "100%", width: `${progress}%`,
            background: `linear-gradient(90deg, ${T.brand}, #1f5638)`,
            transition: "width 0.3s ease",
            borderRadius: 100,
          }} />
        </div>
        <div style={{ fontSize: 11, color: T.muted2, textAlign: "right" }}>{done}/{steps.length} · {progress}%</div>
      </div>

      <div style={{ background: "#fff", border: `1px solid ${T.borderSoft}`, borderRadius: 12, padding: 12, marginBottom: 14 }}>
        {steps.map((s, i) => {
          const cur = s.status === "running";
          const elapsed = cur && s.status === "running" ? Math.floor((now - (s._startedAt || now)) / 1000) : s.elapsed_sec;
          return (
            <div key={s.key} style={{
              display: "flex", alignItems: "flex-start", gap: 12,
              padding: "10px 4px",
              borderBottom: i === steps.length - 1 ? "none" : `1px solid ${T.bg3}`,
              opacity: s.status === "pending" ? 0.5 : 1,
              background: cur ? T.brandSoft : "transparent",
              borderRadius: cur ? 8 : 0,
              marginBottom: cur ? 4 : 0,
            }}>
              <div style={{
                width: 26, height: 26, borderRadius: "50%", flexShrink: 0,
                background: s.status === "done" ? T.brand : s.status === "failed" ? T.red : cur ? "#fff" : T.bg3,
                color: s.status === "done" || s.status === "failed" ? "#fff" : cur ? T.brand : T.muted2,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 13, fontWeight: 700,
                border: cur ? `2px solid ${T.brand}` : "none",
                animation: cur ? "qlspin 1.5s linear infinite" : "none",
              }}>
                {s.status === "done" ? "✓" : s.status === "failed" ? "✗" : cur ? "◐" : i + 1}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: cur ? 600 : 500, color: s.status === "pending" ? T.muted : T.text }}>
                  {s.label}
                  {s.elapsed_sec != null && s.status === "done" && (
                    <span style={{ marginLeft: 8, fontSize: 11, color: T.muted2, fontFamily: "SF Mono, monospace", fontWeight: 400 }}>{s.elapsed_sec}s</span>
                  )}
                  {cur && (
                    <span style={{ marginLeft: 8, fontSize: 11, color: T.brand, fontFamily: "SF Mono, monospace", fontWeight: 600 }}>
                      {elapsed || 0}s / ~{s.eta}s
                    </span>
                  )}
                </div>
                {(cur || s.err) && (
                  <div style={{ fontSize: 12, color: s.err ? T.red : T.muted, marginTop: 3, lineHeight: 1.6 }}>
                    {s.err || s.sub}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {err && (
        <div style={{ padding: 12, background: T.redSoft, color: T.red, borderRadius: 10, fontSize: 13, marginBottom: 14 }}>
          ⚠️ {err}
        </div>
      )}

      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <Btn variant="outline" onClick={onAbort}>
          {failed || allDone ? "手动接管 · 回到分步模式" : "中断 · 回到分步"}
        </Btn>
        <div style={{ flex: 1 }} />
        {running && (
          <div style={{ fontSize: 12, color: T.muted }}>
            ⏱️ 当前: {running.label} · 预计 {running.eta}s
          </div>
        )}
      </div>
    </div>
  );
}

// Spinning / TitlesSkeleton 已迁移到 factory-ui.jsx (D-021)
// 从 window.Spinning / window.TitlesSkeleton 获取(加载顺序保证可用)

Object.assign(window, { PageWechat });
