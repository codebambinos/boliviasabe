// Picks the adapter behind the hooks. VITE_DATA_SOURCE=mock|supabase (default: mock).
// With `supabase`, auth (SPEC 07), the wallet balance (SPEC 08) and the data of SPEC 11 are real; what SPEC 11 has not
// moved yet still runs on the mock. The Supabase code loads on first use, so the mock build never ships it.
import type { DataApi } from './api';
import type { Session } from './types';
import { followRealBalance, followRealSession, mockAdapter } from './mock/adapter';

/** The mock keeps its own session, so it follows the real one (see followRealSession). */
async function bridged(session: Promise<Session>): Promise<Session> {
  const result = await session;
  followRealSession(result);
  return result;
}

function lazyAuth(): DataApi['auth'] {
  const load = () => import('./supabase/auth').then((module) => module.supabaseAuth);
  return {
    getSession: () => bridged(load().then((auth) => auth.getSession())),
    signInWithGoogle: () => bridged(load().then((auth) => auth.signInWithGoogle())),
    signInWithEmail: (email, password) => bridged(load().then((auth) => auth.signInWithEmail(email, password))),
    requestPasswordReset: (email) => load().then((auth) => auth.requestPasswordReset(email)),
    recoveryReady: () => load().then((auth) => auth.recoveryReady()),
    updatePassword: (password) => bridged(load().then((auth) => auth.updatePassword(password))),
    signOut: () => bridged(load().then((auth) => auth.signOut())),
    saveProfile: (input) => load().then((auth) => auth.saveProfile(input)),
  };
}

function lazyWallet(): DataApi['wallet'] {
  // Balance and status come from the chain; Movimientos come from `rewards` (SPEC 11)
  const load = () => import('./supabase/wallet').then((module) => module.supabaseWallet);
  return {
    movements: (query) => loadData().then((data) => data.movements.movements(query)),
    retry: (movementId) => loadData().then((data) => data.movements.retry(movementId)),
    get: async () => {
      const wallet = await load().then((real) => real.get());
      followRealBalance(wallet.balance);
      return wallet;
    },
  };
}

const loadData = () => import('./supabase/index').then((module) => module.supabaseData);

function lazySigns(): DataApi['signs'] {
  return {
    list: (query) => loadData().then((data) => data.signs.list(query)),
    get: (id) => loadData().then((data) => data.signs.get(id)),
    create: (input) => loadData().then((data) => data.signs.create(input)),
    vote: (id, value) => loadData().then((data) => data.signs.vote(id, value)),
    remove: (id) => loadData().then((data) => data.signs.remove(id)),
  };
}

function lazyQuestions(): DataApi['questions'] {
  return {
    list: (query) => loadData().then((data) => data.questions.list(query)),
    get: (id) => loadData().then((data) => data.questions.get(id)),
    similar: (text) => loadData().then((data) => data.questions.similar(text)),
    create: (input) => loadData().then((data) => data.questions.create(input)),
    remove: (id) => loadData().then((data) => data.questions.remove(id)),
    closeWithoutSolution: (id) => loadData().then((data) => data.questions.closeWithoutSolution(id)),
  };
}

function lazyAnswers(): DataApi['answers'] {
  return {
    create: (questionId, text) => loadData().then((data) => data.answers.create(questionId, text)),
    markHelpful: (id) => loadData().then((data) => data.answers.markHelpful(id)),
    markNotHelpful: (id) => loadData().then((data) => data.answers.markNotHelpful(id)),
    remove: (id) => loadData().then((data) => data.answers.remove(id)),
  };
}

function lazyActivity(): DataApi['activity'] {
  return {
    myQuestions: () => loadData().then((data) => data.activity.myQuestions()),
    myAnswers: () => loadData().then((data) => data.activity.myAnswers()),
    mySigns: () => loadData().then((data) => data.activity.mySigns()),
  };
}

function lazySaved(): DataApi['saved'] {
  return {
    toggle: (kind, id) => loadData().then((data) => data.saved.toggle(kind, id)),
    list: () => loadData().then((data) => data.saved.list()),
  };
}

function lazyReports(): DataApi['reports'] {
  return {
    report: (kind, id, reason) => loadData().then((data) => data.reports.report(kind, id, reason)),
    hideForMe: (kind, id) => loadData().then((data) => data.reports.hideForMe(kind, id)),
  };
}

function pickAdapter(): DataApi {
  const source = import.meta.env.VITE_DATA_SOURCE as string | undefined;
  if (source === 'supabase') return { ...mockAdapter, auth: lazyAuth(), wallet: lazyWallet(), signs: lazySigns(), questions: lazyQuestions(), answers: lazyAnswers(), saved: lazySaved(), reports: lazyReports(), activity: lazyActivity() };
  if (source && source !== 'mock') console.warn(`VITE_DATA_SOURCE="${source}" is unknown. Using the mock adapter.`);
  return mockAdapter;
}

export const api: DataApi = pickAdapter();
