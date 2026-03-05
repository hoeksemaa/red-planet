#!/usr/bin/env node
/**
 * Load time benchmark across simulated network conditions.
 *
 * Usage:
 *   node scripts/bench-load.cjs [url] [runs] [name]
 *   node scripts/bench-load.cjs http://localhost:4173 3 "baseline"
 *   node scripts/bench-load.cjs http://localhost:4173 3 "after-defer"
 *
 * First time setup:
 *   npm install -D playwright
 *   npx playwright install chromium
 *
 * What it measures:
 *   domContentLoadedEventEnd — the moment the browser finishes downloading and
 *   executing all render-blocking scripts (i.e. Cesium.js). Nothing visible can
 *   render before this fires, so it's the dominant bottleneck on cold load.
 *
 *   Per-run resource timing is saved to JSON for deeper analysis.
 *
 * Results saved to: perf-results-<name>-<timestamp>.json
 */

const { chromium } = require('playwright');
const fs = require('fs');

const URL  = process.argv[2] ?? 'http://localhost:5173';
const RUNS = parseInt(process.argv[3] ?? '3', 10);
const NAME = process.argv[4] ?? null;

// Network profiles — downloadThroughput / uploadThroughput in bytes/sec, latency in ms.
// -1 means unlimited (no throttle).
const PROFILES = [
  { name: 'Unthrottled', download:            -1, upload:            -1, latency:   0 },
  { name: 'Fast WiFi',   download: 30_000_000 / 8, upload: 15_000_000 / 8, latency:   5 },
  { name: '4G LTE',      download:  4_000_000 / 8, upload:  3_000_000 / 8, latency:  20 },
  { name: 'Fast 3G',     download:  1_500_000 / 8, upload:    750_000 / 8, latency:  40 },
  { name: 'Slow 3G',     download:    500_000 / 8, upload:    500_000 / 8, latency: 400 },
];

// Injected before any app code runs.
// Waits for DOMContentLoaded (fires after all render-blocking scripts finish),
// then captures Navigation Timing + Resource Timing. No WebGL required.
const TIMING_SCRIPT = `
  (function () {
    document.addEventListener('DOMContentLoaded', function () {
      // One tick so domContentLoadedEventEnd is finalised.
      setTimeout(function () {
        var nav = performance.getEntriesByType('navigation')[0];
        var res = performance.getEntriesByType('resource');
        window.__bench = {
          ttDCL: Math.round(nav.domContentLoadedEventEnd),
          ttInteractive: Math.round(nav.domInteractive),
          resources: res.map(function (r) {
            return {
              name:  r.name.split('/').pop().split('?')[0].substring(0, 50),
              start: Math.round(r.startTime),
              dur:   Math.round(r.duration),
              bytes: r.transferSize || 0,
            };
          }),
        };
      }, 0);
    });
  })();
`;

async function runOnce(browser, profile) {
  // Fresh context per run = empty HTTP cache, no cookies, no service worker.
  const ctx  = await browser.newContext();
  const page = await ctx.newPage();
  const cdp  = await ctx.newCDPSession(page);

  // Surface JS errors so FAILs are diagnosable.
  page.on('pageerror', err => process.stderr.write(`[page error] ${err.message}\n`));

  try {
    await cdp.send('Network.enable');
    await cdp.send('Network.clearBrowserCache');
    await cdp.send('Network.emulateNetworkConditions', {
      offline:             false,
      downloadThroughput:  profile.download,
      uploadThroughput:    profile.upload,
      latency:             profile.latency,
    });

    await page.addInitScript(TIMING_SCRIPT);

    // 'commit' resolves as soon as navigation commits (response headers received).
    // The page continues loading in the background while we poll for __bench.
    await page.goto(URL, { waitUntil: 'commit', timeout: 90_000 });

    // 90s ceiling — even Slow 3G + 6.1 MB Cesium.js should land well within that.
    await page.waitForFunction(() => window.__bench !== undefined, {
      timeout: 90_000,
    });

    const bench = await page.evaluate(() => window.__bench);

    // Globe-ready: set by renderer.ts (perf measurement) when Cesium's
    // tileLoadProgressEvent hits 0 — i.e. the actual globe is visible.
    // Requires SwiftShader WebGL to process tiles; may time out on slow profiles.
    let ttGlobeReady = null;
    try {
      await page.waitForFunction(() => window.__globeReady !== undefined, {
        timeout: 120_000,
      });
      ttGlobeReady = await page.evaluate(() => Math.round(window.__globeReady));
    } catch (_) {
      // timeout — connection too slow for tiles to finish within limit
    }

    return { ...bench, ttGlobeReady };
  } finally {
    await ctx.close();
  }
}

function avg(arr) { return arr.reduce((a, b) => a + b, 0) / arr.length; }

// 1 block per second, max 30 blocks.
function bar(ms) {
  return '█'.repeat(Math.min(30, Math.max(1, Math.round(ms / 1000))));
}

function fmt(ms) {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
}

async function main() {
  console.log(`\nBenchmarking: ${URL}${NAME ? `  [${NAME}]` : ''}`);
  console.log(`${RUNS} run(s) per profile — fresh cache each run`);
  console.log(`Metrics: domContentLoadedEventEnd + ttGlobeReady (time until Cesium tiles finish)\n`);

  // SwiftShader flags avoid console noise from Cesium trying to init WebGL in the
  // background — they're not required for our DOMContentLoaded measurement.
  const browser = await chromium.launch({
    args: [
      '--headless=old',
      '--enable-webgl',
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--ignore-gpu-blocklist',
      '--disable-gpu-sandbox',
    ],
  });

  const results = [];

  for (const profile of PROFILES) {
    process.stdout.write(`  ${profile.name.padEnd(13)}`);
    const times      = [];
    const globeTimes = [];
    let lastBench    = null;

    for (let i = 0; i < RUNS; i++) {
      try {
        const bench = await runOnce(browser, profile);
        times.push(bench.ttDCL);
        globeTimes.push(bench.ttGlobeReady);
        lastBench = bench;
        const globeStr = bench.ttGlobeReady != null ? `/${fmt(bench.ttGlobeReady)}` : '/--';
        process.stdout.write(`  ${fmt(bench.ttDCL)}${globeStr}`);
      } catch (e) {
        times.push(null);
        globeTimes.push(null);
        process.stdout.write(`  FAIL`);
      }
    }

    const valid      = times.filter(t => t !== null);
    const validGlobe = globeTimes.filter(t => t !== null);
    const mean       = valid.length      ? avg(valid)      : null;
    const meanGlobe  = validGlobe.length ? avg(validGlobe) : null;
    const avgStr     = mean      != null ? `${fmt(mean)} DCL`       : 'FAIL';
    const avgGlobe   = meanGlobe != null ? `  ${fmt(meanGlobe)} globe` : '';
    console.log(`   → ${avgStr}${avgGlobe}`);
    results.push({ profile: profile.name, times, avg: mean, globeTimes, avgGlobe: meanGlobe, lastBench });
  }

  await browser.close();

  // ── Summary ──────────────────────────────────────────────────────────────
  console.log('\n' + '─'.repeat(72));
  console.log('Profile         DCL          GlobeReady   (bar = globe, 1 block/s)');
  console.log('─'.repeat(72));
  for (const r of results) {
    const dclStr   = r.avg      != null ? fmt(r.avg)      : 'FAIL';
    const globeStr = r.avgGlobe != null ? fmt(r.avgGlobe) : '--';
    const chart    = r.avgGlobe != null ? bar(r.avgGlobe) : '';
    console.log(`${r.profile.padEnd(16)}${dclStr.padEnd(13)}${globeStr.padEnd(13)}${chart}`);
  }
  console.log('─'.repeat(72));

  // ── Resource breakdown (last Unthrottled run) ─────────────────────────
  const unthrottled = results[0];
  if (unthrottled?.lastBench?.resources?.length) {
    console.log('\nResource timing (Unthrottled, last run — slowest 10):');
    const top10 = [...unthrottled.lastBench.resources]
      .sort((a, b) => b.dur - a.dur)
      .slice(0, 10);
    for (const r of top10) {
      const kb = r.bytes ? ` (${Math.round(r.bytes / 1024)}KB)` : '';
      console.log(`  ${r.name.padEnd(45)} +${String(r.start).padStart(5)}ms  ${String(r.dur).padStart(5)}ms${kb}`);
    }
  }

  // ── Save results ─────────────────────────────────────────────────────────
  const slug = NAME ? `${NAME.replace(/\s+/g, '-')}-` : '';
  const filename = `perf-results/${slug}${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  fs.mkdirSync('perf-results', { recursive: true });
  const output = {
    url:       URL,
    runs:      RUNS,
    name:      NAME,
    metrics:   ['domContentLoadedEventEnd', 'ttGlobeReady'],
    timestamp: new Date().toISOString(),
    results:   results.map(r => ({
      profile:    r.profile,
      times:      r.times,
      avg:        r.avg,
      globeTimes: r.globeTimes,
      avgGlobe:   r.avgGlobe,
      resources:  r.lastBench?.resources ?? null,
    })),
  };
  fs.writeFileSync(filename, JSON.stringify(output, null, 2));
  console.log(`\nSaved → ${filename}`);
}

main().catch(e => { console.error(e); process.exit(1); });
