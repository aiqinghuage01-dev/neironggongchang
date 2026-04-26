// factory-settings.jsx — 设置页实装:5 个 section(小华偏好/品牌/平台账号/声音/形象)

function PageSettings({ onNav }) {
  const [s, setS] = React.useState(null);
  const [saved, setSaved] = React.useState(false);
  const [speakers, setSpeakers] = React.useState([]);
  const [avatars, setAvatars] = React.useState([]);
  const [aiHealth, setAiHealth] = React.useState(null);
  const [opusModels, setOpusModels] = React.useState([]);

  // D-060b 修评审 P0 硬伤: 之前 Promise.all 等 /api/ai/health 5s 超时拖死整个页面.
  // 改: 主体 (settings/speakers/avatars) 立即加载渲染, AI 信息 fire-and-forget 后到.
  async function load() {
    const [settings, sp, av] = await Promise.all([
      api.get("/api/settings"),
      api.get("/api/speakers").catch(() => []),
      api.get("/api/avatars").catch(() => []),
    ]);
    setS(settings);
    setSpeakers(sp || []);
    setAvatars(av || []);

    // AI 探活独立 fire-and-forget — 后端 /api/ai/health 慢 (探活会真打 LLM)
    // 不阻塞主页面渲染
    api.get("/api/ai/health").catch(() => null).then(setAiHealth);
    api.get("/api/ai/models")
      .catch(() => ({ models: [] }))
      .then(m => setOpusModels(m?.models || []));
  }
  React.useEffect(() => { load(); }, []);

  async function reping() {
    // 用户主动点 ↻ 重探 → fresh=1 跳过缓存, 真打 AI
    setAiHealth(null);
    const ai = await api.get("/api/ai/health?fresh=1").catch(() => null);
    setAiHealth(ai);
    const m = await api.get("/api/ai/models").catch(() => ({ models: [] }));
    setOpusModels(m?.models || []);
  }

  async function saveOne(key, value) {
    const next = { ...s, [key]: value };
    setS(next);
    await api.post("/api/settings", { [key]: value }).catch(() => {});
    setSaved(true);
    setTimeout(() => setSaved(false), 1200);
  }

  async function resetAll() {
    if (!confirm("重置所有设置为默认值?")) return;
    const next = await api.post("/api/settings/reset", {});
    setS(next);
  }

  if (!s) return <div style={{ padding: 40, color: T.muted, textAlign: "center" }}>加载设置...</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", position: "relative" }}>
      <div style={{ padding: "22px 32px", background: "#fff", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 12 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 600 }}>⚙️ 设置</div>
          <div style={{ fontSize: 12.5, color: T.muted, marginTop: 4 }}>平台账号 · 声音 · 数字人 · 小华偏好 · 品牌</div>
        </div>
        <div style={{ flex: 1 }} />
        {saved && <Tag color="green">✓ 已保存</Tag>}
        <Btn size="sm" onClick={resetAll}>重置默认</Btn>
      </div>

      <div style={{ flex: 1, overflow: "auto", padding: "24px 32px", background: T.bg }}>
        <div style={{ maxWidth: 860, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }}>

          {/* AI 引擎 */}
          <SettingsSection icon="🧠" title="AI 引擎 · 小华的大脑" desc="当前全站文案/投流/公众号/朋友圈都走这个引擎">
            <ChoiceRow label="选择引擎" current={s.ai_engine || "opus"} onChange={v => saveOne("ai_engine", v).then(reping)} options={[
              { v: "opus", label: "Claude Opus 4.6", hint: "走 OpenClaw proxy · Max 订阅,免 API 费" },
              { v: "deepseek", label: "DeepSeek", hint: "备用 · 按 API 计费" },
            ]} />
            {(s.ai_engine || "opus") === "opus" && (
              <>
                <TextRow label="Proxy URL" value={s.opus_base_url} onSave={v => { saveOne("opus_base_url", v); setTimeout(reping, 300); }} placeholder="http://localhost:3456/v1" />
                <TextRow label="API Key" value={s.opus_api_key} onSave={v => { saveOne("opus_api_key", v); setTimeout(reping, 300); }} placeholder="(留空用 OpenClaw 默认 not-needed)" />
                {opusModels.length > 0 ? (
                  <ChoiceRow label="模型" current={s.opus_model || "claude-opus-4-6"} onChange={v => { saveOne("opus_model", v); setTimeout(reping, 300); }} options={opusModels.map(m => ({ v: m, label: m }))} />
                ) : (
                  <TextRow label="模型" value={s.opus_model} onSave={v => { saveOne("opus_model", v); setTimeout(reping, 300); }} placeholder="claude-opus-4-6" />
                )}
              </>
            )}
            <div style={{ padding: "9px 12px", background: aiHealth?.ok ? T.brandSoft : T.redSoft, border: `1px solid ${aiHealth?.ok ? T.brand + "44" : T.red + "44"}`, borderRadius: 8, fontSize: 12, color: aiHealth?.ok ? T.brand : T.red, marginTop: 8, display: "flex", alignItems: "center", gap: 8 }}>
              <span>{aiHealth?.ok ? "✓" : "✕"}</span>
              <span style={{ flex: 1 }}>
                {!aiHealth ? "检测中..." :
                 aiHealth.ok ? `已连通 · ${aiHealth.engine} · ${aiHealth.model || ""} · 回了一句"${aiHealth.reply}"` :
                 `连不通: ${aiHealth.error?.slice(0, 100) || "(未知)"}`}
              </span>
              <Btn size="sm" onClick={reping}>↻ 重探</Btn>
            </div>
          </SettingsSection>

          {/* 图引擎 (D-064) */}
          <SettingsSection icon="🎨" title="生图引擎 · 默认" desc="封面 / 朋友圈 / 段间图 / 公众号封面 都走这个引擎. 每个生图按钮旁边有 chip 可临时换.">
            <ChoiceRow label="默认引擎" current={s.image_engine || "apimart"} onChange={v => saveOne("image_engine", v)} options={[
              { v: "apimart",  label: "🎨 apimart (GPT-Image-2)", hint: "默认 · 30-60s/张 · 公众号段间图必走 (会自动上传微信图床)" },
              { v: "dreamina", label: "🎬 即梦", hint: "字节即梦 · 60-120s/张 · 段间图暂不支持 (没接微信图床上传)" },
            ]} />
          </SettingsSection>

          {/* 调试可见性 */}
          <SettingsSection icon="🔧" title="开发调试" desc="默认全部隐藏, 需要看后台动作时打开">
            <ChoiceRow label="顶栏 API 调用条" current={s.show_api_status_light ? "show" : "hide"} onChange={v => saveOne("show_api_status_light", v === "show")} options={[
              { v: "hide", label: "🙈 隐藏", hint: "默认 · 工厂感更纯净" },
              { v: "show", label: "👀 显示", hint: "顶栏右上显示 GET /api/... · 30ms, 看每次 API 真实延迟" },
            ]} />
          </SettingsSection>

          {/* 小华偏好 */}
          <SettingsSection icon="🤖" title="小华偏好" desc="调小华的性格、主动性、默认风格">
            <ChoiceRow label="语气" current={s.li_tone} onChange={v => saveOne("li_tone", v)} options={[
              { v: "friendly", label: "亲和", hint: "像身边小伙伴" },
              { v: "sharp", label: "犀利", hint: "清华哥式反矫情" },
              { v: "pro", label: "专业", hint: "讲细节不唠叨" },
            ]} />
            <ChoiceRow label="主动性" current={s.li_proactive} onChange={v => saveOne("li_proactive", v)} options={[
              { v: "low", label: "低", hint: "只在被问时说" },
              { v: "medium", label: "中", hint: "每步主动提示" },
              { v: "high", label: "高", hint: "主动推选题、查热点" },
            ]} />
            <ChoiceRow label="默认改写风格" current={s.li_rewrite_default} onChange={v => saveOne("li_rewrite_default", v)} options={[
              { v: "casual", label: "轻松口语" },
              { v: "pro", label: "专业讲解" },
              { v: "story", label: "故事叙事" },
            ]} />
            <TextRow label="避讳词(逗号分隔)" placeholder="例:割韭菜,炸裂,绝了" value={s.li_banned_words} onSave={v => saveOne("li_banned_words", v)} />
          </SettingsSection>

          {/* 我的声音 */}
          <SettingsSection icon="🎙️" title="我的声音" desc={`已有 ${speakers.length} 个 · 做视频默认会用 ${s.voice_default_speaker_id ? "下面选中的这个" : "第一个"}`}>
            {speakers.length === 0 ? (
              // D-062ee (AUDIT-5): 之前 "加载中或暂无" 死胡同, 给操作指引 + 复制按钮
              <div style={{ padding: 16, background: T.bg2, borderRadius: 8, fontSize: 13, color: T.muted, lineHeight: 1.7 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: T.text, marginBottom: 8 }}>📭 还没克隆过声音</div>
                <div style={{ marginBottom: 10 }}>
                  声音管理走 <b style={{ color: T.text }}>柿榴 Web 后台</b> (与数字人形象同):
                </div>
                <ol style={{ margin: "6px 0 10px 22px", padding: 0, fontSize: 12.5 }}>
                  <li>登录柿榴后台 · 进"声音管理" · 创建</li>
                  <li>录 ≥ 10s 你的清晰口播 (安静环境, 普通话标准)</li>
                  <li>训练 3-5 分钟, 完成后回这里 ↻ 刷新</li>
                </ol>
                <Btn size="sm" onClick={() => {
                  navigator.clipboard?.writeText("登录柿榴后台 → 声音管理 → 创建 → 上传 ≥10s 清晰口播 → 训练 3-5 分钟");
                  alert("操作步骤已复制");
                }}>📋 复制步骤</Btn>
                <span style={{ fontSize: 11, color: T.muted2, marginLeft: 8 }}>(柿榴是外部系统, 暂无 SSO 直跳)</span>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {speakers.map(sp => {
                  const on = s.voice_default_speaker_id === sp.id;
                  return (
                    <div key={sp.id} onClick={() => saveOne("voice_default_speaker_id", sp.id)} style={{
                      display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
                      background: on ? T.brandSoft : "#fff", border: `1px solid ${on ? T.brand : T.borderSoft}`,
                      borderRadius: 8, cursor: "pointer",
                    }}>
                      <div style={{
                        width: 16, height: 16, borderRadius: "50%",
                        border: `1.5px solid ${on ? T.brand : T.muted2}`,
                        background: on ? T.brand : "transparent", flexShrink: 0,
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>{on && <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#fff" }} />}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 600 }}>{sp.title || `声音 ${sp.id}`}</div>
                      </div>
                      {on && <Tag size="xs" color="green">默认</Tag>}
                    </div>
                  );
                })}
              </div>
            )}
          </SettingsSection>

          {/* 数字人形象 */}
          <SettingsSection icon="👤" title="数字人形象" desc={`已有 ${avatars.length} 个 · 做视频默认用这个`}>
            {avatars.length === 0 ? (
              // D-062ee: 同声音, empty 状态加可操作指引
              <div style={{ padding: 16, background: T.bg2, borderRadius: 8, fontSize: 13, color: T.muted, lineHeight: 1.7 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: T.text, marginBottom: 8 }}>📭 还没创建数字人形象</div>
                <div style={{ marginBottom: 10 }}>
                  数字人管理走 <b style={{ color: T.text }}>柿榴 Web 后台</b>:
                </div>
                <ol style={{ margin: "6px 0 10px 22px", padding: 0, fontSize: 12.5 }}>
                  <li>登录柿榴后台 · 进"数字人管理" · 创建</li>
                  <li>上传 30s 自拍视频 (头肩, 表情自然, 光线均匀)</li>
                  <li>训练 3-5 分钟, 完成后回这里 ↻ 刷新</li>
                </ol>
                <Btn size="sm" onClick={() => {
                  navigator.clipboard?.writeText("登录柿榴后台 → 数字人管理 → 创建 → 上传 30s 自拍视频 → 训练 3-5 分钟");
                  alert("操作步骤已复制");
                }}>📋 复制步骤</Btn>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {avatars.map(av => {
                  const on = s.avatar_default_avatar_id === av.id;
                  return (
                    <div key={av.id} onClick={() => saveOne("avatar_default_avatar_id", av.id)} style={{
                      display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
                      background: on ? T.brandSoft : "#fff", border: `1px solid ${on ? T.brand : T.borderSoft}`,
                      borderRadius: 8, cursor: "pointer",
                    }}>
                      <div style={{
                        width: 16, height: 16, borderRadius: "50%",
                        border: `1.5px solid ${on ? T.brand : T.muted2}`,
                        background: on ? T.brand : "transparent", flexShrink: 0,
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>{on && <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#fff" }} />}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 600 }}>{av.title || `形象 ${av.id}`}</div>
                      </div>
                      {on && <Tag size="xs" color="green">默认</Tag>}
                    </div>
                  );
                })}
              </div>
            )}
          </SettingsSection>

          {/* 平台账号 */}
          <SettingsSection icon="🔗" title="平台账号" desc="各平台账号名(用于显示,发布时填入)">
            {[
              { key: "platform_douyin_handle", plat: "douyin", label: "抖音" },
              { key: "platform_shipinhao_handle", plat: "shipinhao", label: "视频号" },
              { key: "platform_xhs_handle", plat: "xiaohongshu", label: "小红书" },
              { key: "platform_wechat_handle", plat: "wechat", label: "公众号" },
              { key: "platform_kuaishou_handle", plat: "kuaishou", label: "快手" },
            ].map(p => (
              <div key={p.key} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <PlatformIcon platform={p.plat} size={20} />
                <div style={{ width: 80, fontSize: 13, color: T.muted }}>{p.label}</div>
                <TextRowInline value={s[p.key]} placeholder={`@你的${p.label}账号名`} onSave={v => saveOne(p.key, v)} />
              </div>
            ))}
            <div style={{ fontSize: 11.5, color: T.muted2, marginTop: 8 }}>
              🚧 OAuth 绑定 / 一键发布 · Phase 4 实装
            </div>
          </SettingsSection>

          {/* 公众号草稿 (D-051: 头像配置) */}
          <WechatDraftSection />

          {/* 品牌 */}
          <SettingsSection icon="🎨" title="品牌 · 字体 · 配色" desc="封面/海报自动套用">
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <div style={{ width: 80, fontSize: 13, color: T.muted }}>主色</div>
              <input
                type="color"
                value={s.brand_primary || "#2a6f4a"}
                onChange={e => saveOne("brand_primary", e.target.value)}
                style={{ width: 40, height: 32, border: "none", background: "transparent", cursor: "pointer" }}
              />
              <div style={{ fontSize: 12, color: T.muted, fontFamily: "SF Mono, monospace" }}>{s.brand_primary}</div>
              <Btn size="sm" onClick={() => saveOne("brand_primary", "#2a6f4a")}>恢复青绿</Btn>
            </div>
            <ChoiceRow label="字体" current={s.brand_font || "system"} onChange={v => saveOne("brand_font", v)} options={[
              { v: "system", label: "系统默认" },
              { v: "serif", label: "衬线(书感)" },
            ]} />
          </SettingsSection>

        </div>
      </div>
      <LiDock context="设置" />
    </div>
  );
}

function SettingsSection({ icon, title, desc, children }) {
  return (
    <div style={{
      padding: 20, background: "#fff",
      border: `1px solid ${T.borderSoft}`, borderRadius: 14,
      boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16,
                    paddingBottom: 14, borderBottom: `1px solid ${T.borderSoft}` }}>
        <div style={{
          width: 40, height: 40, borderRadius: 10, background: T.brandSoft,
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20,
          flexShrink: 0,
        }}>{icon}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15.5, fontWeight: 600, color: T.text }}>{title}</div>
          <div style={{ fontSize: 12, color: T.muted, marginTop: 3, lineHeight: 1.5 }}>{desc}</div>
        </div>
      </div>
      <div>{children}</div>
    </div>
  );
}

function ChoiceRow({ label, current, options, onChange }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
      <div style={{ width: 100, fontSize: 12.5, color: T.muted }}>{label}</div>
      <div style={{ display: "flex", gap: 2, background: T.bg2, padding: 3, borderRadius: 100 }}>
        {options.map(o => (
          <button key={o.v} onClick={() => onChange(o.v)} title={o.hint} style={{
            padding: "5px 12px", fontSize: 12, borderRadius: 100,
            background: current === o.v ? "#fff" : "transparent",
            color: current === o.v ? T.text : T.muted,
            border: "none", cursor: "pointer", fontFamily: "inherit",
            fontWeight: current === o.v ? 600 : 500,
            boxShadow: current === o.v ? "0 1px 3px rgba(0,0,0,0.06)" : "none",
          }}>{o.label}</button>
        ))}
      </div>
    </div>
  );
}

function TextRow({ label, value, placeholder, onSave }) {
  const [v, setV] = React.useState(value || "");
  React.useEffect(() => { setV(value || ""); }, [value]);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
      <div style={{ width: 100, fontSize: 12.5, color: T.muted }}>{label}</div>
      <input
        value={v}
        onChange={e => setV(e.target.value)}
        onBlur={() => v !== value && onSave(v)}
        onKeyDown={e => e.key === "Enter" && (e.target.blur())}
        placeholder={placeholder}
        style={{ flex: 1, padding: "7px 12px", fontSize: 13, border: `1px solid ${T.borderSoft}`, borderRadius: 8, outline: "none", fontFamily: "inherit" }}
      />
    </div>
  );
}

function TextRowInline({ value, placeholder, onSave }) {
  const [v, setV] = React.useState(value || "");
  React.useEffect(() => { setV(value || ""); }, [value]);
  return (
    <input
      value={v}
      onChange={e => setV(e.target.value)}
      onBlur={() => v !== (value || "") && onSave(v)}
      onKeyDown={e => e.key === "Enter" && e.target.blur()}
      placeholder={placeholder}
      style={{ flex: 1, padding: "7px 12px", fontSize: 13, border: `1px solid ${T.borderSoft}`, borderRadius: 8, outline: "none", fontFamily: "inherit" }}
    />
  );
}

// ─── 公众号草稿配置 (D-051) ─────────────────────────────
// 让用户上传一张头像图, 后端存到 data/wechat-avatar/ + 写
// ~/.wechat-article-config 的 author_avatar_path. push 流程 (D-046) 自动用.

function WechatDraftSection() {
  const [status, setStatus] = React.useState(null);
  const [uploading, setUploading] = React.useState(false);
  const [err, setErr] = React.useState("");
  const fileRef = React.useRef(null);

  async function refresh() {
    try {
      const r = await api.get("/api/wechat/avatar");
      setStatus(r);
      setErr("");
    } catch (e) { setErr(e.message); }
  }
  React.useEffect(() => { refresh(); }, []);

  async function onFile(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 1024 * 1024) {
      setErr(`图太大 ${(f.size/1024).toFixed(0)} KB · 上限 1024 KB`);
      e.target.value = "";
      return;
    }
    setUploading(true); setErr("");
    try {
      await api.upload("/api/wechat/avatar", f, "file");
      await refresh();
    } catch (ex) {
      setErr(ex.message || "上传失败");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  async function clearConfig() {
    if (!confirm("移除头像配置 · 下次 push 头像会被剥掉. 确认?")) return;
    try {
      await api.del("/api/wechat/avatar");
      await refresh();
    } catch (e) { setErr(e.message); }
  }

  return (
    <SettingsSection icon="📄" title="公众号草稿头像"
      desc="push 时模板硬编码头像会被微信拒收 (errcode 45166), 上传一张你自己的头像, 自动替换">
      {!status ? (
        <div style={{ fontSize: 12, color: T.muted2 }}>加载中…</div>
      ) : status.configured && status.exists ? (
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <img src={api.media(`/media/wechat-avatar/${status.path.split('/').pop()}`)}
            alt="头像" style={{ width: 48, height: 48, borderRadius: "50%", objectFit: "cover", border: `1px solid ${T.borderSoft}` }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, color: T.text, fontWeight: 500 }}>已配头像</div>
            <div style={{ fontSize: 10.5, color: T.muted2, fontFamily: "SF Mono, monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {status.path} · {(status.size_bytes/1024).toFixed(0)} KB
            </div>
          </div>
          <Btn size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>{uploading ? "上传中…" : "🔄 换一张"}</Btn>
          <Btn size="sm" variant="outline" onClick={clearConfig}>移除</Btn>
        </div>
      ) : status.configured && !status.exists ? (
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 48, height: 48, borderRadius: "50%", background: T.redSoft, color: T.red, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>⚠</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, color: T.red, fontWeight: 500 }}>头像配置存在但文件丢了</div>
            <div style={{ fontSize: 10.5, color: T.muted2, fontFamily: "SF Mono, monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {status.path}
            </div>
          </div>
          <Btn size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>{uploading ? "上传中…" : "重新上传"}</Btn>
        </div>
      ) : (
        <div>
          <div style={{ fontSize: 12, color: T.muted, marginBottom: 10 }}>
            ⚠️ 还没配头像 · push 出去的草稿头像会被剥掉
          </div>
          <Btn variant="primary" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
            {uploading ? "上传中…" : "+ 上传头像图 (≤1MB · jpg/png)"}
          </Btn>
        </div>
      )}
      <input ref={fileRef} type="file" accept="image/jpeg,image/png" onChange={onFile} style={{ display: "none" }} />
      {err && (
        <div style={{ marginTop: 10, padding: "8px 10px", background: T.redSoft, color: T.red, borderRadius: 6, fontSize: 11.5 }}>
          ⚠️ {err}
        </div>
      )}
    </SettingsSection>
  );
}

Object.assign(window, { PageSettings });
