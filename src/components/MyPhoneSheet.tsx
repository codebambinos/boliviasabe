// Ajustes › «Mi celular» (SPEC 23, wiki #182, #215): add, change or delete the phone shared on «Pedir contacto».
// Guardar is off until the value changes and shows the spinner while it saves; Borrar deletes at once (no
// confirmation: the number is easy to type again). Saving an empty field also deletes. On an error the sheet stays
// open with what was typed.
import { useId, useState } from 'react';
import { useSetMyPhone } from '../data';
import { PhoneField, phoneError } from './ContactRequest';
import { CloseIcon } from './icons';
import { Sheet } from './Sheet';
import './upload-sign-sheet.css'; // .upload__spinner, the app's in-button loader

export type PhoneSaved = 'saved' | 'deleted';

type MyPhoneSheetProps = {
  /** The phone saved now, or null. */
  saved: string | null;
  /** Called once the change is saved, before the sheet leaves: which toast to show. */
  onDone: (result: PhoneSaved) => void;
  onClose: () => void;
};

export function MyPhoneSheet({ saved, onDone, onClose }: MyPhoneSheetProps) {
  const titleId = useId();
  const fieldId = useId();
  const save = useSetMyPhone();
  const [phone, setPhone] = useState(saved ?? '');
  // Which button is working, so only that one shows the spinner
  const [working, setWorking] = useState<'save' | 'delete' | null>(null);

  const changed = phone.trim() !== (saved ?? '');
  const busy = save.isPending;

  return (
    <Sheet labelledBy={titleId} variant="bottom" onClose={onClose} canClose={() => !busy}>
      {(close, forceClose) => {
        const run = (value: string | null, which: 'save' | 'delete') => {
          setWorking(which);
          save.mutate(value, {
            onSuccess: (result) => {
              onDone(result === null ? 'deleted' : 'saved');
              forceClose();
            },
            onSettled: () => setWorking(null),
          });
        };
        const spinner = <span className="upload__spinner" aria-hidden="true" />;
        return (
          <>
            <header className="sheet__bar">
              <h2 id={titleId} className="sheet__bar-title">Mi celular</h2>
              <button type="button" className="icon-btn" aria-label="Cerrar" onClick={close} disabled={busy}>
                <CloseIcon />
              </button>
            </header>
            <form
              className="phone-sheet"
              noValidate
              onSubmit={(event) => {
                event.preventDefault();
                if (changed && !busy) run(phone.trim() || null, phone.trim() ? 'save' : 'delete');
              }}
            >
              <div className="sheet__body">
                <div className="sheet__content phone-sheet__content">
                  <p className="phone-sheet__why">Lo compartimos solo cuando aceptas un pedido de contacto. Tu correo se comparte siempre.</p>
                  <PhoneField
                    id={fieldId}
                    value={phone}
                    onChange={(value) => {
                      setPhone(value);
                      if (save.isError) save.reset(); // the message goes away as soon as the person fixes it
                    }}
                  />
                  {save.isError && (
                    <p className="field__error" role="alert">{phoneError(save.error)}</p>
                  )}
                </div>
              </div>
              <div className="sheet__actions">
                {saved !== null && (
                  <button type="button" className="btn btn--secondary" disabled={busy} aria-busy={working === 'delete' || undefined} onClick={() => run(null, 'delete')}>
                    {working === 'delete' ? <>{spinner} Borrando…</> : 'Borrar'}
                  </button>
                )}
                <button
                  type="submit"
                  className={saved === null ? 'btn sheet__full phone-sheet__save' : 'btn phone-sheet__save'}
                  disabled={!changed || busy}
                  aria-busy={working === 'save' || undefined}
                >
                  {working === 'save' ? <>{spinner} Guardando…</> : 'Guardar'}
                </button>
              </div>
            </form>
          </>
        );
      }}
    </Sheet>
  );
}
