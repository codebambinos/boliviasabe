// Soft wall (wiki › Entrada y cuenta): acting without an account opens «Crea tu cuenta para seguir»;
// after signing in, the pending action runs on its own. Looking never needs an account.
// Google reloads the page, so before leaving the action is saved as data (`resume`, see
// pendingAction.ts) and run once when the person is back signed in (SPEC 07). A person signed in
// without a profile goes through «Tu barrio» first, and then the action runs (SPEC 08).
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useSession } from '../data';
import { AuthSheet } from './AuthSheet';
import { TuBarrioSheet } from './TuBarrioSheet';
import { saveDraft, type DraftRecord } from './draftStore';
import { clearPending, peekPending, savePending, type PendingAction, type PendingHandlers } from './pendingAction';

type Require = (reason: string, action: () => void, title?: string, resume?: PendingAction) => void;
type DraftSaver = () => { key: string; draft: DraftRecord } | null;
type Registry = {
  setHandlers: (handlers: PendingHandlers) => void;
  addDraftSaver: (saver: DraftSaver) => () => void;
};

const RequireContext = createContext<Require>((_reason, action) => action());
const RecoveryContext = createContext<() => void>(() => undefined);
const EmailSignInContext = createContext<(reason: string, title?: string) => void>(() => undefined);
const RegistryContext = createContext<Registry>({ setHandlers: () => undefined, addDraftSaver: () => () => undefined });

type Pending = { reason: string; action: () => void; title?: string; start?: 'email' | 'forgot'; resume?: PendingAction };

/** A save that never blocks the redirect for long: after this the person goes to Google anyway. */
const SAVE_BUDGET_MS = 1500;

export function AuthGate({ children }: { children: ReactNode }) {
  const session = useSession();
  const location = useLocation();
  const navigate = useNavigate();
  const [pending, setPending] = useState<Pending | null>(null);
  // «Tu barrio» open, with what to do once the profile is saved
  const [barrio, setBarrio] = useState<{ action: () => void } | null>(null);
  const barrioSaved = useRef(false);
  const signedIn = useRef(false);
  const current = session.data;
  const currentRef = useRef(current);
  currentRef.current = current;
  const ready = current?.status === 'signed-in' && current.profile !== null;
  const needsProfile = current?.status === 'signed-in' && current.profile === null;
  const suggestedName = current?.status === 'signed-in' ? current.suggestedName : undefined;

  /** Runs `action` now, or after «Tu barrio» if the person has an account but no profile yet. */
  const afterProfile = useCallback((action: () => void) => {
    const now = currentRef.current;
    if (now?.status === 'signed-in' && now.profile === null) {
      barrioSaved.current = false;
      setBarrio({ action });
    } else action();
  }, []);
  const handlers = useRef<PendingHandlers>({});
  const draftSavers = useRef(new Set<DraftSaver>());
  // What was saved before leaving for Google, read once when the page loads
  const [restore] = useState(() => peekPending());
  const restored = useRef(false);

  const require = useCallback<Require>(
    (reason, action, title, resume) => {
      if (ready) action();
      else if (needsProfile) afterProfile(action);
      else {
        signedIn.current = false;
        setPending({ reason, action, title, resume });
      }
    },
    [ready, needsProfile, afterProfile],
  );

  // «Pedir otro» on /nueva-contrasena lands on Hoy with the sheet open on «¿La olvidaste?»
  const openRecovery = useCallback(() => {
    signedIn.current = false;
    setPending({ reason: '', action: () => undefined, start: 'forgot' });
  }, []);

  // «Usar mi correo» in Yo: the person already chose the e-mail, so the sheet opens on its form
  const openEmailSignIn = useCallback((reason: string, title?: string) => {
    signedIn.current = false;
    setPending({ reason, title, action: () => undefined, start: 'email' });
  }, []);

  const registry = useRef<Registry>({
    setHandlers: (next) => {
      handlers.current = next;
    },
    addDraftSaver: (saver) => {
      draftSavers.current.add(saver);
      return () => {
        draftSavers.current.delete(saver);
      };
    },
  });

  // Back from Google: once the session is known, run the saved action if there is a person, and
  // forget it either way. It never runs twice, and an old one was already dropped by peekPending.
  useEffect(() => {
    if (!restore || restored.current || session.data === undefined) return;
    restored.current = true;
    clearPending();
    if (session.data.status !== 'signed-in') return;
    // `entry`: this page is the first one of the visit; the history entry before it is Google, so «Volver» must
    // not go there (useGoBack falls back to the app instead)
    if (restore.path !== location.pathname) navigate(restore.path, { replace: true, state: { entry: true } });
    const action = restore.resume;
    const run = action ? (handlers.current[action.kind] as ((a: PendingAction) => void | Promise<void>) | undefined) : undefined;
    // Also with no saved action («Entrar» in the bar): a person without profile still goes through «Tu barrio»
    afterProfile(() => {
      if (action && run) void Promise.resolve(run(action)).catch(() => undefined);
    });
  }, [restore, session.data, location.pathname, navigate, afterProfile]);

  // Before «Continuar con Google»: save the action and every registered draft
  const beforeGoogle = async () => {
    if (!pending) return;
    savePending({
      resume: pending.resume ?? null,
      path: location.pathname + location.search,
      reason: pending.reason,
      title: pending.title,
      savedAt: Date.now(),
    });
    const saves = [...draftSavers.current].map(async (get) => {
      const entry = get();
      if (entry) await saveDraft(entry.key, entry.draft);
    });
    await Promise.race([Promise.all(saves), new Promise((resolve) => setTimeout(resolve, SAVE_BUDGET_MS))]);
  };

  return (
    <RequireContext.Provider value={require}>
      <RecoveryContext.Provider value={openRecovery}>
        <EmailSignInContext.Provider value={openEmailSignIn}>
          <RegistryContext.Provider value={registry.current}>
            {children}
            {pending && (
              <AuthSheet
                reason={pending.reason}
                title={pending.title}
                start={pending.start}
                beforeGoogle={beforeGoogle}
                onSignedIn={() => {
                  signedIn.current = true;
                  // Signed in without leaving the page (e-mail): the action runs below, not from storage
                  clearPending();
                }}
                onClose={() => {
                  const { action } = pending;
                  setPending(null);
                  if (signedIn.current) afterProfile(action);
                }}
              />
            )}
            {barrio && (
              <TuBarrioSheet
                suggestedName={suggestedName}
                onSaved={() => {
                  barrioSaved.current = true;
                }}
                onClose={() => {
                  // Same order as the sign-in sheet: the action runs after the sheet has fully left
                  const { action } = barrio;
                  setBarrio(null);
                  if (barrioSaved.current) action();
                }}
              />
            )}
          </RegistryContext.Provider>
        </EmailSignInContext.Provider>
      </RecoveryContext.Provider>
    </RequireContext.Provider>
  );
}

/** `requireAccount(reason, action, title?, resume?)`: runs `action` now, or after the person creates an
 * account. `resume` describes the action as data so it also survives the Google redirect. */
export const useRequireAccount = () => useContext(RequireContext);

/** Opens «Crea tu cuenta» straight on «¿La olvidaste?». */
export const useOpenPasswordRecovery = () => useContext(RecoveryContext);

/** Opens «Entra a BoliviaSabe» straight on the e-mail form (signed out only). */
export const useOpenEmailSignIn = () => useContext(EmailSignInContext);

/** ShellLayout registers what each pending `kind` does once the person is back from Google. */
export function useRegisterPendingHandlers(handlers: PendingHandlers): void {
  const { setHandlers } = useContext(RegistryContext);
  useEffect(() => setHandlers(handlers));
}

/** A form with text typed behind the wall registers how to read its draft; it is saved before Google. */
export function useDraftSaver(saver: DraftSaver): void {
  const { addDraftSaver } = useContext(RegistryContext);
  const latest = useRef(saver);
  latest.current = saver;
  useEffect(() => addDraftSaver(() => latest.current()), [addDraftSaver]);
}
