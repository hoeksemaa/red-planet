const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  page.on('console', msg => console.log('PAGE:', msg.type(), msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

  await page.addInitScript(`
    window.__t0 = performance.now();
    console.log('init script fired');
    let seen = false;
    const obs = new MutationObserver(() => {
      const el = document.querySelector('.loading-screen');
      if (el) { seen = true; console.log('loading-screen appeared'); }
      if (seen && !el && window.__loadTime === undefined) {
        window.__loadTime = performance.now() - window.__t0;
        console.log('loading-screen gone, ms=' + window.__loadTime);
      }
    });
    document.addEventListener('DOMContentLoaded', () => {
      console.log('DOMContentLoaded');
      obs.observe(document.body, { childList: true, subtree: true });
    });
  `);

  await page.goto('http://localhost:4173', { waitUntil: 'commit' });
  console.log('goto returned');

  for (let i = 0; i < 60; i++) {
    await page.waitForTimeout(1000);
    const done = await page.evaluate(() => window.__loadTime !== undefined);
    if (done) { console.log('done at', i+1, 's'); break; }
    if (i % 5 === 4) {
      const info = await page.evaluate(() => ({
        hasLoadingScreen: !!document.querySelector('.loading-screen'),
        rootChildren: document.getElementById('root')?.children.length ?? 0,
        bodySnippet: document.body.innerHTML.substring(0, 150),
      }));
      console.log(i+1 + 's:', JSON.stringify(info));
    }
  }

  const final = await page.evaluate(() => ({
    loadTime: window.__loadTime,
    hasLoadingScreen: !!document.querySelector('.loading-screen'),
  }));
  console.log('Final:', final);
  await browser.close();
})().catch(console.error);
