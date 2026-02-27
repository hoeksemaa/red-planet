import * as Cesium from 'cesium';
import { HM_W, HM_H, TERRAIN_TILE_SIZE } from './constants';

function sampleMOLA(heights: Float32Array, lon: number, lat: number): number {
  const u = ((lon + 360) % 360) / 360;
  const v = (90 - lat) / 180;
  const col = Math.min(Math.floor(u * HM_W), HM_W - 1);
  const row = Math.min(Math.floor(v * HM_H), HM_H - 1);
  return heights[row * HM_W + col];
}

export function createTerrainProvider(
  heights: Float32Array
): Cesium.CustomHeightmapTerrainProvider {
  const tilingScheme = new Cesium.GeographicTilingScheme();
  return new Cesium.CustomHeightmapTerrainProvider({
    tilingScheme,
    width: TERRAIN_TILE_SIZE,
    height: TERRAIN_TILE_SIZE,
    callback(x: number, y: number, level: number) {
      const rect = tilingScheme.tileXYToRectangle(x, y, level);
      const result = new Float32Array(TERRAIN_TILE_SIZE * TERRAIN_TILE_SIZE);
      for (let row = 0; row < TERRAIN_TILE_SIZE; row++) {
        for (let col = 0; col < TERRAIN_TILE_SIZE; col++) {
          const lon = Cesium.Math.toDegrees(
            rect.west + (col / (TERRAIN_TILE_SIZE - 1)) * (rect.east - rect.west)
          );
          const lat = Cesium.Math.toDegrees(
            rect.north - (row / (TERRAIN_TILE_SIZE - 1)) * (rect.north - rect.south)
          );
          result[row * TERRAIN_TILE_SIZE + col] = sampleMOLA(heights, lon, lat);
        }
      }
      return result;
    },
  });
}
