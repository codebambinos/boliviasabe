// wiki › Transversal › Sin señal: banner «Sin conexión»; the app keeps showing what it last loaded.
// It slides down from under the top bar when the connection drops and back up when it returns, and the space it takes
// grows and shrinks with it, so the page never jumps (SPEC 28, A4). Already offline on load: it is just there.
import { useEffect, useState } from 'react';
import { CloudOffIcon } from './icons';
import { useChangeTick } from './motion';
import { EXIT_MS } from './Sheet';

export function OfflineBanner() {
  const [offline, setOffline] = useState(() => typeof navigator !== 'undefined' && !navigator.onLine);
  // The text stays while the bar leaves, then goes
  const [present, setPresent] = useState(offline);
  const { tick } = useChangeTick(offline);

  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  useEffect(() => {
    if (offline) {
      setPresent(true);
      return;
    }
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const gone = window.setTimeout(() => setPresent(false), reduced ? 0 : EXIT_MS * 2);
    return () => window.clearTimeout(gone);
  }, [offline]);

  return (
    <div
      className={tick > 0 ? 'offline offline--animate' : 'offline'}
      data-shown={offline || undefined}
      role="status"
      aria-live="polite"
    >
      <div className="offline__clip">
        {(offline || present) && (
          <p className="offline__bar">
            <CloudOffIcon size={18} />
            <span>
              <strong>Sin conexión.</strong> Ves lo último que cargó.
            </span>
          </p>
        )}
      </div>
    </div>
  );
}
