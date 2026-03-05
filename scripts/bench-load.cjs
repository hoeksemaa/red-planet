#!/usr/bin/env node
/**
 * Load time benchmark.
 *
 * Usage:
 *   node scripts/bench-load.cjs [url] [runs]
 *   node scripts/bench-load.cjs http://localhost:5173 5
 *
 * Metrics (per run):
 *   ttDCL            domContentLoadedEventEnd — Cesium.js is defer so it has already
 *                    parsed and executed by this point; DCL reflects only the tiny
 *                    app bundle parse time.
 *   ttCriticalReady  window.__criticalReady, set in renderer.ts after initCritical().
 *                    Cesium Viewer is constructed and imagery provider registered.
 *   ttFirstTileLoad  window.__firstTileLoad, set on first tileLoadProgressEvent→0.
 *                    First moment the user actually sees Mars tiles rendered.
 *   cesiumInitGap    ttCriticalReady - ttDCL: Viewer ctor + imagery provider add.
 *   tileLoadGap      ttFirstTileLoad - ttCriticalReady: network fetch + first render.
 *   totalGap         ttFirstTileLoad - ttDCL: full user-perceived load time.
 */

const { chromium } = require('playwright');

const URL  = process.argv[2] ?? 'http://localhost:5173';
const RUNS = parseInt(process.argv[3] ?? '3', 10);

const PROFILES = [
  { name: 'Unthrottled', download:            -1, upload:            -1, latency:  0 },
  { name: 'Fast WiFi',   download: 30_000_000/8,  upload: 15_000_000/8,  latency:  5 },
  { name: '4G LTE',      download:  4_000_000/8,  upload:  3_000_000/8,  latency: 20 },
  { name: 'Fast 3G',     download:  1_500_000/8,  upload:    750_000/8,  latency: 40 },
];

function fmt(ms) { return ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${ms}ms`; }
function avg(arr) { return Math.round(arr.reduce((a, b) => a + b, 0) / arr.length); }

async function runOnce(browser, profile) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const cdp  = await ctx.newCDPSession(page);

  // Surface errors so FAILs are diagnosable.
  page.on('pageerror', err => console.error(`    [page error] ${err.message}`));
  page.on('response',  res => {
    if (res.status() >= 400 && !res.url().includes('/_vercel/'))
      console.error(`    [${res.status()}] ${res.url()}`);
  });

  try {
    await cdp.send('Network.enable');
    await cdp.send('Network.clearBrowserCache');
    if (profile.download !== -1) {
      await cdp.send('Network.emulateNetworkConditions', {
        offline: false,
        downloadThroughput: profile.download,
        uploadThroughput:   profile.upload,
        latency:            profile.latency,
      });
    }

    await page.goto(URL, { waitUntil: 'commit', timeout: 30_000 });
    // null = no arg passed to page function; options go in the third slot
    await page.waitForFunction(() => window.__firstTileLoad !== undefined, null, { timeout: 30_000 });

    return await page.evaluate(() => {
      const nav       = performance.getEntriesByType('navigation')[0];
      const dcl       = Math.round(nav.domContentLoadedEventEnd);
      const crit      = Math.round(window.__criticalReady);
      const firstTile = Math.round(window.__firstTileLoad);
      return {
        ttDCL:          dcl,
        ttCriticalReady: crit,
        ttFirstTileLoad: firstTile,
        cesiumInitGap:  crit - dcl,
        tileLoadGap:    firstTile - crit,
        totalGap:       firstTile - dcl,
      };
    });
  } finally {
    await ctx.close();
  }
}

async function main() {
  console.log(`\nBenchmarking ${URL}  (${RUNS} runs/profile, fresh cache each run)\n`);
  console.log(`  ttDCL           — app bundle parsed; Cesium.js defer'd (already parsed by this point)`);
  console.log(`  ttCriticalReady — Viewer ctor + imagery provider registered`);
  console.log(`  ttFirstTileLoad — first tile burst complete; user sees Mars`);
  console.log(`  total           — ttFirstTileLoad - ttDCL (full user-perceived load)\n`);

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

  const summary = [];

  for (const profile of PROFILES) {
    console.log(`── ${profile.name} ${'─'.repeat(50 - profile.name.length)}`);
    const dcl = [], crit = [], firstTile = [], cesiumInit = [], tileLoad = [], total = [];

    for (let i = 0; i < RUNS; i++) {
      try {
        const r = await runOnce(browser, profile);
        dcl.push(r.ttDCL);
        crit.push(r.ttCriticalReady);
        firstTile.push(r.ttFirstTileLoad);
        cesiumInit.push(r.cesiumInitGap);
        tileLoad.push(r.tileLoadGap);
        total.push(r.totalGap);
        console.log(
          `   run ${i + 1}  ttDCL=${fmt(r.ttDCL).padEnd(9)} ttCriticalReady=${fmt(r.ttCriticalReady).padEnd(9)}` +
          ` ttFirstTileLoad=${fmt(r.ttFirstTileLoad).padEnd(9)} total=${fmt(r.totalGap)}`
        );
      } catch (e) {
        console.log(`   run ${i + 1}  FAIL — ${e.message.split('\n')[0]}`);
      }
    }

    if (firstTile.length) {
      const row = {
        profile:         profile.name,
        ttDCL:           avg(dcl),
        ttCriticalReady: avg(crit),
        ttFirstTileLoad: avg(firstTile),
        cesiumInitGap:   avg(cesiumInit),
        tileLoadGap:     avg(tileLoad),
        totalGap:        avg(total),
      };
      console.log(
        `   avg   ttDCL=${fmt(row.ttDCL).padEnd(9)} ttCriticalReady=${fmt(row.ttCriticalReady).padEnd(9)}` +
        ` ttFirstTileLoad=${fmt(row.ttFirstTileLoad).padEnd(9)} total=${fmt(row.totalGap)}`
      );
      summary.push(row);
    }
    console.log();
  }

  await browser.close();

  console.log(`${'─'.repeat(85)}`);
  console.log(`Profile          ttDCL      ttCriticalReady  ttFirstTileLoad  cesiumInit  tileLoad  total`);
  console.log(`${'─'.repeat(85)}`);
  for (const r of summary) {
    console.log(
      `${r.profile.padEnd(17)}` +
      `${fmt(r.ttDCL).padEnd(11)}` +
      `${fmt(r.ttCriticalReady).padEnd(17)}` +
      `${fmt(r.ttFirstTileLoad).padEnd(17)}` +
      `${fmt(r.cesiumInitGap).padEnd(12)}` +
      `${fmt(r.tileLoadGap).padEnd(10)}` +
      `${fmt(r.totalGap)}`
    );
  }
  console.log(`${'─'.repeat(85)}\n`);
}

main().catch(e => { console.error(e); process.exit(1); });
