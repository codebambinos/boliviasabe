// TEMPORARY smoke screen of Yo (SPEC 01 + T11 + SPEC 02 links). T21 and T29 build the real one.
import { useState, type MouseEvent } from 'react';
import { useRequireAccount } from '../components/AuthGate';
import { InstallRow } from '../components/InstallRow';
import { ChevronRightIcon, ExternalIcon, EyeIcon, GoogleIcon, MailIcon, QuestionIcon } from '../components/icons';
import { timeAgo } from '../components/time';
import { withThemeFade } from '../components/themeFade';
import { useShell } from '../components/useShell';
import { Yapita } from '../components/Yapita';
import { useMovements, useSession, useSignOut, useWallet, type Movement } from '../data';

export function YoPage() {
  const shell = useShell();
  return <YoSample onSignIn={shell.signInWithGoogle} signingIn={shell.signingIn} onAbout={shell.openAbout} onPrivacy={shell.openPrivacy} />;
}

// Sample labels for the style sample; T21 takes the final wording from the wiki.
const REASON_LABEL: Record<Movement['reason'], string> = {
  bienvenida: 'Bienvenida',
  letrero: 'Subiste un letrero',
  'sirvio-l': 'Tu letrero sirvió',
  ayuda: 'Tu respuesta sirvió',
  cierre: 'Cerraste tu pregunta',
  urgente: 'Pregunta urgente',
  canje: 'Canje',
};

const CANJE_GOAL = 100;

type Theme = 'dark' | 'light' | 'system';

function readTheme(): Theme {
  try {
    const value = localStorage.getItem('bs-theme');
    return value === 'light' || value === 'system' ? value : 'dark';
  } catch {
    return 'dark';
  }
}

function applyTheme(theme: Theme) {
  try {
    localStorage.setItem('bs-theme', theme);
  } catch {
    /* private mode: applies for this visit only */
  }
  const root = document.documentElement;
  withThemeFade(() => {
    if (theme === 'system') delete root.dataset.theme;
    else root.dataset.theme = theme;
  });
  // The phone's status bar follows the ground
  const dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#151110' : '#f5f2ef');
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

function YoSample({
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
  const session = useSession();
  const signOut = useSignOut();
  const requireAccount = useRequireAccount();
  const signedIn = session.data?.status === 'signed-in';
  const wallet = useWallet({ enabled: signedIn });
  const movements = useMovements({ enabled: signedIn });
  const last = movements.data?.pages[0]?.items.slice(0, 5) ?? [];
  const [theme, setTheme] = useState<Theme>(readTheme);

  if (session.isPending) {
    return (
      <div className="card" aria-busy="true">
        <p className="sr-only" role="status">Cargando…</p>
        <div className="skeleton" style={{ height: '4rem' }} />
      </div>
    );
  }

  if (session.data?.status !== 'signed-in') {
    return (
      <>
        <h1 className="screen-title">Yo</h1>
        <div className="card profile">
          <img className="profile__tilcho" src="/tilcho/tilcho-saludo.svg" alt="" width={96} height={111} />
          <h2 className="profile__name">¡Hola, vecino!</h2>
          <p className="empty__text">
            Cuando un letrero o una respuesta tuya le sirve a alguien, ganas <strong>yapitas</strong>. Entra para guardarlas junto
            con tu actividad.
          </p>
          <div className="profile__actions">
            <button type="button" className="btn btn--secondary btn--full auth__google" disabled={signingIn} onClick={onSignIn}>
              <GoogleIcon /> {signingIn ? 'Entrando…' : 'Continuar con Google'}
            </button>
            <button
              type="button"
              className="btn btn--secondary btn--full"
              onClick={() => requireAccount('Entra con tu correo y contraseña.', () => undefined, 'Entra a BoliviaSabe')}
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

  const profile = session.data.profile;
  const balance = wallet.data?.balance ?? null;
  const progress = Math.min(100, Math.round(((balance ?? 0) / CANJE_GOAL) * 100));

  return (
    <>
      <h1 className="screen-title">Yo</h1>
      <div className="yo-grid">
        <div className="card profile yo-grid__profile">
          <div className="aguayo profile__stripe" />
          <img className="profile__tilcho" src="/tilcho/tilcho-saludo.svg" alt="" width={84} height={97} />
          <h2 className="profile__name">{profile?.displayName ?? 'Sin perfil'}</h2>
          <p className="meta">{profile?.city} · {profile?.zone}</p>
          <p className="profile__badge">
            <span className="tag">{profile?.badge}</span>
          </p>
          <div className="profile__balance">
            <Yapita size="lg" />
            <div>
              <p className="profile__amount num">{balance ?? <span className="num-wait" aria-label="Cargando" />}</p>
              <p className="meta">yapitas</p>
            </div>
          </div>
          <div
            className="progress"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={CANJE_GOAL}
            aria-valuenow={balance ?? 0}
            aria-label="Yapitas hacia el canje"
          >
            <span style={{ width: `${progress}%` }} />
          </div>
          <p className="meta profile__goal">
            {balance ?? 0} de {CANJE_GOAL} · Canje con negocios, próximamente
          </p>
          <p className="profile__why">Ganas yapitas cuando un letrero o una respuesta tuya le sirve a alguien.</p>
        </div>

        <div id="movimientos" className="card yo-grid__moves">
          <h2 id="movimientos-title" tabIndex={-1} className="card__title card__title--target">Movimientos</h2>
          {movements.isSuccess && last.length === 0 ? (
            <p className="empty__text">Gana yapitas subiendo letreros y ayudando.</p>
          ) : (
            <ul className="rows">
              {last.map((m) => (
                <li key={m.id}>
                  <Yapita />
                  <span className="row__main">
                    {REASON_LABEL[m.reason]}
                    <span className="meta row__sub">
                      {timeAgo(m.createdAt)}
                      {m.explorerUrl && m.txHash && (
                        <a className="row__record" href={m.explorerUrl} target="_blank" rel="noreferrer" aria-label={`Ver el registro público ${shortHash(m.txHash)}`}>
                          Ver registro
                          <ExternalIcon size={12} />
                        </a>
                      )}
                    </span>
                  </span>
                  <span className="row__end">
                    <span className="amount">{m.amount > 0 ? `+${m.amount}` : `−${Math.abs(m.amount)}`}</span>
                    <span className={m.status === 'confirmed' ? 'state' : m.status === 'pending' ? 'state state--pending' : 'state state--error'}>
                      {m.status === 'confirmed' ? 'Confirmado' : m.status === 'pending' ? 'Pendiente' : 'Error'}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="notice" style={{ marginTop: 'var(--s-3)', marginBottom: 0 }}>Red de pruebas, sin dinero real</p>
        </div>

        <div className="card yo-grid__account">
          <h2 className="card__title">Mi cuenta de prueba</h2>
          <p className="account__why">Cada yapita queda anotada en un registro público que nadie puede cambiar.</p>
          {wallet.data?.status === 'ready' && wallet.data.address ? (
            <>
              <p className="account__address num">{shortHash(wallet.data.address)}</p>
              <div className="account__actions">
                <CopyButton text={wallet.data.address} />
                <a className="btn btn--secondary btn--small" href={`${EXPLORER_ACCOUNT}${wallet.data.address}`} target="_blank" rel="noreferrer">
                  Ver mi registro público <ExternalIcon size={14} />
                </a>
              </div>
            </>
          ) : wallet.data?.status === 'error' ? (
            <>
              <p className="empty__text">Algo falló, intenta de nuevo</p>
              <button type="button" className="btn btn--secondary btn--small" onClick={() => wallet.refetch()}>Reintentar</button>
            </>
          ) : (
            <p className="empty__text" role="status">Preparando tu cuenta…</p>
          )}
        </div>

        <div className="card yo-grid__settings">
          <h2 className="card__title">Ajustes</h2>
          <ul className="rows rows--links rows--flush">
            <InstallRow />
          </ul>
          <fieldset className="setting">
            <legend className="setting__label">Tema</legend>
            <div className="segmented">
              {(
                [
                  ['dark', 'Oscuro'],
                  ['light', 'Claro'],
                  ['system', 'Sistema'],
                ] as const
              ).map(([value, label]) => (
                <label key={value}>
                  <input
                    type="radio"
                    name="theme"
                    value={value}
                    checked={theme === value}
                    onChange={() => {
                      setTheme(value);
                      applyTheme(value);
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
      </div>
    </>
  );
}

/** «GABC…XYZ9»: the start and end of a Stellar address or transaction hash. */
function shortHash(value: string): string {
  return value.length > 12 ? `${value.slice(0, 4)}…${value.slice(-4)}` : value;
}

const EXPLORER_ACCOUNT = 'https://stellar.expert/explorer/testnet/account/';

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="btn btn--secondary btn--small"
      onClick={() =>
        navigator.clipboard?.writeText(text).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1800);
        })
      }
    >
      <span aria-live="polite">{copied ? 'Copiado' : 'Copiar'}</span>
    </button>
  );
}
