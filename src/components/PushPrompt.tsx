// «¿Te avisamos cuando te respondan?» (SPEC 15, wiki #205): once per device, after the first publication. On an
// iPhone without the app installed, «Sí, avísame» shows how to add it to the home screen first (InstallSteps).
import { useId, useState } from 'react';
import { enablePush, pushSupport } from '../push/device';
import { dismissPrompt, usePendingPrompt, type PublishedKind } from '../push/prompt';
import { BellIcon, CloseIcon } from './icons';
import { InstallSteps } from './InstallSteps';
import { errorMessage } from './messages';
import { afterSheetPop, Sheet } from './Sheet';
import './push-prompt.css';

const TITLE: Record<PublishedKind, string> = {
  question: '¿Te avisamos cuando te respondan?',
  answer: '¿Te avisamos cuando le sirva o te comenten?',
  sign: '¿Te avisamos cuando a alguien le sirva tu letrero?',
};

export function PushPrompt() {
  const kind = usePendingPrompt();
  const [steps, setSteps] = useState(false);
  if (steps) return <InstallSteps onClose={() => setSteps(false)} />;
  if (!kind) return null;
  return <PromptSheet kind={kind} onSteps={() => afterSheetPop(() => setSteps(true))} />;
}

function PromptSheet({ kind, onSteps }: { kind: PublishedKind; onSteps: () => void }) {
  const titleId = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <Sheet labelledBy={titleId} variant="bottom" onClose={dismissPrompt}>
      {(close) => {
        const accept = async () => {
          if (pushSupport() === 'ios-not-installed') {
            onSteps();
            close();
            return;
          }
          setBusy(true);
          setError(null);
          try {
            await enablePush();
            close();
          } catch (e) {
            setError(errorMessage(e));
          } finally {
            setBusy(false);
          }
        };
        return (
          <>
            <header className="sheet__bar">
              <h2 id={titleId} className="sheet__bar-title">{TITLE[kind]}</h2>
              <button type="button" className="icon-btn" aria-label="Cerrar" onClick={close}>
                <CloseIcon />
              </button>
            </header>
            <div className="sheet__body">
              <div className="sheet__content push-prompt">
                <p className="push-prompt__why">
                  <span className="push-prompt__glyph"><BellIcon size={22} /></span>
                  Te llega un aviso al celular, aunque la app esté cerrada. Lo cambias cuando quieras en Yo › Ajustes.
                </p>
                {error && <p className="field__error" role="alert">{error}</p>}
                <div className="push-prompt__actions">
                  <button type="button" className="btn btn--full" disabled={busy} onClick={() => void accept()}>
                    {busy ? 'Activando…' : 'Sí, avísame'}
                  </button>
                  <button type="button" className="btn btn--secondary btn--full" disabled={busy} onClick={close}>
                    Ahora no
                  </button>
                </div>
              </div>
            </div>
          </>
        );
      }}
    </Sheet>
  );
}
