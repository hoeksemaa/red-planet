# RP-5: Fix contour double-exaggeration bug

Contours are rendered at elev*exag height AND Cesium's verticalExaggeration is also applied — double-exaggeration. Fix: render contours at true elevation and let verticalExaggeration handle scaling uniformly. Contours should always be visible in both modes. Depends on RP-4.
