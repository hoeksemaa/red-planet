# Explore Mars — Data Pipeline Playbook

## Philosophy

All data processing happens offline, before the app runs. The app never transforms raw data at runtime.

- **Raw data** lives in `data/raw/` — original source files, never modified.
- **Processed data** lives in `data/processed/` — the exact format the app consumes.
- Scripts are one-shot converters: raw → processed. Run them once, commit the output (if small enough), never run at startup.
- Activate the venv before running any script: `source .venv/bin/activate`

---

## Layer Data Formats

### Terrain (`data/processed/MOLA/mola_16ppd.f32`)

**What it is:** MOLA elevation data resampled to 16 pixels-per-degree.

**Raw source:** `data/raw/MOLA/megt90n000eb.img`
- Format: big-endian int16, 2880 rows × 5760 cols
- Coverage: global (90°N to 90°S, 0°E to 360°E)

**Processing script:** `scripts/altitude-to-png.py`
- Reads raw `.img` as `dtype=">i2"`, reshapes to (2880, 5760)
- 4× mean-pool downsample → (720, 1440) = `HM_H × HM_W`
- Casts to float32, writes as raw binary (no header)

**Output format:** `data/processed/MOLA/mola_16ppd.f32`
- Encoding: little-endian float32, row-major
- Dimensions: 1440 × 720 (HM_W × HM_H from `src/constants.ts`)
- Row 0 = 90°N, col 0 = 0°E (lon wraps: -180..+180 input maps to 0-360° internally)
- Values: elevation in meters above MOLA areoid

**Cesium consumer:** `CustomHeightmapTerrainProvider` — `sampleMOLA(lon, lat)` looks up pixel via bilinear indexing.

**TypeScript data contract:**
```ts
interface TerrainData {
  heights: Float32Array;  // length = HM_W * HM_H (1,036,800 floats)
  width: number;          // 1440
  height: number;         // 720
}
```

---

### Imagery tiles (`data/raw/terraformed/{z}/{x}/{y}.png`)

**What it is:** Color shaded-relief of Mars, tiled for the web. Casey Handmer's render of the Murray Lab CTX mosaic.

**Raw source:** `data/raw/terraformed/` — already a complete gdal2tiles output.
- TMS geodetic profile (`EPSG:4326`), 256×256 PNG tiles
- Zoom levels 0–8 (declared in `tilemapresource.xml`, files confirmed on disk)
- Full-planet coverage: −180..+180°, −90..+90°

**Processing:** None needed — tiles are already in final form. To serve from `data/processed/`, symlink or copy:
```bash
ln -s ../../raw/terraformed data/processed/imagery/terraformed
```

**Output format:** XYZ/TMS tiles — `{z}/{x}/{y}.png`, geodetic scheme.

**Cesium consumer:** `TileMapServiceImageryProvider` — reads `tilemapresource.xml` automatically.
```ts
const imagery = await Cesium.TileMapServiceImageryProvider.fromUrl(
  '/data/raw/terraformed/',
  {
    fileExtension: 'png',
    tilingScheme: new Cesium.GeographicTilingScheme(),  // REQUIRED — default is WebMercator
    maximumLevel: 8,
  }
);
```

**TypeScript data contract:** No prefetch — Cesium fetches tiles lazily. Layer `init()` just creates the provider.
```ts
interface ImageryLayerConfig {
  urlTemplate: string;     // base URL to tilemapresource.xml directory
  maximumLevel: number;    // 8
}
```

---

### Contour lines (`data/processed/MOLA/contours.geojson`)

**What it is:** Elevation contours derived from MOLA terrain at fixed intervals.

**Raw source:** `data/processed/MOLA/mola_16ppd.f32` (terrain is the input)

**Processing script:** `scripts/generate-contours.py` *(to be written)*
- Input: `mola_16ppd.f32`
- Algorithm: marching squares on the float32 grid at elevation intervals (e.g. every 1000m)
- Output: GeoJSON FeatureCollection\<MultiLineString\>

**Output format:** `data/processed/MOLA/contours.geojson`
- Type: `FeatureCollection<MultiLineString>`
- Property per feature: `{ "elevation": <number> }` (meters)
- Current file has 30 features (pre-generated; provenance of original generation script unknown)

**Cesium consumer:** `GroundPolylinePrimitive` (renders on terrain surface) or `GeoJsonDataSource.load()`.

**TypeScript data contract:**
```ts
import type { FeatureCollection, MultiLineString } from 'geojson';

interface ContoursData {
  geojson: FeatureCollection<MultiLineString, { elevation: number }>;
}
```

---

### Nomenclature points (`data/processed/nomenclature/features.geojson`)

**What it is:** IAU-approved Mars place names (craters, valles, montes, etc.) with coordinates.

**Raw source:** `data/raw/nomenclature/MARS_nomenclature_center_pts.kmz` *(assumed — original conversion script not committed)*

**Processing script:** `scripts/kmz-to-geojson.py` *(to be written)*
- Input: the `.kmz` file
- Output: GeoJSON FeatureCollection\<Point\> with properties below

**Output format:** `data/processed/nomenclature/features.geojson`
- Type: `FeatureCollection<Point>`
- 2046 features
- Properties: `name`, `feature_type`, `diameter_km`, `link`, `code`, `quad_name`, `origin`

**Cesium consumer:** `LabelCollection` / `BillboardCollection`, or `GeoJsonDataSource.load()` with custom styling. Labels appear at zoom-dependent distances.

**TypeScript data contract:**
```ts
import type { FeatureCollection, Point } from 'geojson';

interface NomenclatureData {
  geojson: FeatureCollection<Point, {
    name: string;
    feature_type: string;
    diameter_km: number;
    link: string;
    code: string;
    quad_name: string;
    origin: string;
  }>;
}
```

---

## Layer Interface (for RP-4 arch refactor)

Each layer owns its data. No shared bag. Pattern:

```ts
// src/features/types.ts
export interface Layer {
  readonly id: string;
  readonly name: string;
  init(viewer: Cesium.Viewer): Promise<void>;  // fetch own data, mount primitives
  show(): void;
  hide(): void;
  destroy(): void;
}
```

Data URL constants belong in `src/constants.ts`:
```ts
export const TERRAIN_DATA_URL      = '/data/processed/MOLA/mola_16ppd.f32';
export const CONTOURS_DATA_URL     = '/data/processed/MOLA/contours.geojson';
export const NOMENCLATURE_DATA_URL = '/data/processed/nomenclature/features.geojson';
export const IMAGERY_BASE_URL      = '/data/raw/terraformed/';
```

App state is separate from data:
```ts
// src/state.ts
export interface AppState {
  exaggeration: 1 | typeof EXAGGERATION_SCALE;
  layers: Record<string, boolean>;  // layerId -> visible
}
```

---

### Rover traverses (`data/processed/rovers/`)

**What it is:** Rover traverse paths and per-drive waypoints for Perseverance and Curiosity.

**Raw source:** NASA MMGIS GeoJSON endpoints (fetched at script runtime — no raw files stored)
- Perseverance: `https://mars.nasa.gov/mmgis-maps/M20/Layers/json/M20_traverse.json`
- Curiosity: `https://mars.nasa.gov/mmgis-maps/MSL/Layers/json/MSL_traverse.json`

**Processing script:** `scripts/rovers/fetch_rovers.py`
- Downloads traverse GeoJSON from each MMGIS endpoint
- Flattens all drive segments into one LineString per rover (2D, elevation dropped)
- Extracts one waypoint per sol (Perseverance) or samples every N coords (Curiosity — no sol data)
- Writes two output files

**Output files:**
- `traverse.geojson` — `FeatureCollection<LineString>`, one feature per rover
  - Properties: `rover` (display name), `id` (perseverance|curiosity), `color` (hex)
- `images.geojson` — `FeatureCollection<Point>`, one feature per drive waypoint
  - Properties: `rover`, `id`, `sol` (int or null), `color`

**Cesium consumer:** `GroundPolylinePrimitive` (traverse lines) + `PointPrimitiveCollection` (waypoint pins)

**TypeScript data contract:**
```ts
// Fetched inside features/rovers.ts init() — not passed through FeatureData
const ROVER_TRAVERSE_URL = '/data/processed/rovers/traverse.geojson';
const ROVER_IMAGES_URL   = '/data/processed/rovers/images.geojson';
```

---

## Adding a New Dataset

Checklist for adding a new layer:

1. Place raw source in `data/raw/<dataset-name>/`
2. Write a script in `scripts/` that produces the output format
3. Add the output to `data/processed/<dataset-name>/`
4. Document this file: raw source, script name, output format spec, TypeScript contract
5. Add the data URL constant to `src/constants.ts`
6. Implement a layer file in `src/features/<name>.ts` following the `Layer` interface
7. Register it in `src/features/registry.ts`
