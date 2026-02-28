import * as Cesium from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import type { AppState } from './state';
import type { Feature } from './features/types';
import { createTerrainProvider } from './terrain';
import { LayerRegistry } from './features/registry';
import { INITIAL_CAMERA_HEIGHT } from './constants';

let viewer: Cesium.Viewer;
const registry = new LayerRegistry();

let pickCallback: ((featureId: string, result: unknown) => void) | null = null;
let pickMissCallback: (() => void) | null = null;

export function register(id: string, feature: Feature): void {
  registry.register(id, feature);
}

export async function init(heights: Float32Array, initialState: AppState): Promise<void> {
  const terrainProvider = createTerrainProvider(heights);

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
    fullscreenButton: false,
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
  ssc.minimumZoomDistance = 25_000;       // ~25 km — rover traverse scale
  ssc.maximumZoomDistance = 680_000_000;  // ~8× Hope apoapsis on WGS84 globe
  ssc.enableTilt = false;
  ssc.enableLook = false;
  ssc.enableTranslate = false;

  // Initial camera position
  viewer.camera.setView({
    destination: Cesium.Cartesian3.fromDegrees(133, -10, INITIAL_CAMERA_HEIGHT),
  });

  await registry.initAll(viewer);

  // Single pick dispatcher — iterates features, first to claim wins
  const clickHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
  clickHandler.setInputAction((movement: { position: Cesium.Cartesian2 }) => {
    const picked = viewer.scene.pick(movement.position);
    for (const [id, feature] of registry.entries()) {
      if (feature.pick) {
        const result = feature.pick(picked);
        if (result !== undefined) {
          pickCallback?.(id, result);
          return;
        }
      }
    }
    pickMissCallback?.();
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

  // Hover highlight — delegates to each feature's hover()
  const hoverHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
  hoverHandler.setInputAction((movement: { endPosition: Cesium.Cartesian2 }) => {
    const picked = viewer.scene.pick(movement.endPosition);
    let claimed = false;
    for (const [, feature] of registry.entries()) {
      if (feature.hover?.(picked)) claimed = true;
    }
    viewer.scene.canvas.style.cursor = claimed ? 'pointer' : '';
  }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

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

export function onPick(fn: (featureId: string, result: unknown) => void): void {
  pickCallback = fn;
}

export function onPickMiss(fn: () => void): void {
  pickMissCallback = fn;
}
