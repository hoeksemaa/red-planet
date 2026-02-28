import type * as Cesium from 'cesium';
import type { Feature } from './types';
import type { AppState } from '../state';

export class LayerRegistry {
  private features = new Map<string, Feature>();

  register(id: string, feature: Feature): void {
    this.features.set(id, feature);
  }

  async prefetchAll(): Promise<void> {
    await Promise.all([...this.features.values()].filter((f) => f.prefetch).map((f) => f.prefetch!()));
  }

  async initAll(viewer: Cesium.Viewer): Promise<void> {
    await Promise.all([...this.features.values()].map((f) => f.init(viewer)));
  }

  applyAll(state: AppState): void {
    for (const f of this.features.values()) {
      f.apply(state);
    }
  }

  get(id: string): Feature | undefined {
    return this.features.get(id);
  }

  entries(): IterableIterator<[string, Feature]> {
    return this.features.entries();
  }
}
