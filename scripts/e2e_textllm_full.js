// D-082d 文案 pipeline 真烧 credits playwright 全闭环 (T4).
// 8 个 page 各跑: goto → fill textarea → click submit → 等 LLM 出结果 → 截图 + Read.
// 用关键字模糊匹配 button (老板各 page 文案不一, 不绑死 selector).
// 跑 1 次 ~5-10min, 真烧 LLM tokens ~30K.

const { chromium } = require("/Users/black.chen/.npm-global/lib/node_modules/playwright");
const fs = require("fs");

const BASE = "http://127.0.0.1:8001";
const SHOTS = process.argv[2] || "/tmp/_e2e_textllm";
fs.mkdirSync(SHOTS, { recursive: true });

// 配置: 每条 pipeline 给 (page_id, 输入文本, submit 按钮关键字, 等待出现的关键字)
const PIPES = [
  {
    name: "热点改写",
    page: "hotrewrite",
    text: "测试 D-082d · 某 AI 创业公司估值缩水 90%, 内部数据被前员工曝光",
    submitTexts: ["开始拆解", "拆解", "开始", "分析"],
    expectTexts: ["角度", "切入", "视角", "拆解结果"],
    timeout_sec: 60,
  },
  {
    name: "录音改写",
    page: "voicerewrite",
    text: "测试 D-082d · 这是一段录音转写, 讲 AI 创业的 3 个误区, 第一个是过度技术化忽视用户需求, 第二个是团队配置失衡, 第三个是融资节奏没踩对.",
    submitTexts: ["提骨架", "切入角度", "提取", "提"],
    expectTexts: ["骨架", "角度", "改写后", "金句"],
    timeout_sec: 60,
  },
  {
    name: "爆款改写",
    page: "baokuan",
    text: "我做实体十年, 今年决定花 3 万块去学 AI. 周围朋友都说我疯了, 但我觉得这是十年来最值的投资. 因为我发现一个秘密: AI 不是用来取代人的, 是用来放大人的. 我儿子 15 岁, 在家自己用 AI 一个月做了 5 个小程序. 这种代差, 不是钱能买的.",
    submitTexts: ["分析", "解析", "开始", "出 4 版"],
    expectTexts: ["基因", "DNA", "钩子", "套路", "改写"],
    timeout_sec: 60,
  },
  {
    name: "投流文案",
    page: "ad",  // D-066 路由表里 投流文案 page id 是 ad 不是 touliu
    text: "测试 D-082d · AI 创业课, 5980 元, 老板速成班, 7 天学会用 AI 做内容获客",
    submitTexts: ["生成", "出 ", "提交", "产出"],
    expectTexts: ["条文案", "钩子", "投流", "复制", "条"],
    timeout_sec: 90,
  },
  {
    name: "内容策划",
    page: "planner",
    text: "周末在武汉做一场 AI 创业线下沙龙, 50 个老板参加, 想转化为 5980 元的 AI 实操课, 目标 5-10 单",
    submitTexts: ["出三档", "出 三档", "三档目标", "策划"],
    expectTexts: ["目标", "三档", "执行", "策划"],
    timeout_sec: 60,
  },
  {
    name: "合规审查",
    page: "compliance",
    text: "测试 D-082d · 这个课程绝对让你 30 天回本翻倍, 不学退款双倍赔! 100% 包教包会",
    submitTexts: ["开始", "审查", "提交", "扫"],
    expectTexts: ["违规", "高危", "合规", "改写", "保守"],
    timeout_sec: 90,
  },
  {
    name: "朋友圈衍生",
    page: "moments",
    text: "测试 D-082d · 老板心法 · 真正的复购来自体验",
    submitTexts: ["生成", "开始", "出 ", "衍生"],
    expectTexts: ["朋友圈", "衍生", "条", "复制"],
    timeout_sec: 60,
  },
  {
    name: "公众号 (titles)",
    page: "wechat",
    text: "测试 D-082d · 老板用 AI 帮儿子做信息学奥赛的真实经历",
    submitTexts: ["生成标题", "出标题", "出 3", "出 ", "下一步", "开始"],
    expectTexts: ["标题", "候选", "选标题", "选这个"],
    timeout_sec: 60,
  },
];

async function runPipe(page, pipe) {
  const errors = [];
  page.removeAllListeners("pageerror");
  page.removeAllListeners("console");
  page.on("pageerror", e => errors.push("PAGE: " + e.message.slice(0, 200)));
  page.on("console", m => { if (m.type() === "error") errors.push("CONS: " + m.text().slice(0, 200)); });

  const t0 = Date.now();
  const elapsed = () => ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n[${pipe.name}] page=${pipe.page} ── 开始`);

  try {
    await page.goto(`${BASE}/?page=${pipe.page}`, { waitUntil: "networkidle", timeout: 15000 });
  } catch (e) {
    console.log(`  ❌ goto 失败: ${e.message.slice(0, 150)}`);
    return { ok: false, name: pipe.name, page: pipe.page, reason: "goto fail", errors };
  }
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${SHOTS}/${pipe.page}_01_default.png`, fullPage: true });

  // 找 textarea — 用第一个 visible textarea
  const ta = page.locator("textarea").first();
  try {
    await ta.waitFor({ timeout: 5000 });
    await ta.fill(pipe.text);
  } catch (e) {
    console.log(`  ❌ textarea 找不到: ${e.message.slice(0, 100)}`);
    return { ok: false, name: pipe.name, page: pipe.page, reason: "no textarea", errors };
  }
  await page.screenshot({ path: `${SHOTS}/${pipe.page}_02_filled.png`, fullPage: true });

  // 找 submit button — 任一关键字匹配
  let clicked = false;
  for (const txt of pipe.submitTexts) {
    const btn = page.locator(`button`, { hasText: new RegExp(txt) }).first();
    const cnt = await btn.count().catch(() => 0);
    if (cnt) {
      try {
        await btn.click({ timeout: 3000 });
        console.log(`  [${elapsed()}s] 点了 button "${txt}"`);
        clicked = true;
        break;
      } catch {}
    }
  }
  if (!clicked) {
    console.log(`  ❌ 没找到 submit button (尝试: ${pipe.submitTexts.join(" / ")})`);
    return { ok: false, name: pipe.name, page: pipe.page, reason: "no submit btn", errors };
  }

  // 等 expect 关键字出现
  const deadline = Date.now() + pipe.timeout_sec * 1000;
  let result = false;
  let foundText = "";
  while (Date.now() < deadline) {
    await page.waitForTimeout(2000);
    for (const exp of pipe.expectTexts) {
      const cnt = await page.locator(`text=/${exp}/`).count().catch(() => 0);
      if (cnt > 0) {
        result = true;
        foundText = exp;
        break;
      }
    }
    if (result) break;
  }

  await page.screenshot({ path: `${SHOTS}/${pipe.page}_03_after.png`, fullPage: true });
  if (result) {
    console.log(`  ✅ [${elapsed()}s] 等到 "${foundText}" 出现, errors=${errors.length}`);
    return { ok: errors.length === 0, name: pipe.name, page: pipe.page, foundText, elapsed: elapsed(), errors };
  } else {
    console.log(`  ⏱ [${elapsed()}s] timeout (${pipe.timeout_sec}s) 没等到 ${pipe.expectTexts.join("|")}`);
    return { ok: false, name: pipe.name, page: pipe.page, reason: "timeout", elapsed: elapsed(), errors };
  }
}

(async () => {
  const t0 = Date.now();
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();

  const results = [];
  for (const pipe of PIPES) {
    try {
      const r = await runPipe(page, pipe);
      results.push(r);
    } catch (e) {
      console.log(`  ❌ uncaught: ${e.message.slice(0, 150)}`);
      results.push({ ok: false, name: pipe.name, page: pipe.page, reason: "uncaught: " + e.message.slice(0, 100) });
    }
  }

  await browser.close();

  const total = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n${"=".repeat(60)}`);
  console.log(`D-082d 8 文案 pipeline playwright 全闭环报告 (${total}s 总耗时)`);
  console.log("=".repeat(60));
  const passed = results.filter(r => r.ok).length;
  console.log(`✅ PASS: ${passed}/${results.length}`);
  for (const r of results) {
    const tag = r.ok ? "✅" : "❌";
    const detail = r.ok ? `${r.elapsed}s · 等到 "${r.foundText}"` : `${r.reason || "unknown"}`;
    console.log(`  ${tag} ${r.name.padEnd(18)} ${r.page.padEnd(15)} ${detail}`);
    if (r.errors && r.errors.length) {
      r.errors.slice(0, 2).forEach(e => console.log(`       ${e.slice(0, 150)}`));
    }
  }
  console.log("");
  console.log(`截图: ${SHOTS}/`);
  process.exit(passed === results.length ? 0 : 1);
})();
