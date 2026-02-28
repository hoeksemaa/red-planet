import * as Cesium from 'cesium';
import type { Feature, FeatureData, SatelliteSearchResult } from './types';
import type { AppState } from '../state';
import {
  SATELLITES, SATELLITE_TIME_MULTIPLIER,
  EARTH_RADIUS_KM, MARS_RADIUS_KM,
  type SatelliteElements,
} from '../constants';

// ── Public click callback wiring (same pattern as rovers) ───

export interface SatelliteEntry {
  name: string;
  altitudeKm: number;
  periodMinutes: number;
  color: string;
}

let onSatClick: ((entry: SatelliteEntry) => void) | null = null;
let onSatMiss: (() => void) | null = null;

export function setOnSatelliteClick(fn: (entry: SatelliteEntry) => void): void {
  onSatClick = fn;
}
export function setOnSatelliteMiss(fn: () => void): void {
  onSatMiss = fn;
}

// ── Keplerian math ──────────────────────────────────────────

const DEG = Math.PI / 180;
const TWO_PI = 2 * Math.PI;
const SCALE = EARTH_RADIUS_KM / MARS_RADIUS_KM; // ≈1.88

/** Solve Kepler's equation M = E - e·sin(E) via Newton-Raphson. */
function solveKepler(M: number, e: number): number {
  let E = M; // good initial guess for low e
  for (let i = 0; i < 8; i++) {
    const dE = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= dE;
    if (Math.abs(dE) < 1e-10) break;
  }
  return E;
}

/** Eccentric anomaly → true anomaly. */
function eccentricToTrue(E: number, e: number): number {
  return 2 * Math.atan2(
    Math.sqrt(1 + e) * Math.sin(E / 2),
    Math.sqrt(1 - e) * Math.cos(E / 2),
  );
}

/**
 * Compute Cartesian3 position from orbital elements + true anomaly.
 * Returns coordinates in Cesium's ECEF frame, scaled to WGS84 globe.
 */
function orbitalCartesian(el: SatelliteElements, nu: number): Cesium.Cartesian3 {
  // Distance from focus
  const a = el.semiMajorAxisKm * SCALE; // scale to WGS84 proportions
  const e = el.eccentricity;
  const r = (a * (1 - e * e)) / (1 + e * Math.cos(nu));

  // Position in orbital plane (perifocal frame)
  const xOrbital = r * Math.cos(nu);
  const yOrbital = r * Math.sin(nu);

  // Euler angles
  const omega = el.argPeriapsisDeg * DEG;  // argument of periapsis
  const inc   = el.inclinationDeg * DEG;   // inclination
  const raan  = el.raanDeg * DEG;          // right ascension of ascending node

  // Precompute trig
  const cO = Math.cos(omega), sO = Math.sin(omega);
  const cI = Math.cos(inc),   sI = Math.sin(inc);
  const cR = Math.cos(raan),  sR = Math.sin(raan);

  // Rotation: orbital plane → equatorial frame (standard aerospace convention)
  const x = (cR * cO - sR * sO * cI) * xOrbital + (-cR * sO - sR * cO * cI) * yOrbital;
  const y = (sR * cO + cR * sO * cI) * xOrbital + (-sR * sO + cR * cO * cI) * yOrbital;
  const z = (sO * sI) * xOrbital + (cO * sI) * yOrbital;

  // Convert km → meters for Cesium
  return new Cesium.Cartesian3(x * 1000, y * 1000, z * 1000);
}

// ── Canvas dot (matches rover pattern) ──────────────────────

function makeDotCanvas(cssColor: string): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 16;
  canvas.height = 16;
  const ctx = canvas.getContext('2d')!;
  // white outline
  ctx.beginPath();
  ctx.arc(8, 8, 7, 0, TWO_PI);
  ctx.fillStyle = 'white';
  ctx.fill();
  // colored fill
  ctx.beginPath();
  ctx.arc(8, 8, 5, 0, TWO_PI);
  ctx.fillStyle = cssColor;
  ctx.fill();
  return canvas;
}

// ── Module state ────────────────────────────────────────────

let orbitPrimitives: Cesium.PrimitiveCollection;
let dotCollection: Cesium.BillboardCollection;
let dotData: Array<{ billboard: Cesium.Billboard; elements: SatelliteElements }> = [];
let removePostRender: (() => void) | null = null;
let removeClickHandler: (() => void) | null = null;
const epoch = Date.now();

// ── Feature ─────────────────────────────────────────────────

export const satellites: Feature = {
  init(viewer: Cesium.Viewer, _data: FeatureData): void {
    orbitPrimitives = viewer.scene.primitives.add(new Cesium.PrimitiveCollection());
    dotCollection = viewer.scene.primitives.add(new Cesium.BillboardCollection());
    dotData = [];

    for (const el of SATELLITES) {
      const color = Cesium.Color.fromCssColorString(el.color);

      // ── Orbit ring: 360 sample points ──
      const positions: Cesium.Cartesian3[] = [];
      for (let deg = 0; deg <= 360; deg++) {
        positions.push(orbitalCartesian(el, deg * DEG));
      }

      orbitPrimitives.add(
        new Cesium.Primitive({
          geometryInstances: new Cesium.GeometryInstance({
            geometry: new Cesium.PolylineGeometry({
              positions,
              width: 1.5,
            }),
            attributes: {
              color: Cesium.ColorGeometryInstanceAttribute.fromColor(color.withAlpha(0.6)),
            },
          }),
          appearance: new Cesium.PolylineColorAppearance(),
          asynchronous: true,
        }),
      );

      // ── Animated dot ──
      const billboard = dotCollection.add({
        position: orbitalCartesian(el, el.meanAnomalyDeg * DEG),
        image: makeDotCanvas(el.color),
        heightReference: Cesium.HeightReference.NONE,
        verticalOrigin: Cesium.VerticalOrigin.CENTER,
      });
      dotData.push({ billboard, elements: el });
    }

    // ── PostRender: update dot positions each frame ──
    const handler = () => {
      const elapsedSec = ((Date.now() - epoch) / 1000) * SATELLITE_TIME_MULTIPLIER;
      for (const { billboard, elements: el } of dotData) {
        const M0 = el.meanAnomalyDeg * DEG;
        const M = (M0 + (TWO_PI * elapsedSec) / el.periodSeconds) % TWO_PI;
        const E = solveKepler(M, el.eccentricity);
        const nu = eccentricToTrue(E, el.eccentricity);
        billboard.position = orbitalCartesian(el, nu);
      }
    };
    viewer.scene.postRender.addEventListener(handler);
    removePostRender = () => viewer.scene.postRender.removeEventListener(handler);

    // ── Click handler ──
    const clickHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    clickHandler.setInputAction((movement: { position: Cesium.Cartesian2 }) => {
      const picked = viewer.scene.pick(movement.position);
      const entry = dotData.find((d) => d.billboard === picked?.primitive);
      if (entry) {
        const el = entry.elements;
        onSatClick?.({
          name: el.name,
          altitudeKm: Math.round(el.semiMajorAxisKm - MARS_RADIUS_KM),
          periodMinutes: Math.round(el.periodSeconds / 60),
          color: el.color,
        });
      } else {
        onSatMiss?.();
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
    removeClickHandler = () => clickHandler.destroy();
  },

  apply(state: AppState) {
    if (orbitPrimitives) orbitPrimitives.show = state.layers.satellites;
    if (dotCollection) dotCollection.show = state.layers.satellites;
  },

  destroy() {
    removePostRender?.();
    removePostRender = null;
    removeClickHandler?.();
    removeClickHandler = null;
    dotData = [];
  },
};

export function searchSatellites(query: string): SatelliteSearchResult[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const all = q === '*';
  return SATELLITES
    .filter((s) => all || s.name.toLowerCase().includes(q))
    .map((s) => ({
      kind: 'satellite' as const,
      name: s.name,
      altitudeKm: Math.round(s.semiMajorAxisKm - MARS_RADIUS_KM),
      periodMinutes: Math.round(s.periodSeconds / 60),
      color: s.color,
    }));
}
