import { EXAGGERATION_SCALE } from './constants';

export interface AppState {
  exaggerated: boolean;
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
  exaggerated: true,
  exaggeration: EXAGGERATION_SCALE,
  imagery: 'terraformed',
  layers: {
    contours: true,
    graticule: true,
    labels: true,
    rovers: true,
    satellites: true,
  },
};
