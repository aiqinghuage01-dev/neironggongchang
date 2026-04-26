// factory-app.jsx — 顶级路由

function FactoryApp() {
  // D-065: 支持 ?page=works 这类 URL 深链(便于截图验证 + 直接分享)
  const [page, setPage] = React.useState(() => {
    try {
      const p = new URLSearchParams(window.location.search).get("page");
      return p || "home";
    } catch (_) { return "home"; }
  });
  React.useEffect(() => {
    try {
      const url = new URL(window.location.href);
      if (page === "home") url.searchParams.delete("page");
      else url.searchParams.set("page", page);
      window.history.replaceState(null, "", url.toString());
    } catch (_) {}
  }, [page]);
  // D-069: LiDock 任务 tab 用 window event 跳页, 这里挂 listener
  React.useEffect(() => {
    const h = (e) => { if (e.detail?.page) setPage(e.detail.page); };
    window.addEventListener("ql-nav", h);
    return () => window.removeEventListener("ql-nav", h);
  }, []);
  // D-070: 访客模式 banner 状态
  const [guest, setGuest] = React.useState(() => api.isGuest());
  React.useEffect(() => {
    const h = (e) => setGuest(!!e.detail?.guest);
    window.addEventListener("guest-mode-change", h);
    return () => window.removeEventListener("guest-mode-change", h);
  }, []);
  const render = () => {
    switch (page) {
      case "home":       return <PageHome onNav={setPage} />;
      case "make":       return <PageMakeV2 onNav={setPage} />;
      case "ad":         return <PageAd onNav={setPage} />;
      case "wechat":     return <PageWechat onNav={setPage} />;
      case "moments":    return <PageMoments onNav={setPage} />;
      case "hotrewrite": return <PageHotrewrite onNav={setPage} />;
      case "voicerewrite": return <PageVoicerewrite onNav={setPage} />;
      case "baokuan":    return <PageBaokuan onNav={setPage} />;
      case "materials":  return <PageMaterials onNav={setPage} />;
      case "works":      return <PageWorks onNav={setPage} />;
      case "knowledge":  return <PageKnowledge onNav={setPage} />;
      case "settings":   return <PageSettings onNav={setPage} />;
      case "strategy":   return <PageStrategy onNav={setPage} />;
      case "planner": return <PagePlanner onNav={setPage} />;
      case "compliance": return <PageCompliance onNav={setPage} />;
      case "imagegen":   return <PageImageGen onNav={setPage} />;
      case "dreamina":   return <PageDreamina onNav={setPage} />;
      case "nightshift": return <PageNightShift onNav={setPage} />;
      case "dhv5":       return <PageDhv5 onNav={setPage} />;
      // D-066: 三个二级页, 整合分散的子工具
      case "write":      return <PageWrite onNav={setPage} />;
      case "image":      return <PageImage onNav={setPage} />;
      case "beta":       return <PageBeta onNav={setPage} />;
      default:           return <PageHome onNav={setPage} />;
    }
  };
  return (
    <div style={{
      display: "flex", height: "100vh", width: "100vw", background: T.bg,
      fontFamily: "-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', 'Segoe UI', sans-serif",
      color: T.text,
    }}>
      <Sidebar active={page} onNav={setPage} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", position: "relative" }}>
        {/* D-070: 访客模式 banner — 提醒老板当前不在自己工作流, 防忘 */}
        {guest && (
          <div style={{
            background: "#FFF4E5", color: "#B55B00",
            borderBottom: "1px solid #FFB066",
            padding: "8px 16px", fontSize: 12.5, fontWeight: 500,
            display: "flex", alignItems: "center", gap: 10,
          }}>
            <span style={{ fontSize: 14 }}>🕶</span>
            <span style={{ flex: 1 }}>
              <b>访客模式</b> · 这次产出不进你的作品库 / 不学进偏好 / AI 走中性写作助手
            </span>
            <button onClick={() => api.setGuest(false)} style={{
              background: "#fff", color: "#B55B00",
              border: "1px solid #FFB066", borderRadius: 6,
              padding: "3px 12px", fontSize: 12, fontWeight: 600,
              cursor: "pointer", fontFamily: "inherit",
            }}>切回我自己</button>
          </div>
        )}
        {render()}
      </div>
      {/* D-069: 顶栏 TaskBar 已删, 任务状态全部融入小华按钮徽章 + LiDock 任务 tab */}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<FactoryApp />);
