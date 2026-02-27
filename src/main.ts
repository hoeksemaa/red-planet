import './ui.css';
import { DEFAULT_STATE } from './state';
import * as renderer from './renderer';
import { imagery } from './features/imagery';
import { contours } from './features/contours';
import { labels, searchLabels } from './features/labels';
import { rovers } from './features/rovers';
import { UI } from './ui';
import { TERRAIN_DATA_URL, flyToAltitude } from './constants';
import type { FeatureInfo } from './features/types';
import type { RoverPinEntry } from './features/rovers';

async function main(): Promise<void> {
  const heightsBuf = await fetch(TERRAIN_DATA_URL).then((r) => r.arrayBuffer());
  const heights = new Float32Array(heightsBuf);
  const state = { ...DEFAULT_STATE };

  renderer.register('imagery', imagery);
  renderer.register('contours', contours);
  renderer.register('labels', labels);
  renderer.register('rovers', rovers);
  await renderer.init(heights, state);

  const ui = new UI(state, {
    onStateChange: (s) => renderer.apply(s),
    onSearch: (query) => searchLabels(query),
    onSelect: (result) => {
      renderer.flyTo(result.lon, result.lat, flyToAltitude(result.diameterKm));
    },
  });

  renderer.onPick((featureId, result) => {
    if (featureId === 'labels') {
      const info = result as FeatureInfo;
      renderer.flyTo(info.lon, info.lat, flyToAltitude(info.diameterKm));
      ui.showFeatureInfo(info);
      ui.hideRoverInfo();
    } else if (featureId === 'rovers') {
      ui.showRoverInfo(result as RoverPinEntry);
    }
  });
  renderer.onPickMiss(() => {
    ui.hideFeatureInfo();
    ui.hideRoverInfo();
  });
}

main();
