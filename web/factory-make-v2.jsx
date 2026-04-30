// factory-make-v2.jsx — 🎬 做视频 v2 (D-061 重塑)
//
// 用户拍板的产品架构 (D-061 起):
//   平台 = 数字人内容平台 (真人视频用手机 "开拍" 自己搞)
//   v5/v6/v7 模板是 Step 3 子选项, 不是 sidebar 独立 skill
//   Step 1 文案是"大板块", N 个并列大按钮
//
// 5 步 wizard:
//   1 文案     (N 个大按钮: 投流 / 朋友圈 / 公众号 / 录音 / 热点 / 人设 / 粘贴 / AI 写)
//   2 声音 + 数字人 (合并一步, 默认用上次)
//   3 选模板    (复用 dhv5 模板选择器组件, + "朴素无模板" 选项)
//   4 剪辑     (复用 dhv5 align + render)
//   5 预览 + 反馈 (修改意见 → AI 重剪 / 多平台发布提示)

const MAKE_V2_STEPS = [
  { id: "script",   n: 1, label: "文案" },
  { id: "voice-dh", n: 2, label: "声音 + 数字人" },
  { id: "template", n: 3, label: "选模板" },
  { id: "edit",     n: 4, label: "剪辑" },
  { id: "preview",  n: 5, label: "预览 + 发布" },
];

const HOT_RADAR_BATCH_SIZE = 5;
const HOT_RADAR_FETCH_LIMIT = 30;

function getHotRadarBatch(topics, batchIndex) {
  if (!Array.isArray(topics) || topics.length === 0) return [];
  const count = Math.min(HOT_RADAR_BATCH_SIZE, topics.length);
  const start = (batchIndex * HOT_RADAR_BATCH_SIZE) % topics.length;
  return Array.from({ length: count }, (_, i) => topics[(start + i) % topics.length]);
}

function getHotRadarBatchCount(topics) {
  if (!Array.isArray(topics) || topics.length <= HOT_RADAR_BATCH_SIZE) return 1;
  return Math.ceil(topics.length / HOT_RADAR_BATCH_SIZE);
}

function PageMakeV2({ onNav }) {
  const [step, setStep] = React.useState("script");
  const [err, setErr] = React.useState("");

  // 全流程共享 state (各 step 填进来, render step 用)
  const [script, setScript] = React.useState("");                 // Step 1 文案
  const [voiceId, setVoiceId] = React.useState(null);             // Step 2 声音
  const [avatarId, setAvatarId] = React.useState(null);           // Step 2 数字人
  const [dhVideoPath, setDhVideoPath] = React.useState("");       // Step 2 输出
  const [templateId, setTemplateId] = React.useState(null);       // Step 3 (null = 朴素)
  const [alignedScenes, setAlignedScenes] = React.useState(null); // Step 4
  const [renderTaskId, setRenderTaskId] = React.useState(null);   // Step 5 trigger

  // D-062c: 检测从其它 skill 跳来的 seed (localStorage make_v2_seed_script)
  // D-095: seed 进来时根据来源类型分流:
  //   - 文案就绪 skill (baokuan/hotrewrite/voicerewrite/moments/planner/touliu/wechat/rework):
  //     直接跳 voice-dh, 进数字人合成. 老板要求"做成视频" 进数字人流程, 不停在起点 4 选 1.
  //   - 模板/草稿 skill (hot-topic/topic/viral): seed 是 "口播正文:\n" 占位模板, 用户还得
  //     自己写正文, 留在 script step 默认 plainText tab 让 textarea 显示出来.
  //   想改文案点 voice-dh step 的"← 改文案" 仍可返 script step.
  const READY_SKILLS = new Set([
    "baokuan", "hotrewrite", "voicerewrite", "moments",
    "planner", "touliu", "wechat", "rework",
  ]);
  const [seedFrom, setSeedFrom] = React.useState(null);
  React.useEffect(() => {
    try {
      const seed = localStorage.getItem("make_v2_seed_script");
      const fromRaw = localStorage.getItem("make_v2_seed_from");
      if (seed && !script) {
        setScript(seed);
        let from = null;
        if (fromRaw) {
          try { from = JSON.parse(fromRaw); setSeedFrom(from); } catch (_) {}
        }
        // D-095: 文案就绪类 skill 直跳 voice-dh; 否则留 script 让用户写正文
        if (from && READY_SKILLS.has(from.skill)) {
          setStep("voice-dh");
        }
        // 用完清掉 (避免下次还自动填)
        localStorage.removeItem("make_v2_seed_script");
        localStorage.removeItem("make_v2_seed_from");
        // D-062x: 既然已经带回来了, anchor 也清掉
        clearFromMake();
      }
    } catch (_) {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function gotoStep(target) {
    setErr("");
    setStep(target);
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", background: T.bg, position: "relative", overflow: "hidden" }}>
      <MakeV2Header current={step} onJump={gotoStep} />

      <div style={{ flex: 1, overflow: "auto", padding: "24px 32px 80px" }}>
        <div style={{ maxWidth: 980, margin: "0 auto" }}>
          {/* D-086: 走全站 InlineError, 不再裸渲染 ⚠️ {err} */}
          {err && <InlineError err={err} />}

          {step === "script"   && <MakeV2StepScript script={script} setScript={setScript} onNext={() => gotoStep("voice-dh")} onNav={onNav} seedFrom={seedFrom} onDismissSeed={() => setSeedFrom(null)} />}
          {step === "voice-dh" && <MakeV2StepVoiceDh
                                    voiceId={voiceId} setVoiceId={setVoiceId}
                                    avatarId={avatarId} setAvatarId={setAvatarId}
                                    dhVideoPath={dhVideoPath} setDhVideoPath={setDhVideoPath}
                                    script={script}
                                    onPrev={() => gotoStep("script")}
                                    onNext={() => gotoStep("template")}
                                    onNav={onNav} />}
          {step === "template" && <MakeV2StepTemplate
                                    templateId={templateId} setTemplateId={setTemplateId}
                                    onPrev={() => gotoStep("voice-dh")}
                                    onNext={() => gotoStep("edit")} />}
          {step === "edit"     && <MakeV2StepEdit
                                    templateId={templateId} script={script} dhVideoPath={dhVideoPath}
                                    alignedScenes={alignedScenes} setAlignedScenes={setAlignedScenes}
                                    onPrev={() => gotoStep("template")}
                                    onRender={(taskId) => { setRenderTaskId(taskId); gotoStep("preview"); }} />}
          {step === "preview"  && <MakeV2StepPreview
                                    renderTaskId={renderTaskId} setRenderTaskId={setRenderTaskId}
                                    templateId={templateId}
                                    script={script}
                                    onReedit={() => gotoStep("edit")}
                                    onNewMp4={() => gotoStep("script")} />}
        </div>
      </div>
    </div>
  );
}

// ─── 顶栏 + 步骤 dots ────────────────────────────────────────
function MakeV2Header({ current, onJump }) {
  return (
    <div style={{ padding: "12px 24px", background: "#fff", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 14, flexShrink: 0 }}>
      <div style={{ width: 26, height: 26, borderRadius: 7, background: T.text, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13 }}>🎬</div>
      <div style={{ fontSize: 13.5, fontWeight: 600 }}>做视频 · 数字人</div>

      <div style={{ display: "flex", alignItems: "center", gap: 4, marginLeft: 8 }}>
        {MAKE_V2_STEPS.map((s, i) => {
          const active = s.id === current;
          const currentIdx = MAKE_V2_STEPS.findIndex(x => x.id === current);
          const done = currentIdx > i;
          const clickable = done;
          return (
            <React.Fragment key={s.id}>
              <div
                onClick={clickable ? () => onJump(s.id) : undefined}
                title={clickable ? `跳回「${s.label}」` : undefined}
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
              {i < MAKE_V2_STEPS.length - 1 && <span style={{ color: T.muted3, fontSize: 10 }}>—</span>}
            </React.Fragment>
          );
        })}
      </div>

      <div style={{ flex: 1 }} />
      <ApiStatusLight />
    </div>
  );
}

// ─── Step 1 文案 — N 个大按钮文案板块 (D-061c) ─────────────
// 用户拍板: "公众号 / 朋友圈本质都是文案的一部分", Step 1 是大板块,
// N 个并列大按钮, 每个按钮 = 一个文案 skill.
// D-062nn-C1: 6 skill 卡 desc 改人话, 删开发者向括号
const MAKE_V2_SCRIPT_SKILLS = [
  { id: "hotrewrite",   icon: "🔥", title: "热点改写",   desc: "把今日热点改成你视角的口播 · 钩子 + 反差 + 金句" },
  { id: "voicerewrite", icon: "🎙️", title: "录音改写",   desc: "录音 / 直播 → 转写 + 改写成口播" },
  { id: "ad",           icon: "💰", title: "投流文案",   desc: "一个卖点 → 5-10 版投流 (痛 / 对 / 步 / 话 / 创)" },
  { id: "wechat",       icon: "📄", title: "公众号长文", desc: "方法论长文 · 2000+ 字 · 自动排版" },
  { id: "moments",      icon: "📱", title: "朋友圈短句", desc: "金句库衍生 N 条 · 适合做超短视频" },
  { id: "planner",      icon: "🗓️", title: "内容策划",   desc: "活动策划: 直播 / 讲课 / 分享 怎么把内容做满" },
];

const MAKE_V2_SKILL_NAMES = {
  hotrewrite: "🔥 热点改写", voicerewrite: "🎙️ 录音改写", ad: "💰 投流文案",
  wechat: "📄 公众号", moments: "📱 朋友圈", planner: "📋 内容策划",
  baokuan: "✍️ 爆款改写",
  // D-062-AUDIT-2: 素材库直跳来源 (heat / topic)
  "hot-topic": "🔥 热点库", topic: "💡 选题库",
  // D-062-AUDIT-2-todo1: viral 素材直跳 + works 重制
  viral: "🔥 爆款素材", rework: "♻️ 重做作品",
};

function MakeV2StepScript({ script, setScript, onNext, onNav, seedFrom, onDismissSeed }) {
  // D-062a: 当日热点预览 (从 hot_topics 表拉前 3 条)
  const [hotTopics, setHotTopics] = React.useState(null);
  const [hotBatchIndex, setHotBatchIndex] = React.useState(0);
  function reloadHotTopics() {
    api.get(`/api/hot-topics?limit=${HOT_RADAR_FETCH_LIMIT}`)
      .then(items => {
        setHotTopics(items || []);
        setHotBatchIndex(0);
      })
      .catch(() => setHotTopics([]));
  }
  React.useEffect(() => {
    reloadHotTopics();
  }, []);
  const visibleHotTopics = getHotRadarBatch(hotTopics, hotBatchIndex);
  const hotBatchCount = getHotRadarBatchCount(hotTopics);
  function nextHotTopicBatch() {
    if (!Array.isArray(hotTopics) || hotTopics.length <= HOT_RADAR_BATCH_SIZE) {
      reloadHotTopics();
      return;
    }
    setHotBatchIndex(i => (i + 1) % getHotRadarBatchCount(hotTopics));
  }

  function pickHotTopic(t) {
    // "只塞文案"模式: 把热点拼成 seed 塞 tab 4 (已写好的文案), 用户自己写
    const seed = `# 热点 (来自 ${t.platform || "?"}, 热度 ${t.heat_score})\n${t.title}\n\n${t.match_reason ? "我的角度: " + t.match_reason + "\n\n" : ""}---\n\n口播正文:\n`;
    setScript(seed);
    setActiveTab("plainText");
  }

  // D-062nn-C2: "拍这条" → 拼丰富 seed 跳 hotrewrite
  // PageHotrewrite (C3) 检测 seed 自动跳过 input + 进 angles step
  function takeThisHot(t) {
    const seedParts = [t.title];
    if (t.match_reason) seedParts.push(`\n(我能借这个角度: ${t.match_reason})`);
    if (t.platform) seedParts.push(`\n\n[来源: ${t.platform} · 热度 ${t.heat_score || 0}]`);
    try {
      localStorage.setItem("hotrewrite_seed_hotspot", seedParts.join(""));
      setFromMake("hotrewrite");
    } catch (_) {}
    onNav("hotrewrite");
  }

  // D-062oo-D 重构: 按"内容来源" 4-tab 分流, 删 popover (popover 把 3 个语义不同的 skill 平铺是错配)
  // tab 1 别人的视频 → 提取 + 跳爆款改写 / 只提取切 tab 4
  // tab 2 我自己录的 → 跳录音改写
  // tab 3 今天的热点 → 拍这条 / 自粘热点 → 跳热点改写
  // tab 4 已写好的文案 → 做数字人 / 次"爆款改写洗一下"
  // D-095: 模板/草稿 skill 带 seed 进来时 (hot-topic/topic/viral), 默认 plainText tab
  // 让 textarea 直接显示, 否则用户进 videoLink tab 看到的是粘链接框, script seed 看不见.
  // 用 useEffect 而非 useState 初值: PageMakeV2 useEffect 异步设入 seedFrom/script,
  // useState 初值取的是 mount 时刻的空值, 跟不上.
  const [activeTab, setActiveTab] = React.useState("videoLink");
  React.useEffect(() => {
    if (seedFrom || (script && script.trim())) {
      setActiveTab("plainText");
    }
  }, [seedFrom, script]);
  const [extractedBanner, setExtractedBanner] = React.useState(null); // {url, charCount} — tab 4 顶部 banner
  const [tab1Url, setTab1Url] = React.useState("");
  const [tab2Transcript, setTab2Transcript] = React.useState("");
  const [tab3SelfHot, setTab3SelfHot] = React.useState("");
  const uploadInputRef = React.useRef(null);

  const URL_PATTERN = /https?:\/\/[^\s]+|v\.douyin\.com\/[a-zA-Z0-9]+|xhslink\.com\/[a-zA-Z0-9]+|b23\.tv\/[a-zA-Z0-9]+/;

  const [extracting, setExtracting] = React.useState(false);
  const [extractMsg, setExtractMsg] = React.useState("");

  // tab 1 ASR 提取 — mode: "wash" (提完跳爆款改写) / "only" (提完切 tab 4)
  async function doExtract(rawText, mode) {
    const trimmed = (rawText || "").trim();
    if (!trimmed || extracting) return;
    const m = trimmed.match(URL_PATTERN);
    if (!m) {
      setExtractMsg("没找到链接, 请确认是抖音/小红书/B 站链接");
      return;
    }
    const urlToSubmit = m[0];
    setExtracting(true);
    setExtractMsg(`已提交 · 小华正在转写 · 通常 1-3 分钟...`);
    try {
      const sub = await api.post("/api/transcribe/submit", { url: urlToSubmit });
      const batchId = sub.batch_id;
      for (let i = 0; i < 60; i++) {
        await new Promise(s => setTimeout(s, 5000));
        try {
          const q = await api.get(`/api/transcribe/query/${batchId}`);
          const okStatus = ["succeed", "success", "done", "ok"].includes(q.status);
          if (okStatus && q.text) {
            const text = q.text;
            setExtractMsg(`✓ 提取了 ${text.length} 字 · ${q.title || ""}`);
            setExtracting(false);
            if (mode === "wash") {
              // 提完直接跳爆款改写, 让用户在 baokuan 页选模式 + 出版本
              try {
                localStorage.setItem("baokuan_seed_text", text);
                localStorage.setItem("baokuan_seed_auto_analyze", "1");
                setFromMake("baokuan");
              } catch (_) {}
              onNav("baokuan");
            } else {
              // 只提取: 切 tab 4 + 填 script + 显 banner
              setScript(text);
              setExtractedBanner({ url: urlToSubmit, charCount: text.length });
              setActiveTab("plainText");
            }
            return;
          }
          if (q.status === "failed") {
            setExtractMsg(`提取失败: ${q.error || "(无 detail)"}`);
            return;
          }
          setExtractMsg(`等转写... ${q.status} (已 ${(i + 1) * 5}s)`);
        } catch (_) {}
      }
      setExtractMsg("等了 5 分钟还没出, 换个链接或去 ⚙️ 设置看");
    } catch (e) { setExtractMsg(`提取失败: ${e.message}`); }
    finally { setExtracting(false); }
  }

  // tab 2 主按钮: 跳录音改写
  function jumpVoiceRewrite(text) {
    const t = (text || "").trim();
    if (!t) return;
    try {
      localStorage.setItem("voicerewrite_seed_transcript", t);
      setFromMake("voicerewrite");
    } catch (_) {}
    onNav("voicerewrite");
  }

  // tab 3 自粘热点 主按钮: 跳热点改写
  function jumpHotRewriteFromText(text) {
    const t = (text || "").trim();
    if (!t) return;
    try {
      localStorage.setItem("hotrewrite_seed_hotspot", t);
      setFromMake("hotrewrite");
    } catch (_) {}
    onNav("hotrewrite");
  }

  // tab 4 次按钮 "爆款改写洗一下": 跳爆款改写
  function jumpBaokuanFromText(text) {
    const t = (text || "").trim();
    if (!t) return;
    try {
      localStorage.setItem("baokuan_seed_text", t);
      setFromMake("baokuan");
    } catch (_) {}
    onNav("baokuan");
  }

  function startFromComposer() {
    const t = (script || "").trim();
    if (!t || extracting) return;
    if (t.match(URL_PATTERN)) {
      setTab1Url(t);
      doExtract(t, "wash");
      return;
    }
    setScript(t);
    onNext();
  }

  function handleUploadPick(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setExtractMsg(`已选 ${file.name} · 当前先把转写文字粘进来, 文件直传会接到这里`);
    e.target.value = "";
  }

  const composerText = (script || "").trim();
  const composerReady = composerText.length > 0 && !extracting;

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto" }}>
      {seedFrom && (
        <div style={{
          marginBottom: 18, padding: "10px 14px", background: "#fff",
          border: `1px solid ${T.borderSoft}`, borderRadius: 12,
          display: "flex", alignItems: "center", gap: 10, fontSize: 13,
          boxShadow: "0 8px 20px rgba(54, 43, 27, 0.035)",
        }}>
          <span style={{ fontSize: 16 }}>✨</span>
          <span style={{ flex: 1 }}>
            从 <b>{MAKE_V2_SKILL_NAMES[seedFrom.skill] || seedFrom.skill}</b> 带过来的文案已自动填入
            {seedFrom.title && <span style={{ color: T.muted, marginLeft: 6 }}>· {seedFrom.title}</span>}
          </span>
          <button onClick={onDismissSeed}
            style={{ background: "transparent", border: "none", color: T.muted2, cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}>×</button>
        </div>
      )}

      <div style={{ textAlign: "center", margin: "30px 0 18px" }}>
        <div style={{ fontSize: "clamp(28px, 3vw, 34px)", fontWeight: 900, color: T.text, letterSpacing: 0, lineHeight: 1.2 }}>
          把素材丢进来 ↓
        </div>
        <div style={{ marginTop: 8, fontSize: 14, color: T.muted, fontWeight: 600 }}>
          链接 · 文案 · 录音 一律识别
        </div>
      </div>

      <div style={{
        background: "#fff", border: `2px solid ${T.brand}`,
        boxShadow: `0 0 0 7px ${T.brandSoft}`,
        borderRadius: 20, padding: "28px 32px 20px",
        marginBottom: 36,
      }}>
        <textarea
          value={script}
          onChange={e => setScript(e.target.value)}
          placeholder={"粘抖音 / 小红书 / B 站链接...\n或者把已经写好的文案贴进来\n或者上传一段录音"}
          rows={10}
          style={{
            width: "100%", minHeight: 290, padding: 0, border: "none",
            fontSize: 18, fontWeight: 600, fontFamily: "inherit", outline: "none",
            resize: "vertical", lineHeight: 1.7, background: "transparent",
            color: T.text,
          }} />
        <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 14, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <input ref={uploadInputRef} type="file" accept="audio/*,video/*,.txt,.md" onChange={handleUploadPick} style={{ display: "none" }} />
          <MakeInputToolButton onClick={() => onNav("voicerewrite")}>🎙 录音</MakeInputToolButton>
          <MakeInputToolButton onClick={() => uploadInputRef.current && uploadInputRef.current.click()}>📎 上传</MakeInputToolButton>
          <MakeInputToolButton onClick={() => setExtractMsg("可以直接从下面热点列表点“用”, 或把自己的选题粘进来")}>📚 选题库</MakeInputToolButton>
          <MakeInputToolButton onClick={() => onNav("materials")}>◻ 我的素材</MakeInputToolButton>
          {extractMsg && (
            <span style={{
              minWidth: 180, fontSize: 12.5, color: extractMsg.startsWith("✓") ? T.brand : extractMsg.startsWith("提取失败") || extractMsg.startsWith("没找到") ? T.red : T.muted,
              lineHeight: 1.5, flex: "1 1 220px",
            }}>
              {extractMsg}
            </span>
          )}
          <button onClick={startFromComposer} disabled={!composerReady} style={{
            marginLeft: "auto", minWidth: 132, height: 50, padding: "0 28px",
            borderRadius: 12, border: "none",
            background: composerReady ? T.brand : T.muted3,
            color: "#fff", fontSize: 17, fontWeight: 900,
            fontFamily: "inherit", cursor: composerReady ? "pointer" : "not-allowed",
          }}>
            {extracting ? "处理中..." : "开始 →"}
          </button>
        </div>
      </div>

      <HotRankPanel topics={hotTopics} batch={visibleHotTopics} batchIndex={hotBatchIndex}
        batchCount={hotBatchCount} onTake={takeThisHot} onRefresh={reloadHotTopics}
        onNextBatch={nextHotTopicBatch} onNight={() => onNav("nightshift")} />
    </div>
  );

  return (
    <div>
      {/* D-062c: 从其它 skill 跳来的 seed banner */}
      {seedFrom && (
        <div style={{ marginBottom: 16, padding: 12, background: T.brandSoft, border: `1px solid ${T.brand}66`,
                      borderRadius: 8, display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
          <span style={{ fontSize: 16 }}>✨</span>
          <span style={{ flex: 1 }}>
            从 <b>{MAKE_V2_SKILL_NAMES[seedFrom.skill] || seedFrom.skill}</b> 带过来的文案已自动填入
            {seedFrom.title && <span style={{ color: T.muted, marginLeft: 6 }}>· {seedFrom.title}</span>}
          </span>
          <button onClick={onDismissSeed}
            style={{ background: "transparent", border: "none", color: T.muted2, cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}>×</button>
        </div>
      )}

      {/* D-062oo-D: hero + 4-tab segmented (按内容来源分流) */}
      <div style={{ textAlign: "center", margin: "8px 0 24px" }}>
        <div style={{ fontSize: 28, fontWeight: 700, color: T.text, letterSpacing: "-0.02em", marginBottom: 8 }}>
          你要做的视频从哪来? 👇
        </div>
        <div style={{ fontSize: 14, color: T.muted, lineHeight: 1.6 }}>
          选一个起点 · 4 条路最后都汇到做数字人
        </div>
      </div>

      <div style={{
        display: "flex", gap: 4, padding: 4,
        background: T.bg2, borderRadius: 100,
        border: `1px solid ${T.borderSoft}`,
        marginBottom: 18,
      }}>
        {[
          { id: "videoLink", icon: "📹", label: "别人的视频" },
          { id: "myRecord",  icon: "🎙️", label: "我自己录的" },
          { id: "hotPicks",  icon: "🔥", label: "今天的热点" },
          { id: "plainText", icon: "✏️", label: "已写好的文案" },
        ].map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            style={{
              flex: 1, padding: "10px 14px", fontSize: 13.5, fontWeight: 600,
              background: activeTab === t.id ? "#fff" : "transparent",
              color: activeTab === t.id ? T.brand : T.muted,
              border: "none", borderRadius: 100,
              boxShadow: activeTab === t.id ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
              cursor: "pointer", fontFamily: "inherit",
              display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
              whiteSpace: "nowrap",
            }}>
            <span>{t.icon}</span>{t.label}
          </button>
        ))}
      </div>

      {/* ─── Tab 1: 别人的视频 ─── */}
      {activeTab === "videoLink" && (() => {
        const trimmed = tab1Url.trim();
        const m = trimmed.match(URL_PATTERN);
        const url = m ? m[0] : null;
        const isUrlLike = trimmed.length > 0 && trimmed.length < 200 && !!url;
        const isMixed = trimmed.length >= 200 && !!url;
        const isInvalid = trimmed.length > 0 && !url;
        const platform = url ? (
          /douyin/i.test(url) ? "抖音" :
          /xhslink|xiaohongshu/i.test(url) ? "小红书" :
          /b23\.tv|bilibili/i.test(url) ? "B 站" : null
        ) : null;
        return (
          <div>
            <div style={{ marginBottom: 12, fontSize: 13.5, color: T.muted, lineHeight: 1.6 }}>
              你刷到的那条爆款, 贴链接 (或抖音转发文) 给我 — 提取后默认洗成你的版本
            </div>
            <div style={{
              background: "#fff", border: `1.5px solid ${T.brand}`,
              boxShadow: `0 0 0 5px ${T.brandSoft}`,
              borderRadius: 16, padding: 18, marginBottom: 16,
            }}>
              <textarea
                value={tab1Url}
                onChange={e => setTab1Url(e.target.value)}
                placeholder="粘抖音/小红书/B 站链接, 或者抖音转发文 (我会自动找链接)..."
                rows={5}
                style={{
                  width: "100%", padding: 12, border: "none",
                  fontSize: 14.5, fontFamily: "inherit", outline: "none",
                  resize: "vertical", lineHeight: 1.75, background: "transparent",
                  color: T.text, minHeight: 100,
                }} />
              <div style={{ marginTop: 10, paddingTop: 12, borderTop: `1px solid ${T.borderSoft}`,
                            display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", minHeight: 28 }}>
                {trimmed.length === 0 ? (
                  <span style={{ fontSize: 12, color: T.muted2 }}>↑ 把链接粘上面</span>
                ) : isUrlLike ? (
                  <>
                    <Tag size="xs" color="blue">🔗 看起来是短视频链接</Tag>
                    {platform && <Tag size="xs" color="gray">来源: {platform}</Tag>}
                  </>
                ) : isMixed ? (
                  <>
                    <Tag size="xs" color="blue">🔗 转发文里有链接</Tag>
                    {platform && <Tag size="xs" color="gray">来源: {platform}</Tag>}
                    <span style={{ fontSize: 11, color: T.muted2, fontFamily: "SF Mono, monospace" }}>
                      {url.slice(0, 50)}{url.length > 50 ? "..." : ""}
                    </span>
                  </>
                ) : (
                  <Tag size="xs" color="amber">⚠ 没找到链接 — 文案请切到 ✏️ 已写好的文案</Tag>
                )}
              </div>
              {extractMsg && (
                <div style={{ marginTop: 8, fontSize: 12, color: extractMsg.startsWith("✓") ? T.brand : extractMsg.startsWith("提取失败") || extractMsg.startsWith("没找到") ? T.red : T.muted, lineHeight: 1.5 }}>
                  {extractMsg}
                </div>
              )}
              <div style={{ marginTop: 14, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                {trimmed.length === 0 ? (
                  <button disabled style={{
                    padding: "10px 24px", fontSize: 14, fontWeight: 600,
                    background: T.muted3, color: "#fff",
                    border: "none", borderRadius: 100,
                    cursor: "not-allowed", fontFamily: "inherit",
                  }}>↑ 先粘链接</button>
                ) : isInvalid ? (
                  <button disabled style={{
                    padding: "10px 24px", fontSize: 14, fontWeight: 600,
                    background: T.muted3, color: "#fff",
                    border: "none", borderRadius: 100,
                    cursor: "not-allowed", fontFamily: "inherit",
                  }}>↑ 这里只接链接</button>
                ) : (
                  <>
                    <button onClick={() => doExtract(tab1Url, "wash")} disabled={extracting} style={{
                      padding: "10px 22px", fontSize: 14, fontWeight: 600,
                      background: extracting ? T.muted3 : T.brand, color: "#fff",
                      border: "none", borderRadius: 100,
                      cursor: extracting ? "not-allowed" : "pointer", fontFamily: "inherit",
                    }}>{extracting ? "提取中..." : "📎 提取并洗成我的爆款 →"}</button>
                    <button onClick={() => doExtract(tab1Url, "only")} disabled={extracting} style={{
                      padding: "9px 18px", fontSize: 13, fontWeight: 500,
                      background: "#fff", color: T.muted,
                      border: `1px solid ${T.border}`, borderRadius: 100,
                      cursor: extracting ? "not-allowed" : "pointer", fontFamily: "inherit",
                    }}>📎 只提取不洗</button>
                    <span style={{ fontSize: 11, color: T.muted2, flex: 1 }}>
                      小华转写 · 通常 1-3 分钟
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ─── Tab 2: 我自己录的 ─── */}
      {activeTab === "myRecord" && (() => {
        const len = tab2Transcript.trim().length;
        return (
          <div>
            <div style={{ marginBottom: 12, fontSize: 13.5, color: T.muted, lineHeight: 1.6 }}>
              你录的那段音, 贴 <b>转写后的文字</b> 给我 — 我帮你删口头禅、加结构、不改观点
            </div>
            <div style={{
              background: "#fff", border: `1.5px solid ${T.brand}`,
              boxShadow: `0 0 0 5px ${T.brandSoft}`,
              borderRadius: 16, padding: 18, marginBottom: 12,
            }}>
              <textarea
                value={tab2Transcript}
                onChange={e => setTab2Transcript(e.target.value)}
                placeholder="把录音转写后的文字贴这里, 至少 50 字, 200-1500 字效果最好..."
                rows={8}
                style={{
                  width: "100%", padding: 12, border: "none",
                  fontSize: 14.5, fontFamily: "inherit", outline: "none",
                  resize: "vertical", lineHeight: 1.75, background: "transparent",
                  color: T.text, minHeight: 160,
                }} />
              <div style={{ marginTop: 10, paddingTop: 12, borderTop: `1px solid ${T.borderSoft}`,
                            display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", minHeight: 28 }}>
                {len === 0 ? (
                  <span style={{ fontSize: 12, color: T.muted2 }}>↑ 把转写文字粘上面</span>
                ) : (
                  <>
                    <Tag size="xs" color="gray">{len} 字</Tag>
                    <Tag size="xs" color={len > 1500 ? "amber" : "blue"}>~{Math.round(len / 3.5)} 秒口播</Tag>
                    {len < 50 && <Tag size="xs" color="amber">⚠ 太短, 抓不到结构</Tag>}
                    {len > 2000 && <Tag size="xs" color="amber">⚠ 偏长, 建议拆段</Tag>}
                  </>
                )}
              </div>
              <div style={{ marginTop: 14, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                {len === 0 ? (
                  <button disabled style={{
                    padding: "10px 24px", fontSize: 14, fontWeight: 600,
                    background: T.muted3, color: "#fff",
                    border: "none", borderRadius: 100,
                    cursor: "not-allowed", fontFamily: "inherit",
                  }}>↑ 先填转写</button>
                ) : (
                  <>
                    <button onClick={() => jumpVoiceRewrite(tab2Transcript)} style={{
                      padding: "10px 22px", fontSize: 14, fontWeight: 600,
                      background: T.brand, color: "#fff",
                      border: "none", borderRadius: 100,
                      cursor: "pointer", fontFamily: "inherit",
                    }}>✏️ 帮我整理这段口播 →</button>
                    <span style={{ fontSize: 11, color: T.muted2, flex: 1 }}>
                      跳录音改写 → 出整理稿 → 一键带回做数字人
                    </span>
                  </>
                )}
              </div>
            </div>
            <div style={{
              padding: 12, background: T.bg2, border: `1px solid ${T.borderSoft}`,
              borderRadius: 8, fontSize: 12.5, color: T.muted, lineHeight: 1.7, marginBottom: 16,
            }}>
              <span style={{ fontSize: 14 }}>💡</span> <b style={{ color: T.text }}>还没转写?</b> 推荐去 <span style={{ color: T.brand, fontWeight: 500 }}>飞书妙记</span> / <span style={{ color: T.brand, fontWeight: 500 }}>讯飞听见</span> 转一下再贴回来 (录音文件直传暂不支持)
            </div>
          </div>
        );
      })()}

      {/* ─── Tab 3: 今天的热点 (复用 HotPickCard 卡组 + 自粘热点) ─── */}
      {activeTab === "hotPicks" && (
        <div>
          <div style={{ marginBottom: 12, fontSize: 13.5, color: T.muted, lineHeight: 1.6 }}>
            小华今天给你选的 — 拍这条直接进改写流, 也可以自己粘一条
          </div>
          {hotTopics === null ? (
            <div style={{ padding: 24, textAlign: "center", color: T.muted2, fontSize: 13 }}>
              等小华喘口气 · 加载中...
            </div>
          ) : hotTopics.length === 0 ? (
            <div style={{ marginBottom: 16 }}>
              <NightHotFlywheel onTopics={() => {
                reloadHotTopics();
              }} />
            </div>
          ) : (
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: T.text }}>
                  热点雷达 · 大新闻 / 行业 / 本地
                </span>
                <span style={{ fontSize: 11, color: T.muted2 }}>
                  第 {hotBatchIndex + 1}/{hotBatchCount} 批 · 来自热点库
                </span>
                <div style={{ flex: 1 }} />
                <button onClick={nextHotTopicBatch}
                  style={{ background: T.brandSoft, border: "none", color: T.brand, cursor: "pointer", fontSize: 11.5, fontWeight: 700, padding: "6px 12px", borderRadius: 100, fontFamily: "inherit" }}>
                  换一批
                </button>
                <button onClick={() => onNav("materials")}
                  style={{ background: "transparent", border: "none", color: T.muted2, cursor: "pointer", fontSize: 11.5, fontFamily: "inherit" }}>
                  去热点库 →
                </button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {visibleHotTopics.map((t, idx) => (
                  <HotRadarCard key={t.id || `${t.title}-${idx}`} t={t} idx={idx} onTake={() => takeThisHot(t)} onSeed={() => pickHotTopic(t)} />
                ))}
              </div>
            </div>
          )}

          {/* 自粘热点 */}
          <div style={{ marginTop: 18, paddingTop: 18, borderTop: `1px dashed ${T.border}` }}>
            <div style={{ marginBottom: 10, fontSize: 13, color: T.muted, fontWeight: 500 }}>
              或: 自己粘一条热点新闻
            </div>
            <div style={{
              background: "#fff", border: `1.5px solid ${T.brand}`,
              boxShadow: `0 0 0 5px ${T.brandSoft}`,
              borderRadius: 16, padding: 18, marginBottom: 16,
            }}>
              <textarea
                value={tab3SelfHot}
                onChange={e => setTab3SelfHot(e.target.value)}
                placeholder="贴新闻链接 / 标题 / 概要, 我帮你拆多角度..."
                rows={3}
                style={{
                  width: "100%", padding: 12, border: "none",
                  fontSize: 14, fontFamily: "inherit", outline: "none",
                  resize: "vertical", lineHeight: 1.75, background: "transparent",
                  color: T.text, minHeight: 60,
                }} />
              <div style={{ marginTop: 12 }}>
                {tab3SelfHot.trim().length === 0 ? (
                  <button disabled style={{
                    padding: "10px 24px", fontSize: 14, fontWeight: 600,
                    background: T.muted3, color: "#fff",
                    border: "none", borderRadius: 100,
                    cursor: "not-allowed", fontFamily: "inherit",
                  }}>↑ 先粘热点</button>
                ) : (
                  <button onClick={() => jumpHotRewriteFromText(tab3SelfHot)} style={{
                    padding: "10px 22px", fontSize: 14, fontWeight: 600,
                    background: T.brand, color: "#fff",
                    border: "none", borderRadius: 100,
                    cursor: "pointer", fontFamily: "inherit",
                  }}>🔥 改成我的角度 →</button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Tab 4: 已写好的文案 ─── */}
      {activeTab === "plainText" && (() => {
        const trimmed = script.trim();
        return (
          <div>
            <div style={{ marginBottom: 12, fontSize: 13.5, color: T.muted, lineHeight: 1.6 }}>
              你自己写好的稿, 贴这里 — 直接做数字人, 或先用爆款公式洗一遍
            </div>
            {extractedBanner && (
              <div style={{
                marginBottom: 12, padding: 12, background: T.brandSoft,
                border: `1px solid ${T.brand}66`, borderRadius: 8,
                display: "flex", alignItems: "center", gap: 10, fontSize: 13,
              }}>
                <span style={{ fontSize: 16 }}>✓</span>
                <span style={{ flex: 1 }}>
                  从 <span style={{ fontFamily: "SF Mono, monospace", color: T.muted, fontSize: 12 }}>{extractedBanner.url}</span> 提取了 <b>{extractedBanner.charCount} 字</b> · 你可以直接做或先洗一遍
                </span>
                <button onClick={() => setExtractedBanner(null)}
                  style={{ background: "transparent", border: "none", color: T.muted2, cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}>×</button>
              </div>
            )}
            <div style={{
              background: "#fff", border: `1.5px solid ${T.brand}`,
              boxShadow: `0 0 0 5px ${T.brandSoft}`,
              borderRadius: 16, padding: 18, marginBottom: 16,
            }}>
              <textarea
                value={script}
                onChange={e => setScript(e.target.value)}
                placeholder="把已经写好的口播文案贴这里..."
                rows={8}
                style={{
                  width: "100%", padding: 12, border: "none",
                  fontSize: 14.5, fontFamily: "inherit", outline: "none",
                  resize: "vertical", lineHeight: 1.75, background: "transparent",
                  color: T.text, minHeight: 160,
                }} />
              <div style={{ marginTop: 10, paddingTop: 12, borderTop: `1px solid ${T.borderSoft}`,
                            display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", minHeight: 28 }}>
                {trimmed.length === 0 ? (
                  <span style={{ fontSize: 12, color: T.muted2 }}>↑ 把草稿粘上面</span>
                ) : (
                  <>
                    <Tag size="xs" color="gray">{trimmed.length} 字</Tag>
                    <Tag size="xs" color={trimmed.length > 600 ? "amber" : "blue"}>~{Math.round(trimmed.length / 3.5)} 秒口播</Tag>
                    {trimmed.length > 600 && (
                      <Tag size="xs" color="amber">⚠ 偏长 · 建议精简 300-500</Tag>
                    )}
                  </>
                )}
                {script && (
                  <button onClick={() => { setScript(""); setExtractedBanner(null); }} title="清空"
                    style={{ background: "transparent", border: "none", color: T.muted2, cursor: "pointer", fontSize: 11, fontFamily: "inherit", marginLeft: "auto" }}>
                    清空
                  </button>
                )}
              </div>
              <div style={{ marginTop: 14, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                {trimmed.length === 0 ? (
                  <button disabled style={{
                    padding: "10px 24px", fontSize: 14, fontWeight: 600,
                    background: T.muted3, color: "#fff",
                    border: "none", borderRadius: 100,
                    cursor: "not-allowed", fontFamily: "inherit",
                  }}>↑ 先粘文案</button>
                ) : (
                  <>
                    <button onClick={onNext} style={{
                      padding: "10px 22px", fontSize: 14, fontWeight: 600,
                      background: T.brand, color: "#fff",
                      border: "none", borderRadius: 100,
                      cursor: "pointer", fontFamily: "inherit",
                    }}>🎬 做数字人 →</button>
                    <button onClick={() => jumpBaokuanFromText(script)} style={{
                      padding: "9px 18px", fontSize: 13, fontWeight: 500,
                      background: "#fff", color: T.muted,
                      border: `1px solid ${T.border}`, borderRadius: 100,
                      cursor: "pointer", fontFamily: "inherit",
                    }}>✍️ 爆款改写洗一下</button>
                    <span style={{ fontSize: 11, color: T.muted2, flex: 1 }}>
                      直接做 / 或者套爆款公式重组
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* D-100: 默认页底部改成热点排行, 选热点直接进入热点改写; 6 个 skill 快捷卡暂隐藏. */}
      <HotRankPanel topics={hotTopics} batch={visibleHotTopics} batchIndex={hotBatchIndex}
        batchCount={hotBatchCount} onTake={takeThisHot} onRefresh={reloadHotTopics}
        onNextBatch={nextHotTopicBatch} onNight={() => onNav("nightshift")} />
    </div>
  );
}

function MakeInputToolButton({ children, onClick }) {
  return (
    <button onClick={onClick} type="button" style={{
      height: 34, padding: "0 14px", borderRadius: 100,
      border: `1px solid ${T.border}`, background: "#fffdfa",
      color: T.muted, fontSize: 13, fontWeight: 800,
      fontFamily: "inherit", cursor: "pointer",
      display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
      boxShadow: "0 2px 8px rgba(54, 43, 27, 0.035)",
    }}>
      {children}
    </button>
  );
}

function HotRankPanel({ topics, batch, batchIndex, batchCount, onTake, onRefresh, onNextBatch, onNight }) {
  const [filter, setFilter] = React.useState("all");
  const ready = Array.isArray(topics);
  const pool = ready ? topics : [];
  const filtered = filter === "industry"
    ? pool.filter(t => t.radar_category === "行业相关" || t.match_persona)
    : filter === "local"
      ? pool.filter(t => t.radar_category === "本地热点")
      : pool;
  const rows = getHotRadarBatch(filtered.length ? filtered : pool, batchIndex);
  const tabCounts = {
    all: HOT_RADAR_BATCH_SIZE,
    industry: HOT_RADAR_BATCH_SIZE,
    local: HOT_RADAR_BATCH_SIZE,
  };
  return (
    <div style={{ margin: "0 0 20px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
        <div style={{ fontSize: 17, fontWeight: 900, color: T.text, display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span>🔥</span>
          <span>没思路？从热点开始</span>
        </div>
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 3,
          padding: 4, borderRadius: 100, background: "#fff",
          border: `1px solid ${T.borderSoft}`,
          boxShadow: "0 5px 14px rgba(54, 43, 27, 0.035)",
        }}>
          {[
            { id: "all", label: `🌐 全网 ${tabCounts.all}` },
            { id: "industry", label: `🎯 行业 ${tabCounts.industry}` },
            { id: "local", label: `📍 本地 ${tabCounts.local}` },
          ].map(t => (
            <button key={t.id} onClick={() => setFilter(t.id)}
              style={{
                height: 28, padding: "0 13px", borderRadius: 100,
                border: "none", background: filter === t.id ? T.amberSoft : "transparent",
                color: filter === t.id ? T.amber : T.muted,
                fontSize: 12.5, fontWeight: 900, fontFamily: "inherit", cursor: "pointer",
              }}>
              {t.label}
            </button>
          ))}
        </div>
        <button onClick={onNextBatch} style={{
          marginLeft: "auto", border: "none", background: "transparent",
          color: T.muted2, fontSize: 12.5, fontWeight: 800,
          fontFamily: "inherit", cursor: "pointer",
        }}>
          换一批 ↻
        </button>
      </div>

      {!ready ? (
        <div style={{
          background: "#fff", border: `1px solid ${T.borderSoft}`,
          borderRadius: 14, overflow: "hidden",
        }}>
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} style={{
              height: 64, borderBottom: i < 5 ? `1px solid ${T.borderSoft}` : "none",
              background: "#fff", opacity: 0.55,
            }} />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <NightHotFlywheel compact onTopics={onRefresh} />
      ) : (
        <div style={{
          background: "#fff", border: `1px solid ${T.borderSoft}`,
          borderRadius: 14, overflow: "hidden",
          boxShadow: "0 10px 24px rgba(54, 43, 27, 0.045)",
        }}>
          {rows.map((t, idx) => (
            <HotRadarListRow
              key={t.id || `${t.title}-${idx}`}
              t={t}
              idx={idx}
              onTake={() => onTake(t)}
              isLast={idx === rows.length - 1}
            />
          ))}
        </div>
      )}

      {ready && rows.length > 0 && (
        <div style={{ marginTop: 10, display: "flex", justifyContent: "flex-end" }}>
          <button onClick={onNight}
            style={{ background: "transparent", border: "none", color: T.muted2, cursor: "pointer", fontSize: 11.5, fontFamily: "inherit" }}>
            去小华夜班看更多 →
          </button>
        </div>
      )}
    </div>
  );
}

function HotRadarListRow({ t, idx, onTake, isLast }) {
  const heat = Math.max(0, Math.min(100, Number(t.heat_score || 0)));
  const reason = t.match_reason || "适合拆成短视频切入点";
  return (
    <div style={{
      minHeight: 72, padding: "12px 20px", display: "grid",
      gridTemplateColumns: "54px minmax(0, 1fr) 60px",
      alignItems: "center", columnGap: 10,
      borderBottom: isLast ? "none" : `1px solid ${T.borderSoft}`,
      background: "#fff",
    }}>
      <div style={{
        justifySelf: "start", height: 22, padding: "0 8px",
        borderRadius: 100, background: T.amberSoft, color: T.amber,
        fontSize: 12, fontWeight: 900, display: "inline-flex",
        alignItems: "center", justifyContent: "center", gap: 2,
      }}>
        <span>🔥</span><span>{heat}</span>
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{
          fontSize: 16, lineHeight: 1.35, fontWeight: 900, color: T.text,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {t.title}
        </div>
        <div style={{
          marginTop: 3, fontSize: 13, color: T.muted, lineHeight: 1.45,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {reason}
        </div>
      </div>
      <button onClick={onTake} style={{
        justifySelf: "end", border: "none", background: "transparent",
        color: T.amber, fontSize: 14, fontWeight: 900,
        fontFamily: "inherit", cursor: "pointer",
      }}>
        用 →
      </button>
    </div>
  );
}

function HotRadarFlameBadge({ heat, compact = false }) {
  return (
    <div style={{
      flex: "0 0 auto",
      display: "inline-flex", alignItems: "center", justifyContent: "center", gap: compact ? 6 : 8,
      minWidth: compact ? 64 : 86, height: compact ? 48 : 54,
      padding: compact ? "0 12px" : "0 16px",
      borderRadius: compact ? 16 : 18,
      background: "#fff",
      border: "1px solid #eee5d8",
      boxShadow: "0 10px 22px rgba(68, 48, 25, 0.08)",
    }}>
      <span style={{ fontSize: compact ? 24 : 26, lineHeight: 1 }}>🔥</span>
      {typeof heat !== "undefined" && (
        <span style={{
          fontSize: compact ? 24 : 28, lineHeight: 1,
          fontWeight: 900, color: "#765f39", letterSpacing: 0,
        }}>
          {heat}
        </span>
      )}
    </div>
  );
}

function HotRadarChip({ children, tone = "gray" }) {
  const palette = {
    pink: { bg: T.pinkSoft, fg: T.pink },
    green: { bg: T.brandSoft, fg: T.brand },
    amber: { bg: T.amberSoft, fg: T.amber },
    blue: { bg: T.blueSoft, fg: T.blue },
    gray: { bg: T.bg3, fg: T.muted },
  };
  const p = palette[tone] || palette.gray;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", height: 28,
      padding: "0 12px", borderRadius: 100, background: p.bg,
      color: p.fg, fontSize: 12.5, fontWeight: 800, whiteSpace: "nowrap",
    }}>
      {children}
    </span>
  );
}

function HotRadarCard({ t, idx, onTake, onSeed }) {
  const heat = Math.max(0, Math.min(100, Number(t.heat_score || 0)));
  const matchPct = t.match_persona
    ? Math.min(99, 88 + (heat % 12))
    : Math.min(82, 58 + (heat % 24));
  const fromNight = t.fetched_from === "night-shift";
  const platform = t.platform || "热点";
  const category = t.radar_category || (idx === 0 ? "大新闻" : idx === 1 ? "行业相关" : "本地热点");
  const categoryTone = category === "大新闻" ? "amber" : category === "行业相关" ? "green" : "blue";
  const trendLabel = idx === 0 ? "今日最热" : idx === 1 ? "行业可借势" : "本地可用";
  const reason = t.match_reason || (t.match_persona
    ? "和你 AI × 中年老板 人设很搭"
    : "适合拆成老板能听懂的短视频切入点");
  return (
    <div style={{
      padding: "22px 26px", borderRadius: 24,
      background: "#fff",
      border: `1px solid ${idx === 0 ? "#e9ddd0" : "#eee7dc"}`,
      minHeight: 148, display: "flex", alignItems: "center", gap: 24,
      flexWrap: "wrap", boxShadow: idx === 0 ? "0 14px 28px rgba(68, 48, 25, 0.06)" : "0 8px 20px rgba(68, 48, 25, 0.03)",
      transition: "all 0.15s",
    }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = "#d9cdbf";
        e.currentTarget.style.boxShadow = "0 16px 34px rgba(68, 48, 25, 0.08)";
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = idx === 0 ? "#e9ddd0" : "#eee7dc";
        e.currentTarget.style.boxShadow = idx === 0 ? "0 14px 28px rgba(68, 48, 25, 0.06)" : "0 8px 20px rgba(68, 48, 25, 0.03)";
      }}>
      <div style={{
        width: "clamp(82px, 8vw, 108px)", flex: "0 1 108px", display: "flex",
        alignItems: "center", justifyContent: "center",
      }}>
        <HotRadarFlameBadge heat={heat} />
      </div>

      <div style={{ flex: "1 1 360px", minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
          <HotRadarChip tone={categoryTone}>{category}</HotRadarChip>
          <HotRadarChip tone="pink">{platform}</HotRadarChip>
          {t.match_persona ? <HotRadarChip tone="green">✨ 匹配你定位</HotRadarChip> : <HotRadarChip tone="gray">可借势</HotRadarChip>}
          <span style={{ color: T.muted2, fontSize: 18, lineHeight: 1 }}>·</span>
          <HotRadarChip tone={idx === 0 ? "amber" : "gray"}>{trendLabel}</HotRadarChip>
          {fromNight && <HotRadarChip tone="amber">夜班</HotRadarChip>}
          <span style={{ fontSize: 11.5, color: t.match_persona ? T.brand : T.muted2, fontWeight: 800 }}>
            {t.match_persona ? `匹配 ${matchPct}%` : "雷达推荐"}
          </span>
        </div>
        <div style={{
          fontSize: 21, fontWeight: 900, color: T.text, lineHeight: 1.35,
          display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
        }}>
          {t.title}
        </div>
        <div style={{
          marginTop: 8, fontSize: 15, color: T.muted, lineHeight: 1.5,
          display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
        }}>
          {reason}
        </div>
      </div>

      <div style={{
        marginLeft: "auto", flex: "0 0 auto", display: "flex", flexDirection: "column",
        alignItems: "flex-end", justifyContent: "center", gap: 8,
      }}>
        <button onClick={onTake} style={{
          minWidth: 146, height: 56, padding: "0 22px", borderRadius: 16,
          border: "none", background: T.brand, color: "#fff",
          fontSize: 17, fontWeight: 900, fontFamily: "inherit", cursor: "pointer",
          boxShadow: "0 10px 20px rgba(42, 111, 74, 0.16)",
        }}>
          做成视频 <span style={{ marginLeft: 6 }}>→</span>
        </button>
        {onSeed && (
          <button onClick={onSeed} style={{
            border: "none", background: "transparent", color: T.muted2,
            cursor: "pointer", fontSize: 11.5, fontFamily: "inherit",
          }}>
            只塞文案
          </button>
        )}
      </div>
    </div>
  );
}

// C10: 最近作品 mini 卡 (复用入口)
function RecentWorkCard({ w, onReuse }) {
  const statusMap = {
    published: { color: T.green, label: "已发" },
    ready: { color: T.brand, label: "待发" },
    generating: { color: T.amber, label: "合成中" },
    pending: { color: T.muted2, label: "等" },
    failed: { color: T.red, label: "失败" },
  };
  const st = statusMap[w.status] || { color: T.muted2, label: w.status || "" };
  const dateStr = w.created_at
    ? new Date(w.created_at * 1000).toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" })
    : "";
  return (
    <div onClick={onReuse} style={{
      padding: 14, background: "#fff", border: `1px solid ${T.borderSoft}`, borderRadius: 10,
      cursor: "pointer", transition: "all 0.1s",
      display: "flex", flexDirection: "column", gap: 6,
    }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = T.brand; e.currentTarget.style.boxShadow = `0 0 0 3px ${T.brandSoft}`; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = T.borderSoft; e.currentTarget.style.boxShadow = "none"; }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: T.text, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {w.title || `#${w.id}`}
        </span>
        <Tag size="xs" color={w.status === "published" ? "green" : w.status === "ready" ? "brand" : "gray"}>{st.label}</Tag>
      </div>
      <div style={{ fontSize: 11.5, color: T.muted, lineHeight: 1.5,
                    display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
        {w.final_text || "(无文案)"}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10.5, color: T.muted2 }}>
        <span>{dateStr}</span>
        <div style={{ flex: 1 }} />
        <span style={{ color: T.brand, fontWeight: 500 }}>♻️ 用这条 →</span>
      </div>
    </div>
  );
}

function ScriptSkillCard({ skill, onClick }) {
  return (
    <div onClick={onClick} style={{
      padding: 14, background: "#fff", border: `1px solid ${T.borderSoft}`, borderRadius: 10,
      cursor: "pointer", transition: "all 0.1s",
    }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = T.brand; e.currentTarget.style.boxShadow = `0 0 0 3px ${T.brandSoft}`; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = T.borderSoft; e.currentTarget.style.boxShadow = "none"; }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <span style={{ fontSize: 22 }}>{skill.icon}</span>
        <span style={{ fontSize: 14, fontWeight: 600, color: T.text }}>{skill.title}</span>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: T.brand }}>→</span>
      </div>
      <div style={{ fontSize: 11.5, color: T.muted, lineHeight: 1.5 }}>{skill.desc}</div>
    </div>
  );
}

// D-062nn-C2: 热点大卡 (匹配度 + 匹配原因 + 建议渠道 + 拍这条 主按钮)
function HotPickCard({ t, idx, onTake, onSeed }) {
  // 匹配度算法 (前端简单算 — 后端没字段, 等 backend 接 persona embedding 再换):
  // 匹配人设 ✓ → 88-99 高分; 不匹配 → 55-82 中等
  const matchPct = t.match_persona
    ? Math.min(99, 88 + ((t.heat_score || 70) % 12))
    : Math.min(82, 55 + ((t.heat_score || 50) % 28));
  const fromNight = t.fetched_from === "night-shift";
  return (
    <div style={{
      padding: "16px 20px", borderRadius: 12,
      background: fromNight ? "linear-gradient(135deg, #fff8ec 0%, #fff 60%)" : "#fff",
      border: `1px solid ${T.borderSoft}`,
      display: "flex", flexDirection: "column", gap: 10,
    }}>
      {/* 顶部: 序号 + 标题 + 匹配度 */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <span style={{
          minWidth: 26, height: 26, borderRadius: 6,
          background: idx === 0 ? T.brand : T.bg2,
          color: idx === 0 ? "#fff" : T.muted, fontSize: 13, fontWeight: 700,
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        }}>{idx + 1}</span>
        <span style={{ fontSize: 15, fontWeight: 600, color: T.text, flex: 1, lineHeight: 1.5 }}>{t.title}</span>
        <span style={{
          fontSize: 12, fontWeight: 600, color: T.brand,
          padding: "3px 10px", background: T.brandSoft, borderRadius: 4, whiteSpace: "nowrap",
        }}>匹配度 {matchPct}%</span>
      </div>

      {/* 匹配原因 (有就显) */}
      {t.match_reason && (
        <div style={{ fontSize: 12.5, color: T.muted, lineHeight: 1.6, paddingLeft: 38 }}>
          <span style={{
            fontSize: 10.5, color: T.brand, fontWeight: 600,
            padding: "1px 6px", background: T.brandSoft, borderRadius: 3, marginRight: 6,
          }}>匹配原因</span>
          {t.match_reason}
        </div>
      )}

      {/* 底部: 建议渠道 + 只塞文案 + 拍这条 */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, paddingLeft: 38, flexWrap: "wrap" }}>
        <span style={{ fontSize: 11, color: T.muted2 }}>建议渠道:</span>
        {t.platform && <Tag size="xs" color="pink">{t.platform}</Tag>}
        <Tag size="xs" color="blue">短视频</Tag>
        <Tag size="xs" color="purple">朋友圈</Tag>
        {fromNight && <Tag size="xs" color="amber">🌙 夜班</Tag>}
        <div style={{ flex: 1 }} />
        <button onClick={onSeed}
          title="只把热点塞到上面文案区, 自己写"
          style={{ background: "transparent", border: "none", color: T.muted2, cursor: "pointer", fontSize: 11, fontFamily: "inherit" }}>
          只塞文案
        </button>
        <button onClick={onTake} style={{
          padding: "8px 18px", fontSize: 13, fontWeight: 600,
          background: idx === 0 ? T.brand : T.text, color: "#fff",
          border: "none", borderRadius: 100, cursor: "pointer", fontFamily: "inherit",
        }}>📸 拍这条 →</button>
      </div>
    </div>
  );
}

// ─── Step 2 声音 + 数字人 (D-061d) ───────────────────────────
// 业务上"造数字人"是一件事: 选声音 + 选数字人 + 一键 /api/video/submit
// 默认用上次 (从 localStorage 拉, 用户体验是 "用上次的: X 声音 + Y 形象 [换]")
const MAKE_V2_LAST_KEY = "make_v2_last";

function MakeV2StepVoiceDh({ voiceId, setVoiceId, avatarId, setAvatarId, dhVideoPath, setDhVideoPath, script, onPrev, onNext, onNav }) {
  const [speakers, setSpeakers] = React.useState(null);
  const [avatars, setAvatars] = React.useState(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [taskInfo, setTaskInfo] = React.useState(null);  // {video_id, work_id} after submit
  const [pollStatus, setPollStatus] = React.useState(null);
  const [localErr, setLocalErr] = React.useState("");
  // D-062ff: showPickers 删了 — picker 默认就展开 (清华哥反馈: 不应该藏起来)

  // 加载 speakers + avatars
  React.useEffect(() => {
    api.get("/api/speakers").then(setSpeakers).catch(() => setSpeakers([]));
    api.get("/api/avatars").then(setAvatars).catch(() => setAvatars([]));
  }, []);

  // D-062kk: 自动默认勾选 (清华哥反馈: 默认就是勾选的, 不用每次手点)
  // 优先级: 已有 state > localStorage 上次 (在列表里) > 第 1 个
  React.useEffect(() => {
    if (!speakers || voiceId) return;
    let target = null;
    try {
      const last = JSON.parse(localStorage.getItem(MAKE_V2_LAST_KEY) || "{}");
      if (last.voiceId && speakers.some(s => s.id === last.voiceId)) target = last.voiceId;
    } catch (_) {}
    if (!target && speakers.length > 0) target = speakers[0].id;
    if (target) setVoiceId(target);
  }, [speakers]);

  React.useEffect(() => {
    if (!avatars || avatarId) return;
    let target = null;
    try {
      const last = JSON.parse(localStorage.getItem(MAKE_V2_LAST_KEY) || "{}");
      if (last.avatarId && avatars.some(a => a.id === last.avatarId)) target = last.avatarId;
    } catch (_) {}
    if (!target && avatars.length > 0) target = avatars[0].id;
    if (target) setAvatarId(target);
  }, [avatars]);

  function rememberDefault() {
    try {
      localStorage.setItem(MAKE_V2_LAST_KEY, JSON.stringify({ voiceId, avatarId }));
    } catch (_) {}
  }

  async function startGenerate() {
    setLocalErr("");
    if (!script.trim()) { setLocalErr("文案空了, 回 Step 1 填"); return; }
    if (!voiceId) { setLocalErr("先选一个声音"); return; }
    if (!avatarId) { setLocalErr("先选一个数字人形象"); return; }

    setSubmitting(true);
    try {
      const r = await api.post("/api/video/submit", {
        text: script,
        speaker_id: voiceId,
        avatar_id: avatarId,
        title: script.slice(0, 24),
      });
      setTaskInfo(r);
      rememberDefault();
    } catch (e) {
      setLocalErr(e.message || "提交失败");
    } finally {
      setSubmitting(false);
    }
  }

  // 轮询合成进度
  React.useEffect(() => {
    if (!taskInfo?.video_id) return;
    let stop = false;
    async function poll() {
      try {
        const r = await api.get(`/api/video/query/${taskInfo.video_id}`);
        if (stop) return;
        setPollStatus(r);
        if (r.status === "ok" || r.status === "done" || r.local_path || r.local_url) {
          // 完成: 拿 local_path
          if (r.local_path) {
            setDhVideoPath(r.local_path);
          } else if (taskInfo.work_id) {
            // 通过 work_id 拿绝对路径
            const wlp = await api.get(`/api/works/${taskInfo.work_id}/local-path`);
            if (wlp.local_path) setDhVideoPath(wlp.local_path);
          }
        } else {
          setTimeout(poll, 5000);  // 每 5s 轮询
        }
      } catch (e) {
        if (!stop) setLocalErr(e.message);
      }
    }
    poll();
    return () => { stop = true; };
  }, [taskInfo]);

  // D-062jj: backend /api/speakers 返回 {id, title}, 不是 speaker_id (前端字段名错了)
  const speaker = speakers?.find(s => s.id === voiceId);
  const avatar = avatars?.find(a => a.id === avatarId);
  const ready = !!speaker && !!avatar;
  const generating = !!taskInfo && !dhVideoPath;
  const done = !!dhVideoPath;

  return (
    <div>
      {/* D-062kk: 大卡片 hero (参照清华哥图16 风格) — 声音 / 数字人 各一区, 上下堆叠 */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 24, fontWeight: 700, color: T.text, marginBottom: 4 }}>用什么声音念? 🎙️</div>
        <div style={{ fontSize: 13, color: T.muted, marginBottom: 16 }}>
          {voiceId ? "已默认勾选, 不喜欢点别的换" : "下面挑一个 · 默认推荐第一个"}
        </div>
        <BigPickerColumn loading={!speakers}
          items={speakers || []} idKey="id" titleKey="title" iconDefault="🎙️"
          selectedId={voiceId} onSelect={setVoiceId} kind="voice"
          emptyTip="还没有克隆声音 · 上传 1 段你的录音 (≥ 10s) 克隆专属音色"
          emptyAction={onNav ? { label: "去 ⚙️ 设置 · 克隆样本上传", onClick: () => onNav("settings") } : null} />
      </div>

      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 24, fontWeight: 700, color: T.text, marginBottom: 4 }}>用哪个数字人形象? 👤</div>
        <div style={{ fontSize: 13, color: T.muted, marginBottom: 16 }}>
          {avatarId ? "已默认勾选, 不喜欢点别的换" : "下面挑一个 · 默认推荐第一个"}
        </div>
        <BigPickerColumn loading={!avatars}
          items={avatars || []} idKey="id" titleKey="title" iconDefault="👤"
          selectedId={avatarId} onSelect={setAvatarId} kind="avatar"
          emptyTip="还没数字人形象 · 录一段 30 秒自拍视频上传训练, 3-5 分钟后小华就能用了"
          emptyAction={{ label: "📋 复制操作步骤", onClick: () => {
            navigator.clipboard?.writeText("登录柿榴后台 → 数字人管理 → 创建 → 上传 30s 自拍视频 → 等 3-5 分钟训练完");
          }}} />
      </div>

      {/* 合成结果区 */}
      <div style={{ background: "#fff", border: `1px solid ${T.borderSoft}`, borderRadius: 12, padding: 16 }}>
        {done ? (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <span style={{ fontSize: 18 }}>✅</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>数字人视频已生成</div>
                <div style={{ fontSize: 11, color: T.muted2, marginTop: 2 }}>下一步选模板 / 直接做成片</div>
              </div>
            </div>
            <button onClick={() => { setTaskInfo(null); setDhVideoPath(""); setPollStatus(null); }}
              style={{ background: "transparent", border: "none", color: T.muted, cursor: "pointer", fontSize: 11, fontFamily: "inherit", textDecoration: "underline" }}>
              重新生成
            </button>
          </div>
        ) : generating ? (
          <div style={{ textAlign: "center", padding: 16 }}>
            <div style={{ fontSize: 26, marginBottom: 8 }}>⚙️</div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>小华正在合成你的数字人...</div>
            <div style={{ fontSize: 11, color: T.muted, marginTop: 4 }}>通常 30-90s 完成 · 合成完自动进下一步</div>
          </div>
        ) : (
          <Btn variant="primary" size="lg" onClick={startGenerate} disabled={!ready || submitting}
            style={{ width: "100%" }}>
            {submitting ? "提交中…" : ready ? "▶ 一键造数字人" : "↑ 先选声音 + 数字人"}
          </Btn>
        )}

        {/* 过渡占位: 跳过合成直接填现成视频路径 (power user 入口) */}
        {!done && !generating && (
          <details style={{ marginTop: 14 }}>
            <summary style={{ fontSize: 11, color: T.muted2, cursor: "pointer" }}>· · · 或者跳过合成, 直接用现成的数字人视频</summary>
            <input value={dhVideoPath} onChange={e => setDhVideoPath(e.target.value)}
              placeholder="/Users/.../works/xxx.mp4"
              style={{ marginTop: 6, width: "100%", padding: "8px 10px", border: `1px solid ${T.border}`, borderRadius: 6, fontSize: 12, fontFamily: "SF Mono, monospace", outline: "none", background: "#fff" }} />
          </details>
        )}
      </div>

      {/* D-062cc: 友好化错误 */}
      <div style={{ marginTop: 10 }}>
        <ErrorBanner err={localErr} actions={localErr ? [
          { label: "🔄 重试合成", onClick: () => { setLocalErr(""); startGenerate(); } },
          { label: "× 关闭", onClick: () => setLocalErr("") },
        ] : null} />
      </div>

      <div style={{ marginTop: 18, display: "flex", gap: 10, justifyContent: "space-between" }}>
        <Btn variant="outline" onClick={onPrev}>← 改文案</Btn>
        <Btn variant="primary" onClick={onNext} disabled={!dhVideoPath.trim()}>
          {dhVideoPath.trim() ? "下一步: 选模板 →" : "↑ 等数字人完成"}
        </Btn>
      </div>
    </div>
  );
}

// D-062kk: 大卡片 picker (参照清华哥图16 风格)
// 每张卡: 圆点 + 大标题 + 推荐/已保存/默认 tag + 描述行 + 试听按钮
// kind: "voice" | "avatar" — 决定试听按钮文案 + 描述生成
function BigPickerColumn({ items, selectedId, onSelect, loading, emptyTip, emptyAction, idKey, titleKey, iconDefault, kind }) {
  if (loading) {
    return <div style={{ padding: 30, textAlign: "center", color: T.muted2, background: "#fff", border: `1px solid ${T.borderSoft}`, borderRadius: 12 }}>加载中…</div>;
  }
  if (!items || items.length === 0) {
    return (
      <div style={{ padding: 20, background: T.bg2, borderRadius: 12, border: `1px dashed ${T.border}` }}>
        <div style={{ fontSize: 13, color: T.muted, marginBottom: emptyAction ? 12 : 0, lineHeight: 1.7 }}>{emptyTip}</div>
        {emptyAction && (
          <Btn size="sm" variant="primary" onClick={emptyAction.onClick}>{emptyAction.label}</Btn>
        )}
      </div>
    );
  }

  function describe(item, idx) {
    if (kind === "voice") {
      if (idx === 0) return "30 秒样本 · 音色自然, 保留你原来的语气";
      return `备用音色 · #${item[idKey]}`;
    }
    if (kind === "avatar") {
      if (idx === 0) return "常用形象 · 室内自然光, 上半身 · 适合多数场景";
      return `备用形象 · #${item[idKey]}`;
    }
    return `#${item[idKey]}`;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {items.map((it, idx) => {
        const id = it[idKey];
        const on = id === selectedId;
        const isFirst = idx === 0;
        const title = it[titleKey] || `#${id}`;
        const desc = describe(it, idx);
        return (
          <div key={id} onClick={() => onSelect(id)}
            style={{
              display: "flex", alignItems: "center", gap: 16,
              padding: "16px 20px", borderRadius: 12, cursor: "pointer",
              background: on ? T.brandSoft : "#fff",
              border: `${on ? 2 : 1}px solid ${on ? T.brand : T.borderSoft}`,
              transition: "all 0.1s",
              boxShadow: on ? `0 0 0 4px ${T.brandSoft}66` : "none",
            }}>
            {/* radio dot 大版 */}
            <div style={{
              width: 22, height: 22, borderRadius: "50%",
              border: `2px solid ${on ? T.brand : T.muted2}`,
              background: on ? T.brand : "transparent", flexShrink: 0,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>{on && <div style={{ width: 9, height: 9, borderRadius: "50%", background: "#fff" }} />}</div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                <span style={{ fontSize: 16, fontWeight: 700, color: T.text }}>{title}</span>
                {isFirst && <Tag size="xs" color="green">推荐</Tag>}
                {on && <Tag size="xs" color="amber">已保存</Tag>}
              </div>
              <div style={{ fontSize: 12.5, color: T.muted, lineHeight: 1.6 }}>{desc}</div>
            </div>

            <button
              onClick={(e) => {
                e.stopPropagation();
                alert(kind === "voice"
                  ? `🔊 试听暂未上线 · 可去 ⚙️ 设置 看声音列表`
                  : `📷 预览暂未上线 · 形象效果会在合成完一起看到`);
              }}
              style={{
                padding: "7px 16px", borderRadius: 100, fontSize: 12,
                background: "#fff", color: T.muted, fontFamily: "inherit",
                border: `1px solid ${T.border}`, cursor: "pointer", flexShrink: 0,
              }}>
              {kind === "voice" ? "▶ 试听" : "▶ 预览"}
            </button>
          </div>
        );
      })}

      {/* 引导加更多 */}
      {items.length < 3 && emptyAction && (
        <div onClick={emptyAction.onClick}
          style={{
            display: "flex", alignItems: "center", gap: 12,
            padding: "14px 20px", borderRadius: 12, cursor: "pointer",
            background: "#fff", border: `1px dashed ${T.border}`,
            color: T.muted2,
          }}>
          <div style={{
            width: 22, height: 22, borderRadius: "50%",
            border: `1.5px dashed ${T.muted3}`, flexShrink: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 13, color: T.muted2,
          }}>+</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13.5, fontWeight: 500, color: T.muted, marginBottom: 2 }}>
              想要更多 {kind === "voice" ? "音色" : "形象"}?
            </div>
            <div style={{ fontSize: 11.5, color: T.muted2 }}>{emptyAction.label}</div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Step 3 选模板 (D-061e · 复用 dhv5 卡片 + "朴素"选项) ────
function MakeV2StepTemplate({ templateId, setTemplateId, onPrev, onNext }) {
  const [templates, setTemplates] = React.useState(null);
  const [filterCategory, setFilterCategory] = React.useState("全部");
  const [filterDuration, setFilterDuration] = React.useState("all");
  const [localErr, setLocalErr] = React.useState("");

  React.useEffect(() => {
    api.get("/api/dhv5/templates")
      .then(r => setTemplates(r.templates || []))
      .catch(e => { setTemplates([]); setLocalErr(e.message); });
  }, []);

  const filtered = !templates ? [] : templates.filter(t => {
    if (filterCategory !== "全部" && t.category !== filterCategory) return false;
    const bucket = DHV5_DURATION_BUCKETS.find(b => b.id === filterDuration) || DHV5_DURATION_BUCKETS[0];
    if (!bucket.test(t.duration_sec || 0)) return false;
    return true;
  });

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 24, fontWeight: 700, color: T.text, marginBottom: 4 }}>选哪个剪辑模板? 🎞️</div>
        <div style={{ fontSize: 13, color: T.muted, marginBottom: 12 }}>
          模板 = 节奏 + 字体/音乐 + 配图 · 同一段数字人套不同模板能出多版
        </div>
      </div>

      {/* 朴素无模板选项 (放最上面 · 升级大卡 同 Step 2 BigPickerColumn 风格) */}
      <div onClick={() => setTemplateId(null)}
        style={{
          marginBottom: 14, padding: "16px 20px",
          background: templateId === null ? T.brandSoft : "#fff",
          border: `${templateId === null ? 2 : 1}px solid ${templateId === null ? T.brand : T.borderSoft}`,
          boxShadow: templateId === null ? `0 0 0 4px ${T.brandSoft}66` : "none",
          borderRadius: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 16,
          transition: "all 0.1s",
        }}>
        {/* radio dot 与 BigPickerColumn 一致 */}
        <div style={{
          width: 22, height: 22, borderRadius: "50%",
          border: `2px solid ${templateId === null ? T.brand : T.muted2}`,
          background: templateId === null ? T.brand : "transparent", flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>{templateId === null && <div style={{ width: 9, height: 9, borderRadius: "50%", background: "#fff" }} />}</div>
        <div style={{ fontSize: 28, flexShrink: 0 }}>📹</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 16, fontWeight: 700, color: T.text }}>朴素 · 不剪辑直接出</span>
            <Tag size="xs" color="amber">最快</Tag>
            {templateId === null && <Tag size="xs" color="green">已选</Tag>}
          </div>
          <div style={{ fontSize: 12.5, color: T.muted, lineHeight: 1.6 }}>
            不剪辑 · 不配图 · 数字人视频直接当成片 · 30s 走完
          </div>
        </div>
      </div>

      {/* 筛选 chip */}
      <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
        {DHV5_CATEGORIES.map(c => (
          <button key={c} onClick={() => setFilterCategory(c)}
            style={{
              padding: "4px 12px", fontSize: 11, borderRadius: 100, border: "none",
              fontFamily: "inherit", cursor: "pointer",
              background: filterCategory === c ? T.text : T.bg2,
              color: filterCategory === c ? "#fff" : T.muted,
              fontWeight: filterCategory === c ? 600 : 500,
            }}>{c}</button>
        ))}
      </div>
      <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
        {DHV5_DURATION_BUCKETS.map(b => (
          <button key={b.id} onClick={() => setFilterDuration(b.id)}
            style={{
              padding: "3px 10px", fontSize: 10.5, borderRadius: 100, border: "none",
              fontFamily: "inherit", cursor: "pointer",
              background: filterDuration === b.id ? T.brand : T.bg2,
              color: filterDuration === b.id ? "#fff" : T.muted,
              fontWeight: filterDuration === b.id ? 600 : 500,
            }}>{b.label}</button>
        ))}
      </div>

      {/* D-062cc: 友好化错误 */}
      <ErrorBanner err={localErr} actions={localErr ? [
        { label: "🔄 重试加载", onClick: () => {
          setLocalErr("");
          api.get("/api/dhv5/templates")
            .then(r => setTemplates(r.templates || []))
            .catch(e => { setTemplates([]); setLocalErr(e.message); });
        } },
        { label: "× 关闭", onClick: () => setLocalErr("") },
      ] : null} />

      {/* 模板网格 (复用 PageDhv5 的 DhvTemplateCard) */}
      {!templates ? (
        <div style={{ padding: 30, textAlign: "center", color: T.muted2 }}>加载模板…</div>
      ) : filtered.length === 0 ? (
        // D-062w: 模板空 → 引导朴素模式直接出片 (而非开发者向路径)
        templates.length === 0 ? (
          <div style={{ padding: 20, background: T.brandSoft, border: `1px solid ${T.brand}55`, borderRadius: 10, textAlign: "center" }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>📦</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: T.text, marginBottom: 4 }}>暂无模板可选</div>
            <div style={{ fontSize: 12, color: T.muted, marginBottom: 12, lineHeight: 1.6 }}>
              选上面的「朴素 · 不剪辑直接出」继续, 数字人视频直接当成片发就行
            </div>
            <Btn size="sm" variant="primary" onClick={() => setTemplateId(null)}>👆 用朴素模式继续</Btn>
          </div>
        ) : (
          <div style={{ padding: 30, background: "#fff", border: `1px dashed ${T.border}`, borderRadius: 10, textAlign: "center", color: T.muted, fontSize: 13 }}>
            当前筛选下没匹配的模板 · 换筛选条件 或 用朴素模式
          </div>
        )
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
          {filtered.map(t => (
            <DhvTemplateCard key={t.id} template={t}
              selected={templateId === t.id}
              onSelect={() => setTemplateId(t.id)} />
          ))}
        </div>
      )}

      <div style={{ marginTop: 18, display: "flex", gap: 10, justifyContent: "space-between" }}>
        <Btn variant="outline" onClick={onPrev}>← 改数字人</Btn>
        <Btn variant="primary" onClick={onNext}>
          下一步: 剪辑 →
        </Btn>
      </div>
    </div>
  );
}

// ─── Step 4 剪辑 (D-061f) ────────────────────────────────────
// 复用 PageDhv5 的 align + render UI · 加 B-roll 展开支持 (Dhv5SceneRow)
// 朴素无模板分支: 跳过 align/render, 直接把数字人 mp4 当成片传给 Step 5
function MakeV2StepEdit({ templateId, script, dhVideoPath, alignedScenes, setAlignedScenes, onPrev, onRender }) {
  const [aligning, setAligning] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [localErr, setLocalErr] = React.useState("");
  const [alignMode, setAlignMode] = React.useState("auto");
  const [expandedSceneIdx, setExpandedSceneIdx] = React.useState(null);
  const [generatingBrollIdx, setGeneratingBrollIdx] = React.useState(null);
  const [brollUrls, setBrollUrls] = React.useState({});

  // 朴素无模板 - 直接把 dhVideoPath 当成片
  if (!templateId) {
    return (
      <div>
        <div style={{ marginBottom: 16, padding: 16, background: "#fff", border: `1px solid ${T.borderSoft}`, borderRadius: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: T.text, marginBottom: 6 }}>4. 不剪辑直接出</div>
          <div style={{ fontSize: 12, color: T.muted }}>
            上一步选了「朴素」 · 数字人视频直接当成片, 跳过剪辑进预览
          </div>
        </div>
        <div style={{ padding: 30, background: "#fff", border: `1px solid ${T.borderSoft}`, borderRadius: 12, textAlign: "center" }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>📹</div>
          <div style={{ fontSize: 13, color: T.muted, marginBottom: 14 }}>
            不剪辑模式 · 数字人视频就是最终成片
          </div>
          <video src={api.media(`/media/${dhVideoPath.split('/data/')[1] || ''}`)}
            controls style={{ maxWidth: 360, maxHeight: 360, borderRadius: 6, background: "#000", display: dhVideoPath.includes('/data/') ? "inline-block" : "none" }} />
        </div>
        <div style={{ marginTop: 18, display: "flex", gap: 10, justifyContent: "space-between" }}>
          <Btn variant="outline" onClick={onPrev}>← 改模板</Btn>
          <Btn variant="primary" onClick={() => onRender(`raw:${dhVideoPath}`)}>
            下一步: 预览 →
          </Btn>
        </div>
      </div>
    );
  }

  async function runAlign() {
    if (alignMode === "auto" && !script.trim()) {
      setLocalErr("auto 模式需要文案 (回 Step 1)"); return;
    }
    setAligning(true); setLocalErr("");
    try {
      const r = await api.post("/api/dhv5/align", {
        template_id: templateId,
        transcript: script.trim(),
        mode: alignMode,
      });
      setAlignedScenes(r.scenes || []);
      // 预填 brollUrls (从模板原 top_image/screen_image 推 url)
      const initial = {};
      (r.scenes || []).forEach((s, i) => {
        const t = (s.type || "").toUpperCase();
        const rel = t === "B" ? s.top_image : t === "C" ? s.screen_image : null;
        if (rel) {
          const cleaned = rel.replace(/^assets\/brolls\//, "");
          initial[i] = `/skills/dhv5/brolls/${cleaned}`;
        }
      });
      setBrollUrls(initial);
    } catch (e) {
      setLocalErr(e.message || "对齐失败");
    } finally {
      setAligning(false);
    }
  }

  function updateSceneField(idx, field, value) {
    setAlignedScenes(prev => prev.map((s, i) => i === idx ? { ...s, [field]: value } : s));
  }

  async function generateBroll(idx, regen = false) {
    const scene = alignedScenes[idx];
    const t = (scene.type || "").toUpperCase();
    const promptField = t === "B" ? "top_image_prompt" : "screen_image_prompt";
    const promptInScene = scene[promptField] || "";
    setGeneratingBrollIdx(idx); setLocalErr("");
    try {
      const r = await api.post(
        `/api/dhv5/broll/${templateId}/${idx}?regen=${regen ? 1 : 0}`,
        { prompt_override: promptInScene.trim() }
      );
      setBrollUrls(prev => ({ ...prev, [idx]: r.url + `?t=${Date.now()}` }));
    } catch (e) {
      setLocalErr(e.message || "生图失败");
    } finally {
      setGeneratingBrollIdx(null);
    }
  }

  async function startRender() {
    if (!alignedScenes || alignedScenes.length === 0) {
      setLocalErr("先对齐文案再渲染"); return;
    }
    setSubmitting(true); setLocalErr("");
    try {
      const r = await api.post("/api/dhv5/render", {
        template_id: templateId,
        digital_human_video: dhVideoPath,
        scenes_override: alignedScenes,
      });
      onRender(r.task_id);
    } catch (e) {
      setLocalErr(e.message || "提交失败");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <div style={{ marginBottom: 16, padding: 16, background: "#fff", border: `1px solid ${T.borderSoft}`, borderRadius: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: T.text, marginBottom: 6 }}>4. 剪辑 — 模板 {templateId}</div>
        <div style={{ fontSize: 12, color: T.muted }}>
          AI 把文案切到 scenes · 内联调措辞 + B-roll prompt · 没图自动生
        </div>
      </div>

      {/* D-062gg: 对齐模式从 chip 升级成卡片(带说明) */}
      <div style={{ background: "#fff", border: `1px solid ${T.borderSoft}`, borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>对齐模式</div>
          <span style={{ fontSize: 11.5, color: T.muted2 }}>· 选一个再点对齐</span>
          <div style={{ flex: 1 }} />
          <Btn variant="primary" onClick={runAlign} disabled={aligning}>
            {aligning ? "对齐中…" : (alignedScenes ? "🔄 重新对齐" : "▶ 开始对齐")}
          </Btn>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
          {[
            { id: "auto",        label: "AI 自动切",      desc: "把你的文案智能切到 A/B/C 字幕段, 默认推荐", icon: "🤖" },
            { id: "placeholder", label: "用模板原字段",   desc: "保留模板自带 demo 字幕, 不带你的文案", icon: "📋" },
            { id: "manual",      label: "手动填",         desc: "对齐后逐场景手填, 适合精控", icon: "✏️" },
          ].map(m => {
            const on = alignMode === m.id;
            return (
              <div key={m.id} onClick={() => setAlignMode(m.id)} style={{
                padding: "10px 12px", borderRadius: 8, cursor: "pointer",
                background: on ? T.brandSoft : "#fff",
                border: `1px solid ${on ? T.brand : T.borderSoft}`,
                transition: "all 0.1s",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 16 }}>{m.icon}</span>
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: T.text }}>{m.label}</span>
                  {on && <Tag size="xs" color="green">已选</Tag>}
                </div>
                <div style={{ fontSize: 11, color: T.muted, lineHeight: 1.5 }}>{m.desc}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* D-062cc: 友好化错误 + 重试 CTA */}
      <ErrorBanner err={localErr} actions={localErr ? [
        { label: "🔄 重试", onClick: () => { setLocalErr(""); runAlign(); } },
        { label: "× 关闭", onClick: () => setLocalErr("") },
      ] : null} />

      {alignedScenes && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 18 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>🎬 {alignedScenes.length} 个 scenes · 内联编辑字段 + B-roll</div>
          {alignedScenes.map((s, i) => (
            <Dhv5SceneRow key={i} idx={i} scene={s}
              onChange={(field, v) => updateSceneField(i, field, v)}
              expanded={expandedSceneIdx === i}
              onToggleExpand={() => setExpandedSceneIdx(prev => prev === i ? null : i)}
              brollUrl={brollUrls[i]}
              generating={generatingBrollIdx === i}
              onGenerate={(regen) => generateBroll(i, regen)} />
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: 10, justifyContent: "space-between" }}>
        <Btn variant="outline" onClick={onPrev}>← 改模板</Btn>
        <Btn variant="primary" onClick={startRender} disabled={submitting || !alignedScenes}>
          {submitting ? "提交中…" : "▶ 开始渲染 (3-10 分钟)"}
        </Btn>
      </div>
    </div>
  );
}

// ─── Step 5 预览 + 反馈 (D-061g) ─────────────────────────────
function MakeV2StepPreview({ renderTaskId, setRenderTaskId, templateId, script, onReedit, onNewMp4 }) {
  const [task, setTask] = React.useState(null);

  // 朴素无模板分支: renderTaskId 形如 "raw:/path/to/mp4"
  const isRawMode = typeof renderTaskId === "string" && renderTaskId.startsWith("raw:");
  const rawMp4Path = isRawMode ? renderTaskId.slice(4) : null;

  React.useEffect(() => {
    if (!renderTaskId || isRawMode) return;
    let stop = false;
    async function poll() {
      try {
        const t = await api.get(`/api/tasks/${renderTaskId}`);
        if (stop) return;
        setTask(t);
        if (t.status === "running") setTimeout(poll, 3000);
      } catch (_) {}
    }
    poll();
    return () => { stop = true; };
  }, [renderTaskId, isRawMode]);

  // 朴素模式: 把 task 模拟成已完成
  const status = isRawMode ? "success" : (task?.status || "running");
  const result = isRawMode
    ? { output_path: rawMp4Path, output_url: `/media/${(rawMp4Path || "").split('/data/')[1] || ""}` }
    : (task?.result || null);
  const isDone = status === "success";
  const isFailed = status === "failed" || status === "cancelled";

  return (
    <div style={{ background: "#fff", border: `1px solid ${T.borderSoft}`, borderRadius: 12, padding: 20 }}>
      <div style={{ fontSize: 16, fontWeight: 600, color: T.text, marginBottom: 6 }}>5. 预览 + 发布</div>
      <div style={{ fontSize: 12, color: T.muted, marginBottom: 16 }}>
        看成片 · 不满意留个意见小华回去重剪 · 满意去发布
      </div>

      {!task ? (
        <div style={{ padding: 30, textAlign: "center", color: T.muted2 }}>⏳ 提交中…</div>
      ) : status === "running" ? (
        <div style={{ padding: 30, textAlign: "center" }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>⚙️</div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>渲染中… 已 {task.elapsed_sec || 0}s</div>
          <div style={{ fontSize: 11.5, color: T.muted, marginTop: 6 }}>{task.progress_text || ""}</div>
        </div>
      ) : isFailed ? (
        <div style={{ padding: 16, background: T.redSoft, borderRadius: 8 }}>
          <div style={{ color: T.red, fontWeight: 600, marginBottom: 6 }}>❌ 渲染失败 · 看下面 ▾</div>
          <div style={{ fontSize: 12, color: T.red, marginBottom: 8 }}>
            常见原因: 数字人视频路径失效 / 模板资源缺失 / 网络中断
          </div>
          <details>
            <summary style={{ fontSize: 11, color: T.muted, cursor: "pointer" }}>· · · 点开看技术细节</summary>
            <div style={{ fontSize: 11, fontFamily: "SF Mono, monospace", color: T.red, whiteSpace: "pre-wrap", maxHeight: 200, overflow: "auto", marginTop: 8 }}>{task.error || "(无错误信息)"}</div>
          </details>
        </div>
      ) : isDone && result?.output_url ? (
        <div>
          <video src={api.media(result.output_url)} controls
            style={{ width: "100%", maxHeight: 540, borderRadius: 8, background: "#000", display: "block" }} />
          {result.size_bytes && (
            <div style={{ marginTop: 10, fontSize: 11, color: T.muted2 }}>
              成片大小 {(result.size_bytes / 1024 / 1024).toFixed(1)} MB
            </div>
          )}
        </div>
      ) : null}

      {/* D-061g 修改意见反馈 + 发布 */}
      {isDone && !isRawMode && (
        <FeedbackPanel onReedit={onReedit} />
      )}

      {isDone && (
        <PublishPanel outputPath={result?.output_path} outputUrl={result?.output_url} script={script} />
      )}

      <div style={{ marginTop: 18, display: "flex", gap: 10, justifyContent: "space-between" }}>
        <Btn variant="outline" onClick={onReedit}>{isRawMode ? "← 回剪辑" : "← 回剪辑改对齐"}</Btn>
        {isDone && <Btn variant="outline" onClick={onNewMp4}>♻️ 同 mp4 套别的模板</Btn>}
      </div>
    </div>
  );
}

// ─── D-061g 修改意见反馈 ──────────────────────────────────────
// 用户拍板新加: 不满意留 note, AI 重剪. 当前实现: note 跟着回剪辑步带过去
// 实际"AI 自动改"留更后期 — 现版让用户自己看 note 改对齐字段或 broll prompt
function FeedbackPanel({ onReedit }) {
  const [note, setNote] = React.useState("");
  return (
    <div style={{ marginTop: 16, padding: 16, background: "#fff", border: `1px solid ${T.borderSoft}`, borderRadius: 12 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: T.text, marginBottom: 6 }}>📝 不满意? 留个修改意见</div>
      <div style={{ fontSize: 11.5, color: T.muted, marginBottom: 10 }}>
        例: "第 3 段字幕太长改短点 / 把 b1 那张图换成餐饮场景 / B 段大字换成具体数字"
      </div>
      <textarea
        value={note}
        onChange={e => setNote(e.target.value)}
        placeholder="哪段不满意 / 怎么改 / 字幕换啥词 / 哪张 broll 不对劲..."
        rows={3}
        style={{
          width: "100%", padding: 10, border: `1px solid ${T.borderSoft}`, borderRadius: 6,
          fontSize: 12.5, fontFamily: "inherit", outline: "none", resize: "vertical", lineHeight: 1.6,
        }} />
      <div style={{ marginTop: 10, display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <Btn size="sm" variant="primary" onClick={() => {
          // 把 note 暂存到 localStorage 让剪辑步能拿到
          if (note.trim()) {
            try { localStorage.setItem("make_v2_feedback_note", note); } catch (_) {}
          }
          onReedit();
        }} disabled={!note.trim()}>
          带意见回剪辑步
        </Btn>
      </div>
    </div>
  );
}

// ─── 发布面板 (D-061g + D-062h) ───────────────────────────────
// D-062h: 平台 chip 升级为可操作卡片 — 复制文案 / 复制路径 / 标记已发 (localStorage)
// 不接 OAuth (Phase 4), 不 window.open 平台 URL (URL 易腐烂); 给清华哥手动发的全套素材
function PublishPanel({ outputPath, outputUrl, script }) {
  // 用 outputPath 当 key 存"已发"状态 — 同一条片子在不同平台标记互不影响
  const storeKey = `publish_marks::${outputPath || "anon"}`;
  const [marks, setMarks] = React.useState(() => {
    try { return JSON.parse(localStorage.getItem(storeKey) || "{}"); } catch (_) { return {}; }
  });
  function toggle(plat) {
    setMarks(prev => {
      const next = { ...prev, [plat]: prev[plat] ? null : Date.now() };
      try { localStorage.setItem(storeKey, JSON.stringify(next)); } catch (_) {}
      return next;
    });
  }
  function copy(text) { navigator.clipboard?.writeText(text || ""); }

  // 从 script 抽 title (首句 ≤ 30 字) + 描述 (全文)
  const firstLine = (script || "").split(/[\n。!?!?]/).find(s => s.trim().length >= 4) || "";
  const title = firstLine.trim().slice(0, 30);
  const desc = (script || "").trim();

  // D-062hh: 各平台 "复制平台版" 模板 (title + desc 拼成符合该平台风格的成品)
  // 不接 AI, 模板拼接, 用户复制了再人工微调
  const PLATFORMS = [
    { plat: "抖音",   emoji: "🎵", hint: "≤ 21 字标题 · 加 3-5 个 # 话题",
      format: (t, d) => `${t.slice(0, 21)}\n\n#内容创作 #AI工具 #短视频干货` },
    { plat: "视频号", emoji: "📺", hint: "短描述 · 配 1-2 张封面",
      format: (t, d) => t },
    { plat: "小红书", emoji: "📕", hint: "标题钩子 + 正文加表情符号",
      format: (t, d) => `✨${t}✨\n\n${d.slice(0, 200)}\n\n#内容创作 #AI #干货分享` },
    { plat: "快手",   emoji: "⚡", hint: "口语化标题 · 强 CTA 收口",
      format: (t, d) => `${t}!\n\n${d.slice(0, 120)}` },
    { plat: "B 站",   emoji: "📹", hint: "标题不超过 80 字 · 简介详细",
      format: (t, d) => `${t}\n\n简介: ${d.slice(0, 300)}` },
  ];

  const publishedCount = Object.values(marks).filter(Boolean).length;
  const allSent = publishedCount === PLATFORMS.length;

  // C13: batch 操作 — 一键全发 / 撤销全部
  function markAll() {
    const ts = Date.now();
    const next = {};
    PLATFORMS.forEach(p => { next[p.plat] = ts; });
    setMarks(next);
    try { localStorage.setItem(storeKey, JSON.stringify(next)); } catch (_) {}
  }
  function clearAll() {
    setMarks({});
    try { localStorage.removeItem(storeKey); } catch (_) {}
  }

  return (
    <div style={{ marginTop: 16, padding: 16, background: "#fff", border: `1px solid ${T.borderSoft}`, borderRadius: 12 }}>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 10, gap: 10, flexWrap: "wrap" }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>🚀 多平台发布</div>
        <span style={{ fontSize: 11, color: T.muted2 }}>已发 {publishedCount}/{PLATFORMS.length}</span>
        <div style={{ flex: 1 }} />
        {/* C13: batch 按钮 */}
        {publishedCount > 0 && (
          <button onClick={clearAll}
            style={{ background: "transparent", border: "none", color: T.muted2, cursor: "pointer", fontSize: 11, fontFamily: "inherit" }}>
            撤销全部标记
          </button>
        )}
        {!allSent && (
          <button onClick={markAll}
            style={{
              padding: "5px 12px", fontSize: 11.5, fontWeight: 500,
              background: "#fff", color: T.brand, border: `1px solid ${T.brand}55`,
              borderRadius: 100, cursor: "pointer", fontFamily: "inherit",
            }}>✓ 一键全标已发</button>
        )}
        {outputPath && (
          <a href={outputUrl ? api.media(outputUrl) : "#"} download target="_blank" rel="noreferrer"
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "6px 12px", borderRadius: 100, fontSize: 11.5,
              background: T.text, color: "#fff", textDecoration: "none", fontWeight: 600,
            }}>
            ⬇️ 下载 mp4
          </a>
        )}
      </div>

      {/* 公共素材区: 标题 + 描述, 一键复制 */}
      {desc && (
        <div style={{ marginBottom: 12, padding: 10, background: T.bg2, borderRadius: 8, fontSize: 12, color: T.muted, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ color: T.text, fontWeight: 500 }}>📋 通用素材:</span>
          <Btn size="sm" variant="outline" onClick={() => copy(title)}>复制标题 ({title.length}字)</Btn>
          <Btn size="sm" variant="outline" onClick={() => copy(desc)}>复制全文 ({desc.length}字)</Btn>
          {outputPath && <Btn size="sm" variant="outline" onClick={() => copy(outputPath)}>复制 mp4 路径</Btn>}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {PLATFORMS.map(p => {
          const sent = !!marks[p.plat];
          const [copiedFmt, setCopiedFmt] = [
            // 自管 state 用 useRef 简单起见 (避免在 map 里跑 useState)
            null, null,
          ];
          return (
            <PlatformRow key={p.plat} p={p} sent={sent} marks={marks} toggle={toggle}
              title={title} desc={desc} copy={copy} />
          );
        })}
      </div>

      <div style={{ marginTop: 10, fontSize: 10.5, color: T.muted2, lineHeight: 1.6 }}>
        💡 当前: 手动发 (复制平台版文案 + 下载 mp4 → 各平台 App 上传) · 标记状态记在本地 · Phase 4 接 OAuth 后一键多发
      </div>
    </div>
  );
}

// D-062hh: 单平台行 — 抽出来用 useState 管 "已复制" toast
function PlatformRow({ p, sent, marks, toggle, title, desc, copy }) {
  const [copied, setCopied] = React.useState(false);
  function copyFmt() {
    const text = p.format(title || "", desc || "");
    copy(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  return (
    <div style={{
      padding: "10px 12px", borderRadius: 8,
      background: sent ? T.brandSoft : T.bg2,
      border: `1px solid ${sent ? T.brand + "55" : T.borderSoft}`,
      display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
    }}>
      <span style={{ fontSize: 16 }}>{p.emoji}</span>
      <span style={{ fontSize: 12.5, fontWeight: 600, color: T.text, minWidth: 50 }}>{p.plat}</span>
      <span style={{ fontSize: 10.5, color: T.muted2, flex: 1, minWidth: 140 }}>{p.hint}</span>
      <Btn size="sm" variant={copied ? "soft" : "outline"} onClick={copyFmt} disabled={!title}
        title={!title ? "Step 1 还没填文案 · 没法生成平台版" : `复制 ${p.plat} 优化格式`}>
        {copied ? "✓ 已复制" : (!title ? "↑ 先填文案" : "📋 复制平台版")}
      </Btn>
      <Btn size="sm" variant={sent ? "soft" : "primary"} onClick={() => toggle(p.plat)}>
        {sent ? `✓ 已发 ${new Date(marks[p.plat]).toLocaleTimeString().slice(0, 5)}` : "标记已发"}
      </Btn>
    </div>
  );
}

Object.assign(window, { PageMakeV2 });
