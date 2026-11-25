// Yo › Ajustes (SPEC 23, wiki › 3 · Yo › Ajustes, #215), in this order: Instalar la app · Notificaciones ·
// Mi celular · Tema · Acerca de · Privacidad · «Entraste como» + Cerrar sesión (wiki #227: which account this is,
// inside Ajustes so it never shows on the Yo card during a demo). «Cerrar sesión» is one tap (#152); without signal it
// says so under the button and changes nothing (#218, SPEC 25).
import { useState, type MouseEvent } from 'react';
import { useMyPhone, useSession, useSignOut } from '../data';
import { ChevronRightIcon, EyeIcon, PhoneIcon, QuestionIcon } from './icons';
import { InstallRow } from './InstallRow';
import { MyPhoneSheet, type PhoneSaved } from './MyPhoneSheet';
import { NotificationSettings } from './NotificationSettings';
import { withThemeReveal } from './themeFade';
import { errorMessage } from './messages';
import { Toast } from './Toast';

type SettingsCardProps = { onAbout: () => void; onPrivacy: () => void };

export function SettingsCard({ onAbout, onPrivacy }: SettingsCardProps) {
  const signOut = useSignOut();
  const session = useSession();
  const email = session.data?.status === 'signed-in' ? session.data.email : null;
  const myPhone = useMyPhone();
  const [editingPhone, setEditingPhone] = useState(false);
  const [toast, setToast] = useState<{ id: number; result: PhoneSaved } | null>(null);
  const phone = myPhone.data ?? null;

  return (
    <div className="card yo-grid__settings">
      <h2 className="card__title">Ajustes</h2>
      <ul className="rows rows--links rows--flush">
        <InstallRow />
      </ul>
      <NotificationSettings />
      <ul className="rows rows--links settings__phone">
        <li>
          <button type="button" className="row__link" onClick={() => setEditingPhone(true)} disabled={myPhone.isPending}>
            <PhoneIcon size={20} />
            <span className="row__main">
              Mi celular
              {/* key: the number cross-fades when it changes */}
              <span key={phone ?? '-'} className="meta row__sub yo-fade">
                {myPhone.isPending ? <span className="num-wait" aria-label="Cargando" /> : (phone ?? 'Sin agregar')}
              </span>
            </span>
            <ChevronRightIcon size={20} />
          </button>
        </li>
      </ul>
      <ThemeSetting />
      <LegalRows onAbout={onAbout} onPrivacy={onPrivacy} />
      {email && <p className="meta setting__account">Entraste como <span className="setting__email">{email}</span></p>}
      <button
        type="button"
        className="link-btn link-btn--ink setting__signout"
        disabled={signOut.isPending}
        onClick={() => {
          // The last message goes away as soon as the person tries again (#218)
          signOut.reset();
          signOut.mutate();
        }}
      >
        {signOut.isPending ? 'Cerrando sesión…' : 'Cerrar sesión'}
      </button>
      {signOut.error && (
        <p className="field__error setting__signout-error" role="alert">{errorMessage(signOut.error)}</p>
      )}
      {editingPhone && (
        <MyPhoneSheet
          saved={phone}
          onDone={(result) => setToast({ id: Date.now(), result })}
          onClose={() => setEditingPhone(false)}
        />
      )}
      {toast && <Toast key={toast.id} message={toast.result === 'saved' ? 'Guardado' : 'Celular borrado'} onDone={() => setToast(null)} />}
    </div>
  );
}

// ---------- Tema (wiki #201; switches on as a circle from the tapped option, SPEC 21) ----------

type Theme = 'dark' | 'light' | 'system';

function readTheme(): Theme {
  try {
    const value = localStorage.getItem('bs-theme');
    return value === 'light' || value === 'dark' ? value : 'system';
  } catch {
    return 'system';
  }
}

/** `from`: the center of the tapped option, where the new theme switches on. */
function applyTheme(theme: Theme, from: { x: number; y: number }) {
  try {
    localStorage.setItem('bs-theme', theme);
  } catch {
    /* private mode: applies for this visit only */
  }
  const root = document.documentElement;
  withThemeReveal(() => {
    if (theme === 'system') delete root.dataset.theme;
    else root.dataset.theme = theme;
  }, from);
  // The phone's status bar follows the ground
  const dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#151110' : '#f5f2ef');
}

function ThemeSetting() {
  const [theme, setTheme] = useState<Theme>(readTheme);
  return (
    <fieldset className="setting">
      <legend className="setting__label">Tema</legend>
      <div className="segmented">
        {(
          [
            ['system', 'Sistema'],
            ['light', 'Claro'],
            ['dark', 'Oscuro'],
          ] as const
        ).map(([value, label]) => (
          <label key={value}>
            <input
              type="radio"
              name="theme"
              value={value}
              checked={theme === value}
              onChange={(event) => {
                const box = (event.currentTarget.closest('label') ?? event.currentTarget).getBoundingClientRect();
                setTheme(value);
                applyTheme(value, { x: box.left + box.width / 2, y: box.top + box.height / 2 });
              }}
            />
            {label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

// ---------- Acerca de · Privacidad ----------

/** A real link to /privacidad (copyable, opens in a new tab) that navigates in the app on a plain click. */
export function privacyClick(onPrivacy: () => void) {
  return (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    onPrivacy();
  };
}

function LegalRows({ onAbout, onPrivacy }: SettingsCardProps) {
  return (
    <ul className="rows rows--links">
      <li>
        <button type="button" className="row__link" onClick={onAbout}>
          <QuestionIcon size={20} />
          <span className="row__main">Acerca de</span>
          <ChevronRightIcon size={20} />
        </button>
      </li>
      <li>
        <a className="row__link" href="/privacidad" onClick={privacyClick(onPrivacy)}>
          <EyeIcon size={20} />
          <span className="row__main">Privacidad</span>
          <ChevronRightIcon size={20} />
        </a>
      </li>
    </ul>
  );
}
