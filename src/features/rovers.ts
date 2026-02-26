import * as Cesium from 'cesium';
import type { Feature, FeatureData } from './types';
import type { AppState } from '../state';
import { ROVER_TRAVERSE_URL, ROVER_IMAGES_URL } from '../constants';

export interface RoverPinEntry {
  rover: string;
  id: string;
  sol: number | null;
}

const ROVER_COLORS: Record<string, Cesium.Color> = {
  perseverance: Cesium.Color.fromCssColorString('#FF6B35'),
  curiosity:    Cesium.Color.fromCssColorString('#4CAF50'),
};

// Module-level state
let traversePrimitives: Cesium.PrimitiveCollection;
let pinCollection: Cesium.PointPrimitiveCollection;
let pinData: Array<{ pin: Cesium.PointPrimitive } & RoverPinEntry> = [];
let removeClickHandler: (() => void) | null = null;
let onPinClick: ((entry: RoverPinEntry) => void) | null = null;
let onPinMiss: (() => void) | null = null;

export function setOnRoverPinClick(fn: (entry: RoverPinEntry) => void): void {
  onPinClick = fn;
}
export function setOnRoverMiss(fn: () => void): void {
  onPinMiss = fn;
}

export const rovers: Feature = {
  async init(viewer: Cesium.Viewer, _data: FeatureData): Promise<void> {
    const [traverseGeo, imagesGeo] = await Promise.all([
      fetch(ROVER_TRAVERSE_URL).then((r) => r.json()),
      fetch(ROVER_IMAGES_URL).then((r) => r.json()),
    ]);

    traversePrimitives = viewer.scene.primitives.add(new Cesium.PrimitiveCollection());
    pinCollection = viewer.scene.primitives.add(new Cesium.PointPrimitiveCollection());
    pinData = [];

    // Traverse polylines — one GroundPolylinePrimitive per rover
    for (const feature of traverseGeo.features) {
      const color = ROVER_COLORS[feature.properties.id] ?? Cesium.Color.WHITE;
      const positions = (feature.geometry.coordinates as [number, number][]).map(
        ([lon, lat]) => Cesium.Cartesian3.fromDegrees(lon, lat)
      );
      if (positions.length < 2) continue;

      traversePrimitives.add(
        new Cesium.GroundPolylinePrimitive({
          geometryInstances: new Cesium.GeometryInstance({
            geometry: new Cesium.GroundPolylineGeometry({ positions, width: 2.5 }),
            attributes: {
              color: Cesium.ColorGeometryInstanceAttribute.fromColor(color),
            },
          }),
          appearance: new Cesium.PolylineColorAppearance(),
          asynchronous: true,
        })
      );
    }

    // Image waypoint pins — colored dots, one per drive sol
    for (const feature of imagesGeo.features) {
      const { rover, id, sol, color } = feature.properties as {
        rover: string; id: string; sol: number | null; color: string;
      };
      const [lon, lat] = feature.geometry.coordinates as [number, number];
      const cesiumColor = ROVER_COLORS[id] ?? Cesium.Color.fromCssColorString(color);

      const pin = pinCollection.add({
        position: Cesium.Cartesian3.fromDegrees(lon, lat),
        color: cesiumColor,
        pixelSize: 7,
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 1.5,
      });

      pinData.push({ pin, rover, id, sol });
    }

    // Click handler — picks point primitives, fires callbacks
    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction((movement: { position: Cesium.Cartesian2 }) => {
      const picked = viewer.scene.pick(movement.position);
      const entry = pinData.find((e) => e.pin === picked?.primitive);
      if (entry) {
        onPinClick?.({ rover: entry.rover, id: entry.id, sol: entry.sol });
      } else {
        onPinMiss?.();
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
    removeClickHandler = () => handler.destroy();
  },

  apply(state: AppState) {
    if (traversePrimitives) traversePrimitives.show = state.layers.rovers;
    if (pinCollection) pinCollection.show = state.layers.rovers;
  },

  destroy() {
    removeClickHandler?.();
    removeClickHandler = null;
    pinData = [];
  },
};
