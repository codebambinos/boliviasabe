// Yo (wiki › flujo-final › 3 · Yo, SPEC 21). Guest: «¡Hola, vecino!» and the way in. Signed in, in this order on a
// phone (#157): profile → Movimientos → Mi cuenta de prueba → Mi actividad → Avisos (#216) → Ajustes. No Tilcho (#191).
// Ajustes is its own card (SPEC 23, src/components/SettingsCard.tsx); the Avisos sheet lives in the shell (SPEC 24).
import { useState } from 'react';
import { ActivityCard } from '../components/ActivityCard';
import { AvisosCard } from '../components/AvisosCard';
import { useOpenEmailSignIn } from '../components/AuthGate';
import { InstallRow } from '../components/InstallRow';
import { MovementsCard } from '../components/MovementsCard';
import { ProfileCard } from '../components/ProfileCard';
import { TestAccountCard } from '../components/TestAccountCard';
import { Toast } from '../components/Toast';
import { TuBarrioSheet } from '../components/TuBarrioSheet';
import { GoogleIcon, MailIcon } from '../components/icons';
import { privacyClick, SettingsCard } from '../components/SettingsCard';
import { useShell } from '../components/useShell';
import { useSession, useWallet } from '../data';
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
          <AvisosCard onOpen={shell.openAvisos} />
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
            <GoogleIcon /> {signingIn ? 'Iniciando sesión…' : 'Continuar con Google'}
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
