import { vi, describe, it, expect } from 'vitest';

// searchSatellites() reads from the static SATELLITES constant in constants.ts —
// no WebGL, no DOM, no module-level Cesium calls. We mock 'cesium' only to
// prevent Cesium's browser-targeting module code from crashing in node.
vi.mock('cesium', () => ({
  BillboardCollection: vi.fn(),
  Cartesian3: vi.fn(),
  Color: { fromCssColorString: vi.fn(() => ({ withAlpha: vi.fn() })) },
  GeometryInstance: vi.fn(),
  PolylineGeometry: vi.fn(),
  ColorGeometryInstanceAttribute: { fromColor: vi.fn() },
  Primitive: vi.fn(),
  PolylineColorAppearance: vi.fn(),
  JulianDate: { now: vi.fn() },
}));

import { searchSatellites } from './satellites';
import { SATELLITES, MARS_RADIUS_KM } from '../constants';

// Convenience: what does searchSatellites *should* return for a single satellite?
function expectedResult(s: (typeof SATELLITES)[number]) {
  return {
    kind: 'satellite' as const,
    name: s.name,
    altitudeKm: Math.round(s.semiMajorAxisKm - MARS_RADIUS_KM),
    periodMinutes: Math.round(s.periodSeconds / 60),
    color: s.color,
    description: s.description,
    imageUrl: s.imageUrl,
  };
}

const MRO = SATELLITES.find((s) => s.name === 'MRO')!;

describe('searchSatellites', () => {
  describe('empty / whitespace query', () => {
    it('returns [] for empty string', () => {
      expect(searchSatellites('')).toEqual([]);
    });

    it('returns [] for whitespace-only string (trim check)', () => {
      expect(searchSatellites('   ')).toEqual([]);
    });
  });

  describe('wildcard "*"', () => {
    it('returns all satellites', () => {
      const results = searchSatellites('*');
      expect(results).toHaveLength(SATELLITES.length);
    });

    it('every result has kind="satellite"', () => {
      searchSatellites('*').forEach((r) => {
        expect(r.kind).toBe('satellite');
      });
    });
  });

  describe('name matching', () => {
    it('case-insensitive: "mro" matches MRO', () => {
      const results = searchSatellites('mro');
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('MRO');
    });

    it('case-insensitive: "MRO" matches MRO', () => {
      // query is lowercased; satellite name is also lowercased for comparison
      const results = searchSatellites('MRO');
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('MRO');
    });

    it('partial match: "mars" returns Mars Odyssey and Mars Express', () => {
      const results = searchSatellites('mars');
      const names = results.map((r) => r.name);
      expect(names).toContain('Mars Odyssey');
      expect(names).toContain('Mars Express');
      // Should not include satellites with no "mars" in the name
      expect(names).not.toContain('MRO');
      expect(names).not.toContain('MAVEN');
    });

    it('returns [] when nothing matches', () => {
      expect(searchSatellites('voyager')).toEqual([]);
    });
  });

  describe('result shape', () => {
    it('altitudeKm = round(semiMajorAxisKm - MARS_RADIUS_KM)', () => {
      const [result] = searchSatellites('mro');
      expect(result.altitudeKm).toBe(Math.round(MRO.semiMajorAxisKm - MARS_RADIUS_KM));
    });

    it('periodMinutes = round(periodSeconds / 60)', () => {
      const [result] = searchSatellites('mro');
      expect(result.periodMinutes).toBe(Math.round(MRO.periodSeconds / 60));
    });

    it('passes through color, description, imageUrl unchanged', () => {
      const [result] = searchSatellites('mro');
      expect(result.color).toBe(MRO.color);
      expect(result.description).toBe(MRO.description);
      expect(result.imageUrl).toBe(MRO.imageUrl);
    });

    it('full result matches expected shape', () => {
      const [result] = searchSatellites('mro');
      expect(result).toEqual(expectedResult(MRO));
    });
  });
});
