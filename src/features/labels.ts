import * as Cesium from 'cesium';
import type { Feature, FeatureData, LabelEntry, LocationSearchResult } from './types';
import type { AppState } from '../state';

let labelCollection: Cesium.LabelCollection;
let labelData: LabelEntry[] = [];
let removeListener: (() => void) | null = null;
let removeClickHandler: (() => void) | null = null;
let onLabelClick: ((entry: LabelEntry) => void) | null = null;
let onLabelMiss: (() => void) | null = null;

export function setOnLabelClick(fn: (entry: LabelEntry) => void): void {
  onLabelClick = fn;
}
export function setOnLabelMiss(fn: () => void): void {
  onLabelMiss = fn;
}

function updateLabels(camera: Cesium.Camera): void {
  const alt = camera.positionCartographic.height;
  for (const { label, diameterKm } of labelData) {
    if (alt > 10_000_000) {
      label.show = diameterKm >= 500;
    } else if (alt > 2_000_000) {
      label.show = diameterKm >= 100;
    } else {
      label.show = true;
    }
  }
}

export const labels: Feature = {
  init(viewer: Cesium.Viewer, data: FeatureData) {
    labelCollection = viewer.scene.primitives.add(new Cesium.LabelCollection());
    labelData = [];

    for (const feature of data.nomenclatureGeoJSON.features) {
      const [lon, lat] = feature.geometry.coordinates;
      const { name, diameter_km, feature_type, origin } = feature.properties;

      const label = labelCollection.add({
        position: Cesium.Cartesian3.fromDegrees(lon, lat),
        text: name,
        show: false,
        font: '13px sans-serif',
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        pixelOffset: new Cesium.Cartesian2(0, -8),
        horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
      });

      labelData.push({ label, lon, lat, name, diameterKm: diameter_km,
                       featureType: feature_type, origin });
    }

    // Throttled postRender listener — ~2 checks/sec for 2k labels
    let lastUpdate = 0;
    const handler = () => {
      const now = Date.now();
      if (now - lastUpdate < 500) return;
      lastUpdate = now;
      updateLabels(viewer.camera);
    };
    viewer.scene.postRender.addEventListener(handler);
    removeListener = () => viewer.scene.postRender.removeEventListener(handler);

    // Click handler — pick label under cursor, fire callback
    const clickHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    clickHandler.setInputAction((movement: { position: Cesium.Cartesian2 }) => {
      const picked = viewer.scene.pick(movement.position);
      const matchedEntry = labelData.find((e) => e.label === picked?.primitive);
      if (matchedEntry) {
        onLabelClick?.(matchedEntry);
      } else {
        onLabelMiss?.();
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
    removeClickHandler = () => clickHandler.destroy();
  },

  apply(state: AppState) {
    if (labelCollection) labelCollection.show = state.layers.labels;
  },

  destroy() {
    removeListener?.();
    removeListener = null;
    removeClickHandler?.();
    removeClickHandler = null;
    labelData = [];
  },
};

export function searchLabels(query: string): LocationSearchResult[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const all = q === '*';
  return labelData
    .filter((d) => all || d.name.toLowerCase().includes(q))
    .slice(0, 10)
    .map(({ name, lon, lat, diameterKm }) => ({ kind: 'location' as const, name, lon, lat, diameterKm }));
}

export function flyToAltitude(diameterKm: number): number {
  if (diameterKm >= 500) return 1_500_000;
  if (diameterKm >= 100) return 500_000;
  if (diameterKm >= 10) return 200_000;
  return 100_000;
}
