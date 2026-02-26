import * as Cesium from 'cesium';
import type { Feature, AppState, ContourGeoJSON, LabelEntry } from './state';

// ════════════════════════════════════════════════════════════
// Terrain (factory — not a Feature, bc provider is pre-Viewer)
// ════════════════════════════════════════════════════════════

const HM_W = 1440;
const HM_H = 720;

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
    width: 32,
    height: 32,
    callback(x: number, y: number, level: number) {
      const rect = tilingScheme.tileXYToRectangle(x, y, level);
      const result = new Float32Array(32 * 32);
      for (let row = 0; row < 32; row++) {
        for (let col = 0; col < 32; col++) {
          const lon = Cesium.Math.toDegrees(
            rect.west + (col / 31) * (rect.east - rect.west)
          );
          const lat = Cesium.Math.toDegrees(
            rect.north - (row / 31) * (rect.north - rect.south)
          );
          result[row * 32 + col] = sampleMOLA(heights, lon, lat);
        }
      }
      return result;
    },
  });
}

// ════════════════════════════════════════════════════════════
// Imagery
// ════════════════════════════════════════════════════════════

let imageryLayer: Cesium.ImageryLayer | null = null;

export const imagery: Feature = {
  async init(viewer) {
    const provider = await Cesium.TileMapServiceImageryProvider.fromUrl(
      '/data/raw/terraformed/'
    );
    imageryLayer = viewer.imageryLayers.addImageryProvider(provider);
  },

  apply(_state: AppState) {
    // No-op rn. Future: toggle layer visibility via state.
  },

  destroy() {
    imageryLayer = null;
  },
};

// ════════════════════════════════════════════════════════════
// Contours
// ════════════════════════════════════════════════════════════

// GLSL limb-fade: contour lines fade out at the globe's edges
const CONTOUR_GLSL = `
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

function elevationToColor(elev: number): Cesium.Color {
  const raw = Math.max(0, Math.min(1, (elev + 8000) / 29000));
  const t = Math.pow(raw, 0.6);
  const hue = 0.72 * (1 - t);
  const lightness = 0.4 + 0.3 * t;
  return Cesium.Color.fromHsl(hue, 1.0, lightness);
}

let contourCollection: Cesium.PrimitiveCollection;
let contourGeoJSON: ContourGeoJSON;
let currentExag = -1; // sentinel — forces first build

function buildContours(exag: number): void {
  contourCollection.removeAll();

  for (const feature of contourGeoJSON.features) {
    const elev = feature.properties.elevation;
    const color = elevationToColor(elev);
    const instances: Cesium.GeometryInstance[] = [];

    for (const coordArray of feature.geometry.coordinates) {
      const positions = coordArray.map(([lon, lat]) =>
        Cesium.Cartesian3.fromDegrees(lon, lat, elev * exag)
      );
      if (positions.length < 2) continue;
      instances.push(
        new Cesium.GeometryInstance({
          geometry: new Cesium.PolylineGeometry({ positions, width: 2.0 }),
        })
      );
    }
    if (instances.length === 0) continue;

    contourCollection.add(
      new Cesium.Primitive({
        geometryInstances: instances,
        appearance: new Cesium.PolylineMaterialAppearance({
          translucent: true,
          material: new Cesium.Material({
            translucent: true,
            fabric: {
              uniforms: { lineColor: color },
              source: CONTOUR_GLSL,
            },
          }),
        }),
        asynchronous: false,
      })
    );
  }
}

export const contours: Feature = {
  init(viewer, data) {
    contourGeoJSON = data.contourGeoJSON;
    contourCollection = viewer.scene.primitives.add(new Cesium.PrimitiveCollection());
  },

  apply(state: AppState) {
    // Only rebuild when exaggeration actually changes
    if (state.exaggeration !== currentExag) {
      currentExag = state.exaggeration;
      buildContours(currentExag);
    }
  },

  destroy() {
    contourCollection.removeAll();
  },
};

// ════════════════════════════════════════════════════════════
// Labels
// ════════════════════════════════════════════════════════════

let labelCollection: Cesium.LabelCollection;
let labelData: LabelEntry[] = [];
let removeListener: (() => void) | null = null;
let removeClickHandler: (() => void) | null = null;
let onLabelClick: ((entry: LabelEntry) => void) | null = null;
let onLabelMiss: (() => void) | null = null;

export function setOnLabelClick(fn: (entry: LabelEntry) => void): void {
  onLabelClick = fn;
}
export function setOnLabelMiss(fn: () => void): void {
  onLabelMiss = fn;
}

function updateLabels(camera: Cesium.Camera): void {
  const alt = camera.positionCartographic.height;
  for (const { label, diameterKm } of labelData) {
    if (alt > 10_000_000) {
      label.show = diameterKm >= 500;
    } else if (alt > 2_000_000) {
      label.show = diameterKm >= 100;
    } else {
      label.show = true;
    }
  }
}

export const labels: Feature = {
  init(viewer, data) {
    labelCollection = viewer.scene.primitives.add(new Cesium.LabelCollection());
    labelData = [];

    for (const feature of data.nomenclatureGeoJSON.features) {
      const [lon, lat] = feature.geometry.coordinates;
      const { name, diameter_km, feature_type, origin } = feature.properties;

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

      labelData.push({ label, lon, lat, name, diameterKm: diameter_km,
                       featureType: feature_type, origin });
    }

    // Throttled postRender listener — ~2 checks/sec for 2k labels
    let lastUpdate = 0;
    const handler = () => {
      const now = Date.now();
      if (now - lastUpdate < 500) return;
      lastUpdate = now;
      updateLabels(viewer.camera);
    };
    viewer.scene.postRender.addEventListener(handler);
    removeListener = () => viewer.scene.postRender.removeEventListener(handler);

    // Click handler — pick label under cursor, fire callback
    const clickHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    clickHandler.setInputAction((movement: { position: Cesium.Cartesian2 }) => {
      const picked = viewer.scene.pick(movement.position);
      const matchedEntry = labelData.find((e) => e.label === picked?.primitive);
      if (matchedEntry) {
        onLabelClick?.(matchedEntry);
      } else {
        onLabelMiss?.();
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
    removeClickHandler = () => clickHandler.destroy();
  },

  apply(_state: AppState) {
    // Label visibility is camera-driven, not state-driven.
  },

  destroy() {
    removeListener?.();
    removeListener = null;
    removeClickHandler?.();
    removeClickHandler = null;
    labelData = [];
  },
};

// ─── Search support (exported for callback injection) ───

export interface SearchResult {
  name: string;
  lon: number;
  lat: number;
  diameterKm: number;
}

export function searchLabels(query: string): SearchResult[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return labelData
    .filter((d) => d.name.toLowerCase().includes(q))
    .slice(0, 10)
    .map(({ name, lon, lat, diameterKm }) => ({ name, lon, lat, diameterKm }));
}

export function flyToAltitude(diameterKm: number): number {
  if (diameterKm >= 500) return 1_500_000;
  if (diameterKm >= 100) return 500_000;
  if (diameterKm >= 10) return 200_000;
  return 100_000;
}
