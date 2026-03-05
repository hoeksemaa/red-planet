import type * as Cesium from 'cesium';
import type { Feature } from './types';
import type { AppState } from '../state';

type Phase = 'critical' | 'deferred';

interface Entry {
  feature: Feature;
  phase: Phase;
}

export class LayerRegistry {
  private features = new Map<string, Entry>();

  register(id: string, feature: Feature, opts?: { phase?: Phase }): void {
    this.features.set(id, { feature, phase: opts?.phase ?? 'deferred' });
  }

  async prefetchDeferred(): Promise<void> {
    await Promise.all(
      [...this.features.values()]
        .filter(e => e.phase === 'deferred' && e.feature.prefetch)
        .map(e => e.feature.prefetch!())
    );
  }

  async initCritical(viewer: Cesium.Viewer): Promise<void> {
    await Promise.all(
      [...this.features.values()]
        .filter(e => e.phase === 'critical')
        .map(e => e.feature.init(viewer))
    );
  }

  async initDeferred(viewer: Cesium.Viewer): Promise<void> {
    await Promise.all(
      [...this.features.values()]
        .filter(e => e.phase === 'deferred')
        .map(e => e.feature.init(viewer))
    );
  }

  applyAll(state: AppState): void {
    for (const { feature } of this.features.values()) {
      feature.apply(state);
    }
  }

  get(id: string): Feature | undefined {
    return this.features.get(id)?.feature;
  }

  entries(): IterableIterator<[string, Feature]> {
    const unwrapped = new Map(
      [...this.features.entries()].map(([id, e]) => [id, e.feature])
    );
    return unwrapped.entries();
  }
}
