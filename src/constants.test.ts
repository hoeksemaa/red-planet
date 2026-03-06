import { describe, it, expect } from 'vitest';
import { flyToAltitude } from './constants';

// flyToAltitude picks a camera altitude based on feature diameter.
// The logic has 4 branches with hard thresholds at 500, 100, and 10 km.
// Bugs here mean the camera lands at wildly wrong altitudes on every fly-to.

describe('flyToAltitude', () => {
  describe('giant features (≥500 km)', () => {
    it('returns 1_500_000 for a planet-scale feature', () => {
      expect(flyToAltitude(1000)).toBe(1_500_000);
    });

    it('returns 1_500_000 at exactly the 500 km threshold', () => {
      // boundary: 500 is ≥500, so this is the "giant" bucket
      expect(flyToAltitude(500)).toBe(1_500_000);
    });
  });

  describe('large features (100–499 km)', () => {
    it('returns 500_000 for a 200 km crater', () => {
      expect(flyToAltitude(200)).toBe(500_000);
    });

    it('returns 500_000 at exactly the 100 km threshold', () => {
      // boundary: 100 is ≥100 but <500, so "large" bucket
      expect(flyToAltitude(100)).toBe(500_000);
    });

    it('returns 500_000 at 499 km (just under giant threshold)', () => {
      expect(flyToAltitude(499)).toBe(500_000);
    });
  });

  describe('medium features (10–99 km)', () => {
    it('returns 200_000 for a 50 km valley', () => {
      expect(flyToAltitude(50)).toBe(200_000);
    });

    it('returns 200_000 at exactly the 10 km threshold', () => {
      // boundary: 10 is ≥10 but <100, so "medium" bucket
      expect(flyToAltitude(10)).toBe(200_000);
    });

    it('returns 200_000 at 99 km (just under large threshold)', () => {
      expect(flyToAltitude(99)).toBe(200_000);
    });
  });

  describe('small features (<10 km)', () => {
    it('returns 100_000 for a rover-scale 1 km feature', () => {
      expect(flyToAltitude(1)).toBe(100_000);
    });

    it('returns 100_000 at 0 km', () => {
      expect(flyToAltitude(0)).toBe(100_000);
    });

    it('returns 100_000 at 9.9 km (just under medium threshold)', () => {
      expect(flyToAltitude(9.9)).toBe(100_000);
    });

    it('returns 100_000 for negative diameters (bad data gracefully handled)', () => {
      // No spec for this, but it should fall through to the default bucket
      expect(flyToAltitude(-10)).toBe(100_000);
    });
  });
});
