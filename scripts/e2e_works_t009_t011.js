const { chromium } = require("/Users/black.chen/.npm-global/lib/node_modules/playwright");

const APP = process.env.APP || "http://127.0.0.1:8001/?page=works";

const now = Math.floor(Date.now() / 1000);
const baseWorks = [
  {
    id: 1, type: "text", source_skill: "wechat", title: "Today Work",
    created_at: now, status: "ready", final_text: "short preview",
    metadata: "{}", asset_status: "none", preview_available: false, download_available: false,
  },
  {
    id: 2, type: "image", source_skill: "wechat-section-image", title: "Missing Image",
    created_at: now, status: "ready", final_text: "", thumb_url: null, local_url: null,
    metadata: JSON.stringify({ filename: "missing.png" }),
    asset_status: "missing_file", preview_available: false, download_available: false,
  },
];

const details = {
  1: { ...baseWorks[0], final_text: "Today Work full body" },
  2: { ...baseWorks[1] },
  999: {
    id: 999, type: "text", source_skill: "wechat", title: "Old Analytics Work",
    created_at: now - 90 * 86400, status: "ready",
    final_text: "Old analytics full body outside current list",
    metadata: "{}", asset_status: "none", preview_available: false, download_available: false,
  },
};

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 920 } });
  const page = await ctx.newPage();
  const errors = [];
  let metricsPayload = null;
  let openedOldWork = false;

  page.on("pageerror", e => errors.push("PAGEERROR: " + e.message));
  page.on("console", msg => {
    if (msg.type() === "error") errors.push("CONSOLE: " + msg.text());
  });
  page.on("requestfailed", req => {
    errors.push(`REQUESTFAILED: ${req.method()} ${req.url()} ${req.failure()?.errorText || ""}`);
  });

  await page.route("**/api/works/sources", route => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ total: 2, by_type: { text: 1, image: 1 }, by_source: { wechat: 1, "wechat-section-image": 1 } }),
  }));
  await page.route("**/api/works/analytics", route => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({
      total_works_with_data: 1,
      total_metrics_records: 1,
      platform_totals: { douyin: { views: 1000, likes: 20, comments: 3, conversions: 2, count: 1 } },
      top_by_views: [{ work_id: 999, title: "Old Analytics Work", views: 1000, likes: 20, comments: 3, conversions: 2, platforms: ["douyin"] }],
      top_by_conversions: [{ work_id: 999, title: "Old Analytics Work", views: 1000, likes: 20, comments: 3, conversions: 2, platforms: ["douyin"] }],
    }),
  }));
  await page.route(/\/api\/works\/\d+\/metrics$/, async route => {
    if (route.request().method() === "POST") {
      metricsPayload = route.request().postDataJSON();
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ id: 11, ok: true }) });
      return;
    }
    await route.fulfill({ contentType: "application/json", body: JSON.stringify([]) });
  });
  await page.route(/\/api\/works\/\d+\/action$/, async route => {
    const id = Number(route.request().url().match(/\/api\/works\/(\d+)\/action/)?.[1]);
    const action = route.request().postDataJSON().action;
    const metadata = action === "clear" ? "{}" : JSON.stringify({ user_action: action, user_action_at: now });
    details[id] = { ...details[id], metadata };
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ ok: true, work_id: id, user_action: action, metadata, work: details[id] }),
    });
  });
  await page.route(/\/api\/works\/\d+$/, async route => {
    const id = Number(route.request().url().match(/\/api\/works\/(\d+)$/)?.[1]);
    if (id === 999) openedOldWork = true;
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(details[id]) });
  });
  await page.route(/\/api\/works\?/, route => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify(baseWorks),
  }));

  await page.goto(APP, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForSelector("text=Today Work", { timeout: 10000 });

  await page.getByText("Today Work").first().click();
  await page.waitForSelector("text=Today Work full body", { timeout: 10000 });
  await page.getByRole("button", { name: /留这版/ }).click();
  await page.waitForSelector("text=留这版 ✓", { timeout: 10000 });

  await page.getByRole("button", { name: /各平台数据/ }).click();
  await page.getByRole("button", { name: "录入" }).first().click();
  await page.getByPlaceholder("填 80").fill("80");
  const metricPost = page.waitForRequest(req => req.method() === "POST" && req.url().includes("/api/works/1/metrics"));
  await page.getByRole("button", { name: "保存" }).click();
  await metricPost;
  if (!metricsPayload) throw new Error("没有提交作品指标");
  if (metricsPayload.completion_rate !== 0.8) {
    throw new Error(`完播率应提交 0.8, 实际 ${metricsPayload.completion_rate}`);
  }

  await page.locator("button").filter({ hasText: "×" }).click();
  await page.getByText("📊 数据看板").click();
  await page.waitForSelector("text=Old Analytics Work", { timeout: 10000 });
  const oldRankRow = page.getByText("Old Analytics Work").first().locator("xpath=..");
  await oldRankRow.getByRole("button", { name: "看" }).click();
  for (let i = 0; i < 20 && !openedOldWork; i++) await page.waitForTimeout(100);
  if (!openedOldWork) throw new Error("数据看板没有按 id 拉取历史作品详情");
  await page.waitForSelector("text=作品详情 #999", { timeout: 10000 });

  await page.locator("button").filter({ hasText: "×" }).click();
  await page.locator("button").filter({ hasText: "🖼️ 图片" }).first().click();
  await page.waitForSelector("text=原图不在本机", { timeout: 10000 });
  await page.getByText("Missing Image").click();
  await page.waitForSelector("text=原图文件不在本机", { timeout: 10000 });

  await page.screenshot({ path: "/tmp/_ui_shots/t009_t011_works_regression.png", fullPage: true });

  if (errors.length) throw new Error(errors.join("\n"));
  await browser.close();
})().catch(async e => {
  console.error(e);
  process.exit(1);
});
