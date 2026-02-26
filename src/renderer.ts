import * as Cesium from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import type { AppState, Feature, FeatureData } from './state';
import { createTerrainProvider, imagery, contours, labels } from './features';

let viewer: Cesium.Viewer;

const features: Feature[] = [imagery, contours, labels];

export async function init(data: FeatureData, initialState: AppState): Promise<void> {
  const terrainProvider = createTerrainProvider(data.heights);

  viewer = new Cesium.Viewer('cesiumContainer', {
    terrainProvider,
    baseLayer: false,
    baseLayerPicker: false,
    geocoder: false,
    homeButton: false,
    sceneModePicker: false,
    navigationHelpButton: false,
    animation: false,
    timeline: false,
    creditContainer: document.createElement('div'),
  });

  // Mars scene config
  viewer.scene.globe.show = true;
  viewer.scene.globe.enableLighting = false;
  viewer.scene.verticalExaggeration = initialState.exaggeration;
  viewer.scene.skyAtmosphere!.show = false;
  viewer.scene.fog.enabled = false;
  viewer.scene.globe.showGroundAtmosphere = false;
  viewer.scene.moon!.show = false;
  viewer.scene.sun!.show = false;
  viewer.scene.globe.depthTestAgainstTerrain = false;

  // Camera constraints
  const ssc = viewer.scene.screenSpaceCameraController;
  ssc.enableTilt = false;
  ssc.enableLook = false;
  ssc.enableTranslate = false;

  // Initial camera position
  viewer.camera.setView({
    destination: Cesium.Cartesian3.fromDegrees(133, -10, 6_000_000),
  });

  // Init all features (some async)
  await Promise.all(features.map((f) => f.init(viewer, data)));

  // Apply initial state
  apply(initialState);
}

export function apply(state: AppState): void {
  viewer.scene.verticalExaggeration = state.exaggeration;
  for (const f of features) {
    f.apply(state);
  }
}

export function getViewer(): Cesium.Viewer {
  return viewer;
}

export function flyTo(lon: number, lat: number, altitude: number): void {
  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(lon, lat, altitude),
    duration: 1.5,
  });
}

export function destroy(): void {
  for (const f of features) {
    f.destroy();
  }
  viewer.destroy();
}
