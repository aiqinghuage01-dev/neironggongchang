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
        {render()}
      </div>
      <TaskBar onNav={setPage} />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<FactoryApp />);
