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

// --- Nomenclature labels ---

const nomenclature = await fetch('/data/processed/nomenclature/features.geojson').then(r => r.json());

const labelCollection = viewer.scene.primitives.add(new Cesium.LabelCollection());

// labelData holds metadata alongside each Cesium label for visibility + search
const labelData = [];

for (const feature of nomenclature.features) {
    const [lon, lat] = feature.geometry.coordinates;
    const { name, diameter_km } = feature.properties;

    const label = labelCollection.add({
        position: Cesium.Cartesian3.fromDegrees(lon, lat),
        text: name,
        show: false,
        font: '13px sans-serif',
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        pixelOffset: new Cesium.Cartesian2(0, -8),
        horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
    });

    labelData.push({ label, lon, lat, name, diameterKm: diameter_km });
}

// Show labels based on camera altitude above the Mars ellipsoid.
// Observed range: ~100k m (zoomed in) to ~100M m (zoomed way out).
function updateLabels() {
    const alt = viewer.camera.positionCartographic.height;
    for (const { label, diameterKm } of labelData) {
        if (alt > 10_000_000) {
            label.show = diameterKm >= 500;   // planetary: ~15 major features
        } else if (alt > 2_000_000) {
            label.show = diameterKm >= 100;   // regional: ~65 features
        } else {
            label.show = true;                // local: all 2046
        }
    }
}

// postRender fires every frame; throttle to ~2x/sec to avoid iterating 2k labels constantly
let lastLabelUpdate = 0;
viewer.scene.postRender.addEventListener(() => {
    const now = Date.now();
    if (now - lastLabelUpdate < 500) return;
    lastLabelUpdate = now;
    updateLabels();
});

// --- Search bar ---

const searchInput = document.getElementById('searchInput');
const searchResults = document.getElementById('searchResults');

searchInput.addEventListener('input', () => {
    const q = searchInput.value.trim().toLowerCase();
    searchResults.innerHTML = '';
    if (!q) return;

    const matches = labelData.filter(d => d.name.toLowerCase().includes(q)).slice(0, 10);
    for (const match of matches) {
        const item = document.createElement('div');
        item.className = 'search-item';
        item.textContent = match.name;
        item.addEventListener('click', () => {
            const flyAlt = match.diameterKm >= 500 ? 1_500_000
                         : match.diameterKm >= 100 ? 500_000
                         : match.diameterKm >= 10  ? 200_000
                         : 100_000;
            viewer.camera.flyTo({
                destination: Cesium.Cartesian3.fromDegrees(match.lon, match.lat, flyAlt),
                duration: 1.5,
            });
            searchInput.value = match.name;
            searchResults.innerHTML = '';
        });
        searchResults.appendChild(item);
    }
});

// Dismiss results when clicking outside the search widget
document.addEventListener('click', e => {
    if (!document.getElementById('searchWrap').contains(e.target)) {
        searchResults.innerHTML = '';
    }
});

let exaggerated = true;
const btn = document.getElementById('exagToggle');
btn.addEventListener('click', () => {
    exaggerated = !exaggerated;
    const exag = exaggerated ? 100 : 1;
    viewer.scene.verticalExaggeration = exag;
    buildContours(exag);
    btn.textContent = exaggerated ? 'True shape' : 'Exaggerated';
});