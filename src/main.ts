import './ui.css';
import { DEFAULT_STATE } from './state';
import * as renderer from './renderer';
// import { searchLabels, flyToAltitude, setOnLabelClick, setOnLabelMiss } from './features/labels';
// import { setOnRoverPinClick, setOnRoverMiss } from './features/rovers';
import { UI } from './ui';
import { TERRAIN_DATA_URL } from './constants';
// import { CONTOURS_DATA_URL, NOMENCLATURE_DATA_URL } from './constants';

async function main(): Promise<void> {
  const [heightsBuf] = await Promise.all([
    fetch(TERRAIN_DATA_URL).then((r) => r.arrayBuffer()),
    // fetch(CONTOURS_DATA_URL).then((r) => r.json()),
    // fetch(NOMENCLATURE_DATA_URL).then((r) => r.json()),
  ]);

  const heights = new Float32Array(heightsBuf);
  const state = { ...DEFAULT_STATE };

  await renderer.init({ heights, contourGeoJSON: null, nomenclatureGeoJSON: null }, state);

  const ui = new UI(state, {
    onStateChange: (s) => renderer.apply(s),
    onSearch: (_query) => [],
    onSelect: (_result) => {},
  });

  // setOnLabelClick((entry) => {
  //   renderer.flyTo(entry.lon, entry.lat, flyToAltitude(entry.diameterKm));
  //   ui.showFeatureInfo(entry);
  //   ui.hideRoverInfo();
  // });
  // setOnLabelMiss(() => ui.hideFeatureInfo());

  // setOnRoverPinClick((entry) => ui.showRoverInfo(entry));
  // setOnRoverMiss(() => ui.hideRoverInfo());

  void ui;
}

main();
