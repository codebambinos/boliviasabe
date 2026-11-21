// Picks the adapter behind the hooks. VITE_DATA_SOURCE=mock|supabase (default: mock).
// With `supabase` every method is real (SPEC 07, 08 and 11). The Supabase code loads on first use, so the mock
// build never ships it; the mock stays for working offline and for the tests.
import type { DataApi } from './api';
import { mockAdapter } from './mock/adapter';

const loadAuth = () => import('./supabase/auth').then((module) => module.supabaseAuth);
const loadWallet = () => import('./supabase/wallet').then((module) => module.supabaseWallet);
const loadData = () => import('./supabase/index').then((module) => module.supabaseData);

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
      list: (query) => loadData().then((data) => data.signs.list(query)),
      get: (id) => loadData().then((data) => data.signs.get(id)),
      create: (input) => loadData().then((data) => data.signs.create(input)),
      vote: (id, value) => loadData().then((data) => data.signs.vote(id, value)),
      remove: (id) => loadData().then((data) => data.signs.remove(id)),
    },
    questions: {
      list: (query) => loadData().then((data) => data.questions.list(query)),
      get: (id) => loadData().then((data) => data.questions.get(id)),
      similar: (text) => loadData().then((data) => data.questions.similar(text)),
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
      myPhone: () => loadData().then((data) => data.contact.myPhone()),
    },
    live: {
      // Subscribing is synchronous for the caller: the channel opens once the adapter chunk has loaded
      question: (questionId, onChange, onStatus) => {
        let stop: (() => void) | null = null;
        let cancelled = false;
        void loadData().then((data) => {
          if (!cancelled) stop = data.live.question(questionId, onChange, onStatus);
        });
        return () => {
          cancelled = true;
          stop?.();
        };
      },
    },
    saved: {
      toggle: (kind, id) => loadData().then((data) => data.saved.toggle(kind, id)),
      list: () => loadData().then((data) => data.saved.list()),
    },
    reports: {
      report: (kind, id, reason) => loadData().then((data) => data.reports.report(kind, id, reason)),
      hideForMe: (kind, id) => loadData().then((data) => data.reports.hideForMe(kind, id)),
    },
    wallet: {
      // Balance and status come from the chain (SPEC 08); Movimientos from `rewards` (SPEC 11)
      get: () => loadWallet().then((wallet) => wallet.get()),
      movements: (query) => loadData().then((data) => data.movements.movements(query)),
      retry: (movementId) => loadData().then((data) => data.movements.retry(movementId)),
    },
    activity: {
      myQuestions: () => loadData().then((data) => data.activity.myQuestions()),
      myAnswers: () => loadData().then((data) => data.activity.myAnswers()),
      mySigns: () => loadData().then((data) => data.activity.mySigns()),
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
