import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LayerRegistry } from './registry';
import type { Feature } from './types';
import type { AppState } from '../state';
import type * as Cesium from 'cesium';

// LayerRegistry is the spine of the layer system — it coordinates init and
// state application for every feature. Bugs here break the entire globe.

// Minimal mock viewer — registry only passes it through to feature.init()
const mockViewer = {} as Cesium.Viewer;

// Factory for a mock Feature — all methods are spies so we can assert calls
function makeMockFeature(overrides: Partial<Feature> = {}): Feature {
  return {
    init: vi.fn().mockResolvedValue(undefined),
    apply: vi.fn(),
    destroy: vi.fn(),
    ...overrides,
  };
}

const fakeState: AppState = {
  exaggeration: 1,
  imagery: 'terraformed',
  layers: {
    contours: false,
    graticule: false,
    labels: true,
    rovers: true,
    satellites: false,
  },
};

describe('LayerRegistry', () => {
  let registry: LayerRegistry;

  beforeEach(() => {
    registry = new LayerRegistry();
  });

  describe('register / get', () => {
    it('returns a feature that was registered', () => {
      const feature = makeMockFeature();
      registry.register('contours', feature);
      expect(registry.get('contours')).toBe(feature);
    });

    it('returns undefined for an unknown id', () => {
      expect(registry.get('does-not-exist')).toBeUndefined();
    });

    it('overwrites a feature registered under the same id', () => {
      const first  = makeMockFeature();
      const second = makeMockFeature();
      registry.register('contours', first);
      registry.register('contours', second);
      expect(registry.get('contours')).toBe(second);
    });

    it('keeps multiple features independent', () => {
      const a = makeMockFeature();
      const b = makeMockFeature();
      registry.register('a', a);
      registry.register('b', b);
      expect(registry.get('a')).toBe(a);
      expect(registry.get('b')).toBe(b);
    });
  });

  describe('applyAll', () => {
    it('calls apply(state) on every registered feature', () => {
      const contours = makeMockFeature();
      const labels   = makeMockFeature();
      registry.register('contours', contours);
      registry.register('labels', labels);

      registry.applyAll(fakeState);

      expect(contours.apply).toHaveBeenCalledOnce();
      expect(contours.apply).toHaveBeenCalledWith(fakeState);
      expect(labels.apply).toHaveBeenCalledOnce();
      expect(labels.apply).toHaveBeenCalledWith(fakeState);
    });

    it('does nothing when no features are registered', () => {
      // Should not throw
      expect(() => registry.applyAll(fakeState)).not.toThrow();
    });

    it('passes the exact state object — no copying or mutation', () => {
      const feature = makeMockFeature();
      registry.register('x', feature);
      registry.applyAll(fakeState);
      // Same reference, not a clone
      expect((feature.apply as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe(fakeState);
    });
  });

  describe('initAll', () => {
    it('calls init(viewer) on every registered feature', async () => {
      const contours = makeMockFeature();
      const labels   = makeMockFeature();
      registry.register('contours', contours);
      registry.register('labels', labels);

      await registry.initAll(mockViewer);

      expect(contours.init).toHaveBeenCalledOnce();
      expect(contours.init).toHaveBeenCalledWith(mockViewer);
      expect(labels.init).toHaveBeenCalledOnce();
    });

    it('waits for all async inits to complete', async () => {
      const order: string[] = [];
      const slow: Feature = {
        init: vi.fn(() => new Promise<void>(res => setTimeout(() => { order.push('slow'); res(); }, 10))),
        apply: vi.fn(),
        destroy: vi.fn(),
      };
      const fast: Feature = {
        init: vi.fn(() => { order.push('fast'); return Promise.resolve(); }),
        apply: vi.fn(),
        destroy: vi.fn(),
      };
      registry.register('slow', slow);
      registry.register('fast', fast);

      await registry.initAll(mockViewer);

      // Both should have completed by the time the promise resolves
      expect(order).toContain('slow');
      expect(order).toContain('fast');
    });

    it('handles synchronous init() (no return value)', async () => {
      const syncFeature: Feature = {
        init: vi.fn(), // returns undefined — registry wraps in Promise.resolve()
        apply: vi.fn(),
        destroy: vi.fn(),
      };
      registry.register('sync', syncFeature);
      // Should not throw
      await expect(registry.initAll(mockViewer)).resolves.toBeUndefined();
    });
  });

  describe('entries', () => {
    it('returns all registered id/feature pairs', () => {
      const a = makeMockFeature();
      const b = makeMockFeature();
      registry.register('a', a);
      registry.register('b', b);

      const entries = [...registry.entries()];
      expect(entries).toHaveLength(2);
      expect(entries).toContainEqual(['a', a]);
      expect(entries).toContainEqual(['b', b]);
    });

    it('returns empty iterator when nothing is registered', () => {
      expect([...registry.entries()]).toHaveLength(0);
    });
  });
});
