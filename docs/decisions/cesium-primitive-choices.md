---
title: Cesium Primitive Choices for Map Data
type: decision
date: 2026-02-26
---

# Cesium Primitive Choices for Map Data

## Rule 0 — Never use the Entity API for map data

`viewer.entities.add()` re-evaluates every property every frame. It is for interactive, low-count objects only (e.g. a single selected-item highlight). All bulk map data must use the primitive layer directly.

---

## Primitive Taxonomy

Cesium has three rendering layers, processed in order:

```
Globe  →  scene.primitives  →  PostProcessStages
```

`scene.primitives` contains five distinct families:

| Family | Class | Notes |
|---|---|---|
| Geometry | `Primitive` | Tessellated geometry; absolute world coords |
| Ground | `GroundPrimitive`, `GroundPolylinePrimitive` | Drapes onto terrain depth buffer |
| Sprite batch | `BillboardCollection`, `LabelCollection`, `PointPrimitiveCollection` | Screen-space quads, rendered after opaque geo |
| Model | `Model` | glTF/glb; has `heightReference` |
| Tileset | `Cesium3DTileset` | Streaming LOD; own exaggeration property |

---

## Rule 1 — Polylines that follow terrain → `GroundPolylinePrimitive`

```ts
new Cesium.GroundPolylinePrimitive({
  geometryInstances: new Cesium.GeometryInstance({
    geometry: new Cesium.GroundPolylineGeometry({ positions, width: 2.5 }),
    attributes: { color: Cesium.ColorGeometryInstanceAttribute.fromColor(color) },
  }),
  appearance: new Cesium.PolylineColorAppearance(),
})
```

- Composited against the terrain depth buffer — follows terrain surface exactly
- Follows `scene.verticalExaggeration` automatically (queries rendered terrain)
- Do NOT use `PolylineGeometry` + `Primitive` for terrain-following lines

---

## Rule 2 — Polygons that follow terrain → `GroundPrimitive`

```ts
new Cesium.GroundPrimitive({
  geometryInstances: new Cesium.GeometryInstance({
    geometry: new Cesium.PolygonGeometry({ polygonHierarchy: ... }),
    ...
  }),
})
```

Same compositing model as `GroundPolylinePrimitive`.

---

## Rule 3 — Point markers → `BillboardCollection` with `CLAMP_TO_TERRAIN`

**`PointPrimitiveCollection` has no `heightReference` property.** Points sit at absolute world coords and will be buried under exaggerated terrain. Always use `BillboardCollection` for terrain-aware markers.

```ts
const billboards = viewer.scene.primitives.add(new Cesium.BillboardCollection());
billboards.add({
  position: Cesium.Cartesian3.fromDegrees(lon, lat),
  image: '/icons/pin.png',               // or a canvas-drawn dot
  heightReference: Cesium.HeightReference.CLAMP_TO_TERRAIN,
  verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
});
```

Use `CLAMP_TO_TERRAIN` (not `CLAMP_TO_GROUND`) on Mars — there are no 3D Tiles to composite against, so `CLAMP_TO_GROUND` queries a system that doesn't exist.

For simple colored dots without a texture, draw a circle onto a canvas and pass it as the `image`.

---

## Rule 4 — Labels → `LabelCollection` with `CLAMP_TO_TERRAIN`

```ts
const labels = viewer.scene.primitives.add(new Cesium.LabelCollection());
labels.add({
  position: Cesium.Cartesian3.fromDegrees(lon, lat),
  text: 'Olympus Mons',
  heightReference: Cesium.HeightReference.CLAMP_TO_TERRAIN,
});
```

Same reasoning as Rule 3.

---

## Rule 5 — Absolute-height geometry (e.g. contours) → `Primitive`, heights multiplied by exaggeration

`Primitive` positions are absolute world coordinates. `scene.verticalExaggeration` does **not** affect them — only the terrain mesh is scaled. Contour lines at true elevation will be buried inside the exaggerated terrain mesh.

Multiply elevation by `state.exaggeration` when constructing positions:

```ts
const positions = coords.map(([lon, lat]) =>
  Cesium.Cartesian3.fromDegrees(lon, lat, elev * state.exaggeration)
);
```

This means contour geometry must be **rebuilt** when exaggeration changes. That is the correct tradeoff — do not try to patch it with a global scale.

---

## Rule 6 — 3D models → `Model` with `heightReference` + `enableVerticalExaggeration`

```ts
const model = viewer.scene.primitives.add(Cesium.Model.fromGltf({
  url: '...',
  heightReference: Cesium.HeightReference.CLAMP_TO_TERRAIN,
  enableVerticalExaggeration: true,
}));
```

---

## verticalExaggeration interaction summary

| Primitive type | Follows `scene.verticalExaggeration`? |
|---|---|
| Globe (terrain mesh) | Yes — directly scaled |
| `GroundPrimitive` / `GroundPolylinePrimitive` | Yes — drapes on rendered terrain |
| `Billboard` / `Label` with `CLAMP_TO_TERRAIN` | Yes — queries rendered terrain height |
| `Billboard` / `Label` with `HeightReference.NONE` | No |
| `PointPrimitive` | Never (no HeightReference) |
| `Primitive` (geometry) | No — must multiply heights manually |
| `Model` with `enableVerticalExaggeration: true` | Yes |
| `Cesium3DTileset` | Only if tileset's own `verticalExaggeration` is set |

---

## Rule 7 — Billboard/Label depth ordering vs polyline layers

Billboards and labels ARE rendered after opaque geometry in Cesium's pipeline. However,
`Primitive`-based polylines (contours, graticule) write to the depth buffer at their
world-space positions. When a billboard/label sits at the same pixel, it is depth-tested
against those values and can be clipped if the line's depth wins.

The fix is `disableDepthTestDistance` on each `Billboard`/`Label`:

```ts
// On billboard.add() / label.add():
disableDepthTestDistance: 6.4e6,   // ≈ Mars diameter in metres
```

This skips depth testing when the camera is closer than 6.4 Mm to the primitive —
which covers all practical zoom levels on the visible hemisphere.

**Do NOT use `Number.POSITIVE_INFINITY`.** That disables depth testing at any distance,
causing labels/icons near the limb to render visibly through the planet body when the
camera is zoomed out.

---

## Root cause — contour/graticule lines visually above icons at 100× exaggeration

At 100× vertical exaggeration, contour and graticule `Primitive` positions are placed at
`elevation × 100` in world coordinates — potentially kilometers above the rendered terrain
surface. Billboards clamped with `CLAMP_TO_TERRAIN` sit at the actual rendered surface.
At oblique viewing angles, an exaggerated contour line that passes near a billboard's map
position can be physically above it in 3D space and will visually occlude it regardless of
depth-test settings. This is not a rendering-order or depth-buffer artifact — the line
literally floats above the icon in world space.
