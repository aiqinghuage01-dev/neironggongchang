# Known Issues / 待办清单

最后更新:2026-04-23

## 🟢 已验证通过

- [x] 石榴 API 连通(余额/avatar/speaker/create/status/download)
- [x] DeepSeek LLM 改写 + 标题生成
- [x] 视频下载(yt-dlp)
- [x] SQLite 作品库 CRUD
- [x] 后台任务队列 + 进度回调
- [x] Streamlit 六卡 UI 渲染
- [x] 端到端真实生成(pytest `test_shiliu_end_to_end_short` 通过)
- [x] UI 载入示例文案 → 改写 → 最终文案联动(preview_eval 脚本实测)
- [x] UI 切换 avatar/speaker 下拉框

## 🟡 待实现(P3 / P4 阶段)

### ASR(视频 URL → 自动提取文案)

当前 `extractor.transcribe_placeholder()` 返回空字符串。规划接入方式(择一):

- **本地 whisper.cpp**:`brew install whisper-cpp`,Metal 加速,large-v3 模型约 3GB
- **OpenAI Whisper API**:需要 OpenAI key
- **火山引擎 ASR**:需要火山 API

**推荐**:`whisper.cpp` 本地,不依赖外部 API,M1 Pro 实测 RTF≈0.3。

### CosyVoice 2 本地声音克隆

当前为桩实现 (`cosyvoice.CosyVoiceLocal`)。阶段 3 会:

1. 装 ModelScope 的 `cosyvoice` 包
2. 下载 CosyVoice2-0.5B 模型(约 1.5GB)到 `~/.cache/cosyvoice2`
3. 改用 MPS 后端(Apple Silicon 加速)
4. 暴露 `clone(text, reference_wav)` → 输出 wav

备选:Fish-Speech(更轻量,装起来更快)。

## 🟡 UI 细节

### text_area 的 Streamlit 状态管理

当前处理:用 `on_click` callback 写入 `st.session_state[widget_key]`,避免 rerun 丢失。
已修:卡片 1 的载入示例、卡片 2 的改写结果同步。
未来加 widget 时务必用同样模式,**禁止**在按钮的 `if st.button(...):` 分支内部修改已渲染 widget 的 state。

### 作品库无分页

目前最多显示 50 条,超出需要查 SQLite。简单产品够用。

### 视频生成进度只依赖石榴返回

如果石榴返回 pending → ready 中间没有中间百分比,进度条会从 0% 直接跳到 100%。不是 bug,是石榴 API 特性。

## 🔴 不处理(超出当前范围)

- Windows 版 — 要为 Windows 重新打包且本地模型兼容要重测,用户只用 Mac
- 多用户 — 产品定位单机工具,不做 SaaS
- 视频一键发布到抖音/小红书 — 需要各平台 OpenAPI 授权,非核心
- 打包成 .dmg — Streamlit 桌面化方案不成熟,以 `bash scripts/start.sh` 为交付方式

## Bug 复现步骤(如果遇到)

### 石榴 API 超时

- 查网络:`curl -sS https://api.16ai.chat/api/v1/asset/get -H "Authorization: Bearer $SHILIU_API_KEY" -X POST`
- 查点数:App 顶栏会显示红色 "石榴失联"
- 长文案(>500 字)生成可能需要 2-3 分钟,增大 `scripts/e2e_shiliu.py` 的 `max_wait_sec`

### DeepSeek 429

免费额度有上限。升级付费账户或等待流控恢复。

### yt-dlp 下载失败

抖音/小红书风控严格,经常需要更新 yt-dlp:`uv pip install -U yt-dlp`。
