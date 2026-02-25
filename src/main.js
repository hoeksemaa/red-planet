import * as Cesium from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';

const buffer = await fetch('/data/processed/MOLA/mola_16ppd.f32').then(r => r.arrayBuffer());
const heights = new Float32Array(buffer);
const HM_W = 1440, HM_H = 720;

function elevationToColor(elev) {
    const raw = Math.max(0, Math.min(1, (elev + 8000) / 29000));
    const t = Math.pow(raw, 0.6);              // stretch low end: more hue spread in canyons/basins
    const hue = 0.72 * (1 - t);               // violet (0.72) at depth → red (0) at peaks
    const lightness = 0.4 + 0.3 * t;          // dark at depth, bright at peaks
    return Cesium.Color.fromHsl(hue, 1.0, lightness);
}

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

viewer.scene.globe.show = true;
viewer.scene.globe.enableLighting = false;  // prevent Earth-date sun from darkening half the globe

const imageryProvider = await Cesium.TileMapServiceImageryProvider.fromUrl('/data/raw/terraformed/');
viewer.imageryLayers.addImageryProvider(imageryProvider);
viewer.scene.verticalExaggeration = 100;
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

viewer.scene.globe.depthTestAgainstTerrain = false;

viewer.camera.setView({
    destination: Cesium.Cartesian3.fromDegrees(133, -10, 6_000_000),
});

const geojson = await fetch('/data/processed/MOLA/contours.geojson').then(r => r.json());

const glsl = `
czm_material czm_getMaterial(czm_materialInput materialInput) {
    czm_material m = czm_getDefaultMaterial(materialInput);
    vec4 posEC = czm_windowToEyeCoordinates(gl_FragCoord);
    vec3 fragmentEC = posEC.xyz / posEC.w;
    vec3 globeCenterEC = (czm_view * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
    vec3 surfaceNormal = normalize(fragmentEC - globeCenterEC);
    vec3 toCamera = normalize(-fragmentEC);
    float facing = dot(surfaceNormal, toCamera);
    float alpha = smoothstep(0.0, 0.3, facing);
    m.diffuse = lineColor.rgb;
    m.emission = lineColor.rgb;
    m.alpha = lineColor.a * alpha;
    return m;
}
`;

const contours = viewer.scene.primitives.add(new Cesium.PrimitiveCollection());

function buildContours(exag) {
    contours.removeAll();
    for (const feature of geojson.features) {
        const elev = feature.properties.elevation;
        const color = elevationToColor(elev);

        const instances = [];
        for (const coordArray of feature.geometry.coordinates) {
            const positions = coordArray.map(([lon, lat]) =>
                Cesium.Cartesian3.fromDegrees(lon, lat, elev * exag)
            );
            if (positions.length < 2) continue;
            instances.push(new Cesium.GeometryInstance({
                geometry: new Cesium.PolylineGeometry({ positions, width: 2.0 }),
            }));
        }

        if (instances.length === 0) continue;

        contours.add(new Cesium.Primitive({
            geometryInstances: instances,
            appearance: new Cesium.PolylineMaterialAppearance({
                translucent: true,
                material: new Cesium.Material({
                    translucent: true,
                    fabric: { uniforms: { lineColor: color }, source: glsl },
                }),
            }),
            asynchronous: false,
        }));
    }
}

buildContours(100);

let exaggerated = true;
const btn = document.getElementById('exagToggle');
btn.addEventListener('click', () => {
    exaggerated = !exaggerated;
    const exag = exaggerated ? 100 : 1;
    viewer.scene.verticalExaggeration = exag;
    buildContours(exag);
    btn.textContent = exaggerated ? 'True shape' : 'Exaggerated';
});