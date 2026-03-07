
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
  exaggeration: 100,
  imagery: 'real',
  layers: {
    contours: true,
    graticule: false,
    labels: false,
    rovers: false,
    satellites: false,
  },
};
