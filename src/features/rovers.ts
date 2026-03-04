import * as Cesium from 'cesium';
import type { Feature, RoverSearchResult } from './types';
import type { AppState } from '../state';
import { ROVER_TRAVERSE_URL, ROVER_IMAGES_URL } from '../constants';

export interface RoverPinEntry {
  kind: 'pin';
  rover: string;
  id: string;
  sol: number | null;
  color: string;
}

export interface RoverPhotoEntry {
  kind: 'photo';
  rover: string;
  id: string;
  sol: number;
  camera: string;
  caption: string;
  imageUrl: string;
  lon: number;
  lat: number;
}

export type RoverPickResult = RoverPinEntry | RoverPhotoEntry;

const ROVER_COLORS: Record<string, Cesium.Color> = {
  perseverance: Cesium.Color.fromCssColorString('#FF6B35'),
  curiosity:    Cesium.Color.fromCssColorString('#4CAF50'),
  spirit:       Cesium.Color.fromCssColorString('#2196F3'),
  opportunity:  Cesium.Color.fromCssColorString('#9C27B0'),
  zhurong:      Cesium.Color.fromCssColorString('#E53935'),
  sojourner:    Cesium.Color.fromCssColorString('#FFD700'),
};

// Canvas dot matching the old PointPrimitive look: pixelSize 7, white outline 1.5px.
// BillboardCollection requires an image; we draw one per rover color and reuse it.
function makeDotCanvas(color: Cesium.Color): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 14;
  canvas.height = 14;
  const ctx = canvas.getContext('2d')!;
  // white outline ring
  ctx.beginPath();
  ctx.arc(7, 7, 6, 0, Math.PI * 2);
  ctx.fillStyle = 'white';
  ctx.fill();
  // colored fill
  ctx.beginPath();
  ctx.arc(7, 7, 4.5, 0, Math.PI * 2);
  ctx.fillStyle = color.toCssColorString();
  ctx.fill();
  return canvas;
}

// One canvas per rover — keyed by rover id, computed once at module load.
const PIN_IMAGES: Map<string, HTMLCanvasElement> = new Map(
  Object.entries(ROVER_COLORS).map(([id, color]) => [id, makeDotCanvas(color)])
);

// Camera icon — white circle with colored camera glyph, visually distinct from dot pins.
function makeCameraCanvas(color: Cesium.Color): HTMLCanvasElement {
  const s = 24;
  const canvas = document.createElement('canvas');
  canvas.width = s;
  canvas.height = s;
  const ctx = canvas.getContext('2d')!;
  // white circle background
  ctx.beginPath();
  ctx.arc(s / 2, s / 2, s / 2 - 1, 0, Math.PI * 2);
  ctx.fillStyle = 'white';
  ctx.fill();
  // camera body
  const c = color.toCssColorString();
  ctx.strokeStyle = c;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(5, 9, 14, 10, 2);
  ctx.stroke();
  // lens
  ctx.beginPath();
  ctx.arc(12, 14, 3, 0, Math.PI * 2);
  ctx.stroke();
  // viewfinder bump
  ctx.beginPath();
  ctx.roundRect(9, 6, 6, 4, 1);
  ctx.stroke();
  return canvas;
}

const CAMERA_IMAGES: Map<string, HTMLCanvasElement> = new Map(
  Object.entries(ROVER_COLORS).map(([id, color]) => [id, makeCameraCanvas(color)])
);

// ── Curated rover photos (tracer bullet: one hardcoded entry) ────────
const CURATED_PHOTOS: Omit<RoverPhotoEntry, 'kind'>[] = [
  {
    rover: 'Perseverance',
    id: 'perseverance',
    sol: 198,
    camera: 'WATSON (SHERLOC)',
    caption: 'Perseverance\'s first full selfie — taken by the WATSON camera on the SHERLOC instrument at the end of the robotic arm, this composite of 62 images shows the rover alongside the Ingenuity helicopter shortly before its historic first flight on Sol 58.',
    imageUrl: '/images/rover-photos/perseverance-selfie-ingenuity.jpg',
    lon: 77.45093957,
    lat: 18.44486877,
  },
  {
    rover: 'Perseverance',
    id: 'perseverance',
    sol: 1218,
    camera: 'WATSON (SHERLOC)',
    caption: 'Perseverance poses beside "Cheyava Falls" — an arrowhead-shaped rock at the northern edge of the ancient Neretva Vallis river channel — in this composite of 62 WATSON images taken on Sol 1218 (July 23, 2024). The dark drill hole is visible in the rock; analysis of the extracted core revealed leopard-spot mineral patterns strikingly similar to textures produced by microbial communities on Earth, published in Nature in 2025 as the most tantalizing potential biosignature ever found beyond our planet.',
    imageUrl: '/images/rover-photos/perseverance-cheyava-falls.jpg',
    lon: 77.30369792,
    lat: 18.4959853,
  },
  {
    rover: 'Perseverance',
    id: 'perseverance',
    sol: 684,
    camera: 'WATSON (SHERLOC)',
    caption: 'Perseverance surveys the "Three Forks" sample depot it built inside Jezero Crater, in this composite of 59 WATSON arm-camera images taken on Sol 684 (January 22, 2023). The titanium sample tube in the foreground contains the "Atsah" rock core; ten tubes were deposited here as a backup cache for the NASA-ESA Mars Sample Return mission, in case Perseverance cannot deliver its primary samples to a future lander. These 33 sealed tubes represent the most scientifically valuable cargo ever prepared for return to Earth.',
    imageUrl: '/images/rover-photos/perseverance-three-forks.jpg',
    lon: 77.40859222,
    lat: 18.45311341,
  },
  {
    rover: 'Perseverance',
    id: 'perseverance',
    sol: 470,
    camera: 'Mastcam-Z',
    caption: 'The most detailed landscape panorama ever returned from Mars — 1,118 Mastcam-Z frames stitched into a 2.5-billion-pixel mosaic taken across five sols in June 2022 (Sols 466–474). The ancient river delta fans out across the far wall of Jezero Crater, its layered sediments recording a period when water flowed steadily into a standing lake. Perseverance collected several of its most scientifically prized rock cores from these delta deposits.',
    imageUrl: '/images/rover-photos/perseverance-jezero-delta.jpg',
    lon: 77.40609995,
    lat: 18.4588559,
  },
  {
    rover: 'Spirit',
    id: 'spirit',
    sol: 621,
    camera: 'Pancam',
    caption: 'The "Everest" panorama — named for its 20/20-vision clarity — captured from the true summit of Husband Hill on Sols 620–622 (October 1–3, 2005). Assembled from 81 Pancam pointings in four wavelength filters, the 360° view sweeps across a plateau of wind-sculpted rock and drifting sand roughly 100 meters above the Gusev Crater plains. The crater rim lies ~80 km away on the horizon; dust devils are frozen mid-spin in the upper right.',
    imageUrl: '/images/rover-photos/spirit-husband-hill.jpg',
    lon: 175.48,
    lat: -14.57,
  },
  {
    rover: 'Opportunity',
    id: 'opportunity',
    sol: 290,
    camera: 'Pancam',
    caption: 'Opportunity\'s Pancam looks up at the layered inner wall of Endurance Crater from the base of "Burns Cliff" in this 46-image composite taken on Sols 287–294 (November 13–20, 2004). The cliff face — named after geologist Roger Burns, who predicted exactly these sulfate-rich sediments on Mars — exposes roughly 10 meters of stacked rock layers recording a sequence of ancient wet and dry episodes. The apparent outward curve of the walls is a wide-angle perspective distortion.',
    imageUrl: '/images/rover-photos/opportunity-burns-cliff.jpg',
    lon: 354.47,
    lat: -1.95,
  },
  {
    rover: 'Zhurong',
    id: 'zhurong',
    sol: 10,
    camera: 'Remote Camera',
    caption: 'Zhurong and its Tianwen-1 lander pose together on the plains of Utopia Planitia in this image released June 11, 2021. To take it, the rover deployed a small wireless camera — less than 1 kg, the lightest object ever placed on Mars — onto the surface roughly 10 meters away, then drove back beside the lander. The rover\'s tracks are visible at right. No other Mars mission has managed a true group portrait.',
    imageUrl: '/images/rover-photos/zhurong-selfie.jpg',
    lon: 109.925,
    lat: 25.066,
  },
  {
    rover: 'Curiosity',
    id: 'curiosity',
    sol: 1856,
    camera: 'Mastcam',
    caption: 'From the crest of Vera Rubin Ridge, Curiosity\'s Mastcam sweeps the full interior of Gale Crater in this 16-image mosaic taken on Sol 1856 (October 25, 2017). The ridge itself — an iron-oxide-bearing band that puzzled scientists from orbit for years — runs left to right; Mount Sharp dominates the centre; and the crater rim 85 kilometres away closes the horizon. Nearly six years of traverse are compressed into a single frame.',
    imageUrl: '/images/rover-photos/curiosity-vera-rubin-ridge.jpg',
    lon: 137.3740862,
    lat: -4.72636276,
  },
  {
    rover: 'Curiosity',
    id: 'curiosity',
    sol: 3070,
    camera: 'MAHLI',
    caption: 'Curiosity poses before Mont Mercou — a 6-meter sandstone outcrop on the slopes of Mount Sharp — in this composite of 60 MAHLI arm-camera images taken on Sol 3070 (March 26, 2021). A drill hole from the "Nontron" rock sample is visible in the foreground. Features in the region were named after the village of Nontron in southwestern France.',
    imageUrl: '/images/rover-photos/curiosity-mont-mercou.jpg',
    lon: 137.3708,
    lat: -4.6692,
  },
  {
    rover: 'Curiosity',
    id: 'curiosity',
    sol: 2553,
    camera: 'MAHLI',
    caption: 'Self-portrait at the "Glen Etive" drill site on lower Mount Sharp, composed of 57 MAHLI arm-camera images taken on Sol 2553 (October 11, 2019). Two drill holes — Glen Etive 1 and Glen Etive 2 — are visible just left of the rover; samples from these holes were used for Curiosity\'s first wet-chemistry experiment with the SAM instrument. Vera Rubin Ridge rises roughly 300 meters behind the rover, with the floor and northern rim of Gale Crater beyond.',
    imageUrl: '/images/rover-photos/curiosity-glen-etive.jpg',
    lon: 137.3835013,
    lat: -4.73090654,
  },
  {
    rover: 'Curiosity',
    id: 'curiosity',
    sol: 1421,
    camera: 'Mastcam',
    caption: '360° panorama stitched from over 130 Mastcam images taken on Sol 1421 (August 5, 2016) — Curiosity\'s fourth landing anniversary. The flat-topped mesas of Murray Buttes rise ~15 meters above the surrounding plains; they are eroded remnants of the Stimson sandstone formation, wind-deposited and more resistant to erosion than the ancient lakebed sediments of the Murray formation underfoot. The area is named after planetary scientist Bruce Murray, former director of JPL.',
    imageUrl: '/images/rover-photos/curiosity-murray-buttes.jpg',
    lon: 137.3544744,
    lat: -4.68718483,
  },
];

// ── Rover metadata (descriptions + hero images) ───────────────────────
export const ROVER_META: Record<string, { description: string; imageUrl: string }> = {
  perseverance: {
    imageUrl: '/images/perseverance.jpg',
    description:
      'Perseverance touched down in Jezero Crater on February 18, 2021, threading a needle through a 45-kilometer basin that once held a river delta\u2014the kind of environment where microbial life could have thrived 3.5 billion years ago. Its landing used the same audacious sky crane that delivered Curiosity, but added terrain-relative navigation that let it dodge hazards in real time, touching down within 40 meters of its target.\n\n'
    + 'The rover carries the most sophisticated instrument suite ever sent to another planet. MOXIE proved we can manufacture breathable oxygen from the Martian CO\u2082 atmosphere\u2014a foundational step for human exploration. Ingenuity, the 1.8 kg helicopter strapped to its belly, was rated for five flights and completed seventy-two, rewriting the rules of aerospace engineering on a world with one percent of Earth\u2019s atmospheric density.\n\n'
    + 'In July 2024, Perseverance drilled into a rock dubbed \u201CCheyava Falls\u201D and found leopard-spot mineral patterns strikingly similar to textures produced by microbial communities on Earth. Published in Nature in 2025, it remains the most tantalizing potential biosignature ever found beyond our planet. The 33 sealed sample tubes cached along its traverse await a future return mission\u2014the most scientifically valuable cargo in the solar system.',
  },
  curiosity: {
    imageUrl: '/images/curiosity.jpg',
    description:
      'Curiosity landed in Gale Crater on August 6, 2012 via an unprecedented sky crane maneuver that lowered the 899 kg rover on nylon cables from a hovering rocket platform\u2014a landing system so ambitious it was nicknamed \u201Cseven minutes of terror.\u201D Its target: Aeolis Mons (Mount Sharp), a 5.5 km layered sedimentary mountain whose strata record billions of years of Martian climate history like pages in a geological book.\n\n'
    + 'Within its first year, Curiosity found mudstone in Yellowknife Bay that formed at the bottom of an ancient freshwater lake containing every chemical element necessary for life: carbon, hydrogen, oxygen, nitrogen, sulfur, and phosphorus. SAM, the most powerful analytical chemistry lab ever sent to Mars, later detected complex organic molecules\u2014long-chain hydrocarbons\u2014locked in 3-billion-year-old rock. ChemCam has fired over 900,000 laser shots at Martian rocks, vaporizing pinpoints of material to read their chemical spectra from meters away.\n\n'
    + 'Over 13 years into a 2-year mission, Curiosity has climbed thousands of meters up Mount Sharp\u2019s sulfate-bearing slopes, documenting a world that transitioned from wet and potentially habitable to the cold, irradiated desert it is today. It also detected seasonal methane cycles whose origin\u2014geological or biological\u2014remains one of Mars science\u2019s most compelling open questions.',
  },
  spirit: {
    imageUrl: '/images/spirit.jpg',
    description:
      'Spirit bounced to a stop inside Gusev Crater on January 4, 2004, wrapped in airbags, on a mission designed to last 90 Martian days. It lasted 2,208. Its landing site\u2014christened Columbia Memorial Station after the Space Shuttle crew lost just eleven months earlier\u2014was chosen because the massive outflow channel Ma\u2019adim Vallis suggested Gusev once held a lake.\n\n'
    + 'Spirit\u2019s most astonishing discovery came from a malfunction. When its right front wheel motor seized permanently, the rover was forced to drive backward, dragging the dead wheel through the soil. That broken wheel churned up deposits of nearly pure silica\u2014a mineral signature virtually identical to what forms around hydrothermal hot springs in Yellowstone. It was a smoking gun for ancient habitable environments, and one of the most celebrated instances of serendipity in planetary science.\n\n'
    + 'In May 2009, Spirit broke through a thin soil crust near a volcanic formation called Home Plate and became irretrievably mired. NASA spent months devising extrication maneuvers, but the rover couldn\u2019t generate enough traction. Tilted and unable to angle its solar panels toward the winter sun, Spirit fell silent on March 22, 2010\u2014after traversing 7.73 km across a world it helped us see for the first time as a geologically complex, once-wet planet.',
  },
  opportunity: {
    imageUrl: '/images/opportunity.jpg',
    description:
      'Opportunity stuck one of the most improbable landings in spaceflight history on January 25, 2004, bouncing directly into the 22-meter Eagle Crater at Meridiani Planum\u2014a geological jackpot scientists called a \u201Chole in one.\u201D Within days, it found exposed bedrock layered with hematite concretions the team nicknamed \u201Cblueberries\u201D: BB-sized mineral spheres that could only have formed by groundwater percolating through sedimentary rock. The case for ancient water on Mars was essentially closed.\n\n'
    + 'Built for 90 sols, Opportunity operated for 5,111\u2014over 14 Earth years. It drove 45.16 km, smashing the off-world distance record once held by the Soviet Lunokhod 2 and officially completing an Olympic marathon distance on Sol 3,968. Along the way, it found the first meteorite ever identified on another planet, discovered clay minerals indicating near-neutral-pH water at Endeavour Crater\u2019s rim, and returned 224,642 images of the Martian surface.\n\n'
    + 'In June 2018, a planet-encircling dust storm\u2014one of the most intense ever observed on Mars\u2014plunged Meridiani Planum into near-total darkness. Opportunity\u2019s solar panels starved, and the rover entered emergency hibernation. NASA sent over 1,000 recovery commands across eight months. It never responded. The final uplink reportedly included a broadcast of Billie Holiday\u2019s \u201CI\u2019ll Be Seeing You.\u201D',
  },
  zhurong: {
    imageUrl: '/images/zhurong.jpg',
    description:
      'Zhurong — named after the Chinese god of fire — rolled onto Utopia Planitia on May 22, 2021, making China only the second nation to successfully operate a rover on Mars. Deployed from the Tianwen-1 lander, the 240 kg solar-powered rover carried six scientific instruments including a ground-penetrating radar, a laser-induced breakdown spectrometer, and a multispectral camera.\n\n'
    + 'Its subsurface radar revealed layered structures beneath Utopia Planitia consistent with repeated cycles of flooding and freezing over billions of years — evidence that vast quantities of water ice may still lie buried just meters below the surface. The laser spectrometer confirmed the local regolith is rich in hydrated sulfate and silica minerals, reinforcing the wet-history hypothesis.\n\n'
    + 'Zhurong was designed for a 90-sol primary mission and operated for 347 sols, traversing 1,921 meters before entering hibernation for the Martian winter in May 2022. As of early 2026, repeated attempts to re-establish contact have not succeeded — likely due to dust accumulation on its solar panels. Its signature accomplishment remains the ground-penetrating radar cross-section of Utopia Planitia, the most detailed subsurface profile ever obtained on Mars.',
  },
  sojourner: {
    imageUrl: '/images/sojourner.jpg',
    description:
      'On July 4, 1997, a 10.6 kg rover the size of a microwave oven rolled off a ramp onto the surface of Mars\u2014and the era of Martian surface exploration began. Sojourner, named by 12-year-old Valerie Ambroise after abolitionist Sojourner Truth, was the rover component of NASA\u2019s Mars Pathfinder mission, a proof-of-concept under the agency\u2019s \u201Cfaster, better, cheaper\u201D initiative that landed using a radical airbag-cushioned bounce system.\n\n'
    + 'Pathfinder delivered Sojourner to Ares Vallis, an ancient catastrophic flood plain selected because colossal floods were thought to have washed a diverse sampling of Martian rocks into one accessible location. Armed with an Alpha Particle X-ray Spectrometer that required 10-hour contact readings, the rover methodically analyzed 16 rocks and soil patches\u2014including the now-legendary \u201CBarnacle Bill\u201D and \u201CYogi\u201D\u2014revealing a surprisingly Earth-like andesitic composition.\n\n'
    + 'Sojourner\u2019s top speed was one centimeter per second. It never ventured more than 12 meters from the lander. Yet in 83 sols of operation\u2014nearly triple its 30-day design life\u2014it transmitted 550 images and fundamentally proved that autonomous wheeled exploration of another planet was feasible. When the lander\u2019s battery failed and severed the relay link to Earth, Sojourner likely continued circling the silent Carl Sagan Memorial Station, a tiny robot patiently awaiting instructions that would never come.',
  },
};

// Module-level state
let traversePrimitive: Cesium.GroundPolylinePrimitive;
let pinCollection: Cesium.BillboardCollection;
let viewerRef: Cesium.Viewer | null = null;
let pinData: Array<{ pin: Cesium.Billboard } & RoverPinEntry> = [];
let photoData: Array<{ pin: Cesium.Billboard } & RoverPhotoEntry> = [];
let roverSites: Array<{ name: string; id: string; lon: number; lat: number }> = [];
let prefetchedTraverse: any = null;
let prefetchedImages: any = null;

export const rovers: Feature = {
  async prefetch() {
    try {
      [prefetchedTraverse, prefetchedImages] = await Promise.all([
        fetch(ROVER_TRAVERSE_URL).then((r) => r.json()),
        fetch(ROVER_IMAGES_URL).then((r) => r.json()),
      ]);
    } catch (e) {
      console.error('[rovers] prefetch failed:', e);
    }
  },

  async init(viewer: Cesium.Viewer): Promise<void> {
    const [traverseGeo, imagesGeo] = prefetchedTraverse
      ? [prefetchedTraverse, prefetchedImages]
      : await Promise.all([
          fetch(ROVER_TRAVERSE_URL).then((r) => r.json()),
          fetch(ROVER_IMAGES_URL).then((r) => r.json()),
        ]).catch((e) => {
          console.error('[rovers] init fetch failed:', e);
          return [null, null];
        });
    if (!traverseGeo || !imagesGeo) return;

    viewerRef = viewer;
    pinCollection = viewer.scene.primitives.add(new Cesium.BillboardCollection({ scene: viewer.scene }));
    pinData = [];

    // Traverse polylines — all rovers batched into one GroundPolylinePrimitive
    const traverseInstances: Cesium.GeometryInstance[] = [];
    for (const feature of traverseGeo.features) {
      const color = ROVER_COLORS[feature.properties.id] ?? Cesium.Color.WHITE;
      const positions = (feature.geometry.coordinates as [number, number][]).map(
        ([lon, lat]) => Cesium.Cartesian3.fromDegrees(lon, lat)
      );
      if (positions.length < 2) continue;
      traverseInstances.push(new Cesium.GeometryInstance({
        geometry: new Cesium.GroundPolylineGeometry({ positions, width: 2.5 }),
        attributes: {
          color: Cesium.ColorGeometryInstanceAttribute.fromColor(color),
        },
      }));
    }
    traversePrimitive = viewer.scene.primitives.add(new Cesium.GroundPolylinePrimitive({
      geometryInstances: traverseInstances,
      appearance: new Cesium.PolylineColorAppearance(),
      asynchronous: true,
    }));

    // Image waypoint pins — landing site dot only on first load; remaining deferred
    const seenRovers = new Set<string>();
    const deferredFeatures: typeof imagesGeo.features = [];
    roverSites = [];
    for (const feature of imagesGeo.features) {
      const { rover, id, sol, color } = feature.properties as {
        rover: string; id: string; sol: number | null; color: string;
      };
      const [lon, lat] = feature.geometry.coordinates as [number, number];
      const cesiumColor = ROVER_COLORS[id] ?? Cesium.Color.fromCssColorString(color);

      if (!seenRovers.has(id)) {
        // First feature per rover ≈ landing site — add immediately
        seenRovers.add(id);
        roverSites.push({ name: rover, id, lon, lat });
        const pin = pinCollection.add({
          position: Cesium.Cartesian3.fromDegrees(lon, lat),
          image: PIN_IMAGES.get(id) ?? makeDotCanvas(cesiumColor),
          heightReference: Cesium.HeightReference.CLAMP_TO_TERRAIN,
          verticalOrigin: Cesium.VerticalOrigin.CENTER,
          disableDepthTestDistance: 6.4e6,
        });
        pinData.push({ pin, kind: 'pin', rover, id, sol, color: cesiumColor.toCssColorString() });
      } else {
        deferredFeatures.push(feature);
      }
    }

    // Remaining drive-sol dots — added after critical path clears
    setTimeout(() => {
      for (const feature of deferredFeatures) {
        const { rover, id, sol, color } = feature.properties as {
          rover: string; id: string; sol: number | null; color: string;
        };
        const [lon, lat] = feature.geometry.coordinates as [number, number];
        const cesiumColor = ROVER_COLORS[id] ?? Cesium.Color.fromCssColorString(color);
        const pin = pinCollection.add({
          position: Cesium.Cartesian3.fromDegrees(lon, lat),
          image: PIN_IMAGES.get(id) ?? makeDotCanvas(cesiumColor),
          heightReference: Cesium.HeightReference.CLAMP_TO_TERRAIN,
          verticalOrigin: Cesium.VerticalOrigin.CENTER,
          disableDepthTestDistance: 6.4e6,
        });
        pinData.push({ pin, kind: 'pin', rover, id, sol, color: cesiumColor.toCssColorString() });
      }
    }, 0);

    // Photo icons — curated photos placed at known coordinates
    photoData = [];
    for (const photo of CURATED_PHOTOS) {
      const pin = pinCollection.add({
        position: Cesium.Cartesian3.fromDegrees(photo.lon, photo.lat),
        image: CAMERA_IMAGES.get(photo.id) ?? makeCameraCanvas(Cesium.Color.WHITE),
        heightReference: Cesium.HeightReference.CLAMP_TO_TERRAIN,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(0, -8),

        disableDepthTestDistance: 6.4e6,
      });
      photoData.push({ pin, kind: 'photo', ...photo });
    }
  },

  pick(picked: any): RoverPickResult | undefined {
    // Photo icons first (fewer, more specific)
    const photo = photoData.find((e) => e.pin === picked?.primitive);
    if (photo) {
      const { pin: _, ...data } = photo;
      return data;
    }
    const entry = pinData.find((e) => e.pin === picked?.primitive);
    if (!entry) return undefined;
    return { kind: 'pin', rover: entry.rover, id: entry.id, sol: entry.sol, color: entry.color };
  },

  apply(state: AppState) {
    if (traversePrimitive) traversePrimitive.show = state.layers.rovers;
    if (pinCollection) pinCollection.show = state.layers.rovers;
  },

  destroy() {
    pinData = [];
    photoData = [];
    roverSites = [];
    if (viewerRef) {
      viewerRef.scene.primitives.remove(traversePrimitive);
      viewerRef.scene.primitives.remove(pinCollection);
      viewerRef = null;
    }
  },
};

export function searchRovers(query: string): RoverSearchResult[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const all = q === '*';
  return roverSites
    .filter((r) => all || r.name.toLowerCase().includes(q))
    .map((r) => ({
      kind: 'rover' as const, name: r.name, id: r.id, lon: r.lon, lat: r.lat,
      color: (ROVER_COLORS[r.id] ?? Cesium.Color.WHITE).toCssColorString(),
    }));
}
