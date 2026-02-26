import * as Cesium from 'cesium';
import type { Feature, FeatureData } from './types';
import type { AppState } from '../state';
import { IMAGERY_BASE_URL, VIKING_IMAGERY_URL } from '../constants';

let terraformedLayer: Cesium.ImageryLayer | null = null;
let realLayer: Cesium.ImageryLayer | null = null;

export const imagery: Feature = {
  async init(viewer: Cesium.Viewer, _data: FeatureData) {
    const terraformedProvider = new Cesium.UrlTemplateImageryProvider({
      url: IMAGERY_BASE_URL + '{z1}/{x}/{reverseY}.png',
      tilingScheme: new Cesium.GeographicTilingScheme(),
      minimumLevel: 0,
      maximumLevel: 8,
      customTags: {
        z1: (_ip, _x, _y, level) => String(level + 1),
      },
    });
    terraformedLayer = viewer.imageryLayers.addImageryProvider(terraformedProvider);

    const realProvider = new Cesium.UrlTemplateImageryProvider({
      url: VIKING_IMAGERY_URL,
      tilingScheme: new Cesium.GeographicTilingScheme({
        numberOfLevelZeroTilesX: 1,
        numberOfLevelZeroTilesY: 1,
      }),
      maximumLevel: 5,
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
