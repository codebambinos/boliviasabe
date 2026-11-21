// «Agrega BoliviaSabe a tu pantalla de inicio» (SPEC 16, wiki #199): iPhone has no install prompt, so the app
// shows the three steps. The installed app does not share Safari's session, hence the note at the end.
// T27 opens the same sheet before asking for notifications on an iPhone.
import { useId } from 'react';
import { AddSquareIcon, CloseIcon, IosShareIcon } from './icons';
import { Sheet } from './Sheet';
import './install-steps.css';

export function InstallSteps({ onClose }: { onClose: () => void }) {
  const titleId = useId();
  return (
    <Sheet labelledBy={titleId} variant="bottom" onClose={onClose}>
      {(close) => (
        <>
          <header className="sheet__bar">
            <h2 id={titleId} className="sheet__bar-title">Agrega BoliviaSabe a tu pantalla de inicio</h2>
            <button type="button" className="icon-btn" aria-label="Cerrar" onClick={close}>
              <CloseIcon />
            </button>
          </header>
          <div className="sheet__body">
            <div className="sheet__content install">
              <ol className="install__steps">
                <li>
                  <span className="install__glyph"><IosShareIcon size={22} /></span>
                  <span>Toca <strong>Compartir</strong></span>
                </li>
                <li>
                  <span className="install__glyph"><AddSquareIcon size={22} /></span>
                  <span>Elige <strong>«Agregar a inicio»</strong></span>
                </li>
                <li>
                  <span className="install__glyph"><img src="/apple-touch-icon-180x180.png" alt="" width={28} height={28} /></span>
                  <span>Abre <strong>BoliviaSabe</strong> desde el ícono</span>
                </li>
              </ol>
              <p className="notice install__note">Después entra otra vez con tu cuenta.</p>
              <button type="button" className="btn btn--full" onClick={close}>Entendido</button>
            </div>
          </div>
        </>
      )}
    </Sheet>
  );
}
