import type * as Cesium from 'cesium';
import type { Feature } from './types';
import type { AppState } from '../state';
import { mark } from '../perf';

export class LayerRegistry {
  private features = new Map<string, Feature>();

  register(id: string, feature: Feature): void {
    this.features.set(id, feature);
  }

  async initAll(viewer: Cesium.Viewer): Promise<void> {
    await Promise.all(
      [...this.features.entries()].map(([id, feature]) => {
        mark(`${id}-init-start`);
        return Promise.resolve(feature.init(viewer)).then(() => mark(`${id}-init-done`));
      })
    );
  }

  applyAll(state: AppState): void {
    for (const feature of this.features.values()) {
      feature.apply(state);
    }
  }

  get(id: string): Feature | undefined {
    return this.features.get(id);
  }

  entries(): IterableIterator<[string, Feature]> {
    return this.features.entries();
  }
}
