// 浏览器跑关键 page 截图巡检 (run_e2e_full.sh Phase 3).
// 不模拟提交 (Phase 2 batch.py 已真烧), 只 goto + 等加载 + 截图 + 看 console error.
// 跑 ~30-60s, 验证前端无 React/JS 错误.
const { chromium } = require("/Users/black.chen/.npm-global/lib/node_modules/playwright");

const BASE = "http://127.0.0.1:8001";
const PAGES = [
  ["home", "首页/总部"],
  ["dreamina", "即梦 AIGC"],
  ["dhv5", "数字人 v5"],
  ["imagegen", "出图"],
  ["wechat", "公众号"],
  ["hotrewrite", "热点改写"],
  ["voicerewrite", "录音改写"],
  ["baokuan", "爆款改写"],
  ["touliu", "投流"],
  ["compliance", "合规审查"],
  ["planner", "内容策划"],
  ["moments", "朋友圈"],
  ["write", "写文案目录"],
  ["make", "造数字人 v2"],
  ["works", "作品库"],
  ["settings", "设置"],
];

(async () => {
  const SHOTS = process.argv[2] || "/tmp/_e2e_shots";
  const t0 = Date.now();
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();

  const results = [];

  for (const [pid, label] of PAGES) {
    const errors = [];
    page.removeAllListeners("pageerror");
    page.removeAllListeners("console");
    page.on("pageerror", e => errors.push("PAGE: " + e.message));
    page.on("console", m => { if (m.type() === "error") errors.push("CONS: " + m.text().slice(0, 200)); });

    const t = Date.now();
    let ok = true;
    try {
      await page.goto(`${BASE}/?page=${pid}`, { waitUntil: "domcontentloaded", timeout: 15000 });
      await page.waitForTimeout(1500);
    } catch (e) {
      errors.push("GOTO: " + e.message);
      ok = false;
    }
    const elapsed = ((Date.now() - t) / 1000).toFixed(1);
    const shot = `${SHOTS}/page_${pid}.png`;
    try { await page.screenshot({ path: shot, fullPage: false }); } catch {}

    if (errors.length) ok = false;

    const tag = ok ? "✅" : "❌";
    console.log(`${tag} ${pid.padEnd(15)} ${label.padEnd(15)} (${elapsed}s)  errors=${errors.length}`);
    if (errors.length) errors.slice(0, 3).forEach(e => console.log(`     ${e.slice(0, 200)}`));
    results.push({ pid, label, ok, errors: errors.length, elapsed });
  }

  await browser.close();

  const passed = results.filter(r => r.ok).length;
  const failed = results.filter(r => !r.ok);
  console.log("");
  console.log(`=== ${passed}/${results.length} pages OK (${((Date.now() - t0) / 1000).toFixed(1)}s 总耗时) ===`);
  if (failed.length) {
    console.log("FAIL:");
    failed.forEach(r => console.log(`  - ${r.pid} (${r.errors} errors)`));
  }
  process.exit(failed.length === 0 ? 0 : 1);
})();
