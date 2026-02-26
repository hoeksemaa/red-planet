# RP-16: Spike: data pipeline conventions + FeatureData refactor

## Context

This spike runs alongside RP-4 (arch refactor). RP-4 depends on the decisions made here.
`state.ts` and `FeatureData` do not exist yet — this spike designs the contracts RP-4 will implement.

Current codebase state (as of planning):
- `src/main.ts` — 73 lines, single monolith, terrain fetch inline at module top-level
- `src/constants.ts` — 10 lines of magic numbers
- `scripts/altitude-to-png.py` — only existing processing script (MOLA .img → .f32)
- No `features/` dir, no `state.ts`, no `scripts/README.md`

Actual processed data on disk:
- `data/processed/MOLA/mola_16ppd.f32` — 4.1MB, 1440×720 float32, row-major, north-up, 0-360E lon
- `data/processed/MOLA/contours.geojson` — FeatureCollection<MultiLineString>, 30 features, prop: `{ elevation: number }`
- `data/processed/nomenclature/features.geojson` — FeatureCollection<Point>, 2046 features
- `data/raw/terraformed/` — XYZ tile tree, `{z}/{x}/{y}.png` + `.kml` sidecars

---

## Deliverable A — Canonical processed data formats per layer type

### Terrain
- Raw: `data/raw/MOLA/megt90n000eb.img` (big-endian int16, 2880×5760)
- Script: `scripts/altitude-to-png.py` (4x mean-pool downsample, cast float32, raw binary output)
- Processed: `data/processed/MOLA/mola_16ppd.f32`
  - Dimensions: 1440 × 720 (HM_W × HM_H from constants.ts)
  - Encoding: little-endian float32, row-major, row 0 = 90°N, col 0 = 0°E
- Cesium consumer: `CustomHeightmapTerrainProvider` callback via `sampleMOLA`
- TypeScript data contract:
  ```ts
  interface TerrainData { heights: Float32Array; width: number; height: number; }
  ```

### Imagery (XYZ tiles)
- Raw: `data/raw/terraformed/{z}/{x}/{y}.png` (already tiled)
- Processing: copy/symlink to `data/processed/imagery/terraformed/{z}/{x}/{y}.png`
- No prefetch — Cesium tile machinery requests lazily via URL template
- Cesium consumer: `UrlTemplateImageryProvider`
- TypeScript data contract:
  ```ts
  interface ImageryLayerConfig { urlTemplate: string; minimumLevel?: number; maximumLevel?: number; }
  ```

### Vector lines (contours)
- Processed: `data/processed/MOLA/contours.geojson`
  - Type: `FeatureCollection<MultiLineString>`, prop per feature: `{ elevation: number }`
- Cesium consumer: `GroundPolylinePrimitive` or `GeoJsonDataSource.load()`
- TypeScript data contract:
  ```ts
  interface ContoursData {
    geojson: GeoJSON.FeatureCollection<GeoJSON.MultiLineString, { elevation: number }>;
  }
  ```

### Points (nomenclature / labels)
- Processed: `data/processed/nomenclature/features.geojson`
  - Type: `FeatureCollection<Point>`, props: `{ name, feature_type, diameter_km, link, code, quad_name, origin }`
- Cesium consumer: `BillboardCollection` + `LabelCollection`, or `GeoJsonDataSource.load()`
- TypeScript data contract:
  ```ts
  interface NomenclatureData {
    geojson: GeoJSON.FeatureCollection<GeoJSON.Point, {
      name: string; feature_type: string; diameter_km: number;
      link: string; code: string; quad_name: string; origin: string;
    }>;
  }
  ```

---

## Deliverable B — Layer interface design

No shared FeatureData bag. Each layer holds loaded data as private module-scope state.

```ts
// src/features/types.ts (RP-4 will create this)
export interface Layer {
  readonly id: string;
  readonly name: string;
  init(viewer: Cesium.Viewer): Promise<void>;  // fetches own data, mounts primitives
  show(): void;
  hide(): void;
  destroy(): void;
}
```

Design decisions:
1. `init()` is async — fetches internally. Registry calls `await layer.init(viewer)` or `Promise.all`.
2. Data URL constants go in `src/constants.ts`:
   - `TERRAIN_DATA_URL`, `CONTOURS_DATA_URL`, `NOMENCLATURE_DATA_URL`, `IMAGERY_TILE_TEMPLATE`
3. Imagery `init()` creates `UrlTemplateImageryProvider` directly — no prefetch.
4. `AppState` (RP-4's concern):
   ```ts
   export interface AppState {
     exaggeration: 1 | typeof EXAGGERATION_SCALE;
     layers: Record<string, boolean>;  // layerId -> visible
   }
   ```

---

## Deliverable C — `scripts/README.md` outline

Sections: Philosophy, Terrain, Contour lines, Nomenclature points, Imagery tiles, Adding a New Dataset.

---

## Files

**This spike ships:** `scripts/README.md`

**Feeds into RP-4 (do NOT implement here):** `src/features/types.ts`, `src/state.ts`, data URL additions to `src/constants.ts`

## Acceptance criteria

1. `scripts/README.md` exists — covers all four layer types with format specs, script names, input/output paths, runtime consumers.
2. Layer interface design is recorded in this plan for RP-4 to consume.
3. "What format does this layer expect?" is answerable by reading `scripts/README.md` alone.
