// «Volver regresa a donde estabas» (wiki › Transversal): back one entry when the person came from
// inside the app; from a direct link (no in-app entry) it goes to Hoy.
import { useLocation, useNavigate } from 'react-router';
import { goWithTransition } from './transition';

export function useGoBack(): () => void {
  const navigate = useNavigate();
  const location = useLocation();
  return () => {
    if (location.key !== 'default') navigate(-1);
    else goWithTransition((viewTransition) => navigate('/', { replace: true, viewTransition }), 'back');
  };
}
