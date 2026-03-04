---
title: Mobile Viewport and Scroll Behavior
type: decision
date: 2026-03-04
---

# Mobile Viewport and Scroll Behavior

## The Problem

Mobile browsers maintain two separate viewports:

- **Layout viewport** — what CSS/JS measure (`100vw`, `window.innerWidth`). Stable.
- **Visual viewport** — what the user literally sees. Shrinks when browser chrome (address bar, nav bar) appears.

`position: absolute` anchors to the document/body. `position: fixed` anchors to the visual viewport. For overlay UI that must always be visible, only `fixed` survives browser-chrome toggling and rubber-band scroll.

## Viewport Height Units

| Unit | Meaning |
|------|---------|
| `vh` | Broken on mobile — equals height with chrome *hidden* (largest), so content overflows when chrome is visible |
| `svh` | Chrome visible (smallest) |
| `lvh` | Chrome hidden (largest) |
| `dvh` | Tracks current state dynamically — correct choice for full-screen containers |

The Cesium container uses `100dvh`. That's correct.

## Overlay Positioning: `fixed` not `absolute`

All UI overlays (search bar, layers button, panel) must use `position: fixed`. With `absolute`, any body scroll — including iOS rubber-band scroll — shifts overlays relative to the document and they can disappear behind browser chrome.

## Enforcing Zero Scroll

For a map app, scroll is an anti-feature. Enforce it:

```css
html {
  height: 100%;
  overflow: hidden;
  overscroll-behavior: none; /* kills iOS rubber-band */
}

body {
  height: 100%;
  overflow: hidden;
}
```

`overscroll-behavior: none` prevents iOS bounce scroll even when `overflow: hidden` is set.

## Touch Action on the Map Canvas

```css
#cesiumContainer {
  touch-action: none;
}
```

Without this, the browser speculatively begins a scroll gesture while Cesium is trying to handle a globe-orbit gesture. `none` hands all touch events immediately to JS.

## Safe Areas

`viewport-fit=cover` in the meta tag extends content into notch/home-indicator territory. Use `env(safe-area-inset-*)` to keep interactive elements clear:

```css
/* mobile breakpoint */
#searchWrap { top: calc(env(safe-area-inset-top, 0px) + 12px); }
#layersBtn  { bottom: calc(env(safe-area-inset-bottom, 0px) + 12px); }
```

## Decision

- Overlay elements: `position: fixed`
- Globe container: `100dvh`
- Body/html: `overflow: hidden`, `overscroll-behavior: none`, `height: 100%`
- Cesium canvas: `touch-action: none`
- Safe area insets: applied at mobile breakpoint
