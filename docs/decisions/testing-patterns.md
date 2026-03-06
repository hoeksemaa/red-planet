# Testing — Patterns & Gotchas

## Stack
- Vitest (v4+), `npm test` / `npm run test:watch`
- Config: `vitest.config.ts` at project root
- Test files: `src/**/*.test.ts`

## Project testing philosophy (see testing-strategy.md)
- **Test**: pure functions, state logic, data helpers — anything with no WebGL dependency
- **Don't test**: rendering, Cesium scene/geometry construction, anything that requires a real GPU context
- No E2E/Playwright for the globe — headless WebGL is flaky and the real failure modes don't surface in assertions anyway

## Mocking Cesium in vitest

### Arrow functions cannot be constructors
**Wrong:**
```ts
GeometryInstance: vi.fn().mockImplementation((config: any) => config),
```
**Right:**
```ts
GeometryInstance: vi.fn().mockImplementation(function (config: any) { return { ...config }; }),
```
`vi.fn()` with an arrow function implementation fails when called with `new` because arrow functions have no prototype. vitest even warns: "The vi.fn() mock did not use 'function' or 'class'". Every Cesium class mock (`GeometryInstance`, `PolylineGeometry`, `PolylineColorAppearance`, etc.) must use `function` keyword.

For mocks that need a mutable instance property (e.g. `Primitive.show`):
```ts
const Primitive = vi.fn().mockImplementation(function (this: any, config: any) {
  this.show = config.show ?? false;
});
```

### Minimal Cesium mock for contours.ts
```ts
vi.mock('cesium', () => {
  const Primitive = vi.fn().mockImplementation(function (this: any, config: any) {
    this.show = config.show ?? false;
  });
  return {
    Color: { fromHsl: vi.fn((h, s, l) => ({ h, s, l })) },
    Cartesian3: { fromDegrees: vi.fn((lon, lat, alt) => ({ lon, lat, alt })) },
    GeometryInstance: vi.fn().mockImplementation(function (config) { return { ...config }; }),
    PolylineGeometry: vi.fn().mockImplementation(function (config) { return { ...config }; }),
    ColorGeometryInstanceAttribute: { fromColor: vi.fn(c => c) },
    Primitive,
    PolylineColorAppearance: vi.fn().mockImplementation(function (config) { return { ...config }; }),
  };
});
```

## Module-level state leaking between tests

`contours.ts` has module-level vars: `primitives`, `initialized`, `pendingState`, `viewerRef`.
`contours.destroy()` resets `primitives` and `initialized` but NOT `pendingState`.

If test A calls `contours.apply({ contours: true })` and test B later calls `contours.init(viewer)`,
the pending state from test A replays in B — causing unexpected visible primitives.

**Fix in afterEach:** after `destroy()`, call `apply(falseState)` to overwrite the queue:
```ts
afterEach(() => {
  contours.destroy();
  contours.apply(makeState()); // makeState() has contours: false — clears pending queue
  vi.unstubAllGlobals();
});
```

## vi.clearAllMocks() vs vi.resetAllMocks()
- `clearAllMocks()` — clears call history only; implementations survive. Safe to use in beforeEach.
- `resetAllMocks()` — clears call history AND removes implementations. Breaks module-level mocks.
- `restoreAllMocks()` — restores original implementations (for spyOn, not vi.mock).

## Detecting async init completion (fire-and-forget pattern)
`contours.init()` doesn't return the promise — it fires and forgets. Wait for side effects:
```ts
async function waitForInit(viewer) {
  await vi.waitFor(() => {
    expect(viewer.scene.primitives.add).toHaveBeenCalledTimes(2);
  });
}
```

## fetch mocking
```ts
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    json: () => Promise.resolve(structuredClone(fakeGeoJSON)),
  }));
});
afterEach(() => {
  vi.unstubAllGlobals();
});
```
Use `structuredClone(fakeGeoJSON)` so tests can't mutate each other's fixture data.
