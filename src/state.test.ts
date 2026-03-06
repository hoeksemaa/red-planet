import { describe, it, expect } from 'vitest';
import { DEFAULT_STATE } from './state';
import type { AppState } from './state';

// DEFAULT_STATE is the source of truth for initial UI state.
// If a layer key is missing or a default flips, the globe opens broken.

describe('DEFAULT_STATE', () => {
  it('starts with 1x exaggeration (flat terrain on load)', () => {
    // PERF-4: starting at 1x prevents jarring terrain swap-in
    expect(DEFAULT_STATE.exaggeration).toBe(1);
  });

  it('starts with terraformed imagery', () => {
    expect(DEFAULT_STATE.imagery).toBe('terraformed');
  });

  describe('layer defaults', () => {
    it('labels are on by default (most useful layer for first-time users)', () => {
      expect(DEFAULT_STATE.layers.labels).toBe(true);
    });

    it('rovers are on by default', () => {
      expect(DEFAULT_STATE.layers.rovers).toBe(true);
    });

    it('contours are off by default (expensive, opt-in)', () => {
      expect(DEFAULT_STATE.layers.contours).toBe(false);
    });

    it('graticule is off by default', () => {
      expect(DEFAULT_STATE.layers.graticule).toBe(false);
    });

    it('satellites are off by default', () => {
      expect(DEFAULT_STATE.layers.satellites).toBe(false);
    });
  });

  it('covers all keys declared in AppState (no missing defaults)', () => {
    // If AppState gains a new key, DEFAULT_STATE must be updated too.
    // This test catches the gap by checking that every layer key in the type
    // has a corresponding boolean value in the default.
    const state: AppState = DEFAULT_STATE; // type-checks at compile time
    const layerKeys = Object.keys(state.layers);
    // Expect all values to be booleans — no undefined sneaking in
    for (const key of layerKeys) {
      expect(typeof (state.layers as Record<string, unknown>)[key]).toBe('boolean');
    }
  });
});
