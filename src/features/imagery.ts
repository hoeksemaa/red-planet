import * as Cesium from 'cesium';
import type { Feature, FeatureData } from './types';
import { IMAGERY_BASE_URL } from '../constants';

export const imagery: Feature = {
  async init(viewer: Cesium.Viewer, _data: FeatureData) {
    const provider = await Cesium.TileMapServiceImageryProvider.fromUrl(IMAGERY_BASE_URL);
    viewer.imageryLayers.addImageryProvider(provider);
  },

  apply() {},

  destroy() {},
};
