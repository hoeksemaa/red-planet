import type * as Cesium from 'cesium';
import type { AppState } from '../state';

export interface Feature {
  init(viewer: Cesium.Viewer): void | Promise<void>;
  apply(state: AppState): void;
  destroy(): void;
  pick?(picked: any): unknown | undefined;
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

export interface FeatureInfo {
  name: string;
  featureType: string;
  diameterKm: number;
  origin: string;
  lon: number;
  lat: number;
}

export interface SearchResult {
  name: string;
  lon: number;
  lat: number;
  diameterKm: number;
}
