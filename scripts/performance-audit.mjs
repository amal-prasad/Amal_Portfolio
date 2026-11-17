import { chromium, devices } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";

const label = process.argv[2] ?? "after";
const output = `docs/performance/${label}`;
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
const results = [];
try {
  for (const scenario of ["desktop", "mobile", "mobile-throttled"]) {
    const context = await browser.newContext(scenario === "desktop"
      ? { viewport: { width: 1440, height: 900 } }
      : { ...devices["Pixel 7"] });
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
    await cdp.send("Performance.enable");
    if (scenario === "mobile-throttled") {
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
      await cdp.send("Network.emulateNetworkConditions", {
        offline: false, latency: 100, downloadThroughput: 200_000, uploadThroughput: 93_750,
      });
    }
    let transferred = 0;
    const requests = [], errors = [];
    cdp.on("Network.loadingFinished", event => { transferred += event.encodedDataLength; });
    page.on("request", request => requests.push(request.url()));
    page.on("pageerror", error => errors.push(error.message));
    await page.addInitScript(() => {
      window.__audit = { longTasks: [], paints: [], shifts: [] };
      new PerformanceObserver(list => window.__audit.longTasks.push(...list.getEntries().map(e => e.duration))).observe({ type: "longtask", buffered: true });
      new PerformanceObserver(list => window.__audit.paints.push(...list.getEntries().map(e => ({ name: e.name, startTime: e.startTime })))).observe({ type: "paint", buffered: true });
      new PerformanceObserver(list => window.__audit.shifts.push(...list.getEntries().filter(e => !e.hadRecentInput).map(e => e.value))).observe({ type: "layout-shift", buffered: true });
    });
    await page.goto(process.env.PERF_URL ?? "http://localhost:3100", { waitUntil: "domcontentloaded" });
    await page.locator(".loader").waitFor({ state: "hidden", timeout: 30_000 });
    const readyMs = await page.evaluate(() => performance.now());
    // A fixed observation window captures eager media that outlives the loader.
    await page.waitForTimeout(Math.max(0, 7000 - readyMs));
    const startup = await page.evaluate(() => ({
      ...window.__audit,
      resources: performance.getEntriesByType("resource").map(r => ({ name: r.name, bytes: r.transferSize })),
    }));
    const startupBytes = transferred;
    const startupRequests = [...requests];
    await page.screenshot({ path: `${output}/${scenario}-hero.png` });
    const before = (await cdp.send("Performance.getMetrics")).metrics;
    const frameTimes = await page.evaluate(() => new Promise(resolve => {
      const deltas = [];
      let started = 0, previous = 0;
      const tick = now => {
        if (!started) started = previous = now;
        deltas.push(now - previous);
        previous = now;
        scrollTo(0, Math.min(1, (now - started) / 2400) * innerHeight * 1.5);
        if (now - started < 2400) requestAnimationFrame(tick);
        else resolve(deltas.slice(1));
      };
      requestAnimationFrame(tick);
    }));
    const after = (await cdp.send("Performance.getMetrics")).metrics;
    const metricDelta = name => after.find(m => m.name === name).value - before.find(m => m.name === name).value;
    await page.screenshot({ path: `${output}/${scenario}-about.png` });
    await page.locator("#work").evaluate(el => el.scrollIntoView({ block: "center" }));
    await page.locator('[data-glass-carousel="canvas"]').waitFor({ timeout: 30_000 });
    await page.waitForFunction(() => [...document.querySelectorAll("#work video")].some(v => !v.paused && v.currentTime > 0), { timeout: 30_000 });
    await page.screenshot({ path: `${output}/${scenario}-work.png` });
    await page.locator("#contact").evaluate(el => el.scrollIntoView({ block: "center" }));
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${output}/${scenario}-footer.png` });
    const sorted = [...frameTimes].sort((a, b) => a - b);
    const result = {
      scenario, readyMs: Math.round(readyMs), startupBytes,
      startupJsBytes: startup.resources.filter(r => r.name.endsWith(".js")).reduce((sum, r) => sum + r.bytes, 0),
      startupMediaRequests: startupRequests.filter(url => url.endsWith(".mp4")).length,
      startupFrameRequests: startupRequests.filter(url => /sequence\/frame-/.test(url)).length,
      longTasks: startup.longTasks.length,
      blockingMs: Math.round(startup.longTasks.reduce((sum, duration) => sum + Math.max(0, duration - 50), 0)),
      layoutShift: startup.shifts.reduce((sum, shift) => sum + shift, 0),
      paints: startup.paints,
      scroll: {
        frames: frameTimes.length, p95FrameMs: Math.round(sorted[Math.floor(sorted.length * 0.95)] * 10) / 10,
        framesOver34ms: frameTimes.filter(delta => delta > 34).length,
        layouts: metricDelta("LayoutCount"), layoutMs: Math.round(metricDelta("LayoutDuration") * 1000),
        scriptMs: Math.round(metricDelta("ScriptDuration") * 1000),
      }, errors,
    };
    results.push(result);
    console.log(JSON.stringify(result));
    await context.close();
  }
} finally {
  await writeFile(`${output}/metrics.json`, JSON.stringify(results, null, 2) + "\n");
  await browser.close();
}
