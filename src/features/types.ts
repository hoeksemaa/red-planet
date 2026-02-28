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

// ── Unified search ──────────────────────────────────────────

export interface LocationSearchResult {
  kind: 'location';
  name: string;
  lon: number;
  lat: number;
  diameterKm: number;
}

export interface RoverSearchResult {
  kind: 'rover';
  name: string;
  id: string;
  lon: number;
  lat: number;
  color: string;
}

export interface SatelliteSearchResult {
  kind: 'satellite';
  name: string;
  altitudeKm: number;
  periodMinutes: number;
  color: string;
}

export type UnifiedSearchResult =
  | LocationSearchResult
  | RoverSearchResult
  | SatelliteSearchResult;
