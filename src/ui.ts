import type { AppState } from './state';
import type { FeatureInfo, UnifiedSearchResult } from './features/types';
import { type RoverPinEntry, type RoverPhotoEntry, ROVER_META } from './features/rovers';
import { PLACE_META } from './features/place-meta';
import type { SatelliteEntry } from './features/satellites';
import { EXAGGERATION_SCALE } from './constants';

export interface UICallbacks {
  onStateChange: (state: AppState) => void;
  onSearch: (query: string) => UnifiedSearchResult[];
  onSelect: (result: UnifiedSearchResult) => void;
}

function roverGalleryUrl(id: string, sol: number | null): string {
  if (id === 'perseverance') {
    const base = 'https://mars.nasa.gov/mars2020/multimedia/raw-images/';
    return sol !== null ? `${base}?order=sol+asc&per_page=25&page=0&feed=raw_images&mission=mars2020&condition_2=sol%3Aeq%3A${sol}` : base;
  }
  if (id === 'curiosity') {
    const base = 'https://mars.nasa.gov/msl/multimedia/raw-images/';
    return sol !== null ? `${base}?order=sol+asc&per_page=25&page=0&feed=raw_images&mission=msl&condition_2=sol%3Aeq%3A${sol}` : base;
  }
  return '#';
}

export class UI {
  private state: AppState;
  private callbacks: UICallbacks;
  private documentListeners = new AbortController();

  // Search elements
  private searchInput   = document.getElementById('searchInput') as HTMLInputElement;
  private searchClear   = document.getElementById('searchClear') as HTMLButtonElement;
  private searchResults = document.getElementById('searchResults') as HTMLDivElement;
  private featurePanel  = document.getElementById('featurePanel') as HTMLDivElement;

  // Layers elements
  private layersBtn           = document.getElementById('layersBtn') as HTMLButtonElement;
  private layersPanel         = document.getElementById('layersPanel') as HTMLDivElement;
  private layersPanelClose    = document.getElementById('layersPanelClose') as HTMLButtonElement;
  private layerBtnTerraformed = document.getElementById('layerBtnTerraformed') as HTMLButtonElement;
  private layerBtnReal        = document.getElementById('layerBtnReal') as HTMLButtonElement;
  private layerBtnExag        = document.getElementById('layerBtnExag') as HTMLButtonElement;
  private layerBtnContours    = document.getElementById('layerBtnContours') as HTMLButtonElement;
  private layerBtnLabels      = document.getElementById('layerBtnLabels') as HTMLButtonElement;
  private layerBtnRovers      = document.getElementById('layerBtnRovers') as HTMLButtonElement;
  private layerBtnGraticule   = document.getElementById('layerBtnGraticule') as HTMLButtonElement;
  private layerBtnSatellites  = document.getElementById('layerBtnSatellites') as HTMLButtonElement;

  // Keyboard nav state
  private activeIndex = -1;
  private currentResults: UnifiedSearchResult[] = [];

  // Rover info panel
  private roverPanel = document.getElementById('roverPanel') as HTMLDivElement;

  // Rover photo panel
  private roverPhotoPanel = document.getElementById('roverPhotoPanel') as HTMLDivElement;

  // Satellite info panel
  private satellitePanel = document.getElementById('satellitePanel') as HTMLDivElement;

  constructor(state: AppState, callbacks: UICallbacks) {
    this.state = state;
    this.callbacks = callbacks;

    this.initSearch();
    this.initLayersPanel();
  }

  // ── Search ──────────────────────────────────────────────────

  private searchOverlay = document.getElementById('searchOverlay') as HTMLDivElement;

  private showOverlay(): void {
    this.searchOverlay.classList.add('active');
  }

  private hideOverlay(): void {
    this.searchOverlay.classList.remove('active');
  }

  private initSearch(): void {
    const SEARCH_HINTS = [
      'Rover',
      'Satellite',
      'Olympus Mons',
      'Valles Marineris',
      'Hellas Planitia',
      'Noctis Labyrinthus',
      'Planum Boreum',
      'Kasei Valles',
      'Cerberus Fossae',
      'Jezero',
      'Curiosity',
      'Perseverance',
      'Spirit',
      'MAVEN',
      'Mars Express',
      'Hope',
    ];
    const hint = SEARCH_HINTS[Math.floor(Math.random() * SEARCH_HINTS.length)];
    this.searchInput.placeholder = `Search for ${hint}…`;

    this.searchInput.addEventListener('focus', () => {
      this.showOverlay();
    });

    this.searchInput.addEventListener('input', () => {
      const q = this.searchInput.value;
      this.searchClear.style.display = q ? 'block' : 'none';

      if (q) {
        this.showResults(this.callbacks.onSearch(q));
        this.hideFeatureInfo();
      } else {
        this.hideResults();
        this.hideFeatureInfo();
      }
    });

    this.searchClear.addEventListener('click', () => {
      this.searchInput.value = '';
      this.searchClear.style.display = 'none';
      this.hideResults();
      this.hideOverlay();
      this.hideFeatureInfo();
      this.hideRoverInfo();
      this.hideRoverPhotoInfo();
      this.hideSatelliteInfo();
    });

    // Keyboard navigation
    this.searchInput.addEventListener('keydown', (e) => {
      const items = this.searchResults.querySelectorAll<HTMLElement>('.search-item');
      if (!items.length) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        this.activeIndex = (this.activeIndex + 1) % items.length;
        this.updateHighlight(items);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        this.activeIndex = (this.activeIndex - 1 + items.length) % items.length;
        this.updateHighlight(items);
      } else if (e.key === 'Enter' && this.activeIndex >= 0) {
        e.preventDefault();
        const r = this.currentResults[this.activeIndex];
        this.searchInput.value = r.name;
        this.hideResults();
        this.callbacks.onSelect(r);
      } else if (e.key === 'Escape') {
        this.hideResults();
        this.hideOverlay();
        this.searchInput.blur();
      }
    });

    // Collapse on outside click (overlay counts as outside)
    document.addEventListener('click', (e) => {
      const wrap = document.getElementById('searchWrap') as HTMLElement;
      if (!wrap.contains(e.target as Node)) {
        this.hideResults();
        this.hideOverlay();
      }
    }, { signal: this.documentListeners.signal });
  }

  private showResults(results: UnifiedSearchResult[]): void {
    this.searchResults.innerHTML = '';
    this.activeIndex = -1;
    this.currentResults = results;
    if (results.length === 0) {
      this.searchResults.style.display = 'none';
      return;
    }
    for (const r of results) {
      const item = document.createElement('div');
      item.className = 'search-item';

      const badge = document.createElement('span');
      badge.className = `search-badge search-badge--${r.kind}`;
      badge.textContent = r.kind === 'location' ? 'Place'
                        : r.kind === 'rover' ? 'Rover' : 'Satellite';
      item.appendChild(badge);

      const thumbUrl =
        r.kind === 'rover' ? (ROVER_META[r.id]?.imageUrl ?? '')
        : r.kind === 'satellite' ? r.imageUrl
        : (PLACE_META[r.name]?.imageUrl ?? '');
      if (thumbUrl) {
        const thumb = document.createElement('img');
        thumb.className = 'search-thumb';
        thumb.src = thumbUrl;
        thumb.alt = '';
        item.appendChild(thumb);
      }

      const name = document.createElement('span');
      name.textContent = r.name;
      item.appendChild(name);

      if (r.kind === 'rover' || r.kind === 'satellite') {
        const bar = document.createElement('span');
        bar.className = 'search-color-bar';
        bar.style.backgroundColor = r.color;
        item.appendChild(bar);
      }

      item.addEventListener('click', () => {
        this.searchInput.value = r.name;
        this.hideResults();
        this.callbacks.onSelect(r);
      });
      this.searchResults.appendChild(item);
    }
    this.searchResults.style.display = 'block';
  }

  private hideResults(): void {
    this.searchResults.style.display = 'none';
    this.searchResults.innerHTML = '';
    this.activeIndex = -1;
    this.currentResults = [];
  }

  private updateHighlight(items: NodeListOf<HTMLElement>): void {
    for (let i = 0; i < items.length; i++) {
      items[i].classList.toggle('search-item--active', i === this.activeIndex);
    }
    items[this.activeIndex]?.scrollIntoView({ block: 'nearest' });
  }

  showFeatureInfo(entry: FeatureInfo): void {
    const meta = PLACE_META[entry.name];
    const img = document.getElementById('fpImage') as HTMLImageElement;
    if (meta?.imageUrl) {
      img.src = meta.imageUrl;
      img.alt = entry.name;
      img.style.display = '';
    } else {
      img.style.display = 'none';
    }
    const nameEl = document.getElementById('fpName') as HTMLElement;
    nameEl.textContent = '';
    const badge = document.createElement('span');
    badge.className = 'search-badge search-badge--location';
    badge.textContent = 'Place';
    nameEl.appendChild(badge);
    nameEl.appendChild(document.createTextNode(entry.name));
    (document.getElementById('fpType') as HTMLElement).textContent = entry.featureType;
    (document.getElementById('fpDiameter') as HTMLElement).textContent =
      `${entry.diameterKm.toFixed(1)} km`;
    (document.getElementById('fpOrigin') as HTMLElement).textContent = entry.origin;
    (document.getElementById('fpDesc') as HTMLElement).textContent =
      meta?.description ?? '';

    this.searchInput.value = entry.name;
    this.searchClear.style.display = 'block';
    this.hideResults();
    this.hideOverlay();
    this.hideRoverInfo();
    this.hideRoverPhotoInfo();
    this.hideSatelliteInfo();
    this.featurePanel.style.display = 'block';
  }

  hideFeatureInfo(): void {
    this.featurePanel.style.display = 'none';
  }

  showRoverInfo(entry: RoverPinEntry): void {
    const meta = ROVER_META[entry.id];
    const img = document.getElementById('rpImage') as HTMLImageElement;
    if (meta?.imageUrl) {
      img.src = meta.imageUrl;
      img.alt = entry.rover;
      img.style.display = '';
    } else {
      img.style.display = 'none';
    }
    const nameEl = document.getElementById('rpRover') as HTMLElement;
    nameEl.textContent = '';
    const badge = document.createElement('span');
    badge.className = 'search-badge search-badge--rover';
    badge.textContent = 'Rover';
    nameEl.appendChild(badge);
    nameEl.appendChild(document.createTextNode(entry.rover));
    const dot = document.createElement('span');
    dot.className = 'search-color-bar';
    dot.style.backgroundColor = entry.color;
    nameEl.appendChild(dot);
    (document.getElementById('rpSol') as HTMLElement).textContent =
      entry.sol !== null ? `Sol ${entry.sol}` : '—';
    const link = document.getElementById('rpLink') as HTMLAnchorElement;
    link.href = roverGalleryUrl(entry.id, entry.sol);
    (document.getElementById('rpDesc') as HTMLElement).textContent =
      meta?.description ?? '';
    this.hideFeatureInfo();
    this.hideOverlay();
    this.hideRoverPhotoInfo();
    this.hideSatelliteInfo();
    this.roverPanel.style.display = 'block';
  }

  hideRoverInfo(): void {
    this.roverPanel.style.display = 'none';
  }

  showSatelliteInfo(entry: SatelliteEntry): void {
    const img = document.getElementById('spImage') as HTMLImageElement;
    img.src = entry.imageUrl;
    img.alt = entry.name;
    const nameEl = document.getElementById('spName') as HTMLElement;
    nameEl.textContent = '';
    const badge = document.createElement('span');
    badge.className = 'search-badge search-badge--satellite';
    badge.textContent = 'Satellite';
    nameEl.appendChild(badge);
    nameEl.appendChild(document.createTextNode(entry.name));
    const dot = document.createElement('span');
    dot.className = 'search-color-bar';
    dot.style.backgroundColor = entry.color;
    nameEl.appendChild(dot);
    (document.getElementById('spAlt') as HTMLElement).textContent = `${entry.altitudeKm.toLocaleString()} km`;
    (document.getElementById('spPeriod') as HTMLElement).textContent =
      entry.periodMinutes >= 120
        ? `${(entry.periodMinutes / 60).toFixed(1)} hr`
        : `${entry.periodMinutes} min`;
    (document.getElementById('spDesc') as HTMLElement).textContent = entry.description;
    this.hideFeatureInfo();
    this.hideOverlay();
    this.hideRoverInfo();
    this.hideRoverPhotoInfo();
    this.satellitePanel.style.display = 'block';
  }

  hideSatelliteInfo(): void {
    this.satellitePanel.style.display = 'none';
  }

  showRoverPhotoInfo(entry: RoverPhotoEntry): void {
    const img = document.getElementById('rphImage') as HTMLImageElement;
    img.style.maxHeight = '';
    img.style.objectFit = '';
    img.onload = () => {
      if (img.naturalWidth / img.naturalHeight > 2.5) {
        img.style.maxHeight = 'none';
        img.style.objectFit = 'contain';
      }
    };
    img.src = entry.imageUrl;
    img.alt = entry.caption;

    const nameEl = document.getElementById('rphName') as HTMLElement;
    nameEl.textContent = '';
    const badge = document.createElement('span');
    badge.className = 'search-badge search-badge--rover';
    badge.textContent = 'Photo';
    nameEl.appendChild(badge);
    nameEl.appendChild(document.createTextNode(entry.rover));

    (document.getElementById('rphSol') as HTMLElement).textContent = `Sol ${entry.sol}`;
    (document.getElementById('rphCamera') as HTMLElement).textContent = entry.camera;
    const lat = entry.lat;
    const lon = entry.lon;
    (document.getElementById('rphLat') as HTMLElement).textContent =
      lat === 0 ? '0°' : lat > 0 ? `${lat.toFixed(4)}°N` : `${(-lat).toFixed(4)}°S`;
    (document.getElementById('rphLon') as HTMLElement).textContent =
      lon === 0 ? '0°' : lon === 180 ? '180°' : `${lon.toFixed(4)}°E`;
    (document.getElementById('rphCaption') as HTMLElement).textContent = entry.caption;

    this.hideFeatureInfo();
    this.hideOverlay();
    this.hideRoverInfo();
    this.hideSatelliteInfo();
    this.roverPhotoPanel.style.display = 'block';
  }

  hideRoverPhotoInfo(): void {
    this.roverPhotoPanel.style.display = 'none';
  }

  // ── Layers panel ────────────────────────────────────────────

  private initLayersPanel(): void {
    this.layersBtn.addEventListener('click', () => {
      this.layersPanel.classList.toggle('is-open');
    });

    this.layersPanelClose.addEventListener('click', () => {
      this.layersPanel.classList.remove('is-open');
    });

    // Imagery buttons (mutually exclusive)
    const setImagery = (value: 'terraformed' | 'real') => {
      this.state.imagery = value;
      this.layerBtnTerraformed.classList.toggle('layer-btn--active', value === 'terraformed');
      this.layerBtnReal.classList.toggle('layer-btn--active', value === 'real');
      this.callbacks.onStateChange(this.state);
    };
    this.layerBtnTerraformed.addEventListener('click', () => setImagery('terraformed'));
    this.layerBtnReal.addEventListener('click', () => setImagery('real'));

    // Feature layer buttons (toggleable)
    const makeToggle = (
      btn: HTMLButtonElement,
      get: () => boolean,
      set: (v: boolean) => void,
    ) => {
      btn.addEventListener('click', () => {
        set(!get());
        btn.classList.toggle('layer-btn--active', get());
        this.callbacks.onStateChange(this.state);
      });
    };
    makeToggle(this.layerBtnExag,
      () => this.state.exaggeration !== 1,
      (v) => { this.state.exaggeration = v ? EXAGGERATION_SCALE : 1; });
    makeToggle(this.layerBtnContours,
      () => this.state.layers.contours,
      (v) => { this.state.layers.contours = v; });
    makeToggle(this.layerBtnLabels,
      () => this.state.layers.labels,
      (v) => { this.state.layers.labels = v; });
    makeToggle(this.layerBtnRovers,
      () => this.state.layers.rovers,
      (v) => { this.state.layers.rovers = v; });
    makeToggle(this.layerBtnGraticule,
      () => this.state.layers.graticule,
      (v) => { this.state.layers.graticule = v; });
    makeToggle(this.layerBtnSatellites,
      () => this.state.layers.satellites,
      (v) => { this.state.layers.satellites = v; });

    // Close panel on outside click
    document.addEventListener('click', (e) => {
      if (
        this.layersPanel.classList.contains('is-open') &&
        !this.layersPanel.contains(e.target as Node) &&
        !this.layersBtn.contains(e.target as Node)
      ) {
        this.layersPanel.classList.remove('is-open');
      }
    }, { signal: this.documentListeners.signal });

    // Sync DOM to initial state — DEFAULT_STATE is the single source of truth
    this.layerBtnTerraformed.classList.toggle('layer-btn--active', this.state.imagery === 'terraformed');
    this.layerBtnReal.classList.toggle('layer-btn--active', this.state.imagery === 'real');
    this.layerBtnExag.classList.toggle('layer-btn--active', this.state.exaggeration !== 1);
    this.layerBtnContours.classList.toggle('layer-btn--active', this.state.layers.contours);
    this.layerBtnLabels.classList.toggle('layer-btn--active', this.state.layers.labels);
    this.layerBtnRovers.classList.toggle('layer-btn--active', this.state.layers.rovers);
    this.layerBtnGraticule.classList.toggle('layer-btn--active', this.state.layers.graticule);
    this.layerBtnSatellites.classList.toggle('layer-btn--active', this.state.layers.satellites);
  }

  destroy(): void {
    this.documentListeners.abort();
  }
}
