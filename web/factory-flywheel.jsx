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

Object.assign(window, { NightHotFlywheel, setFromMake, clearFromMake, readFromMake, useFromMake, FromMakeBanner });
