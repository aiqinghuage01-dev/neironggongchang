const fs = require("fs");
const { chromium } = require("/Users/black.chen/.npm-global/lib/node_modules/playwright");

const BASE = process.env.APP_BASE || "http://127.0.0.1:8001";
const SHOT_DIR = "/tmp/_ui_shots";
const forbiddenRe = /(prompt|tokens|API|model|provider|route)/i;

function nowMinus(sec) {
  return Math.floor(Date.now() / 1000) - sec;
}

function stageTimeline(stages, current, failed) {
  const timeline = [];
  stages.forEach((stage, idx) => {
    const label = stage.label;
    if (failed && stage.id === current) {
      timeline.push({ stage: stage.id, label, text: `停在${label}`, status: "failed", at_ts: nowMinus(2) });
    } else if (stage.id === current) {
      timeline.push({ stage: stage.id, label, text: `正在${label}`, status: "running", started_ts: nowMinus(76) });
    } else if (idx < stages.findIndex(s => s.id === current) || (!current && !failed)) {
      timeline.push({ stage: stage.id, label, text: `${label}已完成`, status: "done", at_ts: nowMinus(80 - idx * 8) });
    }
  });
  const completed = timeline.filter(item => item.status === "done").length;
  return {
    kind: "stage_timeline",
    total_stages: stages.length,
    completed_stages: completed,
    current_stage: current || "",
    current_label: current ? (stages.find(s => s.id === current)?.label || "") : "",
    slow_hint_after_sec: 40,
    timeline,
  };
}

const WX_STAGES = [
  { id: "prepare", label: "整理写作材料" },
  { id: "write", label: "写长文正文" },
  { id: "check", label: "三层自检" },
  { id: "finish", label: "整理结果" },
];
const VOICE_STAGES = [
  { id: "prepare", label: "整理录音骨架" },
  { id: "write", label: "改写正文" },
  { id: "check", label: "整理说明和自检" },
];
const PLANNER_STAGES = [
  { id: "prepare", label: "整理活动信息" },
  { id: "write", label: "写 6 模块方案" },
  { id: "finish", label: "整理执行清单" },
];

function task(kind, ns, pageId, state, taskId, stages, result) {
  const base = {
    id: taskId,
    kind,
    ns,
    page_id: pageId,
    step: "write",
    estimated_seconds: 50,
  };
  if (state === "ok") {
    return {
      ...base,
      status: "ok",
      elapsed_sec: 44,
      progress_pct: 100,
      progress_text: "完成",
      partial_result: null,
      progress_data: null,
      result,
    };
  }
  if (state === "failed") {
    const failedStage = stages[Math.min(1, stages.length - 1)].id;
    return {
      ...base,
      status: "failed",
      elapsed_sec: 83,
      progress_pct: 45,
      progress_text: `停在${stages.find(s => s.id === failedStage).label}`,
      error: "这一步没跑成，通常重试一次就好。",
      partial_result: {
        kind: "stage_timeline",
        current_stage: failedStage,
        current_label: stages.find(s => s.id === failedStage).label,
        completed_stages: 1,
        total_stages: stages.length,
      },
      progress_data: stageTimeline(stages, failedStage, true),
    };
  }
  const runningStage = stages[Math.min(1, stages.length - 1)].id;
  return {
    ...base,
    status: "running",
    elapsed_sec: 76,
    progress_pct: 42,
    progress_text: `正在${stages.find(s => s.id === runningStage).label}`,
    partial_result: {
      kind: "stage_timeline",
      current_stage: runningStage,
      current_label: stages.find(s => s.id === runningStage).label,
      completed_stages: 1,
      total_stages: stages.length,
    },
    progress_data: stageTimeline(stages, runningStage, false),
  };
}

const wechatResult = {
  title: "标题一",
  content: "# 标题一\n\n这是一篇已经写好的公众号长文，用来验证完成态不会再等待。",
  word_count: 36,
  self_check: {
    pass: true,
    six_principles: [{ name: "先定性再解释", pass: true, issue: "" }],
    six_dimensions: { "开场抓取力": 18, "结构推进力": 18, "人设可信度": 18, "业务植入丝滑度": 18, "听感与可读性": 18, "风险与边界控制": 18 },
    one_veto: { triggered: false, items: [] },
    summary: "可用",
  },
};
const voiceResult = {
  content: "老板别急着把录音改成广告。先保留你原来的判断，再把重复口头禅删掉。",
  word_count: 38,
  notes: ["保留原观点", "删掉重复表达"],
  self_check: { overall_pass: true, core_view_match: true, experiences_kept: true, sounds_genuine: true, tone_preserved: true, golden_3s_strong: true, no_over_trim: true, deep_enough: true, summary: "可用" },
};
const plannerResult = {
  plan: {
    before_event: { title: "活动前准备", items: [{ category: "设备", list: ["录音笔", "三脚架"] }] },
    during_event: { title: "活动中时间线", segments: [{ time: "开场前", actions: ["拍空场"] }] },
    after_event: { title: "活动后内容生产计划", tasks: [{ day: "+0", action: "整理录音" }] },
    team: { title: "团队 / 设备", roles: [{ role: "主讲", duty: "讲课" }] },
    checklist: { title: "执行清单", before: ["测试设备"] },
    knowledge_sink: { title: "知识库回流", items: [{ type: "金句", from: "逐字稿", to: "金句库" }] },
    summary: "一天活动拆成多条内容。",
  },
};

function attachTelemetry(page) {
  const telemetry = { consoleErrors: [], pageErrors: [], failedRequests: [], httpErrors: [] };
  page.on("console", m => { if (m.type() === "error") telemetry.consoleErrors.push(m.text()); });
  page.on("pageerror", e => telemetry.pageErrors.push(e.message));
  page.on("requestfailed", req => telemetry.failedRequests.push(`${req.method()} ${req.url()} ${req.failure()?.errorText || ""}`));
  page.on("response", res => { if (res.status() >= 400) telemetry.httpErrors.push(`${res.status()} ${res.url()}`); });
  return telemetry;
}

async function installCommonRoutes(page) {
  await page.route("**/favicon.ico", route => route.fulfill({ status: 204, body: "" }));
  await page.route("**/api/settings", route => route.fulfill({ contentType: "application/json", body: JSON.stringify({ image_engine: "apimart" }) }));
  await page.route("**/api/stats/home", route => route.fulfill({ contentType: "application/json", body: JSON.stringify({ sidebar_counts: {} }) }));
  await page.route("**/api/tasks/counts", route => route.fulfill({ contentType: "application/json", body: JSON.stringify({ active: 0, running: 0, pending: 0, ok: 0, failed: 0, cancelled: 0 }) }));
  await page.route("**/api/tasks?**", route => route.fulfill({ contentType: "application/json", body: JSON.stringify({ tasks: [], counts: { active: 0, running: 0, pending: 0, ok: 0, failed: 0, cancelled: 0 } }) }));
  await page.route("**/api/kb/match", route => route.fulfill({ contentType: "application/json", body: JSON.stringify({ matches: [] }) }));
}

async function clearState(page) {
  await page.addInitScript(() => {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith("wf:") || key.startsWith("task:")) localStorage.removeItem(key);
    }
    localStorage.removeItem("show_api_status");
    sessionStorage.clear();
  });
}

async function assertClean(page, telemetry) {
  const text = await page.locator("body").innerText();
  const forbidden = text.match(forbiddenRe);
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

async function withPage(browser, pageId, scenario, viewport, run) {
  const ctx = await browser.newContext({ viewport: viewport || { width: 1440, height: 960 } });
  const page = await ctx.newPage();
  const telemetry = attachTelemetry(page);
  const seen = { polls: 0, states: [], posts: 0 };
  await clearState(page);
  await installCommonRoutes(page);
  await run(page, seen);
  await assertClean(page, telemetry);
  const metrics = viewport?.width === 390 ? await mobileMetrics(page) : null;
  if (metrics && metrics.maxOverflow > 0) throw new Error(`${pageId}/${scenario} 390px 横向裁切: ${JSON.stringify(metrics)}`);
  await ctx.close();
  return {
    page: pageId,
    scenario,
    states: seen.states,
    consoleErrors: telemetry.consoleErrors.length,
    pageErrors: telemetry.pageErrors.length,
    failedRequests: telemetry.failedRequests.length,
    httpErrors: telemetry.httpErrors.length,
    mobile: metrics,
  };
}

async function installWechatRoutes(page, seen, state) {
  const taskId = `t100-wechat-${state}`;
  await page.route("**/api/wechat/skill-info", route => route.fulfill({ contentType: "application/json", body: JSON.stringify({ slug: "公众号文章", ok: true }) }));
  await page.route("**/api/wechat/titles", route => route.fulfill({ contentType: "application/json", body: JSON.stringify({ titles: [{ title: "标题一", template: "反常识", why: "有冲突" }] }) }));
  await page.route("**/api/wechat/outline", route => route.fulfill({ contentType: "application/json", body: JSON.stringify({ opening: "开场", core_points: ["论点一", "论点二"], business_bridge: "桥接", closing: "结尾", estimated_words: 2400 }) }));
  await page.route("**/api/wechat/write", route => {
    seen.posts += 1;
    route.fulfill({ contentType: "application/json", body: JSON.stringify({ task_id: taskId, status: "running", estimated_seconds: 50, page_id: "wechat" }) });
  });
  await page.route(`**/api/tasks/${taskId}/cancel`, route => route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true }) }));
  await page.route(`**/api/tasks/${taskId}`, route => {
    seen.polls += 1;
    const current = state === "ok" && seen.polls >= 2 ? "ok" : state;
    seen.states.push(current);
    route.fulfill({ contentType: "application/json", body: JSON.stringify(task("wechat.write", "wechat", "wechat", current, taskId, WX_STAGES, wechatResult)) });
  });
}

async function submitWechat(page) {
  await page.goto(`${BASE}/?page=wechat`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForSelector("text=今天想写什么选题?", { timeout: 12000 });
  await page.locator("textarea").first().fill("实体老板怎么用小华做内容获客");
  await page.getByRole("button", { name: /分步/ }).click();
  await page.waitForSelector("text=标题一", { timeout: 8000 });
  await page.getByText("标题一").click();
  await page.waitForSelector("text=确认大纲", { timeout: 8000 });
  await page.getByRole("button", { name: /写长文/ }).click();
}

async function runWechat(browser, state, viewport) {
  return withPage(browser, "wechat", state, viewport, async (page, seen) => {
    await installWechatRoutes(page, seen, state);
    await submitWechat(page);
    if (state === "slow") {
      await page.waitForSelector("text=写长文正文", { timeout: 8000 });
      await page.waitForSelector("text=已等", { timeout: 8000 });
    } else if (state === "failed") {
      await page.waitForSelector("text=长文没写成功", { timeout: 8000 });
      await page.waitForSelector("text=停在哪一步", { timeout: 8000 });
    } else {
      await page.waitForSelector("text=三层自检已完成", { timeout: 10000 });
    }
    await page.screenshot({ path: `${SHOT_DIR}/t100_wechat_${state}${viewport?.width === 390 ? "_390" : ""}.png`, fullPage: true });
  });
}

async function installVoiceRoutes(page, seen, state) {
  const taskId = `t100-voice-${state}`;
  await page.route("**/api/voicerewrite/skill-info", route => route.fulfill({ contentType: "application/json", body: JSON.stringify({ slug: "录音文案改写", ok: true }) }));
  await page.route("**/api/voicerewrite/analyze", route => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({
      skeleton: { core_view: "老板要先讲真实判断", key_experiences: ["讲课"], insights: ["内容要真"], tone_anchors: ["我跟你说"] },
      angles: [{ label: "A. 老板真实表达", why: "最像本人", opening_draft: "别急着把录音改成广告。" }],
    }),
  }));
  await page.route("**/api/voicerewrite/write", route => {
    seen.posts += 1;
    route.fulfill({ contentType: "application/json", body: JSON.stringify({ task_id: taskId, status: "running", estimated_seconds: 50, page_id: "voicerewrite" }) });
  });
  await page.route(`**/api/tasks/${taskId}`, route => {
    seen.polls += 1;
    const current = state === "ok" && seen.polls >= 2 ? "ok" : state;
    seen.states.push(current);
    route.fulfill({ contentType: "application/json", body: JSON.stringify(task("voicerewrite.write", "voicerewrite", "voicerewrite", current, taskId, VOICE_STAGES, voiceResult)) });
  });
}

async function submitVoice(page) {
  await page.goto(`${BASE}/?page=voicerewrite`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForSelector("text=录音转写了吗?", { timeout: 12000 });
  await page.locator("textarea").first().fill("我今天讲课发现很多老板不是不会拍视频，是一上来就想卖东西。");
  await page.getByRole("button", { name: /提骨架/ }).click();
  await page.waitForSelector("text=老板真实表达", { timeout: 8000 });
  await page.getByText("老板真实表达").click();
}

async function runVoice(browser, state, viewport) {
  return withPage(browser, "voicerewrite", state, viewport, async (page, seen) => {
    await installVoiceRoutes(page, seen, state);
    await submitVoice(page);
    if (state === "slow") {
      await page.waitForSelector("text=改写正文", { timeout: 8000 });
      await page.waitForSelector("text=阶段时间线", { timeout: 8000 });
    } else if (state === "failed") {
      await page.waitForSelector("text=改写没跑成功", { timeout: 8000 });
      await page.waitForSelector("text=停在哪一步", { timeout: 8000 });
    } else {
      await page.waitForSelector("text=改写完成", { timeout: 10000 });
    }
    await page.screenshot({ path: `${SHOT_DIR}/t100_voice_${state}${viewport?.width === 390 ? "_390" : ""}.png`, fullPage: true });
  });
}

async function installPlannerRoutes(page, seen, state) {
  const taskId = `t100-planner-${state}`;
  await page.route("**/api/planner/skill-info", route => route.fulfill({ contentType: "application/json", body: JSON.stringify({ slug: "content-planner", ok: true }) }));
  await page.route("**/api/planner/analyze", route => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({
      detected: { 活动类型: "讲课", 天数: 1, 人数: 200, 有助理: true, 推断说明: "按 brief 推断" },
      levels: [{ name: "标准", total: 800, desc: "有助理拍摄 + 一鱼多吃", breakdown: ["短视频", "朋友圈"] }],
      key_questions: ["人数不对就回去改"],
    }),
  }));
  await page.route("**/api/planner/write", route => {
    seen.posts += 1;
    route.fulfill({ contentType: "application/json", body: JSON.stringify({ task_id: taskId, status: "running", estimated_seconds: 50, page_id: "planner" }) });
  });
  await page.route(`**/api/tasks/${taskId}`, route => {
    seen.polls += 1;
    const current = state === "ok" && seen.polls >= 2 ? "ok" : state;
    seen.states.push(current);
    route.fulfill({ contentType: "application/json", body: JSON.stringify(task("planner.write", "planner", "planner", current, taskId, PLANNER_STAGES, plannerResult)) });
  });
}

async function submitPlanner(page) {
  await page.goto(`${BASE}/?page=planner`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForSelector("text=明天/下周/下月有什么活动?", { timeout: 12000 });
  await page.locator("textarea").first().fill("下周三在武汉给 200 个实体老板讲一天内容获客，有一个编导助理。");
  await page.getByRole("button", { name: /出三档目标/ }).click();
  await page.waitForSelector("text=标准", { timeout: 8000 });
  await page.getByText("标准").click();
}

async function runPlanner(browser, state, viewport) {
  return withPage(browser, "planner", state, viewport, async (page, seen) => {
    await installPlannerRoutes(page, seen, state);
    await submitPlanner(page);
    if (state === "slow") {
      await page.waitForSelector("text=写 6 模块方案", { timeout: 8000 });
      await page.waitForSelector("text=阶段时间线", { timeout: 8000 });
    } else if (state === "failed") {
      await page.waitForSelector("text=策划没跑成功", { timeout: 8000 });
      await page.waitForSelector("text=停在哪一步", { timeout: 8000 });
    } else {
      await page.waitForSelector("text=策划方案", { timeout: 10000 });
      await page.waitForSelector("text=活动前准备", { timeout: 10000 });
    }
    await page.screenshot({ path: `${SHOT_DIR}/t100_planner_${state}${viewport?.width === 390 ? "_390" : ""}.png`, fullPage: true });
  });
}

(async () => {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const results = [];
  try {
    results.push(await runWechat(browser, "slow", { width: 390, height: 900 }));
    results.push(await runWechat(browser, "failed"));
    results.push(await runWechat(browser, "ok"));
    results.push(await runVoice(browser, "slow"));
    results.push(await runVoice(browser, "failed", { width: 390, height: 900 }));
    results.push(await runVoice(browser, "ok"));
    results.push(await runPlanner(browser, "slow"));
    results.push(await runPlanner(browser, "failed"));
    results.push(await runPlanner(browser, "ok", { width: 390, height: 900 }));
  } finally {
    await browser.close();
  }
  console.log(JSON.stringify({ ok: true, results }, null, 2));
})().catch(err => {
  console.error(err);
  process.exit(1);
});
