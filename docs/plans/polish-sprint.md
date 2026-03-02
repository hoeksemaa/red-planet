# Google Mars — Polish Sprint

---

## GATES

### DEC-1 · Confirm framework
Recommendation: stay on CesiumJS. Switching throws away working MOLA terrain,
pick/hover, clamping, and fly animations — weeks to reach parity. Close this
ticket as "Cesium confirmed."
Blocks: everything rendering-related.

### DEC-2 · Contours default behavior (design decision)
Pick one:
  a) Off by default, user opts in via layers panel
  b) Auto-hide above ~1,500 km altitude, fade in on zoom
  c) Always on but much lighter/more transparent
Blocks: UX-4.

### DEC-3 · Loading strategy (design decision)  ★ new
Pick one:
  a) Progressive — load minimum to render globe first, background-fetch the rest.
     Simpler. No viewport math. Rover traverse (6.7 MB) and contours (3 MB)
     deferred until after first paint. Achievable without PERF-4.
  b) Viewport-based — fetch strictly what's visible given current camera. Like
     Google Maps tile model. Initial payload drops to ~200 KB. Requires PERF-4
     (quantized-mesh terrain) to realize the terrain half; other layers use
     zoom-threshold triggers. Higher complexity, bigger payoff.

Note: both strategies support caching the initial view (PERF-6). The difference
is how aggressively you defer non-visible data as the user moves around.
Blocks: PERF-3, PERF-4 scope.

---

## MUST

### BUG-1 · Existing bug sweep
Open the app fresh. Go through every feature. Write down everything broken or
ugly. Fix before user testing.
Depends on: nothing — do first.
Blocks: TEST-1a.

### UX-1 · Fix mobile viewport / search bar layout
The search bar being absorbed is almost certainly the iOS Safari dynamic
viewport height bug. Fix: swap `100vh` → `100dvh` + add
`env(safe-area-inset-*)` padding. Test on real iPhone, not simulator.
Depends on: nothing.

### UX-2 · Touch navigation — drag + pinch-zoom tuning
Cesium handles touch natively but defaults feel stiff with tilt disabled. Tune
`ScreenSpaceCameraController` zoom/translate speeds. Test on device.
Depends on: DEC-1.

### UX-3 · First glimpse — opening experience
Current: cold static view at (133°E, 10°S, 24,000 km). Design the opening 5
seconds intentionally — cinematic rotation, auto-fly to Olympus Mons, or a
better default face. This is the pitch before the user touches anything.
Depends on: nothing blocking, but decide before TEST-1a.

### UX-4 · Contours: zoom-based behavior + lighter appearance
Implement whatever DEC-2 decides. If zoom-based: camera altitude listener in
main.ts updates state. Either way: reduce contour opacity/saturation — they
currently compete with terrain texture.
Note: coordinate lazy-load threshold with PERF-3 so contours only start
fetching when the camera is close enough to need them.
Depends on: DEC-2, PERF-3 (lazy-load timing coordination).

### UX-5 · Altitude display
Show camera height in km as a small UI element ("2,340 km above Mars"). Cesium's
built-in distance legend is Earth-calibrated — easier to render our own, synced
to `camera.positionCartographic.height`.
Note: this value is height above the ellipsoid, not above terrain. At orbital
altitude the difference is negligible. At close range (e.g. near Olympus Mons
at 21 km elevation) the reading will be ~21 km high. Acceptable for v1.
Depends on: DEC-1.

### PERF-1 · Measure load baseline
Before touching anything, establish what's actually slow.
Open Chrome DevTools → Network tab. Hard refresh (Cmd+Shift+R). Record:
  1. What's loading — every request in order. Note which are on the critical
     path (blocking the globe) vs loading in background.
  2. How much — Size column (compressed, over-the-wire) vs uncompressed.
     Check Response Headers for `content-encoding: br` — if it says gzip or
     nothing, brotli isn't on and you're leaving free savings on the table.
  3. How fast — Waterfall column: DNS + connect + TTFB + download per request.
     Note the DOMContentLoaded and Load markers at the bottom.
Then open the Performance tab. Record a fresh load. Look for:
  - Long yellow JS parse/evaluate blocks — Cesium's compile cost
  - Idle gaps while waiting on fetches
Re-run throttled to "Fast 3G" and "Slow 4G" (Network tab dropdown).
Document the numbers. Every subsequent PERF ticket should re-run this and
compare against baseline.

Current known eager-load payload (from codebase audit):
  - Terrain .f32:        4.0 MB  (blocks init — CustomHeightmapTerrainProvider)
  - Rover traverses:     6.7 MB  (invisible at 24,000 km)
  - Contours:            3.0 MB  (invisible at 24,000 km)
  - Nomenclature:        1.2 MB  (only major features visible at 24,000 km)
  - Rover images:        0.3 MB
  Total critical path:  ~15 MB

Depends on: nothing — do before any other PERF ticket.
Blocks: PERF-2, PERF-3, PERF-4, PERF-5, PERF-6.

### PERF-2 · Verify modulepreload  ★ revised — likely already done
Vite automatically injects `<link rel="modulepreload">` with correct
content-hashed hrefs into dist/index.html at build time. This is on by default;
no config needed.

Action: run `vite build`, open dist/index.html, confirm the tags are present.
If they are → close ticket. If missing (unusual) → set `build.modulePreload`
in vite.config.ts.

Do NOT manually add a modulepreload tag to the source index.html — Vite
content-hashes filenames at build time so any hardcoded href breaks on every
rebuild.
Depends on: PERF-1.

### PERF-3 · Lazy-load deferred data  ★ expanded
Move heavy data that is invisible at the initial 24,000 km altitude off the
critical path. Load in the background after the globe appears.

Targets (in priority order by size):
  1. Rover traverses (6.7 MB) — lines are sub-pixel at 24k km. Keep only
     landing site dots (already split in rovers.ts) on the critical path.
     Fetch full traverse data when altitude drops below ~500 km.
  2. Contours (3.0 MB) — invisible at 24k km. Coordinate fetch trigger with
     UX-4 zoom threshold.
  3. Nomenclature (1.2 MB) — only major features matter at 24k km. Options:
     a) Keep on critical path (it's small — 1.2 MB, not the 5 MB previously
        estimated). Simplest, avoids FEAT-3 async complexity.
     b) Lazy-load, but add a loading guard to searchLabels() so category
        search gracefully handles not-yet-loaded state.

Warning: searchLabels() is fully synchronous and assumes labelData is
populated (labels.ts:107). If nomenclature is deferred, category search
(FEAT-3) silently returns empty until the fetch completes. Fix before shipping.

Warning: if `?place=` URL param support is added (FEAT-1 bonus), detect it at
startup and keep nomenclature in the critical path for that load.

Saves: up to 11 MB from the blocking critical path.
Depends on: PERF-1, DEC-1, DEC-3.

### PERF-4 · Quantized-mesh terrain tiles  ★ revised — higher effort, architecturally required for viewport strategy
Current: CustomHeightmapTerrainProvider loads the full 4 MB heightmap upfront.
Quantized-mesh serves tiles on demand — at 24,000 km only zoom 0–2 tiles are
needed (~50–100 KB total).

If DEC-3 picks viewport-based loading, this ticket is required — it's the
mechanism that makes tile-on-demand terrain possible. If DEC-3 picks
progressive, this is still a meaningful improvement but not blocking.

Tool stack (research-verified):
  - Do NOT use cesium-terrain-builder — abandoned since 2017, Earth-only,
    no custom ellipsoid support.
  - Use: pydelatin + quantized-mesh-encoder (Python, both actively maintained).
    quantized-mesh-encoder accepts Mars ellipsoid radii directly.
  - Pipeline: MOLA GeoTIFF → rasterio tile extraction → pydelatin mesh →
    quantized-mesh-encoder → {z}/{x}/{y}.terrain static file tree + layer.json
  - CesiumTerrainProvider.fromUrl() accepts `ellipsoid` option.
    Ellipsoid.MARS is available in CesiumJS ≥ 1.133 (Sept 2025); for older
    versions: new Cesium.Ellipsoid(3396190, 3396190, 3376200).

Resolution caveat: the current source (mola_16ppd.f32, 1440×720) gives
16 samples/degree. Switching to quantized-mesh with the same source gives
lazy tile delivery but NO additional resolution. For higher terrain detail at
zoom, you need the 128ppd MOLA source (~23040×11520) — a separate data
acquisition step. Decide whether higher resolution is in scope before starting.

layer.json gotcha: ctb-tile does not generate layer.json automatically. You
must write it or generate it from the output file tree. The `available` array
must enumerate every tile that exists — without it Cesium 404s silently at
higher zoom levels (issue CesiumGS/cesium#7963).

Tile count: explodes 4× per zoom level. At zoom 8: ~130k tiles. At zoom 10:
~1M tiles. Decide max zoom level before running the pipeline.

Do a 2-hour spike before committing to the full build:
  pip install quantized-mesh-encoder pydelatin rasterio
  Generate zoom 0–3 only. Confirm CesiumTerrainProvider renders correctly.
  Then decide if full pyramid is worth the effort.

Effort: 3–5 days realistic (not the 1–2 days previously estimated), including
layer.json generation, S3 hosting setup, and debugging tile availability gaps.
Depends on: PERF-1, DEC-1, DEC-3.
Blocks: INF-1 (terrain tiles must be on S3 before deploying), PERF-6.

### PERF-5 · Service worker caching
Cache Cesium bundle + all static data files after first visit. Second load
is near-instant. Use vite-plugin-pwa (wraps Workbox, minimal config).
Primarily benefits repeat visitors and anyone you demo to in person.
Works well combined with PERF-6 (initial-view bundle) — caches the precomputed
fast first-frame payload for instant subsequent loads.
Depends on: PERF-1.

### PERF-6 · Initial-view bundle + aggressive CDN caching  ★ new
The initial camera (133°E, 10°S, 24,000 km) is deterministic — every visitor
sees the same first frame. Precompute exactly what that frame needs and serve
it as a single cached artifact.

Contents of initial-view bundle (~150–300 KB):
  - Terrain tiles zoom 0–2 (if PERF-4 done) OR a low-res globe texture fallback
  - labels-major.json — ~50 largest features visible at 24k km altitude
  - rover-sites.json — landing coords only, no traverse lines (already split
    in rovers.ts via the setTimeout(0) deferred loading pattern)

Serve with: Cache-Control: public, max-age=31536000, immutable
(content-hash the bundle filename so cache busting is automatic)

After first visitor warms the CDN edge, every subsequent visitor globally gets
this in ~5 ms. Combined with PERF-5 (service worker), second visit is instant.

Build step: script that computes which tiles/labels are in the initial frustum
and writes the bundle file. Run as part of the data pipeline, not at runtime.
Depends on: PERF-1. PERF-4 unlocks the terrain tile portion; rest is
independent.

### FEAT-1 · Shareable URLs  ★ highest virality leverage
Encode `?lon=&lat=&alt=` in the URL, updated on camera change (debounced
~500ms). On load, parse params and fly-to. Bonus: `?place=Olympus+Mons`
auto-searches and flies to result.
Unit tests: URL encode/decode round-trips.

Note: no URL param handling exists anywhere in the codebase currently —
build from scratch using URLSearchParams + history.pushState.

Bonus feature warning: `?place=` requires nomenclature to be loaded at parse
time. If PERF-3 defers nomenclature, detect `?place=` in the URL at startup
and keep nomenclature in the critical path for that load only. Otherwise the
fly-to silently no-ops.
Depends on: nothing — can ship independently today.
Blocks: PUB-3 (Casey tag with a direct link is the hook).

### FEAT-2 · Fix label layering (hemisphere cull)
`disableDepthTestDistance: Number.POSITIVE_INFINITY` fixes z-fighting with
terrain. Pair it with a `preRender` listener that sets `label.show = false`
when `dot(labelSurfaceNorm, cameraNorm) < 0.05` — hides labels on the far
hemisphere. Precompute normalized positions at init so per-frame cost is
trivial.
Depends on: DEC-1.

### FEAT-3 · Category search
`if (q === 'volcano')` → return all nomenclature with `feature_type === 'Mons'`,
etc. Map common words to IAU feature type names. Also handle "rover", "crater",
"canyon". Data is already loaded — mostly adding a lookup table.
Unit tests: each category keyword returns expected results.

Note: if PERF-3 defers nomenclature loading, searchLabels() will silently
return empty until the fetch completes. Add a loading guard (return a "loading…"
state or queue the search) before shipping this feature alongside PERF-3.
Depends on: nothing. Guard needed if PERF-3 defers nomenclature.

### INF-1 · Deploy to Vercel + S3/CloudFront
Plan already written in docs/plans/deployment-s3-cloudfront-vercel.md.
Also includes terrain tile pyramid on S3 (added by PERF-4, if in scope).
The combined S3 upload (imagery + terrain tiles) will take hours — start
overnight.
Add Plausible.io script tag for analytics (one line, no custom infra).
Depends on: BUG-1, PERF-1, PERF-4 (if terrain tiles are in scope).
Blocks: TEST-1a, PUB-1, PUB-2, PUB-3.

### TEST-1a · User testing round 1 (post mobile UX)
3–5 people, phones, silent observation, recorded. Question: can someone pick it
up and navigate to something interesting without help? Their hesitations are bug
reports. Fix what you learn before round 2.
Depends on: INF-1 (live URL), BUG-1, UX-1, UX-2, UX-3.

### TEST-1b · User testing round 2 (pre-launch)
Same format. Question: does the full end-to-end experience hold up? Focus on
first-impression wow factor and shareability. Feeds directly into blog post
narrative.
Depends on: TEST-1a fixes landed, FEAT-1 (shareable URLs) live.

### PUB-1 · README + use docs + data sources
Structure: what it is (2 sentences) → live link → screenshot/GIF → run locally
→ data sources (MOLA, IAU nomenclature, NASA MMGIS, Viking/CTX imagery). Data
sources section matters for scientific credibility with the HN/Casey audience.
Depends on: INF-1.

### PUB-2 · Blog post
Audience: technically curious, Google Maps-brained. Cover: what MOLA is, how
terrain exaggeration makes Mars legible, rover photo easter eggs, satellite
orbits. Include GIFs. Embed live link prominently. Mention what you learned
building it. Incorporate observations from TEST-1b.
Depends on: PUB-1, INF-1, TEST-1b.

### PUB-3 · Tag Casey Handmer
Post linking to blog + a shareable URL dropping directly on Olympus Mons.
Casey writes about Mars colonization and is HN-adjacent — he RT's things he
finds genuinely interesting.
Depends on: FEAT-1 (shareable URL), INF-1 (live site), PUB-2 (context).

---

## WANT (post-launch)

### WANT-1 · Clean code / data format unification
Do during lulls. Don't block launch.

### WANT-2 · Accurate Mars ellipsoid
Cesium supports custom ellipsoids. Scope before committing — potential rabbit
hole. Note: if PERF-4 is implemented with CesiumJS ≥ 1.133, Ellipsoid.MARS
is already available and CesiumTerrainProvider.fromUrl() accepts it directly.

### WANT-3 · More HD imagery
Data pipeline task. Depends on source availability.

### WANT-4 · Analytics dashboard
Plausible.io handles city/region/total views out of the box ($9/month, one
script tag — added during INF-1). No custom build needed.

### WANT-5 · Tilt/2-finger rotate + compass
Re-enable `ssc.enableTilt`. Introduces gimbal lock risk — hence quaternion
camera math. Scope carefully.

### WANT-6 · Shape of areas on click
Polygon overlay from nomenclature data. Not all features have geometry — needs
research.

### WANT-7 · More data overlays
Mineral maps (CRISM), dust storms (MCS API), geographic boundaries. Each is its
own data pipeline.

### WANT-8 · Locations from "A Traveler's Guide to Mars"
Enrich place-meta.ts descriptions with book content. Content work.

### WANT-9 · Practice speaking demo
Don't do this until after TEST-1b — their reactions shape the narrative.

---

## Dependency graph (critical path)

DEC-1 ──────────────────────────────────────────────────────────────────┐
DEC-2 ──► UX-4 ◄── PERF-3                                              │
DEC-3 ──► PERF-3, PERF-4 (scope)                                        │
BUG-1 ───────────────────────────────────────────────────────────────┐  │
                                                                      │  │
FEAT-1 (shareable URLs) ───────────────────────────────────────────► PUB-3
                                                                         │
UX-1 ──┐                                                                 │
UX-2 ──┤                                                                 │
UX-3 ──┴──► TEST-1a ──► TEST-1b ──► PUB-2 ──► PUB-3 ◄───────────────────┘
PERF-1 ──► PERF-4 ──► INF-1 ──────────────────────────────► PUB-1
PERF-4 ──► PERF-6 (initial-view terrain tiles)
PERF-1 ──► PERF-6 (independent of PERF-4 for labels/rover-sites portion)

UX-5, FEAT-2, FEAT-3 — parallel, land before INF-1
PERF-2 — verify only (likely already done by Vite); close immediately
PERF-5 — parallel, land before INF-1
