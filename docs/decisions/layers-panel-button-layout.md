---
title: Layers Panel Button Layout
type: decision
date: 2026-03-04
---

# Layers Panel Button Layout

## Rules

1. **All layer buttons are the same size.** Fixed image dimensions (`64×64px`) rather than fluid/percentage sizing. This guarantees visual uniformity regardless of grid column count.

2. **All buttons must be visible without scrolling the layers panel.** The panel is `50vh` on mobile. Button size is derived from the available height, not from arbitrary aesthetic preference.

3. **No checkboxes or radio inputs.** Active state is communicated via an orange (`#FF6200`) border on the image and orange label text.

## Sizing derivation (mobile baseline: iPhone 12 mini, 812px height)

```
50vh = 406px

Panel overhead (non-button):
  panel top padding:        4px
  header:                  25px
  Map Type grid padding:   16px   (6px top + 10px bottom)
  divider:                  9px
  Map Details title:       23px
  Map Details grid padding:16px
  row gap (details):        8px
  panel bottom padding:     8px
  ──────────────────────────────
  total overhead:         109px

Available for 3 button rows: 406 - 109 = 297px
Per row (3 rows, 0 gaps for map type, 1 gap for details):
  ~95px per row

Button anatomy: 6px top + 64px image + 5px gap + ~14px label + 6px bottom = 95px ✓
```

Image size **64px** fits iPhone 12 mini and larger. Very small legacy devices (iPhone SE, 667px height) may require minor scrolling.

## Grid layout

- **Map Type** section: 2-column grid (2 buttons, 1 row)
- **Map Details** section: 3-column grid (6 buttons, 2 rows)

Both sections use the same fixed button size, so buttons appear visually identical across sections even though the underlying column count differs.
