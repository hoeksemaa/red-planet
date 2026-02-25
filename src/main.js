import * as Cesium from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';

const buffer = await fetch('/data/processed/MOLA/mola_16ppd.f32').then(r => r.arrayBuffer());
const heights = new Float32Array(buffer);
const HM_W = 1440, HM_H = 720;

function sampleMOLA(lon, lat) {
    const u = ((lon + 360) % 360) / 360;  // MOLA is 0–360°E; this handles the -180..+180 wrap
    const v = (90 - lat) / 180;           // row 0 = 90°N (north up)
    const col = Math.min(Math.floor(u * HM_W), HM_W - 1);
    const row = Math.min(Math.floor(v * HM_H), HM_H - 1);
    return heights[row * HM_W + col];
}

const tilingScheme = new Cesium.GeographicTilingScheme();

const terrainProvider = new Cesium.CustomHeightmapTerrainProvider({
    tilingScheme,
    width: 32,
    height: 32,
    callback(x, y, level) {
        const rect = tilingScheme.tileXYToRectangle(x, y, level);
        const result = new Float32Array(32 * 32);
        for (let row = 0; row < 32; row++) {
            for (let col = 0; col < 32; col++) {
                const lon = Cesium.Math.toDegrees(rect.west + (col / 31) * (rect.east - rect.west));
                const lat = Cesium.Math.toDegrees(rect.north - (row / 31) * (rect.north - rect.south));
                result[row * 32 + col] = sampleMOLA(lon, lat);
            }
        }
        return result;
    }
});

const viewer = new Cesium.Viewer('cesiumContainer', {
    terrainProvider,
    baseLayer: false,          // no default Bing imagery
    baseLayerPicker: false,
    geocoder: false,
    homeButton: false,
    sceneModePicker: false,
    navigationHelpButton: false,
    animation: false,
    timeline: false,
    creditContainer: document.createElement('div'),  // hides the Cesium credit
});

viewer.scene.globe.baseColor = new Cesium.Color(0.55, 0.27, 0.07, 1.0);  // rusty orange
viewer.scene.verticalExaggeration = 100.0;
viewer.scene.skyAtmosphere.show = false;
viewer.scene.fog.enabled = false;
viewer.scene.globe.showGroundAtmosphere = false;  // blue haze at the horizon on the surface itself (separate from skyAtmosphere)
viewer.scene.moon.show = false;                   // Earth's moon
viewer.scene.sun.show = false;                    // sun position is Earth-date-based; kills the day/night terminator

// disable tilt (right-click drag that pitches the camera up/down)
viewer.scene.screenSpaceCameraController.enableTilt = false;
// disable free-look (the "look around" mode, ctrl+drag)
viewer.scene.screenSpaceCameraController.enableLook = false;
// disable translate (middle-click pan that slides the camera laterally)
viewer.scene.screenSpaceCameraController.enableTranslate = false;

viewer.camera.setView({
    destination: Cesium.Cartesian3.fromDegrees(133, -10, 6_000_000),
});