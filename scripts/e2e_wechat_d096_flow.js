const { chromium } = require("/Users/black.chen/.npm-global/lib/node_modules/playwright");

const APP = "http://127.0.0.1:8001/?page=wechat";
const PNG_1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
  "base64",
);
let allowExpectedHtml500 = false;

function baseWorkflow(overrides = {}) {
  return {
    step: "topic",
    topic: "日更一百条没火",
    titles: [],
    titleRound: 1,
    pickedTitle: "",
    outline: null,
    article: null,
    imagePlans: [],
    htmlResult: null,
    coverResult: null,
    pushResult: null,
    autoMode: false,
    skipImages: false,
    autoSteps: [],
    ...overrides,
  };
}

async function newPage(browser, errors, workflow) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 920 } });
  const page = await ctx.newPage();
  page.on("pageerror", e => errors.push("PAGEERROR: " + e.message));
  page.on("console", m => {
    const text = m.text();
    if (allowExpectedHtml500 && /Failed to load resource: the server responded with a status of 500/.test(text)) return;
    if (m.type() === "error") errors.push("CONSOLE: " + text);
  });
  await page.addInitScript((wf) => {
    localStorage.setItem("wf:wechat", JSON.stringify(wf));
    localStorage.removeItem("wechat:section_image:global_style");
  }, workflow);
  await page.route("**/media/fake-*.png", route => route.fulfill({ contentType: "image/png", body: PNG_1PX }));
  return { ctx, page };
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const errors = [];

  // A. Step 2: 再出 3 个必须把上一批标题带给后端避重.
  {
    const oldTitles = [
      { title: "日更一百条没火？实体老板先别卷数量", template: "反常识型", why: "old1" },
      { title: "实体老板日更一百条的血泪教训，第三条最扎心", template: "故事悬念型", why: "old2" },
      { title: "同样用AI做短视频，为什么他爆单你血亏？", template: "对比冲突型", why: "old3" },
    ];
    const { ctx, page } = await newPage(browser, errors, baseWorkflow({
      step: "titles",
      titles: oldTitles,
      titleRound: 1,
    }));
    let titlesBody = null;
    await page.route("**/api/wechat/titles", async route => {
      titlesBody = route.request().postDataJSON();
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          titles: [
            { title: "别再日更一百条，老板先补这块短板", template: "结论前置型", why: "new1" },
            { title: "播放量卡两位数，不是你不够勤奋", template: "反常识型", why: "new2" },
            { title: "实体老板越日更越焦虑，问题出在这", template: "情绪痛点型", why: "new3" },
          ],
        }),
      });
    });
    await page.goto(APP, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.getByRole("button", { name: /再出 3 个/ }).click();
    await page.waitForSelector("text=别再日更一百条", { timeout: 10000 });
    if (!titlesBody) throw new Error("Step 2 没有请求 /api/wechat/titles");
    if (titlesBody.round !== 2) throw new Error(`Step 2 round 应为 2, 实际 ${titlesBody.round}`);
    for (const t of oldTitles) {
      if (!titlesBody.avoid_titles.includes(t.title)) throw new Error("Step 2 avoid_titles 漏传旧标题: " + t.title);
    }
    await page.screenshot({ path: "/tmp/_ui_shots/d096_titles_regen.png", fullPage: true });
    await ctx.close();
  }

  // B. Step 5: 未选风格不生图；选风格后“一键生成 4 张”并发提交.
  {
    const imagePlans = [1, 2, 3, 4].map(i => ({
      section_hint: `段落 ${i}`,
      image_prompt: `原始画面 ${i}`,
      status: "pending",
      mmbiz_url: null,
      media_url: null,
    }));
    const { ctx, page } = await newPage(browser, errors, baseWorkflow({
      step: "images",
      pickedTitle: "D096 测试标题",
      article: { title: "D096 测试标题", content: "# D096\n\n正文", word_count: 20 },
      imagePlans,
    }));
    let restyleCount = 0;
    const sectionCalls = [];
    await page.route("**/api/wechat/restyle-prompts", async route => {
      restyleCount += 1;
      const body = route.request().postDataJSON();
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          style_id: body.style_id,
          prompts: body.prompts.map((p, i) => `纪实风画面 ${i + 1}: ${p}`),
        }),
      });
    });
    await page.route("**/api/wechat/section-image", async route => {
      sectionCalls.push(Date.now());
      const n = sectionCalls.length;
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ task_id: `fake-${n}`, status: "running", estimated_seconds: 45, page_id: "wechat" }),
      });
    });
    await page.route("**/api/tasks/fake-*", async route => {
      const id = route.request().url().split("/").pop();
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          id,
          status: "ok",
          result: {
            mmbiz_url: `http://mmbiz.qpic.cn/d096/${id}/0?from=appmsg`,
            media_url: `/media/${id}.png`,
            local_path: `/tmp/${id}.png`,
            elapsed_sec: 1,
          },
        }),
      });
    });
    await page.route("**/api/wechat/html", async route => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          raw_html_path: "/tmp/preview/d096_raw.html",
          wechat_html_path: "/tmp/preview/d096_wechat.html",
          meta_path: "/tmp/preview/d096_meta.json",
          raw_html: "<html><body><p>D096 raw preview</p></body></html>",
          wechat_html: "<section><p>D096 wechat preview</p></section>",
          title: "D096 测试标题",
          digest: "D096 摘要",
        }),
      });
    });
    await page.goto(APP, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForSelector("text=段间配图 · 0/4", { timeout: 10000 });
    await page.waitForTimeout(600);
    if (sectionCalls.length !== 0) throw new Error("Step 5 未选风格时不应自动提交生图");
    const gateBtn = page.getByRole("button", { name: "先选风格" }).first();
    if (!(await gateBtn.isDisabled())) throw new Error("Step 5 一键生成按钮未选风格时应禁用");
    await page.getByRole("button", { name: /纪实风/ }).click();
    await page.waitForFunction(() => document.body.innerText.includes("一键生成 4 张"), null, { timeout: 10000 });
    if (restyleCount !== 1) throw new Error(`Step 5 切风格应调用一次 restyle, 实际 ${restyleCount}`);
    await page.getByRole("button", { name: /一键生成 4 张/ }).click();
    await page.waitForFunction(() => window.__d096Done === true, null, { timeout: 1 }).catch(() => {});
    await page.waitForFunction(() => document.body.innerText.includes("段间配图 · 4/4"), null, { timeout: 15000 });
    if (sectionCalls.length !== 4) throw new Error(`Step 5 一键生成应提交 4 张, 实际 ${sectionCalls.length}`);
    const spread = Math.max(...sectionCalls) - Math.min(...sectionCalls);
    if (spread > 1000) throw new Error(`Step 5 一键生成不是并发提交, spread=${spread}ms`);
    await page.waitForSelector("text=一键重生 4 张", { timeout: 10000 });
    await page.getByRole("button", { name: /一键重生 4 张/ }).click();
    for (let tries = 0; tries < 20 && sectionCalls.length < 8; tries++) {
      await page.waitForTimeout(250);
    }
    if (sectionCalls.length !== 8) throw new Error(`Step 5 一键重生应再提交 4 张, 实际总请求 ${sectionCalls.length}`);
    const regenCalls = sectionCalls.slice(4);
    const regenSpread = Math.max(...regenCalls) - Math.min(...regenCalls);
    if (regenSpread > 1000) throw new Error(`Step 5 一键重生不是并发提交, spread=${regenSpread}ms`);
    await page.waitForFunction(() => document.body.innerText.includes("段间配图 · 4/4"), null, { timeout: 15000 });
    await page.screenshot({ path: "/tmp/_ui_shots/d097_images_regen_all.png", fullPage: true });
    await page.getByRole("button", { name: /拼 HTML/ }).click();
    await page.waitForSelector("text=排版好了", { timeout: 10000 });
    await page.screenshot({ path: "/tmp/_ui_shots/d096_images_html_success.png", fullPage: true });
    await ctx.close();
  }

  // C. Step 6: 后端 500 detail 要显示公众号排版错误, 不能显示“没匹配到已知模式”.
  {
    const donePlans = [1, 2, 3, 4].map(i => ({
      section_hint: `段落 ${i}`,
      image_prompt: `画面 ${i}`,
      status: "done",
      mmbiz_url: `http://mmbiz.qpic.cn/d096/${i}/0?from=appmsg`,
      media_url: `/media/fake-${i}.png`,
    }));
    const { ctx, page } = await newPage(browser, errors, baseWorkflow({
      step: "images",
      pickedTitle: "D096 错误测试",
      article: { title: "D096 错误测试", content: "# D096\n\n正文", word_count: 20 },
      imagePlans: donePlans,
    }));
    await page.route("**/api/wechat/html", async route => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({
          detail: "脚本失败 rc=1: python3 convert_to_wechat_markup.py\nstderr: ModuleNotFoundError: No module named 'bs4'",
        }),
      });
    });
    await page.goto(APP, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForSelector("text=段间配图 · 4/4", { timeout: 10000 });
    allowExpectedHtml500 = true;
    await page.getByRole("button", { name: /拼 HTML/ }).click();
    await page.waitForSelector("text=公众号排版环境没接上", { timeout: 10000 });
    allowExpectedHtml500 = false;
    if (await page.locator("text=没匹配到已知模式").count()) {
      throw new Error("Step 6 仍显示未知模式兜底");
    }
    await page.screenshot({ path: "/tmp/_ui_shots/d096_html_error_friendly.png", fullPage: true });
    await ctx.close();
  }

  if (errors.length) {
    console.log(errors.join("\n"));
    throw new Error(`console/page errors: ${errors.length}`);
  }
  await browser.close();
})().catch(async e => {
  console.error(e);
  process.exit(1);
});
