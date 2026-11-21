// The app frame for the tab routes (/, /preguntas, /yo): mounted once, so the city and the sheets
// survive a tab change. The tab comes from the URL; pages render in the <Outlet /> (SPEC 04).
import { useEffect, useId, useRef, useState } from 'react';
import { Outlet, useLocation, useNavigate, useSearchParams } from 'react-router';
import { DEFAULT_CITY, fetchSign, useSession, useSignInWithGoogle, useToggleSaved, useWallet, type City, type Id, type Sign } from '../data';
import { AboutSheet } from './AboutSheet';
import { QuestionDetail } from './QuestionDetail';
import { AppShell, type Tab } from './AppShell';
import { AuthGate, useOpenPasswordRecovery, useRegisterPendingHandlers, useRequireAccount } from './AuthGate';
import { CloseIcon } from './icons';
import { Sheet } from './Sheet';
import { SignSheet } from './SignSheet';
import { Toast } from './Toast';
import { goWithTransition } from './transition';
import { UploadSignSheet } from './UploadSignSheet';
import { Yapita } from './Yapita';
import type { ShellContext } from './useShell';

const PATH: Record<Tab, string> = { hoy: '/', preguntas: '/preguntas', yo: '/yo' };
const ORDER: Tab[] = ['hoy', 'preguntas', 'yo'];

const tabOf = (pathname: string): Tab => (pathname === PATH.preguntas ? 'preguntas' : pathname === PATH.yo ? 'yo' : 'hoy');

export function ShellLayout() {
  return (
    <AuthGate>
      <Shell />
    </AuthGate>
  );
}

function Shell() {
  const location = useLocation();
  const navigate = useNavigate();
  const tab = tabOf(location.pathname);
  const [searchParams, setSearchParams] = useSearchParams();
  const [about, setAbout] = useState(false);
  const [city, setCity] = useState<City>(DEFAULT_CITY);
  const [selected, setSelected] = useState<Sign | null>(null);
  // «Me sirvió» / «No me sirvió» coming back from Google: the sheet opens and sends the vote itself
  const [resumeVote, setResumeVote] = useState<'helpful' | 'not_helpful' | null>(null);
  const [avisos, setAvisos] = useState(false);
  const [searchHidden, setSearchHidden] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState<{ id: number; rewarded: boolean } | null>(null);
  const [freshSignId, setFreshSignId] = useState<Id | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const session = useSession();
  const signedIn = session.data?.status === 'signed-in';
  const wallet = useWallet({ enabled: signedIn });
  const toggleSaved = useToggleSaved();
  const requireAccount = useRequireAccount();
  const openRecovery = useOpenPasswordRecovery();
  const signIn = useSignInWithGoogle();

  // «Pedir otro» from /nueva-contrasena: open «¿La olvidaste?» once and drop the flag from history
  useEffect(() => {
    if ((location.state as { forgotPassword?: boolean } | null)?.forgotPassword) {
      openRecovery();
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.state, location.pathname, navigate, openRecovery]);

  const onToggleSave = (sign: Sign) =>
    requireAccount(
      'Así guardas este letrero para verlo después.',
      () => toggleSaved.mutate({ kind: 'sign', id: sign.id }),
      undefined,
      { kind: 'save-sign', id: sign.id },
    );

  // What each saved action does once the person is back from Google (SPEC 07)
  useRegisterPendingHandlers({
    'save-sign': ({ id }) => toggleSaved.mutate({ kind: 'sign', id }),
    'vote-sign': async ({ id, value }) => {
      const sign = await fetchSign(id);
      setResumeVote(value);
      setSelected(sign);
    },
    'save-question': ({ id }) => toggleSaved.mutate({ kind: 'question', id }),
    'save-answer': ({ id }) => toggleSaved.mutate({ kind: 'answer', id }),
    'open-new-sign': () => setUploading(true),
  });

  // Lupa (wiki #140): only while Hoy's own search is off screen
  useEffect(() => {
    const input = searchRef.current;
    if (tab !== 'hoy' || !input) {
      setSearchHidden(false);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => setSearchHidden(!entry.isIntersecting), {
      rootMargin: '-56px 0px 0px 0px',
    });
    observer.observe(input);
    return () => observer.disconnect();
  }, [tab]);

  // A tab is a route: the screen change is a view transition that slides toward the tab's side
  // (ScrollRestoration lands it at the top)
  const goToTab = (next: Tab) => {
    const direction = ORDER.indexOf(next) > ORDER.indexOf(tab) ? 'forward' : 'back';
    goWithTransition((viewTransition) => navigate(PATH[next], { viewTransition }), direction);
  };

  // After publishing (wiki #167): Hoy on the letrero's city, at the top, where the new one is first
  const onPublished = ({ sign, rewarded }: { sign: Sign; rewarded: boolean }) => {
    setCity(sign.city);
    if (tab !== 'hoy') navigate(PATH.hoy);
    const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: smooth ? 'smooth' : 'auto' });
    setNotice({ id: Date.now(), rewarded });
    setFreshSignId(sign.id);
  };

  // The entrance plays once: coming back to Hoy later does not replay it
  useEffect(() => {
    if (freshSignId === null) return;
    const timer = window.setTimeout(() => setFreshSignId(null), 3000);
    return () => window.clearTimeout(timer);
  }, [freshSignId]);

  const openPrivacy = () => goWithTransition((viewTransition) => navigate('/privacidad', { viewTransition }), 'forward');

  const goToSearch = () => {
    const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: smooth ? 'smooth' : 'auto' });
    window.setTimeout(() => searchRef.current?.focus({ preventScroll: true }), smooth ? 350 : 0);
  };

  // A conversation on desktop lives in the URL (`?p=<id>`) so a reload and Back keep it; on a phone it is a page
  const selectedQuestion = tab === 'preguntas' && Number(searchParams.get('p')) > 0 ? Number(searchParams.get('p')) : null;
  const openQuestion = (id: Id) => {
    if (window.matchMedia('(min-width: 64rem)').matches) setSearchParams({ p: String(id) });
    else goWithTransition((viewTransition) => navigate(`/p/${id}`, { viewTransition }), 'forward');
  };
  // «Preguntar» arrives with step 3 of SPEC 10
  const openAsk = (_text?: string) => undefined;

  const context: ShellContext = {
    city,
    setCity,
    searchRef,
    openSign: setSelected,
    onToggleSave,
    freshSignId,
    openQuestion,
    selectedQuestion,
    openAsk,
    openAbout: () => setAbout(true),
    openPrivacy,
    signInWithGoogle: () => signIn.mutate(),
    signingIn: signIn.isPending,
  };

  return (
    <>
      <AppShell
        tab={tab}
        onTabChange={goToTab}
        city={city}
        onCityChange={setCity}
        account={
          signedIn
            ? {
                unread: 0,
                balance: wallet.data?.balance ?? null,
                onBell: () => setAvisos(true),
                // The balance opens Movimientos (wiki), not just the top of Yo
                onBalance: () => {
                  if (tab !== 'yo') goWithTransition((viewTransition) => navigate('/yo', { viewTransition }), 'forward');
                  window.setTimeout(() => {
                    const heading = document.getElementById('movimientos-title');
                    heading?.scrollIntoView({ block: 'start' });
                    heading?.focus({ preventScroll: true });
                  }, 120);
                },
              }
            : undefined
        }
        onSignIn={() => requireAccount('Entra para dar «Me sirvió», guardar y ganar yapitas.', () => undefined, 'Entra a BoliviaSabe')}
        onFab={() =>
          requireAccount(
            tab === 'hoy' ? 'Así tu letrero aparece en Hoy y ganas una yapita.' : 'Así tus vecinos pueden responderte.',
            tab === 'hoy' ? () => setUploading(true) : () => undefined,
            undefined,
            tab === 'hoy' ? { kind: 'open-new-sign' } : undefined,
          )
        }
        onSearch={searchHidden ? goToSearch : undefined}
        detail={
          selectedQuestion ? (
            <QuestionDetail key={selectedQuestion} id={selectedQuestion} variant="panel" onGone={() => setSearchParams({}, { replace: true })} />
          ) : undefined
        }
        detailEmpty="Toca una pregunta para ver su conversación aquí."
      >
        <Outlet context={context} />
      </AppShell>
      {selected && (
        <SignSheet
          key={selected.id}
          sign={selected}
          resumeVote={resumeVote ?? undefined}
          onClose={() => {
            setSelected(null);
            setResumeVote(null);
          }}
          onToggleSave={onToggleSave}
        />
      )}
      {uploading && <UploadSignSheet viewingCity={city} onClose={() => setUploading(false)} onPublished={onPublished} />}
      {notice && (
        <Toast
          key={notice.id}
          message={
            notice.rewarded ? (
              <>
                <Yapita size="sm" /> ¡Publicado! Ganaste +1 yapita
              </>
            ) : (
              'Publicado. Ya subiste 10 letreros hoy, este va sin premio'
            )
          }
          onDone={() => setNotice(null)}
        />
      )}
      {about && <AboutSheet onClose={() => setAbout(false)} onOpenPrivacy={openPrivacy} />}
      {avisos && <AvisosSheet onClose={() => setAvisos(false)} />}
    </>
  );
}

function AvisosSheet({ onClose }: { onClose: () => void }) {
  const titleId = useId();
  return (
    <Sheet labelledBy={titleId} variant="bottom" onClose={onClose}>
      {(close) => (
        <>
          <header className="sheet__bar">
            <h2 id={titleId} className="sheet__bar-title">Avisos</h2>
            <button type="button" className="icon-btn" aria-label="Cerrar" onClick={close}>
              <CloseIcon />
            </button>
          </header>
          <div className="sheet__body">
            <div className="sheet__content empty">
              <h3 className="empty__title">Sin avisos por ahora</h3>
              <p className="empty__text">Aquí verás cuando alguien te responda o le sirva tu letrero.</p>
            </div>
          </div>
        </>
      )}
    </Sheet>
  );
}
