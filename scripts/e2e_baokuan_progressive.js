const fs = require("fs");
const { chromium } = require("/Users/black.chen/.npm-global/lib/node_modules/playwright");

const APP = process.env.APP_URL || "http://127.0.0.1:8001/?page=baokuan";
const TASK_ID = "t098-baokuan-progressive";
const SHOT_DIR = "/tmp/_ui_shots";
const forbiddenRe = /(已走技能|需要进一步操作吗|prompt|tokens|API|route|model|provider|submit_id|\/Users)/i;

function version(key, label, content, idx) {
  return {
    unit_id: key,
    key,
    label,
    content,
    word_count: 120 + idx,
    gen_id: `${key}-mock`,
    version_index: idx,
    tokens: { total: 1 },
    route_key: "baokuan.rewrite",
    provider: "hidden",
  };
}

const allVersions = [
  version("V1", "换皮版", "V1 局部正文：原来的开场保住，后面换成更像清华哥能直接念的表达。", 1),
  version("V2", "狠劲版", "V2 局部正文：别再把爆款当玄学，真正厉害的是那几句扎心话。", 2),
  version("V3", "翻转版", "V3 最终正文：表面是同行内容火了，本质是老板终于把用户痛点讲顺了。", 3),
  version("V4", "圈人版", "V4 最终正文：做餐饮的老板听好了，别只抄形式，要抄它背后的成交顺序。", 4),
];

function publicVersion(v) {
  const { tokens, route_key, provider, ...rest } = v;
  return rest;
}

function dnaPayload() {
  return {
    dna: {
      why_hot: "击中了老板想抄爆款却怕抄不像的焦虑。",
      emotion_hook: "开头直接把反差抛出来，让人想知道差在哪。",
      structure: "先保留钩子，再拆痛点，最后给行动出口。",
    },
  };
}

function partialFor(count) {
  const versions = allVersions.slice(0, count).map(publicVersion);
  return {
    content: versions[0]?.content || "",
    word_count: versions[0]?.word_count || 0,
    versions,
    units: versions,
    completed_versions: count,
    total_versions: 4,
  };
}

function taskResponse(state, taskId = TASK_ID) {
  const common = {
    id: taskId,
    kind: "baokuan.rewrite",
    ns: "baokuan",
    page_id: "baokuan",
    step: "rewrite",
    estimated_seconds: 220,
    elapsed_sec: state === "v1" ? 36 : state === "v2" ? 76 : state === "slow" ? 421 : state === "failed" ? 438 : 446,
  };
  if (state === "v1") {
    return {
      ...common,
      status: "running",
      progress_pct: 37,
      progress_text: "已完成 1/4 版",
      partial_result: partialFor(1),
      progress_data: {
        completed_versions: 1,
        total_versions: 4,
        timeline: [{ text: "V1 · 换皮版完成", completed_versions: 1, total_versions: 4, version_index: 1, unit_id: "V1", status: "done" }],
      },
    };
  }
  if (state === "v2") {
    return {
      ...common,
      status: "running",
      progress_pct: 55,
      progress_text: "已完成 2/4 版",
      partial_result: partialFor(2),
      progress_data: {
        completed_versions: 2,
        total_versions: 4,
        timeline: [
          { text: "V1 · 换皮版完成", completed_versions: 1, total_versions: 4, version_index: 1, unit_id: "V1", status: "done" },
          { text: "V2 · 狠劲版完成", completed_versions: 2, total_versions: 4, version_index: 2, unit_id: "V2", status: "done" },
        ],
      },
    };
  }
  if (state === "slow") {
    return {
      ...common,
      status: "running",
      progress_pct: 78,
      progress_text: "正在写第 4/4 版 · V4 · 圈人版...",
      partial_result: partialFor(3),
      progress_data: {
        completed_versions: 3,
        total_versions: 4,
        timeline: [
          { text: "V1 · 换皮版完成", completed_versions: 1, total_versions: 4, version_index: 1, unit_id: "V1", status: "done" },
          { text: "V2 · 狠劲版完成", completed_versions: 2, total_versions: 4, version_index: 2, unit_id: "V2", status: "done" },
          { text: "V3 · 翻转版完成", completed_versions: 3, total_versions: 4, version_index: 3, unit_id: "V3", status: "done" },
          { text: "开始写第 4/4 版 · V4 · 圈人版", completed_versions: 3, total_versions: 4, version_index: 4, unit_id: "V4", status: "running", at_ts: Math.floor(Date.now() / 1000) - 421 },
        ],
      },
    };
  }
  if (state === "failed") {
    return {
      ...common,
      status: "failed",
      progress_pct: 78,
      progress_text: "第 4 版暂时没跑完",
      error: "剩余版本暂时没跑完",
      partial_result: partialFor(3),
      progress_data: {
        completed_versions: 3,
        total_versions: 4,
        timeline: [
          { text: "V1 · 换皮版完成", completed_versions: 1, total_versions: 4, version_index: 1, unit_id: "V1", status: "done" },
          { text: "V2 · 狠劲版完成", completed_versions: 2, total_versions: 4, version_index: 2, unit_id: "V2", status: "done" },
          { text: "V3 · 翻转版完成", completed_versions: 3, total_versions: 4, version_index: 3, unit_id: "V3", status: "done" },
          { text: "第 4 版暂时没跑完", completed_versions: 3, total_versions: 4, version_index: 4, unit_id: "V4", status: "failed" },
        ],
      },
    };
  }
  return {
    ...common,
    status: "ok",
    progress_pct: 100,
    progress_text: "完成",
    partial_result: null,
    progress_data: null,
    result: {
      content: allVersions[0].content,
      word_count: allVersions[0].word_count,
      versions: allVersions.map(publicVersion),
      version_count: 4,
      mode: "all",
    },
  };
}

async function installRoutes(page, timeline, options = {}) {
  const taskId = options.taskId || TASK_ID;
  const states = options.states || ["v1", "v2", "slow", "ok"];
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
  await page.route("**/api/baokuan/skill-info", route => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ slug: "爆款改写-学员版", ok: true }),
  }));
  await page.route("**/api/baokuan/analyze", async route => {
    timeline.analyzeBody = route.request().postDataJSON();
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(dnaPayload()) });
  });
  await page.route("**/api/baokuan/rewrite", async route => {
    timeline.rewriteBody = route.request().postDataJSON();
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ task_id: taskId, status: "running", estimated_seconds: 220, page_id: "baokuan", version_count: 4 }),
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
    localStorage.removeItem("wf:baokuan");
    localStorage.removeItem("task:baokuan");
    localStorage.removeItem("baokuan_seed_text");
    localStorage.removeItem("baokuan_seed_auto_analyze");
    localStorage.removeItem("from_make_anchor");
    localStorage.removeItem("show_api_status");
    sessionStorage.clear();
  });
}

async function submitBaokuan(page) {
  await page.goto(APP, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForSelector("text=哪条爆款想改?", { timeout: 12000 });
  await page.getByPlaceholder(/把别人的爆款文案整段贴这里/).fill(
    "第一句就把老板的焦虑说透。第二句告诉他为什么过去抄爆款没用。第三句把反差抛出来：你缺的不是模板，而是成交顺序。后面继续讲同行为什么能火，因为他没有堆卖点，而是先把用户心里的那口气说出来，再给一个特别简单的行动出口。"
  );
  await page.getByText("全都要 · 4 版").click();
  await page.getByPlaceholder(/行业/).fill("餐饮老板");
  await page.getByPlaceholder(/转化动作/).fill("加微信");
  await page.getByRole("button", { name: /分析爆款基因/ }).click();
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
  const timeline = { taskPolls: 0, states: [], analyzeBody: null, rewriteBody: null, cancelPosts: 0 };
  await resetBrowserState(page);
  await installRoutes(page, timeline, options);
  await submitBaokuan(page);
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
    "running-slow-ok",
    { states: ["v1", "v2", "slow", "ok"] },
    async (page, timeline) => {
      await page.waitForSelector("text=爆款基因分析", { timeout: 10000 });
      await page.waitForSelector("text=先出的版本已经能看", { timeout: 10000 });
      await page.waitForSelector("text=V1 局部正文", { timeout: 1000 });
      await page.waitForSelector("text=后面 3 版继续在后台写", { timeout: 1000 });
      await page.screenshot({ path: `${SHOT_DIR}/t098_baokuan_running_v1.png`, fullPage: true });

      await page.waitForSelector("text=已完成 2/4", { timeout: 7000 });
      await page.waitForSelector("text=V2 局部正文", { timeout: 1000 });
      await page.screenshot({ path: `${SHOT_DIR}/t098_baokuan_running_v2.png`, fullPage: true });

      await page.waitForSelector("text=正在写第 4/4 版", { timeout: 7000 });
      await page.waitForSelector("text=比预期慢，正在等这一版", { timeout: 1000 });
      await page.waitForSelector("text=已等 7 分 1 秒", { timeout: 1000 });
      await page.waitForSelector("text=取消剩余生成", { timeout: 1000 });
      await page.screenshot({ path: `${SHOT_DIR}/t098_baokuan_slow_v4.png`, fullPage: true });

      await page.waitForSelector("text=V4 最终正文", { timeout: 7000 });
      if (!timeline.analyzeBody?.text?.includes("成交顺序")) throw new Error("未观察到真实填入原文后提交分析");
      if (timeline.rewriteBody?.mode !== "all") throw new Error("改写提交未选择 4 版: " + JSON.stringify(timeline.rewriteBody));
      await page.screenshot({ path: `${SHOT_DIR}/t098_baokuan_done.png`, fullPage: true });
    }
  );

  const failed = await runScenario(
    browser,
    "failed-partial",
    { taskId: "t098-baokuan-failed", states: ["failed"] },
    async (page, timeline) => {
      await page.waitForSelector("text=后面 1 版没有跑完，前面 3 版已保留", { timeout: 10000 });
      await page.waitForSelector("text=V3 最终正文", { timeout: 1000 });
      await page.waitForSelector("text=复制", { timeout: 1000 });
      if (!timeline.states.includes("failed")) throw new Error("failed 状态未出现");
      await page.screenshot({ path: `${SHOT_DIR}/t098_baokuan_failed_partial.png`, fullPage: true });
    }
  );

  const mobileCtx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  const mobilePage = await mobileCtx.newPage();
  const mobileTelemetry = attachTelemetry(mobilePage);
  const mobileTimeline = { taskPolls: 0, states: [], analyzeBody: null, rewriteBody: null, cancelPosts: 0 };
  await resetBrowserState(mobilePage);
  await installRoutes(mobilePage, mobileTimeline, { taskId: "t098-baokuan-mobile", states: ["v1", "v2", "slow"] });
  await submitBaokuan(mobilePage);
  await mobilePage.waitForSelector("text=V2 局部正文", { timeout: 10000 });
  await mobilePage.waitForSelector("text=已完成 2/4", { timeout: 1000 });
  const mobile = await mobileMetrics(mobilePage);
  await mobilePage.screenshot({ path: `${SHOT_DIR}/t098_baokuan_mobile_390.png`, fullPage: true });
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
      `${SHOT_DIR}/t098_baokuan_running_v1.png`,
      `${SHOT_DIR}/t098_baokuan_running_v2.png`,
      `${SHOT_DIR}/t098_baokuan_slow_v4.png`,
      `${SHOT_DIR}/t098_baokuan_done.png`,
      `${SHOT_DIR}/t098_baokuan_failed_partial.png`,
      `${SHOT_DIR}/t098_baokuan_mobile_390.png`,
    ],
  }, null, 2));
})().catch(err => {
  console.error(err);
  process.exit(1);
});
