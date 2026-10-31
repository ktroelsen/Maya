// Pages loaded on demand. Listed here so "Hent til offline" can fetch them too.
export const lazyPages = {
  map: () => import('./pages/MapPage'),
  guide: () => import('./pages/GuidePage'),
};
