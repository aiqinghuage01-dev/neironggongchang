const { chromium } = require("/Users/black.chen/.npm-global/lib/node_modules/playwright");

const APP = process.env.APP || "http://127.0.0.1:8001/?page=wechat";
const MARKER = "QA编辑标记-T004-手动正文必须进入后续流程";
const PNG_1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
  "base64",
);

function baseWorkflow() {
  const title = "T004 手动编辑正文传播测试";
  return {
    step: "write",
    topic: "实体老板用AI做公众号内容",
    titles: [{ title, template: "测试", why: "测试" }],
    titleRound: 1,
    pickedTitle: title,
    outline: {
      opening: "开头",
      core_points: ["第一点", "第二点"],
      business_bridge: "业务桥接",
      closing: "结尾",
      estimated_words: 2200,
    },
    article: {
      title,
      content: "# T004 手动编辑正文传播测试\n\n原始第一段。\n\n原始第二段。\n\n原始第三段。\n\n原始第四段。\n\n原始第五段。\n\n原始第六段。",
      word_count: 80,
      self_check: {
        pass: true,
        six_principles: [{ name: "测试", pass: true }],
        six_dimensions: { a: 18, b: 18, c: 18, d: 18, e: 18, f: 18 },
        one_veto: { triggered: false },
        summary: "测试自检通过",
      },
      tokens: { write: 1, check: 1 },
    },
    imagePlans: [],
    htmlResult: null,
    coverResult: null,
    pushResult: null,
    autoMode: false,
    skipImages: false,
    autoSteps: [],
  };
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 920 } });
  const page = await ctx.newPage();
  const errors = [];
  let planBody = null;
  let htmlBody = null;
  const sectionCalls = [];

  page.on("pageerror", e => errors.push("PAGEERROR: " + e.message));
  page.on("console", m => {
    if (m.type() === "error") errors.push("CONSOLE: " + m.text());
  });

  await page.addInitScript((wf) => {
    localStorage.setItem("wf:wechat", JSON.stringify(wf));
    localStorage.removeItem("wechat:section_image:global_style");
  }, baseWorkflow());

  await page.route("**/api/wechat/skill-info", route => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ slug: "公众号文章", references: {} }),
  }));
  await page.route("**/media/fake-*.png", route => route.fulfill({ contentType: "image/png", body: PNG_1PX }));
  await page.route("**/api/wechat/plan-images", async route => {
    planBody = route.request().postDataJSON();
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        plans: [1, 2, 3, 4].map(i => ({
          section_hint: `第 ${i} 段`,
          image_prompt: `测试画面 ${i}`,
        })),
      }),
    });
  });
  await page.route("**/api/wechat/restyle-prompts", async route => {
    const body = route.request().postDataJSON();
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        style_id: body.style_id,
        prompts: body.prompts.map((p, i) => `真实感测试画面 ${i + 1}: ${p}`),
      }),
    });
  });
  await page.route("**/api/wechat/section-image", async route => {
    sectionCalls.push(route.request().postDataJSON());
    const n = sectionCalls.length;
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ task_id: `t004-img-${n}`, status: "running", estimated_seconds: 1, page_id: "wechat" }),
    });
  });
  await page.route("**/api/tasks/t004-img-*", async route => {
    const id = route.request().url().split("/").pop();
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        id,
        status: "ok",
        result: {
          mmbiz_url: `http://mmbiz.qpic.cn/sz_mmbiz_jpg/${id}/0?from=appmsg`,
          media_url: `/media/fake-${id}.png`,
          local_path: `/tmp/${id}.png`,
          elapsed_sec: 1,
        },
      }),
    });
  });
  await page.route("**/api/wechat/html", async route => {
    htmlBody = route.request().postDataJSON();
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        raw_html_path: "/tmp/preview/t004_raw.html",
        wechat_html_path: "/tmp/preview/t004_wechat.html",
        meta_path: "/tmp/preview/t004_meta.json",
        raw_html: `<html><body><p>${htmlBody.content_md}</p></body></html>`,
        wechat_html: `<section><p>${htmlBody.content_md}</p></section>`,
        title: htmlBody.title,
        digest: "T004 摘要",
      }),
    });
  });

  await page.goto(APP, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForSelector("text=T004 手动编辑正文传播测试", { timeout: 10000 });

  const textarea = page.locator("textarea").first();
  const original = await textarea.inputValue();
  const edited = `${original}\n\n【${MARKER}】`;
  await textarea.fill(edited);
  await page.getByRole("button", { name: /下一步.*段间配图/ }).click();
  await page.waitForSelector("text=段间配图 · 0/4", { timeout: 10000 });

  if (!planBody) throw new Error("没有请求 /api/wechat/plan-images");
  if (!String(planBody.content || "").includes(MARKER)) {
    throw new Error("plan-images 请求没有带 Step 4 手动编辑标记");
  }

  await page.getByRole("button", { name: /真实感照片/ }).click();
  await page.waitForSelector("text=一键生成 4 张", { timeout: 10000 });
  await page.getByRole("button", { name: /一键生成 4 张/ }).click();
  await page.waitForFunction(() => document.body.innerText.includes("段间配图 · 4/4"), null, { timeout: 15000 });
  if (sectionCalls.length !== 4) throw new Error(`应生成 4 张段间图, 实际 ${sectionCalls.length}`);

  await page.getByRole("button", { name: /拼 HTML/ }).click();
  await page.waitForSelector("text=排版好了", { timeout: 10000 });
  if (!htmlBody) throw new Error("没有请求 /api/wechat/html");
  if (!String(htmlBody.content_md || "").includes(MARKER)) {
    throw new Error("HTML 请求没有带 Step 4 手动编辑标记");
  }
  if ((htmlBody.section_images || []).length !== 4) {
    throw new Error(`HTML 请求应带 4 张段间图, 实际 ${(htmlBody.section_images || []).length}`);
  }
  await page.frameLocator('iframe[title="wechat preview"]').locator(`text=${MARKER}`).waitFor({ timeout: 10000 });
  await page.screenshot({ path: "/tmp/_ui_shots/t004_wechat_edit_propagation.png", fullPage: true });

  if (errors.length) {
    console.log(errors.join("\n"));
    throw new Error(`console/page errors: ${errors.length}`);
  }
  await browser.close();
})().catch(async e => {
  console.error(e);
  process.exit(1);
});
