# Google Mars — PRD

## One-liner

TL;DR: google maps for Mars.

Interactive 3D Mars globe built from MOLA elevation data with topographic contour lines, terrain imagery, and searchable NASA surface features in Three.js.

---

## What You're Building

A browser-based 3D Mars globe using real elevation data. Three tiers of functionality, each building on the last.

## New Technology / Skills

- **Three.js** — first major project
- **Spherical mesh from elevation data** — mapping rectangular MOLA data onto a sphere
- **Equirectangular-to-sphere projection** — 2D data grids onto 3D spherical geometry
- **Tiled imagery overlay** — mapping Casey Handmer's R2-hosted relief tiles onto the globe
- **NASA data ingestion** — scraping/parsing planetary nomenclature databases into structured JSON

---

## Tier 1 — MVP

Dynamic 3D mesh of Mars. This is the portfolio-ready core.

### Features

1. **3D Mars mesh from MOLA data** — sphere geometry with vertex displacement from real elevation
2. **Topographic contour lines** — rendered on the surface at regular elevation intervals
3. **Altitude slider** - normal elevation vs exaggerated elevation 
4. **Smooth animated transitions** between exaggeration levels
5. **Orbit controls** — rotate, zoom, pan
6. **Clean, minimal UI**

### Non-Goals (for MVP)

- No image texture overlays
- No search / data overlays
- No backend, accounts, or persistence
- No relief shading or lighting effects

### Data Pipeline

1. Download MOLA MEGDRs from NASA PDS
2. Preprocess offline: downsample to browser-tractable resolution, export as heightmap PNG or binary float array
3. At runtime: load heightmap, generate sphere, displace vertices, compute contour lines

---

## Tier 2 — Full Feature: Mars Google Maps

Image overlays + searchable NASA surface data. The "actually useful" version.

### Features

1. **Casey Handmer relief imagery** — map the 7m-resolution tiled relief images onto the globe. Source: tiled KML/image set hosted on R2 (`pub-3c6ee3900f804513bd3b2a3e4df337bd.r2.dev`), derived from Murray Lab 5m CTX mosaic.
2. **NASA surface feature database** — scrape/download Mars named features (craters, mountains, landing sites, rovers, etc.) with coordinates from NASA's planetary nomenclature database (IAU Gazetteer of Planetary Nomenclature / PDS). Export as a local JSON file.
3. **Searchable toolbar** — clean search UI for browsing and filtering NASA data points by name, type, or region. Selecting a feature flies the camera to its coordinates on the globe.
4. **Feature markers** — visual pins/labels on the globe surface for NASA data points

### Data Sources

| Source | What | Format |
|--------|------|--------|
| Casey Handmer / Murray Lab | 7m colored shaded relief tiles | Tiled KML → image tiles on R2 |
| IAU Gazetteer of Planetary Nomenclature | Named features, coordinates, types | Scrape → JSON |
| NASA PDS / USGS | Landing sites, rover positions | Scrape → JSON |

### Architecture Notes

- The Handmer tiles are already hosted and tiled for LOD via KML NetworkLinks. At minimum, fetch top-level tiles for full-globe coverage; ideally implement LOD tile loading as the user zooms.
- NASA feature JSON should be a static build artifact — scrape once, commit the JSON, serve statically. No runtime scraping.

---

## Tier 3 — Stretch Goals (Ordered)

Everything below is nice-to-have. Ordered roughly by impact/feasibility.

1. **Relief shading** — bathymetric-style light/shadow to emphasize terrain
2. **Image/color/data overlay system** - map equirectangular images onto the globe (satellite, color by mineral, rover sites, location names, etc.)
3. **Basin analysis** — precomputed drainage basin boundaries from elevation gradients
4. **Higher-res mesh / LOD** — level-of-detail system for zoom (tile-based mesh, not just imagery)
5. **Fine-grained camera controls** — pan/tilt away from central sphere point to see into valleys and canyons
6. **Pin dropping with user accounts** — auth, database, persistent user-created pins
7. **Hand-drawn cartographic style** — Tolkien-inspired shader/post-processing (research project)

---

## Done When

### Tier 1 (MVP)
- Visitor opens a URL, sees a 3D Mars globe
- Contour lines are visible on the surface
- Exaggeration slider works with smooth animation
- Looks clean enough for a portfolio
- Loads in under 5 seconds

### Tier 2 (Full Feature)
- Casey Handmer relief imagery is mapped onto the globe
- NASA surface features are loaded from static JSON
- User can search features by name/type and fly to them on the globe
- Searchable toolbar is clean and responsive

---

## References

- [Casey Handmer — Global Terrain Map of Mars at 7m Resolution](https://caseyhandmer.wordpress.com/2024/02/16/global-terrain-map-of-mars-at-7-m-resolution/)
- [contours.org.uk bathymetry 3D](http://contours.org.uk/bathymetry/ness/3d/) — contour line aesthetic
- [longitude.one](https://www.longitude.one/other-maps) — 3D relief rendering
- [Murray Lab CTX Mosaic](https://murray-lab.caltech.edu/CTX/) — high-res Mars imagery (stretch)
- [Tolkien Estate Maps](https://www.tolkienestate.com/painting/maps/) — hand-drawn cartographic inspiration (stretch)
- [IAU Gazetteer of Planetary Nomenclature](https://planetarynames.wr.usgs.gov/) — Mars named features database
