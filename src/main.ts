import './ui.css';
import { DEFAULT_STATE } from './state';
import * as renderer from './renderer';
import { searchLabels, flyToAltitude, setOnLabelClick, setOnLabelMiss } from './features/labels';
import { UI } from './ui';
import { TERRAIN_DATA_URL, CONTOURS_DATA_URL, NOMENCLATURE_DATA_URL } from './constants';

async function main(): Promise<void> {
  // Load all data in parallel
  const [heightsBuf, contourGeoJSON, nomenclatureGeoJSON] = await Promise.all([
    fetch(TERRAIN_DATA_URL).then((r) => r.arrayBuffer()),
    fetch(CONTOURS_DATA_URL).then((r) => r.json()),
    fetch(NOMENCLATURE_DATA_URL).then((r) => r.json()),
  ]);

  const heights = new Float32Array(heightsBuf);
  const state = { ...DEFAULT_STATE };

  // Init renderer (creates Viewer + all features)
  await renderer.init({ heights, contourGeoJSON, nomenclatureGeoJSON }, state);

  // Init UI (wires DOM → state → renderer)
  const ui = new UI(state, {
    onStateChange: (s) => renderer.apply(s),
    onSearch: (query) => searchLabels(query),
    onSelect: (result) => {
      renderer.flyTo(result.lon, result.lat, flyToAltitude(result.diameterKm));
    },
  });

  setOnLabelClick((entry) => {
    renderer.flyTo(entry.lon, entry.lat, flyToAltitude(entry.diameterKm));
    ui.showFeatureInfo(entry);
  });
  setOnLabelMiss(() => ui.hideFeatureInfo());
}

main();
