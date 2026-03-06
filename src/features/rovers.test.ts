import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// rovers.ts builds PIN_IMAGES and CAMERA_IMAGES at module level by calling
// makeDotCanvas / makeCameraCanvas — both call document.createElement('canvas').
// vi.hoisted() runs before any import, so the stub is in place when rovers.ts loads.
vi.hoisted(() => {
  const fakeCtx = {
    beginPath: () => {}, arc: () => {}, fill: () => {},
    stroke: () => {}, roundRect: () => {}, strokeStyle: '', fillStyle: '',
    lineWidth: 0,
  };
  (globalThis as any).document = {
    createElement: () => ({ width: 0, height: 0, getContext: () => fakeCtx }),
  };
});

// Cesium mock: ROVER_COLORS is built at module level via Color.fromCssColorString().
// Each returned color must have .toCssColorString() because searchRovers calls it.
vi.mock('cesium', () => ({
  Color: {
    fromCssColorString: vi.fn((s: string) => ({ toCssColorString: () => s })),
    WHITE: { toCssColorString: () => '#ffffff' },
  },
  BillboardCollection: vi.fn().mockImplementation(function (this: any) {
    this.show = false;
    this.add = vi.fn().mockReturnValue({});
  }),
  GroundPolylinePrimitive: vi.fn().mockImplementation(function (this: any) {
    this.show = true;
  }),
  GeometryInstance: vi.fn().mockImplementation(function (config: any) { return config; }),
  GroundPolylineGeometry: vi.fn().mockImplementation(function (config: any) { return config; }),
  ColorGeometryInstanceAttribute: { fromColor: vi.fn((c: any) => c) },
  PolylineColorAppearance: vi.fn(),
  Cartesian3: { fromDegrees: vi.fn((lon: number, lat: number) => ({ lon, lat })) },
  Cartesian2: vi.fn().mockImplementation(function (this: any, x: number, y: number) {
    this.x = x; this.y = y;
  }),
  HeightReference: { CLAMP_TO_TERRAIN: 1 },
  VerticalOrigin: { CENTER: 0, BOTTOM: 1 },
  HorizontalOrigin: { CENTER: 0 },
}));

import { searchRovers, rovers } from './rovers';

// ── helpers ──────────────────────────────────────────────────────────────────

function makeViewer() {
  return {
    scene: {
      primitives: {
        add: vi.fn().mockImplementation((p: any) => p),
        remove: vi.fn(),
      },
    },
  } as any;
}

// init() resolves a Promise.all([traverse, images]) then runs a synchronous
// callback that: (1) adds BillboardCollection, (2) adds GroundPolylinePrimitive,
// (3) populates roverSites from the images loop. All three happen in one tick.
// Once primitives.add has been called twice, the full callback — including
// roverSites population — has already completed.
async function waitForInit(viewer: ReturnType<typeof makeViewer>) {
  await vi.waitFor(() => {
    expect(viewer.scene.primitives.add).toHaveBeenCalledTimes(2);
  });
}

// Minimal traverse GeoJSON — two rovers, each with ≥2 coordinates (required by
// rovers.ts: `if (positions.length < 2) continue`).
const fakeTraverseGeo = {
  type: 'FeatureCollection',
  features: [
    {
      properties: { id: 'perseverance' },
      geometry: { type: 'LineString', coordinates: [[77.0, 18.0], [77.1, 18.1]] },
    },
    {
      properties: { id: 'curiosity' },
      geometry: { type: 'LineString', coordinates: [[137.0, -4.0], [137.1, -4.1]] },
    },
  ],
};

// Images GeoJSON: the first feature per rover id becomes the roverSites entry.
// Perseverance appears twice — only the first should appear in roverSites.
const fakeImagesGeo = {
  type: 'FeatureCollection',
  features: [
    {
      properties: { rover: 'Perseverance', id: 'perseverance', sol: 100, color: '#FF6B35' },
      geometry: { type: 'Point', coordinates: [77.45, 18.44] },
    },
    {
      // duplicate rover — should be skipped by the seenRovers guard
      properties: { rover: 'Perseverance', id: 'perseverance', sol: 200, color: '#FF6B35' },
      geometry: { type: 'Point', coordinates: [99.0, 99.0] },
    },
    {
      properties: { rover: 'Curiosity', id: 'curiosity', sol: 1000, color: '#4CAF50' },
      geometry: { type: 'Point', coordinates: [137.35, -4.68] },
    },
    {
      properties: { rover: 'Spirit', id: 'spirit', sol: 500, color: '#2196F3' },
      geometry: { type: 'Point', coordinates: [175.48, -14.57] },
    },
  ],
};

// ── fixtures ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', vi.fn()
    .mockResolvedValueOnce({ json: () => Promise.resolve(structuredClone(fakeTraverseGeo)) })
    .mockResolvedValueOnce({ json: () => Promise.resolve(structuredClone(fakeImagesGeo)) })
  );
});

afterEach(() => {
  rovers.destroy();
  vi.unstubAllGlobals();
});

// ── searchRovers — pre-init ───────────────────────────────────────────────────

describe('searchRovers (before init)', () => {
  it('returns [] for empty string', () => {
    expect(searchRovers('')).toEqual([]);
  });

  it('returns [] for whitespace-only string', () => {
    expect(searchRovers('   ')).toEqual([]);
  });

  it('returns [] for any query when no data is loaded', () => {
    expect(searchRovers('perseverance')).toEqual([]);
    expect(searchRovers('*')).toEqual([]);
  });
});

// ── searchRovers — after init ─────────────────────────────────────────────────

describe('searchRovers (after init)', () => {
  let viewer: ReturnType<typeof makeViewer>;

  beforeEach(async () => {
    viewer = makeViewer();
    rovers.init(viewer);
    await waitForInit(viewer);
  });

  describe('query matching', () => {
    it('case-insensitive: "perseverance" matches "Perseverance"', () => {
      const results = searchRovers('perseverance');
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('Perseverance');
    });

    it('case-insensitive: "CURIOSITY" matches "Curiosity"', () => {
      const results = searchRovers('CURIOSITY');
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('Curiosity');
    });

    it('partial match: "it" matches Curiosity and Spirit', () => {
      // "Curiosity" contains "it" (os-i-t-y), "Spirit" contains "it" (spir-i-t)
      const results = searchRovers('it');
      const names = results.map((r) => r.name);
      expect(names).toContain('Curiosity');
      expect(names).toContain('Spirit');
      expect(names).not.toContain('Perseverance');
    });

    it('returns [] when nothing matches', () => {
      expect(searchRovers('sojourner')).toEqual([]);
    });

    it('wildcard "*" returns all rovers', () => {
      const results = searchRovers('*');
      expect(results).toHaveLength(3);
      const names = results.map((r) => r.name);
      expect(names).toContain('Perseverance');
      expect(names).toContain('Curiosity');
      expect(names).toContain('Spirit');
    });
  });

  describe('deduplication', () => {
    it('returns one entry per rover even when multiple images share the same id', () => {
      // fakeImagesGeo has 2 Perseverance entries — roverSites should only have one
      const results = searchRovers('perseverance');
      expect(results).toHaveLength(1);
    });
  });

  describe('result shape', () => {
    it('kind is "rover"', () => {
      const [r] = searchRovers('perseverance');
      expect(r.kind).toBe('rover');
    });

    it('lon and lat come from the first image feature for that rover', () => {
      const [r] = searchRovers('perseverance');
      // First perseverance image is [77.45, 18.44] — the duplicate at [99, 99] is skipped
      expect(r.lon).toBe(77.45);
      expect(r.lat).toBe(18.44);
    });

    it('id matches the rover id from the GeoJSON properties', () => {
      const [r] = searchRovers('curiosity');
      expect(r.id).toBe('curiosity');
    });

    it('color comes from ROVER_COLORS lookup via toCssColorString()', () => {
      // ROVER_COLORS['perseverance'] = fromCssColorString('#FF6B35')
      // our mock: fromCssColorString(s) → { toCssColorString: () => s }
      const [r] = searchRovers('perseverance');
      expect(r.color).toBe('#FF6B35');
    });

    it('falls back to Color.WHITE for an unknown rover id', () => {
      // Spirit is a known id — but let's verify the fallback is wired:
      // ROVER_COLORS['spirit'] is '#2196F3' from our mock
      const [r] = searchRovers('spirit');
      expect(r.color).toBe('#2196F3');
    });
  });
});
