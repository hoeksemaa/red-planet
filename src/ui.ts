import type { AppState, LabelEntry } from './state';

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

  constructor(state: AppState, callbacks: UICallbacks) {
    this.state = state;
    this.callbacks = callbacks;

    this.initExagToggle();
    this.initSearch();
    this.initPanel();
  }

  private initExagToggle(): void {
    const btn = document.getElementById('exagToggle') as HTMLButtonElement;
    btn.addEventListener('click', () => {
      this.state.exaggerated = !this.state.exaggerated;
      this.state.exaggeration = this.state.exaggerated ? 100 : 1;
      btn.textContent = this.state.exaggerated ? 'True shape' : 'Exaggerated';
      this.callbacks.onStateChange(this.state);
    });
  }

  showFeatureInfo(entry: LabelEntry): void {
    (document.getElementById('fpName') as HTMLElement).textContent = entry.name;
    (document.getElementById('fpType') as HTMLElement).textContent = entry.featureType;
    (document.getElementById('fpDiameter') as HTMLElement).textContent =
      `${entry.diameterKm.toFixed(1)} km`;
    (document.getElementById('fpOrigin') as HTMLElement).textContent = entry.origin;
    (document.getElementById('featurePanel') as HTMLElement).style.display = 'block';
  }

  hideFeatureInfo(): void {
    (document.getElementById('featurePanel') as HTMLElement).style.display = 'none';
  }

  private initPanel(): void {
    document.addEventListener('click', (e) => {
      const panel = document.getElementById('featurePanel') as HTMLElement;
      if (!panel.contains(e.target as Node)) {
        panel.style.display = 'none';
      }
    });
  }

  private initSearch(): void {
    const searchInput = document.getElementById('searchInput') as HTMLInputElement;
    const searchResults = document.getElementById('searchResults') as HTMLDivElement;

    searchInput.addEventListener('input', () => {
      const matches = this.callbacks.onSearch(searchInput.value);
      searchResults.innerHTML = '';

      for (const match of matches) {
        const item = document.createElement('div');
        item.className = 'search-item';
        item.textContent = match.name;
        item.addEventListener('click', () => {
          this.callbacks.onSelect(match);
          searchInput.value = match.name;
          searchResults.innerHTML = '';
        });
        searchResults.appendChild(item);
      }
    });

    document.addEventListener('click', (e) => {
      if (!(document.getElementById('searchWrap') as HTMLElement).contains(e.target as Node)) {
        searchResults.innerHTML = '';
      }
    });
  }
}
