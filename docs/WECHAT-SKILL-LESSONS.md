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

### 1.1 底部头像也是双 URL 问题 (D-099)

**症状**: Step 6 HTML 预览底部作者卡片里, 段间图都正常,但头像位置显示
"此图片来自微信公众平台 未经允许不可引用"占位图.

**根因**: template-v3-clean.html 底部 author-card 硬编码了公众号头像
`mmbiz.qpic.cn/...from=appmsg`. D-090 只把正文段间图拆成 preview `media_url`
和 push `mmbiz_url`, 没处理 template 自带头像. 所以 iframe 预览仍然撞微信防盗链.

**修法**:
- preview raw HTML: `assemble_html` 先拿本地头像 URL,再用 `replace_template_avatar`
  替换 template 硬编码头像.
- 本地头像优先级:
  1. Settings 上传的 `author_avatar_path` 且文件在 `data/` 下 → 直接转
     `http://127.0.0.1:8000/media/...`.
  2. 手工配置的外部本地图 → 复制到 `data/wechat-avatar/avatar-preview.*`.
  3. 没配头像 → 下载/缓存 template 的 mmbiz 头像到
     `data/wechat-avatar/template-avatar.png`.
- push raw HTML: 仍保留 mmbiz URL. **不能**把 `127.0.0.1/media/...` 写进推送给
  微信的 HTML, 微信草稿箱加载不到本机地址.

**诊断入口**: `/tmp/preview/last_assemble_request.json` 的 `avatar_preview`:
`source` / `url` / `replaced`.

**测试入口**: `tests/test_wechat_avatar.py::test_preview_avatar_url_*`,
`test_assemble_html_preview_replaces_avatar_but_push_keeps_wechat_url`.

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

## 7. 段间图 4 张必须统一风格 (D-091 → D-091b 修正)

**症状**: 4 张段间图都生成成功了, 但视觉风格各不相同 (有的明亮店铺, 有的昏暗茶室,
有的科技蓝光). 放在一篇公众号里"有点奇怪", 老板想要"选手绘就 4 张都手绘".

**根因**: `plan_section_images` (LLM) 出 4 个 prompt 时虽然 system 写了"真实感照片
风格,暖色调", 但每段 prompt 自带的叙事氛围各异 → 真生图时 apimart 按 prompt **主体**
叙事走, 4 张视觉风格不一致.

### D-091 v1 错误版 (踩坑记录)
**v1 思路**: 前端切风格时 strip 旧 append + 套新 append 到 prompt 末尾,
靠"模型对 prompt 末尾权重高"实现风格统一.

**v1 真测后发现错**: 老板切到"复古怀旧" 4 张图全重生了, 视觉风格还是真实摄影/手绘
混着, 完全没"复古胶片"感. 即, **末尾 append 风格关键词对 apimart 几乎无效** —
模型按主体叙事走, 末尾的 ",复古胶片质感,90 年代色调" 被当成弱修饰忽略.

**为什么 v1 自以为对**: 我 (Claude) 跑了 playwright 闭环, 验证了 "切风格后 4 张
prompt 文本末尾真改了" + "console clean", 就当通过. **没真烧 apimart 跑一张图看
视觉**. 这是 D-075 教训复发: "字段抓错也返 200, sanity 看不出". 我看到 prompt 文本
变了就以为问题解决了, 实际上生图引擎根本不按这套.

### D-091b 修法 (真测有效)
**核心**: 让 LLM 把每个 prompt **主体**重写, 把风格融进画面描述本身, 不只是末尾贴.

- `backend/services/wechat_scripts.py:restyle_section_prompts(prompts, style_id)`
- API: `POST /api/wechat/restyle-prompts`, body: `{prompts: [...], style_id: "vintage"}`
- 前端 `pickGlobalStyle` 切风格时调这个 endpoint, 拿回的新 prompt 替换 4 张原 prompt + 清状态自动重生.
- LLM 走 deepseek 轻路由 (3-5s/4 张, 0.0005 元), 不烧 Opus.

**真烧 apimart 验证视觉对比** (D-091b 必跑, D-091 v1 漏):
- 同一段叙事 base "木桌散落面包和手机" 走 LLM restyle 后 vintage / cartoon 各跑 1 张
- vintage 图: 暗墨绿色调 + 颗粒感 + 老式黑莓键盘机 + 暗角做旧
- cartoon 图: 扁平描边 + 暖橙色 + 卡通包装 + iPhone + 餐包插画
- **视觉差异巨大 ✅**, 跟 v1 末尾 append 出来"全都长一样"对比鲜明.

**铁律**: 任何"靠 prompt 改风格"的方案, 必须真烧至少 1 张 token 看视觉成品, 不
许只看 prompt 文本变化就当 OK. 文本对 ≠ 视觉对. 模型对 prompt 各部分权重不一,
末尾追加可能完全无效.

**localStorage 偏好**: `wechat:section_image:global_style` 持久化用户选择.

**测试入口**:
- `tests/test_wechat_*.py`: 后端 restyle helper 单测可加 (没烧 token 也能测 LLM 调用 mock).
- playwright `/tmp/_d091b_restyle_loop.js`: 注入 wf snapshot, 切 vintage, 验
  endpoint 被调 + 4 条 prompt 都含 vintage 关键词 + 4 条都 differ from original.
- **端到端真烧**: 切两个差异大的风格 (vintage + cartoon) 各 1 张, Read 截图肉眼
  对比. 别省这步.

---

## 8. 我做事必守的 5 条新规则 (D-092 反思)

D-088 / D-089 v1 / D-091 v1 同一个 session 连续踩 3 次"看似工作其实没工作"的坑.
老板批评"做事毛躁很容易出问题, 举一反三". 把根子上的规则记下来, 以后必守:

1. **承诺前先问"我怎么验证这个真生效"**: 必须是老板能感知的真实指标, 不是我能跑通
   的代理指标. 改 prompt → 真烧 1 张图看视觉. 改自检 → 真喂空文跑一遍看会不会被
   hallucinate 通过. 改前端 → 真前端 :8001 跑, 不用 file://.
2. **禁写编造的判断**: "实测有效" / "X 模型对 Y 权重高" 这种没真测过的不写. 不知道
   就直接说"我不知道, 得测一下". 写在技术档案里的编造比无知更糟, 后人会信 (D-091 v1
   档案就编了 "apimart 对末尾权重高").
3. **每次抓到一个错, 主动扫一遍找同类**: 不再"老板抓一个我修一个". D-092 就是这次
   的应用 — 抓 D-091 v1 末尾 append 失效后, 主动扫了 cover (验证后假设错没修) +
   hotrewrite/voicerewrite (修了) + 单张 chip (删了).
4. **完工总结禁用语**: "应该好了" / "理论上修了" / "请验收"没真烧 token 的不许说.
   替换为: "我截了图 + console 干净 + 已加回归测试, 请验收."
5. **做不到验证就明说**: "我没法本地验证 X, 请你帮我看下" — 不要假装验证过.
   CLAUDE.md 完工铁律 §"真做不到验证时" 的明文要求.

---

## 9. cover 4 选 1 末尾 append 实际 work — 反例 (D-092 验证)

D-091 v1 段间图末尾 append 失效后, 我以为 cover 4 选 1 也是同款 (`gen_cover_batch`
里 `prompts = [f"{base} · {COVER_STYLE_VARIANTS[i % 4]}"]`). **真去验证就发现错了** —
老板 4-25 历史生成的 4 张候选封面 (`data/wechat-cover-batch/wxcover_1777080221-343_*.png`)
视觉真区分:
- 0 现代简约: 蓝调极简 + 网页 mock-up
- 1 暖色真实感: 真实餐厅老板场景 + 价目对比
- 2 深色高对比: 深背景 VS 大字冲击
- 3 复古怀旧: 灯笼红横幅 + 老味道字 + 漫画

cover work 的可能原因 (这条仍是猜, 没真测): cover prompt 主体短 (从标题抽), 风格
描述用 ` · ` 而非 `,` 分隔, 整体 prompt 短模型对风格关键词敏感度高. 但**没必要按
D-091b 同款改** — 把 work 的东西改坏比改好风险大.

铁律: 直觉同款的两个地方, 各跑一次真验证再决策, 不要一杆子打死.

---

## 10. 静默 except 是 bug 温床 (D-093 教训)

历史 case (老板用了几个月没人发现): `tasks._autoinsert_text_work` 调
`insert_work(tokens_used=...)` 抛 TypeError → 外层 `except Exception: pass` 吞掉 →
13 条文字 task 完成 0 条入作品库 → 老板看作品库以为"功能没做", 其实是 bug.

**静默 except 的危害**:
- 掩盖真 bug, 让"看似工作其实没工作"持续存在
- D-088/D-091 v1/D-093 都是同型 — 表层 happy path 跑通, 底下 silent fail
- 没监控、没告警、没 log → 没人会发现

**铁律**: `except Exception: pass` 在生产代码里禁止. 至少:
```python
except Exception as e:
    logging.getLogger(__name__).warning(f"... failed: {type(e).__name__}: {e}")
```
能在 stderr / 日志里看到错误就行, 不强求向上 raise (有时候是合理 best-effort), 但
**至少留个证据**.

**反例 (历史踩过)**:
```python
# tasks.py:_autoinsert_text_work (D-093 前)
try:
    insert_work(...)
except Exception:
    pass  # 回写失败不阻塞主流程  ← 看着体贴, 实际把 TypeError 藏 6 个月
```

**正例 (D-093 修后)**:
```python
except Exception as e:
    logging.getLogger("tasks._autoinsert_text_work").warning(
        f"autoinsert text work failed for task={task_id} kind={kind}: {type(e).__name__}: {e}"
    )
```

**审查清单**: 改任何 `except: ...` / `except Exception:` 时问自己:
- [ ] 我是不是在掩盖一个真 bug? (不知道答案就 log warning, 别 pass)
- [ ] 失败时上层调用方能感知吗? (感知不到的话 log 是底线)
- [ ] 测试是不是覆盖了 except 路径? (一般没有, 因为 except 默默走过去)

---

## 11. `or {}` / `or []` fallback 是 D-088 同款假成功的祖传写法 (D-094 教训)

历次 D-088/D-089/D-091 v1/D-093 都是变形的"看似工作其实没工作"陷阱. D-094 一次性
扫全项目 9 个文案 pipeline + 3 个前端预览 + 3 个 template, 发现祖传写法:

```python
obj = _extract_json(r.text, "object") or {}
return {"levels": obj.get("levels") or [], ...}
```

这种写法的问题:
- LLM 返非 JSON → `_extract_json` 返 None → `or {}` 兜底成空 dict
- `obj.get("levels") or []` 又兜底成空数组
- 上层拿到 `{levels: [], summary: "", ...}` 完全合法的"伪成功"对象
- task 状态 = ok, UI 看到"完成", 但点开是空页/空卡/0 选项卡死

**铁律**: 任何 `_extract_json(...)` 后跟 `or {}` / `or []` 必看一眼:
- LLM 真返这个空数据时, **业务上能接受这是"成功"吗**?
  - 例: compliance 0 违规 = 合法成功 (LLM 真返了 violations=[], 不是解析失败)
  - 反例: 投流 batch=[] = 不合法 (LLM 没出文案)
- 如果不能接受, 改 `parsed = _extract_json(...)`; `if parsed is None: raise`.
- 关键字段缺也 raise (如 `levels=[]` / `content=""`).

**修法模板** (D-094 重复用了 12 次):
```python
parsed = _extract_json(r.text, "object")
if parsed is None:
    raise RuntimeError(
        f"X 步骤 LLM 输出非 JSON (tokens={r.total_tokens}). "
        f"输出头: {(r.text or '')[:200]!r}"
    )
key_field = parsed.get("xxx")
if not key_field:  # 或更细的有效性判断
    raise RuntimeError(f"X 步骤关键字段缺失 ...")
```

**这次 D-094 修了的 pipeline 列表**:
- compliance_pipeline: _scan_violations + _write_version
- touliu_pipeline.generate
- planner_pipeline: identify_levels + write_plan
- baokuan_pipeline: extract_dna + rewrite
- wechat_pipeline: gen_titles + gen_outline + rewrite_section
- hotrewrite_pipeline.analyze
- voicerewrite_pipeline.analyze
- wechat_scripts: plan_section_images + restyle_section_prompts

**已确认 *不* 改的**:
- materials_pipeline: 设计区分 LLM source / heuristic source + confidence (0.7/0.4),
  失败 fallback heuristic 不假装是 LLM 标签, 已对.
- dhv5_pipeline: 已经 raise Dhv5Error 路径, 不需要改.
- 公众号 cover 4 选 1: 真 4 张视觉风格区分 (D-092 验证), 不动.

---

## 12. "做成视频" 链路按 seed 来源分流 (D-095)

**老板原话**: "做成视频这块, 它应该是直接做成数字人视频. 点完之后就进入到数字人的
流程, 声音克隆和数字人的流程, 现在是点完之后又回到主页了, 这个流程是不通的".

**实际不是回主页**, 是 PageMakeV2 默认 step="script" 渲染 4-tab 起点选择 (📹 别人
的视频 / 🎙️ 我自己录的 / 🔥 今天的热点 / ✏️ 已写好的文案), **视觉上像主页**.
seed 设进 script state 但 activeTab 默认 "videoLink", 所以 textarea 在 tab 4 看不见.
老板感觉"啥都没发生", 误以为回主页.

**11 个 source skill** 都用同一个 seed 模式 `localStorage.setItem("make_v2_seed_script", text) + onNav("make")`,
但 seedFrom.skill 字段两类语义:
- **文案就绪** (baokuan/hotrewrite/voicerewrite/moments/planner/touliu/wechat/rework):
  完整文案, 用户已选好, 直接进数字人合成
- **草稿模板** (hot-topic/topic/viral): seed 是 `# 热点 ... 口播正文:\n` 占位, 用户
  还得自己写正文, 留 script step 让 textarea 显示

**修法** (`web/factory-make-v2.jsx` PageMakeV2):
```js
const READY_SKILLS = new Set([
  "baokuan", "hotrewrite", "voicerewrite", "moments",
  "planner", "touliu", "wechat", "rework",
]);
useEffect(() => {
  if (seed && !script) {
    setScript(seed);
    setSeedFrom(from);
    if (READY_SKILLS.has(from?.skill)) {
      setStep("voice-dh");  // 直跳数字人合成
    }
    // 否则留 script step, 但 MakeV2StepScript 默认 plainText tab 让 textarea 显示
  }
}, []);
```

**MakeV2StepScript 改 activeTab 默认逻辑**: 不能用 useState 初值 (PageMakeV2 useEffect
异步设入 seedFrom 跟不上), 用 useEffect 监听 seedFrom 变化时切到 plainText tab.

**测试入口**: `/tmp/_baokuan_video_link.js` (文案就绪类直跳 voice-dh) +
`/tmp/_hot_topic_link.js` (草稿类留 script + plainText tab) + `/tmp/_d095_all_sources.js`
(spot check baokuan/hotrewrite/voicerewrite 真链路).

---

## 13. 改完必跑的闭环 (CLAUDE.md 完工铁律)

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
