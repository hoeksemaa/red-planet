import type * as Cesium from 'cesium';
import type { Feature, FeatureData } from './types';
import type { AppState } from '../state';

export class LayerRegistry {
  private features = new Map<string, Feature>();

  register(id: string, feature: Feature): void {
    this.features.set(id, feature);
  }

  async initAll(viewer: Cesium.Viewer, data: FeatureData): Promise<void> {
    await Promise.all([...this.features.values()].map((f) => f.init(viewer, data)));
  }

  applyAll(state: AppState): void {
    for (const f of this.features.values()) {
      f.apply(state);
    }
  }

  get(id: string): Feature | undefined {
    return this.features.get(id);
  }
}
