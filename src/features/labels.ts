import * as Cesium from 'cesium';
import type { Feature, FeatureInfo, NomenclatureGeoJSON, LocationSearchResult } from './types';
import type { AppState } from '../state';
import { NOMENCLATURE_DATA_URL } from '../constants';

interface LabelEntry {
  label: Cesium.Label;
  lon: number;
  lat: number;
  name: string;
  diameterKm: number;
  featureType: string;
  origin: string;
}

let labelCollection: Cesium.LabelCollection;
let labelData: LabelEntry[] = [];
let removeListener: (() => void) | null = null;

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
  async init(viewer: Cesium.Viewer) {
    const nomenclatureGeoJSON: NomenclatureGeoJSON = await fetch(NOMENCLATURE_DATA_URL).then((r) => r.json());
    labelCollection = viewer.scene.primitives.add(new Cesium.LabelCollection({ scene: viewer.scene }));
    labelData = [];

    for (const feature of nomenclatureGeoJSON.features) {
      const [lon, lat] = feature.geometry.coordinates;
      const { name, diameter_km, feature_type, origin } = feature.properties;

      const label = labelCollection.add({
        position: Cesium.Cartesian3.fromDegrees(lon, lat),
        text: name,
        show: false,
        heightReference: Cesium.HeightReference.CLAMP_TO_TERRAIN,
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
  },

  pick(picked: any): FeatureInfo | undefined {
    const entry = labelData.find((e) => e.label === picked?.primitive);
    if (!entry) return undefined;
    const { name, featureType, diameterKm, origin, lon, lat } = entry;
    return { name, featureType, diameterKm, origin, lon, lat };
  },

  apply(state: AppState) {
    if (labelCollection) labelCollection.show = state.layers.labels;
  },

  destroy() {
    removeListener?.();
    removeListener = null;
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
