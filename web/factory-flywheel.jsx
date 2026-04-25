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

Object.assign(window, { NightHotFlywheel });
