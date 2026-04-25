# 已知问题 / 半成品 / 用户体感坑

> 对外可见但还没修, 或修了一半的事. 清华哥睡醒可以快速扫一遍知道当前哪些路不通.
> 修好一项就把它从这里删掉(或挪到 PROGRESS.md 的"已完成"段).

最后更新: 2026-04-25

---

## 🔴 用户实测踩过的坑

### 1. 公众号 push 段间图丢失(D-039 之后没修)
**症状**: Step 5 段间配图明明跑出 4 张, push 后文章里只有 1 张图(头像).
**已确认**: `wechat_article_raw.html` body 里就只有 1 张 `<img>` (头像), 段间图没进 raw HTML.
**已诊断半成**: D-043 在 `assemble_html` 入口加了诊断 dump `/tmp/preview/last_assemble_request.json`, 含 `section_images_received` 等. 但用户当前在用的文章是 D-043 之前生成的, 这文件还没落盘.
**下一步**: 用户生一篇新文章 push 一次, 把 `/tmp/preview/last_assemble_request.json` 发给我即可精确定位 — 是前端 imagePlans.filter 过滤光了, 还是后端 _md_to_wechat_html 丢了.

### 2. 公众号文章 hero 文字 / 副标题用户没指定时不够漂亮
**症状**: 默认 hero_subtitle 从首段抽 — 短文/无标点首段时退化效果一般 (D-048 修了最难看的鬼断句, 但 30 字截断仍可能截在标点中间).
**当前**: 退化到首段前 30 字 + ……
**改进点**: 让前端 Step 6 模板预览页可以编辑 hero_title_html / hero_subtitle / hero_badge 三个字段 — 用户预览不满意可以手改. 当前 frontend 只接了 template 切换, 没暴露 hero 字段编辑.

---

## 🟡 半成品 / 占位 (未真接)

### 3. 小华夜班 4 条预设里 2 条 runner 是占位
**位置**: backend/services/night_runners.py
- ⏸ `one-fish-many-meals` runner: ~/Desktop/skills/ 下没这个 skill, 也需要 watchdog 监听 data/inbox/audio/. 当前用户启用此任务点"立即跑"会写一条 "未接入" success 假成功记录.
- ⏸ `kb-compiler` runner: ~/Desktop/skills/ 下没这个 skill. 同上.

✓ 已接通的真 runner: `daily-recap` (D-040f) · `content-planner` (D-047 出选题).

**清华哥决策**: 等真有 skill 再接入这俩 runner. 不是 bug 是 backlog.

### 4. file_watch 触发器未实装
**位置**: night_jobs 表 trigger_type 支持 cron/file_watch/manual, 但 D-040c 调度器只接了 cron. file_watch 的 job 即使 enabled=True 也不会自动跑.
**前端**: NightJobEditor 选 "监听目录" 时已经显示 ⚠️ "watchdog 还没接 · 当前不会真触发".
**接入条件**: 加 watchdog pip 依赖 + night_scheduler.start_file_watcher() · 等 one-fish-many-meals skill 真要用时一起做.

### 5. NightShiftPage delete 用浏览器原生 confirm()
**位置**: web/factory-night-v2.jsx PageNightShift.delJob().
**改进点**: 换成项目内对话框组件, 视觉一致.
**优先级**: P3 polish.

---

## 🟢 OpenAPI 文档进度 (B 方案延续)

### 6. 老 endpoint 没补 tags / summary / Field description
**位置**: backend/api.py.
**状态**:
- ✓ 小华夜班 7 + 公众号头像 3 (D-040b/D-051): 已规范
- ✓ **公众号 8 步 11 个 endpoint (D-053): 已规范** (skill-info / titles / outline / write / rewrite-section / plan-images / section-image / html / templates / cover / push)
- ⏸ 还没补的: 投流 / 录音改写 / 内容策划 / 违规审查 / 即梦 / hot-topics / topics / works / kb / settings 等 ~50 个
**做法**: 一段一段补 (一次一个 skill 全部 endpoints). 不阻塞功能, 但学员版 poju.ai 部署前要补完.

---

## 🔵 部署相关 (用户路线: MacBook → Mac Mini → poju.ai)

### 7. ~/.wechat-article-config 路径硬编码用户家目录
**位置**: 多处. wechat skill 脚本读它, D-046 写它.
**Mac Mini 迁移**: 路径 `~/.wechat-article-config` 自动跟随用户, 没问题.
**学员版 poju.ai 多用户**: 必须改成跟 user_id 关联存储. 全代码库都还没多用户化, 这是大工程.

### 8. ~/Desktop/skills/ 路径硬编码
**位置**: backend/services/skill_loader.py.
**单机 OK** (Mac Mini 也行). 多用户需要每用户独立 skill 库.

---

## 已修的(归档, 可以从这里删)

- ✅ D-038 公众号 8 步 wfRestore 旧 coverResult 兼容性 / push 422 cover_path / 顶栏 step dot 不能点
- ✅ D-039 段间配图防盗链显示占位图 / push 错误 stderr 空
- ✅ D-041 Step 5 拼 HTML 循环引用崩溃
- ✅ D-042 → D-043 → D-045 push errcode 45166 系列 (D-045 是当前生效策略)
- ✅ D-046 头像合法上传 (用户 Settings 页配 author_avatar_path 后生效)
- ✅ D-048 hero 标题重复 + 副标题鬼断句

---

## 写这个文件的规则

1. 修好一项就删掉 (或挪到 PROGRESS.md 已完成段)
2. 新踩坑就加进来, 写明:症状 / 已确认 / 下一步
3. 不写"代码丑要重构"这种主观项 — 只记录用户能感知的问题
4. 不写"未来可能有"的猜测 — 只记当下踩到的实际坑
