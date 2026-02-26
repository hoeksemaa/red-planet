# Plan: RP-6 Google Maps UI design system

## Situation

`main.ts` has zero UI elements. `index.html` is bare: a `#cesiumContainer` and three lines of reset CSS. So this task means:

1. Define the CSS token system (custom properties) all future UI tasks will consume.
2. Add the persistent title bar: "RED PLANET" centered top of viewport.
3. Define the `.rp-card` base class that search bar, layers panel, and detail card will reuse.

RP-6 is a prerequisite for RP-8 (search bar), RP-9 (layers panel), RP-10 (compass), RP-11 (scale bar).

## Visual spec

| Token | Value |
|---|---|
| `--bg` | `#ffffff` |
| `--border-color` | `#dadce0` |
| `--shadow` | `0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.24)` |
| `--radius` | `8px` |
| `--font` | `'Google Sans', Roboto, system-ui, sans-serif` |
| `--font-size` | `14px` |
| `--text-primary` | `#202124` |
| `--text-secondary` | `#5f6368` |

Title bar: "RED PLANET" full caps, centered top of screen, white text, floats over globe with `text-shadow` for legibility. No panel background.

Card/panel base (`.rp-card`): white bg, `#dadce0` border, shadow, 8px radius.

Overlay positioning: all panels use `position: absolute` over the Cesium canvas. `body` needs `position: relative`.

## Files

| File | Action |
|---|---|
| `src/ui.css` | CREATE — all tokens, `.rp-card`, `#rp-title` |
| `src/main.ts` | MODIFY — add `import './ui.css'` |
| `index.html` | MODIFY — `body { position: relative }`, add `#rp-title` div |

## Acceptance criteria

1. `src/ui.css` exists with all 8 tokens, `.rp-card`, and `#rp-title` rules.
2. "RED PLANET" appears centered at the top of the viewport in white text over the globe.
3. `import './ui.css'` in `main.ts` builds without errors via Vite.
4. Globe renders normally — no Cesium regressions.
5. Zero dark glass / `rgba(0,0,0,*)` background styles anywhere in project CSS.
