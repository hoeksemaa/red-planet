# Performance Sprint

**Goal:** First visit 1–4s → ~800ms–1.5s. Repeat visits instant.

**Key discovery:** `vite-plugin-cesium` injects a synchronous render-blocking
`<script src="/cesium/Cesium.js">` (6.1 MB). Nothing else loads until it finishes.
Named imports don't help — Rollup tree-shaking is bypassed entirely.

---

## Tasks

| # | Task | What it does | Effort |
|---|---|---|---|
| PERF-1 | Measure baseline | Run `scripts/bench-load.cjs`, record numbers. Rerun after each ticket. | 1h |
| ~~PERF-2~~ | ~~Verify modulepreload~~ | ~~`dist/index.html` already has it — close ticket.~~ ✓ Polyfill present; no app modules preloaded (trivial). | ~~5m~~ |
| PERF-3 | Static loading screen | Screenshot of loaded globe served as background while Cesium boots. Perceived load only. | 2h |
| PERF-4 | Decouple terrain from init | Start Cesium with `EllipsoidTerrainProvider`, swap when `.f32` arrives. Removes 4 MB from critical path. At 24k km the difference is invisible. | 1d |
| ~~PERF-5~~ | ~~Labels off critical path~~ | ~~Remove from `prefetchAll()` Promise.all. Load after init.~~ ✓ `prefetch` removed; `init` fires-and-forgets the fetch. 92 KB off critical path. | ~~2h~~ |
| PERF-6 | Preload hints | `<link rel="preload">` for Cesium.js + terrain .f32. Browser fetches both while HTML parses. | 30m |
| ~~PERF-7~~ | ~~Brotli on JSON~~ | ~~Verify Vercel is sending `content-encoding: br`.~~ ✓ Already on. `features.geojson` 92 KB on wire; rover files similarly compressed. Vercel default. | ~~30m~~ |
| PERF-8 | Async Cesium script | Add `defer` to the injected Cesium script tag (or dynamic import). Removes the render-blocking bottleneck — highest-leverage single change. | 1–3d |
| PERF-9 | Quantized-mesh terrain | Replace 4 MB `.f32` with tiled `.terrain` files. At 24k km only ~100 KB needed. Pipeline: pydelatin + quantized-mesh-encoder. Supersedes PERF-4. | 3–5d |
| PERF-10 | Service worker cache | `vite-plugin-pwa`. Cesium + data cached after first visit. Repeat visits ~100ms. | 1d |
| PERF-11 | Initial-view bundle | Precompute zoom 0–2 terrain + major labels for starting camera. Single CDN-cached artifact. Requires PERF-9. | 2d |
| PERF-12 | Kill loading screen | Once PERF-8 lands and DCL is fast, the loading overlay is moot — remove `LoadingView`, `LoadStatus` state, `onProgress`/`onReady` callbacks, and the CSS. Simplifies App.tsx to a single `<MapView />`. Requires PERF-8. | 1h |

---

## Demo plan

**Phase 1 — attack the bottleneck first:**
PERF-8 · PERF-3 · PERF-7

PERF-8 is the centerpiece — everything else treats symptoms while the 6.1 MB
blocking script remains. Try the post-build HTML transform approach first (low
risk, ~1d); fall back to dynamic import if vite-plugin-cesium fights it (~3d).
PERF-3 (static loading screen) is temporary scaffolding — delete it when
PERF-8 + PERF-12 land. PERF-6 (preload hints) deferred until after PERF-8:
preloading a synchronous blocking script helps less than preloading async resources.

**Phase 2 — before going public** (clears remaining critical path):
PERF-5 · PERF-6 · PERF-4 · PERF-10

PERF-5 and PERF-4 are still worth doing — but note they remove items from a
Promise.all that can't start until Cesium.js finishes anyway, so their impact
is capped until Phase 1 lands.

**Phase 3 — post-launch** (high effort, diminishing returns):
PERF-9 · PERF-11

**In-person demo tip:** show the load cold on their phone, then again after
service worker is warm. The before/after contrast lands better than any number.
