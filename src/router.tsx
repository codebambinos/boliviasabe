// Minimal router (SPEC 02): only what needs a real URL today. T12 adds the rest of the routes
// (wiki › técnico › Rutas) to this same router.
import { createBrowserRouter, Navigate } from 'react-router';
import { HoyRoute, PreguntasRoute, YoRoute } from './App';
import { ShellLayout } from './components/ShellLayout';
import { setDirection } from './components/transition';
import { NewPasswordPage } from './pages/NewPasswordPage';
import { PrivacyPage } from './pages/PrivacyPage';
import { QuestionDetailPage } from './pages/QuestionDetailPage';
import { SignDetailPage } from './pages/SignDetailPage';

export const router = createBrowserRouter([
  {
    element: <ShellLayout />,
    children: [
      { path: '/', element: <HoyRoute /> },
      { path: '/preguntas', element: <PreguntasRoute /> },
      { path: '/yo', element: <YoRoute /> },
    ],
  },
  { path: '/l/:id', element: <SignDetailPage /> },
  { path: '/p/:id', element: <QuestionDetailPage /> },
  { path: '/privacidad', element: <PrivacyPage /> },
  { path: '/nueva-contrasena', element: <NewPasswordPage /> },
  { path: '*', element: <Navigate to="/" replace /> },
]);

// Browser Back / Forward: React Router replays the view transition in reverse; this sets which
// way the screen slides (DESIGN.md › Motion). Leaving /privacidad slides back, entering forward.
window.addEventListener('popstate', () => {
  setDirection(window.location.pathname === '/privacidad' ? 'forward' : 'back');
});
