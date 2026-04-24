// factory-settings.jsx — 设置页实装:5 个 section(小华偏好/品牌/平台账号/声音/形象)

function PageSettings({ onNav }) {
  const [s, setS] = React.useState(null);
  const [saved, setSaved] = React.useState(false);
  const [speakers, setSpeakers] = React.useState([]);
  const [avatars, setAvatars] = React.useState([]);
  const [aiHealth, setAiHealth] = React.useState(null);
  const [opusModels, setOpusModels] = React.useState([]);

  async function load() {
    const [settings, sp, av, ai, models] = await Promise.all([
      api.get("/api/settings"),
      api.get("/api/speakers").catch(() => []),
      api.get("/api/avatars").catch(() => []),
      api.get("/api/ai/health").catch(() => null),
      api.get("/api/ai/models").catch(() => ({ models: [] })),
    ]);
    setS(settings);
    setSpeakers(sp || []);
    setAvatars(av || []);
    setAiHealth(ai);
    setOpusModels(models?.models || []);
  }
  React.useEffect(() => { load(); }, []);

  async function reping() {
    setAiHealth(null);
    const ai = await api.get("/api/ai/health").catch(() => null);
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
              <div style={{ fontSize: 13, color: T.muted }}>加载中或暂无</div>
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
                        <div style={{ fontSize: 11, color: T.muted2, fontFamily: "SF Mono, monospace" }}>speaker_id={sp.id}</div>
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
              <div style={{ fontSize: 13, color: T.muted }}>加载中或暂无</div>
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
                        <div style={{ fontSize: 11, color: T.muted2, fontFamily: "SF Mono, monospace" }}>avatar_id={av.id}</div>
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
    <div style={{ padding: 18, background: "#fff", border: `1px solid ${T.borderSoft}`, borderRadius: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <div style={{ fontSize: 22 }}>{icon}</div>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600 }}>{title}</div>
          <div style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>{desc}</div>
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

Object.assign(window, { PageSettings });
