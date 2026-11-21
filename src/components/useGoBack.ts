// «Volver regresa a donde estabas» (wiki › Transversal): back one entry when the person came from
// inside the app. From a direct link (no in-app entry), or right after coming back from Google (the entry
// before is Google's page), it goes to `fallback` instead (Hoy by default).
import { useLocation, useNavigate } from 'react-router';
import { goWithTransition } from './transition';

export function useGoBack(fallback = '/'): () => void {
  const navigate = useNavigate();
  const location = useLocation();
  const firstOfVisit = location.key === 'default' || (location.state as { entry?: boolean } | null)?.entry === true;
  return () => {
    if (!firstOfVisit) navigate(-1);
    else goWithTransition((viewTransition) => navigate(fallback, { replace: true, viewTransition }), 'back');
  };
}
