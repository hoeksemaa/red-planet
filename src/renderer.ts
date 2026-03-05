import * as Cesium from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import type { AppState } from './state';
import type { Feature } from './features/types';
import { createTerrainProvider } from './terrain';
import { LayerRegistry } from './features/registry';
import { INITIAL_CAMERA_HEIGHT } from './constants';
import { mark, report } from './perf';

let viewer: Cesium.Viewer;
let lastState: AppState;
const registry = new LayerRegistry();

let pickCallback: ((featureId: string, result: unknown) => void) | null = null;
let pickMissCallback: (() => void) | null = null;

export function register(id: string, feature: Feature, opts?: { phase?: 'critical' | 'deferred' }): void {
  registry.register(id, feature, opts);
}

// perf: called after terrain .f32 downloads in the background (PERF-4)
export function setTerrain(heights: Float32Array): void {
  viewer.terrainProvider = createTerrainProvider(heights);
}

export async function init(initialState: AppState): Promise<void> {
  // perf: kick off deferred prefetches immediately — runs in parallel with viewer creation
  registry.prefetchDeferred();

  // perf: start with flat ellipsoid so the globe appears immediately;
  // real MOLA terrain swaps in via setTerrain() once the .f32 finishes downloading (PERF-4)
  mark('viewer-init-start');
  viewer = new Cesium.Viewer('cesiumContainer', {
    terrainProvider: new Cesium.EllipsoidTerrainProvider(),
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
  mark('viewer-created');

  // One-shot: set __firstTileLoad the first frame after tiles finish loading.
  // Polls globe.tilesLoaded via postRender — more reliable than tileLoadProgressEvent
  // in headless/SwiftShader where the progress event may never reach 0.
  // tilesEverBusy guards against firing before any tiles are actually requested.
  let tilesEverBusy = false;
  const removePostRenderListener = viewer.scene.postRender.addEventListener(() => {
    if (!viewer.scene.globe.tilesLoaded) {
      tilesEverBusy = true;
    } else if (tilesEverBusy) {
      (window as any).__firstTileLoad = performance.now();
      mark('first-tile-load');
      report();
      removePostRenderListener();
    }
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

  await registry.initCritical(viewer);
  mark('critical-init-done');
  (window as any).__criticalReady = performance.now();

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

  // perf: deferred features init in background after critical path completes
  registry.initDeferred(viewer)
    .then(() => apply(lastState))
    .catch(e => console.error('[renderer] Deferred init failed:', e));
}

export function apply(state: AppState): void {
  lastState = state;
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

