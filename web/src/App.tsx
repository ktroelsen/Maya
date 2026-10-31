import { Navigate, Route, Routes } from 'react-router';
import Layout from './components/Layout';
import ChapterPage from './pages/ChapterPage';
import Glossary from './pages/Glossary';
import Home from './pages/Home';
import MapPage from './pages/MapPage';
import TimelinePage from './pages/TimelinePage';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="tidslinje" element={<TimelinePage />} />
        <Route path="kort" element={<MapPage />} />
        <Route path="ordliste" element={<Glossary />} />
      </Route>
      {/* A chapter is full screen: its own top bar and the player at the bottom. */}
      <Route path="kapitel/:id" element={<ChapterPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
