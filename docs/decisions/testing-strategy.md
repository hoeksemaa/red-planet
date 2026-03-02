---
title: Testing Strategy
type: decision
date: 2026-03-02
---

# Testing Strategy

## Two surfaces, two approaches

### Logic — unit tests, written alongside the code

Pure functions with no WebGL dependency are unit-testable and should be tested with Vitest the same day the feature is written:

- URL encoding/decoding (shareable URLs)
- Search and filter functions (`searchLabels`, `unifiedSearch`, category matching)
- Data helpers (`flyToAltitude`, state transitions, data parsing)

No separate "testing sprint." Each feature ticket that touches logic includes writing the tests as part of done.

### Rendering — do not automate

E2E tests for a WebGL globe app have poor cost-to-signal ratio. Headless Chrome WebGL is flaky, screenshot diffing against a 3D scene is noisy, and the real failure modes (terrain jank, label z-fighting, touch feel) don't surface in Playwright assertions anyway. Don't write these.

### UX — user testing is the integration test

Watching real people use the app is the highest-signal test available. Run two rounds:

- **Round 1:** After core mobile UX stabilizes (UX-1, UX-2, UX-3). Test: can someone pick it up on a phone and navigate to something interesting without help?
- **Round 2:** After shareable URLs and main polish land, pre-launch. Test: does the full experience hold up end-to-end?

3–5 people per round. Silent observation. Record it. Their hesitations are the bug reports.
