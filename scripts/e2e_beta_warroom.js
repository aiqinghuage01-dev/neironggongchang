// T-075 beta 作战室最小浏览器验证。
// 依赖本地 web 服务 :8001；研发部状态与日志在 Playwright 内 mock，不依赖真实派工现场。
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

function loadPlaywright() {
  const candidates = [process.env.PLAYWRIGHT_PATH, "playwright", "@playwright/test"].filter(Boolean);
  for (const candidate of candidates) {
    try {
      return require(candidate);
    } catch (_) {
      // Try the next known install location.
    }
  }
  try {
    const globalRoot = execFileSync("npm", ["root", "-g"], { encoding: "utf8" }).trim();
    return require(path.join(globalRoot, "playwright"));
  } catch (_) {
    throw new Error("Playwright is not available. Install it or set PLAYWRIGHT_PATH.");
  }
}

const { chromium } = loadPlaywright();

const OUT_DIR = "/tmp/_ui_shots";
const URL = process.env.BETA_WEB_URL || "http://127.0.0.1:8001/?page=beta";

const forbidden = [
  /\/Users/,
  /\/private/,
  /OpenClaw/i,
  /DeepSeek/i,
  /Opus/i,
  /\bLLM\b/i,
  /\bAPI\b/,
  /prompt/i,
  /tokens?/i,
  /credits?/i,
  /Downloads/i,
  /watcher/i,
  /daemon/i,
  /provider/i,
  /submit_id/i,
  /Bearer/i,
  /Authorization/i,
  /x-api-key/i,
  /\bsk-[A-Za-z0-9_-]{8,}/i,
  /\/Volumes/i,
  /\/home/i,
  /~\/Desktop/i,
  /\b127\.0\.0\.1:3456\b/,
  /\b(?:404|500|502|503|504)\b/,
  /有人在跟/,
];

const statusPayload = {
  project: "neironggongchang",
  time: "2026-04-30 18:20:00",
  launch: {
    monitor: { running: true },
    dispatcher: { running: true },
    dashboard: { running: true },
  },
  counts: { queued: 2, claimed: 2, done: 12, blocked: 1 },
  slots: [
    {
      slot_id: "controller",
      agent_name: "NRG 总控",
      role: "controller",
      status: "running",
      latest_commit: "abc1234 fix: repair dashboard",
      task: {
        id: "T-072",
        title: "研发部状态面板显示总控活动",
        status: "claimed",
        claimed_by: "NRG 总控",
      },
    },
    {
      slot_id: "content-dev",
      agent_name: "NRG 内容开发自动",
      role: "content",
      status: "running",
      log: "/Users/black.chen/Desktop/nrg-agent-queue/logs/T-075_content-dev.log",
      task: {
        id: "T-075",
        title: "科技与狠活页面升级为研发部作战室 /Users/black.chen/Desktop/x prompt tokens 500",
        status: "claimed",
        claimed_by: "NRG 内容开发自动",
      },
    },
    {
      slot_id: "qa",
      agent_name: "NRG QA 自动",
      role: "qa",
      status: "idle",
      task: null,
    },
  ],
  tasks: [
    {
      id: "T-075",
      role: "content",
      status: "claimed",
      title: "科技与狠活页面升级为研发部作战室 /Users/black.chen/Desktop/x prompt tokens 500",
      claimed_by: "NRG 内容开发自动",
      commit: "",
      report: "",
    },
    {
      id: "T-076",
      role: "qa",
      status: "queued",
      title: "T-075 作战室真实浏览器 QA",
      claimed_by: "",
      commit: "",
      report: "",
    },
    {
      id: "T-046",
      role: "content",
      status: "done",
      title: "全站内容生产区体验优化第一轮",
      claimed_by: "NRG 内容开发自动",
      commit: "e4780eccb44d12f790b94459796dcf5cdb48db32",
      report: "docs/agent-handoff/DEV_CONTENT_T046_SITE_OPT_20260430.md",
    },
  ],
  events: [
    { time: "2026-04-30T18:00:11+0800", event: "added", task_id: "T-075", role: "content", title: "科技与狠活页面升级为研发部作战室" },
    { time: "2026-04-30T18:00:17+0800", event: "claimed", task_id: "T-075", role: "content", agent: "NRG 内容开发自动" },
    { time: "2026-04-30T18:00:17+0800", event: "dispatched", task_id: "T-075", agent: "NRG 内容开发自动", log: "/Users/black.chen/Desktop/nrg-agent-queue/logs/T-075_content-dev.log" },
    { time: "2026-04-30T18:10:00+0800", event: "blocked", task_id: "T-060", agent: "NRG QA 自动", title: "provider timeout 500" },
  ],
  logs: [
    {
      name: "T-075_content-dev_2026-04-30T18_00_17_0800.log",
      path: "/Users/black.chen/Desktop/nrg-agent-queue/logs/T-075_content-dev_2026-04-30T18_00_17_0800.log",
      size: 24192,
      mtime: "2026-04-30 18:18:00",
    },
  ],
};

const logText = `
/Users/black.chen/Desktop/nrg-worktrees/content-dev/web/factory-beta.jsx
/Volumes/External/project/file.mov
~/Desktop/nrg-worktrees/content-dev
/home/runner/work/app
Authorization: Bearer sk-test12345678901234567890 x-api-key=abc123456789012345
127.0.0.1:3456 localhost:8765
OpenClaw DeepSeek Opus LLM API prompt tokens credits Downloads watcher daemon provider submit_id 500
T-075 content work finished with screenshot
`;

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 920 } });
  const page = await ctx.newPage();

  const consoleErrors = [];
  const pageErrors = [];
  const requestFailed = [];
  const httpErrors = [];

  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => pageErrors.push(err.message));
  page.on("requestfailed", (req) => requestFailed.push(`${req.failure()?.errorText || "failed"} ${req.url()}`));
  page.on("response", (res) => {
    if (res.status() >= 400) httpErrors.push(`${res.status()} ${res.url()}`);
  });

  await page.route("**/favicon.ico", (route) => route.fulfill({ status: 204, body: "" }));
  await page.route("**/api/status", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(statusPayload),
  }));
  await page.route("**/api/log?**", (route) => route.fulfill({
    status: 200,
    contentType: "text/plain; charset=utf-8",
    body: logText,
  }));
  await page.route("**/api/stats/home", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ sidebar_counts: {} }),
  }));
  await page.route("**/api/tasks?limit=30", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ tasks: [] }),
  }));

  await page.goto(URL, { waitUntil: "networkidle", timeout: 20000 });
  await page.waitForSelector("text=研发部作战室", { timeout: 10000 });
  await page.waitForSelector("text=NRG 内容开发自动", { timeout: 10000 });
  await page.waitForSelector("text=T-075", { timeout: 10000 });
  await page.waitForSelector("text=研发现场", { timeout: 10000 });
  await page.waitForSelector("text=日志与代码证据", { timeout: 10000 });
  await page.locator("text=看日志摘要").first().click();
  await page.waitForSelector("text=T-075 content work finished", { timeout: 10000 });

  const visibleText = await page.locator("body").innerText();
  const violations = forbidden.filter((re) => re.test(visibleText)).map((re) => String(re));
  const shotPath = `${OUT_DIR}/t075_beta_warroom.png`;
  await page.screenshot({ path: shotPath, fullPage: true });

  const summary = {
    url: URL,
    shotPath,
    violations,
    consoleErrors,
    pageErrors,
    requestFailed,
    httpErrors,
    sample: visibleText.slice(0, 800).replace(/\s+/g, " "),
  };
  fs.writeFileSync(`${OUT_DIR}/t075_beta_warroom_summary.json`, JSON.stringify(summary, null, 2));

  await browser.close();
  const ok = violations.length === 0
    && consoleErrors.length === 0
    && pageErrors.length === 0
    && requestFailed.length === 0
    && httpErrors.length === 0;
  if (!ok) {
    console.error(JSON.stringify(summary, null, 2));
    process.exit(1);
  }
  console.log(JSON.stringify(summary, null, 2));
})();
