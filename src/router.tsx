// Minimal router (SPEC 02): only what needs a real URL today. T12 adds the rest of the routes
// (wiki › técnico › Rutas) to this same router.
import { createBrowserRouter, Navigate } from 'react-router';
import { App } from './App';
import { setDirection } from './components/transition';
import { PrivacyPage } from './pages/PrivacyPage';

export const router = createBrowserRouter([
  { path: '/', element: <App /> },
  { path: '/privacidad', element: <PrivacyPage /> },
  { path: '*', element: <Navigate to="/" replace /> },
]);

// Browser Back / Forward: React Router replays the view transition in reverse; this sets which
// way the screen slides (DESIGN.md › Motion). Leaving /privacidad slides back, entering forward.
window.addEventListener('popstate', () => {
  setDirection(window.location.pathname === '/privacidad' ? 'forward' : 'back');
});
