// Yo (wiki › flujo-final › 3 · Yo, SPEC 21). Guest: «¡Hola, vecino!» and the way in. Signed in, in this order on a
// phone (#157): profile → Movimientos → Mi cuenta de prueba → Mi actividad → Ajustes. No Tilcho (#191).
// Avisos (T24) and the final Ajustes (T29) come later: the Ajustes card below stays as T26/T27 left it.
import { useState, type MouseEvent } from 'react';
import { ActivityCard } from '../components/ActivityCard';
import { useOpenEmailSignIn } from '../components/AuthGate';
import { InstallRow } from '../components/InstallRow';
import { MovementsCard } from '../components/MovementsCard';
import { NotificationSettings } from '../components/NotificationSettings';
import { ProfileCard } from '../components/ProfileCard';
import { TestAccountCard } from '../components/TestAccountCard';
import { Toast } from '../components/Toast';
import { TuBarrioSheet } from '../components/TuBarrioSheet';
import { ChevronRightIcon, EyeIcon, GoogleIcon, MailIcon, QuestionIcon } from '../components/icons';
import { withThemeReveal } from '../components/themeFade';
import { useShell } from '../components/useShell';
import { useSession, useSignOut, useWallet } from '../data';
import '../components/yo.css';

export function YoPage() {
  const shell = useShell();
  const session = useSession();
  const signedIn = session.data?.status === 'signed-in';
  const wallet = useWallet({ enabled: signedIn });
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState<number | null>(null);

  if (session.isPending) {
    return (
      <div className="card" aria-busy="true">
        <p className="sr-only" role="status">Cargando…</p>
        <div className="skeleton" style={{ height: '4rem' }} />
      </div>
    );
  }

  if (session.data?.status !== 'signed-in') {
    return <GuestYo onSignIn={shell.signInWithGoogle} signingIn={shell.signingIn} onAbout={shell.openAbout} onPrivacy={shell.openPrivacy} />;
  }

  const profile = session.data.profile;

  return (
    <>
      <h1 className="screen-title">Yo</h1>
      {/* Two columns on a wide frame; on a phone the wrappers step aside and CSS `order` gives the wiki order */}
      <div className="yo-grid">
        <div className="yo-col">
          <ProfileCard profile={profile} wallet={wallet.data} onEdit={() => setEditing(true)} />
          <TestAccountCard wallet={wallet.data} onRetry={() => wallet.refetch()} />
          <SettingsCard onAbout={shell.openAbout} onPrivacy={shell.openPrivacy} />
        </div>
        <div className="yo-col">
          <MovementsCard />
          <ActivityCard onAsk={() => shell.openAsk()} onUpload={shell.openUpload} />
        </div>
      </div>
      {editing && profile && (
        <TuBarrioSheet
          initial={{ fullName: profile.fullName, city: profile.city, zone: profile.zone }}
          onSaved={(input) => {
            // Hoy and ¿Alguien sabe? follow the profile's city
            if (input.city !== profile.city) shell.setCity(input.city);
            setSaved(Date.now());
          }}
          onClose={() => setEditing(false)}
        />
      )}
      {saved !== null && <Toast key={saved} message="Guardado" onDone={() => setSaved(null)} />}
    </>
  );
}

function GuestYo({
  onSignIn,
  signingIn,
  onAbout,
  onPrivacy,
}: {
  onSignIn: () => void;
  signingIn: boolean;
  onAbout: () => void;
  onPrivacy: () => void;
}) {
  const openEmailSignIn = useOpenEmailSignIn();
  return (
    <>
      <h1 className="screen-title">Yo</h1>
      <div className="card profile">
        <h2 className="profile__name">¡Hola, vecino!</h2>
        <p className="empty__text">
          Cuando un letrero o una respuesta tuya le sirve a alguien, ganas <strong>yapitas</strong>. Inicia sesión para guardarlas junto
          con tu actividad.
        </p>
        <div className="profile__actions">
          <button type="button" className="btn btn--secondary btn--full auth__google" disabled={signingIn} onClick={onSignIn}>
            <GoogleIcon /> {signingIn ? 'Entrando…' : 'Continuar con Google'}
          </button>
          <button
            type="button"
            className="btn btn--secondary btn--full"
            onClick={() => openEmailSignIn('Inicia sesión con tu correo y contraseña.', 'Inicia sesión en BoliviaSabe')}
          >
            <MailIcon size={20} /> Usar mi correo
          </button>
        </div>
      </div>
      <div className="card">
        <ul className="rows rows--links rows--flush">
          <InstallRow />
        </ul>
      </div>
      <LegalLinks onAbout={onAbout} onPrivacy={onPrivacy} />
    </>
  );
}

// ---------- Ajustes (as T26/T27 left it; T29 builds the final card) ----------

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

function SettingsCard({ onAbout, onPrivacy }: { onAbout: () => void; onPrivacy: () => void }) {
  const signOut = useSignOut();
  const [theme, setTheme] = useState<Theme>(readTheme);
  return (
    <div className="card yo-grid__settings">
      <h2 className="card__title">Ajustes</h2>
      <ul className="rows rows--links rows--flush">
        <InstallRow />
      </ul>
      <NotificationSettings />
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
      <LegalRows onAbout={onAbout} onPrivacy={onPrivacy} />
      <button type="button" className="link-btn link-btn--ink setting__signout" disabled={signOut.isPending} onClick={() => signOut.mutate()}>
        {signOut.isPending ? 'Cerrando sesión…' : 'Cerrar sesión'}
      </button>
    </div>
  );
}

/** A real link to /privacidad (copyable, opens in a new tab) that navigates in the app on a plain click. */
function privacyClick(onPrivacy: () => void) {
  return (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    onPrivacy();
  };
}

/** Acerca de · Privacidad under the guest card (wiki › Yo › Invitado). */
function LegalLinks({ onAbout, onPrivacy }: { onAbout: () => void; onPrivacy: () => void }) {
  return (
    <p className="legal-links">
      <button type="button" className="link-btn" onClick={onAbout}>Acerca de</button>
      <span aria-hidden="true">·</span>
      <a className="link-btn" href="/privacidad" onClick={privacyClick(onPrivacy)}>Privacidad</a>
    </p>
  );
}

/** Acerca de and Privacidad as rows in Ajustes. T29 keeps them when it builds the final card. */
function LegalRows({ onAbout, onPrivacy }: { onAbout: () => void; onPrivacy: () => void }) {
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
