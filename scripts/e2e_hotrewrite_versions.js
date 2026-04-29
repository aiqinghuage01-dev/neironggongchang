const { chromium } = require("/Users/black.chen/.npm-global/lib/node_modules/playwright");

const APP = "http://127.0.0.1:8001/?page=hotrewrite";

function workflow() {
  return {
    step: "angles",
    hotspot: "本地餐饮老板直播间突然爆单, 复盘只改了三句话",
    analyze: {
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
    },
    pickedAngle: null,
    script: null,
    versions: [],
    activeVersionIdx: 0,
    taskId: null,
  };
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const page = await ctx.newPage();
  const errors = [];
  let writeBody = null;

  page.on("pageerror", e => errors.push("PAGEERROR: " + e.message));
  page.on("console", m => { if (m.type() === "error") errors.push("CONSOLE: " + m.text()); });
  await page.addInitScript((wf) => {
    localStorage.setItem("wf:hotrewrite", JSON.stringify(wf));
    localStorage.removeItem("from_make_anchor");
  }, workflow());

  await page.route("**/api/hotrewrite/write", route => {
    writeBody = route.request().postDataJSON();
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        task_id: "d101-task",
        status: "running",
        estimated_seconds: 180,
        page_id: "hotrewrite",
        version_count: 4,
      }),
    });
  });
  await page.route("**/api/tasks/d101-task", route => {
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        id: "d101-task",
        status: "ok",
        result: {
          content: "第一版正文 pure v1",
          word_count: 101,
          self_check: { pass: true, six_dimensions: { "开场抓取力": 18 }, one_veto: { triggered: false }, summary: "ok" },
          versions: [
            { content: "第一版正文 pure v1", word_count: 101, self_check: { pass: true, six_dimensions: { "开场抓取力": 18 }, one_veto: { triggered: false }, summary: "ok" }, mode_label: "纯改写 V1 · 换皮版", tokens: { write: 1, check: 1 } },
            { content: "第二版正文 pure v2", word_count: 102, self_check: { pass: true, six_dimensions: { "开场抓取力": 19 }, one_veto: { triggered: false }, summary: "ok" }, mode_label: "纯改写 V2 · 狠劲版", tokens: { write: 1, check: 1 } },
            { content: "第三版正文 biz v3", word_count: 103, self_check: { pass: true, six_dimensions: { "开场抓取力": 17 }, one_veto: { triggered: false }, summary: "ok" }, mode_label: "结合业务 V3 · 翻转版", tokens: { write: 1, check: 1 } },
            { content: "第四版正文 biz v4", word_count: 104, self_check: { pass: true, six_dimensions: { "开场抓取力": 18 }, one_veto: { triggered: false }, summary: "ok" }, mode_label: "结合业务 V4 · 圈人版", tokens: { write: 1, check: 1 } },
          ],
        },
      }),
    });
  });

  await page.goto(APP, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForSelector("text=本次会出 4 篇", { timeout: 10000 });
  await page.getByText("纯改写", { exact: true }).click();
  await page.waitForSelector("text=本次会出 2 篇", { timeout: 10000 });
  await page.getByText("纯改写", { exact: true }).click();
  await page.waitForSelector("text=本次会出 4 篇", { timeout: 10000 });
  await page.getByText("三句话背后的信任链").click();
  await page.waitForSelector("text=4 版文案", { timeout: 10000 });

  if (!writeBody) throw new Error("未提交 /api/hotrewrite/write");
  if (!writeBody.modes || !writeBody.modes.with_biz || !writeBody.modes.pure_rewrite) {
    throw new Error("modes 未传到后端: " + JSON.stringify(writeBody));
  }

  const text1 = await page.locator("textarea").inputValue();
  if (!text1.includes("第一版正文")) throw new Error("默认未显示第一版");
  await page.getByRole("button", { name: /第 2 版/ }).last().click();
  const text2 = await page.locator("textarea").inputValue();
  if (!text2.includes("第二版正文")) throw new Error("点击第 2 版后正文没切换");

  await page.screenshot({ path: "/tmp/_ui_shots/d101_hotrewrite_versions.png", fullPage: true });
  await browser.close();
  if (errors.length) throw new Error(errors.join("\n"));
  console.log("ok d101 hotrewrite versions");
})();
