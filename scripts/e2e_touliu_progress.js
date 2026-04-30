const fs = require("fs");
const { chromium } = require("/Users/black.chen/.npm-global/lib/node_modules/playwright");

const APP = process.env.APP_URL || "http://127.0.0.1:8001/?page=ad";
const SHOT_DIR = "/tmp/_ui_shots";
const forbiddenRe = /(prompt|tokens|API|route|model|provider|JSON|submit_id|\/Users)/i;

function taskResponse(state, taskId) {
  const base = {
    id: taskId,
    kind: "touliu.generate",
    ns: "touliu",
    page_id: "ad",
    step: "generate",
    estimated_seconds: 60,
    progress_pct: 52,
  };
  const timeline = {
    slow: [
      { unit_id: "style", stage: "style", label: "准备风格", text: "风格和结构准备好了", status: "done", at_ts: nowMinus(58) },
      { unit_id: "write", stage: "write", label: "生成正文", text: "正在生成正文", status: "running", started_ts: nowMinus(58), at_ts: nowMinus(58) },
    ],
    parse_failed: [
      { unit_id: "style", stage: "style", label: "准备风格", text: "风格和结构准备好了", status: "done", at_ts: nowMinus(61) },
      { unit_id: "write", stage: "write", label: "生成正文", text: "正文已返回，正在整理", status: "done", at_ts: nowMinus(9) },
      { unit_id: "parse", stage: "parse", label: "解析结果", text: "结果没整理完整", status: "failed", at_ts: nowMinus(3) },
    ],
    timeout_failed: [
      { unit_id: "style", stage: "style", label: "准备风格", text: "风格和结构准备好了", status: "done", at_ts: nowMinus(75) },
      { unit_id: "write", stage: "write", label: "生成正文", text: "正文等太久，已停止", status: "failed", at_ts: nowMinus(1) },
    ],
    ok: [
      { unit_id: "style", stage: "style", label: "准备风格", text: "风格和结构准备好了", status: "done", at_ts: nowMinus(38) },
      { unit_id: "write", stage: "write", label: "生成正文", text: "正文已返回，正在整理", status: "done", at_ts: nowMinus(10) },
      { unit_id: "parse", stage: "parse", label: "解析结果", text: "结果已整理", status: "done", at_ts: nowMinus(4) },
      { unit_id: "check", stage: "check", label: "自检/整理", text: "投流文案已整理好", status: "done", at_ts: nowMinus(1) },
    ],
  };
  if (state === "slow") {
    return {
      ...base,
      status: "running",
      elapsed_sec: 58,
      progress_text: "正在生成正文",
      progress_data: {
        completed_stages: 1,
        total_stages: 4,
        current_stage: "write",
        current_label: "生成正文",
        slow_hint_after_sec: 40,
        timeline: timeline.slow,
      },
      partial_result: {
        mode: "single",
        n: 1,
        completed_stages: 1,
        total_stages: 4,
        current_stage: "write",
        current_label: "生成正文",
        batch: [],
      },
    };
  }
  if (state === "parse_failed") {
    return {
      ...base,
      status: "failed",
      elapsed_sec: 64,
      progress_pct: 72,
      progress_text: "结果没整理完整",
      error: "内容回传不完整，已经停下。改短一点或重试一次。",
      progress_data: {
        completed_stages: 2,
        total_stages: 4,
        current_stage: "parse",
        current_label: "解析结果",
        slow_hint_after_sec: 40,
        timeline: timeline.parse_failed,
      },
      partial_result: {
        mode: "single",
        n: 1,
        completed_stages: 2,
        total_stages: 4,
        current_stage: "parse",
        current_label: "解析结果",
        friendly_message: "内容回传不完整，已经停下。改短一点或重试一次。",
        batch: [],
      },
    };
  }
  if (state === "timeout_failed") {
    return {
      ...base,
      status: "failed",
      elapsed_sec: 76,
      progress_pct: 40,
      progress_text: "正文等太久，已停止",
      error: "外部服务这次等太久，已经停下。稍后重试一次。",
      progress_data: {
        completed_stages: 1,
        total_stages: 4,
        current_stage: "write",
        current_label: "生成正文",
        slow_hint_after_sec: 40,
        timeline: timeline.timeout_failed,
      },
      partial_result: {
        mode: "single",
        n: 1,
        completed_stages: 1,
        total_stages: 4,
        current_stage: "write",
        current_label: "生成正文",
        friendly_message: "外部服务这次等太久，已经停下。稍后重试一次。",
        batch: [],
      },
    };
  }
  return {
    ...base,
    status: "ok",
    elapsed_sec: 39,
    progress_pct: 100,
    progress_text: "完成",
    partial_result: null,
    progress_data: null,
    result: {
      style_summary: { opening_mode: "先打经营痛点", cta_mode: "收回直播间动作" },
      batch: [{
        no: 1,
        structure: "痛点型",
        title: "老板别再硬投",
        first_line: "你投不动不是素材少。",
        body: "真正卡住的是成交顺序没讲清楚。先把老板每天遇到的获客问题讲透，再把小华能替他省掉的拍摄和剪辑时间讲清楚。",
        cta: "点头像进直播间",
        audience: "餐饮",
        channel: "直播间",
        director_check: { "人味": 4, "场景完成度": 4, "业务过渡自然度": 4, "AI机制密度": 4, "说服层数": 4, "收口自然度": 4, total: 24 },
      }],
      alloc: { "痛点型": 1 },
      lint: { ok: true, passed: true },
    },
  };
}

function nowMinus(sec) {
  return Math.floor(Date.now() / 1000) - sec;
}

async function installRoutes(page, timeline, options) {
  const taskId = options.taskId;
  const states = options.states;
  await page.route("**/favicon.ico", route => route.fulfill({ status: 204, body: "" }));
  await page.route("**/api/stats/home", route => route.fulfill({ contentType: "application/json", body: JSON.stringify({ sidebar_counts: {} }) }));
  await page.route("**/api/tasks/counts", route => route.fulfill({ contentType: "application/json", body: JSON.stringify({ active: 0, running: 0, pending: 0, ok: 0, failed: 0, cancelled: 0 }) }));
  await page.route("**/api/tasks?**", route => route.fulfill({ contentType: "application/json", body: JSON.stringify({ tasks: [], counts: { active: 0, running: 0, pending: 0, ok: 0, failed: 0, cancelled: 0 } }) }));
  await page.route("**/api/touliu/skill-info", route => route.fulfill({ contentType: "application/json", body: JSON.stringify({ slug: "touliu-agent", ok: true }) }));
  await page.route("**/api/touliu/generate", async route => {
    timeline.submitBody = route.request().postDataJSON();
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ task_id: taskId, status: "running", estimated_seconds: 60, page_id: "ad" }) });
  });
  await page.route(`**/api/tasks/${taskId}/cancel`, route => route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true }) }));
  await page.route(`**/api/tasks/${taskId}`, async route => {
    timeline.polls += 1;
    const state = states[Math.min(timeline.polls - 1, states.length - 1)];
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

async function resetBrowserState(page) {
  await page.addInitScript(() => {
    localStorage.removeItem("wf:touliu");
    localStorage.removeItem("task:touliu");
    localStorage.removeItem("from_make_anchor");
    localStorage.removeItem("show_api_status");
    sessionStorage.removeItem("retry_payload_ad");
    sessionStorage.removeItem("retry_payload_touliu");
  });
}

async function submitTouliu(page) {
  await page.goto(APP, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForSelector("text=这批投流要推啥?", { timeout: 12000 });
  await page.locator("textarea").fill("帮实体店老板用小华做本地获客，三天跑通一条短视频投流，不用拍摄不用剪辑");
  await page.getByText("餐饮").click();
  await page.getByRole("button", { name: /生成 1 条/ }).click();
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
  const ctx = await browser.newContext({ viewport: options.viewport || { width: 1440, height: 960 } });
  const page = await ctx.newPage();
  const telemetry = attachTelemetry(page);
  const timeline = { polls: 0, states: [], submitBody: null };
  await resetBrowserState(page);
  await installRoutes(page, timeline, options);
  await submitTouliu(page);
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

  const slowOk = await runScenario(
    browser,
    "slow-ok",
    { taskId: "t099-touliu-slow", states: ["slow", "ok"] },
    async (page, timeline) => {
      await page.waitForSelector("text=准备风格", { timeout: 10000 });
      await page.waitForSelector("text=生成正文", { timeout: 1000 });
      await page.waitForSelector("text=比预期慢，正在等正文回传", { timeout: 1000 });
      await page.waitForSelector("text=已等 58 秒", { timeout: 1000 });
      await page.screenshot({ path: `${SHOT_DIR}/t099_touliu_slow_wait.png`, fullPage: true });

      await page.waitForSelector("text=批量生成完成 · 1 条", { timeout: 7000 });
      await page.waitForSelector("text=老板别再硬投", { timeout: 1000 });
      if (timeline.submitBody?.n !== 1) throw new Error("投流提交不是 n=1: " + JSON.stringify(timeline.submitBody));
      await page.screenshot({ path: `${SHOT_DIR}/t099_touliu_ok.png`, fullPage: true });
    }
  );

  const parseFailed = await runScenario(
    browser,
    "parse-failed",
    { taskId: "t099-touliu-parse-failed", states: ["parse_failed"] },
    async (page) => {
      await page.waitForSelector("text=投流没生成出来", { timeout: 10000 });
      await page.waitForSelector("text=内容回传不完整，已经停下", { timeout: 1000 });
      await page.waitForSelector("text=解析结果", { timeout: 1000 });
      await page.waitForSelector("text=没整理完整", { timeout: 1000 });
      await page.screenshot({ path: `${SHOT_DIR}/t099_touliu_parse_failed.png`, fullPage: true });
    }
  );

  const timeoutFailed = await runScenario(
    browser,
    "timeout-failed",
    { taskId: "t099-touliu-timeout", states: ["timeout_failed"] },
    async (page) => {
      await page.waitForSelector("text=投流没生成出来", { timeout: 10000 });
      await page.waitForSelector("text=外部服务这次等太久", { timeout: 1000 });
      await page.waitForSelector("text=生成正文", { timeout: 1000 });
      await page.screenshot({ path: `${SHOT_DIR}/t099_touliu_task_failed_friendly.png`, fullPage: true });
    }
  );

  const mobileCtx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  const mobilePage = await mobileCtx.newPage();
  const mobileTelemetry = attachTelemetry(mobilePage);
  const mobileTimeline = { polls: 0, states: [], submitBody: null };
  await resetBrowserState(mobilePage);
  await installRoutes(mobilePage, mobileTimeline, { taskId: "t099-touliu-mobile", states: ["slow"] });
  await submitTouliu(mobilePage);
  await mobilePage.waitForSelector("text=比预期慢，正在等正文回传", { timeout: 10000 });
  const mobile = await mobileMetrics(mobilePage);
  await mobilePage.screenshot({ path: `${SHOT_DIR}/t099_touliu_mobile_390.png`, fullPage: true });
  await assertClean(mobilePage, mobileTelemetry);
  await mobileCtx.close();
  if (mobile.maxOverflow > 2) throw new Error("390px 窄屏出现横向裁切: " + JSON.stringify(mobile));

  await browser.close();
  console.log(JSON.stringify({
    ok: true,
    app: APP,
    scenarios: [slowOk, parseFailed, timeoutFailed],
    mobile,
    screenshots: [
      `${SHOT_DIR}/t099_touliu_slow_wait.png`,
      `${SHOT_DIR}/t099_touliu_ok.png`,
      `${SHOT_DIR}/t099_touliu_parse_failed.png`,
      `${SHOT_DIR}/t099_touliu_task_failed_friendly.png`,
      `${SHOT_DIR}/t099_touliu_mobile_390.png`,
    ],
  }, null, 2));
})().catch(err => {
  console.error(err);
  process.exit(1);
});
