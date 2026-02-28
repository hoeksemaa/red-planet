import * as Cesium from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import type { AppState } from './state';
import type { FeatureData } from './features/types';
import { createTerrainProvider } from './features/terrain';
import { imagery } from './features/imagery';
import { contours } from './features/contours';
import { labels } from './features/labels';
import { rovers } from './features/rovers';
import { satellites } from './features/satellites';
import { LayerRegistry } from './features/registry';
import { INITIAL_CAMERA_HEIGHT } from './constants';

let viewer: Cesium.Viewer;
const registry = new LayerRegistry();

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
    infoBox: false,
    selectionIndicator: false,
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
  viewer.scene.globe.baseColor = new Cesium.Color(0.55, 0.27, 0.13, 1.0); // Mars brown for polar tile gaps

  // Camera constraints
  const ssc = viewer.scene.screenSpaceCameraController;
  ssc.enableTilt = false;
  ssc.enableLook = false;
  ssc.enableTranslate = false;

  // Initial camera position
  viewer.camera.setView({
    destination: Cesium.Cartesian3.fromDegrees(133, -10, INITIAL_CAMERA_HEIGHT),
  });

  registry.register('imagery', imagery);
  registry.register('contours', contours);
  registry.register('labels', labels);
  registry.register('rovers', rovers);
  registry.register('satellites', satellites);
  await registry.initAll(viewer, data);

  apply(initialState);
}

export function apply(state: AppState): void {
  viewer.scene.verticalExaggeration = state.exaggeration;
  registry.applyAll(state);
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
