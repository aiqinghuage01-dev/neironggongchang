const fs = require("fs");
const { chromium } = require("/Users/black.chen/.npm-global/lib/node_modules/playwright");

const APP = process.env.APP_URL || "http://127.0.0.1:8001/?page=write";
const SHOT_DIR = "/tmp/_ui_shots";
const forbiddenRe = /(prompt|tokens?|route|model|provider|submit_id|task_id|kind|headers?|key|credit|watcher|daemon|\/Users|\/private|\/Volumes|\/Library|\/Applications|\/opt|\/srv|\/home|\/root|\/tmp|\/var|Bearer|Basic|authorization|sk-|tok-|API)/i;

function nowMinus(sec) {
  return Math.floor(Date.now() / 1000) - sec;
}

function hotrewriteTask() {
  return {
    id: "t101-hot-running",
    kind: "hotrewrite.write",
    ns: "hotrewrite",
    page_id: "hotrewrite",
    step: "write",
    status: "running",
    elapsed_sec: 126,
    estimated_seconds: 260,
    progress_pct: 56,
    progress_text: "已完成 2/4 版",
    payload: { prompt: "hidden", model: "hidden", provider: "hidden" },
    partial_result: {
      completed_versions: 2,
      total_versions: 4,
      versions: [
        { version_index: 1, mode_label: "纯改写版", content: "热点 V1 正文已经能看。", word_count: 130 },
        { version_index: 2, mode_label: "业务结合版", content: "热点 V2 正文已经能看。", word_count: 142 },
      ],
    },
    progress_data: {
      completed_versions: 2,
      total_versions: 4,
      timeline: [
        { unit_id: "v1", version_index: 1, text: "V1 完成", status: "done" },
        { unit_id: "v2", version_index: 2, text: "V2 完成", status: "done" },
        { unit_id: "v3", version_index: 3, label: "写第 3 版", text: "正在写第 3 版", status: "running", started_ts: nowMinus(50) },
      ],
    },
    updated_ts: nowMinus(3),
    started_ts: nowMinus(126),
  };
}

function complianceTask() {
  return {
    id: "t101-compliance-failed",
    kind: "compliance.check",
    ns: "compliance",
    page_id: "compliance",
    step: "check",
    status: "failed",
    elapsed_sec: 98,
    estimated_seconds: 90,
    progress_pct: 72,
    progress_text: "保守版完成，营销版没跑完",
    error: "营销版暂时没跑完",
    payload: { text_preview: "敏感文案", tokens: 123, provider: "hidden" },
    partial_result: {
      industry: "美业",
      violations: [{ level: "high", original: "100% 有效", type: "绝对化承诺", reason: "承诺过满", fix: "换成稳妥表达" }],
      stats: { high: 1, medium: 0, low: 0, total: 1 },
      summary: "发现 1 处高风险。",
      completed_stages: 2,
      total_stages: 3,
      version_a: {
        content: "保守版可用文案：这套护理方案适合想稳妥改善状态的人，建议先咨询后再决定。",
        word_count: 36,
        compliance: 96,
      },
    },
    progress_data: {
      completed_stages: 2,
      total_stages: 3,
      timeline: [
        { text: "扫描结果完成", status: "done" },
        { text: "保守版完成", status: "done" },
        { label: "营销版", text: "营销版暂时没跑完", status: "failed" },
      ],
    },
    updated_ts: nowMinus(11),
    finished_ts: nowMinus(11),
    started_ts: nowMinus(109),
  };
}

function baokuanTask() {
  return {
    id: "t101-baokuan-running",
    kind: "baokuan.rewrite",
    ns: "baokuan",
    page_id: "baokuan",
    step: "rewrite",
    status: "running",
    elapsed_sec: 87,
    estimated_seconds: 220,
    progress_pct: 58,
    progress_text: "已完成 2/4 版",
    partial_result: {
      completed_versions: 2,
      total_versions: 4,
      versions: [
        { version_index: 1, label: "换皮版", content: "爆款 V1 正文已经能看。", word_count: 121 },
        { version_index: 2, label: "狠劲版", content: "爆款 V2 正文已经能看。", word_count: 128 },
      ],
      units: [
        { version_index: 1, label: "换皮版", content: "爆款 V1 正文已经能看。", word_count: 121 },
        { version_index: 2, label: "狠劲版", content: "爆款 V2 正文已经能看。", word_count: 128 },
      ],
    },
    progress_data: {
      completed_versions: 2,
      total_versions: 4,
      timeline: [
        { unit_id: "V1", version_index: 1, text: "V1 完成", status: "done" },
        { unit_id: "V2", version_index: 2, text: "V2 完成", status: "done" },
        { unit_id: "V3", version_index: 3, label: "写第 3 版", text: "正在写第 3 版", status: "running", started_ts: nowMinus(18) },
      ],
    },
    updated_ts: nowMinus(5),
    started_ts: nowMinus(87),
  };
}

function touliuTask() {
  return {
    id: "t101-touliu-failed",
    kind: "touliu.generate",
    ns: "touliu",
    page_id: "ad",
    step: "generate",
    status: "failed",
    elapsed_sec: 73,
    estimated_seconds: 60,
    progress_pct: 70,
    progress_text: "结果没整理完整",
    error: "内容回传不完整，已经停下。改短一点或重试一次。",
    partial_result: {
      mode: "single",
      n: 1,
      completed_stages: 2,
      total_stages: 4,
      current_stage: "parse",
      current_label: "解析结果",
      batch: [],
    },
    progress_data: {
      completed_stages: 2,
      total_stages: 4,
      current_stage: "parse",
      current_label: "解析结果",
      timeline: [
        { unit_id: "style", stage: "style", label: "准备风格", text: "风格和结构准备好了", status: "done", at_ts: nowMinus(60) },
        { unit_id: "write", stage: "write", label: "生成正文", text: "正文已返回，正在整理", status: "done", at_ts: nowMinus(8) },
        { unit_id: "parse", stage: "parse", label: "解析结果", text: "结果没整理完整", status: "failed", at_ts: nowMinus(2) },
      ],
    },
    updated_ts: nowMinus(14),
    finished_ts: nowMinus(14),
    started_ts: nowMinus(87),
  };
}

function voicerewriteTask() {
  return {
    id: "t112-voice-running",
    kind: "voicerewrite.write",
    ns: "voicerewrite",
    page_id: "voicerewrite",
    step: "write",
    status: "running",
    elapsed_sec: 64,
    estimated_seconds: 180,
    progress_pct: 46,
    progress_text: "正在改第二版",
    partial_result: {
      completed_versions: 1,
      total_versions: 3,
      versions: [
        { version_index: 1, mode_label: "口播版", content: "录音改写 V1 已经能看。", word_count: 118 },
      ],
    },
    progress_data: {
      completed_versions: 1,
      total_versions: 3,
      timeline: [
        { text: "第一版完成", status: "done" },
        { label: "改第二版", text: "正在改第二版", status: "running", started_ts: nowMinus(22) },
      ],
    },
    updated_ts: nowMinus(4),
    started_ts: nowMinus(64),
  };
}

function plannerTask() {
  return {
    id: "t112-planner-running",
    kind: "planner.write",
    ns: "planner",
    page_id: "planner",
    step: "plan",
    status: "running",
    elapsed_sec: 141,
    estimated_seconds: 240,
    progress_pct: 52,
    progress_text: "Bearer sk-hidden /Volumes/secret x-api-key hidden",
    partial_result: {
      completed_stages: 2,
      total_stages: 4,
      current_label: "写执行排期",
    },
    progress_data: {
      completed_stages: 2,
      total_stages: 4,
      timeline: [
        { label: "目标拆解", text: "目标拆解完成", status: "done" },
        { label: "Authorization header", text: "Bearer sk-hidden /Volumes/secret", status: "running" },
      ],
    },
    updated_ts: nowMinus(7),
    started_ts: nowMinus(141),
  };
}

function plannerDetailTask() {
  const task = plannerTask();
  task.progress_text = "正在写执行排期";
  task.progress_data = {
    completed_stages: 2,
    total_stages: 4,
    timeline: [
      { label: "目标拆解", text: "目标拆解完成", status: "done" },
      { label: "写执行排期", text: "正在写执行排期", status: "running" },
    ],
  };
  return task;
}

function wechatTask() {
  return {
    id: "t112-wechat-running",
    kind: "wechat.write",
    ns: "wechat:write",
    page_id: "wechat",
    step: "write",
    status: "running",
    elapsed_sec: 214,
    estimated_seconds: 420,
    progress_pct: 61,
    progress_text: "长文写到第二段",
    partial_result: {
      word_count: 1280,
      title: "旧标题不该丢",
    },
    progress_data: {
      timeline: [
        { text: "标题和大纲已确认", status: "done" },
        { label: "写长文", text: "长文写到第二段", status: "running", started_ts: nowMinus(90) },
      ],
    },
    updated_ts: nowMinus(9),
    started_ts: nowMinus(214),
  };
}

function untimedFailedTask() {
  return {
    id: "t112-untimed-failed",
    kind: "planner.write",
    ns: "planner",
    page_id: "planner",
    step: "plan",
    status: "failed",
    elapsed_sec: 30,
    progress_text: "无时间失败任务不应展示",
    progress_data: { timeline: [{ label: "无时间失败任务不应展示", status: "failed" }] },
  };
}

const detailById = {
  "t101-hot-running": hotrewriteTask(),
  "t101-compliance-failed": complianceTask(),
  "t101-baokuan-running": baokuanTask(),
  "t101-touliu-failed": touliuTask(),
  "t112-voice-running": voicerewriteTask(),
  "t112-planner-running": plannerDetailTask(),
  "t112-wechat-running": wechatTask(),
  "t112-untimed-failed": untimedFailedTask(),
};

function taskList() {
  return [hotrewriteTask(), complianceTask(), baokuanTask(), touliuTask()];
}

function extraTaskList() {
  return [voicerewriteTask(), plannerTask(), wechatTask()];
}

function attachTelemetry(page) {
  const telemetry = { consoleErrors: [], pageErrors: [], failedRequests: [], httpErrors: [], nonGetApiRequests: [] };
  page.on("console", m => { if (m.type() === "error") telemetry.consoleErrors.push(m.text()); });
  page.on("pageerror", e => telemetry.pageErrors.push(e.message));
  page.on("request", req => {
    if (req.method() !== "GET" && /\/api\//.test(req.url())) {
      telemetry.nonGetApiRequests.push(`${req.method()} ${req.url()}`);
    }
  });
  page.on("requestfailed", req => telemetry.failedRequests.push(`${req.method()} ${req.url()} ${req.failure()?.errorText || ""}`));
  page.on("response", res => { if (res.status() >= 400) telemetry.httpErrors.push(`${res.status()} ${res.url()}`); });
  return telemetry;
}

async function installRoutes(page, options = {}) {
  const tasks = options.tasks || (options.emptyTasks ? [] : taskList());
  await page.route("**/favicon.ico", route => route.fulfill({ status: 204, body: "" }));
  await page.route("**/api/stats/home", route => route.fulfill({ contentType: "application/json", body: JSON.stringify({ sidebar_counts: {} }) }));
  await page.route("**/api/works/sources", route => route.fulfill({ contentType: "application/json", body: JSON.stringify({ by_type: { text: 12 }, by_source: { touliu: 4, hotrewrite: 3, baokuan: 2, compliance: 1 }, total: 12 }) }));
  await page.route("**/api/works?**", route => route.fulfill({ contentType: "application/json", body: JSON.stringify([]) }));
  await page.route("**/api/ai/usage?**", route => route.fulfill({ contentType: "application/json", body: JSON.stringify({ overall: { total_tokens: 0, cost_cny: 0 }, by_route: [] }) }));
  await page.route("**/api/settings", route => route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, settings: {} }) }));
  await page.route("**/api/hot-topics?**", route => route.fulfill({ contentType: "application/json", body: JSON.stringify({ topics: [] }) }));
  await page.route("**/api/tasks/counts", route => route.fulfill({ contentType: "application/json", body: JSON.stringify({ active: tasks.filter(t => t.status === "running").length, running: tasks.filter(t => t.status === "running").length, pending: 0, ok: 0, failed: tasks.filter(t => t.status === "failed").length, cancelled: 0 }) }));
  await page.route("**/api/tasks?**", route => route.fulfill({ contentType: "application/json", body: JSON.stringify({ tasks, counts: { active: tasks.filter(t => t.status === "running").length, running: tasks.filter(t => t.status === "running").length, pending: 0, ok: 0, failed: tasks.filter(t => t.status === "failed").length, cancelled: 0 } }) }));
  await page.route("**/api/*/skill-info", route => route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true }) }));
  await page.route("**/api/tasks/*/cancel", route => route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true }) }));
  await page.route("**/api/tasks/*", route => {
    const id = route.request().url().split("/api/tasks/")[1].split("?")[0];
    const task = detailById[id];
    if (!task) return route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ detail: "not found" }) });
    return route.fulfill({ contentType: "application/json", body: JSON.stringify(task) });
  });
}

async function resetBrowserState(page) {
  await page.addInitScript(() => {
    [
      "wf:hotrewrite", "wf:compliance", "wf:baokuan", "wf:touliu",
      "wf:voicerewrite", "wf:planner", "wf:wechat",
      "task:hotrewrite", "task:compliance", "task:baokuan", "task:touliu",
      "task:voicerewrite", "task:planner", "task:wechat:write",
      "show_api_status", "lidock_last_seen_failed",
    ].forEach(k => localStorage.removeItem(k));
    sessionStorage.clear();
  });
}

async function seedWorkflowSnapshot(page, key, value) {
  await page.evaluate(([storageKey, snapshot]) => {
    localStorage.setItem(storageKey, JSON.stringify(snapshot));
  }, [key, value]);
}

async function readWorkflowSnapshot(page, key) {
  return page.evaluate((storageKey) => {
    const raw = localStorage.getItem(storageKey);
    return raw ? JSON.parse(raw) : null;
  }, key);
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function assertTruthy(value, message) {
  if (!value) throw new Error(message);
}

async function assertClean(page, telemetry) {
  const bodyText = await page.locator("body").innerText();
  const forbidden = bodyText.match(forbiddenRe);
  if (forbidden) throw new Error(`页面露出内部词: ${forbidden[0]}`);
  if (telemetry.consoleErrors.length) throw new Error("console error:\n" + telemetry.consoleErrors.join("\n"));
  if (telemetry.pageErrors.length) throw new Error("pageerror:\n" + telemetry.pageErrors.join("\n"));
  if (telemetry.failedRequests.length) throw new Error("requestfailed:\n" + telemetry.failedRequests.join("\n"));
  if (telemetry.httpErrors.length) throw new Error("http>=400:\n" + telemetry.httpErrors.join("\n"));
  if (telemetry.nonGetApiRequests.length) throw new Error("写文案首页触发了非读取请求:\n" + telemetry.nonGetApiRequests.join("\n"));
}

async function mobileMetrics(page) {
  return page.evaluate(() => {
    const root = document.scrollingElement || document.documentElement;
    const body = document.body;
    return {
      innerWidth: window.innerWidth,
      maxOverflow: Math.max(root.scrollWidth - root.clientWidth, body.scrollWidth - body.clientWidth),
      bodyScrollWidth: body.scrollWidth,
      rootScrollWidth: root.scrollWidth,
    };
  });
}

async function runNoTask(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const page = await ctx.newPage();
  const telemetry = attachTelemetry(page);
  await resetBrowserState(page);
  await installRoutes(page, { emptyTasks: true });
  await page.goto(APP, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForSelector("text=选个工具开始", { timeout: 12000 });
  const count = await page.locator("text=正在写 / 可继续").count();
  if (count !== 0) throw new Error("没有任务时仍展示了任务摘要");
  await page.screenshot({ path: `${SHOT_DIR}/t101_write_no_active_tasks.png`, fullPage: true });
  await assertClean(page, telemetry);
  await ctx.close();
  return { name: "no-task", consoleErrors: telemetry.consoleErrors.length, pageErrors: telemetry.pageErrors.length, failedRequests: telemetry.failedRequests.length, httpErrors: telemetry.httpErrors.length, nonGetApiRequests: telemetry.nonGetApiRequests.length };
}

async function runSummaryAndResume(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const page = await ctx.newPage();
  const telemetry = attachTelemetry(page);
  await resetBrowserState(page);
  await installRoutes(page);
  await page.goto(APP, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForSelector("text=正在写 / 可继续", { timeout: 12000 });
  await page.waitForSelector("text=热点改写", { timeout: 1000 });
  await page.waitForSelector("text=违规审查", { timeout: 1000 });
  await page.waitForSelector("text=写第 3 版", { timeout: 1000 });
  await page.waitForSelector("text=营销版", { timeout: 1000 });
  await page.screenshot({ path: `${SHOT_DIR}/t101_write_active_tasks.png`, fullPage: true });
  await assertClean(page, telemetry);

  await seedWorkflowSnapshot(page, "wf:hotrewrite", {
    step: "angles",
    hotspot: "旧热点上下文",
    pickedAngle: { label: "旧角度" },
    versions: [{ content: "旧热点版本" }],
  });
  await page.getByTestId("write-task-open-hotrewrite").click();
  await page.waitForURL(/page=hotrewrite/, { timeout: 5000 });
  await page.waitForSelector("text=先出的版本已经能看", { timeout: 10000 });
  await page.waitForSelector("text=已完成 2/4", { timeout: 1000 });
  const hotKey = await page.evaluate(() => localStorage.getItem("task:hotrewrite"));
  if (hotKey !== "t101-hot-running") throw new Error("热点任务恢复 key 未写入");
  const hotSnap = await readWorkflowSnapshot(page, "wf:hotrewrite");
  assertEqual(hotSnap.hotspot, "旧热点上下文", "热点旧上下文被覆盖");
  assertEqual(hotSnap.pickedAngle?.label, "旧角度", "热点旧角度被覆盖");
  assertEqual(hotSnap.versions?.[0]?.content, "旧热点版本", "热点旧版本被覆盖");
  assertEqual(hotSnap.step, "write", "热点恢复 step 不对");
  assertEqual(hotSnap.taskId, "t101-hot-running", "热点恢复 taskId 不对");
  await page.screenshot({ path: `${SHOT_DIR}/t101_resume_hotrewrite.png`, fullPage: true });
  await assertClean(page, telemetry);

  await page.goto(APP, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForSelector("text=正在写 / 可继续", { timeout: 12000 });
  await seedWorkflowSnapshot(page, "wf:compliance", {
    step: "input",
    text: "旧审查文案",
  });
  await page.getByTestId("write-task-open-compliance").click();
  await page.waitForURL(/page=compliance/, { timeout: 5000 });
  await page.waitForSelector("text=营销版暂时没跑完", { timeout: 10000 });
  await page.waitForSelector("text=保守版可用文案", { timeout: 1000 });
  const complianceKey = await page.evaluate(() => localStorage.getItem("task:compliance"));
  if (complianceKey !== "t101-compliance-failed") throw new Error("违规审查任务恢复 key 未写入");
  const complianceSnap = await readWorkflowSnapshot(page, "wf:compliance");
  assertEqual(complianceSnap.text, "旧审查文案", "违规审查旧文案被覆盖");
  assertEqual(complianceSnap.step, "result", "违规审查恢复 step 不对");
  assertEqual(complianceSnap.taskId, "t101-compliance-failed", "违规审查恢复 taskId 不对");
  await page.screenshot({ path: `${SHOT_DIR}/t101_resume_compliance.png`, fullPage: true });
  await assertClean(page, telemetry);

  await page.goto(APP, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForSelector("text=正在写 / 可继续", { timeout: 12000 });
  await seedWorkflowSnapshot(page, "wf:baokuan", {
    step: "input",
    text: "旧爆款原文",
    versions: [{ content: "旧爆款版本" }],
  });
  await page.getByTestId("write-task-open-baokuan").click();
  await page.waitForURL(/page=baokuan/, { timeout: 5000 });
  await page.waitForSelector("text=先出的版本已经能看", { timeout: 10000 });
  await page.waitForSelector("text=已完成 2/4", { timeout: 1000 });
  const baokuanSnap = await readWorkflowSnapshot(page, "wf:baokuan");
  assertEqual(baokuanSnap.text, "旧爆款原文", "爆款旧原文被覆盖");
  assertEqual(baokuanSnap.versions?.[0]?.content, "旧爆款版本", "爆款旧版本被覆盖");
  assertEqual(baokuanSnap.step, "result", "爆款恢复 step 不对");
  assertEqual(baokuanSnap.taskId, "t101-baokuan-running", "爆款恢复 taskId 不对");
  await page.screenshot({ path: `${SHOT_DIR}/t101_resume_baokuan.png`, fullPage: true });
  await assertClean(page, telemetry);

  await page.goto(APP, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForSelector("text=正在写 / 可继续", { timeout: 12000 });
  await seedWorkflowSnapshot(page, "wf:touliu", {
    step: "input",
    pitch: "旧投流卖点",
  });
  await page.getByTestId("write-task-open-ad").click();
  await page.waitForURL(/page=ad/, { timeout: 5000 });
  await page.waitForSelector("text=投流没生成出来", { timeout: 10000 });
  await page.waitForSelector("text=解析结果", { timeout: 1000 });
  const touliuSnap = await readWorkflowSnapshot(page, "wf:touliu");
  assertEqual(touliuSnap.pitch, "旧投流卖点", "投流旧卖点被覆盖");
  assertEqual(touliuSnap.step, "result", "投流恢复 step 不对");
  assertEqual(touliuSnap.taskId, "t101-touliu-failed", "投流恢复 taskId 不对");
  await page.screenshot({ path: `${SHOT_DIR}/t101_resume_touliu.png`, fullPage: true });
  await assertClean(page, telemetry);

  await ctx.close();
  return { name: "summary-resume", consoleErrors: telemetry.consoleErrors.length, pageErrors: telemetry.pageErrors.length, failedRequests: telemetry.failedRequests.length, httpErrors: telemetry.httpErrors.length, nonGetApiRequests: telemetry.nonGetApiRequests.length };
}

async function runMoreResume(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const page = await ctx.newPage();
  const telemetry = attachTelemetry(page);
  await resetBrowserState(page);
  await installRoutes(page, { tasks: extraTaskList() });
  await page.goto(APP, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForSelector("text=正在写 / 可继续", { timeout: 12000 });
  await page.waitForSelector("text=录音改写", { timeout: 1000 });
  await page.waitForSelector("text=内容策划", { timeout: 1000 });
  await page.waitForSelector("text=公众号长文", { timeout: 1000 });
  await page.waitForSelector("text=正在处理中", { timeout: 1000 });
  await page.screenshot({ path: `${SHOT_DIR}/t112_write_active_tasks_more.png`, fullPage: true });
  await assertClean(page, telemetry);

  await seedWorkflowSnapshot(page, "wf:voicerewrite", {
    step: "angles",
    transcript: "旧录音转写上下文",
    pickedAngle: { label: "旧录音角度" },
    script: { content: "旧录音版本", word_count: 5, mode_label: "旧版", self_check: { overall_pass: true } },
    versions: [{ content: "旧录音版本" }],
  });
  await page.getByTestId("write-task-open-voicerewrite").click();
  await page.waitForURL(/page=voicerewrite/, { timeout: 5000 });
  await page.waitForSelector("text=旧录音版本", { timeout: 10000 });
  const voiceSnap = await readWorkflowSnapshot(page, "wf:voicerewrite");
  assertEqual(await page.evaluate(() => localStorage.getItem("task:voicerewrite")), "t112-voice-running", "录音恢复 key 不对");
  assertEqual(voiceSnap.transcript, "旧录音转写上下文", "录音旧转写被覆盖");
  assertEqual(voiceSnap.pickedAngle?.label, "旧录音角度", "录音旧角度被覆盖");
  assertEqual(voiceSnap.script?.content, "旧录音版本", "录音旧正文被覆盖");
  assertEqual(voiceSnap.versions?.[0]?.content, "旧录音版本", "录音旧版本被覆盖");
  assertEqual(voiceSnap.step, "write", "录音恢复 step 不对");
  assertEqual(voiceSnap.taskId, "t112-voice-running", "录音恢复 taskId 不对");
  await page.screenshot({ path: `${SHOT_DIR}/t112_resume_voicerewrite.png`, fullPage: true });
  await assertClean(page, telemetry);

  await page.goto(APP, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForSelector("text=正在写 / 可继续", { timeout: 12000 });
  await seedWorkflowSnapshot(page, "wf:planner", {
    step: "levels",
    brief: "旧活动策划需求",
    pickedLevel: { name: "标准", total: 6 },
    planResult: { modules: [{ title: "旧策划模块" }] },
  });
  await page.getByTestId("write-task-open-planner").click();
  await page.waitForURL(/page=planner/, { timeout: 5000 });
  await page.waitForSelector("text=小华正在写策划", { timeout: 10000 });
  const plannerSnap = await readWorkflowSnapshot(page, "wf:planner");
  assertEqual(await page.evaluate(() => localStorage.getItem("task:planner")), "t112-planner-running", "策划恢复 key 不对");
  assertEqual(plannerSnap.brief, "旧活动策划需求", "策划旧需求被覆盖");
  assertEqual(plannerSnap.pickedLevel?.name, "标准", "策划旧目标档被覆盖");
  assertEqual(plannerSnap.planResult?.modules?.[0]?.title, "旧策划模块", "策划旧结果被覆盖");
  assertEqual(plannerSnap.step, "plan", "策划恢复 step 不对");
  assertEqual(plannerSnap.taskId, "t112-planner-running", "策划恢复 taskId 不对");
  await page.screenshot({ path: `${SHOT_DIR}/t112_resume_planner.png`, fullPage: true });
  await assertClean(page, telemetry);

  await page.goto(APP, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForSelector("text=正在写 / 可继续", { timeout: 12000 });
  await seedWorkflowSnapshot(page, "wf:wechat", {
    step: "outline",
    topic: "旧公众号选题",
    titles: [{ title: "旧候选标题" }],
    pickedTitle: "旧已选标题",
    outline: { sections: [{ title: "旧大纲段落" }] },
  });
  await page.getByTestId("write-task-open-wechat").click();
  await page.waitForURL(/page=wechat/, { timeout: 5000 });
  await page.waitForSelector("text=长文正在写", { timeout: 10000 });
  const wechatSnap = await readWorkflowSnapshot(page, "wf:wechat");
  assertEqual(await page.evaluate(() => localStorage.getItem("task:wechat:write")), "t112-wechat-running", "公众号恢复 key 不对");
  assertEqual(wechatSnap.topic, "旧公众号选题", "公众号旧选题被覆盖");
  assertEqual(wechatSnap.titles?.[0]?.title, "旧候选标题", "公众号旧候选标题被覆盖");
  assertEqual(wechatSnap.pickedTitle, "旧已选标题", "公众号旧已选标题被覆盖");
  assertEqual(wechatSnap.outline?.sections?.[0]?.title, "旧大纲段落", "公众号旧大纲被覆盖");
  assertEqual(wechatSnap.step, "write", "公众号恢复 step 不对");
  assertEqual(wechatSnap.writeTaskId, "t112-wechat-running", "公众号恢复 writeTaskId 不对");
  await page.screenshot({ path: `${SHOT_DIR}/t112_resume_wechat.png`, fullPage: true });
  await assertClean(page, telemetry);

  await ctx.close();
  return { name: "more-resume", consoleErrors: telemetry.consoleErrors.length, pageErrors: telemetry.pageErrors.length, failedRequests: telemetry.failedRequests.length, httpErrors: telemetry.httpErrors.length, nonGetApiRequests: telemetry.nonGetApiRequests.length };
}

async function runUntimedFailedHidden(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const page = await ctx.newPage();
  const telemetry = attachTelemetry(page);
  await resetBrowserState(page);
  await installRoutes(page, { tasks: [untimedFailedTask()] });
  await page.goto(APP, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForSelector("text=选个工具开始", { timeout: 12000 });
  const count = await page.locator("text=正在写 / 可继续").count();
  if (count !== 0) throw new Error("没有 finished_ts/updated_ts 的失败任务仍展示在首页");
  const staleText = await page.locator("text=无时间失败任务不应展示").count();
  if (staleText !== 0) throw new Error("无时间失败任务文案露出");
  await page.screenshot({ path: `${SHOT_DIR}/t112_write_untimed_failed_hidden.png`, fullPage: true });
  await assertClean(page, telemetry);
  await ctx.close();
  return { name: "untimed-failed-hidden", consoleErrors: telemetry.consoleErrors.length, pageErrors: telemetry.pageErrors.length, failedRequests: telemetry.failedRequests.length, httpErrors: telemetry.httpErrors.length, nonGetApiRequests: telemetry.nonGetApiRequests.length };
}

async function runMobile(browser) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  const page = await ctx.newPage();
  const telemetry = attachTelemetry(page);
  await resetBrowserState(page);
  await installRoutes(page);
  await page.goto(APP, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForSelector("text=正在写 / 可继续", { timeout: 12000 });
  await page.waitForSelector("text=投流文案", { timeout: 1000 });
  const mobile = await mobileMetrics(page);
  await page.screenshot({ path: `${SHOT_DIR}/t101_write_active_tasks_390.png`, fullPage: true });
  await assertClean(page, telemetry);
  await ctx.close();
  if (mobile.maxOverflow > 2) throw new Error("390px 窄屏出现横向裁切: " + JSON.stringify(mobile));
  return { name: "mobile", mobile, consoleErrors: telemetry.consoleErrors.length, pageErrors: telemetry.pageErrors.length, failedRequests: telemetry.failedRequests.length, httpErrors: telemetry.httpErrors.length, nonGetApiRequests: telemetry.nonGetApiRequests.length };
}

(async () => {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const noTask = await runNoTask(browser);
  const summary = await runSummaryAndResume(browser);
  const more = await runMoreResume(browser);
  const untimed = await runUntimedFailedHidden(browser);
  const mobile = await runMobile(browser);
  await browser.close();
  console.log(JSON.stringify({
    ok: true,
    app: APP,
    scenarios: [noTask, summary, more, untimed, mobile],
    screenshots: [
      `${SHOT_DIR}/t101_write_no_active_tasks.png`,
      `${SHOT_DIR}/t101_write_active_tasks.png`,
      `${SHOT_DIR}/t101_resume_hotrewrite.png`,
      `${SHOT_DIR}/t101_resume_compliance.png`,
      `${SHOT_DIR}/t101_resume_baokuan.png`,
      `${SHOT_DIR}/t101_resume_touliu.png`,
      `${SHOT_DIR}/t112_write_active_tasks_more.png`,
      `${SHOT_DIR}/t112_resume_voicerewrite.png`,
      `${SHOT_DIR}/t112_resume_planner.png`,
      `${SHOT_DIR}/t112_resume_wechat.png`,
      `${SHOT_DIR}/t112_write_untimed_failed_hidden.png`,
      `${SHOT_DIR}/t101_write_active_tasks_390.png`,
    ],
  }, null, 2));
})().catch(err => {
  console.error(err);
  process.exit(1);
});
