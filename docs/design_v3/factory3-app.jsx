// factory3-app.jsx — v0.3 入口
function FactoryAppV3() {
  const [page, setPage] = React.useState("home");
  const render = () => {
    switch (page) {
      case "home": return <V3HomeSwitcher onJump={setPage} />;
      case "make": return <V3Flow onJumpPage={setPage} />;
      case "ad": return <V3GenericEntry cfg={AD_CFG} onJump={setPage} />;
      case "wechat": return <V3GenericEntry cfg={WECHAT_CFG} onJump={setPage} />;
      case "moments": return <V3GenericEntry cfg={MOMENTS_CFG} onJump={setPage} />;
      case "materials": return <V3Materials onJump={setPage} />;
      case "works": return <V3Works onJump={setPage} />;
      case "knowledge": return <V3Knowledge onJump={setPage} />;
      case "settings": return <V3Settings onJump={setPage} />;
      default: return <V3HomeSwitcher onJump={setPage} />;
    }
  };
  return (
    <div style={{
      display: "flex", height: "100vh", width: "100vw", background: T.bg,
      fontFamily: "-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', 'Segoe UI', sans-serif",
      color: T.text,
    }}>
      <V3Sidebar active={page} onNav={setPage} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", position: "relative" }}>{render()}</div>
    </div>
  );
}
ReactDOM.createRoot(document.getElementById("root")).render(<FactoryAppV3 />);
