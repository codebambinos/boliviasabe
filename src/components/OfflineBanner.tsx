// wiki › Transversal › Sin señal: banner «Sin conexión»; the app keeps showing what it last loaded.
import { useEffect, useState } from 'react';
import { CloudOffIcon } from './icons';

export function OfflineBanner() {
  const [offline, setOffline] = useState(() => typeof navigator !== 'undefined' && !navigator.onLine);
  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  return (
    <div className="offline" role="status" aria-live="polite">
      {offline && (
        <p className="offline__bar">
          <CloudOffIcon size={18} />
          <span>
            <strong>Sin conexión.</strong> Ves lo último que cargó.
          </span>
        </p>
      )}
    </div>
  );
}
