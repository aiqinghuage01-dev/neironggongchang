const fs = require("fs");
const { chromium } = require("/Users/black.chen/.npm-global/lib/node_modules/playwright");

const APP = process.env.APP_URL || "http://127.0.0.1:8001/?page=write";
const SHOT_DIR = "/tmp/_ui_shots";
const forbiddenRe = /(prompt|tokens|route|model|provider|submit_id|\/Users|\/private|API)/i;

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

const detailById = {
  "t101-hot-running": hotrewriteTask(),
  "t101-compliance-failed": complianceTask(),
  "t101-baokuan-running": baokuanTask(),
  "t101-touliu-failed": touliuTask(),
};

function taskList() {
  return [hotrewriteTask(), complianceTask(), baokuanTask(), touliuTask()];
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
  const tasks = options.emptyTasks ? [] : taskList();
  await page.route("**/favicon.ico", route => route.fulfill({ status: 204, body: "" }));
  await page.route("**/api/stats/home", route => route.fulfill({ contentType: "application/json", body: JSON.stringify({ sidebar_counts: {} }) }));
  await page.route("**/api/works/sources", route => route.fulfill({ contentType: "application/json", body: JSON.stringify({ by_type: { text: 12 }, by_source: { touliu: 4, hotrewrite: 3, baokuan: 2, compliance: 1 }, total: 12 }) }));
  await page.route("**/api/works?**", route => route.fulfill({ contentType: "application/json", body: JSON.stringify([]) }));
  await page.route("**/api/ai/usage?**", route => route.fulfill({ contentType: "application/json", body: JSON.stringify({ overall: { total_tokens: 0, cost_cny: 0 }, by_route: [] }) }));
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
      "task:hotrewrite", "task:compliance", "task:baokuan", "task:touliu",
      "show_api_status", "lidock_last_seen_failed",
    ].forEach(k => localStorage.removeItem(k));
    sessionStorage.clear();
  });
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

  await page.getByTestId("write-task-open-hotrewrite").click();
  await page.waitForURL(/page=hotrewrite/, { timeout: 5000 });
  await page.waitForSelector("text=先出的版本已经能看", { timeout: 10000 });
  await page.waitForSelector("text=已完成 2/4", { timeout: 1000 });
  const hotKey = await page.evaluate(() => localStorage.getItem("task:hotrewrite"));
  if (hotKey !== "t101-hot-running") throw new Error("热点任务恢复 key 未写入");
  await page.screenshot({ path: `${SHOT_DIR}/t101_resume_hotrewrite.png`, fullPage: true });
  await assertClean(page, telemetry);

  await page.goto(APP, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForSelector("text=正在写 / 可继续", { timeout: 12000 });
  await page.getByTestId("write-task-open-compliance").click();
  await page.waitForURL(/page=compliance/, { timeout: 5000 });
  await page.waitForSelector("text=营销版暂时没跑完", { timeout: 10000 });
  await page.waitForSelector("text=保守版可用文案", { timeout: 1000 });
  const complianceKey = await page.evaluate(() => localStorage.getItem("task:compliance"));
  if (complianceKey !== "t101-compliance-failed") throw new Error("违规审查任务恢复 key 未写入");
  await page.screenshot({ path: `${SHOT_DIR}/t101_resume_compliance.png`, fullPage: true });
  await assertClean(page, telemetry);

  await page.goto(APP, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForSelector("text=正在写 / 可继续", { timeout: 12000 });
  await page.getByTestId("write-task-open-baokuan").click();
  await page.waitForURL(/page=baokuan/, { timeout: 5000 });
  await page.waitForSelector("text=先出的版本已经能看", { timeout: 10000 });
  await page.waitForSelector("text=已完成 2/4", { timeout: 1000 });
  await page.screenshot({ path: `${SHOT_DIR}/t101_resume_baokuan.png`, fullPage: true });
  await assertClean(page, telemetry);

  await page.goto(APP, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForSelector("text=正在写 / 可继续", { timeout: 12000 });
  await page.getByTestId("write-task-open-ad").click();
  await page.waitForURL(/page=ad/, { timeout: 5000 });
  await page.waitForSelector("text=投流没生成出来", { timeout: 10000 });
  await page.waitForSelector("text=解析结果", { timeout: 1000 });
  await page.screenshot({ path: `${SHOT_DIR}/t101_resume_touliu.png`, fullPage: true });
  await assertClean(page, telemetry);

  await ctx.close();
  return { name: "summary-resume", consoleErrors: telemetry.consoleErrors.length, pageErrors: telemetry.pageErrors.length, failedRequests: telemetry.failedRequests.length, httpErrors: telemetry.httpErrors.length, nonGetApiRequests: telemetry.nonGetApiRequests.length };
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
  const mobile = await runMobile(browser);
  await browser.close();
  console.log(JSON.stringify({
    ok: true,
    app: APP,
    scenarios: [noTask, summary, mobile],
    screenshots: [
      `${SHOT_DIR}/t101_write_no_active_tasks.png`,
      `${SHOT_DIR}/t101_write_active_tasks.png`,
      `${SHOT_DIR}/t101_resume_hotrewrite.png`,
      `${SHOT_DIR}/t101_resume_compliance.png`,
      `${SHOT_DIR}/t101_resume_baokuan.png`,
      `${SHOT_DIR}/t101_resume_touliu.png`,
      `${SHOT_DIR}/t101_write_active_tasks_390.png`,
    ],
  }, null, 2));
})().catch(err => {
  console.error(err);
  process.exit(1);
});
