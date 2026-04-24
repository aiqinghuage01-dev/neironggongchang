// factory-deep.jsx — 「深度理解业务」全站共享开关(localStorage 持久化)
//
// 勾选(默认): 每次 AI 调用带完整人设(~11000 字 system prompt),慢 15 秒但味道对
// 去勾:        只带精简人设(~830 字),轻快模式,适合快速草稿
//
// 用法:
//   const [deep, setDeep] = useDeepMode();
//   api.post(path, { ..., deep });                  // 任何页面都这样传
//   <DeepToggle />                                  // 生成按钮附近放一个
//   getDeep()                                       // 非 React 环境拿同步值

const DEEP_KEY = "factory_deep_mode";

function getDeep() {
  try {
    return localStorage.getItem(DEEP_KEY) !== "false";  // 默认 true
  } catch (e) {
    return true;
  }
}

function setDeepStored(val) {
  try {
    localStorage.setItem(DEEP_KEY, val ? "true" : "false");
  } catch (e) {}
  try { window.dispatchEvent(new CustomEvent("deep-change", { detail: !!val })); } catch(e){}
}

function useDeepMode() {
  const [deep, setDeep] = React.useState(getDeep());
  React.useEffect(() => {
    const h = (e) => setDeep(!!e.detail);
    window.addEventListener("deep-change", h);
    return () => window.removeEventListener("deep-change", h);
  }, []);
  return [deep, (v) => setDeepStored(v)];
}

function DeepToggle({ hint, compact }) {
  const [deep, setDeep] = useDeepMode();
  const label = deep ? "深度理解业务" : "轻快模式";
  const sub = hint || (deep ? "带完整人设 · 慢 15 秒但味道对" : "只带精简人设 · 快,适合草稿");
  return (
    <label
      title={sub}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: compact ? "4px 10px" : "6px 12px",
        background: deep ? T.brandSoft : T.bg2,
        border: `1px solid ${deep ? T.brand + "55" : T.borderSoft}`,
        borderRadius: 100,
        fontSize: compact ? 11.5 : 12.5,
        color: deep ? T.brand : T.muted,
        cursor: "pointer",
        userSelect: "none",
        fontWeight: 500,
      }}
    >
      <input
        type="checkbox"
        checked={deep}
        onChange={(e) => setDeep(e.target.checked)}
        style={{ margin: 0, accentColor: T.brand, cursor: "pointer" }}
      />
      {deep ? "✓ " : ""}{label}
      {!compact && (
        <span style={{ fontSize: 10.5, color: deep ? T.brand + "bb" : T.muted2, fontWeight: 400 }}>
          {sub}
        </span>
      )}
    </label>
  );
}

Object.assign(window, { getDeep, setDeepStored, useDeepMode, DeepToggle });
