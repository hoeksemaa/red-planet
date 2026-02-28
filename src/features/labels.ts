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
let hoveredLabel: Cesium.Label | null = null;
let prefetchedData: NomenclatureGeoJSON | null = null;

// Label visibility: fade in when camera is within `diameterKm * SCALE` meters.
// Floor ensures tiny features still appear at close zoom.
const VISIBILITY_SCALE = 12_000;  // far (m) = diameter (km) × 12k → labels appear 12× sooner than 1:1
const FLOOR_DISTANCE = 50_000;   // 50 km — minimum visibility distance for any label
const FADE_RATIO = 0.6;          // fully opaque within 60% of max distance

// Font size: log-scaled 3× range (11px–33px) based on diameter
const MIN_FONT = 6;
const MAX_FONT = 17;
const LOG_MAX = Math.log(6000);  // ≈ max diameter in km

function labelFont(diameterKm: number): string {
  const t = Math.log(Math.max(diameterKm, 1)) / LOG_MAX;  // 0..1
  const size = Math.round(MIN_FONT + (MAX_FONT - MIN_FONT) * Math.min(t, 1));
  return `${size}px sans-serif`;
}

function labelFade(diameterKm: number): Cesium.NearFarScalar {
  const far = Math.max(diameterKm * VISIBILITY_SCALE, FLOOR_DISTANCE);
  const near = far * FADE_RATIO;
  return new Cesium.NearFarScalar(near, 1.0, far, 0.0);
}

export const labels: Feature = {
  async prefetch() {
    prefetchedData = await fetch(NOMENCLATURE_DATA_URL).then((r) => r.json());
  },

  async init(viewer: Cesium.Viewer) {
    const nomenclatureGeoJSON = prefetchedData ?? await fetch(NOMENCLATURE_DATA_URL).then((r) => r.json());
    labelCollection = viewer.scene.primitives.add(new Cesium.LabelCollection({ scene: viewer.scene }));
    labelData = [];

    for (const feature of nomenclatureGeoJSON.features) {
      const [lon, lat] = feature.geometry.coordinates;
      const { name, diameter_km, feature_type, origin } = feature.properties;

      const label = labelCollection.add({
        position: Cesium.Cartesian3.fromDegrees(lon, lat),
        text: name,
        heightReference: Cesium.HeightReference.CLAMP_TO_TERRAIN,
        font: labelFont(diameter_km),
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        pixelOffset: new Cesium.Cartesian2(0, -8),
        horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        translucencyByDistance: labelFade(diameter_km),
      });

      labelData.push({ label, lon, lat, name, diameterKm: diameter_km,
                       featureType: feature_type, origin });
    }
  },

  hover(picked: any): boolean {
    const entry = labelData.find((e) => e.label === picked?.primitive);
    const label = entry?.label ?? null;

    if (label === hoveredLabel) return label !== null;

    if (hoveredLabel) hoveredLabel.fillColor = Cesium.Color.WHITE;
    hoveredLabel = label;
    if (hoveredLabel) hoveredLabel.fillColor = Cesium.Color.fromCssColorString('#8ab4f8');

    return hoveredLabel !== null;
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
    .map(({ name, lon, lat, diameterKm, featureType, origin }) => ({ kind: 'location' as const, name, lon, lat, diameterKm, featureType, origin }));
}
