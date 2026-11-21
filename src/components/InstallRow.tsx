// «Instalar la app» in Ajustes (SPEC 16, wiki #199). Android and Chrome: the browser's prompt. iPhone: the steps.
// Installed: «Ya la tienes instalada». Other browsers: where to open it. Shown to guests too.
import { useState } from 'react';
import { useInstall } from '../pwa/install';
import { CheckIcon, ChevronRightIcon, InstallIcon } from './icons';
import { InstallSteps } from './InstallSteps';

export function InstallRow() {
  const { platform, install } = useInstall();
  const [steps, setSteps] = useState(false);

  if (platform === 'installed' || platform === 'unavailable') {
    return (
      <li className="row__link row__link--static">
        {platform === 'installed' ? <CheckIcon size={20} /> : <InstallIcon size={20} />}
        <span className="row__main">
          {platform === 'installed' ? 'Ya la tienes instalada' : 'Instalar la app'}
          {platform === 'unavailable' && <span className="meta row__sub">Ábrela en Chrome o Safari para instalarla</span>}
        </span>
      </li>
    );
  }

  return (
    <li>
      <button type="button" className="row__link" onClick={() => (platform === 'ios' ? setSteps(true) : void install())}>
        <InstallIcon size={20} />
        <span className="row__main">
          Instalar la app
          <span className="meta row__sub">Ábrela desde tu pantalla de inicio, sin buscarla</span>
        </span>
        <ChevronRightIcon size={20} />
      </button>
      {steps && <InstallSteps onClose={() => setSteps(false)} />}
    </li>
  );
}
