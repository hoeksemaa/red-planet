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
export const TERRAIN_DATA_URL = '/data/processed/MOLA/mola_16ppd.f32';
export const CONTOURS_DATA_URL = '/data/processed/MOLA/contours.geojson';
export const NOMENCLATURE_DATA_URL = '/data/processed/nomenclature/features.geojson';
export const IMAGERY_BASE_URL = '/data/raw/terraformed/';

// OPM viking_mdim21_global imagery (XYZ tiles, Web Mercator) — fetched via scripts/fetch_viking.py
export const VIKING_IMAGERY_URL = '/data/raw/viking/{z}/{x}/{reverseY}.png';

// Rover traverse + waypoint data (NASA MMGIS, processed by scripts/rovers/fetch_rovers.py)
export const ROVER_TRAVERSE_URL = '/data/processed/rovers/traverse.geojson';
export const ROVER_IMAGES_URL = '/data/processed/rovers/images.geojson';

// ── Satellites ──────────────────────────────────────────────

// Radii for scaling orbital altitudes to the WGS84 globe
export const EARTH_RADIUS_KM = 6371;
export const MARS_RADIUS_KM = 3390;

// Time multiplier: 60 → MRO completes one orbit in ~112s wall time
export const SATELLITE_TIME_MULTIPLIER = 60;

export interface SatelliteElements {
    name: string;
    semiMajorAxisKm: number;
    eccentricity: number;
    inclinationDeg: number;
    raanDeg: number;
    argPeriapsisDeg: number;
    meanAnomalyDeg: number; // at epoch (arbitrary — offsets starting position)
    periodSeconds: number;
    color: string;
}

// Approximate Keplerian elements for active Mars orbiters
export const SATELLITES: SatelliteElements[] = [
    {
        name: 'MRO',
        semiMajorAxisKm: 3700, eccentricity: 0.01, inclinationDeg: 93,
        raanDeg: 45, argPeriapsisDeg: 270, meanAnomalyDeg: 0,
        periodSeconds: 112 * 60, color: '#FF6B35',
    },
    {
        name: 'Mars Odyssey',
        semiMajorAxisKm: 3793, eccentricity: 0.01, inclinationDeg: 93.1,
        raanDeg: 120, argPeriapsisDeg: 90, meanAnomalyDeg: 90,
        periodSeconds: 118 * 60, color: '#4FC3F7',
    },
    {
        name: 'MAVEN',
        semiMajorAxisKm: 6565, eccentricity: 0.46, inclinationDeg: 75,
        raanDeg: 200, argPeriapsisDeg: 150, meanAnomalyDeg: 45,
        periodSeconds: 270 * 60, color: '#AB47BC',
    },
    {
        name: 'Mars Express',
        semiMajorAxisKm: 9350, eccentricity: 0.57, inclinationDeg: 86.3,
        raanDeg: 310, argPeriapsisDeg: 340, meanAnomalyDeg: 180,
        periodSeconds: 402 * 60, color: '#66BB6A',
    },
    {
        name: 'TGO',
        semiMajorAxisKm: 3790, eccentricity: 0.01, inclinationDeg: 74,
        raanDeg: 80, argPeriapsisDeg: 45, meanAnomalyDeg: 120,
        periodSeconds: 118 * 60, color: '#FFA726',
    },
    {
        name: 'Tianwen-1',
        semiMajorAxisKm: 3790, eccentricity: 0.01, inclinationDeg: 87,
        raanDeg: 160, argPeriapsisDeg: 200, meanAnomalyDeg: 200,
        periodSeconds: 118 * 60, color: '#EF5350',
    },
    {
        name: 'Hope',
        semiMajorAxisKm: 33000, eccentricity: 0.45, inclinationDeg: 25,
        raanDeg: 260, argPeriapsisDeg: 10, meanAnomalyDeg: 300,
        periodSeconds: 55 * 3600, color: '#BDBDBD',
    },
];
