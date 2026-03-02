import * as Cesium from 'cesium';
import type { Feature, ContourGeoJSON } from './types';
import type { AppState } from '../state';
import { EXAGGERATION_SCALE, CONTOURS_DATA_URL } from '../constants';

function elevationToColor(elev: number): Cesium.Color {
  const raw = Math.max(0, Math.min(1, (elev + 8000) / 29000));
  const t = Math.pow(raw, 0.6);
  const hue = 0.75 * Math.pow(1 - t, 1.5);
  const lightness = 0.4 + 0.15 * t;
  return Cesium.Color.fromHsl(hue, 1.0, lightness);
}

// Precomputed collections for each exaggeration level.
// Primitive positions are absolute world coords — verticalExaggeration does NOT scale them,
// so we build both variants at init and swap visibility on toggle (instant).
const collections = new Map<number, Cesium.PrimitiveCollection>();
let viewerRef: Cesium.Viewer | null = null;
let initialized = false;
let loading = false;
let pendingState: AppState | null = null;

function buildCollection(
  geojson: ContourGeoJSON,
  exaggeration: number,
): Cesium.PrimitiveCollection {
  const collection = new Cesium.PrimitiveCollection();

  for (const feature of geojson.features) {
    const elev = feature.properties.elevation;
    const color = elevationToColor(elev);
    const instances: Cesium.GeometryInstance[] = [];

    for (const coordArray of feature.geometry.coordinates) {
      const positions = coordArray.map(([lon, lat]) =>
        Cesium.Cartesian3.fromDegrees(lon, lat, elev * exaggeration),
      );
      if (positions.length < 2) continue;
      instances.push(
        new Cesium.GeometryInstance({
          geometry: new Cesium.PolylineGeometry({ positions, width: 2.0 }),
          attributes: {
            color: Cesium.ColorGeometryInstanceAttribute.fromColor(color),
          },
        }),
      );
    }
    if (instances.length === 0) continue;

    collection.add(
      new Cesium.Primitive({
        geometryInstances: instances,
        appearance: new Cesium.PolylineColorAppearance({ translucent: false }),
        asynchronous: false,
      }),
    );
  }

  return collection;
}

export const contours: Feature = {
  init(viewer: Cesium.Viewer) {
    viewerRef = viewer;
  },

  apply(state: AppState) {
    pendingState = state;

    if (!initialized) {
      if (state.layers.contours && !loading && viewerRef) {
        loading = true;
        fetch(CONTOURS_DATA_URL)
          .then((r) => r.json())
          .then((geojson: ContourGeoJSON) => {
            for (const scale of [1, EXAGGERATION_SCALE]) {
              const col = buildCollection(geojson, scale);
              viewerRef!.scene.primitives.add(col);
              collections.set(scale, col);
            }
            initialized = true;
            loading = false;
            if (pendingState) contours.apply(pendingState);
          });
      }
      return;
    }

    const visible = state.layers.contours;
    for (const [scale, col] of collections) {
      col.show = visible && state.exaggeration === scale;
    }
  },

  destroy() {
    for (const col of collections.values()) col.removeAll();
    collections.clear();
    initialized = false;
    loading = false;
  },
};
