
export interface AppState {
  exaggeration: number;
  imagery: 'terraformed' | 'real';
  layers: {
    contours: boolean;
    graticule: boolean;
    labels: boolean;
    rovers: boolean;
    satellites: boolean;
  };
}

export const DEFAULT_STATE: AppState = {
  exaggeration: 1, // perf: start at 1x so terrain swap-in (PERF-4) isn't jarring
  imagery: 'terraformed',
  layers: {
    contours: false,
    graticule: false,
    labels: true,
    rovers: true,
    satellites: false,
  },
};
