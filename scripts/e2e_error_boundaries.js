// scripts/e2e_error_boundaries.js — D-086 全站错误出口验收
//
// 5 个代表页 abort 闭环: 拦截 /api/* abort, 验证页面文本不含 "Failed to fetch" /
// "TypeError" / "NetworkError" / "Pydantic" 等英文技术词. 截图存
// /tmp/_ui_shots/d086_e2e_*.png. 0 console error / 0 page error (除白名单).
//
// 用法:
//   bash scripts/start_api.sh & bash scripts/start_web.sh &  # 起服务
//   node scripts/e2e_error_boundaries.js
//
// 退出码: 0 = 全过, 1 = 任一断言失败.
const { chromium } = require("/Users/black.chen/.npm-global/lib/node_modules/playwright");

const PAGES = [
  { name: "wechat",     url: "http://127.0.0.1:8001/?page=wechat" },
  { name: "make",       url: "http://127.0.0.1:8001/?page=make" },
  { name: "imagegen",   url: "http://127.0.0.1:8001/?page=imagegen" },
  { name: "dreamina",   url: "http://127.0.0.1:8001/?page=dreamina" },
  { name: "hotrewrite", url: "http://127.0.0.1:8001/?page=hotrewrite" },
];

// UI 不允许出现的英文技术词 (用户视角)
const FORBIDDEN_PATTERNS = [
  /failed to fetch/i,
  /typeerror/i,
  /networkerror/i,
  /pydantic/i,
  /traceback/i,
  /\bload failed\b/i,
];

// console 白名单 (故意 abort 会产生这些, 不算 UI 泄漏)
const CONSOLE_WHITELIST = [
  /Failed to load resource/i,                // route abort 标准副作用
  /net::ERR_FAILED/i,                         // 同上
  /Download the React DevTools/i,             // React 提示
  /aborterror|the operation was aborted/i,    // AbortController 标准
];

async function testPage(browser, { name, url }) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();

  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", m => {
    if (m.type() !== "error") return;
    const t = m.text();
    if (CONSOLE_WHITELIST.some(re => re.test(t))) return;
    consoleErrors.push(t);
  });
  page.on("pageerror", e => { pageErrors.push(e.message); });

  // 拦截所有 /api/* abort, 模拟 backend 不可达
  await page.route("**/api/**", route => route.abort("connectionrefused"));

  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
  } catch (e) {
    // goto 本身可能因 abort 而抛, 不是测试目标
  }
  await page.waitForTimeout(4500);  // 等 retry (500ms) + 渲染 + InlineError 显示

  // 截图
  const shotPath = `/tmp/_ui_shots/d086_e2e_${name}.png`;
  await page.screenshot({ path: shotPath, fullPage: true });

  // 抓页面所有可见文本
  const bodyText = await page.locator("body").textContent();
  const violations = [];
  for (const re of FORBIDDEN_PATTERNS) {
    if (re.test(bodyText)) {
      violations.push(`UI 文本含 ${re}`);
    }
  }

  await ctx.close();
  return {
    name, url, shotPath,
    consoleErrors,
    pageErrors,
    violations,
    bodyTextSample: bodyText.slice(0, 200).replace(/\s+/g, " "),
  };
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  console.log("=== D-086 全站错误出口验收 (5 页 abort 闭环) ===\n");
  const results = [];
  for (const p of PAGES) {
    process.stdout.write(`[${p.name}] testing... `);
    try {
      const r = await testPage(browser, p);
      results.push(r);
      const ok = !r.violations.length && !r.consoleErrors.length && !r.pageErrors.length;
      console.log(ok ? "✅" : "❌");
      if (!ok) {
        if (r.violations.length) console.log(`    UI 违规: ${r.violations.join(", ")}`);
        if (r.consoleErrors.length) console.log(`    console: ${r.consoleErrors.slice(0,3).join(" | ")}`);
        if (r.pageErrors.length) console.log(`    pageerror: ${r.pageErrors.slice(0,3).join(" | ")}`);
      }
    } catch (e) {
      console.log("❌ 异常:", e.message);
      results.push({ name: p.name, fatal: e.message });
    }
  }
  await browser.close();

  console.log("\n=== 总结 ===");
  const passed = results.filter(r => !r.fatal && !r.violations?.length && !r.consoleErrors?.length && !r.pageErrors?.length).length;
  console.log(`  ${passed}/${PAGES.length} 页通过`);
  console.log(`  截图存 /tmp/_ui_shots/d086_e2e_*.png`);

  process.exit(passed === PAGES.length ? 0 : 1);
})();
