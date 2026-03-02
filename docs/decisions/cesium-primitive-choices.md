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

---

## Rule 8 — Batch all geometry instances into the fewest Primitives possible

**Default: one `Primitive` per logical layer** (for geometry — polylines, polygons, etc.). Each `Primitive` submits at least one WebGL draw call **every frame**. A `PrimitiveCollection` with N primitives = N draw calls per frame, every frame, regardless of content complexity.

Note: `BillboardCollection`, `LabelCollection`, and `PointPrimitiveCollection` are already internally batched — all entries in one collection = one draw call. Do not replace these with geometry `Primitive`s; they are already optimal.

Flatten all `GeometryInstance` objects across all features into a single array and create
one `Primitive` per logical layer:

```ts
const allInstances: Cesium.GeometryInstance[] = [];
for (const feature of geojson.features) {
  for (const coordArray of feature.geometry.coordinates) {
    allInstances.push(new Cesium.GeometryInstance({ ... }));
  }
}
const primitive = new Cesium.Primitive({ geometryInstances: allInstances, ... });
```

Per-instance color still works — `ColorGeometryInstanceAttribute` lives on each
`GeometryInstance`, not on the `Primitive`. `PrimitiveCollection` is a JS-layer
organizational tool only; it does not reduce draw calls.

---

## Rule 9 — Use `asynchronous: true` with `show: false` for prefetched geometry

`asynchronous: false` compiles all geometry synchronously on the main thread the moment
the `Primitive` is added to the scene — guaranteed frame hitch for large datasets.

`asynchronous: true` (the Cesium default) spreads compilation across render frames with
no visible hitch. Pair with `show: false` so partially-compiled geometry never flashes
visible before it's ready:

```ts
const primitive = new Cesium.Primitive({
  geometryInstances: allInstances,
  appearance: new Cesium.PolylineColorAppearance({ translucent: false }),
  asynchronous: true,
  show: false,               // reveal only after initialized = true
});
```

---

## Rule 10 — Prefetch in `init()`, not on first user interaction

Gating a `fetch()` behind a layer toggle adds perceived latency exactly when the user
wants a response. Network fetches are async and non-blocking — start them in `init()`
so data arrives during app startup while the user is orienting. Set `show: false` and
apply the correct visibility in the `apply()` callback once data is ready.

---

## Pitfall — `removeAll()` does not remove the collection from the scene

`PrimitiveCollection.removeAll()` destroys the collection's children but leaves the
empty collection object in `scene.primitives`, leaking memory. To fully clean up:

```ts
// Wrong — leaves the collection in scene.primitives:
collection.removeAll();

// Correct — removes and destroys the collection and its children:
viewer.scene.primitives.remove(collection);
```

Same applies to individual `Primitive` objects added directly to `scene.primitives`.
