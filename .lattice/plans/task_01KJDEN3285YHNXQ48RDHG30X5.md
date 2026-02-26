# Plan: RP-4 Architecture refactor — layer registry + features/ directory

## Scope

Wire existing terrain logic through a new `features/` architecture. Five files total: four new, one rewritten. No new visual features. Globe must look identical after refactor.

## Target File Structure

```
src/
  constants.ts          — existing; add TERRAIN_DATA_URL
  state.ts              — NEW: AppState interface + defaultState
  main.ts               — REWRITTEN: thin orchestrator only (~35 lines)
  ui.css                — unchanged
  features/
    types.ts            — NEW: Layer interface
    terrain.ts          — NEW: terrain layer
    registry.ts         — NEW: LayerRegistry class
```

## Implementation Order

1. `src/constants.ts` — add `TERRAIN_DATA_URL`
2. `src/features/types.ts` — Layer interface
3. `src/state.ts` — AppState + defaultState
4. `src/features/registry.ts` — LayerRegistry
5. `src/features/terrain.ts` — terrain layer (fetch + CustomHeightmapTerrainProvider, sets verticalExaggeration)
6. `src/main.ts` — rewrite as thin orchestrator
7. `npx tsc --noEmit` — verify clean
8. Visual check via `npm run dev`

## Key Decisions (from RP-16)

- `terrainProvider` assigned to `viewer.terrainProvider` post-construction (not passed to `new Viewer()`)
- `verticalExaggeration` set inside `terrain.ts init()`, not in main.ts
- `sampleMOLA` inlined into the callback — no standalone function needed
- `Promise.all` for layer init (layers are independent)
- No `show(id)`/`hide(id)` on registry — callers use `registry.get(id)?.show()`

## Acceptance Criteria

1. `npm run dev` starts without errors; globe renders with exaggerated terrain, visually identical to before
2. `src/main.ts` contains no terrain-specific logic — no `fetch`, no `sampleMOLA`, no `CustomHeightmapTerrainProvider`
3. `src/features/types.ts` exports `Layer` interface
4. `src/features/terrain.ts` exports `terrainLayer` satisfying `Layer`
5. `src/features/registry.ts` exports `LayerRegistry` with `register`, `initAll`, `get`, `getAll`
6. `src/state.ts` exports `AppState` and `defaultState`
7. `npx tsc --noEmit` exits clean
8. No files created beyond the specified list
