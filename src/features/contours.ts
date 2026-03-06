import * as Cesium from 'cesium';
import type { Feature, ContourGeoJSON } from './types';
import type { AppState } from '../state';
import { EXAGGERATION_SCALE, CONTOURS_DATA_URL } from '../constants';

export function elevationToColor(elev: number): Cesium.Color {
  const raw = Math.max(0, Math.min(1, (elev + 8000) / 29000));
  const t = Math.pow(raw, 0.6);
  const hue = 0.83 * (1 - t);
  const lightness = 0.22 + 0.33 * Math.pow(t, 1.8);
  return Cesium.Color.fromHsl(hue, 1.0, lightness);
}

// One Primitive per exaggeration level — all contour instances batched into a single draw call.
// Primitive positions are absolute world coords — verticalExaggeration does NOT scale them,
// so we build both variants at init and swap visibility on toggle.
const primitives = new Map<number, Cesium.Primitive>();
let viewerRef: Cesium.Viewer | null = null;
let initialized = false;
let pendingState: AppState | null = null;
let cachedGeojson: ContourGeoJSON | null = null;
let geojsonPromise: Promise<ContourGeoJSON> | null = null;

// Call this early (before init) to start the download immediately.
export function prefetch(): void {
  if (!geojsonPromise) {
    geojsonPromise = fetch(CONTOURS_DATA_URL).then((r) => r.json());
  }
}

function buildPrimitive(geojson: ContourGeoJSON, exaggeration: number): Cesium.Primitive {
  const allInstances: Cesium.GeometryInstance[] = [];

  for (const feature of geojson.features) {
    const elev = feature.properties.elevation;
    const color = elevationToColor(elev);

    for (const coordArray of feature.geometry.coordinates) {
      const positions = coordArray.map(([lon, lat]) =>
        Cesium.Cartesian3.fromDegrees(lon, lat, elev * exaggeration),
      );
      if (positions.length < 2) continue;
      allInstances.push(
        new Cesium.GeometryInstance({
          geometry: new Cesium.PolylineGeometry({ positions, width: 2.0 }),
          attributes: {
            color: Cesium.ColorGeometryInstanceAttribute.fromColor(color),
          },
        }),
      );
    }
  }

  return new Cesium.Primitive({
    geometryInstances: allInstances,
    appearance: new Cesium.PolylineColorAppearance({ translucent: false }),
    asynchronous: true,
    show: false,
  });
}

export const contours: Feature = {
  init(viewer: Cesium.Viewer) {
    viewerRef = viewer;
    prefetch();
    geojsonPromise!
      .then((geojson: ContourGeoJSON) => {
        cachedGeojson = geojson;
        // Only build the primitive for the currently-active exaggeration.
        // The other is built lazily in apply() if the user ever switches.
        const activeScale = pendingState?.exaggeration ?? EXAGGERATION_SCALE;
        const primitive = buildPrimitive(geojson, activeScale);
        viewer.scene.primitives.add(primitive);
        primitives.set(activeScale, primitive);
        initialized = true;
        if (pendingState) contours.apply(pendingState);
      })
      .catch((e) => console.error('[contours] Failed to load:', e));
  },

  apply(state: AppState) {
    pendingState = state;
    if (!initialized) return;

    // Build the primitive for this exaggeration level on demand if missing.
    if (viewerRef && cachedGeojson && !primitives.has(state.exaggeration)) {
      const primitive = buildPrimitive(cachedGeojson, state.exaggeration);
      viewerRef.scene.primitives.add(primitive);
      primitives.set(state.exaggeration, primitive);
    }

    const visible = state.layers.contours;
    for (const [scale, primitive] of primitives) {
      primitive.show = visible && scale === state.exaggeration;
    }
  },

  destroy() {
    for (const primitive of primitives.values()) {
      viewerRef?.scene.primitives.remove(primitive);
    }
    primitives.clear();
    initialized = false;
  },
};
