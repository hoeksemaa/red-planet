# Cesium → Three.js Migration Plan

## Context

Cesium provides an integrated globe stack (terrain LOD, imagery tile streaming, camera, geodetic math, picking, primitive rendering) but at significant cost: ~3-5MB gzipped bundle that blocks startup, a continuous render loop that burns CPU even at idle, and overhead from subsystems (atmosphere, fog, tile manager infrastructure) that this app doesn't use. Migrating to Three.js shrinks the bundle dramatically, enables explicit rendering (render only on input), and eliminates framework overhead — at the cost of hand-rolling the pieces Cesium provided for free. User approved tile streaming (no imagery quality degradation).

---

## Feature Flag Architecture

### How it works

`renderer.ts` becomes a thin dispatcher. Two parallel implementations coexist:

- `renderer-cesium.ts` — current code, preserved intact, never broken
- `renderer-three.ts` — Three.js implementation, built out phase by phase

```ts
// src/renderer.ts — dispatcher (replaces current renderer.ts)
import * as cesiumImpl from './renderer-cesium';
import * as threeImpl  from './renderer-three';

const impl = (import.meta.env.VITE_RENDERER === 'three') ? threeImpl : cesiumImpl;

export const register   = impl.register;
export const setTerrain = impl.setTerrain;
export const init       = impl.init;
export const apply      = impl.apply;
export const flyTo      = impl.flyTo;
export const onPick     = impl.onPick;
export const onPickMiss = impl.onPickMiss;
```

`main.ts` stays 100% untouched. `import * as renderer from './renderer'` picks up the dispatcher automatically.

### Switching renderers

```bash
# default — Cesium (production-ready, always works)
npm run dev

# Three.js build (in-progress)
VITE_RENDERER=three npm run dev
```

### Rollback

Always instant. If Three.js is broken, unset `VITE_RENDERER`. Cesium never changes.

### Bundle note

During development, both renderers are bundled simultaneously — that's fine. Cesium is already in the bundle. When Three.js reaches parity in Phase 5, the Vite config is updated to alias `./renderer-cesium` away entirely based on the env var, dropping it from the prod bundle.

---

## Feature Interface During Transition

Current: `Feature.init(viewer: Cesium.Viewer)`
Target: `Feature.init(ctx: ThreeContext)`

During migration, `Feature.init()` accepts a union type. Features are updated one phase at a time — unported features are no-ops when handed a `ThreeContext`:

```ts
// src/features/types.ts — transition period
export type RendererCtx = Cesium.Viewer | ThreeContext;

export interface Feature {
  prefetch?(): Promise<void>;
  init(ctx: RendererCtx): void | Promise<void>;
  apply(state: AppState): void;
  destroy(): void;
  pick?(picked: any): unknown | undefined;
  hover?(picked: any): boolean;
}

// Discriminator — use in features during migration
export function isThreeContext(ctx: RendererCtx): ctx is ThreeContext {
  return 'scene' in ctx;
}
```

Each feature's `init()` checks `isThreeContext(ctx)` and branches accordingly. Once Cesium is dropped (Phase 5), the union type and discriminator are removed and `RendererCtx` collapses to just `ThreeContext`.

---

## `ThreeContext` (the context Three.js features receive)

```ts
export interface ThreeContext {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  markDirty(): void;       // trigger one render frame
  heights: Float32Array | null;  // MOLA data, null during startup
  // NOTE: no tileCache — TileManager is internal to imagery.ts only
}
```

---

## Degradations Accepted (call out before ship)

| Feature | Cesium | Three.js |
|---|---|---|
| Terrain LOD | Adaptive streaming, higher res at close zoom | Fixed 512×256 mesh displaced by MOLA. ~42km/vertex at equator. Invisible at 25km min altitude. |
| Rover traverse clamping | Exact depth-buffer compositing | Heightmap-sampled positions (~3.7km grid spacing). Float slightly above terrain. |
| FlyTo path | Great-circle arc | Linear interpolation through 3D space. Barely visible at orbit scale. |
| Line width | 2px via Cesium geometry | Need `THREE.Line2` for 2px; `LineBasicMaterial` locked to 1px. |
| Ellipsoid | Full WGS84 scaled to Mars | Sphere (flattening 0.006, invisible at orbit scale). |
| Viking imagery projection | WebMercator → sphere reprojection done internally | Visible polar warp (WebMercator vs sphere UV). Poles barely visited. Document; fix later if needed. |

---

## Phase 0 — File Structure (0.5 days)

Set up the three-file renderer pattern. **App stays fully functional on Cesium throughout.**

1. `npm install three @types/three`
2. **Rename `src/renderer.ts` → `src/renderer-cesium.ts`**
3. Remove `getViewer()` export from `renderer-cesium.ts` — nothing outside the file imports it (dead export, principle 9)
4. **Create `src/renderer-three.ts`** — stub only. Exports all required functions as no-ops so TypeScript is happy:
   ```ts
   export function register(..._args: any[]) { console.warn('[three] register stub'); }
   export function setTerrain(_h: Float32Array) {}
   export async function init(_s: any) { console.warn('[three] init stub'); }
   export function apply(_s: any) {}
   export function flyTo(_lon: number, _lat: number, _alt: number) {}
   export function onPick(_fn: any) {}
   export function onPickMiss(_fn: any) {}
   ```
5. **Create `src/renderer.ts`** — the dispatcher shown above
6. **Update `src/features/types.ts`** — add `ThreeContext`, `RendererCtx`, `isThreeContext()`. Update `Feature.init(viewer)` → `Feature.init(ctx: RendererCtx)`.

**Checkpoint:** `npm run dev` (no env var) → app runs identically to before. `VITE_RENDERER=three npm run dev` → app loads, globe is blank (no-op renderer), no crashes.

**Files:** `package.json`, `src/renderer-cesium.ts` (renamed), `src/renderer-three.ts` (new), `src/renderer.ts` (new), `src/features/types.ts`

---

## Phase 1 — Renderer Core (3-4 days)

Work entirely in `renderer-three.ts`. Cesium (`renderer-cesium.ts`) untouched.

### 1a. Geodetic math (`src/geodetic.ts` — new file, ~40 lines)

Replace all `Cesium.Cartesian3.fromDegrees` usages:

```ts
const MARS_RADIUS = 3_389_500; // meters

export function toVec3(lon: number, lat: number, alt = 0): THREE.Vector3 {
  const phi = (90 - lat) * Math.PI / 180;
  const theta = lon * Math.PI / 180;
  const r = MARS_RADIUS + alt;
  return new THREE.Vector3(
    r * Math.sin(phi) * Math.cos(theta),
    r * Math.cos(phi),
    r * Math.sin(phi) * Math.sin(theta),
  );
}

export function sampleAlt(heights: Float32Array, lon: number, lat: number): number {
  // same math as existing terrain.ts sampleMOLA() — factor it here
}
```

### 1b. Globe mesh + terrain displacement

```
THREE.SphereGeometry(MARS_RADIUS, 512, 256)
→ THREE.ShaderMaterial with:
   uniform sampler2D uHeightmap;   // DataTexture from MOLA f32
   uniform float uExaggeration;    // 1.0 or 100.0
```

Vertex shader displaces each vertex along its normal by `texture2D(uHeightmap, uv).r * uExaggeration`. Upload MOLA as `THREE.DataTexture(data, 1440, 720, THREE.RedFormat, THREE.FloatType)`.

**Startup sequence:**
1. Globe appears immediately with flat `uHeightmap` (zeroed or skipped)
2. MOLA f32 fetched in background (same as current PERF-4)
3. On load: `material.uniforms.uHeightmap.value = dataTexture; markDirty()`

Exaggeration toggle: `material.uniforms.uExaggeration.value = state.exaggeration; markDirty()` — no geometry rebuild.

Globe base color: `#8C462200` (Mars brown, same as current `globe.baseColor`).

### 1c. Camera (`OrbitControls`)

```ts
const controls = new OrbitControls(camera, renderer.domElement);
controls.enablePan = false;
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 25_000;
controls.maxDistance = 680_000_000;
controls.target.set(0, 0, 0);   // Mars center, locked
```

Initial position: `camera.position.copy(toVec3(133, -10, 24_000_000))`.

`flyTo(lon, lat, alt)`: animate `camera.position` via manual lerp over 1.5s, calling `markDirty()` each frame. Straight-line in 3D (documented degradation).

### 1d. Explicit render loop

```ts
let dirty = false;
function markDirty() {
  if (dirty) return;
  dirty = true;
  requestAnimationFrame(renderFrame);
}
function renderFrame() {
  dirty = false;
  controls.update();           // damping
  tileManager.update(camera);  // cull/load/unload tiles
  updateSatellitePositions();  // if satellites visible
  updateLabelOpacities();      // if labels visible
  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
  if (needsContinuous()) markDirty(); // satellites animating or damping
}
controls.addEventListener('change', markDirty);
```

Idle CPU drops to ~0%.

### 1e. Picking (`THREE.Raycaster`)

Single listener on canvas — one event source, one handler (principle 2):

```ts
canvas.addEventListener('click', onPick);
canvas.addEventListener('mousemove', throttle(onHover, 30));
```

`pick()` receives `{ spriteHits: Intersection[], globeHits: Intersection[] }`. Features check `.userData` on hits.

### 1f. `renderer-three.ts` — fill in real init

Replace stubs with real implementation: `WebGLRenderer` + `CSS2DRenderer` (mounted over same `#cesiumContainer`), `PerspectiveCamera` (FOV 60, near 1000, far 1e9), explicit render loop, matching public API.

**Files changed:** `renderer-three.ts` (real impl), `terrain.ts` (drop `createTerrainProvider`, keep `sampleMOLA`), new `src/geodetic.ts`

**Checkpoint:** `VITE_RENDERER=three npm run dev` → globe renders brown sphere, terrain displaces when MOLA loads, camera orbits, clicks log to console. `npm run dev` → Cesium still works identically.

---

## Phase 2 — Imagery Tile Streaming (5-7 days)

Most complex phase. Implement quadtree tile LOD in Three.js.

### `src/tiles/TileManager.ts`

```ts
class TileManager {
  update(camera: Camera): void  // called each frame; culls + loads + unloads
  setImagerySet(set: 'terraformed' | 'real'): void
  dispose(): void
}
```

### Quadtree structure

Each `Tile` node:
- Bounding sphere for frustum culling
- `THREE.Mesh` (subdivided plane, projected onto sphere via vertex shader)
- `THREE.Texture` loaded from tile URL
- Children (NW/NE/SW/SE) spawned when screen-space error exceeds threshold

**Screen-space error:** `geometricError / camera.distance * screenHeight`. If error > threshold (~2px), split tile and show children; if error < threshold * hysteresis (0.5), collapse back to parent.

### Tile mesh geometry

Each tile: `PlaneGeometry(1, 1, 32, 32)` with a vertex shader that converts `(u, v, tileExtent)` → sphere position. Uniform: `vec4 uExtent` = `(minLon, minLat, maxLon, maxLat)` in radians. Vertex shader uses `toVec3` math inline, plus adds MOLA displacement via the global heightmap uniform.

### Tile URL schemes

**Actual URL patterns from `constants.ts` and `imagery.ts`:**

Terraformed (GeographicTilingScheme, 2:1 aspect, zoom 0-8):
```
${TILE_CDN}/data/raw/terraformed/{z1}/{x}/{reverseY}.png
  z1       = level + 1  (Cesium custom tag; zoom 0 → folder "1")
  x        = tile column, 0-indexed left-to-right
  reverseY = (rowCount - 1 - y)  (Y axis flipped: row 0 at bottom)
```

Viking (WebMercatorTilingScheme, zoom 0-7):
```
${TILE_CDN}/data/raw/viking/{z}/{x}/{reverseY}.png
  z        = level (standard)
  reverseY = (rowCount - 1 - y)
```

`TILE_CDN` = `VITE_TILE_CDN_URL` env var (CloudFront in prod; empty in dev → resolves to local `/data/raw/`). Tiles exist on disk in dev under `data/raw/` — streaming works in dev immediately.

TileManager must compute `reverseY` and `z1` explicitly. Do not use a generic XYZ template.

### Loading strategy

- `fetch()` + `ImageBitmap` for async decoding off main thread
- Limit concurrent tile requests to 6 (browser HTTP/2 limit)
- Priority queue: visible tiles closer to camera → higher priority
- Cache eviction: LRU, max 256 tiles in GPU memory
- Show parent tile texture while children load (no blank patches)

**Files:** New `src/tiles/TileManager.ts`, `src/tiles/Tile.ts`, `src/tiles/TileQueue.ts`. Update `imagery.ts` to branch on `isThreeContext()` and wrap `TileManager`.

**Checkpoint:** `VITE_RENDERER=three` → globe shows streaming imagery tiles. Zoom in → higher resolution tiles load. Toggle imagery → tiles swap without blank flash.

---

## Phase 3 — Critical-Path Features (3-4 days)

### Labels (`features/labels.ts`)

Branch on `isThreeContext(ctx)`. Three.js path: replace `LabelCollection` with `CSS2DRenderer` + `CSS2DObject`.

```ts
const div = document.createElement('div');
div.className = 'mars-label';
div.textContent = feature.name;
const label = new CSS2DObject(div);
label.position.copy(toVec3(lon, lat, 5000));
scene.add(label);
```

Distance-based opacity: iterate visible labels in per-render callback, set `div.style.opacity = computeOpacity(...)`. Hover highlight via `div.addEventListener('mouseenter', ...)` — no raycaster needed for labels.

`searchLabels()` is pure data — unchanged.

### Rovers (`features/rovers.ts`)

Branch on `isThreeContext(ctx)`. Three.js path:

**Traverse lines:** terrain-sampled `THREE.Line2`:
```ts
const positions = traverseCoords.flatMap(([lon, lat]) => {
  const alt = sampleAlt(heights, lon, lat) * state.exaggeration;
  const v = toVec3(lon, lat, alt + TRAVERSE_LIFT_M);
  return [v.x, v.y, v.z];
});
const geo = new LineGeometry();
geo.setPositions(positions);
const line = new Line2(geo, new LineMaterial({ color, linewidth: 2 }));
```

Two prebuilt `Line2` objects (1× and 100×), swap visibility on exaggeration toggle. Rebuild on MOLA load.

**Pins and icons:** `THREE.Sprite` with `THREE.CanvasTexture`. Canvas generation code (`makeDotCanvas`, `makeCameraCanvas`) unchanged. `sprite.material.depthTest = false` + `sprite.renderOrder = 1`. Each sprite gets `.userData = { type: 'rover', ...pinData }`.

### Imagery toggle (`features/imagery.ts`)

Three.js path: calls `tileManager.setImagerySet(state.imagery)`. That's it.

---

## Phase 4 — Deferred Features (3-4 days)

### Contours (`features/contours.ts`)

Three.js path: single `BufferGeometry` with `position` and `color` attributes. All contour lines batched → one draw call. Two geometries (1× and 100×), swap on exaggeration toggle. Color-to-HSL mapping unchanged.

### Graticule (`features/graticule.ts`)

Three.js path: `THREE.Line` for parallels/meridians. `THREE.LineDashedMaterial` + `geo.computeLineDistances()` for dashes. Two prebuilt line sets (1× and 100×). Labels via `CSS2DObject`.

### Satellites (`features/satellites.ts`)

Keplerian math (`solveKepler`, `eccentricToTrue`, `orbitalCartesian`) is pure math — replace `new Cesium.Cartesian3(x,y,z)` with `new THREE.Vector3(x,y,z)` in the Three.js branch. Orbit rings: `THREE.Line`. Dot sprites: `THREE.Sprite`. Animation: feature calls `markDirty()` each frame while satellites layer is on.

---

## Phase 5 — Cleanup (1 day)

At this point `VITE_RENDERER=three` is feature-complete and visually confirmed.

1. Collapse `renderer.ts` dispatcher — inline `renderer-three.ts` exports directly, remove the conditional
2. Delete `src/renderer-cesium.ts`
3. Remove `cesium` from `package.json`
4. Remove `vite-plugin-cesium` from `vite.config.js`
5. Remove Cesium widget CSS import
6. Clean up `src/features/types.ts` — remove `RendererCtx` union and `isThreeContext()`, `Feature.init(ctx: ThreeContext)` is now the sole signature
7. Update all feature files — remove `isThreeContext()` branches, keep only Three.js path
8. Delete `createTerrainProvider` from `terrain.ts`
9. Write `docs/decisions/threejs-migration.md` documenting the degradations table

**Checkpoint:** `npm run dev` → Three.js globe, no Cesium in bundle.

---

## Key Files

| File | Change |
|---|---|
| `src/renderer.ts` | **New** — thin dispatcher; delegates based on `VITE_RENDERER` |
| `src/renderer-cesium.ts` | **Renamed from `renderer.ts`** — Cesium impl, never modified during migration |
| `src/renderer-three.ts` | **New** — Three.js impl, built out phase by phase |
| `src/terrain.ts` | Drop `createTerrainProvider`; keep `sampleMOLA`; factor into `geodetic.ts` |
| `src/geodetic.ts` | **New** — `toVec3`, `sampleAlt` |
| `src/tiles/TileManager.ts` | **New** — quadtree tile LOD |
| `src/tiles/Tile.ts` | **New** — individual tile mesh + texture lifecycle |
| `src/features/types.ts` | Add `ThreeContext`, `RendererCtx` union, `isThreeContext()` |
| `src/features/imagery.ts` | Branch on `isThreeContext()` → wrap `TileManager` |
| `src/features/labels.ts` | Branch on `isThreeContext()` → CSS2DRenderer path |
| `src/features/rovers.ts` | Branch on `isThreeContext()` → Line2 + Sprite path |
| `src/features/contours.ts` | Branch on `isThreeContext()` → BufferGeometry vertexColors |
| `src/features/graticule.ts` | Branch on `isThreeContext()` → THREE.Line + LineDashedMaterial |
| `src/features/satellites.ts` | Branch on `isThreeContext()` → THREE.Vector3 types |
| `src/features/registry.ts` | Update `Cesium.Viewer` ref → `RendererCtx` |
| `src/main.ts` | **Untouched** |
| `src/state.ts` | **Untouched** |
| `src/ui.ts` | **Untouched** |
| `vite.config.js` | Phase 5 only: remove vite-plugin-cesium |

---

## Handoff Prompt (paste into next session)

```
# Handoff: Cesium → Three.js Migration

## Goal
Migrate the red-planet Mars globe from Cesium.js to Three.js to improve startup time (drop ~3-5MB bundle)
and framerate (explicit rendering instead of Cesium's continuous loop). Full tile streaming required.

## Feature Flag Architecture (CRITICAL — read before touching any file)

`renderer.ts` is a thin dispatcher. Two renderer impls coexist:
- `renderer-cesium.ts` — current Cesium code, never broken
- `renderer-three.ts` — Three.js impl, built incrementally

```ts
// src/renderer.ts
import * as cesiumImpl from './renderer-cesium';
import * as threeImpl  from './renderer-three';
const impl = (import.meta.env.VITE_RENDERER === 'three') ? threeImpl : cesiumImpl;
export const { register, setTerrain, init, apply, flyTo, onPick, onPickMiss } = impl;
```

Switch: `VITE_RENDERER=three npm run dev` | Rollback: unset env var. main.ts stays untouched.

## Feature Interface During Transition
`Feature.init(ctx: RendererCtx)` where `RendererCtx = Cesium.Viewer | ThreeContext`.
Features use `isThreeContext(ctx)` to branch. Unported features no-op the Three.js path.
`ThreeContext = { scene, camera, markDirty, heights }`.

## Current State
- Branch: `performance`
- Phase 0 not yet started. Cesium is fully operational.
- The dispatcher pattern described above is the architecture. Set it up before writing any Three.js code.

## Plan File
Full implementation plan at: `docs/plans/cesium-migration-plan.md` — read it completely before starting.

## Architecture Decisions (locked)

1. `main.ts` and `ui.ts` stay 100% untouched.
2. Renderer public API identical: `register`, `init`, `apply`, `flyTo`, `setTerrain`, `onPick`, `onPickMiss`.
3. `setTerrain()` must be kept — main.ts calls it after MOLA downloads.
4. Explicit rendering: `markDirty()` triggers one rAF. Satellites/damping keep re-queuing; else idle.
5. Tile streaming required. TileManager internal to imagery.ts; not in ThreeContext.
6. Terrain: ShaderMaterial + DataTexture (MOLA f32, 1440×720, FloatType). Single `uExaggeration` uniform.
7. Labels: CSS2DRenderer + DOM events for pick/hover. No raycaster for labels.
8. Rover traverses: terrain-sampled Line2. Two prebuilt geometries (1× and 100×).
9. Contours/graticule: single BufferGeometry vertexColors. LineDashedMaterial for graticule.

## Tile URL Gotchas (Phase 2)
- Terraformed: folder is `z+1`, Y axis is flipped (reverseY = rowCount - 1 - y)
- Viking: standard z, also flipped Y
- Tiles available locally at `data/raw/` in dev (served by Vite)

## User Preferences
- Keep code minimal — fewest moving parts
- No premature abstraction
- Explain step by step before writing; walk through code line by line
- Visual changes: pause before marking done, ask user to confirm it looks right
- Google Maps white UI aesthetic (don't touch ui.ts)
- Each file's purpose must be immediately obvious
- Default orange accent: #FF9500
- Read `docs/decisions/` before implementing anything — check filenames for relevance

## Before You Start
Run `ls docs/decisions/` and read any files whose names suggest relevance.
```

---

## Verification

1. `npm run dev` — Cesium globe renders identically to before Phase 0
2. `VITE_RENDERER=three npm run dev` — Three.js globe renders brown sphere (Phase 1 complete)
3. Zoom in → tile resolution increases; zoom out → tiles collapse (Phase 2 complete)
4. Toggle imagery → tiles swap without flash (Phase 2 complete)
5. Toggle exaggeration → globe + traverse lines update (no geometry rebuild)
6. Search a crater → flyTo animates camera
7. Hover a label → highlight; click → info panel
8. Enable rovers → traverse lines visible, pins clickable
9. Enable satellites → orbit rings visible, dots animate; disable → idle CPU drops to ~0%
10. Enable contours → single draw call, color by elevation
11. Chrome DevTools Performance: verify no rAF callbacks running at idle (satellites off, no damping)