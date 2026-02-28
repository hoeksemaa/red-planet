---
title: Rover Photo Icons
type: decision
date: 2026-02-28
---

# Rover Photo Icons

Clickable camera icons on the globe that show curated rover photographs with GPS coordinates.

---

## Architecture

Photos live inside the existing `rovers` feature — no separate feature registration, no new layer state. They share the rover layer toggle (`state.layers.rovers`).

The `pick()` return type is a discriminated union: `RoverPickResult = RoverPinEntry | RoverPhotoEntry`. The `kind` field (`'pin'` | `'photo'`) tells `main.ts` which UI panel to show.

### Data flow

```
CURATED_PHOTOS (hardcoded) → BillboardCollection → pick() → main.ts onPick → ui.showRoverPhotoInfo()
```

### Key files

- `src/features/rovers.ts` — types, camera canvas, photo billboard creation, pick discrimination
- `src/main.ts` — routes `kind: 'photo'` picks to `ui.showRoverPhotoInfo()`
- `src/ui.ts` — `showRoverPhotoInfo()` / `hideRoverPhotoInfo()` + mutual exclusion with all other panels
- `index.html` — `#roverPhotoPanel` markup (id prefix: `rph`)
- `src/ui.css` — panel styles for `#roverPhotoPanel`

---

## How to add a new rover photo

### 1. Choose a photo and find its coordinates

You need: a rover name, a sol number, a camera name, and the lat/lon where it was taken.

**Coordinates come from the existing waypoint data.** Open `data/processed/rovers/images.geojson` and find the entry for the rover + sol you want. Each feature has `geometry.coordinates: [lon, lat]` and `properties.sol`. Use those coordinates directly.

If the photo was taken on a sol that isn't in `images.geojson` (i.e., no waypoint exists for that sol), pick the nearest sol that does have a waypoint — the rover doesn't move far between adjacent sols.

For Perseverance and Curiosity, NASA's MMGIS waypoint files are the authoritative source:
- Perseverance: `https://mars.nasa.gov/mmgis-maps/M20/Layers/json/M20_waypoints.json`
- Curiosity: `https://mars.nasa.gov/mmgis-maps/MSL/Layers/json/MSL_waypoints.json`

Spirit, Opportunity, Zhurong, and Sojourner only have single landing-site pins in `images.geojson` (sol: null). Photos for these rovers all go at their landing site coordinates.

### 2. Get the image file

Download the photo and place it in `public/images/rover-photos/`. Use a descriptive filename like `perseverance-selfie-ingenuity.jpg`.

**Where to find rover photos:**

- **Curated galleries** (best for selfies/panoramas — pre-stitched composites):
  - Perseverance: `https://mars.nasa.gov/mars2020/multimedia/images/`
  - Curiosity: `https://mars.nasa.gov/msl/multimedia/images/`
  - All rovers: `https://science.nasa.gov/mission/mars-2020-perseverance/multimedia/images/`

- **Raw images** (individual camera frames, not composites):
  - Perseverance: `https://mars.nasa.gov/mars2020/multimedia/raw-images/`
  - Curiosity: `https://mars.nasa.gov/msl/multimedia/raw-images/`

- **JPL Photojournal** (high-res processed images with PIA catalog numbers):
  - `https://photojournal.jpl.nasa.gov/`
  - Search by mission name, get direct JPEG links

All NASA Mars images are public domain. No attribution required.

**Note on selfies:** Rover selfies are composites of dozens of arm-camera (MAHLI/WATSON) images stitched by JPL. They only exist in the curated galleries, not as single raw frames. Search the curated gallery for "selfie" to find them.

### 3. Add the entry to `CURATED_PHOTOS`

In `src/features/rovers.ts`, add to the `CURATED_PHOTOS` array:

```ts
const CURATED_PHOTOS: Omit<RoverPhotoEntry, 'kind'>[] = [
  // ... existing entries ...
  {
    rover: 'Curiosity',           // human-readable name (must match ROVER_META key casing)
    id: 'curiosity',              // lowercase id (must match ROVER_COLORS key)
    sol: 3070,                    // Martian sol number
    camera: 'MAHLI',              // camera instrument name
    caption: 'Description of what the photo shows.',
    imageUrl: '/images/rover-photos/curiosity-mont-mercou.jpg',
    lon: 137.3708,                // from images.geojson or MMGIS waypoints
    lat: -4.6692,                 // from images.geojson or MMGIS waypoints
  },
];
```

That's it. The billboard, pick handling, and UI panel are all driven by this array. No other code changes needed.

### 4. Verify

1. `npm run dev`
2. Zoom to the rover's traverse
3. Camera icon should appear floating above the waypoint dots at the specified coordinates
4. Click it → photo panel shows image, sol, camera, latitude, longitude, caption
5. Click a rover dot → rover panel replaces photo panel (mutual exclusion works)
6. Click empty space → all panels dismiss
7. Toggle "Rover traverses" layer off → camera icon disappears with the dots

---

## Camera icon rendering

The camera icon is a 24x24 canvas drawn at runtime, colored per-rover (matches `ROVER_COLORS`). It renders as a white circle with a colored camera glyph (body, lens, viewfinder). The `makeCameraCanvas()` function in `rovers.ts` produces these.

Billboard properties that make photos visually distinct from waypoint dots:
- `verticalOrigin: BOTTOM` + `pixelOffset: (0, -8)` — floats above the dot at the same position
- 24x24 canvas vs 14x14 for dots — inherently larger
- Camera glyph vs solid circle — different shape

---

## NASA API reference (for future automation)

Currently photos are manually curated. If you want to automate discovery:

- **`api.nasa.gov/mars-photos/api/v1/rovers/{rover}/photos`** — simple gallery API. Returns image URLs by sol and camera. **No coordinates.** Rate limit: 1000 req/hr with API key.
- **`mars.nasa.gov/rss/api/`** — raw images API with richer metadata (site, drive, xyz in local frame, camera model). **No lat/lon directly**, but site+drive can be joined to MMGIS waypoints.
- **MMGIS waypoints JSON** — maps (site, drive) → (lat, lon). This is the bridge between the raw images API and geographic coordinates.

The join strategy: query raw images API for a (rover, sol) → get site+drive → look up lat/lon in waypoints JSON. The existing `scripts/rovers/fetch_rovers.py` already processes MMGIS data into `images.geojson`.

---

## Panel ID convention

All info panels use a two-letter prefix for their DOM element IDs:
- `fp` = feature panel (places)
- `rp` = rover panel
- `rph` = rover photo panel
- `sp` = satellite panel

The `rph` prefix follows this pattern. The panel markup lives in `index.html` inside `#searchWrap`, and the show/hide methods live in `src/ui.ts`.

Every `show*` method must call `hide*` on all other panels (mutual exclusion). Every new panel must also be hidden in:
- `searchClear` click handler
- `renderer.onPickMiss()` callback in `main.ts`
