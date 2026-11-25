// The app frame for the tab routes (/, /preguntas, /yo): mounted once, so the city and the sheets
// survive a tab change. The tab comes from the URL; pages render in the <Outlet /> (SPEC 04).
import { useEffect, useRef, useState } from 'react';
import { Outlet, useLocation, useNavigate, useSearchParams } from 'react-router';
import { DEFAULT_CITY, REDEEM_ENABLED, fetchQuestion, fetchSign, fetchSignOffers, isDataError, useCreateAnswer, useCreateComment, useRefresh, useSession, useSignInWithGoogle, useToggleSaved, useUnreadNotices, useWallet, type City, type Id, type Offer, type Question, type Sign } from '../data';
import { AboutSheet } from './AboutSheet';
import { AskQuestionSheet } from './AskQuestionSheet';
import { sendDraftAnswer } from './AnswerBox';
import { sendDraftComment } from './AnswerThread';
import { QuestionDetail } from './QuestionDetail';
import { RedeemSheet } from './RedeemSheet';
import { AppShell, type Tab } from './AppShell';
import { AuthGate, useOpenPasswordRecovery, useRegisterPendingHandlers, useRequireAccount } from './AuthGate';
import { afterSheetPop } from './Sheet';
import { AvisosSheet } from './AvisosSheet';
import type { NoticeFocus } from './notices';
import { SignSheet } from './SignSheet';
import { Toast } from './Toast';
import { goWithTransition, navigateWithTransition } from './transition';
import { UploadSignSheet } from './UploadSignSheet';
import { Yapita } from './Yapita';
import type { ShellContext } from './useShell';
import { askAfterPublish } from '../push/prompt';
import { LoadFailedPage, UnavailablePage } from '../pages/UnavailablePage';
import { errorMessage } from './messages';

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
  // The bell's number, live (SPEC 22); 0 and no request for a guest
  const unread = useUnreadNotices();
  const [searchHidden, setSearchHidden] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [asking, setAsking] = useState<{ text: string } | null>(null);
  const [notice, setNotice] = useState<{ id: number; rewarded: boolean } | null>(null);
  const [freshSignId, setFreshSignId] = useState<Id | null>(null);
  // «Canjear» from a letrero's «Acepta yapitas» box (SPEC 30): the confirmation of that offer
  const [redeeming, setRedeeming] = useState<Offer | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const session = useSession();
  const signedIn = session.data?.status === 'signed-in';
  const wallet = useWallet({ enabled: signedIn });
  const toggleSaved = useToggleSaved();
  const createAnswer = useCreateAnswer();
  const createComment = useCreateComment();
  const requireAccount = useRequireAccount();
  const openRecovery = useOpenPasswordRecovery();
  const signIn = useSignInWithGoogle();
  const refresh = useRefresh();

  // /l/:id, a shared letrero (SPEC 19): Hoy in the letrero's city with its sheet open, as if tapped there.
  // Deleted, hidden or in review → «Esto ya no está disponible»; no signal or a server error → its message + Reintentar
  // (wiki › Transversal), never a silent Hoy.
  const linkedSign = location.pathname.startsWith('/l/') ? location.pathname.slice(3) : null;
  const [linkGone, setLinkGone] = useState(false);
  const [linkError, setLinkError] = useState<unknown>(null);
  const [linkAttempt, setLinkAttempt] = useState(0);
  useEffect(() => {
    if (linkedSign === null) return;
    const id = /^\d{1,15}$/.test(linkedSign) ? Number(linkedSign) : 0;
    setLinkGone(false);
    setLinkError(null);
    if (id <= 0) {
      setLinkGone(true);
      return;
    }
    let live = true;
    fetchSign(id).then(
      (sign) => {
        if (!live) return;
        setCity(sign.city);
        setSelected(sign);
        navigate('/', { replace: true });
      },
      (error: unknown) => {
        if (!live) return;
        if (isDataError(error) && error.code === 'not_found') setLinkGone(true);
        else setLinkError(error);
      },
    );
    return () => {
      live = false;
    };
  }, [linkedSign, linkAttempt, navigate]);

  // «Pedir otro» from /nueva-contrasena: open «¿La olvidaste?» once and drop the flag from history
  useEffect(() => {
    if ((location.state as { forgotPassword?: boolean } | null)?.forgotPassword) {
      openRecovery();
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.state, location.pathname, navigate, openRecovery]);

  // ☆ Guardar on a letrero (the tile and the sheet): one request at a time per letrero, so a double tap never saves
  // and unsaves; a failure says why. Resolves to whether it changed.
  const savingSigns = useRef(new Set<Id>());
  const [saveFailed, setSaveFailed] = useState<{ id: number; message: string } | null>(null);
  const saveSign = (id: Id): Promise<boolean> => {
    if (savingSigns.current.has(id)) return Promise.resolve(false);
    savingSigns.current.add(id);
    return toggleSaved
      .mutateAsync({ kind: 'sign', id })
      .then(
        () => true,
        (error: unknown) => {
          setSaveFailed({ id: Date.now(), message: errorMessage(error) });
          return false;
        },
      )
      .finally(() => savingSigns.current.delete(id));
  };

  const onToggleSave = (sign: Sign) =>
    requireAccount(
      'Así guardas este letrero para verlo después.',
      () => void saveSign(sign.id),
      undefined,
      { kind: 'save-sign', id: sign.id },
    );

  // What each saved action does once the person is back from Google (SPEC 07)
  useRegisterPendingHandlers({
    'save-sign': ({ id }) => void saveSign(id),
    'vote-sign': async ({ id, value }) => {
      const sign = await fetchSign(id);
      setResumeVote(value);
      setSelected(sign);
    },
    'save-question': ({ id }) => toggleSaved.mutate({ kind: 'question', id }),
    'save-answer': ({ id }) => toggleSaved.mutate({ kind: 'answer', id }),
    'send-answer': ({ questionId }) => sendDraftAnswer(questionId, createAnswer.mutateAsync),
    'send-comment': ({ answerId, questionId }) => sendDraftComment(answerId, questionId, createComment.mutateAsync),
    'open-new-sign': () => setUploading(true),
    'open-ask': ({ text }) => setAsking({ text }),
    'redeem-offer': async ({ signId, offerId }) => {
      if (!REDEEM_ENABLED) return;
      const offer = (await fetchSignOffers(signId)).find((o) => o.id === offerId);
      if (offer) setRedeeming(offer);
    },
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
  const goToTab = (next: Tab, options?: { transition?: boolean }) => {
    // A swipe already slid the screen (useTabSwipe): no second animation on top
    if (options?.transition === false) {
      navigate(PATH[next]);
      return;
    }
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
    askAfterPublish('sign');
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

  // A conversation on desktop lives in the URL (`?p=<id>`) so a reload and Back keep it; on a phone it is a page.
  // Opening one in the panel is not a new screen: the list stays where it was (SPEC 17).
  const [goneQuestions, setGoneQuestions] = useState<ReadonlySet<Id>>(() => new Set());
  const asked = tab === 'preguntas' && Number(searchParams.get('p')) > 0 ? Number(searchParams.get('p')) : null;
  const selectedQuestion = asked !== null && !goneQuestions.has(asked) ? asked : null;

  // Leaving a deleted (reported, hidden) question from the panel: its card shrinks out of the list, the ones below
  // move up and the panel fades to empty, in one animated change. The URL and the lists catch up once it is over
  // (the URL only if that question is still the open one).
  const leaveQuestion = (id: Id) => {
    void navigateWithTransition(() => setGoneQuestions((gone) => new Set(gone).add(id)), 'remove').then(() => {
      setSearchParams((params) => (params.get('p') === String(id) ? new URLSearchParams() : params), { replace: true, preventScrollReset: true });
      refresh('questions');
    });
  };
  const openQuestion = (id: Id, options?: { share?: boolean; chargeFailed?: boolean }) => {
    const state = options?.share ? { shareFor: id, chargeFailed: options.chargeFailed } : undefined;
    if (window.matchMedia('(min-width: 64rem)').matches) setSearchParams({ p: String(id) }, { state, preventScrollReset: true });
    else goWithTransition((viewTransition) => navigate(`/p/${id}`, { viewTransition, state }), 'forward');
  };
  /**
   * A question from Avisos (SPEC 24, wiki #216). On a phone it opens the conversation itself, which scrolls to the
   * answer or comment the notice is about and frames it (`focus`, read by QuestionDetail). On desktop it shows
   * ¿Alguien sabe? in the question's city with its card framed (`spotlight`, PreguntasPage) and the conversation in the
   * panel, framed the same way. If the question cannot be loaded now, it opens as before. `pending` lets the caller
   * start loading it while the sheet closes.
   */
  const openNoticeQuestion = (id: Id, pending = fetchQuestion(id), focus?: NoticeFocus) => {
    if (!window.matchMedia('(min-width: 64rem)').matches) {
      goWithTransition((viewTransition) => navigate(`/p/${id}`, { viewTransition, state: { focus } }), 'forward');
      return;
    }
    pending.then(
      ({ question }) => {
        if (question.city !== city) setCity(question.city);
        const direction = tab === 'preguntas' ? 'up' : ORDER.indexOf('preguntas') > ORDER.indexOf(tab) ? 'forward' : 'back';
        goWithTransition((viewTransition) => navigate(`/preguntas?p=${id}`, { viewTransition, state: { spotlight: id, focus } }), direction);
      },
      () => openQuestion(id),
    );
  };
  const openAsk = (text = '') =>
    requireAccount('Así tus vecinos pueden responderte.', () => setAsking({ text }), undefined, { kind: 'open-ask', text });

  // After publishing: the sheet closes first (it owns a history entry), then the new question opens
  const onQuestionPublished = ({ question, urgent, urgentCharged }: { question: Question; urgent: boolean; urgentCharged: boolean }) => {
    if (question.city !== city) setCity(question.city);
    // The notice travels with the navigation: on a phone the conversation is a page outside this shell
    afterSheetPop(() => openQuestion(question.id, { share: true, chargeFailed: urgent && !urgentCharged }));
    askAfterPublish('question');
  };

  const context: ShellContext = {
    city,
    setCity,
    searchRef,
    openSign: setSelected,
    onToggleSave,
    freshSignId,
    openQuestion,
    selectedQuestion,
    goneQuestions,
    openAsk,
    openUpload: () =>
      requireAccount('Así tu letrero aparece en Hoy y ganas una yapita.', () => setUploading(true), undefined, { kind: 'open-new-sign' }),
    openAvisos: () => setAvisos(true),
    openAbout: () => setAbout(true),
    openPrivacy,
    signInWithGoogle: () => signIn.mutate(),
    signingIn: signIn.isPending,
  };

  if (linkedSign !== null && linkGone) return <UnavailablePage title="Letrero" />;
  if (linkedSign !== null && linkError !== null) {
    return <LoadFailedPage title="Letrero" message={errorMessage(linkError)} onRetry={() => setLinkAttempt((n) => n + 1)} />;
  }

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
                unread,
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
        onSignIn={() => requireAccount('Inicia sesión para dar «Me sirvió», guardar y ganar yapitas.', () => undefined, 'Inicia sesión en BoliviaSabe')}
        onFab={() =>
          requireAccount(
            tab === 'hoy' ? 'Así tu letrero aparece en Hoy y ganas una yapita.' : 'Así tus vecinos pueden responderte.',
            tab === 'hoy' ? () => setUploading(true) : () => setAsking({ text: '' }),
            undefined,
            tab === 'hoy' ? { kind: 'open-new-sign' } : { kind: 'open-ask', text: '' },
          )
        }
        onSearch={searchHidden ? goToSearch : undefined}
        detail={
          selectedQuestion ? (
            <QuestionDetail key={selectedQuestion} id={selectedQuestion} variant="panel" onGone={() => leaveQuestion(selectedQuestion)} />
          ) : undefined
        }
        detailKey={selectedQuestion ?? undefined}
        detailEmpty="Elige una pregunta para ver su conversación aquí."
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
          onSave={saveSign}
          onRedeem={(offer) => afterSheetPop(() => setRedeeming(offer))}
        />
      )}
      {redeeming && (
        <RedeemSheet balance={wallet.data?.balance ?? null} initialOffer={redeeming} onClose={() => setRedeeming(null)} />
      )}
      {asking && (
        <AskQuestionSheet
          viewingCity={city}
          initialText={asking.text}
          onClose={() => setAsking(null)}
          onPublished={onQuestionPublished}
          onOpenQuestion={(id) => afterSheetPop(() => openQuestion(id))}
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
      {saveFailed && <Toast key={saveFailed.id} message={saveFailed.message} onDone={() => setSaveFailed(null)} />}
      {about && <AboutSheet onClose={() => setAbout(false)} onOpenPrivacy={openPrivacy} />}
      {avisos && (
        <AvisosSheet
          onClose={() => setAvisos(false)}
          onOpenQuestion={(id, focus) => {
            // Ask for the question now, while the sheet closes: by then its city is usually known
            const pending = fetchQuestion(id);
            afterSheetPop(() => openNoticeQuestion(id, pending, focus));
          }}
          // /l/:id opens Hoy in the letrero's city with its sheet (SPEC 19)
          onOpenSign={(id) => afterSheetPop(() => navigate(`/l/${id}`))}
          onGoHoy={() => afterSheetPop(() => goToTab('hoy'))}
        />
      )}
    </>
  );
}
