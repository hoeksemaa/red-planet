import React, { useEffect, useRef } from 'react';
import * as renderer from '../renderer';
import { imagery } from '../features/imagery';
import { contours } from '../features/contours';
import { labels, searchLabels } from '../features/labels';
import { rovers, searchRovers } from '../features/rovers';
import { satellites, searchSatellites, type SatelliteEntry } from '../features/satellites';
import { createGraticule } from '../features/graticule';
import { UI } from '../ui';
import { DEFAULT_STATE } from '../state';
import { TERRAIN_DATA_URL, flyToAltitude } from '../constants';
import type { UnifiedSearchResult, FeatureInfo } from '../features/types';
import type { RoverPickResult } from '../features/rovers';

interface Props {
  onProgress: (pct: number) => void;
  onReady: () => void;
}

export function MapView({ onProgress, onReady }: Props) {
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const state = { ...DEFAULT_STATE };

    renderer.register('imagery', imagery);
    renderer.register('contours', contours);
    renderer.register('graticule', createGraticule());
    renderer.register('labels', labels);
    renderer.register('rovers', rovers);
    renderer.register('satellites', satellites);

    renderer.onProgress(onProgress);
    renderer.onReady(onReady);

    (async () => {
      const [heightsBuf] = await Promise.all([
        fetch(TERRAIN_DATA_URL).then((r) => r.arrayBuffer()),
        renderer.prefetchAll(),
      ]);
      const heights = new Float32Array(heightsBuf);
      await renderer.init(heights, state);

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
    })().catch((e) => console.error('[MapView] Init failed:', e));
  }, []); // run once on mount

  return (
    <>
      <div id="cesiumContainer" />
      <div id="rp-title">GOOGLE MARS</div>

      <div id="searchWrap" className="rp-card">
        <div id="searchInputRow">
          <svg id="searchIcon" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="8.5" cy="8.5" r="5.5" stroke="#5f6368" strokeWidth="1.5" />
            <line x1="12.5" y1="12.5" x2="17" y2="17" stroke="#5f6368" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <input id="searchInput" type="text" placeholder="Search…" autoComplete="off" />
          <button id="searchClear" aria-label="Clear search">✕</button>
        </div>
        <div id="searchResults" />
        <div id="featurePanel">
          <img id="fpImage" alt="" />
          <div id="fpName" />
          <div className="fp-row"><span className="fp-label">Type</span><span id="fpType" /></div>
          <div className="fp-row"><span className="fp-label">Diameter</span><span id="fpDiameter" /></div>
          <div className="fp-row"><span className="fp-label">Origin</span><span id="fpOrigin" /></div>
          <div id="fpDesc" />
        </div>
        <div id="roverPanel" style={{ display: 'none' }}>
          <img id="rpImage" alt="" />
          <div id="rpRover" />
          <div className="fp-row"><span className="fp-label">Position</span><span id="rpSol" /></div>
          <div className="fp-row">
            <a id="rpLink" href="" target="_blank" rel="noopener" className="rover-link">View photos →</a>
          </div>
          <div id="rpDesc" />
        </div>
        <div id="roverPhotoPanel" style={{ display: 'none' }}>
          <img id="rphImage" alt="" />
          <div id="rphName" />
          <div className="fp-row"><span className="fp-label">Sol</span><span id="rphSol" /></div>
          <div className="fp-row"><span className="fp-label">Camera</span><span id="rphCamera" /></div>
          <div className="fp-row"><span className="fp-label">Latitude</span><span id="rphLat" /></div>
          <div className="fp-row"><span className="fp-label">Longitude</span><span id="rphLon" /></div>
          <div id="rphCaption" />
        </div>
        <div id="satellitePanel" style={{ display: 'none' }}>
          <img id="spImage" alt="" />
          <div id="spName" />
          <div className="fp-row"><span className="fp-label">Altitude</span><span id="spAlt" /></div>
          <div className="fp-row"><span className="fp-label">Period</span><span id="spPeriod" /></div>
          <div id="spDesc" />
        </div>
      </div>

      <button id="layersBtn" className="rp-card" aria-label="Toggle layers panel">
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 2L2 7l10 5 10-5-10-5z" stroke="#5f6368" strokeWidth="1.5" strokeLinejoin="round" />
          <path d="M2 12l10 5 10-5" stroke="#5f6368" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M2 17l10 5 10-5" stroke="#5f6368" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      <div id="layersPanel" className="rp-card" hidden>
        <div id="layersPanelHeader">
          <span>Layers</span>
          <button id="layersPanelClose" aria-label="Close">✕</button>
        </div>
        <div className="layers-section-title">Imagery</div>
        <label className="layer-item">
          <input type="radio" name="imagery" value="terraformed" />
          <span>Terraformed</span>
        </label>
        <label className="layer-item">
          <input type="radio" name="imagery" value="real" />
          <span>Real Mars</span>
        </label>
        <div className="layers-divider" />
        <label className="layer-item">
          <input type="checkbox" id="layerExag" />
          <span>Exaggerated topography</span>
        </label>
        <label className="layer-item">
          <input type="checkbox" id="layerContours" />
          <span>Topography lines</span>
        </label>
        <label className="layer-item">
          <input type="checkbox" id="layerGraticule" />
          <span>Lat/long grid</span>
        </label>
        <label className="layer-item">
          <input type="checkbox" id="layerLabels" />
          <span>Place names</span>
        </label>
        <label className="layer-item">
          <input type="checkbox" id="layerRovers" />
          <span>Rovers</span>
        </label>
        <label className="layer-item">
          <input type="checkbox" id="layerSatellites" />
          <span>Satellites</span>
        </label>
      </div>
    </>
  );
}
