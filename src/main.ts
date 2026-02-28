import './ui.css';
import { DEFAULT_STATE } from './state';
import * as renderer from './renderer';
import { searchLabels, flyToAltitude, setOnLabelClick, setOnLabelMiss } from './features/labels';
import { searchRovers, setOnRoverPinClick, setOnRoverMiss } from './features/rovers';
import { searchSatellites, setOnSatelliteClick, setOnSatelliteMiss } from './features/satellites';
import type { UnifiedSearchResult } from './features/types';
import { UI } from './ui';
import { TERRAIN_DATA_URL, CONTOURS_DATA_URL, NOMENCLATURE_DATA_URL, INITIAL_CAMERA_HEIGHT } from './constants';

async function main(): Promise<void> {
  const [heightsBuf, contourGeoJSON, nomenclatureGeoJSON] = await Promise.all([
    fetch(TERRAIN_DATA_URL).then((r) => r.arrayBuffer()),
    fetch(CONTOURS_DATA_URL).then((r) => r.json()),
    fetch(NOMENCLATURE_DATA_URL).then((r) => r.json()),
  ]);

  const heights = new Float32Array(heightsBuf);
  const state = { ...DEFAULT_STATE };

  await renderer.init({ heights, contourGeoJSON, nomenclatureGeoJSON }, state);

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
        break;
      case 'rover':
        renderer.flyTo(result.lon, result.lat, 50_000);
        break;
      case 'satellite':
        renderer.flyTo(0, 0, INITIAL_CAMERA_HEIGHT);
        ui.showSatelliteInfo(result);
        break;
    }
  }

  const ui = new UI(state, {
    onStateChange: (s) => renderer.apply(s),
    onSearch: (query) => unifiedSearch(query),
    onSelect: (result) => handleSelect(result),
  });

  setOnLabelClick((entry) => {
    renderer.flyTo(entry.lon, entry.lat, flyToAltitude(entry.diameterKm));
    ui.showFeatureInfo(entry);
    ui.hideRoverInfo();
  });
  setOnLabelMiss(() => ui.hideFeatureInfo());

  setOnRoverPinClick((entry) => ui.showRoverInfo(entry));
  setOnRoverMiss(() => ui.hideRoverInfo());

  setOnSatelliteClick((entry) => ui.showSatelliteInfo(entry));
  setOnSatelliteMiss(() => ui.hideSatelliteInfo());

  void ui;
}

main();
