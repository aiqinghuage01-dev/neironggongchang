# 交付清单 · 内容工厂 v0.3.0 · 设计稿 C2 全量实施

> 交付时间:2026-04-24
> 基于:Anthropic Design 手稿 C2「对话+实时预览」方案
> 历史版本:v0.1 见 [DELIVERY-v0.1.md](DELIVERY-v0.1.md)

## ✅ 本轮新增交付

### 1. 两个新 API 客户端(全真业务,零降级)
| API | 文件 | 能力 |
|---|---|---|
| **轻抖**(链接→文案) | `shortvideo/qingdou.py` | 抖音/快手/B站 等链接 → 文案(异步轮询) |
| **apimart GPT-Image-2** | `shortvideo/apimart.py` | AI 封面生成(53s/张 实测 · 9:16) |

两个配套 pytest 可跑,smoke `scripts/smoke_new_apis.py`(apimart 已过)。

### 2. FastAPI 后端 · `:8000`
`backend/api.py` 12 个 endpoint,对应设计稿 6 页 + 作品库 + 健康检查。

### 3. 前端 · `:8001` · React CDN + Babel
`web/` 8 页完整落地(设计稿 6 页 + 补 P5.5 等待 + 作品库):

| # | 页面 | 说明 |
|---|---|---|
| P1 | 入口 | 一个大输入框,正则自动分流(链接 / 文案) |
| P1b | 扒文案中 | 进度条 + 轮询 + 15s 预期提示 + 超时"直接粘贴"兜底 |
| P1c | 扒文案结果 | 原视频卡 + 识别信息 + 原文预览 |
| P2 | 改文案 | 3 风格 + DeepSeek 实时改写 + 5 个打磨 chip |
| P3 | 声音 | 现成 speaker / 上传音频 / 现场录音(MediaRecorder) |
| P4 | 形象 | 石榴 avatar_list 对比卡(最多 3 张) |
| P5 | 剪辑模板 | 5 模板切换 + 4 BGM(标 SoonBadge) + 竖屏预览 |
| P5.5 | **等待合成**(按 design 反馈补) | 环形进度 + 实时状态 + 倒计时 |
| P6 | 发布 | 真视频播放 + **4 张 GPT-Image-2 并发封面** + 多平台选择 + 发布 |
| - | **作品库**(按 design 反馈补) | 卡片网格,状态/预览/下载/删除 |

### 4. 设计语言保真
- 奶油米色 `#f0eee9` 底 + 森林绿 `#2a6f4a` 主色
- 顶栏 6 步进度指示器 + 底部对话 dock + 底部 chip
- 1280×920 设计画布,窄屏允许横向滚动

## 🏁 一键启动(3 个终端 + 浏览器)

```bash
cd ~/Desktop/neironggongchang

bash scripts/start_api.sh            # 终端 1 · :8000
bash scripts/start_web.sh            # 终端 2 · :8001
bash scripts/start_cosyvoice.sh      # 终端 3 · :8766(可选,声音克隆要用)

open http://localhost:8001/          # 浏览器
```

设计稿 C2 的 6 页流程都在 `http://localhost:8001/` 一个入口里。

## 🧪 验证

- ✅ `scripts/smoke_new_apis.py` apimart 53s/张 PNG
- ✅ `pytest -v -s` 原 10/10 通过(shiliu / deepseek / works / cosyvoice / 端到端)
- 🔄 `scripts/e2e_web.py` 端到端:改写→石榴生成→4 张封面→发布→作品库(跑中,见 `e2e_web.log`)

## ⚠️ 设计 chat 反馈全部吸收

| 反馈点 | 落地 |
|---|---|
| P5 模板别硬做 5 个 | ✅ 5 模板都可选(视觉差异走 CSS),实际渲染走石榴 |
| 封面 prompt 统一一种风格 × 4 | ✅ `cover_prompt()` 固定模板 · 并发 4 张 |
| 轻抖要有进度 + 超时兜底 | ✅ P1b 环形 spinner + 倒计时 + "直接粘贴"按钮 |
| 数字人生成等待页 | ✅ P5.5 新建,SVG 环形进度 + 实时状态 |
| 作品库 P0 要有 | ✅ 卡片网格页,状态颜色区分 |
| BGM 版权 | ✅ 4 首预设都标 SoonBadge,保留"上传自己的"入口 |

## 📁 新增 / 改动文件

```
backend/api.py                     新建 · FastAPI 主
shortvideo/qingdou.py              新建 · 轻抖
shortvideo/apimart.py              新建 · GPT-Image-2
shortvideo/config.py               加 4 字段:QINGDOU_API_KEY + APIMART_API_KEY
web/                               全新目录,8 个 jsx + index.html
scripts/start_api.sh               新建
scripts/start_web.sh               新建
scripts/smoke_new_apis.py          新建
scripts/e2e_web.py                 新建
.env                               加 QINGDOU + APIMART 两对 key
.claude/launch.json                加 qlc-web + qlc-api 两个配置
```

## ⚠️ 已知限制

- **BGM 合成**:UI 可选但后端没把 BGM 混到石榴视频里(避免版权)
- **多平台真发布**:`/api/publish` 只更新 work 状态,不真调抖音/快手 OpenAPI
- **定时发布**:SoonBadge
- **P4 形象 ≥2 个**:你石榴账号当前只有 1 个 avatar,第 2/3 张显示 "SoonBadge · 暂未创建"
- **BGM 上传 / 换封面 /换衣服**:UI 标 SoonBadge
