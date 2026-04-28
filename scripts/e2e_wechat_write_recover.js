const { chromium } = require("/Users/black.chen/.npm-global/lib/node_modules/playwright");

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];

  page.on("pageerror", e => errors.push("PAGEERROR: " + e.message));
  page.on("console", m => {
    if (m.type() === "error") errors.push("CONSOLE: " + m.text());
  });

  await page.addInitScript(() => {
    localStorage.setItem("wf:wechat", JSON.stringify({
      step: "write",
      topic: "最近日更一百条的风刮起来了",
      titles: [
        { title: "日更100条没火？实体老板先别卷数量", why: "测试恢复态" },
      ],
      pickedTitle: "日更100条没火？实体老板先别卷数量",
      outline: {
        opening: "测试恢复态",
        core_points: ["先跑通模板", "再复制放大"],
        business_bridge: "AI 内容中台",
        closing: "先赚到一块钱",
        estimated_words: 2500,
      },
      article: null,
      imagePlans: [],
      htmlResult: null,
      coverResult: null,
      pushResult: null,
      autoMode: false,
      skipImages: false,
      autoSteps: [],
    }));
  });

  await page.goto("http://127.0.0.1:8001/?page=wechat", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForSelector("text=日更100条没火？实体老板先别卷数量", { timeout: 15000 });
  await page.waitForSelector("text=2964 字", { timeout: 15000 });

  const stuck = await page.locator("text=长文 2000-3000 字,慢一点,质量优先").count();
  if (stuck > 0) throw new Error("Step 4 仍停在写长文动效");

  await page.screenshot({ path: "/tmp/_ui_shots/d095_wechat_write_recovered.png", fullPage: true });

  if (errors.length) {
    console.log(errors.join("\n"));
    throw new Error(`console/page errors: ${errors.length}`);
  }

  await browser.close();
})().catch(async e => {
  console.error(e);
  process.exit(1);
});
