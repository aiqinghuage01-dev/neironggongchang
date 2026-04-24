// factory-api.jsx — API 客户端 + 最近调用追踪(ApiStatusLight 用)

const API_BASE = (typeof localStorage !== "undefined" && localStorage.getItem("api_base")) || "http://127.0.0.1:8000";

window.__apiLast = null;
function _emitApi(info) {
  window.__apiLast = info;
  try { window.dispatchEvent(new CustomEvent("api-call", { detail: info })); } catch(e){}
}
async function _trace(method, path, fn) {
  const t0 = Date.now();
  try {
    const data = await fn();
    _emitApi({ method, path, ms: Date.now() - t0, ok: true, at: Date.now() });
    return data;
  } catch (e) {
    _emitApi({ method, path, ms: Date.now() - t0, ok: false, error: String(e.message || e), at: Date.now() });
    throw e;
  }
}
const api = {
  base: API_BASE,
  get(path) {
    return _trace("GET", path, async () => {
      const r = await fetch(`${API_BASE}${path}`);
      if (!r.ok) throw new Error(`${path} HTTP ${r.status}: ${await r.text()}`);
      return r.json();
    });
  },
  post(path, body) {
    return _trace("POST", path, async () => {
      const r = await fetch(`${API_BASE}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) });
      if (!r.ok) throw new Error(`${path} HTTP ${r.status}: ${await r.text()}`);
      return r.json();
    });
  },
  del(path) {
    return _trace("DELETE", path, async () => {
      const r = await fetch(`${API_BASE}${path}`, { method: "DELETE" });
      if (!r.ok) throw new Error(`${path} HTTP ${r.status}`);
      return r.json();
    });
  },
  upload(path, file, fieldName = "file") {
    return _trace("UPLOAD", path, async () => {
      const fd = new FormData();
      fd.append(fieldName, file);
      const r = await fetch(`${API_BASE}${path}`, { method: "POST", body: fd });
      if (!r.ok) throw new Error(`${path} HTTP ${r.status}`);
      return r.json();
    });
  },
  media(relUrl) {
    if (!relUrl) return "";
    return relUrl.startsWith("http") ? relUrl : `${API_BASE}${relUrl}`;
  },
};

// 最近一次 API 调用的小灯(放顶栏右上)
function ApiStatusLight() {
  const [last, setLast] = React.useState(window.__apiLast);
  React.useEffect(() => {
    const h = (e) => setLast(e.detail);
    window.addEventListener("api-call", h);
    return () => window.removeEventListener("api-call", h);
  }, []);
  if (!last) {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10.5, color: T.muted2 }} title="还没有 API 调用">
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: T.muted3 }} />
        idle
      </span>
    );
  }
  const ok = last.ok;
  const color = ok ? T.brand : T.red;
  const title = `${last.method} ${last.path}\n${ok ? "OK" : "FAIL"} · ${last.ms}ms${last.error ? "\n" + last.error : ""}`;
  const shortPath = last.path.length > 22 ? last.path.slice(0, 20) + "…" : last.path;
  return (
    <span title={title} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10.5, color: T.muted, fontFamily: "SF Mono, Menlo, monospace" }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: color }} />
      {last.method} {shortPath} · {last.ms}ms
    </span>
  );
}

Object.assign(window, { api, ApiStatusLight });
