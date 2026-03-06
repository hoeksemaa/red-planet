import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// vi.mock is hoisted above imports — Cesium is mocked before labels.ts loads.
vi.mock('cesium', () => {
  // LabelCollection is a constructor whose instances have an .add() method.
  // .add() returns a plain object with .fillColor — enough for hover() to work.
  const LabelCollection = vi.fn().mockImplementation(function (this: any) {
    this.show = true;
    this.add = vi.fn().mockImplementation(function (config: any) {
      return { fillColor: config.fillColor ?? null };
    });
  });

  return {
    LabelCollection,
    Cartesian3: { fromDegrees: vi.fn((lon: number, lat: number) => ({ lon, lat })) },
    Cartesian2: vi.fn().mockImplementation(function (this: any, x: number, y: number) {
      this.x = x; this.y = y;
    }),
    NearFarScalar: vi.fn().mockImplementation(function (this: any, near: number, nearV: number, far: number, farV: number) {
      this.near = near; this.nearV = nearV; this.far = far; this.farV = farV;
    }),
    Color: {
      WHITE: { name: 'white' },
      BLACK: { name: 'black' },
      fromCssColorString: vi.fn((s: string) => ({ css: s })),
    },
    HeightReference: { CLAMP_TO_TERRAIN: 1 },
    LabelStyle: { FILL_AND_OUTLINE: 2 },
    HorizontalOrigin: { CENTER: 0 },
    VerticalOrigin: { BOTTOM: 1 },
  };
});

import { labels, searchLabels } from './labels';

// ── helpers ──────────────────────────────────────────────────────────────────

// Build a minimal viewer mock. viewer.scene.primitives.add returns whatever is
// passed to it (the LabelCollection instance), which labels.ts stores and uses.
function makeViewer() {
  const viewer = {
    scene: {
      primitives: {
        add: vi.fn().mockImplementation((p: any) => p),
      },
    },
  };
  return viewer as any;
}

// Wait until labels.init()'s async fetch chain has resolved — the LabelCollection
// is added to scene.primitives synchronously at the start of the .then() callback,
// and all labelData entries are pushed synchronously inside the same callback.
// So once primitives.add has been called once, all labelData is populated.
async function waitForInit(viewer: ReturnType<typeof makeViewer>) {
  await vi.waitFor(() => {
    expect(viewer.scene.primitives.add).toHaveBeenCalledTimes(1);
  });
}

// Three distinct features: different names and feature types.
const fakeNomenclature = {
  type: 'FeatureCollection',
  features: [
    {
      geometry: { type: 'Point', coordinates: [134.0, 4.6] },
      properties: { name: 'Gale', diameter_km: 154, feature_type: 'Crater', origin: 'Leale', quad_name: '', code: '', link: '' },
    },
    {
      geometry: { type: 'Point', coordinates: [226.2, 18.4] },
      properties: { name: 'Olympus Mons', diameter_km: 600, feature_type: 'Mons', origin: '', quad_name: '', code: '', link: '' },
    },
    {
      geometry: { type: 'Point', coordinates: [317.5, -42.4] },
      properties: { name: 'Hellas Planitia', diameter_km: 2300, feature_type: 'Planitia', origin: '', quad_name: '', code: '', link: '' },
    },
  ],
};

// Twelve "Mons" features, used to verify the .slice(0, 10) cap.
const twelveMontes = Array.from({ length: 12 }, (_, i) => ({
  geometry: { type: 'Point', coordinates: [i * 10, 0] },
  properties: { name: `Mons ${i + 1}`, diameter_km: 100, feature_type: 'Mons', origin: '', quad_name: '', code: '', link: '' },
}));

// ── fixtures ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    json: () => Promise.resolve(structuredClone(fakeNomenclature)),
  }));
  // labels.init() calls document.fonts.load() to wait for Geist Mono.
  // In node there is no document; stub the global with a minimal implementation.
  vi.stubGlobal('document', {
    fonts: { load: vi.fn().mockResolvedValue([]) },
  });
});

afterEach(() => {
  labels.destroy();
  vi.unstubAllGlobals();
});

// ── searchLabels — pre-init ───────────────────────────────────────────────────

describe('searchLabels (before init)', () => {
  it('returns [] for empty string', () => {
    // No data, and empty query short-circuits before touching data anyway
    expect(searchLabels('')).toEqual([]);
  });

  it('returns [] for whitespace-only string', () => {
    expect(searchLabels('  ')).toEqual([]);
  });

  it('returns [] for any query when no data is loaded', () => {
    // labelData starts empty — searching before init always returns nothing
    expect(searchLabels('gale')).toEqual([]);
    expect(searchLabels('*')).toEqual([]);
  });
});

// ── searchLabels — after init ─────────────────────────────────────────────────

describe('searchLabels (after init)', () => {
  let viewer: ReturnType<typeof makeViewer>;

  beforeEach(async () => {
    viewer = makeViewer();
    labels.init(viewer);
    await waitForInit(viewer);
  });

  it('case-insensitive: "gale" matches "Gale"', () => {
    const results = searchLabels('gale');
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('Gale');
  });

  it('case-insensitive: "OLYMPUS" matches "Olympus Mons"', () => {
    const results = searchLabels('OLYMPUS');
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('Olympus Mons');
  });

  it('partial match: "mons" matches "Olympus Mons"', () => {
    const results = searchLabels('mons');
    const names = results.map((r) => r.name);
    expect(names).toContain('Olympus Mons');
    expect(names).not.toContain('Gale');
    expect(names).not.toContain('Hellas Planitia');
  });

  it('returns [] when nothing matches', () => {
    expect(searchLabels('voyager')).toEqual([]);
  });

  it('wildcard "*" returns all loaded features', () => {
    const results = searchLabels('*');
    expect(results).toHaveLength(3);
    const names = results.map((r) => r.name);
    expect(names).toContain('Gale');
    expect(names).toContain('Olympus Mons');
    expect(names).toContain('Hellas Planitia');
  });

  describe('result shape', () => {
    it('kind is "location"', () => {
      const [r] = searchLabels('gale');
      expect(r.kind).toBe('location');
    });

    it('lon and lat come from the GeoJSON coordinates', () => {
      const [r] = searchLabels('gale');
      expect(r.lon).toBe(134.0);
      expect(r.lat).toBe(4.6);
    });

    it('diameterKm comes from properties.diameter_km', () => {
      const [r] = searchLabels('gale');
      expect(r.diameterKm).toBe(154);
    });

    it('featureType comes from properties.feature_type', () => {
      const [r] = searchLabels('gale');
      expect(r.featureType).toBe('Crater');
    });

    it('origin comes from properties.origin', () => {
      const [r] = searchLabels('gale');
      expect(r.origin).toBe('Leale');
    });
  });

  describe('10-result cap', () => {
    beforeEach(async () => {
      // Reload with 12 identically-named "Mons N" features.
      labels.destroy();
      vi.clearAllMocks();
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        json: () => Promise.resolve({ type: 'FeatureCollection', features: structuredClone(twelveMontes) }),
      }));
      viewer = makeViewer();
      labels.init(viewer);
      await waitForInit(viewer);
    });

    it('wildcard "*" is capped at 10', () => {
      expect(searchLabels('*')).toHaveLength(10);
    });

    it('"mons" query across 12 matching features is capped at 10', () => {
      expect(searchLabels('mons')).toHaveLength(10);
    });
  });
});
