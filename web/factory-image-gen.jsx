// factory-image-gen.jsx — 🖼️ 直接出图 (D-064b · 2026-04-26)
// 独立 sidebar 入口, 不绑定业务流程. 用户 prompt + size + 引擎 → 出 N 张候选, 直接复制/下载.
// 跟即梦 standalone 对称, 但走 image_engine 抽象 (默认 apimart, 可切 dreamina).

const IMG_GEN_SIZES = [
  { id: "16:9", label: "16:9 横版", desc: "封面/banner" },
  { id: "9:16", label: "9:16 竖版", desc: "短视频封面/小红书" },
  { id: "1:1",  label: "1:1 方版",   desc: "朋友圈/头像" },
  { id: "3:4",  label: "3:4 竖版",   desc: "公众号/海报" },
  { id: "4:3",  label: "4:3 横版",   desc: "ppt/网页配图" },
];

function PageImageGen({ onNav }) {
  const [prompt, setPrompt] = React.useState("");
  const [size, setSize] = React.useState("16:9");
  const [n, setN] = React.useState(2);
  const [imgEngine, setImgEngine, defaultImgEngine, isImgOverride] = useImageEngine();
  const [taskId, setTaskId] = useTaskPersist("imagegen");
  const [result, setResult] = React.useState(null);
  const [err, setErr] = React.useState("");

  const poller = useTaskPoller(taskId, {
    onComplete: (r) => { setResult(r); setTaskId(null); },
    onError: (e) => { setErr(e || "生图失败"); },
  });

  async function generate() {
    if (!prompt.trim()) return;
    setErr(""); setResult(null); setTaskId(null);
    try {
      const r = await api.post("/api/image/generate", {
        prompt: prompt.trim(), size, n, engine: imgEngine, label: "gen",
      });
      setTaskId(r.task_id);
    } catch (e) { setErr(e.message); }
  }

  function retry() { setErr(""); setResult(null); setTaskId(null); generate(); }
  function reset() { setResult(null); setTaskId(null); setErr(""); }

  // wfState
  const wfState = { prompt, size, n, result, taskId };
  const wfRestore = (s) => {
    if (s.prompt != null) setPrompt(s.prompt);
    if (s.size) setSize(s.size);
    if (typeof s.n === "number") setN(s.n);
    if (s.result) setResult(s.result);
    if (s.taskId) setTaskId(s.taskId);
  };
  const wf = useWorkflowPersist({ ns: "imagegen", state: wfState, onRestore: wfRestore });

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", background: T.bg, position: "relative", overflow: "hidden" }}>
      <div style={{ padding: "12px 24px", background: "#fff", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 14, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 26, height: 26, borderRadius: 7, background: T.text, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13 }}>🖼️</div>
          <div style={{ fontSize: 13.5, fontWeight: 600 }}>直接出图</div>
          <span style={{ fontSize: 11, color: T.muted, marginLeft: 6 }}>不走业务流程, prompt → 图</span>
        </div>
        <div style={{ flex: 1 }} />
        <button onClick={() => onNav && onNav("home")} style={{ background: "transparent", border: "none", color: T.muted, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>← 返回</button>
      </div>

      <div style={{ flex: 1, overflow: "auto" }}>
        <WfRestoreBanner show={wf.hasSnapshot} onDismiss={wf.dismissSnapshot}
          onClear={() => { reset(); setPrompt(""); wf.dismissSnapshot(); }}
          label="直接出图工作流" />

        {err && (
          <div style={{ maxWidth: 860, margin: "16px auto 0", padding: 12, background: T.redSoft, color: T.red, borderRadius: 10, fontSize: 13 }}>
            ⚠️ {err}
          </div>
        )}

        {/* 输入 + 提交 */}
        {!poller.isRunning && !poller.isFailed && !poller.isCancelled && (
          <div style={{ padding: "32px 40px 20px", maxWidth: 860, margin: "0 auto" }}>
            <div style={{ textAlign: "center", marginBottom: 20 }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: T.text, marginBottom: 6 }}>
                想要张什么图? 🖼️
              </div>
              <div style={{ fontSize: 13, color: T.muted, lineHeight: 1.6 }}>
                贴 prompt · 选比例 · 选张数 · 默认 apimart, 旁边 chip 切即梦
              </div>
            </div>

            <div style={{ background: "#fff", border: `1.5px solid ${T.brand}`, boxShadow: `0 0 0 5px ${T.brandSoft}`, borderRadius: 16, padding: 18, marginBottom: 14 }}>
              <textarea rows={5} value={prompt} onChange={e => setPrompt(e.target.value)}
                placeholder={"描述你要的画面, 越具体越好...\n\n例:\n- 老板娘站在 18 年的米线店门口, 暖色调, 怀旧氛围, 真实感照片\n- 餐饮老板对着手机看数据, 背景是空荡荡的店面, 暗调"}
                style={{ width: "100%", border: "none", outline: "none", background: "transparent", fontSize: 14, fontFamily: "inherit", resize: "vertical", lineHeight: 1.7, color: T.text, minHeight: 120 }}
              />
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10, paddingTop: 12, borderTop: `1px solid ${T.borderSoft}`, flexWrap: "wrap" }}>
                <div style={{ fontSize: 11.5, color: T.muted2 }}>🖼️ {prompt.length} 字</div>
                <div style={{ flex: 1 }} />
                <ImageEngineChip engine={imgEngine} onChange={setImgEngine} defaultEngine={defaultImgEngine} isOverride={isImgOverride} />
                <button onClick={generate} disabled={!prompt.trim()} style={{
                  padding: "8px 22px", fontSize: 13, fontWeight: 600,
                  background: prompt.trim() ? T.brand : T.muted3, color: "#fff",
                  border: "none", borderRadius: 100, cursor: prompt.trim() ? "pointer" : "not-allowed", fontFamily: "inherit",
                }}>
                  ✨ 出图 ({n} 张) →
                </button>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              {/* 比例选择 */}
              <div style={{ padding: 14, background: "#fff", border: `1px solid ${T.borderSoft}`, borderRadius: 10 }}>
                <div style={{ fontSize: 11.5, color: T.muted2, fontWeight: 600, letterSpacing: "0.08em", marginBottom: 10 }}>比例</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {IMG_GEN_SIZES.map(s => (
                    <div key={s.id} title={s.desc} onClick={() => setSize(s.id)} style={{
                      padding: "6px 12px", borderRadius: 100, fontSize: 12, cursor: "pointer",
                      background: size === s.id ? T.brandSoft : T.bg2,
                      color: size === s.id ? T.brand : T.muted,
                      border: `1px solid ${size === s.id ? T.brand : T.borderSoft}`,
                      fontWeight: size === s.id ? 600 : 500,
                    }}>{s.label}</div>
                  ))}
                </div>
              </div>

              {/* 张数 */}
              <div style={{ padding: 14, background: "#fff", border: `1px solid ${T.borderSoft}`, borderRadius: 10 }}>
                <div style={{ fontSize: 11.5, color: T.muted2, fontWeight: 600, letterSpacing: "0.08em", marginBottom: 10 }}>张数</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {[1, 2, 4, 6].map(num => (
                    <div key={num} onClick={() => setN(num)} style={{
                      padding: "6px 14px", borderRadius: 100, fontSize: 12, cursor: "pointer",
                      background: n === num ? T.brandSoft : T.bg2,
                      color: n === num ? T.brand : T.muted,
                      border: `1px solid ${n === num ? T.brand : T.borderSoft}`,
                      fontWeight: n === num ? 600 : 500,
                    }}>{num} 张</div>
                  ))}
                </div>
                <div style={{ fontSize: 11, color: T.muted2, marginTop: 8 }}>
                  💡 {imgEngine === "dreamina" ? "即梦 60-120s/张" : "apimart 30-60s/张"}, 张数越多越慢
                </div>
              </div>
            </div>

            {result && (
              <div style={{ marginTop: 16, fontSize: 12, color: T.muted, textAlign: "center" }}>
                上次出了 {(result.images || []).length} 张, 点上方"出图"会清空再来
              </div>
            )}
          </div>
        )}

        {/* 跑中 */}
        {poller.isRunning && (
          <LoadingProgress
            task={poller.task}
            icon="🖼️"
            title="小华正在出图..."
            subtitle={`${prompt.slice(0, 40)} · ${size} · ${n} 张`}
            onCancel={() => { poller.cancel(); reset(); }}
          />
        )}

        {/* 失败 */}
        {(poller.isFailed || poller.isCancelled) && (
          <FailedRetry
            error={poller.error || err}
            onRetry={retry}
            onEdit={reset}
            icon="🖼️"
            title={poller.isCancelled ? "任务已取消" : "这次没出来"}
          />
        )}

        {/* 结果 (只在不在跑且有结果时显, 因为输入区是 toggle 的) */}
        {result && !poller.isRunning && !poller.isFailed && !poller.isCancelled && (
          <ImageGenResults result={result} prompt={prompt} onAgain={generate} onReset={() => { setPrompt(""); reset(); }} />
        )}
      </div>
    </div>
  );
}

// ─── 结果展示 (双卡 / 多卡 grid) ───────────────────────────
function ImageGenResults({ result, prompt, onAgain, onReset }) {
  const images = result.images || [];
  const ok = images.filter(i => !i.error);
  const failed = images.filter(i => i.error);

  return (
    <div style={{ padding: "32px 40px 60px", maxWidth: 1280, margin: "0 auto" }}>
      <div style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 20, fontWeight: 700 }}>
            {ok.length === images.length ? "✨" : ok.length === 0 ? "😅" : "⚠️"} 出图完成 · {ok.length}/{images.length} 成功
          </div>
          <div style={{ fontSize: 12, color: T.muted, marginTop: 4 }}>
            {result.engine} · {result.size} · 总耗时 {result.elapsed_sec}s
          </div>
        </div>
        <Btn variant="outline" onClick={onAgain}>🔄 同 prompt 再来一批</Btn>
        <Btn variant="primary" onClick={onReset}>✨ 换 prompt</Btn>
      </div>

      <div style={{
        display: "grid",
        gridTemplateColumns: images.length === 1 ? "1fr" : "repeat(auto-fit, minmax(380px, 1fr))",
        gap: 16,
      }}>
        {images.map((img, i) => <ImageCard key={i} img={img} idx={i} prompt={prompt} />)}
      </div>

      {failed.length > 0 && (
        <div style={{ marginTop: 16, padding: 12, background: T.redSoft, color: T.red, borderRadius: 8, fontSize: 12.5 }}>
          ⚠️ {failed.length} 张失败 (常见: AI 上游限流 / 网络抖动). 点上方 "🔄 同 prompt 再来一批" 重试.
        </div>
      )}
    </div>
  );
}

function ImageCard({ img, idx, prompt }) {
  const [copied, setCopied] = React.useState(false);
  if (img.error) {
    return (
      <div style={{ background: T.redSoft, border: `1px solid ${T.red}44`, borderRadius: 12, padding: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: T.red, marginBottom: 8 }}>#{idx + 1} 失败</div>
        <div style={{ fontSize: 12, color: T.red, fontFamily: "ui-monospace, monospace", lineHeight: 1.6 }}>{img.error}</div>
      </div>
    );
  }
  const previewSrc = img.media_url ? api.media(img.media_url) : img.url;
  function copyUrl() {
    if (!img.url) return;
    try { navigator.clipboard.writeText(img.url); } catch (_) {}
    setCopied(true); setTimeout(() => setCopied(false), 1500);
  }
  function downloadImg() {
    if (!previewSrc) return;
    const a = document.createElement("a");
    a.href = previewSrc;
    a.download = `image-gen-${Date.now()}-${idx}.png`;
    a.click();
  }
  return (
    <div style={{
      background: "#fff", border: `1.5px solid ${T.brand}`, borderRadius: 14,
      padding: 12, boxShadow: `0 0 0 4px ${T.brandSoft}`,
      display: "flex", flexDirection: "column", gap: 10,
    }}>
      <div style={{
        background: T.bg2, borderRadius: 10, overflow: "hidden",
        aspectRatio: "16/9", display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        {previewSrc ? (
          <img src={previewSrc} alt={`#${idx + 1}`} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
        ) : (
          <span style={{ color: T.muted, fontSize: 12 }}>(没有可预览图)</span>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11.5, color: T.muted }}>
        <span style={{ fontWeight: 600, color: T.text }}>#{idx + 1}</span>
        <span>{img.elapsed_sec}s</span>
        <div style={{ flex: 1 }} />
        <button onClick={copyUrl} style={{
          padding: "4px 10px", fontSize: 11.5, background: copied ? T.brandSoft : "#fff",
          border: `1px solid ${copied ? T.brand : T.border}`, borderRadius: 6,
          color: copied ? T.brand : T.muted, cursor: "pointer", fontFamily: "inherit", fontWeight: 500,
        }}>{copied ? "✓ 复制 URL" : "📋 URL"}</button>
        <button onClick={downloadImg} style={{
          padding: "4px 10px", fontSize: 11.5, background: "#fff",
          border: `1px solid ${T.border}`, borderRadius: 6,
          color: T.muted, cursor: "pointer", fontFamily: "inherit", fontWeight: 500,
        }}>⬇ 下载</button>
      </div>
    </div>
  );
}

Object.assign(window, { PageImageGen });
