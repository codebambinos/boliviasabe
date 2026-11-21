// Minimal router (SPEC 02): only what needs a real URL today. T12 adds the rest of the routes
// (wiki › técnico › Rutas) to this same router.
import { createBrowserRouter, Navigate } from 'react-router';
import { ShellLayout } from './components/ShellLayout';
import { setDirection } from './components/transition';
import { NewPasswordPage } from './pages/NewPasswordPage';
import { HoyPage } from './pages/HoyPage';
import { PreguntasPage } from './pages/PreguntasPage';
import { PrivacyPage } from './pages/PrivacyPage';
import { QuestionDetailPage } from './pages/QuestionDetailPage';
import { SignDetailPage } from './pages/SignDetailPage';
import { YoPage } from './pages/YoPage';

export const router = createBrowserRouter([
  {
    element: <ShellLayout />,
    children: [
      { path: '/', element: <HoyPage /> },
      { path: '/preguntas', element: <PreguntasPage /> },
      { path: '/yo', element: <YoPage /> },
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
