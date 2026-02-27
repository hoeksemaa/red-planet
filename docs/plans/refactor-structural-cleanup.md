# Refactor Plan: Structural Cleanup

## Context

This is an 855-LOC CesiumJS app with a clean concept — a `Feature` interface (`init`/`apply`/`destroy`), a `LayerRegistry` to orchestrate features, and a thin UI layer. The bones are good. But the flesh has inconsistencies that, left to compound, will make the codebase increasingly difficult to reason about.

The core disease: **the Feature abstraction is incomplete, so modules hack around it with side-channels** — module-level callback slots, exported free functions, duplicated types, and inconsistent data loading. Every structural sin below traces back to this.

---

## The Sins (ranked by severity)

### 1. Features leak implementation through side-channels

`labels.ts` exports the `labels` Feature object AND four extra functions: `searchLabels`, `flyToAltitude`, `setOnLabelClick`, `setOnLabelMiss`. `rovers.ts` exports the `rovers` Feature AND `setOnRoverPinClick`, `setOnRoverMiss`.

`main.ts` imports these directly, bypassing the registry entirely. This means the registry is decorative — `main.ts` has to know which features exist AND what extra API each one exposes. Adding a new clickable feature means wiring new imperative callbacks in main.ts.

### 2. Duplicated click handling

Labels and rovers each create their own `ScreenSpaceEventHandler` on the same canvas, both listening for `LEFT_CLICK`. Two handlers picking on the same scene, unaware of each other. If both a label and a rover pin overlap, behavior is undefined. A single pick dispatcher would be both correct and simpler.

### 3. Duplicate `SearchResult` type

Defined identically in both `ui.ts:6-11` and `labels.ts:97-102`. Neither imports from the other.

### 4. `FeatureData` is a god object

Every feature receives `{ heights, contourGeoJSON, nomenclatureGeoJSON }`, but imagery uses none of them, rovers use none of them (it fetches its own data in init), and labels doesn't use heights. Only terrain and contours use this bag. Meanwhile rover data is fetched inside `rovers.init()` — inconsistent with the other features that receive pre-fetched data.

### 5. `LabelEntry` leaks Cesium internals to the UI

`LabelEntry` (defined in `types.ts`) contains `label: Cesium.Label` — a Cesium runtime primitive. This type flows through to `ui.ts` via `showFeatureInfo(entry: LabelEntry)`. The UI only reads `name`, `featureType`, `diameterKm`, `origin` — it shouldn't hold a reference to a Cesium primitive. The UI↔renderer interface should be plain data.

### 6. `HeightReference` violations

- Rover pins: `HeightReference.NONE` (`rovers.ts:104`) — the decision doc (Rule 3) says `CLAMP_TO_TERRAIN`
- Labels: no `heightReference` at all (`labels.ts:41-53`) — the decision doc (Rule 4) says `CLAMP_TO_TERRAIN`
- Currently "works" only because `depthTestAgainstTerrain = false` and tilt is disabled. Fragile.

### 7. `terrain.ts` is inconsistent with other features

Every other feature module exports a `Feature` object and goes through the registry. Terrain exports a standalone function (`createTerrainProvider`) and is wired directly in `renderer.ts`. This is actually *correct* — terrain is the globe mesh, not a scene primitive layer — but the fact that it lives in `features/` is misleading.

### 8. `renderer.ts` hard-codes feature knowledge

Renderer imports all four features by name and registers them manually. If the registry is the abstraction boundary, registration should happen in main.ts (the orchestrator), not in the module that owns the Viewer.

### 9. Dead weight in `package.json`

- `three` (^0.183.1) is a dependency — nothing imports it. Phantom dep.
- `vite` (^7.3.1) and `vite-plugin-cesium` are in `dependencies` — should be `devDependencies`. They're build tools.

### 10. Minor warts

- `void ui;` hack in main.ts:37 to suppress unused-var warning
- `onSelect: (_result) => { }` — clicking a search result fills text but doesn't fly to the location. Dead callback.
- HTML id naming: mixed conventions (`rp-title`, `rpRover`, `fpName`, `searchInput`, `layersPanel`)
- Stale bug note in `cesium-primitive-choices.md:117` — contours.ts already multiplies by exaggeration; the code was fixed but the doc wasn't updated

---

## Plan: Incremental Changes

Each step is a single commit. Test after each (`npm run dev` + visual check, `npm run typecheck`).

**Checkpoint rule:** after completing each step, pause and ask the user to manually inspect the result before proceeding. This lets them verify the change looks right, catch regressions early, and abort if things go sideways. No step begins until the previous one is signed off.

### Step 1 — Dead weight cleanup

**Files:** `package.json`, `src/main.ts`

- Remove `three` from dependencies
- Move `vite` and `vite-plugin-cesium` to `devDependencies`
- Remove `void ui;` line — store UI in a `const` that's used (or just assign to `_` with a comment explaining it's needed for side effects)

**Verify:** `npm install && npm run typecheck && npm run dev` — app loads, no regressions.

### Step 2 — Single source of truth for `SearchResult`

**Files:** `src/features/types.ts`, `src/ui.ts`, `src/features/labels.ts`

- Move `SearchResult` to `types.ts` (alongside `LabelEntry`, where shared types live)
- `ui.ts` imports it from `types.ts`; delete local definition
- `labels.ts` imports it from `types.ts`; delete local definition

**Verify:** typecheck passes. No runtime change.

### Step 3 — Separate UI data types from Cesium types

**Files:** `src/features/types.ts`, `src/ui.ts`, `src/features/labels.ts`

`LabelEntry` currently bundles Cesium's `Label` primitive with display metadata. Split it:
- `LabelEntry` stays internal to labels.ts — it has the `label: Cesium.Label` reference for pick-matching
- New `FeatureInfo` type in `types.ts` — plain data object with `{ name, featureType, diameterKm, origin, lon, lat }` — this is what the UI receives
- `showFeatureInfo` takes `FeatureInfo` instead of `LabelEntry`
- Similarly, `RoverPinEntry` already is plain data (no Cesium refs) — good, leave it

**Verify:** typecheck. UI displays feature info the same as before.

### Step 4 — Wire up `onSelect` + relocate `flyToAltitude`

**Files:** `src/main.ts`, `src/constants.ts`, `src/features/labels.ts`

The `onSelect` callback is a no-op. When user clicks a search result, it should fly to that feature and show its info panel.

First, move `flyToAltitude` from `labels.ts` to `constants.ts`. It's a pure function mapping diameter → camera altitude — the same kind of thing as `INITIAL_CAMERA_HEIGHT` and `EXAGGERATION_SCALE`. It's not a labels concern; it's a camera navigation constant. This also avoids the orphan problem when Step 5 removes side-channel exports from labels.ts.

Then wire the callback:
```ts
onSelect: (result) => {
  renderer.flyTo(result.lon, result.lat, flyToAltitude(result.diameterKm));
},
```

**Verify:** search for "Olympus" → click result → camera flies to Olympus Mons.

### Step 5 — Unify click handling + move feature registration to main

**Files:** `src/renderer.ts`, `src/features/labels.ts`, `src/features/rovers.ts`, `src/features/types.ts`, `src/main.ts`

This is the biggest structural change. It merges the old Steps 5 and 6 because they're entangled — the pick dispatcher iterates the registry, and the registry ownership is changing in the same breath.

**Registry ownership:** renderer owns the `LayerRegistry` instance internally. main.ts registers features via `renderer.register(id, feature)` before calling `renderer.init()`. renderer.ts drops all imports of individual feature modules — it becomes a generic Cesium scene host.

**Pick dispatcher:** currently labels.ts and rovers.ts each create their own `ScreenSpaceEventHandler` on the same canvas. Replace with:

1. Add optional `pick?(picked: any): unknown | undefined` to the `Feature` interface — called by the renderer's single handler on LEFT_CLICK. Returns a result object if this feature claims the pick, `undefined` if not.
2. Renderer creates ONE `ScreenSpaceEventHandler`, iterates registered features calling `pick()`, first non-undefined result wins. Emits `onPick(featureId, result)` or `onPickMiss()` callbacks that main.ts wires.
3. Remove `ScreenSpaceEventHandler` from labels.ts and rovers.ts.
4. Remove `setOnLabelClick`, `setOnLabelMiss`, `setOnRoverPinClick`, `setOnRoverMiss` — these module-level callback slots disappear entirely.

**Why `unknown` and not a discriminated union for pick results:** A typed union like `{ kind: 'label', data: FeatureInfo } | { kind: 'rover', data: RoverPinEntry }` would require the pick result type to enumerate every feature at compile time — which defeats the registry pattern's goal of decoupling. The `featureId` string already serves as the discriminant. main.ts is the orchestrator; it registered the features and knows their contracts, so the casts are localized and correct:

```ts
renderer.onPick((featureId, result) => {
  if (featureId === 'labels') {
    const info = result as FeatureInfo;
    renderer.flyTo(info.lon, info.lat, flyToAltitude(info.diameterKm));
    ui.showFeatureInfo(info);
    ui.hideRoverInfo();
  } else if (featureId === 'rovers') {
    ui.showRoverInfo(result as RoverPinEntry);
  }
});
renderer.onPickMiss(() => {
  ui.hideFeatureInfo();
  ui.hideRoverInfo();
});
```

**Verify:** click a label → info panel shows. Click a rover pin → rover panel shows. Click empty space → panels hide. renderer.ts imports zero feature modules. typecheck passes.

### Step 6 — Move terrain out of `features/`

**Files:** `src/features/terrain.ts` → `src/terrain.ts`

Terrain is not a `Feature`. It's a `TerrainProvider` passed to the `Viewer` constructor. Living in `features/` implies it's a toggleable layer — it's not. Move it to `src/terrain.ts` to make this clear.

**Verify:** typecheck. Terrain renders correctly.

### Step 7 — Features self-load their data; remove FeatureData

**Files:** `src/features/types.ts`, `src/main.ts`, `src/renderer.ts`, `src/features/contours.ts`, `src/features/labels.ts`

`FeatureData` is `{ heights, contourGeoJSON, nomenclatureGeoJSON }` — a grab-bag where 3 of 5 features ignore most fields. Rovers already self-load. Make this uniform:

- `Feature.init()` signature becomes `init(viewer: Cesium.Viewer): void | Promise<void>` — no data arg
- Each feature fetches what it needs inside its own `init()` (contours fetches contours.geojson, labels fetches features.geojson, rovers already fetches traverse + images). Each feature imports its data URL directly from `constants.ts` — this pattern is already established by rovers.ts and imagery.ts.
- `imagery` needs no data — already just creates URL providers
- `terrain` isn't a Feature — `createTerrainProvider()` still takes `heights: Float32Array`, but main.ts fetches the heightmap and passes it directly (terrain is wired before the registry)
- Delete `FeatureData` interface from `types.ts`
- Delete the parallel fetch block from `main.ts` (except the heights fetch for terrain)

Loading is still parallel — `registry.initAll()` already calls `Promise.all` across all features. Error handling stays fail-loud (if a fetch fails, the init promise rejects and the app doesn't start). This is correct for an app serving 5 static files under 10MB.

**Verify:** all data loads, all layers render, typecheck passes.

### Step 8 — Fix HeightReference violations

**Files:** `src/features/rovers.ts`, `src/features/labels.ts`

- Rover pins: change `HeightReference.NONE` → `HeightReference.CLAMP_TO_TERRAIN`
- Labels: add `heightReference: Cesium.HeightReference.CLAMP_TO_TERRAIN`

These changes align the code with the decision doc (Rules 3 & 4). `CLAMP_TO_TERRAIN` fixes *positioning* — labels and pins snap to the rendered terrain surface, following exaggeration correctly.

**`depthTestAgainstTerrain` stays `false`.** This is intentional, not a crutch. It ensures labels and pins are always *visible* regardless of terrain geometry — correct behavior for a map. With tilt disabled, there's no viewing angle where "renders through the back of the globe" is observable. If tilt is ever enabled, this becomes a conscious tradeoff (always-visible labels vs. physically-correct occlusion) and should be revisited then.

**Verify:** toggle exaggeration — pins and labels should stay on terrain surface. Visually confirm no labels/pins are buried or floating.

### Step 9 — Update decision doc

**Files:** `docs/decisions/cesium-primitive-choices.md`

- Remove the stale bug note at line 117 — contours.ts already multiplies by exaggeration. The code was fixed; the doc wasn't updated.
- Add a note documenting the `depthTestAgainstTerrain = false` decision and its relationship to HeightReference (from Step 8's rationale).

**Verify:** read the doc, confirm accuracy.

---

## Out of scope (not worth the churn)

- **Module-level state → classes**: The singleton feature pattern (module-level `let` + exported object literal) is fine for a codebase this size. Classes would add ceremony without value.
- **HTML id naming convention**: Cosmetic. Would touch index.html, ui.ts, ui.css simultaneously for zero functional gain.
- **CSS design token extraction**: The few hardcoded hex values (#f1f3f4, #f8f9fa) are hover states — fine as literals.
- **`features/` → `layers/` rename**: Arguably more accurate, but it's a bikeshed.

---

## Verification after all steps

1. `npm run typecheck` — zero errors
2. `npm run dev` — app loads, globe renders
3. Visual checks:
   - Toggle each layer on/off
   - Toggle exaggeration — contours, labels, pins all follow terrain
   - Search for a feature → click result → camera flies to it
   - Click a label → info panel
   - Click a rover pin → rover panel
   - Click empty space → panels dismiss
4. `npm run build` — production build succeeds
