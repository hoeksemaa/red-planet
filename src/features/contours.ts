import * as Cesium from 'cesium';
import type { Feature, FeatureData, ContourGeoJSON } from './types';
import type { AppState } from '../state';
import { DEFAULT_STATE } from '../state';

function elevationToColor(elev: number): Cesium.Color {
  const raw = Math.max(0, Math.min(1, (elev + 8000) / 29000));
  const t = Math.pow(raw, 0.6);
  const hue = 0.75 * Math.pow(1 - t, 1.5);
  const lightness = 0.4 + 0.15 * t;
  return Cesium.Color.fromHsl(hue, 1.0, lightness);
}

let contourCollection: Cesium.PrimitiveCollection;
let geojson: ContourGeoJSON | null = null;
let lastExaggeration: number = DEFAULT_STATE.exaggeration;

// Primitive positions are absolute world coords — verticalExaggeration does NOT scale them.
// We must multiply elevation by exaggeration ourselves and rebuild on toggle.
function buildContours(exaggeration: number): void {
  contourCollection.removeAll();

  if (!geojson) return;

  for (const feature of geojson.features) {
    const elev = feature.properties.elevation;
    const color = elevationToColor(elev);
    const instances: Cesium.GeometryInstance[] = [];

    for (const coordArray of feature.geometry.coordinates) {
      const positions = coordArray.map(([lon, lat]) =>
        Cesium.Cartesian3.fromDegrees(lon, lat, elev * exaggeration)
      );
      if (positions.length < 2) continue;
      instances.push(
        new Cesium.GeometryInstance({
          geometry: new Cesium.PolylineGeometry({ positions, width: 2.0 }),
          attributes: {
            color: Cesium.ColorGeometryInstanceAttribute.fromColor(color),
          },
        })
      );
    }
    if (instances.length === 0) continue;

    contourCollection.add(
      new Cesium.Primitive({
        geometryInstances: instances,
        appearance: new Cesium.PolylineColorAppearance({
          translucent: false,
        }),
        asynchronous: false,
      })
    );
  }
}

export const contours: Feature = {
  init(viewer: Cesium.Viewer, data: FeatureData) {
    geojson = data.contourGeoJSON;
    contourCollection = viewer.scene.primitives.add(new Cesium.PrimitiveCollection());
    buildContours(lastExaggeration);
  },

  apply(state: AppState) {
    if (!contourCollection) return;
    contourCollection.show = state.layers.contours;
    if (state.exaggeration !== lastExaggeration) {
      lastExaggeration = state.exaggeration;
      buildContours(state.exaggeration);
    }
  },

  destroy() {
    contourCollection.removeAll();
  },
};
