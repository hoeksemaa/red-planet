# Plan: Add constants.ts + bootstrap TypeScript

Project is pure JS — this task also bootstraps TypeScript (per CLAUDE.md: TS over JS always).

## Steps
1. Install `typescript` as devDependency; add `tsconfig.json`
2. Create `src/constants.ts` with named exports
3. Rename `src/main.js` → `src/main.ts`, import constants
4. Update `index.html` script src to `/src/main.ts`

## constants.ts contents
- `EXAGGERATION_SCALE = 100` — verticalExaggeration multiplier
- `HM_W = 1440`, `HM_H = 720` — MOLA heightmap dimensions
- `TERRAIN_TILE_SIZE = 32` — tile width/height for CustomHeightmapTerrainProvider
- `INITIAL_CAMERA_HEIGHT = 6_000_000` — starting camera altitude (meters)
- `MARS_BASE_COLOR: [number, number, number, number] = [0.55, 0.27, 0.07, 1.0]`

## Acceptance Criteria
- `npm run dev` still works; globe renders identically
- No bare numeric literals for the above values remain in main.ts
- `src/constants.ts` is the single source of truth

## Reset 2026-02-26 by agent:claude-sonnet-4-6
