import { EXAGGERATION_SCALE } from './constants';

export interface AppState {
  exaggerated: boolean;
  exaggeration: number;
}

export const DEFAULT_STATE: AppState = {
  exaggerated: true,
  exaggeration: EXAGGERATION_SCALE,
};
