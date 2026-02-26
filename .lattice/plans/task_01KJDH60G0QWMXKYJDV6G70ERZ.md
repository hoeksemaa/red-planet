# RP-13: Research rover data sources — FINDINGS

## Perseverance (Jezero, 2021–present)

| Data | Format | URL | Notes |
|---|---|---|---|
| Traverse path | GeoJSON | `https://mars.nasa.gov/mmgis-maps/M20/Layers/json/M20_traverse.json` | **Verified live** (HTTP 200, 1.5 MB). No auth. Updates with each drive. Properties: sol, lat/lon, dist_m. |
| Traverse (community mirror) | GeoJSON | `https://github.com/stiles/mars-perseverance-waypoints` | `path.geojson` + `points.geojson`, updated hourly from NASA feed. |
| Per-image coords | PDS4 XML sidecar | `https://pds-imaging.jpl.nasa.gov/volumes/mars2020.html` | Each image has `.xml` with SPICE-derived lat/lon. **NASA Rover Photos API gives zero location data.** |
| Panoramas | TIFF/PNG + PDS4 XML | `https://pds-imaging.jpl.nasa.gov/volumes/mars2020.html` | Mastcam-Z mosaic products include location. Also `https://mastcamz.asu.edu/mastcam-z-data-for-all/` |

## Curiosity (Gale, 2012–present)

| Data | Format | URL | Notes |
|---|---|---|---|
| Traverse path | GeoJSON (likely) | `https://mars.nasa.gov/mmgis-maps/MSL/Layers/json/MSL_traverse.json` | **Unverified** — inferred from same MMGIS system (Mars MMGIS confirmed). Verify with HTTP GET. |
| Traverse (SPICE) | Binary SPK kernels | `https://naif.jpl.nasa.gov/pub/naif/pds/data/msl-m-spice-6-v1.0/` | Extract with SpiceyPy. See `https://andrewannex.com/post/spiceypy_msl_example/` |
| Per-image coords | PDS3/4 image labels | `https://pds-imaging.jpl.nasa.gov/volumes/msl.html` | SPICE-derived geometry in label files. ~800k images. |

## Opportunity (Meridiani, 2004–2018)

| Data | Format | URL | Notes |
|---|---|---|---|
| Traverse path | ASCII CSV | `https://an.rsl.wustl.edu/mera/AN/pages/mer/mer_traverse.htm` | ~5,352 sols. Columns: site, drive, sol, easting, northing (local site frame). Needs conversion to areocentric lat/lon using site origin from PDS docs. |
| Per-image coords | PDS3 `.lbl` labels | `https://pds-imaging.jpl.nasa.gov/volumes/mer.html` | `GROUP = ROVER_STATE` contains lat/lon. ~340k images (both MERs). |

## Spirit (Gusev, 2004–2010)

| Data | Format | URL | Notes |
|---|---|---|---|
| Traverse path | ASCII CSV | `https://an.rsl.wustl.edu/mer/` (Spirit section) | Same format as Opportunity. ~2,208 sols. |
| Per-image coords | PDS3 `.lbl` labels | `https://pds-imaging.jpl.nasa.gov/volumes/mer.html` | Shared MER archive. |

## Sojourner (Ares Vallis, 1997)

No clean machine-readable traverse file found. ~19 named waypoints, ~104 m total. Best approach: hardcode coords from Golombek et al. 1997 (Science 278:1743). SPICE kernels exist at `https://naif.jpl.nasa.gov/pub/naif/pds/MPF/` but 1997-era reconstruction is incomplete.

## Key Findings for RP-14 Implementation

1. **Perseverance**: Direct GeoJSON fetch — immediate, no processing needed
2. **Curiosity**: Likely same — verify with HTTP GET first
3. **Opportunity/Spirit**: Download Analyst's Notebook CSVs → convert local site frame → areocentric lat/lon using published site origins
4. **Sojourner**: Hardcode waypoints (~19 points)
5. **Per-image coords**: NASA Rover Photos API (`api.nasa.gov/mars-photos`) returns **zero location data** — image coordinates require PDS4 XML label parsing or SPICE extraction. Not trivial.
6. **Panoramas**: No centralized catalog with coordinates. Skip for MVP.
7. **trek.nasa.gov**: No vector GeoJSON download. Raster tiles only.
8. **Licensing**: All NASA PDS data is public domain.

## Recommendation for RP-14

Start with Perseverance + Curiosity MMGIS traverse JSONs (fast, clean). Process Opportunity/Spirit CSVs as second pass. Skip per-image coordinates and panoramas for initial layer — just traverse paths.
