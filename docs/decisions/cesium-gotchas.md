# Cesium Gotchas (learned the hard way)

## BillboardCollection / LabelCollection need `{ scene }` for heightReference
- Constructor accepts optional `scene` in options object
- REQUIRED if any child billboard/label uses non-NONE `heightReference`
- Without it, `.add()` throws `DeveloperError: "Height reference is not supported without a scene."`
- `LabelCollection` passes `scene` to its internal `BillboardCollection`s, so same rule applies
- Pattern: `new Cesium.BillboardCollection({ scene: viewer.scene })`

## CLAMP_TO_TERRAIN (value 3) works with CustomHeightmapTerrainProvider
- Valid in Cesium >=1.138; clamps to terrain only (ignores 3D tiles)
- Correct choice for Mars (no 3D tiles exist)
- Height clamping flow: `_updateClamping()` → `scene.updateHeight()` registers terrain callback → `globe._surface.updateHeight()` fires when tile loads → billboard position updated
- Initial position falls back to ellipsoid surface (height 0) until terrain tile renders

## DeveloperError checks are stripped in production Cesium builds
- Guard clauses like the `_scene` check only exist in unminified builds
- In production, you get raw `TypeError: Cannot read properties of undefined` instead
- Always develop with unminified Cesium to get useful errors

## PolylineDash material: 1 = gap, 0 = dash (inverted from intuition)
- `dashPattern` is a 16-bit int; bit 15 (MSB) is the first step
- `1` bit = transparent gap, `0` bit = colored dash
- To get 25% dash / 75% gap: `0xFFF0` (65520) — 12 gap-bits, 4 dash-bits
- `color` sets the dash color; `gapColor: TRANSPARENT` for clean gaps
- `dashLength` is the full cycle in screen pixels; dash length = duty% × dashLength

## `disableDepthTestDistance: Number.POSITIVE_INFINITY` causes through-planet artifacts

The obvious fix for labels/icons rendering below polyline layers is to set
`disableDepthTestDistance: Number.POSITIVE_INFINITY` on `Billboard`/`Label` entries.
**Do not do this.** When the camera is zoomed out, primitives on or near the limb of the
planet will render through the globe body because depth testing is disabled globally.

The safer value is something like `6.4e6` (≈ Mars diameter in meters). This disables depth
testing only while the camera is closer than 6.4 Mm to the primitive — close enough that
the primitive is on the visible hemisphere — but re-enables it at orbital distances where
the planet body must occlude far-side objects.

Remaining open issue: even with `6.4e6`, labels with no `disableDepthTestDistance` set
will still be occluded by `Primitive`-based polylines (contours, graticule) because their
depth values compete in the standard depth buffer. The correct fix is adding
`disableDepthTestDistance: 6.4e6` to all label entries that must render on top of geometry.
The `POSITIVE_INFINITY` shortcut is rejected because of the limb artifact.

## camera.position vs camera.positionWC inside a lookAt frame

After `camera.lookAt(pivot, hpr)` is called, Cesium puts the camera in a local
reference frame centred on `pivot`. From that point on, `camera.position` returns
a **local-frame vector** — NOT world coordinates.

If you then call `Cartesian3.distance(camera.position, pivot)` to recompute the
orbit range, you are computing the distance between a local vector and a world
Cartesian3. The result is nonsense (≈ Mars radius magnitude), the next `lookAt`
places the camera in deep space, and Cesium's tile LOD math overflows with:

> RangeError: Invalid array length

**Fix:** always use `camera.positionWC` (world coordinates, always valid) when
computing distance to a world-space point. `positionWC` is stable regardless of
the active reference frame.

```ts
// wrong — camera.position is local-frame garbage after first lookAt
const range = Cartesian3.distance(camera.position, pivot);

// correct
const range = Cartesian3.distance(camera.positionWC, pivot);
```

## `camera.heading` is ECEF-based in the IDENTITY frame, not geographic

After `camera.lookAtTransform(Matrix4.IDENTITY)` (or at app startup), the camera is
in the raw ECEF world frame.  `camera.heading` is then computed as:

```
atan2(dir_ecef.y, dir_ecef.x) - π/2  →  2π - zeroToTwoPi(…)
```

where `dir_ecef.{x,y}` are the **ECEF world axes** — not geographic East/North.
Passing this value as the heading in `HeadingPitchRange` (which expects ENU heading)
causes the camera to snap to a completely wrong position on the first `lookAt` call
of each gesture.

**Fix:** call `camera.lookAtTransform(Transforms.eastNorthUpToFixedFrame(pivot))`
**without an offset** before reading `camera.heading` or `camera.pitch`.
`_setTransform` converts the camera's direction/up vectors to the new frame without
moving the camera, so both properties are then correctly geographic.  The subsequent
`camera.lookAt(pivot, hpr)` call re-applies the same ENU transform internally, so
there's no double-move.

```ts
// wrong — camera.heading is in ECEF axes after exitLookAt()
camera.lookAt(pivot, new HeadingPitchRange(camera.heading - dAngle, camera.pitch, range));

// correct — heading/pitch read in ENU frame
camera.lookAtTransform(Transforms.eastNorthUpToFixedFrame(pivot));
camera.lookAt(pivot, new HeadingPitchRange(camera.heading - dAngle, camera.pitch, range));
```

## Promise.all in feature init is fragile
- One feature throwing kills all features silently
- Globe + imagery still render (set up before initAll), so app looks "mostly working"
- Consider per-feature try/catch or Promise.allSettled if robustness matters
