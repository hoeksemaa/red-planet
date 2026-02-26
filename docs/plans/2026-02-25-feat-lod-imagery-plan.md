---
title: LOD Imagery via TileMapServiceImageryProvider
type: feat
status: active
date: 2026-02-25
---

# feat: LOD Imagery via TileMapServiceImageryProvider

## Overview

Wire up the pre-existing TMS tile pyramid at `data/raw/terraformed/` as a Cesium imagery layer. Cesium's `TileMapServiceImageryProvider` handles all LOD logic natively — as the user zooms in, it requests progressively deeper tile levels. The change is ~3 lines of code; the concerns are more interesting than the implementation.

## What We Have

| Asset | Status |
|-------|--------|
| TMS tile pyramid | ✅ `data/raw/terraformed/`, levels 0–8, 256×256 PNG, EPSG:4326 |
| Folder offset fix | ✅ Directories renamed (old level 1 → 0, etc.) to match Cesium's `GeographicTilingScheme` |
| `tilemapresource.xml` | ✅ Updated to reflect levels 0–8 |
| Cesium viewer | ✅ Already configured with MOLA terrain + contour lines |

## Implementation

Two changes to [`src/main.js`](../../src/main.js):

### Change 1 — Enable the globe mesh (line 57)

```js
// before
viewer.scene.globe.show = false;

// after
viewer.scene.globe.show = true;
```

**Why:** `globe.show = false` suppresses rendering of the 3D terrain surface entirely. The terrain provider still exists and provides height data (which is why contour line positioning works), but nothing is drawn. Setting to `true` makes the terrain mesh render — which is what imagery gets draped onto.

### Change 2 — Add imagery provider (after line 57)

```js
const imageryProvider = await Cesium.TileMapServiceImageryProvider.fromUrl('/data/raw/terraformed/');
viewer.imageryLayers.addImageryProvider(imageryProvider);
```

**Line 1:** `fromUrl` is an async factory. It fetches `tilemapresource.xml`, reads the tile layout (9 levels, bounds, geodetic profile, 256×256 PNG), and returns a configured provider.

**Line 2:** Registers the provider as an imagery layer on the globe. From this point Cesium handles everything each frame: frustum culling, zoom-level selection, tile fetching, caching, compositing.

No wrapper needed. Matches the existing top-level `await` pattern on lines 4 and 78.

## Concerns

### ⚠️ P1 — Contour color clash

The existing contours use `elevationToColor()` — a violet→red hue gradient mapped to elevation. Casey Handmer's relief imagery uses its own color scheme for the same data. Both will be visible simultaneously once the globe is shown.

**Risk:** Two competing color encodings of the same elevation data = visual noise.

**Options (pick one before or after seeing it):**
- **A. Keep both** — let them fight; contour lines may actually look good as outlines over the imagery. Try this first.
- **B. Neutral contours** — change contour color to white or off-white semi-transparent. Cleaner, lets imagery speak.
- **C. Toggle** — add a second button to show/hide contours independently.

### ⚠️ P2 — Terrain lighting

With `globe.show = true`, Cesium's globe applies its default lighting model. `viewer.scene.sun.show = false` hides the sun *widget* but may not disable globe lighting — Cesium could still compute day/night shading based on a fake Earth-date sun position, making half the globe dark.

**Fix if needed:**
```js
viewer.scene.globe.enableLighting = false;
```

This forces uniform ambient lighting. Add it alongside the other globe config lines.

### ⚠️ P2 — Imagery warping under vertical exaggeration

The terrain mesh is exaggerated 100× by default (`verticalExaggeration = 100`). Imagery is draped flat onto whatever mesh Cesium renders. On steep slopes at 100× exag, tiles will appear compressed/stretched along the vertical axis.

**Not a bug** — this is correct behavior for an exaggerated globe. The "True shape" toggle (exag = 1) will look better. Worth knowing so it doesn't surprise you.

### ⚠️ P2 — depthTestAgainstTerrain stays false

Currently `viewer.scene.globe.depthTestAgainstTerrain = false` (line 72). This was set so contour lines don't get depth-occluded by the terrain surface and disappear. With globe.show now `true`, contour lines that are geometrically behind the globe surface will still render through it.

**Acceptable tradeoff:** The alternative (`true`) risks z-fighting artifacts where contour lines sit exactly at terrain elevation. Keeping `false` is the right call for now.

### ℹ️ P3 — Max resolution is level 8, not 9

Old level 9 (the highest resolution, ~0.00137 deg/px ≈ 150m/px) was discarded when the old level 0 overview tile was archived. Max resolution is now level 8 (~0.00274 deg/px ≈ 300m/px).

**Not a problem:** 300m/px is still very high resolution. Level 9 can be recovered later if needed by re-running the tile generation pipeline.

### ℹ️ P3 — Y-axis handled automatically

TMS convention has Y=0 at the south. Cesium's `TileMapServiceImageryProvider` detects the `geodetic` profile in `tilemapresource.xml` and flips Y automatically. No intervention needed.

## Acceptance Criteria

- [ ] 3D terrain surface is visible with imagery draped on it
- [ ] Zooming in loads progressively higher-detail tiles (visible as sharper imagery)
- [ ] Exaggeration toggle still works (terrain mesh + imagery both respond)
- [ ] No console 404s for tile requests (spot-check network tab)
- [ ] Globe lighting is uniform — no dark hemisphere

## Files Changed

| File | Change |
|------|--------|
| [`src/main.js`](../../src/main.js) | `globe.show = true`, add 2 imagery provider lines, optionally add `enableLighting = false` |

## References

- [Cesium TileMapServiceImageryProvider docs](https://cesium.com/learn/cesiumjs/ref-doc/TileMapServiceImageryProvider.html)
- [`data/raw/terraformed/tilemapresource.xml`](../../data/raw/terraformed/tilemapresource.xml)
- PRD Tier 2: Casey Handmer relief imagery — [`PRD.md:59`](../../PRD.md)
