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

// D-069: 把后端错误转大白话, 不直接吐 Pydantic JSON / HTTP code
async function _handleErrorResponse(r) {
  let body;
  try { body = await r.json(); }
  catch (_) { try { body = await r.text(); } catch (_) { body = ""; } }
  // 422 Pydantic 校验错 — 详细字段映射
  if (r.status === 422 && body && body.detail) {
    const arr = Array.isArray(body.detail) ? body.detail : [body.detail];
    const msgs = arr.map((d) => {
      if (!d || typeof d !== "object") return String(d);
      const field = (d.loc && d.loc.slice(-1)[0]) || "字段";
      const ctx = d.ctx || {};
      if (d.type === "greater_than_equal") return `${field} 至少 ${ctx.ge}`;
      if (d.type === "less_than_equal")    return `${field} 最多 ${ctx.le}`;
      if (d.type === "greater_than")       return `${field} 要大于 ${ctx.gt}`;
      if (d.type === "less_than")          return `${field} 要小于 ${ctx.lt}`;
      if (d.type === "missing")            return `${field} 没填`;
      if (d.type === "string_too_short")   return `${field} 太短(至少 ${ctx.min_length} 字)`;
      if (d.type === "string_too_long")    return `${field} 太长(最多 ${ctx.max_length} 字)`;
      if (d.type === "value_error")        return d.msg || `${field} 不太对`;
      return d.msg ? d.msg : "格式不对";
    });
    return new Error("这次入参不太对: " + msgs.join("; "));
  }
  // 5xx 上游波动
  if (r.status >= 500) {
    return new Error("AI 上游临时不可用, 一会儿再试");
  }
  // 其他 4xx — 取 detail/message, 不露 stack
  const detail = (body && (body.detail || body.error || body.message)) || (typeof body === "string" ? body : "");
  const short = String(detail).slice(0, 180) || `请求失败 (${r.status})`;
  return new Error(short);
}

const api = {
  base: API_BASE,
  get(path) {
    return _trace("GET", path, async () => {
      const r = await fetch(`${API_BASE}${path}`);
      if (!r.ok) throw await _handleErrorResponse(r);
      return r.json();
    });
  },
  post(path, body) {
    return _trace("POST", path, async () => {
      const r = await fetch(`${API_BASE}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) });
      if (!r.ok) throw await _handleErrorResponse(r);
      return r.json();
    });
  },
  patch(path, body) {
    return _trace("PATCH", path, async () => {
      const r = await fetch(`${API_BASE}${path}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) });
      if (!r.ok) throw await _handleErrorResponse(r);
      return r.json();
    });
  },
  del(path) {
    return _trace("DELETE", path, async () => {
      const r = await fetch(`${API_BASE}${path}`, { method: "DELETE" });
      if (!r.ok) throw await _handleErrorResponse(r);
      return r.json();
    });
  },
  upload(path, file, fieldName = "file") {
    return _trace("UPLOAD", path, async () => {
      const fd = new FormData();
      fd.append(fieldName, file);
      const r = await fetch(`${API_BASE}${path}`, { method: "POST", body: fd });
      if (!r.ok) throw await _handleErrorResponse(r);
      return r.json();
    });
  },
  media(relUrl) {
    if (!relUrl) return "";
    return relUrl.startsWith("http") ? relUrl : `${API_BASE}${relUrl}`;
  },
};

// 最近一次 API 调用的小灯 (放顶栏右上).
// D-069: 硬关. 录视频露馅, 只允许 localStorage.show_api_status=1 开 (调试用).
// 移除从 settings 读取的路径, 防止误勾.
function ApiStatusLight() {
  const [last, setLast] = React.useState(window.__apiLast);
  const show = (() => {
    try { return localStorage.getItem("show_api_status") === "1"; }
    catch (_) { return false; }
  })();
  React.useEffect(() => {
    if (!show) return;
    const h = (e) => setLast(e.detail);
    window.addEventListener("api-call", h);
    return () => window.removeEventListener("api-call", h);
  }, [show]);

  if (!show) return null;  // 默认关 → 不渲染

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
