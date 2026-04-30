const fs = require("fs");
const { chromium } = require("/Users/black.chen/.npm-global/lib/node_modules/playwright");

const APP = process.env.APP_URL || "http://127.0.0.1:8001/?page=hotrewrite";
const TASK_ID = "t085-progressive";
const SHOT_DIR = "/tmp/_ui_shots";
const forbiddenRe = /(已走技能|需要进一步操作吗|prompt|tokens|API|route|model|provider|submit_id|本机路径|\/Users)/i;

function version(n, label, content) {
  return {
    content,
    word_count: 120 + n,
    self_check: {
      pass: true,
      six_dimensions: {
        "开场抓取力": 18,
        "结构推进力": 18,
        "人设可信度": 18,
        "业务植入丝滑度": 18,
        "听感与可读性": 18,
        "风险与边界": 18,
      },
      one_veto: { triggered: false },
      summary: "整体顺",
    },
    variant_id: `v${n}`,
    mode_label: label,
    version_index: n,
    tokens: { write: 1, check: 1 },
    route_key: "hotrewrite.write.fast",
  };
}

const allVersions = [
  version(1, "纯改写 V1 · 换皮版", "V1 局部正文: 先把三句话背后的信任链讲明白。"),
  version(2, "纯改写 V2 · 狠劲版", "V2 局部正文: 别再把直播间没人买怪给设备。"),
  version(3, "结合业务 V3 · 翻转版", "V3 最终正文: 表面是直播爆单, 本质是老板表达系统。"),
  version(4, "结合业务 V4 · 圈人版", "V4 最终正文: 这条只适合愿意把成交话术磨透的老板。"),
];

function analyzePayload() {
  return {
    breakdown: {
      event_core: "餐饮老板直播间爆单",
      conflict: "老板以为靠设备, 实际靠信任表达",
      emotion: "焦虑又想学",
    },
    angles: [
      { label: "A. 三句话背后的信任链", audience: "想学直播转化的老板", draft_hook: "别只看爆单, 先看他说了哪三句话" },
      { label: "B. 直播不是热闹, 是成交结构", audience: "直播间有人没成交的老板", draft_hook: "你缺的不是流量, 是成交结构" },
      { label: "C. AI 员工先学会这件事", audience: "想用 AI 降本的老板", draft_hook: "AI 不是先替你说话, 是先替你梳理话" },
    ],
  };
}

function publicVersion(v) {
  const { tokens, route_key, ...rest } = v;
  return rest;
}

function taskResponse(state) {
  const common = {
    id: TASK_ID,
    kind: "hotrewrite.write",
    ns: "hotrewrite",
    page_id: "hotrewrite",
    step: "write",
    estimated_seconds: 360,
    elapsed_sec: state === "v1" ? 34 : state === "v2" ? 72 : state === "slow" ? 421 : 438,
  };
  if (state === "v1") {
    return {
      ...common,
      status: "running",
      progress_pct: 37,
      progress_text: "已完成 1/4 版",
      partial_result: {
        content: allVersions[0].content,
        word_count: allVersions[0].word_count,
        self_check: allVersions[0].self_check,
        versions: [publicVersion(allVersions[0])],
        completed_versions: 1,
        total_versions: 4,
      },
      progress_data: {
        completed_versions: 1,
        total_versions: 4,
        timeline: [{ text: "纯改写 V1 · 换皮版完成", completed_versions: 1, total_versions: 4 }],
      },
    };
  }
  if (state === "v2") {
    return {
      ...common,
      status: "running",
      progress_pct: 55,
      progress_text: "已完成 2/4 版",
      partial_result: {
        content: allVersions[0].content,
        word_count: allVersions[0].word_count,
        self_check: allVersions[0].self_check,
        versions: allVersions.slice(0, 2).map(publicVersion),
        completed_versions: 2,
        total_versions: 4,
      },
      progress_data: {
        completed_versions: 2,
        total_versions: 4,
        timeline: [
          { text: "纯改写 V1 · 换皮版完成", completed_versions: 1, total_versions: 4 },
          { text: "纯改写 V2 · 狠劲版完成", completed_versions: 2, total_versions: 4 },
        ],
      },
    };
  }
  if (state === "slow") {
    return {
      ...common,
      status: "running",
      progress_pct: 78,
      progress_text: "第 4 版比预期慢，正在重试兜底",
      partial_result: {
        content: allVersions[0].content,
        word_count: allVersions[0].word_count,
        self_check: allVersions[0].self_check,
        versions: allVersions.slice(0, 3).map(publicVersion),
        completed_versions: 3,
        total_versions: 4,
      },
      progress_data: {
        completed_versions: 3,
        total_versions: 4,
        timeline: [
          { text: "纯改写 V1 · 换皮版完成", completed_versions: 1, total_versions: 4 },
          { text: "纯改写 V2 · 狠劲版完成", completed_versions: 2, total_versions: 4 },
          { text: "结合业务 V3 · 翻转版完成", completed_versions: 3, total_versions: 4 },
          { text: "第 4 版比预期慢，正在重试兜底", completed_versions: 3, total_versions: 4, version_index: 4, status: "running", at_ts: Math.floor(Date.now() / 1000) - 421 },
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
      self_check: allVersions[0].self_check,
      versions: allVersions,
      version_count: 4,
    },
  };
}

async function installRoutes(page, timeline) {
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
  await page.route("**/api/hot-topics?**", route => route.fulfill({ contentType: "application/json", body: JSON.stringify([]) }));
  await page.route("**/api/hotrewrite/skill-info", route => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ slug: "热点文案改写V2", ok: true }),
  }));
  await page.route("**/api/hotrewrite/analyze", async route => {
    timeline.analyzeBody = route.request().postDataJSON();
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(analyzePayload()) });
  });
  await page.route("**/api/hotrewrite/write", async route => {
    timeline.writeBody = route.request().postDataJSON();
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ task_id: TASK_ID, status: "running", estimated_seconds: 360, page_id: "hotrewrite", version_count: 4 }),
    });
  });
  await page.route(`**/api/tasks/${TASK_ID}`, async route => {
    timeline.taskPolls += 1;
    const state = timeline.taskPolls === 1 ? "v1" : timeline.taskPolls === 2 ? "v2" : timeline.taskPolls === 3 ? "slow" : "ok";
    timeline.states.push(state);
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(taskResponse(state)) });
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
}

async function mobileMetrics(page) {
  return page.evaluate(() => {
    const root = document.scrollingElement || document.documentElement;
    const body = document.body;
    const labels = ["热点文案改写 · 3 步", "方法已加载", "输入热点", "选切入角度", "正文+自检"];
    const boxes = labels.map(label => {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let node = null;
      while ((node = walker.nextNode())) {
        if ((node.textContent || "").trim() === label) {
          const box = node.parentElement.getBoundingClientRect();
          return { label, x: box.x, y: box.y, width: box.width, height: box.height };
        }
      }
      return { label, missing: true };
    });
    return {
      innerWidth: window.innerWidth,
      maxOverflow: Math.max(root.scrollWidth - root.clientWidth, body.scrollWidth - body.clientWidth),
      boxes,
    };
  });
}

(async () => {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 980 } });
  const page = await ctx.newPage();
  const telemetry = { consoleErrors: [], pageErrors: [], failedRequests: [], httpErrors: [] };
  const timeline = { taskPolls: 0, states: [], analyzeBody: null, writeBody: null };

  page.on("console", m => { if (m.type() === "error") telemetry.consoleErrors.push(m.text()); });
  page.on("pageerror", e => telemetry.pageErrors.push(e.message));
  page.on("requestfailed", req => telemetry.failedRequests.push(`${req.method()} ${req.url()} ${req.failure()?.errorText || ""}`));
  page.on("response", res => { if (res.status() >= 400) telemetry.httpErrors.push(`${res.status()} ${res.url()}`); });

  await page.addInitScript(() => {
    localStorage.removeItem("wf:hotrewrite");
    localStorage.removeItem("task:hotrewrite");
    localStorage.removeItem("from_make_anchor");
    localStorage.removeItem("show_api_status");
    sessionStorage.clear();
  });
  await installRoutes(page, timeline);

  await page.goto(APP, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForSelector("text=什么热点要改写?", { timeout: 12000 });
  await page.getByPlaceholder(/最近某平台头部主播/).fill("本地餐饮老板直播间突然爆单, 复盘只改了三句话");
  await page.getByRole("button", { name: /开始拆解/ }).click();
  await page.waitForSelector("text=拆解完毕", { timeout: 10000 });
  await page.waitForSelector("text=本次会出 4 篇", { timeout: 10000 });
  await page.getByText("三句话背后的信任链").click();

  await page.waitForSelector("text=先出的版本已经能看", { timeout: 10000 });
  await page.waitForSelector("text=V1 局部正文", { timeout: 10000 });
  await page.waitForSelector("text=后面 3 版继续在后台写", { timeout: 10000 });
  await page.screenshot({ path: `${SHOT_DIR}/t085_hotrewrite_running_v1.png`, fullPage: true });

  await page.waitForSelector("text=纯改写 V2 · 狠劲版完成", { timeout: 7000 });
  await page.waitForSelector("text=已完成 2/4", { timeout: 1000 });
  await page.screenshot({ path: `${SHOT_DIR}/t085_hotrewrite_running_v2.png`, fullPage: true });

  await page.waitForSelector("text=第 4 版比预期慢，正在重试兜底", { timeout: 7000 });
  await page.waitForSelector("text=已等 7 分 1 秒", { timeout: 1000 });
  await page.waitForSelector("text=取消剩余生成", { timeout: 1000 });
  await page.screenshot({ path: `${SHOT_DIR}/t085_hotrewrite_slow_v4.png`, fullPage: true });

  await page.waitForSelector("text=4 版文案", { timeout: 7000 });
  await page.getByRole("button", { name: /第 4 版/ }).last().click();
  await page.waitForSelector("text=V4 最终正文", { timeout: 3000 });
  await page.screenshot({ path: `${SHOT_DIR}/t085_hotrewrite_done_4versions.png`, fullPage: true });

  if (!timeline.analyzeBody?.hotspot?.includes("三句话")) throw new Error("未观察到真实填入热点后提交拆解");
  if (!timeline.writeBody?.modes?.with_biz || !timeline.writeBody?.modes?.pure_rewrite) {
    throw new Error("改写提交未包含默认 4 版模式: " + JSON.stringify(timeline.writeBody));
  }
  for (const state of ["v1", "v2", "slow", "ok"]) {
    if (!timeline.states.includes(state)) throw new Error(`未观察到 task 状态: ${state}`);
  }
  await assertClean(page, telemetry);

  await page.setViewportSize({ width: 390, height: 900 });
  await page.waitForTimeout(300);
  const mobile = await mobileMetrics(page);
  await page.screenshot({ path: `${SHOT_DIR}/t085_hotrewrite_mobile_390.png`, fullPage: true });
  await assertClean(page, telemetry);
  if (mobile.maxOverflow > 2) throw new Error("390px 窄屏出现横向裁切: " + JSON.stringify(mobile));
  for (const box of mobile.boxes) {
    if (box.missing) throw new Error(`390px 缺少标题/步骤: ${box.label}`);
    if (box.x < -1 || box.x + box.width > mobile.innerWidth + 1) throw new Error(`390px 文本裁切: ${JSON.stringify(box)}`);
    if (box.height > box.width * 0.9) throw new Error(`390px 文本疑似竖排: ${JSON.stringify(box)}`);
  }

  await browser.close();
  console.log(JSON.stringify({
    ok: true,
    app: APP,
    states: timeline.states,
    analyzeHotspot: timeline.analyzeBody.hotspot,
    writeModes: timeline.writeBody.modes,
    consoleErrors: telemetry.consoleErrors.length,
    pageErrors: telemetry.pageErrors.length,
    failedRequests: telemetry.failedRequests.length,
    httpErrors: telemetry.httpErrors.length,
    mobile,
    screenshots: [
      `${SHOT_DIR}/t085_hotrewrite_running_v1.png`,
      `${SHOT_DIR}/t085_hotrewrite_running_v2.png`,
      `${SHOT_DIR}/t085_hotrewrite_slow_v4.png`,
      `${SHOT_DIR}/t085_hotrewrite_done_4versions.png`,
      `${SHOT_DIR}/t085_hotrewrite_mobile_390.png`,
    ],
  }, null, 2));
})().catch(err => {
  console.error(err);
  process.exit(1);
});
