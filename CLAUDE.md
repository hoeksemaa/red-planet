# Explore Mars

Interactive 3D Mars globe built from MOLA elevation data. See PRD.md for full spec.

## Environment
- Activate venv before running scripts: `source .venv/bin/activate`

## User Preferences
- Explain things step by step; walk through code line by line before writing it
- Keep code minimal — fewest possible moving parts
- No unnecessary abstractions or premature generalization
- User is learning — teach concepts, don't just dump code

## Design Tokens
- **Default orange:** `#FF9500` (bright, happy; use for active states, highlights, accents)

## Conventions & Design Decisions

Before implementing anything, list `docs/decisions/` and read only files whose names suggest relevance to the current task. Files are named to reflect their contents — use the filename to decide whether to open them. They are the canonical record of how and why things are built the way they are.

When writing a new decision doc, name it so the contents are inferrable from the title alone (e.g. `tile-coordinate-system.md`, `contour-rendering-approach.md`).
