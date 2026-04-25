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
  const [seedFrom, setSeedFrom] = React.useState(null);
  React.useEffect(() => {
    try {
      const seed = localStorage.getItem("make_v2_seed_script");
      const fromRaw = localStorage.getItem("make_v2_seed_from");
      if (seed && !script) {
        setScript(seed);
        if (fromRaw) {
          try { setSeedFrom(JSON.parse(fromRaw)); } catch (_) {}
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
          {err && (
            <div style={{ padding: 12, background: T.redSoft, color: T.red, borderRadius: 10, fontSize: 13, marginBottom: 14 }}>
              ⚠️ {err}
            </div>
          )}

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
      <LiDock context="做视频" />
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
const MAKE_V2_SCRIPT_SKILLS = [
  { id: "hotrewrite",   icon: "🔥", title: "热点改写", desc: "把今日热点改成你视角的口播 · 钩子+反差+金句" },
  { id: "voicerewrite", icon: "🎙️", title: "录音改写", desc: "录音 → 转写 → 改写成口播 (修语序去口头禅)" },
  { id: "ad",           icon: "💰", title: "投流文案", desc: "一个卖点 → 5-10 版投流 (痛/对/步/话/创)" },
  { id: "wechat",       icon: "📄", title: "公众号长文", desc: "方法论长文 (回来后摘金句段做视频)" },
  { id: "moments",      icon: "📱", title: "朋友圈短句", desc: "金句库衍生 N 条 · 适合做超短视频" },
  { id: "planner",      icon: "📋", title: "内容策划", desc: "活动策划 → 策划完去录直播 → 录音改写" },
];

const MAKE_V2_SKILL_NAMES = {
  hotrewrite: "🔥 热点改写", voicerewrite: "🎙️ 录音改写", ad: "💰 投流文案",
  wechat: "📄 公众号", moments: "📱 朋友圈", planner: "📋 内容策划",
  // D-062-AUDIT-2: 素材库直跳来源 (heat / topic)
  "hot-topic": "🔥 热点库", topic: "💡 选题库",
  // D-062-AUDIT-2-todo1: viral 素材直跳 + works 重制
  viral: "🔥 爆款素材", rework: "♻️ 重做作品",
};

function MakeV2StepScript({ script, setScript, onNext, onNav, seedFrom, onDismissSeed }) {
  // D-062a: 当日热点预览 (从 hot_topics 表拉前 3 条)
  const [hotTopics, setHotTopics] = React.useState(null);
  React.useEffect(() => {
    api.get("/api/hot-topics?limit=10")
      .then(items => setHotTopics(items || []))
      .catch(() => setHotTopics([]));
  }, []);

  function pickHotTopic(t) {
    // 一键塞进 textarea 当 prompt seed
    const seed = `# 热点 (来自 ${t.platform || "?"}, 热度 ${t.heat_score})\n${t.title}\n\n${t.match_reason ? "我的角度: " + t.match_reason + "\n\n" : ""}---\n\n口播正文:\n`;
    setScript(seed);
  }

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

      {/* === 文案输入区 (D-062a 置顶最显眼) === */}
      <div style={{ background: "#fff", border: `1px solid ${T.borderSoft}`, borderRadius: 12, padding: 20, marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: T.text }}>1. 文案</div>
          <Tag size="xs" color="gray">{script.length} 字</Tag>
          {script.length > 0 && (
            <Tag size="xs" color={script.length > 600 ? "amber" : "blue"}>~{Math.round(script.length / 3.5)} 秒口播</Tag>
          )}
          {/* D-062-AUDIT-2-todo3: 文案过长警告 (数字人合成成本 ∝ 字数, 平台播放完成率 ∝ 短) */}
          {script.length > 600 && (
            <Tag size="xs" color="amber">⚠ 偏长 · 建议精简 300-500</Tag>
          )}
          <div style={{ flex: 1 }} />
          {script && (
            <button onClick={() => setScript("")} title="清空"
              style={{ background: "transparent", border: "none", color: T.muted2, cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}>
              清空
            </button>
          )}
        </div>
        <textarea
          value={script}
          onChange={e => setScript(e.target.value)}
          placeholder="把口播文案粘贴在这里 · 或者从下面的热点/skill 按钮开始..."
          rows={12}
          style={{
            width: "100%", padding: 16, border: `1px solid ${T.borderSoft}`, borderRadius: 8,
            fontSize: 14, fontFamily: "inherit", outline: "none", resize: "vertical", lineHeight: 1.75,
          }} />

        <div style={{ marginTop: 14, display: "flex", gap: 10, alignItems: "center" }}>
          <Btn variant="primary" onClick={onNext} disabled={!script.trim()}>
            {script.trim() ? "下一步: 声音 + 数字人 →" : "↑ 先填文案"}
          </Btn>
          <span style={{ fontSize: 11, color: T.muted2 }}>
            填好 → 下一步生数字人 mp4
          </span>
        </div>
      </div>

      {/* === 当日热点 2-3 条 (D-062a) === */}
      <div style={{ background: "#fff", border: `1px solid ${T.borderSoft}`, borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>🔥 今日热点</div>
          <Tag size="xs" color="gray">{hotTopics?.length || 0}</Tag>
          <span style={{ fontSize: 11, color: T.muted2 }}>· 点一条一键塞文案区当 seed</span>
          <div style={{ flex: 1 }} />
          <button onClick={() => onNav("materials")}
            style={{ background: "transparent", border: "none", color: T.brand, cursor: "pointer", fontSize: 11, fontFamily: "inherit" }}>
            维护热点 →
          </button>
        </div>
        {!hotTopics ? (
          <div style={{ fontSize: 11.5, color: T.muted2, padding: 10 }}>加载…</div>
        ) : hotTopics.length === 0 ? (
          // D-062i: 飞轮 CTA 替代静态文字
          <NightHotFlywheel onTopics={() => {
            api.get("/api/hot-topics?limit=10").then(items => setHotTopics(items || [])).catch(() => {});
          }} />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {hotTopics.slice(0, 3).map(t => (
              <div key={t.id} onClick={() => pickHotTopic(t)}
                style={{
                  padding: "8px 12px", background: t.fetched_from === "night-shift" ? "linear-gradient(135deg, #fff8ec, #fff)" : T.bg2,
                  border: `1px solid ${T.borderSoft}`, borderRadius: 6, cursor: "pointer",
                  display: "flex", alignItems: "center", gap: 10, fontSize: 12,
                }}>
                <span style={{ fontWeight: 700, color: T.amber, minWidth: 36, fontSize: 13 }}>🔥{t.heat_score || 0}</span>
                {t.platform && <Tag size="xs" color="pink">{t.platform}</Tag>}
                {t.fetched_from === "night-shift" && <Tag size="xs" color="amber">🌙 夜班</Tag>}
                <span style={{ flex: 1, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</span>
                <span style={{ fontSize: 11, color: T.brand, fontWeight: 500, whiteSpace: "nowrap" }}>用这条 →</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* === 6 大文案 skill 按钮 (D-062a 下移 · D-062u/x 锚机制) === */}
      <div style={{ background: "#fff", border: `1px solid ${T.borderSoft}`, borderRadius: 12, padding: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: T.text, marginBottom: 4 }}>📋 或者用专门的文案 skill 写</div>
        <div style={{ fontSize: 11, color: T.muted, marginBottom: 10 }}>
          ✨ 写完点 skill 完成态的"做成视频" CTA, 文案自动带回这里 (跨页 state 已通)
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 10 }}>
          {MAKE_V2_SCRIPT_SKILLS.map(s => (
            <ScriptSkillCard key={s.id} skill={s} onClick={() => {
              // D-062x: 跳出去前留 anchor, skill 内显 banner + CTA 改文案
              setFromMake(s.id);
              onNav(s.id);
            }} />
          ))}
        </div>
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

  // 加载 speakers + avatars + 上次默认
  React.useEffect(() => {
    api.get("/api/speakers").then(setSpeakers).catch(() => setSpeakers([]));
    api.get("/api/avatars").then(setAvatars).catch(() => setAvatars([]));

    if (!voiceId && !avatarId) {
      try {
        const last = JSON.parse(localStorage.getItem(MAKE_V2_LAST_KEY) || "{}");
        if (last.voiceId) setVoiceId(last.voiceId);
        if (last.avatarId) setAvatarId(last.avatarId);
      } catch (_) {}
    }
  }, []);

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
      {/* D-062ff: 标题 + 默认提示 (无 toggle, picker 始终展开) */}
      <div style={{ marginBottom: 14, padding: "14px 16px", background: "#fff", border: `1px solid ${T.borderSoft}`, borderRadius: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: T.text }}>2. 声音 + 数字人</div>
          <span style={{ fontSize: 11.5, color: T.muted }}>· 选中即默认 · localStorage 记住</span>
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 11, color: T.muted2 }}>
            {ready ? `当前: ${speaker?.title || ""} × ${avatar?.title || ""}` : "↓ 选一对开始"}
          </span>
        </div>
      </div>

      {/* D-062ff: 全部声音 + 全部数字人 默认展开, 选中明显高亮 */}
      <div style={{ marginBottom: 16, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <PickerColumn title="🎙️ 声音 (CosyVoice)" loading={!speakers}
          items={speakers?.map(s => ({ id: s.id, label: s.title || `#${s.id}` })) || []}
          selectedId={voiceId} onSelect={setVoiceId}
          emptyTip="还没有克隆声音 · 上传 1 段你的录音 (≥ 10s) 克隆专属音色"
          emptyAction={onNav ? { label: "去 ⚙️ 设置 · 克隆样本上传", onClick: () => onNav("settings") } : null} />
        <PickerColumn title="👤 数字人 (柿榴)" loading={!avatars}
          items={avatars?.map(a => ({ id: a.id, label: a.title || `#${a.id}` })) || []}
          selectedId={avatarId} onSelect={setAvatarId}
          emptyTip="柿榴账号下还没数字人形象 · 去柿榴 Web 后台创建一个 (3-5 分钟 trained)"
          emptyAction={{ label: "📋 复制柿榴操作", onClick: () => {
            navigator.clipboard?.writeText("登录柿榴后台 → 数字人管理 → 创建 → 上传 30s 自拍视频 → 训练");
          }}} />
      </div>

      {/* 合成结果区 */}
      <div style={{ background: "#fff", border: `1px solid ${T.borderSoft}`, borderRadius: 12, padding: 16 }}>
        {done ? (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <span style={{ fontSize: 18 }}>✅</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>数字人 mp4 已生成</div>
                <div style={{ fontSize: 10.5, color: T.muted2, fontFamily: "SF Mono, monospace", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {dhVideoPath}
                </div>
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
            <div style={{ fontSize: 13, fontWeight: 600 }}>柿榴合成中…</div>
            <div style={{ fontSize: 11, color: T.muted, marginTop: 4 }}>
              video_id={taskInfo.video_id} · work_id={taskInfo.work_id}
              {pollStatus && pollStatus.status && ` · status=${pollStatus.status}`}
            </div>
            <div style={{ fontSize: 10.5, color: T.muted2, marginTop: 6 }}>通常 30-90s 完成 · 完成后自动进下一步</div>
          </div>
        ) : (
          <Btn variant="primary" size="lg" onClick={startGenerate} disabled={!ready || submitting}
            style={{ width: "100%" }}>
            {submitting ? "提交中…" : ready ? "▶ 一键造数字人 (柿榴异步)" : "↑ 先选声音 + 数字人"}
          </Btn>
        )}

        {/* 过渡占位: 跳过合成直接填 mp4 路径 */}
        {!done && !generating && (
          <details style={{ marginTop: 14 }}>
            <summary style={{ fontSize: 11, color: T.muted2, cursor: "pointer" }}>· · · 或者跳过合成, 直接填现成 mp4 路径</summary>
            <input value={dhVideoPath} onChange={e => setDhVideoPath(e.target.value)}
              placeholder="/Users/.../works/xxx.mp4 (柿榴出过的)"
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

function PickerColumn({ title, items, selectedId, onSelect, loading, emptyTip, emptyAction }) {
  // D-062ff: header 显数量 + 当前选中 (与 Settings 风格一致)
  const selectedItem = items?.find(it => it.id === selectedId);
  return (
    <div style={{ background: "#fff", border: `1px solid ${T.borderSoft}`, borderRadius: 10, padding: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{title}</div>
        {!loading && items.length > 0 && (
          <Tag size="xs" color="gray">{items.length}</Tag>
        )}
        <div style={{ flex: 1 }} />
        {selectedItem && (
          <span style={{ fontSize: 10.5, color: T.brand, fontWeight: 500 }}>当前: {selectedItem.label}</span>
        )}
      </div>
      {loading ? (
        <div style={{ fontSize: 11, color: T.muted2, textAlign: "center", padding: 16 }}>加载中…</div>
      ) : items.length === 0 ? (
        // D-062v: empty 加 actionable CTA
        <div style={{ padding: 12, background: T.bg2, borderRadius: 8 }}>
          <div style={{ fontSize: 12, color: T.muted2, marginBottom: emptyAction ? 10 : 0, lineHeight: 1.6 }}>{emptyTip}</div>
          {emptyAction && (
            <Btn size="sm" variant="primary" onClick={emptyAction.onClick}>{emptyAction.label}</Btn>
          )}
        </div>
      ) : (
        // D-062ff: 选中明显高亮 (brandSoft + brand border + ✓ + "默认" tag), 其他 hover-able 卡
        <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 320, overflow: "auto" }}>
          {items.map(it => {
            const on = it.id === selectedId;
            return (
              <div key={it.id} onClick={() => onSelect(it.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "10px 12px", borderRadius: 8, cursor: "pointer",
                  background: on ? T.brandSoft : "#fff",
                  border: `1px solid ${on ? T.brand : T.borderSoft}`,
                  transition: "all 0.1s",
                }}>
                {/* radio dot 风格 (与 Settings 一致) */}
                <div style={{
                  width: 16, height: 16, borderRadius: "50%",
                  border: `1.5px solid ${on ? T.brand : T.muted2}`,
                  background: on ? T.brand : "transparent", flexShrink: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>{on && <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#fff" }} />}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: on ? 600 : 500, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.label}</div>
                  <div style={{ fontSize: 10.5, color: T.muted2, fontFamily: "SF Mono, monospace" }}>#{it.id}</div>
                </div>
                {on && <Tag size="xs" color="green">默认</Tag>}
              </div>
            );
          })}
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
      <div style={{ marginBottom: 16, padding: 16, background: "#fff", border: `1px solid ${T.borderSoft}`, borderRadius: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: T.text, marginBottom: 6 }}>3. 选剪辑模板</div>
        <div style={{ fontSize: 12, color: T.muted }}>
          模板 = 节奏骨架 + 字体/音乐 + 配图 prompts · 数字人 mp4 套不同模板出多版
        </div>
      </div>

      {/* 朴素无模板选项 (放最上面) */}
      <div onClick={() => setTemplateId(null)}
        style={{
          marginBottom: 14, padding: 14, background: "#fff",
          border: templateId === null ? `2px solid ${T.brand}` : `1px solid ${T.borderSoft}`,
          boxShadow: templateId === null ? `0 0 0 4px ${T.brandSoft}` : "none",
          borderRadius: 10, cursor: "pointer", display: "flex", alignItems: "center", gap: 14,
        }}>
        <div style={{ fontSize: 28 }}>📹</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: T.text }}>朴素无模板 · 直接出片</div>
          <div style={{ fontSize: 11.5, color: T.muted, marginTop: 3 }}>
            数字人 mp4 不剪辑直接发, 适合"快出片"场景
          </div>
        </div>
        {templateId === null && <Tag size="xs" color="green">已选</Tag>}
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
              选上面的「朴素无模板 · 直接出片」继续 (数字人 mp4 直接发, 不剪辑)
              <br />
              <span style={{ color: T.muted2, fontSize: 11 }}>(后续: 由编导维护 v5 模板包后, 这里会自动出现可选模板)</span>
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
          <div style={{ fontSize: 14, fontWeight: 600, color: T.text, marginBottom: 6 }}>4. 剪辑 — 朴素模式</div>
          <div style={{ fontSize: 12, color: T.muted }}>
            没选剪辑模板 · 数字人 mp4 直接当成片 · 不剪辑直接进预览
          </div>
        </div>
        <div style={{ padding: 30, background: "#fff", border: `1px solid ${T.borderSoft}`, borderRadius: 12, textAlign: "center" }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>📹</div>
          <div style={{ fontSize: 13, color: T.muted, marginBottom: 14 }}>
            朴素模式不需要剪辑步, 数字人 mp4 是最终成片
          </div>
          <video src={api.media(`/media/${dhVideoPath.split('/data/')[1] || ''}`)}
            controls style={{ maxWidth: 360, maxHeight: 360, borderRadius: 6, background: "#000", display: dhVideoPath.includes('/data/') ? "inline-block" : "none" }} />
          <div style={{ fontSize: 10.5, color: T.muted2, marginTop: 8, fontFamily: "SF Mono, monospace" }}>{dhVideoPath}</div>
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
        看完成视频 · 不满意留意见 AI 重剪 · 满意去发布 (D-061g 接通)
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
          <div style={{ color: T.red, fontWeight: 600, marginBottom: 8 }}>❌ 渲染失败</div>
          <div style={{ fontSize: 11, fontFamily: "SF Mono, monospace", color: T.red, whiteSpace: "pre-wrap", maxHeight: 200, overflow: "auto" }}>{task.error || "(无错误信息)"}</div>
        </div>
      ) : isDone && result?.output_url ? (
        <div>
          <video src={api.media(result.output_url)} controls
            style={{ width: "100%", maxHeight: 540, borderRadius: 8, background: "#000", display: "block" }} />
          <div style={{ marginTop: 10, fontSize: 11, color: T.muted2, fontFamily: "SF Mono, monospace" }}>
            📁 {result.output_path} · {result.size_bytes ? `${(result.size_bytes / 1024 / 1024).toFixed(1)} MB` : ""}
          </div>
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
        <br />
        <span style={{ color: T.muted2 }}>(当前实现: 把 note 带回剪辑步, 你照着改字段 / 重生 broll · D-061g+ 接 AI 自动改)</span>
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

  return (
    <div style={{ marginTop: 16, padding: 16, background: "#fff", border: `1px solid ${T.borderSoft}`, borderRadius: 12 }}>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>🚀 多平台发布</div>
        <span style={{ marginLeft: 8, fontSize: 11, color: T.muted2 }}>已发 {publishedCount}/{PLATFORMS.length}</span>
        <div style={{ flex: 1 }} />
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
