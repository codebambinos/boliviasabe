// Picks the adapter behind the hooks. VITE_DATA_SOURCE=mock|supabase (default: mock).
// With `supabase` every method is real (SPEC 07, 08 and 11). The Supabase code loads on first use, so the mock
// build never ships it; the mock stays for working offline and for the tests.
//
// Without signal (wiki #65): when the phone says it is offline, every data call fails at once with «offline»
// before touching Supabase. Otherwise supabase-js may first try to refresh the session and keep retrying, and the
// screen stays on its skeleton (seen on an installed iPhone in airplane mode). A read that gets no answer at all
// gives up after READ_TIMEOUT_MS; a write never does, since cutting it short could duplicate a publish.
import type { DataApi } from './api';
import { DataError } from './errors';
import { mockAdapter } from './mock/adapter';

const READ_TIMEOUT_MS = 15_000;

function online(): Promise<void> {
  return typeof navigator !== 'undefined' && navigator.onLine === false
    ? Promise.reject(new DataError('offline', 'No connection'))
    : Promise.resolve();
}

function read<T>(run: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new DataError('offline', 'No answer')), READ_TIMEOUT_MS);
  });
  return Promise.race([run, timeout]).finally(() => clearTimeout(timer));
}

const loadAuth = () => import('./supabase/auth').then((module) => module.supabaseAuth);
const loadWallet = () => online().then(() => import('./supabase/wallet')).then((module) => module.supabaseWallet);
const loadData = () => online().then(() => import('./supabase/index')).then((module) => module.supabaseData);

function supabaseAdapter(): DataApi {
  return {
    auth: {
      getSession: () => loadAuth().then((auth) => auth.getSession()),
      signInWithGoogle: () => loadAuth().then((auth) => auth.signInWithGoogle()),
      signInWithEmail: (email, password) => loadAuth().then((auth) => auth.signInWithEmail(email, password)),
      requestPasswordReset: (email) => loadAuth().then((auth) => auth.requestPasswordReset(email)),
      recoveryReady: () => loadAuth().then((auth) => auth.recoveryReady()),
      updatePassword: (password) => loadAuth().then((auth) => auth.updatePassword(password)),
      signOut: () => loadAuth().then((auth) => auth.signOut()),
      saveProfile: (input) => loadAuth().then((auth) => auth.saveProfile(input)),
    },
    signs: {
      list: (query) => read(loadData().then((data) => data.signs.list(query))),
      get: (id) => read(loadData().then((data) => data.signs.get(id))),
      create: (input) => loadData().then((data) => data.signs.create(input)),
      vote: (id, value) => loadData().then((data) => data.signs.vote(id, value)),
      remove: (id) => loadData().then((data) => data.signs.remove(id)),
    },
    questions: {
      list: (query) => read(loadData().then((data) => data.questions.list(query))),
      get: (id) => read(loadData().then((data) => data.questions.get(id))),
      similar: (text) => read(loadData().then((data) => data.questions.similar(text))),
      create: (input) => loadData().then((data) => data.questions.create(input)),
      remove: (id) => loadData().then((data) => data.questions.remove(id)),
      closeWithoutSolution: (id) => loadData().then((data) => data.questions.closeWithoutSolution(id)),
    },
    answers: {
      create: (questionId, text) => loadData().then((data) => data.answers.create(questionId, text)),
      markHelpful: (id) => loadData().then((data) => data.answers.markHelpful(id)),
      markNotHelpful: (id) => loadData().then((data) => data.answers.markNotHelpful(id)),
      remove: (id) => loadData().then((data) => data.answers.remove(id)),
    },
    comments: {
      create: (answerId, text) => loadData().then((data) => data.comments.create(answerId, text)),
      remove: (id) => loadData().then((data) => data.comments.remove(id)),
    },
    contact: {
      request: (answerId, phone) => loadData().then((data) => data.contact.request(answerId, phone)),
      respond: (requestId, accept, phone) => loadData().then((data) => data.contact.respond(requestId, accept, phone)),
      myPhone: () => read(loadData().then((data) => data.contact.myPhone())),
    },
    live: {
      // Subscribing is synchronous for the caller: the channel opens once the adapter chunk has loaded
      question: (questionId, onChange, onStatus) => {
        let stop: (() => void) | null = null;
        let cancelled = false;
        loadData()
          .then((data) => {
            if (!cancelled) stop = data.live.question(questionId, onChange, onStatus);
          })
          .catch(() => undefined); // offline: no channel, the detail falls back to its 15 s refresh
        return () => {
          cancelled = true;
          stop?.();
        };
      },
      notices: (onChange, onStatus) => {
        let stop: (() => void) | null = null;
        let cancelled = false;
        loadData()
          .then((data) => {
            if (!cancelled) stop = data.live.notices(onChange, onStatus);
          })
          .catch(() => onStatus?.(false)); // offline: no channel, the bell asks every 60 s
        return () => {
          cancelled = true;
          stop?.();
        };
      },
    },
    saved: {
      toggle: (kind, id) => loadData().then((data) => data.saved.toggle(kind, id)),
      list: () => read(loadData().then((data) => data.saved.list())),
    },
    reports: {
      report: (kind, id, reason) => loadData().then((data) => data.reports.report(kind, id, reason)),
      hideForMe: (kind, id) => loadData().then((data) => data.reports.hideForMe(kind, id)),
    },
    wallet: {
      // Balance and status come from the chain (SPEC 08); Movimientos from `rewards` (SPEC 11)
      get: () => read(loadWallet().then((wallet) => wallet.get())),
      movements: (query) => read(loadData().then((data) => data.movements.movements(query))),
      retry: (movementId) => loadData().then((data) => data.movements.retry(movementId)),
    },
    activity: {
      myQuestions: () => read(loadData().then((data) => data.activity.myQuestions())),
      myAnswers: () => read(loadData().then((data) => data.activity.myAnswers())),
      mySigns: () => read(loadData().then((data) => data.activity.mySigns())),
    },
    notices: {
      list: (offset) => read(loadData().then((data) => data.notices.list(offset))),
      unreadCount: () => read(loadData().then((data) => data.notices.unreadCount())),
      markRead: (id) => loadData().then((data) => data.notices.markRead(id)),
      markAllRead: () => loadData().then((data) => data.notices.markAllRead()),
    },
    push: {
      getPrefs: () => read(loadData().then((data) => data.push.getPrefs())),
      setPrefs: (prefs) => loadData().then((data) => data.push.setPrefs(prefs)),
      saveSubscription: (subscription) => loadData().then((data) => data.push.saveSubscription(subscription)),
      deleteSubscription: (endpoint) => loadData().then((data) => data.push.deleteSubscription(endpoint)),
    },
  };
}

function pickAdapter(): DataApi {
  const source = import.meta.env.VITE_DATA_SOURCE as string | undefined;
  if (source === 'supabase') return supabaseAdapter();
  if (source && source !== 'mock') console.warn(`VITE_DATA_SOURCE="${source}" is unknown. Using the mock adapter.`);
  return mockAdapter;
}

export const api: DataApi = pickAdapter();
