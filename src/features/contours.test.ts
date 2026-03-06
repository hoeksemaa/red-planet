import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { AppState } from '../state';

// vi.mock is hoisted above imports by vitest — this mock is in place before
// contours.ts is imported, so Cesium calls never reach real WebGL.
vi.mock('cesium', () => {
  // Primitive is a constructor whose instances have a mutable .show flag.
  // That's the only Primitive property contours.ts cares about at test time.
  const Primitive = vi.fn().mockImplementation(function (this: any, config: any) {
    this.show = config.show ?? false;
  });

  return {
    Color: {
      // Returns a plain {h, s, l} object so we can assert on the math values.
      fromHsl: vi.fn((h: number, s: number, l: number) => ({ h, s, l })),
    },
    Cartesian3: {
      fromDegrees: vi.fn((lon: number, lat: number, alt: number) => ({ lon, lat, alt })),
    },
    // Regular functions (not arrows) so they work as constructors via `new`
    GeometryInstance: vi.fn().mockImplementation(function (config: any) { return { ...config }; }),
    PolylineGeometry: vi.fn().mockImplementation(function (config: any) { return { ...config }; }),
    ColorGeometryInstanceAttribute: { fromColor: vi.fn((c: any) => c) },
    Primitive,
    PolylineColorAppearance: vi.fn().mockImplementation(function (config: any) { return { ...config }; }),
  };
});

import * as Cesium from 'cesium';
import { elevationToColor, contours } from './contours';
import { EXAGGERATION_SCALE } from '../constants';

// ── helpers ──────────────────────────────────────────────────────────────────

// Minimal valid ContourGeoJSON — two features, each with a 2+ point polyline.
const fakeGeoJSON = {
  type: 'FeatureCollection',
  features: [
    {
      properties: { elevation: 5000 },
      geometry: {
        type: 'MultiLineString',
        coordinates: [[[0, 0], [1, 0], [2, 0]]],
      },
    },
    {
      properties: { elevation: -3000 },
      geometry: {
        type: 'MultiLineString',
        coordinates: [[[10, 20], [11, 20]]],
      },
    },
  ],
};

// Build a minimal viewer mock that captures what gets added to the scene.
// Returns both the viewer and a reference to the primitives array so tests
// can inspect which primitives were built.
function makeViewer() {
  const added: any[] = [];
  const viewer = {
    scene: {
      primitives: {
        add: vi.fn().mockImplementation((p: any) => { added.push(p); return p; }),
        remove: vi.fn(),
      },
    },
  };
  return { viewer: viewer as any, added };
}

// Build a full AppState from partial layer overrides — less boilerplate in tests.
function makeState(layers: Partial<AppState['layers']> = {}, exaggeration = 1): AppState {
  return {
    exaggeration,
    imagery: 'terraformed',
    layers: {
      contours: false,
      graticule: false,
      labels: true,
      rovers: true,
      satellites: false,
      ...layers,
    },
  };
}

// Wait until init's async fetch chain has resolved (both primitives added to scene).
async function waitForInit(viewer: ReturnType<typeof makeViewer>['viewer']) {
  await vi.waitFor(() => {
    expect(viewer.scene.primitives.add).toHaveBeenCalledTimes(2);
  });
}

// ── fixtures ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    json: () => Promise.resolve(structuredClone(fakeGeoJSON)),
  }));
});

afterEach(() => {
  contours.destroy();
  // destroy() resets `initialized` and `primitives` but NOT `pendingState`.
  // If we don't clear it, a stale { contours: true } from one test will get
  // replayed by the next test's init() call. Call apply() while uninitialized
  // to overwrite the pending queue without touching any primitives.
  contours.apply(makeState());
  vi.unstubAllGlobals();
});

// ── elevationToColor ──────────────────────────────────────────────────────────
//
// elevationToColor maps elevation → HSL color for contour line rendering.
// The math:
//   raw = clamp((elev + 8000) / 29000, 0, 1)   ← normalises -8000..21000 → 0..1
//   t   = raw^0.6                               ← gamma-curve (brightens low end)
//   hue = 0.83 * (1 - t)                        ← 0.83 (blue-violet) at low → 0 (red) at high
//   sat = 1.0
//   lit = 0.22 + 0.33 * t^1.8                  ← 0.22 at low → 0.55 at high

describe('elevationToColor', () => {
  const fromHsl = () => Cesium.Color.fromHsl as ReturnType<typeof vi.fn>;

  it('calls Color.fromHsl with saturation always 1.0', () => {
    elevationToColor(0);
    expect(fromHsl().mock.calls[0][1]).toBe(1.0);
  });

  describe('at the low extreme (-8000 m — floor of the MOLA range)', () => {
    it('produces maximum hue (~0.83, blue-violet)', () => {
      elevationToColor(-8000);
      const [h] = fromHsl().mock.calls[0];
      expect(h).toBeCloseTo(0.83, 5);
    });

    it('produces minimum lightness (0.22)', () => {
      elevationToColor(-8000);
      const [, , l] = fromHsl().mock.calls[0];
      expect(l).toBeCloseTo(0.22, 5);
    });
  });

  describe('at the high extreme (21000 m — Olympus Mons scale)', () => {
    it('produces minimum hue (0, red)', () => {
      elevationToColor(21000);
      const [h] = fromHsl().mock.calls[0];
      expect(h).toBeCloseTo(0, 5);
    });

    it('produces maximum lightness (0.55)', () => {
      elevationToColor(21000);
      const [, , l] = fromHsl().mock.calls[0];
      expect(l).toBeCloseTo(0.55, 5);
    });
  });

  describe('clamping', () => {
    it('elevation below -8000 produces the same color as -8000', () => {
      elevationToColor(-10000);
      const below = fromHsl().mock.calls[0].slice();
      vi.clearAllMocks();

      elevationToColor(-8000);
      const floor = fromHsl().mock.calls[0].slice();

      expect(below).toEqual(floor);
    });

    it('elevation above 21000 produces the same color as 21000', () => {
      elevationToColor(30000);
      const above = fromHsl().mock.calls[0].slice();
      vi.clearAllMocks();

      elevationToColor(21000);
      const ceil = fromHsl().mock.calls[0].slice();

      expect(above).toEqual(ceil);
    });
  });

  it('hue decreases monotonically as elevation rises (blue→red gradient)', () => {
    const elevations = [-8000, -3000, 0, 5000, 10000, 21000];
    const hues: number[] = [];

    for (const elev of elevations) {
      elevationToColor(elev);
      hues.push((fromHsl().mock.calls.at(-1) as number[])[0]);
    }

    // Each hue should be ≤ the previous one
    for (let i = 1; i < hues.length; i++) {
      expect(hues[i]).toBeLessThanOrEqual(hues[i - 1]);
    }
  });

  it('lightness increases monotonically as elevation rises (darker valleys)', () => {
    const elevations = [-8000, -3000, 0, 5000, 10000, 21000];
    const lightnesses: number[] = [];

    for (const elev of elevations) {
      elevationToColor(elev);
      lightnesses.push((fromHsl().mock.calls.at(-1) as number[])[2]);
    }

    for (let i = 1; i < lightnesses.length; i++) {
      expect(lightnesses[i]).toBeGreaterThanOrEqual(lightnesses[i - 1]);
    }
  });
});

// ── contours.apply (state → visibility) ───────────────────────────────────────

describe('contours.apply', () => {
  it('does not throw when called before init (primitives not yet loaded)', () => {
    expect(() => contours.apply(makeState({ contours: true }))).not.toThrow();
  });

  describe('after init', () => {
    let added: any[];
    let prim1x: any;   // primitive built for exaggeration = 1
    let prim100x: any; // primitive built for exaggeration = EXAGGERATION_SCALE (100)

    beforeEach(async () => {
      const { viewer, added: a } = makeViewer();
      added = a;
      contours.init(viewer);
      await waitForInit(viewer);
      // init adds primitives in scale order: [1, EXAGGERATION_SCALE]
      prim1x   = added[0];
      prim100x = added[1];
    });

    it('both primitives start hidden (show: false from buildPrimitive)', () => {
      expect(prim1x.show).toBe(false);
      expect(prim100x.show).toBe(false);
    });

    it('shows 1x primitive when contours=true and exaggeration=1', () => {
      contours.apply(makeState({ contours: true }, 1));
      expect(prim1x.show).toBe(true);
      expect(prim100x.show).toBe(false);
    });

    it(`shows ${EXAGGERATION_SCALE}x primitive when contours=true and exaggeration=${EXAGGERATION_SCALE}`, () => {
      contours.apply(makeState({ contours: true }, EXAGGERATION_SCALE));
      expect(prim1x.show).toBe(false);
      expect(prim100x.show).toBe(true);
    });

    it('hides all primitives when contours=false regardless of exaggeration', () => {
      contours.apply(makeState({ contours: false }, 1));
      expect(prim1x.show).toBe(false);
      expect(prim100x.show).toBe(false);

      contours.apply(makeState({ contours: false }, EXAGGERATION_SCALE));
      expect(prim1x.show).toBe(false);
      expect(prim100x.show).toBe(false);
    });

    it('correctly toggles when switching exaggeration levels', () => {
      contours.apply(makeState({ contours: true }, 1));
      expect(prim1x.show).toBe(true);
      expect(prim100x.show).toBe(false);

      contours.apply(makeState({ contours: true }, EXAGGERATION_SCALE));
      expect(prim1x.show).toBe(false);
      expect(prim100x.show).toBe(true);
    });

    it('turning contours off after they were on hides the active primitive', () => {
      contours.apply(makeState({ contours: true }, 1));
      expect(prim1x.show).toBe(true);

      contours.apply(makeState({ contours: false }, 1));
      expect(prim1x.show).toBe(false);
    });
  });

  describe('pending state (apply called before init completes)', () => {
    it('replays queued state once init finishes', async () => {
      // User enables contours before the data has loaded.
      contours.apply(makeState({ contours: true }, 1));

      const { viewer, added } = makeViewer();
      contours.init(viewer);
      await waitForInit(viewer);

      // init replays pendingState — the 1x primitive should be visible.
      expect(added[0].show).toBe(true);
      expect(added[1].show).toBe(false);
    });

    it('replays the last queued state, not an earlier one', async () => {
      // Two queued applies — only the last one should stick.
      contours.apply(makeState({ contours: true }, EXAGGERATION_SCALE));
      contours.apply(makeState({ contours: false }, 1)); // overrides the first

      const { viewer, added } = makeViewer();
      contours.init(viewer);
      await waitForInit(viewer);

      // The final pending state had contours=false → both hidden.
      expect(added[0].show).toBe(false);
      expect(added[1].show).toBe(false);
    });
  });
});
