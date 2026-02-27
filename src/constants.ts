// MOLA heightmap dimensions (post-downsample to 16ppd)
export const HM_W = 1440;
export const HM_H = 720;

// Tile size for CustomHeightmapTerrainProvider
export const TERRAIN_TILE_SIZE = 32;

// Vertical exaggeration multiplier (binary toggle: 1 or this)
export const EXAGGERATION_SCALE = 100;

// Starting camera altitude in meters
export const INITIAL_CAMERA_HEIGHT = 6_000_000;

// Data URLs
export const TERRAIN_DATA_URL      = '/data/processed/MOLA/mola_16ppd.f32';
export const CONTOURS_DATA_URL     = '/data/processed/MOLA/contours.geojson';
export const NOMENCLATURE_DATA_URL = '/data/processed/nomenclature/features.geojson';
export const IMAGERY_BASE_URL      = '/data/raw/terraformed/';

// OPM viking_mdim21_global imagery (XYZ tiles, Web Mercator) — fetched via scripts/fetch_viking.py
export const VIKING_IMAGERY_URL = '/data/raw/viking/{z}/{x}/{reverseY}.png';

// Rover traverse + waypoint data (NASA MMGIS, processed by scripts/rovers/fetch_rovers.py)
export const ROVER_TRAVERSE_URL = '/data/processed/rovers/traverse.geojson';
export const ROVER_IMAGES_URL   = '/data/processed/rovers/images.geojson';

// Camera altitude for fly-to based on feature diameter
export function flyToAltitude(diameterKm: number): number {
  if (diameterKm >= 500) return 1_500_000;
  if (diameterKm >= 100) return 500_000;
  if (diameterKm >= 10) return 200_000;
  return 100_000;
}
