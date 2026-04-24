// factory-app.jsx — 顶级路由

function FactoryApp() {
  const [page, setPage] = React.useState("home");
  const render = () => {
    switch (page) {
      case "home":       return <PageHome onNav={setPage} />;
      case "make":       return <PageMake onNav={setPage} />;
      case "ad":         return <PageAd onNav={setPage} />;
      case "wechat":     return <PageWechat onNav={setPage} />;
      case "moments":    return <PageMoments onNav={setPage} />;
      case "hotrewrite": return <PageHotrewrite onNav={setPage} />;
      case "voicerewrite": return <PageVoicerewrite onNav={setPage} />;
      case "materials":  return <PageMaterials onNav={setPage} />;
      case "works":      return <PageWorks onNav={setPage} />;
      case "knowledge":  return <PageKnowledge onNav={setPage} />;
      case "settings":   return <PageSettings onNav={setPage} />;
      case "planner": return <PagePlanner onNav={setPage} />;
      case "compliance": return <PageCompliance onNav={setPage} />;
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
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<FactoryApp />);
