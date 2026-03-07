import { mark } from './perf';
mark('script-start');
import './App.css';
import { inject } from '@vercel/analytics';
import { injectSpeedInsights } from '@vercel/speed-insights';
import * as renderer from './renderer';
import { imagery } from './features/imagery';
import { contours, prefetch as prefetchContours } from './features/contours';
import { labels, searchLabels } from './features/labels';
import { rovers, searchRovers } from './features/rovers';
import { satellites, searchSatellites, type SatelliteEntry } from './features/satellites';
import { createGraticule } from './features/graticule';
import { UI } from './ui';
import { DEFAULT_STATE } from './state';
import { TERRAIN_DATA_URL, flyToAltitude } from './constants';
import type { UnifiedSearchResult, FeatureInfo } from './features/types';
import type { RoverPickResult } from './features/rovers';
import realMarsIcon    from './assets/icons/real-mars.png';
import terraformedIcon from './assets/icons/terraformed.png';
import exaggeratedIcon from './assets/icons/exaggerated.png';
import topographyIcon  from './assets/icons/topography.png';
import latLongIcon     from './assets/icons/lat-long.png';
import labelIcon       from './assets/icons/label.png';
import roverIcon       from './assets/icons/rover.png';
import satelliteIcon   from './assets/icons/satellite.png';

inject();
injectSpeedInsights();

// Kick off contours download immediately — before viewer init — so it's ready sooner.
prefetchContours();

const state = { ...DEFAULT_STATE };

renderer.register('imagery',    imagery);
renderer.register('graticule',  createGraticule());
renderer.register('contours',   contours);
renderer.register('labels',     labels);
renderer.register('rovers',     rovers);
renderer.register('satellites', satellites);

(async () => {
  const loadingScreen = document.getElementById('loadingScreen')!;
  const bar = document.getElementById('loadingBar') as HTMLElement;

  // Kick bar to 75% — CSS transition (2s ease-out) animates it smoothly while init happens
  requestAnimationFrame(() => { bar.style.width = '75%'; });

  // perf: terrain downloads in background and swaps in silently (PERF-4)
  // globe appears immediately on flat ellipsoid, real MOLA terrain arrives ~seconds later
  fetch(TERRAIN_DATA_URL)
    .then((r) => r.arrayBuffer())
    .then((buf) => renderer.setTerrain(new Float32Array(buf)))
    .catch((e) => console.error('[App] Terrain load failed:', e));

  await renderer.init(state);

  // Deferred: layer panel icons are not on the critical first-load path
  (document.querySelector('#layerBtnTerraformed img') as HTMLImageElement).src = terraformedIcon;
  (document.querySelector('#layerBtnReal img')        as HTMLImageElement).src = realMarsIcon;
  (document.querySelector('#layerBtnExag img')        as HTMLImageElement).src = exaggeratedIcon;
  (document.querySelector('#layerBtnContours img')    as HTMLImageElement).src = topographyIcon;
  (document.querySelector('#layerBtnGraticule img')   as HTMLImageElement).src = latLongIcon;
  (document.querySelector('#layerBtnLabels img')      as HTMLImageElement).src = labelIcon;
  (document.querySelector('#layerBtnRovers img')      as HTMLImageElement).src = roverIcon;
  (document.querySelector('#layerBtnSatellites img')  as HTMLImageElement).src = satelliteIcon;

  function unifiedSearch(query: string): UnifiedSearchResult[] {
    const q = query.trim().toLowerCase();
    if (q === 'rover')     return searchRovers('*');
    if (q === 'satellite') return searchSatellites('*');
    if (q === 'place')     return searchLabels('*');
    const rs = searchRovers(query);
    const ss = searchSatellites(query);
    const priority = [...rs, ...ss];
    const ls = searchLabels(query);
    return [...priority, ...ls.slice(0, Math.max(0, 10 - priority.length))];
  }

  const ui = new UI(state, {
    onStateChange: (s) => renderer.apply(s),
    onSearch: (query) => unifiedSearch(query),
    onSelect: (result) => {
      switch (result.kind) {
        case 'location':
          renderer.flyTo(result.lon, result.lat, flyToAltitude(result.diameterKm));
          ui.showFeatureInfo({
            name: result.name, lon: result.lon, lat: result.lat,
            diameterKm: result.diameterKm, featureType: result.featureType, origin: result.origin,
          });
          break;
        case 'rover':
          renderer.flyTo(result.lon, result.lat, 50_000);
          ui.showRoverInfo({ kind: 'pin', rover: result.name, id: result.id, sol: null, color: result.color });
          break;
        case 'satellite':
          renderer.flyTo(0, 0, Math.max(result.altitudeKm * 1000 * 10, 30_000_000));
          ui.showSatelliteInfo(result);
          break;
      }
    },
  });

  renderer.onPick((featureId, result) => {
    if (featureId === 'labels') {
      const info = result as FeatureInfo;
      renderer.flyTo(info.lon, info.lat, flyToAltitude(info.diameterKm));
      ui.showFeatureInfo(info);
      ui.hideRoverInfo();
      ui.hideSatelliteInfo();
    } else if (featureId === 'rovers') {
      const r = result as RoverPickResult;
      r.kind === 'photo' ? ui.showRoverPhotoInfo(r) : ui.showRoverInfo(r);
      ui.hideSatelliteInfo();
    } else if (featureId === 'satellites') {
      ui.showSatelliteInfo(result as SatelliteEntry);
    }
  });

  renderer.onPickMiss(() => {
    ui.hideFeatureInfo();
    ui.hideRoverInfo();
    ui.hideRoverPhotoInfo();
    ui.hideSatelliteInfo();
  });

  // Complete loading screen once tiles are actually rendered
  await renderer.onceFirstTilesLoaded();
  bar.style.transition = 'width 0.4s ease';
  bar.style.width = '100%';
  setTimeout(() => loadingScreen.classList.add('is-done'), 400);
})().catch((e) => console.error('[App] Init failed:', e));
