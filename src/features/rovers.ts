import * as Cesium from 'cesium';
import type { Feature, FeatureData, RoverSearchResult } from './types';
import type { AppState } from '../state';
import { ROVER_TRAVERSE_URL, ROVER_IMAGES_URL } from '../constants';

export interface RoverPinEntry {
  rover: string;
  id: string;
  sol: number | null;
  color: string;
}

const ROVER_COLORS: Record<string, Cesium.Color> = {
  perseverance: Cesium.Color.fromCssColorString('#FF6B35'),
  curiosity:    Cesium.Color.fromCssColorString('#4CAF50'),
  spirit:       Cesium.Color.fromCssColorString('#2196F3'),
  opportunity:  Cesium.Color.fromCssColorString('#9C27B0'),
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

// Module-level state
let traversePrimitives: Cesium.PrimitiveCollection;
let pinCollection: Cesium.BillboardCollection;
let pinData: Array<{ pin: Cesium.Billboard } & RoverPinEntry> = [];
let roverSites: Array<{ name: string; id: string; lon: number; lat: number }> = [];
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
    pinCollection = viewer.scene.primitives.add(new Cesium.BillboardCollection());
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

    // Image waypoint pins — one billboard per drive sol, clamped to terrain
    const seenRovers = new Set<string>();
    roverSites = [];
    for (const feature of imagesGeo.features) {
      const { rover, id, sol, color } = feature.properties as {
        rover: string; id: string; sol: number | null; color: string;
      };
      const [lon, lat] = feature.geometry.coordinates as [number, number];
      const cesiumColor = ROVER_COLORS[id] ?? Cesium.Color.fromCssColorString(color);

      // First feature per rover ≈ landing site (sol-sorted for traverse rovers, exact for pin-only)
      if (!seenRovers.has(id)) {
        seenRovers.add(id);
        roverSites.push({ name: rover, id, lon, lat });
      }

      const pin = pinCollection.add({
        position: Cesium.Cartesian3.fromDegrees(lon, lat),
        image: PIN_IMAGES.get(id) ?? makeDotCanvas(cesiumColor),
        heightReference: Cesium.HeightReference.NONE,
        verticalOrigin: Cesium.VerticalOrigin.CENTER,
      });

      pinData.push({ pin, rover, id, sol, color: cesiumColor.toCssColorString() });
    }

    // Click handler — picks billboards, fires callbacks
    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction((movement: { position: Cesium.Cartesian2 }) => {
      const picked = viewer.scene.pick(movement.position);
      const entry = pinData.find((e) => e.pin === picked?.primitive);
      if (entry) {
        onPinClick?.({ rover: entry.rover, id: entry.id, sol: entry.sol, color: entry.color });
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
    roverSites = [];
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
