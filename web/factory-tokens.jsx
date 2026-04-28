// 工厂通用 tokens & 组件 — 延续 design-c 暖米底风格
const T = {
  // 背景分层
  bg: "#f7f5f0",           // 主背景（暖米）
  bg1: "#ffffff",          // 面板
  bg2: "#fcfaf6",          // 次级面板（卡片底）
  bg3: "#f2efe7",          // 极浅分隔
  // 描边
  border: "#ece8df",
  borderSoft: "#f2efe7",
  // 文本
  text: "#1a1a1a",
  text2: "#3d3d3d",
  muted: "#6b6960",
  muted2: "#a19e93",
  muted3: "#c4c1b6",
  // 主色（青绿）
  brand: "#2a6f4a",
  brandSoft: "#e8f3ed",
  brandText: "#2a6f4a",
  // 强调
  amber: "#c47a1f",
  amberSoft: "#fdf4e3",
  blue: "#2c5d86",
  blueSoft: "#e6eef5",
  pink: "#b8456b",
  pinkSoft: "#f7e6ec",
  purple: "#6b4b8a",
  purpleSoft: "#efe9f4",
  red: "#b8422e",
  redSoft: "#f8e7e2",
};

function Btn({ variant = "default", size = "md", children, icon, onClick, style, disabled, ...rest }) {
  const sizes = {
    sm: { padding: "5px 10px", fontSize: 12, height: 28, borderRadius: 6, gap: 6 },
    md: { padding: "7px 14px", fontSize: 13, height: 34, borderRadius: 8, gap: 7 },
    lg: { padding: "10px 18px", fontSize: 14, height: 40, borderRadius: 10, gap: 8 },
  };
  const variants = {
    default: { background: T.bg1, border: `1px solid ${T.border}`, color: T.text2 },
    primary: {
      background: T.brand,
      border: "1px solid transparent",
      color: "#fff",
      fontWeight: 500,
    },
    ghost: { background: "transparent", border: "1px solid transparent", color: T.muted },
    outline: { background: T.bg1, border: `1px solid ${T.border}`, color: T.text2 },
    soft: { background: T.brandSoft, border: `1px solid transparent`, color: T.brand, fontWeight: 500 },
    danger: { background: T.redSoft, border: `1px solid ${T.red}22`, color: T.red },
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      {...rest}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        transition: "all 0.15s",
        whiteSpace: "nowrap",
        fontFamily: "inherit",
        ...sizes[size],
        ...variants[variant],
        ...style,
      }}
    >
      {icon && <span>{icon}</span>}
      {children}
    </button>
  );
}

function Tag({ children, color = "gray", size = "sm", style }) {
  const palette = {
    gray: { bg: T.bg3, fg: T.muted, bd: T.border },
    green: { bg: T.brandSoft, fg: T.brand, bd: "transparent" },
    amber: { bg: T.amberSoft, fg: T.amber, bd: "transparent" },
    blue: { bg: T.blueSoft, fg: T.blue, bd: "transparent" },
    pink: { bg: T.pinkSoft, fg: T.pink, bd: "transparent" },
    purple: { bg: T.purpleSoft, fg: T.purple, bd: "transparent" },
    red: { bg: T.redSoft, fg: T.red, bd: "transparent" },
  };
  const p = palette[color] || palette.gray;
  const sizing = size === "xs" ? { padding: "1px 7px", fontSize: 10.5 } : { padding: "2px 9px", fontSize: 11 };
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        borderRadius: 100,
        background: p.bg,
        color: p.fg,
        border: `1px solid ${p.bd}`,
        fontWeight: 500,
        lineHeight: 1.5,
        ...sizing,
        ...style,
      }}
    >
      {children}
    </span>
  );
}

function Card({ children, style, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        background: T.bg1,
        border: `1px solid ${T.borderSoft}`,
        borderRadius: 12,
        padding: 14,
        transition: "all 0.15s",
        cursor: onClick ? "pointer" : "default",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function PlatformIcon({ platform, size = 18 }) {
  const map = {
    douyin: { bg: "#000", fg: "#fff", text: "抖" },
    xiaohongshu: { bg: "#ff2442", fg: "#fff", text: "红" },
    shipinhao: { bg: "#07c160", fg: "#fff", text: "号" },
    wechat: { bg: "#07c160", fg: "#fff", text: "公" },
    kuaishou: { bg: "#ff6a00", fg: "#fff", text: "快" },
    feishu: { bg: "#3370ff", fg: "#fff", text: "飞" },
  };
  const p = map[platform] || map.douyin;
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: 4,
        background: p.bg,
        color: p.fg,
        fontSize: size * 0.55,
        fontWeight: 700,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      {p.text}
    </div>
  );
}

Object.assign(window, { T, Btn, Tag, Card, PlatformIcon });
