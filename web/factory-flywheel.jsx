// factory-flywheel.jsx — D-062i 启动飞轮组件
// 用于各种"数据空"状态: 给一个 actionable CTA 让用户一键启动数据来源 (而非"暂无")
// 用法:
//   <NightHotFlywheel onTopics={reloadHotList} />
//
// 行为:
//   1) 启用每晚 23:00: POST /api/night/seed-defaults (idempotent) → PATCH job enabled=true
//   2) 立即抓一次:    POST /api/night/seed-defaults → POST /api/night/jobs/{id}/run
//                     轮询 GET /api/night/runs?job_id=... 看完成
// 状态: idle / enabling / running / done / err

function NightHotFlywheel({ onTopics, compact }) {
  const [phase, setPhase] = React.useState("idle");
  const [msg, setMsg] = React.useState("");
  const [runId, setRunId] = React.useState(null);

  async function findHotJob() {
    await api.post("/api/night/seed-defaults", {});  // 幂等
    const { jobs } = await api.get("/api/night/jobs?enabled_only=false");
    return (jobs || []).find(j => j.name === "凌晨抓热点");
  }

  async function enableNightly() {
    setPhase("enabling"); setMsg("");
    try {
      const j = await findHotJob();
      if (!j) throw new Error("找不到「凌晨抓热点」任务");
      if (!j.enabled) {
        await api.patch(`/api/night/jobs/${j.id}`, { enabled: true });
      }
      setPhase("done");
      setMsg("✓ 已启用 · 今晚 23:00 自动抓 · 也可去 🌙 小华夜班 看运行历史");
    } catch (e) { setPhase("err"); setMsg(e.message); }
  }

  async function runNow() {
    setPhase("running"); setMsg("");
    try {
      const j = await findHotJob();
      if (!j) throw new Error("找不到「凌晨抓热点」任务");
      const r = await api.post(`/api/night/jobs/${j.id}/run`, {});
      setRunId(r.run_id);
      setMsg("AI 正在分析当日热点 · 通常 30-60s...");
      // 轮询 30 次 × 3s = 90s
      for (let i = 0; i < 30; i++) {
        await new Promise(s => setTimeout(s, 3000));
        try {
          const { runs } = await api.get(`/api/night/runs?job_id=${j.id}&limit=1`);
          const last = runs && runs[0];
          if (last && last.id === r.run_id && (last.status === "success" || last.status === "failed")) {
            if (last.status === "success") {
              setPhase("done");
              setMsg(`✓ 抓完了 · 刷新看新热点`);
              if (typeof onTopics === "function") onTopics();
            } else {
              setPhase("err");
              const tail = (last.log || "").trim().split("\n").slice(-2).join(" · ");
              setMsg(`抓失败: ${tail.slice(0, 120) || "去 🌙 小华夜班 看 log"}`);
            }
            return;
          }
        } catch (_) {}
      }
      setPhase("err");
      setMsg("等了 90s 还没出结果, 去 🌙 小华夜班 tab 看进度");
    } catch (e) { setPhase("err"); setMsg(e.message); }
  }

  const busy = phase === "enabling" || phase === "running";
  return (
    <div style={{
      padding: compact ? 12 : 16,
      background: `linear-gradient(135deg, #fff8ec 0%, #fff 100%)`,
      border: `1px solid #fde6c0`, borderRadius: 10,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 18 }}>🌙</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: T.text }}>启动飞轮 · 让小华自动抓热点</span>
      </div>
      <div style={{ fontSize: 11.5, color: T.muted, lineHeight: 1.6, marginBottom: 10 }}>
        别再手填了 · 启用「🔥 凌晨抓热点」, 每晚 23:00 自动出当日选题, 第二天醒来直接选
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <Btn size="sm" variant="primary" onClick={enableNightly} disabled={busy}>
          {phase === "enabling" ? "启用中..." : "启用每晚 23:00"}
        </Btn>
        <Btn size="sm" onClick={runNow} disabled={busy}>
          {phase === "running" ? "🚀 抓取中..." : "🚀 立即抓一次"}
        </Btn>
        {msg && <span style={{ fontSize: 11, color: phase === "err" ? T.red : T.brand, flexBasis: "100%", marginTop: 4 }}>{msg}</span>}
      </div>
    </div>
  );
}

// ─── D-062x · 反向 anchor: 从 PageMakeV2 跳到 skill, 完成后明显带回 ─────
// PageMakeV2 跳出去前 setFromMake(skill_id), skill 内 useFromMake 拿到 → 显 banner + CTA 改文案

const FROM_MAKE_KEY = "from_make_anchor";
const FROM_MAKE_TTL_MS = 30 * 60 * 1000;  // 30 分钟内有效, 超时不显 banner

function setFromMake(skillId) {
  try {
    localStorage.setItem(FROM_MAKE_KEY, JSON.stringify({ skill: skillId, ts: Date.now() }));
  } catch (_) {}
}
function clearFromMake() {
  try { localStorage.removeItem(FROM_MAKE_KEY); } catch (_) {}
}
function readFromMake() {
  try {
    const raw = localStorage.getItem(FROM_MAKE_KEY);
    if (!raw) return null;
    const a = JSON.parse(raw);
    if (!a || !a.ts || Date.now() - a.ts > FROM_MAKE_TTL_MS) {
      clearFromMake();
      return null;
    }
    return a;
  } catch (_) { return null; }
}

function useFromMake(currentSkill) {
  const [anchor, setAnchor] = React.useState(() => readFromMake());
  React.useEffect(() => {
    // currentSkill 必须匹配 anchor.skill 才显 banner (避免跨技能误显)
    if (anchor && anchor.skill !== currentSkill) setAnchor(null);
  }, [anchor, currentSkill]);
  return {
    fromMake: !!anchor,
    dismiss: () => { clearFromMake(); setAnchor(null); },
  };
}

// 顶部 banner — skill 入口处用
function FromMakeBanner({ fromMake, dismiss, label }) {
  if (!fromMake) return null;
  return (
    <div style={{
      padding: "10px 14px", background: T.brandSoft,
      border: `1px solid ${T.brand}55`, borderRadius: 8,
      display: "flex", alignItems: "center", gap: 10, fontSize: 12.5,
      marginBottom: 12,
    }}>
      <span style={{ fontSize: 16 }}>🎬</span>
      <span style={{ flex: 1, color: T.text }}>
        你从 <b>做视频</b> 来 · {label || "完成后点下面 CTA 自动带文案回去继续"}
      </span>
      <button onClick={dismiss} title="不带回, 在这继续"
        style={{ background: "transparent", border: "none", color: T.muted2, cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}>×</button>
    </div>
  );
}

// ─── D-062cc · 错误信息友好化 ──────────────────────────────────
// 把 backend 抛出来的英文/技术错误翻译成"为啥 + 怎么办" 给用户看
// 用法: const { icon, title, suggestion, severity } = humanizeError(rawMsg);
//      <ErrorBanner err={rawMsg} actions={[{ label: "重试", onClick }]} />

const ERROR_PATTERNS = [
  { match: /模板不存在|模板.*不存在|template.*not.*found/i,
    icon: "📦", title: "模板不见了",
    suggestion: "回 Step 3 换一个模板, 或选朴素模式直接出片" },
  { match: /数字人.*mp4.*不存在|mp4.*不存在|file not found.*mp4/i,
    icon: "🎬", title: "数字人 mp4 文件丢了",
    suggestion: "回 Step 2 重新合成数字人 (柿榴文件可能被清理)" },
  { match: /transcript.*不能为空|文案空了/i,
    icon: "📝", title: "文案是空的",
    suggestion: "回 Step 1 写一段口播文案 (≥ 30 字)" },
  { match: /生图超时|timeout.*120/i,
    icon: "⏰", title: "B-roll 生图超时 (apimart 120s)",
    suggestion: "apimart 当前慢, 等 30s 重试 / 或换 prompt 简短点" },
  { match: /quota|429|rate.?limit/i,
    icon: "🚧", title: "AI quota 满了",
    suggestion: "今日 apimart/deepseek 配额用完了, 等明天 / 或去 ⚙️ 设置切别的 key" },
  { match: /AI.*失败|AI 调用失败|deepseek.*error|apimart.*error/i,
    icon: "🤖", title: "AI 调用失败",
    suggestion: "网络抖一下? 等 10s 重试 · 老不好去 ⚙️ 设置看 AI 健康检查" },
  { match: /AI.*非.*JSON|JSON.*parse|JSON.*解析/i,
    icon: "🤖", title: "AI 返回了乱七八糟的内容",
    suggestion: "重试一次 (AI 偶尔抽风) · 多次失败考虑改文案再试" },
  { match: /scene_idx.*超界|out.?of.?range/i,
    icon: "🔀", title: "场景索引对不上模板",
    suggestion: "回 Step 3 重新选模板 → 重新对齐 (alignedScenes 跟新模板对不齐)" },
  { match: /只.*B.?C.?scene.*broll|only.*B.?C.*broll/i,
    icon: "🖼️", title: "这个场景不需要配图",
    suggestion: "A 场 (口播) 没 broll, 只 B/C 场要 · 检查你点的 scene 类型" },
  { match: /缺.*prompt|没法生图.*prompt/i,
    icon: "✏️", title: "B-roll prompt 是空的",
    suggestion: "在场景卡里填一行 prompt (≥ 5 字) 再点生图" },
  { match: /柿榴|qingdou|cosyvoice/i,
    icon: "🛠️", title: "外部服务异常",
    suggestion: "去 ⚙️ 设置 看一下 health, 大概率服务/key 配置问题" },
  { match: /HTTP 5\d\d|server error|internal/i,
    icon: "💥", title: "服务器内部错误",
    suggestion: "后端崩了一下, 等 10s 重试 · 重复出现去看 server log" },
  { match: /HTTP 4\d\d|bad request|invalid/i,
    icon: "🚫", title: "请求参数有问题",
    suggestion: "可能少填东西? 检查上一步是否完整 · 或看 message 后半段细节" },
];

function humanizeError(rawMsg) {
  const msg = String(rawMsg || "").trim();
  if (!msg) return { icon: "⚠️", title: "未知错误", suggestion: "", raw: msg };
  for (const p of ERROR_PATTERNS) {
    if (p.match.test(msg)) {
      return { icon: p.icon, title: p.title, suggestion: p.suggestion, raw: msg };
    }
  }
  return { icon: "⚠️", title: "出错了", suggestion: "看下面 message 找线索 · 大多重试一次能过", raw: msg };
}

function ErrorBanner({ err, actions }) {
  if (!err) return null;
  const h = humanizeError(err);
  return (
    <div style={{
      padding: 12, background: T.redSoft, border: `1px solid ${T.red}33`,
      borderRadius: 8, marginBottom: 12,
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <span style={{ fontSize: 20, flexShrink: 0 }}>{h.icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: T.red }}>{h.title}</div>
          {h.suggestion && (
            <div style={{ fontSize: 12, color: T.red, marginTop: 2, opacity: 0.85 }}>{h.suggestion}</div>
          )}
          <details style={{ marginTop: 6 }}>
            <summary style={{ fontSize: 10.5, color: T.red, cursor: "pointer", opacity: 0.7 }}>看原始错误</summary>
            <pre style={{ fontSize: 10, fontFamily: "SF Mono, monospace", color: T.red, whiteSpace: "pre-wrap", margin: "4px 0 0", lineHeight: 1.5, opacity: 0.7 }}>{h.raw}</pre>
          </details>
        </div>
        {actions && actions.length > 0 && (
          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
            {actions.map((a, i) => (
              <Btn key={i} size="sm" variant={i === 0 ? "primary" : "outline"} onClick={a.onClick}>{a.label}</Btn>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

Object.assign(window, { NightHotFlywheel, setFromMake, clearFromMake, readFromMake, useFromMake, FromMakeBanner, humanizeError, ErrorBanner });
