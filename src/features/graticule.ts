import * as Cesium from 'cesium';
import type { Feature } from './types';
import type { AppState } from '../state';

// 30° graticule — standard interval for USGS/MOLA global Mars maps.
// Parallels: -60, -30, 0, +30, +60  (5 lines)
// Meridians: every 30° from 0 to 330   (12 lines)

const STEP = 30;
const SAMPLE_DEG = 1; // sample interval for smooth curves

const LINE_COLOR = Cesium.Color.WHITE.withAlpha(0.25);
const LINE_WIDTH = 1.0;

let collection: Cesium.PrimitiveCollection;

function makeParallel(lat: number): Cesium.Cartesian3[] {
  const pts: Cesium.Cartesian3[] = [];
  for (let lon = -180; lon <= 180; lon += SAMPLE_DEG) {
    pts.push(Cesium.Cartesian3.fromDegrees(lon, lat));
  }
  return pts;
}

function makeMeridian(lon: number): Cesium.Cartesian3[] {
  const pts: Cesium.Cartesian3[] = [];
  for (let lat = -90; lat <= 90; lat += SAMPLE_DEG) {
    pts.push(Cesium.Cartesian3.fromDegrees(lon, lat));
  }
  return pts;
}

function addLine(positions: Cesium.Cartesian3[]): void {
  collection.add(
    new Cesium.GroundPolylinePrimitive({
      geometryInstances: new Cesium.GeometryInstance({
        geometry: new Cesium.GroundPolylineGeometry({ positions, width: LINE_WIDTH }),
        attributes: {
          color: Cesium.ColorGeometryInstanceAttribute.fromColor(LINE_COLOR),
        },
      }),
      appearance: new Cesium.PolylineColorAppearance(),
      asynchronous: true,
    }),
  );
}

export const graticule: Feature = {
  init(viewer: Cesium.Viewer) {
    collection = viewer.scene.primitives.add(new Cesium.PrimitiveCollection());

    // Parallels
    for (let lat = -90 + STEP; lat < 90; lat += STEP) {
      addLine(makeParallel(lat));
    }

    // Meridians
    for (let lon = 0; lon < 360; lon += STEP) {
      addLine(makeMeridian(lon >= 180 ? lon - 360 : lon));
    }
  },

  apply(state: AppState) {
    collection.show = state.layers.graticule;
  },

  destroy() {
    collection.removeAll();
  },
};
