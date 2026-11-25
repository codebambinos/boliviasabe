// Ajustes › Notificaciones (SPEC 15, wiki #204, #205): whether this phone gets pushes, and the account's 4
// switches. The switches are saved to the account and work even without permission: they decide what is pushed.
import { useState } from 'react';
import { DEFAULT_NOTIF_PREFS, useNotifPrefs, useSetNotifPrefs, type NotifPrefs } from '../data';
import { enablePush, usePushStatus, type PushStatus } from '../push/device';
import { BellIcon, CheckIcon } from './icons';
import { InstallSteps } from './InstallSteps';
import { errorMessage } from './messages';
import './notification-settings.css';

const SWITCHES: { key: keyof NotifPrefs; label: string }[] = [
  { key: 'answers', label: 'Respuestas, comentarios y recordatorios' },
  { key: 'helpful', label: 'Me sirvió' },
  { key: 'contacts', label: 'Contactos' },
  { key: 'urgent', label: 'Urgentes en mi zona' },
];

/** «celular» on a phone, «navegador» on a computer (wiki #205, #228). */
const PHONE = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
const ON_TEXT = PHONE ? 'Activadas en este celular' : 'Activadas en este navegador';

const STATUS_TEXT: Record<Exclude<PushStatus, 'off'>, string> = {
  on: ON_TEXT,
  denied: PHONE ? 'Bloqueadas: actívalas en los ajustes del celular' : 'Bloqueadas: actívalas en los ajustes del navegador',
  'ios-not-installed': 'Primero agrega BoliviaSabe a tu pantalla de inicio',
  unsupported: 'Este navegador no permite notificaciones',
};

export function NotificationSettings() {
  const { status, refresh } = usePushStatus();
  const prefs = useNotifPrefs();
  const save = useSetNotifPrefs();
  const [enabling, setEnabling] = useState(false);
  const [enableError, setEnableError] = useState<string | null>(null);
  const [steps, setSteps] = useState(false);
  const values = prefs.data ?? DEFAULT_NOTIF_PREFS;

  const enable = async () => {
    setEnabling(true);
    setEnableError(null);
    try {
      await enablePush();
    } catch (error) {
      setEnableError(errorMessage(error));
    } finally {
      setEnabling(false);
      refresh();
    }
  };

  return (
    <fieldset className="setting notif">
      <legend className="setting__label">Notificaciones</legend>

      <div className="notif__status" aria-live="polite">
        {status === null ? (
          <span className="num-wait" aria-label="Cargando" />
        ) : status === 'off' ? (
          <button type="button" className="btn btn--small" disabled={enabling} onClick={() => void enable()}>
            <BellIcon size={18} /> {enabling ? 'Activando…' : 'Activar notificaciones'}
          </button>
        ) : status === 'ios-not-installed' ? (
          <>
            <p className="notif__line">
              <BellIcon size={18} />
              {STATUS_TEXT[status]}
            </p>
            <button type="button" className="btn btn--secondary btn--small" onClick={() => setSteps(true)}>
              Ver cómo
            </button>
          </>
        ) : (
          <p className={status === 'on' ? 'notif__line notif__line--on' : 'notif__line'}>
            {status === 'on' ? <CheckIcon size={18} /> : <BellIcon size={18} />}
            {STATUS_TEXT[status]}
          </p>
        )}
        {enableError && <p className="field__error" role="alert">{enableError}</p>}
      </div>

      <ul className="notif__switches">
        {SWITCHES.map(({ key, label }) => (
          <li key={key}>
            <label className="notif__switch">
              <span>{label}</span>
              <input
                type="checkbox"
                role="switch"
                checked={values[key]}
                disabled={prefs.isPending}
                onChange={(event) => save.mutate({ ...values, [key]: event.target.checked })}
              />
            </label>
          </li>
        ))}
      </ul>
      {save.error && <p className="field__error" role="alert">{errorMessage(save.error)}</p>}
      {prefs.isError && !prefs.data && <p className="field__error" role="alert">{errorMessage(prefs.error)}</p>}

      {steps && <InstallSteps onClose={() => setSteps(false)} />}
    </fieldset>
  );
}
