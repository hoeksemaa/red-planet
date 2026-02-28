import * as Cesium from 'cesium';
import type { Feature } from './types';
import type { AppState } from '../state';
import { EXAGGERATION_SCALE } from '../constants';
import { parallelHeights, meridianHeights } from './graticule-heights';

// 30° graticule — standard interval for USGS/MOLA global Mars maps.
// Parallels: -60, -30, 0, +30, +60  (5 lines)
// Meridians: every 30° from 0 to 330   (12 lines)

const STEP = 30;
const SAMPLE_DEG = 1;
const LINE_WIDTH = 1;

function buildCollection(exaggeration: number): Cesium.PrimitiveCollection {
  const collection = new Cesium.PrimitiveCollection();
  const instances: Cesium.GeometryInstance[] = [];

  // Parallels — parallelHeights is laid out as [lat0_lon0, lat0_lon1, ..., lat1_lon0, ...]
  let pi = 0;
  for (let lat = -90 + STEP; lat < 90; lat += STEP) {
    const positions: Cesium.Cartesian3[] = [];
    for (let lon = -180; lon <= 180; lon += SAMPLE_DEG) {
      positions.push(Cesium.Cartesian3.fromDegrees(lon, lat, parallelHeights[pi++] * exaggeration));
    }
    instances.push(new Cesium.GeometryInstance({
      geometry: new Cesium.PolylineGeometry({ positions, width: LINE_WIDTH }),
    }));
  }

  // Meridians — meridianHeights is laid out as [lon0_lat0, lon0_lat1, ..., lon1_lat0, ...]
  let mi = 0;
  for (let lon = 0; lon < 360; lon += STEP) {
    const actualLon = lon >= 180 ? lon - 360 : lon;
    const positions: Cesium.Cartesian3[] = [];
    for (let lat = -90; lat <= 90; lat += SAMPLE_DEG) {
      positions.push(Cesium.Cartesian3.fromDegrees(actualLon, lat, meridianHeights[mi++] * exaggeration));
    }
    instances.push(new Cesium.GeometryInstance({
      geometry: new Cesium.PolylineGeometry({ positions, width: LINE_WIDTH }),
    }));
  }

  collection.add(new Cesium.Primitive({
    geometryInstances: instances,
    appearance: new Cesium.PolylineMaterialAppearance({
      material: Cesium.Material.fromType('PolylineDash', {
        color: new Cesium.Color(0.5, 0.5, 0.5, 1.0), // 50% white
        gapColor: Cesium.Color.TRANSPARENT,
        dashLength: 32.0,
        dashPattern: 65520, // 0xFFF0 — 4 dash-bits, 12 gap-bits = 25% dash / 75% gap
      }),
    }),
    asynchronous: false,
  }));

  return collection;
}

function makeLabels(viewer: Cesium.Viewer): Cesium.LabelCollection {
  const lc = viewer.scene.primitives.add(
    new Cesium.LabelCollection({ scene: viewer.scene }),
  );

  const common = {
    font: '11px sans-serif',
    fillColor: Cesium.Color.WHITE,
    outlineColor: Cesium.Color.BLACK,
    outlineWidth: 2,
    style: Cesium.LabelStyle.FILL_AND_OUTLINE,
    heightReference: Cesium.HeightReference.CLAMP_TO_TERRAIN,
  };

  // Latitude labels along the prime meridian (lon=0)
  for (let lat = -90 + STEP; lat < 90; lat += STEP) {
    const text = lat === 0 ? '0°' : lat > 0 ? `${lat}°N` : `${-lat}°S`;
    lc.add({
      ...common,
      position: Cesium.Cartesian3.fromDegrees(0, lat),
      text,
      horizontalOrigin: Cesium.HorizontalOrigin.LEFT,
      verticalOrigin: Cesium.VerticalOrigin.CENTER,
      pixelOffset: new Cesium.Cartesian2(4, 0),
    });
  }

  // Longitude labels along the equator — East longitude 0–360°E (IAU/NASA Mars standard)
  for (let lon = 0; lon < 360; lon += STEP) {
    const actualLon = lon >= 180 ? lon - 360 : lon;
    const text = lon === 0 ? '0°' : lon === 180 ? '180°' : `${lon}°E`;
    lc.add({
      ...common,
      position: Cesium.Cartesian3.fromDegrees(actualLon, 0),
      text,
      horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
      verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
      pixelOffset: new Cesium.Cartesian2(0, -4),
    });
  }

  return lc;
}

export function createGraticule(): Feature {
  const collections = new Map<number, Cesium.PrimitiveCollection>();
  let labelCollection: Cesium.LabelCollection;
  let viewer: Cesium.Viewer;
  let built = false;

  function buildAll() {
    for (const scale of [1, EXAGGERATION_SCALE]) {
      const col = buildCollection(scale);
      viewer.scene.primitives.add(col);
      collections.set(scale, col);
    }
    labelCollection = makeLabels(viewer);
    built = true;
  }

  return {
    init(v: Cesium.Viewer) {
      viewer = v;
    },

    apply(state: AppState) {
      const visible = state.layers.graticule;
      if (visible && !built) buildAll();
      if (!built) return;
      for (const [scale, col] of collections) {
        col.show = visible && state.exaggeration === scale;
      }
      labelCollection.show = visible;
    },

    destroy() {
      for (const col of collections.values()) col.removeAll();
      collections.clear();
      if (labelCollection) labelCollection.removeAll();
    },
  };
}
