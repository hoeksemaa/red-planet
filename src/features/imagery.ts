import * as Cesium from 'cesium';
import type { Feature, FeatureData } from './types';
import type { AppState } from '../state';
import { IMAGERY_BASE_URL, OPM_IMAGERY_URL } from '../constants';

let terraformedLayer: Cesium.ImageryLayer | null = null;
let realLayer: Cesium.ImageryLayer | null = null;

export const imagery: Feature = {
  async init(viewer: Cesium.Viewer, _data: FeatureData) {
    const terraformedProvider = await Cesium.TileMapServiceImageryProvider.fromUrl(
      IMAGERY_BASE_URL,
      {
        fileExtension: 'png',
        tilingScheme: new Cesium.GeographicTilingScheme(),
        maximumLevel: 8,
      }
    );
    terraformedLayer = viewer.imageryLayers.addImageryProvider(terraformedProvider);

    const realProvider = new Cesium.UrlTemplateImageryProvider({
      url: OPM_IMAGERY_URL,
      maximumLevel: 6,
    });
    realLayer = viewer.imageryLayers.addImageryProvider(realProvider);
    realLayer.show = false;
  },

  apply(state: AppState) {
    if (!terraformedLayer || !realLayer) return;
    terraformedLayer.show = state.imagery === 'terraformed';
    realLayer.show = state.imagery === 'real';
  },

  destroy() {
    terraformedLayer = null;
    realLayer = null;
  },
};
