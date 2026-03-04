// ── UI ───────────────────────────────────────────────────────
// Keep in sync with --panel-transition in App.css
export const PANEL_TRANSITION_MS = 125;

// ── Data ─────────────────────────────────────────────────────
// MOLA heightmap dimensions (post-downsample to 16ppd)
export const HM_W = 1440;
export const HM_H = 720;

// Tile size for CustomHeightmapTerrainProvider
export const TERRAIN_TILE_SIZE = 32;

// Vertical exaggeration multiplier (binary toggle: 1 or this)
export const EXAGGERATION_SCALE = 100;

// Starting camera altitude in meters
export const INITIAL_CAMERA_HEIGHT = 24_000_000;

// Data URLs
export const TERRAIN_DATA_URL = '/data/processed/MOLA/mola_16ppd.f32';
export const CONTOURS_DATA_URL = '/data/processed/MOLA/contours.geojson';
export const NOMENCLATURE_DATA_URL = '/data/processed/nomenclature/features.geojson';

// Tile CDN — empty in dev (serves from local data/raw/), set to CloudFront domain in prod
const TILE_CDN = import.meta.env.VITE_TILE_CDN_URL ?? '';

export const IMAGERY_BASE_URL = `${TILE_CDN}/data/raw/terraformed/`;

// OPM viking_mdim21_global imagery (XYZ tiles, Web Mercator) — fetched via scripts/fetch_viking.py
export const VIKING_IMAGERY_URL = `${TILE_CDN}/data/raw/viking/{z}/{x}/{reverseY}.png`;

// Rover traverse + waypoint data (NASA MMGIS, processed by scripts/rovers/fetch_rovers.py)
export const ROVER_TRAVERSE_URL = '/data/processed/rovers/traverse.geojson';
export const ROVER_IMAGES_URL = '/data/processed/rovers/images.geojson';

// Camera altitude for fly-to based on feature diameter
export function flyToAltitude(diameterKm: number): number {
  if (diameterKm >= 500) return 1_500_000;
  if (diameterKm >= 100) return 500_000;
  if (diameterKm >= 10) return 200_000;
  return 100_000;
}

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
    description: string;
    imageUrl: string;
}

// Approximate Keplerian elements for active Mars orbiters
export const SATELLITES: SatelliteElements[] = [
    {
        name: 'MRO',
        semiMajorAxisKm: 3700, eccentricity: 0.01, inclinationDeg: 93,
        raanDeg: 45, argPeriapsisDeg: 270, meanAnomalyDeg: 0,
        periodSeconds: 112 * 60, color: '#FF6B35',
        description: 'The Mars Reconnaissance Orbiter carries HiRISE, the largest telescope ever flown on a deep-space mission — a 0.5-meter reflecting behemoth that resolves objects as small as a kitchen table from 300 km up. It has returned more data about Mars than every other spacecraft in history combined, imaging over 85% of the surface through its Context Camera alone.\n\nHiRISE has captured over 80,000 sub-meter-resolution images, fueling more than 2,000 peer-reviewed publications. Its portraits of dust devils mid-stride, avalanches cascading off polar scarps, and fresh impact craters appearing between orbits have transformed Mars from a static landscape into a dynamic, active world. It even spotted every rover and lander on the surface from orbit.\n\nBeyond imaging, MRO serves as the backbone of the Mars Relay Network, funneling data from Curiosity, Perseverance, and every other surface asset back to Earth at broadband speeds. Launched in August 2005, it provided the reconnaissance that chose the landing sites for Phoenix, Curiosity, InSight, and Perseverance — each one a bullseye thanks to MRO\'s maps.',
        imageUrl: '/images/mro.jpg',
    },
    {
        name: 'Mars Odyssey',
        semiMajorAxisKm: 3793, eccentricity: 0.01, inclinationDeg: 93.1,
        raanDeg: 120, argPeriapsisDeg: 90, meanAnomalyDeg: 90,
        periodSeconds: 118 * 60, color: '#4FC3F7',
        description: 'Arriving on October 24, 2001, Mars Odyssey is the longest-operating spacecraft at any planet other than Earth — over two decades of continuous science and counting. Its Gamma Ray Spectrometer made one of the most consequential discoveries in planetary science: vast reservoirs of hydrogen just below the surface, the unmistakable signature of shallow water ice extending across the polar regions.\n\nThat single detection rewrote the Mars exploration roadmap. NASA sent the Phoenix lander directly to the arctic plains Odyssey had flagged, where it dug into the soil and confirmed water ice exactly where predicted. Meanwhile, the THEMIS infrared camera mapped the largest known exposure of olivine-rich rock on Mars in Syrtis Major — minerals that decompose when wet, implying the planet has been cold and dry for billions of years.\n\nOdyssey has beamed back over 1.2 million images and served as an indispensable relay satellite for every surface mission since Spirit and Opportunity. It has completed over 60,000 orbits, each one a quiet lap around a planet it knows better than any other machine ever built.',
        imageUrl: '/images/mars-odyssey.png',
    },
    {
        name: 'MAVEN',
        semiMajorAxisKm: 6565, eccentricity: 0.46, inclinationDeg: 75,
        raanDeg: 200, argPeriapsisDeg: 150, meanAnomalyDeg: 45,
        periodSeconds: 270 * 60, color: '#AB47BC',
        description: 'MAVEN — Mars Atmosphere and Volatile EvolutioN — was built to answer one of the solar system\'s great cold cases: where did Mars\'s atmosphere go? Within weeks of arriving in September 2014, it caught oxygen, carbon, and hydrogen fleeing the planet in real time, stripped away molecule by molecule by the solar wind at roughly 100 grams per second.\n\nBy measuring isotope ratios of atmospheric argon — a noble gas that can only be removed by physical sputtering, not chemistry — MAVEN proved that at least 65% of Mars\'s original atmosphere has been lost to space over billions of years. As the planet\'s core cooled and its magnetic field collapsed, the solar wind carved away what was once a thick, warm envelope capable of sustaining liquid water on the surface.\n\nMAVEN also produced the first global wind map of any planet\'s upper atmosphere besides Earth, and caught a surprise guest: when Comet Siding Spring buzzed Mars in October 2014, MAVEN detected a transient layer of metal ions deposited by the comet\'s dust tail slamming into the ionosphere — an observation no one had planned for but everyone wanted.',
        imageUrl: '/images/maven.png',
    },
    {
        name: 'Mars Express',
        semiMajorAxisKm: 9350, eccentricity: 0.57, inclinationDeg: 86.3,
        raanDeg: 310, argPeriapsisDeg: 340, meanAnomalyDeg: 180,
        periodSeconds: 402 * 60, color: '#66BB6A',
        description: 'Mars Express is ESA\'s first mission to another planet, launched on June 2, 2003, and still going strong after more than 25,000 orbits. Its showpiece is MARSIS, a ground-penetrating radar whose antenna consists of three booms — two at 20 meters, one at 7 — made of Kevlar and glass fibre, giving the spacecraft a 40-meter wingspan that looks almost absurd against the Martian sky.\n\nIn July 2018, MARSIS delivered one of the decade\'s most electrifying findings: a subglacial lake roughly 20 km wide, buried 1.5 km beneath the south polar ice cap. It was the first known stable body of liquid water on Mars. Subsequent analysis revealed three additional underground ponds nearby, suggesting an entire hidden hydrological system lurking under the ice.\n\nThe High Resolution Stereo Camera has been quietly producing color imagery at 2-meter resolution and gorgeous 3D terrain models for two decades, while the spectrometers have mapped minerals that form only in the presence of water. A 2024 reanalysis of MARSIS data revealed that the Medusae Fossae Formation — a massive equatorial deposit long thought to be dry — actually contains enormous quantities of buried water ice.',
        imageUrl: '/images/mars-express.jpg',
    },
    {
        name: 'TGO',
        semiMajorAxisKm: 3790, eccentricity: 0.01, inclinationDeg: 74,
        raanDeg: 80, argPeriapsisDeg: 45, meanAnomalyDeg: 120,
        periodSeconds: 118 * 60, color: '#FFA726',
        description: 'The ExoMars Trace Gas Orbiter is a joint ESA–Roscosmos mission purpose-built to sniff out methane in the Martian atmosphere with three orders of magnitude better sensitivity than any prior instrument. Methane matters because on Earth it\'s overwhelmingly biological in origin — detecting it on Mars would be a potential biosignature, or at minimum evidence of active geochemistry.\n\nThe punchline was a twist: TGO found dramatically less methane than expected. Its spectrometers established an upper limit of just 0.05 parts per billion by volume — 10 to 100 times lower than every previous reported detection, including Curiosity\'s surface measurements. The discrepancy remains one of Mars science\'s most tantalizing open questions, suggesting either rapid destruction mechanisms or localized, transient sources.\n\nMeanwhile, its CaSSIS camera has been producing stunning 4.5-meter-per-pixel color stereo imagery, and in 2024 scientists published a global atlas of 965 potential chloride deposit sites identified from its data — mineral remnants of ancient evaporated bodies of water dotting the surface. FREND, its neutron detector, has independently mapped subsurface hydrogen distributions, adding yet another layer to the water-on-Mars puzzle.',
        imageUrl: '/images/tgo.png',
    },
    {
        name: 'Tianwen-1',
        semiMajorAxisKm: 3790, eccentricity: 0.01, inclinationDeg: 87,
        raanDeg: 160, argPeriapsisDeg: 200, meanAnomalyDeg: 200,
        periodSeconds: 118 * 60, color: '#EF5350',
        description: 'Tianwen-1 — "Questions to Heaven," named after an ancient Chinese poem — is one of the most audacious first attempts in space exploration history. Launched on July 23, 2020, it arrived at Mars carrying an orbiter, a lander, and the Zhurong rover, making China the first nation to successfully orbit, land, and deploy a rover on Mars in a single maiden mission.\n\nAt nearly five metric tons, it\'s one of the heaviest probes ever sent to the Red Planet, packed with 14 scientific instruments split between the orbiter and rover. The orbiter carries a high-resolution camera, a mineralogy spectrometer, a magnetometer, and a subsurface ice-mapping radar. Zhurong, named after the Chinese god of fire, wielded a laser-induced breakdown spectrometer to vaporize and analyze Martian rocks — the same technique used by NASA\'s Curiosity and Perseverance.\n\nIn a stunt worthy of science fiction, Tianwen-1 ejected a small deployable camera that floated free and beamed back WiFi selfies of the golden orbiter gliding above Mars — the first time a spacecraft had been photographed by its own detachable camera at another planet. The orbiter continues mapping the surface and relaying data from the Utopia Planitia landing site.',
        imageUrl: '/images/tianwen-1.png',
    },
    {
        name: 'Hope',
        semiMajorAxisKm: 33000, eccentricity: 0.45, inclinationDeg: 25,
        raanDeg: 260, argPeriapsisDeg: 10, meanAnomalyDeg: 300,
        periodSeconds: 55 * 3600, color: '#BDBDBD',
        description: 'Hope — Al Amal in Arabic — made the United Arab Emirates the first Arab nation and only the fifth country to reach Mars when it entered orbit on February 9, 2021. Built by 200 Emirati engineers working alongside researchers at the University of Colorado Boulder\'s Laboratory for Atmospheric and Space Physics, it was designed from scratch to study something no prior mission had prioritized: the complete Martian weather system.\n\nFrom its uniquely high, elliptical orbit — sweeping between 20,000 and 43,000 km — Hope captures full-disk images of Mars and observes each point on the surface at every time of day across a full Martian year. Its three instruments span infrared, visible, and ultraviolet wavelengths, tracking dust storms as they form and spread, monitoring seasonal temperature cycles, and measuring how hydrogen and oxygen escape from the upper atmosphere into space.\n\nThe science is already paying off: Hope produced an updated global color map of Mars published by The New York Times in 2023, and its atmospheric data is filling gaps that no other orbiter\'s geometry can reach. At roughly the size and weight of a small car, this compact spacecraft punches absurdly far above its weight class — a fitting debut for a spacefaring nation announcing itself on the interplanetary stage.',
        imageUrl: '/images/hope.jpg',
    },
];
