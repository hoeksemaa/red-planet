# RP-7: Add OPM real Mars imagery as second imagery layer

Add OpenPlanetaryMap XYZ tiles as the 'satellite' (real Mars today) imagery option alongside the existing terraformed imagery. OPM provides free, public, multi-LOD XYZ tiles consumable via CesiumJS UrlTemplateImageryProvider. Best candidates: OPM Mars Basemap v0.2 (colorized) or Viking MDIM 2.1. Implement as a proper layer in features/imagery.ts (after RP-4). The layers panel toggle switches between terraformed and real Mars. Depends on RP-4.
