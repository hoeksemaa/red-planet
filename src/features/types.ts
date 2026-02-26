import type * as Cesium from 'cesium';
import type { AppState } from '../state';

export interface Feature {
  init(viewer: Cesium.Viewer, data: FeatureData): void | Promise<void>;
  apply(state: AppState): void;
  destroy(): void;
}

export interface FeatureData {
  heights: Float32Array;
  contourGeoJSON: ContourGeoJSON | null;
  nomenclatureGeoJSON: NomenclatureGeoJSON | null;
}

export interface ContourFeature {
  properties: { elevation: number };
  geometry: { type: 'MultiLineString'; coordinates: [number, number][][] };
}

export interface ContourGeoJSON {
  type: 'FeatureCollection';
  features: ContourFeature[];
}

export interface NomenclatureFeature {
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: {
    name: string;
    diameter_km: number;
    feature_type: string;
    code: string;
    origin: string;
    quad_name: string;
    link: string;
  };
}

export interface NomenclatureGeoJSON {
  type: 'FeatureCollection';
  features: NomenclatureFeature[];
}

export interface LabelEntry {
  label: Cesium.Label;
  lon: number;
  lat: number;
  name: string;
  diameterKm: number;
  featureType: string;
  origin: string;
}
