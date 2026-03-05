// Usage: node scripts/bench.js [runs] [url]
//   npm run dev must be running first
//   Example: node scripts/bench.js 5 http://localhost:5173

import { chromium } from 'playwright';

const RUNS = parseInt(process.argv[2]) || 3;
const URL  = process.argv[3] ?? 'http://localhost:5173';

const kb = bytes => `${Math.round(bytes / 1024)}kb`;
const ms = n => `${Math.round(n)}ms`;
const pad = (s, n) => String(s).padEnd(n);

async function run(browser, i) {
  const ctx  = await browser.newContext();
  const page = await ctx.newPage();

  await page.goto(URL, { waitUntil: 'load', timeout: 30_000 });

  const data = await page.evaluate(() => {
    const [nav] = performance.getEntriesByType('navigation');
    const fcp   = performance.getEntriesByType('paint')
                    .find(e => e.name === 'first-contentful-paint');

    const resources = performance.getEntriesByType('resource').map(r => ({
      name:     r.name.replace(location.origin, ''),
      type:     r.initiatorType,
      duration: Math.round(r.duration),
      size:     r.transferSize,         // 0 = cached; decodedBodySize for true size
      decoded:  r.decodedBodySize,
    }));

    return {
      ttfb:      Math.round(nav.responseStart - nav.requestStart),
      fcp:       fcp ? Math.round(fcp.startTime) : null,
      load:      Math.round(nav.loadEventEnd - nav.startTime),
      resources,
    };
  });

  console.log(`  run ${i + 1}: ttfb=${ms(data.ttfb)}  fcp=${data.fcp ? ms(data.fcp) : '?'}  load=${ms(data.load)}`);
  await ctx.close();
  return data;
}

function stat(vals) {
  const sorted = [...vals].sort((a, b) => a - b);
  const avg = Math.round(vals.reduce((s, v) => s + v, 0) / vals.length);
  return { min: sorted[0], avg, max: sorted.at(-1) };
}

function printBreakdown(resources) {
  // ── by type ───────────────────────────────────────────────────────────────
  const byType = {};
  for (const r of resources) {
    const t = byType[r.type] ??= { count: 0, totalMs: 0, totalKb: 0 };
    t.count++;
    t.totalMs += r.duration;
    t.totalKb  += r.decoded;
  }
  console.log('\n── by resource type ─────────────────────────────────────────');
  console.log(pad('type', 12) + pad('count', 8) + pad('total time', 14) + 'decoded size');
  for (const [type, t] of Object.entries(byType).sort((a, b) => b[1].totalMs - a[1].totalMs)) {
    console.log(pad(type, 12) + pad(t.count, 8) + pad(ms(t.totalMs), 14) + kb(t.totalKb));
  }

  // ── top 10 slowest ────────────────────────────────────────────────────────
  const slowest = [...resources].sort((a, b) => b.duration - a.duration).slice(0, 10);
  console.log('\n── top 10 slowest resources ─────────────────────────────────');
  console.log(pad('time', 8) + pad('size', 10) + 'resource');
  for (const r of slowest) {
    const name = r.name.length > 60 ? '…' + r.name.slice(-59) : r.name;
    console.log(pad(ms(r.duration), 8) + pad(kb(r.decoded), 10) + name);
  }

  // ── top 10 heaviest ───────────────────────────────────────────────────────
  const heaviest = [...resources].sort((a, b) => b.decoded - a.decoded).slice(0, 10);
  console.log('\n── top 10 heaviest resources (decoded) ──────────────────────');
  console.log(pad('size', 10) + pad('time', 8) + 'resource');
  for (const r of heaviest) {
    const name = r.name.length > 60 ? '…' + r.name.slice(-59) : r.name;
    console.log(pad(kb(r.decoded), 10) + pad(ms(r.duration), 8) + name);
  }
}

(async () => {
  console.log(`\nbenchmarking ${URL}  (${RUNS} runs, cold cache each)\n`);
  const browser = await chromium.launch();
  const results = [];

  for (let i = 0; i < RUNS; i++) {
    results.push(await run(browser, i));
  }

  await browser.close();

  // Use last run for breakdown (Vite warm, representative)
  const last = results.at(-1);

  const ttfbs = results.map(r => r.ttfb);
  const fcps  = results.map(r => r.fcp).filter(Boolean);
  const loads = results.map(r => r.load);

  console.log('\n── summary ──────────────────────────────────────────────────');
  console.log(`ttfb  min=${stat(ttfbs).min}ms  avg=${stat(ttfbs).avg}ms  max=${stat(ttfbs).max}ms`);
  if (fcps.length) {
    console.log(`fcp   min=${stat(fcps).min}ms  avg=${stat(fcps).avg}ms  max=${stat(fcps).max}ms`);
  }
  console.log(`load  min=${stat(loads).min}ms  avg=${stat(loads).avg}ms  max=${stat(loads).max}ms`);

  printBreakdown(last.resources);
  console.log('─────────────────────────────────────────────────────────────\n');
})();
