// Pages loaded on demand. Listed here so "Hent til offline" can fetch them too.
import { extras } from './extras/registry';

export const lazyPages = {
  map: () => import('./pages/MapPage'),
  guide: () => import('./pages/GuidePage'),
  extra: () => import('./pages/ExtraPage'),
};

/** Everything loaded on demand, for "Hent til offline". */
export const allLazy = [...Object.values(lazyPages), ...Object.values(extras)];
