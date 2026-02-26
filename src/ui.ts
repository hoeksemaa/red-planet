import type { AppState } from './state';
import type { LabelEntry } from './features/types';
import { EXAGGERATION_SCALE } from './constants';

export interface SearchResult {
  name: string;
  lon: number;
  lat: number;
  diameterKm: number;
}

export interface UICallbacks {
  onStateChange: (state: AppState) => void;
  onSearch: (query: string) => SearchResult[];
  onSelect: (result: SearchResult) => void;
}

export class UI {
  private state: AppState;
  private callbacks: UICallbacks;

  // Search elements
  private searchInput   = document.getElementById('searchInput') as HTMLInputElement;
  private searchClear   = document.getElementById('searchClear') as HTMLButtonElement;
  private searchResults = document.getElementById('searchResults') as HTMLDivElement;
  private featurePanel  = document.getElementById('featurePanel') as HTMLDivElement;

  // Layers elements
  private layersBtn        = document.getElementById('layersBtn') as HTMLButtonElement;
  private layersPanel      = document.getElementById('layersPanel') as HTMLDivElement;
  private layersPanelClose = document.getElementById('layersPanelClose') as HTMLButtonElement;
  private layerExag        = document.getElementById('layerExag') as HTMLInputElement;
  private layerContours    = document.getElementById('layerContours') as HTMLInputElement;
  private layerLabels      = document.getElementById('layerLabels') as HTMLInputElement;

  constructor(state: AppState, callbacks: UICallbacks) {
    this.state = state;
    this.callbacks = callbacks;

    this.initSearch();
    this.initLayersPanel();
  }

  // ── Search ──────────────────────────────────────────────────

  private initSearch(): void {
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
      this.hideFeatureInfo();
    });

    // Collapse on outside click
    document.addEventListener('click', (e) => {
      const wrap = document.getElementById('searchWrap') as HTMLElement;
      if (!wrap.contains(e.target as Node)) {
        this.hideResults();
      }
    });
  }

  private showResults(results: SearchResult[]): void {
    this.searchResults.innerHTML = '';
    if (results.length === 0) {
      this.searchResults.style.display = 'none';
      return;
    }
    for (const r of results) {
      const item = document.createElement('div');
      item.className = 'search-item';
      item.textContent = r.name;
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
  }

  showFeatureInfo(entry: LabelEntry): void {
    (document.getElementById('fpName') as HTMLElement).textContent = entry.name;
    (document.getElementById('fpType') as HTMLElement).textContent = entry.featureType;
    (document.getElementById('fpDiameter') as HTMLElement).textContent =
      `${entry.diameterKm.toFixed(1)} km`;
    (document.getElementById('fpOrigin') as HTMLElement).textContent = entry.origin;

    this.searchInput.value = entry.name;
    this.searchClear.style.display = 'block';
    this.hideResults();
    this.featurePanel.style.display = 'block';
  }

  hideFeatureInfo(): void {
    this.featurePanel.style.display = 'none';
  }

  // ── Layers panel ────────────────────────────────────────────

  private initLayersPanel(): void {
    this.layersBtn.addEventListener('click', () => {
      this.layersPanel.hidden = !this.layersPanel.hidden;
    });

    this.layersPanelClose.addEventListener('click', () => {
      this.layersPanel.hidden = true;
    });

    // Imagery radio
    const imageryRadios = document.querySelectorAll<HTMLInputElement>('input[name="imagery"]');
    for (const radio of imageryRadios) {
      radio.addEventListener('change', () => {
        this.state.imagery = radio.value as 'terraformed' | 'real';
        this.callbacks.onStateChange(this.state);
      });
    }

    // Feature layer checkboxes
    this.layerExag.addEventListener('change', () => {
      this.state.exaggerated = this.layerExag.checked;
      this.state.exaggeration = this.layerExag.checked ? EXAGGERATION_SCALE : 1;
      this.callbacks.onStateChange(this.state);
    });

    this.layerContours.addEventListener('change', () => {
      this.state.layers.contours = this.layerContours.checked;
      this.callbacks.onStateChange(this.state);
    });

    this.layerLabels.addEventListener('change', () => {
      this.state.layers.labels = this.layerLabels.checked;
      this.callbacks.onStateChange(this.state);
    });

    // Close panel on outside click
    document.addEventListener('click', (e) => {
      if (
        !this.layersPanel.hidden &&
        !this.layersPanel.contains(e.target as Node) &&
        !this.layersBtn.contains(e.target as Node)
      ) {
        this.layersPanel.hidden = true;
      }
    });
  }
}
