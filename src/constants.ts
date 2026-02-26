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

// OPM real Mars imagery (XYZ tiles, Web Mercator, zoom 0–6)
export const OPM_IMAGERY_URL = 'http://s3-eu-west-1.amazonaws.com/whereonmars.cartodb.net/celestia_mars-shaded-16k_global/{z}/{x}/{y}.png';

// Rover traverse + waypoint data (NASA MMGIS, processed by scripts/rovers/fetch_rovers.py)
export const ROVER_TRAVERSE_URL = '/data/processed/rovers/traverse.geojson';
export const ROVER_IMAGES_URL   = '/data/processed/rovers/images.geojson';
