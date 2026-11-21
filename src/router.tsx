// Routes of the app (wiki › técnico › Rutas, SPEC 04): the three tabs share one shell layout;
// the details, Privacidad and the new password page are standalone pages.
import { createBrowserRouter, Navigate, Outlet, ScrollRestoration } from 'react-router';
import { ShellLayout } from './components/ShellLayout';
import { setDirection } from './components/transition';
import { NewPasswordPage } from './pages/NewPasswordPage';
import { HoyPage } from './pages/HoyPage';
import { PreguntasPage } from './pages/PreguntasPage';
import { PrivacyPage } from './pages/PrivacyPage';
import { QuestionDetailPage } from './pages/QuestionDetailPage';
import { SignDetailPage } from './pages/SignDetailPage';
import { YoPage } from './pages/YoPage';

/** Back / Forward return to the same scroll position; a new screen starts at the top. */
function Root() {
  return (
    <>
      <Outlet />
      <ScrollRestoration />
    </>
  );
}

export const router = createBrowserRouter([
  {
    element: <Root />,
    children: [
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
    ],
  },
]);

// Browser Back / Forward: React Router replays the view transition in reverse; this sets which
// way the screen slides (DESIGN.md › Motion). Going deeper (a tab → a page) slides forward, coming
// out slides back, and between tabs it follows their order.
const TAB_PATHS = ['/', '/preguntas', '/yo'];
const depth = (path: string) => (TAB_PATHS.includes(path) ? 0 : 1);

let previousPath = window.location.pathname;
router.subscribe((state) => {
  previousPath = state.location.pathname;
});

window.addEventListener('popstate', () => {
  const next = window.location.pathname;
  const deeper = depth(next) - depth(previousPath);
  const forward = deeper !== 0 ? deeper > 0 : TAB_PATHS.indexOf(next) > TAB_PATHS.indexOf(previousPath);
  setDirection(forward ? 'forward' : 'back');
});
