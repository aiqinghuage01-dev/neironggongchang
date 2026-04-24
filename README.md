# ShortVideo Studio

> 一页式数字人口播视频工作流 —— 从爆款文案到成片,一条链路走完。

复刻自一位 ShortVideo Studio 作者的架构,针对 Mac 本地环境优化:
**云 LLM(DeepSeek)做智能推理 + 云数字人(石榴/16AI)做主视频 + 本地 CosyVoice 2 做独立声音克隆**。

![六卡一页流式 UI](screenshots/shiliu_e2e_frame.jpg)

## 核心能力(对标参考视频)

| 卡片 | 功能 | 实现 |
|------|------|------|
| ① 文案输入 | URL 提取 / 直接粘贴 | yt-dlp 下载 + ASR(P3 接入) |
| ② 改写文案 | 口播节奏化改写 | DeepSeek `deepseek-chat` |
| ③ 声音克隆 | **独立模块**,不阻断主流程 | CosyVoice 2 本地(MPS) |
| ④ 数字人生成 | 主视频合成 | 石榴(16AI)API |
| ⑤ 标题生成 | 批量候选标题 | DeepSeek |
| ⑥ 作品库 | SQLite 持久化 + 预览/播放/删除 | 本地 |

顶栏实时显示石榴点数、DeepSeek 模型、CosyVoice 就绪状态、已用 LLM tokens。

## 快速上手

### 1. 准备

- macOS 12+(推荐 Apple Silicon)
- Python 3.12(uv 自动安装)
- `brew install ffmpeg`
- 两把 API Key:
  - **石榴 (16AI)** — <https://shiliu.chat> 申请
  - **DeepSeek** — <https://platform.deepseek.com> 注册生成

### 2. 首次安装

```bash
cd ~/Desktop/neironggongchang
bash scripts/setup.sh
```

`setup.sh` 会:
- 自动装 `uv`(若无)
- 创建 `.venv` 并装依赖
- 检查 ffmpeg
- 从 `.env.example` 生成 `.env`(需要手动填 key)
- 跑 smoke test 验证 API 连通

填完 `.env` 后再跑一次 `bash scripts/setup.sh` 即可完成冒烟测试。

### 3. 启动

```bash
bash scripts/start.sh
```

浏览器打开 <http://localhost:8765>。

## 目录结构

```
neironggongchang/
├── app.py                     # Streamlit 单文件 UI(一页六卡)
├── shortvideo/                # 业务逻辑包
│   ├── config.py              # 集中加载 .env
│   ├── shiliu.py              # 石榴 (16AI) 同步客户端
│   ├── deepseek.py            # DeepSeek LLM 封装(OpenAI SDK 兼容)
│   ├── works.py               # 作品库 SQLite CRUD
│   ├── tasks.py               # 后台任务池(线程 + 进度回调)
│   ├── extractor.py           # yt-dlp + ffmpeg 抽音
│   └── cosyvoice.py           # CosyVoice 2 本地 TTS(P3 完整接入)
├── scripts/
│   ├── setup.sh               # 首次安装
│   ├── start.sh               # 启动 Streamlit
│   ├── smoke_test.py          # 冒烟测试(API 连通)
│   └── e2e_shiliu.py          # 石榴端到端命令行测试
├── tests/
│   └── test_integration.py    # pytest 集成测试(10 用例)
├── data/
│   ├── audio/samples/         # 声音克隆参考样本
│   ├── audio/generated/       # 生成的音频
│   ├── videos/                # 石榴下载的 MP4
│   └── works.db               # SQLite 作品库
├── requirements.txt
├── pyproject.toml
└── .env                       # 密钥(不入库)
```

## 架构决策

### 为什么 Streamlit 而不是 Electron?

- **Streamlit 一个 Python 文件就能跑**,迭代快,对 Mac 零打包负担
- **Electron** 包体积 200MB+,打包签名每次 5-10 分钟
- 未来需要给用户分发桌面版再重构也不迟

### 为什么声音克隆 ≠ 数字人驱动?

**石榴 API 只接受文本输入(`video/createByText`)**,不接受外部音频。
所以:

- 主链路:文案 → 石榴内置 speaker → 数字人视频(一条龙)
- 本地 CosyVoice 2:**独立模块**,生成的音频可用于 B-roll 旁白、混剪配音、试听参考 —— 不参与主视频生成

这是和参考视频一致的双轨架构。

### 为什么不用本地 LLM?

- M1 Pro 16G 跑 qwen2.5:7b 会挤占给数字人/TTS 的内存
- DeepSeek Chat 每千 tokens ¥0.001,一条视频文案 ≈ 200 tokens ≈ 0.0002 元,忽略不计
- 云 LLM 质量稳定压制本地 7B 模型

## 测试

```bash
# 全量集成测试(含一条真实石榴视频生成,约 60 秒)
source .venv/bin/activate
pytest -v -s
```

10 个用例覆盖:配置加载、石榴余额/avatar/speaker 查询、DeepSeek 改写/标题、作品库 CRUD、任务管理器、CosyVoice 桩、端到端视频生成。

### 端到端压测

```bash
source .venv/bin/activate
python scripts/stress_test.py
```

脚本跑 5 条不同长度/风格的文案,真实调用石榴 API + 下载 MP4。

**最近一次结果**(见 [test_report.md](test_report.md)):
- 5/5 通过
- 总耗时 275s(平均 55s/条)
- 石榴点数消耗 520

演示视频见 [demo_videos/](demo_videos/):
- `demo_long_copy_200chars.mp4` — 200 字长文案(16.8 MB · 76.5s 生成)
- `demo_numbers_english.mp4` — 数字+英文混排(6 MB · 44.8s)
- `demo_ui_submitted.mp4` — 从 UI 完整走流程生成的视频(13.4 MB)

## 成本(截至 2026-04-23 实测)

| 环节 | 每条视频 | 备注 |
|------|---------|------|
| DeepSeek 改写 | 0.002 元 | ~150 tokens |
| DeepSeek 标题 | 0.002 元 | ~200 tokens |
| 石榴视频生成 | ~10 点 | 一个月点数包 ¥X(看套餐) |
| 本地 CosyVoice | 0 | 电费 |

## 已知限制 / 待办

见 [KNOWN_ISSUES.md](KNOWN_ISSUES.md)。

## License

个人使用。数字人算法由石榴/16AI 提供,遵循其服务条款。
