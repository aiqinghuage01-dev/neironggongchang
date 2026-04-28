// factory-errors.jsx — 全站错误出口事实源 (D-086)
//
// 目标 (GPT 验收): 所有用户可见错误都走同一个友好化入口, 页面禁止裸渲染
// e.message / err / traceback. 原始错误只能藏在折叠区里.
//
// 提供:
//   ERROR_PATTERNS        — 模式匹配表 (扩展自原 factory-flywheel.jsx)
//   humanizeError(raw)    — raw → {icon, title, suggestion, raw, matched}
//   normalizeErrorMessage(e) — Error/字符串/null → 用户可见 string
//   ErrorBanner           — 大块错误条 (页面顶部, 含折叠原始 + 重试按钮)
//   InlineError           — 简化内联红条 (替代 ⚠️ {err})
//   ErrorText             — 短文本 (小卡片/图片卡内, 长度有限)
//
// 加载顺序: tokens → errors → api (api 用 normalizeErrorMessage)
// 通过 window 全局挂载, 跟现有 jsx 共享模式一致.

const ERROR_PATTERNS = [
  // ─── 网络层 / 后端连接失败 (放最前, 高频 D-069 follow-up) ───
  { match: /后端连接失败|failed to fetch|load failed|networkerror|err_connection/i,
    icon: "🔌", title: "后端连接失败 (服务可能正在重启)",
    suggestion: "稍等几秒再点一次 · 一直不通就去终端跑 bash scripts/start_api.sh 看 backend 状态" },
  { match: /aborterror|user.*abort|signal.*abort|the operation was aborted/i,
    icon: "✋", title: "请求被取消",
    suggestion: "可能是切页了或主动取消 · 重新点一次按钮" },
  { match: /cors|access-control-allow|preflight/i,
    icon: "🚧", title: "跨域被拦 (CORS)",
    suggestion: "backend 配置异常, 检查 allow_origins · 或刷新浏览器试试" },

  // ─── D-062ii 柿榴常见错误 (清华哥反馈触发) ───────────────
  { match: /算力不足|余额不足|请充值|insufficient.*balance/i,
    icon: "💰", title: "柿榴算力不足 (要充值)",
    suggestion: "登录柿榴 Web 后台 → 充值 → 回来重试 · 这是 #1 高频原因" },
  { match: /createByText.*code=1|video\/createByText/i,
    icon: "🛠️", title: "柿榴 createByText 失败",
    suggestion: "看原始错误 msg · 常见: 算力不足 / speaker_id 不存在 / avatar_id 不存在" },
  { match: /speaker.*not.*found|speaker_id.*invalid|声音.*不存在/i,
    icon: "🎙️", title: "声音 speaker_id 找不到",
    suggestion: "去 ⚙️ 设置 看下当前 speaker 列表, 可能柿榴那边删了 · 重选一个声音" },
  { match: /avatar.*not.*found|avatar_id.*invalid|数字人.*不存在|形象.*不存在/i,
    icon: "👤", title: "数字人 avatar_id 找不到",
    suggestion: "去 ⚙️ 设置 看下当前 avatar 列表, 可能柿榴那边删了 · 重选一个数字人" },
  { match: /sidecar.*未就绪|cosyvoice.*not.*ready/i,
    icon: "🛠️", title: "CosyVoice sidecar 没起",
    suggestion: "终端跑 bash scripts/start_cosyvoice.sh 启动 sidecar" },

  // ─── 业务/资源 ────────────────────────────────────────────
  { match: /模板不存在|模板.*不存在|template.*not.*found/i,
    icon: "📦", title: "模板不见了",
    suggestion: "回 Step 3 换一个模板, 或选朴素模式直接出片" },
  { match: /数字人.*mp4.*不存在|mp4.*不存在|file not found.*mp4/i,
    icon: "🎬", title: "数字人 mp4 文件丢了",
    suggestion: "回 Step 2 重新合成数字人 (柿榴文件可能被清理)" },
  { match: /file not found|文件不存在|no such file/i,
    icon: "📂", title: "文件找不到",
    suggestion: "看原始 message 哪个文件 · 可能被清理或路径变了" },
  { match: /transcript.*不能为空|文案空了/i,
    icon: "📝", title: "文案是空的",
    suggestion: "回 Step 1 写一段口播文案 (≥ 30 字)" },
  { match: /生图超时|timeout.*120/i,
    icon: "⏰", title: "B-roll 生图超时 (apimart 120s)",
    suggestion: "apimart 当前慢, 等 30s 重试 / 或换 prompt 简短点" },
  { match: /convert_to_wechat_markup|bs4|premailer|No module named|ModuleNotFoundError|公众号排版工具|脚本失败 rc=.*wechat_article_raw_push/i,
    icon: "🧩", title: "公众号排版环境没接上",
    suggestion: "这是后台排版工具的运行环境问题, 修好后重新点一次「拼 HTML」即可" },

  // ─── HTTP / 上游 AI ────────────────────────────────────────
  { match: /timed?out|timeout|超时/i,
    icon: "⏰", title: "请求超时",
    suggestion: "网络或上游 AI 卡了, 等 10-30s 重试" },
  { match: /quota|429|rate.?limit|too many/i,
    icon: "🚧", title: "AI quota 满了",
    suggestion: "今日 apimart/deepseek 配额用完了, 等明天 / 或去 ⚙️ 设置切别的 key" },
  { match: /openclaw|claudeopuserror|deepseek.*error|apimart.*error|AI.*失败|AI 调用失败/i,
    icon: "🤖", title: "AI 调用失败",
    suggestion: "上游 AI 抖了一下, 等 10s 重试 · 老不好去 ⚙️ 设置看 AI 健康检查" },
  { match: /AI.*非.*JSON|JSON.*parse|JSON.*解析/i,
    icon: "🤖", title: "AI 返回了乱七八糟的内容",
    suggestion: "重试一次 (AI 偶尔抽风) · 多次失败考虑改文案再试" },
  { match: /HTTP 5\d\d|server error|internal server error|500|502|503|504/i,
    icon: "💥", title: "服务器内部错误",
    suggestion: "后端崩了一下, 等 10s 重试 · 重复出现去看 server log" },
  { match: /pydantic|validation.*error|greater_than|less_than|missing|field required|422/i,
    icon: "🚫", title: "请求参数不对",
    suggestion: "可能少填或填错了某个字段, 看原始 message 后半段定位 · 或回上一步检查" },
  { match: /HTTP 4\d\d|bad request|invalid/i,
    icon: "🚫", title: "请求格式有问题",
    suggestion: "可能少填东西? 检查上一步是否完整 · 或看 message 后半段细节" },

  // ─── 飞轮业务 (保留兼容 factory-flywheel) ────────────────
  { match: /scene_idx.*超界|out.?of.?range/i,
    icon: "🔀", title: "场景索引对不上模板",
    suggestion: "回 Step 3 重新选模板 → 重新对齐 (alignedScenes 跟新模板对不齐)" },
  { match: /只.*B.?C.?scene.*broll|only.*B.?C.*broll/i,
    icon: "🖼️", title: "这个场景不需要配图",
    suggestion: "A 场 (口播) 没 broll, 只 B/C 场要 · 检查你点的 scene 类型" },
  { match: /缺.*prompt|没法生图.*prompt/i,
    icon: "✏️", title: "B-roll prompt 是空的",
    suggestion: "在场景卡里填一行 prompt (≥ 5 字) 再点生图" },
  { match: /柿榴|qingdou/i,
    icon: "🛠️", title: "柿榴异常",
    suggestion: "看下面原始 message · 如果是网络/超时, 等 10s 重试 · 否则去柿榴 Web 后台看账号状态" },
];


function humanizeError(rawMsg) {
  const msg = String(rawMsg || "").trim();
  if (!msg) return { icon: "⚠️", title: "未知错误", suggestion: "", raw: msg, matched: false };
  for (const p of ERROR_PATTERNS) {
    if (p.match.test(msg)) {
      return { icon: p.icon, title: p.title, suggestion: p.suggestion, raw: msg, matched: true };
    }
  }
  return { icon: "⚠️", title: "出错了 (没匹配到已知模式)", suggestion: "下面是原始 message · 大多重试一次能过", raw: msg, matched: false };
}


// normalizeErrorMessage(e) → 用户可见 string
// - Error 对象 / 字符串 / null 都接受
// - 短中文用户提示 (e.g. "HTML 还没生成, 先回去拼一下") 原样返, 不当"出错"
// - 技术错误 → humanizeError 转友好 title
function normalizeErrorMessage(e) {
  if (e == null) return "未知错误";
  const raw = typeof e === "string" ? e : (e && (e.message || String(e))) || "";
  if (!raw.trim()) return "未知错误";
  // 已经是短中文用户提示 (无英文技术词, 无 traceback): 原样返
  // 判定: 长度 < 60 字, 不含英文 error/fail/exception/traceback 等
  const looksLikeChineseHint = (
    raw.length < 60
    && !/error|fail|exception|traceback|warning/i.test(raw)
    && /[一-龥]/.test(raw)  // 含中文
  );
  if (looksLikeChineseHint) return raw;
  // 否则走 humanizeError, 用 title 作为用户可见 message
  const h = humanizeError(raw);
  return h.title;
}


// ─── 大块 ErrorBanner (页面顶部, 折叠原始, 可带 actions 重试按钮) ───
function ErrorBanner({ err, actions, compact }) {
  if (!err) return null;
  const h = humanizeError(typeof err === "string" ? err : (err.message || String(err)));
  return (
    <div style={{
      padding: compact ? "8px 12px" : "12px 16px",
      background: T.redSoft, border: `1px solid ${T.red}44`,
      borderRadius: 10, marginBottom: 12,
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <span style={{ fontSize: compact ? 16 : 20, flexShrink: 0 }}>{h.icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: compact ? 12.5 : 13, fontWeight: 600, color: T.red }}>{h.title}</div>
          {h.suggestion && (
            <div style={{ fontSize: compact ? 11 : 12, color: T.red, marginTop: 2, opacity: 0.85 }}>{h.suggestion}</div>
          )}
          {/* 没匹配 pattern → 原始 msg 默认展开 (用户能直接看到内容); 匹配了 → 折叠 */}
          <details style={{ marginTop: 6 }} open={!h.matched}>
            <summary style={{ fontSize: 10.5, color: T.red, cursor: "pointer", opacity: 0.7 }}>
              {h.matched ? "看原始错误" : "原始错误 (默认展开):"}
            </summary>
            <pre style={{
              fontSize: 11, fontFamily: "SF Mono, monospace", color: T.red,
              whiteSpace: "pre-wrap", margin: "4px 0 0", lineHeight: 1.5,
              opacity: 0.85, padding: "6px 8px", background: "#fff", borderRadius: 4,
              border: `1px solid ${T.red}22`, maxHeight: 180, overflow: "auto",
            }}>{h.raw}</pre>
          </details>
        </div>
        {actions && actions.length > 0 && (
          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
            {actions.map((a, i) => (
              <Btn key={i} size="sm" variant={i === 0 ? "primary" : "outline"} onClick={a.onClick}>{a.label}</Btn>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}


// ─── 简化 InlineError (替代 page 内 ⚠️ {err}) ────────────────
// 单行/双行红色提示, 原始错误折叠
function InlineError({ err, actions, maxWidth = 820 }) {
  if (!err) return null;
  const h = humanizeError(typeof err === "string" ? err : (err.message || String(err)));
  return (
    <div style={{
      maxWidth, margin: "12px auto",
      padding: "10px 14px", background: T.redSoft, border: `1px solid ${T.red}55`,
      borderRadius: 10, color: T.red, fontSize: 13, lineHeight: 1.5,
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
        <span style={{ flexShrink: 0 }}>{h.icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600 }}>{h.title}</div>
          {h.suggestion && (
            <div style={{ fontSize: 11.5, opacity: 0.85, marginTop: 2 }}>{h.suggestion}</div>
          )}
          <details style={{ marginTop: 4 }}>
            <summary style={{ fontSize: 10, opacity: 0.7, cursor: "pointer" }}>
              {h.matched ? "看原始错误" : "原始错误:"}
            </summary>
            <pre style={{
              fontSize: 10.5, fontFamily: "SF Mono, monospace",
              whiteSpace: "pre-wrap", margin: "3px 0 0", lineHeight: 1.4,
              opacity: 0.8, padding: "4px 6px", background: "#fff", borderRadius: 3,
              maxHeight: 120, overflow: "auto",
            }}>{h.raw}</pre>
          </details>
        </div>
        {actions && actions.length > 0 && (
          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
            {actions.map((a, i) => (
              <button key={i} onClick={a.onClick} style={{
                background: i === 0 ? T.red : "transparent",
                color: i === 0 ? "#fff" : T.red,
                border: i === 0 ? "none" : `1px solid ${T.red}`,
                borderRadius: 6, padding: "4px 10px", fontSize: 11.5,
                cursor: "pointer", fontFamily: "inherit",
              }}>{a.label}</button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}


// ─── ErrorText (小卡片/图片卡内 短文本错误) ──────────────────
// 替代裸 `error.slice(0, 60)`, 显示友好 title 而非原始
function ErrorText({ err, maxLen = 60 }) {
  if (!err) return null;
  const raw = typeof err === "string" ? err : (err.message || String(err));
  const friendly = normalizeErrorMessage(raw);
  const display = friendly.length > maxLen ? friendly.slice(0, maxLen - 1) + "…" : friendly;
  return (
    <span title={raw} style={{ color: "#B8472D", fontSize: 11.5 }}>{display}</span>
  );
}


// 全局挂载, 让其他 jsx 直接用 (与现有 humanizeError/ErrorBanner 共享模式一致)
Object.assign(window, {
  humanizeError,
  normalizeErrorMessage,
  ErrorBanner,
  InlineError,
  ErrorText,
  ERROR_PATTERNS,
});
