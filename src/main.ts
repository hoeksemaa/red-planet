import './ui.css';
import { DEFAULT_STATE } from './state';
import * as renderer from './renderer';
import { imagery } from './features/imagery';
import { contours } from './features/contours';
import { labels, searchLabels } from './features/labels';
import { rovers, searchRovers } from './features/rovers';
import { satellites, searchSatellites, type SatelliteEntry } from './features/satellites';
import { createGraticule } from './features/graticule';
import type { UnifiedSearchResult } from './features/types';
import { UI } from './ui';
import { TERRAIN_DATA_URL, flyToAltitude } from './constants';
import type { FeatureInfo } from './features/types';
import type { RoverPickResult } from './features/rovers';

async function main(): Promise<void> {
  const heightsBuf = await fetch(TERRAIN_DATA_URL).then((r) => r.arrayBuffer());
  const heights = new Float32Array(heightsBuf);
  const state = { ...DEFAULT_STATE };

  renderer.register('imagery', imagery);
  renderer.register('contours', contours);
  renderer.register('graticule', createGraticule());
  renderer.register('labels', labels);
  renderer.register('rovers', rovers);
  renderer.register('satellites', satellites);
  await renderer.init(heights, state);

  function unifiedSearch(query: string): UnifiedSearchResult[] {
    const q = query.trim().toLowerCase();

    // Tag search: exact tag name → return all of that category
    if (q === 'rover')     return searchRovers('*');
    if (q === 'satellite') return searchSatellites('*');
    if (q === 'place')     return searchLabels('*');

    // Normal name-based search
    const rovers = searchRovers(query);
    const sats = searchSatellites(query);
    const priority = [...rovers, ...sats];
    const labels = searchLabels(query);
    const remaining = 10 - priority.length;
    return [...priority, ...labels.slice(0, Math.max(0, remaining))];
  }

  function handleSelect(result: UnifiedSearchResult): void {
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
  }

  const ui = new UI(state, {
    onStateChange: (s) => renderer.apply(s),
    onSearch: (query) => unifiedSearch(query),
    onSelect: (result) => handleSelect(result),
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
      if (r.kind === 'photo') {
        ui.showRoverPhotoInfo(r);
      } else {
        ui.showRoverInfo(r);
      }
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
}

main();
