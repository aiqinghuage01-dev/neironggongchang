const fs = require("fs");
const { chromium } = require("/Users/black.chen/.npm-global/lib/node_modules/playwright");

const APP = process.env.APP_URL || "http://127.0.0.1:8001/?page=compliance";
const TASK_ID = "t095-compliance-progressive";
const SHOT_DIR = "/tmp/_ui_shots";
const forbiddenRe = /(prompt|tokens|route|model|provider|submit_id|\/Users|API)/i;

const scan = {
  industry: "美业",
  scan_scope: "通用+敏感行业(美业)",
  violations: [
    { level: "high", original: "100% 有效", type: "绝对化承诺", reason: "承诺过满", fix: "更稳妥" },
  ],
  stats: { high: 1, medium: 0, low: 0, total: 1 },
  summary: "发现 1 处高风险，先用保守版更稳。",
  completed_stages: 1,
  total_stages: 3,
};

const versionA = {
  content: "保守版可用文案：这套护理方案适合想稳妥改善状态的人，建议先咨询后再决定。",
  word_count: 36,
  compliance: 96,
  description: "稳妥合规 · 适合敏感行业",
};

const versionB = {
  content: "营销版可用文案：想让状态看起来更好，先从一次稳妥护理开始，今天预约还有体验名额。",
  word_count: 39,
  compliance: 88,
  description: "合规 + 保留吸引力",
  kept_marketing: ["体验名额", "状态改善"],
};

function taskResponse(state, taskId = TASK_ID) {
  const common = {
    id: taskId,
    kind: "compliance.check",
    ns: "compliance",
    page_id: "compliance",
    step: "check",
    estimated_seconds: 90,
    elapsed_sec: state === "scan" ? 24 : state === "conservative" ? 58 : state === "slow" ? 118 : state === "failed" ? 126 : 132,
  };
  if (state === "scan") {
    return {
      ...common,
      status: "running",
      progress_pct: 45,
      progress_text: "扫描完成: 1 处风险, 正在写保守版...",
      partial_result: scan,
      progress_data: { completed_stages: 1, total_stages: 3, timeline: [{ text: "扫描结果完成" }] },
    };
  }
  if (state === "conservative" || state === "slow") {
    return {
      ...common,
      status: "running",
      progress_pct: state === "slow" ? 80 : 72,
      progress_text: "保守版已完成, 营销版继续写...",
      partial_result: { ...scan, version_a: versionA, completed_stages: 2 },
      progress_data: { completed_stages: 2, total_stages: 3, timeline: [{ text: "扫描结果完成" }, { text: "保守版完成" }] },
    };
  }
  if (state === "failed") {
    return {
      ...common,
      status: "failed",
      progress_pct: 72,
      progress_text: "保守版已完成, 营销版继续写...",
      error: "营销版暂时没跑完",
      partial_result: { ...scan, version_a: versionA, completed_stages: 2 },
      progress_data: { completed_stages: 2, total_stages: 3, timeline: [{ text: "扫描结果完成" }, { text: "保守版完成" }] },
    };
  }
  return {
    ...common,
    status: "ok",
    progress_pct: 100,
    progress_text: "完成",
    partial_result: null,
    progress_data: null,
    result: { ...scan, version_a: versionA, version_b: versionB, completed_stages: 3 },
  };
}

async function installRoutes(page, timeline, options = {}) {
  const taskId = options.taskId || TASK_ID;
  const states = options.states || ["scan", "conservative", "slow", "ok"];
  await page.route("**/favicon.ico", route => route.fulfill({ status: 204, body: "" }));
  await page.route("**/api/stats/home", route => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ sidebar_counts: {} }),
  }));
  await page.route("**/api/tasks/counts", route => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ active: 0, running: 0, pending: 0, ok: 0, failed: 0, cancelled: 0 }),
  }));
  await page.route("**/api/tasks?**", route => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ tasks: [], counts: { active: 0, running: 0, pending: 0, ok: 0, failed: 0, cancelled: 0 } }),
  }));
  await page.route("**/api/compliance/skill-info", route => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ slug: "违禁违规审查-学员版", ok: true }),
  }));
  await page.route("**/api/compliance/check", async route => {
    timeline.submitBody = route.request().postDataJSON();
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ task_id: taskId, status: "running", estimated_seconds: 90, page_id: "compliance" }),
    });
  });
  await page.route(`**/api/tasks/${taskId}/cancel`, async route => {
    timeline.cancelPosts += 1;
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true }) });
  });
  await page.route(`**/api/tasks/${taskId}`, async route => {
    timeline.taskPolls += 1;
    const state = states[Math.min(timeline.taskPolls - 1, states.length - 1)] || states[states.length - 1];
    timeline.states.push(state);
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(taskResponse(state, taskId)) });
  });
}

function attachTelemetry(page) {
  const telemetry = { consoleErrors: [], pageErrors: [], failedRequests: [], httpErrors: [] };
  page.on("console", m => { if (m.type() === "error") telemetry.consoleErrors.push(m.text()); });
  page.on("pageerror", e => telemetry.pageErrors.push(e.message));
  page.on("requestfailed", req => telemetry.failedRequests.push(`${req.method()} ${req.url()} ${req.failure()?.errorText || ""}`));
  page.on("response", res => { if (res.status() >= 400) telemetry.httpErrors.push(`${res.status()} ${res.url()}`); });
  return telemetry;
}

async function assertClean(page, telemetry) {
  const bodyText = await page.locator("body").innerText();
  const forbidden = bodyText.match(forbiddenRe);
  if (forbidden) throw new Error(`页面露出内部词: ${forbidden[0]}`);
  if (telemetry.consoleErrors.length) throw new Error("console error:\n" + telemetry.consoleErrors.join("\n"));
  if (telemetry.pageErrors.length) throw new Error("pageerror:\n" + telemetry.pageErrors.join("\n"));
  if (telemetry.failedRequests.length) throw new Error("requestfailed:\n" + telemetry.failedRequests.join("\n"));
  if (telemetry.httpErrors.length) throw new Error("http>=400:\n" + telemetry.httpErrors.join("\n"));
}

async function resetBrowserState(page) {
  await page.addInitScript(() => {
    localStorage.removeItem("wf:compliance");
    localStorage.removeItem("task:compliance");
    localStorage.removeItem("show_api_status");
    sessionStorage.clear();
  });
}

async function submitCompliance(page) {
  await page.goto(APP, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForSelector("text=什么文案要查违规?", { timeout: 12000 });
  await page.locator("textarea").first().fill("这套护理 100% 有效，今天做完立刻年轻十岁，名额只剩最后 3 个。");
  await page.getByText("美容/美业").click();
  await page.getByRole("button", { name: /开始审查/ }).click();
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

async function runScenario(browser, name, options, assertion) {
  const ctx = await browser.newContext({ viewport: options.viewport || { width: 1440, height: 980 } });
  const page = await ctx.newPage();
  const telemetry = attachTelemetry(page);
  const timeline = { taskPolls: 0, states: [], submitBody: null, cancelPosts: 0 };
  await resetBrowserState(page);
  await installRoutes(page, timeline, options);
  await submitCompliance(page);
  await assertion(page, timeline, telemetry);
  await assertClean(page, telemetry);
  await ctx.close();
  return {
    name,
    states: timeline.states,
    consoleErrors: telemetry.consoleErrors.length,
    pageErrors: telemetry.pageErrors.length,
    failedRequests: telemetry.failedRequests.length,
    httpErrors: telemetry.httpErrors.length,
  };
}

(async () => {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true });

  const main = await runScenario(
    browser,
    "running-ok",
    { states: ["scan", "conservative", "slow", "ok"] },
    async (page, timeline) => {
      await page.waitForSelector("text=扫描完成 · 发现 1 处风险", { timeout: 10000 });
      await page.waitForSelector("text=保守版正在写", { timeout: 1000 });
      await page.screenshot({ path: `${SHOT_DIR}/t095_compliance_scan_visible.png`, fullPage: true });

      await page.waitForSelector("text=保守版可用文案", { timeout: 7000 });
      await page.getByRole("button", { name: /复制 A/ }).click();
      await page.waitForSelector("text=营销版继续写", { timeout: 1000 });
      await page.screenshot({ path: `${SHOT_DIR}/t095_compliance_conservative_visible.png`, fullPage: true });

      await page.waitForSelector("text=比预期慢，继续等结果", { timeout: 7000 });
      await page.waitForSelector("text=已等 1 分 58 秒", { timeout: 1000 });
      await page.screenshot({ path: `${SHOT_DIR}/t095_compliance_marketing_slow.png`, fullPage: true });

      await page.waitForSelector("text=营销版可用文案", { timeout: 7000 });
      if (!timeline.submitBody?.text?.includes("100% 有效")) throw new Error("未观察到真实填入文案后提交");
      await page.screenshot({ path: `${SHOT_DIR}/t095_compliance_done.png`, fullPage: true });
    }
  );

  const failed = await runScenario(
    browser,
    "failed-partial",
    { taskId: "t095-compliance-failed", states: ["scan", "conservative", "failed"] },
    async (page, timeline) => {
      await page.waitForSelector("text=营销版暂时没跑完，扫描和保守版已保留", { timeout: 10000 });
      await page.waitForSelector("text=保守版可用文案", { timeout: 1000 });
      await page.waitForSelector("text=营销版暂时没跑完", { timeout: 1000 });
      await page.screenshot({ path: `${SHOT_DIR}/t095_compliance_failed_preserve.png`, fullPage: true });
      if (!timeline.states.includes("failed")) throw new Error("failed 状态未出现");
    }
  );

  const mobileCtx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  const mobilePage = await mobileCtx.newPage();
  const mobileTelemetry = attachTelemetry(mobilePage);
  const mobileTimeline = { taskPolls: 0, states: [], submitBody: null, cancelPosts: 0 };
  await resetBrowserState(mobilePage);
  await installRoutes(mobilePage, mobileTimeline, { taskId: "t095-compliance-mobile", states: ["scan", "conservative", "slow"] });
  await submitCompliance(mobilePage);
  await mobilePage.waitForSelector("text=保守版可用文案", { timeout: 10000 });
  await mobilePage.waitForSelector("text=营销版继续写", { timeout: 1000 });
  const mobile = await mobileMetrics(mobilePage);
  await mobilePage.screenshot({ path: `${SHOT_DIR}/t095_compliance_mobile_390.png`, fullPage: true });
  await assertClean(mobilePage, mobileTelemetry);
  await mobileCtx.close();
  if (mobile.maxOverflow > 2) throw new Error("390px 窄屏出现横向裁切: " + JSON.stringify(mobile));

  await browser.close();
  console.log(JSON.stringify({
    ok: true,
    app: APP,
    scenarios: [main, failed],
    mobile,
    screenshots: [
      `${SHOT_DIR}/t095_compliance_scan_visible.png`,
      `${SHOT_DIR}/t095_compliance_conservative_visible.png`,
      `${SHOT_DIR}/t095_compliance_marketing_slow.png`,
      `${SHOT_DIR}/t095_compliance_done.png`,
      `${SHOT_DIR}/t095_compliance_failed_preserve.png`,
      `${SHOT_DIR}/t095_compliance_mobile_390.png`,
    ],
  }, null, 2));
})().catch(err => {
  console.error(err);
  process.exit(1);
});
