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

          {step === "script"   && <MakeV2StepScript script={script} setScript={setScript} onNext={() => gotoStep("voice-dh")} onNav={onNav} />}
          {step === "voice-dh" && <MakeV2StepVoiceDh
                                    voiceId={voiceId} setVoiceId={setVoiceId}
                                    avatarId={avatarId} setAvatarId={setAvatarId}
                                    dhVideoPath={dhVideoPath} setDhVideoPath={setDhVideoPath}
                                    script={script}
                                    onPrev={() => gotoStep("script")}
                                    onNext={() => gotoStep("template")} />}
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

// ─── Step 1 文案 (D-061c 接通 N 个大按钮) ────────────────────
function MakeV2StepScript({ script, setScript, onNext, onNav }) {
  return (
    <div style={{ background: "#fff", border: `1px solid ${T.borderSoft}`, borderRadius: 12, padding: 20 }}>
      <div style={{ fontSize: 16, fontWeight: 600, color: T.text, marginBottom: 6 }}>1. 文案</div>
      <div style={{ fontSize: 12, color: T.muted, marginBottom: 16 }}>
        粘贴现成文案 / 用 AI 帮你写 / 走专门 skill (D-061c 接通)
      </div>
      <textarea
        value={script}
        onChange={e => setScript(e.target.value)}
        placeholder="粘贴一段口播文案 (中文)... · 也可以用下面的快捷按钮调专门 skill 写"
        rows={10}
        style={{
          width: "100%", padding: 14, border: `1px solid ${T.borderSoft}`, borderRadius: 8,
          fontSize: 13, fontFamily: "inherit", outline: "none", resize: "vertical", lineHeight: 1.7,
        }} />
      <div style={{ marginTop: 6, fontSize: 11, color: T.muted2 }}>
        {script.length} 字 · 中文口播 ~3.5 字/秒 · 估计 {Math.round(script.length / 3.5)} 秒
      </div>

      <div style={{ marginTop: 18, padding: 14, background: T.bg2, borderRadius: 8 }}>
        <div style={{ fontSize: 11.5, color: T.muted, marginBottom: 10 }}>📋 D-061c 后这里会变成 N 个大按钮: 投流 / 朋友圈 / 公众号 / 录音 / 热点 / 人设 / AI 写</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {[
            { id: "ad", label: "💰 投流" },
            { id: "moments", label: "📱 朋友圈" },
            { id: "wechat", label: "📄 公众号" },
            { id: "voicerewrite", label: "🎙️ 录音" },
            { id: "hotrewrite", label: "🔥 热点" },
          ].map(s => (
            <button key={s.id} onClick={() => onNav(s.id)}
              style={{
                padding: "5px 12px", fontSize: 11.5, borderRadius: 100, border: `1px solid ${T.borderSoft}`,
                background: "#fff", color: T.muted, cursor: "pointer", fontFamily: "inherit",
              }}>{s.label}</button>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 18, display: "flex", gap: 10, justifyContent: "flex-end" }}>
        <Btn variant="primary" onClick={onNext} disabled={!script.trim()}>
          {script.trim() ? "下一步: 声音 + 数字人 →" : "↑ 先填文案"}
        </Btn>
      </div>
    </div>
  );
}

// ─── Step 2 声音 + 数字人 (D-061d 接通) ──────────────────────
function MakeV2StepVoiceDh({ voiceId, setVoiceId, avatarId, setAvatarId, dhVideoPath, setDhVideoPath, script, onPrev, onNext }) {
  return (
    <div style={{ background: "#fff", border: `1px solid ${T.borderSoft}`, borderRadius: 12, padding: 20 }}>
      <div style={{ fontSize: 16, fontWeight: 600, color: T.text, marginBottom: 6 }}>2. 声音 + 数字人</div>
      <div style={{ fontSize: 12, color: T.muted, marginBottom: 16 }}>
        默认用上次 · 业务上"造数字人"是一件事 · D-061d 接通
      </div>

      <div style={{ padding: 20, background: T.bg2, borderRadius: 8, textAlign: "center", color: T.muted2, fontSize: 13 }}>
        🚧 D-061d 接通: 左侧 voice 选/克隆 · 右侧 avatar 选 · "用上次"快捷 · 调 /api/video/submit 出 mp4
      </div>

      <div style={{ marginTop: 14, padding: 12, background: T.bg2, borderRadius: 6 }}>
        <div style={{ fontSize: 11, color: T.muted, marginBottom: 6 }}>过渡占位: 直接粘贴现成数字人 mp4 路径</div>
        <input value={dhVideoPath} onChange={e => setDhVideoPath(e.target.value)}
          placeholder="/Users/.../works/xxx.mp4"
          style={{ width: "100%", padding: "8px 10px", border: `1px solid ${T.border}`, borderRadius: 6, fontSize: 12, fontFamily: "SF Mono, monospace", outline: "none", background: "#fff" }} />
      </div>

      <div style={{ marginTop: 18, display: "flex", gap: 10, justifyContent: "space-between" }}>
        <Btn variant="outline" onClick={onPrev}>← 改文案</Btn>
        <Btn variant="primary" onClick={onNext} disabled={!dhVideoPath.trim()}>
          {dhVideoPath.trim() ? "下一步: 选模板 →" : "↑ 先填 mp4 路径"}
        </Btn>
      </div>
    </div>
  );
}

// ─── Step 3 选模板 (D-061e 接通) ──────────────────────────────
function MakeV2StepTemplate({ templateId, setTemplateId, onPrev, onNext }) {
  return (
    <div style={{ background: "#fff", border: `1px solid ${T.borderSoft}`, borderRadius: 12, padding: 20 }}>
      <div style={{ fontSize: 16, fontWeight: 600, color: T.text, marginBottom: 6 }}>3. 选模板</div>
      <div style={{ fontSize: 12, color: T.muted, marginBottom: 16 }}>
        v5/v6/v7... 模板 + "朴素无模板"选项 · D-061e 复用 dhv5 选择器组件
      </div>

      <div style={{ padding: 20, background: T.bg2, borderRadius: 8, textAlign: "center", color: T.muted2, fontSize: 13 }}>
        🚧 D-061e 接通: 复用 PageDhv5 的 DhvTemplateCard 网格 + 分类/时长筛选
      </div>

      {/* 过渡占位: 输入模板 id */}
      <div style={{ marginTop: 14, padding: 12, background: T.bg2, borderRadius: 6 }}>
        <div style={{ fontSize: 11, color: T.muted, marginBottom: 6 }}>过渡占位: 直接填模板 id (从 ~/Desktop/skills/digital-human-video-v5/templates/)</div>
        <input value={templateId || ""} onChange={e => setTemplateId(e.target.value || null)}
          placeholder="01-peixun-gaoxiao  · 留空 = 朴素无模板"
          style={{ width: "100%", padding: "8px 10px", border: `1px solid ${T.border}`, borderRadius: 6, fontSize: 12, fontFamily: "SF Mono, monospace", outline: "none", background: "#fff" }} />
      </div>

      <div style={{ marginTop: 18, display: "flex", gap: 10, justifyContent: "space-between" }}>
        <Btn variant="outline" onClick={onPrev}>← 改数字人</Btn>
        <Btn variant="primary" onClick={onNext}>下一步: 剪辑 →</Btn>
      </div>
    </div>
  );
}

// ─── Step 4 剪辑 (D-061f 接通 align + render) ─────────────────
function MakeV2StepEdit({ templateId, script, dhVideoPath, alignedScenes, setAlignedScenes, onPrev, onRender }) {
  const [submitting, setSubmitting] = React.useState(false);
  const [localErr, setLocalErr] = React.useState("");

  async function trigger() {
    setSubmitting(true); setLocalErr("");
    try {
      // D-061f 接通: 模板模式调 dhv5 align + render
      // 占位: 直接调 dhv5/render 不带 scenes_override (用模板默认 scenes)
      if (!templateId) {
        setLocalErr("朴素无模板渲染分支还没接 (D-061f-2)");
        return;
      }
      const r = await api.post("/api/dhv5/render", {
        template_id: templateId,
        digital_human_video: dhVideoPath,
      });
      onRender(r.task_id);
    } catch (e) {
      setLocalErr(e.message || "提交失败");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ background: "#fff", border: `1px solid ${T.borderSoft}`, borderRadius: 12, padding: 20 }}>
      <div style={{ fontSize: 16, fontWeight: 600, color: T.text, marginBottom: 6 }}>4. 剪辑</div>
      <div style={{ fontSize: 12, color: T.muted, marginBottom: 16 }}>
        AI 把文案切到模板 scenes · 内联调措辞 · B-roll 配图 · D-061f 接通
      </div>

      <div style={{ padding: 20, background: T.bg2, borderRadius: 8, textAlign: "center", color: T.muted2, fontSize: 13 }}>
        🚧 D-061f 接通: 复用 PageDhv5 align + Dhv5SceneRow + B-roll 展开 panel
      </div>

      <div style={{ marginTop: 14, padding: 12, background: T.bg2, borderRadius: 6, fontSize: 11.5, color: T.muted, fontFamily: "SF Mono, monospace" }}>
        过渡占位: 现在直接用模板默认 scenes 渲染. <br />
        template_id={templateId || "(朴素)"} · dh={dhVideoPath?.split("/").pop() || "(无)"} · script={script.length} 字
      </div>

      {localErr && <div style={{ marginTop: 10, padding: 10, background: T.redSoft, color: T.red, borderRadius: 6, fontSize: 12 }}>⚠️ {localErr}</div>}

      <div style={{ marginTop: 18, display: "flex", gap: 10, justifyContent: "space-between" }}>
        <Btn variant="outline" onClick={onPrev}>← 改模板</Btn>
        <Btn variant="primary" onClick={trigger} disabled={submitting || !templateId}>
          {submitting ? "提交中…" : "▶ 开始渲染 (3-10 分钟)"}
        </Btn>
      </div>
    </div>
  );
}

// ─── Step 5 预览 + 反馈 (D-061g 接通) ─────────────────────────
function MakeV2StepPreview({ renderTaskId, setRenderTaskId, templateId, onReedit, onNewMp4 }) {
  const [task, setTask] = React.useState(null);

  React.useEffect(() => {
    if (!renderTaskId) return;
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
  }, [renderTaskId]);

  const status = task?.status || "running";
  const result = task?.result || null;
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

      {(isDone || isFailed) && (
        <div style={{ marginTop: 18, padding: 14, background: T.bg2, borderRadius: 8, fontSize: 12, color: T.muted2 }}>
          🚧 D-061g 接通: 修改意见 textarea + AI 重剪 + 多平台发布提示
        </div>
      )}

      <div style={{ marginTop: 18, display: "flex", gap: 10, justifyContent: "space-between" }}>
        <Btn variant="outline" onClick={onReedit}>← 回剪辑</Btn>
        {isDone && <Btn variant="outline" onClick={onNewMp4}>♻️ 同 mp4 套别的模板</Btn>}
      </div>
    </div>
  );
}

Object.assign(window, { PageMakeV2 });
