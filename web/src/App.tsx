import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router';
import Layout from './components/Layout';
import Status from './components/Status';
import { lazyPages } from './lazyPages';
import ChapterPage from './pages/ChapterPage';
import Glossary from './pages/Glossary';
import Home from './pages/Home';
import TimelinePage from './pages/TimelinePage';

// The map (Leaflet) and the guide are only fetched when opened, so the app starts faster.
const MapPage = lazy(lazyPages.map);
const GuidePage = lazy(lazyPages.guide);

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="tidslinje" element={<TimelinePage />} />
        <Route path="kort" element={<Suspense fallback={<Status />}><MapPage /></Suspense>} />
        <Route path="ordliste" element={<Glossary />} />
        <Route path="guide" element={<Suspense fallback={<Status />}><GuidePage /></Suspense>} />
      </Route>
      {/* A chapter is full screen: its own top bar and the player at the bottom. */}
      <Route path="kapitel/:id" element={<ChapterPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
