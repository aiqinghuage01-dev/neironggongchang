# 交付清单 · ShortVideo Studio v0.1.0

> 交付时间:2026-04-24
> 交付人:Claude (在本机 MacBook Pro M1 Pro 16G 上自主完成)

## ✅ 已交付(自测通过)

### P0 · 环境
- [x] 项目骨架 `~/Desktop/neironggongchang/`
- [x] uv + Python 3.12 + .venv + 依赖装好
- [x] ffmpeg 已验证
- [x] `.env` 已填写(石榴 + DeepSeek key)

### P1 · 核心业务层 (shortvideo/)
- [x] `config.py` — 集中配置加载
- [x] `shiliu.py` — 石榴 (16AI) 同步客户端(generate/poll/download 一条龙)
- [x] `deepseek.py` — DeepSeek LLM(改写/标题/要点提取)
- [x] `works.py` — SQLite 作品库 CRUD
- [x] `tasks.py` — 线程池任务管理器 + 进度回调
- [x] `extractor.py` — yt-dlp 视频下载 + 音频抽取
- [x] `cosyvoice.py` — 本地声音克隆 HTTP 客户端(sidecar 模式)

### P1 · 集成测试
- [x] **pytest 10/10 通过**(含一条真实石榴视频生成)

### P2 · UI (app.py · Streamlit)
- [x] 一页六卡流式布局(深色紫渐变)
- [x] 顶栏 AI 服务控制台(石榴点数/DeepSeek 状态/CosyVoice 状态/tokens 用量)
- [x] 卡片 ① 文案输入 - URL 下载 / 直接粘贴 / 示例一键载入
- [x] 卡片 ② DeepSeek 改写 + 风格提示 + 最终文案
- [x] 卡片 ③ CosyVoice 本地声音克隆
- [x] 卡片 ④ 石榴数字人生成(avatar/speaker 下拉 + 提交 + 进度 + 预览)
- [x] 卡片 ⑤ 标题批量生成
- [x] 卡片 ⑥ 作品库(列表 / 播放 / 删除)
- [x] 修复 2 个关键 bug:
  1. Streamlit widget state 只认 `st.session_state[key]` 不认 `value=` 参数
     — 改用 `on_click` callback 统一修改
  2. 后台线程访问 `st.session_state` 会报 AttributeError
     — 提交前在主线程捕获所有值作为闭包参数

### P3 · 压测与证据
- [x] **压测 5/5 通过** · 总耗时 275s · 消耗 520 石榴点(见 [test_report.md](test_report.md))
- [x] Demo 视频 3 条(见 [demo_videos/](demo_videos/))
- [x] UI 端到端:从 "加载示例→改写→提交→视频落地作品库" 完整跑通

### P4 · 文档与脚本
- [x] `README.md` — 上手/目录/架构/测试/成本
- [x] `KNOWN_ISSUES.md` — 已知限制 + 待办清单
- [x] `DELIVERY.md` — 本文件
- [x] `scripts/setup.sh` — 一键装依赖 + smoke test
- [x] `scripts/start.sh` — 一键启动 Streamlit
- [x] `scripts/setup_cosyvoice.sh` — CosyVoice 独立 venv + 模型下载
- [x] `scripts/start_cosyvoice.sh` — 启动 CosyVoice sidecar
- [x] `scripts/smoke_test.py` — 3 大服务连通测试
- [x] `scripts/e2e_shiliu.py` — 石榴命令行端到端
- [x] `scripts/stress_test.py` — 5 条文案真视频压测
- [x] `scripts/test_cosyvoice.py` — CosyVoice 端到端

### P4 · CosyVoice 2(本地声音克隆)- ✅ 全部验证通过
- [x] 独立 venv `vendor/CosyVoice/.venv` 创建完成
- [x] 依赖安装完成(torch 2.3.1 + MPS 可用)
- [x] 模型下载完成(5.3 GB 在 `~/.cache/cosyvoice2/iic/CosyVoice2-0___5B/`)
- [x] Sidecar 服务代码 `vendor/CosyVoice/sv_server.py`(FastAPI + 常驻模型)
- [x] **真实推理测试通过**:
  - 输入:15 秒你本人的参考音频(抽自 `今天看到一个热搜.mp4`)
  - 合成文本:28 字中文
  - 输出:`data/audio/generated/cosyvoice_test_output.wav` · 5.48 秒 · 24kHz
  - **推理耗时 27 秒**(M1 Pro + MPS,首次含 kernel 编译;后续更快)

## 🏁 你回来后,启动的完整步骤

```bash
cd ~/Desktop/neironggongchang

# 终端 1:CosyVoice sidecar(留着不要关)
bash scripts/start_cosyvoice.sh
# 等看到 "Model loaded" + "Application startup complete"

# 终端 2:主 App
bash scripts/start.sh
# 浏览器打开 http://localhost:8765
```

两个都起来后,顶栏会显示:
- 🟢 石榴 · XXXX 点
- 🟢 DeepSeek · deepseek-chat
- 🟢 CosyVoice 本地

第三个从黄变绿意味着声音克隆也就绪了。

---

## ❌ 没做的(列在 KNOWN_ISSUES.md 里)

- ASR(视频 URL → 自动提取文案)— 目前需手动粘贴
- 打包成 .dmg / .app
- 混剪功能
- 卡密激活 / 付费系统
- Windows 版

---

## 🏁 快速开始(你回来后)

```bash
cd ~/Desktop/neironggongchang

# 启动主 App
bash scripts/start.sh                    # http://localhost:8765

# (可选)启动 CosyVoice sidecar(另开终端)
bash scripts/start_cosyvoice.sh          # http://localhost:8766

# 跑所有测试
source .venv/bin/activate
pytest -v -s                             # 集成测试(消耗 ~10 石榴点)
python scripts/stress_test.py            # 压测 5 条(消耗 ~500 石榴点)
python scripts/test_cosyvoice.py         # CosyVoice 端到端
```

## 石榴点数记录

- 交付前余额:~15090 点
- 整个开发+测试消耗:~800 点
  - 冒烟测试:10 点
  - pytest 端到端:10 点
  - UI 手动提交(调试 2 次,成功 1 次):20 点
  - 压测 5 条:520 点
  - 其他探索:几十点
- 交付后余额:~14290 点
- 有效期:2027-03-22

## 安全提醒

- `.env` 文件包含真实 API Key,**不要提交到 GitHub**(已自动排除通过 .gitignore)
- 你之前在聊天里贴过的 DeepSeek Key 建议吊销重发一次
