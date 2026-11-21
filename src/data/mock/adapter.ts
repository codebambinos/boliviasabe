// Mock implementation of DataApi: in-memory, with fake latency and the wiki rules.
import type { DataApi } from '../api';
import { CITIES, DEFAULT_CITY, PAGE_SIZE } from '../catalog';
import { DataError } from '../errors';
import type { Answer, City, ContentKind, Id, Movement, Page, Question, Session, Sign } from '../types';
import { mockMode, simulate } from './behavior';
import { LUCIA, fakeAddress, fakeTxHash, type AnswerRec, type MovementRec, type QuestionRec, type SignRec } from './fixtures';
import {
  assertCanAsk,
  authorOf,
  confirmedBalance,
  currentUserId,
  isHiddenFor,
  isInReview,
  normalize,
  pairCanBeRewarded,
  requireProfile,
  requireUser,
  signsCreatedToday,
  MAX_REWARDED_ANSWERS_PER_QUESTION,
  MAX_REWARDED_SIGNS_PER_DAY,
  URGENT_COST,
  URGENT_HOURS,
  validateLength,
  validateMapsUrl,
  validateTags,
} from './rules';
import { nextId, store } from './store';

const SETTLE_MS = 2000;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ---------- shared helpers ----------

/** Offset-based pagination: the cursor is the index of the first item of the next page. */
export function paginate<T>(items: T[], cursor?: string | null): Page<T> {
  const start = cursor ? Number(cursor) : 0;
  const end = start + PAGE_SIZE;
  return { items: items.slice(start, end), nextCursor: end < items.length ? String(end) : null };
}

/** Settles a pending movement after 2 s: confirmed, or error with ?mock=stellar-error. */
export function settle(movement: MovementRec, outcome: 'confirmed' | 'error'): void {
  setTimeout(() => {
    movement.status = outcome;
    movement.txHash = outcome === 'confirmed' ? fakeTxHash(movement.id + 1000) : null;
  }, SETTLE_MS);
}

/** Adds a reward (+) or spend (−) as pending; it settles like a Stellar payment would. */
export function addMovement(userId: Id, reason: MovementRec['reason'], amount: number, sourceUserId: Id | null): MovementRec {
  const movement: MovementRec = {
    id: nextId('movement'),
    userId,
    reason,
    amount,
    createdAt: new Date().toISOString(),
    status: 'pending',
    txHash: null,
    sourceUserId,
  };
  store.movements.push(movement);
  settle(movement, mockMode === 'stellar-error' ? 'error' : 'confirmed');
  return movement;
}

const matchesSearch = (text: string, search?: string) => !search?.trim() || normalize(text).includes(normalize(search));

// ---------- converters ----------

export function sessionOf(): Session {
  const userId = currentUserId();
  if (userId === null) return { status: 'guest' };
  const user = store.users.find((u) => u.id === userId);
  if (!user) return { status: 'guest' };
  const profile =
    user.fullName && user.city && user.zone
      ? { ...authorOf(user.id), fullName: user.fullName, city: user.city, zone: user.zone }
      : null;
  return { status: 'signed-in', userId: user.id, email: user.email, profile };
}

export function toSign(rec: SignRec): Sign {
  const viewer = currentUserId();
  const votes = store.signVotes.filter((v) => v.signId === rec.id);
  const mine = votes.find((v) => v.userId === viewer);
  return {
    id: rec.id,
    title: rec.title,
    photoUrl: rec.photoUrl,
    thumbUrl: rec.photoUrl,
    price: rec.price,
    city: rec.city,
    zone: rec.zone,
    tags: [...rec.tags],
    mapsUrl: rec.mapsUrl,
    author: authorOf(rec.authorId),
    createdAt: rec.createdAt,
    helpfulCount: votes.filter((v) => v.value === 'helpful').length,
    myVote: mine?.value ?? null,
    savedByMe: store.saved.some((s) => s.userId === viewer && s.kind === 'sign' && s.itemId === rec.id),
    isMine: rec.authorId === viewer,
    inReview: isInReview('sign', rec.id),
  };
}

function signScore(rec: SignRec): number {
  const votes = store.signVotes.filter((v) => v.signId === rec.id);
  return votes.filter((v) => v.value === 'helpful').length - votes.filter((v) => v.value === 'not_helpful').length;
}

export function findVisibleSign(id: Id): SignRec {
  const rec = store.signs.find((s) => s.id === id);
  if (!rec || isHiddenFor(currentUserId(), 'sign', rec.id, rec.authorId)) {
    throw new DataError('not_found', 'This sign is no longer available');
  }
  return rec;
}

// ---------- auth ----------

/** First «Tu barrio»: the Stellar account is prepared and the +5 welcome is paid. */
function prepareWallet(userId: Id): void {
  const user = store.users.find((u) => u.id === userId);
  if (!user) return;
  user.walletStatus = 'preparing';
  addMovement(userId, 'bienvenida', 5, null); // settles to confirmed at the same time the wallet is ready
  setTimeout(() => {
    user.walletStatus = 'ready';
    user.address = fakeAddress(userId);
  }, SETTLE_MS);
}

export const mockAuth: DataApi['auth'] = {
  getSession: () => simulate(() => sessionOf()),

  /** Fake Google login: always signs in as the seed neighbor «Lucía M.». */
  signInWithGoogle: () =>
    simulate(() => {
      store.session.userId = LUCIA;
      return sessionOf();
    }),

  /**
   * Known e-mail with its password → that user. Known e-mail, other password → `wrong_password`.
   * A Google account → `google_account`. New e-mail → new user without profile («Tu barrio» pending).
   */
  signInWithEmail: (email, password) =>
    simulate(() => {
      const clean = email.trim().toLowerCase();
      if (!EMAIL.test(clean)) throw new DataError('validation', 'Invalid email', { field: 'email' });
      if (password.length < 6) throw new DataError('validation', 'Password needs at least 6 characters', { field: 'password' });
      let user = store.users.find((u) => u.email === clean);
      if (user?.provider === 'google') throw new DataError('google_account', 'This account enters with Google');
      if (user && user.password !== password) throw new DataError('wrong_password', 'Wrong password');
      if (!user) {
        user = { id: nextId('user'), email: clean, provider: 'password', password, fullName: null, city: null, zone: null, walletStatus: 'preparing', address: null };
        store.users.push(user);
      }
      store.session.userId = user.id;
      return sessionOf();
    }),

  /** Resolves for any address. A known password account is marked as «opened the link». */
  requestPasswordReset: (email) =>
    simulate(() => {
      const clean = email.trim().toLowerCase();
      if (!EMAIL.test(clean)) throw new DataError('validation', 'Invalid email', { field: 'email' });
      const user = store.users.find((u) => u.email === clean);
      store.session.recoveryUserId = user?.provider === 'password' ? user.id : null;
    }),

  recoveryReady: () => simulate(() => store.session.recoveryUserId !== null),

  updatePassword: (password) =>
    simulate(() => {
      if (password.length < 6) throw new DataError('validation', 'Password needs at least 6 characters', { field: 'password' });
      const userId = store.session.recoveryUserId;
      const user = store.users.find((u) => u.id === userId);
      if (!user) throw new DataError('unauthenticated', 'The recovery link is not valid');
      user.password = password;
      store.session.recoveryUserId = null;
      store.session.userId = user.id;
      return sessionOf();
    }),

  signOut: () =>
    simulate(() => {
      store.session.userId = null;
      return sessionOf();
    }),

  saveProfile: ({ fullName, city, zone }) =>
    simulate(() => {
      const user = requireUser();
      const name = validateLength('fullName', fullName, 2, 60);
      if (!CITIES.includes(city as City)) throw new DataError('validation', 'Unknown city', { field: 'city' });
      const cleanZone = validateLength('zone', zone, 1, 60);
      const firstTime = user.fullName === null;
      user.fullName = name;
      user.city = city;
      user.zone = cleanZone;
      if (firstTime) prepareWallet(user.id);
      return sessionOf();
    }),
};

// ---------- signs ----------

export const mockSigns: DataApi['signs'] = {
  list: ({ city, search, tags, cursor }) =>
    simulate(() => {
      const viewer = currentUserId();
      const items = store.signs
        .filter((s) => s.city === city)
        .filter((s) => !isHiddenFor(viewer, 'sign', s.id, s.authorId))
        .filter((s) => matchesSearch(`${s.title} ${s.zone}`, search))
        .filter((s) => !tags?.length || s.tags.some((t) => tags.includes(t)))
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || signScore(b) - signScore(a))
        .map(toSign);
      return paginate(items, cursor);
    }),

  get: (id) => simulate(() => toSign(findVisibleSign(id))),

  create: (input) =>
    simulate(() => {
      const user = requireProfile();
      const title = validateLength('title', input.title, 3, 80);
      if (!(input.photo instanceof Blob)) throw new DataError('validation', 'A photo is required', { field: 'photo' });
      const tags = validateTags(input.tags);
      const mapsUrl = validateMapsUrl(input.mapsUrl);
      const rewarded = signsCreatedToday(user.id) < MAX_REWARDED_SIGNS_PER_DAY;
      const rec: SignRec = {
        id: nextId('sign'),
        authorId: user.id,
        title,
        photoUrl: URL.createObjectURL(input.photo),
        price: input.price?.trim() || null,
        city: user.city,
        zone: input.zone?.trim() || user.zone,
        tags,
        mapsUrl,
        createdAt: new Date().toISOString(),
      };
      store.signs.push(rec);
      if (rewarded) addMovement(user.id, 'letrero', 1, null);
      return { sign: toSign(rec), rewarded };
    }),

  vote: (id, value) =>
    simulate(() => {
      const user = requireProfile();
      const rec = findVisibleSign(id);
      if (rec.authorId === user.id) throw new DataError('forbidden', 'You cannot vote on your own sign');
      if (store.signVotes.some((v) => v.signId === id && v.userId === user.id)) {
        throw new DataError('forbidden', 'You already voted on this sign');
      }
      store.signVotes.push({ signId: id, userId: user.id, value });
      if (value === 'helpful' && pairCanBeRewarded(user.id, rec.authorId)) {
        addMovement(rec.authorId, 'sirvio-l', 1, user.id);
      }
      return toSign(rec);
    }),

  remove: (id) =>
    simulate(() => {
      const user = requireUser();
      const rec = findVisibleSign(id);
      if (rec.authorId !== user.id) throw new DataError('forbidden', 'You can only delete your own sign');
      store.signs = store.signs.filter((s) => s.id !== id);
      store.signVotes = store.signVotes.filter((v) => v.signId !== id);
      store.saved = store.saved.filter((s) => !(s.kind === 'sign' && s.itemId === id));
    }),
};

// ---------- questions and answers ----------

const isUrgentActive = (q: QuestionRec) => q.urgentUntil !== null && Date.parse(q.urgentUntil) > Date.now();

export function toQuestion(rec: QuestionRec): Question {
  const viewer = currentUserId();
  return {
    id: rec.id,
    text: rec.text,
    photoUrl: rec.photoUrl,
    city: rec.city,
    zone: rec.zone,
    tags: [...rec.tags],
    author: authorOf(rec.authorId),
    createdAt: rec.createdAt,
    urgentUntil: isUrgentActive(rec) ? rec.urgentUntil : null,
    status: rec.status,
    answerCount: store.answers.filter((a) => a.questionId === rec.id).length,
    savedByMe: store.saved.some((s) => s.userId === viewer && s.kind === 'question' && s.itemId === rec.id),
    isMine: rec.authorId === viewer,
    inReview: isInReview('question', rec.id),
  };
}

export function toAnswer(rec: AnswerRec): Answer {
  const viewer = currentUserId();
  return {
    id: rec.id,
    questionId: rec.questionId,
    text: rec.text,
    author: authorOf(rec.authorId),
    createdAt: rec.createdAt,
    helpful: rec.helpful,
    notHelpful: rec.notHelpful,
    savedByMe: store.saved.some((s) => s.userId === viewer && s.kind === 'answer' && s.itemId === rec.id),
    isMine: rec.authorId === viewer,
    inReview: isInReview('answer', rec.id),
  };
}

export function findVisibleQuestion(id: Id): QuestionRec {
  const rec = store.questions.find((q) => q.id === id);
  if (!rec || isHiddenFor(currentUserId(), 'question', rec.id, rec.authorId)) {
    throw new DataError('not_found', 'This question is no longer available');
  }
  return rec;
}

export function findVisibleAnswer(id: Id): AnswerRec {
  const rec = store.answers.find((a) => a.id === id);
  if (!rec || isHiddenFor(currentUserId(), 'answer', rec.id, rec.authorId)) {
    throw new DataError('not_found', 'This answer is no longer available');
  }
  return rec;
}

/** Wiki order: active urgent → your zone → rest of the city → solved and closed. Newest first inside each group. */
function questionGroup(q: QuestionRec, myZone: string | null): number {
  if (q.status !== 'open') return 3;
  if (isUrgentActive(q)) return 0;
  if (myZone && normalize(q.zone) === myZone) return 1;
  return 2;
}

function viewerZone(city: City): string | null {
  const session = sessionOf();
  if (session.status !== 'signed-in' || !session.profile || session.profile.city !== city) return null;
  return normalize(session.profile.zone);
}

export const mockQuestions: DataApi['questions'] = {
  list: ({ city, search, tags, cursor }) =>
    simulate(() => {
      const viewer = currentUserId();
      const myZone = viewerZone(city);
      const items = store.questions
        .filter((q) => q.city === city)
        .filter((q) => !isHiddenFor(viewer, 'question', q.id, q.authorId))
        .filter((q) => matchesSearch(q.text, search))
        .filter((q) => !tags?.length || q.tags.some((t) => tags.includes(t)))
        .sort((a, b) => questionGroup(a, myZone) - questionGroup(b, myZone) || Date.parse(b.createdAt) - Date.parse(a.createdAt))
        .map(toQuestion);
      return paginate(items, cursor);
    }),

  get: (id) =>
    simulate(() => {
      const viewer = currentUserId();
      const question = findVisibleQuestion(id);
      const answers = store.answers
        .filter((a) => a.questionId === id && !isHiddenFor(viewer, 'answer', a.id, a.authorId))
        .sort((a, b) => Number(b.helpful) - Number(a.helpful) || Date.parse(a.createdAt) - Date.parse(b.createdAt))
        .map(toAnswer);
      return { question: toQuestion(question), answers };
    }),

  /** «Preguntas parecidas»: from 3 typed words, up to 3 questions sharing words of 4+ letters. */
  similar: (text) =>
    simulate(() => {
      const words = normalize(text).split(/\s+/).filter(Boolean);
      if (words.length < 3) return [];
      const keywords = words.filter((w) => w.length >= 4);
      const session = sessionOf();
      const city = session.status === 'signed-in' && session.profile ? session.profile.city : DEFAULT_CITY;
      const viewer = currentUserId();
      return store.questions
        .filter((q) => q.city === city && !isHiddenFor(viewer, 'question', q.id, q.authorId))
        .map((q) => ({ q, score: keywords.filter((k) => normalize(q.text).includes(k)).length }))
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3)
        .map((x) => toQuestion(x.q));
    }),

  create: (input) =>
    simulate(() => {
      const user = requireProfile();
      const text = validateLength('text', input.text, 3, 300);
      const tags = validateTags(input.tags);
      assertCanAsk(user.id, input.urgent);
      // With ?mock=stellar-error the −5 charge fails: the question is published as normal (wiki rule).
      const urgentCharged = input.urgent && mockMode !== 'stellar-error';
      const rec: QuestionRec = {
        id: nextId('question'),
        authorId: user.id,
        text,
        photoUrl: input.photo instanceof Blob ? URL.createObjectURL(input.photo) : null,
        city: user.city,
        zone: input.zone?.trim() || user.zone,
        tags,
        createdAt: new Date().toISOString(),
        urgentUntil: urgentCharged ? new Date(Date.now() + URGENT_HOURS * 3600 * 1000).toISOString() : null,
        status: 'open',
        closureRewarded: false,
      };
      store.questions.push(rec);
      if (urgentCharged) addMovement(user.id, 'urgente', -URGENT_COST, null);
      return { question: toQuestion(rec), urgentCharged };
    }),

  remove: (id) =>
    simulate(() => {
      const user = requireUser();
      const rec = findVisibleQuestion(id);
      if (rec.authorId !== user.id) throw new DataError('forbidden', 'You can only delete your own question');
      if (store.answers.some((a) => a.questionId === id)) {
        throw new DataError('forbidden', 'A question with answers cannot be deleted');
      }
      store.questions = store.questions.filter((q) => q.id !== id);
      store.saved = store.saved.filter((s) => !(s.kind === 'question' && s.itemId === id));
    }),

  /** «Ninguna me sirvió»: closes an open question that has answers, +1 once. */
  closeWithoutSolution: (id) =>
    simulate(() => {
      const user = requireUser();
      const rec = findVisibleQuestion(id);
      if (rec.authorId !== user.id) throw new DataError('forbidden', 'Only the asker can close the question');
      if (rec.status !== 'open') throw new DataError('forbidden', 'The question is already closed');
      if (!store.answers.some((a) => a.questionId === id)) {
        throw new DataError('forbidden', 'A question without answers is deleted, not closed');
      }
      rec.status = 'closed';
      if (!rec.closureRewarded) {
        rec.closureRewarded = true;
        addMovement(user.id, 'cierre', 1, null);
      }
      return toQuestion(rec);
    }),
};

export const mockAnswers: DataApi['answers'] = {
  create: (questionId, text) =>
    simulate(() => {
      const user = requireProfile();
      const question = findVisibleQuestion(questionId);
      if (question.authorId === user.id) throw new DataError('forbidden', 'You cannot answer your own question');
      if (question.status !== 'open') throw new DataError('forbidden', 'The question no longer accepts answers');
      if (store.answers.some((a) => a.questionId === questionId && a.authorId === user.id)) {
        throw new DataError('forbidden', 'You already answered this question');
      }
      const rec: AnswerRec = {
        id: nextId('answer'),
        questionId,
        authorId: user.id,
        text: validateLength('text', text, 1, 1000),
        createdAt: new Date().toISOString(),
        helpful: false,
        notHelpful: false,
      };
      store.answers.push(rec);
      return toAnswer(rec);
    }),

  /** Only the asker. +5 to the helper (max 3 rewarded per question); the first one solves the question (+1 once). */
  markHelpful: (id) =>
    simulate(() => {
      const user = requireUser();
      const answer = findVisibleAnswer(id);
      const question = findVisibleQuestion(answer.questionId);
      if (question.authorId !== user.id) throw new DataError('forbidden', 'Only the asker can mark «Me sirvió»');
      if (answer.helpful) return toAnswer(answer);
      const alreadyRewarded = store.answers.filter((a) => a.questionId === question.id && a.helpful).length;
      answer.helpful = true;
      answer.notHelpful = false;
      if (alreadyRewarded < MAX_REWARDED_ANSWERS_PER_QUESTION && pairCanBeRewarded(user.id, answer.authorId)) {
        addMovement(answer.authorId, 'ayuda', 5, user.id);
      }
      if (question.status !== 'solved') {
        question.status = 'solved';
        if (!question.closureRewarded) {
          question.closureRewarded = true;
          addMovement(user.id, 'cierre', 1, null);
        }
      }
      return toAnswer(answer);
    }),

  markNotHelpful: (id) =>
    simulate(() => {
      const user = requireUser();
      const answer = findVisibleAnswer(id);
      const question = findVisibleQuestion(answer.questionId);
      if (question.authorId !== user.id) throw new DataError('forbidden', 'Only the asker can rate answers');
      if (answer.helpful) throw new DataError('forbidden', '«Me sirvió» is final');
      answer.notHelpful = true;
      return toAnswer(answer);
    }),

  remove: (id) =>
    simulate(() => {
      const user = requireUser();
      const answer = findVisibleAnswer(id);
      if (answer.authorId !== user.id) throw new DataError('forbidden', 'You can only delete your own answer');
      if (answer.helpful) throw new DataError('forbidden', 'An answer marked «Me sirvió» cannot be deleted');
      store.answers = store.answers.filter((a) => a.id !== id);
      store.saved = store.saved.filter((s) => !(s.kind === 'answer' && s.itemId === id));
    }),
};

// ---------- saved, reports, wallet, activity ----------

const EXPLORER_TX = 'https://stellar.expert/explorer/testnet/tx/';

/** Author of any visible content item (not_found if deleted or hidden for the viewer). */
function contentAuthor(kind: ContentKind, id: Id): Id {
  if (kind === 'sign') return findVisibleSign(id).authorId;
  if (kind === 'question') return findVisibleQuestion(id).authorId;
  return findVisibleAnswer(id).authorId;
}

function toMovement(rec: MovementRec): Movement {
  return {
    id: rec.id,
    reason: rec.reason,
    amount: rec.amount,
    createdAt: rec.createdAt,
    status: rec.status,
    txHash: rec.txHash,
    explorerUrl: rec.txHash ? EXPLORER_TX + rec.txHash : null,
  };
}

const newestFirst = <T extends { createdAt: string }>(a: T, b: T) => Date.parse(b.createdAt) - Date.parse(a.createdAt);

export const mockSaved: DataApi['saved'] = {
  toggle: (kind, id) =>
    simulate(() => {
      const user = requireUser();
      contentAuthor(kind, id);
      const index = store.saved.findIndex((s) => s.userId === user.id && s.kind === kind && s.itemId === id);
      if (index >= 0) {
        store.saved.splice(index, 1);
        return false;
      }
      store.saved.push({ userId: user.id, kind, itemId: id });
      return true;
    }),

  /** Saved items that still exist and are visible, most recently saved first. */
  list: () =>
    simulate(() => {
      const user = requireUser();
      const refs = store.saved.filter((s) => s.userId === user.id).reverse();
      const visible = <T>(kind: ContentKind, find: (id: Id) => T) =>
        refs.filter((r) => r.kind === kind).flatMap((r) => {
          try {
            return [find(r.itemId)];
          } catch {
            return [];
          }
        });
      return {
        signs: visible('sign', (id) => toSign(findVisibleSign(id))),
        questions: visible('question', (id) => toQuestion(findVisibleQuestion(id))),
        answers: visible('answer', (id) => toAnswer(findVisibleAnswer(id))),
      };
    }),
};

export const mockReports: DataApi['reports'] = {
  /** One report per person; 3 different people hide it for everyone but its author.
   * The reporter stops seeing it right away (wiki #166). */
  report: (kind, id, reason) =>
    simulate(() => {
      const user = requireUser();
      if (contentAuthor(kind, id) === user.id) throw new DataError('forbidden', 'You cannot report your own content');
      if (!store.reports.some((r) => r.userId === user.id && r.kind === kind && r.itemId === id)) {
        store.reports.push({ userId: user.id, kind, itemId: id, reason });
      }
      if (!store.hidden.some((h) => h.userId === user.id && h.kind === kind && h.itemId === id)) {
        store.hidden.push({ userId: user.id, kind, itemId: id });
      }
    }),

  /** «Ya no quiero ver esto»: hidden for this user only; not a report. */
  hideForMe: (kind, id) =>
    simulate(() => {
      const user = requireUser();
      contentAuthor(kind, id);
      if (!store.hidden.some((h) => h.userId === user.id && h.kind === kind && h.itemId === id)) {
        store.hidden.push({ userId: user.id, kind, itemId: id });
      }
    }),
};

export const mockWallet: DataApi['wallet'] = {
  get: () =>
    simulate(() => {
      const user = requireUser();
      const ready = user.walletStatus === 'ready';
      return { status: user.walletStatus, address: user.address, balance: ready ? confirmedBalance(user.id) : null };
    }),

  movements: (query) =>
    simulate(() => {
      const user = requireUser();
      const items = store.movements.filter((m) => m.userId === user.id).sort(newestFirst).map(toMovement);
      return paginate(items, query?.cursor);
    }),

  /** «Reintentar» on a failed movement: pending again, then confirmed. */
  retry: (movementId) =>
    simulate(() => {
      const user = requireUser();
      const rec = store.movements.find((m) => m.id === movementId && m.userId === user.id);
      if (!rec) throw new DataError('not_found', 'Movement not found');
      if (rec.status !== 'error') return toMovement(rec);
      rec.status = 'pending';
      settle(rec, 'confirmed');
      return toMovement(rec);
    }),
};

export const mockActivity: DataApi['activity'] = {
  myQuestions: () =>
    simulate(() => {
      const user = requireUser();
      return store.questions.filter((q) => q.authorId === user.id).sort(newestFirst).map(toQuestion);
    }),
  myAnswers: () =>
    simulate(() => {
      const user = requireUser();
      return store.answers.filter((a) => a.authorId === user.id).sort(newestFirst).map(toAnswer);
    }),
  mySigns: () =>
    simulate(() => {
      const user = requireUser();
      return store.signs.filter((s) => s.authorId === user.id).sort(newestFirst).map(toSign);
    }),
};

export const mockAdapter: DataApi = {
  auth: mockAuth,
  signs: mockSigns,
  questions: mockQuestions,
  answers: mockAnswers,
  saved: mockSaved,
  reports: mockReports,
  wallet: mockWallet,
  activity: mockActivity,
};
