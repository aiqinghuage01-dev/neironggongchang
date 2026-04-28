# 公众号 skill 踩坑大全

> 接公众号 (wechat) 工作流前必读. 每次踩到新坑追加一节.
> 写法: 症状 (老板看到啥) → 根因 → 修法 → 测试入口.
>
> 触发条件: 改 `backend/services/wechat_*.py`, `web/factory-wechat-v2.jsx`,
> 或 `~/Desktop/skills/公众号文章/` 任一文件前先扫一遍这个文档.

---

## 1. 双 URL 策略: media_url vs mmbiz_url (D-039 + D-090)

**核心约束**: 段间图永远有两个 URL, 不能混用.

```
mmbiz_url   = http://mmbiz.qpic.cn/sz_mmbiz_jpg/.../0?from=appmsg
              ↑ 微信图床原图. mmbiz.qpic.cn 有 referer 防盗链, 浏览器
                直接 <img src=mmbiz_url> 在 :8001 加载 → 显示
                "此图片来自微信公众平台 未经允许不可引用" 占位图.
                只有同源 (mp.weixin.qq.com) referer 才能看到原图.

media_url   = /media/wechat-images/<ts>_<name>.jpg
              ↑ 后端拷贝到本地 data/wechat-images/ 后挂在 :8000 /media/ 静态路由.
                浏览器加载 http://127.0.0.1:8000/media/... 不撞防盗链.
```

**前端预览必须用 media_url, 推送给微信必须用 mmbiz_url**.

| 场景 | 用哪个 URL | 文件 |
|------|---------|------|
| Step 5 段间图卡片预览 (老板看图修 prompt) | `media_url` 拼 `api.media()` | `factory-wechat-v2.jsx:916` |
| Step 6 排版预览 iframe srcDoc | `media_url` (D-090 改, 之前用 mmbiz_url 撞防盗链) | `wechat_scripts._md_to_wechat_html prefer_media=True` |
| Step 8 推送公众号草稿 (`wechat_html_path`) | `mmbiz_url` | `wechat_scripts.assemble_html` 渲染 push 版 |

**后端 (D-090)**: `assemble_html` 渲染两份 HTML:
- `wechat_article_raw.html` ← `prefer_media=True`, 用 media_url (前端 iframe srcDoc 拿)
- `wechat_article_raw_push.html` ← `prefer_media=False`, 用 mmbiz_url (converter 输入 → wechat_html_path 推送给微信)

**前端**: `imagePlans.filter(p => p.mmbiz_url).map(p => ({ mmbiz_url, media_url }))` —
两个字段都透传, 别只发 mmbiz_url.

**为什么不在前端 iframe 加载时加 referer policy**: `<meta name="referrer" content="no-referrer">`
能让 mmbiz 不挡, 但仅 Chrome 部分版本生效, 实际测过会反复. media_url 走本地代理是最稳.

**测试入口**: `tests/test_wechat_html_inject.py::test_md_to_wechat_html_prefer_media_*`,
`test_md_to_wechat_html_push_uses_mmbiz_not_media`.

---

## 2. `_inject_into_template` 替换正则 (D-089)

**症状**: Step 6 hero 标题对, 但正文区是 template 里的 demo 占位
("昨天中午, 工作室里就我一个人, 泡了杯茶坐在茶台前..."), 段间图全没插进去.
`/tmp/preview/last_assemble_request.json` 里 `img_in_raw_html=1` (只剩头像).

**根因**: 旧正则要求 `</div>\s*</div>\s*<div class="footer-fixed"` 紧贴, 但
`template-v3-clean.html` 里 `<div class="content">` + `<div class="article-body">`
都是隐式不闭的 div, 不存在那个序列 → `re.sub(count=1)` 静默 fail, demo 占位
被原样吐回, 4 张段间图 (在 body_html 里) 跟着丢光.

**修法**: 宽容区间 `<div class="content"...> ... <div class="footer-fixed"`
+ `re.subn` 拿命中数, `n != 1` 直接 raise WechatScriptError.

**铁律**: 任何 `re.sub(template, count=1)` 替换 skill template 都必须用 `subn`
拿命中数, `n != 1` 立即 raise. 静默 fail = 老板拿到残品, 比立即报错坏 100 倍.

**测试入口**: `tests/test_wechat_html_inject.py::test_inject_replaces_demo_content`,
`test_inject_raises_when_no_footer_anchor`, `test_inject_raises_when_no_content_div`.

---

## 3. LLM 空 content 不能进自检 (D-088)

**症状**: Step 4 写长文 UI 显示 "0 字 · write 6558 tok · check 6686 tok ·
三层自检 ✅ 6/6 · 107/120 通过 · 无禁区" 但正文区域空白. DB 里 task ok 状态,
result.content="", tokens.write=6558.

**根因 (两层)**:
1. Opus / OpenClaw proxy 偶发: 烧了 6558 completion_tokens 但 message.content 为空
   (max_tokens 全烧 thinking 没产 text block, 或代理转发丢字段).
2. DeepSeek 自检在空字符串上 hallucinate, 给 107/120 通过 + 编"文章整体调性到位"
   总评. 自检 prompt 没要求"先确认文章非空".

**修法**:
- 客户端层 (`shortvideo/claude_opus.py` + `shortvideo/deepseek.py`):
  text 解析挪进 retry lambda, 空 content + completion_tokens>0 抛
  `TransientLLMError` → with_retry 重试 1 次. 持续空才向上抛.
- 业务层兜底 (`backend/services/wechat_pipeline.py:write_article`): content 空就
  raise RuntimeError, 不进自检, 不让 DeepSeek 在空字符串上 hallucinate 通过.

**铁律**: 任何"LLM 写正文 + 另一个 LLM 自检"的双 LLM 链路, **业务层必须先判文不空再喂自检**.
不能信任空字符串当成功. 自检 prompt 加"先看文章非空"是不可靠 (LLM 会 hallucinate).

**测试入口**: `tests/test_llm_empty_content.py`.

---

## 4. Phase 4 头像注入 + Phase 5 推送 sanitize (历史 D-042 / D-045 / D-046 / D-048)

(简要索引, 改这块前 git log 看具体 commit)

- **D-042 → D-045**: errcode 45166 (素材冲突). 推送前 `sanitize_for_push` 必须把
  老板贴入的 mmbiz_url 防盗链 referer 部分剥掉, 但**别误伤合法图**.
- **D-046**: push 后头像丢失. 头像图必须合法上传到微信图床 (uploadimg) 拿一个
  mmbiz_url, 不能拿本地 base64 直接发.
- **D-048**: hero 标题重复 ("一个餐饮老板一个餐饮老板花3"). 老正则 `f'{title[:6]}<span>{hero_highlight}</span>'`
  + 默认 `hero_highlight=title[:8]` 导致前 6/8 字重复. 修法:
  `_compose_hero_title_html` 全文 title 为底, 子串才高亮一次.
- **D-048 副**: 副标题 "上周一个开火 · 锅店的老板给 · 我看他的品牌" 鬼断句.
  老逻辑 `re.findall("[一-龥]{2,6}", first_line)` 贪婪切 6 字一段. 修法:
  `_auto_subtitle` 按中英文标点切短语, 取前 3 个 2-14 字合法短语.

---

## 5. 异步 task 必须 fail-fast 不能伪 ok (D-088 + 普适)

**铁律**: `wechat_pipeline.write_article_async` (`tasks_service.run_async`) 的
sync_fn 抛任何异常 → task 状态 = failed, UI 看到清楚错误.
**禁止"返回伪结果当 ok"** —— 比如 LLM 返空就构造个 `{content: "", self_check: ...}`
让 task 结存到 DB, UI 看到 "完成" 但实际是空壳. 老板会因为信任 ok 状态而
不去重跑.

修代码改这块时记: 怀疑结果质量就 raise, 别返伪结构.

---

## 6. template 是 skill 仓库的资产, 不能擅改

`~/Desktop/skills/公众号文章/assets/template-v3-clean.html` 是清华哥手动维护的.
backend 兼容 template 现状, 别反过来要求 template 满足 backend 苛刻正则.

如果要给 template 加新锚点 (比如显式 close div), 先告诉清华哥, 让他自己改 + commit
到 skill 仓库. 不许 backend 直写 skill 仓库.

---

## 7. 改完必跑的闭环 (CLAUDE.md 完工铁律)

公众号 skill 任何后端改动后:

1. `pytest -x tests/test_wechat_*.py` 必过 (50+ 测试)
2. **真前端 :8001 playwright 闭环** (file:// 看 raw_html 不算!): chromium goto
   `http://127.0.0.1:8001/?page=wechat`, 用 `page.evaluate` 调 `/api/wechat/html`
   或真走 8 步 (烧 token), iframe 里图能加载, console clean, Read 截图视觉确认.
3. 改 LLM 调用 / 自检逻辑: `tests/test_llm_empty_content.py` + `test_llm_retry.py` 必过.
4. 改 template 替换: `tests/test_wechat_html_inject.py` 必过 (raises + 占位被替换 + 段间图都在).
5. 改推送链路: `wechat_html` 内**不能含 `/media/` 或 `127.0.0.1`** (推送给微信会暴露本地).

---

*记住: 老板看到的"症状"和后端"根因"中间有 5-6 层 (前端 → API → assemble → inject → md_to_html → template 正则), 任何一层静默 fail 都会让症状错位. 修这条 skill 的代码时, 怀疑就 raise, 别静默给"看起来对的残品".*
