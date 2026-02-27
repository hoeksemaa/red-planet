import * as Cesium from 'cesium';
import type { Feature, FeatureData, ContourGeoJSON } from './types';
import type { AppState } from '../state';
import { DEFAULT_STATE } from '../state';

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
  const hue = 0.75 * Math.pow(1 - t, 1.5);
  const lightness = 0.4 + 0.15 * t;
  return Cesium.Color.fromHsl(hue, 1.0, lightness);
}

let contourCollection: Cesium.PrimitiveCollection;
let geojson: ContourGeoJSON | null = null;
let lastExaggeration: number = DEFAULT_STATE.exaggeration;

// Primitive positions are absolute world coords — verticalExaggeration does NOT scale them.
// We must multiply elevation by exaggeration ourselves and rebuild on toggle.
function buildContours(exaggeration: number): void {
  contourCollection.removeAll();

  if (!geojson) return;

  for (const feature of geojson.features) {
    const elev = feature.properties.elevation;
    const color = elevationToColor(elev);
    const instances: Cesium.GeometryInstance[] = [];

    for (const coordArray of feature.geometry.coordinates) {
      const positions = coordArray.map(([lon, lat]) =>
        Cesium.Cartesian3.fromDegrees(lon, lat, elev * exaggeration)
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
  init(viewer: Cesium.Viewer, data: FeatureData) {
    geojson = data.contourGeoJSON;
    contourCollection = viewer.scene.primitives.add(new Cesium.PrimitiveCollection());
    buildContours(lastExaggeration);
  },

  apply(state: AppState) {
    if (!contourCollection) return;
    contourCollection.show = state.layers.contours;
    if (state.exaggeration !== lastExaggeration) {
      lastExaggeration = state.exaggeration;
      buildContours(state.exaggeration);
    }
  },

  destroy() {
    contourCollection.removeAll();
  },
};
